"""The Zoom phone numbers (lines) the director adds on the Zoom Phone page, each with a Test and its status.

Since 20 Oct 2026 Zoom reports calls on shared lines without the caller's email, so a call is matched to the specialist
whose assigned number is the line it went out on (``services.line_agents``). The director keeps the list of numbers
here, gives each specialist one of them (``Agent.zoom_phone_number``), and the Test shows whether the line's calls
are being matched. The list lives in ``callcenter_setting`` (key ``zoom_lines``); a missing table means it is empty.
"""
from datetime import timedelta

from django.db import IntegrityError, ProgrammingError, transaction
from django.utils import timezone

from .db import DB
from .models import Agent, CallMatch, Setting, ZoomPhoneCall, ZoomPhoneRecording
from .rules import normalize_phone
from .services import Conflict
from .zoom_phone import ACCOUNT_LABELS, ZoomClient, ZoomError, missing_credentials, validate_config

KEY = 'zoom_lines'
NOT_SET_UP = 'Settings are not set up yet. Run docs/callcentre-port/settings.sql on the call-centre database.'
# The Zoom app needs this scope to look a number up; without it the Test still checks the call records.
NUMBERS_SCOPE = 'phone:read:list_numbers:admin'
STATUS_LABELS = {
    'working': 'Working', 'ready': 'Ready: no calls yet', 'unmatched': 'Calls not matched',
    'no_agent': 'No specialist assigned', 'not_found': 'Not found in Zoom', 'untested': 'Not tested',
}


def stored():
    """The numbers, as saved. A missing table means none."""
    try:
        with transaction.atomic(using=DB):
            row = Setting.objects.filter(key=KEY).first()
    except ProgrammingError:
        return []
    lines = row.value.get('lines') if row and isinstance(row.value, dict) else None
    return lines if isinstance(lines, list) else []


def _save(change, actor):
    """Apply ``change`` to the saved list under a lock; returns the new list."""
    try:
        with transaction.atomic(using=DB):
            row = Setting.objects.select_for_update().filter(key=KEY).first()
            lines = list(row.value.get('lines') or []) if row and isinstance(row.value, dict) else []
            lines = change(lines)
            if row:
                row.value, row.revision, row.updated_by = {'lines': lines}, row.revision + 1, actor
                row.save()
            else:
                Setting.objects.create(key=KEY, value={'lines': lines}, updated_by=actor)
            return lines
    except IntegrityError:
        raise Conflict('Someone else changed the numbers at the same time. Reload and try again.') from None
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def clean_number(value):
    number = normalize_phone(value)
    if not number or not number.startswith('+'):
        raise ValueError('Enter the number in international format, for example +441622958989.')
    return number


def add(number, label, actor):
    number = clean_number(number)
    label = str(label or '').strip()[:80]

    def change(lines):
        if any(line['number'] == number for line in lines):
            raise ValueError('This number is already in the list.')
        return [*lines, {'number': number, 'label': label, 'added_by': actor, 'added_at': timezone.now().isoformat(), 'test': None}]
    return _save(change, actor)


def remove(number, actor):
    number = clean_number(number)
    using = [agent.display_name for agent in Agent.objects.all() if normalize_phone(agent.zoom_phone_number) == number]
    if using:
        raise ValueError(f'{", ".join(using)} {"uses" if len(using) == 1 else "use"} this number. Give them another number first.')
    return _save(lambda lines: [line for line in lines if line['number'] != number], actor)


def agents_by_number():
    found = {}
    for agent in Agent.objects.order_by('display_name'):
        number = normalize_phone(agent.zoom_phone_number)
        if number:
            found.setdefault(number, []).append({'id': agent.pk, 'name': agent.display_name, 'active': agent.active})
    return found


def zoom_lookup(number):
    """Where Zoom has the number: {'found', 'account', 'assignee', 'status'}, or why it could not be checked."""
    checked = False
    problems = []
    for key, label in ACCOUNT_LABELS.items():
        if missing_credentials(key):
            continue
        client = None
        try:
            client = ZoomClient(validate_config(key))
            token = ''
            while True:
                response = client.api_get('/phone/numbers', params={'page_size': 100, 'type': 'all', 'next_page_token': token})
                if response.status_code in (400, 401, 403):
                    try:
                        message = str(response.json().get('message', ''))
                    except ValueError:
                        message = ''
                    response.close()
                    if 'scope' in message:
                        problems.append(f'the Zoom app needs the {NUMBERS_SCOPE} scope')
                        break
                    raise ZoomError(f'Zoom refused the number lookup (HTTP {response.status_code}).')
                payload = client._json(response)
                checked = True
                for row in payload.get('phone_numbers') or []:
                    if normalize_phone(row.get('number')) == number:
                        assignee = row.get('assignee') or {}
                        return {'checked': True, 'found': True, 'account': label, 'status': str(row.get('status') or ''),
                                'assignee': str(assignee.get('name') or ''), 'problem': ''}
                token = payload.get('next_page_token') or ''
                if not token:
                    break
        except ZoomError as exc:
            problems.append(str(exc))
        finally:
            if client:
                client.close()
    return {'checked': checked, 'found': False if checked else None, 'account': '', 'status': '', 'assignee': '',
            'problem': '; '.join(sorted(set(problems)))}


def test(number, actor, now=None):
    """Check a number end to end and keep the result: Zoom, its calls in the last 7 days, and who has it."""
    number = clean_number(number)
    if not any(line['number'] == number for line in stored()):
        raise ValueError('Add the number to the list before testing it.')
    now = now or timezone.now()
    zoom = zoom_lookup(number)
    week = now - timedelta(days=7)
    calls = ZoomPhoneCall.objects.filter(direction='outbound', caller_number=number)
    recent = calls.filter(started_at__gte=week)
    matched = recent.filter(pk__in=CallMatch.objects.values('call_id')).count()
    last_call = calls.order_by('-started_at').values_list('started_at', flat=True).first()
    recordings = ZoomPhoneRecording.objects.filter(caller_number=number, started_at__gte=week)
    agents = agents_by_number().get(number, [])
    active = [agent['name'] for agent in agents if agent['active']]
    total = recent.count()
    if zoom['found'] is False and not calls.exists():
        status = 'not_found'
    elif not active:
        status = 'no_agent'
    elif total - matched:
        status = 'unmatched'
    elif not total:
        status = 'ready'
    else:
        status = 'working'
    result = {
        'status': status, 'label': STATUS_LABELS[status], 'tested_at': now.isoformat(), 'tested_by': actor,
        'zoom': zoom, 'calls_7_days': total, 'matched_7_days': matched, 'unmatched_7_days': total - matched,
        'last_call_at': last_call.isoformat() if last_call else None,
        'transcripts_ready_7_days': recordings.filter(transcript_status='ready').count(),
        'transcripts_waiting_7_days': recordings.exclude(transcript_status='ready').count(),
        'agents': active,
    }

    def change(lines):
        return [{**line, 'test': result} if line['number'] == number else line for line in lines]
    _save(change, actor)
    return result
