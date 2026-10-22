"""Employer satisfaction specialists: the director can hand every employer satisfaction call to chosen specialists.

While it is on, those specialists work employer satisfaction only (shared between them, like a queue) and nobody
else sees or works it; learners allocated to a specialist go to the shared queue, and come back when it is switched
off (their allocation is kept). The choice lives in ``callcenter_setting`` (key ``employer_specialists``) and every
save is kept in ``callcenter_setting_history`` with its reason, like the email settings. Until a director saves, or
while the table is missing, it is off.
"""
from django.db import IntegrityError, ProgrammingError, transaction

from .db import DB
from .models import Agent, Setting, SettingHistory

KEY = 'employer_specialists'
EMPLOYER = 'employer_feedback'
NOT_SET_UP = 'Settings are not set up yet. Run docs/callcentre-port/settings.sql on the call-centre database.'
CHANGED = 'Someone changed the employer specialists since you opened them. Reload and check again.'


def defaults():
    return {'enabled': False, 'agent_ids': []}


def stored():
    """(values, revision, set_up). Missing table or no saved row: off, revision 0."""
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            row = Setting.objects.filter(key=KEY).first()
    except ProgrammingError:
        return defaults(), 0, False
    if row is None or not isinstance(row.value, dict):
        return defaults(), 0, True
    return {**defaults(), **row.value}, row.revision, True


def specialists():
    """The active specialists who make the employer satisfaction calls; empty while it is off (the normal allocation)."""
    values = stored()[0]
    if not values['enabled']:
        return frozenset()
    return frozenset(Agent.objects.filter(pk__in=values['agent_ids'], active=True, user__is_active=True)
                     .values_list('pk', flat=True))


def scope_error(source_type, agent_id, team):
    """Why this specialist may not work a case of this type ('' when they may)."""
    if not team:
        return ''
    if source_type == EMPLOYER and agent_id not in team:
        return 'Employer satisfaction calls are made by the employer specialists.'
    if source_type != EMPLOYER and agent_id in team:
        return 'You make the employer satisfaction calls only.'
    return ''


def clean(data):
    if not isinstance(data, dict) or type(data.get('enabled')) is not bool:
        raise ValueError('Choose whether employer satisfaction calls are made by employer specialists.')
    ids = data.get('agent_ids')
    if not isinstance(ids, list) or any(type(pk) is not int for pk in ids):
        raise ValueError('Choose the employer specialists from the list.')
    ids = sorted(set(ids))
    active = set(Agent.objects.filter(pk__in=ids, active=True, user__is_active=True).values_list('pk', flat=True))
    if set(ids) - active:
        raise ValueError('Choose active specialists only.')
    if data['enabled'] and not ids:
        raise ValueError('Choose at least one employer specialist, or switch it off.')
    return {'enabled': data['enabled'], 'agent_ids': ids}


def save(data, revision, reason, actor):
    """Store the director's choice if nobody changed it since ``revision``; returns the new revision."""
    from .services import Conflict   # services reads specialists() from this module
    values = clean(data)
    reason = str(reason or '').strip()
    if not 5 <= len(reason) <= 1000:
        raise ValueError('Say why you are changing the employer specialists (5 to 1,000 characters).')
    try:
        with transaction.atomic(using=DB):
            row = Setting.objects.select_for_update().filter(key=KEY).first()
            if (row.revision if row else 0) != revision:
                raise Conflict(CHANGED)
            previous = {**defaults(), **row.value} if row else None
            if row:
                row.value, row.revision, row.updated_by = values, row.revision + 1, actor
                row.save()
            else:
                row = Setting.objects.create(key=KEY, value=values, updated_by=actor)
            SettingHistory.objects.create(key=KEY, previous=previous, value=values, reason=reason, actor=actor)
            return row.revision
    except IntegrityError:
        raise Conflict(CHANGED) from None
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def history(limit=10):
    try:
        with transaction.atomic(using=DB):
            return list(SettingHistory.objects.filter(key=KEY).order_by('-created_at', '-id').values(
                'id', 'previous', 'value', 'reason', 'actor', 'created_at')[:limit])
    except ProgrammingError:
        return []
