from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from . import alternative_sessions as alt

NOW = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)
LATER = datetime(2026, 10, 30, 13, tzinfo=timezone.utc)


def case(pk=1, key='501', day=date(2026, 10, 27), module='Martech - Tue', **fields):
    return SimpleNamespace(pk=pk, overdue_since=day, source_data={'attendance_key': key, 'module': module}, **fields)


def module(catalogue, group, title, group_name=''):
    return {'module_catalogue_id': catalogue, 'programme_id': 'p1', 'cohort_id': 'c1', 'group_id': group,
            'group_name': group_name, 'title': title, 'is_programme_deleted': False}


class FakeLms:
    """The LMS tables the lookup reads, answered by the SQL each query runs."""
    def __init__(self, register=None, modules=None, series=None, occurrences=None):
        self.register = register if register is not None else [{
            'key': '501', 'day': date(2026, 10, 27), 'module': 'Martech - Tue', 'occurrence_id': 'o-a3',
            'session_number': 3, 'occurrence_status': 'completed', 'series_id': 's-a', 'series_status': 'active',
            'module_catalogue_id': 'm-a', 'module_title': 'Martech - Tue'}]
        self.modules = modules if modules is not None else [
            module('m-a', 'g-a', 'Martech - Tue', 'Group A'), module('m-b', 'g-b', 'Martech - Thur', 'Group B'),
            module('m-c', 'g-c', 'Martech copy', 'Group C'), module('m-x', 'g-b', 'Data Analysis', 'Group B')]
        self.series = series if series is not None else [
            {'id': 's-a', 'module_catalogue_id': 'm-a', 'status': 'active', 'module_title': ''},
            {'id': 's-b', 'module_catalogue_id': 'm-b', 'status': 'active', 'module_title': ''},
            {'id': 's-c', 'module_catalogue_id': 'm-c', 'status': 'active', 'module_title': ''},
            {'id': 's-x', 'module_catalogue_id': 'm-x', 'status': 'active', 'module_title': ''}]
        self.occurrences = occurrences if occurrences is not None else [
            {'id': 'o-c3', 'live_session_id': 's-c', 'session_number': 3, 'scheduled_start': datetime(2026, 11, 3, 9, tzinfo=timezone.utc), 'status': 'scheduled'},
            {'id': 'o-b3', 'live_session_id': 's-b', 'session_number': 3, 'scheduled_start': LATER, 'status': 'scheduled'},
            {'id': 'o-x3', 'live_session_id': 's-x', 'session_number': 3, 'scheduled_start': NOW, 'status': 'scheduled'}]

    def __call__(self, alias, sql, params=()):
        if 'live_session_learner_attendance la' in sql:
            return [row for row in self.register if row['key'] in params[0]]
        if 'FROM curriculum.modules' in sql and 'module_catalogue_id = ANY' in sql:
            return [m for m in self.modules if m['module_catalogue_id'] in params[0]]
        if 'FROM curriculum.modules' in sql:
            return [m for m in self.modules if m['programme_id'] in params[0] and m['cohort_id'] in params[1]]
        if 'FROM curriculum.live_sessions' in sql:
            return [s for s in self.series if s['module_catalogue_id'] in params[0]]
        if 'FROM curriculum.live_session_occurrences' in sql:
            found = [o for o in self.occurrences if o['live_session_id'] in params[0] and o['session_number'] in params[1]
                     and alt.utc(o['scheduled_start']) > params[2]]
            return sorted(found, key=lambda o: (alt.utc(o['scheduled_start']), o['id']))
        raise AssertionError(sql)


class MatchingTests(SimpleTestCase):
    def test_module_copies_share_one_name(self):
        self.assertEqual(alt.module_key('Martech - Thur'), 'martech')
        self.assertEqual(alt.module_key('Martech (Fri)'), 'martech')
        self.assertEqual(alt.module_key('  Martech   copy'), 'martech')
        self.assertEqual(alt.module_key('Monday Marketing'), 'monday marketing')

    def test_earliest_session_still_ahead_with_another_group_of_the_cohort(self):
        with patch('callcentre.alternative_sessions.rows', FakeLms()):
            found = alt.alternatives([case()], NOW)
        # Group B's Thursday copy before Group C's; never another module of group B, never the learner's own group.
        self.assertEqual(found, {1: {'occurrence_id': 'o-b3', 'starts_at': LATER, 'group': 'Group B'}})

    def test_lms_times_without_a_time_zone_are_utc(self):
        lms = FakeLms()
        for occurrence in lms.occurrences:
            occurrence['scheduled_start'] = occurrence['scheduled_start'].replace(tzinfo=None)
        with patch('callcentre.alternative_sessions.rows', lms):
            self.assertEqual(alt.alternatives([case()], NOW)[1]['starts_at'], LATER)

    def test_a_group_running_two_series_is_ambiguous_and_skipped(self):
        lms = FakeLms()
        lms.series.append({'id': 's-b2', 'module_catalogue_id': 'm-b', 'status': 'active', 'module_title': ''})
        with patch('callcentre.alternative_sessions.rows', lms):
            found = alt.alternatives([case()], NOW)
        self.assertEqual(found[1]['group'], 'Group C')

    def test_learners_own_module_with_two_active_series_offers_nothing(self):
        lms = FakeLms()
        lms.series.append({'id': 's-a2', 'module_catalogue_id': 'm-a', 'status': 'active', 'module_title': ''})
        with patch('callcentre.alternative_sessions.rows', lms):
            self.assertEqual(alt.alternatives([case()], NOW), {})

    def test_only_the_same_session_number(self):
        lms = FakeLms()
        for occurrence in lms.occurrences:
            occurrence['session_number'] = 4
        with patch('callcentre.alternative_sessions.rows', lms):
            self.assertEqual(alt.alternatives([case()], NOW), {})

    def test_legacy_register_keys_and_mismatched_lectures_are_not_looked_up(self):
        with patch('callcentre.alternative_sessions.rows', FakeLms()):
            self.assertEqual(alt.alternatives([case(key='kbc-77')], NOW), {})
        with patch('callcentre.alternative_sessions.rows', FakeLms()):
            # The same row number, but not this case's lecture: a different date or module.
            self.assertEqual(alt.alternatives([case(day=date(2026, 10, 20))], NOW), {})
            self.assertEqual(alt.alternatives([case(module='Data Analysis')], NOW), {})

    def test_a_case_without_a_group_or_cohort_is_skipped(self):
        lms = FakeLms()
        lms.modules[0]['group_id'] = ''
        with patch('callcentre.alternative_sessions.rows', lms):
            self.assertEqual(alt.alternatives([case()], NOW), {})
