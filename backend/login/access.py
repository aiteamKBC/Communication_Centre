from django.contrib.auth.models import Group
from django.db import connections, transaction


ACCESS_GROUPS: dict[str, str] = {
    'access_admin': 'Admin Access',
    'access_event_manager': 'Event Manager Access',
    'access_operations': 'Operations Access',
    'access_it': 'IT Access',
    'access_marketing': 'Marketing Access',
    'access_support': 'Support Access',
    'access_coach': 'Coach Access',
}


def _reset_group_sequence(using: str) -> None:
    """Reset the auth_group primary key sequence to avoid duplicate key errors on PostgreSQL."""
    conn = connections[using]
    if conn.vendor != 'postgresql':
        return
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT setval(pg_get_serial_sequence('auth_group', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM auth_group"
        )


def ensure_access_groups(using: str = 'login_db') -> None:
    _reset_group_sequence(using)
    for group_name in ACCESS_GROUPS.values():
        if not Group.objects.using(using).filter(name=group_name).exists():
            with transaction.atomic(using=using):
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
    support_access = admin_access or ACCESS_GROUPS['access_support'] in group_names
    coach_access = admin_access or ACCESS_GROUPS['access_coach'] in group_names

    return {
        'adminAccess': admin_access,
        'eventManagerAccess': event_manager_access,
        'operationsAccess': operations_access,
        'itAccess': it_access,
        'marketingAccess': marketing_access,
        'supportAccess': support_access,
        'coachAccess': coach_access,
        'canManageEvents': event_manager_access,
        'canManageCohorts': operations_access,
        'canManageNews': admin_access or it_access or marketing_access,
    }
