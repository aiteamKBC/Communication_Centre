"""Who is on a call right now, from Zoom's webhooks: ringing, talking, and with whom.

Zoom sends an event as a call rings, connects and ends (zoom_webhook). Each call in progress is kept in one
``callcenter_cycle_state`` row (``live_calls``) until its end event, and for at most three hours if that is lost. It
is what is happening now, not evidence: counts and outcomes still come from Zoom's call history.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .db import DB
from .models import Agent, CycleState
from .rules import normalize_phone, parse_moment

LIVE = 'live_calls'
STALE = timedelta(hours=3)
# Event -> (which side is the team, what is happening).
STARTS = {
    'phone.caller_ringing': ('outbound', 'ringing'), 'phone.caller_connected': ('outbound', 'talking'),
    'phone.callee_ringing': ('inbound', 'ringing'), 'phone.callee_answered': ('inbound', 'talking'),
}
# The call is over for everyone; or only for the one person it rang (others may still answer it).
ENDS_ALL = {'phone.caller_ended', 'phone.callee_ended', 'phone.caller_call_log_completed', 'phone.callee_call_log_completed'}
ENDS_ONE = {'phone.callee_missed', 'phone.callee_rejected'}
EVENTS = set(STARTS) | ENDS_ALL | ENDS_ONE


def _moment(value, fallback):
    try:
        return parse_moment(value).isoformat() if value else fallback
    except (ValueError, TypeError):
        return fallback


def party_agent(key, party):
    """The specialist on the team's side of the call: by Zoom user, else by their number on this account."""
    party = party if isinstance(party, dict) else {}
    user_id, number = str(party.get('user_id') or ''), normalize_phone(party.get('phone_number'))
    agents = list(Agent.objects.filter(active=True, user__is_active=True, zoom_account=key))
    found = [agent for agent in agents if user_id and agent.zoom_user_id == user_id]
    if not found and user_id:
        from .zoom_lines import stored
        numbers = {line['number'] for line in stored() if line.get('account') == key and line.get('zoom_user_id') == user_id}
        found = [agent for agent in agents if normalize_phone(agent.zoom_phone_number) in numbers]
    if not found and number:
        found = [agent for agent in agents if normalize_phone(agent.zoom_phone_number) == number]
    return found[0] if len(found) == 1 else None


def record(key, event, payload, now=None):
    """Apply one Zoom phone event to the calls in progress. Unknown events and calls without an ID are ignored."""
    if event not in EVENTS:
        return False
    data = (payload or {}).get('object') if isinstance(payload, dict) else None
    data = data if isinstance(data, dict) else {}
    call_id = str(data.get('call_id') or '')
    if not call_id:
        return False
    now = (now or timezone.now()).isoformat()
    with transaction.atomic(using=DB):
        CycleState.objects.get_or_create(name=LIVE)
        state = CycleState.objects.select_for_update().get(name=LIVE)
        calls = {item_key: item for item_key, item in (state.details or {}).items()
                 if parse_moment(item.get('updated_at', now)) > parse_moment(now) - STALE}
        if event in ENDS_ALL:
            calls = {item_key: item for item_key, item in calls.items() if item.get('call_id') != call_id}
        elif event in ENDS_ONE:
            agent = party_agent(key, data.get('callee'))
            calls.pop(f'{call_id}:{agent.pk if agent else normalize_phone((data.get("callee") or {}).get("phone_number"))}', None)
        else:
            direction, phase = STARTS[event]
            ours, theirs = (data.get('caller'), data.get('callee')) if direction == 'outbound' else (data.get('callee'), data.get('caller'))
            ours, theirs = ours if isinstance(ours, dict) else {}, theirs if isinstance(theirs, dict) else {}
            agent = party_agent(key, ours)
            item_key = f'{call_id}:{agent.pk if agent else normalize_phone(ours.get("phone_number"))}'
            item = calls.get(item_key) or {
                'call_id': call_id, 'account': key, 'direction': direction, 'agent_id': agent.pk if agent else None,
                'line': normalize_phone(ours.get('phone_number')), 'number': normalize_phone(theirs.get('phone_number')),
                'zoom_name': str(theirs.get('name') or ''), 'started_at': _moment(data.get('ringing_start_time'), now)}
            item.update(state=phase, updated_at=now)
            if phase == 'talking' and not item.get('connected_at'):
                item['connected_at'] = _moment(data.get('connected_start_time') or data.get('answer_start_time'), now)
            calls[item_key] = item
        state.details = calls
        state.last_success_at = timezone.now()
        state.save(update_fields=['details', 'last_success_at'])
    return True


def current(agent=None, now=None):
    """The calls in progress (one specialist's with ``agent``), with who is on the other end and their case."""
    from .inbound import who_called
    from .models import CaseTicket
    now = now or timezone.now()
    state = CycleState.objects.filter(name=LIVE).first()
    names = dict(Agent.objects.values_list('pk', 'display_name'))
    rows = []
    for item in (state.details or {}).values() if state else []:
        if parse_moment(item.get('updated_at', now.isoformat())) <= now - STALE:
            continue
        if agent and item.get('agent_id') != agent.pk:
            continue
        person = who_called(item.get('number')) if item.get('number') else None
        case_id = (CaseTicket.objects.open().filter(learner_email__iexact=person['email']).exclude(source_type='satisfaction')
                   .order_by('pk').values_list('pk', flat=True).first() if person and person.get('email') else None)
        rows.append({**item, 'agent': names.get(item.get('agent_id'), ''), 'name': (person or {}).get('name') or item.get('zoom_name', ''),
                     'role': (person or {}).get('role', ''), 'email': (person or {}).get('email', ''), 'case_id': case_id})
    return sorted(rows, key=lambda row: row['started_at'])
