"""Read-only log of calls started from the system: one row per Call press, with what the call did to every case on it
(outcome, closing, booking, satisfaction feedback) and what Zoom reported."""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from .models import CallIntent, TicketEvent, ZoomPhoneRecording
from .rules import LONDON
from .voicemail_calls import effective_result, marked
from .zoom_phone import CUT_OFF_SECONDS

# What a call can do to a case, and how long after the Call press it may still happen: Zoom reports a call about ten
# minutes after it ends, and an outcome held until then is applied when it does.
IMPACT_KINDS = (
    'outcome', 'outcome_pending', 'outcome_pending_dropped', 'not_discussed', 'optional_outcome', 'resolved',
    'session_booked', 'learner_feedback_completed', 'employer_feedback_completed', 'feedback_pending',
    'feedback_pending_dropped', 'satisfaction_feedback_extra', 'outcome_call_mismatch', 'feedback_call_mismatch',
)
IMPACT_WINDOW = timedelta(days=1)
# A Call press Zoom has not reported after this long is not going to be matched.
ZOOM_WAIT = timedelta(minutes=30)
# An "answered" call this short was most likely not a conversation (an outgoing one is recorded as cut off when it is
# imported; an incoming one keeps Zoom's result).
SHORT_ANSWER_SECONDS = CUT_OFF_SECONDS
FEEDBACK_FIELDS = ('score', 'problem', 'agreed_action', 'note')


def zoom_state(intent, now):
    call = intent.matched_call
    if call:
        # A voicemail that picked up shows as one (voicemail_calls); its time is still shown.
        return {'state': effective_result(call), 'voicemail': marked(call), 'id': call.pk, 'started_at': call.started_at,
                'duration_seconds': call.duration_seconds if call.result == 'answered' else 0, 'short': short_answer(call)}
    return {'state': 'waiting' if intent.created_at > now - ZOOM_WAIT else 'not_matched', 'voicemail': '', 'id': None,
            'started_at': None, 'duration_seconds': None, 'short': False}


def short_answer(call):
    """Zoom says answered, but for only a few seconds: probably voicemail, so "reached" is doubtful."""
    return call.result == 'answered' and call.duration_seconds is not None and call.duration_seconds < SHORT_ANSWER_SECONDS


def wrap_up_seconds(call, saved_at):
    """From the end of the call to the after-call form being saved; None until both are known."""
    if not call or not call.ended_at or not saved_at or saved_at < call.ended_at:
        return None
    return round((saved_at - call.ended_at).total_seconds())


def recordings_of(calls):
    """Each matched call's recordings, oldest first, with the transcript's state and the AI's rating of the call."""
    if not calls:
        return {}
    from .models import AIAnalysis
    query = Q()
    for call in calls:
        query |= Q(source_account=call.source_account, call_id=call.call_id) if call.call_id else Q(pk__in=[])
        query |= Q(source_account=call.source_account, call_log_id=call.history_id)
    rows = list(ZoomPhoneRecording.objects.filter(query).order_by('started_at', 'id').values(
        'id', 'source_account', 'call_id', 'call_log_id', 'transcript_status', 'duration_seconds'))
    ratings = {}
    for analysis in AIAnalysis.objects.filter(recording_id__in=[row['id'] for row in rows], state='ready').order_by('created_at', 'pk'):
        ratings[analysis.recording_id] = analysis.result.get('call_rating', 'not_rated')
    found = defaultdict(list)
    for row in rows:
        for call in calls:
            if call.source_account == row['source_account'] and (
                    (call.call_id and call.call_id == row['call_id']) or call.history_id == row['call_log_id']):
                found[call.pk].append({'id': row['id'], 'transcript': row['transcript_status'],
                                       'duration_seconds': row['duration_seconds'], 'rating': ratings.get(row['id'])})
    return found


def transcript_state(recordings):
    """The best transcript state among a call's recordings: ready, else pending, else none."""
    found = {item['transcript'] for item in recordings}
    return 'ready' if 'ready' in found else 'pending' if 'pending' in found else min(found, default='none')


def case_impact(events):
    """What one call did to one case, from that case's events of the call (oldest first)."""
    impact = {'outcome': None, 'closed': None, 'bookings': [], 'feedback': None}
    for item in events:
        data, kind = item.data or {}, item.kind
        if kind in ('outcome', 'outcome_pending', 'not_discussed', 'optional_outcome'):
            state = {'outcome': 'applied', 'outcome_pending': 'waiting', 'not_discussed': 'not_discussed',
                     'optional_outcome': 'applied'}[kind]
            # A held outcome is replaced by the applied one when Zoom reports the call.
            if kind != 'outcome_pending' or not impact['outcome'] or impact['outcome']['state'] == 'waiting':
                impact['outcome'] = {'state': state, 'outcome': data.get('outcome', 'not_discussed' if kind == 'not_discussed' else ''),
                                     'option': data.get('option', ''), 'note': data.get('note', ''),
                                     'callback_at': data.get('callback_at'), 'promised_at': data.get('promised_at')}
        elif kind == 'outcome_call_mismatch' and impact['outcome']:
            # Saved straight away, then Zoom's result contradicted it (e.g. Reached on a voicemail): for a manager to check.
            impact['outcome'] = {**impact['outcome'], 'mismatch': data.get('result', '')}
        elif kind == 'outcome_pending_dropped' and impact['outcome']:
            impact['outcome'] = {**impact['outcome'], 'state': 'dropped', 'reason': data.get('reason', '')}
        elif kind == 'resolved':
            impact['closed'] = {'at': item.created_at, 'note': data.get('note', '')}
        elif kind == 'session_booked':
            impact['bookings'].append({key: data.get(key) for key in ('session_type', 'start', 'coach', 'join_url', 'link_warning')})
        elif kind in ('learner_feedback_completed', 'employer_feedback_completed', 'feedback_pending', 'satisfaction_feedback_extra'):
            impact['feedback'] = {'state': {'feedback_pending': 'waiting', 'satisfaction_feedback_extra': 'extra'}.get(kind, 'completed'),
                                  **{key: data.get(key) for key in FEEDBACK_FIELDS},
                                  'next_due_at': data.get('next_due_at'), 'at': item.created_at}
        elif kind == 'feedback_call_mismatch' and impact['feedback']:
            impact['feedback'] = {**impact['feedback'], 'mismatch': data.get('result', '')}
        elif kind == 'feedback_pending_dropped' and impact['feedback']:
            impact['feedback'] = {**impact['feedback'], 'state': 'dropped', 'reason': data.get('reason', '')}
    return impact


def never_applied(intent, ticket, now):
    """Why something held for Zoom on this call will not be applied any more ('' while it still can be)."""
    if intent.matched_call_id:
        # Held outcomes and feedback are applied as Zoom's call is matched; one still held was refused then.
        return 'The case was already closed when Zoom reported the call.' if ticket.status == 'resolved' else 'Zoom reported the call but it was not applied.'
    if intent.created_at <= now - ZOOM_WAIT:
        return 'Zoom has no call for this Call press.'
    return ''


def tied(intent, item):
    """Whether an event names this call: its Call press, or the Zoom call matched to it."""
    return (item.data or {}).get('intent_id') == intent.pk or bool(intent.matched_call_id and item.call_id == intent.matched_call_id)


def call_events(intent, events, end):
    """One case's events that came of this call. An event naming the call counts whenever it happened (an outcome held for
    Zoom is applied when Zoom reports the call, which can be much later); so does the closing its applied outcome caused.
    Other events by the same specialist (a booking, a closing) count until ``end``, unless they name another call."""
    mine, applied = [], []
    for item in events:
        if tied(intent, item):
            mine.append(item)
            if item.kind == 'outcome':
                applied.append(item.created_at)
        elif item.kind == 'resolved' and any(timedelta(0) <= item.created_at - moment <= timedelta(seconds=5) for moment in applied):
            mine.append(item)
        elif (intent.created_at <= item.created_at < end and item.agent_id == intent.agent_id
              and not (item.data or {}).get('intent_id') and not item.call_id):
            mine.append(item)
    return mine


def call_log(lower, upper, agents=None, page=1, page_size=25, now=None):
    """Calls started from the system between ``lower`` and ``upper``, newest first, by ``agents`` (everyone when None)."""
    now = now or timezone.now()
    intents = CallIntent.objects.filter(created_at__gte=lower, created_at__lt=upper)
    if agents is not None:
        intents = intents.filter(agent__in=agents)
    total = intents.count()
    summary = {'calls': total, 'answered': intents.filter(matched_call__result='answered', matched_call__callmatch__voicemail='').count(),
               'not_matched': intents.filter(matched_call__isnull=True, created_at__lt=now - ZOOM_WAIT).count()}
    # What the specialists achieved in the period, on any case: closed, booked, satisfaction feedback taken.
    done = TicketEvent.objects.filter(created_at__gte=lower, created_at__lt=upper, agent__isnull=False)
    if agents is not None:
        done = done.filter(agent__in=agents)
    summary['closed'] = done.filter(kind='resolved').values('ticket_id').distinct().count()
    summary['booked'] = done.filter(kind='session_booked').count()
    summary['feedback'] = done.filter(kind__in=('learner_feedback_completed', 'employer_feedback_completed')).count()
    selected = list(intents.select_related('agent', 'matched_call__callmatch').prefetch_related('tickets')
                    .order_by('-created_at', '-id')[(page - 1) * page_size:page * page_size])
    ticket_ids = {ticket.pk for intent in selected for ticket in intent.tickets.all()}
    # A case's events belong to the call until the same specialist's next Call press on that case.
    later = defaultdict(list)
    events = defaultdict(list)
    saved = {}
    if selected:
        first_press = min(intent.created_at for intent in selected)
        for agent_id, ticket_id, created_at in CallIntent.tickets.through.objects.filter(
                caseticket_id__in=ticket_ids, callintent__created_at__gt=first_press).values_list(
                'callintent__agent_id', 'caseticket_id', 'callintent__created_at'):
            later[(agent_id, ticket_id)].append(created_at)
        saved = dict(TicketEvent.objects.filter(kind='call_saved', data__intent_id__in=[intent.pk for intent in selected])
                     .values_list('data__intent_id', 'created_at'))
        for item in (TicketEvent.objects.filter(ticket_id__in=ticket_ids, kind__in=IMPACT_KINDS,
                                                created_at__gte=first_press)
                     .order_by('created_at', 'id')):
            events[item.ticket_id].append(item)
    recorded = recordings_of([intent.matched_call for intent in selected if intent.matched_call])
    rows = []
    for intent in selected:
        cases = []
        for ticket in sorted(intent.tickets.all(), key=lambda case: case.pk):
            end = min([moment for moment in later[(intent.agent_id, ticket.pk)] if moment > intent.created_at]
                      + [intent.created_at + IMPACT_WINDOW])
            impact = case_impact(call_events(intent, events[ticket.pk], end))
            stuck = never_applied(intent, ticket, now)
            for key in ('outcome', 'feedback'):
                if stuck and impact[key] and impact[key]['state'] == 'waiting':
                    impact[key] = {**impact[key], 'state': 'dropped', 'reason': stuck}
            cases.append({'id': ticket.pk, 'source_type': ticket.source_type, 'organisation': ticket.organisation,
                          'status': ticket.status, 'resolution_option': ticket.resolution_option,
                          'next_followup_at': ticket.next_followup_at, **impact})
        first = min(intent.tickets.all(), key=lambda case: case.pk, default=None)
        incoming = bool(intent.matched_call and intent.matched_call.direction == 'inbound')
        rows.append({
            # An answered call from the learner (inbound.link_call) has no Call press: it starts when they rang.
            'id': intent.pk, 'pressed_at': intent.matched_call.started_at if incoming else intent.created_at, 'incoming': incoming,
            'wrap_up_seconds': wrap_up_seconds(intent.matched_call, saved.get(intent.pk)),
            'agent': {'id': intent.agent_id, 'name': intent.agent.display_name},
            'learner_name': first.learner_name if first else '', 'learner_email': intent.learner_email, 'number': intent.number,
            'zoom': {**zoom_state(intent, now), 'transcript': transcript_state(recorded.get(intent.matched_call_id, []))},
            # Played from the call log and read there: each recording, its transcript state and the AI's rating.
            'recordings': recorded.get(intent.matched_call_id, []),
            # Saved with the after-call form (calls before that form have outcomes but no saved mark).
            'saved': intent.pk in saved or any(case['outcome'] for case in cases),
            'cases': cases,
        })
    return {'calls': rows, 'summary': summary, 'total': total, 'page': page, 'page_size': page_size, 'has_next': total > page * page_size}


# --- one call's cases as they were when the specialist called (the director's review, read only) ----------------------

CONTACT_FIELDS = ('learner_name', 'learner_phone', 'coach', 'organisation', 'programme', 'manager_name', 'manager_email')
# Housekeeping, not part of what was done with the case.
QUIET_KINDS = {'claimed', 'released', 'claim_expired', 'identity_contacts_refreshed'}


def contact_at(ticket, refreshed):
    """The case's contact details at the Call press. ``refreshed`` are its contact refreshes after the press, oldest
    first; each keeps the values it replaced, so the first one to change a field holds that field's value then."""
    found = {field: getattr(ticket, field) for field in CONTACT_FIELDS}
    taken = set()
    for item in refreshed:
        for field, value in ((item.data or {}).get('previous_contact') or {}).items():
            if field in found and field not in taken:
                found[field], taken = value, taken | {field}
    return found


def state_before(events, press):
    """What the case showed at the Call press, from its events before it (oldest first): open or closed, the follow-up
    and promise dates then still to come, and the last outcome recorded."""
    closed, followup, promise, last = False, None, None, None
    for item in events:
        data = item.data or {}
        if item.kind == 'resolved':
            closed = True
        elif item.kind == 'reopened':
            closed = False
        elif item.kind in ('outcome', 'optional_outcome', 'not_discussed'):
            last = {'outcome': data.get('outcome', 'not_discussed' if item.kind == 'not_discussed' else ''),
                    'option': data.get('option', ''), 'note': data.get('note', ''), 'at': item.created_at}
            followup, promise = data.get('callback_at'), data.get('promised_at')
    def future(value):
        # A follow-up is a moment; a promise may be a day.
        text = str(value) if value else ''
        moment, day = parse_datetime(text), parse_date(text[:10]) if text else None
        if moment and timezone.is_aware(moment):
            return value if moment > press else None
        return value if day and day >= press.astimezone(LONDON).date() else None
    return {'closed': closed, 'next_followup_at': future(followup), 'promised_at': future(promise), 'last_outcome': last}


def event_json(item):
    return {'id': item.pk, 'kind': item.kind, 'actor': item.actor, 'data': item.data or {}, 'created_at': item.created_at}


def call_snapshot(intent_id, now=None):
    """One call and each of its cases at the Call press: what the case was about, the contact details and history the
    specialist had in front of them, what the call did, and what happened to the case since."""
    from .views import issue_json
    now = now or timezone.now()
    intent = CallIntent.objects.select_related('agent', 'matched_call__callmatch').prefetch_related('tickets').get(pk=intent_id)
    press = intent.created_at
    tickets = sorted(intent.tickets.all(), key=lambda case: case.pk)
    later = defaultdict(list)
    for ticket_id, created_at in CallIntent.tickets.through.objects.filter(
            caseticket_id__in=[t.pk for t in tickets], callintent__agent_id=intent.agent_id,
            callintent__created_at__gt=press).values_list('caseticket_id', 'callintent__created_at'):
        later[ticket_id].append(created_at)
    events = defaultdict(list)
    for item in TicketEvent.objects.filter(ticket_id__in=[t.pk for t in tickets]).order_by('created_at', 'id'):
        events[item.ticket_id].append(item)
    tries = defaultdict(int)
    for ticket_id in CallIntent.tickets.through.objects.filter(
            caseticket_id__in=[t.pk for t in tickets], callintent__created_at__lt=press).values_list('caseticket_id', flat=True):
        tries[ticket_id] += 1
    cases = []
    for ticket in tickets:
        history = events[ticket.pk]
        before = [item for item in history if item.created_at < press]
        end = min(later[ticket.pk] + [press + IMPACT_WINDOW])
        mine = call_events(intent, [item for item in history if item.created_at >= press and item.kind in IMPACT_KINDS], end)
        impact = case_impact(mine)
        stuck = never_applied(intent, ticket, now)
        for key in ('outcome', 'feedback'):
            if stuck and impact[key] and impact[key]['state'] == 'waiting':
                impact[key] = {**impact[key], 'state': 'dropped', 'reason': stuck}
        # The call's own steps (Call pressed, Zoom's result, an email sent on it), then everything since.
        during = [item for item in history if item.created_at >= press and (
            item.pk in {event.pk for event in mine} or tied(intent, item)
            or (item.created_at < end and item.agent_id == intent.agent_id))]
        taken = {item.pk for item in during}
        cases.append({
            **issue_json(ticket),
            'module': str((ticket.source_data or {}).get('module') or '').strip(),
            'booking_at': ticket.booking_at, 'created_at': ticket.created_at, 'learner_email': ticket.learner_email,
            'contact': contact_at(ticket, [item for item in history if item.created_at >= press
                                           and item.kind == 'identity_contacts_refreshed']),
            'at_call': {**state_before(before, press), 'calls_before': tries[ticket.pk]},
            'before': [event_json(item) for item in before if item.kind not in QUIET_KINDS],
            'impact': impact,
            'during': [event_json(item) for item in during if item.kind not in QUIET_KINDS],
            'after': [event_json(item) for item in history if item.created_at >= press and item.pk not in taken
                      and item.kind not in QUIET_KINDS],
            'now': {'status': ticket.status, 'resolution_option': ticket.resolution_option, 'resolved_at': ticket.resolved_at,
                    'resolved_by': ticket.resolved_by, 'next_followup_at': ticket.next_followup_at, 'archived': ticket.archived},
        })
    incoming = bool(intent.matched_call and intent.matched_call.direction == 'inbound')
    recorded = recordings_of([intent.matched_call] if intent.matched_call else [])
    return {'id': intent.pk, 'pressed_at': intent.matched_call.started_at if incoming else press, 'incoming': incoming,
            'agent': {'id': intent.agent_id, 'name': intent.agent.display_name}, 'number': intent.number,
            'learner_email': intent.learner_email,
            'zoom': {**zoom_state(intent, now), 'transcript': transcript_state(recorded.get(intent.matched_call_id, []))},
            'recordings': recorded.get(intent.matched_call_id, []), 'cases': cases}
