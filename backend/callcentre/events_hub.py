"""The Events hub (events.kentbusinesscollege.net): the separate system for event confirmation and feedback calls.

* Sync. Events has no worker of its own. Every cycle this worker sends it the active specialists (Events' agents,
  keyed by their auth_user id) and asks it to import the Eventbrite rows the n8n workflow wrote since the last cycle:
  ``POST {EVENTS_API_URL}/api/v1/integration/sync/``.
* Reads. The Today page's event calls and the director's Events panel come from its ``integration/agent-tasks/`` and
  ``integration/summary/``.
* Allocation. Directors allocate events to specialists on the Director page here ("Event allocation"), read and saved
  through its ``integration/allocations/``. An event nobody is allocated to is seen by no specialist.
* Entry. Nobody signs in to Events. Its buttons here link to ``events/open/``, which makes a one-time pass (signed with
  EVENTS_ENTRY_SECRET, accepted for one minute) and sends the browser to Events' ``auth/enter/``.
* Calls. Events dials through Zoom Phone like the desk does (``zoomphonecall://`` from the agent's line, sent in the
  sync). The sync response lists those presses; ``match_dials`` finds each one's Zoom call with this module's rules for
  call intents (the agent's line, the same number, within ten minutes, the last press before the call) and the result,
  recordings and transcript go back to Events' ``integration/calls/``. Each match is also kept here
  (``EventsHubCall``), so the call counts towards the specialist's talk time and target as an event call. Recordings stay here: Events gets a signed link
  to ``events/recordings/<token>/audio/``, which plays only to a director or the specialist on the call.

Server-to-server calls carry EVENTS_INTEGRATION_KEY. Nothing here reads or writes the Events database, and nothing
is sent while the settings are empty.
"""
import re
import secrets
from collections import defaultdict
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.core import signing
from django.db import IntegrityError, ProgrammingError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .access import is_director
from .db import DB
from .models import Agent, CallMatch, EventsHubCall, ZoomPhoneCall, ZoomPhoneRecording
from .rules import normalize_phone

# (connect, read) seconds. The sync runs Events' import inside the request, so it allows for a busy cycle.
SYNC_TIMEOUT = (5, 60)
READ_TIMEOUT = (5, 15)
# Must match Events (backend/accounts/entry.py): the same salt and secret, and the path rule it accepts.
PASS_SALT = 'kbc.events.entry'
SAFE_NEXT = re.compile(r'^/(?!/)[A-Za-z0-9/_\-?=&.%]*$')
# A call belongs to a press made at most this long before it (as call intents); the two servers' clocks may differ a little.
MATCH_WINDOW = timedelta(minutes=10)
CLOCK_SKEW = timedelta(minutes=1)
# Zoom reports a call within a cycle or two; a press with no call after this was never dialled.
GIVE_UP_AFTER = timedelta(hours=2)
RECORDING_SALT = 'kbc.events.recording'


class EventsHubError(Exception):
    pass


class EventsHubRefused(EventsHubError):
    """Events turned the request down (400 or 409); ``data`` is its JSON answer."""

    def __init__(self, message, status, data):
        super().__init__(message)
        self.status, self.data = status, data


class AllocationRefused(EventsHubError):
    """Events would not save the allocation batch; the message says why."""


class AllocationStale(EventsHubError):
    """Another director changed these events' allocation after the page loaded."""

    def __init__(self, events):
        super().__init__('The allocation of some events changed since the page loaded.')
        self.events = events


def enabled():
    return bool(settings.EVENTS_API_URL and settings.EVENTS_INTEGRATION_KEY)


def entry_enabled():
    return bool(settings.EVENTS_API_URL and settings.EVENTS_ENTRY_SECRET)


def identity(user, agent=None):
    """The email and name Events knows this account by: the specialist profile's, as the sync sends them."""
    email = (user.email or (agent.zoom_email if agent else '') or '').strip().lower()
    name = (agent.display_name if agent else '') or user.get_full_name() or user.get_username()
    return email, name


def active_agents():
    """The specialists Events may allocate events to: active profiles of active accounts."""
    agents = []
    for agent in Agent.objects.filter(active=True, user__is_active=True).select_related('user').order_by('pk'):
        email, name = identity(agent.user, agent)
        if email:
            agents.append({'id': agent.user_id, 'email': email, 'name': name,
                           'zoom_phone_number': normalize_phone(agent.zoom_phone_number)})
    return agents


def call(method, path, timeout, **kwargs):
    if not enabled():
        raise EventsHubError('The Events hub is not connected. Set EVENTS_API_URL and EVENTS_INTEGRATION_KEY.')
    try:
        response = requests.request(
            method, settings.EVENTS_API_URL + path, timeout=timeout, allow_redirects=False,
            headers={'X-Integration-Key': settings.EVENTS_INTEGRATION_KEY, 'Accept': 'application/json'}, **kwargs)
    except requests.RequestException:
        # Never include the key or the request in the message: it is shown on pages and kept in the cycle details.
        raise EventsHubError('The Events hub could not be reached. Try again shortly.') from None
    if response.status_code in (400, 409):
        try:
            data = response.json()
        except ValueError:
            data = None
        raise EventsHubRefused(f'The Events hub refused the request ({response.status_code}); see its log.', response.status_code, data)
    if response.status_code >= 400:
        raise EventsHubError(f'The Events hub refused the request ({response.status_code}); see its log.')
    try:
        return response.json()
    except ValueError:
        raise EventsHubError('The Events hub returned an unexpected response.') from None


def sync():
    """One cycle step: the agents to Events, its Eventbrite import, then its Zoom calls matched. Returns a summary
    for the cycle details (counts only: no phone numbers), or None when off."""
    if not enabled():
        return None
    summary = call('POST', '/api/v1/integration/sync/', SYNC_TIMEOUT, json={'agents': active_agents()})
    if not isinstance(summary, dict):
        raise EventsHubError('The Events hub returned an unexpected response.')
    dials = summary.pop('dials', None) or []
    results = match_dials(dials)
    if results:
        call('POST', '/api/v1/integration/calls/', READ_TIMEOUT, json={'calls': results})
    summary['calls'] = {'asked': len(dials), 'matched': sum(1 for item in results if item['status'] == 'matched'),
                        'unmatched': sum(1 for item in results if item['status'] == 'unmatched')}
    return summary


def _dials(raw):
    """The well-formed presses from Events, with the number normalised and the time parsed."""
    dials = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        cc_user_id, dialled_at = item.get('cc_user_id'), parse_datetime(str(item.get('dialled_at') or ''))
        number = normalize_phone(item.get('number'))
        if (isinstance(item.get('id'), str) and isinstance(cc_user_id, int) and not isinstance(cc_user_id, bool)
                and number and dialled_at):
            dials.append({'id': item['id'], 'cc_user_id': cc_user_id, 'number': number, 'dialled_at': dialled_at,
                          'status': item.get('status')})
    return sorted(dials, key=lambda dial: dial['dialled_at'])


def match_dials(raw, now=None):
    """Each Events press's Zoom call, by the call-intent rules: [{id, status, ...}] for Events' integration/calls/.
    A press still waiting is left out until Zoom reports its call or GIVE_UP_AFTER passes."""
    now = now or timezone.now()
    dials = _dials(raw)
    if not dials:
        return []
    agents = {agent.user_id: agent for agent in Agent.objects.filter(user_id__in={dial['cc_user_id'] for dial in dials})}
    # A redial is its own press: a call belongs to the last press before it, so each press's window ends at the next.
    following = {}
    by_line = defaultdict(list)
    for dial in dials:
        by_line[(dial['cc_user_id'], dial['number'])].append(dial)
    for presses in by_line.values():
        for current, after in zip(presses, presses[1:]):
            following[current['id']] = after['dialled_at']
    used, results, matched = set(), [], []
    for dial in dials:
        agent = agents.get(dial['cc_user_id'])
        end = min(dial['dialled_at'] + MATCH_WINDOW, following.get(dial['id'], dial['dialled_at'] + MATCH_WINDOW))
        zoom_call = find_call(dial, agent, end, used) if agent else None
        if zoom_call:
            used.add(zoom_call.pk)
            matched.append((dial, agent, zoom_call))
            results.append(call_result(dial, zoom_call))
        elif dial['status'] == 'pending' and dial['dialled_at'] < now - GIVE_UP_AFTER:
            results.append({'id': dial['id'], 'status': 'unmatched'})
    keep_matches(matched)
    return results


def _event_calls(run):
    """Runs a read or write of EventsHubCall in a savepoint; None until docs/callcentre-port/event_calls.sql has run."""
    try:
        with transaction.atomic(using=DB):
            return run()
    except ProgrammingError:
        return None


def keep_matches(matched):
    """Keeps each press's Zoom call (so it counts towards talk time). A call already kept for this press stays as it is."""
    for dial, agent, zoom_call in matched:
        try:
            _event_calls(lambda: EventsHubCall.objects.get_or_create(
                events_dial_id=dial['id'], defaults={'call': zoom_call, 'agent': agent}))
        except IntegrityError:
            # The call is already kept for another press (find_call skips those, so only on a race): leave it there.
            pass


def kept_for_another_press(zoom_call, dial):
    return bool(_event_calls(lambda: EventsHubCall.objects.filter(call=zoom_call).exclude(events_dial_id=dial['id']).exists()))


def find_call(dial, agent, end, used):
    """The agent's outbound Zoom call to the press's number, the first in its window that is not one of this desk's own."""
    from .services import line_agents
    from .zoom_views import current_account_filter
    calls = ZoomPhoneCall.objects.filter(
        current_account_filter(), direction='outbound', source_account=agent.zoom_account,
        started_at__gte=dial['dialled_at'] - CLOCK_SKEW, started_at__lte=end,
    ).order_by('started_at', 'pk')
    for zoom_call in calls:
        if zoom_call.pk in used or normalize_phone(zoom_call.callee_number) != dial['number']:
            continue
        if CallMatch.objects.filter(call=zoom_call).exists() or kept_for_another_press(zoom_call, dial):
            continue
        if any(candidate.pk == agent.pk for candidate in line_agents(zoom_call)):
            return zoom_call
    return None


def recording_link(recording_id, call_pk):
    """A lasting link to play one event call's recording here (events_views.events_recording_audio)."""
    token = signing.dumps({'r': recording_id, 'c': call_pk}, salt=RECORDING_SALT, compress=True)
    return f'{settings.CALLCENTRE_PUBLIC_URL}/api/callcentre/events/recordings/{token}/audio/'


def call_result(dial, zoom_call):
    """What Events keeps of a matched call: its result and length, its recordings and the transcript so far."""
    from .call_log import recordings_of
    recordings = recordings_of([zoom_call]).get(zoom_call.pk, [])
    texts = dict(ZoomPhoneRecording.objects.filter(pk__in=[item['id'] for item in recordings]).values_list('pk', 'transcript_text'))
    statuses = [item['transcript'] for item in recordings]
    if 'ready' in statuses:
        transcript_status = 'ready'
    elif statuses:
        transcript_status = statuses[0]
    else:
        # An answered call's recording may still be on its way; an unanswered one has none.
        transcript_status = 'pending' if zoom_call.result == 'answered' else 'none'
    return {
        'id': dial['id'], 'status': 'matched', 'cc_call_id': zoom_call.pk, 'result': zoom_call.result,
        'started_at': zoom_call.started_at.isoformat(), 'duration_seconds': zoom_call.duration_seconds,
        'recordings': [{'id': item['id'], 'duration_seconds': item['duration_seconds'], 'transcript_status': item['transcript'],
                        'audio_url': recording_link(item['id'], zoom_call.pk)} for item in recordings],
        'transcript_status': transcript_status,
        'transcript_text': '\n\n'.join(texts[item['id']] for item in recordings if item['transcript'] == 'ready' and texts.get(item['id'])),
    }


def agent_tasks(user):
    """This specialist's open event calls (confirmation calls, today's task, and optional feedback calls) and their
    own numbers for today, this week and last week (None when Events does not know them as an agent)."""
    data = call('GET', '/api/v1/integration/agent-tasks/', READ_TIMEOUT, params={'cc_user_id': user.pk})
    tasks = data.get('tasks') if isinstance(data, dict) else None
    if not isinstance(tasks, list):
        raise EventsHubError('The Events hub returned an unexpected response.')
    numbers = data.get('numbers')
    return tasks, numbers if isinstance(numbers, dict) else None


def director_summary():
    data = call('GET', '/api/v1/integration/summary/', READ_TIMEOUT)
    if not isinstance(data, dict):
        raise EventsHubError('The Events hub returned an unexpected response.')
    return data


def allocation_board(days):
    """The events still to be called about with who is allocated to each, Events' agents and recent changes. Agents are
    named by their auth_user id; ``agent_id`` adds the specialist profile here (for the calling workspace link)."""
    data = call('GET', '/api/v1/integration/allocations/', READ_TIMEOUT, params={'days': days})
    if not isinstance(data, dict) or not all(isinstance(data.get(key), list) for key in ('events', 'agents', 'history')):
        raise EventsHubError('The Events hub returned an unexpected response.')
    profiles = dict(Agent.objects.filter(user_id__in=[agent.get('id') for agent in data['agents'] if isinstance(agent, dict)])
                    .values_list('user_id', 'pk'))
    for agent in data['agents']:
        if isinstance(agent, dict):
            agent['agent_id'] = profiles.get(agent.get('id'))
    return data


def _refusal(data):
    """Events' own reason for a 400, which names what was wrong with the batch."""
    detail = data.get('detail') if isinstance(data, dict) else None
    if isinstance(detail, list) and detail:
        detail = detail[0]
    return str(detail) if isinstance(detail, str) and detail else 'The Events hub refused the allocation.'


def save_allocation(user, changes, reason=''):
    """Saves a director's batch in Events, all or nothing. Returns how many events changed."""
    email, name = identity(user, Agent.objects.filter(user=user).first())
    if not email:
        raise AllocationRefused('Your account has no email address, which the Events hub needs. Ask an administrator to add it.')
    try:
        data = call('POST', '/api/v1/integration/allocations/', READ_TIMEOUT,
                    json={'actor': {'id': user.pk, 'email': email, 'name': name}, 'changes': changes, 'reason': reason})
    except EventsHubRefused as exc:
        if exc.status == 409:
            events = exc.data.get('events') if isinstance(exc.data, dict) else None
            raise AllocationStale([str(event) for event in events] if isinstance(events, list) else []) from None
        raise AllocationRefused(_refusal(exc.data)) from None
    if not isinstance(data, dict) or not isinstance(data.get('changed'), int):
        raise EventsHubError('The Events hub returned an unexpected response.')
    return data['changed']


def entry_url(user, next_path=''):
    """The link that signs this account in to Events and opens ``next_path`` there: valid for one minute, once."""
    if not entry_enabled():
        raise EventsHubError('The Events hub is not connected. Set EVENTS_API_URL and EVENTS_ENTRY_SECRET.')
    email, name = identity(user, Agent.objects.filter(user=user).first())
    if not email:
        raise EventsHubError('Your account has no email address, which the Events hub needs. Ask an administrator to add it.')
    payload = {'sub': user.pk, 'email': email, 'name': name, 'role': 'director' if is_director(user) else 'agent',
               'jti': secrets.token_urlsafe(24)}
    if next_path and SAFE_NEXT.match(next_path):
        payload['next'] = next_path
    token = signing.dumps(payload, key=settings.EVENTS_ENTRY_SECRET, salt=PASS_SALT, compress=True)
    return f'{settings.EVENTS_API_URL}/api/v1/auth/enter/?{urlencode({"pass": token})}'
