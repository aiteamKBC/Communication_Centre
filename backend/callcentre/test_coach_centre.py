from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.test import RequestFactory, SimpleTestCase

from . import coach_centre, do_not_call
from .access import coach_refused
from .learners import Learners
from .models import CaseTicket
from .rules import CAUGHT_UP_WITH_COACH, PROMISES


def profile(email, name, coach):
    return {'learner_email': email, 'learner_name': name, 'learner_phone': '', 'coach': coach, 'organisation': 'Org',
            'programme': 'Prog', 'manager_name': '', 'manager_email': ''}


def directory():
    return Learners(
        {'amy@learners.uk': profile('amy@learners.uk', 'Amy Stone', 'Sara  Coach'),
         'ben@learners.uk': profile('ben@learners.uk', 'Ben Hill', 'Other Coach'),
         'qa@learners.uk': profile('qa@learners.uk', 'QA Learner', 'Sara Coach'),
         'cal@learners.uk': profile('cal@learners.uk', 'Cal Reed', 'Unknown Coach')},
        {'amy.old@aptem.uk': 'amy@learners.uk', 'ben.old@aptem.uk': 'ben@learners.uk'},
        coach_emails={'sara coach': 'sara@kbc.uk', 'other coach': 'other@kbc.uk'})


class CoachLearnersTests(SimpleTestCase):
    def test_a_coach_sees_only_the_learners_whose_coach_email_is_theirs(self):
        mine, emails = coach_centre.coach_learners('Sara@KBC.uk ', directory())
        self.assertEqual(set(mine), {'amy@learners.uk'})   # not Ben (another coach), not the QA account
        self.assertEqual(emails, {'amy@learners.uk': 'amy@learners.uk', 'amy.old@aptem.uk': 'amy@learners.uk'})

    def test_an_account_without_an_email_sees_nobody(self):
        self.assertEqual(coach_centre.coach_learners('', directory()), ({}, {}))
        self.assertEqual(coach_centre.coach_learners('nobody@kbc.uk', directory())[0], {})

    def test_the_open_lectures_are_the_learners_open_missed_lecture_cases(self):
        sql = str(coach_centre.open_lectures(['amy@learners.uk']).query)
        self.assertIn('"source_type" = attendance', sql)
        self.assertIn('NOT ("callcenter_case"."status" = resolved', sql)
        self.assertIn('"overdue_since" >=', sql)
        self.assertIn('eligible', sql)


class LectureStateTests(SimpleTestCase):
    def ticket(self, **fields):
        return SimpleNamespace(**{'source_data': {}, 'status': 'new', 'resolution_option': '', 'promised_at': None,
                                  'next_followup_at': None, 'claimed_by_id': None, **fields})

    def test_states(self):
        self.assertEqual(coach_centre.lecture_state(self.ticket(source_data={'catchup_booking': {'start': 'x'}}))['state'],
                         'catch_up_booked')
        self.assertEqual(coach_centre.lecture_state(self.ticket(status='pending_verification', resolution_option='catch_up_session',
                                                                promised_at='p'))['state'], 'promised')
        self.assertEqual(coach_centre.lecture_state(self.ticket(status='pending_learner'))['state'], 'callback')
        self.assertEqual(coach_centre.lecture_state(self.ticket(claimed_by_id=4))['state'], 'calling')
        self.assertEqual(coach_centre.lecture_state(self.ticket())['state'], 'waiting')


class CaughtUpTests(SimpleTestCase):
    def test_a_specialist_can_record_it_on_the_call_and_it_closes_the_case(self):
        self.assertIsNone(PROMISES['attendance'][CAUGHT_UP_WITH_COACH])

    def test_it_needs_lectures(self):
        for ids in (None, [], ['1'], list(range(coach_centre.MOST_AT_ONCE + 1))):
            with self.assertRaises(ValueError):
                coach_centre.case_ids(ids)
        self.assertEqual(coach_centre.case_ids([3, 1, 3]), [1, 3])

    def test_only_the_coachs_open_lectures_close_as_caught_up_by_the_coach(self):
        tickets = [SimpleNamespace(pk=1), SimpleNamespace(pk=2)]
        query = MagicMock()
        query.select_for_update.return_value.filter.return_value.order_by.return_value = tickets
        with patch('callcentre.coach_centre.cached_directory', return_value=directory()), \
                patch('callcentre.coach_centre.open_lectures', return_value=query) as lectures, \
                patch('callcentre.coach_centre.close') as close:
            closed = coach_centre.mark_caught_up.__wrapped__('sara@kbc.uk', 'Sara Coach', [1, 2, 9], ' Done on Monday ')
        self.assertEqual(closed, 2)
        self.assertEqual(set(lectures.call_args.args[0]), {'amy@learners.uk', 'amy.old@aptem.uk'})
        query.select_for_update.return_value.filter.assert_called_with(pk__in=[1, 2, 9])
        close.assert_any_call(tickets[0], None, 'coach', CAUGHT_UP_WITH_COACH,
                              {'note': 'Done on Monday', 'coach_email': 'sara@kbc.uk', 'caught_up_with_coach': True}, 'Sara Coach')


class CoachDoNotCallTests(SimpleTestCase):
    def test_only_their_own_learners(self):
        with patch('callcentre.coach_centre.cached_directory', return_value=directory()), \
                patch('callcentre.coach_centre.do_not_call.add') as add:
            with self.assertRaisesMessage(ValueError, 'one of your learners'):
                coach_centre.take_off_lists('sara@kbc.uk', 'Sara', 'ben@learners.uk', 'medical', 'Off sick', None)
            coach_centre.take_off_lists('sara@kbc.uk', 'Sara', 'AMY@learners.uk', 'medical', 'Off sick', '2026-11-07')
        add.assert_called_once_with('amy@learners.uk', 'Amy Stone', 'medical', 'Off sick', 'Sara',
                                    until=date(2026, 11, 7), role='coach')

    def test_until_lifted_or_a_last_day(self):
        self.assertIsNone(coach_centre.last_day(None))
        self.assertIsNone(coach_centre.last_day(''))
        self.assertEqual(coach_centre.last_day('2026-11-07'), date(2026, 11, 7))
        with self.assertRaisesMessage(ValueError, 'valid last day'):
            coach_centre.last_day('7 Nov')

    def test_the_last_day_is_from_today_up_to_a_year(self):
        today = do_not_call.today()
        for until in (today - timedelta(days=1), today + timedelta(days=400)):
            with self.assertRaisesMessage(ValueError, 'last day'):
                do_not_call.add('a@x.uk', 'A', 'medical', 'Cannot take calls', 'coach', until=until, role='coach')

    def test_an_entry_ends_after_its_last_day(self):
        sql = str(do_not_call.listed().query)
        self.assertIn('"until" IS NULL OR', sql)
        self.assertIn('"until" >=', sql)
        self.assertIn('"removed_at" IS NULL', sql)

    def test_a_coach_cannot_lift_the_directors_entry(self):
        entry = SimpleNamespace(learner_email='amy@learners.uk', added_role='director')
        query = MagicMock()
        query.select_for_update.return_value.filter.return_value.first.return_value = entry
        with patch('callcentre.do_not_call.in_force', return_value=query), \
                patch('callcentre.do_not_call.transaction.atomic'):
            with self.assertRaises(PermissionDenied):
                do_not_call.remove(5, 'Can take calls again', 'Sara', coach_learners={'amy@learners.uk'})
            with self.assertRaisesMessage(ValueError, 'no longer on the list'):
                do_not_call.remove(5, 'Can take calls again', 'Sara', coach_learners={'ben@learners.uk'})

    def test_the_lists_leave_out_only_entries_in_force(self):
        with patch('callcentre.sources.on_break_emails', return_value=frozenset()), \
                patch('callcentre.sources.active_case_contacts', return_value=Q()), \
                patch('callcentre.sources.test_learner_emails', return_value=frozenset()):
            sql = str(CaseTicket.objects.open().query)
        self.assertIn('FROM "callcenter_do_not_call" U0 WHERE (', sql)
        self.assertIn('"until" >=', sql)


class CoachAccessTests(SimpleTestCase):
    def user(self, coach):
        groups = MagicMock()
        groups.using.return_value.filter.return_value.exists.return_value = coach
        return SimpleNamespace(is_authenticated=True, is_active=True, groups=groups)

    def test_only_coaches(self):
        self.assertIsNone(coach_refused(self.user(True)))
        self.assertEqual(coach_refused(self.user(False)).status_code, 403)

    def test_the_screen_needs_a_signed_in_coach(self):
        from . import coach_views
        request = RequestFactory().get('/api/callcentre/coach/')
        request.user = SimpleNamespace(is_authenticated=False, is_active=False)
        self.assertEqual(coach_views.coach_home(request).status_code, 401)
        request.user = self.user(False)
        self.assertEqual(coach_views.coach_home(request).status_code, 403)

    def test_the_coach_is_the_signed_in_account_never_the_request(self):
        import json
        from . import coach_views
        coach = self.user(True)
        coach.email, coach.first_name, coach.last_name = 'sara@kbc.uk', 'Sara', 'Coach'
        request = RequestFactory().post('/api/callcentre/coach/caught-up/', json.dumps(
            {'ids': [4], 'note': '', 'coach_email': 'other@kbc.uk'}), content_type='application/json')
        request.user, request._dont_enforce_csrf_checks = coach, True
        with patch('callcentre.coach_views.coach_centre.mark_caught_up', return_value=1) as mark, \
                patch('callcentre.coach_views.coach_centre.overview', return_value={'learners': []}) as overview:
            response = coach_views.coach_caught_up(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {'learners': [], 'closed': 1})
        mark.assert_called_once_with('sara@kbc.uk', 'Sara Coach', [4], '', 'coach')
        overview.assert_called_once_with('sara@kbc.uk', 'Sara Coach')


class DirectorCoachesTests(SimpleTestCase):
    def test_every_coach_with_their_numbers(self):
        people = directory()
        people.aliases['amy.old@aptem.uk'] = 'amy@learners.uk'
        lectures = MagicMock()
        lectures.values_list.return_value = ['amy@learners.uk', 'amy.old@aptem.uk', 'ben@learners.uk']
        users = MagicMock()
        users.using.return_value.filter.return_value.values_list.return_value = ['Sara@kbc.uk']
        with patch('callcentre.coach_centre.cached_directory', return_value=people),                 patch('callcentre.coach_centre.open_lectures', return_value=lectures),                 patch('callcentre.coach_centre.do_not_call.current',
                      return_value=[SimpleNamespace(learner_email='ben@learners.uk')]),                 patch('callcentre.coach_centre.get_user_model', return_value=SimpleNamespace(objects=users)):
            found = coach_centre.coaches()
        self.assertEqual(found['unmatched_learners'], 1)   # Cal: their coach has no known email
        self.assertEqual(found['coaches'], [
            {'email': 'other@kbc.uk', 'name': 'Other Coach', 'learners': 1, 'missed_lectures': 1,
             'learners_with_missed': 1, 'not_called': 1, 'has_access': False},
            {'email': 'sara@kbc.uk', 'name': 'Sara Coach', 'learners': 1, 'missed_lectures': 2,
             'learners_with_missed': 1, 'not_called': 0, 'has_access': True},
        ])

    def request(self, director, payload):
        import json
        request = RequestFactory().post('/api/callcentre/coaches/desk/caught-up/', json.dumps(payload),
                                        content_type='application/json')
        request.user = SimpleNamespace(is_authenticated=True, is_active=True, first_name='Dee', last_name='Rector',
                                       email='dee@kbc.uk', get_username=lambda: 'dee')
        request._dont_enforce_csrf_checks = True
        return request

    def test_only_directors_open_a_coachs_desk_and_act_as_the_director(self):
        from . import coach_views
        payload = {'coach': 'Sara@kbc.uk', 'ids': [4], 'note': ''}
        with patch('callcentre.views.refused', return_value=None),                 patch('callcentre.coach_views.require_manager', side_effect=PermissionDenied('Only managers.')):
            self.assertEqual(coach_views.coach_desk_caught_up(self.request(False, payload)).status_code, 403)
        with patch('callcentre.views.refused', return_value=None),                 patch('callcentre.coach_views.require_manager'),                 patch('callcentre.coach_views.coach_centre.coach_name', return_value='Sara Coach'),                 patch('callcentre.coach_views.coach_centre.mark_caught_up', return_value=1) as mark,                 patch('callcentre.coach_views.coach_centre.overview', return_value={'learners': []}) as overview:
            response = coach_views.coach_desk_caught_up(self.request(True, payload))
        self.assertEqual(response.status_code, 200)
        mark.assert_called_once_with('sara@kbc.uk', 'Dee Rector', [4], '', 'director')
        overview.assert_called_once_with('sara@kbc.uk', 'Sara Coach')

    def test_a_director_lifts_any_entry_on_the_coachs_learners(self):
        entry = SimpleNamespace(learner_email='amy@learners.uk')
        with patch('callcentre.coach_centre.cached_directory', return_value=directory()),                 patch('callcentre.coach_centre.do_not_call.in_force') as in_force,                 patch('callcentre.coach_centre.do_not_call.remove') as remove:
            in_force.return_value.filter.return_value.first.return_value = entry
            coach_centre.lift('sara@kbc.uk', 'Dee', 5, 'Fine again', 'director')
            remove.assert_called_once_with(5, 'Fine again', 'Dee')
            entry.learner_email = 'ben@learners.uk'
            with self.assertRaisesMessage(ValueError, 'no longer on the list'):
                coach_centre.lift('sara@kbc.uk', 'Dee', 5, 'Fine again', 'director')
