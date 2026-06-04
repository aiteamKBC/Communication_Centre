import base64
import hashlib
import json
import os
import re
import time
import uuid
from datetime import date, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from urllib.request import ProxyHandler, Request, build_opener

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import HttpResponseBadRequest, JsonResponse, StreamingHttpResponse
from django.db import models, transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.dateparse import parse_date

from .models import AuditLog, Employee, EventData, Feedback, KsbProfile, LeadershipMessage, Module, News, RiskRegisterItem, SupportTicket, TrainingPlan, TrainingPlanHoliday, TrainingPlanModuleDefinition, TrainingPlanProgramConfig, UrgentNotice, UserActivitySession


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

	file_url = _save_uploaded_image(uploaded_file, folder)
	_audit_log(request, action='upload', entity='Image', object_label=str(getattr(uploaded_file, 'name', '') or 'upload'), after={'url': file_url, 'folder': folder})
	return JsonResponse({'url': file_url}, status=201)


def serialize_training_plan(item: TrainingPlan) -> dict:
	return {
		'id': int(item.id),
		'cohortName': item.cohort_name,
		'program': item.program,
		'startingDateLabel': item.starting_date_lable,
		'moduleName': item.module_name,
		'groupName': item.group_name,
		'coachName': item.coach_name,
		'tutorName': item.tutor_name,
		'startDate': item.start_date,
		'endDate': item.end_date,
		'sessionsNumber': item.sessions_number,
		'sessionWeekDay': item.session_week_day,
		'sessionStartTime': item.session_start_time,
		'sessionEndTime': item.session_end_time,
		'sessionKsbMappings': normalize_session_ksb_mappings(getattr(item, 'session_ksb_json', '')),
		'ksbProfileId': str(item.ksb_profile_id) if getattr(item, 'ksb_profile_id', None) else '',
		'notes': item.notes,
	}


TRAINING_PLAN_PARTIAL_SAVE_MIN_CURRENT = 100
TRAINING_PLAN_PARTIAL_SAVE_RATIO = 0.75


def training_plan_queryset():
	return TrainingPlan.objects.all().order_by('id')


def training_plan_items_snapshot() -> list[dict]:
	return [serialize_training_plan(item) for item in training_plan_queryset()]


def training_plan_version(items: list[dict] | None = None) -> str:
	records = items if items is not None else training_plan_items_snapshot()
	version_payload = [
		_without_keys(item, {'id'})
		for item in records
	]
	return hashlib.sha256(json.dumps(version_payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')).hexdigest()


def training_plan_recovery_confirmed(request, payload: dict) -> bool:
	if payload.get('confirmAdminRecovery') is not True:
		return False
	expected_token = os.getenv('TRAINING_PLAN_RECOVERY_TOKEN', '').strip()
	submitted_token = _header_text(request, 'X-KBC-Admin-Recovery-Token')
	return bool(expected_token and submitted_token and submitted_token == expected_token)


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


def training_plan_values_from_payload_row(row: dict, index: int) -> tuple[dict, str]:
	cohort_name = str(row.get('cohortName', '')).strip()
	program = str(row.get('program', '')).strip()
	module_name = str(row.get('moduleName', '')).strip()
	start_date = str(row.get('startDate', '')).strip()
	end_date = str(row.get('endDate', '')).strip()
	sessions_number = str(row.get('sessionsNumber', '')).strip()

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

	return {
		'cohort_name': cohort_name,
		'program': program,
		'starting_date_lable': str(row.get('startingDateLabel', '')).strip(),
		'module_name': module_name,
		'group_name': str(row.get('groupName', '')).strip(),
		'coach_name': str(row.get('coachName', '')).strip(),
		'tutor_name': str(row.get('tutorName', '')).strip(),
		'start_date': start_date,
		'end_date': end_date,
		'sessions_number': sessions_number,
		'session_week_day': str(row.get('sessionWeekDay', '')).strip(),
		'session_start_time': str(row.get('sessionStartTime', '')).strip(),
		'session_end_time': str(row.get('sessionEndTime', '')).strip(),
		'session_ksb_json': json.dumps(normalize_session_ksb_mappings(row.get('sessionKsbMappings', [])), ensure_ascii=False),
		'ksb_profile_id': normalize_nullable_int(row.get('ksbProfileId', None)),
		'notes': str(row.get('notes', '')).strip(),
	}, ''


KSB_CODE_PATTERNS = {
	'knowledgeCodes': re.compile(r'^K\d+$', re.IGNORECASE),
	'skillCodes': re.compile(r'^S\d+$', re.IGNORECASE),
	'behaviourCodes': re.compile(r'^B\d+$', re.IGNORECASE),
}


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
		number = str(item.get('number', '')).strip()
		if not number.isdigit():
			code = str(item.get('code', '')).strip().upper()
			match = re.match(rf'^{item_type}(\d+)$', code)
			number = match.group(1) if match else ''
		if not number:
			continue
		code = f'{item_type}{int(number)}'
		if code in seen:
			continue
		seen.add(code)
		items.append({
			'type': item_type,
			'number': str(int(number)),
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


def serialize_training_plan_holiday_type(item: TrainingPlanHoliday) -> dict:
	label = item.label[len(TRAINING_PLAN_HOLIDAY_TYPE_MARKER):].strip() if item.label.startswith(TRAINING_PLAN_HOLIDAY_TYPE_MARKER) else (item.type or 'holiday')
	return {
		'id': str(item.id),
		'value': item.type or 'holiday',
		'label': label,
		'color': item.color or TRAINING_PLAN_HOLIDAY_COLORS.get(item.type or 'holiday', '#FFFBEB'),
	}


def serialize_training_plan_module_definition(item: TrainingPlanModuleDefinition) -> dict:
	return {
		'id': item.module_id,
		'name': item.name,
		'defaultSessions': int(item.default_sessions),
		'bg': item.bg,
		'tx': item.tx,
	}


def serialize_training_plan_program_config(item: TrainingPlanProgramConfig) -> dict:
	return {
		'id': item.program_id,
		'name': item.name,
		'sub': item.sub,
		'color': item.color,
	}


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
		items = training_plan_items_snapshot()
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
		if not isinstance(items, list):
			audit_training_plan_rejection(request, reason='Payload must include an items array.', status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return HttpResponseBadRequest('Payload must include an items array.')

		recovery_confirmed = training_plan_recovery_confirmed(request, payload if isinstance(payload, dict) else {})

		if not submitted_version:
			reason = 'Reload the latest Training Plan before saving. This prevents an older page from overwriting newer timeline data.'
			audit_training_plan_rejection(request, reason=reason, status_code=409, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse({'detail': reason, 'currentVersion': current_version, 'items': current_items}, status=409)

		if submitted_version != current_version:
			reason = 'The Training Plan was updated by someone else. Please reload and review before saving.'
			audit_training_plan_rejection(request, reason=reason, status_code=409, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse({'detail': reason, 'currentVersion': current_version, 'items': current_items}, status=409)

		if not items and not recovery_confirmed:
			audit_training_plan_rejection(request, reason='Empty Training Plan saves are not allowed.', status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
			return JsonResponse({'detail': 'Empty Training Plan saves are not allowed.'}, status=400)

		current_count = len(current_items)
		if (
			not recovery_confirmed
			and current_count >= TRAINING_PLAN_PARTIAL_SAVE_MIN_CURRENT
			and incoming_count is not None
			and incoming_count < int(current_count * TRAINING_PLAN_PARTIAL_SAVE_RATIO)
		):
			reason = 'Suspicious partial Training Plan save rejected.'
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
				audit_training_plan_rejection(request, reason=reason, status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
				return JsonResponse({'detail': reason}, status=400)
			values, error = training_plan_values_from_payload_row(row, index)
			if error:
				audit_training_plan_rejection(request, reason=error, status_code=400, current_items=current_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=current_version)
				return JsonResponse({'detail': error}, status=400)
			validated_items.append(values)

		with transaction.atomic():
			locked_items = [serialize_training_plan(item) for item in TrainingPlan.objects.select_for_update().order_by('id')]
			locked_version = training_plan_version(locked_items)
			if submitted_version != locked_version:
				reason = 'The Training Plan was updated by someone else. Please reload and review before saving.'
				audit_training_plan_rejection(request, reason=reason, status_code=409, current_items=locked_items, incoming_count=incoming_count, submitted_version=submitted_version, current_version=locked_version)
				return JsonResponse({'detail': reason, 'currentVersion': locked_version, 'items': locked_items}, status=409)

			TrainingPlan.objects.all().delete()
			created = [
				TrainingPlan.objects.create(**item)
				for item in validated_items
			]

		after_items = [serialize_training_plan(item) for item in created]
		next_version = training_plan_version(after_items)
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
def ksb_profiles(request):
	if request.method == 'GET':
		include_inactive = str(request.GET.get('includeInactive', '')).lower() in {'1', 'true', 'yes'}
		records = KsbProfile.objects.all() if include_inactive else KsbProfile.objects.filter(is_active=True)
		return JsonResponse([serialize_ksb_profile(item) for item in records.order_by('name', 'id')], safe=False)

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

		items = payload.get('items') if isinstance(payload, dict) else None
		if not isinstance(items, list):
			return HttpResponseBadRequest('Payload must include an items array.')
		submitted_version = str(payload.get('version', '') or '').strip() if isinstance(payload, dict) else ''

		validated_items = []
		invalid_count = 0
		for row in items:
			if not isinstance(row, dict):
				invalid_count += 1
				continue

			label = str(row.get('label', '')).strip()
			start_date = parse_date(str(row.get('startDate', '')).strip())
			end_date = parse_date(str(row.get('endDate', '')).strip())
			holiday_type = str(row.get('type', 'holiday')).strip() or 'holiday'
			color = str(row.get('color', '')).strip() or TRAINING_PLAN_HOLIDAY_COLORS.get(holiday_type, '#FFFBEB')

			if not label or start_date is None or end_date is None:
				invalid_count += 1
				continue

			if end_date < start_date:
				invalid_count += 1
				continue

			validated_items.append({
				'label': label,
				'start_date': start_date,
				'end_date': end_date,
				'type': holiday_type,
				'color': color,
			})

		if invalid_count:
			return JsonResponse(
				{
					'detail': 'Some holiday periods were invalid and were not saved.',
					'saved': 0,
					'received': len(items),
				},
				status=400,
			)

		current_version = training_plan_holidays_version()
		current_items = [serialize_training_plan_holiday(item) for item in training_plan_holidays_queryset().order_by('id')]
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

		before = current_items
		with transaction.atomic():
			TrainingPlanHoliday.objects.exclude(label__startswith=TRAINING_PLAN_HOLIDAY_TYPE_MARKER).delete()
			created = [
				TrainingPlanHoliday.objects.create(
					label=item['label'],
					start_date=item['start_date'],
					end_date=item['end_date'],
					type=item['type'],
					color=item['color'],
				)
				for item in validated_items
			]

		after = [serialize_training_plan_holiday(item) for item in created]
		_audit_log(request, action='replace', entity='TrainingPlanHoliday', object_label='Training Plan holidays', before=before, after=after, metadata={'received': len(items)})
		return JsonResponse({
			'saved': len(created),
			'items': after,
			'version': training_plan_holidays_version(),
		})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_holiday_types(request):
	if request.method == 'GET':
		records = TrainingPlanHoliday.objects.filter(label__startswith=TRAINING_PLAN_HOLIDAY_TYPE_MARKER).order_by('type', 'id')
		return JsonResponse([serialize_training_plan_holiday_type(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		type_value = str(payload.get('value', '')).strip()
		label = str(payload.get('label', '')).strip()
		color = str(payload.get('color', '')).strip() or TRAINING_PLAN_HOLIDAY_COLORS.get(type_value, '#FFFBEB')

		if not type_value or not label:
			return HttpResponseBadRequest('Both value and label are required.')

		record, _ = TrainingPlanHoliday.objects.update_or_create(
			type=type_value,
			label=f'{TRAINING_PLAN_HOLIDAY_TYPE_MARKER}{label}',
			defaults={
				'start_date': TRAINING_PLAN_HOLIDAY_TYPE_DATE,
				'end_date': TRAINING_PLAN_HOLIDAY_TYPE_DATE,
				'color': color,
			},
		)
		_audit_log(request, action='create', entity='TrainingPlanHolidayType', object_id=record.id, object_label=label, after=serialize_training_plan_holiday_type(record))
		return JsonResponse(serialize_training_plan_holiday_type(record), status=201)

	if request.method == 'PATCH':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		type_value = str(payload.get('value', '')).strip()
		label = str(payload.get('label', '')).strip()
		color = str(payload.get('color', '')).strip()

		if not type_value or not label:
			return HttpResponseBadRequest('Both value and label are required.')

		try:
			record = TrainingPlanHoliday.objects.get(
				type=type_value,
				label__startswith=TRAINING_PLAN_HOLIDAY_TYPE_MARKER,
			)
		except TrainingPlanHoliday.DoesNotExist:
			return JsonResponse({'detail': 'Holiday type not found.'}, status=404)

		before = serialize_training_plan_holiday_type(record)
		record.label = f'{TRAINING_PLAN_HOLIDAY_TYPE_MARKER}{label}'
		if color:
			record.color = color
		record.save(update_fields=['label', 'color'])
		_audit_log(request, action='update', entity='TrainingPlanHolidayType', object_id=record.id, object_label=label, before=before, after=serialize_training_plan_holiday_type(record))
		return JsonResponse(serialize_training_plan_holiday_type(record))

	if request.method == 'DELETE':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		if not isinstance(payload, dict):
			return HttpResponseBadRequest('Payload must be an object.')

		type_value = str(payload.get('value', '')).strip()
		if not type_value:
			return HttpResponseBadRequest('value is required.')

		records = list(TrainingPlanHoliday.objects.filter(
			type=type_value,
			label__startswith=TRAINING_PLAN_HOLIDAY_TYPE_MARKER,
		))
		before = [serialize_training_plan_holiday_type(record) for record in records]
		deleted, _ = TrainingPlanHoliday.objects.filter(pk__in=[record.pk for record in records]).delete()
		if not deleted:
			return JsonResponse({'detail': 'Holiday type not found.'}, status=404)
		_audit_log(request, action='delete', entity='TrainingPlanHolidayType', object_label=type_value, before=before)
		return JsonResponse({'deleted': True})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_modules(request):
	if request.method == 'GET':
		records = TrainingPlanModuleDefinition.objects.all().order_by('name', 'id')
		return JsonResponse([serialize_training_plan_module_definition(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		items = payload.get('items') if isinstance(payload, dict) else None
		if not isinstance(items, list):
			return HttpResponseBadRequest('Payload must include an items array.')

		validated_items = []
		for row in items:
			if not isinstance(row, dict):
				continue

			module_id = str(row.get('id', '')).strip()
			name = str(row.get('name', '')).strip()
			bg = str(row.get('bg', '')).strip() or '#4A6DB0'
			tx = str(row.get('tx', '')).strip() or '#ffffff'
			try:
				default_sessions = max(1, int(row.get('defaultSessions', 1) or 1))
			except (TypeError, ValueError):
				default_sessions = 1

			if not module_id or not name:
				continue

			validated_items.append({
				'module_id': module_id,
				'name': name,
				'default_sessions': default_sessions,
				'bg': bg,
				'tx': tx,
			})

		before = [serialize_training_plan_module_definition(item) for item in TrainingPlanModuleDefinition.objects.all().order_by('id')]
		with transaction.atomic():
			TrainingPlanModuleDefinition.objects.all().delete()
			created = [
				TrainingPlanModuleDefinition.objects.create(**item)
				for item in validated_items
			]

		after = [serialize_training_plan_module_definition(item) for item in created]
		_audit_log(request, action='replace', entity='TrainingPlanModuleDefinition', object_label='Training Plan module catalogue', before=before, after=after, metadata={'received': len(items)})
		return JsonResponse({
			'saved': len(created),
			'items': after,
		})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_program_configs(request):
	if request.method == 'GET':
		records = TrainingPlanProgramConfig.objects.all().order_by('program_id', 'id')
		return JsonResponse([serialize_training_plan_program_config(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		items = payload.get('items') if isinstance(payload, dict) else None
		if not isinstance(items, list):
			return HttpResponseBadRequest('Payload must include an items array.')

		validated_items = []
		for row in items:
			if not isinstance(row, dict):
				continue

			program_id = str(row.get('id', '')).strip()
			name = str(row.get('name', '')).strip()
			if not program_id or not name:
				continue

			validated_items.append({
				'program_id': program_id,
				'name': name,
				'sub': str(row.get('sub', '')).strip(),
				'color': str(row.get('color', '')).strip() or '#1B2A4A',
			})

		before = [serialize_training_plan_program_config(item) for item in TrainingPlanProgramConfig.objects.all().order_by('id')]
		with transaction.atomic():
			TrainingPlanProgramConfig.objects.all().delete()
			created = [
				TrainingPlanProgramConfig.objects.create(**item)
				for item in validated_items
			]

		after = [serialize_training_plan_program_config(item) for item in created]
		_audit_log(request, action='replace', entity='TrainingPlanProgramConfig', object_label='Training Plan programme config', before=before, after=after, metadata={'received': len(items)})
		return JsonResponse({
			'saved': len(created),
			'items': after,
		})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


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


def documents_live(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	client_id = _get_env_first('MS_Policies_client_id', 'MS_Policies_clint_id', 'MS_POLICIES_CLIENT_ID')
	client_secret = _get_env_first('MS_Policies_client_secret', 'MS_POLICIES_CLIENT_SECRET')
	tenant_id = _get_env_first('MS_Policies_tenant_id', 'MS_POLICIES_TENANT_ID')
	policies_url = _get_env_first('MS_Policies_FILE', 'MS_POLICIES_FILE')

	if not client_id or not client_secret or not tenant_id or not policies_url:
		return JsonResponse(
			{'detail': 'Missing Microsoft Policies configuration in environment variables.'},
			status=500,
		)

	try:
		host, site_path, drive_path = _parse_policies_folder_url(policies_url)

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

		tree = _build_drive_tree(site_id, root_item, access_token)

		return JsonResponse(
			{
				'fetchedAt': datetime.utcnow().isoformat() + 'Z',
				'source': {
					'host': host,
					'sitePath': site_path,
					'drivePath': drive_path,
					'siteName': site_data.get('displayName', ''),
					'siteWebUrl': site_data.get('webUrl', ''),
					'folderWebUrl': root_item.get('webUrl', ''),
				},
				'root': tree,
			}
		)
	except ValueError as error:
		return JsonResponse({'detail': str(error)}, status=400)
	except RuntimeError as error:
		return JsonResponse({'detail': str(error)}, status=502)
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
		before = serialize_employee(emp)
		object_label = emp.full_name
		# Re-parent direct reports to this employee's manager
		Employee.objects.filter(reports_to=str(employee_id)).update(
			reports_to=emp.reports_to
		)
		emp.delete()
		_audit_log(request, action='delete', entity='Employee', object_id=employee_id, object_label=object_label, before=before)
		return JsonResponse({'detail': 'Deleted.'})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


# ── Safeguarding urgent tickets ───────────────────────────────────────────────

def serialize_support_ticket(t: SupportTicket) -> dict:
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
	}


def urgent_tickets(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)
	try:
		records = SupportTicket.objects.using('safeguarding_db').filter(
			urgency__iexact='urgent'
		).order_by('-created_at')
		return JsonResponse([serialize_support_ticket(t) for t in records], safe=False)
	except Exception as exc:
		return JsonResponse({'detail': str(exc)}, status=502)


# ── Risk register ─────────────────────────────────────────────────────────────

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
	try:
		records = RiskRegisterItem.objects.using('ofsted_db').order_by('id')
		return JsonResponse([serialize_risk(r) for r in records], safe=False)
	except Exception as exc:
		return JsonResponse({'detail': str(exc)}, status=502)


ACTIVITY_ACTIVE_WINDOW_SECONDS = 7


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
