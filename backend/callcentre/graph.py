"""App-only Microsoft Graph client for coach bookings.

Mirrors the LMS (``coach_api.views.get_graph_settings`` / ``microsoft_graph_request``) so a meeting the
call centre creates is indistinguishable from one the LMS creates. ``MICROSOFT_GRAPH_*`` wins over the
bare ``MICROSOFT_*`` names for the same reason it does in the LMS: the bare names may belong to a
delegated-auth app with no application roles.
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

_lock = threading.Lock()
_token = {'key': None, 'value': None, 'expires_at': 0.0}


class GraphError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def _env(*names):
    return next((os.environ[n].strip() for n in names if os.environ.get(n, '').strip()), '')


def settings():
    return {
        'tenant_id': _env('MICROSOFT_GRAPH_TENANT_ID', 'MICROSOFT_TENANT_ID'),
        'client_id': _env('MICROSOFT_GRAPH_CLIENT_ID', 'MICROSOFT_CLIENT_ID'),
        'client_secret': _env('MICROSOFT_GRAPH_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET'),
        'scope': _env('MICROSOFT_GRAPH_SCOPE') or DEFAULT_SCOPE,
        'base_url': _env('MICROSOFT_GRAPH_BASE_URL') or DEFAULT_BASE_URL,
    }


def configured():
    values = settings()
    return all(values[k] for k in ('tenant_id', 'client_id', 'client_secret'))


def _access_token():
    values = settings()
    if not configured():
        raise GraphError('Microsoft Graph is not configured for the call centre.')
    key = (values['tenant_id'], values['client_id'], values['client_secret'], values['scope'])
    with _lock:
        if _token['key'] == key and _token['expires_at'] > monotonic():
            return _token['value']
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
        _token.update(key=key, value=data['access_token'],
                      expires_at=monotonic() + max(int(data.get('expires_in', 3600)) - 120, 60))
        return _token['value']


def request(method, path, payload=None, headers=None):
    """One Graph call. Raises GraphError (never with credentials or response bodies containing them)."""
    url = f"{settings()['base_url'].rstrip('/')}/{path.lstrip('/')}"
    try:
        response = requests.request(method, url, json=payload, timeout=TIMEOUT, headers={
            'Authorization': f'Bearer {_access_token()}', 'Accept': 'application/json', **(headers or {})})
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
