"""Zoom webhooks (the app's Event Subscriptions): Zoom tells us the moment a call ends, so the call and its result reach
the case within a minute instead of at the next cycle. Zoom calls this without a session; every request is checked
against the account's Secret Token (Zoom's ``x-zm-signature``). The event itself only asks the worker for a quick call
sync: the evidence is still Zoom's own call history, read with the app's credentials.
"""
import hashlib
import hmac
import json
import logging
import time
from datetime import timedelta

from django.db import DatabaseError
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from . import live_calls, zoom_accounts
from .cycle_requests import RECORDING_SYNC_REQUEST, ZOOM_CHECK_REQUEST, request as ask_worker, request_call_sync
from .models import CycleState

logger = logging.getLogger(__name__)
# Zoom's signature names the moment it was sent; an older request is a replay.
MAX_AGE_SECONDS = 300
# Webhooks come several per call: a quick sync at most every few seconds.
SYNC_GAP = timedelta(seconds=5)
# The events that mean a call is over and in Zoom's call history. The rest (ringing, hold, mute, SMS, fax...) are
# acknowledged and ignored: each would otherwise read the call history again for nothing.
CALL_ENDED = {'phone.caller_ended', 'phone.caller_call_log_completed', 'phone.callee_ended', 'phone.callee_call_log_completed',
              'phone.callee_missed'}
# A recording or its transcript is ready: fetch recordings now, so the transcript and AI review follow within minutes.
RECORDING_READY = {'phone.recording_completed', 'phone.recording_transcript_completed', 'phone.recording_completed_for_access_member',
                   'phone.recording_deleted', 'phone.recording_permanently_deleted',
                   'phone.voicemail_received', 'phone.voicemail_transcript_completed'}
RECORDING_GAP = timedelta(seconds=30)
# Anything else from Zoom Phone (a number, user or setting changed): check the numbers against Zoom early, at most hourly.
ZOOM_CHECK_GAP = timedelta(hours=1)


def state_name(key):
    return f'zoom_webhook_{key}'


def last_received(key):
    """What the account's webhook last did: {'event', 'at', 'rejected', 'rejected_at'}; {} before the first request."""
    try:
        state = CycleState.objects.filter(name=state_name(key)).first()
    except DatabaseError:
        return {}
    return state.details if state and isinstance(state.details, dict) else {}


def _remember(key, **values):
    try:
        state, _ = CycleState.objects.get_or_create(name=state_name(key))
        CycleState.objects.filter(name=state.name).update(details={**(state.details or {}), **values}, last_success_at=timezone.now())
    except DatabaseError:
        logger.exception('Could not record the Zoom webhook for %s', key)


def _sign(secret, message):
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def _refuse(key, reason, status):
    """Refuse the request, and keep why on the account so the Zoom Phone page can show it."""
    logger.warning('Zoom webhook for %s refused: %s', key, reason)
    _remember(key, rejected=reason, rejected_at=timezone.now().isoformat())
    return JsonResponse({'detail': reason}, status=status)


@csrf_exempt
@never_cache
@require_POST
def zoom_webhook(request, key):
    account = zoom_accounts.find(key)
    if not account:
        logger.warning('Zoom webhook for unknown account %s', key)
        return JsonResponse({'detail': 'Unknown account.'}, status=404)
    secret = zoom_accounts.webhook_secret(account)
    if not secret:
        return _refuse(key, 'No Secret Token saved for this account (or the server cannot read it): add it on the Zoom Phone page.', 401)
    body = request.body.decode('utf-8', errors='replace')
    stamp = request.headers.get('x-zm-request-timestamp', '')
    signature = request.headers.get('x-zm-signature', '')
    if not stamp.isdigit() or abs(time.time() - int(stamp)) > MAX_AGE_SECONDS:
        return _refuse(key, 'The request is missing Zoom’s timestamp, or it is too old.', 401)
    if not hmac.compare_digest(signature, f'v0={_sign(secret, f"v0:{stamp}:{body}")}'):
        return _refuse(key, 'Zoom’s signature does not match the saved Secret Token: copy it again from the app’s Features page.', 401)
    try:
        payload = json.loads(body)
    except ValueError:
        return _refuse(key, 'Zoom sent something that is not JSON.', 400)
    payload = payload if isinstance(payload, dict) else {}
    event = str(payload.get('event') or '')
    now = timezone.now().isoformat()
    if event == 'endpoint.url_validation':
        # Zoom's check that the URL is ours: answer its token signed with the Secret Token.
        plain = str((payload.get('payload') or {}).get('plainToken') or '')
        if not plain:
            return _refuse(key, 'Zoom’s URL check came without its token.', 400)
        _remember(key, validated_at=now, rejected='', rejected_at=None)
        return JsonResponse({'plainToken': plain, 'encryptedToken': _sign(secret, plain)})
    actor = f'zoom webhook {key}'
    try:
        if event == 'user.presence_status_updated':
            from .presence import record_event
            record_event(key, payload.get('payload'))
        else:
            live_calls.record(key, event, payload.get('payload'))
    except Exception:   # noqa: BLE001 - the live view is a convenience; Zoom must still get its answer
        logger.exception('Could not apply Zoom event %s for %s', event, key)
    # A call ended: read the call history now (at most every few seconds).
    if event in CALL_ENDED:
        queued = request_call_sync(actor, gap=SYNC_GAP)
    elif event in RECORDING_READY:
        queued = ask_worker(RECORDING_SYNC_REQUEST, actor, RECORDING_GAP)
    elif event.startswith('phone.') and event not in live_calls.EVENTS:
        queued = ask_worker(ZOOM_CHECK_REQUEST, actor, ZOOM_CHECK_GAP)
    else:
        queued = False
    _remember(key, event=event, at=now, rejected='', rejected_at=None)
    return JsonResponse({'ok': True, 'queued': bool(queued)})
