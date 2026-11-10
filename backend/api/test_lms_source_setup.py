import json
import os
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

import psycopg
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import RequestFactory, SimpleTestCase

from .training_plan_lms_reference import (
    LmsReferenceSourceError, lms_source_connection, training_plan_lms_cohorts,
    training_plan_lms_holidays, training_plan_lms_session_counts, training_plan_lms_tutors,
)


class LmsSourceSetupTests(SimpleTestCase):
    def test_missing_server_configuration_never_attempts_a_default_database_connection(self):
        with self.settings(TRAINING_PLAN_LMS_REFERENCE_SOURCE=None), \
                patch.dict(os.environ, {'TRAINING_PLAN_LMS_REFERENCE_DATABASE_URL': ''}), \
                patch('api.training_plan_lms_reference.psycopg.connect') as connect:
            with self.assertRaises(LmsReferenceSourceError) as raised, lms_source_connection():
                self.fail('A missing LMS connection was accepted.')
        self.assertEqual(raised.exception.code, 'lms_source_not_configured')
        connect.assert_not_called()

    def test_invalid_connection_string_is_not_exposed(self):
        with self.settings(TRAINING_PLAN_LMS_REFERENCE_SOURCE=None), \
                patch.dict(os.environ, {'TRAINING_PLAN_LMS_REFERENCE_DATABASE_URL': 'private invalid URL'}):
            with self.assertRaises(LmsReferenceSourceError) as raised, lms_source_connection():
                self.fail('An invalid LMS connection was accepted.')
        self.assertEqual(raised.exception.code, 'lms_source_configuration_invalid')
        self.assertNotIn('private', str(raised.exception))

    def test_driver_failures_are_classified_without_logging_credentials(self):
        cases = [(psycopg.errors.InvalidPassword, 'lms_source_authentication_failed'),
                 (psycopg.errors.InsufficientPrivilege, 'lms_source_permissions_invalid'),
                 (psycopg.errors.UndefinedTable, 'lms_source_table_missing'),
                 (psycopg.OperationalError, 'lms_source_unavailable')]
        for error_type, code in cases:
            with self.subTest(code=code), self.settings(TRAINING_PLAN_LMS_REFERENCE_SOURCE={'dbname': 'fixture'}), \
                    patch('api.training_plan_lms_reference.psycopg.connect', side_effect=error_type('private credentials')), \
                    self.assertLogs('api.training_plan_lms_reference', level='WARNING') as logs:
                with self.assertRaises(LmsReferenceSourceError) as raised, lms_source_connection():
                    self.fail('A failed connection was accepted.')
            self.assertEqual(raised.exception.code, code)
            self.assertNotIn('private', ' '.join(logs.output))
            self.assertNotIn('private', str(raised.exception))

    def test_all_live_endpoints_identify_missing_source_configuration(self):
        with self.settings(TRAINING_PLAN_LMS_REFERENCE_SOURCE=None), \
                patch.dict(os.environ, {'TRAINING_PLAN_LMS_REFERENCE_DATABASE_URL': ''}), \
                patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter') as query:
            query.return_value.first.return_value = SimpleNamespace(records=[{'sourceModuleId': 'm1'}])
            for view in (training_plan_lms_tutors, training_plan_lms_cohorts, training_plan_lms_session_counts, training_plan_lms_holidays):
                request = RequestFactory().get('/api/training-plan/lms-reference/')
                request.user = SimpleNamespace(is_authenticated=True, is_active=True)
                response = view(request)
                payload = json.loads(response.content)
                self.assertEqual(response.status_code, 503)
                self.assertEqual(payload['code'], 'lms_source_not_configured')
                self.assertIn('not configured on this server', payload['detail'])

    def test_read_only_setup_command_checks_both_tables_without_exposing_data(self):
        output = StringIO()
        with patch('api.management.commands.check_lms_reference_source.lms_source_connection') as source:
            conn = source.return_value.__enter__.return_value
            conn.execute.return_value.fetchone.side_effect = [(332,), (83,)]
            call_command('check_lms_reference_source', stdout=output)
        self.assertEqual([call.args[0] for call in source.call_args_list], ['curriculum.modules', 'curriculum.england_holidays'])
        self.assertEqual([call.args[0] for call in conn.execute.call_args_list],
                         ['SELECT count(*) FROM curriculum.modules', 'SELECT count(*) FROM curriculum.england_holidays'])
        self.assertIn('332 rows', output.getvalue())
        self.assertIn('83 rows', output.getvalue())
        self.assertIn('No data or permissions were changed', output.getvalue())

    def test_setup_command_fails_clearly_without_echoing_private_exception_text(self):
        output, errors = StringIO(), StringIO()
        with patch('api.management.commands.check_lms_reference_source.lms_source_connection',
                   side_effect=LmsReferenceSourceError('private connection string', code='lms_source_not_configured')):
            with self.assertRaises(CommandError) as raised:
                call_command('check_lms_reference_source', stdout=output, stderr=errors)
        self.assertIn('lms_source_not_configured', str(raised.exception))
        self.assertIn('not configured on this server', errors.getvalue())
        self.assertNotIn('private', errors.getvalue() + str(raised.exception))
