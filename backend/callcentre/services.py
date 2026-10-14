from datetime import datetime, time, timedelta

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .access import is_director
from .allocation import learner_owner, manager_owners, owners
from .db import DB
from .models import Agent, CallIntent, CallMatch, CaseCall, CaseTicket, CycleState, TicketEvent, ZoomPhoneCall
from .rules import (FAILED_RESULTS, LONDON, OPTIONS, PROMISES, SATISFACTION_TYPES, SPECIALIST_CLOSES, waiting_on_support,
                    add_workdays, email_key, normalize_phone, parse_moment, promise_deadline, same_contact, working_day)
from .zoom_views import current_account_filter


class Conflict(ValueError):
    pass


def agent_for(user):
    return Agent.objects.filter(user=user, active=True, user__is_active=True).first()


def operating_agent(user, agent_id=None):
    """Resolve the Zoom identity an operator is authorized to use."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('An active signed-in account is required.')
    own = agent_for(user)
    if user.is_superuser:
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


def allocated_owner(learner_email, source_type):
    """The specialist who looks after this contact, or None for the shared queue."""
    if source_type == 'employer_feedback':
        return manager_owners().get(learner_email)
    return learner_owner(learner_email, owners())


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
        owner = allocated_owner(ticket.learner_email, ticket.source_type)
        if owner and owner != agent.pk:
            raise PermissionDenied(f'{Agent.objects.get(pk=owner).display_name} looks after this learner. '
                                   'Ask a manager to change the allocation.')
    return agent


@transaction.atomic(using=DB)
def claim(ticket_id, agent, now=None, actor=None):
    now = now or timezone.now()
    if not agent.active or not agent.user.is_active:
        raise PermissionDenied('Agent is inactive.')
    learner, source = CaseTicket.objects.filter(pk=ticket_id).values_list('learner_email', 'source_type').first() or ('', '')
    owner = allocated_owner(learner, source)
    if owner and owner != agent.pk:
        raise Conflict(f'{Agent.objects.get(pk=owner).display_name} looks after this learner. Ask a manager to change the allocation.')
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
            ticket = CaseTicket.objects.select_for_update().select_related('claimed_by__user').get(pk=pk)
            switched_off = ticket.claimed_by and not (ticket.claimed_by.active and ticket.claimed_by.user.is_active)
            if switched_off or (ticket.last_activity_at and ticket.last_activity_at <= now - timedelta(minutes=30)):
                agent = ticket.claimed_by
                release_fields(ticket)
                if ticket.status == 'in_progress':
                    ticket.status = 'new'
                ticket.save()
                event(ticket, 'claim_expired', {'previous_agent': agent.pk if agent else None})


@transaction.atomic(using=DB)
def create_intent(ticket_id, agent, actor=None):
    now = timezone.now()
    ticket = CaseTicket.objects.get(pk=ticket_id)
    if ticket.source_type == 'satisfaction':
        raise Conflict('Employer surveys are followed up by email, not by phone.')
    if ticket.next_followup_at and ticket.next_followup_at > now:
        raise Conflict('The next follow-up is not due yet.')
    number = normalize_phone(ticket.learner_phone)
    if not number:
        raise ValueError('A valid learner telephone number is required.')
    if not agent.zoom_email or not agent.zoom_account:
        raise ValueError('Configure the agent Zoom identity first.')
    # Claim every active issue included in the intent, or roll back the entire operation.
    candidates = CaseTicket.objects.open().exclude(source_type='satisfaction')
    person_id = ticket.source_data.get('person_id')
    if person_id:
        same_person = Q(source_data__person_id=person_id)
        if ticket.learner_email:
            same_person |= same_contact(ticket)
        candidates = candidates.filter(same_person)
    else:
        candidates = candidates.filter(same_contact(ticket)) if ticket.learner_email else candidates.filter(pk=ticket.pk)
    # The clicked case, plus the person's other cases that are due now: one waiting on a callback or a promise
    # keeps its waiting state.
    candidates = candidates.filter(Q(pk=ticket.pk) | Q(next_followup_at__isnull=True) | Q(next_followup_at__lte=now))
    # A technical issue still with support is not part of another call: the call would send it back to the list.
    candidates = candidates.filter(Q(pk=ticket.pk) | ~waiting_on_support())
    tickets = list(candidates.order_by('pk'))
    if not tickets:
        raise Conflict('This contact is no longer eligible for a call. Refresh the directory.')
    for item in tickets:
        claim(item.pk, agent, now, actor=actor)
    prior = CallIntent.objects.filter(agent=agent, tickets=ticket, learner_email=ticket.learner_email, number=number,
                                      matched_call__isnull=True, created_at__gte=now - timedelta(minutes=10)).first()
    if prior:
        return prior
    intent = CallIntent.objects.create(agent=agent, learner_email=ticket.learner_email, number=number)
    intent.tickets.add(*tickets)
    for item in tickets:
        event(item, 'dial_requested', {'intent_id': intent.pk, 'number': number}, agent=agent, actor=actor)
    return intent


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


def identify_agent(call, agents=None):
    if agents is None:
        agents = Agent.objects.filter(active=True, user__is_active=True, zoom_account=call.source_account)
    matches = [a for a in agents if a.zoom_account == call.source_account and (
        (a.zoom_user_id and a.zoom_user_id == call.caller_user_id)
        or (a.zoom_email and a.zoom_email == email_key(call.caller_email)))]
    return matches[0] if len(matches) == 1 else None


@transaction.atomic(using=DB)
def match_call(call_id):
    call = ZoomPhoneCall.objects.select_for_update().filter(current_account_filter(), pk=call_id, direction='outbound').first()
    if not call or call.started_at > timezone.now():
        return None
    match = CallMatch.objects.filter(call=call).first()
    if match:
        apply_call_result(match)
        return match
    agent = identify_agent(call)
    number = normalize_phone(call.callee_number)
    if not agent or not number:
        return None
    intents = list(CallIntent.objects.select_for_update().filter(
        agent=agent, number=number, matched_call__isnull=True,
        created_at__lte=call.started_at, created_at__gte=call.started_at - timedelta(minutes=10),
    )[:2])
    if len(intents) > 1:
        return None
    intent = intents[0] if intents else None
    candidates = CaseTicket.objects.filter(created_at__lte=call.started_at)
    if intent:
        candidates = candidates.filter(intents=intent)
        learner_email = intent.learner_email
    else:
        candidates = candidates.filter(Q(status='resolved', resolved_at__gte=call.started_at) | ~Q(status='resolved'))
        # Include historical cases in ambiguity detection, even if one is resolved.
        emails = list(CaseTicket.objects.filter(learner_phone=number).exclude(source_type__in=('satisfaction', 'employer_feedback'))
                      .values_list('learner_email', flat=True).distinct()[:2])
        if len(emails) != 1:
            return None
        learner_email = emails[0]
        # The queue is not a complete address book. Confirm uniqueness across the
        # latest successful Aptem contact snapshot, including learners without cases.
        directory = CycleState.objects.filter(name='phone_directory').first()
        if not directory or not directory.last_success_at or directory.last_success_at < timezone.now() - timedelta(hours=24):
            return None
        if directory.details.get(number) != [learner_email]:
            return None
        # A manual dial is matched as a learner contact only (the email above came from learner cases).
        candidates = candidates.filter(learner_phone=number, learner_email=learner_email).exclude(source_type='employer_feedback')
    tickets = list(candidates.exclude(source_type='satisfaction').order_by('pk'))
    if not tickets:
        return None
    match = CallMatch.objects.create(call=call, agent=agent, learner_email=learner_email, manual=intent is None)
    if intent:
        intent.matched_call = call
        intent.save(update_fields=['matched_call'])
    for ticket in tickets:
        CaseCall.objects.create(ticket=ticket, match=match)
        event(ticket, 'zoom_call', {'manual': match.manual, 'match_id': match.pk}, agent=agent, call=call)
    apply_call_result(match)
    return match


def apply_call_result(match):
    call = match.call
    if not call.ended_at or call.result not in FAILED_RESULTS | {'answered'}:
        return
    for link in match.cases.select_for_update().select_related('ticket'):
        if link.processed_result == call.result:
            continue
        ticket = CaseTicket.objects.select_for_update().get(pk=link.ticket_id)
        link.processed_result = call.result
        link.save(update_fields=['processed_result'])
        # Recompute from distinct real calls so re-syncs and out-of-order imports cannot inflate counts.
        failed = ticket.calls.filter(processed_result__in=FAILED_RESULTS)
        if ticket.evidence_after:
            # A reopened or sent-back case starts a fresh count.
            failed = failed.filter(match__call__started_at__gt=ticket.evidence_after)
        ticket.attempts = failed.count()
        latest = ticket.calls.exclude(processed_result='').select_related('match__call').order_by('-match__call__started_at', '-match__call_id').first()
        other_claim = (ticket.claimed_by_id and ticket.claimed_by_id != match.agent_id and ticket.last_activity_at
                       and ticket.last_activity_at > timezone.now() - timedelta(minutes=30))
        before_reopen = bool(latest and ticket.evidence_after and latest.match.call.started_at <= ticket.evidence_after)
        if ticket.status != 'resolved' and latest and not other_claim and not before_reopen:
            last = latest.match.call
            ticket.last_contact_at = last.started_at
            if last.result in FAILED_RESULTS:
                # A missed call is held until the next working morning, then comes back flagged, at the bottom.
                ticket.next_followup_at = next_workday_morning(last.ended_at)
                ticket.status = 'new'
            elif not (ticket.promised_at and ticket.promised_at > timezone.now()):
                # Reached but nothing agreed yet: the case comes back next working day unless an outcome sets a promise.
                ticket.status = 'pending_verification'
                ticket.next_followup_at = next_workday_morning(last.ended_at)
            release_fields(ticket)
            ticket.save()
        else:
            ticket.save(update_fields=['attempts'])
        event(ticket, 'zoom_result', {'result': call.result, 'failed_attempts': ticket.attempts}, agent=match.agent, call=call)
        apply_pending_outcome(ticket, link, match)


OUTCOMES = {'reached', 'no_answer', 'wrong_number', 'callback', 'refused'}
# How long after pressing Call a specialist can still record the outcome before Zoom reports the call.
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
    if outcome == 'no_answer' and call.result not in FAILED_RESULTS:
        raise ValueError('Zoom does not report this call as unanswered.')
    if outcome in {'reached', 'callback', 'refused'} and call.result != 'answered':
        raise ValueError('Zoom must confirm an answered call.')


@transaction.atomic(using=DB)
def record_outcome(ticket_id, user, call_id, outcome, option='', note='', callback_at=None, acting_agent=None):
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if ticket.status == 'resolved':
        raise Conflict('Reopen the case before recording another outcome.')
    link = CaseCall.objects.select_related('match__call', 'match__agent').filter(ticket=ticket, match__call_id=call_id).first()
    if not link:
        raise ValueError('An actual linked Zoom call is required.')
    if link.match.call.started_at < (ticket.evidence_after or ticket.created_at):
        raise ValueError('Use a call made since this case was opened or last reopened.')
    # can_work admits a manager without an Agent profile; only a non-manager is limited to their own calls.
    if not is_director(user) and link.match.agent_id != agent.pk:
        raise PermissionDenied('Only the calling agent or a manager can record this outcome.')
    check_outcome(ticket, outcome, option, note, callback_at)
    check_call_result(outcome, link.match.call)
    apply_outcome(ticket, link, agent, None if agent else user.get_username(), outcome, option, note, callback_at)


@transaction.atomic(using=DB)
def plan_outcome(ticket_id, user, outcome, option='', note='', callback_at=None, acting_agent=None):
    """Save the outcome straight after the call. Until Zoom reports the call it is held, then applied
    automatically if Zoom confirms an answered call. Returns True when it was applied now."""
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if not agent:
        raise PermissionDenied('Only the specialist who made the call can save its outcome.')
    if ticket.status == 'resolved':
        raise Conflict('Reopen the case before recording another outcome.')
    if outcome == 'no_answer':
        raise ValueError('Zoom records unanswered calls by itself.')
    check_outcome(ticket, outcome, option, note, callback_at)
    intent = ticket.intents.filter(agent=agent, created_at__gte=timezone.now() - PENDING_OUTCOME_WINDOW).order_by('-created_at').first()
    if not intent:
        raise ValueError('Call the learner first.')
    link = (CaseCall.objects.select_related('match__call').filter(ticket=ticket, match__call_id=intent.matched_call_id).first()
            if intent.matched_call_id else None)
    if link and link.processed_result:
        check_call_result(outcome, link.match.call)
        apply_outcome(ticket, link, agent, None, outcome, option, note, callback_at)
        return True
    event(ticket, 'outcome_pending', {'intent_id': intent.pk, 'outcome': outcome, 'option': option, 'note': note,
                                      'callback_at': callback_at.isoformat() if callback_at else None}, agent)
    ticket.last_activity_at = timezone.now()
    ticket.save(update_fields=['last_activity_at'])
    return False


def apply_pending_outcome(ticket, link, match):
    """Apply an outcome saved before Zoom reported this call, once Zoom has its result."""
    intent = CallIntent.objects.filter(matched_call=match.call).first()
    pending = intent and ticket.events.filter(kind='outcome_pending', data__intent_id=intent.pk).order_by('-id').first()
    if not pending or link.outcome or ticket.status == 'resolved':
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


def apply_outcome(ticket, link, agent, actor, outcome, option, note, callback_at):
    """Record a validated outcome on a locked case and move the case on."""
    promises = PROMISES.get(ticket.source_type, {})
    link.outcome, link.outcome_at = outcome, timezone.now()
    link.save(update_fields=['outcome', 'outcome_at'])
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
        # Held until the chosen follow-up, else the next working morning (as apply_call_result does).
        ticket.next_followup_at = callback_at or next_workday_morning(timezone.now())
    release_fields(ticket)
    ticket.save()
    event(ticket, 'outcome', {'outcome': outcome, 'option': option, 'note': note,
                             'callback_at': callback_at.isoformat() if callback_at else None,
                             'promised_at': ticket.promised_at.isoformat() if ticket.promised_at else None},
          agent, actor, call=link.match.call)
    if closes_now:
        close(ticket, agent, 'agent', option, {'note': note, 'promise': option}, actor)
