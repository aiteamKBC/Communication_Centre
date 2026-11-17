"""Communication Centre capabilities stored in Django's native Permission table.

Legacy job groups keep their existing capabilities. Ordinary signed-in reading is
still available to everyone; the catalogue says so explicitly rather than offering
a misleading way to revoke that access through an additive Django group.
"""
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q


APP_LABEL = 'login'
MODEL_NAME = 'communicationaccess'
RESOURCE_DETAILS = (
    ('news', 'News & announcements', 'News articles, urgent notices and leadership messages.', True),
    ('events', 'Events', 'Calendar events and event details.', True),
    ('training_plan', 'Training Plan', 'Cohorts, modules, sessions, learner assignments, holidays and tutor/coach profiles.', True),
    ('dashboard_cards', 'Dashboard cards', 'The links and cards shown in Internal Dashboards. Destination access stays separate.', True),
    ('employees', 'Departments', 'People and contact details in the department directory.', True),
    ('user_activity', 'User activity & audit logs', 'Login sessions, visited pages and system change history.', False),
)
ACTIONS = ('view', 'add', 'change', 'delete')
ACTION_LABELS = {'view': 'View', 'add': 'Add', 'change': 'Edit', 'delete': 'Delete'}
PERMISSION_DEFINITIONS = tuple(
    (f'{action}_{resource}', f'Can {action} {label.lower()}')
    for resource, label, _, _ in RESOURCE_DETAILS
    for action in (('view',) if resource == 'user_activity' else ACTIONS)
)
SAFE_PERMISSION_CODENAMES = frozenset(code for code, _ in PERMISSION_DEFINITIONS)
SAFE_PERMISSION_CODES = frozenset(f'{APP_LABEL}.{code}' for code in SAFE_PERMISSION_CODENAMES)
BASELINE_PERMISSIONS = frozenset(
    f'{APP_LABEL}.view_{resource}' for resource, _, _, baseline in RESOURCE_DETAILS if baseline
)


def safe_permission_q():
    """Match this exact permission namespace, including the owning content type."""
    return Q(content_type__app_label=APP_LABEL, content_type__model=MODEL_NAME,
             codename__in=SAFE_PERMISSION_CODENAMES)


def ensure_permission_catalog(using='login_db'):
    content_type, _ = ContentType.objects.using(using).get_or_create(
        app_label=APP_LABEL, model=MODEL_NAME)
    permissions = {}
    for codename, name in PERMISSION_DEFINITIONS:
        permission, _ = Permission.objects.using(using).get_or_create(
            content_type=content_type, codename=codename, defaults={'name': name})
        permissions[f'{APP_LABEL}.{codename}'] = permission
    return permissions


def permission_catalog():
    return [
        {'id': resource, 'name': name, 'description': description,
         'permissions': [
             {'id': f'{APP_LABEL}.{action}_{resource}', 'name': ACTION_LABELS[action],
              'action': action, 'baseline': action == 'view' and baseline}
             for action in (('view',) if resource == 'user_activity' else ACTIONS)
         ]}
        for resource, name, description, baseline in RESOURCE_DETAILS
    ]


permission_sections = permission_catalog


def legacy_role_permissions(group_name, *, include_baseline=False):
    # Import lazily: access.py exposes these definitions and calls this module.
    from .access import ACCESS_GROUPS
    rights = set(BASELINE_PERMISSIONS) if include_baseline else set()
    if group_name == ACCESS_GROUPS['access_admin']:
        return rights | set(SAFE_PERMISSION_CODES)
    resources = {
        ACCESS_GROUPS['access_event_manager']: ('events',),
        ACCESS_GROUPS['access_operations']: ('training_plan',),
        ACCESS_GROUPS['access_it']: ('news',),
        ACCESS_GROUPS['access_marketing']: ('news',),
    }.get(group_name, ())
    for resource in resources:
        rights.update(f'{APP_LABEL}.{action}_{resource}' for action in ACTIONS)
    if group_name == ACCESS_GROUPS['access_it']:
        rights.add(f'{APP_LABEL}.view_user_activity')
    return rights


def get_effective_permissions(user):
    if not user or not user.is_authenticated or not user.is_active:
        return set()
    if user.is_superuser:
        return set(SAFE_PERMISSION_CODES)
    using = getattr(getattr(user, '_state', None), 'db', None) or 'login_db'
    rights = set(BASELINE_PERMISSIONS)
    # No process/session permission cache: edits in either administration UI take
    # effect on the next request, including removal from a group.
    for name in user.groups.using(using).values_list('name', flat=True):
        rights.update(legacy_role_permissions(name))
    direct = Permission.objects.using(using).filter(safe_permission_q()).filter(
        Q(user=user) | Q(group__user=user)).values_list('codename', flat=True)
    rights.update(f'{APP_LABEL}.{code}' for code in direct)
    return rights


def has_app_permission(user, code):
    qualified = code if '.' in code else f'{APP_LABEL}.{code}'
    return qualified in get_effective_permissions(user)


def has_any_app_permission(user, codes):
    rights = get_effective_permissions(user)
    return any((code if '.' in code else f'{APP_LABEL}.{code}') in rights for code in codes)
