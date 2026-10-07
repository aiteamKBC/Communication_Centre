from django.http import JsonResponse
from django.middleware.csrf import get_token

# /api/ paths that answer without a session: sign-in itself (each view checks what it needs), the health check
# and the employer survey link (a signed token in the URL).
PUBLIC_API_PREFIXES = ('/api/auth/', '/api/health/', '/api/callcentre/survey/')


class ApiLoginRequiredMiddleware:
	"""Every /api/ request needs the signed-in Django session that password and Microsoft sign-in start.

	Identity is the session (request.user), never ids or names the browser sends. Signed-in requests also get the
	CSRF cookie, which the frontend sends back as X-CSRFToken on every change.
	"""

	def __init__(self, get_response):
		self.get_response = get_response

	def __call__(self, request):
		if request.path.startswith('/api/') and not request.path.startswith(PUBLIC_API_PREFIXES):
			if not request.user.is_authenticated or not request.user.is_active:
				return JsonResponse({'detail': 'Sign in again to continue.'}, status=401)
			get_token(request)
		return self.get_response(request)
