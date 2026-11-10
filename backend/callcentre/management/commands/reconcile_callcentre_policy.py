"""Scoped operational rollout. No source writes, emails, calls or bookings."""
import json
from collections import Counter

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from callcentre.db import DB
from callcentre.models import CaseTicket
from callcentre.sources import unified_directory, load_bookings, generate_reminders, generate_risks
from callcentre.learner_satisfaction import eligible, generate, generate_employers
from callcentre.services import event


def first_review_repairs(people):
    """Only untouched first reviews: never override an operator's scheduling."""
    result = []
    system_events = {'created', 'identity_contacts_refreshed', 'sla_breached', 'email_dry_run'}
    for case in CaseTicket.objects.filter(source_type='learner_satisfaction', status='new',
            archived=False, due_at__gt=timezone.now(), next_followup_at__isnull=True,
            promised_at__isnull=True, last_contact_at__isnull=True, claimed_by__isnull=True, attempts=0).prefetch_related('events'):
        person = people.resolve(email=case.learner_email)
        if not person or not eligible(person):
            continue
        if case.source_data.get('last_completed_at') or case.source_data.get('previous_case_id'):
            continue
        if any(e.kind not in system_events for e in case.events.all()):
            continue
        result.append(case.pk)
    return result


def snapshot():
    cases = list(CaseTicket.objects.filter(archived=False).exclude(status='resolved'))
    return {'open_by_type': dict(Counter(c.source_type for c in cases)),
            'future_first_reviews': sum(c.source_type == 'learner_satisfaction' and c.due_at > timezone.now()
                                       and not c.source_data.get('previous_case_id') for c in cases)}


class Command(BaseCommand):
    help = 'Read-only policy preview; --apply updates operational cases, never source tables or external services.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        people = unified_directory()
        if not people.sources_complete:
            raise CommandError('Incomplete or conflicting identities: no operational updates permitted.')
        bookings = load_bookings(people)
        repairs = first_review_repairs(people)
        employer_counts = Counter(CaseTicket.objects.filter(source_type='satisfaction', archived=False)
                                  .exclude(status='resolved').values_list('manager_email', flat=True))
        report = {'writes': False, 'external_messages': 0, 'before': snapshot(),
                  'eligible_learners': sum(eligible(p) for p in people.satisfaction),
                  'untouched_first_reviews_to_make_due': len(repairs),
                  'duplicate_employer_tasks_to_archive': sum(max(0, n-1) for n in employer_counts.values()),
                  'tomorrow_bookings': len(bookings),
                  'tomorrow_contacts': len({b['email'] for b in bookings})}
        if options['apply']:
            with transaction.atomic(using=DB):
                # Serialize with normal learner generation and re-check before changing dates.
                from callcentre.models import CycleState
                CycleState.objects.get_or_create(name='learner_satisfaction')
                CycleState.objects.select_for_update().get(name='learner_satisfaction')
                list(CaseTicket.objects.select_for_update().filter(pk__in=repairs))
                safe_ids = set(first_review_repairs(people)) & set(repairs)
                for case in CaseTicket.objects.filter(pk__in=safe_ids):
                    previous = case.due_at.isoformat()
                    case.due_at = timezone.now()
                    case.sla_breached = False
                    case.save(update_fields=['due_at', 'sla_breached', 'updated_at'])
                    event(case, 'first_review_due_corrected', {'previous_due_at': previous,
                          'due_at': case.due_at.isoformat(), 'reason': 'Untouched first review is due immediately.'})
                report['repaired_dates'] = len(safe_ids)
                report['learner_generation'] = generate(people)
                report['employer_feedback'] = generate_employers(people)
                report['reminders_created'] = generate_reminders(people, bookings)
            report['attendance_created'] = generate_risks(people, categories={'attendance'})
            report['writes'] = True
            report['after'] = snapshot()
        self.stdout.write(json.dumps(report))
