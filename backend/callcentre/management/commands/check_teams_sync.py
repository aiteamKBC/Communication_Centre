"""Read-only probe: pick N MCM/PR reviews from the LMS, ask Microsoft Graph for the real
Teams state, and print what the new reconciliation would do. Changes nothing in the database."""
from django.core.management.base import BaseCommand
from django.db import connections
from django.utils import timezone

from callcentre import graph, lms_reviews
from callcentre.db import LMS
from callcentre.rules import LONDON


class Command(BaseCommand):
    help = 'Show how the new Teams reconciliation changes each MCM/PR review (read-only).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=10, help='How many reviews to probe.')
        parser.add_argument('--email', help='Only check reviews for this learner email.')

    def handle(self, *args, limit, email, **options):
        today = timezone.now().astimezone(LONDON).date()
        params = {'kinds': list(lms_reviews.REVIEW_KINDS), 'mcm': lms_reviews.MCM_NAMES,
                  'since': lms_reviews.REVIEWS_SINCE}
        with connections[LMS].cursor() as cursor:
            imported = lms_reviews._fetch(cursor, lms_reviews.IMPORTED_SQL.format(
                where=lms_reviews.IMPORTED_WHERE), params)
            native = lms_reviews._fetch(cursor, lms_reviews.NATIVE_SQL, params)
            candidates = [('reviews', r) for r in imported] + [('instance', r) for r in native]
            if email:
                candidates = [c for c in candidates if (c[1].get('email') or '').lower() == email.lower()]
            candidates = [c for c in candidates if c[1].get('graph_event_id')][:limit]
            if not candidates:
                self.stdout.write('No reviews with a Teams event id matched.')
                return
            graph_configured = graph.configured('calendar')
            self.stdout.write(f'Graph configured: {graph_configured}; today (London): {today}')
            self.stdout.write(f'Probing {len(candidates)} review(s):\n')
            cache = {}
            for prefix, row in candidates:
                self._report(cursor, prefix, row, today, cache)

    def _report(self, cursor, prefix, row, today, cache):
        email = row.get('email')
        review = row.get('review_type')
        event_id = row.get('graph_event_id')
        organizer = row.get('graph_organizer_email')
        before_day = row.get('booking_day') if prefix == 'reviews' else row.get('day')
        before_status = row.get('booking_status') if prefix == 'reviews' else row.get('status')
        header = f'[{prefix}:{row.get("id")}] {email} / {review}'
        self.stdout.write(self.style.MIGRATE_HEADING(header))
        self.stdout.write(f'  LMS cache: status={before_status} day={before_day}')
        self.stdout.write(f'  Teams event: {event_id} (organizer: {organizer})')
        state = lms_reviews._graph_state(cache, organizer, event_id)
        if state is None:
            self.stdout.write(self.style.WARNING('  Graph: unavailable or event id empty — LMS cache kept'))
            return
        self.stdout.write(f'  Graph says: found={state.get("found")} cancelled={state.get("cancelled")} '
                          f'start={state.get("start")}')
        row_copy = dict(row)
        if prefix == 'reviews':
            lms_reviews._reconcile_imported(cursor, row_copy, {(organizer, event_id): state})
            after_day = row_copy.get('booking_day')
            after_status = row_copy.get('booking_status')
        else:
            lms_reviews._reconcile_native(cursor, row_copy, {(organizer, event_id): state})
            after_day = row_copy.get('day')
            after_status = row_copy.get('status')
        self.stdout.write(f'  After reconcile: status={after_status} day={after_day}')
        kind = lms_reviews.REVIEW_KINDS.get(str(review or '').strip().lower())
        if kind:
            if prefix == 'reviews':
                final_state = lms_reviews.imported_state(row_copy)
                if final_state is None:
                    self.stdout.write(self.style.NOTICE('  Verdict: conflicting bookings — no ticket.'))
                    return
                status, day, completed = final_state
            else:
                status, day, completed = row_copy.get('status'), row_copy.get('day'), row_copy.get('completed_at')
            case_type = lms_reviews.classify(review, status, day, completed, today)
            if case_type is None:
                self.stdout.write(self.style.SUCCESS('  Verdict: no missed ticket (Teams-aware).'))
            else:
                self.stdout.write(self.style.WARNING(f'  Verdict: {case_type} on {day}.'))
        self.stdout.write('')
