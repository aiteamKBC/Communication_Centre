"""Storage error responses, runnable without live application or LMS databases."""
import json
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.db import DatabaseError, ProgrammingError
from django.test import RequestFactory, SimpleTestCase

from .training_plan_lms_reference import (
    LmsReferenceSourceError, read_lms_reference_records, read_lms_tutor_names,
    training_plan_lms_reference, training_plan_lms_tutors, read_lms_cohorts, training_plan_lms_cohorts,
)


class ReferenceSourceDateTests(SimpleTestCase):
    def read(self, start, created, *, omit_start_column=False, omit_created_column=False,
             writable=False, created_type='timestamp without time zone'):
        columns = {
            'module_catalogue_id': 'character varying', 'programme_id': 'character varying',
            'programme_name': 'character varying', 'title': 'text',
            'start_date': 'date', 'end_date': 'date', 'created_at': created_type,
        }
        if omit_start_column:
            del columns['start_date']
        if omit_created_column:
            del columns['created_at']
        row = ('m1', 'p1', 'Programme', 'Module', start, date(2026, 12, 1), created)
        conn = MagicMock()

        def execute(query, params=None):
            result = MagicMock()
            if query.startswith('SHOW'):
                result.fetchone.return_value = ('on',)
            elif 'has_table_privilege' in query:
                result.fetchone.return_value = (True, writable)
            elif 'information_schema.columns' in query:
                result.fetchall.return_value = list(columns.items())
            elif query.startswith('SELECT count'):
                result.fetchone.return_value = (1,)
            elif query.startswith('SELECT '):
                result.fetchall.return_value = [row]
            return result

        conn.execute.side_effect = execute
        with self.settings(TRAINING_PLAN_LMS_REFERENCE_SOURCE={'dbname': 'fixture'}), \
                patch('api.training_plan_lms_reference.psycopg.connect') as connect:
            connect.return_value.__enter__.return_value = conn
            records = read_lms_reference_records()
        self.assertEqual(connect.call_args.kwargs['options'], '-c default_transaction_read_only=on')
        conn.execute.assert_any_call('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        conn.execute.assert_any_call('SET LOCAL statement_timeout=20000')
        return records[0], conn

    def test_existing_start_date_takes_precedence_over_creation(self):
        record, _ = self.read(date(2026, 10, 1), date(2025, 1, 2))
        self.assertEqual(record['startDate'], '2026-10-01')
        self.assertNotIn('startDateSource', record)

    def test_missing_start_uses_creation_and_keeps_provenance(self):
        record, _ = self.read(None, date(2025, 1, 2))
        self.assertEqual(record['startDate'], '2025-01-02')
        self.assertEqual(record['startDateSource'], 'created_at')
        self.assertEqual(record['endDate'], '2026-12-01')

    def test_absent_start_column_uses_creation(self):
        record, conn = self.read(None, date(2025, 1, 2), omit_start_column=True)
        self.assertEqual(record['startDate'], '2025-01-02')
        self.assertTrue(any('title,NULL,end_date,created_at::date' in call.args[0]
                            for call in conn.execute.call_args_list))

    def test_missing_both_values_remains_missing(self):
        record, _ = self.read(None, None)
        self.assertIsNone(record['startDate'])
        self.assertNotIn('startDateSource', record)

    def test_legacy_source_without_creation_column_is_supported(self):
        record, _ = self.read(date(2026, 10, 1), None, omit_created_column=True)
        self.assertEqual(record['startDate'], '2026-10-01')

    def test_timezone_aware_creation_is_converted_to_utc_date_in_query(self):
        record, conn = self.read(None, date(2025, 1, 2), created_type='timestamp with time zone')
        self.assertEqual(record['startDate'], '2025-01-02')
        self.assertTrue(any("(created_at AT TIME ZONE 'UTC')::date" in call.args[0]
                            for call in conn.execute.call_args_list))

    def test_timestamp_must_be_reduced_to_date_before_serialization(self):
        with self.assertRaises(LmsReferenceSourceError):
            self.read(None, datetime(2025, 1, 2, 10, 30))

    def test_writable_source_account_is_still_rejected(self):
        with self.assertRaises(LmsReferenceSourceError):
            self.read(None, date(2025, 1, 2), writable=True)


class ReferenceTutorTests(SimpleTestCase):
    def request(self, method='GET', authenticated=True, active=True):
        request = RequestFactory().generic(method, '/api/training-plan/lms-reference/tutors/')
        request.user = SimpleNamespace(is_authenticated=authenticated, is_active=active)
        return request

    def test_tutors_are_matched_by_captured_id_without_modifying_snapshot(self):
        records = [{'sourceModuleId': 'm1', 'module': 'Repeated'}, {'sourceModuleId': 'm2', 'module': 'Repeated'}]
        reference = SimpleNamespace(records=records)
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter') as query, \
                patch('api.training_plan_lms_reference.read_lms_tutor_names', return_value={'m1': 'Tutor One', 'm2': ''}) as read:
            query.return_value.first.return_value = reference
            response = training_plan_lms_tutors(self.request())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {'tutorNames': {'m1': 'Tutor One', 'm2': ''}})
        read.assert_called_once_with(['m1', 'm2'])
        self.assertEqual(records, [{'sourceModuleId': 'm1', 'module': 'Repeated'}, {'sourceModuleId': 'm2', 'module': 'Repeated'}])

    def test_authentication_and_read_only_method_are_required(self):
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter') as query:
            for active in (True, False):
                self.assertEqual(training_plan_lms_tutors(self.request(authenticated=False, active=active)).status_code, 401)
            self.assertEqual(training_plan_lms_tutors(self.request(active=False)).status_code, 401)
            for method in ('POST', 'PUT', 'PATCH', 'DELETE'):
                response = training_plan_lms_tutors(self.request(method))
                self.assertEqual(response.status_code, 405)
                self.assertEqual(response['Allow'], 'GET')
            query.assert_not_called()

    def test_source_failures_return_retry_without_private_details(self):
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter') as query, \
                patch('api.training_plan_lms_reference.read_lms_tutor_names', side_effect=LmsReferenceSourceError('private connection details')):
            query.return_value.first.return_value = SimpleNamespace(records=[{'sourceModuleId': 'm1'}])
            response = training_plan_lms_tutors(self.request())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.content.decode())

    def test_query_scopes_ids_and_preserves_missing_assignments(self):
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = ('character varying',)
        conn.execute.return_value.fetchall.return_value = [('m1', ' Tutor One '), ('m2', None)]
        with patch('api.training_plan_lms_reference.lms_source_connection') as connection:
            connection.return_value.__enter__.return_value = conn
            self.assertEqual(read_lms_tutor_names(['m1', 'm2']), {'m1': 'Tutor One', 'm2': ''})
        conn.execute.assert_any_call('SELECT module_catalogue_id,tutor_name FROM curriculum.modules '
                                    'WHERE module_catalogue_id::text = ANY(%s)', (['m1', 'm2'],))

    def test_legacy_source_and_empty_capture_are_supported(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as connection:
            self.assertEqual(read_lms_tutor_names([]), {})
            connection.assert_not_called()
            conn = connection.return_value.__enter__.return_value
            conn.execute.return_value.fetchone.return_value = None
            self.assertEqual(read_lms_tutor_names(['m1']), {})
            self.assertEqual(conn.execute.call_count, 1)


class ReferenceCohortTests(SimpleTestCase):
    def test_source_cohorts_are_read_by_id_and_allow_missing_labels(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as connection:
            conn = connection.return_value.__enter__.return_value
            conn.execute.return_value.fetchall.side_effect = [
                [('cohort_id',), ('cohort_name',), ('group_name',)],
                [('m1', 42, ' October 2026 ', ' G2-Thursday '), ('m2', None, None, None)],
            ]
            self.assertEqual(read_lms_cohorts(['m1', 'm2']), {
                'm1': {'cohortId': '42', 'cohortName': 'October 2026', 'groupName': 'G2-Thursday'},
                'm2': {'cohortId': None, 'cohortName': '', 'groupName': ''},
            })
            conn.execute.assert_any_call('SELECT module_catalogue_id,cohort_id,cohort_name,group_name'
                                        ' FROM curriculum.modules WHERE module_catalogue_id::text = ANY(%s)',
                                        (['m1', 'm2'],))

    def test_source_without_group_column_keeps_cohorts_and_uses_null(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as connection:
            conn = connection.return_value.__enter__.return_value
            conn.execute.return_value.fetchall.side_effect = [
                [('cohort_name',)], [('m1', None, 'October 2026', None)],
            ]
            self.assertEqual(read_lms_cohorts(['m1'])['m1'], {
                'cohortId': None, 'cohortName': 'October 2026', 'groupName': '',
            })
            conn.execute.assert_any_call('SELECT module_catalogue_id,NULL,cohort_name,NULL'
                                        ' FROM curriculum.modules WHERE module_catalogue_id::text = ANY(%s)', (['m1'],))

    def test_legacy_source_and_missing_ids_need_no_cohort_query(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as connection:
            self.assertEqual(read_lms_cohorts([]), {})
            connection.assert_not_called()
            conn = connection.return_value.__enter__.return_value
            conn.execute.return_value.fetchall.return_value = []
            self.assertEqual(read_lms_cohorts(['m1']), {})
            self.assertEqual(conn.execute.call_count, 1)

    def test_endpoint_is_authenticated_read_only_and_scoped_to_capture(self):
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter') as query, \
                patch('api.training_plan_lms_reference.read_lms_cohorts', return_value={'m1': {'cohortId': 'c1', 'cohortName': 'October'}}) as read:
            for method, authenticated, expected in [('GET', False, 401), ('POST', True, 405), ('DELETE', True, 405), ('GET', True, 200)]:
                request = RequestFactory().generic(method, '/api/training-plan/lms-reference/cohorts/')
                request.user = SimpleNamespace(is_authenticated=authenticated, is_active=True)
                query.return_value.first.return_value = SimpleNamespace(records=[{'sourceModuleId': 'm1'}])
                response = training_plan_lms_cohorts(request)
                self.assertEqual(response.status_code, expected)
            read.assert_called_once_with(['m1'])
            self.assertEqual(json.loads(response.content)['cohorts']['m1']['cohortName'], 'October')


class ReferenceStorageErrorTests(SimpleTestCase):
    def request(self, method='GET'):
        request = RequestFactory().generic(
            method, '/api/training-plan/lms-reference/',
            data='{}', content_type='application/json',
        )
        request.user = SimpleNamespace(is_authenticated=True, is_active=True)
        return request

    def test_missing_table_reports_setup_requirement_without_exposing_sql(self):
        cause = Exception('private SQL and connection details')
        cause.sqlstate = '42P01'
        error = ProgrammingError('private SQL and connection details')
        error.__cause__ = cause
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter', side_effect=error), \
                patch('api.training_plan_lms_reference.read_lms_reference_records') as source:
            response = training_plan_lms_reference(self.request())
        self.assertEqual(response.status_code, 503)
        payload = json.loads(response.content)
        self.assertEqual(payload['code'], 'reference_storage_not_ready')
        self.assertIn('administrator', payload['detail'])
        self.assertNotIn('private', payload['detail'])
        source.assert_not_called()

    def test_failed_get_only_advises_retrying_the_read(self):
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter', side_effect=DatabaseError('private')):
            response = training_plan_lms_reference(self.request())
        self.assertEqual(response.status_code, 503)
        payload = json.loads(response.content)
        self.assertEqual(payload['code'], 'reference_storage_unavailable')
        self.assertEqual(payload['detail'], 'Reference storage is unavailable. Retry loading the reference.')

    def test_failed_capture_requires_checking_storage_before_retry(self):
        # A connection failure at commit can leave the capture status unknown.
        with patch('api.training_plan_lms_reference.get_user_access_payload', return_value={'adminAccess': True}), \
                patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter', side_effect=DatabaseError('private')):
            response = training_plan_lms_reference(self.request('POST'))
        self.assertEqual(response.status_code, 503)
        payload = json.loads(response.content)
        self.assertEqual(payload['code'], 'reference_storage_unavailable')
        self.assertIn('check whether the capture was saved', payload['detail'])
        self.assertNotIn('private', payload['detail'])
