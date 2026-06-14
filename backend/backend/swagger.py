import inspect
import re
from typing import Any

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.urls import URLPattern, URLResolver, get_resolver


HTTP_METHODS = ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
MUTATING_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
METHOD_ORDER = {method.lower(): index for index, method in enumerate(HTTP_METHODS)}

TAG_DEFINITIONS = [
    ('Authentication & Access', 'Login, logout, Microsoft sign-in, access checks, and activity heartbeat endpoints.'),
    ('User Activity & Audit', 'Session tracking, page visits, and auditable change history.'),
    ('Events', 'Institutional events, cover media, registrations, and event lifecycle operations.'),
    ('News & Announcements', 'Internal news and announcement publishing workflows.'),
    ('Leadership & Urgent Comms', 'Leadership messages and urgent notice communication surfaces.'),
    ('Training Plan Timeline', 'Core training plan timeline data used by the operational dashboard.'),
    ('Training Plan Operations', 'Scoped edits, session updates, reorder, archive, restore, and linked-row actions.'),
    ('Training Plan Configuration', 'Holiday calendars, module catalogue, programme config, and KSB profile setup.'),
    ('People & Profiles', 'Employees, tutor profiles, coach profiles, and academic module records.'),
    ('Documents & Support', 'Document intelligence, urgent tickets, and support ticket endpoints.'),
    ('Risk & Feedback', 'Risk register and feedback submission endpoints.'),
    ('Media Uploads', 'Shared image and media upload endpoints.'),
    ('System & Realtime', 'Health checks, realtime sync, and platform-level signals.'),
]

TAG_ORDER = {name: index for index, (name, _) in enumerate(TAG_DEFINITIONS)}

RESOURCE_LABELS = {
    'audit-logs': 'audit logs',
    'coach-profiles': 'coach profiles',
    'documents-live': 'live documents',
    'documents-summary': 'document summary',
    'employees': 'employees',
    'events': 'events',
    'feedback': 'feedback',
    'health': 'health status',
    'ksb-profiles': 'KSB profiles',
    'leadership-message': 'leadership messages',
    'modules': 'modules',
    'news': 'news',
    'realtime': 'realtime updates',
    'risk-register': 'risk register',
    'support-tickets': 'support tickets',
    'training-plan': 'training plan',
    'training-plan-holidays': 'training plan holidays',
    'training-plan-holiday-types': 'holiday types',
    'training-plan-modules': 'training plan module catalogue',
    'training-plan-program-configs': 'programme configurations',
    'tutor-profiles': 'tutor profiles',
    'upload-image': 'uploaded media',
    'urgent-notice': 'urgent notices',
    'urgent-tickets': 'urgent tickets',
    'user-activity': 'user activity',
}

SPECIFIC_DESCRIPTIONS = {
    '/api/training-plan/': 'Returns or replaces the operational training plan timeline snapshot.',
    '/api/audit-logs/': 'Returns paginated audit records showing who changed what and when.',
    '/api/user-activity/': 'Returns user sessions, page visits, activity state, and engagement metrics.',
    '/api/upload-image/': 'Uploads event, news, leadership, or shared images and returns a media URL.',
    '/api/realtime/': 'Returns lightweight realtime state used by the frontend to detect changes.',
    '/api/health/': 'Checks whether the backend is reachable.',
}


def _route_to_openapi_path(route: str) -> tuple[str, list[dict[str, Any]]]:
    parameters: list[dict[str, Any]] = []

    def replace_converter(match: re.Match[str]) -> str:
        converter = match.group('converter') or 'str'
        name = match.group('name')
        schema_type = 'integer' if converter == 'int' else 'string'
        parameters.append({
            'name': name,
            'in': 'path',
            'required': True,
            'schema': {'type': schema_type},
        })
        return f'{{{name}}}'

    path = re.sub(r'<(?:(?P<converter>\w+):)?(?P<name>\w+)>', replace_converter, route)
    return f'/{path}'.replace('//', '/'), parameters


def _extract_methods(callback: Any) -> list[str]:
    view = getattr(callback, 'view_class', None) or callback
    source = ''
    try:
        source = inspect.getsource(view)
    except (OSError, TypeError):
        return ['GET']

    methods = set(re.findall(r"request\.method\s*==\s*['\"]([A-Z]+)['\"]", source))
    methods.update(re.findall(r"request\.method\s*!=\s*['\"]([A-Z]+)['\"]", source))

    for group in re.findall(r"request\.method\s+(?:not\s+)?in\s*\(([^)]*)\)", source):
        methods.update(re.findall(r"['\"]([A-Z]+)['\"]", group))

    valid_methods = sorted(method for method in methods if method in HTTP_METHODS)
    if valid_methods:
        return valid_methods

    route = getattr(getattr(callback, 'cls', None), 'http_method_names', None)
    if route:
        return [method.upper() for method in route if method.upper() in HTTP_METHODS]

    return ['GET']


def _tag_for_path(path: str) -> str:
    if path.startswith('/api/auth/') or path in {
        '/login/', '/logout/', '/activity/', '/activity/start/', '/access/',
        '/microsoft/start/', '/microsoft/callback/', '/login/microsoft-popup/', '/login/microsoft-popup',
    }:
        return 'Authentication & Access'
    if path in {'/api/health/', '/api/realtime/'}:
        return 'System & Realtime'
    if path.startswith('/api/user-activity/') or path.startswith('/api/audit-logs/'):
        return 'User Activity & Audit'
    if path.startswith('/api/events/'):
        return 'Events'
    if path.startswith('/api/news/'):
        return 'News & Announcements'
    if path.startswith('/api/urgent-notice/') or path.startswith('/api/leadership-message/'):
        return 'Leadership & Urgent Comms'
    if path.startswith('/api/training-plan-holidays/') or path.startswith('/api/training-plan-holiday-types/'):
        return 'Training Plan Configuration'
    if path.startswith('/api/training-plan-modules/') or path.startswith('/api/training-plan-program-configs/'):
        return 'Training Plan Configuration'
    if path.startswith('/api/ksb-profiles/'):
        return 'Training Plan Configuration'
    if path == '/api/training-plan/':
        return 'Training Plan Timeline'
    if path.startswith('/api/training-plan/'):
        return 'Training Plan Operations'
    if path.startswith('/api/employees/') or path.startswith('/api/tutor-profiles/') or path.startswith('/api/coach-profiles/'):
        return 'People & Profiles'
    if path.startswith('/api/modules/'):
        return 'People & Profiles'
    if path.startswith('/api/documents-') or path.startswith('/api/support-tickets/') or path.startswith('/api/urgent-tickets/'):
        return 'Documents & Support'
    if path.startswith('/api/risk-register/') or path.startswith('/api/feedback/'):
        return 'Risk & Feedback'
    if path.startswith('/api/upload-image/'):
        return 'Media Uploads'
    return 'System & Realtime'


def _resource_label(path: str) -> str:
    parts = [part for part in path.strip('/').split('/') if part and not part.startswith('{')]
    if parts and parts[0] == 'api':
        parts = parts[1:]
    if parts and parts[0] == 'auth':
        return RESOURCE_LABELS.get(parts[1], parts[1].replace('-', ' ')) if len(parts) > 1 else 'authentication'
    if not parts:
        return 'endpoint'
    return RESOURCE_LABELS.get(parts[0], parts[0].replace('-', ' '))


def _is_detail_path(path: str) -> bool:
    return '{' in path and '}' in path


def _operation_summary(path: str, method: str) -> str:
    resource = _resource_label(path)
    lowered = path.lower()

    if lowered.endswith('/health/'):
        return 'Backend health check'
    if lowered.endswith('/realtime/'):
        return 'Read realtime sync state'
    if lowered.endswith('/access/'):
        return 'Read user access profile'
    if 'microsoft/start' in lowered:
        return 'Start Microsoft sign-in'
    if 'microsoft/callback' in lowered:
        return 'Complete Microsoft sign-in'
    if lowered.endswith('/login/'):
        return 'Sign in'
    if lowered.endswith('/logout/'):
        return 'Sign out'
    if lowered.endswith('/activity/start/'):
        return 'Start activity session'
    if lowered.endswith('/activity/'):
        return 'Update activity session'
    if 'duplicates' in lowered:
        return f'Find duplicate {resource}'
    if 'linked-rows' in lowered:
        return f'List linked {resource}'
    if 'add-for-tutor' in lowered:
        return 'Add module for tutor'
    if '/reorder/' in lowered:
        return f'Reorder {resource}'
    if lowered.endswith('/archive/'):
        return f'Archive {resource}'
    if lowered.endswith('/restore/'):
        return f'Restore {resource}'
    if lowered.endswith('/coverage/'):
        return 'Update session coverage'
    if lowered.endswith('/ksb/'):
        return 'Update session KSB mapping'

    if method == 'GET':
        return f'Retrieve {resource}' if _is_detail_path(path) else f'List {resource}'
    if method == 'POST':
        return f'Create {resource}'
    if method in {'PUT', 'PATCH'}:
        return f'Update {resource}'
    if method == 'DELETE':
        return f'Delete {resource}'
    return f'{method} {resource}'


def _operation_description(path: str, method: str) -> str:
    if path in SPECIFIC_DESCRIPTIONS:
        return SPECIFIC_DESCRIPTIONS[path]

    summary = _operation_summary(path, method)
    tag = _tag_for_path(path)
    if method in MUTATING_METHODS:
        return f'{summary}. This endpoint belongs to the {tag} domain and accepts a JSON request body unless marked as multipart upload.'
    return f'{summary}. This endpoint belongs to the {tag} domain and returns JSON data for the Communication Centre frontend.'


def _operation_for(path: str, method: str, callback: Any, parameters: list[dict[str, Any]]) -> dict[str, Any]:
    name = getattr(callback, '__name__', 'endpoint')
    operation_id = f'{method.lower()}_{path.strip("/").replace("/", "_").replace("{", "").replace("}", "") or "root"}'
    tag = _tag_for_path(path)
    operation: dict[str, Any] = {
        'operationId': operation_id,
        'summary': _operation_summary(path, method),
        'description': _operation_description(path, method),
        'tags': [tag],
        'parameters': parameters,
        'responses': {
            '200': {
                'description': f'{name} response',
                'content': {
                    'application/json': {
                        'schema': {'type': 'object'},
                    },
                },
            },
        },
    }

    if method in MUTATING_METHODS:
        content_type = 'multipart/form-data' if 'upload' in path else 'application/json'
        operation['requestBody'] = {
            'required': False,
            'content': {
                content_type: {
                    'schema': {'type': 'object', 'additionalProperties': True},
                },
            },
        }

    return operation


def _walk_patterns(patterns: list[Any], prefix: str = '') -> list[tuple[str, Any]]:
    routes: list[tuple[str, Any]] = []
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            routes.extend(_walk_patterns(pattern.url_patterns, f'{prefix}{pattern.pattern}'))
            continue
        if isinstance(pattern, URLPattern):
            route = f'{prefix}{pattern.pattern}'
            if route.startswith('^'):
                continue
            if route.startswith(('admin/', 'static/', 'media/')):
                continue
            if route in {'api/swagger/', 'api/swagger.json'}:
                continue
            routes.append((route, pattern.callback))
    return routes


def swagger_schema(request: HttpRequest) -> JsonResponse:
    paths: dict[str, Any] = {}
    route_entries = []
    for route, callback in _walk_patterns(get_resolver().url_patterns):
        path, parameters = _route_to_openapi_path(route)
        route_entries.append((TAG_ORDER.get(_tag_for_path(path), 999), path, callback, parameters))

    for _, path, callback, parameters in sorted(route_entries, key=lambda item: (item[0], item[1])):
        paths.setdefault(path, {})
        for method in sorted(_extract_methods(callback), key=lambda value: METHOD_ORDER.get(value.lower(), 999)):
            paths[path][method.lower()] = _operation_for(path, method, callback, parameters)

    schema = {
        'openapi': '3.0.3',
        'info': {
            'title': 'KBC Communication Centre API',
            'version': '1.0.0',
            'description': (
                'Professional API documentation for the KBC Communication Centre backend. '
                'Endpoints are grouped by product area so the platform architecture is easy to review, demo, and share.'
            ),
        },
        'servers': [{'url': request.build_absolute_uri('/').rstrip('/')}],
        'tags': [{'name': name, 'description': description} for name, description in TAG_DEFINITIONS],
        'paths': paths,
    }
    return JsonResponse(schema)


def swagger_ui(_: HttpRequest) -> HttpResponse:
    html = """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KBC Communication Centre API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #f8fafc; }
      .swagger-ui .topbar { display: none; }
      .kbc-api-hero {
        padding: 28px 42px 18px;
        background: #ffffff;
        border-bottom: 1px solid #e5e7eb;
      }
      .kbc-api-hero__eyebrow {
        color: #d79b00;
        font: 800 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .kbc-api-hero h1 {
        margin: 8px 0 8px;
        color: #081f49;
        font: 850 30px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .kbc-api-hero p {
        max-width: 880px;
        margin: 0;
        color: #64748b;
        font: 500 14px/1.7 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .kbc-api-hero__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }
      .kbc-api-hero__chips span {
        border: 1px solid #e2e8f0;
        border-radius: 999px;
        background: #f8fafc;
        color: #334155;
        padding: 7px 11px;
        font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .swagger-ui {
        color: #0f172a;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .swagger-ui .info { margin: 28px 0 20px; }
      .swagger-ui .info .title { color: #081f49; font-size: 28px; }
      .swagger-ui .scheme-container {
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
      }
      .swagger-ui .opblock-tag {
        border-bottom: 1px solid #e5e7eb;
        color: #081f49;
        font-size: 20px;
      }
      .swagger-ui .opblock {
        border-radius: 10px;
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
      }
    </style>
  </head>
  <body>
    <section class="kbc-api-hero">
      <div class="kbc-api-hero__eyebrow">Kent Business College</div>
      <h1>Communication Centre API Documentation</h1>
      <p>
        A structured backend map for events, training-plan operations, user activity, audit history,
        people profiles, support workflows, and communication publishing. Built to make the platform
        easy to inspect, test, and present.
      </p>
      <div class="kbc-api-hero__chips">
        <span>Organised by product domain</span>
        <span>OpenAPI 3.0</span>
        <span>Interactive testing</span>
        <span>Audit-ready endpoint catalogue</span>
      </div>
    </section>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      const tagOrder = [
        'Authentication & Access',
        'User Activity & Audit',
        'Events',
        'News & Announcements',
        'Leadership & Urgent Comms',
        'Training Plan Timeline',
        'Training Plan Operations',
        'Training Plan Configuration',
        'People & Profiles',
        'Documents & Support',
        'Risk & Feedback',
        'Media Uploads',
        'System & Realtime'
      ];
      window.ui = SwaggerUIBundle({
        url: '/api/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        defaultModelsExpandDepth: -1,
        tagsSorter: (a, b) => tagOrder.indexOf(a) - tagOrder.indexOf(b),
        operationsSorter: (a, b) => {
          const methods = ['get', 'post', 'put', 'patch', 'delete'];
          const pathCompare = a.get('path').localeCompare(b.get('path'));
          if (pathCompare !== 0) return pathCompare;
          return methods.indexOf(a.get('method')) - methods.indexOf(b.get('method'));
        }
      });
    </script>
  </body>
</html>
"""
    return HttpResponse(html)
