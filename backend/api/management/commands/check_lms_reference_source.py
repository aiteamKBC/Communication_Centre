"""Check the deployed runtime's LMS reader without changing data or permissions."""
from django.core.management.base import BaseCommand, CommandError

from api.training_plan_lms_reference import (
    LmsReferenceSourceError, SOURCE_ERROR_DETAILS, lms_source_connection,
)


class Command(BaseCommand):
    help = 'Verify read-only LMS connectivity and access to modules and England holidays. Never prints credentials.'
    requires_system_checks = []

    def handle(self, *args, **options):
        failures = []
        for table, query in (
            ('curriculum.modules', 'SELECT count(*) FROM curriculum.modules'),
            ('curriculum.england_holidays', 'SELECT count(*) FROM curriculum.england_holidays'),
        ):
            try:
                with lms_source_connection(table) as conn:
                    count = conn.execute(query).fetchone()[0]
                self.stdout.write(self.style.SUCCESS(f'{table}: OK; {count} rows; read-only access verified.'))
            except LmsReferenceSourceError as error:
                failures.append(error.code)
                detail = SOURCE_ERROR_DETAILS.get(error.code, 'The LMS source could not be reached. Check server network access and database availability.')
                self.stderr.write(f'{table}: {error.code}: {detail}')
        if failures:
            raise CommandError('LMS source check failed: ' + ', '.join(sorted(set(failures))))
        self.stdout.write(self.style.SUCCESS('LMS source ready. No data or permissions were changed.'))
