"""The Zoom accounts the call centre reads calls from, added by a director on the Zoom Phone page.

Each account is a Zoom Server-to-Server OAuth app: its Account ID, Client ID and Client Secret. The secret is stored
encrypted (Fernet) with the key in the server's ``ZOOM_SECRETS_KEY`` setting, which never leaves the server, and is never
sent back to the page (only its last four characters). An account keeps a short key (``source_account`` on its calls);
adding an account whose Zoom Account ID was synced before takes that key back, with its call history. The list lives in
``callcenter_setting`` (key ``zoom_accounts``); a missing table means no accounts.
"""
import os
import re
from datetime import timedelta

from django.db import IntegrityError, ProgrammingError, transaction
from django.utils import timezone

from .db import DB
from .errors import FieldError
from .models import Agent, Setting, ZoomSyncState

KEY = 'zoom_accounts'
SECRET_SETTING = 'ZOOM_SECRETS_KEY'
NOT_SET_UP = 'Settings are not set up yet. Run docs/callcentre-port/settings.sql on the call-centre database.'
NO_KEY = (f'The server cannot store Zoom secrets yet: {SECRET_SETTING} is missing from the server .env. '
          'Add it (the Zoom Phone page shows how), restart the server, then save again.')
BAD_KEY = (f'{SECRET_SETTING} in the server .env is not a valid key. Generate a new one (the Zoom Phone page shows how), '
           'restart the server, then enter each account’s Client Secret again.')
# What the Test reads, and what it is used for.
CHECKS = (
    ('call_history', 'Call history', '/phone/call_history', 'calls and their results'),
    ('recordings', 'Recordings', '/phone/recordings', 'recordings and transcripts'),
    ('numbers', 'Phone numbers', '/phone/numbers', 'the phone number Test and Fill from Zoom'),
    ('users', 'Phone users', '/phone/users', 'auto-recording status of each number’s owner'),
    ('voicemails', 'Voicemails', '/phone/voice_mails', 'voicemails and their transcripts on Missed calls'),
)
# What the Test finds among the scopes Zoom granted the token (granular scope first, then the classic one that also
# covers it). An optional one (renaming) is reported but does not make the account partial.
SCOPE_CHECKS = (
    ('presence', 'Zoom status', ('user:read:presence_status:admin', 'user:read:admin'), 'each specialist’s Zoom status on Live now', False),
    ('rename', 'Rename numbers', ('phone:update:number:admin', 'phone:write:admin'), 'Rename in Zoom (optional)', True),
)
# Zoom's Automatic Call Recording policy, in words.
RECORDED_CALLS = {'inbound': 'incoming calls', 'outbound': 'outgoing calls', 'both': 'all calls'}


def _cipher():
    from cryptography.fernet import Fernet
    secret_key = os.getenv(SECRET_SETTING, '').strip()
    if not secret_key:
        raise FieldError('client_secret', NO_KEY)
    try:
        return Fernet(secret_key.encode())
    except (ValueError, TypeError):
        raise FieldError('client_secret', BAD_KEY) from None


def stored():
    """The accounts, as saved (secrets encrypted). A missing table means none."""
    try:
        with transaction.atomic(using=DB):
            row = Setting.objects.filter(key=KEY).first()
    except ProgrammingError:
        return []
    accounts = row.value.get('accounts') if row and isinstance(row.value, dict) else None
    return accounts if isinstance(accounts, list) else []


def labels():
    """Key -> name of every account, in the order they were added."""
    return {account['key']: account['label'] for account in stored()}


def find(key):
    return next((account for account in stored() if account['key'] == key), None)


def secret(account):
    """The account's Client Secret, decrypted; '' when it cannot be read (no key on the server, or the key changed)."""
    from cryptography.fernet import InvalidToken
    if not account.get('secret'):
        return ''
    try:
        return _cipher().decrypt(account['secret'].encode()).decode()
    except (FieldError, InvalidToken):
        return ''


def webhook_secret(account):
    """The account's webhook Secret Token, decrypted; '' when none is saved or it cannot be read."""
    from cryptography.fernet import InvalidToken
    if not account.get('webhook_secret'):
        return ''
    try:
        return _cipher().decrypt(account['webhook_secret'].encode()).decode()
    except (FieldError, InvalidToken):
        return ''


def config(key):
    account = find(key)
    if not account:
        return {'account_id': '', 'client_id': '', 'client_secret': ''}
    return {'account_id': account['account_id'], 'client_id': account['client_id'], 'client_secret': secret(account)}


def missing(key):
    """What the account still needs before it can sync, in words."""
    account = find(key)
    if not account:
        return ['the account (add it on the Zoom Phone page)']
    gaps = [name for field, name in (('account_id', 'Account ID'), ('client_id', 'Client ID')) if not account.get(field)]
    if not account.get('secret'):
        gaps.append('Client Secret')
    elif not secret(account):
        gaps.append('Client Secret (the server cannot read it: enter it again)')
    return gaps


def public(account):
    """An account as the page sees it: never the secrets."""
    from .zoom_webhook import last_received
    return {'key': account['key'], 'label': account['label'], 'account_id': account['account_id'], 'client_id': account['client_id'],
            'secret_saved': bool(account.get('secret')), 'secret_end': account.get('secret_end', ''),
            'secret_readable': bool(secret(account)), 'added_by': account.get('added_by', ''), 'added_at': account.get('added_at'),
            'test': account.get('test'), 'webhook_saved': bool(account.get('webhook_secret')),
            'webhook_end': account.get('webhook_end', ''), 'webhook_readable': bool(webhook_secret(account)),
            'webhook': last_received(account['key'])}


def _save(change, actor):
    from .services import Conflict
    try:
        with transaction.atomic(using=DB):
            row = Setting.objects.select_for_update().filter(key=KEY).first()
            accounts = list(row.value.get('accounts') or []) if row and isinstance(row.value, dict) else []
            accounts = change(accounts)
            if row:
                row.value, row.revision, row.updated_by = {'accounts': accounts}, row.revision + 1, actor
                row.save()
            else:
                Setting.objects.create(key=KEY, value={'accounts': accounts}, updated_by=actor)
            return accounts
    except IntegrityError:
        raise Conflict('Someone else changed the Zoom accounts at the same time. Reload and try again.') from None
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def _text(data, field, name, limit, pattern=None):
    value = str(data.get(field) or '').strip()
    if not value:
        raise FieldError(field, f'Enter the {name}.')
    if len(value) > limit or (pattern and not re.fullmatch(pattern, value)):
        raise FieldError(field, f'This does not look like a Zoom {name}: copy it again from the app’s App Credentials page.')
    return value


def _encrypt(value):
    return _cipher().encrypt(value.encode()).decode()


def _webhook(data):
    """The Secret Token typed in the form, encrypted with its last four characters; None when left empty."""
    token = str(data.get('webhook_secret') or '').strip()
    if not token:
        return None
    if len(token) > 128 or not re.fullmatch(r'[A-Za-z0-9_-]+', token):
        raise FieldError('webhook_secret', 'This does not look like a Zoom Secret Token: copy it again from the app’s Features page.')
    return {'webhook_secret': _encrypt(token), 'webhook_end': token[-4:]}


def _new_key(label, account_id, accounts):
    """The account's key: the one its calls were synced under before (same Zoom Account ID), else one made from its name."""
    taken = {account['key'] for account in accounts}
    history = dict(ZoomSyncState.objects.values_list('source_account', 'zoom_account_id'))
    for key, synced_id in history.items():
        if synced_id == account_id and key not in taken:
            return key
    base = re.sub(r'[^a-z0-9]+', '_', label.lower()).strip('_')[:12] or 'zoom'
    key, number = base, 1
    # Never a key another Zoom account's calls were synced under.
    while key in taken or key in history:
        number += 1
        key = f'{base}_{number}'
    return key


def add(data, actor):
    label = _text(data, 'label', 'name', 60)
    account_id = _text(data, 'account_id', 'Account ID', 64, r'[A-Za-z0-9_-]+')
    client_id = _text(data, 'client_id', 'Client ID', 64, r'[A-Za-z0-9_-]+')
    client_secret = _text(data, 'client_secret', 'Client Secret', 128, r'\S+')
    encrypted = _encrypt(client_secret)
    webhook = _webhook(data) or {}

    def change(accounts):
        for other in accounts:
            if other['label'].lower() == label.lower():
                raise FieldError('label', f'An account is already called {other["label"]}.')
            if other['account_id'] == account_id:
                raise FieldError('account_id', f'{other["label"]} already uses this Account ID.')
        key = _new_key(label, account_id, accounts)
        return [*accounts, {'key': key, 'label': label, 'account_id': account_id, 'client_id': client_id, 'secret': encrypted,
                            'secret_end': client_secret[-4:], **webhook, 'added_by': actor, 'added_at': timezone.now().isoformat(),
                            'test': None}]
    return _save(change, actor)


def update(key, data, actor):
    """Change an account's name, Client ID, Client Secret or webhook Secret Token (a secret left empty is kept;
    ``remove_webhook`` drops the token). The Account ID is fixed: another Zoom account is added as a new account."""
    label = _text(data, 'label', 'name', 60)
    client_id = _text(data, 'client_id', 'Client ID', 64, r'[A-Za-z0-9_-]+')
    new_secret = str(data.get('client_secret') or '').strip()
    if new_secret and (len(new_secret) > 128 or not re.fullmatch(r'\S+', new_secret)):
        raise FieldError('client_secret', 'This does not look like a Zoom Client Secret: copy it again from the app’s App Credentials page.')
    encrypted = _encrypt(new_secret) if new_secret else None
    webhook = _webhook(data)
    drop_webhook = str(data.get('remove_webhook') or '').lower() == 'true'

    def change(accounts):
        if not any(account['key'] == key for account in accounts):
            raise ValueError('This Zoom account is not in the list any more. Reload the page.')
        for other in accounts:
            if other['key'] != key and other['label'].lower() == label.lower():
                raise FieldError('label', f'An account is already called {other["label"]}.')
        changed = []
        for account in accounts:
            if account['key'] == key:
                account = {**account, 'label': label, 'client_id': client_id, 'test': None}
                if encrypted:
                    account.update(secret=encrypted, secret_end=new_secret[-4:])
                if webhook:
                    account.update(webhook)
                elif drop_webhook:
                    account = {name: value for name, value in account.items() if name not in ('webhook_secret', 'webhook_end')}
            changed.append(account)
        return changed
    return _save(change, actor)


def remove(key, actor):
    from . import zoom_lines
    lines = [line['number'] for line in zoom_lines.stored() if line.get('account') == key]
    if lines:
        raise ValueError(f'The phone numbers {", ".join(lines)} are on this account. Remove them or move them to another account first.')
    people = list(Agent.objects.filter(zoom_account=key, active=True).values_list('display_name', flat=True))
    if people:
        raise ValueError(f'{", ".join(people)} {"is" if len(people) == 1 else "are"} on this account. Give them a number on another account first.')

    def change(accounts):
        return [account for account in accounts if account['key'] != key]
    return _save(change, actor)


def _zoom_reason(response):
    """Zoom's error, reduced to what is safe to show: its error code, and the scope names it says are missing."""
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    payload = payload if isinstance(payload, dict) else {}
    text = ' '.join(str(payload.get(field) or '') for field in ('reason', 'message', 'error'))
    scopes = sorted(set(re.findall(r'[a-z_]+:[a-z_]+(?::[a-z_]+)*', text.split('scope', 1)[1]))) if 'scope' in text else []
    code = re.sub(r'[^A-Za-z0-9_]', '', str(payload.get('code') or payload.get('error') or ''))[:40]
    return code, scopes, text.lower()


def _sign_in(account):
    """Ask Zoom for a token as the sync does; returns (client, problem). The problem names the field to fix."""
    import requests
    from .zoom_phone import ZoomClient
    client_secret = secret(account)
    if not client_secret:
        return None, {'field': 'client_secret', 'message': 'The server cannot read the saved Client Secret: enter it again.'}
    client = ZoomClient({'account_id': account['account_id'], 'client_id': account['client_id'], 'client_secret': client_secret})
    try:
        response = client.session.post('https://zoom.us/oauth/token', timeout=(10, 30), allow_redirects=False,
                                       auth=(account['client_id'], client_secret),
                                       data={'grant_type': 'account_credentials', 'account_id': account['account_id']})
    except requests.RequestException:
        client.close()
        return None, {'field': '', 'message': 'The server could not reach Zoom. Check its internet connection and try again.'}
    if response.ok:
        payload = response.json()
        client.token = payload.get('access_token', '')
        client.expires_at = float('inf')
        client.scopes = frozenset(str(payload.get('scope') or '').split())
        return client, None
    code, _, text = _zoom_reason(response)
    client.close()
    if code == 'invalid_client' or 'client' in text:
        return None, {'field': 'client_id', 'message': 'Zoom does not accept the Client ID and Client Secret together. Copy both again '
                      'from the app’s App Credentials page (and check the app is activated).'}
    if 'account' in text:
        return None, {'field': 'account_id', 'message': 'Zoom does not accept the Account ID for this app. Copy it again from the '
                      'app’s App Credentials page.'}
    return None, {'field': '', 'message': f'Zoom refused to sign in (HTTP {response.status_code}{f", {code}" if code else ""}).'}


def test(key, actor, now=None):
    """Sign in to Zoom with the account's app, then read one page of each thing the call centre uses. Saves and returns
    the result: ``working``, ``partial`` (signed in, something cannot be read) or ``failed`` (cannot sign in)."""
    account = find(key)
    if not account:
        raise ValueError('This Zoom account is not in the list any more. Reload the page.')
    now = now or timezone.now()
    client, problem = _sign_in(account)
    checks = []
    if client:
        params = {'page_size': 1, 'from': (now - timedelta(days=1)).date().isoformat(), 'to': now.date().isoformat()}
        try:
            for name, label, path, used_for in CHECKS:
                try:
                    response = client.api_get(path, params=params if name in ('call_history', 'recordings', 'voicemails') else {'page_size': 1})
                except Exception:   # noqa: BLE001 - one failed read must not hide the others
                    checks.append({'name': name, 'label': label, 'ok': False, 'used_for': used_for,
                                   'message': 'Zoom did not answer. Try again in a minute.'})
                    continue
                if response.ok:
                    checks.append({'name': name, 'label': label, 'ok': True, 'used_for': used_for, 'message': ''})
                else:
                    code, scopes, _ = _zoom_reason(response)
                    message = (f'The Zoom app needs the scope {", ".join(scopes)}: add it in the app’s Scopes, then test again.' if scopes
                               else 'Zoom Phone is not enabled on this Zoom account.' if code == '2031'
                               else f'Zoom refused (HTTP {response.status_code}{f", code {code}" if code else ""}).')
                    checks.append({'name': name, 'label': label, 'ok': False, 'used_for': used_for, 'message': message, 'scopes': scopes})
                response.close()
        finally:
            client.close()
        granted = getattr(client, 'scopes', None)
        if isinstance(granted, frozenset) and granted:   # Zoom lists the scopes it granted on the token
            for name, label, scopes, used_for, optional in SCOPE_CHECKS:
                ok = bool(granted & set(scopes))
                checks.append({'name': name, 'label': label, 'ok': ok, 'used_for': used_for, 'optional': optional,
                               'message': '' if ok else f'The Zoom app needs the scope {scopes[0]}: add it in the app’s Scopes, then test again.',
                               **({} if ok else {'scopes': [scopes[0]]})})
    status = 'failed' if problem else 'working' if all(check['ok'] or check.get('optional') for check in checks) else 'partial'
    result = {'status': status, 'tested_at': now.isoformat(), 'problem': problem, 'checks': checks}

    def change(accounts):
        return [{**item, 'test': result} if item['key'] == key else item for item in accounts]
    _save(change, actor)
    return result


def zoom_numbers(key, client=None):
    """Every phone number Zoom lists on the account: number, Zoom's display name, owner, status. Needs the app's phone
    numbers scope (zoom_lines.NUMBERS_SCOPE); raises ZoomError naming it when Zoom refuses."""
    from . import zoom_lines
    from .rules import normalize_phone
    from .zoom_phone import ZoomClient, ZoomError, validate_config
    if not find(key):
        raise ValueError('This Zoom account is not in the list any more. Reload the page.')
    own = client is None
    client = client or ZoomClient(validate_config(key))
    found = []
    try:
        token = ''
        while True:
            response = client.api_get('/phone/numbers', params={'page_size': 100, 'type': 'all', 'next_page_token': token})
            if not response.ok:
                code, scopes, _ = _zoom_reason(response)
                response.close()
                if scopes or response.status_code in (401, 403):
                    raise ZoomError(f'The Zoom app needs the scope {", ".join(scopes) or zoom_lines.NUMBERS_SCOPE} to list its numbers: '
                                    'add it in the app’s Scopes, then try again.')
                raise ZoomError(f'Zoom refused to list the numbers (HTTP {response.status_code}{f", code {code}" if code else ""}).')
            payload = client._json(response)
            for row in payload.get('phone_numbers') or []:
                number = normalize_phone(row.get('number'))
                if not number:
                    continue
                assignee = row.get('assignee') if isinstance(row.get('assignee'), dict) else {}
                site = row.get('site') if isinstance(row.get('site'), dict) else {}
                found.append({
                    'zoom_id': str(row.get('id') or ''),
                    'owner_id': str(assignee.get('id') or '') if assignee.get('type') == 'user' else '',
                    'number': number, 'display_name': str(row.get('display_name') or ''), 'status': str(row.get('status') or ''),
                    'assignee': str(assignee.get('name') or ''), 'assignee_type': str(assignee.get('type') or ''),
                    'extension': str(assignee.get('extension_number') or ''), 'site': str(site.get('name') or ''),
                    'capability': [str(item) for item in row.get('capability') or []],
                })
            token = payload.get('next_page_token') or ''
            if not token:
                return found
    finally:
        if own:
            client.close()


def rename_number(key, number, name):
    """Change a number's display name in Zoom (the app needs write access to phone numbers). Zoom shows it in its own
    apps and lists; whether a learner's phone shows a name is up to their network (most UK mobiles show only the number)."""
    from .rules import normalize_phone
    from .zoom_phone import ZoomClient, ZoomError, validate_config
    name = ' '.join(str(name or '').split())
    if not name or len(name) > 64:
        raise FieldError('display_name', 'Enter a name of up to 64 characters.')
    number = normalize_phone(number)
    client = ZoomClient(validate_config(key))
    try:
        row = next((item for item in zoom_numbers(key, client) if item['number'] == number), None)
        if not row or not row['zoom_id']:
            raise ValueError('Zoom does not list this number on the account any more. Press Refresh from Zoom.')
        response = client.api('PATCH', f'/phone/numbers/{row["zoom_id"]}', json={'display_name': name})
        if not response.ok:
            code, scopes, _ = _zoom_reason(response)
            response.close()
            if scopes or response.status_code in (401, 403):
                raise ZoomError(f'The Zoom app needs the scope {", ".join(scopes) or "phone:update:number:admin"} to rename numbers: '
                                'add it in the app’s Scopes, then try again.')
            raise ZoomError(f'Zoom refused the new name (HTTP {response.status_code}{f", code {code}" if code else ""}).')
        response.close()
    finally:
        client.close()
    return name


def numbers(key):
    """Every phone number on the account as Zoom lists it, with who has it in Zoom, its auto-recording, and whether it is
    in our list. Read-only."""
    from . import zoom_lines
    from .zoom_phone import ZoomClient, validate_config
    if not find(key):
        raise ValueError('This Zoom account is not in the list any more. Reload the page.')
    listed = {line['number']: line for line in zoom_lines.stored()}
    holders = zoom_lines.agents_by_number()
    client = ZoomClient(validate_config(key))
    try:
        found = zoom_numbers(key, client)
        for item in found:
            item.pop('zoom_id')
            line = listed.get(item['number'])
            # In our list, and on which account: a number listed on another account is a setup mistake.
            item.update(listed=bool(line), listed_account=line.get('account', '') if line else '',
                        specialists=[holder['name'] for holder in holders.get(item['number'], []) if holder['active']])
        recording_status(client, found)
    finally:
        client.close()
    return sorted(found, key=lambda item: (item['listed'], item['number']))


def recording(policy):
    """A Zoom phone user's Automatic Call Recording policy: on or off, which calls, and whether Zoom transcribes them."""
    auto = policy.get('auto_call_recording') if isinstance(policy, dict) else None
    if not isinstance(auto, dict) or 'enable' not in auto:
        return {'state': 'unknown', 'calls': '', 'transcription': None, 'reason': 'Zoom did not report the recording setting.'}
    if not auto.get('enable'):
        return {'state': 'off', 'calls': '', 'transcription': None, 'reason': ''}
    calls = str(auto.get('recording_calls') or '')
    transcription = auto.get('recording_transcription')
    return {'state': 'on', 'calls': RECORDED_CALLS.get(calls, calls), 'reason': '',
            'transcription': transcription if isinstance(transcription, bool) else None}


def recording_status(client, found):
    """Add each number's auto-recording, from its owner's Zoom phone policy. Only a number owned by a user has one; the
    rest are marked as such. Needs the app's phone users (read) scope; without it each number says so."""
    from .zoom_phone import ZoomError
    cache, refused = {}, ''
    for item in found:
        owner = item.pop('owner_id')
        if not owner:
            item['recording'] = {'state': 'not_user', 'calls': '', 'transcription': None,
                                 'reason': 'Set on the owner in Zoom (not a user).' if item['assignee'] else 'Nobody has this number in Zoom.'}
            continue
        if refused:
            item['recording'] = {'state': 'unknown', 'calls': '', 'transcription': None, 'reason': refused}
            continue
        if owner not in cache:
            try:
                response = client.api_get(f'/phone/users/{owner}')
            except ZoomError:
                cache[owner] = {'state': 'unknown', 'calls': '', 'transcription': None, 'reason': 'Zoom did not answer. Try again.'}
            else:
                if response.ok:
                    payload = client._json(response)
                    cache[owner] = recording(payload.get('policy'))
                else:
                    code, scopes, _ = _zoom_reason(response)
                    response.close()
                    reason = (f'The Zoom app needs the scope {", ".join(scopes)} to read it.' if scopes
                              else f'Zoom refused (HTTP {response.status_code}{f", code {code}" if code else ""}).')
                    if scopes or response.status_code in (401, 403):
                        refused = reason   # the same for every user: stop asking
                    cache[owner] = {'state': 'unknown', 'calls': '', 'transcription': None, 'reason': reason}
        item['recording'] = cache[owner]
