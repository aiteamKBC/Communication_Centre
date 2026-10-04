import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from .ai import process_ai
from .db import DB
from .emails import generate_surveys, process_emails
from .evidence import EvidenceSnapshot, check_evidence
from .models import CaseCall, CaseTicket, CycleState, ZoomPhoneCall
from .rules import MAX_MISSED_PROMISES
from .services import Conflict, event, expire_claims, match_call, release_fields, resolve
from .sources import generate_reminders, generate_risks, get_source, load_bookings, profiles, refresh_recording_links, source_health
from .zoom_phone import ACCOUNT_LABELS, sync_account
from .zoom_views import current_account_filter


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
                    if missed >= MAX_MISSED_PROMISES:
                        ticket.status, ticket.escalated = 'escalated', True
                    event(ticket, 'promise_missed', {'option': ticket.resolution_option, 'promised_at': promise.isoformat(),
                                                     'missed': missed, 'to_manager': missed >= MAX_MISSED_PROMISES})
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


def run_cycle(*, skip_zoom=False, skip_ai=False, skip_emails=False):
    token = str(uuid.uuid4())
    now = timezone.now()
    CycleState.objects.get_or_create(name='cycle')
    if not CycleState.objects.filter(Q(locked_until__isnull=True) | Q(locked_until__lt=now), name='cycle').update(
            token=token, locked_until=now + timedelta(hours=2)):
        return {'skipped': 'Another cycle is running.'}
    result = {}
    try:
        if not skip_zoom:
            for account in ACCOUNT_LABELS:
                try:
                    result['zoom_' + account] = sync_account(account, include_recordings=True)
                except Exception as exc:
                    result['zoom_' + account] = f'Unavailable ({type(exc).__name__}); inspect Zoom account status.'
        people = get_source('profiles', profiles)
        if people is not None:
            directory = {}
            for person in people.values():
                if person['learner_phone']:
                    directory.setdefault(person['learner_phone'], []).append(person['learner_email'])
            CycleState.objects.update_or_create(name='phone_directory', defaults={'details': directory, 'last_success_at': timezone.now()})
            result['source_created'] = generate_risks(people)
            bookings = get_source('bookings', lambda: load_bookings(people))
            if bookings is not None:
                result['reminders_created'] = generate_reminders(people, bookings)
            result['manager_surveys'] = generate_surveys(people)
        get_source('recording_links', refresh_recording_links)
        # Evidence wins over returning a promised-date case to the queue.
        result['resolved'] = evidence_cycle()
        maintenance(timezone.now())
        earliest = CaseTicket.objects.order_by('created_at').values_list('created_at', flat=True).first()
        result['matched'] = 0
        if earliest:
            # Calls before the module's first case cannot be its contact attempts.
            changed_result = CaseCall.objects.filter(match__call_id=OuterRef('pk')).exclude(processed_result=OuterRef('result'))
            calls = ZoomPhoneCall.objects.filter(current_account_filter(), direction='outbound', started_at__gte=earliest).annotate(
                needs_result=Exists(changed_result)).filter(Q(callmatch__isnull=True) | Q(needs_result=True)).order_by('started_at')
            for pk in calls.values_list('pk', flat=True).iterator():
                if match_call(pk):
                    result['matched'] += 1
        if not skip_ai:
            result['analyses'] = process_ai()
        if not skip_emails:
            result['emails_processed'] = process_emails()
        CycleState.objects.filter(name='cycle', token=token).update(last_success_at=timezone.now(), details=result)
        return result
    finally:
        CycleState.objects.filter(name='cycle', token=token).update(locked_until=None, token='')
