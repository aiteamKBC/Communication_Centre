import base64
import hashlib
import json
import logging
import os
import re
import time
import uuid
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from urllib.request import ProxyHandler, Request, build_opener

from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.http import HttpResponseBadRequest, JsonResponse, StreamingHttpResponse
from django.db import models, transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.dateparse import parse_date

from .models import AuditLog, CoachProfile, Employee, EventData, Feedback, KsbProfile, LeadershipMessage, Module, News, RiskRegisterItem, SupportTicket, TrainingPlan, TrainingPlanHoliday, TrainingPlanModuleDefinition, TrainingPlanProgramConfig, TutorProfile, UrgentNotice, UserActivitySession


logger = logging.getLogger(__name__)

MIGRATED_TRAINING_PLAN_FULL_SAVE_SOURCES = {
	'cohort_add',
	'cohort_edit',
	'cohort_delete',
	'module_add_for_tutor',
	'module_edit_linked_timeline_rows',
	'module_delete_linked_timeline_rows',
	'programme_edit_linked_timeline_rows',
	'reorder_programmes',
	'reorder_cohorts',
}
LEGACY_TRAINING_PLAN_FULL_SAVE_FLAG_HEADER = 'X-KBC-Legacy-Training-Plan-Full-Save'
LEGACY_TRAINING_PLAN_FULL_SAVE_FLAG_VALUE = 'internal-admin-debug'
PROFILE_FORCE_DELETE_CONFIRM_HEADER = 'X-KBC-Profile-Force-Delete'
PROFILE_FORCE_DELETE_CONFIRM_VALUE = 'internal-admin-debug'
MAX_UPLOAD_IMAGE_SIZE_MB = 10
MAX_UPLOAD_IMAGE_SIZE_BYTES = MAX_UPLOAD_IMAGE_SIZE_MB * 1024 * 1024


REALTIME_RESOURCE_ENTITIES = {
	'events': {'Event'},
	'news': {'News'},
	'urgentNotice': {'UrgentNotice'},
	'leadershipMessage': {'LeadershipMessage', 'Image'},
	'trainingPlan': {
		'TrainingPlan',
		'TrainingPlanHoliday',
		'TrainingPlanHolidayType',
		'TrainingPlanModuleDefinition',
		'TrainingPlanProgramConfig',
		'Module',
		'TutorProfile',
		'KsbProfile',
	},
	'employees': {'Employee'},
	'feedback': {'Feedback'},
}


def _client_ip(request) -> str | None:
	forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
	if forwarded_for:
		return forwarded_for.split(',')[0].strip() or None
	return request.META.get('REMOTE_ADDR') or None


def _header_text(request, name: str) -> str:
	return str(request.headers.get(name, '') or '').strip()


def _header_int(request, name: str) -> int | None:
	value = _header_text(request, name)
	if not value:
		return None
	try:
		return int(value)
	except ValueError:
		return None


def _audit_log(
	request,
	*,
	action: str,
	entity: str,
	object_id: str | int = '',
	object_label: str = '',
	before: dict | list | None = None,
	after: dict | list | None = None,
	metadata: dict | None = None,
) -> None:
	try:
		AuditLog.objects.create(
			action=action,
			entity=entity,
			object_id=str(object_id or ''),
			object_label=str(object_label or '')[:1000],
			user_id=_header_int(request, 'X-KBC-User-Id'),
			username=_header_text(request, 'X-KBC-Username'),
			email=_header_text(request, 'X-KBC-User-Email'),
			display_name=_header_text(request, 'X-KBC-Display-Name'),
			path=request.get_full_path(),
			method=request.method,
			ip_address=_client_ip(request),
			user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:2000],
			before=before,
			after=after,
			metadata=metadata or {},
		)
	except Exception:
		# Audit logging should not break the user-facing workflow.
		pass


def _model_snapshot(record) -> dict:
	data = {}
	for field in record._meta.fields:
		value = getattr(record, field.name)
		if isinstance(value, (date, datetime)):
			value = value.isoformat()
		data[field.name] = value
	return data


def _realtime_versions_payload() -> dict:
	entity_versions = {
		row['entity']: int(row['version'] or 0)
		for row in AuditLog.objects.values('entity').annotate(version=models.Max('id'))
	}
	resources = {}
	for resource, entities in REALTIME_RESOURCE_ENTITIES.items():
		resources[resource] = max((entity_versions.get(entity, 0) for entity in entities), default=0)
	return {
		'version': max(entity_versions.values(), default=0),
		'resources': resources,
		'serverTime': timezone.now().isoformat(),
	}


def realtime(request):
	if request.method != 'GET':
		return HttpResponseBadRequest('Only GET is supported.')

	if request.GET.get('stream') != '1':
		return JsonResponse(_realtime_versions_payload())

	if os.getenv('ENABLE_REALTIME_SSE', 'false').strip().lower() not in {'1', 'true', 'yes', 'on'}:
		return JsonResponse(
			{
				'detail': 'Realtime SSE streaming is disabled in this deployment. Use /api/realtime/ polling.',
				'payload': _realtime_versions_payload(),
			},
			status=409,
		)

	def event_stream():
		last_payload = _realtime_versions_payload()
		yield f"event: snapshot\ndata: {json.dumps(last_payload)}\n\n"
		deadline = time.monotonic() + 300
		while time.monotonic() < deadline:
			time.sleep(2)
			payload = _realtime_versions_payload()
			if payload['version'] != last_payload['version'] or payload['resources'] != last_payload['resources']:
				last_payload = payload
				yield f"event: update\ndata: {json.dumps(payload)}\n\n"
			else:
				yield f"event: ping\ndata: {json.dumps({'serverTime': payload['serverTime']})}\n\n"

	response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
	response['Cache-Control'] = 'no-cache'
	response['X-Accel-Buffering'] = 'no'
	return response


def _without_keys(item: dict, keys: set[str]) -> dict:
	return {key: value for key, value in item.items() if key not in keys}


def _bulk_diff(before_items: list[dict], after_items: list[dict], *, ignored_keys: set[str] | None = None, limit: int = 25) -> dict:
	ignored = ignored_keys or set()
	before_remaining = [_without_keys(item, ignored) for item in before_items]
	after_remaining = [_without_keys(item, ignored) for item in after_items]
	added = []
	removed = []

	for item in after_remaining:
		if item in before_remaining:
			before_remaining.remove(item)
		else:
			added.append(item)

	for item in before_remaining:
		if item in after_remaining:
			after_remaining.remove(item)
		else:
			removed.append(item)

	return {
		'beforeCount': len(before_items),
		'afterCount': len(after_items),
		'addedCount': len(added),
		'removedCount': len(removed),
		'added': added[:limit],
		'removed': removed[:limit],
		'truncated': len(added) > limit or len(removed) > limit,
	}


def serialize_event(event: EventData) -> dict:
	return {
		'id': str(event.event_id),
		'title': event.event_title,
		'description': event.event_description,
		'location': event.event_platform_or_meeting_link,
		'date': event.event_date,
		'registrationLink': event.registration_link,
		'time': event.event_time,
		'type': event.event_type or 'online',
		'coverImage': event.cover_image or '',
		'moreImages': event.more_images or '',
	}


@csrf_exempt
def events(request):
	if request.method == 'GET':
		records = EventData.objects.all().order_by('event_date', 'event_time')
		return JsonResponse([serialize_event(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		title = str(payload.get('title', '')).strip()
		date = str(payload.get('date', '')).strip()
		if not title or not date:
			return HttpResponseBadRequest('Both title and date are required.')

		event = EventData.objects.create(
			event_title=title,
			event_description=str(payload.get('description', '')).strip(),
			event_platform_or_meeting_link=str(payload.get('location', '')).strip(),
			event_date=date,
			registration_link=str(payload.get('registrationLink', '')).strip(),
			event_time=str(payload.get('time', '')).strip(),
			event_type=str(payload.get('type', 'online')).strip() or 'online',
			cover_image=str(payload.get('coverImage', '')),
			more_images=str(payload.get('moreImages', '')),
		)
		_audit_log(request, action='create', entity='Event', object_id=event.event_id, object_label=event.event_title, after=serialize_event(event))
		return JsonResponse(serialize_event(event), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def event_detail(request, event_id: int):
	try:
		event = EventData.objects.get(pk=event_id)
	except EventData.DoesNotExist:
		return JsonResponse({'detail': 'Not found.'}, status=404)

	if request.method == 'GET':
		return JsonResponse(serialize_event(event))

	if request.method == 'PUT':
		before = serialize_event(event)
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		title = str(payload.get('title', '')).strip()
		date_val = str(payload.get('date', '')).strip()
		if not title or not date_val:
			return HttpResponseBadRequest('Both title and date are required.')

		event.event_title = title
		event.event_description = str(payload.get('description', '')).strip()
		event.event_platform_or_meeting_link = str(payload.get('location', '')).strip()
		event.event_date = date_val
		event.registration_link = str(payload.get('registrationLink', '')).strip()
		event.event_time = str(payload.get('time', '')).strip()
		event.event_type = str(payload.get('type', 'online')).strip() or 'online'
		event.cover_image = str(payload.get('coverImage', ''))
		event.more_images = str(payload.get('moreImages', ''))
		event.save()
		_audit_log(request, action='update', entity='Event', object_id=event.event_id, object_label=event.event_title, before=before, after=serialize_event(event))
		return JsonResponse(serialize_event(event))

	if request.method == 'DELETE':
		before = serialize_event(event)
		object_label = event.event_title
		event.delete()
		_audit_log(request, action='delete', entity='Event', object_id=event_id, object_label=object_label, before=before)
		return JsonResponse({'detail': 'Deleted.'}, status=200)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


def format_date_display(value: date | None) -> str:
	if not value:
		return ''
	return value.strftime('%d %b %Y').lstrip('0')


def normalize_priority(value: str) -> str:
	cleaned = value.strip().lower()
	if cleaned in {'critical', 'important', 'general'}:
		return cleaned
	return 'general'


def serialize_news(item: News) -> dict:
	priority = normalize_priority(item.priority or 'general')
	status = (item.status or '').strip().lower()
	return {
		'id': str(item.id),
		'title': item.title,
		'excerpt': item.summary or item.details or '',
		'audience': item.audience or 'All Staff',
		'department': item.category or 'General',
		'priority': priority,
		'date': format_date_display(item.publication_date),
		'publicationDate': item.publication_date.isoformat() if item.publication_date else '',
		'status': item.status or '',
		'isExpired': status == 'expired',
		'image': item.image_url or None,
		'imageUrl': item.image_url or '',
		'category': item.category or 'General',
		'author': 'Communications Team',
		'content': item.full_article_content or item.details or item.summary or '',
	}


def serialize_urgent_notice(item: UrgentNotice) -> dict:
	return {
		'id': str(item.id),
		'title': item.title,
		'body': item.body or '',
		'isActive': bool(item.is_active),
		'date': item.publication_date.isoformat() if item.publication_date else '',
	}


def serialize_leadership_message(item: LeadershipMessage) -> dict:
	return {
		'id': str(item.id),
		'cardTitle': item.card_title or '',
		'authorName': item.author_name or '',
		'authorRole': item.author_role or '',
		'isActive': bool(item.is_active),
		'date': item.publication_date.isoformat() if item.publication_date else '',
		'body': item.body or '',
		'coverImageUrl': item.cover_image_url or '',
		'profileImageUrl': item.profile_image_url or '',
	}


def _save_uploaded_image(uploaded_file, folder: str) -> str:
	original_name = str(getattr(uploaded_file, 'name', '') or 'upload')
	_, extension = os.path.splitext(original_name)
	safe_extension = extension.lower()[:10] if extension else '.jpg'
	filename = f'{uuid.uuid4().hex}{safe_extension}'
	relative_path = os.path.join('uploads', folder, filename).replace('\\', '/')
	stored_path = default_storage.save(relative_path, uploaded_file)
	return f'{settings.MEDIA_URL}{stored_path}'.replace('//', '/')


@csrf_exempt
def news(request):
	if request.method == 'GET':
		records = News.objects.all().order_by('-publication_date', '-id')
		return JsonResponse([serialize_news(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		title = str(payload.get('title', '')).strip()
		summary = str(payload.get('summary', '')).strip()
		publication_date_raw = str(payload.get('publicationDate', '')).strip()

		if not title or not summary:
			return HttpResponseBadRequest('Both title and summary are required.')

		publication_date = parse_date(publication_date_raw) if publication_date_raw else None
		if publication_date_raw and publication_date is None:
			return HttpResponseBadRequest('publicationDate must be in YYYY-MM-DD format.')

		details = str(payload.get('details', '')).strip() or summary
		content = str(payload.get('content', '')).strip()
		priority = normalize_priority(str(payload.get('priority', 'general')))

		record = News.objects.create(
			title=title,
			details=details,
			image_url=str(payload.get('imageUrl', '')).strip(),
			publication_date=publication_date,
			audience=str(payload.get('audience', 'All Staff')).strip() or 'All Staff',
			category=str(payload.get('category', 'General')).strip() or 'General',
			priority=priority,
			summary=summary,
			full_article_content=content,
			status='pending_review',
		)

		_audit_log(request, action='create', entity='News', object_id=record.id, object_label=record.title, after=serialize_news(record))
		return JsonResponse(serialize_news(record), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def news_detail(request, news_id: int):
	try:
		record = News.objects.get(pk=news_id)
	except News.DoesNotExist:
		return JsonResponse({'detail': 'News article not found.'}, status=404)

	if request.method == 'GET':
		return JsonResponse(serialize_news(record))

	if request.method == 'PATCH':
		before = serialize_news(record)
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		title = str(payload.get('title', record.title)).strip()
		summary = str(payload.get('summary', record.summary or record.details or '')).strip()
		publication_date_raw = str(
			payload.get(
				'publicationDate',
				record.publication_date.isoformat() if record.publication_date else '',
			),
		).strip()

		if not title or not summary:
			return HttpResponseBadRequest('Both title and summary are required.')

		publication_date = parse_date(publication_date_raw) if publication_date_raw else None
		if publication_date_raw and publication_date is None:
			return HttpResponseBadRequest('publicationDate must be in YYYY-MM-DD format.')

		details = str(payload.get('details', record.details or summary)).strip() or summary
		content = str(payload.get('content', record.full_article_content)).strip()
		priority = normalize_priority(str(payload.get('priority', record.priority or 'general')))

		record.title = title
		record.details = details
		record.image_url = str(payload.get('imageUrl', record.image_url)).strip()
		record.publication_date = publication_date
		record.audience = str(payload.get('audience', record.audience or 'All Staff')).strip() or 'All Staff'
		record.category = str(payload.get('category', record.category or 'General')).strip() or 'General'
		record.priority = priority
		record.summary = summary
		record.full_article_content = content
		record.save()

		_audit_log(request, action='update', entity='News', object_id=record.id, object_label=record.title, before=before, after=serialize_news(record))
		return JsonResponse(serialize_news(record))

	if request.method == 'DELETE':
		before = serialize_news(record)
		object_label = record.title
		record.delete()
		_audit_log(request, action='delete', entity='News', object_id=news_id, object_label=object_label, before=before)
		return JsonResponse({'deleted': True})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def urgent_notice(request):
	if request.method == 'GET':
		if request.GET.get('list') == '1':
			records = UrgentNotice.objects.order_by('created_at', 'id')
			return JsonResponse([serialize_urgent_notice(item) for item in records], safe=False)

		record = (
			UrgentNotice.objects
			.order_by('-is_active', '-created_at', '-id')
			.first()
		)
		if not record:
			return JsonResponse({}, status=404)
		return JsonResponse(serialize_urgent_notice(record))

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		title = str(payload.get('title', '')).strip()
		body = str(payload.get('body', '')).strip()
		publication_date_raw = str(payload.get('publicationDate', '')).strip()

		if not title or not body:
			return HttpResponseBadRequest('Both title and body are required.')

		publication_date = parse_date(publication_date_raw) if publication_date_raw else timezone.now().date()
		if publication_date_raw and publication_date is None:
			return HttpResponseBadRequest('publicationDate must be in YYYY-MM-DD format.')

		should_activate = not UrgentNotice.objects.filter(is_active=True).exists()

		record = UrgentNotice.objects.create(
			title=title,
			body=body,
			is_active=should_activate,
			publication_date=publication_date,
		)

		_audit_log(request, action='create', entity='UrgentNotice', object_id=record.id, object_label=record.title, after=serialize_urgent_notice(record))
		return JsonResponse(serialize_urgent_notice(record), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def urgent_notice_detail(request, notice_id: int):
	try:
		record = UrgentNotice.objects.get(pk=notice_id)
	except UrgentNotice.DoesNotExist:
		return JsonResponse({'detail': 'Urgent notice not found.'}, status=404)

	if request.method == 'GET':
		return JsonResponse(serialize_urgent_notice(record))

	if request.method == 'PATCH':
		before = serialize_urgent_notice(record)
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		title = str(payload.get('title', record.title)).strip()
		body = str(payload.get('body', record.body)).strip()
		publication_date_raw = str(payload.get('publicationDate', record.publication_date.isoformat() if record.publication_date else '')).strip()
		is_active = bool(payload.get('isActive', record.is_active))

		if not title or not body:
			return HttpResponseBadRequest('Both title and body are required.')

		publication_date = parse_date(publication_date_raw) if publication_date_raw else None
		if publication_date_raw and publication_date is None:
			return HttpResponseBadRequest('publicationDate must be in YYYY-MM-DD format.')

		record.title = title
		record.body = body
		if is_active:
			UrgentNotice.objects.exclude(pk=record.pk).update(is_active=False)
		record.is_active = is_active
		record.publication_date = publication_date
		record.save()
		_audit_log(request, action='update', entity='UrgentNotice', object_id=record.id, object_label=record.title, before=before, after=serialize_urgent_notice(record))
		return JsonResponse(serialize_urgent_notice(record))

	if request.method == 'DELETE':
		before = serialize_urgent_notice(record)
		object_label = record.title
		was_active = record.is_active
		record.delete()
		if was_active:
			next_notice = UrgentNotice.objects.order_by('-created_at', '-id').first()
			if next_notice:
				UrgentNotice.objects.exclude(pk=next_notice.pk).update(is_active=False)
				next_notice.is_active = True
				next_notice.save(update_fields=['is_active'])
		_audit_log(request, action='delete', entity='UrgentNotice', object_id=notice_id, object_label=object_label, before=before)
		return JsonResponse({'deleted': True})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def leadership_message(request):
	if request.method == 'GET':
		if request.GET.get('list') == '1':
			records = LeadershipMessage.objects.order_by('-is_active', '-created_at', '-id')
			return JsonResponse([serialize_leadership_message(item) for item in records], safe=False)

		record = (
			LeadershipMessage.objects
			.order_by('-is_active', '-created_at', '-id')
			.first()
		)
		if not record:
			return JsonResponse({}, status=404)
		return JsonResponse(serialize_leadership_message(record))

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		card_title = str(payload.get('cardTitle', '')).strip()
		body = str(payload.get('body', '')).strip()
		publication_date_raw = str(payload.get('publicationDate', '')).strip()
		cover_image_url = str(payload.get('coverImageUrl', '')).strip()
		profile_image_url = str(payload.get('profileImageUrl', '')).strip()

		if not card_title or not body:
			return HttpResponseBadRequest('Both cardTitle and body are required.')

		if not cover_image_url or not profile_image_url:
			return HttpResponseBadRequest('Both coverImageUrl and profileImageUrl are required.')

		publication_date = parse_date(publication_date_raw) if publication_date_raw else timezone.now().date()
		if publication_date_raw and publication_date is None:
			return HttpResponseBadRequest('publicationDate must be in YYYY-MM-DD format.')

		LeadershipMessage.objects.update(is_active=False)
		record = LeadershipMessage.objects.create(
			card_title=card_title,
			card_teaser='Click to read the full message',
			author_name=str(payload.get('authorName', '')).strip() or 'Prof. David Kingsley',
			author_role=str(payload.get('authorRole', '')).strip() or 'Principal & CEO, Kent Business College',
			is_active=True,
			publication_date=publication_date,
			body=body,
			cover_image_url=cover_image_url,
			profile_image_url=profile_image_url,
		)

		_audit_log(request, action='create', entity='LeadershipMessage', object_id=record.id, object_label=record.card_title, after=serialize_leadership_message(record))
		return JsonResponse(serialize_leadership_message(record), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def leadership_message_detail(request, message_id: int):
	try:
		record = LeadershipMessage.objects.get(pk=message_id)
	except LeadershipMessage.DoesNotExist:
		return JsonResponse({'detail': 'Leadership message not found.'}, status=404)

	if request.method == 'GET':
		return JsonResponse(serialize_leadership_message(record))

	if request.method == 'PATCH':
		before = serialize_leadership_message(record)
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		card_title = str(payload.get('cardTitle', record.card_title)).strip()
		body = str(payload.get('body', record.body)).strip()
		publication_date_raw = str(payload.get('publicationDate', record.publication_date.isoformat() if record.publication_date else '')).strip()
		cover_image_url = str(payload.get('coverImageUrl', record.cover_image_url)).strip()
		profile_image_url = str(payload.get('profileImageUrl', record.profile_image_url)).strip()
		is_active = bool(payload.get('isActive', record.is_active))

		if not card_title or not body:
			return HttpResponseBadRequest('Both cardTitle and body are required.')

		if not cover_image_url or not profile_image_url:
			return HttpResponseBadRequest('Both coverImageUrl and profileImageUrl are required.')

		publication_date = parse_date(publication_date_raw) if publication_date_raw else None
		if publication_date_raw and publication_date is None:
			return HttpResponseBadRequest('publicationDate must be in YYYY-MM-DD format.')

		record.card_title = card_title
		record.card_teaser = 'Click to read the full message'
		record.author_name = str(payload.get('authorName', record.author_name)).strip() or 'Prof. David Kingsley'
		record.author_role = str(payload.get('authorRole', record.author_role)).strip() or 'Principal & CEO, Kent Business College'
		if is_active:
			LeadershipMessage.objects.exclude(pk=record.pk).update(is_active=False)
		record.is_active = is_active
		record.publication_date = publication_date
		record.body = body
		record.cover_image_url = cover_image_url
		record.profile_image_url = profile_image_url
		record.save()
		_audit_log(request, action='update', entity='LeadershipMessage', object_id=record.id, object_label=record.card_title, before=before, after=serialize_leadership_message(record))
		return JsonResponse(serialize_leadership_message(record))

	if request.method == 'DELETE':
		before = serialize_leadership_message(record)
		object_label = record.card_title
		record.delete()
		_audit_log(request, action='delete', entity='LeadershipMessage', object_id=message_id, object_label=object_label, before=before)
		return JsonResponse({'deleted': True})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def upload_image(request):
	if request.method != 'POST':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	uploaded_file = request.FILES.get('file')
	folder = str(request.POST.get('folder', 'general')).strip().lower() or 'general'

	if uploaded_file is None:
		return HttpResponseBadRequest('A file field is required.')

	if not str(getattr(uploaded_file, 'content_type', '')).startswith('image/'):
		return HttpResponseBadRequest('Only image uploads are allowed.')

	if int(getattr(uploaded_file, 'size', 0) or 0) > MAX_UPLOAD_IMAGE_SIZE_BYTES:
		return JsonResponse(
			{
				'detail': f'Image is too large. Maximum allowed size is {MAX_UPLOAD_IMAGE_SIZE_MB}MB.',
				'maxSizeBytes': MAX_UPLOAD_IMAGE_SIZE_BYTES,
				'maxSizeMb': MAX_UPLOAD_IMAGE_SIZE_MB,
			},
			status=400,
		)

	file_url = _save_uploaded_image(uploaded_file, folder)
	_audit_log(request, action='upload', entity='Image', object_label=str(getattr(uploaded_file, 'name', '') or 'upload'), after={'url': file_url, 'folder': folder})
	return JsonResponse({'url': file_url}, status=201)


def serialize_training_plan(item: TrainingPlan) -> dict:
	identity = training_plan_row_identity(item)
	return {
		'id': int(item.id),
		'programmeId': identity['programmeId'],
		'cohortId': identity['cohortId'],
		'cohortName': item.cohort_name,
		'program': item.program,
		'startingDateLabel': item.starting_date_lable,
		'moduleName': item.module_name,
		'groupName': item.group_name,
		'coachName': item.coach_name,
		'tutorName': item.tutor_name,
		'tutorProfileId': str(item.tutor_profile_id) if getattr(item, 'tutor_profile_id', None) else '',
		'startDate': item.start_date,
		'endDate': item.end_date,
		'sessionsNumber': item.sessions_number,
		'sessionWeekDay': item.session_week_day,
		'sessionStartTime': item.session_start_time,
		'sessionEndTime': item.session_end_time,
		'sessionKsbMappings': normalize_session_ksb_mappings(getattr(item, 'session_ksb_json', '')),
		'sessionCoverage': normalize_session_coverage(getattr(item, 'session_coverage_json', '')),
		'ksbProfileId': str(item.ksb_profile_id) if getattr(item, 'ksb_profile_id', None) else '',
		'programmeDisplayOrder': item.programme_display_order,
		'cohortDisplayOrder': item.cohort_display_order,
		'isArchived': bool(getattr(item, 'is_archived', False)),
		'archivedAt': item.archived_at.isoformat() if getattr(item, 'archived_at', None) else '',
		'archivedBy': getattr(item, 'archived_by', '') or '',
		'archiveReason': getattr(item, 'archive_reason', '') or '',
		'notes': item.notes,
	}


def normalize_tutor_profile_name(value: str) -> str:
	return re.sub(r'\s+', ' ', re.sub(r'[^\w\s@.-]+', ' ', str(value or '').lower())).strip()


def tutor_similarity(a: str, b: str) -> float:
	a_normalized = normalize_tutor_profile_name(a)
	b_normalized = normalize_tutor_profile_name(b)
	if not a_normalized or not b_normalized:
		return 0.0
	if a_normalized == b_normalized:
		return 1.0
	if a_normalized in b_normalized or b_normalized in a_normalized:
		shorter = min(len(a_normalized), len(b_normalized))
		longer = max(len(a_normalized), len(b_normalized))
		return max(0.86, shorter / longer)
	return SequenceMatcher(None, a_normalized, b_normalized).ratio()


def is_probable_tutor_profile_match(name: str, profile_name: str, *, threshold: float = 0.86) -> bool:
	name_normalized = normalize_tutor_profile_name(name)
	profile_normalized = normalize_tutor_profile_name(profile_name)
	if not name_normalized or not profile_normalized:
		return False
	if name_normalized == profile_normalized:
		return True

	score = tutor_similarity(name_normalized, profile_normalized)
	shorter = min(len(name_normalized), len(profile_normalized))
	first_token = name_normalized.split(' ', 1)[0]
	profile_first_token = profile_normalized.split(' ', 1)[0]

	if shorter <= 5:
		if first_token[:1] != profile_first_token[:1]:
			return score >= 0.95
		return score >= 0.9
	return score >= threshold


def serialize_tutor_profile(item: TutorProfile, session_counts: dict[int, int] | None = None) -> dict:
	return {
		'id': str(item.id),
		'name': item.name,
		'normalizedName': item.normalized_name,
		'email': item.email,
		'phone': item.phone,
		'notes': item.notes,
		'availabilityNotes': item.availability_notes,
		'isActive': item.is_active,
		'sessionCount': (session_counts or {}).get(int(item.id), 0),
		'createdAt': item.created_at.isoformat() if item.created_at else '',
		'updatedAt': item.updated_at.isoformat() if item.updated_at else '',
	}


def serialize_coach_profile(item: CoachProfile, session_counts: dict[int, int] | None = None) -> dict:
	return {
		'id': str(item.id),
		'name': item.name,
		'normalizedName': item.normalized_name,
		'email': item.email,
		'phone': item.phone,
		'notes': item.notes,
		'availabilityNotes': item.availability_notes,
		'isActive': item.is_active,
		'sessionCount': (session_counts or {}).get(int(item.id), 0),
		'createdAt': item.created_at.isoformat() if item.created_at else '',
		'updatedAt': item.updated_at.isoformat() if item.updated_at else '',
	}


def tutor_profile_session_counts() -> dict[int, int]:
	counts: dict[int, int] = {}
	for row in TrainingPlan.objects.exclude(tutor_profile_id__isnull=True).values('tutor_profile_id', 'sessions_number'):
		try:
			profile_id = int(row.get('tutor_profile_id'))
		except (TypeError, ValueError):
			continue
		try:
			sessions = max(1, int(row.get('sessions_number') or 1))
		except (TypeError, ValueError):
			sessions = 1
		counts[profile_id] = counts.get(profile_id, 0) + sessions
	return counts


def coach_profile_session_counts() -> dict[int, int]:
	counts: dict[int, int] = {}
	profiles_by_name = {
		normalize_tutor_profile_name(profile.name): int(profile.id)
		for profile in CoachProfile.objects.filter(is_active=True)
	}
	for row in TrainingPlan.objects.exclude(coach_name='').values('coach_name', 'sessions_number'):
		profile_id = profiles_by_name.get(normalize_tutor_profile_name(row.get('coach_name') or ''))
		if not profile_id:
			continue
		try:
			sessions = max(1, int(row.get('sessions_number') or 1))
		except (TypeError, ValueError):
			sessions = 1
		counts[profile_id] = counts.get(profile_id, 0) + sessions
	return counts


def possible_tutor_profile_matches(name: str, *, exclude_id: int | None = None, threshold: float = 0.86) -> list[dict]:
	matches = []
	for profile in TutorProfile.objects.filter(is_active=True).order_by('name', 'id'):
		if exclude_id is not None and int(profile.id) == int(exclude_id):
			continue
		score = tutor_similarity(name, profile.name)
		if is_probable_tutor_profile_match(name, profile.name, threshold=threshold):
			matches.append({'profile': profile, 'score': round(score, 3), 'exact': normalize_tutor_profile_name(name) == profile.normalized_name})
	return sorted(matches, key=lambda item: (-item['score'], item['profile'].name.lower()))


def possible_coach_profile_matches(name: str, *, exclude_id: int | None = None, threshold: float = 0.86) -> list[dict]:
	matches = []
	for profile in CoachProfile.objects.filter(is_active=True).order_by('name', 'id'):
		if exclude_id is not None and int(profile.id) == int(exclude_id):
			continue
		score = tutor_similarity(name, profile.name)
		if is_probable_tutor_profile_match(name, profile.name, threshold=threshold):
			matches.append({'profile': profile, 'score': round(score, 3), 'exact': normalize_tutor_profile_name(name) == profile.normalized_name})
	return sorted(matches, key=lambda item: (-item['score'], item['profile'].name.lower()))


TRAINING_PLAN_PARTIAL_SAVE_MIN_CURRENT = 100
TRAINING_PLAN_PARTIAL_SAVE_RATIO = 0.75


def active_training_plan_filter():
	return models.Q(is_archived=False) | models.Q(is_archived__isnull=True)


def training_plan_queryset(*, include_archived: bool = False):
	queryset = TrainingPlan.objects.all()
	if not include_archived:
		queryset = queryset.filter(active_training_plan_filter())
	return queryset.order_by(
		models.F('programme_display_order').asc(nulls_last=True),
		models.F('cohort_display_order').asc(nulls_last=True),
		'id',
	)


def training_plan_items_snapshot() -> list[dict]:
	return [serialize_training_plan(item) for item in training_plan_queryset()]


def training_plan_version(items: list[dict] | None = None) -> str:
	records = items if items is not None else training_plan_items_snapshot()
	version_payload = [
		_without_keys(item, {'id'})
		for item in records
	]
	return hashlib.sha256(json.dumps(version_payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()


def training_plan_row_version(row: TrainingPlan) -> str:
	return training_plan_version([serialize_training_plan(row)])


def parse_json_payload(request) -> tuple[dict, JsonResponse | HttpResponseBadRequest | None]:
	try:
		payload = json.loads(request.body.decode('utf-8') or '{}')
	except json.JSONDecodeError:
		return {}, HttpResponseBadRequest('Invalid JSON payload.')
	if not isinstance(payload, dict):
		return {}, JsonResponse({'detail': 'Payload must be an object.'}, status=400)
	return payload, None


def require_training_plan_version(payload: dict, current_version: str, current_items: list[dict]) -> JsonResponse | None:
	submitted_version = str(payload.get('version', '') or '').strip()
	if not submitted_version:
		return JsonResponse({
			'detail': 'Reload the latest Training Plan before saving. This prevents an older page from overwriting newer timeline data.',
			'currentVersion': current_version,
			'items': current_items,
		}, status=409)
	if submitted_version != current_version:
		return JsonResponse({
			'detail': 'The Training Plan was updated by someone else. Please reload and review before saving.',
			'currentVersion': current_version,
			'items': current_items,
		}, status=409)
	return None


def normalize_time_text(value) -> str:
	text = str(value or '').strip()
	if not text:
		return ''
	if not re.match(r'^\d{2}:\d{2}$', text):
		raise ValueError('Time must use HH:MM format.')
	hour, minute = [int(part) for part in text.split(':')]
	if hour > 23 or minute > 59:
		raise ValueError('Time must be a valid 24-hour value.')
	return text


def validate_tutor_profile_id(value, field_label: str) -> tuple[int | None, TutorProfile | None, str]:
	profile_id = normalize_nullable_int(value)
	if profile_id is None:
		return None, None, ''
	try:
		profile = TutorProfile.objects.get(pk=profile_id, is_active=True)
	except TutorProfile.DoesNotExist:
		return None, None, f'{field_label} references an unknown active tutor profile.'
	return profile_id, profile, ''


def validate_coach_profile_id(value, field_label: str) -> tuple[int | None, CoachProfile | None, str]:
	profile_id = normalize_nullable_int(value)
	if profile_id is None:
		return None, None, ''
	try:
		profile = CoachProfile.objects.get(pk=profile_id, is_active=True)
	except CoachProfile.DoesNotExist:
		return None, None, f'{field_label} references an unknown active coach profile.'
	return profile_id, profile, ''


def training_plan_partial_response(row: TrainingPlan) -> dict:
	items = training_plan_items_snapshot()
	return {
		'item': serialize_training_plan(row),
		'version': training_plan_version(items),
		'rowVersion': training_plan_row_version(row),
		'items': items,
		'count': len(items),
	}


def training_plan_order_response(extra: dict | None = None) -> dict:
	items = training_plan_items_snapshot()
	response = {
		'items': items,
		'version': training_plan_version(items),
		'count': len(items),
	}
	if extra:
		response.update(extra)
	return response


def validate_reorder_ids(payload: dict, key: str, label: str) -> tuple[list[str], JsonResponse | None]:
	value = payload.get(key)
	if not isinstance(value, list):
		return [], JsonResponse({'detail': f'{key} must be a list.'}, status=400)
	ids = [str(item or '').strip() for item in value]
	if any(not item for item in ids):
		return [], JsonResponse({'detail': f'{label} reorder contains a missing id.'}, status=400)
	if len(ids) != len(set(ids)):
		return [], JsonResponse({'detail': f'{label} reorder contains duplicate ids.'}, status=400)
	if not ids:
		return [], JsonResponse({'detail': f'{label} reorder requires at least one id.'}, status=400)
	return ids, None


def validate_training_plan_row_ids(payload: dict, key: str, label: str) -> tuple[list[int], JsonResponse | None]:
	value = payload.get(key)
	if not isinstance(value, list):
		return [], JsonResponse({'detail': f'{key} must be a list.'}, status=400)
	ids = []
	for item in value:
		text = str(item or '').strip()
		if not text:
			return [], JsonResponse({'detail': f'{label} archive contains a missing id.'}, status=400)
		try:
			row_id = int(text)
		except (TypeError, ValueError):
			return [], JsonResponse({'detail': f'{label} archive contains an invalid id.'}, status=400)
		ids.append(row_id)
	if len(ids) != len(set(ids)):
		return [], JsonResponse({'detail': f'{label} archive contains duplicate ids.'}, status=400)
	if not ids:
		return [], JsonResponse({'detail': f'{label} archive requires at least one id.'}, status=400)
	return ids, None


def validate_training_plan_linked_module_rows(payload: dict) -> tuple[list[dict], JsonResponse | None]:
	value = payload.get('linkedRows')
	if not isinstance(value, list):
		return [], JsonResponse({'detail': 'linkedRows must be a list.'}, status=400)
	if not value:
		return [], JsonResponse({'detail': 'linkedRows requires at least one row.'}, status=400)

	rows = []
	row_ids = []
	identity_keys = []
	for index, item in enumerate(value):
		if not isinstance(item, dict):
			return [], JsonResponse({'detail': f'linkedRows[{index}] must be an object.'}, status=400)
		try:
			row_id = int(str(item.get('trainingPlanId') or '').strip())
		except (TypeError, ValueError):
			return [], JsonResponse({'detail': f'linkedRows[{index}] is missing a valid trainingPlanId.'}, status=400)
		programme_id = str(item.get('programmeId') or '').strip()
		cohort_id = str(item.get('cohortId') or '').strip()
		block_id = str(item.get('blockId') or '').strip()
		group_id = str(item.get('groupId') or '').strip()
		if not programme_id or not cohort_id or not block_id:
			return [], JsonResponse({'detail': f'linkedRows[{index}] is missing stable programmeId, cohortId, or blockId.'}, status=400)
		row_ids.append(row_id)
		identity_keys.append((programme_id, cohort_id, group_id, block_id))
		rows.append({
			'trainingPlanId': row_id,
			'programmeId': programme_id,
			'cohortId': cohort_id,
			'groupId': group_id,
			'blockId': block_id,
		})
	if len(row_ids) != len(set(row_ids)):
		return [], JsonResponse({'detail': 'linkedRows contains duplicate trainingPlanId values.'}, status=400)
	if len(identity_keys) != len(set(identity_keys)):
		return [], JsonResponse({'detail': 'linkedRows contains ambiguous duplicate module identifiers.'}, status=400)
	return rows, None


def validate_training_plan_programme_linked_rows(payload: dict, programme_id: str) -> tuple[list[int], str, JsonResponse | None]:
	target_programme_id = str(programme_id or '').strip()
	if not target_programme_id or target_programme_id.startswith('db-row-') or target_programme_id.startswith('row-'):
		return [], '', JsonResponse({'detail': 'A stable programme id is required.'}, status=400)
	payload_programme_id = str(payload.get('programmeId') or '').strip()
	if payload_programme_id and payload_programme_id != target_programme_id:
		return [], '', JsonResponse({'detail': 'payload programmeId does not match the requested programme.'}, status=400)
	program_label = str(payload.get('program') or '').strip()
	if not program_label:
		return [], '', JsonResponse({'detail': 'program is required.'}, status=400)
	if any(key in payload for key in ('items', 'rows', 'linkedRows', 'blocks', 'row', 'archiveReason', 'restore', 'trainingPlanIdsToDelete')):
		return [], '', JsonResponse({'detail': 'Programme linked-row update payload must not include full-save, row mutation, archive, or restore fields.'}, status=400)

	value = payload.get('trainingPlanIds')
	if not isinstance(value, list) or not value:
		return [], '', JsonResponse({'detail': 'trainingPlanIds must be a non-empty list.'}, status=400)
	row_ids = []
	for item in value:
		try:
			row_id = int(str(item or '').strip())
		except (TypeError, ValueError):
			return [], '', JsonResponse({'detail': 'trainingPlanIds contains an invalid id.'}, status=400)
		row_ids.append(row_id)
	if len(row_ids) != len(set(row_ids)):
		return [], '', JsonResponse({'detail': 'trainingPlanIds contains duplicate ids.'}, status=400)
	return row_ids, program_label, None


def validate_training_plan_add_for_tutor_payload(payload: dict) -> tuple[dict, JsonResponse | None]:
	programme_id = str(payload.get('programmeId') or '').strip()
	cohort_id = str(payload.get('cohortId') or '').strip()
	group_id = str(payload.get('groupId') or '').strip()
	block_id = str(payload.get('blockId') or '').strip()
	module_identity = str(payload.get('moduleCatalogueId') or payload.get('moduleStableId') or '').strip()
	tutor_profile_id = str(payload.get('tutorProfileId') or '').strip()
	row = payload.get('row')

	if not programme_id or not cohort_id:
		return {}, JsonResponse({'detail': 'programmeId and cohortId are required.'}, status=400)
	if not group_id or not block_id:
		return {}, JsonResponse({'detail': 'groupId and blockId are required.'}, status=400)
	if not module_identity:
		return {}, JsonResponse({'detail': 'moduleCatalogueId or moduleStableId is required.'}, status=400)
	if not tutor_profile_id:
		return {}, JsonResponse({'detail': 'tutorProfileId is required.'}, status=400)
	if not isinstance(row, dict):
		return {}, JsonResponse({'detail': 'row must be an object.'}, status=400)
	if row.get('id') or row.get('trainingPlanId'):
		return {}, JsonResponse({'detail': 'Module add payload must not include an existing Training Plan row id.'}, status=400)

	row_programme_id = str(row.get('programmeId') or '').strip()
	row_cohort_id = str(row.get('cohortId') or '').strip()
	row_tutor_profile_id = str(row.get('tutorProfileId') or '').strip()
	if row_programme_id != programme_id or row_cohort_id != cohort_id:
		return {}, JsonResponse({'detail': 'Submitted row does not match the requested programme/cohort scope.'}, status=400)
	if row_tutor_profile_id != tutor_profile_id:
		return {}, JsonResponse({'detail': 'Submitted row does not match the requested tutor assignment.'}, status=400)

	notes = str(row.get('notes') or '')
	if (
		training_plan_marker_value(notes, TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX) != programme_id
		or training_plan_marker_value(notes, TRAINING_PLAN_COHORT_ID_MARKER_PREFIX) != cohort_id
		or training_plan_marker_value(notes, '__group_id:') != group_id
		or training_plan_marker_value(notes, '__block_id:') != block_id
	):
		return {}, JsonResponse({'detail': 'Submitted row is missing matching Training Plan metadata markers.'}, status=400)

	values, error = training_plan_values_from_payload_row(row, 0)
	if error:
		return {}, JsonResponse({'detail': error}, status=400)

	return {
		'programmeId': programme_id,
		'cohortId': cohort_id,
		'groupId': group_id,
		'blockId': block_id,
		'moduleIdentity': module_identity,
		'tutorProfileId': tutor_profile_id,
		'row': row,
		'values': values,
	}, None


def training_plan_row_matches_values(row: TrainingPlan, values: dict) -> bool:
	return (
		row.cohort_name == values.get('cohort_name')
		and row.program == values.get('program')
		and row.starting_date_lable == values.get('starting_date_lable')
		and row.module_name == values.get('module_name')
		and row.group_name == values.get('group_name')
		and row.coach_name == values.get('coach_name')
		and row.tutor_name == values.get('tutor_name')
		and row.tutor_profile_id == values.get('tutor_profile_id')
		and row.start_date == values.get('start_date')
		and row.end_date == values.get('end_date')
		and row.sessions_number == values.get('sessions_number')
		and row.session_week_day == values.get('session_week_day')
		and row.session_start_time == values.get('session_start_time')
		and row.session_end_time == values.get('session_end_time')
		and normalize_session_ksb_mappings(row.session_ksb_json) == normalize_session_ksb_mappings(values.get('session_ksb_json'))
		and normalize_session_coverage(row.session_coverage_json) == normalize_session_coverage(values.get('session_coverage_json'))
		and row.ksb_profile_id == values.get('ksb_profile_id')
		and row.programme_display_order == values.get('programme_display_order')
		and row.cohort_display_order == values.get('cohort_display_order')
		and row.notes == values.get('notes')
	)


def find_module_add_for_tutor_duplicates(rows: list[TrainingPlan], validated: dict) -> list[TrainingPlan]:
	return [
		row for row in rows
		if training_plan_row_identity(row)['programmeId'] == validated['programmeId']
		and training_plan_row_identity(row)['cohortId'] == validated['cohortId']
		and training_plan_marker_value(row.notes, '__group_id:') == validated['groupId']
		and training_plan_marker_value(row.notes, '__block_id:') == validated['blockId']
	]


def validate_training_plan_cohort_create_payload(payload: dict) -> tuple[dict, JsonResponse | None]:
	programme_id = str(payload.get('programmeId') or '').strip()
	cohort_id = str(payload.get('cohortId') or '').strip()
	rows = payload.get('rows')
	if not programme_id:
		return {}, JsonResponse({'detail': 'programmeId is required.'}, status=400)
	if not cohort_id:
		return {}, JsonResponse({'detail': 'cohortId is required.'}, status=400)
	if not isinstance(rows, list):
		return {}, JsonResponse({'detail': 'rows must be a list.'}, status=400)
	if not rows:
		return {}, JsonResponse({'detail': 'rows requires at least one new cohort row.'}, status=400)

	validated_rows = []
	identity_keys = []
	for index, row in enumerate(rows):
		if not isinstance(row, dict):
			return {}, JsonResponse({'detail': f'rows[{index}] must be an object.'}, status=400)
		if row.get('id') or row.get('trainingPlanId'):
			return {}, JsonResponse({'detail': f'rows[{index}] must not include an existing Training Plan row id.'}, status=400)
		if str(row.get('programmeId') or '').strip() != programme_id or str(row.get('cohortId') or '').strip() != cohort_id:
			return {}, JsonResponse({'detail': f'rows[{index}] does not match the requested programme/cohort scope.'}, status=400)
		notes = str(row.get('notes') or '')
		group_id = training_plan_marker_value(notes, '__group_id:')
		block_id = training_plan_marker_value(notes, '__block_id:')
		if (
			training_plan_marker_value(notes, TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX) != programme_id
			or training_plan_marker_value(notes, TRAINING_PLAN_COHORT_ID_MARKER_PREFIX) != cohort_id
			or not group_id
			or not block_id
		):
			return {}, JsonResponse({'detail': f'rows[{index}] is missing matching programme/cohort/group/block metadata markers.'}, status=400)
		identity_key = (programme_id, cohort_id, group_id, block_id)
		identity_keys.append(identity_key)
		values, error = training_plan_values_from_payload_row(row, index)
		if error:
			return {}, JsonResponse({'detail': error}, status=400)
		validated_rows.append({
			'row': row,
			'values': values,
			'groupId': group_id,
			'blockId': block_id,
		})
	if len(identity_keys) != len(set(identity_keys)):
		return {}, JsonResponse({'detail': 'rows contains duplicate programme/cohort/group/block identifiers.'}, status=400)
	return {
		'programmeId': programme_id,
		'cohortId': cohort_id,
		'rows': validated_rows,
	}, None


def training_plan_programme_scope_exists(programme_id: str, active_rows: list[TrainingPlan]) -> bool:
	if any(training_plan_row_identity(row)['programmeId'] == programme_id for row in active_rows):
		return True
	return TrainingPlanProgramConfig.objects.filter(program_id=programme_id).exists()


def training_plan_rows_match_values_by_identity(existing_rows: list[TrainingPlan], validated_rows: list[dict]) -> bool:
	if len(existing_rows) != len(validated_rows):
		return False
	existing_by_identity = {
		(training_plan_marker_value(row.notes, '__group_id:'), training_plan_marker_value(row.notes, '__block_id:')): row
		for row in existing_rows
	}
	if len(existing_by_identity) != len(existing_rows):
		return False
	for item in validated_rows:
		row = existing_by_identity.get((item['groupId'], item['blockId']))
		if row is None or not training_plan_row_matches_values(row, item['values']):
			return False
	return True


def current_training_plan_rows_for_update() -> list[TrainingPlan]:
	return list(TrainingPlan.objects.select_for_update().filter(active_training_plan_filter()).order_by('id'))


def all_training_plan_rows_for_update() -> list[TrainingPlan]:
	return list(TrainingPlan.objects.select_for_update().order_by('id'))


def restore_archived_training_plan_rows(rows: list[TrainingPlan]) -> None:
	for row in rows:
		row.is_archived = False
		row.archived_at = None
		row.archived_by = ''
		row.archive_reason = ''
		row.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])


def validate_optional_training_plan_row_ids(payload: dict, key: str, label: str) -> tuple[list[int], JsonResponse | None]:
	if key not in payload:
		return [], None
	value = payload.get(key)
	if not isinstance(value, list):
		return [], JsonResponse({'detail': f'{key} must be a list.'}, status=400)
	ids = []
	for item in value:
		text = str(item or '').strip()
		if not text:
			return [], JsonResponse({'detail': f'{label} restore contains a missing id.'}, status=400)
		try:
			row_id = int(text)
		except (TypeError, ValueError):
			return [], JsonResponse({'detail': f'{label} restore contains an invalid id.'}, status=400)
		ids.append(row_id)
	if len(ids) != len(set(ids)):
		return [], JsonResponse({'detail': f'{label} restore contains duplicate ids.'}, status=400)
	return ids, None


def training_plan_recovery_confirmed(request, payload: dict) -> bool:
	if payload.get('confirmAdminRecovery') is not True:
		return False
	expected_token = os.getenv('TRAINING_PLAN_RECOVERY_TOKEN', '').strip()
	submitted_token = _header_text(request, 'X-KBC-Admin-Recovery-Token')
	return bool(expected_token and submitted_token and submitted_token == expected_token)


def validate_legacy_training_plan_full_save_access(request, payload: dict) -> str:
	source = _header_text(request, 'X-KBC-Training-Plan-Save-Source')
	if source in MIGRATED_TRAINING_PLAN_FULL_SAVE_SOURCES:
		return f'Migrated Training Plan flow "{source}" cannot use legacy replace-all.'
	if _header_text(request, LEGACY_TRAINING_PLAN_FULL_SAVE_FLAG_HEADER) != LEGACY_TRAINING_PLAN_FULL_SAVE_FLAG_VALUE:
		return 'Legacy Training Plan replace-all requires an explicit internal/admin/debug flag.'
	if payload.get('confirmLegacyReplaceAll') is not True:
		return 'Legacy Training Plan replace-all requires confirmLegacyReplaceAll=true.'
	return ''


def audit_training_plan_rejection(request, *, reason: str, status_code: int, current_items: list[dict], incoming_count: int | None, submitted_version: str = '', current_version: str = '') -> None:
	_audit_log(
		request,
		action='reject',
		entity='TrainingPlan',
		object_label='Training Plan timeline',
		before={'count': len(current_items), 'version': current_version or training_plan_version(current_items)},
		after={'count': incoming_count if incoming_count is not None else None, 'version': submitted_version},
		metadata={
			'accepted': False,
			'reason': reason,
			'status': status_code,
			'previousCount': len(current_items),
			'incomingCount': incoming_count,
			'submittedVersion': submitted_version,
			'currentVersion': current_version or training_plan_version(current_items),
			'timestamp': timezone.now().isoformat(),
		},
	)


def log_legacy_training_plan_full_save(
	request,
	*,
	incoming_count: int | None,
	current_count: int,
	submitted_version: str,
	current_version: str,
	accepted: bool | None,
	rejection_reason: str = '',
	after_count: int | None = None,
) -> None:
	logger.warning(
		'LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED %s',
		json.dumps({
			'userId': _header_int(request, 'X-KBC-User-Id'),
			'username': _header_text(request, 'X-KBC-Username'),
			'email': _header_text(request, 'X-KBC-User-Email'),
			'displayName': _header_text(request, 'X-KBC-Display-Name'),
			'path': request.get_full_path(),
			'method': request.method,
			'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
			'incomingItemCount': incoming_count,
			'currentRowCount': current_count,
			'payloadVersion': submitted_version,
			'currentServerVersion': current_version,
			'accepted': accepted,
			'rejectionReason': rejection_reason,
			'afterRowCount': after_count,
			'timestamp': timezone.now().isoformat(),
		}, sort_keys=True),
	)


def training_plan_values_from_payload_row(row: dict, index: int) -> tuple[dict, str]:
	cohort_name = str(row.get('cohortName', '')).strip()
	program = str(row.get('program', '')).strip()
	module_name = str(row.get('moduleName', '')).strip()
	start_date = str(row.get('startDate', '')).strip()
	end_date = str(row.get('endDate', '')).strip()
	sessions_number = str(row.get('sessionsNumber', '')).strip()
	tutor_profile_id = normalize_nullable_int(row.get('tutorProfileId', None))

	if not cohort_name:
		return {}, f'Row {index + 1} is missing cohortName.'
	if not program:
		return {}, f'Row {index + 1} is missing program.'
	if not module_name:
		return {}, f'Row {index + 1} is missing moduleName.'
	if parse_date(start_date) is None:
		return {}, f'Row {index + 1} has an invalid startDate.'
	if parse_date(end_date) is None:
		return {}, f'Row {index + 1} has an invalid endDate.'
	try:
		if int(sessions_number) < 1:
			return {}, f'Row {index + 1} must have at least one session.'
	except (TypeError, ValueError):
		return {}, f'Row {index + 1} has an invalid sessionsNumber.'
	tutor_name = str(row.get('tutorName', '')).strip()
	if tutor_profile_id is not None:
		try:
			profile = TutorProfile.objects.get(pk=tutor_profile_id, is_active=True)
		except TutorProfile.DoesNotExist:
			return {}, f'Row {index + 1} references an unknown tutorProfileId.'
		tutor_name = profile.name

	return {
		'cohort_name': cohort_name,
		'program': program,
		'starting_date_lable': str(row.get('startingDateLabel', '')).strip(),
		'module_name': module_name,
		'group_name': str(row.get('groupName', '')).strip(),
		'coach_name': str(row.get('coachName', '')).strip(),
		'tutor_name': tutor_name,
		'tutor_profile_id': tutor_profile_id,
		'start_date': start_date,
		'end_date': end_date,
		'sessions_number': sessions_number,
		'session_week_day': str(row.get('sessionWeekDay', '')).strip(),
		'session_start_time': str(row.get('sessionStartTime', '')).strip(),
		'session_end_time': str(row.get('sessionEndTime', '')).strip(),
		'session_ksb_json': json.dumps(normalize_session_ksb_mappings(row.get('sessionKsbMappings', [])), ensure_ascii=False),
		'session_coverage_json': json.dumps(normalize_session_coverage(row.get('sessionCoverage', [])), ensure_ascii=False),
		'ksb_profile_id': normalize_nullable_int(row.get('ksbProfileId', None)),
		'programme_display_order': normalize_nullable_int(row.get('programmeDisplayOrder', None)),
		'cohort_display_order': normalize_nullable_int(row.get('cohortDisplayOrder', None)),
		'notes': str(row.get('notes', '')).strip(),
	}, ''


KSB_CODE_PATTERNS = {
	'knowledgeCodes': re.compile(r'^K\d+(?:\.\d+)*$', re.IGNORECASE),
	'skillCodes': re.compile(r'^S\d+(?:\.\d+)*$', re.IGNORECASE),
	'behaviourCodes': re.compile(r'^B\d+(?:\.\d+)*$', re.IGNORECASE),
}

TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX = '__module_color:'
TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX = '__program_id:'
TRAINING_PLAN_COHORT_ID_MARKER_PREFIX = '__cohort_id:'
TRAINING_PLAN_METADATA_MARKER_PREFIXES = (
	TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX,
	TRAINING_PLAN_COHORT_ID_MARKER_PREFIX,
	'__group_id:',
	'__block_id:',
	'__holiday_ids:',
	'__cohort_color:',
	TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX,
	'__cohort_end_date:',
	'__group_name:',
	'__coach_name:',
)


def training_plan_marker_value(notes: str, prefix: str) -> str:
	reading_markers = True
	for raw_line in str(notes or '').splitlines():
		line = raw_line.strip()
		if not line:
			continue
		if reading_markers and line.startswith(prefix):
			return line[len(prefix):].strip()
		if not line.startswith('__'):
			reading_markers = False
	return ''


def normalize_training_plan_identity(value: str) -> str:
	return re.sub(r'\s+', ' ', str(value or '').strip().lower())


def training_plan_programme_id_from_label(value: str) -> str:
	normalized_value = normalize_training_plan_identity(value)
	if not normalized_value:
		return ''
	for config in TrainingPlanProgramConfig.objects.all().order_by('id'):
		candidates = {
			normalize_training_plan_identity(config.program_id),
			normalize_training_plan_identity(config.name),
			normalize_training_plan_identity(str(config.name or '').split('\n', 1)[0]),
		}
		if normalized_value in candidates:
			return config.program_id
		for candidate in candidates:
			if candidate and (candidate in normalized_value or normalized_value in candidate):
				return config.program_id
	if 'pcp' in normalized_value or 'project control' in normalized_value:
		return 'pcp'
	if normalized_value == 'mm' or 'marketing manager' in normalized_value:
		return 'mm'
	if normalized_value == 'me' or 'marketing executive' in normalized_value:
		return 'me'
	return normalized_value


def training_plan_row_identity(row: TrainingPlan) -> dict:
	programme_id = training_plan_marker_value(row.notes, TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX)
	if not programme_id:
		programme_id = training_plan_programme_id_from_label(row.program)
	cohort_id = training_plan_marker_value(row.notes, TRAINING_PLAN_COHORT_ID_MARKER_PREFIX)
	if not cohort_id:
		cohort_id = f'{normalize_training_plan_identity(row.cohort_name)}::{normalize_training_plan_identity(row.starting_date_lable)}'
	return {'programmeId': programme_id, 'cohortId': cohort_id}
TRAINING_PLAN_COLOR_PATTERN = re.compile(r'^#[0-9a-fA-F]{6}$')


def normalize_training_plan_color(value) -> str:
	color = str(value or '').strip()
	if not color:
		raise ValueError('color cannot be empty.')
	if not TRAINING_PLAN_COLOR_PATTERN.match(color):
		raise ValueError('color must be a hex color in #RRGGBB format.')
	return color.upper()


def update_training_plan_module_color_marker(notes: str, color: str) -> str:
	lines = str(notes or '').strip().split('\n') if str(notes or '').strip() else []
	markers = []
	note_lines = []
	reading_markers = True
	replaced = False

	for line in lines:
		if reading_markers and line.startswith(TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX):
			markers.append(f'{TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX}{color}')
			replaced = True
			continue
		if reading_markers and any(line.startswith(prefix) for prefix in TRAINING_PLAN_METADATA_MARKER_PREFIXES):
			markers.append(line)
			continue
		reading_markers = False
		note_lines.append(line)

	if not replaced:
		insert_at = 0
		for index, marker in enumerate(markers):
			if marker.startswith('__cohort_color:'):
				insert_at = index + 1
			elif insert_at == 0 and marker.startswith(('__program_id:', '__cohort_id:', '__group_id:', '__block_id:', '__holiday_ids:')):
				insert_at = index + 1
		markers.insert(insert_at, f'{TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX}{color}')

	return '\n'.join([*markers, *note_lines]).strip()


def update_training_plan_visible_notes(existing_notes: str, visible_notes: str) -> str:
	incoming = str(visible_notes or '').strip()
	if any(incoming.startswith(prefix) for prefix in TRAINING_PLAN_METADATA_MARKER_PREFIXES):
		return incoming

	lines = str(existing_notes or '').strip().split('\n') if str(existing_notes or '').strip() else []
	markers = []
	reading_markers = True
	for line in lines:
		if reading_markers and any(line.startswith(prefix) for prefix in TRAINING_PLAN_METADATA_MARKER_PREFIXES):
			markers.append(line)
			continue
		reading_markers = False
		break

	if not markers:
		return incoming
	return '\n'.join([*markers, incoming]).strip()


def training_plan_metadata_lines(notes: str) -> tuple[list[str], list[str]]:
	lines = str(notes or '').strip().split('\n') if str(notes or '').strip() else []
	markers = []
	note_lines = []
	reading_markers = True
	for line in lines:
		if reading_markers and any(line.startswith(prefix) for prefix in TRAINING_PLAN_METADATA_MARKER_PREFIXES):
			markers.append(line)
			continue
		reading_markers = False
		note_lines.append(line)
	return markers, note_lines


def set_training_plan_metadata_markers(notes: str, marker_values: dict[str, str]) -> str:
	markers, note_lines = training_plan_metadata_lines(notes)
	marker_by_prefix = {}
	unknown_markers = []
	for marker in markers:
		matched_prefix = next((prefix for prefix in TRAINING_PLAN_METADATA_MARKER_PREFIXES if marker.startswith(prefix)), '')
		if matched_prefix:
			marker_by_prefix[matched_prefix] = marker[len(matched_prefix):].strip()
		else:
			unknown_markers.append(marker)
	marker_by_prefix.update(marker_values)
	ordered_prefixes = [
		TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX,
		TRAINING_PLAN_COHORT_ID_MARKER_PREFIX,
		'__group_id:',
		'__block_id:',
		'__holiday_ids:',
		'__cohort_color:',
		TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX,
		'__cohort_end_date:',
		'__group_name:',
		'__coach_name:',
	]
	next_markers = []
	for prefix in ordered_prefixes:
		value = str(marker_by_prefix.get(prefix, '') or '').strip()
		if value:
			next_markers.append(f'{prefix}{value}')
	return '\n'.join([*unknown_markers, *next_markers, *note_lines]).strip()


def normalize_ksb_codes(value, field_name: str) -> list[str]:
	pattern = KSB_CODE_PATTERNS[field_name]
	if not isinstance(value, list):
		return []
	seen = set()
	codes = []
	for item in value:
		code = str(item or '').strip().upper()
		if not code or code in seen or not pattern.match(code):
			continue
		seen.add(code)
		codes.append(code)
	return codes


def normalize_ksb_number(value) -> str:
	number = re.sub(r'[^0-9.]+', '', str(value or '').strip())
	number = re.sub(r'\.+', '.', number).strip('.')
	if not re.match(r'^\d+(?:\.\d+)*$', number):
		return ''
	return '.'.join(str(int(part)) for part in number.split('.'))


def normalize_ksb_profile_items(value) -> list[dict]:
	if not isinstance(value, list):
		return []
	seen = set()
	items = []
	for item in value:
		if not isinstance(item, dict):
			continue
		item_type = str(item.get('type', '')).strip().upper()
		if item_type not in {'K', 'S', 'B'}:
			continue
		number = normalize_ksb_number(item.get('number', ''))
		if not number:
			code = str(item.get('code', '')).strip().upper()
			match = re.match(rf'^{item_type}(\d+(?:\.\d+)*)$', code)
			number = normalize_ksb_number(match.group(1)) if match else ''
		if not number:
			continue
		code = f'{item_type}{number}'
		if code in seen:
			continue
		seen.add(code)
		items.append({
			'type': item_type,
			'number': number,
			'code': code,
			'description': str(item.get('description', '')).strip(),
		})
	return items


def ksb_codes_from_items(items: list[dict], item_type: str) -> list[str]:
	return [item['code'] for item in items if item.get('type') == item_type]


def normalize_session_ksb_mappings(value) -> list[dict]:
	if isinstance(value, str):
		try:
			raw = json.loads(value or '[]')
		except (TypeError, json.JSONDecodeError):
			raw = []
	else:
		raw = value
	if not isinstance(raw, list):
		return []
	normalized = []
	for item in raw:
		if not isinstance(item, dict):
			item = {}
		normalized.append({
			'knowledgeCodes': normalize_ksb_codes(item.get('knowledgeCodes', []), 'knowledgeCodes'),
			'skillCodes': normalize_ksb_codes(item.get('skillCodes', []), 'skillCodes'),
			'behaviourCodes': normalize_ksb_codes(item.get('behaviourCodes', []), 'behaviourCodes'),
		})
	return normalized


def normalize_session_coverage(value) -> list[dict]:
	if isinstance(value, str):
		try:
			raw = json.loads(value or '[]')
		except (TypeError, json.JSONDecodeError):
			raw = []
	else:
		raw = value
	if not isinstance(raw, list):
		return []
	normalized = []
	for item in raw:
		if not isinstance(item, dict):
			continue
		try:
			session_number = int(item.get('sessionNumber') or 0)
		except (TypeError, ValueError):
			session_number = 0
		if session_number < 1:
			continue
		assigned_id = normalize_nullable_int(item.get('assignedTutorProfileId'))
		coverage_id = normalize_nullable_int(item.get('coverageTutorProfileId'))
		coverage_coach_id = normalize_nullable_int(item.get('coverageCoachProfileId'))
		tutor_unavailable = bool(item.get('tutorUnavailable'))
		coverage_status = str(item.get('coverageStatus') or 'none').strip().lower()
		if coverage_status not in {'none', 'required', 'covered'}:
			coverage_status = 'none'
		if tutor_unavailable and not coverage_id and not coverage_coach_id:
			coverage_status = 'required'
		if coverage_id:
			if assigned_id and assigned_id == coverage_id:
				continue
			if not TutorProfile.objects.filter(pk=coverage_id, is_active=True).exists():
				continue
			coverage_status = 'covered'
		if coverage_coach_id:
			if not CoachProfile.objects.filter(pk=coverage_coach_id, is_active=True).exists():
				continue
			coverage_status = 'covered'
		coverage_reason = str(item.get('coverageReason', '')).strip()
		if (coverage_id or coverage_coach_id) and not coverage_reason:
			continue
		normalized.append({
			'sessionNumber': session_number,
			'assignedTutorProfileId': str(assigned_id) if assigned_id else '',
			'coverageTutorProfileId': str(coverage_id) if coverage_id else '',
			'coverageCoachProfileId': str(coverage_coach_id) if coverage_coach_id else '',
			'coverageStatus': coverage_status,
			'tutorUnavailable': tutor_unavailable,
			'tutorUnavailableReason': str(item.get('tutorUnavailableReason', '')).strip(),
			'tutorUnavailableNotes': str(item.get('tutorUnavailableNotes', '')).strip(),
			'coverageReason': coverage_reason,
			'coverageNotes': str(item.get('coverageNotes', '')).strip(),
		})
	return normalized


def remove_tutor_profile_references(profile_id: int) -> int:
	profile_id_text = str(profile_id)
	changed_rows = 0
	for row in TrainingPlan.objects.all():
		update_fields = []
		if row.tutor_profile_id == profile_id:
			row.tutor_profile_id = None
			row.tutor_name = ''
			update_fields.extend(['tutor_profile_id', 'tutor_name'])

		try:
			raw_coverage = json.loads(row.session_coverage_json or '[]')
		except (TypeError, json.JSONDecodeError):
			raw_coverage = []
		if not isinstance(raw_coverage, list):
			raw_coverage = []

		next_coverage = []
		coverage_changed = False
		for item in raw_coverage:
			if not isinstance(item, dict):
				continue
			next_item = dict(item)
			if str(next_item.get('assignedTutorProfileId') or '').strip() == profile_id_text:
				next_item['assignedTutorProfileId'] = ''
				coverage_changed = True
			if str(next_item.get('coverageTutorProfileId') or '').strip() == profile_id_text:
				next_item['coverageTutorProfileId'] = ''
				next_item['coverageReason'] = ''
				next_item['coverageNotes'] = ''
				next_item['coverageStatus'] = 'covered' if next_item.get('coverageCoachProfileId') else 'required' if next_item.get('tutorUnavailable') else 'none'
				coverage_changed = True
			keep_item = (
				bool(next_item.get('tutorUnavailable'))
				or bool(str(next_item.get('coverageTutorProfileId') or '').strip())
				or bool(str(next_item.get('coverageCoachProfileId') or '').strip())
				or str(next_item.get('coverageStatus') or '').strip().lower() not in {'', 'none'}
			)
			if keep_item:
				next_coverage.append(next_item)

		if coverage_changed:
			row.session_coverage_json = json.dumps(next_coverage, ensure_ascii=False)
			update_fields.append('session_coverage_json')

		if update_fields:
			row.save(update_fields=sorted(set(update_fields)))
			changed_rows += 1
	return changed_rows


def remove_coach_profile_references(profile_id: int) -> int:
	profile_id_text = str(profile_id)
	changed_rows = 0
	for row in TrainingPlan.objects.all():
		try:
			raw_coverage = json.loads(row.session_coverage_json or '[]')
		except (TypeError, json.JSONDecodeError):
			raw_coverage = []
		if not isinstance(raw_coverage, list):
			raw_coverage = []

		next_coverage = []
		coverage_changed = False
		for item in raw_coverage:
			if not isinstance(item, dict):
				continue
			next_item = dict(item)
			if str(next_item.get('coverageCoachProfileId') or '').strip() == profile_id_text:
				next_item['coverageCoachProfileId'] = ''
				next_item['coverageReason'] = ''
				next_item['coverageNotes'] = ''
				next_item['coverageStatus'] = 'covered' if next_item.get('coverageTutorProfileId') else 'required' if next_item.get('tutorUnavailable') else 'none'
				coverage_changed = True
			keep_item = (
				bool(next_item.get('tutorUnavailable'))
				or bool(str(next_item.get('coverageTutorProfileId') or '').strip())
				or bool(str(next_item.get('coverageCoachProfileId') or '').strip())
				or str(next_item.get('coverageStatus') or '').strip().lower() not in {'', 'none'}
			)
			if keep_item:
				next_coverage.append(next_item)

		if coverage_changed:
			row.session_coverage_json = json.dumps(next_coverage, ensure_ascii=False)
			row.save(update_fields=['session_coverage_json'])
			changed_rows += 1
	return changed_rows


def profile_force_delete_confirmed(request, payload: dict) -> bool:
	return (
		payload.get('confirmForceDelete') is True
		and _header_text(request, PROFILE_FORCE_DELETE_CONFIRM_HEADER) == PROFILE_FORCE_DELETE_CONFIRM_VALUE
	)


def log_profile_force_delete_attempt(request, *, label: str, profile_id: int, accepted: bool, rejection_reason: str = '') -> None:
	logger.warning(
		'%s %s',
		label,
		json.dumps({
			'path': request.get_full_path(),
			'method': request.method,
			'profileId': profile_id,
			'accepted': accepted,
			'rejectionReason': rejection_reason,
			'timestamp': timezone.now().isoformat(),
		}, sort_keys=True),
	)


def normalize_nullable_int(value) -> int | None:
	if value in {None, ''}:
		return None
	try:
		return int(value)
	except (TypeError, ValueError):
		return None


def serialize_ksb_profile(item: KsbProfile) -> dict:
	ksb_items = normalize_ksb_profile_items(getattr(item, 'ksb_items', []))
	knowledge_codes = ksb_codes_from_items(ksb_items, 'K') or normalize_ksb_codes(item.knowledge_codes, 'knowledgeCodes')
	skill_codes = ksb_codes_from_items(ksb_items, 'S') or normalize_ksb_codes(item.skill_codes, 'skillCodes')
	behaviour_codes = ksb_codes_from_items(ksb_items, 'B') or normalize_ksb_codes(item.behaviour_codes, 'behaviourCodes')
	return {
		'id': str(item.id),
		'name': item.name,
		'programmeName': item.programme_name or '',
		'description': item.description or '',
		'ksbItems': ksb_items,
		'knowledgeCodes': knowledge_codes,
		'skillCodes': skill_codes,
		'behaviourCodes': behaviour_codes,
		'isActive': bool(item.is_active),
		'createdBy': item.created_by or '',
		'createdAt': item.created_at.isoformat() if item.created_at else '',
		'updatedAt': item.updated_at.isoformat() if item.updated_at else '',
	}


def ksb_profile_values_from_payload(payload: dict) -> tuple[dict, str]:
	name = str(payload.get('name', '')).strip()
	if not name:
		return {}, 'Profile name is required.'
	ksb_items = normalize_ksb_profile_items(payload.get('ksbItems', []))
	knowledge_codes = ksb_codes_from_items(ksb_items, 'K') or normalize_ksb_codes(payload.get('knowledgeCodes', []), 'knowledgeCodes')
	skill_codes = ksb_codes_from_items(ksb_items, 'S') or normalize_ksb_codes(payload.get('skillCodes', []), 'skillCodes')
	behaviour_codes = ksb_codes_from_items(ksb_items, 'B') or normalize_ksb_codes(payload.get('behaviourCodes', []), 'behaviourCodes')
	return {
		'name': name,
		'programme_name': str(payload.get('programmeName', payload.get('programme_name', ''))).strip(),
		'description': str(payload.get('description', '')).strip(),
		'ksb_items': ksb_items,
		'knowledge_codes': knowledge_codes,
		'skill_codes': skill_codes,
		'behaviour_codes': behaviour_codes,
		'is_active': bool(payload.get('isActive', True)),
	}, ''


def tutor_profile_values_from_payload(payload: dict) -> tuple[dict, str]:
	name = str(payload.get('name', '')).strip()
	if not name:
		return {}, 'Tutor name is required.'
	normalized_name = normalize_tutor_profile_name(name)
	if not normalized_name:
		return {}, 'Tutor name is required.'
	return {
		'name': name,
		'normalized_name': normalized_name,
		'email': str(payload.get('email', '')).strip(),
		'phone': str(payload.get('phone', '')).strip(),
		'notes': str(payload.get('notes', '')).strip(),
		'availability_notes': str(payload.get('availabilityNotes', '')).strip(),
		'is_active': bool(payload.get('isActive', True)),
	}, ''


def coach_profile_values_from_payload(payload: dict) -> tuple[dict, str]:
	name = str(payload.get('name', '')).strip()
	if not name:
		return {}, 'Coach name is required.'
	normalized_name = normalize_tutor_profile_name(name)
	if not normalized_name:
		return {}, 'Coach name is required.'
	return {
		'name': name,
		'normalized_name': normalized_name,
		'email': str(payload.get('email', '')).strip(),
		'phone': str(payload.get('phone', '')).strip(),
		'notes': str(payload.get('notes', '')).strip(),
		'availability_notes': str(payload.get('availabilityNotes', '')).strip(),
		'is_active': bool(payload.get('isActive', True)),
	}, ''


TRAINING_PLAN_HOLIDAY_COLORS = {
	'bank-holiday': '#F0FFF4',
	'term-break': '#E8F4FD',
	'non-teaching': '#FFF0F0',
	'holiday': '#FFFBEB',
}

TRAINING_PLAN_HOLIDAY_TYPE_MARKER = '__holiday_type__:'
TRAINING_PLAN_HOLIDAY_TYPE_DATE = date(2099, 1, 1)


def serialize_training_plan_holiday(item: TrainingPlanHoliday) -> dict:
	return {
		'id': str(item.id),
		'label': item.label,
		'startDate': item.start_date.isoformat(),
		'endDate': item.end_date.isoformat(),
		'type': item.type or 'holiday',
		'color': item.color or TRAINING_PLAN_HOLIDAY_COLORS.get(item.type or 'holiday', '#FFFBEB'),
	}


def training_plan_holidays_queryset():
	return TrainingPlanHoliday.objects.exclude(label__startswith=TRAINING_PLAN_HOLIDAY_TYPE_MARKER)


def training_plan_holidays_version() -> str:
	records = training_plan_holidays_queryset().order_by('id').values('id', 'label', 'start_date', 'end_date', 'type', 'color', 'updated_at')
	payload = [
		{
			'id': str(record['id']),
			'label': record['label'] or '',
			'startDate': record['start_date'].isoformat() if record['start_date'] else '',
			'endDate': record['end_date'].isoformat() if record['end_date'] else '',
			'type': record['type'] or 'holiday',
			'color': record['color'] or '',
			'updatedAt': record['updated_at'].isoformat() if record['updated_at'] else '',
		}
		for record in records
	]
	return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()


def training_plan_holidays_snapshot() -> list[dict]:
	return [
		serialize_training_plan_holiday(item)
		for item in training_plan_holidays_queryset().order_by('start_date', 'end_date', 'id')
	]


def training_plan_holidays_response(payload, *, status: int = 200):
	response = JsonResponse(payload, safe=not isinstance(payload, list), status=status)
	response['X-KBC-Training-Plan-Holidays-Version'] = training_plan_holidays_version()
	return response


def require_training_plan_holidays_version(payload: dict, current_version: str, current_items: list[dict]) -> JsonResponse | None:
	submitted_version = str(payload.get('version', '') or '').strip()
	if not submitted_version:
		return JsonResponse(
			{
				'detail': 'Reload the latest holiday list before saving. This prevents an older page from overwriting newer holiday periods.',
				'currentVersion': current_version,
				'items': current_items,
			},
			status=409,
		)
	if submitted_version != current_version:
		return JsonResponse(
			{
				'detail': 'The holiday list was updated by another user. Reload the latest holidays before saving.',
				'currentVersion': current_version,
				'items': current_items,
			},
			status=409,
		)
	return None


def training_plan_holiday_values_from_payload(payload: dict) -> tuple[dict, str]:
	label = str(payload.get('label', '')).strip()
	start_date = parse_date(str(payload.get('startDate', '')).strip())
	end_date = parse_date(str(payload.get('endDate', '')).strip())
	holiday_type = str(payload.get('type', 'holiday')).strip() or 'holiday'
	color = str(payload.get('color', '')).strip() or TRAINING_PLAN_HOLIDAY_COLORS.get(holiday_type, '#FFFBEB')

	if not label:
		return {}, 'label is required.'
	if start_date is None:
		return {}, 'startDate is required.'
	if end_date is None:
		return {}, 'endDate is required.'
	if end_date < start_date:
		return {}, 'endDate must be on or after startDate.'
	return {
		'label': label,
		'start_date': start_date,
		'end_date': end_date,
		'type': holiday_type,
		'color': color,
	}, ''


def serialize_training_plan_holiday_type(item: TrainingPlanHoliday) -> dict:
	label = item.label[len(TRAINING_PLAN_HOLIDAY_TYPE_MARKER):].strip() if item.label.startswith(TRAINING_PLAN_HOLIDAY_TYPE_MARKER) else (item.type or 'holiday')
	return {
		'id': str(item.id),
		'value': item.type or 'holiday',
		'label': label,
		'color': item.color or TRAINING_PLAN_HOLIDAY_COLORS.get(item.type or 'holiday', '#FFFBEB'),
	}


def training_plan_holiday_types_queryset():
	return TrainingPlanHoliday.objects.filter(label__startswith=TRAINING_PLAN_HOLIDAY_TYPE_MARKER)


def training_plan_holiday_types_snapshot() -> list[dict]:
	return [
		serialize_training_plan_holiday_type(item)
		for item in training_plan_holiday_types_queryset().order_by('type', 'id')
	]


def training_plan_holiday_types_version(items: list[dict] | None = None) -> str:
	items = items if items is not None else training_plan_holiday_types_snapshot()
	version_payload = [
		{
			'id': item.get('id', ''),
			'value': item.get('value', ''),
			'label': item.get('label', ''),
			'color': item.get('color', ''),
		}
		for item in items
	]
	return hashlib.sha256(json.dumps(version_payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()


def training_plan_holiday_types_response(payload, *, status: int = 200):
	response = JsonResponse(payload, safe=not isinstance(payload, list), status=status)
	response['X-KBC-Training-Plan-Holiday-Types-Version'] = training_plan_holiday_types_version()
	return response


def require_optional_training_plan_holiday_types_version(payload: dict, current_version: str, current_items: list[dict]) -> JsonResponse | None:
	submitted_version = str(payload.get('version', '') or '').strip()
	if submitted_version and submitted_version != current_version:
		return JsonResponse(
			{
				'detail': 'The holiday types were updated by another user. Reload the latest holiday types before saving.',
				'currentVersion': current_version,
				'items': current_items,
			},
			status=409,
		)
	return None


def serialize_training_plan_module_definition(item: TrainingPlanModuleDefinition) -> dict:
	return {
		'id': item.module_id,
		'name': item.name,
		'defaultSessions': int(item.default_sessions),
		'bg': item.bg,
		'tx': item.tx,
	}


def training_plan_module_definitions_snapshot() -> list[dict]:
	return [
		serialize_training_plan_module_definition(item)
		for item in TrainingPlanModuleDefinition.objects.all().order_by('module_id', 'id')
	]


def training_plan_module_definitions_version(items: list[dict] | None = None) -> str:
	items = items if items is not None else training_plan_module_definitions_snapshot()
	version_payload = [
		{
			'id': item.get('id', ''),
			'name': item.get('name', ''),
			'defaultSessions': item.get('defaultSessions', ''),
			'bg': item.get('bg', ''),
			'tx': item.get('tx', ''),
		}
		for item in items
	]
	return hashlib.sha256(json.dumps(version_payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()


def training_plan_module_definitions_response(payload, *, status: int = 200):
	response = JsonResponse(payload, safe=not isinstance(payload, list), status=status)
	response['X-KBC-Training-Plan-Modules-Version'] = training_plan_module_definitions_version()
	return response


def require_training_plan_module_definitions_version(payload: dict, current_version: str, current_items: list[dict]) -> JsonResponse | None:
	submitted_version = str(payload.get('version', '') or '').strip()
	if not submitted_version:
		return JsonResponse({
			'detail': 'Reload the latest module definitions before saving. This prevents an older page from overwriting newer module data.',
			'currentVersion': current_version,
			'items': current_items,
		}, status=409)
	if submitted_version != current_version:
		return JsonResponse({
			'detail': 'The module definitions were updated by another user. Reload the latest modules before saving.',
			'currentVersion': current_version,
			'items': current_items,
		}, status=409)
	return None


def training_plan_module_definition_values_from_payload(payload: dict, *, require_id: bool = True) -> tuple[dict, str]:
	module_id = str(payload.get('id', '')).strip()
	name = str(payload.get('name', '')).strip()
	bg = str(payload.get('bg', '')).strip() or '#4A6DB0'
	tx = str(payload.get('tx', '')).strip() or '#ffffff'
	try:
		default_sessions = max(1, int(payload.get('defaultSessions', 1) or 1))
	except (TypeError, ValueError):
		return {}, 'defaultSessions must be a positive integer.'
	if require_id and not module_id:
		return {}, 'id is required.'
	if not name:
		return {}, 'name is required.'
	return {
		'module_id': module_id,
		'name': name,
		'default_sessions': default_sessions,
		'bg': bg,
		'tx': tx,
	}, ''


def serialize_training_plan_program_config(item: TrainingPlanProgramConfig) -> dict:
	return {
		'id': item.program_id,
		'name': item.name,
		'sub': item.sub,
		'color': item.color,
	}


def training_plan_program_configs_snapshot() -> list[dict]:
	return [
		serialize_training_plan_program_config(item)
		for item in TrainingPlanProgramConfig.objects.all().order_by('program_id', 'id')
	]


def training_plan_program_configs_version(items: list[dict] | None = None) -> str:
	items = items if items is not None else training_plan_program_configs_snapshot()
	version_payload = [
		{
			'id': item.get('id', ''),
			'name': item.get('name', ''),
			'sub': item.get('sub', ''),
			'color': item.get('color', ''),
		}
		for item in items
	]
	return hashlib.sha256(json.dumps(version_payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()


def training_plan_program_configs_response(payload, *, status: int = 200):
	response = JsonResponse(payload, safe=not isinstance(payload, list), status=status)
	response['X-KBC-Training-Plan-Program-Configs-Version'] = training_plan_program_configs_version()
	return response


def require_training_plan_program_configs_version(payload: dict, current_version: str, current_items: list[dict]) -> JsonResponse | None:
	submitted_version = str(payload.get('version', '') or '').strip()
	if not submitted_version:
		return JsonResponse({
			'detail': 'Reload the latest programme configs before saving. This prevents an older page from overwriting newer programme data.',
			'currentVersion': current_version,
			'items': current_items,
		}, status=409)
	if submitted_version != current_version:
		return JsonResponse({
			'detail': 'The programme configs were updated by another user. Reload the latest programmes before saving.',
			'currentVersion': current_version,
			'items': current_items,
		}, status=409)
	return None


def training_plan_program_config_values_from_payload(payload: dict, *, require_id: bool = True) -> tuple[dict, str]:
	program_id = str(payload.get('id', '')).strip()
	name = str(payload.get('name', '')).strip()
	if require_id and not program_id:
		return {}, 'id is required.'
	if not name:
		return {}, 'name is required.'
	return {
		'program_id': program_id,
		'name': name,
		'sub': str(payload.get('sub', '')).strip(),
		'color': str(payload.get('color', '')).strip() or '#1B2A4A',
	}, ''


FEEDBACK_METADATA_HEADER = '--- Submission metadata ---'


def build_feedback_details(*, message: str, email: str, department: str, priority: str, anonymous: bool) -> str:
	metadata_lines = [
		f'Priority: {priority or "normal"}',
		f'Department: {department or "-"}',
		f'Anonymous: {"Yes" if anonymous else "No"}',
	]
	if email:
		metadata_lines.append(f'Email: {email}')

	return f'{message}\n\n{FEEDBACK_METADATA_HEADER}\n' + '\n'.join(metadata_lines)


def parse_feedback_details(details: str) -> tuple[str, dict]:
	raw_details = (details or '').strip()
	if not raw_details or FEEDBACK_METADATA_HEADER not in raw_details:
		return raw_details, {}

	message, _, metadata_block = raw_details.partition(f'\n\n{FEEDBACK_METADATA_HEADER}\n')
	metadata: dict[str, str] = {}
	for line in metadata_block.splitlines():
		if ':' not in line:
			continue
		key, value = line.split(':', 1)
		metadata[key.strip().lower()] = value.strip()

	return message.strip(), metadata


def serialize_feedback(item: Feedback) -> dict:
	message, metadata = parse_feedback_details(item.details)
	anonymous = bool(item.anonymous) or metadata.get('anonymous', '').lower() == 'yes'
	email = item.email or metadata.get('email', '')
	department = item.department or metadata.get('department', '')
	priority = item.priority or metadata.get('priority', 'normal')
	return {
		'id': int(item.id),
		'name': '' if anonymous else item.username,
		'email': email,
		'category': item.category,
		'department': '' if department in {None, '-'} else department,
		'priority': priority,
		'message': message,
		'anonymous': anonymous,
		'submittedAt': item.submitted_at.isoformat() if item.submitted_at else '',
	}


@csrf_exempt
def feedback(request):
	if request.method == 'GET':
		records = Feedback.objects.all().order_by('-submitted_at', '-id')
		return JsonResponse([serialize_feedback(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		message = str(payload.get('message', '')).strip()
		if not message:
			return HttpResponseBadRequest('Message is required.')

		anonymous = bool(payload.get('anonymous'))
		name = '' if anonymous else str(payload.get('name', '')).strip()
		email = '' if anonymous else str(payload.get('email', '')).strip()
		department = str(payload.get('department', '')).strip()
		priority = str(payload.get('priority', 'normal')).strip() or 'normal'
		username = 'Anonymous' if anonymous else (name or email or 'Staff member')

		record = Feedback.objects.create(
			username=username,
			email=email,
			category=str(payload.get('category', 'General Feedback')).strip() or 'General Feedback',
			department=department,
			priority=priority,
			anonymous=anonymous,
			details=message,
			submitted_at=timezone.now(),
		)

		_audit_log(request, action='create', entity='Feedback', object_id=record.id, object_label=record.category, after=serialize_feedback(record))
		return JsonResponse(serialize_feedback(record), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan(request):
	if request.method == 'GET':
		include_archived = str(request.GET.get('includeArchived', '')).strip().lower() in {'1', 'true', 'yes'}
		items = [serialize_training_plan(item) for item in training_plan_queryset(include_archived=include_archived)]
		return JsonResponse({
			'items': items,
			'version': training_plan_version(items),
			'count': len(items),
		})

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		items = payload.get('items') if isinstance(payload, dict) else None
		submitted_version = str(payload.get('version', '') or '').strip() if isinstance(payload, dict) else ''
		current_items = training_plan_items_snapshot()
		current_version = training_plan_version(current_items)
		incoming_count = len(items) if isinstance(items, list) else None
		current_count = len(current_items)
		access_rejection = validate_legacy_training_plan_full_save_access(request, payload if isinstance(payload, dict) else {})
		if access_rejection:
			log_legacy_training_plan_full_save(
				request,
				incoming_count=incoming_count,
				current_count=current_count,
				submitted_version=submitted_version,
				current_version=current_version,
				accepted=False,
				rejection_reason=access_rejection,
			)
			audit_training_plan_rejection(request, reason=access_rejection, status_code=403, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse({'detail': access_rejection}, status=403)

		log_legacy_training_plan_full_save(
			request,
			incoming_count=incoming_count,
			current_count=current_count,
			submitted_version=submitted_version,
			current_version=current_version,
			accepted=None,
		)
		if not isinstance(items, list):
			reason = 'Payload must include an items array.'
			log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=False, rejection_reason=reason)
			audit_training_plan_rejection(request, reason=reason, status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return HttpResponseBadRequest('Payload must include an items array.')

		recovery_confirmed = training_plan_recovery_confirmed(request, payload if isinstance(payload, dict) else {})

		if not submitted_version:
			reason = 'Reload the latest Training Plan before saving. This prevents an older page from overwriting newer timeline data.'
			log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=False, rejection_reason=reason)
			audit_training_plan_rejection(request, reason=reason, status_code=409, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse({'detail': reason, 'currentVersion': current_version, 'items': current_items}, status=409)

		if submitted_version != current_version:
			reason = 'The Training Plan was updated by someone else. Please reload and review before saving.'
			log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=False, rejection_reason=reason)
			audit_training_plan_rejection(request, reason=reason, status_code=409, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse({'detail': reason, 'currentVersion': current_version, 'items': current_items}, status=409)

		if not items and not recovery_confirmed:
			reason = 'Empty Training Plan saves are not allowed.'
			log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=False, rejection_reason=reason)
			audit_training_plan_rejection(request, reason=reason, status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse({'detail': 'Empty Training Plan saves are not allowed.'}, status=400)

		if (
			not recovery_confirmed
			and current_count >= TRAINING_PLAN_PARTIAL_SAVE_MIN_CURRENT
			and incoming_count is not None
			and incoming_count < int(current_count * TRAINING_PLAN_PARTIAL_SAVE_RATIO)
		):
			reason = 'Suspicious partial Training Plan save rejected.'
			log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=False, rejection_reason=reason)
			audit_training_plan_rejection(request, reason=reason, status_code=409, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse(
				{
					'detail': 'Suspicious partial Training Plan save rejected. Reload the latest Training Plan before saving.',
					'currentVersion': current_version,
					'items': current_items,
					'previousCount': current_count,
					'incomingCount': incoming_count,
				},
				status=409,
			)

		validated_items = []
		for index, row in enumerate(items):
			if not isinstance(row, dict):
				reason = f'Row {index + 1} must be an object.'
				log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=False, rejection_reason=reason)
				audit_training_plan_rejection(request, reason=reason, status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
				return JsonResponse({'detail': reason}, status=400)
			values, error = training_plan_values_from_payload_row(row, index)
			if error:
				log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=False, rejection_reason=error)
				audit_training_plan_rejection(request, reason=error, status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
				return JsonResponse({'detail': error}, status=400)
			validated_items.append(values)

		with transaction.atomic():
			locked_items = [serialize_training_plan(item) for item in TrainingPlan.objects.select_for_update().order_by('id')]
			locked_version = training_plan_version(locked_items)
			if submitted_version != locked_version:
				reason = 'The Training Plan was updated by someone else. Please reload and review before saving.'
				log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=len(locked_items), submitted_version=submitted_version, current_version=locked_version, accepted=False, rejection_reason=reason)
				audit_training_plan_rejection(request, reason=reason, status_code=409, current_items=locked_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=locked_version)
				return JsonResponse({'detail': reason, 'currentVersion': locked_version, 'items': locked_items}, status=409)

			TrainingPlan.objects.filter(active_training_plan_filter()).delete()
			created = [
				TrainingPlan.objects.create(**item)
				for item in validated_items
			]

		after_items = [serialize_training_plan(item) for item in created]
		next_version = training_plan_version(after_items)
		log_legacy_training_plan_full_save(request, incoming_count=incoming_count, current_count=current_count, submitted_version=submitted_version, current_version=current_version, accepted=True, after_count=len(after_items))
		diff = _bulk_diff(current_items, after_items, ignored_keys={'id'})
		_audit_log(
			request,
			action='replace',
			entity='TrainingPlan',
			object_label='Training Plan timeline',
			before={'count': diff['beforeCount'], 'version': current_version, 'removed': diff['removed']},
			after={'count': diff['afterCount'], 'version': next_version, 'added': diff['added']},
			metadata={
				'accepted': True,
				'received': len(items),
				'previousCount': len(current_items),
				'incomingCount': len(items),
				'addedCount': diff['addedCount'],
				'removedCount': diff['removedCount'],
				'truncated': diff['truncated'],
				'submittedVersion': submitted_version,
				'currentVersion': current_version,
				'nextVersion': next_version,
				'timestamp': timezone.now().isoformat(),
			},
		)
		return JsonResponse({'saved': len(created), 'items': after_items, 'version': next_version, 'count': len(after_items)})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_reorder_programmes(request):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeIds'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	programme_ids, validation_error = validate_reorder_ids(payload, 'programmeIds', 'Programme')
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		existing_ids = []
		for row in rows:
			programme_id = training_plan_row_identity(row)['programmeId']
			if programme_id and programme_id not in existing_ids:
				existing_ids.append(programme_id)
		existing_set = set(existing_ids)
		submitted_set = set(programme_ids)
		missing_ids = sorted(existing_set - submitted_set)
		unknown_ids = sorted(submitted_set - existing_set)
		if missing_ids:
			return JsonResponse({'detail': 'Programme reorder is missing existing programme ids.', 'missingIds': missing_ids}, status=400)
		if unknown_ids:
			return JsonResponse({'detail': 'Programme reorder contains unknown programme ids.', 'unknownIds': unknown_ids}, status=400)

		order_by_programme_id = {programme_id: index for index, programme_id in enumerate(programme_ids)}
		before = [
			{'id': row.id, 'programmeId': training_plan_row_identity(row)['programmeId'], 'programmeDisplayOrder': row.programme_display_order}
			for row in rows
		]
		for row in rows:
			next_order = order_by_programme_id[training_plan_row_identity(row)['programmeId']]
			if row.programme_display_order == next_order:
				continue
			row.programme_display_order = next_order
			row.save(update_fields=['programme_display_order'])
		after_rows = list(TrainingPlan.objects.order_by('id'))
		after = [
			{'id': row.id, 'programmeId': training_plan_row_identity(row)['programmeId'], 'programmeDisplayOrder': row.programme_display_order}
			for row in after_rows
		]
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_label='PROGRAMME_REORDER_PARTIAL_UPDATE',
			before={'order': before, 'version': locked_version},
			after={'order': after, 'programmeIds': programme_ids},
			metadata={'partialUpdate': True, 'section': 'programme-order', 'changedFields': ['programmeDisplayOrder']},
		)

	return JsonResponse(training_plan_order_response({'programmeOrder': programme_ids}))


@csrf_exempt
def training_plan_reorder_cohorts(request):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeId', 'cohortIds'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	programme_id = str(payload.get('programmeId') or '').strip()
	if not programme_id:
		return JsonResponse({'detail': 'programmeId is required.'}, status=400)
	cohort_ids, validation_error = validate_reorder_ids(payload, 'cohortIds', 'Cohort')
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		cohorts_by_programme: dict[str, list[str]] = {}
		cohort_programmes: dict[str, set[str]] = {}
		for row in rows:
			identity = training_plan_row_identity(row)
			row_programme_id = identity['programmeId']
			cohort_id = identity['cohortId']
			if row_programme_id and cohort_id:
				cohorts_by_programme.setdefault(row_programme_id, [])
				if cohort_id not in cohorts_by_programme[row_programme_id]:
					cohorts_by_programme[row_programme_id].append(cohort_id)
				cohort_programmes.setdefault(cohort_id, set()).add(row_programme_id)

		existing_ids = cohorts_by_programme.get(programme_id)
		if existing_ids is None:
			return JsonResponse({'detail': 'Programme scope for cohort reorder was not found.'}, status=404)
		existing_set = set(existing_ids)
		submitted_set = set(cohort_ids)
		cross_scope_ids = sorted([
			cohort_id
			for cohort_id in submitted_set
			if cohort_id in cohort_programmes and programme_id not in cohort_programmes[cohort_id]
		])
		if cross_scope_ids:
			return JsonResponse({'detail': 'Cohort reorder contains ids from another programme.', 'crossScopeIds': cross_scope_ids}, status=400)
		missing_ids = sorted(existing_set - submitted_set)
		unknown_ids = sorted(submitted_set - existing_set)
		if missing_ids:
			return JsonResponse({'detail': 'Cohort reorder is missing existing cohort ids.', 'missingIds': missing_ids}, status=400)
		if unknown_ids:
			return JsonResponse({'detail': 'Cohort reorder contains unknown cohort ids.', 'unknownIds': unknown_ids}, status=400)

		order_by_cohort_id = {cohort_id: index for index, cohort_id in enumerate(cohort_ids)}
		before = [
			{'id': row.id, 'programmeId': training_plan_row_identity(row)['programmeId'], 'cohortId': training_plan_row_identity(row)['cohortId'], 'cohortDisplayOrder': row.cohort_display_order}
			for row in rows
			if training_plan_row_identity(row)['programmeId'] == programme_id
		]
		for row in rows:
			identity = training_plan_row_identity(row)
			if identity['programmeId'] != programme_id:
				continue
			next_order = order_by_cohort_id[identity['cohortId']]
			if row.cohort_display_order == next_order:
				continue
			row.cohort_display_order = next_order
			row.save(update_fields=['cohort_display_order'])
		after_rows = list(TrainingPlan.objects.order_by('id'))
		after = [
			{'id': row.id, 'programmeId': training_plan_row_identity(row)['programmeId'], 'cohortId': training_plan_row_identity(row)['cohortId'], 'cohortDisplayOrder': row.cohort_display_order}
			for row in after_rows
			if training_plan_row_identity(row)['programmeId'] == programme_id
		]
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_label='COHORT_REORDER_PARTIAL_UPDATE',
			before={'order': before, 'version': locked_version},
			after={'order': after, 'programmeId': programme_id, 'cohortIds': cohort_ids},
			metadata={'partialUpdate': True, 'section': 'cohort-order', 'changedFields': ['cohortDisplayOrder']},
		)

	return JsonResponse(training_plan_order_response({'programmeId': programme_id, 'cohortOrder': cohort_ids}))


@csrf_exempt
def training_plan_cohort_detail(request, cohort_id: str):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeId', 'cohortName', 'startingDateLabel', 'cohortColor', 'cohortEndDate', 'holidayIds', 'ksbProfileId', 'blocks', 'allowBlockMembershipChanges'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	programme_id = str(payload.get('programmeId') or '').strip()
	target_cohort_id = str(cohort_id or '').strip()
	if not programme_id:
		return JsonResponse({'detail': 'programmeId is required.'}, status=400)
	if not target_cohort_id:
		return JsonResponse({'detail': 'A stable cohort id is required.'}, status=400)

	cohort_name = str(payload.get('cohortName') or '').strip()
	starting_date_label = str(payload.get('startingDateLabel') or '').strip()
	if not cohort_name:
		return JsonResponse({'detail': 'cohortName is required.'}, status=400)
	if not starting_date_label:
		return JsonResponse({'detail': 'startingDateLabel is required.'}, status=400)
	cohort_color = str(payload.get('cohortColor') or '').strip()
	if cohort_color:
		try:
			cohort_color = normalize_training_plan_color(cohort_color)
		except ValueError as exc:
			return JsonResponse({'detail': str(exc)}, status=400)
	cohort_end_date = str(payload.get('cohortEndDate') or '').strip()
	holiday_ids_value = payload.get('holidayIds', [])
	if not isinstance(holiday_ids_value, list):
		return JsonResponse({'detail': 'holidayIds must be a list.'}, status=400)
	holiday_ids = [str(item or '').strip() for item in holiday_ids_value if str(item or '').strip()]
	if len(holiday_ids) != len(set(holiday_ids)):
		return JsonResponse({'detail': 'holidayIds contains duplicate ids.'}, status=400)
	ksb_profile_id = normalize_nullable_int(payload.get('ksbProfileId', None))
	blocks_value = payload.get('blocks')
	if not isinstance(blocks_value, list) or not blocks_value:
		return JsonResponse({'detail': 'blocks must be a non-empty list.'}, status=400)
	allow_block_membership_changes = bool(payload.get('allowBlockMembershipChanges'))
	block_payload_by_id = {}
	new_block_payloads = []
	for index, block in enumerate(blocks_value):
		if not isinstance(block, dict):
			return JsonResponse({'detail': 'blocks must contain objects.'}, status=400)
		row_id = normalize_nullable_int(block.get('trainingPlanId'))
		if row_id is None and not allow_block_membership_changes:
			return JsonResponse({'detail': 'Cohort edit block is missing a Training Plan row id.'}, status=400)
		if row_id in block_payload_by_id:
			return JsonResponse({'detail': 'Cohort edit contains duplicate Training Plan row ids.'}, status=400)
		module_color = str(block.get('moduleColor') or '').strip()
		if module_color:
			try:
				module_color = normalize_training_plan_color(module_color)
			except ValueError as exc:
				return JsonResponse({'detail': f'blocks[{index}].moduleColor {str(exc)}'}, status=400)
		start_date = str(block.get('startDate') or '').strip()
		if start_date and parse_date(start_date) is None:
			return JsonResponse({'detail': f'blocks[{index}].startDate must be a valid YYYY-MM-DD date.'}, status=400)
		end_date = str(block.get('endDate') or '').strip()
		if end_date and parse_date(end_date) is None:
			return JsonResponse({'detail': f'blocks[{index}].endDate must be a valid YYYY-MM-DD date.'}, status=400)
		if start_date and end_date and end_date < start_date:
			return JsonResponse({'detail': f'blocks[{index}].endDate cannot be before startDate.'}, status=400)
		sessions_number = str(block.get('sessionsNumber') or '').strip()
		if sessions_number:
			try:
				if int(sessions_number) < 1:
					return JsonResponse({'detail': f'blocks[{index}].sessionsNumber must be at least 1.'}, status=400)
			except (TypeError, ValueError):
				return JsonResponse({'detail': f'blocks[{index}].sessionsNumber must be a number.'}, status=400)
		tutor_profile_id = normalize_nullable_int(block.get('tutorProfileId', None))
		tutor_name = str(block.get('tutorName') or '').strip()
		if tutor_profile_id is not None:
			try:
				tutor_profile = TutorProfile.objects.get(pk=tutor_profile_id, is_active=True)
			except TutorProfile.DoesNotExist:
				return JsonResponse({'detail': f'blocks[{index}].tutorProfileId references an unknown active tutor profile.'}, status=400)
			tutor_name = tutor_profile.name
		block_payload = {
			'groupId': str(block.get('groupId') or '').strip(),
			'blockId': str(block.get('blockId') or '').strip(),
			'groupName': str(block.get('groupName') or '').strip(),
			'coachName': str(block.get('coachName') or '').strip(),
			'moduleName': str(block.get('moduleName') or '').strip(),
			'moduleColor': module_color,
			'tutorName': tutor_name,
			'tutorProfileId': tutor_profile_id,
			'startDate': start_date,
			'endDate': end_date,
			'sessionsNumber': sessions_number,
			'sessionWeekDayProvided': 'sessionWeekDay' in block,
			'sessionWeekDay': str(block.get('sessionWeekDay') or '').strip(),
			'sessionStartTime': str(block.get('sessionStartTime') or '').strip(),
			'sessionEndTime': str(block.get('sessionEndTime') or '').strip(),
			'sessionKsbMappings': block.get('sessionKsbMappings') if 'sessionKsbMappings' in block else None,
			'sessionCoverage': block.get('sessionCoverage') if 'sessionCoverage' in block else None,
			'notes': str(block.get('notes') or '').strip() if 'notes' in block else None,
		}
		if not block_payload['groupId'] or not block_payload['blockId']:
			return JsonResponse({'detail': f'blocks[{index}] is missing groupId or blockId.'}, status=400)
		if row_id is None:
			if not block_payload['moduleName']:
				return JsonResponse({'detail': f'blocks[{index}].moduleName is required for new modules.'}, status=400)
			if not block_payload['startDate']:
				return JsonResponse({'detail': f'blocks[{index}].startDate is required for new modules.'}, status=400)
			if not block_payload['endDate']:
				return JsonResponse({'detail': f'blocks[{index}].endDate is required for new modules.'}, status=400)
			if not block_payload['sessionsNumber']:
				return JsonResponse({'detail': f'blocks[{index}].sessionsNumber is required for new modules.'}, status=400)
			new_block_payloads.append(block_payload)
		else:
			block_payload_by_id[row_id] = block_payload

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		scope_rows = [
			row for row in rows
			if training_plan_row_identity(row)['programmeId'] == programme_id
			and training_plan_row_identity(row)['cohortId'] == target_cohort_id
		]
		if not scope_rows:
			if target_cohort_id.startswith('db-row-') or target_cohort_id.startswith('row-'):
				return JsonResponse({'detail': 'A stable cohort id is required.'}, status=400)
			return JsonResponse({'detail': 'Training Plan cohort edit scope not found.'}, status=404)
		scope_ids = {int(row.id) for row in scope_rows}
		submitted_ids = set(block_payload_by_id.keys())
		all_active_ids = {int(row.id) for row in rows}
		unknown_ids = sorted(submitted_ids - all_active_ids)
		if unknown_ids:
			return JsonResponse({'detail': 'Cohort edit contains unknown Training Plan row ids.', 'unknownIds': unknown_ids}, status=400)
		cross_scope_ids = sorted(submitted_ids - scope_ids)
		if cross_scope_ids:
			return JsonResponse({'detail': 'Cohort edit contains row ids outside the requested cohort scope.', 'crossScopeIds': cross_scope_ids}, status=400)
		missing_ids = sorted(scope_ids - submitted_ids)
		if missing_ids and not allow_block_membership_changes:
			return JsonResponse({'detail': 'Cohort edit is missing rows from the requested cohort scope.', 'missingIds': missing_ids}, status=400)

		missing_id_set = set(missing_ids)
		before = [
			{
				'id': row.id,
				'cohortName': row.cohort_name,
				'startingDateLabel': row.starting_date_lable,
				'moduleName': row.module_name,
				'groupName': row.group_name,
				'coachName': row.coach_name,
				'tutorName': row.tutor_name,
				'startDate': row.start_date,
				'endDate': row.end_date,
				'sessionsNumber': row.sessions_number,
				'ksbProfileId': row.ksb_profile_id,
				'cohortDisplayOrder': row.cohort_display_order,
			}
			for row in scope_rows
		]
		for row in scope_rows:
			if int(row.id) in missing_id_set:
				row.is_archived = True
				row.archived_at = timezone.now()
				row.archived_by = _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name')
				row.archive_reason = 'Module removed from cohort editor'
				row.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])
				continue
			block_payload = block_payload_by_id[int(row.id)]
			update_fields = ['cohort_name', 'starting_date_lable', 'group_name', 'coach_name', 'ksb_profile_id', 'notes']
			row.cohort_name = cohort_name
			row.starting_date_lable = starting_date_label
			row.group_name = block_payload['groupName']
			row.coach_name = block_payload['coachName']
			row.ksb_profile_id = ksb_profile_id
			if block_payload['moduleName']:
				row.module_name = block_payload['moduleName']
				update_fields.append('module_name')
			if block_payload['tutorName'] or block_payload['tutorProfileId'] is not None:
				row.tutor_name = block_payload['tutorName']
				row.tutor_profile_id = block_payload['tutorProfileId']
				update_fields.extend(['tutor_name', 'tutor_profile_id'])
			if block_payload['startDate']:
				row.start_date = block_payload['startDate']
				update_fields.append('start_date')
			if block_payload['endDate']:
				row.end_date = block_payload['endDate']
				update_fields.append('end_date')
			if block_payload['sessionsNumber']:
				row.sessions_number = block_payload['sessionsNumber']
				update_fields.append('sessions_number')
			if block_payload['sessionWeekDayProvided']:
				row.session_week_day = block_payload['sessionWeekDay']
				update_fields.append('session_week_day')
			if block_payload['sessionStartTime']:
				row.session_start_time = block_payload['sessionStartTime']
				update_fields.append('session_start_time')
			if block_payload['sessionEndTime']:
				row.session_end_time = block_payload['sessionEndTime']
				update_fields.append('session_end_time')
			if block_payload['sessionKsbMappings'] is not None:
				row.session_ksb_json = json.dumps(normalize_session_ksb_mappings(block_payload['sessionKsbMappings']), ensure_ascii=False)
				update_fields.append('session_ksb_json')
			if block_payload['sessionCoverage'] is not None:
				row.session_coverage_json = json.dumps(normalize_session_coverage(block_payload['sessionCoverage']), ensure_ascii=False)
				update_fields.append('session_coverage_json')
			marker_values = {
				TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX: programme_id,
				TRAINING_PLAN_COHORT_ID_MARKER_PREFIX: target_cohort_id,
				'__group_id:': block_payload['groupId'],
				'__block_id:': block_payload['blockId'],
				'__holiday_ids:': '|'.join(holiday_ids),
				'__cohort_color:': cohort_color,
				'__cohort_end_date:': cohort_end_date,
				'__group_name:': block_payload['groupName'],
				'__coach_name:': block_payload['coachName'],
			}
			if block_payload['moduleColor']:
				marker_values[TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX] = block_payload['moduleColor']
			row.notes = set_training_plan_metadata_markers(block_payload['notes'] if block_payload['notes'] is not None else row.notes, marker_values)
			row.save(update_fields=sorted(set(update_fields)))
		created_rows = []
		for block_payload in new_block_payloads:
			module_color = block_payload['moduleColor']
			values = {
				'cohort_name': cohort_name,
				'program': scope_rows[0].program,
				'starting_date_lable': starting_date_label,
				'module_name': block_payload['moduleName'],
				'group_name': block_payload['groupName'],
				'coach_name': block_payload['coachName'],
				'tutor_name': block_payload['tutorName'],
				'tutor_profile_id': block_payload['tutorProfileId'],
				'start_date': block_payload['startDate'],
				'end_date': block_payload['endDate'],
				'sessions_number': block_payload['sessionsNumber'],
				'session_week_day': block_payload['sessionWeekDay'],
				'session_start_time': block_payload['sessionStartTime'],
				'session_end_time': block_payload['sessionEndTime'],
				'session_ksb_json': json.dumps(normalize_session_ksb_mappings(block_payload['sessionKsbMappings'] or []), ensure_ascii=False),
				'session_coverage_json': json.dumps(normalize_session_coverage(block_payload['sessionCoverage'] or []), ensure_ascii=False),
				'ksb_profile_id': ksb_profile_id,
				'programme_display_order': scope_rows[0].programme_display_order,
				'cohort_display_order': scope_rows[0].cohort_display_order,
				'notes': set_training_plan_metadata_markers(block_payload['notes'] or '', {
					TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX: programme_id,
					TRAINING_PLAN_COHORT_ID_MARKER_PREFIX: target_cohort_id,
					'__group_id:': block_payload['groupId'],
					'__block_id:': block_payload['blockId'],
					'__holiday_ids:': '|'.join(holiday_ids),
					'__cohort_color:': cohort_color,
					TRAINING_PLAN_MODULE_COLOR_MARKER_PREFIX: module_color,
					'__cohort_end_date:': cohort_end_date,
					'__group_name:': block_payload['groupName'],
					'__coach_name:': block_payload['coachName'],
				}),
			}
			created_rows.append(TrainingPlan.objects.create(**values))
		after = [
			{
				'id': row.id,
				'cohortName': row.cohort_name,
				'startingDateLabel': row.starting_date_lable,
				'moduleName': row.module_name,
				'groupName': row.group_name,
				'coachName': row.coach_name,
				'tutorName': row.tutor_name,
				'startDate': row.start_date,
				'endDate': row.end_date,
				'sessionsNumber': row.sessions_number,
				'isArchived': row.is_archived,
				'ksbProfileId': row.ksb_profile_id,
				'cohortDisplayOrder': row.cohort_display_order,
			}
			for row in scope_rows
		]
		metadata = {
			'partialUpdate': True,
			'section': 'cohort-edit',
			'changedFields': ['cohortName', 'startingDateLabel', 'groupName', 'coachName', 'ksbProfileId', 'notesMetadata'],
			'programmeId': programme_id,
			'cohortId': target_cohort_id,
			'updatedCount': len(scope_rows) - len(missing_ids),
			'createdCount': len(created_rows),
			'archivedCount': len(missing_ids),
			'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
			'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
		}
		logger.info('cohort_edit_partial_update %s', json.dumps(metadata, sort_keys=True))
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_label='COHORT_EDIT_PARTIAL_UPDATE',
			before={'rows': before, 'version': locked_version},
			after={'rows': after, 'createdRows': [serialize_training_plan(row) for row in created_rows], 'programmeId': programme_id, 'cohortId': target_cohort_id},
			metadata=metadata,
		)

	return JsonResponse(training_plan_order_response({
		'cohort_id': target_cohort_id,
		'updated_count': len(scope_rows) - len(missing_ids),
		'created_count': len(created_rows),
		'archived_count': len(missing_ids),
		'programmeId': programme_id,
	}))


@csrf_exempt
def training_plan_create_cohort(request):
	if request.method != 'POST':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeId', 'cohortId', 'rows'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	if any(key in payload for key in ('items', 'linkedRows', 'trainingPlanIds', 'archiveReason', 'restore', 'blocks')):
		return JsonResponse({'detail': 'Cohort add payload must not include full-save, existing-row, archive, or restore fields.'}, status=400)

	validated, validation_error = validate_training_plan_cohort_create_payload(payload)
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	submitted_version = str(payload.get('version', '') or '').strip()
	if submitted_version and submitted_version != current_version:
		active_rows = list(TrainingPlan.objects.filter(active_training_plan_filter()).order_by('id'))
		duplicate_rows = [
			row for row in active_rows
			if training_plan_row_identity(row)['programmeId'] == validated['programmeId']
			and training_plan_row_identity(row)['cohortId'] == validated['cohortId']
		]
		if duplicate_rows and training_plan_rows_match_values_by_identity(duplicate_rows, validated['rows']):
			identifiers = {
				'programmeId': validated['programmeId'],
				'cohortId': validated['cohortId'],
				'rowCount': len(validated['rows']),
				'blockIds': [item['blockId'] for item in validated['rows']],
			}
			logger.info(
				'cohort_add_scoped_create %s',
				json.dumps({
					'action': 'cohort_add_scoped_create',
					'identifiers': identifiers,
					'createdCount': 0,
					'skippedCount': len(duplicate_rows),
					'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
					'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
				}, sort_keys=True),
			)
			return JsonResponse(training_plan_order_response({
				'created_count': 0,
				'skipped_count': len(duplicate_rows),
				'created_ids': [],
				'skipped_ids': [int(row.id) for row in duplicate_rows],
				'identifiers': identifiers,
				'createdRows': [],
			}))
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		if not training_plan_programme_scope_exists(validated['programmeId'], rows):
			return JsonResponse({'detail': 'Training Plan programme scope not found for cohort add.'}, status=404)
		scope_rows = [
			row for row in rows
			if training_plan_row_identity(row)['programmeId'] == validated['programmeId']
			and training_plan_row_identity(row)['cohortId'] == validated['cohortId']
		]
		identifiers = {
			'programmeId': validated['programmeId'],
			'cohortId': validated['cohortId'],
			'rowCount': len(validated['rows']),
			'blockIds': [item['blockId'] for item in validated['rows']],
		}
		created_rows = []
		skipped_rows = []
		if scope_rows:
			if not training_plan_rows_match_values_by_identity(scope_rows, validated['rows']):
				return JsonResponse({'detail': 'A Training Plan cohort already exists for this identity with different values.'}, status=400)
			skipped_rows = scope_rows
		else:
			created_rows = [
				TrainingPlan.objects.create(**item['values'])
				for item in validated['rows']
			]

		logger.info(
			'cohort_add_scoped_create %s',
			json.dumps({
				'action': 'cohort_add_scoped_create',
				'identifiers': identifiers,
				'createdCount': len(created_rows),
				'skippedCount': len(skipped_rows),
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
				'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
			}, sort_keys=True),
		)
		_audit_log(
			request,
			action='create',
			entity='TrainingPlan',
			object_label='COHORT_ADD_SCOPED_CREATE',
			before=None,
			after={'rows': [serialize_training_plan(row) for row in created_rows], 'identifiers': identifiers},
			metadata={
				'partialUpdate': True,
				'section': 'cohort-add',
				'actionName': 'cohort_add_scoped_create',
				'createdCount': len(created_rows),
				'skippedCount': len(skipped_rows),
				'createdIds': [int(row.id) for row in created_rows],
				'skippedIds': [int(row.id) for row in skipped_rows],
				'identifiers': identifiers,
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
				'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
			},
		)

	result = training_plan_order_response({
		'created_count': len(created_rows),
		'skipped_count': len(skipped_rows),
		'created_ids': [int(row.id) for row in created_rows],
		'skipped_ids': [int(row.id) for row in skipped_rows],
		'identifiers': identifiers,
		'createdRows': [serialize_training_plan(row) for row in created_rows],
	})
	return JsonResponse(result, status=201 if created_rows else 200)


@csrf_exempt
def training_plan_archive_cohort(request, cohort_id: str):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeId', 'cohortId', 'trainingPlanIds', 'archiveReason'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	programme_id = str(payload.get('programmeId') or '').strip()
	payload_cohort_id = str(payload.get('cohortId') or '').strip()
	target_cohort_id = str(cohort_id or '').strip()
	if not programme_id:
		return JsonResponse({'detail': 'programmeId is required.'}, status=400)
	if not payload_cohort_id:
		return JsonResponse({'detail': 'cohortId is required.'}, status=400)
	if not target_cohort_id:
		return JsonResponse({'detail': 'cohort id is required.'}, status=400)
	if payload_cohort_id != target_cohort_id:
		return JsonResponse({'detail': 'cohortId must match the archive URL cohort id.'}, status=400)
	row_ids, validation_error = validate_training_plan_row_ids(payload, 'trainingPlanIds', 'Cohort')
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		scope_rows = [
			row for row in rows
			if training_plan_row_identity(row)['programmeId'] == programme_id
			and training_plan_row_identity(row)['cohortId'] == target_cohort_id
		]
		if not scope_rows:
			if target_cohort_id.startswith('db-row-') or target_cohort_id.startswith('row-'):
				return JsonResponse({'detail': 'A stable cohort scope is required for archive.'}, status=400)
			return JsonResponse({'detail': 'Training Plan cohort archive scope not found.'}, status=404)
		scope_ids = {int(row.id) for row in scope_rows}
		submitted_ids = set(row_ids)
		unknown_ids = sorted(submitted_ids - {int(row.id) for row in rows})
		if unknown_ids:
			return JsonResponse({'detail': 'Cohort archive contains unknown Training Plan row ids.', 'unknownIds': unknown_ids}, status=400)
		cross_scope_ids = sorted(submitted_ids - scope_ids)
		if cross_scope_ids:
			return JsonResponse({'detail': 'Cohort archive contains row ids outside the requested cohort scope.', 'crossScopeIds': cross_scope_ids}, status=400)
		missing_ids = sorted(scope_ids - submitted_ids)
		if missing_ids:
			return JsonResponse({'detail': 'Cohort archive is missing rows from the requested cohort scope.', 'missingIds': missing_ids}, status=400)

		before = [serialize_training_plan(row) for row in scope_rows]
		now = timezone.now()
		archived_by = _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name')
		archive_reason = str(payload.get('archiveReason') or 'Cohort archived from Training Plan UI').strip()
		for row in scope_rows:
			row.is_archived = True
			row.archived_at = now
			row.archived_by = archived_by
			row.archive_reason = archive_reason
			row.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])
		after = [serialize_training_plan(row) for row in scope_rows]
		_audit_log(
			request,
			action='archive',
			entity='TrainingPlan',
			object_label='COHORT_ARCHIVE_PARTIAL_UPDATE',
			before={'rows': before, 'version': locked_version},
			after={'rows': after, 'programmeId': programme_id, 'cohortId': target_cohort_id},
			metadata={'partialUpdate': True, 'section': 'cohort-archive', 'changedFields': ['isArchived', 'archivedAt', 'archivedBy', 'archiveReason']},
		)

	return JsonResponse(training_plan_order_response({'archived': len(row_ids), 'programmeId': programme_id, 'cohortId': target_cohort_id}))


@csrf_exempt
def training_plan_archive_module(request):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'moduleName', 'trainingPlanIds', 'archiveReason'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	module_name = str(payload.get('moduleName') or '').strip()
	if not module_name:
		return JsonResponse({'detail': 'moduleName is required.'}, status=400)
	row_ids, validation_error = validate_training_plan_row_ids(payload, 'trainingPlanIds', 'Module')
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		scope_rows = [row for row in rows if str(row.module_name or '').strip() == module_name]
		if not scope_rows:
			return JsonResponse({'detail': 'Training Plan module archive scope not found.'}, status=404)
		scope_ids = {int(row.id) for row in scope_rows}
		submitted_ids = set(row_ids)
		unknown_ids = sorted(submitted_ids - {int(row.id) for row in rows})
		if unknown_ids:
			return JsonResponse({'detail': 'Module archive contains unknown Training Plan row ids.', 'unknownIds': unknown_ids}, status=400)
		cross_scope_ids = sorted(submitted_ids - scope_ids)
		if cross_scope_ids:
			return JsonResponse({'detail': 'Module archive contains row ids outside the requested module scope.', 'crossScopeIds': cross_scope_ids}, status=400)
		missing_ids = sorted(scope_ids - submitted_ids)
		if missing_ids:
			return JsonResponse({'detail': 'Module archive is missing rows from the requested module scope.', 'missingIds': missing_ids}, status=400)

		before = [serialize_training_plan(row) for row in scope_rows]
		now = timezone.now()
		archived_by = _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name')
		archive_reason = str(payload.get('archiveReason') or 'Linked module archived from Training Plan UI').strip()
		for row in scope_rows:
			row.is_archived = True
			row.archived_at = now
			row.archived_by = archived_by
			row.archive_reason = archive_reason
			row.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])
		after = [serialize_training_plan(row) for row in scope_rows]
		_audit_log(
			request,
			action='archive',
			entity='TrainingPlan',
			object_label='MODULE_ARCHIVE_PARTIAL_UPDATE',
			before={'rows': before, 'version': locked_version},
			after={'rows': after, 'moduleName': module_name},
			metadata={'partialUpdate': True, 'section': 'module-archive', 'changedFields': ['isArchived', 'archivedAt', 'archivedBy', 'archiveReason']},
		)

	return JsonResponse(training_plan_order_response({'archived': len(row_ids), 'moduleName': module_name}))


@csrf_exempt
def training_plan_restore_cohort(request, cohort_id: str):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeId'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	programme_id = str(payload.get('programmeId') or '').strip()
	target_cohort_id = str(cohort_id or '').strip()
	if not programme_id:
		return JsonResponse({'detail': 'programmeId is required.'}, status=400)
	if not target_cohort_id:
		return JsonResponse({'detail': 'cohort id is required.'}, status=400)

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = all_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		scope_rows = [
			row for row in rows
			if row.is_archived
			and training_plan_row_identity(row)['programmeId'] == programme_id
			and training_plan_row_identity(row)['cohortId'] == target_cohort_id
		]
		restore_archived_training_plan_rows(scope_rows)
		_audit_log(
			request,
			action='restore',
			entity='TrainingPlan',
			object_label='COHORT_RESTORE_PARTIAL_UPDATE',
			before=None,
			after=None,
			metadata={
				'partialUpdate': True,
				'section': 'cohort-restore',
				'changedFields': ['isArchived', 'archivedAt', 'archivedBy', 'archiveReason'],
				'programmeId': programme_id,
				'cohortId': target_cohort_id,
				'restoredCount': len(scope_rows),
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
			},
		)

	return JsonResponse(training_plan_order_response({'restored_count': len(scope_rows), 'cohort_id': target_cohort_id, 'programmeId': programme_id}))


@csrf_exempt
def training_plan_restore_module(request):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'moduleName', 'trainingPlanIds'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	module_name = str(payload.get('moduleName') or '').strip()
	if not module_name:
		return JsonResponse({'detail': 'moduleName is required.'}, status=400)
	row_ids, validation_error = validate_optional_training_plan_row_ids(payload, 'trainingPlanIds', 'Module')
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = all_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		scope_rows = [
			row for row in rows
			if row.is_archived and str(row.module_name or '').strip() == module_name
		]
		if row_ids:
			submitted_ids = set(row_ids)
			all_ids = {int(row.id) for row in rows}
			archived_ids = {int(row.id) for row in rows if row.is_archived}
			scope_ids = {int(row.id) for row in scope_rows}
			unknown_ids = sorted(submitted_ids - all_ids)
			if unknown_ids:
				return JsonResponse({'detail': 'Module restore contains unknown Training Plan row ids.', 'unknownIds': unknown_ids}, status=400)
			active_ids = sorted(submitted_ids - archived_ids)
			if active_ids:
				return JsonResponse({'detail': 'Module restore contains non-archived Training Plan row ids.', 'activeIds': active_ids}, status=400)
			cross_scope_ids = sorted(submitted_ids - scope_ids)
			if cross_scope_ids:
				return JsonResponse({'detail': 'Module restore contains row ids outside the requested module scope.', 'crossScopeIds': cross_scope_ids}, status=400)
			scope_rows = [row for row in scope_rows if int(row.id) in submitted_ids]

		restore_archived_training_plan_rows(scope_rows)
		_audit_log(
			request,
			action='restore',
			entity='TrainingPlan',
			object_label='MODULE_RESTORE_PARTIAL_UPDATE',
			before=None,
			after=None,
			metadata={
				'partialUpdate': True,
				'section': 'module-restore',
				'changedFields': ['isArchived', 'archivedAt', 'archivedBy', 'archiveReason'],
				'moduleName': module_name,
				'trainingPlanIds': row_ids,
				'restoredCount': len(scope_rows),
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
			},
		)

	return JsonResponse(training_plan_order_response({'restored_count': len(scope_rows), 'moduleName': module_name, 'trainingPlanIds': row_ids}))


@csrf_exempt
def training_plan_session_detail(request, session_id: int):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'startDate', 'endDate', 'sessionStartTime', 'sessionEndTime', 'sessionWeekDay', 'tutorProfileId', 'tutorName', 'notes', 'coachName'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	if not TrainingPlan.objects.filter(pk=session_id).exists():
		return JsonResponse({'detail': 'Training Plan session not found.'}, status=404)

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		try:
			row = TrainingPlan.objects.select_for_update().get(pk=session_id)
		except TrainingPlan.DoesNotExist:
			return JsonResponse({'detail': 'Training Plan session not found.'}, status=404)

		locked_items = training_plan_items_snapshot()
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		before = serialize_training_plan(row)
		update_fields = []

		if 'startDate' in payload:
			start_date = str(payload.get('startDate') or '').strip()
			if parse_date(start_date) is None:
				return JsonResponse({'detail': 'startDate must be a valid YYYY-MM-DD date.'}, status=400)
			row.start_date = start_date
			update_fields.append('start_date')
		if 'endDate' in payload:
			end_date = str(payload.get('endDate') or '').strip()
			if parse_date(end_date) is None:
				return JsonResponse({'detail': 'endDate must be a valid YYYY-MM-DD date.'}, status=400)
			row.end_date = end_date
			update_fields.append('end_date')
		if parse_date(row.start_date) is not None and parse_date(row.end_date) is not None and row.end_date < row.start_date:
			return JsonResponse({'detail': 'endDate cannot be before startDate.'}, status=400)
		if 'sessionStartTime' in payload:
			try:
				row.session_start_time = normalize_time_text(payload.get('sessionStartTime'))
			except ValueError as exc:
				return JsonResponse({'detail': str(exc)}, status=400)
			update_fields.append('session_start_time')
		if 'sessionEndTime' in payload:
			try:
				row.session_end_time = normalize_time_text(payload.get('sessionEndTime'))
			except ValueError as exc:
				return JsonResponse({'detail': str(exc)}, status=400)
			update_fields.append('session_end_time')
		if 'sessionWeekDay' in payload:
			session_week_day = str(payload.get('sessionWeekDay') or '').strip().lower()
			valid_days = {'saturday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'}
			parts = [part.strip() for part in session_week_day.split(',') if part.strip()]
			if any(part not in valid_days for part in parts):
				return JsonResponse({'detail': 'sessionWeekDay contains an unsupported day.'}, status=400)
			row.session_week_day = ', '.join(parts)
			update_fields.append('session_week_day')
		if 'tutorProfileId' in payload:
			profile_id, profile, tutor_error = validate_tutor_profile_id(payload.get('tutorProfileId'), 'tutorProfileId')
			if tutor_error:
				return JsonResponse({'detail': tutor_error}, status=400)
			row.tutor_profile_id = profile_id
			row.tutor_name = profile.name if profile is not None else str(payload.get('tutorName') or '').strip()
			update_fields.extend(['tutor_profile_id', 'tutor_name'])
		elif 'tutorName' in payload:
			row.tutor_name = str(payload.get('tutorName') or '').strip()
			update_fields.append('tutor_name')
		if 'notes' in payload:
			row.notes = update_training_plan_visible_notes(row.notes, payload.get('notes'))
			update_fields.append('notes')
		if 'coachName' in payload:
			row.coach_name = str(payload.get('coachName') or '').strip()
			update_fields.append('coach_name')

		if update_fields:
			row.save(update_fields=sorted(set(update_fields)))

		row.refresh_from_db()
		after = serialize_training_plan(row)
		changed_fields = [field for field in after if before.get(field) != after.get(field)]
		schedule_fields = {'startDate', 'endDate', 'sessionStartTime', 'sessionEndTime', 'sessionWeekDay', 'tutorName', 'tutorProfileId', 'coachName'}
		assignment_fields = {'tutorName', 'tutorProfileId', 'coachName'}
		audit_label = f'SESSION_NOTES_PARTIAL_UPDATE session {row.id}' if changed_fields == ['notes'] else (
			f'SESSION_ASSIGNMENT_PARTIAL_UPDATE session {row.id}' if changed_fields and set(changed_fields).issubset(assignment_fields) else (
				f'SESSION_SCHEDULE_PARTIAL_UPDATE session {row.id}' if any(field in schedule_fields for field in changed_fields) else f'Session updated: {row.id}'
			)
		)
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_id=row.id,
			object_label=audit_label,
			before={field: before.get(field) for field in changed_fields},
			after={field: after.get(field) for field in changed_fields},
			metadata={'changedFields': changed_fields, 'partialUpdate': True},
		)

	return JsonResponse(training_plan_partial_response(row))


@csrf_exempt
def training_plan_module_detail(request, module_id: int):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'moduleName', 'tutorProfileId', 'tutorName', 'notes', 'color'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	if not TrainingPlan.objects.filter(pk=module_id).exists():
		return JsonResponse({'detail': 'Training Plan module not found.'}, status=404)

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		try:
			row = TrainingPlan.objects.select_for_update().get(pk=module_id)
		except TrainingPlan.DoesNotExist:
			return JsonResponse({'detail': 'Training Plan module not found.'}, status=404)

		locked_items = training_plan_items_snapshot()
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		before = serialize_training_plan(row)
		update_fields = []

		if 'moduleName' in payload:
			module_name = str(payload.get('moduleName') or '').strip()
			if not module_name:
				return JsonResponse({'detail': 'moduleName cannot be empty.'}, status=400)
			row.module_name = module_name
			update_fields.append('module_name')
		if 'tutorProfileId' in payload:
			profile_id, profile, tutor_error = validate_tutor_profile_id(payload.get('tutorProfileId'), 'tutorProfileId')
			if tutor_error:
				return JsonResponse({'detail': tutor_error}, status=400)
			row.tutor_profile_id = profile_id
			row.tutor_name = profile.name if profile is not None else str(payload.get('tutorName') or '').strip()
			update_fields.extend(['tutor_profile_id', 'tutor_name'])
		elif 'tutorName' in payload:
			row.tutor_name = str(payload.get('tutorName') or '').strip()
			update_fields.append('tutor_name')
		if 'notes' in payload:
			row.notes = str(payload.get('notes') or '').strip()
			update_fields.append('notes')
		if 'color' in payload:
			try:
				module_color = normalize_training_plan_color(payload.get('color'))
			except ValueError as error:
				return JsonResponse({'detail': str(error)}, status=400)
			row.notes = update_training_plan_module_color_marker(row.notes, module_color)
			update_fields.append('notes')

		if update_fields:
			row.save(update_fields=sorted(set(update_fields)))

		row.refresh_from_db()
		after = serialize_training_plan(row)
		changed_fields = [field for field in after if before.get(field) != after.get(field)]
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_id=row.id,
			object_label=f'MODULE_PARTIAL_UPDATE module {row.id}',
			before={field: before.get(field) for field in changed_fields},
			after={field: after.get(field) for field in changed_fields},
			metadata={'changedFields': changed_fields, 'partialUpdate': True, 'section': 'module'},
		)

	return JsonResponse(training_plan_partial_response(row))


@csrf_exempt
def training_plan_linked_module_rows(request):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'previousModuleName', 'moduleName', 'moduleCatalogueId', 'linkedRows'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	previous_module_name = str(payload.get('previousModuleName') or '').strip()
	module_name = str(payload.get('moduleName') or '').strip()
	module_catalogue_id = str(payload.get('moduleCatalogueId') or '').strip()
	if not previous_module_name:
		return JsonResponse({'detail': 'previousModuleName is required.'}, status=400)
	if not module_name:
		return JsonResponse({'detail': 'moduleName cannot be empty.'}, status=400)
	if not module_catalogue_id:
		return JsonResponse({'detail': 'moduleCatalogueId is required.'}, status=400)
	linked_rows, validation_error = validate_training_plan_linked_module_rows(payload)
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		rows_by_id = {int(row.id): row for row in rows}
		submitted_ids = {item['trainingPlanId'] for item in linked_rows}
		unknown_ids = sorted(submitted_ids - set(rows_by_id.keys()))
		if unknown_ids:
			return JsonResponse({'detail': 'Linked module update contains unknown or archived Training Plan row ids.', 'unknownIds': unknown_ids}, status=400)

		cross_scope_ids = []
		for item in linked_rows:
			row = rows_by_id[item['trainingPlanId']]
			identity = training_plan_row_identity(row)
			row_block_id = training_plan_marker_value(row.notes, '__block_id:')
			row_group_id = training_plan_marker_value(row.notes, '__group_id:')
			if (
				str(row.module_name or '').strip() != previous_module_name
				or identity['programmeId'] != item['programmeId']
				or identity['cohortId'] != item['cohortId']
				or row_block_id != item['blockId']
				or (item['groupId'] and row_group_id != item['groupId'])
			):
				cross_scope_ids.append(item['trainingPlanId'])
				continue

		if cross_scope_ids:
			return JsonResponse({'detail': 'Linked module update contains row ids outside the requested module scope.', 'crossScopeIds': sorted(cross_scope_ids)}, status=400)

		update_rows = [rows_by_id[item['trainingPlanId']] for item in linked_rows]
		before = [serialize_training_plan(row) for row in update_rows]
		for row in update_rows:
			row.module_name = module_name
			row.save(update_fields=['module_name'])
			row.refresh_from_db()
		updated_rows = update_rows
		after = [serialize_training_plan(row) for row in updated_rows]
		identifiers = {
			'moduleCatalogueId': module_catalogue_id,
			'previousModuleName': previous_module_name,
			'moduleName': module_name,
			'linkedRows': linked_rows,
		}
		logger.info(
			'module_edit_linked_timeline_rows_partial_update %s',
			json.dumps({
				'action': 'module_edit_linked_timeline_rows_partial_update',
				'identifiers': identifiers,
				'updatedCount': len(updated_rows),
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
				'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
			}, sort_keys=True),
		)
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_label='MODULE_LINKED_ROWS_PARTIAL_UPDATE',
			before={'rows': before, 'version': locked_version},
			after={'rows': after, 'identifiers': identifiers},
			metadata={
				'partialUpdate': True,
				'section': 'module-linked-rows',
				'actionName': 'module_edit_linked_timeline_rows_partial_update',
				'changedFields': ['moduleName'],
				'identifiers': identifiers,
				'updatedCount': len(updated_rows),
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
				'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
			},
		)

	response = training_plan_order_response({
		'updated_count': len(updated_rows),
		'identifiers': identifiers,
		'moduleName': module_name,
		'previousModuleName': previous_module_name,
		'moduleCatalogueId': module_catalogue_id,
	})
	return JsonResponse(response)


@csrf_exempt
def training_plan_linked_programme_rows(request, programme_id: str):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeId', 'program', 'trainingPlanIds'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	target_programme_id = str(programme_id or '').strip()
	training_plan_ids, program_label, validation_error = validate_training_plan_programme_linked_rows(payload, target_programme_id)
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		rows_by_id = {int(row.id): row for row in rows}
		submitted_ids = set(training_plan_ids)
		unknown_ids = sorted(submitted_ids - set(rows_by_id.keys()))
		if unknown_ids:
			return JsonResponse({'detail': 'Programme linked-row update contains unknown or archived Training Plan row ids.', 'unknownIds': unknown_ids}, status=400)

		scope_rows = []
		unsafe_marker_ids = []
		for row in rows:
			marker_programme_id = training_plan_marker_value(row.notes, TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX)
			if marker_programme_id == target_programme_id:
				scope_rows.append(row)
			elif training_plan_row_identity(row)['programmeId'] == target_programme_id:
				unsafe_marker_ids.append(int(row.id))
		if unsafe_marker_ids:
			return JsonResponse({'detail': 'Programme linked-row update scope has missing or inconsistent programme markers.', 'unsafeRowIds': sorted(unsafe_marker_ids)}, status=400)
		if not scope_rows:
			return JsonResponse({'detail': 'Training Plan programme linked-row scope not found.'}, status=404)

		scope_ids = {int(row.id) for row in scope_rows}
		cross_scope_ids = sorted(submitted_ids - scope_ids)
		if cross_scope_ids:
			return JsonResponse({'detail': 'Programme linked-row update contains row ids outside the requested programme scope.', 'crossScopeIds': cross_scope_ids}, status=400)
		missing_ids = sorted(scope_ids - submitted_ids)
		if missing_ids:
			return JsonResponse({'detail': 'Programme linked-row update is missing rows from the requested programme scope.', 'missingIds': missing_ids}, status=400)

		before = [{'id': row.id, 'program': row.program, 'notes': row.notes} for row in scope_rows]
		for row in scope_rows:
			row.program = program_label
			row.notes = set_training_plan_metadata_markers(row.notes, {
				TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX: target_programme_id,
			})
			row.save(update_fields=['program', 'notes'])
			row.refresh_from_db()
		after = [{'id': row.id, 'program': row.program, 'notes': row.notes} for row in scope_rows]
		identifiers = {
			'programmeId': target_programme_id,
			'trainingPlanIds': training_plan_ids,
			'programmeMarker': f'{TRAINING_PLAN_PROGRAM_ID_MARKER_PREFIX}{target_programme_id}',
		}
		changed_fields = ['program', 'notesMetadata.programmeId']
		metadata = {
			'partialUpdate': True,
			'section': 'programme-linked-rows',
			'actionName': 'programme_edit_linked_timeline_rows_partial_update',
			'programmeId': target_programme_id,
			'changedFields': changed_fields,
			'updatedCount': len(scope_rows),
			'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
			'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
		}
		logger.info('programme_edit_linked_timeline_rows_partial_update %s', json.dumps(metadata, sort_keys=True))
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_label='PROGRAMME_LINKED_ROWS_PARTIAL_UPDATE',
			before={'rows': before, 'version': locked_version},
			after={'rows': after, 'identifiers': identifiers},
			metadata=metadata,
		)

	response = training_plan_order_response({
		'programme_id': target_programme_id,
		'updated_count': len(scope_rows),
		'identifiers': identifiers,
		'allowedFieldsUpdated': changed_fields,
	})
	return JsonResponse(response)


@csrf_exempt
def training_plan_add_module_for_tutor(request):
	if request.method != 'POST':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'programmeId', 'cohortId', 'groupId', 'blockId', 'moduleCatalogueId', 'moduleStableId', 'tutorProfileId', 'row'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)
	if any(key in payload for key in ('items', 'linkedRows', 'trainingPlanIds', 'archiveReason', 'restore')):
		return JsonResponse({'detail': 'Module add payload must not include full-save or archive/restore fields.'}, status=400)

	validated, validation_error = validate_training_plan_add_for_tutor_payload(payload)
	if validation_error is not None:
		return validation_error

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	submitted_version = str(payload.get('version', '') or '').strip()
	if submitted_version and submitted_version != current_version:
		active_rows = list(TrainingPlan.objects.filter(active_training_plan_filter()).order_by('id'))
		duplicate_rows = find_module_add_for_tutor_duplicates(active_rows, validated)
		if len(duplicate_rows) == 1 and training_plan_row_matches_values(duplicate_rows[0], validated['values']):
			identifiers = {
				'programmeId': validated['programmeId'],
				'cohortId': validated['cohortId'],
				'groupId': validated['groupId'],
				'blockId': validated['blockId'],
				'moduleIdentity': validated['moduleIdentity'],
				'tutorProfileId': validated['tutorProfileId'],
			}
			logger.info(
				'module_add_for_tutor_scoped_create %s',
				json.dumps({
					'action': 'module_add_for_tutor_scoped_create',
					'identifiers': identifiers,
					'createdCount': 0,
					'skippedCount': 1,
					'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
					'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
				}, sort_keys=True),
			)
			return JsonResponse(training_plan_order_response({
				'created_count': 0,
				'skipped_count': 1,
				'created_ids': [],
				'skipped_ids': [int(duplicate_rows[0].id)],
				'identifiers': identifiers,
				'createdRows': [],
			}))
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		rows = current_training_plan_rows_for_update()
		locked_items = [serialize_training_plan(item) for item in training_plan_queryset()]
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		scope_rows = [
			row for row in rows
			if training_plan_row_identity(row)['programmeId'] == validated['programmeId']
			and training_plan_row_identity(row)['cohortId'] == validated['cohortId']
		]
		if not scope_rows:
			return JsonResponse({'detail': 'Training Plan cohort scope not found for module add.'}, status=404)

		duplicate_rows = find_module_add_for_tutor_duplicates(rows, validated)
		if len(duplicate_rows) > 1:
			return JsonResponse({'detail': 'Existing Training Plan rows contain ambiguous duplicate module add identifiers.'}, status=400)

		created_rows = []
		skipped_rows = []
		if duplicate_rows:
			duplicate = duplicate_rows[0]
			if not training_plan_row_matches_values(duplicate, validated['values']):
				return JsonResponse({'detail': 'A Training Plan row already exists for this module add identity with different values.'}, status=400)
			skipped_rows.append(duplicate)
		else:
			created_rows.append(TrainingPlan.objects.create(**validated['values']))

		identifiers = {
			'programmeId': validated['programmeId'],
			'cohortId': validated['cohortId'],
			'groupId': validated['groupId'],
			'blockId': validated['blockId'],
			'moduleIdentity': validated['moduleIdentity'],
			'tutorProfileId': validated['tutorProfileId'],
		}
		logger.info(
			'module_add_for_tutor_scoped_create %s',
			json.dumps({
				'action': 'module_add_for_tutor_scoped_create',
				'identifiers': identifiers,
				'createdCount': len(created_rows),
				'skippedCount': len(skipped_rows),
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
				'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
			}, sort_keys=True),
		)
		_audit_log(
			request,
			action='create',
			entity='TrainingPlan',
			object_label='MODULE_ADD_FOR_TUTOR_SCOPED_CREATE',
			before=None,
			after={'rows': [serialize_training_plan(row) for row in created_rows], 'identifiers': identifiers},
			metadata={
				'partialUpdate': True,
				'section': 'module-add-for-tutor',
				'actionName': 'module_add_for_tutor_scoped_create',
				'createdCount': len(created_rows),
				'skippedCount': len(skipped_rows),
				'createdIds': [int(row.id) for row in created_rows],
				'skippedIds': [int(row.id) for row in skipped_rows],
				'identifiers': identifiers,
				'requestUser': _header_text(request, 'X-KBC-User-Email') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-Display-Name'),
				'source': _header_text(request, 'X-KBC-Training-Plan-Save-Source'),
			},
		)

	result = training_plan_order_response({
		'created_count': len(created_rows),
		'skipped_count': len(skipped_rows),
		'created_ids': [int(row.id) for row in created_rows],
		'skipped_ids': [int(row.id) for row in skipped_rows],
		'identifiers': identifiers,
		'createdRows': [serialize_training_plan(row) for row in created_rows],
	})
	return JsonResponse(result, status=201 if created_rows else 200)


@csrf_exempt
def training_plan_session_coverage(request, session_id: int):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'sessionNumber', 'assignedTutorProfileId', 'coverageTutorProfileId', 'coverageCoachProfileId', 'coverageStatus', 'tutorUnavailable', 'tutorUnavailableReason', 'tutorUnavailableNotes', 'coverageReason', 'coverageNotes'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

	try:
		session_number = int(payload.get('sessionNumber') or 0)
	except (TypeError, ValueError):
		session_number = 0
	if session_number < 1:
		return JsonResponse({'detail': 'sessionNumber must be a positive integer.'}, status=400)
	if not TrainingPlan.objects.filter(pk=session_id).exists():
		return JsonResponse({'detail': 'Training Plan session not found.'}, status=404)

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		try:
			row = TrainingPlan.objects.select_for_update().get(pk=session_id)
		except TrainingPlan.DoesNotExist:
			return JsonResponse({'detail': 'Training Plan session not found.'}, status=404)

		try:
			total_sessions = int(row.sessions_number or 1)
		except (TypeError, ValueError):
			total_sessions = 1
		if session_number > max(1, total_sessions):
			return JsonResponse({'detail': 'sessionNumber is outside this Training Plan session range.'}, status=400)

		locked_items = training_plan_items_snapshot()
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		assigned_id, _, tutor_error = validate_tutor_profile_id(payload.get('assignedTutorProfileId') or row.tutor_profile_id, 'assignedTutorProfileId')
		if tutor_error:
			return JsonResponse({'detail': tutor_error}, status=400)
		coverage_id, _, coverage_error = validate_tutor_profile_id(payload.get('coverageTutorProfileId'), 'coverageTutorProfileId')
		if coverage_error:
			return JsonResponse({'detail': coverage_error}, status=400)
		coverage_coach_id, _, coverage_coach_error = validate_coach_profile_id(payload.get('coverageCoachProfileId'), 'coverageCoachProfileId')
		if coverage_coach_error:
			return JsonResponse({'detail': coverage_coach_error}, status=400)
		if assigned_id and coverage_id and assigned_id == coverage_id:
			return JsonResponse({'detail': 'coverageTutorProfileId cannot match assignedTutorProfileId.'}, status=400)

		tutor_unavailable = bool(payload.get('tutorUnavailable'))
		coverage_reason = str(payload.get('coverageReason') or '').strip()
		if (coverage_id or coverage_coach_id) and not coverage_reason:
			return JsonResponse({'detail': 'coverageReason is required when coverage is selected.'}, status=400)

		before = serialize_training_plan(row)
		current_coverage = [item for item in normalize_session_coverage(row.session_coverage_json) if item.get('sessionNumber') != session_number]
		next_item = {
			'sessionNumber': session_number,
			'assignedTutorProfileId': str(assigned_id) if assigned_id else '',
			'coverageTutorProfileId': str(coverage_id) if coverage_id else '',
			'coverageCoachProfileId': str(coverage_coach_id) if coverage_coach_id else '',
			'coverageStatus': 'covered' if (coverage_id or coverage_coach_id) else 'required' if tutor_unavailable else 'none',
			'tutorUnavailable': tutor_unavailable,
			'tutorUnavailableReason': str(payload.get('tutorUnavailableReason') or '').strip() if tutor_unavailable else '',
			'tutorUnavailableNotes': str(payload.get('tutorUnavailableNotes') or '').strip() if tutor_unavailable else '',
			'coverageReason': coverage_reason if (coverage_id or coverage_coach_id) else '',
			'coverageNotes': str(payload.get('coverageNotes') or '').strip() if (coverage_id or coverage_coach_id) else '',
		}
		if next_item['coverageStatus'] != 'none' or next_item['tutorUnavailable'] or next_item['coverageTutorProfileId'] or next_item['coverageCoachProfileId']:
			current_coverage.append(next_item)
		current_coverage.sort(key=lambda item: int(item.get('sessionNumber') or 0))
		row.session_coverage_json = json.dumps(normalize_session_coverage(current_coverage), ensure_ascii=False)
		row.save(update_fields=['session_coverage_json'])
		row.refresh_from_db()
		after = serialize_training_plan(row)
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_id=row.id,
			object_label=f'Tutor Coverage updated for session {row.id}',
			before={'sessionCoverage': before.get('sessionCoverage')},
			after={'sessionCoverage': after.get('sessionCoverage')},
			metadata={'partialUpdate': True, 'section': 'coverage', 'sessionNumber': session_number},
		)

	return JsonResponse(training_plan_partial_response(row))


@csrf_exempt
def training_plan_session_ksb(request, session_id: int):
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload, error_response = parse_json_payload(request)
	if error_response is not None:
		return error_response

	allowed_keys = {'version', 'sessionNumber', 'knowledgeCodes', 'skillCodes', 'behaviourCodes'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

	try:
		session_number = int(payload.get('sessionNumber') or 0)
	except (TypeError, ValueError):
		session_number = 0
	if session_number < 1:
		return JsonResponse({'detail': 'sessionNumber must be a positive integer.'}, status=400)
	if not TrainingPlan.objects.filter(pk=session_id).exists():
		return JsonResponse({'detail': 'Training Plan session not found.'}, status=404)

	current_items = training_plan_items_snapshot()
	current_version = training_plan_version(current_items)
	conflict = require_training_plan_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		try:
			row = TrainingPlan.objects.select_for_update().get(pk=session_id)
		except TrainingPlan.DoesNotExist:
			return JsonResponse({'detail': 'Training Plan session not found.'}, status=404)

		try:
			total_sessions = int(row.sessions_number or 1)
		except (TypeError, ValueError):
			total_sessions = 1
		if session_number > max(1, total_sessions):
			return JsonResponse({'detail': 'sessionNumber is outside this Training Plan session range.'}, status=400)

		locked_items = training_plan_items_snapshot()
		locked_version = training_plan_version(locked_items)
		conflict = require_training_plan_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict

		before = serialize_training_plan(row)
		mappings = normalize_session_ksb_mappings(row.session_ksb_json)
		while len(mappings) < total_sessions:
			mappings.append({'knowledgeCodes': [], 'skillCodes': [], 'behaviourCodes': []})
		mappings[session_number - 1] = {
			'knowledgeCodes': normalize_ksb_codes(payload.get('knowledgeCodes', []), 'knowledgeCodes'),
			'skillCodes': normalize_ksb_codes(payload.get('skillCodes', []), 'skillCodes'),
			'behaviourCodes': normalize_ksb_codes(payload.get('behaviourCodes', []), 'behaviourCodes'),
		}
		row.session_ksb_json = json.dumps(normalize_session_ksb_mappings(mappings[:total_sessions]), ensure_ascii=False)
		row.save(update_fields=['session_ksb_json'])
		row.refresh_from_db()
		after = serialize_training_plan(row)
		_audit_log(
			request,
			action='update',
			entity='TrainingPlan',
			object_id=row.id,
			object_label=f'SESSION_KSB_PARTIAL_UPDATE session {row.id}',
			before={'sessionKsbMappings': before.get('sessionKsbMappings')},
			after={'sessionKsbMappings': after.get('sessionKsbMappings')},
			metadata={'partialUpdate': True, 'section': 'ksb', 'sessionNumber': session_number},
		)

	return JsonResponse(training_plan_partial_response(row))


def health(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)
	return JsonResponse({'status': 'ok', 'service': 'communication-centre-backend'})


@csrf_exempt
def tutor_profiles(request):
	if request.method == 'GET':
		include_inactive = str(request.GET.get('includeInactive', '')).lower() in {'1', 'true', 'yes'}
		records = TutorProfile.objects.all() if include_inactive else TutorProfile.objects.filter(is_active=True)
		counts = tutor_profile_session_counts()
		return JsonResponse([serialize_tutor_profile(item, counts) for item in records.order_by('name', 'id')], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		values, error = tutor_profile_values_from_payload(payload)
		if error:
			return JsonResponse({'detail': error}, status=400)

		exact = TutorProfile.objects.filter(normalized_name=values['normalized_name']).first()
		if exact:
			return JsonResponse({
				'detail': 'A tutor profile with this name already exists.',
				'existingProfile': serialize_tutor_profile(exact, tutor_profile_session_counts()),
			}, status=409)

		matches = possible_tutor_profile_matches(values['name'])
		if matches and payload.get('confirmCreateNew') is not True:
			best = matches[0]
			return JsonResponse({
				'detail': f"Possible existing tutor found: {best['profile'].name}. Use existing profile instead?",
				'possibleExistingProfile': serialize_tutor_profile(best['profile'], tutor_profile_session_counts()),
				'score': best['score'],
				'matches': [
					{
						'profile': serialize_tutor_profile(match['profile'], tutor_profile_session_counts()),
						'score': match['score'],
					}
					for match in matches[:5]
				],
			}, status=409)

		record = TutorProfile.objects.create(**values)
		serialized = serialize_tutor_profile(record, tutor_profile_session_counts())
		_audit_log(request, action='create', entity='TutorProfile', object_id=record.id, object_label=record.name, after=serialized)
		return JsonResponse(serialized, status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def tutor_profile_detail(request, profile_id: int):
	try:
		record = TutorProfile.objects.get(pk=profile_id)
	except TutorProfile.DoesNotExist:
		return JsonResponse({'detail': 'Tutor profile not found.'}, status=404)

	if request.method == 'GET':
		return JsonResponse(serialize_tutor_profile(record, tutor_profile_session_counts()))

	if request.method == 'PATCH':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		before = serialize_tutor_profile(record, tutor_profile_session_counts())
		values, error = tutor_profile_values_from_payload({**before, **payload})
		if error:
			return JsonResponse({'detail': error}, status=400)
		exact = TutorProfile.objects.filter(normalized_name=values['normalized_name']).exclude(pk=record.id).first()
		if exact:
			return JsonResponse({
				'detail': 'A tutor profile with this name already exists.',
				'existingProfile': serialize_tutor_profile(exact, tutor_profile_session_counts()),
			}, status=409)
		matches = possible_tutor_profile_matches(values['name'], exclude_id=record.id)
		if matches and payload.get('confirmSave') is not True:
			best = matches[0]
			return JsonResponse({
				'detail': f"Possible existing tutor found: {best['profile'].name}. Use existing profile instead?",
				'possibleExistingProfile': serialize_tutor_profile(best['profile'], tutor_profile_session_counts()),
				'score': best['score'],
			}, status=409)
		for field, value in values.items():
			setattr(record, field, value)
		record.save()
		serialized = serialize_tutor_profile(record, tutor_profile_session_counts())
		_audit_log(request, action='update', entity='TutorProfile', object_id=record.id, object_label=record.name, before=before, after=serialized)
		return JsonResponse(serialized)

	if request.method == 'DELETE':
		before = serialize_tutor_profile(record, tutor_profile_session_counts())
		force_delete = str(request.GET.get('force', '')).strip().lower() in {'1', 'true', 'yes'}
		if force_delete:
			payload, error_response = parse_json_payload(request)
			if error_response is not None:
				return error_response
			if not profile_force_delete_confirmed(request, payload):
				reason = 'Force deleting a tutor profile requires confirmForceDelete=true and the internal profile force-delete header.'
				log_profile_force_delete_attempt(request, label='TUTOR_PROFILE_FORCE_DELETE_ATTEMPTED', profile_id=profile_id, accepted=False, rejection_reason=reason)
				return JsonResponse({'detail': reason}, status=403)
			log_profile_force_delete_attempt(request, label='TUTOR_PROFILE_FORCE_DELETE_ATTEMPTED', profile_id=profile_id, accepted=True)
			with transaction.atomic():
				unlinked_rows = remove_tutor_profile_references(record.id)
				record.delete()
			_audit_log(
				request,
				action='delete',
				entity='TutorProfile',
				object_id=profile_id,
				object_label=before.get('name', ''),
				before=before,
				metadata={'force': True, 'unlinkedRows': unlinked_rows},
			)
			return JsonResponse({'deleted': True, 'force': True, 'unlinkedRows': unlinked_rows})
		with transaction.atomic():
			record = TutorProfile.objects.select_for_update().get(pk=profile_id)
			record.is_active = False
			record.save(update_fields=['is_active', 'updated_at'])
		serialized = serialize_tutor_profile(record, tutor_profile_session_counts())
		_audit_log(request, action='deactivate', entity='TutorProfile', object_id=record.id, object_label=record.name, before=before, after=serialized, metadata={'defaultDelete': True, 'referencesPreserved': True})
		return JsonResponse({'deleted': False, 'deactivated': True, 'item': serialized})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


def tutor_profile_duplicates(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	profiles = list(TutorProfile.objects.filter(is_active=True).order_by('name', 'id'))
	pairs = []
	for index, left in enumerate(profiles):
		for right in profiles[index + 1:]:
			score = tutor_similarity(left.name, right.name)
			if score >= 0.72:
				pairs.append({
					'left': serialize_tutor_profile(left),
					'right': serialize_tutor_profile(right),
					'score': round(score, 3),
					'exact': left.normalized_name == right.normalized_name,
				})
	return JsonResponse({'items': sorted(pairs, key=lambda item: -item['score'])})


@csrf_exempt
def coach_profiles(request):
	if request.method == 'GET':
		include_inactive = str(request.GET.get('includeInactive', '')).lower() in {'1', 'true', 'yes'}
		records = CoachProfile.objects.all() if include_inactive else CoachProfile.objects.filter(is_active=True)
		counts = coach_profile_session_counts()
		return JsonResponse([serialize_coach_profile(item, counts) for item in records.order_by('name', 'id')], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		values, error = coach_profile_values_from_payload(payload)
		if error:
			return JsonResponse({'detail': error}, status=400)

		exact = CoachProfile.objects.filter(normalized_name=values['normalized_name']).first()
		if exact:
			return JsonResponse({'detail': 'A coach profile with this name already exists.', 'existingProfile': serialize_coach_profile(exact, coach_profile_session_counts())}, status=409)

		matches = possible_coach_profile_matches(values['name'])
		if matches and payload.get('confirmCreateNew') is not True:
			best = matches[0]
			return JsonResponse({
				'detail': f"Possible existing coach found: {best['profile'].name}. Use existing profile instead?",
				'possibleExistingProfile': serialize_coach_profile(best['profile'], coach_profile_session_counts()),
				'score': best['score'],
			}, status=409)

		record = CoachProfile.objects.create(**values)
		serialized = serialize_coach_profile(record, coach_profile_session_counts())
		_audit_log(request, action='create', entity='CoachProfile', object_id=record.id, object_label=record.name, after=serialized)
		return JsonResponse(serialized, status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def coach_profile_detail(request, profile_id: int):
	try:
		record = CoachProfile.objects.get(pk=profile_id)
	except CoachProfile.DoesNotExist:
		return JsonResponse({'detail': 'Coach profile not found.'}, status=404)

	if request.method == 'GET':
		return JsonResponse(serialize_coach_profile(record, coach_profile_session_counts()))

	if request.method == 'PATCH':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		before = serialize_coach_profile(record, coach_profile_session_counts())
		values, error = coach_profile_values_from_payload({**before, **payload})
		if error:
			return JsonResponse({'detail': error}, status=400)
		exact = CoachProfile.objects.filter(normalized_name=values['normalized_name']).exclude(pk=record.id).first()
		if exact:
			return JsonResponse({'detail': 'A coach profile with this name already exists.', 'existingProfile': serialize_coach_profile(exact, coach_profile_session_counts())}, status=409)
		matches = possible_coach_profile_matches(values['name'], exclude_id=record.id)
		if matches and payload.get('confirmSave') is not True:
			best = matches[0]
			return JsonResponse({
				'detail': f"Possible existing coach found: {best['profile'].name}. Use existing profile instead?",
				'possibleExistingProfile': serialize_coach_profile(best['profile'], coach_profile_session_counts()),
				'score': best['score'],
			}, status=409)
		for field, value in values.items():
			setattr(record, field, value)
		record.save()
		serialized = serialize_coach_profile(record, coach_profile_session_counts())
		_audit_log(request, action='update', entity='CoachProfile', object_id=record.id, object_label=record.name, before=before, after=serialized)
		return JsonResponse(serialized)

	if request.method == 'DELETE':
		before = serialize_coach_profile(record, coach_profile_session_counts())
		force_delete = str(request.GET.get('force', '')).strip().lower() in {'1', 'true', 'yes'}
		if force_delete:
			payload, error_response = parse_json_payload(request)
			if error_response is not None:
				return error_response
			if not profile_force_delete_confirmed(request, payload):
				reason = 'Force deleting a coach profile requires confirmForceDelete=true and the internal profile force-delete header.'
				log_profile_force_delete_attempt(request, label='COACH_PROFILE_FORCE_DELETE_ATTEMPTED', profile_id=profile_id, accepted=False, rejection_reason=reason)
				return JsonResponse({'detail': reason}, status=403)
			log_profile_force_delete_attempt(request, label='COACH_PROFILE_FORCE_DELETE_ATTEMPTED', profile_id=profile_id, accepted=True)
			with transaction.atomic():
				unlinked_rows = remove_coach_profile_references(record.id)
				record.delete()
			_audit_log(request, action='delete', entity='CoachProfile', object_id=profile_id, object_label=before.get('name', ''), before=before, metadata={'force': True, 'unlinkedRows': unlinked_rows})
			return JsonResponse({'deleted': True, 'force': True, 'unlinkedRows': unlinked_rows})
		with transaction.atomic():
			record = CoachProfile.objects.select_for_update().get(pk=profile_id)
			record.is_active = False
			record.save(update_fields=['is_active', 'updated_at'])
		serialized = serialize_coach_profile(record, coach_profile_session_counts())
		_audit_log(request, action='deactivate', entity='CoachProfile', object_id=record.id, object_label=record.name, before=before, after=serialized, metadata={'defaultDelete': True, 'referencesPreserved': True})
		return JsonResponse({'deleted': False, 'deactivated': True, 'item': serialized})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def ksb_profiles(request):
	if request.method == 'GET':
		include_inactive = str(request.GET.get('includeInactive', '')).lower() in {'1', 'true', 'yes'}
		records = KsbProfile.objects.all() if include_inactive else KsbProfile.objects.filter(is_active=True)
		return JsonResponse([serialize_ksb_profile(item) for item in records.order_by('id')], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		values, error = ksb_profile_values_from_payload(payload)
		if error:
			return HttpResponseBadRequest(error)
		values['created_by'] = _header_text(request, 'X-KBC-Display-Name') or _header_text(request, 'X-KBC-Username') or _header_text(request, 'X-KBC-User-Email')
		record = KsbProfile.objects.create(**values)
		serialized = serialize_ksb_profile(record)
		_audit_log(request, action='create', entity='KsbProfile', object_id=record.id, object_label=record.name, after=serialized)
		return JsonResponse(serialized, status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def ksb_profile_detail(request, profile_id: int):
	try:
		record = KsbProfile.objects.get(pk=profile_id)
	except KsbProfile.DoesNotExist:
		return JsonResponse({'detail': 'KSB profile not found.'}, status=404)

	if request.method == 'PATCH':
		before = serialize_ksb_profile(record)
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		values, error = ksb_profile_values_from_payload({**before, **payload})
		if error:
			return HttpResponseBadRequest(error)
		for key, value in values.items():
			setattr(record, key, value)
		record.save()
		serialized = serialize_ksb_profile(record)
		_audit_log(request, action='update', entity='KsbProfile', object_id=record.id, object_label=record.name, before=before, after=serialized)
		return JsonResponse(serialized)

	if request.method == 'DELETE':
		before = serialize_ksb_profile(record)
		in_use = TrainingPlan.objects.filter(ksb_profile_id=record.id).exists()
		if in_use:
			record.is_active = False
			record.save(update_fields=['is_active', 'updated_at'])
			serialized = serialize_ksb_profile(record)
			_audit_log(request, action='deactivate', entity='KsbProfile', object_id=record.id, object_label=record.name, before=before, after=serialized)
			return JsonResponse({'deleted': False, 'deactivated': True, 'item': serialized})
		record.delete()
		_audit_log(request, action='delete', entity='KsbProfile', object_id=profile_id, object_label=before.get('name', ''), before=before)
		return JsonResponse({'deleted': True, 'deactivated': False})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_holidays(request):
	if request.method == 'GET':
		records = training_plan_holidays_queryset().order_by('start_date', 'end_date', 'id')
		return JsonResponse({
			'items': [serialize_training_plan_holiday(item) for item in records],
			'version': training_plan_holidays_version(),
		})

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		if 'items' in payload:
			logger.warning(
				'LEGACY_TRAINING_PLAN_HOLIDAYS_REPLACE_SAVE_TRIGGERED %s',
				json.dumps({
					'path': request.get_full_path(),
					'method': request.method,
					'incomingItemCount': len(payload.get('items')) if isinstance(payload.get('items'), list) else None,
					'accepted': False,
					'rejectionReason': 'Full holiday replace is disabled for normal UI flows.',
					'timestamp': timezone.now().isoformat(),
				}, sort_keys=True),
			)
			return JsonResponse({'detail': 'Full holiday replace is disabled. Use scoped holiday endpoints.'}, status=403)

		allowed_keys = {'version', 'label', 'startDate', 'endDate', 'type', 'color'}
		unknown_keys = sorted(set(payload.keys()) - allowed_keys)
		if unknown_keys:
			return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

		current_version = training_plan_holidays_version()
		current_items = training_plan_holidays_snapshot()
		conflict = require_training_plan_holidays_version(payload, current_version, current_items)
		if conflict is not None:
			return conflict

		values, error = training_plan_holiday_values_from_payload(payload)
		if error:
			return JsonResponse({'detail': error}, status=400)

		with transaction.atomic():
			locked_items = [
				serialize_training_plan_holiday(item)
				for item in training_plan_holidays_queryset().select_for_update().order_by('start_date', 'end_date', 'id')
			]
			locked_version = training_plan_holidays_version()
			conflict = require_training_plan_holidays_version(payload, locked_version, locked_items)
			if conflict is not None:
				return conflict
			record = TrainingPlanHoliday.objects.create(**values)
			serialized = serialize_training_plan_holiday(record)
			_audit_log(request, action='create', entity='TrainingPlanHoliday', object_id=record.id, object_label=record.label, after=serialized, metadata={'partialUpdate': True})

		return training_plan_holidays_response({'item': serialized, 'items': training_plan_holidays_snapshot(), 'version': training_plan_holidays_version()}, status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_holiday_detail(request, holiday_id: int):
	if request.method not in {'PATCH', 'DELETE'}:
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload: dict = {}
	if request.method == 'PATCH' or request.body:
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')
		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

	allowed_keys = {'version', 'label', 'startDate', 'endDate', 'type', 'color'} if request.method == 'PATCH' else {'version'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

	current_items = training_plan_holidays_snapshot()
	current_version = training_plan_holidays_version()
	conflict = require_training_plan_holidays_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		locked_records = list(training_plan_holidays_queryset().select_for_update().order_by('start_date', 'end_date', 'id'))
		locked_items = [serialize_training_plan_holiday(item) for item in locked_records]
		locked_version = training_plan_holidays_version()
		conflict = require_training_plan_holidays_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict
		try:
			record = next(item for item in locked_records if item.id == holiday_id)
		except StopIteration:
			return JsonResponse({'detail': 'Holiday period not found.'}, status=404)

		before = serialize_training_plan_holiday(record)
		if request.method == 'DELETE':
			record_id = record.id
			object_label = record.label
			record.delete()
			_audit_log(request, action='delete', entity='TrainingPlanHoliday', object_id=record_id, object_label=object_label, before=before, metadata={'partialUpdate': True})
			return training_plan_holidays_response({'deleted': True, 'id': str(holiday_id), 'items': training_plan_holidays_snapshot(), 'version': training_plan_holidays_version()})

		values, error = training_plan_holiday_values_from_payload({**before, **payload})
		if error:
			return JsonResponse({'detail': error}, status=400)
		record.label = values['label']
		record.start_date = values['start_date']
		record.end_date = values['end_date']
		record.type = values['type']
		record.color = values['color']
		record.save(update_fields=['label', 'start_date', 'end_date', 'type', 'color', 'updated_at'])
		serialized = serialize_training_plan_holiday(record)
		_audit_log(request, action='update', entity='TrainingPlanHoliday', object_id=record.id, object_label=record.label, before=before, after=serialized, metadata={'partialUpdate': True})
		return training_plan_holidays_response({'item': serialized, 'items': training_plan_holidays_snapshot(), 'version': training_plan_holidays_version()})


@csrf_exempt
def training_plan_holiday_types(request):
	if request.method == 'GET':
		return training_plan_holiday_types_response(training_plan_holiday_types_snapshot())

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		if 'items' in payload:
			logger.warning(
				'LEGACY_TRAINING_PLAN_HOLIDAY_TYPES_REPLACE_SAVE_TRIGGERED %s',
				json.dumps({
					'path': request.get_full_path(),
					'method': request.method,
					'incomingItemCount': len(payload.get('items')) if isinstance(payload.get('items'), list) else None,
					'accepted': False,
					'rejectionReason': 'Full holiday type replace is disabled.',
					'timestamp': timezone.now().isoformat(),
				}, sort_keys=True),
			)
			_audit_log(request, action='reject', entity='TrainingPlanHolidayType', object_label='full-replace', metadata={'reason': 'Full holiday type replace is disabled.', 'partialUpdate': True})
			return JsonResponse({'detail': 'Full holiday type replace is disabled. Use scoped holiday type endpoints.'}, status=403)

		allowed_keys = {'version', 'value', 'label', 'color'}
		unknown_keys = sorted(set(payload.keys()) - allowed_keys)
		if unknown_keys:
			return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

		type_value = str(payload.get('value', '')).strip()
		label = str(payload.get('label', '')).strip()
		color = str(payload.get('color', '')).strip() or TRAINING_PLAN_HOLIDAY_COLORS.get(type_value, '#FFFBEB')

		if not type_value or not label:
			return HttpResponseBadRequest('Both value and label are required.')

		current_items = training_plan_holiday_types_snapshot()
		conflict = require_optional_training_plan_holiday_types_version(payload, training_plan_holiday_types_version(current_items), current_items)
		if conflict is not None:
			return conflict

		with transaction.atomic():
			locked_items = [
				serialize_training_plan_holiday_type(item)
				for item in training_plan_holiday_types_queryset().select_for_update().order_by('type', 'id')
			]
			conflict = require_optional_training_plan_holiday_types_version(payload, training_plan_holiday_types_version(locked_items), locked_items)
			if conflict is not None:
				return conflict

			record, created = TrainingPlanHoliday.objects.update_or_create(
				type=type_value,
				label=f'{TRAINING_PLAN_HOLIDAY_TYPE_MARKER}{label}',
				defaults={
					'start_date': TRAINING_PLAN_HOLIDAY_TYPE_DATE,
					'end_date': TRAINING_PLAN_HOLIDAY_TYPE_DATE,
					'color': color,
				},
			)
			serialized = serialize_training_plan_holiday_type(record)
			_audit_log(request, action='create' if created else 'update', entity='TrainingPlanHolidayType', object_id=record.id, object_label=label, after=serialized, metadata={'partialUpdate': True})
		return training_plan_holiday_types_response(serialized, status=201)

	if request.method == 'PATCH':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		if 'items' in payload:
			_audit_log(request, action='reject', entity='TrainingPlanHolidayType', object_label='full-replace', metadata={'reason': 'Full holiday type replace is disabled.', 'partialUpdate': True})
			return JsonResponse({'detail': 'Full holiday type replace is disabled. Use scoped holiday type endpoints.'}, status=403)

		allowed_keys = {'version', 'id', 'value', 'label', 'color'}
		unknown_keys = sorted(set(payload.keys()) - allowed_keys)
		if unknown_keys:
			return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

		record_id = str(payload.get('id', '') or '').strip()
		type_value = str(payload.get('value', '')).strip()
		label = str(payload.get('label', '')).strip()
		color = str(payload.get('color', '')).strip()

		if not type_value or not label:
			return HttpResponseBadRequest('Both value and label are required.')

		current_items = training_plan_holiday_types_snapshot()
		conflict = require_optional_training_plan_holiday_types_version(payload, training_plan_holiday_types_version(current_items), current_items)
		if conflict is not None:
			return conflict

		with transaction.atomic():
			queryset = training_plan_holiday_types_queryset().select_for_update().filter(type=type_value)
			if record_id:
				queryset = queryset.filter(pk=record_id)
			records = list(queryset.order_by('id'))
			if not records:
				return JsonResponse({'detail': 'Holiday type not found.'}, status=404)
			if len(records) > 1:
				_audit_log(request, action='reject', entity='TrainingPlanHolidayType', object_label=type_value, metadata={'reason': 'Ambiguous holiday type marker rows.', 'matchedCount': len(records), 'partialUpdate': True})
				return JsonResponse({'detail': 'Holiday type is ambiguous. Reload before editing.'}, status=409)

			locked_items = [
				serialize_training_plan_holiday_type(item)
				for item in training_plan_holiday_types_queryset().order_by('type', 'id')
			]
			conflict = require_optional_training_plan_holiday_types_version(payload, training_plan_holiday_types_version(locked_items), locked_items)
			if conflict is not None:
				return conflict

			record = records[0]
			before = serialize_training_plan_holiday_type(record)
			record.label = f'{TRAINING_PLAN_HOLIDAY_TYPE_MARKER}{label}'
			if color:
				record.color = color
			record.save(update_fields=['label', 'color', 'updated_at'])
			serialized = serialize_training_plan_holiday_type(record)
			_audit_log(request, action='update', entity='TrainingPlanHolidayType', object_id=record.id, object_label=label, before=before, after=serialized, metadata={'partialUpdate': True})
		return training_plan_holiday_types_response(serialized)

	if request.method == 'DELETE':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		if 'items' in payload:
			_audit_log(request, action='reject', entity='TrainingPlanHolidayType', object_label='full-replace', metadata={'reason': 'Full holiday type replace is disabled.', 'partialUpdate': True})
			return JsonResponse({'detail': 'Full holiday type replace is disabled. Use scoped holiday type endpoints.'}, status=403)

		allowed_keys = {'version', 'id', 'value'}
		unknown_keys = sorted(set(payload.keys()) - allowed_keys)
		if unknown_keys:
			return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

		record_id = str(payload.get('id', '') or '').strip()
		type_value = str(payload.get('value', '')).strip()
		if not type_value:
			return HttpResponseBadRequest('value is required.')

		current_items = training_plan_holiday_types_snapshot()
		conflict = require_optional_training_plan_holiday_types_version(payload, training_plan_holiday_types_version(current_items), current_items)
		if conflict is not None:
			return conflict

		with transaction.atomic():
			queryset = training_plan_holiday_types_queryset().select_for_update().filter(type=type_value)
			if record_id:
				queryset = queryset.filter(pk=record_id)
			records = list(queryset.order_by('id'))
			if not records:
				return JsonResponse({'detail': 'Holiday type not found.'}, status=404)
			if len(records) > 1:
				_audit_log(request, action='reject', entity='TrainingPlanHolidayType', object_label=type_value, before=[serialize_training_plan_holiday_type(record) for record in records], metadata={'reason': 'Ambiguous holiday type marker rows.', 'matchedCount': len(records), 'partialUpdate': True})
				return JsonResponse({'detail': 'Holiday type is ambiguous. Reload before deleting.'}, status=409)

			locked_items = [
				serialize_training_plan_holiday_type(item)
				for item in training_plan_holiday_types_queryset().order_by('type', 'id')
			]
			conflict = require_optional_training_plan_holiday_types_version(payload, training_plan_holiday_types_version(locked_items), locked_items)
			if conflict is not None:
				return conflict

			record = records[0]
			before = serialize_training_plan_holiday_type(record)
			record_id = record.id
			record.delete()
			_audit_log(request, action='delete', entity='TrainingPlanHolidayType', object_id=record_id, object_label=type_value, before=before, metadata={'partialUpdate': True, 'matchedCount': 1})
		return training_plan_holiday_types_response({'deleted': True})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_modules(request):
	if request.method == 'GET':
		records = TrainingPlanModuleDefinition.objects.all().order_by('name', 'id')
		response = JsonResponse([serialize_training_plan_module_definition(item) for item in records], safe=False)
		response['X-KBC-Training-Plan-Modules-Version'] = training_plan_module_definitions_version()
		return response

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		if 'items' in payload:
			logger.warning(
				'LEGACY_TRAINING_PLAN_MODULES_FULL_REPLACE_TRIGGERED %s',
				json.dumps({
					'path': request.get_full_path(),
					'method': request.method,
					'incomingItemCount': len(payload.get('items')) if isinstance(payload.get('items'), list) else None,
					'accepted': False,
					'rejectionReason': 'Full module definition replace is disabled for normal UI flows.',
					'timestamp': timezone.now().isoformat(),
				}, sort_keys=True),
			)
			return JsonResponse({'detail': 'Full module definition replace is disabled. Use scoped module definition endpoints.'}, status=403)

		allowed_keys = {'version', 'id', 'name', 'defaultSessions', 'bg', 'tx'}
		unknown_keys = sorted(set(payload.keys()) - allowed_keys)
		if unknown_keys:
			return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

		current_items = training_plan_module_definitions_snapshot()
		current_version = training_plan_module_definitions_version(current_items)
		conflict = require_training_plan_module_definitions_version(payload, current_version, current_items)
		if conflict is not None:
			return conflict

		values, error = training_plan_module_definition_values_from_payload(payload)
		if error:
			return JsonResponse({'detail': error}, status=400)

		with transaction.atomic():
			locked_items = [
				serialize_training_plan_module_definition(item)
				for item in TrainingPlanModuleDefinition.objects.select_for_update().order_by('module_id', 'id')
			]
			locked_version = training_plan_module_definitions_version(locked_items)
			conflict = require_training_plan_module_definitions_version(payload, locked_version, locked_items)
			if conflict is not None:
				return conflict
			if TrainingPlanModuleDefinition.objects.filter(module_id=values['module_id']).exists():
				return JsonResponse({'detail': 'A module definition with this id already exists.'}, status=409)
			record = TrainingPlanModuleDefinition.objects.create(**values)
			serialized = serialize_training_plan_module_definition(record)
			_audit_log(request, action='create', entity='TrainingPlanModuleDefinition', object_id=record.id, object_label=record.name, after=serialized, metadata={'partialUpdate': True})

		return training_plan_module_definitions_response({'item': serialized, 'version': training_plan_module_definitions_version()}, status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_module_definition_detail(request, module_id: str):
	module_id = str(module_id or '').strip()
	if not module_id:
		return JsonResponse({'detail': 'Module definition id is required.'}, status=400)

	if request.method not in {'PATCH', 'DELETE'}:
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload: dict = {}
	if request.method == 'PATCH' or request.body:
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')
		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

	allowed_keys = {'version', 'name', 'defaultSessions', 'bg', 'tx'} if request.method == 'PATCH' else {'version'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

	current_items = training_plan_module_definitions_snapshot()
	current_version = training_plan_module_definitions_version(current_items)
	conflict = require_training_plan_module_definitions_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		locked_records = list(TrainingPlanModuleDefinition.objects.select_for_update().order_by('module_id', 'id'))
		locked_items = [serialize_training_plan_module_definition(item) for item in locked_records]
		locked_version = training_plan_module_definitions_version(locked_items)
		conflict = require_training_plan_module_definitions_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict
		try:
			record = next(item for item in locked_records if item.module_id == module_id)
		except StopIteration:
			return JsonResponse({'detail': 'Module definition not found.'}, status=404)

		before = serialize_training_plan_module_definition(record)
		if request.method == 'DELETE':
			record_id = record.id
			object_label = record.name
			record.delete()
			_audit_log(request, action='delete', entity='TrainingPlanModuleDefinition', object_id=record_id, object_label=object_label, before=before, metadata={'partialUpdate': True})
			return training_plan_module_definitions_response({'deleted': True, 'id': module_id, 'version': training_plan_module_definitions_version()})

		values, error = training_plan_module_definition_values_from_payload({**before, **payload, 'id': module_id})
		if error:
			return JsonResponse({'detail': error}, status=400)
		record.name = values['name']
		record.default_sessions = values['default_sessions']
		record.bg = values['bg']
		record.tx = values['tx']
		record.save(update_fields=['name', 'default_sessions', 'bg', 'tx', 'updated_at'])
		serialized = serialize_training_plan_module_definition(record)
		_audit_log(request, action='update', entity='TrainingPlanModuleDefinition', object_id=record.id, object_label=record.name, before=before, after=serialized, metadata={'partialUpdate': True})
		return training_plan_module_definitions_response({'item': serialized, 'version': training_plan_module_definitions_version()})


@csrf_exempt
def training_plan_program_configs(request):
	if request.method == 'GET':
		records = TrainingPlanProgramConfig.objects.all().order_by('program_id', 'id')
		response = JsonResponse([serialize_training_plan_program_config(item) for item in records], safe=False)
		response['X-KBC-Training-Plan-Program-Configs-Version'] = training_plan_program_configs_version()
		return response

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		if 'items' in payload:
			logger.warning(
				'LEGACY_TRAINING_PLAN_PROGRAM_CONFIGS_FULL_REPLACE_TRIGGERED %s',
				json.dumps({
					'path': request.get_full_path(),
					'method': request.method,
					'incomingItemCount': len(payload.get('items')) if isinstance(payload.get('items'), list) else None,
					'accepted': False,
					'rejectionReason': 'Full programme config replace is disabled for normal UI flows.',
					'timestamp': timezone.now().isoformat(),
				}, sort_keys=True),
			)
			return JsonResponse({'detail': 'Full programme config replace is disabled. Use scoped programme config endpoints.'}, status=403)

		allowed_keys = {'version', 'id', 'name', 'sub', 'color'}
		unknown_keys = sorted(set(payload.keys()) - allowed_keys)
		if unknown_keys:
			return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

		current_items = training_plan_program_configs_snapshot()
		current_version = training_plan_program_configs_version(current_items)
		conflict = require_training_plan_program_configs_version(payload, current_version, current_items)
		if conflict is not None:
			return conflict

		values, error = training_plan_program_config_values_from_payload(payload)
		if error:
			return JsonResponse({'detail': error}, status=400)

		with transaction.atomic():
			locked_items = [
				serialize_training_plan_program_config(item)
				for item in TrainingPlanProgramConfig.objects.select_for_update().order_by('program_id', 'id')
			]
			locked_version = training_plan_program_configs_version(locked_items)
			conflict = require_training_plan_program_configs_version(payload, locked_version, locked_items)
			if conflict is not None:
				return conflict
			if TrainingPlanProgramConfig.objects.filter(program_id=values['program_id']).exists():
				return JsonResponse({'detail': 'A programme config with this id already exists.'}, status=409)
			record = TrainingPlanProgramConfig.objects.create(**values)
			serialized = serialize_training_plan_program_config(record)
			_audit_log(request, action='create', entity='TrainingPlanProgramConfig', object_id=record.id, object_label=record.name, after=serialized, metadata={'partialUpdate': True})

		return training_plan_program_configs_response({'item': serialized, 'version': training_plan_program_configs_version()}, status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_program_config_detail(request, config_id: str):
	config_id = str(config_id or '').strip()
	if not config_id:
		return JsonResponse({'detail': 'Programme config id is required.'}, status=400)

	if request.method not in {'PATCH', 'DELETE'}:
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	payload: dict = {}
	if request.method == 'PATCH' or request.body:
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')
		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

	allowed_keys = {'version', 'name', 'sub', 'color'} if request.method == 'PATCH' else {'version'}
	unknown_keys = sorted(set(payload.keys()) - allowed_keys)
	if unknown_keys:
		return JsonResponse({'detail': f'Unsupported field(s): {", ".join(unknown_keys)}.'}, status=400)

	current_items = training_plan_program_configs_snapshot()
	current_version = training_plan_program_configs_version(current_items)
	conflict = require_training_plan_program_configs_version(payload, current_version, current_items)
	if conflict is not None:
		return conflict

	with transaction.atomic():
		locked_records = list(TrainingPlanProgramConfig.objects.select_for_update().order_by('program_id', 'id'))
		locked_items = [serialize_training_plan_program_config(item) for item in locked_records]
		locked_version = training_plan_program_configs_version(locked_items)
		conflict = require_training_plan_program_configs_version(payload, locked_version, locked_items)
		if conflict is not None:
			return conflict
		try:
			record = next(item for item in locked_records if item.program_id == config_id)
		except StopIteration:
			return JsonResponse({'detail': 'Programme config not found.'}, status=404)

		before = serialize_training_plan_program_config(record)
		if request.method == 'DELETE':
			record_id = record.id
			object_label = record.name
			record.delete()
			_audit_log(request, action='delete', entity='TrainingPlanProgramConfig', object_id=record_id, object_label=object_label, before=before, metadata={'partialUpdate': True})
			return training_plan_program_configs_response({'deleted': True, 'id': config_id, 'version': training_plan_program_configs_version()})

		values, error = training_plan_program_config_values_from_payload({**before, **payload, 'id': config_id})
		if error:
			return JsonResponse({'detail': error}, status=400)
		record.name = values['name']
		record.sub = values['sub']
		record.color = values['color']
		record.save(update_fields=['name', 'sub', 'color', 'updated_at'])
		serialized = serialize_training_plan_program_config(record)
		_audit_log(request, action='update', entity='TrainingPlanProgramConfig', object_id=record.id, object_label=record.name, before=before, after=serialized, metadata={'partialUpdate': True})
		return training_plan_program_configs_response({'item': serialized, 'version': training_plan_program_configs_version()})


_LEGACY_MODULE_SESSION_FIELDS = 30
_SESSION_NAME_FIELDS = [f'session_name_{i}' for i in range(1, _LEGACY_MODULE_SESSION_FIELDS + 1)]
_SESSION_DESC_FIELDS = [f'session_description_{i}' for i in range(1, _LEGACY_MODULE_SESSION_FIELDS + 1)]


def _json_array_or_empty(raw: str) -> list[str]:
	try:
		value = json.loads(raw or '[]')
	except (TypeError, json.JSONDecodeError):
		return []
	if not isinstance(value, list):
		return []
	return [str(item) for item in value]


def _serialize_module(item) -> dict:
	session_names = _json_array_or_empty(getattr(item, 'session_names_json', ''))
	session_descriptions = _json_array_or_empty(getattr(item, 'session_descriptions_json', ''))
	if not session_names:
		session_names = [getattr(item, f, '') or '' for f in _SESSION_NAME_FIELDS]
	if not session_descriptions:
		session_descriptions = [getattr(item, f, '') or '' for f in _SESSION_DESC_FIELDS]
	return {
		'id': item.module_id,
		'name': item.module_name,
		'colour': item.module_colour,
		'sessions': item.number_of_sessions,
		'notes': item.notes,
		'sessionNames': session_names,
		'sessionDescriptions': session_descriptions,
		'sessionKsbMappings': normalize_session_ksb_mappings(getattr(item, 'session_ksb_json', '')),
	}


def _apply_session_data(record, session_names: list, session_descriptions: list, session_ksb_mappings: list | None = None):
	record.session_names_json = json.dumps([str(s) for s in session_names], ensure_ascii=False)
	record.session_descriptions_json = json.dumps([str(s) for s in session_descriptions], ensure_ascii=False)
	if session_ksb_mappings is not None:
		record.session_ksb_json = json.dumps(normalize_session_ksb_mappings(session_ksb_mappings), ensure_ascii=False)
	for i, field in enumerate(_SESSION_NAME_FIELDS):
		setattr(record, field, session_names[i] if i < len(session_names) else '')
	for i, field in enumerate(_SESSION_DESC_FIELDS):
		setattr(record, field, session_descriptions[i] if i < len(session_descriptions) else '')


@csrf_exempt
def modules(request):
	if request.method == 'GET':
		records = Module.objects.all().order_by('module_name', 'module_id')
		return JsonResponse([_serialize_module(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		name = str(payload.get('name', '')).strip()
		colour = str(payload.get('colour', '')).strip()
		sessions = str(payload.get('sessions', '')).strip()
		notes = str(payload.get('notes', '')).strip()
		session_names = [str(s) for s in payload.get('sessionNames', [])]
		session_descriptions = [str(s) for s in payload.get('sessionDescriptions', [])]
		session_ksb_mappings = payload.get('sessionKsbMappings', [])

		if not name:
			return HttpResponseBadRequest('Module name is required.')

		record = Module(
			module_name=name,
			module_colour=colour,
			number_of_sessions=sessions,
			notes=notes,
		)
		_apply_session_data(record, session_names, session_descriptions, session_ksb_mappings)
		record.save()
		_audit_log(request, action='create', entity='Module', object_id=record.module_id, object_label=record.module_name, after=_serialize_module(record))
		return JsonResponse(_serialize_module(record), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def module_detail(request, module_id: int):
	try:
		record = Module.objects.get(module_id=module_id)
	except Module.DoesNotExist:
		return JsonResponse({'detail': 'Not found.'}, status=404)

	if request.method == 'PATCH':
		before = _serialize_module(record)
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if 'name' in payload:
			name = str(payload['name']).strip()
			if not name:
				return HttpResponseBadRequest('Module name is required.')
			record.module_name = name
		if 'colour' in payload:
			record.module_colour = str(payload['colour']).strip()
		if 'sessions' in payload:
			record.number_of_sessions = str(payload['sessions']).strip()
		if 'notes' in payload:
			record.notes = str(payload['notes']).strip()
		if 'sessionNames' in payload or 'sessionDescriptions' in payload:
			names = [str(s) for s in payload.get('sessionNames', [getattr(record, f, '') or '' for f in _SESSION_NAME_FIELDS])]
			descs = [str(s) for s in payload.get('sessionDescriptions', [getattr(record, f, '') or '' for f in _SESSION_DESC_FIELDS])]
			mappings = payload.get('sessionKsbMappings') if 'sessionKsbMappings' in payload else None
			_apply_session_data(record, names, descs, mappings)
		elif 'sessionKsbMappings' in payload:
			record.session_ksb_json = json.dumps(normalize_session_ksb_mappings(payload.get('sessionKsbMappings', [])), ensure_ascii=False)
		record.save()
		_audit_log(request, action='update', entity='Module', object_id=record.module_id, object_label=record.module_name, before=before, after=_serialize_module(record))
		return JsonResponse(_serialize_module(record))

	if request.method == 'DELETE':
		before = _serialize_module(record)
		object_label = record.module_name
		record.delete()
		_audit_log(request, action='delete', entity='Module', object_id=module_id, object_label=object_label, before=before)
		return JsonResponse({'detail': 'Deleted.'}, status=200)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


def _decode_http_error(error: HTTPError) -> dict:
	try:
		return json.loads(error.read().decode('utf-8'))
	except Exception:
		return {}


def _graph_json(method: str, url: str, *, token: str | None = None, payload: bytes | None = None, headers: dict | None = None) -> dict:
	req_headers: dict[str, str] = {'Accept': 'application/json'}
	if token:
		req_headers['Authorization'] = f'Bearer {token}'
	if headers:
		req_headers.update(headers)

	request = Request(url, data=payload, headers=req_headers, method=method)
	# Ignore shell-level proxy variables for Microsoft Graph/Auth calls.
	# In local environments these may be intentionally poisoned (e.g. 127.0.0.1:9),
	# which breaks outbound OAuth/token requests for SharePoint document sync.
	opener = build_opener(ProxyHandler({}))
	try:
		with opener.open(request, timeout=20) as response:
			data = response.read().decode('utf-8')
			return json.loads(data) if data else {}
	except HTTPError as error:
		error_data = _decode_http_error(error)
		graph_error = error_data.get('error', {}) if isinstance(error_data, dict) else {}
		message = ''
		if isinstance(graph_error, dict):
			message = str(graph_error.get('message') or '').strip()
		if not message and isinstance(error_data, dict):
			message = str(error_data.get('error_description') or '').strip()
		if not message:
			message = f'Microsoft Graph request failed ({error.code}).'
		path = urlparse(url).path
		raise RuntimeError(f'{message} [Graph {method} {path}]')
	except URLError:
		path = urlparse(url).path
		raise RuntimeError(f'Unable to reach Microsoft Graph right now. [Graph {method} {path}]')


def _parse_policies_folder_url(folder_url: str) -> tuple[str, str, str]:
	parsed = urlparse(folder_url)
	host = parsed.netloc.strip()
	if not host:
		raise ValueError('MS_Policies_FILE must be a valid SharePoint URL.')

	query = parse_qs(parsed.query)
	raw_id_path = query.get('id', [''])[0]
	server_path = unquote(raw_id_path or parsed.path).strip()
	if not server_path:
		raise ValueError('Could not determine the SharePoint folder path from MS_Policies_FILE.')

	if not server_path.startswith('/'):
		server_path = f'/{server_path}'

	parts = [segment for segment in server_path.split('/') if segment]
	if len(parts) < 4 or parts[0].lower() != 'sites':
		raise ValueError('MS_Policies_FILE must target a path under /sites/<site>/...')

	site_path = f'/{parts[0]}/{parts[1]}'
	doc_idx = -1
	for idx, part in enumerate(parts):
		if part.strip().lower() in {'shared documents', 'documents'}:
			doc_idx = idx
			break

	if doc_idx == -1 or doc_idx + 1 >= len(parts):
		raise ValueError('MS_Policies_FILE must include a document library folder path.')

	drive_path = '/'.join(parts[doc_idx + 1:]).strip('/')
	if not drive_path:
		raise ValueError('MS_Policies_FILE must point to a concrete folder, not just the library root.')

	return host, site_path, drive_path


def _serialize_drive_item(item: dict) -> dict:
	name = str(item.get('name', '')).strip()
	is_folder = bool(item.get('folder'))
	extension = ''
	if not is_folder and '.' in name:
		extension = name.rsplit('.', 1)[1].lower()

	file_info = item.get('file') if isinstance(item.get('file'), dict) else {}

	return {
		'id': str(item.get('id', '')),
		'name': name,
		'type': 'folder' if is_folder else 'file',
		'webUrl': item.get('webUrl') or '',
		'lastModifiedDateTime': item.get('lastModifiedDateTime') or '',
		'size': int(item.get('size') or 0),
		'extension': extension,
		'mimeType': file_info.get('mimeType', ''),
		'children': [],
	}


def _list_drive_children(site_id: str, item_id: str, token: str) -> list[dict]:
	url = (
		f'https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{item_id}/children'
		'?$top=200&$select=id,name,webUrl,lastModifiedDateTime,size,folder,file'
	)
	items: list[dict] = []

	while url:
		data = _graph_json('GET', url, token=token)
		value = data.get('value', []) if isinstance(data, dict) else []
		if isinstance(value, list):
			items.extend([entry for entry in value if isinstance(entry, dict)])
		url = data.get('@odata.nextLink') if isinstance(data, dict) else None

	return items


def _build_drive_tree(site_id: str, item: dict, token: str, *, depth: int = 0, max_depth: int = 6, node_count: dict | None = None, max_nodes: int = 1000) -> dict:
	counter = node_count or {'value': 0}
	counter['value'] += 1
	node = _serialize_drive_item(item)

	if counter['value'] >= max_nodes:
		return node

	if node['type'] != 'folder' or depth >= max_depth:
		return node

	children = _list_drive_children(site_id, node['id'], token)
	children.sort(key=lambda child: (0 if child.get('folder') else 1, str(child.get('name', '')).lower()))
	node['children'] = [
		_build_drive_tree(site_id, child, token, depth=depth + 1, max_depth=max_depth, node_count=counter, max_nodes=max_nodes)
		for child in children
	]
	return node


def _get_env_first(*keys: str) -> str:
	for key in keys:
		value = os.getenv(key, '').strip()
		if value:
			return value
	return ''


def _decode_jwt_payload(token: str) -> dict:
	try:
		parts = token.split('.')
		if len(parts) < 2:
			return {}
		payload = parts[1].replace('-', '+').replace('_', '/')
		padding = '=' * ((4 - (len(payload) % 4)) % 4)
		decoded = base64.b64decode(payload + padding).decode('utf-8')
		data = json.loads(decoded)
		return data if isinstance(data, dict) else {}
	except Exception:
		return {}


def _resolve_sharepoint_site(host: str, site_path: str, token: str) -> dict:
	lookup_variants = [
		f'https://graph.microsoft.com/v1.0/sites/{host}:{quote(site_path, safe="/")}:?$select=id,displayName,webUrl',
		f'https://graph.microsoft.com/v1.0/sites/{host}:{quote(site_path, safe="/")}?$select=id,displayName,webUrl',
	]
	first_error = ''

	for url in lookup_variants:
		try:
			site_data = _graph_json('GET', url, token=token)
			if isinstance(site_data, dict) and site_data.get('id'):
				return site_data
		except RuntimeError as error:
			if not first_error:
				first_error = str(error)

	site_name = site_path.strip('/').split('/')[-1]
	search_url = f'https://graph.microsoft.com/v1.0/sites?search={quote(site_name)}&$select=id,displayName,webUrl'
	try:
		search_data = _graph_json('GET', search_url, token=token)
		for entry in search_data.get('value', []) if isinstance(search_data, dict) else []:
			if not isinstance(entry, dict):
				continue
			web_url = str(entry.get('webUrl', '')).lower()
			if host.lower() in web_url and site_path.lower() in web_url:
				return entry
	except RuntimeError as error:
		if not first_error:
			first_error = str(error)

	if first_error:
		raise RuntimeError(first_error)
	raise RuntimeError(f'Could not resolve SharePoint site: {site_path}.')


DOCUMENTS_LIVE_CACHE_SECONDS = 120
DOCUMENTS_SUMMARY_CACHE_SECONDS = 300


def _documents_cache_key(kind: str, policies_url: str) -> str:
	digest = hashlib.sha256(policies_url.encode('utf-8')).hexdigest()[:16]
	return f'policies:v3:{kind}:{digest}'


def _get_policies_context() -> tuple[str, str, str, str, str, str, str]:
	client_id = _get_env_first('MS_Policies_client_id', 'MS_Policies_clint_id', 'MS_POLICIES_CLIENT_ID')
	client_secret = _get_env_first('MS_Policies_client_secret', 'MS_POLICIES_CLIENT_SECRET')
	tenant_id = _get_env_first('MS_Policies_tenant_id', 'MS_POLICIES_TENANT_ID')
	policies_url = _get_env_first('MS_Policies_FILE', 'MS_POLICIES_FILE')

	if not client_id or not client_secret or not tenant_id or not policies_url:
		raise RuntimeError('Missing Microsoft Policies configuration in environment variables.')

	host, site_path, drive_path = _parse_policies_folder_url(policies_url)
	return client_id, client_secret, tenant_id, policies_url, host, site_path, drive_path


def _get_policies_access_token(client_id: str, client_secret: str, tenant_id: str) -> str:
	token_payload = urlencode({
		'client_id': client_id,
		'client_secret': client_secret,
		'grant_type': 'client_credentials',
		'scope': 'https://graph.microsoft.com/.default',
	}).encode('utf-8')

	token_data = _graph_json(
		'POST',
		f'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token',
		payload=token_payload,
		headers={'Content-Type': 'application/x-www-form-urlencoded'},
	)
	access_token = str(token_data.get('access_token', '')).strip()
	if not access_token:
		raise RuntimeError('Microsoft token response did not include an access token.')

	claims = _decode_jwt_payload(access_token)
	roles = claims.get('roles') if isinstance(claims.get('roles'), list) else []
	if not roles:
		raise RuntimeError(
			'Microsoft Graph token has no application roles. Adding permission IDs in .env does not grant access. '
			'In Entra App Registration > API permissions, add Graph Application permissions '
			'(e.g. Sites.Read.All / Files.Read.All) and click Admin consent.'
		)

	return access_token


def _get_policies_root(host: str, site_path: str, drive_path: str, access_token: str) -> tuple[dict, str, dict]:
	site_data = _resolve_sharepoint_site(host, site_path, access_token)
	site_id = str(site_data.get('id', '')).strip()
	if not site_id:
		raise RuntimeError('Could not resolve the SharePoint site ID from MS_Policies_FILE.')

	root_lookup_url = (
		f'https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root:/{quote(drive_path, safe="/")}:'
		'?$select=id,name,webUrl,lastModifiedDateTime,size,folder,file'
	)
	root_item = _graph_json('GET', root_lookup_url, token=access_token)
	if not isinstance(root_item, dict) or not root_item.get('id'):
		raise RuntimeError('Could not locate the configured policies folder in SharePoint.')

	return site_data, site_id, root_item


def _documents_source_payload(host: str, site_path: str, drive_path: str, site_data: dict, root_item: dict) -> dict:
	return {
		'host': host,
		'sitePath': site_path,
		'drivePath': drive_path,
		'siteName': site_data.get('displayName', ''),
		'siteWebUrl': site_data.get('webUrl', ''),
		'folderWebUrl': root_item.get('webUrl', ''),
	}


def _build_documents_live_payload() -> tuple[dict, str]:
	client_id, client_secret, tenant_id, policies_url, host, site_path, drive_path = _get_policies_context()
	access_token = _get_policies_access_token(client_id, client_secret, tenant_id)
	site_data, site_id, root_item = _get_policies_root(host, site_path, drive_path, access_token)
	tree = _build_drive_tree(site_id, root_item, access_token)

	return {
		'fetchedAt': datetime.utcnow().isoformat() + 'Z',
		'source': _documents_source_payload(host, site_path, drive_path, site_data, root_item),
		'root': tree,
	}, policies_url


def _count_tree_files(node: dict) -> int:
	if node.get('type') == 'file':
		return 1
	return sum(_count_tree_files(child) for child in node.get('children', []) if isinstance(child, dict))


def _count_drive_files_recursive(site_id: str, item_id: str, token: str, *, depth: int = 0, max_depth: int = 6, node_count: dict | None = None, max_nodes: int = 1000) -> int:
	counter = node_count or {'value': 0}
	if counter['value'] >= max_nodes or depth >= max_depth:
		return 0

	total = 0
	children = _list_drive_children(site_id, item_id, token)
	for child in children:
		counter['value'] += 1
		if counter['value'] > max_nodes:
			break
		if child.get('folder'):
			total += _count_drive_files_recursive(
				site_id,
				str(child.get('id', '')),
				token,
				depth=depth + 1,
				max_depth=max_depth,
				node_count=counter,
				max_nodes=max_nodes,
			)
		else:
			total += 1
	return total


def _build_documents_summary_payload() -> tuple[dict, str]:
	client_id, client_secret, tenant_id, policies_url, host, site_path, drive_path = _get_policies_context()
	live_cache_key = _documents_cache_key('live', policies_url)
	live_payload = cache.get(live_cache_key)
	if isinstance(live_payload, dict) and isinstance(live_payload.get('root'), dict):
		root = live_payload['root']
		categories = [
			{'name': child.get('name', ''), 'count': _count_tree_files(child)}
			for child in root.get('children', [])
			if isinstance(child, dict) and child.get('type') == 'folder'
		]
		uncategorized_count = sum(
			1 for child in root.get('children', [])
			if isinstance(child, dict) and child.get('type') == 'file'
		)
		if uncategorized_count > 0:
			categories.append({'name': 'Uncategorized', 'count': uncategorized_count})
		return {
			'fetchedAt': live_payload.get('fetchedAt') or datetime.utcnow().isoformat() + 'Z',
			'source': live_payload.get('source', {}),
			'total': _count_tree_files(root),
			'categories': categories,
		}, policies_url

	access_token = _get_policies_access_token(client_id, client_secret, tenant_id)
	site_data, site_id, root_item = _get_policies_root(host, site_path, drive_path, access_token)
	children = _list_drive_children(site_id, str(root_item.get('id', '')), access_token)
	categories = []
	uncategorized_count = 0
	counter = {'value': 0}
	for child in children:
		if not child.get('folder'):
			uncategorized_count += 1
			continue
		categories.append({
			'name': str(child.get('name', '')).strip(),
			'count': _count_drive_files_recursive(site_id, str(child.get('id', '')), access_token, node_count=counter),
		})
	if uncategorized_count > 0:
		categories.append({'name': 'Uncategorized', 'count': uncategorized_count})

	return {
		'fetchedAt': datetime.utcnow().isoformat() + 'Z',
		'source': _documents_source_payload(host, site_path, drive_path, site_data, root_item),
		'total': sum(item['count'] for item in categories),
		'categories': categories,
	}, policies_url


def documents_summary(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	try:
		policies_url = _get_env_first('MS_Policies_FILE', 'MS_POLICIES_FILE')
		cache_key = _documents_cache_key('summary', policies_url)
		if request.GET.get('refresh') != '1':
			cached = cache.get(cache_key)
			if isinstance(cached, dict):
				return JsonResponse(cached)

		payload, policies_url = _build_documents_summary_payload()
		cache.set(_documents_cache_key('summary', policies_url), payload, DOCUMENTS_SUMMARY_CACHE_SECONDS)
		return JsonResponse(payload)
	except ValueError as error:
		return JsonResponse({'detail': str(error)}, status=400)
	except RuntimeError as error:
		status = 500 if 'Missing Microsoft Policies configuration' in str(error) else 502
		return JsonResponse({'detail': str(error)}, status=status)
	except Exception as error:
		return JsonResponse({'detail': f'Unexpected server error: {error.__class__.__name__}'}, status=500)


def documents_live(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	policies_url = _get_env_first('MS_Policies_FILE', 'MS_POLICIES_FILE')

	try:
		cache_key = _documents_cache_key('live', policies_url)
		if request.GET.get('refresh') != '1':
			cached = cache.get(cache_key)
			if isinstance(cached, dict):
				return JsonResponse(cached)

		payload, policies_url = _build_documents_live_payload()
		cache.set(_documents_cache_key('live', policies_url), payload, DOCUMENTS_LIVE_CACHE_SECONDS)
		cache.delete(_documents_cache_key('summary', policies_url))
		return JsonResponse(payload)
	except ValueError as error:
		return JsonResponse({'detail': str(error)}, status=400)
	except RuntimeError as error:
		status = 500 if 'Missing Microsoft Policies configuration' in str(error) else 502
		return JsonResponse({'detail': str(error)}, status=status)
	except Exception as error:
		return JsonResponse({'detail': f'Unexpected server error: {error.__class__.__name__}'}, status=500)


# ── Employees ─────────────────────────────────────────────────────────────────

def serialize_employee(emp: Employee) -> dict:
	return {
		'id': str(emp.pk),
		'name': emp.full_name,
		'title': emp.job_title,
		'department': emp.department,
		'reportsTo': emp.reports_to or None,
		'email': emp.email,
		'phone': emp.phone,
		'avatar': '',
	}


@csrf_exempt
def employees(request):
	if request.method == 'GET':
		records = Employee.objects.all().order_by('pk')
		return JsonResponse([serialize_employee(e) for e in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		name = str(payload.get('name', '')).strip()
		if not name:
			return HttpResponseBadRequest('Name is required.')

		emp = Employee.objects.create(
			full_name=name,
			job_title=str(payload.get('title', '')).strip(),
			department=str(payload.get('department', '')).strip(),
			reports_to=str(payload.get('reportsTo', '') or '').strip() or None,
			email=str(payload.get('email', '')).strip(),
			phone=str(payload.get('phone', '')).strip(),
		)
		_audit_log(request, action='create', entity='Employee', object_id=emp.pk, object_label=emp.full_name, after=serialize_employee(emp))
		return JsonResponse(serialize_employee(emp), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def employee_detail(request, employee_id: int):
	try:
		emp = Employee.objects.get(pk=employee_id)
	except Employee.DoesNotExist:
		return JsonResponse({'detail': 'Not found.'}, status=404)

	if request.method == 'PATCH':
		before = serialize_employee(emp)
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if 'name' in payload:
			emp.full_name = str(payload['name']).strip()
		if 'title' in payload:
			emp.job_title = str(payload['title']).strip()
		if 'department' in payload:
			emp.department = str(payload['department']).strip()
		if 'reportsTo' in payload:
			emp.reports_to = str(payload['reportsTo'] or '').strip() or None
		if 'email' in payload:
			emp.email = str(payload['email']).strip()
		if 'phone' in payload:
			emp.phone = str(payload['phone']).strip()
		emp.save()
		_audit_log(request, action='update', entity='Employee', object_id=emp.pk, object_label=emp.full_name, before=before, after=serialize_employee(emp))
		return JsonResponse(serialize_employee(emp))

	if request.method == 'DELETE':
		with transaction.atomic():
			emp = Employee.objects.select_for_update().get(pk=employee_id)
			before = serialize_employee(emp)
			object_label = emp.full_name
			manager_id = str(emp.reports_to or '').strip() or None
			if manager_id == str(employee_id):
				manager_id = None
			elif manager_id and not Employee.objects.filter(pk=manager_id).exists():
				manager_id = None

			direct_reports = list(Employee.objects.select_for_update().filter(reports_to=str(employee_id)).order_by('pk'))
			direct_report_before = [serialize_employee(report) for report in direct_reports]
			reparented_count = Employee.objects.filter(pk__in=[report.pk for report in direct_reports]).update(
				reports_to=manager_id
			)
			emp.delete()
			_audit_log(
				request,
				action='delete',
				entity='Employee',
				object_id=employee_id,
				object_label=object_label,
				before=before,
				metadata={
					'directReportsReparented': reparented_count,
					'previousManagerId': before.get('reportsTo'),
					'newManagerId': manager_id,
					'directReportsBefore': direct_report_before,
					'hardDelete': True,
				},
			)
		return JsonResponse({'detail': 'Deleted.'})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


# ── Safeguarding urgent tickets ───────────────────────────────────────────────

def _support_ticket_notes_payload(raw_notes) -> list:
	if isinstance(raw_notes, list):
		return raw_notes
	if isinstance(raw_notes, str):
		try:
			parsed = json.loads(raw_notes)
		except json.JSONDecodeError:
			return []
		return parsed if isinstance(parsed, list) else []
	return []


def serialize_support_ticket(t: SupportTicket) -> dict:
	notes = _support_ticket_notes_payload(t.notes)
	return {
		'id': t.id,
		'ticketType': t.ticket_type,
		'fullName': t.full_name,
		'email': t.email,
		'subject': t.subject,
		'details': t.details,
		'urgency': t.urgency,
		'preferredContact': t.preferred_contact,
		'status': t.status,
		'createdAt': t.created_at.isoformat() if t.created_at else '',
		'submittedBy': t.submitted_by,
		'createdBy': t.created_by,
		'isArchived': t.is_archived,
		'assignedOwner': t.assigned_owner,
		'updatedAt': t.updated_at.isoformat() if t.updated_at else '',
		'notes': notes,
		'notesCount': len([note for note in notes if isinstance(note, dict) and str(note.get('note', '')).strip()]),
		'evidence': t.evidence or [],
		'daysToClose': t.days_to_close,
	}


def _is_local_request(request) -> bool:
	host = request.get_host().split(':', 1)[0].lower()
	return host in {'localhost', '127.0.0.1', '0.0.0.0'} or os.getenv('USE_LOCAL_RISK_DATA', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def urgent_tickets(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)
	if _is_local_request(request) and 'safeguarding_db' not in settings.DATABASES:
		return JsonResponse([], safe=False)
	try:
		records = (
			SupportTicket.objects.using('safeguarding_db')
			.exclude(status__iregex=r'^(closed|outcome recorded)$')
			.filter(models.Q(is_archived=False) | models.Q(is_archived__isnull=True))
			.order_by('-created_at')
		)
		return JsonResponse([serialize_support_ticket(t) for t in records], safe=False)
	except Exception as exc:
		if settings.DEBUG:
			return JsonResponse([], safe=False)
		return JsonResponse({'detail': str(exc)}, status=502)


# ── Risk register ─────────────────────────────────────────────────────────────
def support_tickets(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)
	if _is_local_request(request) and 'safeguarding_db' not in settings.DATABASES:
		return JsonResponse([], safe=False)
	try:
		records = SupportTicket.objects.using('safeguarding_db').all().order_by('-created_at')
		return JsonResponse([serialize_support_ticket(t) for t in records], safe=False)
	except Exception as exc:
		if settings.DEBUG:
			return JsonResponse([], safe=False)
		return JsonResponse({'detail': str(exc)}, status=502)


def serialize_risk(r: RiskRegisterItem) -> dict:
	return {
		'id': r.id,
		'risk': r.risk,
		'category': r.category,
		'severity': r.severity,
		'rag': r.rag,
		'ofstedArea': r.ofsted_area,
		'owner': r.owner,
		'status': r.status,
	}


def risk_register(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)
	if _is_local_request(request):
		return JsonResponse([], safe=False)
	try:
		records = RiskRegisterItem.objects.using('ofsted_db').order_by('id')
		return JsonResponse([serialize_risk(r) for r in records], safe=False)
	except Exception as exc:
		if settings.DEBUG:
			return JsonResponse([], safe=False)
		return JsonResponse({'detail': str(exc)}, status=502)


ACTIVITY_ACTIVE_WINDOW_SECONDS = 60


def _pagination_params(request, *, default_size: int = 50, max_size: int = 200) -> tuple[int, int]:
	try:
		page = max(1, int(request.GET.get('page', '1')))
	except ValueError:
		page = 1
	try:
		page_size = max(1, min(int(request.GET.get('pageSize', str(default_size))), max_size))
	except ValueError:
		page_size = default_size
	return page, page_size


def _pagination_payload(*, page: int, page_size: int, total: int, returned: int) -> dict:
	total_pages = max(1, (total + page_size - 1) // page_size)
	return {
		'page': page,
		'pageSize': page_size,
		'totalItems': total,
		'totalPages': total_pages,
		'returnedItems': returned,
		'hasNext': page < total_pages,
		'hasPrevious': page > 1,
	}


def _session_display_login_at(session: UserActivitySession, now):
	login_at = session.login_at
	if not login_at:
		return None
	latest_allowed = session.last_seen_at or session.logout_at or now
	if latest_allowed and login_at > latest_allowed:
		return latest_allowed
	if login_at > now:
		return now
	return login_at


def serialize_user_activity_session(session: UserActivitySession, now=None) -> dict:
	now = now or timezone.now()
	display_login_at = _session_display_login_at(session, now)
	active_cutoff = now - timedelta(seconds=ACTIVITY_ACTIVE_WINDOW_SECONDS)
	is_active = bool(session.logout_at is None and session.last_seen_at and session.last_seen_at >= active_cutoff)
	visits = list(session.page_visits.all())
	current_visit = max(
		visits,
		key=lambda visit: (visit.last_seen_at or visit.first_seen_at, visit.id),
		default=None,
	) if is_active else None
	page_visits = [
		{
			'id': visit.id,
			'path': visit.path,
			'title': visit.title,
			'firstSeenAt': visit.first_seen_at.isoformat() if visit.first_seen_at else '',
			'lastSeenAt': visit.last_seen_at.isoformat() if visit.last_seen_at else '',
			'durationSeconds': visit.duration_seconds,
			'viewCount': visit.view_count,
		}
		for visit in sorted(visits, key=lambda visit: (-visit.duration_seconds, visit.path))
	]

	return {
		'id': session.id,
		'trackingSessionId': str(session.tracking_session_id),
		'userId': session.user_id,
		'username': session.username,
		'email': session.email,
		'displayName': session.display_name,
		'authProvider': session.auth_provider,
		'loginAt': display_login_at.isoformat() if display_login_at else '',
		'logoutAt': session.logout_at.isoformat() if session.logout_at else '',
		'lastSeenAt': session.last_seen_at.isoformat() if session.last_seen_at else '',
		'totalSeconds': session.total_seconds,
		'pageCount': session.page_count,
		'ipAddress': session.ip_address or '',
		'userAgent': session.user_agent,
		'logoutReason': session.logout_reason,
		'isActive': is_active,
		'currentPage': {
			'path': current_visit.path,
			'title': current_visit.title,
			'lastSeenAt': current_visit.last_seen_at.isoformat() if current_visit.last_seen_at else '',
		} if current_visit else None,
		'pageVisits': page_visits,
	}


def user_activity(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	search = str(request.GET.get('search', '')).strip()
	from_date = parse_date(str(request.GET.get('from', '')).strip()) if request.GET.get('from') else None
	to_date = parse_date(str(request.GET.get('to', '')).strip()) if request.GET.get('to') else None
	status = str(request.GET.get('status', 'all')).strip().lower()
	page, page_size = _pagination_params(request, default_size=25, max_size=100)

	base_records = UserActivitySession.objects.prefetch_related('page_visits').order_by('-last_seen_at', '-login_at')
	if search:
		base_records = base_records.filter(
			models.Q(email__icontains=search)
			| models.Q(username__icontains=search)
			| models.Q(display_name__icontains=search)
			| models.Q(page_visits__path__icontains=search)
		).distinct()
	if from_date:
		base_records = base_records.filter(last_seen_at__date__gte=from_date)
	if to_date:
		base_records = base_records.filter(last_seen_at__date__lte=to_date)

	now = timezone.now()
	active_cutoff = now - timedelta(seconds=ACTIVITY_ACTIVE_WINDOW_SECONDS)
	active_query = models.Q(logout_at__isnull=True, last_seen_at__gte=active_cutoff)
	active_count = base_records.filter(active_query).count()
	total_matching_before_status = base_records.count()

	records = base_records
	if status == 'active':
		records = records.filter(active_query)
	elif status in {'completed', 'not_active', 'inactive'}:
		records = records.filter(models.Q(logout_at__isnull=False) | models.Q(last_seen_at__lt=active_cutoff))

	total_sessions = records.count()
	total_pages = max(1, (total_sessions + page_size - 1) // page_size)
	page = min(page, total_pages)
	offset = (page - 1) * page_size
	sessions = list(records[offset:offset + page_size])
	total_seconds = sum(session.total_seconds for session in sessions)
	unique_users = len({(session.email or session.username or str(session.user_id)).lower() for session in sessions})
	total_page_views = sum(sum(visit.view_count for visit in session.page_visits.all()) for session in sessions)

	return JsonResponse(
		{
			'summary': {
				'totalSessions': total_sessions,
				'returnedSessions': len(sessions),
				'matchingSessions': total_matching_before_status,
				'activeSessions': active_count,
				'completedSessions': max(0, total_matching_before_status - active_count),
				'uniqueUsers': unique_users,
				'totalSeconds': total_seconds,
				'totalPageViews': total_page_views,
			},
			'pagination': _pagination_payload(page=page, page_size=page_size, total=total_sessions, returned=len(sessions)),
			'sessions': [serialize_user_activity_session(session, now) for session in sessions],
		}
	)


def serialize_audit_log(item: AuditLog) -> dict:
	return {
		'id': item.id,
		'action': item.action,
		'entity': item.entity,
		'objectId': item.object_id,
		'objectLabel': item.object_label,
		'userId': item.user_id,
		'username': item.username,
		'email': item.email,
		'displayName': item.display_name,
		'path': item.path,
		'method': item.method,
		'ipAddress': item.ip_address or '',
		'before': item.before,
		'after': item.after,
		'metadata': item.metadata,
		'createdAt': item.created_at.isoformat() if item.created_at else '',
	}


def audit_logs(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	search = str(request.GET.get('search', '')).strip()
	entity = str(request.GET.get('entity', '')).strip()
	action = str(request.GET.get('action', '')).strip()
	from_date = parse_date(str(request.GET.get('from', '')).strip()) if request.GET.get('from') else None
	to_date = parse_date(str(request.GET.get('to', '')).strip()) if request.GET.get('to') else None
	page, page_size = _pagination_params(request, default_size=25, max_size=100)

	records = AuditLog.objects.order_by('-created_at')
	if search:
		records = records.filter(
			models.Q(email__icontains=search)
			| models.Q(username__icontains=search)
			| models.Q(display_name__icontains=search)
			| models.Q(entity__icontains=search)
			| models.Q(object_label__icontains=search)
			| models.Q(path__icontains=search)
		)
	if entity:
		records = records.filter(entity__iexact=entity)
	if action:
		records = records.filter(action__iexact=action)
	if from_date:
		records = records.filter(created_at__date__gte=from_date)
	if to_date:
		records = records.filter(created_at__date__lte=to_date)

	total_logs = records.count()
	total_pages = max(1, (total_logs + page_size - 1) // page_size)
	page = min(page, total_pages)
	offset = (page - 1) * page_size
	logs = list(records[offset:offset + page_size])
	return JsonResponse(
		{
			'summary': {
				'totalLogs': total_logs,
				'returnedLogs': len(logs),
			},
			'pagination': _pagination_payload(page=page, page_size=page_size, total=total_logs, returned=len(logs)),
			'logs': [serialize_audit_log(item) for item in logs],
		}
	)
