"""Database-free tests for the call-centre port.

Only SimpleTestCase is used: the configured databases are production servers, so the
runner must never create test databases for this app.
"""
import hashlib
import json
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest import mock

from django.core import signing
from django.test import RequestFactory, SimpleTestCase, override_settings

from backend.db_routers import CallCentreRouter
from . import aptem_summaries as summaries
from . import booking_email
from . import booking_links
from . import learners
from . import lms_booking
from .ai import ai_enabled, validate_analysis
from .emails import survey_token
from .manage_views import allocations, call_requests, phone_keys, require_manager
from .models import Agent, CaseTicket
from .rules import (LONDON, OPTIONS, PROMISES, SPECIALIST_CLOSES, due_at, missed_call, missed_lectures_ready_until, normalize_phone,
                    priority, promise_deadline, promise_missed)
from .zoom_views import can_view_call, zoom_transcript_report


class RulesTests(SimpleTestCase):
    def test_normalize_phone(self):
        self.assertEqual(normalize_phone('07700 900123'), '+447700900123')
        self.assertEqual(normalize_phone('+44 (0)7700 900123'), '+447700900123')
        self.assertEqual(normalize_phone('0044 7700 900123'), '+447700900123')
        self.assertEqual(normalize_phone('7700900123'), '')
        self.assertEqual(normalize_phone('call me'), '')

    @override_settings(CALLCENTRE_HOLIDAYS=[])
    def test_sla_skips_weekends(self):
        friday = datetime(2026, 10, 2, 10, tzinfo=LONDON)
        self.assertEqual(due_at('attendance', friday).date(), date(2026, 10, 6))

    def test_missed_lecture_waits_three_days(self):
        # Absent on the 1st: not ready on the 3rd, ready on the 4th.
        self.assertLess(missed_lectures_ready_until(date(2026, 10, 3)), date(2026, 10, 1))
        self.assertEqual(missed_lectures_ready_until(date(2026, 10, 4)), date(2026, 10, 1))


class PromiseTests(SimpleTestCase):
    def ticket(self, **fields):
        values = {'promised_at': None, 'status': 'new', 'risk': 'amber', 'due_at': datetime(2026, 10, 9, tzinfo=LONDON),
                  'overdue_since': None, 'booking_at': None, 'misses': 0, 'attempts': 0}
        return SimpleNamespace(**{**values, **fields})

    def test_deadline_is_five_pm_after_the_allowed_days(self):
        now = datetime(2026, 10, 2, 10, tzinfo=LONDON)
        self.assertEqual(promise_deadline('epa', 'epa_step', now), datetime(2026, 10, 9, 17, tzinfo=LONDON))

    def test_agreeing_to_book_closes_the_case(self):
        self.assertEqual(PROMISES['attendance'], {'catch_up_session': None})
        self.assertIsNone(PROMISES['pr']['book_pr'])
        self.assertIsNone(PROMISES['mcm']['book_mcm'])

    def test_every_promise_is_a_valid_option_and_proofless_cases_have_none(self):
        self.assertTrue({option for options in PROMISES.values() for option in options} <= OPTIONS)
        self.assertTrue(all(not PROMISES[category] for category in SPECIALIST_CLOSES))

    def test_missed_promise_only_once_the_case_is_back_in_the_queue(self):
        now = datetime(2026, 10, 9, 18, tzinfo=LONDON)
        past = datetime(2026, 10, 9, 17, tzinfo=LONDON)
        self.assertTrue(promise_missed(self.ticket(promised_at=past), now))
        self.assertFalse(promise_missed(self.ticket(promised_at=past, status='pending_verification'), now))
        self.assertFalse(promise_missed(self.ticket(promised_at=now.replace(day=10)), now))
        self.assertFalse(promise_missed(self.ticket(), now))

    def test_missed_promise_ranks_with_red_risk(self):
        now = datetime(2026, 10, 2, 18, tzinfo=LONDON)
        missed = self.ticket(promised_at=datetime(2026, 10, 2, 17, tzinfo=LONDON))
        self.assertGreater(priority(missed, now), priority(self.ticket(), now))

    def test_missed_call_drops_below_every_other_case(self):
        now = datetime(2026, 10, 2, 18, tzinfo=LONDON)
        unanswered = self.ticket(last_call_result='no_answer', risk='red', due_at=datetime(2026, 9, 1, tzinfo=LONDON))
        self.assertTrue(missed_call(unanswered))
        self.assertFalse(missed_call(self.ticket(last_call_result='answered')))
        self.assertFalse(missed_call(self.ticket(last_call_result='no_answer', status='resolved')))
        self.assertLess(priority(unanswered, now), priority(self.ticket(), now))


class ScopeTests(SimpleTestCase):
    def test_open_cases_leave_out_paused_types_old_missed_lectures_and_learners_on_a_break(self):
        with mock.patch('callcentre.sources.on_break_emails', return_value=frozenset({'resting@example.com'})):
            sql = str(CaseTicket.objects.open().query)
        self.assertIn('NOT "callcenter_case"."archived"', sql)
        self.assertIn('otj', sql)
        self.assertIn('2026-09-01', sql)
        self.assertIn('resting@example.com', sql)


class OutcomeTests(SimpleTestCase):
    def test_outcome_rules(self):
        from .services import check_outcome
        missed_lecture = SimpleNamespace(source_type='attendance')
        check_outcome(missed_lecture, 'reached', 'catch_up_session', '', None)
        with self.assertRaisesMessage(ValueError, 'Choose what the learner agreed to.'):
            check_outcome(missed_lecture, 'reached', '', '', None)
        with self.assertRaisesMessage(ValueError, 'Explain what the manager needs to know.'):
            check_outcome(missed_lecture, 'refused', '', ' ', None)
        with self.assertRaisesMessage(ValueError, 'Choose a future callback time.'):
            check_outcome(missed_lecture, 'callback', '', '', datetime(2020, 1, 1, tzinfo=LONDON))

    def test_held_outcome_needs_an_answered_call(self):
        from .services import check_call_result
        check_call_result('reached', SimpleNamespace(result='answered'))
        with self.assertRaisesMessage(ValueError, 'Zoom must confirm an answered call.'):
            check_call_result('reached', SimpleNamespace(result='no_answer'))


class SummaryTests(SimpleTestCase):
    def test_parse_date_safe(self):
        self.assertEqual(summaries.parse_date_safe('03/02/2026'), date(2026, 2, 3))
        self.assertEqual(summaries.parse_date_safe('Due 3 Feb 2026 (late)'), date(2026, 2, 3))
        self.assertEqual(summaries.parse_date_safe(datetime(2026, 2, 3, 9)), date(2026, 2, 3))
        self.assertIsNone(summaries.parse_date_safe('N/A'))

    def test_overdue_slots_skip_completed_archived_and_excluded_reviews(self):
        row = {
            'Review Planned Date1': '2026-01-01', 'Review Status1': 'Scheduled',
            'Review Planned Date2': '2026-02-01', 'Review Status2': 'Completed',
            'Review Planned Date3': 'Gateway review 2026-03-01', 'Review Status3': '',
            'Review Planned Date4': '2026-03-05', 'Review Status4': 'Archived',
            'Review Planned Date5': '2026-12-01', 'Review Status5': '',
        }
        overdue, latest = summaries._overdue_slots(row, 'Review Planned Date', 'Review Status', 5, date(2026, 6, 1))
        self.assertEqual((overdue, latest), (1, date(2026, 1, 1)))

    def test_thresholds(self):
        self.assertEqual(summaries.overdue_status(13), 'Due')
        self.assertEqual(summaries.mcm_risk(3), 'red')
        self.assertEqual(summaries.attendance_risk(2), 'amber')


class AiTests(SimpleTestCase):
    valid = {'outcome': 'reached', 'absence_reason': '', 'chosen_option': 'other', 'promised_date': None,
             'commitments': [], 'sentiment': 'neutral', 'agent_quality_score': 4, 'agent_quality_notes': '',
             'summary': 'ok', 'confidence': 0.5}

    def test_validate_analysis(self):
        self.assertEqual(validate_analysis(dict(self.valid)), self.valid)
        with self.assertRaises(ValueError):
            validate_analysis({**self.valid, 'confidence': 2})

    @override_settings(OPENAI_API_KEY='key', OPENAI_MODEL='model', CALLCENTRE_AI_ENABLED=False)
    def test_ai_needs_explicit_opt_in(self):
        self.assertFalse(ai_enabled())
        with self.settings(CALLCENTRE_AI_ENABLED=True):
            self.assertTrue(ai_enabled())


class SurveyTokenTests(SimpleTestCase):
    def test_round_trip(self):
        survey = SimpleNamespace(pk=7, nonce='abc')
        self.assertEqual(signing.loads(survey_token(survey), salt='callcentre-survey'), {'id': 7, 'nonce': 'abc'})


class RouterTests(SimpleTestCase):
    def test_callcentre_models_use_login_db_and_never_migrate(self):
        router = CallCentreRouter()
        self.assertEqual(router.db_for_read(CaseTicket), 'login_db')
        self.assertEqual(router.db_for_write(Agent), 'login_db')
        self.assertFalse(router.allow_migrate('login_db', 'callcentre'))
        self.assertIsNone(router.allow_migrate('default', 'api'))


class AccessTests(SimpleTestCase):
    def test_activity_phone_keys(self):
        self.assertEqual(phone_keys('+44 7700 900123'), ['07700900123', '7700900123', '700900123'])

    def test_only_managers_manage_agents(self):
        require_manager(SimpleNamespace(is_staff=True))
        with self.assertRaises(Exception):
            require_manager(SimpleNamespace(is_staff=False))

    def test_managers_can_view_any_call(self):
        self.assertTrue(can_view_call(SimpleNamespace(is_staff=True, is_superuser=False), object()))

    def test_user_without_agent_cannot_view_call(self):
        with mock.patch('callcentre.services.agent_for', return_value=None):
            self.assertFalse(can_view_call(SimpleNamespace(is_staff=False, is_superuser=False), object()))

    def test_transcript_overview_is_manager_only(self):
        request = RequestFactory().get('/api/zoom/transcripts/')
        request.user = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=False, is_superuser=False)
        self.assertEqual(zoom_transcript_report(request).status_code, 403)


def lms_row(**values):
    return {'id': 1, 'Username': 'Lms Name', 'Email': 'learner@example.com', 'Phone_number': '', 'aptem_id': '',
            'Coach_name': 'Lms Coach', 'Programme': 'Lms Programme', 'Programme_status': 'Active',
            'Orgnization': '', 'Employer': '', 'Line_manager': '', **values}


def aptem_row(**values):
    return {'ID': 7, 'FullName': 'Aptem Name', 'Email': 'learner@example.com', 'Learner Phone': '07700 900123',
            'OwnerName': 'Aptem Coach', 'OrganizationName': 'Aptem Org', 'Program Name': 'Aptem Programme',
            'ManagerName': 'Manager', 'ManagerEmail': 'Manager@Example.com', **values}


class LearnerMergeTests(SimpleTestCase):
    def test_coach_from_lms_phone_and_manager_from_aptem(self):
        person = learners.merge([lms_row(Phone_number='07700 900999')], [aptem_row()])['learner@example.com']
        self.assertEqual((person['coach'], person['learner_name'], person['programme']), ('Lms Coach', 'Lms Name', 'Lms Programme'))
        self.assertEqual(person['learner_phone'], '+447700900123')
        self.assertEqual((person['manager_email'], person['organisation']), ('manager@example.com', 'Aptem Org'))

    def test_each_source_fills_the_others_gaps(self):
        people = learners.merge([lms_row(Coach_name='', Phone_number='07700 900999')], [aptem_row(**{'Learner Phone': ''})])
        self.assertEqual(people['learner@example.com']['coach'], 'Aptem Coach')
        self.assertEqual(people['learner@example.com']['learner_phone'], '+447700900999')

    def test_lms_only_and_aptem_only_learners_are_kept(self):
        people = learners.merge([lms_row(Email='new@example.com')], [aptem_row(Email='old@example.com')])
        self.assertEqual(set(people), {'new@example.com', 'old@example.com'})
        self.assertEqual(people['new@example.com']['manager_email'], '')

    def test_aptem_id_match_keeps_the_aptem_email_as_an_alias(self):
        people = learners.merge([lms_row(aptem_id='7')], [aptem_row(Email='Other@Example.com')])
        self.assertEqual(list(people), ['learner@example.com'])
        self.assertIn('other@example.com', people)
        self.assertIs(people['other@example.com'], people['learner@example.com'])

    def test_merged_duplicates_and_ambiguous_emails_are_skipped(self):
        people = learners.merge([lms_row(Programme_status='Duplicate - merged'), lms_row(Email='twice@example.com'),
                                 lms_row(Email='TWICE@example.com')], [])
        self.assertEqual(len(people), 0)

    def test_learners_on_a_break_are_left_out_and_aptem_cannot_add_them_back(self):
        people = learners.merge([lms_row(aptem_id='7', Programme_status='On Break'), lms_row(Email='done@example.com',
                                 Programme_status='Completed')], [aptem_row(Email='Other@Example.com')])
        self.assertEqual(list(people), ['done@example.com'])
        self.assertNotIn('other@example.com', people)
        self.assertEqual(people.on_break, {'learner@example.com', 'other@example.com'})

    def test_either_source_alone_builds_the_directory(self):
        self.assertIn('learner@example.com', learners.merge([], [aptem_row()]))
        self.assertIn('learner@example.com', learners.merge([lms_row()], []))


class CohortTests(SimpleTestCase):
    def test_cohort_and_group_stay_off_the_profile_copied_onto_cases(self):
        people = learners.merge([lms_row(Cohort='Sept 26', Group='DA-L4-A')], [])
        self.assertEqual(people.cohorts['learner@example.com'], {'cohort': 'Sept 26', 'group': 'DA-L4-A'})
        self.assertNotIn('cohort', people['learner@example.com'])


class DirectoryWiringTests(SimpleTestCase):
    def test_manager_views_use_the_merged_directory(self):
        from . import manage_views, sources
        self.assertIs(manage_views.learner_directory, sources.learner_directory)


class CallRequestTests(SimpleTestCase):
    def post(self, user, **payload):
        values = {'request_key': '6f1c1c4e-2d5b-4b1e-9a55-3f1f0f6c9b10', 'learner_email': 'learner@example.com',
                  'phone': '', 'due_date': date.today().isoformat(), 'title': 'Check-in', 'purpose': 'Agree the next step.', **payload}
        request = RequestFactory().post('/api/callcentre/requests/', data=json.dumps(values), content_type='application/json')
        request._dont_enforce_csrf_checks = True
        request.user = user
        directory = learners.merge([lms_row()], [])
        with mock.patch('callcentre.manage_views.learner_directory', return_value=directory),                 mock.patch('callcentre.manage_views.timezone.now', return_value=datetime(date.today().year, date.today().month, date.today().day, 12, tzinfo=LONDON)):
            response = call_requests(request)
        return response.status_code, json.loads(response.content)

    manager = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=True, is_superuser=False, get_username=lambda: 'manager')

    def test_only_managers_can_request_calls(self):
        agent = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=False, is_superuser=False)
        self.assertEqual(self.post(agent)[0], 403)

    def test_learner_must_be_in_the_directory(self):
        self.assertEqual(self.post(self.manager, learner_email='nobody@example.com'), (400, {'detail': 'Choose a learner from the directory.'}))

    def test_a_number_is_required_when_the_learner_has_none(self):
        self.assertEqual(self.post(self.manager)[1]['detail'], 'This learner has no phone number. Enter the number to call.')

    def test_invalid_phone_and_past_dates_are_rejected(self):
        self.assertEqual(self.post(self.manager, phone='call me')[0], 400)
        self.assertEqual(self.post(self.manager, phone='07700 900123', due_date='2020-01-01')[0], 400)



class AllocationTests(SimpleTestCase):
    manager = CallRequestTests.manager

    def post(self, user, payload):
        request = RequestFactory().post('/api/callcentre/allocations/', data=json.dumps(payload), content_type='application/json')
        request._dont_enforce_csrf_checks = True
        request.user = user
        with mock.patch('callcentre.manage_views.learner_directory', return_value=learners.merge([lms_row()], [])):
            response = allocations(request)
        return response.status_code, json.loads(response.content)

    def test_only_managers_allocate(self):
        agent = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=False, is_superuser=False)
        self.assertEqual(self.post(agent, {})[0], 403)

    def test_a_reason_and_a_selection_are_required(self):
        change = {'email': 'learner@example.com', 'agent_id': None, 'revision': 0}
        self.assertEqual(self.post(self.manager, {'reason': 'no', 'changes': [change]})[0], 400)
        self.assertEqual(self.post(self.manager, {'reason': 'Balance the intake', 'changes': []})[0], 400)


class LmsBookingTests(SimpleTestCase):
    """Slot rules and LMS identities for in-system coach booking; Graph and the LMS are never called."""

    def slots(self, now, busy=(), day=None):
        with mock.patch.object(lms_booking, 'coach_busy', return_value=list(busy)):
            return lms_booking.free_slots('coach@example.com', now=now, day=day)

    def test_hour_slots_inside_the_uk_working_day_with_an_hours_notice(self):
        slots = self.slots(datetime(2026, 10, 5, 9, 30, tzinfo=LONDON), day=date(2026, 10, 5))
        self.assertEqual([s.strftime('%H:%M') for s in slots], ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00'])

    def test_no_weekends_or_bank_holidays_and_unknown_years_fail_closed(self):
        now = datetime(2026, 10, 1, 8, tzinfo=LONDON)
        self.assertEqual(self.slots(now, day=date(2026, 10, 3)), [])
        self.assertEqual(self.slots(now, day=date(2026, 12, 28)), [])
        self.assertEqual(self.slots(now, day=date(2029, 1, 8)), [])

    def test_busy_time_blocks_overlapping_slots(self):
        start = datetime(2026, 10, 6, 10, 30, tzinfo=LONDON)
        slots = self.slots(datetime(2026, 10, 1, 8, tzinfo=LONDON), [(start, start + timedelta(minutes=30))], day=date(2026, 10, 6))
        self.assertNotIn('10:00', [s.strftime('%H:%M') for s in slots])
        self.assertIn('11:00', [s.strftime('%H:%M') for s in slots])

    def test_slots_follow_uk_clock_across_the_october_change(self):
        slot = self.slots(datetime(2026, 10, 20, 8, tzinfo=LONDON), day=date(2026, 10, 26))[0]
        self.assertEqual((slot.hour, slot.utcoffset()), (9, timedelta(0)))

    def test_report_id_matches_the_lms_hash(self):
        key = '1000_2025-05-02_charl_marketing_impact_and_planning'
        digest = int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], 'big')
        self.assertEqual(lms_booking.kbc_report_id(key), 8_000_000_000_000_000_000 + digest % 1_000_000_000_000_000_000)

    def test_catch_up_only_on_missed_lecture_cases(self):
        self.assertEqual(lms_booking.session_types(SimpleNamespace(source_type='attendance')), ['catch-up', 'student-support'])
        self.assertEqual(lms_booking.session_types(SimpleNamespace(source_type='pr')), ['student-support'])

    def test_booking_refuses_bad_input_before_touching_any_system(self):
        ticket = SimpleNamespace(source_type='pr')
        with mock.patch.object(lms_booking, 'lms_learner') as learner:
            with self.assertRaises(ValueError):
                lms_booking.book(ticket, 'catch-up', datetime(2026, 10, 6, 10, tzinfo=LONDON), 'request-1234', 'Agent')
            with self.assertRaises(ValueError):
                lms_booking.book(ticket, 'student-support', datetime(2026, 10, 6, 10, tzinfo=LONDON), 'bad id', 'Agent')
        learner.assert_not_called()


class BookingEmailTests(SimpleTestCase):
    def ticket(self, source_type, coach='Olivia Smith', **extra):
        return SimpleNamespace(source_type=source_type, coach=coach, learner_name='Sam Learner', learner_email='sam@example.com',
                               overdue_since=date(2026, 9, 21), source_data={'module': 'Marketing <Plan>'}, **extra)

    def test_catch_up_email_uses_the_coach_booking_link_and_no_review_links(self):
        draft = booking_email.render(self.ticket('attendance'), 'Agent One')
        self.assertEqual(draft['link'], {'label': 'Book your catch-up session',
                                         'url': booking_links.BASE + 'I26h14gLCESW1sxisFM7NA2'})
        self.assertIn('Marketing &lt;Plan&gt;', draft['html'])
        self.assertIn('Monday 21 September 2026', draft['text'])
        for code in ('dFNqOwBdgEaEnzYyrKQ3Sw2', 'sVb8a69Fy0WmmOBY0UDUcA2'):
            self.assertNotIn(code, draft['html'])

    def test_review_emails_carry_only_their_own_bookings_link(self):
        pr = booking_email.render(self.ticket('pr'), 'Agent One')
        mcm = booking_email.render(self.ticket('mcm'), 'Agent One')
        self.assertTrue(pr['link']['url'].endswith('dFNqOwBdgEaEnzYyrKQ3Sw2'))
        self.assertNotIn('sVb8a69Fy0WmmOBY0UDUcA2', pr['html'])
        self.assertTrue(mcm['link']['url'].endswith('sVb8a69Fy0WmmOBY0UDUcA2'))
        self.assertNotIn('dFNqOwBdgEaEnzYyrKQ3Sw2', mcm['html'])

    def test_reworded_message_is_escaped_and_the_link_stays(self):
        draft = booking_email.render(self.ticket('pr'), 'Agent One', subject='  Your   review ', message='Hi <b>there</b>\n\nSecond')
        self.assertEqual(draft['subject'], 'Your review')
        self.assertIn('Hi &lt;b&gt;there&lt;/b&gt;', draft['html'])
        self.assertIn('dFNqOwBdgEaEnzYyrKQ3Sw2', draft['html'])
        with self.assertRaises(ValueError):
            booking_email.render(self.ticket('pr'), 'Agent One', subject='Subject', message='   ')

    def test_coach_without_a_link_is_reported_missing(self):
        ticket = self.ticket('pr', coach='Unknown Coach')
        with mock.patch.object(booking_email.EmailQuota.objects, 'filter') as quota:
            quota.return_value.values_list.return_value.first.return_value = 0
            checks = {c['key']: c['state'] for c in booking_email.readiness(ticket)}
        self.assertEqual(checks['link'], 'missing')
        self.assertEqual(checks['send'], 'missing')
        self.assertEqual(booking_email.render(ticket, 'Agent One')['link']['url'], '')

    def test_not_bookable_reason_names_the_lms_status(self):
        self.assertIn('not in the LMS', lms_booking.not_bookable_reason(None))
        self.assertIn('“Withdrawn”', lms_booking.not_bookable_reason({'status': 'Withdrawn', 'active': False}))
        self.assertIn('no LMS learner profile', lms_booking.not_bookable_reason({'status': 'Delivery', 'active': False}))
        self.assertIn('break in learning', lms_booking.not_bookable_reason({'status': 'On Break', 'active': False}))

    def test_delivery_learners_are_booked_like_active_ones(self):
        self.assertEqual(lms_booking.BOOKABLE_LIFECYCLES, ('active', 'delivery'))
        self.assertEqual([learners.program_status(s) for s in ('Active', 'Delivery', 'On Break', 'OnMaternityBreak', 'Completed')],
                         ['active', 'active', 'break', 'break', 'completed'])

