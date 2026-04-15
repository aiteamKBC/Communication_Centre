import base64
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core import signing
from django.db.models import Q
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseRedirect, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .access import get_user_access_payload


MICROSOFT_SCOPE = 'openid profile email User.Read'


def _ms_authority_base() -> str:
	tenant = os.getenv('MS_TENANT_ID', 'common').strip() or 'common'
	return f'https://login.microsoftonline.com/{tenant}/oauth2/v2.0'


def _frontend_login_url() -> str:
	return os.getenv('MS_FRONTEND_LOGIN_URL', 'http://localhost:3000/login').strip()


def _frontend_popup_url() -> str:
	return os.getenv('MS_FRONTEND_POPUP_URL', 'http://localhost:3000/login/microsoft-popup').strip()


def _redirect_to_url(base: str, params: dict[str, str]) -> HttpResponseRedirect:
	separator = '&' if '?' in base else '?'
	return HttpResponseRedirect(f'{base}{separator}{urlencode(params)}')


def _redirect_to_frontend_login(params: dict[str, str]) -> HttpResponseRedirect:
	return _redirect_to_url(_frontend_login_url(), params)


def _encode_user_payload(payload: dict) -> str:
	encoded = base64.urlsafe_b64encode(json.dumps(payload).encode('utf-8')).decode('utf-8')
	return encoded.rstrip('=')


def _decode_json_response(error: HTTPError) -> dict:
	try:
		body = error.read().decode('utf-8')
		return json.loads(body)
	except Exception:
		return {}


def microsoft_popup_bridge(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	html = """<!doctype html>
<html lang=\"en\">
	<head>
		<meta charset=\"utf-8\" />
		<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
		<title>Microsoft Sign-in</title>
		<style>
			body {
				margin: 0;
				font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
				background: #f8fafc;
				color: #475569;
				min-height: 100vh;
				display: grid;
				place-items: center;
			}
			.card {
				background: #ffffff;
				border: 1px solid #e2e8f0;
				border-radius: 12px;
				padding: 16px 18px;
				font-size: 14px;
			}
		</style>
	</head>
	<body>
		<div class=\"card\">Completing Microsoft sign-in...</div>
		<script>
			(function () {
				var params = new URLSearchParams(window.location.search || "");
				var payload = {
					ms_auth: params.get("ms_auth"),
					ms_user: params.get("ms_user"),
					ms_error: params.get("ms_error")
				};

				try {
					window.localStorage.setItem("kbc-ms-auth-result", JSON.stringify(payload));
				} catch (e) {
					// Ignore storage failures and still try postMessage.
				}

				if (window.opener && !window.opener.closed) {
					window.opener.postMessage(
						{
							source: "kbc-ms-auth",
							ms_auth: payload.ms_auth,
							ms_user: payload.ms_user,
							ms_error: payload.ms_error
						},
						"*"
					);
				}

				window.setTimeout(function () {
					window.close();
				}, 150);
			})();
		</script>
	</body>
</html>
"""

	return HttpResponse(html)


@csrf_exempt
def login_view(request):
	if request.method != 'POST':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	try:
		payload = json.loads(request.body.decode('utf-8') or '{}')
	except json.JSONDecodeError:
		return HttpResponseBadRequest('Invalid JSON payload.')

	identifier = str(payload.get('identifier', '')).strip()
	password = str(payload.get('password', ''))
	if not identifier or not password:
		return HttpResponseBadRequest('identifier and password are required.')

	user_model = get_user_model()
	queryset = user_model.objects.using('login_db')
	user = queryset.filter(email__iexact=identifier).first()
	if user is None:
		user = queryset.filter(username__iexact=identifier).first()

	if not user or not check_password(password, user.password) or not user.is_active:
		return JsonResponse({'detail': 'Invalid credentials.'}, status=401)

	return JsonResponse(
		{
			'id': user.id,
			'username': user.username,
			'email': user.email,
			'firstName': user.first_name,
			'lastName': user.last_name,
			'isStaff': bool(user.is_staff),
			'isSuperuser': bool(user.is_superuser),
			'access': get_user_access_payload(user),
		}
	)


@csrf_exempt
def logout_view(request):
	if request.method != 'POST':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	return JsonResponse({'detail': 'Logged out.'})


def access_view(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	user_id = str(request.GET.get('userId', '')).strip()
	email = str(request.GET.get('email', '')).strip()
	username = str(request.GET.get('username', '')).strip()

	if not user_id and not email and not username:
		return HttpResponseBadRequest('Provide one of userId, email, or username.')

	user_model = get_user_model()
	queryset = user_model.objects.using('login_db')
	user = None

	if user_id:
		try:
			user = queryset.filter(pk=int(user_id)).first()
		except ValueError:
			user = None

	if user is None and email:
		user = queryset.filter(email__iexact=email).first()

	if user is None and username:
		user = queryset.filter(username__iexact=username).first()

	if user is None:
		return JsonResponse({'detail': 'User not found.'}, status=404)

	group_names = list(user.groups.using('login_db').values_list('name', flat=True))
	return JsonResponse(
		{
			'id': user.id,
			'username': user.username,
			'email': user.email,
			'isStaff': bool(user.is_staff),
			'isSuperuser': bool(user.is_superuser),
			'groups': group_names,
			'access': get_user_access_payload(user),
		}
	)


def microsoft_start(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	client_id = os.getenv('MS_CLIENT_ID', '').strip()
	redirect_uri = os.getenv('MS_REDIRECT_URI', '').strip()
	if not client_id or not redirect_uri:
		return JsonResponse(
			{'detail': 'Microsoft SSO is not configured. Missing MS_CLIENT_ID or MS_REDIRECT_URI.'},
			status=500,
		)

	is_popup = request.GET.get('popup') == '1'
	state = signing.dumps({'provider': 'microsoft', 'popup': is_popup}, salt='ms-oauth-state')
	query = urlencode(
		{
			'client_id': client_id,
			'response_type': 'code',
			'redirect_uri': redirect_uri,
			'response_mode': 'query',
			'scope': MICROSOFT_SCOPE,
			'state': state,
		}
	)
	return HttpResponseRedirect(f'{_ms_authority_base()}/authorize?{query}')


def microsoft_callback(request):
	if request.method != 'GET':
		return JsonResponse({'detail': 'Method not allowed.'}, status=405)

	code = request.GET.get('code', '')
	state = request.GET.get('state', '')
	if not state:
		return _redirect_to_frontend_login({'ms_auth': 'error', 'ms_error': 'Missing OAuth state.'})

	try:
		state_payload = signing.loads(state, salt='ms-oauth-state', max_age=900)
	except signing.BadSignature:
		return _redirect_to_frontend_login({'ms_auth': 'error', 'ms_error': 'Invalid OAuth state.'})
	except signing.SignatureExpired:
		return _redirect_to_frontend_login({'ms_auth': 'error', 'ms_error': 'Microsoft sign-in timed out. Please try again.'})

	is_popup = bool(state_payload.get('popup')) if isinstance(state_payload, dict) else False
	result_target = _frontend_popup_url() if is_popup else _frontend_login_url()

	if request.GET.get('error'):
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': request.GET.get('error_description', 'Microsoft sign-in was cancelled.')})

	if not code:
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': 'Missing OAuth callback code.'})

	client_id = os.getenv('MS_CLIENT_ID', '').strip()
	client_secret = os.getenv('MS_CLIENT_SECRET', '').strip()
	redirect_uri = os.getenv('MS_REDIRECT_URI', '').strip()
	if not client_id or not client_secret or not redirect_uri:
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': 'Microsoft SSO env variables are incomplete.'})

	token_payload = urlencode(
		{
			'client_id': client_id,
			'client_secret': client_secret,
			'grant_type': 'authorization_code',
			'code': code,
			'redirect_uri': redirect_uri,
			'scope': MICROSOFT_SCOPE,
		}
	).encode('utf-8')

	try:
		token_request = Request(
			f'{_ms_authority_base()}/token',
			data=token_payload,
			headers={'Content-Type': 'application/x-www-form-urlencoded'},
			method='POST',
		)
		with urlopen(token_request, timeout=15) as response:
			token_data = json.loads(response.read().decode('utf-8'))
	except HTTPError as error:
		error_data = _decode_json_response(error)
		message = (
			error_data.get('error_description')
			or error_data.get('error')
			or 'Could not complete Microsoft sign-in.'
		)
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': message})
	except URLError:
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': 'Unable to reach Microsoft login services.'})

	access_token = token_data.get('access_token', '')
	if not access_token:
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': 'Missing access token from Microsoft.'})

	try:
		profile_request = Request(
			'https://graph.microsoft.com/v1.0/me',
			headers={'Authorization': f'Bearer {access_token}'},
			method='GET',
		)
		with urlopen(profile_request, timeout=15) as response:
			profile = json.loads(response.read().decode('utf-8'))
	except HTTPError as error:
		error_data = _decode_json_response(error)
		message = error_data.get('error', {}).get('message') or 'Failed to load Microsoft profile.'
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': message})
	except URLError:
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': 'Could not fetch profile from Microsoft Graph.'})

	email = (profile.get('mail') or profile.get('userPrincipalName') or '').strip()
	if not email:
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': 'Microsoft profile did not include an email address.'})

	display_name = (profile.get('displayName') or '').strip()
	first_name = display_name.split(' ')[0] if display_name else ''
	last_name = ' '.join(display_name.split(' ')[1:]) if display_name and len(display_name.split(' ')) > 1 else ''

	user_model = get_user_model()
	db_user = user_model.objects.using('login_db').filter(email__iexact=email, is_active=True).first()
	
	if not db_user:
		return _redirect_to_url(result_target, {'ms_auth': 'error', 'ms_error': "This email isn't in the database."})

	user_payload = {
		'id': db_user.id,
		'username': db_user.username,
		'email': db_user.email,
		'firstName': db_user.first_name or first_name,
		'lastName': db_user.last_name or last_name,
		'isStaff': bool(db_user.is_staff),
		'isSuperuser': bool(db_user.is_superuser),
		'authProvider': 'microsoft',
		'access': get_user_access_payload(db_user),
	}

	return _redirect_to_url(result_target, {'ms_auth': 'success', 'ms_user': _encode_user_payload(user_payload)})
