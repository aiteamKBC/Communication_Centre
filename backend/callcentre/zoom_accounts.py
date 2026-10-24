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
)


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
    """An account as the page sees it: never the secret."""
    return {'key': account['key'], 'label': account['label'], 'account_id': account['account_id'], 'client_id': account['client_id'],
            'secret_saved': bool(account.get('secret')), 'secret_end': account.get('secret_end', ''),
            'secret_readable': bool(secret(account)), 'added_by': account.get('added_by', ''), 'added_at': account.get('added_at'),
            'test': account.get('test')}


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

    def change(accounts):
        for other in accounts:
            if other['label'].lower() == label.lower():
                raise FieldError('label', f'An account is already called {other["label"]}.')
            if other['account_id'] == account_id:
                raise FieldError('account_id', f'{other["label"]} already uses this Account ID.')
        key = _new_key(label, account_id, accounts)
        return [*accounts, {'key': key, 'label': label, 'account_id': account_id, 'client_id': client_id, 'secret': encrypted,
                            'secret_end': client_secret[-4:], 'added_by': actor, 'added_at': timezone.now().isoformat(), 'test': None}]
    return _save(change, actor)


def update(key, data, actor):
    """Change an account's name, Client ID or Client Secret (left empty, the secret is kept). The Account ID is fixed:
    another Zoom account is added as a new account."""
    label = _text(data, 'label', 'name', 60)
    client_id = _text(data, 'client_id', 'Client ID', 64, r'[A-Za-z0-9_-]+')
    new_secret = str(data.get('client_secret') or '').strip()
    if new_secret and (len(new_secret) > 128 or not re.fullmatch(r'\S+', new_secret)):
        raise FieldError('client_secret', 'This does not look like a Zoom Client Secret: copy it again from the app’s App Credentials page.')
    encrypted = _encrypt(new_secret) if new_secret else None

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
                    response = client.api_get(path, params=params if name != 'numbers' else {'page_size': 1})
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
    status = 'failed' if problem else 'working' if all(check['ok'] for check in checks) else 'partial'
    result = {'status': status, 'tested_at': now.isoformat(), 'problem': problem, 'checks': checks}

    def change(accounts):
        return [{**item, 'test': result} if item['key'] == key else item for item in accounts]
    _save(change, actor)
    return result
