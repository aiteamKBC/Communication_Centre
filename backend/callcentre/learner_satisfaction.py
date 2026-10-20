"""Recurring learner and employer feedback calls, using existing cases/events (no source DB writes).

One open case per learner (``learner_satisfaction``) and per employer (``employer_feedback``: a line
manager from Aptem, with their learners listed); completed cycles remain separate, immutable history.
Only an explicit feedback completion after an answered call, or closing a review that cannot be done
(wrong number, refused, unreachable), starts the three-calendar-month clock.
"""
import calendar
import hashlib

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .access import is_director
from .call_scope import system_case_calls
from .db import DB
from .learners import program_status
from .models import CaseTicket, CycleState
from .rules import LONDON, due_at, parse_moment
from .services import Conflict, can_work, close, event, release_fields

SOURCE = 'learner_satisfaction'
EMPLOYER = 'employer_feedback'


def next_review_at(completed_at):
    local = completed_at.astimezone(LONDON)
    month_index = local.year * 12 + local.month - 1 + 3
    year, month = divmod(month_index, 12)
    month += 1
    return local.replace(year=year, month=month, day=min(local.day, calendar.monthrange(year, month)[1]))


def eligible(person):
    # Only Active (including Delivery, the LMS's equivalent active state).
    # Explicit confirmations only. Suspected test names are not evidence of a test account.
    confirmed = set(getattr(settings, 'CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS', []))
    return (program_status(person['programme_status']) == 'active'
            and not confirmed.intersection(person['identifiers']))


def cycle_start(ticket):
    """When a finished review's three-month clock started: completed feedback, or closing it without."""
    value = ticket.source_data.get('last_completed_at') or ticket.source_data.get('last_closed_at')
    return parse_moment(value) if value else None


def cycle_due(ticket, now):
    if ticket.status != 'resolved':
        return False
    start = cycle_start(ticket)
    return bool(start and next_review_at(start) <= now)


def callable_from(previous, now):
    """A new review can be called straight away; its SLA runs from then (``rules.SLA_DAYS``)."""
    # A review that became due while the person was not eligible (e.g. on a break) starts now, not in the past.
    return max(next_review_at(cycle_start(previous)), now) if previous else now


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
    updates = {}
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
            due = due_at(SOURCE, callable_from(previous, now))
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
        if person.get('person_id'):
            ticket.source_data['person_id'] = person['person_id']
            ticket.source_data['contact_sources'] = person.get('provenance', {})
        for name, value in person['profile'].items():
            setattr(ticket, name, value)
        if not allowed and old_eligible:
            release_fields(ticket)
            event(ticket, 'satisfaction_ineligible', {'programme_status': person['programme_status']})
        ticket.updated_at = now
        updates[ticket.pk] = ticket
        for identity in identifiers:
            index.setdefault(identity, set()).add(ticket.pk)
    # A successful full snapshot can hide leavers, without resolving or deleting their history.
    for ticket in existing:
        if ticket.pk not in seen and ticket.status != 'resolved' and ticket.source_data.get('eligible', True):
            ticket.source_data = {**ticket.source_data, 'eligible': False}
            release_fields(ticket)
            ticket.updated_at = now
            updates[ticket.pk] = ticket
            event(ticket, 'satisfaction_ineligible', {'reason': 'Not in current learner directory'})
    CaseTicket.objects.bulk_update(list(updates.values()), [
        'learner_email', 'learner_name', 'learner_phone', 'coach', 'organisation', 'programme',
        'manager_name', 'manager_email', 'source_data', 'claimed_by', 'claimed_at', 'last_activity_at', 'updated_at'], batch_size=100)
    counts['identity_conflicts'] = conflicts
    CycleState.objects.filter(name=SOURCE).update(last_success_at=now, details=counts)
    return counts


def employer_contacts(people):
    """{manager email: (case fields, learners)}: each line manager with the learners satisfaction calls cover.

    A manager whose learners have all left, are on a break or are confirmed test accounts is not called.
    """
    current = {person['profile']['learner_email'] for person in people.satisfaction if eligible(person)}
    contacts = {}
    for manager, emails in people.managers.items():
        learners = [people[email] for email in emails if email in current]
        if not learners:
            continue
        name = next((item['manager_name'] for item in learners if item['manager_name']), '') or manager
        profile = {'learner_email': manager, 'learner_name': name[:255], 'manager_email': manager, 'manager_name': name[:255],
                   'learner_phone': people.manager_phones.get(manager, ''),
                   'organisation': ', '.join(sorted({item['organisation'] for item in learners} - {''}))[:255]}
        listed = sorted(({'name': item['learner_name'] or item['learner_email'], 'email': item['learner_email'],
                          'programme': item['programme']} for item in learners), key=lambda item: item['name'].casefold())
        contacts[manager] = (profile, listed)
    return contacts


@transaction.atomic(using=DB)
def generate_employers(people, now=None):
    """One open feedback call per employer; due again three months after the last completed one."""
    if not getattr(people, 'sources_complete', False):
        return {'skipped': 'Both learner sources must load successfully; existing cases retained.'}
    now = now or timezone.now()
    CycleState.objects.get_or_create(name=EMPLOYER)
    CycleState.objects.select_for_update().get(name=EMPLOYER)
    latest = {}
    for ticket in CaseTicket.objects.select_for_update().filter(source_type=EMPLOYER).order_by('pk'):
        latest[ticket.manager_email] = ticket   # a renewal is newer than the cycle it follows
    contacts = employer_contacts(people)
    counts = {'created': 0, 'renewed': 0, 'employers': len(contacts)}
    for manager, (profile, listed) in contacts.items():
        ticket = latest.get(manager)
        if ticket is None or cycle_due(ticket, now):
            previous = ticket
            key = (f'{EMPLOYER}:after:{previous.pk}' if previous else
                   f'{EMPLOYER}:' + hashlib.sha256(manager.encode()).hexdigest())
            due = due_at(EMPLOYER, callable_from(previous, now))
            ticket, fresh = CaseTicket.objects.get_or_create(reason_key=key, defaults={
                **profile, 'source_type': EMPLOYER, 'due_at': due,
                'source_data': {'eligible': True, 'learners': listed, 'previous_case_id': previous.pk if previous else None},
            })
            if fresh:
                counts['created'] += 1
                counts['renewed'] += int(previous is not None)
                event(ticket, 'created', {'source': EMPLOYER, 'reason': 'Quarterly employer feedback call',
                                          'previous_case_id': previous.pk if previous else None})
            latest[manager] = ticket
        if ticket.status == 'resolved':
            continue   # completed: hidden until the next cycle is due
        for name, value in profile.items():
            setattr(ticket, name, value)
        ticket.source_data = {**ticket.source_data, 'eligible': True, 'learners': listed}
        ticket.save(update_fields=[*profile, 'source_data', 'updated_at'])
    # An employer with no current learner drops off the list; their history stays.
    for manager, ticket in latest.items():
        if manager not in contacts and ticket.status != 'resolved' and ticket.source_data.get('eligible', True):
            ticket.source_data = {**ticket.source_data, 'eligible': False}
            release_fields(ticket)
            ticket.save()
            event(ticket, 'satisfaction_ineligible', {'reason': 'No current learners'})
    CycleState.objects.filter(name=EMPLOYER).update(last_success_at=now, details=counts)
    return counts


@transaction.atomic(using=DB)
def complete(ticket_id, user, *, score, problem, action, note, acting_agent=None):
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if ticket.source_type not in (SOURCE, EMPLOYER) or ticket.archived or not ticket.source_data.get('eligible', True):
        raise Conflict('This is not an active satisfaction case.')
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
    calls = system_case_calls(ticket.calls.all()).filter(processed_result='answered', match__call__ended_at__lte=timezone.now())
    calls = calls.filter(match__call__started_at__gte=ticket.evidence_after or ticket.created_at)
    if not is_director(user):
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
    kind = 'employer_feedback_completed' if ticket.source_type == EMPLOYER else 'learner_feedback_completed'
    event(ticket, kind, feedback, agent, None if agent else user.get_username(), call=call.match.call)
    close(ticket, agent, 'agent', kind, feedback, None if agent else user.get_username())
    return ticket


CLOSE_REASONS = {'wrong_number': 'Wrong number', 'refused': 'Refused feedback', 'unreachable': 'Could not be reached'}


@transaction.atomic(using=DB)
def close_without_feedback(ticket_id, user, reason, note, acting_agent=None):
    """The specialist (or a manager) closes a review that cannot be done; the next one is due three months later,
    like completed feedback."""
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    # A specialist closes a review only after trying to call in this cycle; a manager may close it outright.
    if not is_director(user) and not system_case_calls(ticket.calls.all()).filter(
            match__call__started_at__gte=ticket.evidence_after or ticket.created_at).exists():
        raise ValueError('Call them first: a review is closed without feedback only after a call in this cycle.')
    if ticket.source_type not in (SOURCE, EMPLOYER) or ticket.archived:
        raise Conflict('This is not a satisfaction review.')
    if ticket.status == 'resolved':
        raise Conflict('This satisfaction review is already closed.')
    note = str(note or '').strip()
    if reason not in CLOSE_REASONS or not note:
        raise ValueError('Choose why the review cannot be done and add a note.')
    now = timezone.now()
    closed = {'reason': reason, 'note': note[:3500], 'closed_at': now.isoformat(), 'next_due_at': next_review_at(now).isoformat()}
    ticket.source_data = {**ticket.source_data, 'closed_without_feedback': closed, 'last_closed_at': now.isoformat(),
                          'next_due_at': closed['next_due_at']}
    close(ticket, agent, 'agent', 'closed_without_feedback', closed, None if agent else user.get_username())
    return ticket
