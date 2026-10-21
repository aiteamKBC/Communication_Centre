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
    # Engagement Centre roles; see callcentre/access.py.
    'access_call_centre_agent': 'Call Centre Agent Access',
    'access_call_centre_director': 'Call Centre Director Access',
}
# The single "Call Centre Access" group became the agent group; renaming it keeps its members.
LEGACY_CALL_CENTRE_GROUP = 'Call Centre Access'


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
    agent_group = ACCESS_GROUPS['access_call_centre_agent']
    if not Group.objects.using(using).filter(name=agent_group).exists():
        Group.objects.using(using).filter(name=LEGACY_CALL_CENTRE_GROUP).update(name=agent_group)
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
    # Not implied by admin access: Engagement Centre roles are specific jobs. A super admin is always a director.
    call_centre_director_access = bool(user.is_superuser) or ACCESS_GROUPS['access_call_centre_director'] in group_names
    call_centre_agent_access = ACCESS_GROUPS['access_call_centre_agent'] in group_names

    return {
        'adminAccess': admin_access,
        'eventManagerAccess': event_manager_access,
        'operationsAccess': operations_access,
        'itAccess': it_access,
        'marketingAccess': marketing_access,
        'supportAccess': support_access,
        'coachAccess': coach_access,
        'callCentreAccess': call_centre_agent_access or call_centre_director_access,
        'callCentreAgentAccess': call_centre_agent_access,
        'callCentreDirectorAccess': call_centre_director_access,
        'isSuperuser': bool(user.is_superuser),
        'canManageEvents': event_manager_access,
        'canManageCohorts': operations_access,
        'canManageNews': admin_access or it_access or marketing_access,
    }
