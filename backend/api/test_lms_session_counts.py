"""Module session counts use the existing read-only source, without lecture tables."""
import json
from types import SimpleNamespace
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase

from .training_plan_lms_reference import read_lms_session_counts, training_plan_lms_session_counts


class LmsSessionCountTests(SimpleTestCase):
    def test_counts_keep_zero_and_missing_values_and_scope_by_source_id(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as source:
            conn = source.return_value.__enter__.return_value
            conn.execute.return_value.fetchone.return_value = ('integer',)
            conn.execute.return_value.fetchall.return_value = [('m1', 14), ('m2', 0), ('m3', None), ('m4', -1)]
            ids = ['m1', 'm2', 'm3', 'm4']
            self.assertEqual(read_lms_session_counts(ids), {'m1': 14, 'm2': 0, 'm3': None, 'm4': None})
            conn.execute.assert_any_call('SELECT module_catalogue_id,sessions_number FROM curriculum.modules '
                                         'WHERE module_catalogue_id::text = ANY(%s)', (ids,))

    def test_empty_capture_and_legacy_source_need_no_extra_access(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as source:
            self.assertEqual(read_lms_session_counts([]), {})
            source.assert_not_called()
            conn = source.return_value.__enter__.return_value
            conn.execute.return_value.fetchone.return_value = None
            self.assertEqual(read_lms_session_counts(['m1']), {})
            self.assertEqual(conn.execute.call_count, 1)

    def test_endpoint_uses_captured_ids_and_does_not_modify_snapshot(self):
        records = [{'sourceModuleId': 'm1', 'startDate': '2026-01-01'}]
        request = RequestFactory().get('/api/training-plan/lms-reference/session-counts/')
        request.user = SimpleNamespace(is_authenticated=True, is_active=True)
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.filter') as query, \
                patch('api.training_plan_lms_reference.read_lms_session_counts', return_value={'m1': 14}) as read:
            query.return_value.first.return_value = SimpleNamespace(records=records)
            response = training_plan_lms_session_counts(request)
            self.assertEqual(json.loads(response.content), {'sessionCounts': {'m1': 14}})
            read.assert_called_once_with(['m1'])
            self.assertEqual(records, [{'sourceModuleId': 'm1', 'startDate': '2026-01-01'}])

    def test_endpoint_requires_active_login_and_rejects_writes(self):
        for authenticated, active, method, expected in ((False, True, 'GET', 401), (True, False, 'GET', 401), (True, True, 'POST', 405)):
            request = RequestFactory().generic(method, '/api/training-plan/lms-reference/session-counts/')
            request.user = SimpleNamespace(is_authenticated=authenticated, is_active=active)
            with patch('api.training_plan_lms_reference.read_lms_session_counts') as read:
                self.assertEqual(training_plan_lms_session_counts(request).status_code, expected)
                read.assert_not_called()
