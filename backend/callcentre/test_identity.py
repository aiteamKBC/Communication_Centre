"""Synthetic identity and consumer contracts; no external calls or source writes."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.db.models import Q
from django.utils import timezone

from . import identity, lms_booking, sources, evidence
from .test_learner_satisfaction import aptem, lms


@override_settings(CALLCENTRE_IDENTITY_MODE='unified')
class IdentityTests(SimpleTestCase):
    def test_absence_earlier_in_week_survives_later_attendance(self):
        from .aptem_summaries import attendance_missed_for_week
        today = timezone.now().date()
        rows = [{'Email': 'learner@example.org', 'date': today-timedelta(days=2), 'module': 'A', 'Attendance': 0},
                {'Email': 'learner@example.org', 'date': today, 'module': 'B', 'Attendance': 1},
                {'Email': 'other@example.org', 'date': today, 'module': 'C', 'Attendance': 0},
                {'Email': 'other@example.org', 'date': today, 'module': 'C', 'Attendance': 1}]
        with patch('callcentre.aptem_summaries._fetch', side_effect=[rows, rows]):
            result = attendance_missed_for_week(today-timedelta(days=6), today)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['attendance_module'], 'A')

    def test_first_session_and_introduction_are_reminded(self):
        from datetime import time
        from .rules import LONDON
        p = self.build()
        tomorrow = timezone.now().astimezone(LONDON).date()+timedelta(days=1)
        rows = [{'id': n, 'event_key': f'event-{n}', 'learner_id': 1, 'learner_email': 'learner@example.org',
                 'event_type': kind, 'status': 'scheduled', 'scheduled_date': tomorrow, 'scheduled_time': time(10+n)}
                for n,kind in enumerate(['first-session', 'lms-introduction'])]
        def read(alias, sql, params=()):
            return rows if 'coach_calendar_event' in sql else []
        with patch.object(sources, 'rows', side_effect=read):
            self.assertEqual(len(sources.load_bookings(p)), 2)
    def build(self, **kwargs):
        return identity.build([lms()], [aptem(OwnerEmail='coach@example.org')], **kwargs)

    def test_namespace_collision_does_not_merge(self):
        p = identity.build([lms(id=10, aptem_id=None, Email='new@example.org')], [aptem()])
        self.assertEqual(len(p.records), 2)
        self.assertIsNot(p.resolve('aptem', 10), p.resolve('lms', 10))

    def test_fk_and_approved_accounts_keep_email_aliases(self):
        p = identity.build([lms(Email='new@example.org', aptem_id=None)], [aptem()],
                           mappings=[{'enrolment_id': 1, 'aptem_id': '10', 'legacy_lms_id': 55}],
                           accounts=[{'enrolment_id': 1, 'source_system': 'legacy_lms', 'source_learner_id': '55',
                                      'source_email': 'old@example.org', 'canonical_email': 'new@example.org'}])
        self.assertEqual(len(p), 1)
        self.assertIs(p.resolve('legacy_lms', 55), p.resolve(email='old@example.org'))
        self.assertIs(p.get('learner@example.org'), p['new@example.org'])

    def test_conflicting_id_and_email_fail_closed(self):
        p = identity.build([lms(aptem_id=11)], [aptem()])
        self.assertFalse(p.sources_complete)
        self.assertFalse(p.resolve(email='learner@example.org'))

    def test_disagreeing_approved_map_does_not_override_current_id(self):
        p = self.build(mappings=[{'enrolment_id': 1, 'aptem_id': '99'}])
        self.assertFalse(p.sources_complete)
        self.assertEqual(p.conflicts[0]['kind'], 'conflicting_aptem_ids')

    def test_same_aptem_id_claimed_twice_is_not_merged(self):
        p = identity.build([lms(), lms(id=2, Email='second@example.org')], [aptem()])
        self.assertFalse(p.sources_complete)
        self.assertFalse(p.records)

    def test_duplicate_email_is_not_a_join_key(self):
        p = identity.build([lms(id=1, aptem_id=None), lms(id=2, aptem_id=None)], [])
        self.assertFalse(p.sources_complete)
        self.assertIsNone(p.resolve(email='learner@example.org'))

    def test_native_only_no_phone_or_email_is_retained(self):
        p = identity.build([lms(aptem_id=None, Email='', Programme_status='Onboarding')], [])
        self.assertEqual(len(p.satisfaction), 1)
        self.assertEqual(p.satisfaction[0]['identifiers'], ['lms:1'])
        self.assertEqual(p.satisfaction[0]['profile']['learner_phone'], '')

    def test_current_status_and_coach_win_conflicts(self):
        p = identity.build([lms(Programme_status='Withdrawn', Coach_name='Native Coach', Coach_email='native@example.org')],
                           [aptem(OwnerEmail='different@example.org', **{'Program-Status': 'Active'})])
        person = p.resolve('lms', 1)
        self.assertEqual(person['programme_status'], 'Withdrawn')
        self.assertEqual(person['coach_email'], 'native@example.org')
        self.assertEqual(len(p.field_conflicts), 1)
        self.assertFalse(p.active)

    def test_owner_email_is_used_without_name_guessing(self):
        self.assertEqual(self.build().resolve('lms', 1)['coach_email'], 'coach@example.org')

    def test_break_retains_identity_for_history_but_no_open_queue(self):
        p = identity.build([lms(Programme_status='OnBreak')], [aptem()])
        self.assertIsNotNone(p.resolve('aptem', 10))
        self.assertFalse(p.satisfaction)
        self.assertIn('learner@example.org', p.on_break)

    def test_calendar_id_requires_correct_namespace_and_email(self):
        p = self.build(profiles=[{'id': 800, 'enrolment_id': 1, 'aptem_id': 10,
                                 'email_normalized': 'learner@example.org'}])
        person = p.resolve('lms', 1)
        self.assertIs(p.calendar_person({'learner_id': 800, 'learner_email': 'learner@example.org'}), person)
        self.assertIsNone(p.calendar_person({'learner_id': 10, 'learner_email': 'learner@example.org'}))
        self.assertIsNone(p.resolve('profile', 800, 'someoneelse@example.org'))
        self.assertIsNone(p.calendar_person({'learner_id': None, 'learner_email': 'learner@example.org'}))
        self.assertIsNone(p.calendar_person({'learner_id': 800, 'learner_email': ''}))
        self.assertIsNone(p.resolve('profile', 0, 'learner@example.org'))

    def test_new_era_meetings_add_the_reviews_the_bookings_lack_and_a_review_in_both_is_reminded_once(self):
        from .rules import LONDON, next_workday
        p = self.build()
        tomorrow = next_workday(timezone.now().astimezone(LONDON).date())
        from datetime import time, datetime
        start = datetime.combine(tomorrow, time(10), LONDON)
        legacy = {'pr': {'students': [{'customerEmail': 'learner@example.org', 'startDateTime': start.isoformat(), 'appointmentId': 'legacy-id'}]}}
        calendar = {'id': 5, 'event_key': 'calendar-key', 'learner_id': 1, 'learner_email': 'learner@example.org',
                    'event_type': 'progress-review', 'status': 'scheduled', 'scheduled_date': tomorrow, 'scheduled_time': time(10)}
        later = start + timedelta(hours=4)
        meetings = [{'id': 'm1', 'subject': 'Progress Review meeting with Learner Example - Coach', 'coach': 'coach@example.org', 'start_at': start},
                    {'id': 'm2', 'subject': 'Monthly coaching with Nobody Known', 'coach': 'coach@example.org', 'start_at': start},
                    {'id': 'm3', 'subject': 'Monthly Coaching Review with Learner Example', 'coach': 'coach@example.org', 'start_at': later}]
        new_era = {'public.meetings': meetings, 'public.learners': [{'learner_name': 'Learner Example', 'learner_email': 'learner@example.org'}],
                   'all_sessions_cache_v2': []}

        def read(alias, sql, params=()):
            if alias == 'callcentre_newera':
                return next(value for table, value in new_era.items() if table in sql)
            return [calendar] if 'coach_calendar_event' in sql else [legacy]
        with patch.object(sources, 'rows', side_effect=read):
            bookings = sources.load_bookings(p)
        # The review is booked (the calendar copy supersedes the legacy one) and in New Era: reminded once, as booked. New Era
        # adds the MCM no booking has; the meeting naming nobody is left out.
        self.assertEqual(sorted((b['id'], b['type'], b['source']) for b in bookings),
                         [('calendar-key', 'pr', 'Learner.coach_calendar_event'), ('m3', 'mcm', 'newera.meetings')])

    def test_a_new_era_meeting_naming_two_learners_of_the_same_name_goes_to_the_coachs_one(self):
        from datetime import datetime, time
        from .rules import LONDON
        day = timezone.now().astimezone(LONDON).date()
        start = datetime.combine(day, time(9), LONDON)
        tables = {'public.meetings': [{'id': 'm', 'subject': 'Monthly Coaching Review with Sam Lee', 'coach': 'b@kbc.test', 'start_at': start}],
                  'public.learners': [{'learner_name': 'Sam Lee', 'learner_email': 'sam1@x.test'}, {'learner_name': 'Sam Lee', 'learner_email': 'sam2@x.test'}],
                  'all_sessions_cache_v2': [{'email': 'sam1@x.test', 'coach': 'a@kbc.test'}, {'email': 'sam2@x.test', 'coach': 'b@kbc.test'}]}
        with patch.object(sources, 'rows', side_effect=lambda alias, sql, params=(): next(v for t, v in tables.items() if t in sql)):
            found, skipped = sources.newera_reviews(day)
        self.assertEqual(([(f['email'], f['type']) for f in found], skipped), ([('sam2@x.test', 'mcm')], 0))

    def test_a_new_era_meeting_with_its_attendees_is_matched_by_the_learners_email_before_the_name(self):
        from datetime import datetime, time
        from .rules import LONDON
        day = timezone.now().astimezone(LONDON).date()
        start = datetime.combine(day, time(9), LONDON)
        invited = {'attendees': [{'emailAddress': {'address': 'coach@kentbusinesscollege.com'}}, {'emailAddress': {'address': 'Jo.Ray@Mail.test'}}]}
        tables = {'public.meetings': [
                      # The subject names someone else; the invited learner wins.
                      {'id': 'a', 'subject': 'Progress review with Sam Lee', 'coach': 'b@kbc.test', 'start_at': start, 'raw_event': invited},
                      # No learner invited by email: the name decides.
                      {'id': 'b', 'subject': 'Monthly coaching with Sam Lee', 'coach': 'b@kbc.test', 'start_at': start,
                       'raw_event': {'attendees': [{'emailAddress': {'address': 'coach@kentbusinesscollege.com'}}]}}],
                  'public.learners': [{'learner_name': 'Sam Lee', 'learner_email': 'sam@x.test'}, {'learner_name': 'Jo Ray', 'learner_email': 'jo.ray@mail.test'}],
                  'all_sessions_cache_v2': []}
        with patch.object(sources, 'rows', side_effect=lambda alias, sql, params=(): next(v for t, v in tables.items() if t in sql)):
            found, _ = sources.newera_reviews(day, is_learner={'jo.ray@mail.test', 'sam@x.test'}.__contains__)
        self.assertEqual([(f['id'], f['email'], f['matched_by']) for f in found], [('a', 'jo.ray@mail.test', 'email'), ('b', 'sam@x.test', 'name')])

    def test_native_reviews_are_not_hidden_by_unrelated_imported_history(self):
        from . import lms_reviews
        from .rules import LONDON
        p = self.build(profiles=[{'id': 800, 'enrolment_id': 1, 'aptem_id': 10,
                                 'email_normalized': 'learner@example.org'}])
        today = timezone.now().astimezone(LONDON).date()
        imported = {'id': 'old', 'email': 'learner@example.org', 'review_type': 'Progress Review',
                    'status': 'Not Scheduled', 'planned_day': today-timedelta(days=1), 'completed_date': None}
        native = {'id': 'native', 'email': 'learner@example.org', 'review_type': 'Progress Review',
                  'status': 'not-scheduled', 'day': today-timedelta(days=1), 'completed_at': None, 'profile_id': 800}
        with patch.object(lms_reviews, 'connections', {sources.LMS: MagicMock()}), \
                patch.object(lms_reviews, '_fetch', side_effect=[[imported], [native]]):
            result = lms_reviews.review_items(today, people=p)
        self.assertEqual({r['ref'] for r in result}, {'reviews:old', 'instance:native'})

    def test_shared_learner_manager_phone_not_attributed(self):
        p = identity.build([lms()], [aptem(**{'Learner Phone': '07700900123', 'Manager Phone': '+447700900123'})])
        self.assertFalse(p.phone_contacts())

    def test_activity_exact_phone_only(self):
        from .manage_views import activity_phone_directory, phone_keys
        p = identity.build([lms()], [aptem(**{'Learner Phone': '07700900123'})])
        with patch('callcentre.manage_views.learner_directory', return_value=p):
            self.assertEqual(activity_phone_directory()['+447700900123']['learner_name'], 'Learner')
        self.assertEqual(phone_keys('07700900123'), ['+447700900123'])
        self.assertEqual(phone_keys('900123'), [])

    def test_booking_uses_enrolment_id_and_approved_aptem_link(self):
        p = self.build()
        with patch('callcentre.sources.learner_directory', return_value=p), patch('callcentre.graph.request') as graph:
            person = lms_booking.lms_learner('learner@example.org')
        self.assertEqual(person['source_id'], 1)
        self.assertEqual(person['aptem_id'], '10')
        graph.assert_not_called()

    def test_booking_rejects_incomplete_source(self):
        p = self.build()
        p.sources_complete = False
        with patch('callcentre.sources.learner_directory', return_value=p):
            with self.assertRaises(lms_booking.Unavailable):
                lms_booking.lms_learner('learner@example.org')

    def test_unified_reads_all_sources_read_only_without_health_writes(self):
        def read(alias, sql):
            if 'Created_users' in sql:
                return [lms()]
            if sql == identity.APTEM_SQL:
                return [aptem()]
            return []
        with patch.object(sources, 'rows', side_effect=read) as query, patch.object(sources, 'source_health') as health:
            p = sources.unified_directory()
        self.assertTrue(p.sources_complete)
        self.assertEqual(query.call_count, 6)
        health.assert_not_called()

    def test_cache_retains_last_snapshot_on_failure_but_marks_it_incomplete(self):
        p = self.build()
        with patch.dict(sources._cached, {'directory': p, 'next_refresh': 0}), \
                patch.object(sources, 'unified_directory', side_effect=RuntimeError('offline')):
            self.assertIs(sources.cached_directory(), p)
            self.assertFalse(p.sources_complete)

    def test_training_adapter_does_not_query_missing_row_number(self):
        from api.views import aptem_source_records
        with patch.object(sources, 'rows', return_value=[aptem(subprogramme='Group A')]) as query:
            record = aptem_source_records()[0]
        self.assertEqual(record.learner_id, 10)
        self.assertIsNone(record.row_number)
        self.assertNotIn('row_number', query.call_args.args[1])
        self.assertIn('"LMS"."Aptem_users"', query.call_args.args[1])

    def test_catchup_requires_actual_attendance_and_exact_report_link(self):
        p = self.build()
        now = timezone.now()
        ticket = SimpleNamespace(source_type='attendance', learner_email='learner@example.org',
                                 created_at=now-timedelta(days=3), evidence_after=None,
                                 source_data={'catchup_booking': {'event_key': 'event-one', 'lms_report_id': 7}})
        row = {'id': 5, 'learner_id': 1, 'learner_email': 'learner@example.org', 'event_type': 'catch-up',
               'status': 'completed', 'scheduled_date': (now-timedelta(days=1)).date(),
               'scheduled_time': now.time().replace(tzinfo=None), 'attendance_id': 8,
               'participant_email': 'learner@example.org', 'attended': False, 'updated_at': now-timedelta(hours=1)}
        report = {'learner_email': 'learner@example.org', 'catchup_event_key': 'event-one'}
        def read(alias, sql, params):
            return [report] if 'coach_absence_report' in sql else [row]
        with patch.object(sources, 'cached_directory', return_value=p), patch.object(evidence, 'rows', side_effect=read):
            self.assertIsNone(evidence.attendance_evidence(ticket))
            row['attended'] = True
            self.assertEqual(evidence.attendance_evidence(ticket)['row_key'], '8')
            report['catchup_event_key'] = 'different-event'
            self.assertIsNone(evidence.attendance_evidence(ticket))
            report['catchup_event_key'] = 'event-one'
            row['participant_email'] = 'coach@example.org'
            self.assertIsNone(evidence.attendance_evidence(ticket))

    def test_catchup_with_link_warning_never_closes(self):
        ticket = SimpleNamespace(source_data={'catchup_booking': {'event_key': 'event', 'link_warning': 'mismatch'}})
        with patch.object(evidence, 'rows') as read:
            self.assertIsNone(evidence.attendance_evidence(ticket))
        read.assert_not_called()


@override_settings(CALLCENTRE_IDENTITY_MODE='unified')
class IdentityWorkflowTests(TestCase):
    databases = {'default', 'login_db'}

    def test_cancelled_reminder_is_hidden_and_reinstated_without_history_loss(self):
        from datetime import datetime, time
        from .models import CaseTicket
        from .rules import LONDON
        p = identity.build([lms()], [aptem()])
        tomorrow = timezone.now().astimezone(LONDON).date()+timedelta(days=1)
        at = datetime.combine(tomorrow, time(10), LONDON)
        booking = {'email': 'learner@example.org', 'type': 'first-session', 'start': at,
                   'id': 'one', 'source': 'Learner.coach_calendar_event'}
        sources.generate_reminders(p, [booking])
        case = CaseTicket.objects.get(source_type='reminder')
        sources.generate_reminders(p, [])
        case.refresh_from_db()
        self.assertFalse(case.source_data['eligible'])
        self.assertEqual(case.status, 'new')
        sources.generate_reminders(p, [booking])
        case.refresh_from_db()
        self.assertTrue(case.source_data['eligible'])
        self.assertEqual(CaseTicket.objects.count(), 1)

    def test_first_review_repair_preserves_deliberate_followup(self):
        from .models import CaseTicket
        from .management.commands.reconcile_callcentre_policy import first_review_repairs
        p = identity.build([lms()], [aptem()])
        case = CaseTicket.objects.create(source_type='learner_satisfaction', learner_email='learner@example.org',
              reason_key='future-first', due_at=timezone.now()+timedelta(days=10))
        self.assertEqual(first_review_repairs(p), [case.pk])
        case.next_followup_at = timezone.now()+timedelta(days=2)
        case.save()
        self.assertEqual(first_review_repairs(p), [])

    def test_employer_feedback_keeps_one_open_case_per_manager(self):
        from .learner_satisfaction import generate_employers
        from .models import CaseTicket
        p = identity.build([lms()], [aptem()])
        generate_employers(p)
        generate_employers(p)
        case = CaseTicket.objects.get(source_type='employer_feedback')
        self.assertEqual(case.learner_email, 'manager@example.org')
        self.assertIsNone(case.resolved_at)

    def test_direct_lms_booking_closes_only_exact_lecture_and_not_same_missed_session(self):
        from . import catchup
        from .models import CaseTicket
        people = identity.build([lms()], [aptem()])
        day = (timezone.now()-timedelta(days=8)).date()
        ticket = CaseTicket.objects.create(source_type='attendance', learner_email='learner@example.org',
            due_at=timezone.now(), reason_key='external-booking', overdue_since=day,
            source_data={'module': 'Lecture'})
        register = {'key': 'register-one', 'Email': 'learner@example.org', 'date': day, 'module': 'Lecture'}
        report = {'report_id': 4, 'attendance_id': lms_booking.kbc_report_id('register-one'),
                  'report_email': 'learner@example.org', 'id': 22, 'event_key': 'booked-in-lms',
                  'learner_id': 1, 'learner_email': 'learner@example.org', 'scheduled_date': day,
                  'scheduled_time': timezone.now().time(), 'owner_name': 'Coach', 'meeting_link': ''}
        with patch('callcentre.catchup.rows', side_effect=[[register], [{**report, 'learner_id': 999}]]):
            self.assertEqual(catchup.adopt_lms_bookings(people), 0)
        with patch('callcentre.catchup.rows', side_effect=[[register], [report]]):
            self.assertEqual(catchup.adopt_lms_bookings(people), 1)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'resolved')
        self.assertEqual(ticket.source_data['catchup_booking']['event_key'], 'booked-in-lms')
        followup = CaseTicket.objects.create(source_type='attendance', learner_email='learner@example.org',
            due_at=timezone.now(), reason_key='followup-external', overdue_since=day,
            source_data={'module': 'Lecture', 'catchup_no_show': {'event_key': 'booked-in-lms'}})
        with patch('callcentre.catchup.rows', side_effect=[[register], [report]]):
            self.assertEqual(catchup.adopt_lms_bookings(people), 0)
        followup.refresh_from_db()
        self.assertEqual(followup.status, 'new')

    def test_catchup_no_show_creates_new_case_once_and_keeps_history(self):
        from . import catchup
        from .models import CaseTicket
        from .services import event
        people = identity.build([lms()], [aptem()])
        original = CaseTicket.objects.create(source_type='attendance', learner_email='learner@example.org',
            due_at=timezone.now(), reason_key='booked-absence', status='pending_verification',
            overdue_since=(timezone.now()-timedelta(days=10)).date(),
            source_data={'module': 'Original lecture', 'catchup_booking': {'event_key': 'catchup-one'}})
        event(original, 'session_booked', {'event_key': 'catchup-one'})
        proof = {'event_key': 'catchup-one', 'calendar_id': 22, 'attendance_ids': [33]}
        with patch('callcentre.catchup.confirmed_absence', return_value=proof), \
                patch('callcentre.catchup.adopt_lms_bookings', return_value=0):
            self.assertEqual(catchup.sync(people), {'closed': 1, 'created': 1})
            self.assertEqual(catchup.sync(people), {'closed': 0, 'created': 0})
        original.refresh_from_db()
        self.assertEqual(original.status, 'resolved')
        followup = CaseTicket.objects.exclude(pk=original.pk).get()
        self.assertEqual(followup.status, 'new')
        self.assertEqual(followup.source_data['previous_case_id'], original.pk)
        self.assertNotIn('catchup_booking', followup.source_data)
        self.assertIsNone(evidence.attendance_evidence(followup))
        # Completing the new task never resurrects it on the next cycle.
        followup.status = 'resolved'
        followup.save()
        with patch('callcentre.catchup.confirmed_absence', return_value=proof), \
                patch('callcentre.catchup.adopt_lms_bookings', return_value=0):
            self.assertEqual(catchup.sync(people)['created'], 0)
        followup.refresh_from_db()
        self.assertEqual(followup.status, 'resolved')

    def test_catchup_absence_requires_past_explicit_matching_learner_absence(self):
        from .catchup import confirmed_absence
        people = identity.build([lms()], [aptem()])
        person = people.resolve(email='learner@example.org')
        past = timezone.now()-timedelta(days=2)
        row = {'id': 22, 'learner_id': 1, 'learner_email': 'learner@example.org',
               'event_type': 'catch-up', 'status': 'completed', 'scheduled_date': past.date(),
               'scheduled_time': past.time(), 'duration_minutes': 60, 'attendance_id': 33,
               'participant_email': 'learner@example.org', 'attended': False, 'attendance_status': 'absent'}
        def check(records):
            return confirmed_absence('one', people, person, read=lambda *args: records)
        self.assertIsNotNone(check([row]))
        for changed in ({'attendance_status': 'pending'}, {'attended': True}, {'status': 'cancelled'},
                        {'learner_id': 999}, {'participant_email': 'coach@example.org'},
                        {'scheduled_date': (timezone.now()+timedelta(days=2)).date()}):
            with self.subTest(changed=changed):
                self.assertIsNone(check([{**row, **changed}]))
        self.assertIsNone(check([]))
        self.assertIsNone(check([row, {**row, 'attended': True}]))

    def test_only_verified_previous_no_show_allows_rebooking(self):
        report = {'event_status': 'completed', 'status': 'approved', 'catchup_event_key': 'previous',
                  'scheduled_date': None, 'scheduled_time': None}
        from .services import Conflict
        with patch('callcentre.lms_booking._existing_report', return_value=report), \
                patch('callcentre.lms_booking._missed_previous_catchup', return_value=False):
            with self.assertRaises(Conflict):
                lms_booking.check_lecture_free(MagicMock(), {})
        with patch('callcentre.lms_booking._existing_report', return_value=report), \
                patch('callcentre.lms_booking._missed_previous_catchup', return_value=True):
            self.assertEqual(lms_booking.check_lecture_free(MagicMock(), {}), report)

    def test_employer_call_intent_cannot_claim_a_learner_with_same_email(self):
        from django.contrib.auth import get_user_model
        from .models import Agent, CaseTicket
        from .services import create_intent
        user = get_user_model().objects.create(username='operator')
        agent = Agent.objects.create(user=user, display_name='Operator', zoom_email='operator@example.org', zoom_account='student')
        now = timezone.now()
        employer = CaseTicket.objects.create(source_type='employer_feedback', learner_email='shared@example.org',
                                             learner_phone='+447700900123', due_at=now, reason_key='manager-quarter')
        learner = CaseTicket.objects.create(source_type='attendance', learner_email='shared@example.org',
                                            learner_phone='+447700900123', due_at=now, reason_key='student-absence')
        with patch('callcentre.services.owners', return_value={}), patch('callcentre.sources.on_break_emails', return_value=set()), \
                patch('callcentre.sources.active_case_contacts', return_value=Q()):
            intent = create_intent(employer.pk, agent)
        self.assertEqual(list(intent.tickets.values_list('pk', flat=True)), [employer.pk])
        learner.refresh_from_db()
        self.assertIsNone(learner.claimed_by_id)

    def test_booking_view_closes_catchup_even_with_link_warning(self):
        import json
        from django.test import RequestFactory
        from django.contrib.auth import get_user_model
        from .models import CaseTicket
        from .views import booking
        now = timezone.now()
        user = get_user_model().objects.create(username='manager', is_staff=True, is_superuser=True)
        case = CaseTicket.objects.create(source_type='attendance', learner_email='learner@example.org',
                                         due_at=now, reason_key='absence')
        request = RequestFactory().post('/booking/', json.dumps({'session_type': 'catch-up',
            'start': (now+timedelta(days=1)).isoformat(), 'request_id': 'test-booking-123'}), content_type='application/json')
        request.user = user
        request._dont_enforce_csrf_checks = True
        result = {'event_key': 'test-event', 'start': now+timedelta(days=1), 'coach': 'Coach',
                  'join_url': 'https://example.org/meeting', 'report_id': None,
                  'link_warning': 'Register identity mismatch', 'replayed': False}
        with patch('callcentre.views.operating_agent', return_value=None), patch('callcentre.views.can_work'), \
                patch('callcentre.lms_booking.book', return_value=result):
            response = booking(request, case.pk)
        self.assertEqual(response.status_code, 201)
        case.refresh_from_db()
        self.assertEqual(case.status, 'resolved')
        self.assertIsNotNone(case.resolved_at)
        self.assertEqual(case.source_data['catchup_booking']['event_key'], 'test-event')
        # A successful replay repairs a request whose case update failed, and is idempotent.
        case.status = 'pending_verification'
        case.source_data['catchup_booking']['lms_report_id'] = 42
        case.save()
        with patch('callcentre.views.operating_agent', return_value=None), patch('callcentre.views.can_work'), \
                patch('callcentre.lms_booking.book', return_value={**result, 'replayed': True}):
            self.assertEqual(booking(request, case.pk).status_code, 201)
            self.assertEqual(booking(request, case.pk).status_code, 409)  # Already closed: no second booking.
        case.refresh_from_db()
        self.assertEqual(case.status, 'resolved')
        self.assertEqual(case.source_data['catchup_booking']['lms_report_id'], 42)
        self.assertEqual(case.events.filter(kind='session_booked').count(), 1)

    def test_failed_catchup_booking_does_not_close_case(self):
        import json
        from django.test import RequestFactory
        from django.contrib.auth import get_user_model
        from .models import CaseTicket
        from .views import booking
        user = get_user_model().objects.create(username='failed-booking-manager', is_staff=True, is_superuser=True)
        case = CaseTicket.objects.create(source_type='attendance', learner_email='learner@example.org',
                                         due_at=timezone.now(), reason_key='failed-booking')
        request = RequestFactory().post('/booking/', json.dumps({'session_type': 'catch-up',
            'start': (timezone.now()+timedelta(days=1)).isoformat(), 'request_id': 'failed-booking-123'}), content_type='application/json')
        request.user = user
        request._dont_enforce_csrf_checks = True
        with patch('callcentre.views.operating_agent', return_value=None), patch('callcentre.views.can_work'), \
                patch('callcentre.lms_booking.book', side_effect=lms_booking.Unavailable('Unavailable')):
            self.assertEqual(booking(request, case.pk).status_code, 503)
        case.refresh_from_db()
        self.assertEqual(case.status, 'new')
        self.assertIsNone(case.resolved_at)

    def test_booking_emails_the_learner_once_with_the_coach_and_time(self):
        import json
        from datetime import datetime
        from django.test import RequestFactory
        from django.contrib.auth import get_user_model
        from . import mailer
        from .models import CaseTicket, EmailDelivery
        from .rules import LONDON
        from .views import booking
        user = get_user_model().objects.create(username='confirm-manager', is_staff=True, is_superuser=True)
        case = CaseTicket.objects.create(source_type='otj', learner_email='alias@example.org', learner_name='Sam Learner',
                                         due_at=timezone.now(), reason_key='confirm-booking')
        start = datetime(2026, 10, 27, 14, 0, tzinfo=LONDON)
        request = RequestFactory().post('/booking/', json.dumps({'session_type': 'student-support',
            'start': start.isoformat(), 'request_id': 'confirm-booking-1'}), content_type='application/json')
        request.user = user
        request._dont_enforce_csrf_checks = True
        result = {'event_key': 'student-support:1:1:2026-10-27', 'start': start, 'coach': 'Casey Coach',
                  'join_url': 'https://teams.example.org/join', 'report_id': None, 'link_warning': '',
                  'learner_name': 'Sam Learner', 'learner_email': 'Sam@Example.org', 'replayed': False}
        live = {'email_mode': 'live'}
        with patch('callcentre.views.operating_agent', return_value=None), patch('callcentre.views.can_work'), \
                patch('callcentre.lms_booking.book', return_value=result), \
                patch('callcentre.booking_email.email_settings.current', return_value=live), \
                patch('callcentre.booking_email.mailer.configured', return_value=True), \
                patch('callcentre.booking_email.mailer.send') as send:
            response = booking(request, case.pk)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(json.loads(response.content)['confirmation']['status'], 'accepted')
            # A replay of the same booking does not email the learner again.
            self.assertEqual(booking(request, case.pk).status_code, 201)
        send.assert_called_once()
        recipient, subject, html = send.call_args.args
        # The address the LMS booking (and its Teams invitation) used, not the case's alias.
        self.assertEqual(recipient, 'sam@example.org')
        self.assertEqual(subject, 'Your student support with Casey Coach is booked')
        self.assertIn('Tuesday 27 October 2026 at 14:00 (UK time)', html)
        self.assertIn('https://teams.example.org/join', html)
        delivery = EmailDelivery.objects.get(ticket=case)
        self.assertEqual((delivery.kind, delivery.status), ('booking_confirmation', 'accepted'))
        self.assertEqual(case.events.filter(kind='email_accepted', data__stage='booking_confirmation').count(), 1)

        # A mail failure is recorded, and the booking still reports as made.
        other = CaseTicket.objects.create(source_type='otj', learner_email='other@example.org',
                                          due_at=timezone.now(), reason_key='confirm-booking-failed')
        with patch('callcentre.views.operating_agent', return_value=None), patch('callcentre.views.can_work'), \
                patch('callcentre.lms_booking.book', return_value={**result, 'event_key': 'student-support:1:2:2026-10-27'}), \
                patch('callcentre.booking_email.email_settings.current', return_value=live), \
                patch('callcentre.booking_email.mailer.configured', return_value=True), \
                patch('callcentre.booking_email.mailer.send', side_effect=mailer.MailError('refused')):
            response = booking(request, other.pk)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(json.loads(response.content)['confirmation']['status'], 'failed')
        self.assertEqual(other.events.filter(kind='session_booked').count(), 1)

    def test_satisfaction_refresh_keeps_case_and_cycle_when_email_changes(self):
        from .learner_satisfaction import generate
        from .models import CaseTicket
        p = identity.build([lms()], [aptem()])
        generate(p)
        case = CaseTicket.objects.get(source_type='learner_satisfaction')
        initial_due = case.due_at
        p2 = identity.build([lms(Email='new@example.org')], [aptem()])
        self.assertEqual(generate(p2)['created'], 0)
        self.assertEqual(generate(p2)['created'], 0)
        case.refresh_from_db()
        self.assertEqual(CaseTicket.objects.count(), 1)
        self.assertEqual(case.due_at, initial_due)
        self.assertEqual(case.learner_email, 'new@example.org')

    def test_employer_contact_lists_learners_and_manager_phone(self):
        from .learner_satisfaction import generate_employers
        from .models import CaseTicket
        p = identity.build([], [aptem(OwnerName='Coach A', **{'Manager Phone': '07700900123'}),
                                aptem(ID=11, Email='second@example.org', OwnerName='Coach B', **{'Manager Phone': '07700900123'})])
        generate_employers(p)
        generate_employers(p)
        case = CaseTicket.objects.get(source_type='employer_feedback')
        self.assertEqual(case.learner_phone, '+447700900123')
        self.assertEqual({r['email'] for r in case.source_data['learners']}, {'learner@example.org', 'second@example.org'})

    def test_unverified_historical_employer_keeps_history_but_cannot_be_contacted(self):
        from .learner_satisfaction import generate_employers
        from .models import CaseTicket
        old = CaseTicket.objects.create(source_type='employer_feedback', learner_email='former@example.org',
                                        manager_email='former@example.org', due_at=timezone.now(), reason_key='old-manager')
        generate_employers(identity.build([lms()], [aptem()]))
        old.refresh_from_db()
        self.assertFalse(old.source_data['eligible'])
        self.assertNotEqual(old.status, 'resolved')
        self.assertIsNone(old.resolved_at)
        self.assertFalse(CaseTicket.objects.open().filter(pk=old.pk).exists())

    def test_historical_case_key_survives_alias_change(self):
        from .models import CaseTicket
        p = identity.build([lms(Email='new@example.org')], [aptem()])
        profile = dict(p['new@example.org'], learner_email='learner@example.org')
        original, _ = sources.upsert_case('otj', profile, 'source:10')
        refreshed, created = sources.upsert_case('otj', p['new@example.org'], 'source:10', person=p.resolve('lms', 1))
        self.assertFalse(created)
        self.assertEqual(refreshed.pk, original.pk)
        self.assertEqual(CaseTicket.objects.count(), 1)

    def test_contact_refresh_is_idempotent_and_preserves_resolved_history(self):
        from .models import CaseTicket, TicketEvent
        now = timezone.now()
        active = CaseTicket.objects.create(source_type='otj', learner_email='learner@example.org',
                                           learner_phone='', due_at=now, reason_key='active')
        closed = CaseTicket.objects.create(source_type='otj', learner_email='learner@example.org',
                                           learner_phone='historical-phone', due_at=now, reason_key='history', status='resolved')
        p = identity.build([lms()], [aptem(**{'Learner Phone': '07700900123'})])
        self.assertEqual(sources.refresh_contacts(p), 1)
        self.assertEqual(sources.refresh_contacts(p), 0)
        active.refresh_from_db()
        closed.refresh_from_db()
        self.assertEqual(active.learner_phone, '+447700900123')
        self.assertEqual(closed.learner_phone, 'historical-phone')
        audit = TicketEvent.objects.get(kind='identity_contacts_refreshed')
        self.assertEqual(audit.data['previous_contact']['learner_phone'], '')

    def test_incomplete_snapshot_cannot_retire_cases(self):
        from .learner_satisfaction import generate
        from .models import CaseTicket
        generate(identity.build([lms()], [aptem()]))
        broken = identity.build([lms(aptem_id=999)], [aptem()])
        self.assertIn('skipped', generate(broken))
        self.assertTrue(CaseTicket.objects.get().source_data['eligible'])
