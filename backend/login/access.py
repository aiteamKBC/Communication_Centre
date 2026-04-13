from django.contrib.auth.models import Group


ACCESS_GROUPS: dict[str, str] = {
    'access_admin': 'Admin Access',
    'access_event_manager': 'Event Manager Access',
    'access_operations': 'Operations Access',
    'access_it': 'IT Access',
    'access_marketing': 'Marketing Access',
}


def ensure_access_groups(using: str = 'login_db') -> None:
    for group_name in ACCESS_GROUPS.values():
        Group.objects.using(using).get_or_create(name=group_name)


def get_user_access_payload(user) -> dict:
    using = getattr(getattr(user, '_state', None), 'db', None) or 'login_db'
    group_names = set(user.groups.using(using).values_list('name', flat=True))

    # App access is controlled by explicit access groups, not by Django superuser flag.
    admin_access = ACCESS_GROUPS['access_admin'] in group_names
    event_manager_access = admin_access or ACCESS_GROUPS['access_event_manager'] in group_names
    operations_access = admin_access or ACCESS_GROUPS['access_operations'] in group_names
    it_access = admin_access or ACCESS_GROUPS['access_it'] in group_names
    marketing_access = admin_access or ACCESS_GROUPS['access_marketing'] in group_names

    return {
        'adminAccess': admin_access,
        'eventManagerAccess': event_manager_access,
        'operationsAccess': operations_access,
        'itAccess': it_access,
        'marketingAccess': marketing_access,
        'canManageEvents': event_manager_access,
        'canManageCohorts': operations_access,
        'canManageNews': admin_access or it_access or marketing_access,
    }
