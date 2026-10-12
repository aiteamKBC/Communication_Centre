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
from django.test import RequestFactory, SimpleTestCase, override_settings

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
        self.assertEqual(checks['send'], 'missing')
        self.assertEqual(booking_email.render(ticket, 'Agent One')['link']['url'], '')

    def test_links_come_from_the_lms_catalogue_by_email(self):
        afaan, med = booking_links.booking_links('Afaan  Khan'), booking_links.booking_links('Med Maher')
        self.assertTrue(afaan['mcm'].endswith('sJ6ozTEGHkOFKCognZbvjQ2'))
        self.assertNotEqual(afaan['mcm'], med['pr'])
        self.assertTrue(med['support'].endswith('3xT6G1X7mUeeCWp7yJmQwA2'))
        self.assertTrue(all(url.startswith('https://') for links in booking_links.CATALOGUE.values() for url in links.values()))


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
