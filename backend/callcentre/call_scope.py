"""Calls initiated in the Communication Centre, verified against Zoom history.

Imported Zoom records and legacy manual matches are retained, but are not evidence
of an in-system call. A matched dial request and the same attributed agent are
required for progress, recordings and ticket actions. An answered incoming call from
a learner on their specialist's own number gets the same (inbound.link_call); counts
of calls made filter on direction='outbound'.

Calls made from the Events hub are matched by its own rules (events_hub.match_dials) and kept apart: they are never
system calls, and count only towards talk time, calls made and the daily target (event_call_list).
"""
from django.db import ProgrammingError, transaction
from django.db.models import Exists, F, OuterRef, Q

from .db import DB
from .models import CallMatch, CaseCall, EventsHubCall, ZoomPhoneCall, ZoomPhoneRecording


def system_calls(queryset=None):
    calls = ZoomPhoneCall.objects.all() if queryset is None else queryset
    return calls.filter(
        callmatch__manual=False,
        callintent__agent_id=F('callmatch__agent_id'),
    )


def event_call_list(*filters, **lookups):
    """The Zoom calls made from the Events hub that match these filters (``events_hub_call__agent=`` names the
    specialist), oldest first. A call that is also a system call counts there instead. Empty until
    docs/callcentre-port/event_calls.sql has run."""
    calls = ZoomPhoneCall.objects.filter(*filters, events_hub_call__isnull=False, **lookups).exclude(
        pk__in=system_calls().values('pk'))
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            # Loaded with the call, so reached() (the voicemail mark on a match) asks no query per call.
            return list(calls.select_related('callmatch').order_by('started_at', 'pk'))
    except ProgrammingError:
        return []


def system_matches(queryset=None):
    matches = CallMatch.objects.all() if queryset is None else queryset
    return matches.filter(call_id__in=system_calls().values('pk'))


def system_case_calls(queryset=None):
    links = CaseCall.objects.all() if queryset is None else queryset
    return links.filter(
        match_id__in=system_matches().values('pk'),
        match__call__callintent__tickets=F('ticket_id'),
    )


def recording_call_filter(recording):
    query = Q(history_id=recording.call_log_id) if recording.call_log_id else Q(pk__in=[])
    if recording.call_id:
        query |= Q(call_id=recording.call_id)
    return query & Q(source_account=recording.source_account, zoom_account_id=recording.zoom_account_id)


def system_recordings(queryset=None):
    recordings = ZoomPhoneRecording.objects.all() if queryset is None else queryset
    # Resolve against all imported calls first: an eligible call must not hide a
    # second, ambiguous call with the same Zoom identifier.
    candidates = ZoomPhoneCall.objects.filter(
        (Q(history_id=OuterRef('call_log_id')) & ~Q(history_id='')) |
        (Q(call_id=OuterRef('call_id')) & ~Q(call_id='')),
        source_account=OuterRef('source_account'), zoom_account_id=OuterRef('zoom_account_id'),
    ).order_by('pk')
    return recordings.alias(
        _system_call=Exists(system_calls(candidates)),
        _ambiguous_call=Exists(candidates[1:2]),
    ).filter(_system_call=True, _ambiguous_call=False)
