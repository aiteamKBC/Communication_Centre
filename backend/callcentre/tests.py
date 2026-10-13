"""Database-free tests for the call-centre port.

Only SimpleTestCase is used: the configured databases are production servers, so the
runner must never create test databases for this app.
"""
import hashlib
import json
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest import mock

from django.conf import settings
from django.core import signing
from django.db import DatabaseError, ProgrammingError
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.utils import timezone

from backend.db_routers import CallCentreRouter
from . import aptem_summaries as summaries
from . import booking_email
from . import booking_links
from . import learners
from . import lms_booking
from . import lms_reviews
from .ai import ai_enabled, validate_analysis
from .emails import survey_token
from .access import refused
from .manage_views import allocations, call_requests, phone_keys, require_manager
from .models import Agent, CaseTicket
from .rules import (LONDON, OPTIONS, PROMISES, SPECIALIST_CLOSES, due_at, missed_call, missed_lectures_ready_until, next_workday, normalize_phone,
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

    def test_next_workday_skips_weekend_and_registered_bank_holiday(self):
        self.assertEqual(next_workday(date(2026, 10, 2)), date(2026, 10, 5))  # Friday -> Monday
        self.assertEqual(next_workday(date(2026, 12, 24)), date(2026, 12, 29))  # Christmas closures

    @override_settings(CALLCENTRE_HOLIDAYS=['2026-10-05'])
    def test_next_workday_also_skips_college_closures(self):
        self.assertEqual(next_workday(date(2026, 10, 2)), date(2026, 10, 6))

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

    def test_catchup_waits_for_evidence_while_legacy_review_promises_are_unchanged(self):
        self.assertEqual(PROMISES['attendance'], {'catch_up_session': 7})
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
        self.assertIn('review_type', sql)   # old Aptem-table review cases are left out


class OutcomeTests(SimpleTestCase):
    def test_outcome_rules(self):
        from .services import check_outcome
        missed_lecture = SimpleNamespace(source_type='attendance')
        check_outcome(missed_lecture, 'reached', 'catch_up_session', '', None)
        with self.assertRaisesMessage(ValueError, 'Choose what the learner agreed to.'):
            check_outcome(missed_lecture, 'reached', '', '', None)
        with self.assertRaisesMessage(ValueError, 'Say what the learner said.'):
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

    def test_only_directors_manage_agents(self):
        require_manager(SimpleNamespace(is_authenticated=True, is_active=True, is_superuser=True))
        with self.assertRaises(Exception):
            require_manager(SimpleNamespace(is_authenticated=True, is_active=True, is_staff=True, is_superuser=False))

    def test_directors_can_view_any_call(self):
        self.assertTrue(can_view_call(SimpleNamespace(is_authenticated=True, is_active=True, is_superuser=True), object()))

    def test_user_without_agent_cannot_view_call(self):
        with mock.patch('callcentre.services.agent_for', return_value=None):
            self.assertFalse(can_view_call(SimpleNamespace(is_authenticated=True, is_active=True, is_staff=True, is_superuser=False), object()))

    @mock.patch('callcentre.access.has_access', return_value=True)
    def test_transcript_overview_is_manager_only(self, _access):
        request = RequestFactory().get('/api/zoom/transcripts/')
        request.user = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=True, is_superuser=False)
        self.assertEqual(zoom_transcript_report(request).status_code, 403)

    def test_engagement_centre_needs_call_centre_access(self):
        groups = mock.Mock()
        groups.using.return_value.filter.return_value.exists.return_value = False
        staff = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=True, is_superuser=False, groups=groups)
        self.assertEqual(refused(staff).status_code, 403)
        groups.using.return_value.filter.return_value.exists.return_value = True
        self.assertIsNone(refused(staff))
        self.assertIsNone(refused(SimpleNamespace(is_authenticated=True, is_active=True, is_superuser=True)))


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
        with mock.patch('callcentre.access.has_access', return_value=True), \
                mock.patch('callcentre.manage_views.learner_directory', return_value=directory),                 mock.patch('callcentre.manage_views.timezone.now', return_value=datetime(date.today().year, date.today().month, date.today().day, 12, tzinfo=LONDON)):
            response = call_requests(request)
        return response.status_code, json.loads(response.content)

    manager = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=False, is_superuser=True, get_username=lambda: 'manager')

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
        with mock.patch('callcentre.access.has_access', return_value=True), \
                mock.patch('callcentre.manage_views.learner_directory', return_value=learners.merge([lms_row()], [])):
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


COACHES = {'olivia evans': 'olivia.evans@kentbusinesscollege.com', 'afaan khan': 'afaan.khan@kentbusinesscollege.com',
           'med maher': 'med.maher@kentbusinesscollege.com'}


@mock.patch('callcentre.sources.coach_email', lambda name: COACHES.get(' '.join(str(name).split()).casefold(), ''))
class BookingEmailTests(SimpleTestCase):
    def ticket(self, source_type, coach='Olivia Evans', **extra):
        return SimpleNamespace(source_type=source_type, coach=coach, learner_name='Sam Learner', learner_email='sam@example.com',
                               overdue_since=date(2026, 9, 21), source_data={'module': 'Marketing <Plan>'}, **extra)

    def test_catch_up_email_uses_the_coach_support_link_and_no_review_links(self):
        draft = booking_email.render(self.ticket('attendance'), 'Agent One')
        self.assertEqual(draft['link']['label'], 'Book your catch-up session')
        self.assertIn('I26h14gLCESW1sxisFM7NA2', draft['link']['url'])
        self.assertIn('Marketing &lt;Plan&gt;', draft['html'])
        self.assertIn('Monday 21 September 2026', draft['text'])
        for code in ('dFNqOwBdgEaEnzYyrKQ3Sw2', 'sVb8a69Fy0WmmOBY0UDUcA2'):
            self.assertNotIn(code, draft['html'])

    def test_review_emails_carry_only_their_own_bookings_link(self):
        pr = booking_email.render(self.ticket('pr'), 'Agent One')
        mcm = booking_email.render(self.ticket('mcm'), 'Agent One')
        self.assertIn('dFNqOwBdgEaEnzYyrKQ3Sw2', pr['link']['url'])
        self.assertNotIn('sVb8a69Fy0WmmOBY0UDUcA2', pr['html'])
        self.assertIn('sVb8a69Fy0WmmOBY0UDUcA2', mcm['link']['url'])
        self.assertNotIn('dFNqOwBdgEaEnzYyrKQ3Sw2', mcm['html'])

    def test_reworded_message_is_escaped_and_the_link_stays(self):
        draft = booking_email.render(self.ticket('pr'), 'Agent One', subject='  Your   review ', message='Hi <b>there</b>\n\nSecond')
        self.assertEqual(draft['subject'], 'Your review')
        self.assertIn('Hi &lt;b&gt;there&lt;/b&gt;', draft['html'])
        self.assertIn('dFNqOwBdgEaEnzYyrKQ3Sw2', draft['html'])
        with self.assertRaises(ValueError):
            booking_email.render(self.ticket('pr'), 'Agent One', subject='Subject', message='   ')

    def test_coach_without_a_link_is_reported_missing(self):
        ticket = self.ticket('pr', coach='Ahmed Lotfi')   # once matched Med Maher by the letters "med"
        with mock.patch.object(booking_email.EmailQuota.objects, 'filter') as quota, \
                mock.patch.object(booking_email.email_settings, 'current', return_value=booking_email.email_settings.defaults()):
            quota.return_value.values_list.return_value.first.return_value = 0
            checks = {c['key']: c['state'] for c in booking_email.readiness(ticket)}
        self.assertEqual(checks['link'], 'missing')
        self.assertNotIn('send', checks)   # the Send button exists now
        self.assertEqual(booking_email.render(ticket, 'Agent One')['link']['url'], '')

    def test_links_come_from_the_lms_catalogue_by_email(self):
        afaan, med = booking_links.booking_links('Afaan  Khan'), booking_links.booking_links('Med Maher')
        self.assertTrue(afaan['mcm'].endswith('sJ6ozTEGHkOFKCognZbvjQ2'))
        self.assertNotEqual(afaan['mcm'], med['pr'])
        self.assertTrue(med['support'].endswith('3xT6G1X7mUeeCWp7yJmQwA2'))
        self.assertTrue(all(url.startswith('https://') for links in booking_links.CATALOGUE.values() for url in links.values()))


AFAAN = 'afaan.khan@kentbusinesscollege.com'


class CoachBookingPageTests(SimpleTestCase):
    """Links follow the coach's page in the LMS coach directory (only read); a director confirms which page."""

    def setUp(self):
        self.pages = {'afaan': {'name': 'Afaan', 'links': {'pr': 'https://book.example/afaan-pr-new'}},
                      'rukshana': {'name': 'Rukshana', 'links': {'support': 'https://book.example/ruk-support'}}}
        self.confirmed = {}
        for patcher in (mock.patch.dict(booking_links._cached, {'pages': None, 'confirmed': {}, 'next_refresh': 0.0}),
                        mock.patch.dict(settings.DATABASES, {booking_links.LMS: {}}),
                        mock.patch.object(booking_links, '_read_pages', side_effect=lambda: self.pages),
                        mock.patch.object(booking_links, '_read_confirmed', side_effect=lambda: self.confirmed)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_catalogue_coach_follows_their_lms_page(self):
        self.assertEqual(booking_links.links_for_email(AFAAN), {'pr': 'https://book.example/afaan-pr-new'})
        self.assertEqual(booking_links.page_for(AFAAN), ('afaan', 'catalogue'))

    def test_a_confirmed_page_gives_a_new_coach_links(self):
        self.assertEqual(booking_links.links_for_email('rukshana.hussain@kentbusinesscollege.com'), {})
        self.confirmed = {'rukshana.hussain@kentbusinesscollege.com': 'rukshana'}
        booking_links.refresh(force=True)
        self.assertEqual(booking_links.links_for_email(' Rukshana.Hussain@KentBusinessCollege.com '),
                         {'support': 'https://book.example/ruk-support'})

    def test_confirmed_no_page_and_a_removed_page_give_no_links(self):
        self.confirmed = {AFAAN: ''}
        self.assertEqual(booking_links.links_for_email(AFAAN), {})
        self.confirmed = {}
        del self.pages['afaan']
        booking_links.refresh(force=True)
        self.assertEqual(booking_links.links_for_email(AFAAN), {})

    def test_until_the_directory_is_read_the_bundled_links_are_used(self):
        del settings.DATABASES[booking_links.LMS]
        self.assertEqual(booking_links.links_for_email(AFAAN), booking_links.CATALOGUE[AFAAN])
        self.assertTrue(booking_links.CATALOGUE[AFAAN])
        # A confirmed page other than the catalogue's cannot be shown without the directory.
        self.confirmed = {AFAAN: 'rukshana'}
        booking_links.refresh(force=True)
        self.assertEqual(booking_links.links_for_email(AFAAN), {})
        self.assertIsNone(booking_links.pages())

    def test_an_unreadable_directory_keeps_the_last_good_pages(self):
        booking_links.refresh()
        booking_links._read_pages.side_effect = DatabaseError('connection lost')
        with self.assertLogs('callcentre.booking_links', 'WARNING'):
            booking_links.refresh(force=True)
        self.assertEqual(booking_links.links_for_email(AFAAN), {'pr': 'https://book.example/afaan-pr-new'})

    def test_linking_not_set_up_uses_the_catalogue_pages(self):
        booking_links._read_confirmed.side_effect = ProgrammingError('relation does not exist')
        self.assertEqual(booking_links.page_for(AFAAN), ('afaan', 'catalogue'))
        self.assertEqual(booking_links.links_for_email(AFAAN), {'pr': 'https://book.example/afaan-pr-new'})

    def test_read_at_most_once_a_minute(self):
        for _ in range(3):
            booking_links.links_for_email(AFAAN)
        self.assertEqual(booking_links._read_pages.call_count, 1)

    def test_names_only_suggest_a_single_matching_page(self):
        directory = {'rukshana': {'name': 'Rukshana'}, 'omar-badr': {'name': 'Omar Badr'},
                     'omar-elshafey': {'name': 'Omar Elshafey'}, 'med': {'name': 'Med'}}
        self.assertEqual(booking_links.suggest('Rukshana  Hussain', directory), 'rukshana')
        self.assertEqual(booking_links.suggest('omar badr', directory), 'omar-badr')
        self.assertEqual(booking_links.suggest('Omar Smith', directory), '')    # two "Omar" pages
        self.assertEqual(booking_links.suggest('Ahmed Lotfi', directory), '')
        self.assertEqual(booking_links.suggest('Anyone', None), '')


@override_settings(CALLCENTRE_HELPDESK_URL='https://support.example')
class HelpdeskTests(SimpleTestCase):
    """Technical issues raised in the help desk through its public ticket API; nothing real is contacted."""

    def reply(self, status=200, data=None):
        response = mock.Mock(status_code=status)
        response.json.side_effect = (lambda: data) if data is not None else ValueError('not JSON')
        return mock.patch('callcentre.helpdesk.requests.request', return_value=response)

    def test_ticket_is_created_for_the_learner_as_a_technical_ticket(self):
        from . import helpdesk
        with self.reply(201, {'ticket': {'id': 'KBC-000123', 'status': 'Open'}}) as request:
            public_id, ticket = helpdesk.create_ticket('learner@example.com', 'LMS', 'Cannot open the module page.')
        self.assertEqual(public_id, 'KBC-000123')
        args, kwargs = request.call_args
        self.assertEqual(args, ('POST', 'https://support.example/api/tickets'))
        self.assertEqual(kwargs['json'], {'email': 'learner@example.com', 'category': 'Technical',
                                          'technicalSubcategory': 'LMS', 'inquiry': 'Cannot open the module page.'})
        self.assertFalse(kwargs['allow_redirects'])

    def test_help_desk_refusals_and_bad_replies_are_reported(self):
        from . import helpdesk
        with self.reply(404, {'message': 'This email is not registered in our records.'}), \
                self.assertRaisesMessage(helpdesk.HelpdeskError, 'This email is not registered in our records.'):
            helpdesk.create_ticket('x@example.com', 'LMS', 'Something broke here.')
        for reply in (self.reply(200), self.reply(201, {'ticket': {'id': '../admin'}})):
            with reply, self.assertRaises(helpdesk.HelpdeskError):
                helpdesk.create_ticket('x@example.com', 'LMS', 'Something broke here.')
        with mock.patch('callcentre.helpdesk.requests.request', side_effect=helpdesk.requests.ConnectTimeout) as request, \
                self.assertRaisesMessage(helpdesk.HelpdeskError, 'could not be reached'):
            helpdesk.ticket_status('KBC-000123')
        self.assertEqual(request.call_count, helpdesk.CONNECT_ATTEMPTS)

    def test_a_dropped_connection_is_retried_but_a_sent_request_never_is(self):
        from . import helpdesk
        answered = mock.Mock(status_code=201)
        answered.json.return_value = {'ticket': {'id': 'KBC-000123'}}
        with mock.patch('callcentre.helpdesk.requests.request', side_effect=[helpdesk.requests.ConnectTimeout, answered]) as request:
            self.assertEqual(helpdesk.create_ticket('x@example.com', 'LMS', 'Something broke here.')[0], 'KBC-000123')
        self.assertEqual(request.call_count, 2)
        with mock.patch('callcentre.helpdesk.requests.request', side_effect=helpdesk.requests.ReadTimeout) as request, \
                self.assertRaisesMessage(helpdesk.HelpdeskError, 'may still have been created'):
            helpdesk.create_ticket('x@example.com', 'LMS', 'Something broke here.')
        self.assertEqual(request.call_count, 1)

    def test_status_is_read_only_for_a_valid_ticket_number(self):
        from . import helpdesk
        with self.reply(200, {'ticket': {'status': 'Pending', 'statusReason': 'Escalation'}}) as request:
            self.assertEqual(helpdesk.ticket_status('KBC-000123'), {'status': 'Pending', 'reason': 'Escalation'})
        self.assertEqual(request.call_args.args, ('GET', 'https://support.example/api/tickets/KBC-000123/chat-history'))
        with self.reply(200, {}) as request, self.assertRaises(helpdesk.HelpdeskError):
            helpdesk.ticket_status('KBC-1/../../admin')
        request.assert_not_called()

    @override_settings(CALLCENTRE_HELPDESK_URL='')
    def test_switched_off_without_a_help_desk_address(self):
        from . import helpdesk
        self.assertFalse(helpdesk.enabled())
        self.assertEqual(helpdesk.sync(), 'Not connected')
        with self.assertRaises(helpdesk.HelpdeskError):
            helpdesk.create_ticket('x@example.com', 'LMS', 'Something broke here.')

    def case(self, **data):
        return SimpleNamespace(source_data={'ticket': 'KBC-000123', 'helpdesk_status': 'Open', **data}, status='pending_verification',
                               next_followup_at=None, due_at=None, sla_breached=True, claimed_by_id=None, save=mock.Mock())

    def test_a_closed_ticket_makes_the_case_due_for_the_confirmation_call(self):
        from . import helpdesk
        case, now = self.case(), datetime(2026, 10, 13, 10, tzinfo=LONDON)
        with mock.patch('callcentre.helpdesk.event') as event:
            helpdesk.apply_status(case, 'Closed', 'Closed via Agent', now)
            self.assertEqual((case.status, case.sla_breached), ('new', False))
            self.assertEqual(case.due_at.date(), date(2026, 10, 15))
            self.assertEqual(case.source_data['helpdesk_status'], 'Closed')
            event.assert_called_once_with(case, 'helpdesk_closed', {'ticket': 'KBC-000123', 'reason': 'Closed via Agent'})
            # Still closed on the next check: nothing changes again.
            helpdesk.apply_status(case, 'Closed', 'Closed via Agent', now)
            self.assertEqual(event.call_count, 1)
            # Support reopened it before anyone called: waiting on support again.
            helpdesk.apply_status(case, 'Open', '', now)
            self.assertEqual(case.status, 'pending_verification')
            self.assertEqual(event.call_args.args[1], 'helpdesk_reopened')

    def test_open_and_pending_tickets_keep_the_case_waiting(self):
        from . import helpdesk
        case = self.case()
        with mock.patch('callcentre.helpdesk.event') as event:
            helpdesk.apply_status(case, 'Pending', 'Escalation', timezone.now())
        self.assertEqual(case.status, 'pending_verification')
        self.assertEqual(case.source_data['helpdesk_reason'], 'Escalation')
        event.assert_not_called()

    def test_a_call_while_support_has_the_ticket_does_not_put_the_case_back_on_the_list(self):
        from . import helpdesk
        now = timezone.now()
        # A missed call made the case due now; an answered one set a next-morning follow-up.
        for status, followup in (('new', None), ('pending_verification', now + timedelta(hours=16))):
            case = self.case()
            case.status, case.next_followup_at = status, followup
            with self.subTest(status=status), mock.patch('callcentre.helpdesk.event') as event:
                helpdesk.apply_status(case, 'Open', '', now)
                self.assertEqual((case.status, case.next_followup_at), ('pending_verification', None))
                self.assertGreater(case.due_at, now + timedelta(days=300))
                event.assert_not_called()

    def test_a_callback_or_a_case_being_worked_is_left_alone(self):
        from . import helpdesk
        callback_at = timezone.now() + timedelta(days=1)
        callback = self.case()
        callback.status, callback.next_followup_at = 'pending_learner', callback_at
        claimed = self.case()
        claimed.status, claimed.claimed_by_id = 'new', 3
        with mock.patch('callcentre.helpdesk.event'):
            helpdesk.apply_status(callback, 'Pending', 'Escalation', timezone.now())
            helpdesk.apply_status(claimed, 'Open', '', timezone.now())
        self.assertEqual((callback.status, callback.next_followup_at), ('pending_learner', callback_at))
        self.assertEqual(claimed.status, 'new')

    def test_a_call_about_another_case_leaves_out_technical_issues_still_with_support(self):
        from .rules import waiting_on_support
        sql = str(CaseTicket.objects.filter(~waiting_on_support()).query)
        self.assertIn('tech_support', sql)
        self.assertIn('helpdesk_status', sql)

    def test_raising_checks_the_input_before_contacting_the_help_desk(self):
        from . import helpdesk
        origin = SimpleNamespace(pk=7, learner_email='learner@example.com', learner_name='Learner')
        agent = SimpleNamespace(display_name='Agent One')
        with mock.patch('callcentre.helpdesk.create_ticket') as create:
            for subcategory, description, email in (('Coverage', 'Valid description.', 'l@example.com'),
                                                    ('LMS', 'short', 'l@example.com'), ('LMS', 'Valid description.', '')):
                origin.learner_email = email
                with self.subTest(subcategory=subcategory, description=description), self.assertRaises(ValueError):
                    helpdesk.raise_issue(origin, agent, 'agent', subcategory, description, 'key')
            create.assert_not_called()

    def test_a_repeated_request_does_not_raise_a_second_ticket(self):
        from . import helpdesk
        origin = SimpleNamespace(pk=7, learner_email='learner@example.com', learner_name='Learner')
        existing = SimpleNamespace(pk=9)
        with mock.patch('callcentre.helpdesk.create_ticket') as create, \
                mock.patch('callcentre.helpdesk.CaseTicket.objects.filter') as found:
            found.return_value.first.return_value = existing
            self.assertEqual(helpdesk.raise_issue(origin, SimpleNamespace(display_name='A'), 'a', 'LMS', 'Valid description.', 'k'),
                             (existing, False))
        create.assert_not_called()

    def view(self, user, payload, origin_email='learner@example.com'):
        from .views import tech_issue
        request = RequestFactory().post('/api/callcentre/tickets/7/tech-issue/', data=json.dumps(payload), content_type='application/json')
        request._dont_enforce_csrf_checks = True
        request.user = user
        origin = SimpleNamespace(pk=7, learner_email=origin_email, learner_name='Learner', learner_phone='+447700900123', coach='Coach',
                                 organisation='', programme='', manager_name='', manager_email='')
        agent = SimpleNamespace(pk=3, display_name='Agent One')
        with mock.patch('callcentre.access.has_access', return_value=True), \
                mock.patch('callcentre.views.operating_agent', return_value=agent if user.is_agent else None), \
                mock.patch('callcentre.views.CaseTicket.objects.get', return_value=origin), \
                mock.patch('callcentre.views.can_work', return_value=agent), \
                mock.patch('callcentre.helpdesk.CaseTicket.objects.filter') as found, \
                mock.patch('callcentre.helpdesk.create_ticket', return_value=('KBC-000123', {'status': 'Open'})) as create, \
                mock.patch('callcentre.helpdesk.CaseTicket.objects.create', return_value=SimpleNamespace(
                    pk=11, source_data={'ticket': 'KBC-000123'})), \
                mock.patch('callcentre.helpdesk.event'), mock.patch('callcentre.helpdesk.transaction.atomic'):
            found.return_value.first.return_value = None
            response = tech_issue(request, 7)
        return response.status_code, json.loads(response.content), create

    agent_user = SimpleNamespace(is_authenticated=True, is_active=True, is_superuser=False, is_agent=True, get_username=lambda: 'agent')
    payload = {'subcategory': 'LMS', 'description': 'The learner cannot open their module page.',
               'request_key': '3f2b1c9e-8d7a-4b6c-9e1f-0a2b3c4d5e6f', 'email': 'someone.else@example.com'}

    def test_the_ticket_is_raised_for_the_case_learner_not_an_email_in_the_request(self):
        status, data, create = self.view(self.agent_user, self.payload)
        self.assertEqual((status, data['ticket'], data['id']), (201, 'KBC-000123', 11))
        self.assertEqual(create.call_args.args[0], 'learner@example.com')
        self.assertIn('Raised by Agent One (KBC Engagement Centre)', create.call_args.args[2])

    def test_only_specialists_raise_tickets_and_a_request_key_is_required(self):
        no_agent = SimpleNamespace(**{**vars(self.agent_user), 'is_agent': False})
        self.assertEqual(self.view(no_agent, self.payload)[0], 403)
        self.assertEqual(self.view(self.agent_user, {**self.payload, 'request_key': 'nope'})[0], 400)

    def test_a_help_desk_refusal_is_shown_to_the_specialist(self):
        from . import helpdesk
        with mock.patch('callcentre.helpdesk.raise_issue', side_effect=helpdesk.HelpdeskError('This email is not registered in our records.')):
            status, data, _ = self.view(self.agent_user, self.payload)
        self.assertEqual((status, data['detail']), (502, 'This email is not registered in our records.'))


class CoachPagesViewTests(SimpleTestCase):
    manager = CallRequestTests.manager
    coaches = {'Afaan Khan': AFAAN, 'Rukshana Hussain': 'rukshana.hussain@kentbusinesscollege.com', 'No Email': ''}

    def call(self, user, payload=None):
        factory = RequestFactory()
        request = (factory.post('/api/callcentre/coach-pages/', data=json.dumps(payload), content_type='application/json')
                   if payload is not None else factory.get('/api/callcentre/coach-pages/'))
        request._dont_enforce_csrf_checks = True
        request.user = user
        with mock.patch('callcentre.access.has_access', return_value=True), \
                mock.patch('callcentre.manage_views.register_coaches', return_value=self.coaches), \
                mock.patch.object(booking_links, 'pages', return_value={'rukshana': {'name': 'Rukshana', 'links': {}}}), \
                mock.patch.object(booking_links, 'confirm') as confirm, \
                mock.patch('callcentre.manage_views.CoachBookingPage.objects.exists', return_value=False):
            from .manage_views import coach_pages
            response = coach_pages(request)
        return response.status_code, json.loads(response.content), confirm

    def test_only_directors_link_pages(self):
        agent = SimpleNamespace(is_authenticated=True, is_active=True, is_staff=False, is_superuser=False)
        self.assertEqual(self.call(agent)[0], 403)
        status, _, confirm = self.call(agent, {'email': AFAAN, 'slug': 'rukshana'})
        self.assertEqual(status, 403)
        confirm.assert_not_called()

    def test_coaches_show_their_page_and_a_suggestion(self):
        status, data, _ = self.call(self.manager)
        self.assertEqual(status, 200)
        rows = {row['coach']: row for row in data['coaches']}
        self.assertEqual((rows['Afaan Khan']['slug'], rows['Afaan Khan']['source']), ('afaan', 'catalogue'))
        self.assertFalse(rows['Afaan Khan']['page_found'])   # not in the (mocked) directory
        self.assertEqual(rows['Rukshana Hussain']['suggestion'], 'rukshana')
        self.assertEqual(rows['No Email']['suggestion'], '')
        self.assertEqual(data['pages'], [{'slug': 'rukshana', 'name': 'Rukshana'}])
        self.assertTrue(data['set_up'])

    def test_director_confirms_a_page_for_a_register_coach(self):
        status, _, confirm = self.call(self.manager, {'email': 'Rukshana.Hussain@kentbusinesscollege.com', 'slug': 'rukshana'})
        self.assertEqual(status, 200)
        confirm.assert_called_once_with('rukshana.hussain@kentbusinesscollege.com', 'rukshana', 'manager')
        self.assertEqual(self.call(self.manager, {'email': AFAAN, 'slug': ''})[0], 200)   # no booking page

    def test_unknown_coach_or_page_is_refused(self):
        for payload in ({'email': 'someone@example.com', 'slug': 'rukshana'}, {'email': '', 'slug': 'rukshana'},
                        {'email': AFAAN, 'slug': 'not-a-page'}, {'email': AFAAN, 'slug': None}):
            with self.subTest(payload=payload):
                status, _, confirm = self.call(self.manager, payload)
                self.assertEqual(status, 400)
                confirm.assert_not_called()


class CoachRuleTests(SimpleTestCase):
    staff = {'case owner': 'owner@kbc.ac.uk', 'aptem owner': 'aptem.owner@kbc.ac.uk'}

    def test_coach_name_first_then_case_owner_then_aptem(self):
        self.assertEqual(learners.pick_coach('Lms Coach', 'Coach@KBC.ac.uk', 'Case Owner', 'Aptem Owner', self.staff),
                         ('Lms Coach', 'coach@kbc.ac.uk'))
        self.assertEqual(learners.pick_coach('', '', 'Case  Owner', 'Aptem Owner', self.staff), ('Case Owner', 'owner@kbc.ac.uk'))
        self.assertEqual(learners.pick_coach('Default Owner', 'x@kbc.ac.uk', '', 'Aptem Owner', self.staff),
                         ('Aptem Owner', 'aptem.owner@kbc.ac.uk'))
        self.assertEqual(learners.pick_coach('', '', 'Default Owner', '', self.staff), ('', ''))

    def test_staff_email_only_for_a_unique_name(self):
        rows = [{'Username': 'Sam Coach', 'Email': 'a@kbc.ac.uk'}, {'Username': 'sam  coach', 'Email': 'b@kbc.ac.uk'},
                {'Username': 'Jo Coach', 'Email': 'Jo@KBC.ac.uk'}]
        self.assertEqual(learners.staff_emails(rows), {'jo coach': 'jo@kbc.ac.uk'})

    def test_directory_coach_skips_placeholders_and_records_coach_emails(self):
        people = learners.merge([lms_row(Coach_name='Default Owner', Case_owner='Case Owner', aptem_id='7')], [aptem_row()],
                                [{'Username': 'Case Owner', 'Email': 'owner@kbc.ac.uk'}])
        self.assertEqual(people['learner@example.com']['coach'], 'Case Owner')
        self.assertEqual(people.coach_emails, {'case owner': 'owner@kbc.ac.uk'})

    def test_active_holds_active_and_delivery_learners_with_their_aptem_email(self):
        people = learners.merge([lms_row(aptem_id='7', Programme_status='Delivery'), lms_row(Email='gone@example.com',
                                 Programme_status='Withdrawn')], [aptem_row(Email='Other@Example.com')])
        self.assertEqual(people.active, {'learner@example.com', 'other@example.com'})

    def test_lms_statuses_are_grouped_as_the_lms_groups_them(self):
        self.assertEqual([learners.program_status(s) for s in ('Active', 'Delivery', 'On Break', 'OnMaternityBreak', 'Completed')],
                         ['active', 'active', 'break', 'break', 'completed'])


class LmsReviewTests(SimpleTestCase):
    today = date(2026, 10, 4)

    def classify(self, review_type='Progress Review', status='Not Scheduled', day=date(2026, 9, 20), completed=None,
                 reasons=lms_reviews.IMPORTED_REASONS):
        return lms_reviews.classify(review_type, status, day, completed, self.today, reasons)

    def test_imported_statuses_become_due_missed_or_signature(self):
        self.assertEqual(self.classify(), 'pr')
        self.assertEqual(self.classify(status='Scheduled'), 'pr_missed')
        self.assertEqual(self.classify(status='AwaitingSignature', completed=datetime(2026, 9, 20)), 'signature')
        self.assertEqual(self.classify('Monthly Coaching Meeting', 'Scheduled'), 'mcm_missed')
        for status in ('In Progress', 'Completed', 'Archived'):
            self.assertIsNone(self.classify(status=status))

    def test_both_progress_reviews_count_and_other_reviews_do_not(self):
        self.assertEqual(self.classify('Progress Review (+ Skills Radar)'), 'pr')
        for other in ('Gateway Review', 'Personal Support Plan', 'RPL and Experience'):
            self.assertIsNone(self.classify(other))
        self.assertIsNone(self.classify('Gateway Review', 'AwaitingSignature'))

    def test_only_from_the_system_cutoff_and_only_once_the_date_has_passed(self):
        self.assertIsNone(self.classify(day=date(2026, 8, 31)))
        self.assertIsNone(self.classify(day=self.today))
        self.assertIsNone(self.classify(completed=datetime(2026, 9, 21)))

    def test_new_lms_statuses(self):
        native = lms_reviews.NATIVE_REASONS
        self.assertEqual(self.classify('Monthly Coaching Meeting', 'not-scheduled', reasons=native), 'mcm')
        self.assertEqual(self.classify('Monthly Coaching Meeting', 'scheduled', reasons=native), 'mcm_missed')
        self.assertEqual(self.classify(status='awaiting-signature', reasons=native), 'signature')
        self.assertIsNone(self.classify(status='in-progress', reasons=native))

    def test_two_progress_review_kinds_are_separate_calls(self):
        items = [{'email': 'a@x.com', 'case_type': 'pr', 'review_type': t, 'day': date(2026, 9, d), 'ref': f'reviews:{d}'}
                 for t, d in (('Progress Review', 10), ('Progress Review', 12), ('Progress Review (+ Skills Radar)', 15))]
        groups = lms_reviews.group_items(items)
        self.assertEqual(sorted(len(g) for g in groups.values()), [1, 2])

    def test_a_review_is_done_when_completed_and_a_signature_when_signed(self):
        self.assertTrue(lms_reviews.done('pr', {'status': 'Scheduled', 'completed': datetime(2026, 10, 1)}))
        self.assertFalse(lms_reviews.done('pr_missed', {'status': 'Scheduled', 'completed': None}))
        self.assertFalse(lms_reviews.done('signature', {'status': 'AwaitingSignature', 'completed': datetime(2026, 10, 1)}))
        self.assertTrue(lms_reviews.done('signature', {'status': 'Completed', 'completed': datetime(2026, 10, 1)}))

    def test_review_evidence_closes_from_the_lms_state(self):
        from .evidence import review_evidence
        created = datetime(2026, 10, 1, 9, tzinfo=LONDON)
        ticket = SimpleNamespace(source_type='signature', learner_email='a@x.com', evidence_after=None, created_at=created,
                                 source_data={'review_refs': ['reviews:5']})
        signed = SimpleNamespace(errors={}, review_states={'reviews:5': {
            'status': 'Completed', 'completed': datetime(2026, 9, 20, tzinfo=LONDON), 'updated_at': datetime(2026, 10, 2, tzinfo=LONDON)}})
        proof = review_evidence(ticket, signed)
        self.assertEqual((proof['kind'], proof['row_key']), ('review_signed', 'reviews:5'))
        signed.review_states['reviews:5']['status'] = 'AwaitingSignature'
        self.assertIsNone(review_evidence(ticket, signed))



@mock.patch('callcentre.sources.coach_email', lambda name: COACHES.get(' '.join(str(name).split()).casefold(), ''))
class ReminderEmailTests(SimpleTestCase):
    def ticket(self, source_type, **extra):
        values = {'source_type': source_type, 'coach': 'Olivia Evans', 'learner_name': 'Sam Learner',
                  'learner_email': 'sam@example.com', 'manager_name': 'Morgan Manager', 'overdue_since': date(2026, 9, 21),
                  'source_data': {'module': 'Marketing', 'review_type': 'Progress Review (+ Skills Radar)'}, 'pk': 1}
        return SimpleNamespace(**{**values, **extra})

    def test_reminders_are_off_unless_switched_on(self):
        from . import email_settings, emails
        self.assertFalse(settings.CALLCENTRE_REMINDERS_ENABLED)
        self.assertFalse(email_settings.defaults()['reminders_enabled'])
        self.assertEqual(email_settings.defaults()['email_mode'], 'dry_run')
        with mock.patch.object(email_settings, 'current', return_value=email_settings.defaults()), \
                mock.patch.object(emails.CaseTicket.objects, 'open') as open_cases:
            self.assertEqual(emails.process_emails(), 0)
        open_cases.assert_not_called()

    def test_stage_follows_the_configured_days(self):
        from .emails import reminder_stage
        days = [0, 2, 5, 7]
        self.assertEqual([reminder_stage(age, days) for age in (0, 1, 2, 4, 5, 6, 7, 30)],
                         ['initial', 'initial', 'day2', 'day2', 'day5', 'day5', 'day7', 'day7'])
        self.assertIsNone(reminder_stage(1, [2, 5]))

    def test_catch_up_reminder_has_only_the_support_link_and_no_recording(self):
        from .emails import render_email
        subject, text, html = render_email(self.ticket('attendance'), 'day2')
        self.assertEqual(subject, 'Reminder: Book your catch-up session for Marketing')
        self.assertIn('I26h14gLCESW1sxisFM7NA2', html)
        for other in ('dFNqOwBdgEaEnzYyrKQ3Sw2', 'sVb8a69Fy0WmmOBY0UDUcA2', 'recording'):
            self.assertNotIn(other, html)
        self.assertNotIn('speaking with us today', text)

    def test_missed_review_and_signature_wording(self):
        from .emails import render_email
        subject, text, _ = render_email(self.ticket('pr_missed'), 'initial')
        self.assertEqual(subject, 'Rebook your progress review')
        self.assertIn('did not go ahead', text)
        subject, text, html = render_email(self.ticket('signature'), 'initial')
        self.assertEqual(subject, 'Please sign your Progress Review (+ Skills Radar)')
        self.assertNotIn('<a href', html)
        self.assertNotIn('confirm a time', text)

    def test_escalation_goes_to_the_line_manager_in_the_template(self):
        from .emails import render_email
        subject, text, html = render_email(self.ticket('mcm'), 'escalation')
        self.assertEqual(subject, 'Support needed for Sam Learner')
        self.assertTrue(text.startswith('Hello Morgan Manager,'))
        self.assertIn('an overdue monthly coaching meeting', text)
        self.assertIn('email-assets/logo.png', html)


MAIL_ENV = {'CALLCENTRE_MAIL_TENANT_ID': 'tenant', 'CALLCENTRE_MAIL_CLIENT_ID': 'client', 'CALLCENTRE_MAIL_CLIENT_SECRET': 'secret'}


class MailerTests(SimpleTestCase):
    def test_reports_missing_settings_by_name_and_never_uses_the_calendar_app(self):
        from . import mailer
        calendar_only = {'MICROSOFT_GRAPH_TENANT_ID': 't', 'MICROSOFT_GRAPH_CLIENT_ID': 'c', 'MICROSOFT_GRAPH_CLIENT_SECRET': 's'}
        with mock.patch.dict('os.environ', calendar_only, clear=True), self.settings(CALLCENTRE_MAIL_SENDER=''):
            self.assertEqual(mailer.missing(), ['CALLCENTRE_MAIL_TENANT_ID', 'CALLCENTRE_MAIL_CLIENT_ID',
                                                'CALLCENTRE_MAIL_CLIENT_SECRET', 'CALLCENTRE_MAIL_SENDER'])
            with self.assertRaises(mailer.MailError):
                mailer.send('learner@example.com', 'Subject', '<p>Hi</p>')

    @override_settings(CALLCENTRE_MAIL_SENDER='noreply@example.com')
    def test_sends_as_the_no_reply_mailbox_with_the_mail_app(self):
        from . import mailer
        with mock.patch.dict('os.environ', MAIL_ENV, clear=True), mock.patch.object(mailer.graph, 'request') as request:
            mailer.send('learner@example.com', 'Subject', '<p>Hi</p>', cc=['team@example.com'])
        method, path, payload = request.call_args.args
        self.assertEqual((method, path, request.call_args.kwargs['profile']), ('POST', 'users/noreply%40example.com/sendMail', 'mail'))
        message = payload['message']
        self.assertEqual(message['toRecipients'], [{'emailAddress': {'address': 'learner@example.com'}}])
        self.assertEqual(message['ccRecipients'], [{'emailAddress': {'address': 'team@example.com'}}])
        self.assertEqual(message['from']['emailAddress']['address'], 'noreply@example.com')
        self.assertTrue(payload['saveToSentItems'])

    @override_settings(CALLCENTRE_MAIL_SENDER='noreply@example.com')
    def test_a_refusal_is_a_failure_and_a_lost_connection_is_uncertain(self):
        from . import graph, mailer
        with mock.patch.dict('os.environ', MAIL_ENV, clear=True):
            for error, uncertain in ((graph.GraphError('refused', 403), False), (graph.GraphError('timeout'), True)):
                with mock.patch.object(mailer.graph, 'request', side_effect=error), self.assertRaises(mailer.MailError) as caught:
                    mailer.send('learner@example.com', 'Subject', '<p>Hi</p>')
                self.assertIs(caught.exception.uncertain, uncertain)


class EmailSettingsTests(SimpleTestCase):
    def values(self, **changes):
        from . import email_settings
        return {**email_settings.defaults(), **changes}

    def test_clean_orders_days_and_types_and_refuses_nonsense(self):
        from . import email_settings
        cleaned = email_settings.clean(self.values(reminder_days=[7, 0, 2, 2], reminder_types=['signature', 'attendance'],
                                                   escalation_cc=' Team@Example.com '))
        self.assertEqual(cleaned['reminder_days'], [0, 2, 7])
        self.assertEqual(cleaned['reminder_types'], ['attendance', 'signature'])
        self.assertEqual(cleaned['escalation_cc'], 'team@example.com')
        for bad in ({'email_mode': 'send'}, {'reminder_days': []}, {'reminder_days': [61]}, {'escalate_day': -1},
                    {'reminder_types': ['everything']}, {'daily_cap': 11}, {'escalation_cc': 'not-an-email'},
                    {'reminders_enabled': 'yes'}):
            with self.assertRaises(ValueError):
                email_settings.clean(self.values(**bad))

    def test_save_needs_a_reason_and_live_needs_microsoft_365(self):
        from . import email_settings
        with self.assertRaisesMessage(ValueError, 'Say why'):
            email_settings.save(self.values(), 0, 'no', 'director', can_send=True)
        with self.assertRaisesMessage(ValueError, 'Live sending needs'):
            email_settings.save(self.values(email_mode='live'), 0, 'Going live today', 'director', can_send=False)

    def test_sender_defaults_to_the_no_reply_mailbox(self):
        from . import mailer
        self.assertEqual(mailer.sender(), 'no-reply@kentbusinesscollege.com')


    @override_settings(CALLCENTRE_EMAIL_LIVE_ALLOWED=False)
    def test_a_server_without_permission_never_sends_live(self):
        from . import email_settings
        with mock.patch.object(email_settings, 'stored', return_value=(self.values(email_mode='live'), 1, True)):
            self.assertEqual(email_settings.current()['email_mode'], 'dry_run')
        with self.assertRaisesMessage(ValueError, 'not allowed to send live email'):
            email_settings.save(self.values(email_mode='live'), 0, 'Going live today', 'director', can_send=True)

    def test_reminders_only_from_when_sending_started(self):
        from . import email_settings
        from .emails import reminder_day
        self.assertEqual(reminder_day(6, [0, 2, 5, 7]), 5)
        self.assertIsNone(reminder_day(-1, [0, 2]))
        self.assertEqual(email_settings.sending_since({'sending_since': '2026-10-05T23:30:00+00:00'}), date(2026, 10, 6))
        self.assertIsNone(email_settings.sending_since({}))


class EmployerAllocationTests(SimpleTestCase):
    def test_an_employer_follows_the_specialist_of_most_of_their_learners(self):
        from .allocation import manager_owners
        directory = SimpleNamespace(managers={'boss@example.org': ['a@x', 'b@x', 'c@x'], 'tie@example.org': ['d@x', 'e@x'],
                                              'none@example.org': ['f@x']})
        with mock.patch('callcentre.sources.cached_directory', return_value=directory):
            owners_ = manager_owners({'a@x': 2, 'b@x': 2, 'c@x': 1, 'd@x': 2, 'e@x': 1})
        self.assertEqual(owners_, {'boss@example.org': 2, 'tie@example.org': 1})

    def test_employers_are_never_booked_coach_sessions(self):
        self.assertEqual(lms_booking.session_types(SimpleNamespace(source_type='employer_feedback')), [])
        self.assertEqual(lms_booking.session_types(SimpleNamespace(source_type='learner_satisfaction')), ['student-support'])
