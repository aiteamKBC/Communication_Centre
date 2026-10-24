"""Read-only log of calls started from the system: one row per Call press, with what the call did to every case on it
(outcome, closing, booking, satisfaction feedback) and what Zoom reported."""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import CallIntent, TicketEvent, ZoomPhoneRecording

# What a call can do to a case, and how long after the Call press it may still happen: Zoom reports a call about ten
# minutes after it ends, and an outcome held until then is applied when it does.
IMPACT_KINDS = (
    'outcome', 'outcome_pending', 'outcome_pending_dropped', 'not_discussed', 'optional_outcome', 'resolved',
    'session_booked', 'learner_feedback_completed', 'employer_feedback_completed', 'feedback_pending',
    'feedback_pending_dropped', 'satisfaction_feedback_extra',
)
IMPACT_WINDOW = timedelta(days=1)
# A Call press Zoom has not reported after this long is not going to be matched.
ZOOM_WAIT = timedelta(minutes=30)
# An "answered" call this short is most likely the learner's voicemail picking up, not the learner.
SHORT_ANSWER_SECONDS = 10
FEEDBACK_FIELDS = ('score', 'problem', 'agreed_action', 'note')


def zoom_state(intent, now):
    call = intent.matched_call
    if call:
        return {'state': call.result, 'id': call.pk, 'started_at': call.started_at,
                'duration_seconds': call.duration_seconds if call.result == 'answered' else 0, 'short': short_answer(call)}
    return {'state': 'waiting' if intent.created_at > now - ZOOM_WAIT else 'not_matched', 'id': None,
            'started_at': None, 'duration_seconds': None, 'short': False}


def short_answer(call):
    """Zoom says answered, but for only a few seconds: probably voicemail, so "reached" is doubtful."""
    return call.result == 'answered' and call.duration_seconds is not None and call.duration_seconds < SHORT_ANSWER_SECONDS


def wrap_up_seconds(call, saved_at):
    """From the end of the call to the after-call form being saved; None until both are known."""
    if not call or not call.ended_at or not saved_at or saved_at < call.ended_at:
        return None
    return round((saved_at - call.ended_at).total_seconds())


def transcripts(calls):
    """The best transcript state of each matched call: ready, else pending, else none."""
    if not calls:
        return {}
    query = Q()
    for call in calls:
        query |= Q(source_account=call.source_account, call_id=call.call_id) if call.call_id else Q(pk__in=[])
        query |= Q(source_account=call.source_account, call_log_id=call.history_id)
    states = defaultdict(set)
    for recording in ZoomPhoneRecording.objects.filter(query).values('source_account', 'call_id', 'call_log_id', 'transcript_status'):
        for call in calls:
            if call.source_account == recording['source_account'] and (
                    (call.call_id and call.call_id == recording['call_id']) or call.history_id == recording['call_log_id']):
                states[call.pk].add(recording['transcript_status'])
    return {pk: 'ready' if 'ready' in found else 'pending' if 'pending' in found else sorted(found)[0] for pk, found in states.items()}


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
    summary = {'calls': total, 'answered': intents.filter(matched_call__result='answered').count(),
               'not_matched': intents.filter(matched_call__isnull=True, created_at__lt=now - ZOOM_WAIT).count()}
    # What the specialists achieved in the period, on any case: closed, booked, satisfaction feedback taken.
    done = TicketEvent.objects.filter(created_at__gte=lower, created_at__lt=upper, agent__isnull=False)
    if agents is not None:
        done = done.filter(agent__in=agents)
    summary['closed'] = done.filter(kind='resolved').values('ticket_id').distinct().count()
    summary['booked'] = done.filter(kind='session_booked').count()
    summary['feedback'] = done.filter(kind__in=('learner_feedback_completed', 'employer_feedback_completed')).count()
    selected = list(intents.select_related('agent', 'matched_call').prefetch_related('tickets')
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
    found = transcripts([intent.matched_call for intent in selected if intent.matched_call])
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
            'zoom': {**zoom_state(intent, now), 'transcript': found.get(intent.matched_call_id, 'none')},
            # Saved with the after-call form (calls before that form have outcomes but no saved mark).
            'saved': intent.pk in saved or any(case['outcome'] for case in cases),
            'cases': cases,
        })
    return {'calls': rows, 'summary': summary, 'total': total, 'page': page, 'page_size': page_size, 'has_next': total > page * page_size}
