"""The LMS holiday overlay stays read only and separate from Training Plan data."""
import json
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import patch

from django.test import RequestFactory, SimpleTestCase

from .training_plan_lms_reference import (
    LmsReferenceSourceError, read_lms_holidays, training_plan_lms_holidays,
)


class LmsHolidayTests(SimpleTestCase):
    def test_source_dates_map_to_single_day_bands_with_source_ids(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as source:
            conn = source.return_value.__enter__.return_value
            conn.execute.return_value.fetchall.return_value = [
                ('england-and-wales:2026-12-25', 'Christmas Day', date(2026, 12, 25)),
                ('england-and-wales:2026-12-28', 'Boxing Day', date(2026, 12, 28)),
            ]
            holidays = read_lms_holidays()
        source.assert_called_once_with('curriculum.england_holidays')
        conn.execute.assert_called_once_with(
            'SELECT id,title,holiday_date FROM curriculum.england_holidays ORDER BY holiday_date,id')
        self.assertEqual(holidays[0], {
            'id': 'lms-holiday:england-and-wales:2026-12-25', 'label': 'Christmas Day',
            'startDate': '2026-12-25', 'endDate': '2026-12-25',
            'type': 'Bank holiday', 'color': '#8B5CF6',
        })
        self.assertNotEqual(holidays[0]['id'], holidays[1]['id'])

    def test_empty_source_returns_no_holidays(self):
        with patch('api.training_plan_lms_reference.lms_source_connection') as source:
            source.return_value.__enter__.return_value.execute.return_value.fetchall.return_value = []
            self.assertEqual(read_lms_holidays(), [])

    def test_dates_are_never_invented_or_silently_truncated(self):
        for invalid in (None, '2026-12-25', datetime(2026, 12, 25, 9)):
            with self.subTest(invalid=invalid), patch('api.training_plan_lms_reference.lms_source_connection') as source:
                source.return_value.__enter__.return_value.execute.return_value.fetchall.return_value = [('h', 'Holiday', invalid)]
                with self.assertRaises(LmsReferenceSourceError):
                    read_lms_holidays()

    def test_endpoint_requires_active_login_and_rejects_all_writes(self):
        cases = [(False, True, 'GET', 401), (True, False, 'GET', 401)]
        cases += [(True, True, method, 405) for method in ('POST', 'PUT', 'PATCH', 'DELETE')]
        for authenticated, active, method, expected in cases:
            request = RequestFactory().generic(method, '/api/training-plan/lms-reference/holidays/')
            request.user = SimpleNamespace(is_authenticated=authenticated, is_active=active)
            with patch('api.training_plan_lms_reference.read_lms_holidays') as read:
                response = training_plan_lms_holidays(request)
            self.assertEqual(response.status_code, expected)
            if expected == 405:
                self.assertEqual(response['Allow'], 'GET')
            read.assert_not_called()

    def test_get_does_not_access_saved_plan_or_module_capture(self):
        request = RequestFactory().get('/api/training-plan/lms-reference/holidays/')
        request.user = SimpleNamespace(is_authenticated=True, is_active=True)
        with patch('api.training_plan_lms_reference.read_lms_holidays', return_value=[]) as read:
            response = training_plan_lms_holidays(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {'holidays': []})
        self.assertIn('no-store', response['Cache-Control'])
        read.assert_called_once_with()

    def test_source_errors_do_not_expose_connection_details(self):
        request = RequestFactory().get('/api/training-plan/lms-reference/holidays/')
        request.user = SimpleNamespace(is_authenticated=True, is_active=True)
        with patch('api.training_plan_lms_reference.read_lms_holidays', side_effect=LmsReferenceSourceError('private')):
            response = training_plan_lms_holidays(request)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.content.decode())

    def test_connection_checks_holiday_permissions_and_refuses_writable_accounts(self):
        from .training_plan_lms_reference import lms_source_connection
        for selectable, writable, accepted in ((True, False, True), (False, False, False), (True, True, False)):
            with self.subTest(selectable=selectable, writable=writable), \
                    self.settings(TRAINING_PLAN_LMS_REFERENCE_SOURCE={'dbname': 'fixture'}), \
                    patch('api.training_plan_lms_reference.psycopg.connect') as connect:
                conn = connect.return_value.__enter__.return_value
                conn.execute.return_value.fetchone.side_effect = [('on',), (selectable, writable)]
                if accepted:
                    with lms_source_connection('curriculum.england_holidays'):
                        pass
                else:
                    with self.assertRaises(LmsReferenceSourceError), lms_source_connection('curriculum.england_holidays'):
                        self.fail('Unsafe source account was accepted.')
                self.assertEqual(conn.execute.call_args.args[1],
                                 ('curriculum.england_holidays', 'curriculum.england_holidays'))
