"""Incoming calls: missed call-backs and enquiries, and answered calls from learners counted as contact.

Run with ``python check_isolated_tests.py callcentre.test_inbound`` (in-memory SQLite only).
"""
import unittest
import uuid
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db import connections
from django.db.models import Q
from django.test import TestCase
from django.utils import timezone

from .models import Agent, Allocation, CallIntent, CaseTicket, CycleState, Inbound, TicketEvent, ZoomPhoneCall
from .test_call_flow import Directory, zoom_accounts

LINE = '+441622958955'
ANN = '+447700900001'


class InboundBase(TestCase):
    """Alice has her own number (LINE); Ann is a learner with a case; Bob has no number."""
    databases = {'default', 'login_db'}

    def setUp(self):
        patches = [mock.patch('callcentre.sources.cached_directory', return_value=Directory()),
                   mock.patch('callcentre.sources.on_break_emails', return_value=frozenset()),
                   mock.patch('callcentre.sources.active_case_contacts', return_value=Q())]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        zoom_accounts(('student', 'Student', 'account'))
        users = get_user_model().objects
        self.alice = Agent.objects.create(user=users.create_user('alice'), display_name='Alice', zoom_email='alice@kbc.test',
                                          zoom_account='student', zoom_phone_number=LINE)
        self.bob = Agent.objects.create(user=users.create_user('bob'), display_name='Bob', zoom_email='bob@kbc.test', zoom_account='student')
        self.director = users.create_user('director', is_superuser=True)
        CycleState.objects.create(name='caller_directory', details={
            ANN: {'name': 'Ann Smith', 'email': 'ann@x.test', 'role': 'learner'},
            '+447700900009': {'name': 'Mo Manager', 'email': 'mo@employer.test', 'role': 'line_manager'}})
        self.ann = CaseTicket.objects.create(source_type='epa', reason_key='epa:ann', learner_email='ann@x.test', learner_name='Ann Smith',
                                             learner_phone=ANN, due_at=timezone.now() + timedelta(days=2))
        CaseTicket.objects.filter(pk=self.ann.pk).update(created_at=timezone.now() - timedelta(days=1))

    def call(self, direction, number, result, minutes_ago=30, **fields):
        ends = {'caller_number': number, 'callee_number': LINE} if direction == 'inbound' else {'caller_number': LINE, 'callee_number': number}
        return ZoomPhoneCall.objects.create(**{
            'source_account': 'student', 'zoom_account_id': 'account', 'history_id': str(uuid.uuid4()), 'direction': direction,
            'started_at': timezone.now() - timedelta(minutes=minutes_ago), 'ended_at': timezone.now() - timedelta(minutes=minutes_ago - 1),
            'result': result, **ends, **fields})

    def sync(self):
        from .inbound import sync
        return sync()


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class InboundTests(InboundBase):

    def test_missed_calls_become_call_backs_or_enquiries_and_internal_or_hidden_ones_are_skipped(self):
        self.call('inbound', ANN, 'no_answer')
        self.call('inbound', '+447700900009', 'voicemail')   # a line manager we know
        self.call('inbound', '+447911000111', 'other')        # hung up while ringing: someone asking about a course
        self.call('inbound', '', 'no_answer')                 # number withheld
        self.call('inbound', LINE, 'no_answer')               # the team's own line
        self.call('inbound', ANN, 'answered')                 # answered: nothing to follow up
        self.sync()
        rows = {item.caller_number: item for item in Inbound.objects.all()}
        self.assertEqual(set(rows), {ANN, '+447700900009', '+447911000111'})
        self.assertEqual((rows[ANN].kind, rows[ANN].caller_email, rows[ANN].agent_id), ('callback', 'ann@x.test', self.alice.pk))
        self.assertEqual((rows['+447700900009'].kind, rows['+447700900009'].caller_role), ('callback', 'line_manager'))
        self.assertEqual(rows['+447911000111'].kind, 'enquiry')
        self.sync()
        self.assertEqual(Inbound.objects.count(), 3)   # each missed call once

    def test_a_call_back_is_done_when_the_number_is_called_back_and_shows_how_long_it_took(self):
        self.call('inbound', ANN, 'no_answer', minutes_ago=90)
        self.sync()
        self.call('outbound', '07700900001', 'no_answer', minutes_ago=40)   # Zoom wrote the national form
        self.sync()
        item = Inbound.objects.get()
        self.assertEqual((item.status, item.done_how), ('done', 'called_back'))
        from .inbound import listing
        summary = listing(self.director, None, 'callback', 'done', 7)['summary']
        self.assertEqual((summary['done'], summary['median_minutes'], summary['within_hour']), (1, 50, 1))

    def test_a_caller_who_gets_through_later_closes_their_missed_call(self):
        self.call('inbound', '+447911000111', 'no_answer', minutes_ago=90)
        self.sync()
        self.call('inbound', '+447911000111', 'answered', minutes_ago=20)
        self.sync()
        self.assertEqual(Inbound.objects.get().done_how, 'got_through')

    def test_a_learner_waiting_for_a_call_back_goes_to_the_top_of_the_list(self):
        from .views import rank, with_callbacks
        other = CaseTicket.objects.create(source_type='epa', reason_key='epa:zed', learner_email='zed@x.test', learner_name='Zed',
                                          learner_phone='+447700900002', due_at=timezone.now() - timedelta(days=5), risk='red')
        self.call('inbound', ANN, 'no_answer')
        self.sync()
        now = timezone.now()
        ann, zed = with_callbacks([CaseTicket.objects.get(pk=self.ann.pk), other])
        self.assertTrue(ann.called_back_at)
        self.assertGreater(rank(ann, now), rank(zed, now))

    def test_who_sees_what_and_only_a_director_gives_out_enquiries(self):
        from .inbound import change, listing
        Allocation.objects.create(learner_email='ann@x.test', agent=self.bob, updated_by='director')
        self.call('inbound', ANN, 'no_answer')
        self.call('inbound', '+447911000111', 'no_answer')
        self.sync()
        enquiry = Inbound.objects.get(kind='enquiry')
        # Ann is Bob's learner, though she rang Alice's number.
        self.assertEqual(len(listing(self.bob.user, self.bob, 'callback', 'open', 7)['items']), 1)
        self.assertEqual(listing(self.alice.user, self.alice, 'callback', 'open', 7)['items'], [])
        self.assertEqual(listing(self.alice.user, self.alice, 'enquiry', 'open', 7)['items'], [])
        # A director looking at one specialist sees what is on that specialist's desk.
        self.assertEqual(len(listing(self.director, None, 'callback', 'open', 7, of_agent=self.bob)['items']), 1)
        self.assertEqual(listing(self.director, None, 'callback', 'open', 7, of_agent=self.alice)['items'], [])
        with self.assertRaises(PermissionDenied):
            change(enquiry.pk, self.alice.user, self.alice, 'assign', assign_to=self.alice.pk)
        change(enquiry.pk, self.director, None, 'assign', assign_to=self.alice.pk)
        self.assertEqual(len(listing(self.alice.user, self.alice, 'enquiry', 'open', 7)['items']), 1)
        with self.assertRaisesMessage(ValueError, 'Say what happened'):
            change(enquiry.pk, self.alice.user, self.alice, 'done')
        change(enquiry.pk, self.alice.user, self.alice, 'done', note='Sent the course details by email')
        self.assertEqual(Inbound.objects.get(pk=enquiry.pk).done_by, 'Alice')

    def test_an_answered_call_from_a_learner_counts_as_a_call_and_its_outcome_is_saved_as_usual(self):
        from .services import open_call, save_call
        call = self.call('inbound', ANN, 'answered', minutes_ago=6, duration_seconds=240)
        self.sync()
        intent = CallIntent.objects.get(matched_call=call)
        self.assertEqual((intent.agent_id, list(intent.tickets.values_list('pk', flat=True))), (self.alice.pk, [self.ann.pk]))
        self.assertTrue(TicketEvent.objects.filter(ticket=self.ann, kind='inbound_call').exists())
        self.assertEqual(open_call(self.ann, self.alice), {'ticket_ids': [self.ann.pk]})   # the after-call form
        self.assertTrue(save_call(self.ann.pk, self.alice.user, [{'id': self.ann.pk, 'outcome': 'reached', 'option': 'epa_step'}]))
        self.assertEqual(CaseTicket.objects.get(pk=self.ann.pk).status, 'pending_verification')

    def test_an_answered_call_is_not_counted_as_a_call_made(self):
        from .reports import performance
        self.call('inbound', ANN, 'answered', minutes_ago=6, duration_seconds=240)
        self.sync()
        today = timezone.localdate()
        row = next(item for item in performance(today, today)['agents'] if item['id'] == self.alice.pk)
        self.assertEqual(row['calls'], 0)


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class ScorecardTests(InboundBase):
    """A specialist's week: calls, talk time (with learners who rang them), short "answered" calls, the after-call form,
    recordings Zoom did not keep, and the Monday email."""

    def made(self, result, seconds, minutes_ago=300, saved=False):
        from .models import CallMatch, CaseCall
        from .services import event
        call = self.call('outbound', ANN, result, minutes_ago=minutes_ago, duration_seconds=seconds)
        intent = CallIntent.objects.create(agent=self.alice, learner_email='ann@x.test', number=ANN, matched_call=call)
        intent.tickets.add(self.ann)
        CaseCall.objects.create(ticket=self.ann, match=CallMatch.objects.create(call=call, agent=self.alice, learner_email='ann@x.test'))
        if saved:
            event(self.ann, 'call_saved', {'intent_id': intent.pk}, self.alice)   # saved now, hours after the call ended
        return call

    def test_the_week_counts_calls_talk_time_short_answers_and_missing_recordings(self):
        from .scorecard import card, missing_recordings
        self.made('answered', 300, saved=True)
        self.made('answered', 6)               # 6 seconds: probably voicemail
        self.made('no_answer', 0)
        self.call('inbound', ANN, 'answered', minutes_ago=6, duration_seconds=120)
        self.sync()                            # Ann rang Alice: linked, counted as talk time
        now = timezone.now()
        item = card(self.alice, now - timedelta(days=1), now + timedelta(days=1), now)
        self.assertEqual((item['calls'], item['answered'], item['reach_rate'], item['short_answered']), (3, 2, 67, 1))
        self.assertEqual((item['talk_out_seconds'], item['talk_in_seconds'], item['incoming_answered']), (306, 120, 1))
        self.assertEqual(item['forms_saved'], 1)
        self.assertGreater(item['wrap_up_median_seconds'], 0)
        # The 300 s call ended hours ago and Zoom has no recording of it; the 6 s one is too short to expect one.
        self.assertEqual([row['duration_seconds'] for row in missing_recordings(now - timedelta(days=1), now)], [300])

    def test_transcripts_are_searched_and_a_specialist_finds_only_their_own_calls(self):
        from .models import ZoomPhoneRecording
        from .transcript_search import search
        call = self.made('answered', 300)
        ZoomPhoneRecording.objects.create(source_account='student', zoom_account_id='account', recording_id='r1', call_log_id=call.history_id,
                                          started_at=call.started_at, transcript_status='ready',
                                          transcript_text='We talked about the EPA gateway and her portfolio. EPA gateway is next month.')
        found = search('epa gateway', 30)
        self.assertEqual((len(found['results']), found['results'][0]['hits']), (1, 2))
        self.assertEqual(found['results'][0]['snippets'][0]['match'], 'EPA gateway')
        self.assertEqual(search('epa gateway', 30, agent=self.bob)['results'], [])
        with self.assertRaisesMessage(ValueError, 'at least 3'):
            search('ep', 30)


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class LiveCallTests(InboundBase):
    """Zoom's events as a call rings, connects and ends: who is on a call now, and with whom."""

    def event(self, name, caller, callee, **times):
        from .live_calls import record
        return record('student', name, {'object': {'call_id': 'c1', 'caller': caller, 'callee': callee, **times}})

    def test_a_call_shows_while_it_rings_and_talks_and_goes_when_it_ends(self):
        from .live_calls import current
        alice, ann = {'phone_number': LINE, 'user_id': 'u-alice'}, {'phone_number': ANN, 'name': 'ANN MOBILE'}
        self.event('phone.caller_ringing', alice, ann, ringing_start_time='2026-10-24T14:00:00Z')
        row, = current()
        self.assertEqual((row['agent'], row['state'], row['direction'], row['name'], row['case_id']), ('Alice', 'ringing', 'outbound', 'Ann Smith', self.ann.pk))
        self.event('phone.caller_connected', alice, ann)
        self.assertEqual(current(self.alice)[0]['state'], 'talking')
        self.assertEqual(current(self.bob), [])   # a specialist sees only their own
        self.event('phone.caller_ended', alice, ann)
        self.assertEqual(current(), [])

    def test_a_learner_ringing_in_pops_up_for_the_specialist_whose_number_they_rang(self):
        from .live_calls import current
        self.event('phone.callee_ringing', {'phone_number': ANN}, {'phone_number': LINE, 'user_id': 'someone'})
        row, = current(self.alice)
        self.assertEqual((row['direction'], row['name'], row['case_id']), ('inbound', 'Ann Smith', self.ann.pk))
        self.event('phone.callee_missed', {'phone_number': ANN}, {'phone_number': LINE})
        self.assertEqual(current(), [])

    def test_the_webhook_feeds_the_live_calls_and_only_a_finished_call_reads_the_call_history(self):
        import hashlib
        import hmac
        import json
        import time as clock
        from cryptography.fernet import Fernet
        from .cycle_requests import RECORDING_SYNC_REQUEST, call_sync_requested, requested
        from .live_calls import current
        from .zoom_accounts import add
        with mock.patch.dict('os.environ', {'ZOOM_SECRETS_KEY': Fernet.generate_key().decode()}):
            from .models import Setting
            Setting.objects.filter(key='zoom_accounts').delete()
            add({'label': 'Student', 'account_id': 'account', 'client_id': 'c', 'client_secret': 's', 'webhook_secret': 'tok_1'}, 'director')

            def send(event):
                body = json.dumps({'event': event, 'payload': {'object': {'call_id': 'c9', 'caller': {'phone_number': LINE, 'user_id': 'x'},
                                                                            'callee': {'phone_number': ANN}}}})
                stamp = str(int(clock.time()))
                signature = 'v0=' + hmac.new(b'tok_1', f'v0:{stamp}:{body}'.encode(), hashlib.sha256).hexdigest()
                return self.client.post('/api/zoom-webhook/student/', body, content_type='application/json',
                                        headers={'x-zm-request-timestamp': stamp, 'x-zm-signature': signature}).json()
            before = timezone.now() - timedelta(seconds=1)
            self.assertFalse(send('phone.caller_ringing')['queued'])
            self.assertEqual(len(current()), 1)
            self.assertFalse(call_sync_requested(before))
            self.assertTrue(send('phone.caller_ended')['queued'])
            self.assertEqual(current(), [])
            self.assertTrue(send('phone.recording_transcript_completed')['queued'])
            self.assertTrue(requested(RECORDING_SYNC_REQUEST, before))


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class ZoomWatchTests(InboundBase):
    """Each check compares the account's numbers with the last one and keeps what changed."""

    def number(self, **fields):
        return {'number': LINE, 'display_name': 'Alice line', 'status': 'normal', 'assignee': 'Alice', 'assignee_type': 'user', 'extension': '',
                'site': '', 'capability': [], 'listed': True, 'listed_account': 'student', 'specialists': ['Alice'],
                'recording': {'state': 'on', 'calls': 'all calls', 'transcription': True, 'reason': ''}, **fields}

    def test_owner_and_recording_changes_are_kept_and_the_ones_that_stop_matching_or_recording_are_serious(self):
        from .zoom_watch import check, recent
        with mock.patch('callcentre.zoom_accounts.numbers', return_value=[self.number()]):
            self.assertEqual(check(force=True), 0)   # the first check only remembers
        changed = self.number(assignee='Kent Business College', recording={'state': 'off', 'calls': '', 'transcription': None, 'reason': ''})
        with mock.patch('callcentre.zoom_accounts.numbers', return_value=[changed, self.number(number='+441622958000', listed=False)]):
            self.assertEqual(check(force=True), 3)
            self.assertIsNone(check())   # not again within the hour
        found = {change['what']: change['serious'] for change in recent()['changes']}
        self.assertEqual(found, {'now belongs to Kent Business College in Zoom (was Alice)': True,
                                 'automatic recording turned off': True, 'added to the account in Zoom': False})


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class VoicemailTests(InboundBase):
    """Voicemails from Zoom join the missed call they were left on, whichever arrives first, with Zoom's transcript."""

    def zoom(self, transcript='Hi, it is Ann, please call me back about my EPA.'):
        class Response:
            def close(self):
                pass

        class Client:
            def __init__(self, config):
                pass

            def _pages(self, path, keys, start, end):
                yield [{'id': 'vm1', 'call_history_id': 'h-ann', 'caller_number': ANN, 'callee_number': LINE,
                        'date_time': timezone.now().isoformat(), 'duration': 21, 'status': 'unread'}]

            def api_get(self, path):
                return Response()

            def _json(self, response):
                return {'transcription': {'content': transcript}}

            def close(self):
                pass
        return mock.patch.multiple('callcentre.zoom_phone', ZoomClient=Client, validate_config=lambda key: {'account_id': 'account'})

    def test_a_voicemail_read_before_its_call_is_one_follow_up_with_its_transcript(self):
        from .voicemails import sync
        with self.zoom():
            self.assertEqual(sync('student'), 1)
        item = Inbound.objects.get()
        self.assertEqual((item.kind, item.caller_email, item.agent_id, item.call_id), ('callback', 'ann@x.test', self.alice.pk, None))
        self.assertIn('EPA', item.voicemail.transcript_text)
        self.call('inbound', ANN, 'voicemail', history_id='h-ann')   # Zoom's call record arrives later
        self.sync()
        item = Inbound.objects.get()
        self.assertIsNotNone(item.call_id)

    def test_a_voicemail_read_after_its_missed_call_joins_that_follow_up(self):
        from .voicemails import sync
        self.call('inbound', ANN, 'voicemail', history_id='h-ann')
        self.sync()
        with self.zoom():
            sync('student')
        item = Inbound.objects.get()
        self.assertEqual(item.voicemail.voicemail_id, 'vm1')


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class PresenceAndRenameTests(InboundBase):

    def test_zooms_presence_event_sets_the_status_of_the_specialist_with_that_zoom_user(self):
        from .presence import current, record_event
        Agent.objects.filter(pk=self.alice.pk).update(zoom_user_id='u-alice')
        self.assertEqual(record_event('student', {'object': {'id': 'u-alice', 'presence_status': 'Do_Not_Disturb'}}), 1)
        self.assertEqual(current()['agents'][str(self.alice.pk)]['label'], 'Do not disturb')
        self.assertEqual(record_event('student', {'object': {'id': 'someone-else', 'presence_status': 'Away'}}), 0)

    def test_a_number_is_renamed_in_zoom_by_its_id_and_a_missing_scope_is_named(self):
        from .errors import FieldError
        from .zoom_accounts import rename_number
        from .zoom_phone import ZoomError

        class Response:
            def __init__(self, status, payload=None):
                self.status_code, self.ok, self.payload = status, status < 400, payload or {}

            def json(self):
                return self.payload

            def close(self):
                pass
        listed = Response(200, {'phone_numbers': [{'id': 'pn1', 'number': LINE}]})
        with mock.patch('callcentre.zoom_phone.validate_config', return_value={'account_id': 'a'}), \
                mock.patch('callcentre.zoom_phone.ZoomClient.api_get', return_value=listed), \
                mock.patch('callcentre.zoom_phone.ZoomClient.api', return_value=Response(204)) as sent:
            self.assertEqual(rename_number('student', LINE, '  KBC   Engagement '), 'KBC Engagement')
        self.assertEqual((sent.call_args.args, sent.call_args.kwargs['json']), (('PATCH', '/phone/numbers/pn1'), {'display_name': 'KBC Engagement'}))
        refused = Response(400, {'message': 'Invalid access token, does not contain scopes:[phone:update:number:admin].'})
        with mock.patch('callcentre.zoom_phone.validate_config', return_value={'account_id': 'a'}), \
                mock.patch('callcentre.zoom_phone.ZoomClient.api_get', return_value=listed), \
                mock.patch('callcentre.zoom_phone.ZoomClient.api', return_value=refused), \
                self.assertRaisesMessage(ZoomError, 'phone:update:number:admin'):
            rename_number('student', LINE, 'KBC')
        with self.assertRaises(FieldError):
            rename_number('student', LINE, '')
