import logging
import uuid
from contextlib import contextmanager
from datetime import timedelta

from django.db import DatabaseError, connections, transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from .ai import process_ai
from .db import DB
from .call_scope import system_calls
from .emails import process_emails
from .evidence import EvidenceSnapshot, check_evidence
from .models import CallIntent, CaseCall, CaseTicket, CycleState, ZoomPhoneCall
from .learner_satisfaction import generate as generate_learner_satisfaction, generate_employers
from .services import Conflict, event, expire_claims, match_call, release_fields, resolve
from .sources import generate_reminders, generate_risks, get_source, load_bookings, profiles, refresh_epa_metrics, refresh_recording_links, source_health
from .zoom_phone import account_labels, sync_account
from .zoom_views import current_account_filter

logger = logging.getLogger(__name__)


def maintenance(now):
    expire_claims(now)
    pending = Q(due_at__lt=now, sla_breached=False) | Q(next_followup_at__lte=now, status__in=['pending_learner', 'pending_verification'])
    for pk in CaseTicket.objects.open().filter(pending).values_list('pk', flat=True).iterator():
        with transaction.atomic(using=DB):
            ticket = CaseTicket.objects.select_for_update().get(pk=pk)
            if ticket.due_at < now and not ticket.sla_breached:
                agents = list(ticket.events.exclude(agent=None).values_list('agent_id', flat=True).distinct())
                ticket.sla_breached = True
                event(ticket, 'sla_breached', {'agent_ids': sorted(agents), 'unclaimed': not agents, 'due_at': ticket.due_at.isoformat()})
            if ticket.next_followup_at and ticket.next_followup_at <= now and ticket.status in ('pending_learner', 'pending_verification'):
                promise = ticket.promised_at if ticket.promised_at and ticket.promised_at <= now else None
                ticket.status = 'new'
                ticket.next_followup_at = None
                release_fields(ticket)
                if promise:
                    since = ticket.evidence_after or ticket.created_at
                    missed = ticket.events.filter(kind='promise_missed', created_at__gt=since).count() + 1
                    event(ticket, 'promise_missed', {'option': ticket.resolution_option, 'promised_at': promise.isoformat(),
                                                     'missed': missed})
                else:
                    event(ticket, 'followup_due', {'promised_at': None})
            ticket.save()


def evidence_cycle():
    resolved, errors = 0, {}
    tickets = list(CaseTicket.objects.open().select_related('survey'))
    snapshot = EvidenceSnapshot(tickets)
    for ticket in tickets:
        if ticket.source_type in errors:
            continue
        try:
            evidence = check_evidence(ticket, snapshot)
            if evidence:
                resolve(ticket.pk, evidence=evidence)
                resolved += 1
        except Conflict:
            event(ticket, 'resolution_blocked', {'reason': 'Case changed during resolution; manager review required.'})
        except Exception as exc:
            errors[ticket.source_type] = type(exc).__name__
    source_health('evidence', error='; '.join(f'{k}: {v}' for k, v in errors.items()), count=resolved)
    return resolved


def step(result, name, fn):
    """Run one cycle step. A failure is logged and recorded under ``name``; the remaining steps still run."""
    try:
        value = fn()
    except Exception as exc:
        logger.exception('Call Centre cycle step %s failed', name)
        result[name] = f'Failed ({type(exc).__name__}); see the worker log.'
        return None
    if value is not None:
        result[name] = value
    return value


def update_phone_directory(people):
    directory = {}
    for person in people.values():
        if person['learner_phone']:
            directory.setdefault(person['learner_phone'], []).append(person['learner_email'])
    if hasattr(people, 'phone_contacts'):
        directory = {phone: [entry['email']] for phone, entry in people.phone_contacts().items()
                     if entry['role'] == 'learner' and entry['email']}
    CycleState.objects.update_or_create(name='phone_directory', defaults={'details': directory, 'last_success_at': timezone.now()})


def match_calls():
    earliest = CaseTicket.objects.order_by('created_at').values_list('created_at', flat=True).first()
    matched = 0
    if earliest:
        # Calls before the module's first case cannot be its contact attempts.
        changed_result = CaseCall.objects.filter(match__call_id=OuterRef('pk')).exclude(processed_result=OuterRef('result'))
        pending_intent = CallIntent.objects.filter(
            matched_call__isnull=True, agent__zoom_account=OuterRef('source_account'),
            created_at__lte=OuterRef('started_at'),
            created_at__gte=OuterRef('started_at') - timedelta(minutes=10),
        )
        calls = ZoomPhoneCall.objects.filter(current_account_filter(), direction='outbound', started_at__gte=earliest).annotate(
            needs_result=Exists(changed_result), pending_intent=Exists(pending_intent),
            system_call=Exists(system_calls().filter(pk=OuterRef('pk'))),
        ).filter(Q(callmatch__isnull=True, pending_intent=True) | Q(needs_result=True, system_call=True)).order_by('started_at')
        for pk in calls.values_list('pk', flat=True).iterator():
            if match_call(pk):
                matched += 1
    return matched


@contextmanager
def cycle_lock(duration):
    """The cycle's database lock: yields its token, or None when another cycle holds it."""
    token = str(uuid.uuid4())
    now = timezone.now()
    CycleState.objects.get_or_create(name='cycle')
    held = CycleState.objects.filter(Q(locked_until__isnull=True) | Q(locked_until__lt=now), name='cycle').update(
        token=token, locked_until=now + duration)
    try:
        yield token if held else None
    finally:
        if held:
            release_lock(token)


def release_lock(token):
    """Release the cycle lock. A dropped connection (Neon/PgBouncer) would otherwise leave it held for hours,
    so a failed release closes the connection and tries once more on a fresh one."""
    for attempt in range(2):
        try:
            CycleState.objects.filter(name='cycle', token=token).update(locked_until=None, token='')
            return
        except DatabaseError:
            if attempt:
                logger.exception('Could not release the Call Centre cycle lock')
            connections[DB].close()


def run_call_sync():
    """The quick cycle after an in-page call: new Zoom calls (no recordings), then call matching, so the call and its
    result reach the case within a minute instead of at the next full cycle. The evidence is Zoom's own call history."""
    with cycle_lock(timedelta(minutes=10)) as token:
        if not token:
            return {'skipped': 'Another cycle is running.'}
        result = {}
        for account in account_labels():
            step(result, 'zoom_' + account, lambda account=account: sync_account(account))
        step(result, 'matched', match_calls)
        return result


def run_cycle(*, skip_zoom=False, skip_ai=False, skip_emails=False):
    with cycle_lock(timedelta(hours=2)) as token:
        if not token:
            return {'skipped': 'Another cycle is running.'}
        result = {}
        if not skip_zoom:
            for account in account_labels():
                try:
                    result['zoom_' + account] = sync_account(account, include_recordings=True)
                except Exception as exc:
                    result['zoom_' + account] = f'Unavailable ({type(exc).__name__}); inspect Zoom account status.'
        people = get_source('profiles', profiles)
        if people is not None and people.sources_complete:
            from .catchup import sync as sync_catchups
            from .sources import refresh_contacts
            step(result, 'contacts_refreshed', lambda: refresh_contacts(people))
            step(result, 'phone_directory', lambda: update_phone_directory(people))
            step(result, 'source_created', lambda: generate_risks(people))
            bookings = get_source('bookings', lambda: load_bookings(people))
            if bookings is not None:
                step(result, 'reminders_created', lambda: generate_reminders(people, bookings))
            step(result, 'learner_satisfaction', lambda: generate_learner_satisfaction(people))
            step(result, 'employer_feedback', lambda: generate_employers(people))
            result['catchup_followups'] = get_source('catchup_followups', lambda: sync_catchups(people))
        else:
            result['identity_skipped'] = 'Source unavailable or ambiguous; existing contacts and cases retained.'
        get_source('recording_links', refresh_recording_links)
        result['epa_metrics'] = get_source('epa_metrics', refresh_epa_metrics)
        # Evidence wins over returning a promised-date case to the queue.
        step(result, 'resolved', evidence_cycle)
        step(result, 'maintenance', lambda: maintenance(timezone.now()))
        # After maintenance: a technical issue still with support ends the cycle waiting, whatever a call did meanwhile.
        from .helpdesk import sync as sync_helpdesk
        step(result, 'technical_issues', sync_helpdesk)
        step(result, 'matched', match_calls)
        if not skip_ai:
            step(result, 'analyses', process_ai)
        if not skip_emails and people is not None and people.sources_complete:
            step(result, 'emails_processed', process_emails)
        CycleState.objects.filter(name='cycle', token=token).update(last_success_at=timezone.now(), details=result)
        return result
