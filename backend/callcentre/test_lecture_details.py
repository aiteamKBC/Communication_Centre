from datetime import date, datetime, timezone
from unittest.mock import patch

from django.db import DatabaseError
from django.test import SimpleTestCase

from .lecture_details import add_lecture_times


class LectureDetailsTests(SimpleTestCase):
    def case(self, module='Commercial Intelligence', day=date(2026, 10, 16)):
        return {'missed_lecture': {
            'module': module, 'title': module, 'date': day,
            'starts_at': None, 'ends_at': None, 'time_status': 'missing',
        }}

    def session(self, hour=11):
        return {
            'session_date': date(2026, 10, 16), 'module': 'Commercial Intelligence',
            'subject': 'Commercial Intelligence lecture',
            'scheduled_start': datetime(2026, 10, 16, hour, tzinfo=timezone.utc),
            'scheduled_end': datetime(2026, 10, 16, hour + 2, tzinfo=timezone.utc),
        }

    @patch('callcentre.lecture_details.rows')
    def test_existing_cases_share_one_read_and_match_exact_date_and_module(self, read):
        read.return_value = [self.session()]
        cases = [self.case(), self.case(day='2026-10-16'), self.case('Other module'),
                 self.case(day=date(2026, 10, 15)), {'missed_lecture': None}]
        add_lecture_times(cases)
        read.assert_called_once()
        self.assertIn('is_cancelled IS NOT TRUE', read.call_args.args[1])
        self.assertEqual(read.call_args.args[2][0], [date(2026, 10, 15), date(2026, 10, 16)])
        for case in cases[:2]:
            self.assertEqual(case['missed_lecture']['starts_at'], self.session()['scheduled_start'])
            self.assertEqual(case['missed_lecture']['time_status'], 'matched')
        for case in cases[2:4]:
            self.assertIsNone(case['missed_lecture']['starts_at'])

    @patch('callcentre.lecture_details.rows')
    def test_multiple_sessions_never_choose_a_time(self, read):
        read.return_value = [self.session(), self.session(15)]
        case = self.case()
        add_lecture_times([case])
        self.assertEqual(case['missed_lecture']['time_status'], 'ambiguous')
        self.assertIsNone(case['missed_lecture']['starts_at'])

    @patch('callcentre.lecture_details.rows', side_effect=DatabaseError('Offline'))
    def test_unavailable_schedule_preserves_attendance_date(self, read):
        case = self.case()
        add_lecture_times([case])
        self.assertEqual(case['missed_lecture']['date'], date(2026, 10, 16))
        self.assertEqual(case['missed_lecture']['time_status'], 'unavailable')
        self.assertIsNone(case['missed_lecture']['starts_at'])

    @patch('callcentre.lecture_details.rows')
    def test_no_source_date_or_module_does_not_query(self, read):
        add_lecture_times([self.case(day=None), self.case(module=''), {'missed_lecture': None}])
        read.assert_not_called()
