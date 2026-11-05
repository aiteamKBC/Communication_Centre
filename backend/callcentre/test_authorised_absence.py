import json
from datetime import date, datetime, timedelta, timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from . import authorised_absence as aa
from . import coach_centre

NOW = datetime(2026, 11, 5, 9, 0, tzinfo=dt_timezone.utc)


def session_row(module='m1', occurrence='o1', start=NOW + timedelta(days=2), status='scheduled', series='s1',
                repeat='weekly', series_status='active', title='Marketing - Thu'):
    return {'module_id': module, 'module_title': title, 'session_id': series, 'repeat_pattern': repeat,
            'start_datetime': None, 'duration_minutes': 60, 'series_status': series_status, 'occurrence_id': occurrence,
            'session_number': 3, 'scheduled_start': start.replace(tzinfo=None) if start else None,
            'scheduled_end': None, 'status': status}


class PlanTests(SimpleTestCase):
    def test_the_saved_plan_wins_and_an_unsaved_plan_takes_the_exact_group_preset(self):
        self.assertEqual(aa.plan_modules(None, ['g1', 'g2']), ['g1', 'g2'])
        self.assertEqual(aa.plan_modules([{'moduleId': 'a'}], ['a', 'g1']), ['a', 'g1'])
        self.assertEqual(aa.plan_modules([{'moduleId': 'a', 'assignmentMode': 'explicit'}], ['g1']), ['a'])
        self.assertEqual(aa.plan_modules([], ['g1']), [])   # a cleared plan stays cleared
        self.assertEqual(aa.plan_modules(None, []), [])     # group not known exactly: nothing is guessed

    def test_the_plan_column_as_the_lms_reads_it(self):
        self.assertEqual(aa.saved_plan({'Training_plan': json.dumps([{'moduleId': 'a'}, 'x']), 'Learning_plan': None}),
                         [{'moduleId': 'a'}])
        self.assertEqual(aa.saved_plan({'Training_plan': None, 'Learning_plan': [{'moduleId': 'b'}]}), [{'moduleId': 'b'}])
        self.assertIsNone(aa.saved_plan({'Training_plan': 'not json', 'Learning_plan': None}))

    def test_a_learner_with_two_enrolment_rows_is_offered_nothing(self):
        found = [{'id': 1, 'email': 'amy@x.uk'}, {'id': 2, 'email': 'amy.old@x.uk'}, {'id': 3, 'email': 'ben@x.uk'}]
        with patch('callcentre.authorised_absence.rows', return_value=found):
            result = aa.enrolments({'amy@x.uk': 'amy@x.uk', 'amy.old@x.uk': 'amy@x.uk', 'ben@x.uk': 'ben@x.uk'})
        self.assertEqual(set(result), {'ben@x.uk'})

    def test_the_group_is_taken_only_when_every_profile_agrees(self):
        found = [{'enrolment_id': 1, 'group_id': 'G1'}, {'enrolment_id': 1, 'group_id': 'G1'},
                 {'enrolment_id': 2, 'group_id': 'G1'}, {'enrolment_id': 2, 'group_id': 'G2'},
                 {'enrolment_id': 3, 'group_id': None}]
        with patch('callcentre.authorised_absence.rows', return_value=found):
            self.assertEqual(aa.group_ids({1, 2, 3}), {1: 'G1'})


class UpcomingTests(SimpleTestCase):
    def run_upcoming(self, sessions, plan=None, profiles=None, preset=None):
        enrolment = [{'id': 7, 'email': 'amy@x.uk', 'Training_plan': json.dumps(plan) if plan is not None else None,
                      'Learning_plan': None}]
        answers = [enrolment, profiles or [], *([preset, []] if preset else []), sessions]
        with patch('callcentre.authorised_absence.rows', side_effect=answers) as read:
            result = aa.upcoming({'amy@x.uk': {}}, {'amy@x.uk': 'amy@x.uk'}, NOW)
        return result, read

    def test_only_active_sessions_of_the_learners_modules_in_the_next_two_weeks(self):
        result, read = self.run_upcoming([
            session_row(), session_row(occurrence='o2', status='cancelled'),
            session_row(occurrence=None, repeat='weekly'),          # a pattern, never a made-up date
            session_row(occurrence=None, repeat='none', series='s9', start=None) | {'start_datetime': (NOW + timedelta(days=3)).replace(tzinfo=None)},
            session_row(module='other', occurrence='o3'),            # not on the plan
        ], plan=[{'moduleId': 'm1', 'assignmentMode': 'explicit'}])
        sessions = result['amy@x.uk']
        self.assertEqual([s['ref'] for s in sessions], ['occurrence:o1', 'series:s9'])
        self.assertEqual(sessions[0]['date'], date(2026, 11, 7))
        modules, start, end = read.call_args.args[2]
        self.assertEqual((modules, end - start), (['m1'], timedelta(days=14)))

    def test_a_learner_without_a_plan_or_an_exact_group_gets_nothing(self):
        result, read = self.run_upcoming([session_row()])
        self.assertEqual(result, {})
        self.assertEqual(read.call_count, 2)   # enrolment and profiles only: no session is even read


class MatchTests(SimpleTestCase):
    def absence(self, occurrence='', day=date(2026, 11, 7), module='Marketing - Thu'):
        return SimpleNamespace(occurrence_id=occurrence, session_date=day, module=module)

    def case(self, day=date(2026, 11, 7), module='Marketing - Thur'):
        return SimpleNamespace(overdue_since=day, source_data={'module': module})

    def test_a_live_register_case_matches_its_own_occurrence(self):
        exact = self.absence('o1')
        self.assertIs(aa.matches(self.case(), 'o1', [self.absence('o2'), exact]), exact)

    def test_another_occurrence_the_same_day_is_another_lecture(self):
        self.assertIsNone(aa.matches(self.case(), 'o1', [self.absence('o2')]))

    def test_the_old_register_matches_on_date_and_module_only_when_one_fits(self):
        one = self.absence('o1')
        self.assertIs(aa.matches(self.case(), '', [one]), one)
        self.assertIsNone(aa.matches(self.case(), '', [one, self.absence('o2')]))
        self.assertIsNone(aa.matches(self.case(day=date(2026, 11, 8)), '', [one]))
        self.assertIsNone(aa.matches(self.case(module='Finance'), '', [one]))

    def test_states(self):
        base = dict(pk=1, session_ref='occurrence:o1', module='M', reason='work', note='', added_by='Sara',
                    added_role='coach', created_at=NOW, cancelled_by='', cancelled_at=None, ticket_id=None, applied_at=None)
        coming = SimpleNamespace(**base, starts_at=NOW + timedelta(days=1), session_date=date(2026, 11, 6))
        waiting = SimpleNamespace(**base, starts_at=NOW - timedelta(days=1), session_date=date(2026, 11, 4))
        stale = SimpleNamespace(**base, starts_at=NOW - timedelta(days=9), session_date=date(2026, 10, 27))
        self.assertEqual(aa.absence_json(coming, NOW)['state'], 'coming')
        self.assertEqual(aa.absence_json(waiting, NOW)['state'], 'waiting')
        self.assertEqual(aa.absence_json(stale, NOW)['state'], 'no_absence')


class MarkAbsentTests(SimpleTestCase):
    def directory(self):
        from .test_coach_centre import directory
        return directory()

    def test_only_a_lecture_the_lms_assigns_them_now_and_it_is_logged(self):
        session = {'ref': 'occurrence:o1', 'occurrence_id': 'o1', 'module_id': 'm1', 'module': 'Marketing',
                   'session_number': 3, 'starts_at': NOW + timedelta(days=2), 'ends_at': None, 'date': date(2026, 11, 7)}
        with patch('callcentre.coach_centre.cached_directory', return_value=self.directory()), \
                patch('callcentre.coach_centre.authorised_absence.upcoming', return_value={'amy@learners.uk': [session]}) as upcoming, \
                patch('callcentre.coach_centre.authorised_absence.add', return_value=SimpleNamespace(pk=4, note='')) as add, \
                patch('callcentre.coach_centre.log') as log:
            with self.assertRaisesMessage(ValueError, 'lectures in the next two weeks'):
                coach_centre.mark_absent.__wrapped__('sara@kbc.uk', 'Sara', 'amy@learners.uk', 'occurrence:other', 'work', '')
            with self.assertRaisesMessage(ValueError, 'one of your learners'):
                coach_centre.mark_absent.__wrapped__('sara@kbc.uk', 'Sara', 'ben@learners.uk', 'occurrence:o1', 'work', '')
            coach_centre.mark_absent.__wrapped__('sara@kbc.uk', 'Sara', 'amy@learners.uk', 'occurrence:o1', 'work', '')
        learners, emails = upcoming.call_args.args
        self.assertEqual(set(learners), {'amy@learners.uk'})
        self.assertEqual(set(emails), {'amy@learners.uk', 'amy.old@aptem.uk'})
        add.assert_called_once()
        self.assertEqual(add.call_args.args[2], session)
        self.assertEqual(log.call_args.args[:4], ('sara@kbc.uk', 'Sara', 'coach', 'absence_added'))

    def test_a_reason_is_needed_and_the_note_is_optional(self):
        with self.assertRaisesMessage(ValueError, 'Choose a reason'):
            aa.add({}, 'c@x.uk', {}, '', '', 'Sara', 'coach')
