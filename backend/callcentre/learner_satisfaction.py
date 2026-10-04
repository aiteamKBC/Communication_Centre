"""Recurring learner feedback, using existing cases/events (no source DB writes).

One open case per learner; completed cycles remain separate, immutable history.
Only an explicit feedback completion advances the three-calendar-month clock.
"""
import calendar
import hashlib

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .db import DB
from .models import CaseTicket, CycleState
from .rules import LONDON, parse_moment
from .services import Conflict, can_work, close, event, release_fields

SOURCE = 'learner_satisfaction'


def next_review_at(completed_at):
    local = completed_at.astimezone(LONDON)
    month_index = local.year * 12 + local.month - 1 + 3
    year, month = divmod(month_index, 12)
    month += 1
    return local.replace(year=year, month=month, day=min(local.day, calendar.monthrange(year, month)[1]))


def eligible(person):
    # Explicit confirmations only. Suspected test names are not evidence of a test account.
    confirmed = set(getattr(settings, 'CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS', []))
    return (person['programme_status'].strip().lower() in {'active', 'onboarding'}
            and not confirmed.intersection(person['identifiers']))


def cycle_due(ticket, now):
    if ticket.status != 'resolved':
        return False
    completed = ticket.source_data.get('last_completed_at')
    return bool(completed and next_review_at(parse_moment(completed)) <= now)


@transaction.atomic(using=DB)
def generate(people, now=None):
    if not getattr(people, 'sources_complete', False):
        return {'skipped': 'Both learner sources must load successfully; existing cases retained.'}
    now = now or timezone.now()
    # Serialize every caller, including the dedicated refresh command, without schema changes.
    CycleState.objects.get_or_create(name=SOURCE)
    CycleState.objects.select_for_update().get(name=SOURCE)
    # Lock the case snapshots too: a concurrent completed review must not be overwritten
    # by the contact refresh or eligibility update at the end of this transaction.
    existing = list(CaseTicket.objects.select_for_update().filter(source_type=SOURCE).order_by('pk'))
    index = {}
    for ticket in existing:
        for identity in ticket.source_data.get('identifiers', []):
            index.setdefault(identity, set()).add(ticket.pk)
    by_pk = {ticket.pk: ticket for ticket in existing}
    seen, conflicts = set(), 0
    counts = {'created': 0, 'renewed': 0, 'eligible': 0}
    # An ambiguous source identity must not merge people or randomly choose the first row.
    frequencies = {}
    for person in people.satisfaction:
        for identity in person['identifiers']:
            frequencies[identity] = frequencies.get(identity, 0) + 1
    for person in people.satisfaction:
        ids = person['identifiers']
        matches = set().union(*(index.get(identity, set()) for identity in ids)) if ids else set()
        matched = [by_pk[pk] for pk in matches]
        active = [item for item in matched if item.status != 'resolved']
        if not ids or len(active) > 1 or any(frequencies[identity] > 1 for identity in ids):
            conflicts += 1
            seen.update(matches)  # retain existing state rather than guess a new identity
            continue
        ticket = (active[0] if active else max(matched, key=lambda item: item.resolved_at or item.created_at)
                  if matched else None)
        seen.update(matches)
        allowed = eligible(person)
        if not ticket and not allowed:
            continue
        counts['eligible'] += int(allowed)
        renew = ticket is not None and allowed and cycle_due(ticket, now)
        if ticket is None or renew:
            previous = ticket
            key = (f'{SOURCE}:after:{previous.pk}' if previous else
                   SOURCE + ':' + hashlib.sha256(ids[0].encode()).hexdigest())
            inherited_ids = previous.source_data.get('identifiers', []) if previous else []
            identifiers = sorted(set(inherited_ids) | set(ids))
            due = next_review_at(parse_moment(previous.source_data['last_completed_at'])) if previous else now
            ticket, fresh = CaseTicket.objects.get_or_create(reason_key=key, defaults={
                **person['profile'], 'source_type': SOURCE, 'due_at': due,
                'source_data': {'identifiers': identifiers, 'eligible': allowed,
                                'previous_case_id': previous.pk if previous else None},
            })
            if fresh:
                counts['created'] += 1
                counts['renewed'] += int(renew)
                event(ticket, 'created', {'source': SOURCE, 'reason': 'Quarterly learner satisfaction review',
                                          'previous_case_id': previous.pk if previous else None})
            by_pk[ticket.pk] = ticket
        if ticket.status == 'resolved':
            continue  # history, including its contact snapshot and reporting dates, stays unchanged
        seen.add(ticket.pk)
        old_eligible = ticket.source_data.get('eligible', True)
        identifiers = sorted(set(ticket.source_data.get('identifiers', [])) | set(ids))
        ticket.source_data = {**ticket.source_data, 'identifiers': identifiers, 'eligible': allowed,
                              'programme_status': person['programme_status'], 'status_source': person['status_source']}
        for name, value in person['profile'].items():
            setattr(ticket, name, value)
        if not allowed and old_eligible:
            release_fields(ticket)
            event(ticket, 'satisfaction_ineligible', {'programme_status': person['programme_status']})
        ticket.save()
        for identity in identifiers:
            index.setdefault(identity, set()).add(ticket.pk)
    # A successful full snapshot can hide leavers, without resolving or deleting their history.
    for ticket in existing:
        if ticket.pk not in seen and ticket.status != 'resolved' and ticket.source_data.get('eligible', True):
            ticket.source_data = {**ticket.source_data, 'eligible': False}
            release_fields(ticket)
            ticket.save()
            event(ticket, 'satisfaction_ineligible', {'reason': 'Not in current learner directory'})
    counts['identity_conflicts'] = conflicts
    CycleState.objects.filter(name=SOURCE).update(last_success_at=now, details=counts)
    return counts


@transaction.atomic(using=DB)
def complete(ticket_id, user, *, score, problem, action, note, acting_agent=None):
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if ticket.source_type != SOURCE or ticket.archived or not ticket.source_data.get('eligible', True):
        raise Conflict('This is not an active learner satisfaction case.')
    if ticket.status == 'resolved':
        raise Conflict('This satisfaction review has already been completed.')
    if type(score) is not int or score not in range(1, 6):
        raise ValueError('Choose a satisfaction score from 1 to 5.')
    note, problem, action = (str(value or '').strip() for value in (note, problem, action))
    if len(note) < 10 or not action or not problem:
        raise ValueError('Record the feedback, any issue (or None) and the agreed action (or No action needed).')
    if any(len(value) > 3500 for value in (note, problem, action)):
        raise ValueError('Each feedback field must be at most 3500 characters.')
    # Sending a message, dialing, or a failed Zoom call is never completion evidence.
    calls = ticket.calls.filter(processed_result='answered', match__call__ended_at__lte=timezone.now())
    calls = calls.filter(match__call__started_at__gte=ticket.evidence_after or ticket.created_at)
    if not (user.is_staff or user.is_superuser):
        calls = calls.filter(match__agent=agent)
    call = calls.select_related('match__call').order_by('-match__call__started_at').first()
    if not call:
        raise ValueError('An answered, synced Zoom call in this review cycle is required before completing feedback.')
    now = timezone.now()
    feedback = {'score': score, 'problem': problem, 'agreed_action': action, 'note': note,
                'completed_at': now.isoformat(), 'call_id': call.match.call_id,
                'next_due_at': next_review_at(now).isoformat()}
    ticket.source_data = {**ticket.source_data, 'feedback': feedback, 'last_completed_at': now.isoformat(),
                          'next_due_at': feedback['next_due_at']}
    event(ticket, 'learner_feedback_completed', feedback, agent,
          None if agent else user.get_username(), call=call.match.call)
    close(ticket, agent, 'agent', 'learner_feedback_completed', feedback,
          None if agent else user.get_username())
    return ticket
