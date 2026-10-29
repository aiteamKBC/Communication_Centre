import logging
from datetime import datetime, time, timedelta

from django.core.exceptions import PermissionDenied
from django.db import DatabaseError, transaction
from django.db.models import Q
from django.utils import timezone

from .access import is_director
from .allocation import learner_owner, manager_owners, owners
from .call_log import ZOOM_WAIT
from .call_scope import system_case_calls, system_matches
from .db import DB
from .delegation import cover_of, work_rule
from .do_not_call import emails as do_not_call_emails
from .employer_desk import EMPLOYER, SATISFACTION, optional, scope_error, specialists
from .models import Agent, CallIntent, CallMatch, CaseCall, CaseTicket, TicketEvent, ZoomPhoneCall
from .rules import (FAILED_RESULTS, LONDON, OPTIONS, PROMISES, SATISFACTION_TYPES, SPECIALIST_CLOSES, waiting_on_support,
                    add_workdays, email_key, normalize_phone, parse_moment, promise_deadline, same_contact, working_day)
from .zoom_views import current_account_filter

logger = logging.getLogger(__name__)


class Conflict(ValueError):
    pass


def call_contact(ticket, role=''):
    """The phone/email used for a call; missing employer signatures are employer contacts."""
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    if ticket.source_type == 'signature' and data.get('employer_signature_missing') and role != 'learner':
        from .employer_check import manager_phone
        return email_key(ticket.manager_email), normalize_phone(manager_phone(ticket))
    return ticket.learner_email, normalize_phone(ticket.learner_phone)


def agent_for(user):
    return Agent.objects.filter(user=user, active=True, user__is_active=True).first()


def operating_agent(user, agent_id=None):
    """Resolve the Zoom identity an operator is authorized to use."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('An active signed-in account is required.')
    own = agent_for(user)
    if is_director(user):
        if not agent_id:
            return own
        agent = Agent.objects.filter(pk=agent_id, active=True, user__is_active=True).first()
        if not agent:
            raise PermissionDenied('Choose an active Zoom account.')
        return agent
    if agent_id and (not own or own.pk != agent_id):
        raise PermissionDenied('You cannot operate another Zoom account.')
    return own


def event(ticket, kind, data=None, agent=None, actor=None, call=None):
    who = actor or (agent.display_name if agent else 'System')
    entry = TicketEvent.objects.create(ticket=ticket, kind=kind, data=data or {}, agent=agent, actor=who, call=call)
    CaseTicket.objects.filter(pk=ticket.pk).update(last_actor=who, last_action_at=entry.created_at)
    return entry


def release_fields(ticket):
    ticket.claimed_by = None
    ticket.claimed_at = None
    ticket.last_activity_at = None


def allocated_owner(learner_email, source_type, team=None, source_data=None):
    """The specialist who looks after this contact, or None for the shared queue. With employer specialists
    (``team``), employer cases are shared between them and a specialist's learners are in the shared queue.
    An optional call belongs to the specialist who made it."""
    if optional(source_data):
        return source_data.get('agent_id')
    team = specialists() if team is None else team
    if source_type == EMPLOYER:
        return None if team else manager_owners().get(learner_email)
    owner = learner_owner(learner_email, owners())
    return None if owner in team else owner


def can_work(ticket, user, now=None, acting_agent=None):
    now = now or timezone.now()
    agent = acting_agent or agent_for(user)
    director = is_director(user)
    if not agent and not director:
        raise PermissionDenied('An active agent profile or manager permission is required.')
    if ticket.claimed_by_id and ticket.last_activity_at and ticket.last_activity_at > now - timedelta(minutes=30):
        if not agent or ticket.claimed_by_id != agent.pk:
            raise Conflict('Another agent is working on this ticket.')
    if agent and not director:
        # A director's task decides first: its receiver works the learner whoever owns them, and nobody else works a
        # case on the delegated list.
        delegated = work_rule(ticket, agent)
        if delegated is True:
            return agent
        if delegated:
            raise PermissionDenied(delegated)
        team = specialists()
        owner = allocated_owner(ticket.learner_email, ticket.source_type, team, ticket.source_data)
        if owner and owner != agent.pk:
            raise PermissionDenied(f'{Agent.objects.get(pk=owner).display_name} looks after this learner. '
                                   'Ask a manager to change the allocation.')
        refused = scope_error(ticket.source_type, agent.pk, team, ticket.source_data)
        if refused:
            raise PermissionDenied(refused)
    return agent


@transaction.atomic(using=DB)
def claim(ticket_id, agent, now=None, actor=None):
    now = now or timezone.now()
    if not agent.active or not agent.user.is_active:
        raise PermissionDenied('Agent is inactive.')
    current = CaseTicket.objects.filter(pk=ticket_id).first()
    delegated = work_rule(current, agent) if current else None
    if delegated and delegated is not True:
        raise Conflict(delegated)
    if delegated is not True:
        learner, source, data = (current.learner_email, current.source_type, current.source_data) if current else ('', '', {})
        team = specialists()
        owner = allocated_owner(learner, source, team, data)
        if owner and owner != agent.pk:
            raise Conflict(f'{Agent.objects.get(pk=owner).display_name} looks after this learner. Ask a manager to change the allocation.')
        refused = scope_error(source, agent.pk, team, data)
        if refused:
            raise Conflict(refused)
    # A single conditional UPDATE is the arbiter, including on SQLite.
    available = Q(claimed_by__isnull=True) | Q(last_activity_at__lte=now - timedelta(minutes=30)) | Q(claimed_by=agent)
    changed = CaseTicket.objects.open().filter(available, pk=ticket_id).update(
        claimed_by=agent, claimed_at=now, last_activity_at=now, status='in_progress', updated_at=now,
    )
    if not changed:
        raise Conflict('Ticket is claimed, archived or already resolved.')
    ticket = CaseTicket.objects.get(pk=ticket_id)
    event(ticket, 'claimed', agent=agent, actor=actor)
    return ticket


@transaction.atomic(using=DB)
def release(ticket_id, user, acting_agent=None):
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if ticket.status == 'in_progress':
        ticket.status = 'new'
    release_fields(ticket)
    ticket.save()
    event(ticket, 'released', agent=agent, actor=None if agent else user.get_username())


def expire_claims(now, agent=None):
    """Release claims idle for 30 minutes, and every claim of a specialist who is switched off or whose login is closed
    (or only ``agent``'s, when one is given): their cases go straight back to the list."""
    gone = Q(claimed_by__active=False) | Q(claimed_by__user__is_active=False)
    claims = CaseTicket.objects.filter(claimed_by=agent) if agent else CaseTicket.objects.filter(
        Q(last_activity_at__lte=now - timedelta(minutes=30)) | gone, claimed_by__isnull=False)
    for pk in claims.values_list('pk', flat=True):
        with transaction.atomic(using=DB):
            # Lock the case only: Postgres cannot lock the nullable side of the claimed-by join.
            ticket = CaseTicket.objects.select_for_update(of=('self',)).select_related('claimed_by__user').get(pk=pk)
            switched_off = ticket.claimed_by and not (ticket.claimed_by.active and ticket.claimed_by.user.is_active)
            if switched_off or (ticket.last_activity_at and ticket.last_activity_at <= now - timedelta(minutes=30)):
                agent = ticket.claimed_by
                release_fields(ticket)
                if ticket.status == 'in_progress':
                    ticket.status = 'new'
                ticket.save()
                event(ticket, 'claim_expired', {'previous_agent': agent.pk if agent else None})


REDIAL_AFTER = timedelta(seconds=30)


@transaction.atomic(using=DB)
def create_intent(ticket_id, agent, actor=None, contact_role=''):
    now = timezone.now()
    ticket = CaseTicket.objects.get(pk=ticket_id)
    if ticket.source_type == 'satisfaction':
        raise Conflict('Employer surveys are followed up by email, not by phone.')
    if ticket.next_followup_at and ticket.next_followup_at > now:
        raise Conflict('The next follow-up is not due yet.')
    call_email, number = call_contact(ticket, contact_role)
    if email_key(call_email) in do_not_call_emails():
        raise Conflict('This person is on the do-not-call list: do not phone them. You can still email them.')
    if not number:
        raise ValueError('A valid learner telephone number is required.')
    if not agent.zoom_email or not agent.zoom_account:
        raise ValueError('Configure the agent Zoom identity first.')
    # Claim every active issue included in the intent, or roll back the entire operation.
    tickets = call_cases(ticket, now)
    # An optional call is about that call alone; it is linked to the learner's open satisfaction review (not claimed,
    # so it stays on the other agents' lists) so feedback given on it can complete the review.
    linked = []
    if optional(ticket.source_data) or (ticket.source_type == 'signature' and ticket.source_data.get('employer_signature_missing')):
        tickets = [ticket]
        linked = list(CaseTicket.objects.open().filter(source_type=SATISFACTION, learner_email=ticket.learner_email))
    if not tickets:
        raise Conflict('This contact is no longer eligible for a call. Refresh the directory.')
    for item in tickets:
        claim(item.pk, agent, now, actor=actor)
    # A second press within seconds is the same call (a double click); a later one is a redial, a call of its own.
    prior = CallIntent.objects.filter(agent=agent, tickets=ticket, learner_email=call_email, number=number,
                                      matched_call__isnull=True, created_at__gte=now - REDIAL_AFTER).first()
    if prior:
        return prior
    intent = CallIntent.objects.create(agent=agent, learner_email=call_email, number=number)
    intent.tickets.add(*tickets, *linked)
    for item in tickets:
        # A case called for a director's task names it, for the task's summary.
        cover = cover_of(item)
        task = {'task_id': cover.task.pk} if cover and cover.direct and cover.task.to_agent_id == agent.pk else {}
        event(item, 'dial_requested', {'intent_id': intent.pk, 'number': number, **task}, agent=agent, actor=actor)
    return intent


def call_cases(ticket, now):
    """The cases one call to this contact covers: this one, and the person's other open cases that are due now."""
    candidates = CaseTicket.objects.open().exclude(source_type='satisfaction')
    person_id = ticket.source_data.get('person_id')
    if person_id and ticket.source_type != 'employer_feedback':
        same_person = Q(source_data__person_id=person_id)
        if ticket.learner_email:
            same_person |= same_contact(ticket)
        candidates = candidates.exclude(source_type='employer_feedback').filter(same_person)
    else:
        candidates = candidates.filter(same_contact(ticket)) if ticket.learner_email else candidates.filter(pk=ticket.pk)
    # The clicked case, plus the person's other cases that are due now: one waiting on a callback or a promise
    # keeps its waiting state.
    candidates = candidates.filter(Q(pk=ticket.pk) | Q(next_followup_at__isnull=True) | Q(next_followup_at__lte=now))
    # A technical issue still with support is not part of another call: the call would send it back to the list.
    candidates = candidates.filter(Q(pk=ticket.pk) | ~waiting_on_support())
    return list(candidates.order_by('pk'))


@transaction.atomic(using=DB)
def resolve(ticket_id, user=None, evidence=None, note='', option='other', acting_agent=None):
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    if ticket.status == 'resolved':
        return ticket
    if ticket.source_type in SATISFACTION_TYPES:
        raise ValueError('Complete the satisfaction feedback form to close this case.')
    if option not in OPTIONS:
        raise ValueError('Invalid resolution option.')
    agent = can_work(ticket, user, acting_agent=acting_agent) if user else None
    # Only proof closes a case. A manager may close one by hand; a specialist only closes cases with nothing to prove.
    if user is not None and ticket.source_type not in SPECIALIST_CLOSES and not is_director(user):
        raise PermissionDenied('This case closes when the learner’s action shows up.')
    if user is None:
        from .evidence import valid_evidence
        if not valid_evidence(ticket, evidence):
            raise ValueError('New, unambiguous source evidence is required.')
    elif not note.strip():
        raise ValueError('A resolution reason is required.')
    if user is not None:
        from .employer_check import missing
        if missing(ticket):
            raise ValueError('Confirm the progress review with the employer too (Employer confirmation), then resolve it.')
    close(ticket, agent, 'agent' if user else 'system', option, {'note': note, 'evidence': evidence},
          None if agent or not user else user.get_username())
    return ticket


def close(ticket, agent, resolved_by, option, data, actor=None):
    """Resolve a locked case and record why."""
    previous = ticket.status
    ticket.status = 'resolved'
    ticket.resolved_at = timezone.now()
    ticket.resolved_by = resolved_by
    ticket.resolved_agent = agent
    ticket.resolution_option = option
    ticket.next_followup_at = ticket.promised_at = None
    release_fields(ticket)
    ticket.save()
    event(ticket, 'resolved', {'previous': previous, 'resolved_by': resolved_by, **data}, agent, actor)


@transaction.atomic(using=DB)
def reopen(ticket_id, user, note, acting_agent=None):
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if ticket.source_type in SATISFACTION_TYPES:
        raise ValueError('Completed satisfaction reviews are retained; the next case opens automatically when due.')
    if ticket.status != 'resolved' or not note.strip():
        raise ValueError('A resolved ticket and reopening reason are required.')
    if (not is_director(user) and ticket.source_type not in SPECIALIST_CLOSES
            and not (agent and ticket.resolved_agent_id == agent.pk)):
        raise PermissionDenied('Only a manager or the specialist who closed this case can reopen it.')
    ticket.status = 'new'
    ticket.resolved_at = None
    ticket.resolved_by = ''
    ticket.resolved_agent = None
    ticket.archived = False
    ticket.attempts = 0
    ticket.evidence_after = timezone.now()
    # The earlier catch-up belongs to the closed round: kept as history, never read as proof for this one.
    if 'catchup_booking' in ticket.source_data:
        data = dict(ticket.source_data)
        data['previous_catchup_bookings'] = [*data.get('previous_catchup_bookings', []), data.pop('catchup_booking')]
        ticket.source_data = data
    ticket.save()
    event(ticket, 'reopened', {'note': note}, agent, None if agent else user.get_username())


def next_workday_morning(moment):
    return datetime.combine(add_workdays(moment, 1).date(), time(9), tzinfo=LONDON)


def line_agents(call, agents=None):
    """The specialists who may have made the call: by Zoom user, else by their assigned Zoom number.

    A shared line (a common-area phone or team number) reports no user email, so several
    specialists can share it; the dial request then tells them apart."""
    if agents is None:
        agents = Agent.objects.filter(active=True, user__is_active=True, zoom_account=call.source_account)
    agents = [a for a in agents if a.zoom_account == call.source_account]
    # A line on the Zoom Phone page is the identity: a call on it is its specialist's, whatever email Zoom shows.
    from .zoom_lines import line_for   # zoom_lines reads this module's Conflict
    line = line_for(call)
    if line:
        return [a for a in agents if normalize_phone(a.zoom_phone_number) == line['number']]
    matches = [a for a in agents if (a.zoom_user_id and a.zoom_user_id == call.caller_user_id)
               or (a.zoom_email and a.zoom_email == email_key(call.caller_email))]
    if matches:
        return matches
    line = normalize_phone(call.caller_number)
    return [a for a in agents if line and normalize_phone(a.zoom_phone_number) == line]


def identify_agent(call, agents=None):
    matches = line_agents(call, agents)
    return matches[0] if len(matches) == 1 else None


@transaction.atomic(using=DB)
def match_call(call_id):
    call = ZoomPhoneCall.objects.select_for_update().filter(current_account_filter(), pk=call_id, direction='outbound').first()
    if not call or call.started_at > timezone.now():
        return None
    match = CallMatch.objects.filter(call=call).first()
    if match:
        if not system_matches().filter(pk=match.pk).exists():
            return None
        apply_call_result(match)
        return match
    agents = line_agents(call)
    number = normalize_phone(call.callee_number)
    if not agents or not number:
        return None
    intents = list(CallIntent.objects.select_for_update().filter(
        agent__in=agents, number=number, matched_call__isnull=True,
        created_at__lte=call.started_at, created_at__gte=call.started_at - timedelta(minutes=10),
    ).order_by('-created_at'))
    # Presses by two specialists on a shared line cannot tell whose call it is. One specialist's redials each have their
    # own press: the call belongs to the last press before it.
    if not intents or len({item.agent_id for item in intents}) > 1:
        return None
    intent = intents[0]
    agent = intent.agent
    candidates = CaseTicket.objects.filter(created_at__lte=call.started_at, intents=intent)
    learner_email = intent.learner_email
    tickets = list(candidates.exclude(source_type='satisfaction').order_by('pk'))
    if not tickets:
        return None
    match = CallMatch.objects.create(call=call, agent=agent, learner_email=learner_email, manual=False)
    intent.matched_call = call
    intent.save(update_fields=['matched_call'])
    for ticket in tickets:
        CaseCall.objects.create(ticket=ticket, match=match)
        event(ticket, 'zoom_call', {'manual': match.manual, 'match_id': match.pk}, agent=agent, call=call)
    apply_call_result(match)
    return match


def apply_call_result(match):
    if not system_matches().filter(pk=match.pk).exists():
        return
    call = match.call
    if not call.ended_at or call.result not in FAILED_RESULTS | {'answered'}:
        return
    for link in system_case_calls(match.cases.all()).select_for_update().select_related('ticket'):
        if link.processed_result == call.result:
            continue
        ticket = CaseTicket.objects.select_for_update().get(pk=link.ticket_id)
        link.processed_result = call.result
        link.save(update_fields=['processed_result'])
        # Recompute from distinct real calls so re-syncs and out-of-order imports cannot inflate counts.
        eligible = system_case_calls(ticket.calls.all())
        failed = eligible.filter(processed_result__in=FAILED_RESULTS)
        if ticket.evidence_after:
            # A reopened or sent-back case starts a fresh count.
            failed = failed.filter(match__call__started_at__gt=ticket.evidence_after)
        ticket.attempts = failed.count()
        latest = eligible.exclude(processed_result='').select_related('match__call').order_by('-match__call__started_at', '-match__call_id').first()
        before_reopen = bool(latest and ticket.evidence_after and latest.match.call.started_at <= ticket.evidence_after)
        # Zoom's result is evidence only: the case moves on when the specialist saves the call's outcome.
        if ticket.status != 'resolved' and latest and not before_reopen:
            ticket.last_contact_at = latest.match.call.started_at
            ticket.save(update_fields=['attempts', 'last_contact_at'])
        else:
            ticket.save(update_fields=['attempts'])
        event(ticket, 'zoom_result', {'result': call.result, 'failed_attempts': ticket.attempts}, agent=match.agent, call=call)
        apply_pending_outcome(ticket, link, match)
        from .learner_satisfaction import apply_pending_feedback   # learner_satisfaction imports this module
        apply_pending_feedback(ticket, match)


OUTCOMES = {'reached', 'no_answer', 'wrong_number', 'callback', 'refused'}
# How long after pressing Call the after-call form is offered for that call.
PENDING_OUTCOME_WINDOW = timedelta(hours=2)


def check_outcome(ticket, outcome, option, note, callback_at):
    """Validate an outcome against the case; Zoom's call result is checked separately."""
    if outcome not in OUTCOMES:
        raise ValueError('Invalid outcome.')
    promises = PROMISES.get(ticket.source_type, {})
    if outcome == 'reached' and promises and option not in promises:
        raise ValueError('Choose what the learner agreed to.')
    if option and option not in OPTIONS:
        raise ValueError('Invalid resolution option.')
    if outcome == 'refused' and not note.strip():
        raise ValueError('Say what the learner said.')
    if outcome == 'callback' and (not callback_at or callback_at <= timezone.now()):
        raise ValueError('Choose a future callback time.')
    if outcome == 'wrong_number' and not note.strip():
        raise ValueError('Explain why this is the wrong number.')
    if callback_at and callback_at <= timezone.now():
        raise ValueError('Choose a future follow-up time.')
    if callback_at and not working_day(callback_at.astimezone(LONDON).date()):
        raise ValueError('Learners are not called at weekends or on bank holidays: choose a working day.')


def check_call_result(outcome, call):
    # No answer is never questioned: a voicemail that picks up is "answered" to Zoom, however long the message left.
    if outcome in {'reached', 'callback', 'refused'} and call.result != 'answered':
        raise ValueError('Zoom must confirm an answered call.')


@transaction.atomic(using=DB)
def record_outcome(ticket_id, user, call_id, outcome, option='', note='', callback_at=None, acting_agent=None):
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if ticket.status == 'resolved':
        raise Conflict('Reopen the case before recording another outcome.')
    link = system_case_calls().select_related('match__call', 'match__agent').filter(ticket=ticket, match__call_id=call_id).first()
    if not link:
        raise ValueError('A verified call started from this system is required.')
    if link.match.call.started_at < (ticket.evidence_after or ticket.created_at):
        raise ValueError('Use a call made since this case was opened or last reopened.')
    # can_work admits a manager without an Agent profile; only a non-manager is limited to their own calls.
    if not is_director(user) and link.match.agent_id != agent.pk:
        raise PermissionDenied('Only the calling agent or a manager can record this outcome.')
    check_outcome(ticket, outcome, option, note, callback_at)
    check_call_result(outcome, link.match.call)
    apply_outcome(ticket, link, agent, None if agent else user.get_username(), outcome, option, note, callback_at)


def latest_press(ticket, agent):
    """The last time Call was pressed for this case since it was opened or reopened: by this specialist, or by anyone
    for a manager without an agent profile."""
    presses = ticket.intents.filter(created_at__gte=ticket.evidence_after or ticket.created_at)
    return (presses.filter(agent=agent) if agent else presses).select_related('matched_call').order_by('-created_at', '-pk').first()


def fits_call(outcome, call):
    """Whether Zoom's result for the call agrees with the outcome saved (check_call_result)."""
    try:
        check_call_result(outcome, call)
    except ValueError:
        return False
    return True


def flag_mismatch(ticket, outcome, match):
    """Zoom's result contradicts the saved outcome (e.g. Reached on a call Zoom reports as voicemail): kept, and flagged
    on the case and the call for a manager to check."""
    if not fits_call(outcome, match.call):
        event(ticket, 'outcome_call_mismatch', {'outcome': outcome, 'result': match.call.result}, match.agent, call=match.call)


@transaction.atomic(using=DB)
def plan_outcome(ticket_id, user, outcome, option='', note='', callback_at=None, acting_agent=None):
    """Save a case's outcome and move the case on now; the specialist never picks the call and never waits for Zoom.
    The outcome belongs to the last Call press for the case, never to an earlier call, so the outcome of a call-back
    cannot land on the first call. When Zoom has reported that call it is recorded against it now; otherwise it is saved
    without a call and the call is attached when Zoom reports it (apply_pending_outcome). Zoom's result never refuses an
    outcome: one it contradicts is flagged (flag_mismatch). Returns True when the call was attached now."""
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if ticket.status == 'resolved':
        raise Conflict('Reopen the case before recording another outcome.')
    check_outcome(ticket, outcome, option, note, callback_at)
    actor = None if agent else user.get_username()
    intent = latest_press(ticket, agent)
    link = (system_case_calls().select_related('match__call', 'match__agent').filter(ticket=ticket, match__call_id=intent.matched_call_id).first()
            if intent and intent.matched_call_id else None)
    if link and not link.outcome and link.processed_result:
        apply_outcome(ticket, link, agent, actor, outcome, option, note, callback_at)
        flag_mismatch(ticket, outcome, link.match)
        return True
    # A call that already has its outcome keeps it: this one is saved on the case alone.
    apply_outcome(ticket, None, agent, actor, outcome, option, note, callback_at,
                  intent=intent if intent and not (link and link.outcome) else None)
    return False


def apply_stale_outcomes(now=None):
    """Outcomes held for Zoom before outcomes were applied straight away (saved just before that release) are applied
    without the call once Zoom is ZOOM_WAIT late, so none is left stuck. Zoom reporting the call later still attaches
    it. Returns how many."""
    now = now or timezone.now()
    applied = 0
    held = TicketEvent.objects.filter(kind='outcome_pending', created_at__gte=now - timedelta(days=1)).order_by('id')
    for pending in held:
        intent = CallIntent.objects.filter(pk=pending.data.get('intent_id')).first()
        if not intent or intent.matched_call_id or intent.created_at > now - ZOOM_WAIT:
            continue
        with transaction.atomic(using=DB):
            ticket = CaseTicket.objects.select_for_update().get(pk=pending.ticket_id)
            # Something saved on the case since (another outcome, or the case closed) replaces the held outcome.
            later = ticket.events.filter(pk__gt=pending.pk, kind__in=('outcome', 'outcome_pending', 'outcome_pending_dropped',
                                                                      NOT_DISCUSSED, 'optional_outcome', 'resolved')).exists()
            if later or ticket.status == 'resolved':
                continue
            data = pending.data
            try:
                callback_at = parse_moment(data['callback_at']) if data.get('callback_at') else None
                check_outcome(ticket, data['outcome'], data.get('option', ''), data.get('note', ''), callback_at)
            except ValueError as exc:
                event(ticket, 'outcome_pending_dropped', {'reason': str(exc), 'pending_event': pending.pk, 'intent_id': intent.pk},
                      pending.agent)
                continue
            apply_outcome(ticket, None, pending.agent, None, data['outcome'], data.get('option', ''), data.get('note', ''),
                          callback_at, intent=intent)
            applied += 1
    return applied


ALREADY_SAVED = 'This call has already been saved.'


def call_saved(intent):
    return TicketEvent.objects.filter(kind='call_saved', data__intent_id=intent.pk).exists()


def open_call(ticket, agent):
    """The call this specialist made in the last two hours that covers this case and is not saved yet: its cases,
    for the after-call form. None when there is no such call."""
    if not agent:
        return None
    intent = (CallIntent.objects.filter(agent=agent, tickets=ticket, created_at__gte=timezone.now() - PENDING_OUTCOME_WINDOW)
              .order_by('-created_at').first())
    if not intent or call_saved(intent):
        return None
    return {'ticket_ids': sorted(intent.tickets.values_list('pk', flat=True))}


# A case on the call that was not talked about: no outcome, it goes back to the list on the follow-up date.
NOT_DISCUSSED = 'not_discussed'
# Closes a case the specialist closes (nothing to prove): the call itself was the work.
RESOLVE = 'resolve'


@transaction.atomic(using=DB)
def save_call(ticket_id, user, items, note='', callback_at=None, acting_agent=None):
    """Save the outcome of every case on one call together, or none of them: one case failing rolls back the rest.
    ``ticket_id`` is the case the call was started from; ``items`` are ``{'id', 'outcome', 'option', 'note'}`` for
    cases on that call, a per-case note added to the shared one. Returns True when every outcome was applied now
    (False when one is held until Zoom reports the call)."""
    agent = can_work(CaseTicket.objects.get(pk=ticket_id), user, acting_agent=acting_agent)
    if not agent:
        raise PermissionDenied('Only the specialist who made the call can save its outcome.')
    intent = (CallIntent.objects.filter(agent=agent, tickets=ticket_id, created_at__gte=timezone.now() - PENDING_OUTCOME_WINDOW)
              .order_by('-created_at').first())
    if not intent:
        raise ValueError('Call the learner first.')
    if call_saved(intent):
        raise Conflict(ALREADY_SAVED)
    on_call = {ticket.pk: ticket for ticket in intent.tickets.all()}
    if not items:
        raise ValueError('Record an outcome for at least one case.')
    if callback_at and callback_at <= timezone.now():
        raise ValueError('Choose a future follow-up time.')
    if callback_at and not working_day(callback_at.astimezone(LONDON).date()):
        raise ValueError('Learners are not called at weekends or on bank holidays: choose a working day.')
    applied = True
    for item in items:
        ticket = on_call.get(item['id'])
        if not ticket:
            raise Conflict('A case on the screen was not part of this call. Refresh the page and record the call again.')
        outcome, option = item['outcome'], str(item.get('option') or '')
        text = '\n\n'.join(part for part in (note.strip(), str(item.get('note') or '')[:3500].strip()) if part)
        try:
            if optional(ticket.source_data) and outcome != 'callback':
                # An optional call is never a task: saving it closes it, whatever happened (a callback keeps it).
                event(ticket, 'optional_outcome', {'outcome': outcome, 'option': option, 'note': text, 'intent_id': intent.pk}, agent)
                resolve(ticket.pk, user, note=text or f'Optional call: {outcome.replace("_", " ")}', option='other', acting_agent=agent)
            elif outcome == RESOLVE:
                resolve(ticket.pk, user, note=text, option='other', acting_agent=agent)
            elif outcome == NOT_DISCUSSED:
                locked = CaseTicket.objects.select_for_update().get(pk=ticket.pk)
                if locked.status == 'resolved':
                    raise Conflict('This case is already closed.')
                if locked.status == 'in_progress':
                    locked.status = 'new'
                locked.next_followup_at = callback_at or next_workday_morning(timezone.now())
                release_fields(locked)
                locked.save()
                event(locked, NOT_DISCUSSED, {'note': text, 'intent_id': intent.pk,
                                              'callback_at': locked.next_followup_at.isoformat()}, agent)
            else:
                applied = plan_outcome(ticket.pk, user, outcome, option=option, note=text, callback_at=callback_at,
                                       acting_agent=agent) and applied
        except (ValueError, PermissionDenied) as exc:
            # Name the case, so the specialist knows which row to fix.
            raise type(exc)(f'{ticket.get_source_type_display()}: {exc}') from exc
    # Marks the call as recorded, so it is not offered or saved again (Next call and Full case show the same call).
    event(on_call[ticket_id], 'call_saved', {'intent_id': intent.pk}, agent)
    return applied


def apply_pending_outcome(ticket, link, match):
    """Attach this call to the outcome already saved for its Call press (flagged if Zoom's result contradicts it), or
    apply an outcome held for Zoom before outcomes were applied straight away."""
    if link.outcome:
        # Zoom changed the result of a call that already has its outcome (e.g. answered, now cut off): check it again.
        flag_mismatch(ticket, link.outcome, match)
        return
    intent = CallIntent.objects.filter(matched_call=match.call).first()
    if not intent:
        return
    saved = ticket.events.filter(kind='outcome', data__intent_id=intent.pk, call__isnull=True).order_by('-id').first()
    if saved:
        link.outcome, link.outcome_at = saved.data.get('outcome', ''), timezone.now()
        link.save(update_fields=['outcome', 'outcome_at'])
        event(ticket, 'outcome_call_linked', {'outcome': link.outcome, 'result': match.call.result,
                                              'outcome_event': saved.pk}, match.agent, call=match.call)
        flag_mismatch(ticket, link.outcome, match)
        return
    pending = ticket.events.filter(kind='outcome_pending', data__intent_id=intent.pk).order_by('-id').first()
    if not pending or ticket.status == 'resolved':
        return
    data = pending.data
    try:
        callback_at = parse_moment(data['callback_at']) if data.get('callback_at') else None
        check_call_result(data['outcome'], match.call)
        check_outcome(ticket, data['outcome'], data.get('option', ''), data.get('note', ''), callback_at)
    except ValueError as exc:
        event(ticket, 'outcome_pending_dropped', {'reason': str(exc), 'pending_event': pending.pk}, match.agent, call=match.call)
        return
    apply_outcome(ticket, link, match.agent, None, data['outcome'], data.get('option', ''), data.get('note', ''), callback_at)


def confirm_review_meeting(ticket, agent, actor):
    """A reached next-day call confirms the learner's Outlook review meeting. Never stops the call being saved (for
    example before the review meeting tables exist)."""
    from .review_meetings import confirmed
    try:
        with transaction.atomic(using=DB):
            confirmed(ticket, agent, actor)
    except DatabaseError:
        logger.exception('Review meeting of case %s not marked confirmed', ticket.pk)


def apply_outcome(ticket, link, agent, actor, outcome, option, note, callback_at, intent=None):
    """Record a validated outcome on a locked case and move the case on. Without ``link`` (no call from Zoom) it is
    saved on the case alone; ``intent`` is then the Call press whose call is attached if Zoom reports it later."""
    if link is not None:
        if not system_case_calls().filter(pk=link.pk).exists():
            raise ValueError('A verified call started from this system is required.')
        link.outcome, link.outcome_at = outcome, timezone.now()
        link.save(update_fields=['outcome', 'outcome_at'])
    promises = PROMISES.get(ticket.source_type, {})
    # MVP: agreeing to book is accepted as the close, because booking proof is not connected yet.
    closes_now = outcome == 'reached' and option in promises and promises[option] is None
    ticket.resolution_option = option
    ticket.promised_at = None  # any new outcome replaces an earlier promise
    # callback_at is the follow-up the specialist chose; without one each outcome has its own default.
    if outcome == 'callback':
        ticket.status, ticket.next_followup_at = 'pending_learner', callback_at
    elif outcome in {'wrong_number', 'refused'}:
        # Recorded with the note on the case; the case comes back to the list next working day.
        ticket.status, ticket.next_followup_at = 'pending_verification', callback_at or next_workday_morning(timezone.now())
    elif outcome == 'reached' and not closes_now:
        # The promise's deadline is when the case returns if no proof has closed it by then.
        if promises:
            ticket.promised_at = promise_deadline(ticket.source_type, option, timezone.now())
        ticket.status = 'pending_verification'
        ticket.next_followup_at = callback_at or ticket.promised_at or next_workday_morning(timezone.now())
    elif outcome == 'no_answer':
        # Held until the chosen follow-up, else the next working morning, then back at the bottom of the list.
        ticket.status, ticket.next_followup_at = 'new', callback_at or next_workday_morning(timezone.now())
    release_fields(ticket)
    ticket.save()
    data = {'outcome': outcome, 'option': option, 'note': note, 'callback_at': callback_at.isoformat() if callback_at else None,
            'promised_at': ticket.promised_at.isoformat() if ticket.promised_at else None}
    if link is None:
        data['without_call'] = True
        if intent:
            data['intent_id'] = intent.pk
    event(ticket, 'outcome', data, agent, actor, call=link.match.call if link else None)
    if outcome == 'reached' and ticket.source_type == 'reminder':
        confirm_review_meeting(ticket, agent, actor)
    if closes_now:
        close(ticket, agent, 'agent', option, {'note': note, 'promise': option}, actor)
