"""App-only Microsoft Graph client, with one app registration per job.

* ``calendar`` (default) — coach bookings. Mirrors the LMS (``coach_api.views.get_graph_settings`` /
  ``microsoft_graph_request``) so a meeting the call centre creates is indistinguishable from one the LMS
  creates. ``MICROSOFT_GRAPH_*`` wins over the bare ``MICROSOFT_*`` names for the same reason it does in the
  LMS: the bare names may belong to a delegated-auth app with no application roles.
* ``mail`` — the no-reply sending app (``CALLCENTRE_MAIL_*``), used by ``mailer.py``. It never falls back to
  the calendar app, which has no ``Mail.Send``.
"""
import json
import os
import re
import threading
from time import monotonic
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse

import requests

DEFAULT_SCOPE = 'https://graph.microsoft.com/.default'
DEFAULT_BASE_URL = 'https://graph.microsoft.com/v1.0'
# Coach bookings store UK wall-clock times; Graph receives them in this Windows zone.
TIMEZONE = 'GMT Standard Time'
TIMEOUT = 20

# Env names per credential, most preferred first, for each app registration.
PROFILES = {
    'calendar': {'tenant_id': ('MICROSOFT_GRAPH_TENANT_ID', 'MICROSOFT_TENANT_ID'),
                 'client_id': ('MICROSOFT_GRAPH_CLIENT_ID', 'MICROSOFT_CLIENT_ID'),
                 'client_secret': ('MICROSOFT_GRAPH_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET')},
    'mail': {'tenant_id': ('CALLCENTRE_MAIL_TENANT_ID',), 'client_id': ('CALLCENTRE_MAIL_CLIENT_ID',),
             'client_secret': ('CALLCENTRE_MAIL_CLIENT_SECRET',)},
}

_lock = threading.Lock()
_tokens = {}   # credentials -> (token, expires_at)


class GraphError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def _env(*names):
    return next((os.environ[n].strip() for n in names if os.environ.get(n, '').strip()), '')


def settings(profile='calendar'):
    return {
        **{key: _env(*names) for key, names in PROFILES[profile].items()},
        'scope': _env('MICROSOFT_GRAPH_SCOPE') or DEFAULT_SCOPE,
        'base_url': _env('MICROSOFT_GRAPH_BASE_URL') or DEFAULT_BASE_URL,
    }


def missing(profile='calendar'):
    """Env names still to set for this app registration (names only, never values)."""
    values = settings(profile)
    return [' or '.join(names) for key, names in PROFILES[profile].items() if not values[key]]


def configured(profile='calendar'):
    return not missing(profile)


def _access_token(profile='calendar'):
    values = settings(profile)
    if not configured(profile):
        raise GraphError(f'Microsoft Graph ({profile}) is not configured for the call centre.')
    key = (values['tenant_id'], values['client_id'], values['client_secret'], values['scope'])
    with _lock:
        cached = _tokens.get(key)
        if cached and cached[1] > monotonic():
            return cached[0]
        try:
            response = requests.post(
                f"https://login.microsoftonline.com/{values['tenant_id']}/oauth2/v2.0/token",
                data={'client_id': values['client_id'], 'client_secret': values['client_secret'],
                      'scope': values['scope'], 'grant_type': 'client_credentials'}, timeout=TIMEOUT)
        except requests.RequestException as exc:
            raise GraphError(f'Microsoft sign-in unavailable ({type(exc).__name__}).') from exc
        if response.status_code != 200 or not response.json().get('access_token'):
            raise GraphError(f'Microsoft sign-in refused ({response.status_code}).', response.status_code)
        data = response.json()
        _tokens[key] = (data['access_token'], monotonic() + max(int(data.get('expires_in', 3600)) - 120, 60))
        return data['access_token']


def request(method, path, payload=None, headers=None, profile='calendar'):
    """One Graph call. Raises GraphError (never with credentials or response bodies containing them)."""
    url = f"{settings(profile)['base_url'].rstrip('/')}/{path.lstrip('/')}"
    try:
        response = requests.request(method, url, json=payload, timeout=TIMEOUT, headers={
            'Authorization': f'Bearer {_access_token(profile)}', 'Accept': 'application/json', **(headers or {})})
    except requests.RequestException as exc:
        raise GraphError(f'Microsoft Graph unavailable ({type(exc).__name__}).') from exc
    if response.status_code >= 400:
        try:
            detail = response.json().get('error', {}).get('code', '')
        except ValueError:
            detail = ''
        raise GraphError(f'Microsoft Graph {method} failed ({response.status_code} {detail}).'.replace(' )', ')'),
                         response.status_code)
    return response.json() if response.content else {}


def user_path(mailbox):
    return f'users/{quote(mailbox, safe="")}'


def event_state(organizer, event_id):
    """Current state of a Teams meeting from the organizer's calendar.

    Returns ``{'found': True, 'cancelled': bool, 'start': '<ISO datetime>' | None}`` for a live event,
    ``{'found': False, 'cancelled': True, 'start': None}`` when Graph returns 404 (the event has
    been deleted from Teams), or ``None`` when Graph is unavailable or not configured — callers
    then trust the LMS's cached state instead of inventing one.
    """
    if not organizer or not event_id or not configured('calendar'):
        return None
    try:
        data = request('GET',
            f"{user_path(organizer)}/events/{quote(event_id, safe='')}?$select=start,isCancelled")
    except GraphError as exc:
        if exc.status == 404:
            return {'found': False, 'cancelled': True, 'start': None}
        return None
    start = (data.get('start') or {}).get('dateTime') if isinstance(data, dict) else None
    return {'found': True, 'cancelled': bool(data.get('isCancelled')), 'start': start or None}


def meeting_owner_id(organizer, join_url):
    """The organizer's object id, which the onlineMeetings routes require (an email is refused)."""
    try:
        context = parse_qs(urlparse(unquote(join_url)).query).get('context') or []
        if context:
            oid = str(json.loads(unquote(context[0])).get('Oid') or '')
            if re.fullmatch(r'[0-9a-fA-F-]{36}', oid):
                return oid
    except (TypeError, ValueError):
        pass
    return organizer


def apply_meeting_options(organizer, join_url, attendees):
    """Record + transcribe automatically, open lobby, roster -- the LMS coach-meeting policy.

    Returns '' or a warning; the meeting itself already exists and works either way.
    """
    owner = quote(meeting_owner_id(organizer, join_url), safe='')
    try:
        query = urlencode({'$filter': "joinWebUrl eq '%s'" % join_url.replace("'", "''")})
        found = request('GET', f'users/{owner}/onlineMeetings?{query}').get('value') or []
        if not found:
            return 'Teams has not exposed the meeting yet; recording options not applied.'
        request('PATCH', f"users/{owner}/onlineMeetings/{quote(found[0]['id'], safe='')}", {
            'lobbyBypassSettings': {'scope': 'everyone', 'isDialInBypassEnabled': False},
            'allowRecording': True, 'recordAutomatically': True, 'allowTranscription': True,
            'meetingSpokenLanguageTag': 'en-GB',
            'participants': {'attendees': [{'upn': email, 'role': 'attendee'} for email in attendees if email]},
        })
    except GraphError as exc:
        return f'Recording options not applied: {exc}'
    return ''
