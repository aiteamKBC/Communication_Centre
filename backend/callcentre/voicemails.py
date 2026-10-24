"""Voicemails left on the team's Zoom numbers: who left one, for whom, when, and what they said.

Read from Zoom (account voicemails; the app needs read access to voicemails) by the cycle, and sooner when Zoom's
webhook says one arrived. The transcript is Zoom's own; without one, and with AI transcription switched on, the audio
is transcribed like a call recording. The audio itself stays in Zoom and is streamed when someone presses Play.
Each voicemail joins the missed-call follow-up of its call (inbound), so it is called back like any missed call.
"""
import logging
from datetime import timedelta
from types import SimpleNamespace

from django.db import transaction
from django.utils import timezone

from .db import DB
from .models import CycleState, Inbound, ZoomPhoneCall, ZoomVoicemail
from .rules import normalize_phone, parse_moment

logger = logging.getLogger(__name__)
LOOKBACK = timedelta(days=14)
TRANSCRIPT_WAIT = timedelta(hours=24)


def _first(row, *keys):
    for key in keys:
        if row.get(key) not in (None, ''):
            return row[key]
    return ''


def values(key, account_id, row):
    """One voicemail from Zoom, as stored. Field names vary between Zoom's versions; each is read from any of them."""
    received = _first(row, 'date_time', 'date_created', 'start_time')
    duration = row.get('duration')
    return {
        'source_account': key, 'zoom_account_id': account_id, 'voicemail_id': str(row['id'])[:255],
        'call_history_id': str(_first(row, 'call_history_id', 'call_log_id'))[:255], 'call_id': str(_first(row, 'call_id'))[:255],
        'caller_number': str(_first(row, 'caller_number', 'caller_did_number'))[:128], 'caller_name': str(_first(row, 'caller_name'))[:255],
        'callee_number': str(_first(row, 'callee_number', 'callee_did_number'))[:128], 'callee_name': str(_first(row, 'callee_name'))[:255],
        'owner_id': str((row.get('owner') or {}).get('id') or '')[:128] if isinstance(row.get('owner'), dict) else '',
        'owner_name': str((row.get('owner') or {}).get('name') or '')[:255] if isinstance(row.get('owner'), dict) else '',
        'received_at': parse_moment(received), 'duration_seconds': int(duration) if isinstance(duration, (int, float)) and duration >= 0 else None,
        'zoom_status': str(_first(row, 'status'))[:16],
    }


def zoom_transcript(payload):
    """Zoom's transcript of a voicemail, if it has one: ``transcription.content`` (or plain text)."""
    found = payload.get('transcription') if isinstance(payload, dict) else None
    if isinstance(found, dict):
        found = found.get('content') or found.get('text')
    return found.strip() if isinstance(found, str) else ''


def sync(key, now=None):
    """Read the account's voicemails of the last two weeks, fetch the transcripts still missing and add each voicemail
    to its missed-call follow-up. Returns how many are new; a refusal (e.g. the scope missing) is kept for the page."""
    from .inbound import ready
    from .zoom_phone import ZoomClient, ZoomError, validate_config
    now = now or timezone.now()
    config = validate_config(key)
    client = ZoomClient(config)
    added = 0
    try:
        try:
            for rows in client._pages('/phone/voice_mails', ('voice_mails', 'voicemails'), (now - LOOKBACK).date(), now.date()):
                for row in rows:
                    if not isinstance(row, dict) or not row.get('id'):
                        continue
                    try:
                        found = values(key, config['account_id'], row)
                    except (ValueError, TypeError):
                        logger.warning('Skipped a Zoom voicemail with an invalid date on %s', key)
                        continue
                    _, created = ZoomVoicemail.objects.update_or_create(
                        zoom_account_id=found['zoom_account_id'], voicemail_id=found['voicemail_id'], defaults=found)
                    added += created
        except ZoomError as exc:
            CycleState.objects.update_or_create(name=f'voicemail_sync:{key}', defaults={'details': {'error': str(exc)[:300]}})
            raise
        CycleState.objects.update_or_create(name=f'voicemail_sync:{key}', defaults={'details': {'error': ''}, 'last_success_at': now})
        transcribe(client, key, now)
    finally:
        client.close()
    if ready():
        follow_up(key)
    return added


def transcribe(client, key, now):
    """Zoom's transcript for each voicemail still waiting; else the AI's (if switched on); after a day, none."""
    from .zoom_phone import ZoomError
    from .zoom_recordings import ai_transcription_enabled, fetch_ai_transcript
    for voicemail in ZoomVoicemail.objects.filter(source_account=key, transcript_status='pending', received_at__gte=now - LOOKBACK):
        try:
            response = client.api_get(f'/phone/voice_mails/{voicemail.voicemail_id}')
            payload = client._json(response)
            response.close()
            text = zoom_transcript(payload)
            if not text and ai_transcription_enabled() and payload.get('download_url'):
                status, text, _ = fetch_ai_transcript(client, payload['download_url'])
                if status != 'ready':
                    text = ''
        except ZoomError as exc:
            logger.warning('Voicemail %s transcript not read: %s', voicemail.pk, exc)
            continue
        if text:
            ZoomVoicemail.objects.filter(pk=voicemail.pk).update(transcript_status='ready', transcript_text=text[:20000])
        elif voicemail.received_at < now - TRANSCRIPT_WAIT:
            ZoomVoicemail.objects.filter(pk=voicemail.pk).update(transcript_status='unavailable')


def follow_up(key):
    """Put each voicemail on the follow-up of its missed call, or start one when Zoom has no call record for it yet."""
    from .inbound import line_agent, own_numbers, who_called
    from .rules import email_key
    own = own_numbers()
    for voicemail in ZoomVoicemail.objects.filter(source_account=key, inbound__isnull=True, received_at__gte=timezone.now() - LOOKBACK):
        number = normalize_phone(voicemail.caller_number)
        if not number or number in own:
            continue
        calls = ZoomPhoneCall.objects.filter(source_account=key, zoom_account_id=voicemail.zoom_account_id, direction='inbound')
        call = ((voicemail.call_history_id and calls.filter(history_id=voicemail.call_history_id).first())
                or (voicemail.call_id and calls.filter(call_id=voicemail.call_id).first()) or None)
        with transaction.atomic(using=DB):
            existing = Inbound.objects.select_for_update().filter(call=call).first() if call else None
            if existing:
                if not existing.voicemail_id:
                    Inbound.objects.filter(pk=existing.pk).update(voicemail=voicemail, updated_at=timezone.now())
                continue
            caller = who_called(number)
            Inbound.objects.create(
                call=call, voicemail=voicemail, kind=Inbound.CALLBACK if caller else Inbound.ENQUIRY, caller_number=number,
                caller_name=(caller or {}).get('name', '') or voicemail.caller_name, caller_email=email_key((caller or {}).get('email', '')),
                caller_role=(caller or {}).get('role', ''), line=normalize_phone(voicemail.callee_number), received_at=voicemail.received_at,
                agent=line_agent(call or SimpleNamespace(callee_number=voicemail.callee_number, source_account=key)))


def audio(voicemail):
    """The voicemail's audio from Zoom, for Play: (file, content type)."""
    from .zoom_phone import ZoomClient, ZoomError, validate_config
    from .zoom_recordings import download_audio
    client = ZoomClient(validate_config(voicemail.source_account))
    try:
        response = client.api_get(f'/phone/voice_mails/{voicemail.voicemail_id}')
        payload = client._json(response)
        response.close()
        if not payload.get('download_url'):
            raise ZoomError('Zoom has no audio for this voicemail any more.')
        file, _name, content_type = download_audio(client, payload['download_url'])
        return file, content_type
    finally:
        client.close()
