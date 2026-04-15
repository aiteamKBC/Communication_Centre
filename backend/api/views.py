import base64
import json
import os
from datetime import date, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
from urllib.request import ProxyHandler, Request, build_opener

from django.http import HttpResponseBadRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.dateparse import parse_date

from .models import EventData, Feedback, News, TrainingPlan, TrainingPlanHoliday


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
		)
		return JsonResponse(serialize_event(event), status=201)

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
	requires_ack = priority == 'critical'
	status = (item.status or '').strip().lower()
	return {
		'id': str(item.id),
		'title': item.title,
		'excerpt': item.summary or item.details or '',
		'audience': item.audience or 'All Staff',
		'department': item.category or 'General',
		'priority': priority,
		'date': format_date_display(item.publication_date),
		'requiresAcknowledgement': requires_ack,
		'isExpired': status == 'expired',
		'acknowledged': bool(item.acknowledged),
		'image': item.image_url or None,
		'category': item.category or 'General',
		'author': 'Communications Team',
		'content': item.full_article_content or item.details or item.summary or '',
	}


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

		record = News.objects.create(
			title=title,
			details=str(payload.get('details', '')).strip() or summary,
			image_url=str(payload.get('imageUrl', '')).strip(),
			publication_date=publication_date,
			audience=str(payload.get('audience', 'All Staff')).strip() or 'All Staff',
			category=str(payload.get('category', 'General')).strip() or 'General',
			priority=normalize_priority(str(payload.get('priority', 'general'))),
			summary=summary,
			full_article_content=str(payload.get('content', '')).strip(),
			status='pending_review',
		)

		return JsonResponse(serialize_news(record), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def acknowledge_news(request, news_id: int):
	"""PATCH /api/news/<id>/acknowledge/  — toggle acknowledged flag and persist to DB."""
	if request.method != 'PATCH':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	try:
		item = News.objects.get(pk=news_id)
	except News.DoesNotExist:
		return JsonResponse({'detail': 'News item not found.'}, status=404)

	try:
		payload = json.loads(request.body.decode('utf-8') or '{}')
	except json.JSONDecodeError:
		return HttpResponseBadRequest('Invalid JSON payload.')

	# Accept explicit value or toggle current
	if 'acknowledged' in payload:
		item.acknowledged = bool(payload['acknowledged'])
	else:
		item.acknowledged = not item.acknowledged

	item.save(update_fields=['acknowledged'])
	return JsonResponse(serialize_news(item))


def serialize_training_plan(item: TrainingPlan) -> dict:
	return {
		'id': int(item.id),
		'cohortName': item.cohort_name,
		'program': item.program,
		'startingDateLabel': item.starting_date_lable,
		'moduleName': item.module_name,
		'tutorName': item.tutor_name,
		'startDate': item.start_date,
		'endDate': item.end_date,
		'sessionsNumber': item.sessions_number,
		'sessionWeekDay': item.session_week_day,
		'sessionStartTime': item.session_start_time,
		'sessionEndTime': item.session_end_time,
		'notes': item.notes,
	}


TRAINING_PLAN_HOLIDAY_COLORS = {
	'bank-holiday': '#F0FFF4',
	'term-break': '#E8F4FD',
	'non-teaching': '#FFF0F0',
	'holiday': '#FFFBEB',
}


def serialize_training_plan_holiday(item: TrainingPlanHoliday) -> dict:
	return {
		'id': str(item.id),
		'label': item.label,
		'startDate': item.start_date.isoformat(),
		'endDate': item.end_date.isoformat(),
		'type': item.type or 'holiday',
		'color': item.color or TRAINING_PLAN_HOLIDAY_COLORS.get(item.type or 'holiday', '#FFFBEB'),
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

		return JsonResponse(serialize_feedback(record), status=201)

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


def training_plan(request):
	if request.method == 'GET':
		records = TrainingPlan.objects.all().order_by('id')
		return JsonResponse([serialize_training_plan(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		items = payload.get('items') if isinstance(payload, dict) else None
		if not isinstance(items, list):
			return HttpResponseBadRequest('Payload must include an items array.')

		# If client posted an empty list, do not clear the table — ignore to avoid accidental wipe.
		if len(items) == 0:
			return JsonResponse({'saved': 0})

		# Replace table content with the latest timeline state from the frontend.
		TrainingPlan.objects.all().delete()
		created = []
		for row in items:
			if not isinstance(row, dict):
				continue
			created.append(
				TrainingPlan.objects.create(
					cohort_name=str(row.get('cohortName', '')).strip(),
					program=str(row.get('program', '')).strip(),
					starting_date_lable=str(row.get('startingDateLabel', '')).strip(),
					module_name=str(row.get('moduleName', '')).strip(),
					tutor_name=str(row.get('tutorName', '')).strip(),
					start_date=str(row.get('startDate', '')).strip(),
					end_date=str(row.get('endDate', '')).strip(),
					sessions_number=str(row.get('sessionsNumber', '')).strip(),
					session_week_day=str(row.get('sessionWeekDay', '')).strip(),
					session_start_time=str(row.get('sessionStartTime', '')).strip(),
					session_end_time=str(row.get('sessionEndTime', '')).strip(),
					notes=str(row.get('notes', '')).strip(),
				)
			)

		return JsonResponse({'saved': len(created)})

	return JsonResponse({'detail': 'Method not allowed.'}, status=405)


@csrf_exempt
def training_plan_holidays(request):
	if request.method == 'GET':
		records = TrainingPlanHoliday.objects.all().order_by('start_date', 'end_date', 'id')
		return JsonResponse([serialize_training_plan_holiday(item) for item in records], safe=False)

	if request.method == 'POST':
		try:
			payload = json.loads(request.body.decode('utf-8') or '{}')
		except json.JSONDecodeError:
			return HttpResponseBadRequest('Invalid JSON payload.')

		items = payload.get('items') if isinstance(payload, dict) else None
		if not isinstance(items, list):
			return HttpResponseBadRequest('Payload must include an items array.')

		TrainingPlanHoliday.objects.all().delete()
		created = []
		for row in items:
			if not isinstance(row, dict):
				continue

			label = str(row.get('label', '')).strip()
			start_date = parse_date(str(row.get('startDate', '')).strip())
			end_date = parse_date(str(row.get('endDate', '')).strip())
			holiday_type = str(row.get('type', 'holiday')).strip() or 'holiday'
			color = str(row.get('color', '')).strip() or TRAINING_PLAN_HOLIDAY_COLORS.get(holiday_type, '#FFFBEB')

			if not label or start_date is None or end_date is None:
				continue

			if end_date < start_date:
				continue

			created.append(
				TrainingPlanHoliday.objects.create(
					label=label,
					start_date=start_date,
					end_date=end_date,
					type=holiday_type,
					color=color,
				)
			)

		return JsonResponse({'saved': len(created)})

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
