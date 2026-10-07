"""Who may use the Engagement Centre.

The director is a Django super admin. Engagement specialists (call-centre agents) are the accounts with
**Call centre access** ticked in Django admin: ticking it creates their specialist profile, unticking it
switches the profile off (it is never deleted, so their call history stays).
"""
from django.http import JsonResponse

from login.access import ACCESS_GROUPS

from .db import DB
from .models import Agent

CALL_CENTRE_GROUP = ACCESS_GROUPS['access_call_centre']
# New specialists dial from the student Zoom account; a director can change it in Engagement Centre settings.
DEFAULT_ZOOM_ACCOUNT = 'student'


def is_director(user):
    return bool(user.is_authenticated and user.is_active and user.is_superuser)


def has_access(user):
    if not user.is_authenticated or not user.is_active:
        return False
    return user.is_superuser or user.groups.using(DB).filter(name=CALL_CENTRE_GROUP).exists()


def refused(user):
    """The response for a signed-in account without Engagement Centre access, or None when allowed."""
    if has_access(user):
        return None
    return JsonResponse({'detail': 'Your account does not have Call centre access. Ask an administrator to tick '
                                   '“Call centre access” on your account in Django admin.'}, status=403)


def sync_agent(user, enabled):
    """Match the account's specialist profile to its Call centre access. Returns a warning, or ''."""
    agent = Agent.objects.filter(user=user).first()
    if not enabled:
        if agent and agent.active:
            agent.active = False
            agent.save()
        return ''
    if agent:
        if not agent.active:
            agent.active = True
            agent.save()
        return ''
    email = (user.email or '').strip().lower()
    if not email:
        return 'Call centre access is ticked, but the account has no email, so no specialist profile was created. Add the email and save again.'
    if Agent.objects.filter(zoom_email__iexact=email, zoom_account=DEFAULT_ZOOM_ACCOUNT).exists():
        return f'Another specialist profile already uses {email} on the student Zoom account. Fix it in Engagement Centre → Settings.'
    name = f'{user.first_name} {user.last_name}'.strip() or user.get_username()
    Agent.objects.create(user=user, display_name=name[:120], zoom_email=email, zoom_account=DEFAULT_ZOOM_ACCOUNT)
    return ''
