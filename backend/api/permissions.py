"""The permission policy for the public Communication Centre API routes.

Keeping the route policy together makes newly added mutation endpoints fail
closed, even when a browser hides its editing controls.
"""
from functools import wraps

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect

from login.permissions import get_effective_permissions


RESOURCE_ROUTES = {
    'events': {'events', 'event-detail'},
    'news': {'news', 'news-detail', 'urgent-notice', 'urgent-notice-detail',
             'leadership-message', 'leadership-message-detail'},
    'dashboard_cards': {'dashboard-cards', 'dashboard-card-detail', 'dashboard-cards-reorder'},
    'employees': {'employees', 'employee-detail'},
    'user_activity': {'user-activity', 'audit-logs'},
    'training_plan': {'tutor-profiles', 'tutor-profile-detail', 'tutor-profile-duplicates',
                      'coach-profiles', 'coach-profile-detail', 'ksb-profiles', 'ksb-profile-detail',
                      'modules', 'module-detail'},
}
METHOD_ACTION = {'GET': 'view', 'HEAD': 'view', 'POST': 'add', 'PUT': 'change',
                 'PATCH': 'change', 'DELETE': 'delete'}
AUTHENTICATED_WRITE_ROUTES = {'feedback'}
READ_ONLY_ROUTES = {'realtime', 'documents-live', 'documents-summary', 'aptem-subprogrammes',
                    'aptem-learners', 'urgent-tickets', 'support-tickets', 'risk-register', 'feedback'}
ACTION_OVERRIDES = {
    ('dashboard-cards-reorder', 'POST'): ('change',),
    # Publishing a new leadership message also deactivates the previous message.
    ('leadership-message', 'POST'): ('add', 'change'),
    ('training-plan-archive-cohort', 'PATCH'): ('delete',),
    ('training-plan-archive-module', 'PATCH'): ('delete',),
    ('training-plan-restore-cohort', 'PATCH'): ('change',),
    ('training-plan-restore-module', 'PATCH'): ('change',),
    # The legacy replace-all can add, modify and remove rows in a single request.
    ('training-plan', 'POST'): ('add', 'change', 'delete'),
}


def route_resource(name):
    if name.startswith('training-plan'):
        return 'training_plan'
    return next((resource for resource, names in RESOURCE_ROUTES.items() if name in names), None)


def required_permissions(name, method):
    resource = route_resource(name)
    action = METHOD_ACTION.get(method)
    if not resource or not action:
        return ()
    return tuple(f'login.{action}_{resource}' for action in
                 ACTION_OVERRIDES.get((name, method), (action,)))


def protect_api_view(view, name):
    if name == 'health':
        return view

    @wraps(view)
    def authorized(request, *args, **kwargs):
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated or not user.is_active:
            return JsonResponse({'detail': 'Sign in again to continue.'}, status=401)
        required = required_permissions(name, request.method)
        if (name in {'tutor-profile-detail', 'coach-profile-detail'} and request.method == 'DELETE'
                and str(request.GET.get('force', '')).strip().lower() in {'1', 'true', 'yes'}):
            # Force deletion also edits existing sessions to unlink the profile.
            required = (*required, 'login.change_training_plan')
        rights = get_effective_permissions(user)
        if name == 'upload-image' and request.method == 'POST':
            permitted = any(f'login.{action}_{resource}' in rights
                            for resource in ('news', 'events', 'employees', 'dashboard_cards')
                            for action in ('add', 'change'))
        elif required:
            permitted = all(code in rights for code in required)
        elif request.method in ('GET', 'HEAD', 'OPTIONS'):
            permitted = name in READ_ONLY_ROUTES or name == 'upload-image'
        else:
            permitted = name in AUTHENTICATED_WRITE_ROUTES
        if not permitted:
            return JsonResponse({'detail': 'You do not have permission to perform this action.',
                                 'requiredPermissions': list(required)}, status=403)
        return view(request, *args, **kwargs)

    # An old callback's csrf_exempt marker must not bypass this session-based API.
    authorized.csrf_exempt = False
    return csrf_protect(authorized)
