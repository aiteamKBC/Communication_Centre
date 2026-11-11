"""Record and compare saved links across releases without modifying the database."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connections, transaction
from django.utils import timezone

from api.models import TrainingPlan
from api.views import TRAINING_PLAN_LMS_MATCH_MARKER_PREFIX, training_plan_marker_value


class Command(BaseCommand):
    help = 'Check persisted manual LMS links, optionally saving or comparing a release baseline. Database reads only.'
    requires_system_checks = []

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument('--snapshot', type=Path, help='Create a new JSON baseline; existing files are never overwritten.')
        mode.add_argument('--compare', type=Path, help='Fail if any baseline row/link is missing or changed.')

    def handle(self, *args, **options):
        expected = None
        if options['compare']:
            try:
                baseline = json.loads(options['compare'].read_text(encoding='utf-8'))
                if baseline['format'] != 1 or not isinstance(baseline['matches'], list):
                    raise ValueError
                expected = {}
                for item in baseline['matches']:
                    row_id, source_id = item['trainingPlanId'], item['lmsSourceModuleId']
                    if not isinstance(row_id, str) or not row_id.isdecimal() or not isinstance(source_id, str) or not source_id.strip() or row_id in expected:
                        raise ValueError
                    expected[row_id] = source_id
            except (OSError, ValueError, KeyError, TypeError):
                raise CommandError('Invalid or unreadable manual-match baseline.') from None

        matches = {}
        # Include archived rows: archiving must not erase a persisted match.
        try:
            with transaction.atomic(using='default'):
                connection = connections['default']
                if connection.vendor == 'postgresql':
                    with connection.cursor() as cursor:
                        cursor.execute('SET TRANSACTION READ ONLY')
                for row in TrainingPlan.objects.using('default').only('id', 'notes').order_by('id'):
                    source_id = training_plan_marker_value(row.notes, TRAINING_PLAN_LMS_MATCH_MARKER_PREFIX)
                    if source_id:
                        matches[str(row.id)] = source_id
        except DatabaseError:
            raise CommandError('Could not read saved matches from the application database. Check backend DATABASE_URL, network access and table availability. No baseline was written.') from None

        self.stdout.write(f'Saved manual LMS matches: {len(matches)} (including archived rows).')
        if expected is not None:
            missing = sum(row_id not in matches for row_id in expected)
            changed = sum(row_id in matches and matches[row_id] != source_id for row_id, source_id in expected.items())
            if missing or changed:
                raise CommandError(f'Manual-match verification failed: {missing} missing, {changed} changed. Check the application database target and backup.')
            self.stdout.write(self.style.SUCCESS(f'OK: all {len(expected)} baseline matches retained.'))

        if options['snapshot']:
            baseline = {
                'format': 1,
                'createdAt': timezone.now().isoformat(),
                'matches': [{'trainingPlanId': row_id, 'lmsSourceModuleId': source_id} for row_id, source_id in matches.items()],
            }
            try:
                options['snapshot'].parent.mkdir(parents=True, exist_ok=True)
                with options['snapshot'].open('x', encoding='utf-8') as output:
                    json.dump(baseline, output, indent=2)
                    output.write('\n')
            except FileExistsError:
                raise CommandError('Baseline already exists; choose a new filename to preserve the original.') from None
            except OSError:
                raise CommandError('Could not write the manual-match baseline.') from None
            self.stdout.write(self.style.SUCCESS(f'Baseline saved: {options["snapshot"]}'))
        self.stdout.write('No database data was changed.')
