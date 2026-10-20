"""Run with check_isolated_tests.py: in-memory databases and no external network."""
import json
import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone as dt_timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.db import connections
from django.db.models import Q
from django.test import RequestFactory, TestCase, override_settings

from . import ai
from .call_scope import system_calls, system_recordings
from .cycle import match_calls
from .history import monthly_history
from .learner_satisfaction import close_without_feedback, complete
from .models import AIAnalysis, Agent, CallIntent, CallMatch, CaseCall, CaseTicket, CycleState, ZoomPhoneCall, ZoomPhoneRecording
from .reports import performance
from .services import apply_call_result, create_intent, match_call, record_outcome
from .views import with_last_call
from .zoom_recordings import sync_recordings
from .zoom_views import zoom_call_recordings, zoom_call_report, zoom_recording_transcript


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'In-memory SQLite runner only.')
@override_settings(ZOOM_REPORT_TIME_ZONE='Europe/London', ZOOM_AI_TRANSCRIPTS_PER_SYNC=10)
class SystemCallScopeTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        self.now = datetime(2026, 10, 20, 12, tzinfo=dt_timezone.utc)
        self.lower, self.upper = self.now.replace(hour=0), self.now + timedelta(days=1)
        for mocked in (
            patch('django.utils.timezone.now', return_value=self.now),
            patch('callcentre.services.allocated_owner', return_value=None),
            patch('callcentre.sources.on_break_emails', return_value=frozenset()),
            patch('callcentre.sources.active_case_contacts', return_value=Q()),
            patch.dict(os.environ, {'ZOOM_STUDENT_ACCOUNT_ID': 'account', 'ZOOM_OFFICE_ACCOUNT_ID': 'office-account'}),
        ):
            mocked.start()
            self.addCleanup(mocked.stop)
        self.user = get_user_model().objects.create_user('alice')
        self.agent = Agent.objects.create(user=self.user, display_name='Alice', zoom_email='alice@test.test', zoom_account='student')
        self.ticket = self.case()

    def case(self, **changes):
        values = dict(source_type='pr', reason_key=str(uuid.uuid4()), learner_name='Learner',
                      learner_email='learner@test.test', learner_phone='+447700900123', due_at=self.now,
                      source_data={'review_type': 'progress'})
        values.update(changes)
        ticket = CaseTicket.objects.create(**values)
        CaseTicket.objects.filter(pk=ticket.pk).update(created_at=self.now - timedelta(hours=2))
        ticket.refresh_from_db()
        return ticket

    def call(self, **changes):
        values = dict(source_account='student', zoom_account_id='account', history_id=str(uuid.uuid4()),
                      call_id=str(uuid.uuid4()), direction='outbound', caller_email=self.agent.zoom_email,
                      callee_number=self.ticket.learner_phone, started_at=self.now - timedelta(minutes=5),
                      ended_at=self.now - timedelta(minutes=3), duration_seconds=120, result='answered')
        values.update(changes)
        return ZoomPhoneCall.objects.create(**values)

    def intent(self, ticket=None, **changes):
        ticket = ticket or self.ticket
        values = dict(agent=self.agent, learner_email=ticket.learner_email, number=ticket.learner_phone)
        values.update(changes)
        intent = CallIntent.objects.create(**values)
        intent.tickets.add(ticket)
        CallIntent.objects.filter(pk=intent.pk).update(created_at=self.now - timedelta(minutes=6))
        return intent

    def internal(self, **changes):
        intent = self.intent()
        call = self.call(**changes)
        self.assertIsNotNone(match_call(call.pk))
        intent.refresh_from_db()
        self.assertEqual(intent.matched_call_id, call.pk)
        return call

    def legacy(self, **changes):
        call = self.call(**changes)
        match = CallMatch.objects.create(call=call, agent=self.agent, learner_email=self.ticket.learner_email, manual=True)
        CaseCall.objects.create(ticket=self.ticket, match=match, processed_result=call.result)
        return call, match

    def recording(self, call, **changes):
        values = dict(source_account=call.source_account, zoom_account_id=call.zoom_account_id,
                      recording_id=str(uuid.uuid4()), call_id=call.call_id, call_log_id=call.history_id,
                      started_at=call.started_at, transcript_status='ready', transcript_text='A conversation.')
        values.update(changes)
        return ZoomPhoneRecording.objects.create(**values)

    def test_external_dial_does_not_match_even_with_unique_directory_contact(self):
        CycleState.objects.create(name='phone_directory', last_success_at=self.now,
                                  details={self.ticket.learner_phone: [self.ticket.learner_email]})
        call = self.call()
        self.assertIsNone(match_call(call.pk))
        self.assertFalse(CallMatch.objects.exists())
        self.ticket.refresh_from_db()
        self.assertEqual((self.ticket.status, self.ticket.attempts), ('new', 0))

    def test_real_dial_request_is_verified_once_and_only_links_selected_cases(self):
        second = self.case(source_type='mcm')
        with patch('django.utils.timezone.now', return_value=self.now - timedelta(minutes=6)):
            intent = create_intent(self.ticket.pk, self.agent)
        call = self.call()
        match = match_call(call.pk)
        self.assertEqual(match_call(call.pk).pk, match.pk)
        self.assertFalse(match.manual)
        self.assertEqual(set(match.cases.values_list('ticket_id', flat=True)), {self.ticket.pk, second.pk})
        intent.refresh_from_db()
        self.assertEqual(intent.matched_call_id, call.pk)
        self.assertEqual(system_calls().count(), 1)

    def test_expired_future_wrong_number_and_ambiguous_intents_do_not_match(self):
        call = self.call()
        intent = self.intent()
        for moment in (call.started_at - timedelta(minutes=10, seconds=1), call.started_at + timedelta(seconds=1)):
            CallIntent.objects.filter(pk=intent.pk).update(created_at=moment)
            self.assertIsNone(match_call(call.pk))
        CallIntent.objects.filter(pk=intent.pk).update(created_at=call.started_at, number='+447700999999')
        self.assertIsNone(match_call(call.pk))
        CallIntent.objects.filter(pk=intent.pk).update(number=call.callee_number)
        self.intent()
        self.assertIsNone(match_call(call.pk))

    def test_one_call_covers_lectures_and_reviews_but_not_employer_or_future_callback(self):
        CaseTicket.objects.filter(pk=self.ticket.pk).update(source_data={'person_id': 'person-one', 'review_type': 'progress'})
        lecture = self.case(source_type='attendance', overdue_since=self.now.date() - timedelta(days=14),
                            source_data={'person_id': 'person-one', 'module': 'Risk management'})
        alias = self.case(source_type='mcm', learner_email='alias@test.test',
                          source_data={'person_id': 'person-one', 'review_type': 'monthly'})
        employer = self.case(source_type='employer_feedback', source_data={'person_id': 'person-one'})
        future = self.case(source_type='pr_missed', next_followup_at=self.now + timedelta(days=2))
        self.case(learner_email='another@test.test')
        with patch('django.utils.timezone.now', return_value=self.now - timedelta(minutes=6)):
            intent = create_intent(lecture.pk, self.agent)
        self.assertEqual(set(intent.tickets.values_list('pk', flat=True)), {self.ticket.pk, lecture.pk, alias.pk})
        match = match_call(self.call().pk)
        self.assertEqual(set(match.cases.values_list('ticket_id', flat=True)), {self.ticket.pk, lecture.pk, alias.pk})
        employer.refresh_from_db()
        future.refresh_from_db()
        self.assertIsNone(employer.claimed_by_id)
        self.assertIsNone(future.claimed_by_id)

    def test_case_detail_groups_all_open_categories_and_identity_aliases_only_for_learner(self):
        from .views import detail
        CaseTicket.objects.filter(pk=self.ticket.pk).update(source_data={'person_id': 'person-one', 'review_type': 'progress'})
        lecture = self.case(source_type='attendance', overdue_since=self.now.date() - timedelta(days=14),
                            source_data={'module': 'Risk management'})
        alias = self.case(source_type='mcm', learner_email='alias@test.test',
                          source_data={'person_id': 'person-one', 'review_type': 'monthly'})
        self.case(source_type='employer_feedback', source_data={'person_id': 'person-one'})
        self.case(source_type='epa', status='resolved')
        self.case(source_type='manual', archived=True)
        self.case(learner_email='another@test.test')
        request = RequestFactory().get('/detail/')
        request.user = self.user
        with patch('callcentre.views.refused', return_value=None), \
                patch('callcentre.views.booking_links', return_value={}), \
                patch('callcentre.views.add_lecture_times'):
            response = detail(request, self.ticket.pk)
        self.assertEqual(response.status_code, 200)
        issues = json.loads(response.content)['issues']
        self.assertEqual({i['id'] for i in issues}, {self.ticket.pk, lecture.pk, alias.pk})
        self.assertTrue(all('created_at' in i and 'next_followup_at' in i for i in issues))

    def test_wrong_agent_or_account_cannot_consume_intent(self):
        self.intent()
        for changes in ({'caller_email': 'someone@test.test'}, {'source_account': 'office', 'zoom_account_id': 'office-account'}):
            self.assertIsNone(match_call(self.call(**changes).pk))

    def test_progress_history_and_zoom_report_exclude_external_and_legacy_matches(self):
        internal = self.internal()
        self.call(duration_seconds=900)
        self.legacy(duration_seconds=600)
        row = performance(self.now.date(), self.now.date())['agents'][0]
        self.assertEqual((row['calls'], row['answered'], row['seconds']), (1, 1, 120))
        history = monthly_history(self.agent, self.lower, self.upper, self.now, 1)
        self.assertEqual((history['total'], history['summary']['seconds']), (1, 120))
        self.assertEqual(history['calls'][0]['id'], internal.pk)
        request = RequestFactory().get('/zoom/calls/')
        request.user = self.user
        with patch('callcentre.zoom_views.refused', return_value=None), patch('callcentre.zoom_views.contact_directory', return_value={}):
            response = zoom_call_report(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)['totals']['answered_duration_seconds'], 120)

    def test_pending_dial_request_without_verified_match_does_not_count(self):
        self.intent()
        self.call()
        self.assertEqual(system_calls().count(), 0)

    def test_nonmanual_flag_alone_and_wrong_intent_agent_do_not_qualify(self):
        call, match = self.legacy()
        match.manual = False
        match.save()
        self.assertEqual(system_calls().count(), 0)
        other = Agent.objects.create(user=get_user_model().objects.create_user('bob'), display_name='Bob',
                                     zoom_email='bob@test.test', zoom_account='student')
        self.intent(agent=other, matched_call=call)
        self.assertEqual(system_calls().count(), 0)

    def test_old_external_match_cannot_replay_or_close_ticket(self):
        call, match = self.legacy()
        self.assertIsNone(match_call(call.pk))
        apply_call_result(match)
        with self.assertRaisesMessage(ValueError, 'started from this system'):
            record_outcome(self.ticket.pk, self.user, call.pk, 'reached', 'book_pr')
        self.ticket.refresh_from_db()
        self.assertEqual((self.ticket.status, self.ticket.attempts), ('new', 0))
        self.assertFalse(self.ticket.events.exists())
        self.assertTrue(CallMatch.objects.filter(pk=match.pk).exists())

    def test_external_calls_cannot_complete_satisfaction_or_prove_attempt(self):
        CaseTicket.objects.filter(pk=self.ticket.pk).update(source_type='learner_satisfaction')
        self.legacy()
        with self.assertRaisesMessage(ValueError, 'answered, synced'):
            complete(self.ticket.pk, self.user, score=4, problem='None', action='No action needed',
                     note='Learner is happy with the programme.')
        with self.assertRaisesMessage(ValueError, 'Call them first'):
            close_without_feedback(self.ticket.pk, self.user, 'unreachable', 'Unable to reach learner.')

    def test_new_internal_result_ignores_old_external_attempts_and_last_call(self):
        self.legacy(result='no_answer', started_at=self.now - timedelta(minutes=1))
        call = self.internal(result='no_answer')
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.attempts, 1)
        self.assertEqual(self.ticket.last_contact_at, call.started_at)
        self.assertEqual(with_last_call(CaseTicket.objects.all()).get().last_call_result, 'no_answer')
        # A newer legacy result cannot replace the last eligible call shown in the desk.
        ZoomPhoneCall.objects.exclude(pk=call.pk).update(result='answered')
        CaseCall.objects.exclude(match__call=call).update(processed_result='answered')
        self.assertEqual(with_last_call(CaseTicket.objects.all()).get().last_call_result, 'no_answer')

    def test_cycle_only_processes_calls_with_pending_intent_or_verified_matches(self):
        external, _ = self.legacy(result='no_answer')
        CaseCall.objects.filter(match__call=external).update(processed_result='')
        self.call(callee_number='+447700999999')
        self.intent()
        internal = self.call()
        self.assertEqual(match_calls(), 1)
        self.assertEqual(list(system_calls().values_list('pk', flat=True)), [internal.pk])
        self.assertEqual(match_calls(), 0)

    def test_external_audio_is_not_analyzed_even_if_transcript_already_exists(self):
        external = self.recording(self.legacy()[0])
        with patch('callcentre.ai.ai_enabled', return_value=True), patch('callcentre.ai.requests.post') as post:
            self.assertIsNone(ai.analyze_recording(external))
        post.assert_not_called()
        self.assertFalse(AIAnalysis.objects.exists())

    def test_old_external_analysis_never_applies_or_appears_in_reviews(self):
        recording = self.recording(self.legacy()[0])
        analysis = AIAnalysis.objects.create(recording=recording, transcript_hash='old', model='old', state='ready',
                                            result={'summary': 'Close it', 'confidence': 1, 'outcome': 'resolved',
                                                    'chosen_option': 'book_pr', 'promised_date': None, 'call_rating': 'excellent'})
        ai.apply_analysis(analysis)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'new')
        self.assertFalse(self.ticket.events.exists())
        self.assertIsNone(ai.latest_review(recording))
        self.assertEqual(ai.call_reviews(self.lower, self.upper, [self.agent], all_calls=True)['calls'], [])
        self.assertTrue(AIAnalysis.objects.filter(pk=analysis.pk).exists())

    def test_recordings_require_unique_call_in_the_same_account(self):
        call = self.internal()
        good = self.recording(call)
        wrong_account = self.recording(call, zoom_account_id='other-account')
        self.assertEqual(list(system_recordings().values_list('pk', flat=True)), [good.pk])
        self.assertIsNone(ai.recording_match(wrong_account))
        # Ambiguous call IDs fail closed even when one of the two calls is eligible.
        self.call(call_id=call.call_id)
        self.assertFalse(system_recordings().exists())

    def test_ai_queue_only_analyzes_internal_recordings(self):
        good = self.recording(self.internal())
        self.recording(self.legacy()[0])
        def failed_analysis(recording):
            AIAnalysis.objects.create(recording=recording, transcript_hash='attempt', model='test', state='error')
        with patch('callcentre.ai.ai_enabled', return_value=True), patch('callcentre.ai.analyze_recording', side_effect=failed_analysis) as analyze:
            ai.process_ai()
        self.assertEqual([args.args[0].pk for args in analyze.call_args_list], [good.pk])

    def test_internal_analysis_still_suggests_resolution_without_auto_closing(self):
        recording = self.recording(self.internal())
        analysis = AIAnalysis.objects.create(recording=recording, transcript_hash='new', model='test', state='ready',
                                            result={'summary': 'Booking agreed', 'confidence': .9, 'outcome': 'resolved',
                                                    'chosen_option': 'book_pr', 'promised_date': None})
        ai.apply_analysis(analysis)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'ai_suggested_close')

    def test_transcription_queue_skips_external_audio_and_retries_after_matching(self):
        internal = self.internal()
        pending = self.call(started_at=self.now - timedelta(minutes=2))
        external = self.call(callee_number='+447700999999')
        good = self.recording(internal, transcript_status='pending', transcript_text='')
        later = self.recording(pending, transcript_status='pending', transcript_text='')
        outside = self.recording(external, transcript_status='pending', transcript_text='')
        client = Mock()
        client.recording_pages.return_value = []
        lease = Mock()
        lease.update.return_value = 1
        state = SimpleNamespace(recordings_covered_through=self.now.date())
        with patch('callcentre.zoom_recordings.ai_transcription_enabled', return_value=False), patch(
                'callcentre.zoom_recordings.fetch_transcript', return_value=('ready', 'Hello', {})) as fetch:
            sync_recordings(client, 'student', 'account', state, lease, self.now.date(), self.now.date())
            self.assertEqual([args.args[1] for args in fetch.call_args_list], [good.recording_id])
            self.intent()
            self.assertIsNotNone(match_call(pending.pk))
            fetch.reset_mock()
            sync_recordings(client, 'student', 'account', state, lease, self.now.date(), self.now.date())
            self.assertEqual([args.args[1] for args in fetch.call_args_list], [later.recording_id])
        outside.refresh_from_db()
        self.assertEqual((outside.transcript_status, outside.transcript_text), ('pending', ''))

    def test_external_recordings_and_transcripts_are_not_exposed_even_to_manager(self):
        call, _ = self.legacy()
        recording = self.recording(call)
        self.user.is_superuser = True
        request = RequestFactory().get('/')
        request.user = self.user
        self.assertEqual(zoom_call_recordings(request, call.pk).status_code, 404)
        self.assertEqual(zoom_recording_transcript(request, recording.pk).status_code, 404)

    def test_audio_fallback_only_downloads_internal_recording(self):
        call = self.internal()
        external = self.call(callee_number='+447700999999')
        good = self.recording(call, transcript_status='unavailable', transcript_text='')
        outside = self.recording(external, transcript_status='unavailable', transcript_text='')
        rows = [
            {'id': recording.recording_id, 'call_id': recording.call_id, 'call_log_id': recording.call_log_id,
             'date_time': recording.started_at.isoformat(), 'download_url': f'https://example.test/{recording.pk}'}
            for recording in (good, outside)
        ]
        client = Mock()
        client.recording_pages.return_value = [rows]
        lease = Mock()
        lease.update.return_value = 1
        with patch('callcentre.zoom_recordings.ai_transcription_enabled', return_value=True), patch(
                'callcentre.zoom_recordings.fetch_transcript', return_value=('unavailable', '', {})), patch(
                'callcentre.zoom_recordings.fetch_ai_transcript', return_value=('ready', 'Hello', {})) as audio:
            sync_recordings(client, 'student', 'account', SimpleNamespace(recordings_covered_through=self.now.date()),
                            lease, self.now.date(), self.now.date())
        audio.assert_called_once_with(client, f'https://example.test/{good.pk}')
        outside.refresh_from_db()
        self.assertEqual(outside.transcript_text, '')
