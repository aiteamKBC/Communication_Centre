"""Each specialist's status in Zoom (Available, Away, Do not disturb, On a call, Offline...).

Kept current by Zoom's webhook (User event "presence status updated", added to the app's Event Subscriptions) and
read for every specialist each cycle as a fallback (the app needs read access to users' presence status). The Zoom
user is the specialist's own (Specialist profiles), else the one their number is set up with (Phone numbers).
"""
import logging

from django.db import transaction
from django.utils import timezone

from .db import DB
from .models import Agent, CycleState
from .rules import email_key, normalize_phone

logger = logging.getLogger(__name__)
STATE = 'presence'
LABELS = {'available': 'Available', 'away': 'Away', 'do_not_disturb': 'Do not disturb', 'in_meeting': 'In a meeting',
          'presenting': 'Presenting', 'on_phone_call': 'On a call', 'in_a_call': 'On a call', 'in_calendar_event': 'In a calendar event',
          'busy': 'Busy', 'offline': 'Offline', 'out_of_office': 'Out of office'}


def zoom_user(agent, lines=None):
    """(Zoom user ID, email) Zoom knows the specialist by."""
    from .zoom_lines import stored
    line = next((item for item in (stored() if lines is None else lines)
                 if item['number'] == normalize_phone(agent.zoom_phone_number)), None) if agent.zoom_phone_number else None
    return agent.zoom_user_id or (line or {}).get('zoom_user_id', ''), email_key(agent.zoom_email) or (line or {}).get('zoom_email', '')


def _save(changes, error=None):
    with transaction.atomic(using=DB):
        CycleState.objects.get_or_create(name=STATE)
        state = CycleState.objects.select_for_update().get(name=STATE)
        details = dict(state.details or {})
        people = dict(details.get('agents') or {})
        people.update(changes)
        details['agents'] = people
        if error is not None:
            details['error'] = error
        state.details = details
        state.last_success_at = timezone.now()
        state.save(update_fields=['details', 'last_success_at'])


def record_event(key, payload):
    """Zoom's ``user.presence_status_updated``: the status of the specialist(s) that Zoom user is."""
    data = (payload or {}).get('object') if isinstance(payload, dict) else None
    data = data if isinstance(data, dict) else {}
    user_id, email, status = str(data.get('id') or ''), email_key(data.get('email')), str(data.get('presence_status') or '')
    if not status or not (user_id or email):
        return 0
    from .zoom_lines import stored
    lines = stored()
    found = {}
    for agent in Agent.objects.filter(active=True, zoom_account=key):
        agent_user, agent_email = zoom_user(agent, lines)
        if (user_id and agent_user == user_id) or (email and agent_email == email):
            found[str(agent.pk)] = {'status': status, 'at': timezone.now().isoformat(), 'source': 'webhook'}
    if found:
        _save(found)
    return len(found)


def poll():
    """Ask Zoom for each specialist's status (the cycle's fallback when a webhook was missed)."""
    from .zoom_phone import ZoomClient, ZoomError, validate_config
    from .zoom_lines import stored
    lines = stored()
    found, problems = {}, []
    by_account = {}
    for agent in Agent.objects.filter(active=True, user__is_active=True):
        user_id = zoom_user(agent, lines)[0]
        if user_id:
            by_account.setdefault(agent.zoom_account, []).append((agent, user_id))
    for key, people in by_account.items():
        try:
            client = ZoomClient(validate_config(key))
        except ZoomError as exc:
            problems.append(str(exc))
            continue
        try:
            for agent, user_id in people:
                response = client.api_get(f'/users/{user_id}/presence_status')
                if response.ok:
                    status = str(client._json(response).get('status') or '')
                    found[str(agent.pk)] = {'status': status, 'at': timezone.now().isoformat(), 'source': 'zoom'}
                else:
                    from .zoom_accounts import _zoom_reason
                    _, scopes, _ = _zoom_reason(response)
                    response.close()
                    problems.append(f'The Zoom app needs the scope {", ".join(scopes)} to read presence.' if scopes
                                    else f'Zoom refused the presence of {agent.display_name} (HTTP {response.status_code}).')
                    if scopes:
                        break
        except ZoomError as exc:
            problems.append(str(exc))
        finally:
            client.close()
    _save(found, error='; '.join(sorted(set(problems))))
    return len(found)


def current():
    """Agent id -> {status, label, at}, and the last problem reading it."""
    state = CycleState.objects.filter(name=STATE).first()
    details = state.details if state and isinstance(state.details, dict) else {}
    people = {key: {**value, 'label': LABELS.get(value.get('status', '').lower(), value.get('status', '').replace('_', ' '))}
              for key, value in (details.get('agents') or {}).items()}
    return {'agents': people, 'error': details.get('error', '')}
