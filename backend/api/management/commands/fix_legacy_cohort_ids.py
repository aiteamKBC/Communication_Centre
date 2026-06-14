from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import TrainingPlan
from api.views import (
    TRAINING_PLAN_COHORT_ID_MARKER_PREFIX,
    normalize_training_plan_identity,
    set_training_plan_metadata_markers,
    training_plan_marker_value,
)


class Command(BaseCommand):
    help = (
        'Fix legacy __cohort_id markers in TrainingPlan notes that contain '
        'synthetic fallback values (db-row-* or row-*) instead of stable IDs.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would be changed without writing to the database.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        rows = TrainingPlan.objects.filter(notes__contains='__cohort_id:db-row-')
        rows2 = TrainingPlan.objects.filter(notes__contains='__cohort_id:row-')
        all_rows = list(rows) + [r for r in rows2 if r not in list(rows)]

        if not all_rows:
            self.stdout.write(self.style.SUCCESS('No rows with legacy cohort IDs found.'))
            return

        self.stdout.write(f'Found {len(all_rows)} row(s) with legacy cohort IDs.')

        to_update = []
        for row in all_rows:
            current_cohort_id = training_plan_marker_value(row.notes, TRAINING_PLAN_COHORT_ID_MARKER_PREFIX)
            stable_cohort_id = (
                f'{normalize_training_plan_identity(row.cohort_name)}'
                f'::{normalize_training_plan_identity(row.starting_date_lable)}'
            )
            self.stdout.write(
                f'  Row id={row.id}: cohort_id "{current_cohort_id}" -> "{stable_cohort_id}"'
                f'  (cohort_name={row.cohort_name!r}, starting_date={row.starting_date_lable!r})'
            )
            if not dry_run:
                row.notes = set_training_plan_metadata_markers(
                    row.notes,
                    {TRAINING_PLAN_COHORT_ID_MARKER_PREFIX: stable_cohort_id},
                )
                to_update.append(row)

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes written.'))
            return

        with transaction.atomic():
            TrainingPlan.objects.bulk_update(to_update, ['notes'])

        self.stdout.write(self.style.SUCCESS(f'Fixed {len(to_update)} row(s).'))
