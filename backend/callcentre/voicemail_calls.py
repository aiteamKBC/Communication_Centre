"""Outgoing calls a voicemail picked up. Zoom reports them as answered (only those under 10 seconds are recorded as
cut off when imported), so they are marked on the call's match (``CallMatch.voicemail``):

- ``specialist``: the specialist saved No answer for the call;
- ``transcript``: the call's transcript starts like a voicemail greeting.

The mark is kept on the match, not in the Zoom result, which every re-sync rewrites. A marked call counts as a failed
attempt on its cases (``effective_result``: the case's missed-call flag and attempts, so the unreachable escalation
works) and is left out of answered calls, answer rate and learners reached. Its time still counts as talk time.
Reached, Callback or Refused saved for such a call is flagged for a manager, as for any call Zoom did not answer.
"""
from datetime import timedelta

from django.db.models import Case, F, Value, When
from django.utils import timezone

from .call_scope import recording_call_filter, system_calls
from .models import CallMatch, ZoomPhoneRecording

SPECIALIST, TRANSCRIPT = 'specialist', 'transcript'
VOICEMAIL = 'voicemail'
# Only the start of a transcript is read: a greeting comes first, and a conversation can mention a voicemail later.
GREETING_CHARACTERS = 400
# Longer calls are conversations even if they start at a voicemail (e.g. the learner picks up while it plays).
TRANSCRIPT_MAX_SECONDS = 120
# What voicemail greetings say. Kept to greeting wording: a bare "voicemail" is also said in conversations.
GREETING_PHRASES = (
    'leave a message', 'leave your message', 'leave me a message', 'record your message', 'after the tone',
    'after the beep', 'not available to take your call', 'is not available', "isn't available", 'is unavailable',
    "can't take your call", 'cannot take your call', 'unable to take your call', "can't get to the phone",
    'person you are calling', "you've reached the voicemail", 'you have reached the voicemail', 'voicemail of',
    'voicemail box', 'mailbox is full', 'the mailbox',
)


def marked(call):
    """The voicemail mark on a system call's match ('' when none)."""
    # A call with no match raises RelatedObjectDoesNotExist, an AttributeError.
    return getattr(getattr(call, 'callmatch', None), 'voicemail', '') or ''


def effective_result(call):
    """Zoom's result, or ``voicemail`` for an answered call a voicemail picked up."""
    return VOICEMAIL if call.result == 'answered' and marked(call) else call.result


def effective_result_expression():
    """``effective_result`` in a ZoomPhoneCall query."""
    return Case(When(result='answered', callmatch__voicemail__gt='', then=Value(VOICEMAIL)), default=F('result'))


def reached(call):
    """Answered by a person: Zoom says answered and no voicemail is marked."""
    return call.result == 'answered' and not marked(call)


def mark(match, source):
    """Mark an answered call as a voicemail. The worker re-applies the call to its cases on its next cycle."""
    if match.call.result == 'answered' and not match.voicemail:
        CallMatch.objects.filter(pk=match.pk, voicemail='').update(voicemail=source)
        match.voicemail = source


def looks_like_voicemail(text):
    start = ' '.join(str(text or '').lower().replace('’', "'").split())[:GREETING_CHARACTERS]
    return any(phrase in start for phrase in GREETING_PHRASES)


def detect(days=3):
    """Mark the recent answered calls whose transcript starts like a voicemail greeting. Returns how many."""
    found = 0
    recordings = ZoomPhoneRecording.objects.filter(started_at__gte=timezone.now() - timedelta(days=days)).exclude(transcript_text='')
    for recording in recordings.iterator():
        if not looks_like_voicemail(recording.transcript_text):
            continue
        call = (system_calls().filter(recording_call_filter(recording), direction='outbound', result='answered',
                                      callmatch__voicemail='').select_related('callmatch').first())
        if call and (call.duration_seconds or 0) <= TRANSCRIPT_MAX_SECONDS:
            mark(call.callmatch, TRANSCRIPT)
            found += 1
    return found
