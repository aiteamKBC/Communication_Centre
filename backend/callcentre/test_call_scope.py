"""Run with check_isolated_tests.py: in-memory databases and no external network."""
import json
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
from .zoom_views import zoom_call_recordings, zoom_call_report, zoom_recording_audio, zoom_recording_transcript


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
            patch('callcentre.zoom_accounts.stored', return_value=[
                {'key': 'student', 'label': 'Student', 'account_id': 'account', 'client_id': '', 'secret': ''},
                {'key': 'office', 'label': 'Office', 'account_id': 'office-account', 'client_id': '', 'secret': ''}]),
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

    def test_expired_future_and_wrong_number_intents_do_not_match(self):
        call = self.call()
        intent = self.intent()
        for moment in (call.started_at - timedelta(minutes=10, seconds=1), call.started_at + timedelta(seconds=1)):
            CallIntent.objects.filter(pk=intent.pk).update(created_at=moment)
            self.assertIsNone(match_call(call.pk))
        CallIntent.objects.filter(pk=intent.pk).update(created_at=call.started_at, number='+447700999999')
        self.assertIsNone(match_call(call.pk))

    def test_each_redial_is_matched_to_its_own_call_press_in_any_order(self):
        presses = [self.intent(), self.intent()]
        CallIntent.objects.filter(pk=presses[0].pk).update(created_at=self.now - timedelta(minutes=9))
        first = self.call(started_at=self.now - timedelta(minutes=8, seconds=40))
        second = self.call()   # the redial, after the second press
        # Zoom's history can bring the redial in first: it still takes its own press, and the first call the earlier one.
        self.assertEqual((match_call(second.pk).call_id, match_call(first.pk).call_id), (second.pk, first.pk))
        self.assertEqual([intent.matched_call_id for intent in CallIntent.objects.filter(pk__in=[p.pk for p in presses]).order_by('created_at')],
                         [first.pk, second.pk])

    def test_a_second_press_within_seconds_is_the_same_call_a_later_one_a_redial(self):
        first = create_intent(self.ticket.pk, self.agent)
        self.assertEqual(create_intent(self.ticket.pk, self.agent).pk, first.pk)   # a double click
        CallIntent.objects.filter(pk=first.pk).update(created_at=self.now - timedelta(seconds=31))
        self.assertNotEqual(create_intent(self.ticket.pk, self.agent).pk, first.pk)

    def test_shared_line_call_is_matched_to_the_specialist_who_pressed_call(self):
        Agent.objects.filter(pk=self.agent.pk).update(zoom_phone_number='+441622958989')
        tina = Agent.objects.create(user=get_user_model().objects.create_user('tina'), display_name='Tina',
                                    zoom_email='tina@test.test', zoom_account='student', zoom_phone_number='+441622958989')
        # Zoom reports the team line, not the specialist: no email and a user ID neither agent holds.
        shared = dict(caller_email='', caller_user_id='team-line', caller_number='+441622958989')
        self.intent(agent=tina)
        call = self.call(**shared)
        self.assertEqual(match_call(call.pk).agent_id, tina.pk)
        rows = {row['id']: row for row in performance(self.now.date(), self.now.date())['agents']}
        self.assertEqual((rows[tina.pk]['calls'], rows[tina.pk]['seconds']), (1, 120))
        self.assertEqual(rows[self.agent.pk]['calls'], 0)
        # Both specialists pressing Call for the same number leaves the call unmatched.
        self.intent(agent=tina)
        self.intent()
        self.assertIsNone(match_call(self.call(**shared).pk))
        # A line nobody is assigned to is never attributed.
        self.intent()
        self.assertIsNone(match_call(self.call(caller_email='', caller_number='+441622000000').pk))

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

    def test_a_recording_plays_from_zoom_and_nothing_is_kept(self):
        import io
        from .zoom_recordings import PLAYBACK_MAX_BYTES
        recording = self.recording(self.internal())
        self.user.is_superuser = True
        request = RequestFactory().get('/')
        request.user = self.user
        client = Mock()
        client.recording_pages.return_value = iter([[{'id': 'another', 'download_url': 'https://zoom.us/v2/phone/recording/download/x'},
                                                     {'id': recording.recording_id, 'download_url': 'https://zoom.us/v2/phone/recording/download/mine'}]])
        with patch('callcentre.zoom_phone.ZoomClient', return_value=client), patch('callcentre.zoom_phone.validate_config'),                 patch('callcentre.zoom_recordings.download_audio', return_value=(io.BytesIO(b'ID3-audio'), 'zoom-call.mp3', 'audio/mpeg')) as download:
            response = zoom_recording_audio(request, recording.pk)
        self.assertEqual((response.status_code, response['Content-Type']), (200, 'audio/mpeg'))
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(b''.join(response.streaming_content), b'ID3-audio')
        self.assertEqual(download.call_args.args[1], 'https://zoom.us/v2/phone/recording/download/mine')
        self.assertEqual(download.call_args.kwargs['limit'], PLAYBACK_MAX_BYTES)
        client.close.assert_called_once()
        # Gone from Zoom: said so, not an error page.
        client.recording_pages.return_value = iter([[]])
        with patch('callcentre.zoom_phone.ZoomClient', return_value=client), patch('callcentre.zoom_phone.validate_config'):
            gone = zoom_recording_audio(request, recording.pk)
        self.assertEqual(gone.status_code, 502)
        self.assertIn('no audio for this recording', json.loads(gone.content)['detail'])

    def test_full_case_history_has_every_call_of_the_learner_across_cases_with_recordings(self):
        from .contact_history import contact_cases, history
        older = self.case(status='resolved', source_type='mcm', source_data={'review_type': 'coaching'})
        call = self.internal()
        recording = self.recording(call)
        legacy_call, _ = self.legacy()   # dialled by hand, not from the system: not a system call
        self.user.is_superuser = True
        result = history(self.ticket, self.user, self.agent)
        self.assertEqual(result['cases'], 2)
        self.assertEqual([item['call_id'] for item in result['calls']], [call.pk])
        self.assertNotIn(legacy_call.pk, [item['call_id'] for item in result['calls']])
        self.assertEqual(result['calls'][0]['recordings'][0]['id'], recording.pk)
        self.assertEqual(result['calls'][0]['cases'][0]['id'], self.ticket.pk)
        self.assertTrue(all(event['case_label'] for event in result['events']))
        self.assertIn(older.pk, {pk for pk, _ in contact_cases(self.ticket)})   # closed cases count too
        self.assertEqual(result['missed_calls'], [])

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
