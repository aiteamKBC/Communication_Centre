"""The Zoom phone numbers (lines) the director adds on the Zoom Phone page: one line per specialist.

Since 20 Oct 2026 Zoom reports calls on shared lines without the caller's email, and the emails on the specialists'
profiles are their sign-in emails, not what Zoom reports. So the line is the identity: each line holds everything Zoom
uses to recognise it (the number, its Zoom account, and the Zoom user email / ID Zoom attaches to its calls), and a
call on a line belongs to the one specialist who has that number (``Agent.zoom_phone_number``), whatever email Zoom
shows (``services.line_agents``). Saving a specialist only accepts a number from this list, never one another active
specialist has, and takes the Zoom account from the line, so the two cannot disagree (``manage_views.save_agent``).
The Test checks the line against the calls Zoom actually sent. The list lives in ``callcenter_setting`` (key
``zoom_lines``); a missing table means it is empty.
"""
from collections import Counter
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, ProgrammingError, transaction
from django.utils import timezone

from .db import DB
from .models import Agent, CallMatch, Setting, ZoomPhoneCall, ZoomPhoneRecording
from .rules import email_key, normalize_phone, parse_moment
from .errors import FieldError
from .zoom_phone import ZoomClient, ZoomError, account_labels, missing_credentials, validate_config

KEY = 'zoom_lines'
NOT_SET_UP = 'Settings are not set up yet. Run docs/callcentre-port/settings.sql on the call-centre database.'
# The Zoom app needs this scope to look a number up; without it the Test still checks the call records.
NUMBERS_SCOPE = 'phone:read:list_numbers:admin'
STATUS_LABELS = {
    'working': 'Working', 'ready': 'Ready: no calls yet', 'unmatched': 'Calls not matched', 'check_setup': 'Setup does not match Zoom',
    'no_agent': 'No specialist assigned', 'not_found': 'Not found in Zoom', 'untested': 'Not tested',
}
LINE_FIELDS = ('number', 'label', 'account', 'zoom_email', 'zoom_user_id')


def stored():
    """The lines, as saved. A missing table means none."""
    try:
        with transaction.atomic(using=DB):
            row = Setting.objects.filter(key=KEY).first()
    except ProgrammingError:
        return []
    lines = row.value.get('lines') if row and isinstance(row.value, dict) else None
    return lines if isinstance(lines, list) else []


def _save(change, actor):
    """Apply ``change`` to the saved list under a lock; returns the new list."""
    from .services import Conflict   # services matches calls by these lines
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
        raise FieldError('number', 'Enter the number in international format, for example +441622958989.')
    return number


def clean_line(data):
    """A line's fields, checked: the number and its Zoom account are required, the Zoom identity is optional."""
    if not isinstance(data, dict):
        raise ValueError('Send the number and its Zoom details.')
    account = str(data.get('account') or '')
    if account not in account_labels():
        raise FieldError('account', 'Choose the Zoom account the number is on.' if account_labels()
                         else 'Add the Zoom account first (Zoom accounts, above), then choose it here.')
    zoom_email = email_key(data.get('zoom_email'))
    if zoom_email:
        try:
            validate_email(zoom_email)
        except ValidationError:
            raise FieldError('zoom_email', 'This is not a valid email.') from None
    return {'number': clean_number(data.get('number')), 'label': str(data.get('label') or '').strip()[:80], 'account': account,
            'zoom_email': zoom_email, 'zoom_user_id': str(data.get('zoom_user_id') or '').strip()[:128]}


def _check_unique(lines, line):
    """No two lines may share a number, nor a Zoom identity on the same account: a call must point to one line."""
    for other in lines:
        if other['number'] == line['number']:
            raise FieldError('number', 'This number is already in the list.')
        same_account = other.get('account') == line['account']
        if same_account and line['zoom_email'] and other.get('zoom_email') == line['zoom_email']:
            raise FieldError('zoom_email', f'{other["number"]} already has the Zoom user email {line["zoom_email"]}.')
        if same_account and line['zoom_user_id'] and other.get('zoom_user_id') == line['zoom_user_id']:
            raise FieldError('zoom_user_id', f'{other["number"]} already has the Zoom user ID {line["zoom_user_id"]}.')


def add(data, actor):
    line = clean_line(data)
    now = timezone.now().isoformat()
    # A name taken from Zoom (Add on an account's numbers) follows Zoom on Refresh; a name typed here is kept.
    custom = bool(line['label']) and not data.get('from_zoom')

    def change(lines):
        _check_unique(lines, line)
        return [*lines, {**line, 'custom_label': custom, 'added_by': actor, 'added_at': now, 'test': None}]
    return _save(change, actor)


def update(number, data, actor):
    """Change a line's Zoom details (not its number); its specialist's Zoom account follows the line."""
    number = clean_number(number)
    line = clean_line({**data, 'number': number})

    def change(lines):
        if not any(item['number'] == number for item in lines):
            raise ValueError('This number is not in the list.')
        _check_unique([item for item in lines if item['number'] != number], line)
        now = timezone.now().isoformat()
        return [{**item, **line, 'test': None, 'changed_at': now,
                 # Kept as typed unless it is Zoom's own name for the number.
                 'custom_label': bool(line['label']) and line['label'] != item.get('zoom_name')}
                if item['number'] == number else item for item in lines]
    with transaction.atomic(using=DB):
        lines = _save(change, actor)
        holders = [agent for agent in Agent.objects.exclude(zoom_account=line['account'])
                   if normalize_phone(agent.zoom_phone_number) == number]
        try:
            with transaction.atomic(using=DB):
                for agent in holders:
                    agent.zoom_account = line['account']
                    agent.save(update_fields=['zoom_account'])
        except IntegrityError:
            raise ValueError('A specialist with the same Zoom email is already on that account.') from None
    return lines


def remove(number, actor):
    number = clean_number(number)
    using = [agent.display_name for agent in Agent.objects.all() if normalize_phone(agent.zoom_phone_number) == number]
    if using:
        raise ValueError(f'{", ".join(using)} {"has" if len(using) == 1 else "have"} this number. Give them another number first.')
    return _save(lambda lines: [line for line in lines if line['number'] != number], actor)


def line_for(call, lines=None):
    """The listed line a Zoom call was made on: by its number, else by the Zoom user Zoom attached to it."""
    lines = stored() if lines is None else lines
    on_account = [line for line in lines if line.get('account', call.source_account) == call.source_account]
    number = normalize_phone(call.caller_number)
    for line in on_account:
        if number and line['number'] == number:
            return line
    for line in on_account:
        if (line.get('zoom_user_id') and line['zoom_user_id'] == call.caller_user_id) or (
                line.get('zoom_email') and line['zoom_email'] == email_key(call.caller_email)):
            return line
    return None


def agents_by_number():
    found = {}
    for agent in Agent.objects.order_by('display_name'):
        number = normalize_phone(agent.zoom_phone_number)
        if number:
            found.setdefault(number, []).append({'id': agent.pk, 'name': agent.display_name, 'active': agent.active,
                                                 'account': agent.zoom_account})
    return found


def zoom_lookup(number):
    """Where Zoom has the number: {'found', 'account', 'assignee', 'status'}, or why it could not be checked."""
    checked = False
    problems = []
    for key in account_labels():
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
                        return {'checked': True, 'found': True, 'account': key, 'status': str(row.get('status') or ''),
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


def seen_on(number, since):
    """What Zoom has reported for calls on this number: their accounts, and the Zoom users it attached to them."""
    rows = list(ZoomPhoneCall.objects.filter(direction='outbound', caller_number=number, started_at__gte=since)
                .values('source_account', 'caller_email', 'caller_user_id'))
    return {'calls': len(rows), 'accounts': Counter(row['source_account'] for row in rows),
            'emails': Counter(email_key(row['caller_email']) for row in rows if row['caller_email']),
            'user_ids': Counter(row['caller_user_id'] for row in rows if row['caller_user_id'])}


def discover(number, now=None):
    """Fill from Zoom: the account and Zoom identity of a number, from Zoom itself and from the calls it has sent."""
    number = clean_number(number)
    seen = seen_on(number, (now or timezone.now()) - timedelta(days=90))
    zoom = zoom_lookup(number)
    account = zoom['account'] or (seen['accounts'].most_common(1)[0][0] if seen['accounts'] else '')
    latest = ZoomPhoneCall.objects.filter(direction='outbound', caller_number=number).order_by('-started_at')
    email = latest.exclude(caller_email='').values_list('caller_email', flat=True).first() or ''
    user_id = latest.exclude(caller_user_id='').values_list('caller_user_id', flat=True).first() or ''
    return {'number': number, 'account': account, 'zoom_email': email_key(email), 'zoom_user_id': user_id, 'calls_90_days': seen['calls'],
            'zoom': zoom}


def setup_warnings(line, holders, seen):
    """Where a line's setup disagrees with what Zoom reports, or where it could match the wrong specialist."""
    warnings = []
    labels = account_labels()
    active = [holder for holder in holders if holder['active']]
    if len(active) > 1:
        warnings.append(f'Given to {len(active)} specialists ({", ".join(h["name"] for h in active)}): one number per specialist.')
    account = line.get('account')
    if not account:
        warnings.append('Choose the Zoom account this number is on (Edit).')
    for holder in active:
        if account and holder['account'] != account:
            warnings.append(f'{holder["name"]} is on the {labels.get(holder["account"], holder["account"])} account, the number on {labels.get(account, account)}.')
    other_accounts = [key for key in seen['accounts'] if account and key != account]
    if other_accounts:
        warnings.append(f'Zoom sent calls on this number from the {", ".join(labels.get(k, k) for k in other_accounts)} account.')
    for email in seen['emails']:
        if email != line.get('zoom_email'):
            warnings.append(f'Zoom attaches the user {email} to calls on this number, but the number has '
                            f'{line.get("zoom_email") or "no Zoom user email"} (Fill from Zoom, then save).')
    for user_id in seen['user_ids']:
        if user_id != line.get('zoom_user_id'):
            warnings.append(f'Zoom attaches the user ID {user_id} to calls on this number, but the number has '
                            f'{line.get("zoom_user_id") or "no Zoom user ID"} (Fill from Zoom, then save).')
    return warnings


def since_change(line, now):
    """The calls that tell about the number's current setup: the last 30 days, but none from before it last changed."""
    since = now - timedelta(days=30)
    changed = parse_moment(line['changed_at']) if line.get('changed_at') else None
    return max(since, changed) if changed else since


def test(number, actor, now=None, zoom=None):
    """Check a line end to end and keep the result: Zoom, its setup, its calls in the last 7 days, and who has it."""
    number = clean_number(number)
    line = next((item for item in stored() if item['number'] == number), None)
    if not line:
        raise ValueError('Add the number to the list before testing it.')
    now = now or timezone.now()
    zoom = zoom if zoom is not None else zoom_lookup(number)
    week = now - timedelta(days=7)
    calls = ZoomPhoneCall.objects.filter(direction='outbound', caller_number=number)
    recent = calls.filter(started_at__gte=week)
    matched = recent.filter(pk__in=CallMatch.objects.values('call_id')).count()
    last_call = calls.order_by('-started_at').values_list('started_at', flat=True).first()
    recordings = ZoomPhoneRecording.objects.filter(caller_number=number, started_at__gte=week)
    holders = agents_by_number().get(number, [])
    since = since_change(line, now)
    warnings = setup_warnings(line, holders, seen_on(number, since))
    # Calls from before the setup last changed say nothing about it now: they are shown, not held against it.
    current = recent.filter(started_at__gte=since)
    calls_now = current.count()
    unmatched_now = calls_now - current.filter(pk__in=CallMatch.objects.values('call_id')).count()
    if zoom['found'] and line.get('account') and zoom['account'] != line['account']:
        warnings.append(f'Zoom has this number on the {account_labels().get(zoom["account"], zoom["account"])} account.')
    active = [holder['name'] for holder in holders if holder['active']]
    total = recent.count()
    if zoom['found'] is False and not calls.exists():
        status = 'not_found'
    elif not active:
        status = 'no_agent'
    elif warnings:
        status = 'check_setup'
    elif unmatched_now:
        status = 'unmatched'
    elif not calls_now:
        status = 'ready'
    else:
        status = 'working'
    result = {
        'status': status, 'label': STATUS_LABELS[status], 'tested_at': now.isoformat(), 'tested_by': actor,
        'zoom': {**zoom, 'account': account_labels().get(zoom['account'], '')}, 'warnings': warnings,
        'calls_7_days': total, 'matched_7_days': matched, 'unmatched_7_days': total - matched,
        'unmatched_since_change': unmatched_now, 'changed_at': line.get('changed_at') if since > week else None,
        'last_call_at': last_call.isoformat() if last_call else None,
        'transcripts_ready_7_days': recordings.filter(transcript_status='ready').count(),
        'transcripts_waiting_7_days': recordings.exclude(transcript_status='ready').count(),
        'agents': active,
    }

    def change(lines):
        return [{**item, 'test': result} if item['number'] == number else item for item in lines]
    _save(change, actor)
    return result


def refresh(actor, now=None):
    """Refresh from Zoom: read every account's numbers from Zoom, bring each listed number's Zoom name, owner and account up
    to date (a name typed here is kept), then Test every number. Returns what changed, and what could not be read."""
    from .zoom_accounts import zoom_numbers
    now = now or timezone.now()
    labels = account_labels()
    in_zoom, problems, read = {}, [], set()
    for key, label in labels.items():
        try:
            for row in zoom_numbers(key):
                in_zoom.setdefault(row['number'], {**row, 'account': key})
            read.add(key)
        except (ZoomError, ValueError) as exc:
            problems.append(f'{label}: {exc}')
    changes, moved = [], {}

    def change(lines):
        changes.clear()
        moved.clear()
        updated = []
        for line in lines:
            zoom = in_zoom.get(line['number'])
            if not zoom:
                updated.append(line)
                continue
            line = {**line, 'zoom_name': zoom['display_name'], 'zoom_owner': zoom['assignee'], 'refreshed_at': now.isoformat()}
            name = zoom['display_name'] or zoom['assignee']
            if name and not line.get('custom_label') and line.get('label') != name:
                changes.append(f'{line["number"]}: name {line.get("label") or "(none)"} → {name}')
                line['label'] = name
            if zoom['account'] != line.get('account'):
                changes.append(f'{line["number"]}: account {labels.get(line.get("account"), line.get("account") or "(none)")} → '
                               f'{labels[zoom["account"]]}')
                line.update(account=zoom['account'], changed_at=now.isoformat())
                moved[line['number']] = zoom['account']
            updated.append(line)
        return updated
    with transaction.atomic(using=DB):
        lines = _save(change, actor)
        # A number that moved account takes its specialist with it (as Edit does).
        for agent in Agent.objects.all():
            account = moved.get(normalize_phone(agent.zoom_phone_number))
            if account and agent.zoom_account != account:
                agent.zoom_account = account
                agent.save(update_fields=['zoom_account'])
    # Only an account Zoom answered for can say a number is not on it.
    checked = len(read) == len(labels) and bool(labels)
    missing = [line['number'] for line in lines if line['number'] not in in_zoom and checked]
    for line in lines:
        zoom = in_zoom.get(line['number'])
        result = ({'checked': True, 'found': True, 'account': zoom['account'], 'status': zoom['status'], 'assignee': zoom['assignee'],
                   'problem': ''} if zoom else
                  {'checked': checked, 'found': False if checked else None, 'account': '', 'status': '', 'assignee': '',
                   'problem': '' if checked else '; '.join(problems)})
        test(line['number'], actor, now, zoom=result)
    return {'numbers': len(lines), 'changes': changes, 'not_in_zoom': missing, 'problems': problems}
