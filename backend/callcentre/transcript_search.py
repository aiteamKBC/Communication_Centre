"""Search the transcripts of calls made from here: which calls mentioned a phrase, with the words around it."""
import re
from datetime import timedelta

from django.utils import timezone

from .call_scope import system_matches, system_recordings
from .zoom_views import current_account_filter, recording_calls

MIN_LENGTH = 3
LIMIT = 50
AROUND = 90


def snippets(text, phrase, most=3):
    """Up to ``most`` passages of the transcript around the phrase."""
    found = []
    for hit in re.finditer(re.escape(phrase), text, flags=re.IGNORECASE):
        start, end = max(0, hit.start() - AROUND), min(len(text), hit.end() + AROUND)
        found.append({'before': ('…' if start else '') + text[start:hit.start()], 'match': hit.group(0),
                      'after': text[hit.end():end] + ('…' if end < len(text) else '')})
        if len(found) == most:
            break
    return found


def search(phrase, days, agent=None, now=None):
    """Recordings whose transcript contains the phrase (any case), newest first. With ``agent``, only their calls."""
    phrase = ' '.join(str(phrase or '').split())[:100]
    if len(phrase) < MIN_LENGTH:
        raise ValueError(f'Type at least {MIN_LENGTH} letters to search.')
    now = now or timezone.now()
    recordings = (system_recordings().filter(current_account_filter(), transcript_status='ready', started_at__gte=now - timedelta(days=days),
                                             transcript_text__icontains=phrase).order_by('-started_at'))
    rows = []
    for recording in recordings:
        match = system_matches().filter(call__in=recording_calls(recording)).select_related('agent', 'call').first()
        if not match or (agent and match.agent_id != agent.pk):
            continue
        rows.append({'recording_id': recording.pk, 'call_id': match.call_id, 'started_at': recording.started_at,
                     'agent': match.agent.display_name, 'learner_email': match.learner_email, 'direction': match.call.direction,
                     'hits': len(re.findall(re.escape(phrase), recording.transcript_text, flags=re.IGNORECASE)),
                     'snippets': snippets(recording.transcript_text, phrase)})
        if len(rows) == LIMIT:
            break
    return {'phrase': phrase, 'results': rows, 'limited': len(rows) == LIMIT}
