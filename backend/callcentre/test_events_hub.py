"""The Events hub on the Engagement Centre (events_hub.py, events_views.py): the worker's sync, the Today page's event
calls, the director's panel and the one-time entry pass."""
import io
import json
from datetime import datetime, timedelta, timezone as dt_timezone
from types import SimpleNamespace
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import requests
from django.core import signing
from django.db.models import Q
from django.test import RequestFactory, SimpleTestCase, override_settings

from . import events_hub, events_views
from .access import AGENT_GROUP, DIRECTOR_GROUP

URL = 'https://events.example.test'
KEY = 'test-integration-key'
SECRET = 'test-entry-secret'


def member_of(*names):
    def matching(name=None, name__in=()):
        found = [item for item in names if item == name or item in name__in]
        return mock.Mock(exists=mock.Mock(return_value=bool(found)), values_list=mock.Mock(return_value=found))
    groups = mock.Mock()
    groups.using.return_value.filter.side_effect = matching
    return groups


def user(*groups, pk=7, email='Alex@Example.test', superuser=False):
    return SimpleNamespace(pk=pk, email=email, is_authenticated=True, is_active=True, is_staff=False, is_superuser=superuser,
                           groups=member_of(*groups), get_full_name=lambda: 'Alex Agent', get_username=lambda: 'alex')


def agent(user_id, email='', zoom_email='', name='Specialist', line=''):
    return SimpleNamespace(user_id=user_id, user=SimpleNamespace(email=email, get_full_name=lambda: '', get_username=lambda: 'u'),
                           zoom_email=zoom_email, display_name=name, zoom_phone_number=line)


def response(status=200, data=None):
    return mock.Mock(status_code=status, json=mock.Mock(return_value=data if data is not None else {}))


def no_profile():
    return mock.patch.object(events_hub.Agent.objects, 'filter', return_value=mock.Mock(first=mock.Mock(return_value=None)))


@override_settings(EVENTS_API_URL=URL, EVENTS_INTEGRATION_KEY=KEY)
class SyncTests(SimpleTestCase):
    def setUp(self):
        patcher = mock.patch.object(events_hub, 'active_agents', return_value=[{'id': 7, 'email': 'a@example.test', 'name': 'A'}])
        patcher.start()
        self.addCleanup(patcher.stop)

    @override_settings(EVENTS_API_URL='')
    def test_switched_off_without_the_address(self):
        with mock.patch('callcentre.events_hub.requests.request') as send:
            self.assertIsNone(events_hub.sync())
        send.assert_not_called()

    @override_settings(EVENTS_INTEGRATION_KEY='')
    def test_switched_off_without_the_key(self):
        with mock.patch('callcentre.events_hub.requests.request') as send:
            self.assertIsNone(events_hub.sync())
        send.assert_not_called()

    def test_sends_the_agents_with_the_key_and_returns_the_summary(self):
        summary = {'agents_synced': 1, 'intake': {'bookings_upserted': 3}, 'dials': []}
        with mock.patch('callcentre.events_hub.requests.request', return_value=response(data=summary)) as send:
            self.assertEqual(events_hub.sync(), {'agents_synced': 1, 'intake': {'bookings_upserted': 3},
                                                 'calls': {'asked': 0, 'matched': 0, 'unmatched': 0}})
        self.assertEqual(send.call_count, 1)   # nothing to match, nothing posted back
        args, kwargs = send.call_args
        self.assertEqual(args, ('POST', URL + '/api/v1/integration/sync/'))
        self.assertEqual(kwargs['json'], {'agents': [{'id': 7, 'email': 'a@example.test', 'name': 'A'}]})
        self.assertEqual(kwargs['headers']['X-Integration-Key'], KEY)
        self.assertFalse(kwargs['allow_redirects'])

    def test_matched_dials_go_back_to_events_and_only_counts_stay_in_the_cycle(self):
        dials = [{'id': 'd1', 'cc_user_id': 7, 'number': '+447123456780', 'dialled_at': '2026-11-03T10:00:00+00:00', 'status': 'pending'}]
        results = [{'id': 'd1', 'status': 'matched', 'cc_call_id': 5}]
        with mock.patch.object(events_hub, 'match_dials', return_value=results) as match, \
                mock.patch('callcentre.events_hub.requests.request', side_effect=[response(data={'dials': dials}), response(data={'applied': 1})]) as send:
            summary = events_hub.sync()
        match.assert_called_once_with(dials)
        self.assertEqual(send.call_args_list[1].args, ('POST', URL + '/api/v1/integration/calls/'))
        self.assertEqual(send.call_args_list[1].kwargs['json'], {'calls': results})
        self.assertEqual(summary, {'calls': {'asked': 1, 'matched': 1, 'unmatched': 0}})
        self.assertNotIn('+447123456780', json.dumps(summary))

    def test_unreachable_or_refusing_hub_fails_the_step_without_the_key(self):
        cases = [mock.patch('callcentre.events_hub.requests.request', side_effect=requests.ConnectionError('down')),
                 mock.patch('callcentre.events_hub.requests.request', return_value=response(500, {'intake': 'failed'}))]
        for case in cases:
            with case, self.assertRaises(events_hub.EventsHubError) as raised:
                events_hub.sync()
            self.assertNotIn(KEY, str(raised.exception))


class ActiveAgentsTests(SimpleTestCase):
    def test_uses_the_account_email_then_the_zoom_email_and_skips_agents_without_one(self):
        rows = [agent(1, email='Account@Example.test', zoom_email='zoom1@example.test', name='One', line='01622 958955'),
                agent(2, zoom_email='Zoom2@Example.test', name='Two'),
                agent(3, name='No email')]
        query = mock.Mock()
        query.select_related.return_value.order_by.return_value = rows
        with mock.patch.object(events_hub.Agent.objects, 'filter', return_value=query) as filter_:
            self.assertEqual(events_hub.active_agents(), [
                {'id': 1, 'email': 'account@example.test', 'name': 'One', 'zoom_phone_number': '+441622958955'},
                {'id': 2, 'email': 'zoom2@example.test', 'name': 'Two', 'zoom_phone_number': ''},
            ])
        filter_.assert_called_once_with(active=True, user__is_active=True)


@override_settings(EVENTS_API_URL=URL, EVENTS_ENTRY_SECRET=SECRET)
class EntryPassTests(SimpleTestCase):
    """The pass must be exactly what Events accepts (backend/accounts/entry.py there)."""

    def read(self, url):
        parts = urlsplit(url)
        self.assertEqual(f'{parts.scheme}://{parts.netloc}{parts.path}', URL + '/api/v1/auth/enter/')
        return signing.loads(parse_qs(parts.query)['pass'][0], key=SECRET, salt='kbc.events.entry', max_age=60)

    def test_a_specialist_enters_as_an_agent_with_their_profile_name(self):
        profile = SimpleNamespace(zoom_email='zoom@example.test', display_name='Alex From Profile')
        with mock.patch.object(events_hub.Agent.objects, 'filter', return_value=mock.Mock(first=mock.Mock(return_value=profile))):
            data = self.read(events_hub.entry_url(user(AGENT_GROUP), '/events/abc'))
        self.assertEqual({key: data[key] for key in ('sub', 'email', 'name', 'role', 'next')},
                         {'sub': 7, 'email': 'alex@example.test', 'name': 'Alex From Profile', 'role': 'agent', 'next': '/events/abc'})
        self.assertGreaterEqual(len(data['jti']), 16)

    def test_a_director_enters_as_director_and_each_pass_is_new(self):
        with no_profile():
            first, second = (self.read(events_hub.entry_url(user(DIRECTOR_GROUP), '/dashboard')) for _ in range(2))
        self.assertEqual(first['role'], 'director')
        self.assertNotEqual(first['jti'], second['jti'])

    def test_unsafe_next_paths_are_dropped(self):
        with no_profile():
            for unsafe in ('//evil.example', 'https://evil.example', 'javascript:alert(1)'):
                self.assertNotIn('next', self.read(events_hub.entry_url(user(AGENT_GROUP), unsafe)))

    def test_an_account_without_email_or_without_the_secret_gets_no_pass(self):
        with no_profile(), self.assertRaises(events_hub.EventsHubError):
            events_hub.entry_url(user(AGENT_GROUP, email=''))
        with override_settings(EVENTS_ENTRY_SECRET=''), self.assertRaises(events_hub.EventsHubError):
            events_hub.entry_url(user(AGENT_GROUP))


@override_settings(EVENTS_API_URL=URL, EVENTS_INTEGRATION_KEY=KEY, EVENTS_ENTRY_SECRET=SECRET)
class EventsViewTests(SimpleTestCase):
    def get(self, view, account, path='/', **query):
        request = RequestFactory().get(path, query)
        request.user = account
        return view(request)

    def test_open_redirects_to_events_with_a_pass_and_is_never_cached(self):
        with no_profile():
            reply = self.get(events_views.events_open, user(AGENT_GROUP), next='/my-calls')
        self.assertEqual(reply.status_code, 302)
        self.assertTrue(reply['Location'].startswith(URL + '/api/v1/auth/enter/?pass='))
        self.assertIn('no-store', reply['Cache-Control'])

    def test_open_without_the_connection_explains_instead_of_redirecting(self):
        with override_settings(EVENTS_ENTRY_SECRET=''):
            reply = self.get(events_views.events_open, user(AGENT_GROUP))
        self.assertEqual(reply.status_code, 503)

    def test_accounts_without_engagement_centre_access_are_refused(self):
        self.assertEqual(self.get(events_views.events_open, user()).status_code, 403)
        self.assertEqual(self.get(events_views.events_my_calls, user()).status_code, 403)

    def test_my_calls_asks_events_for_this_account(self):
        tasks = [{'event_id': 'e1', 'event_name': 'Open Day', 'phase': 'confirmation', 'to_call': 4}]
        numbers = {'today': {'dialled': 3}, 'this_week': {'dialled': 9}, 'last_week': {'dialled': 12}}
        with mock.patch('callcentre.events_hub.requests.request', return_value=response(data={'tasks': tasks, 'numbers': numbers})) as send:
            reply = self.get(events_views.events_my_calls, user(AGENT_GROUP))
        self.assertEqual(json.loads(reply.content), {'enabled': True, 'can_open': True, 'tasks': tasks, 'numbers': numbers})
        self.assertEqual(send.call_args.kwargs['params'], {'cc_user_id': 7})
        with mock.patch('callcentre.events_hub.requests.request', return_value=response(data={'tasks': [], 'numbers': 'odd'})):
            self.assertIsNone(json.loads(self.get(events_views.events_my_calls, user(AGENT_GROUP)).content)['numbers'])

    def test_my_calls_reports_an_unreachable_hub_quietly(self):
        with mock.patch('callcentre.events_hub.requests.request', side_effect=requests.ConnectionError('down')):
            data = json.loads(self.get(events_views.events_my_calls, user(AGENT_GROUP)).content)
        self.assertEqual((data['tasks'], data['error']), ([], 'The Events hub could not be reached. Try again shortly.'))

    def test_my_calls_when_not_connected(self):
        with override_settings(EVENTS_INTEGRATION_KEY=''), mock.patch('callcentre.events_hub.requests.request') as send:
            data = json.loads(self.get(events_views.events_my_calls, user(AGENT_GROUP)).content)
        self.assertEqual(data, {'enabled': False, 'can_open': True, 'tasks': [], 'numbers': None})
        send.assert_not_called()

    def test_summary_is_for_directors(self):
        self.assertEqual(self.get(events_views.events_summary, user(AGENT_GROUP)).status_code, 403)
        summary = {'upcoming_7_days': {'events': 2}}
        with mock.patch('callcentre.events_hub.requests.request', return_value=response(data=summary)):
            data = json.loads(self.get(events_views.events_summary, user(DIRECTOR_GROUP)).content)
        self.assertEqual(data['summary'], summary)


@override_settings(EVENTS_API_URL=URL, EVENTS_INTEGRATION_KEY=KEY)
class AllocationViewTests(SimpleTestCase):
    """The Director page's Event allocation, read and saved in Events."""
    board = {'days': 60, 'events': [{'event_id': 'e1', 'agent_ids': [7]}], 'agents': [{'id': 7, 'name': 'Alex'}, {'id': 8, 'name': 'Sam'}],
             'history': []}
    change = {'event_id': 'e1', 'all_agents': False, 'agent_ids': [8], 'expected': {'all_agents': False, 'agent_ids': [7]}}

    def get(self, account, **query):
        request = RequestFactory().get('/', query)
        request.user = account
        return events_views.events_allocations(request)

    def post(self, account, payload):
        request = RequestFactory().post('/', json.dumps(payload), content_type='application/json')
        request._dont_enforce_csrf_checks = True
        request.user = account
        return events_views.events_allocations(request)

    def profiles(self):
        found = mock.Mock(values_list=mock.Mock(return_value=[(7, 3)]), first=mock.Mock(return_value=None))
        return mock.patch.object(events_hub.Agent.objects, 'filter', return_value=found)

    def test_only_directors(self):
        self.assertEqual(self.get(user(AGENT_GROUP)).status_code, 403)
        self.assertEqual(self.post(user(AGENT_GROUP), {'changes': [self.change]}).status_code, 403)
        self.assertEqual(self.get(user()).status_code, 403)

    def test_reads_the_board_and_adds_the_specialist_profile(self):
        with self.profiles(), mock.patch('callcentre.events_hub.requests.request', return_value=response(data=json.loads(json.dumps(self.board)))) as send:
            data = json.loads(self.get(user(DIRECTOR_GROUP), days='30').content)
        self.assertEqual(send.call_args.args, ('GET', URL + '/api/v1/integration/allocations/'))
        self.assertEqual(send.call_args.kwargs['params'], {'days': 30})
        self.assertEqual([(agent['id'], agent['agent_id']) for agent in data['board']['agents']], [(7, 3), (8, None)])
        self.assertEqual(self.get(user(DIRECTOR_GROUP), days='7').status_code, 400)

    def test_an_unreachable_hub_or_odd_answer_is_a_quiet_note(self):
        with mock.patch('callcentre.events_hub.requests.request', side_effect=requests.ConnectionError('down')):
            data = json.loads(self.get(user(DIRECTOR_GROUP)).content)
        self.assertEqual((data['board'], data['error']), (None, 'The Events hub could not be reached. Try again shortly.'))
        with mock.patch('callcentre.events_hub.requests.request', return_value=response(data={'events': 'x'})):
            self.assertIsNone(json.loads(self.get(user(DIRECTOR_GROUP)).content)['board'])

    def test_not_connected(self):
        with override_settings(EVENTS_INTEGRATION_KEY=''), mock.patch('callcentre.events_hub.requests.request') as send:
            self.assertEqual(json.loads(self.get(user(DIRECTOR_GROUP)).content), {'enabled': False, 'board': None})
        send.assert_not_called()

    def test_saves_as_this_director(self):
        with no_profile(), mock.patch('callcentre.events_hub.requests.request', return_value=response(data={'changed': 1})) as send:
            reply = self.post(user(DIRECTOR_GROUP, pk=5), {'changes': [self.change], 'reason': ' Balanced by bookings '})
        self.assertEqual(json.loads(reply.content), {'changed': 1})
        self.assertEqual(send.call_args.args, ('POST', URL + '/api/v1/integration/allocations/'))
        self.assertEqual(send.call_args.kwargs['json'], {
            'actor': {'id': 5, 'email': 'alex@example.test', 'name': 'Alex Agent'}, 'changes': [self.change], 'reason': 'Balanced by bookings'})

    def test_a_stale_page_and_a_refused_batch_say_why(self):
        stale = response(409, {'detail': 'changed', 'events': ['Open Day']})
        with no_profile(), mock.patch('callcentre.events_hub.requests.request', return_value=stale):
            reply = self.post(user(DIRECTOR_GROUP), {'changes': [self.change]})
        self.assertEqual((reply.status_code, json.loads(reply.content)['events']), (409, ['Open Day']))
        refused = response(400, {'detail': ['Every allocated person must be an agent the Communication Centre has sent.']})
        with no_profile(), mock.patch('callcentre.events_hub.requests.request', return_value=refused):
            reply = self.post(user(DIRECTOR_GROUP), {'changes': [self.change]})
        self.assertEqual(reply.status_code, 400)
        self.assertIn('must be an agent', json.loads(reply.content)['detail'])
        with no_profile(), mock.patch('callcentre.events_hub.requests.request', return_value=response(500)):
            self.assertEqual(self.post(user(DIRECTOR_GROUP), {'changes': [self.change]}).status_code, 503)

    def test_bad_requests_never_reach_events(self):
        with mock.patch('callcentre.events_hub.requests.request') as send:
            self.assertEqual(self.post(user(DIRECTOR_GROUP), {'changes': []}).status_code, 400)
            self.assertEqual(self.post(user(DIRECTOR_GROUP), {'changes': [self.change], 'reason': 3}).status_code, 400)
            with no_profile():
                self.assertEqual(self.post(user(DIRECTOR_GROUP, email=''), {'changes': [self.change]}).status_code, 400)
        send.assert_not_called()


T0 = datetime(2026, 11, 3, 10, 0, tzinfo=dt_timezone.utc)


def dial(dial_id, minutes=0, number='07123 456780', status='pending', cc_user_id=7):
    return {'id': dial_id, 'cc_user_id': cc_user_id, 'number': number, 'dialled_at': (T0 + timedelta(minutes=minutes)).isoformat(),
            'status': status}


def zoom_call(pk, minutes, callee='+447123456780', result='answered', duration=95):
    return SimpleNamespace(pk=pk, callee_number=callee, result=result, duration_seconds=duration, started_at=T0 + timedelta(minutes=minutes))


class MatchDialsTests(SimpleTestCase):
    """Each Events press gets its Zoom call by the call-intent rules (events_hub.match_dials / find_call)."""

    def setUp(self):
        self.specialist = SimpleNamespace(pk=1, user_id=7, zoom_account='student')
        patcher = mock.patch.object(events_hub.Agent.objects, 'filter', return_value=[self.specialist])
        patcher.start()
        self.addCleanup(patcher.stop)
        result = mock.patch.object(events_hub, 'call_result', side_effect=lambda d, c: {'id': d['id'], 'status': 'matched', 'cc_call_id': c.pk})
        result.start()
        self.addCleanup(result.stop)
        keep = mock.patch.object(events_hub, 'keep_matches')
        self.keep = keep.start()
        self.addCleanup(keep.stop)
        self.kept_elsewhere = set()
        elsewhere = mock.patch.object(events_hub, 'kept_for_another_press', side_effect=lambda call, dial: call.pk in self.kept_elsewhere)
        elsewhere.start()
        self.addCleanup(elsewhere.stop)

    def match(self, dials, calls, now=T0 + timedelta(minutes=30), owned=(), line=None):
        def in_window(*args, **kwargs):
            chosen = [c for c in calls if kwargs['started_at__gte'] <= c.started_at <= kwargs['started_at__lte']]
            return mock.Mock(order_by=mock.Mock(return_value=chosen))

        def ownership(call):
            return mock.Mock(exists=mock.Mock(return_value=call.pk in owned))
        with mock.patch.object(events_hub.ZoomPhoneCall.objects, 'filter', side_effect=in_window), \
                mock.patch.object(events_hub.CallMatch.objects, 'filter', side_effect=ownership), \
                mock.patch('callcentre.services.line_agents', return_value=line if line is not None else [self.specialist]), \
                mock.patch('callcentre.zoom_views.current_account_filter', return_value=Q()):
            return events_hub.match_dials(dials, now=now)

    def test_a_press_gets_the_agents_call_to_that_number_within_ten_minutes(self):
        self.assertEqual(self.match([dial('d1')], [zoom_call(50, 2)]), [{'id': 'd1', 'status': 'matched', 'cc_call_id': 50}])
        # The match is kept here too, so the call counts towards the specialist's talk time.
        [(kept_dial, kept_agent, kept_call)] = self.keep.call_args.args[0]
        self.assertEqual((kept_dial['id'], kept_agent, kept_call.pk), ('d1', self.specialist, 50))

    def test_a_call_kept_for_another_press_is_not_matched_again(self):
        self.kept_elsewhere = {50}
        self.assertEqual(self.match([dial('d2')], [zoom_call(50, 2)]), [])
        self.assertEqual(self.keep.call_args.args[0], [])

    def test_other_numbers_late_calls_the_desks_own_calls_and_other_lines_are_not_matched(self):
        self.assertEqual(self.match([dial('d1')], [zoom_call(50, 2, callee='+447000000000')]), [])
        self.assertEqual(self.match([dial('d1')], [zoom_call(50, 11)]), [])
        self.assertEqual(self.match([dial('d1')], [zoom_call(50, 2)], owned={50}), [])
        self.assertEqual(self.match([dial('d1')], [zoom_call(50, 2)], line=[SimpleNamespace(pk=99)]), [])

    def test_a_redial_owns_the_call_after_it_and_one_call_never_serves_two_presses(self):
        matched = self.match([dial('first'), dial('redial', minutes=3)], [zoom_call(50, 1), zoom_call(51, 4)])
        self.assertEqual(matched, [{'id': 'first', 'status': 'matched', 'cc_call_id': 50},
                                   {'id': 'redial', 'status': 'matched', 'cc_call_id': 51}])
        self.assertEqual(self.match([dial('first'), dial('redial', minutes=3)], [zoom_call(51, 4)]),
                         [{'id': 'redial', 'status': 'matched', 'cc_call_id': 51}])

    def test_a_press_with_no_call_is_given_up_after_two_hours_and_unknown_agents_wait(self):
        self.assertEqual(self.match([dial('d1')], []), [])
        self.assertEqual(self.match([dial('d1')], [], now=T0 + timedelta(hours=3)), [{'id': 'd1', 'status': 'unmatched'}])
        self.assertEqual(self.match([dial('d1', status='matched')], [], now=T0 + timedelta(hours=3)), [])
        self.assertEqual(self.match([dial('d1', cc_user_id=8)], [zoom_call(50, 2)]), [])

    def test_malformed_presses_are_ignored_without_touching_the_database(self):
        with mock.patch.object(events_hub.Agent.objects, 'filter') as agents:
            self.assertEqual(events_hub.match_dials([{'id': 'x'}, 'junk', dial('d1', number='call me')]), [])
        agents.assert_not_called()


class EventTalkTimeTests(SimpleTestCase):
    """Calls made from the Events hub count towards talk time and the target, with their own share (reports.day_figures),
    and each match is kept here (events_hub.keep_matches)."""

    def call(self, pk, minutes, result='answered', duration=120):
        start = T0 + timedelta(minutes=minutes)
        return SimpleNamespace(pk=pk, started_at=start, ended_at=start + timedelta(seconds=duration), result=result, duration_seconds=duration)

    def test_event_calls_add_to_the_day_and_are_shown_apart(self):
        from .reports import day_figures
        learner = [self.call(1, 0, duration=300), self.call(2, 20, result='no_answer', duration=0)]
        events = [self.call(3, 10, duration=90), self.call(4, 40, result='no_answer', duration=0)]
        day = day_figures(T0.date(), learner, events, T0 + timedelta(hours=1))
        self.assertEqual((day['calls'], day['answered'], day['not_answered'], day['seconds']), (4, 2, 2, 390))
        self.assertEqual((day['event_calls'], day['event_answered'], day['event_seconds']), (2, 1, 90))
        self.assertEqual((day['first_call'], day['last_call']), (learner[0].started_at, events[1].started_at))

    def test_a_day_without_event_calls(self):
        from .reports import day_figures
        day = day_figures(T0.date(), [self.call(1, 0)], [], T0 + timedelta(hours=1))
        self.assertEqual((day['seconds'], day['event_calls'], day['event_seconds']), (120, 0, 0))

    def test_matches_are_kept_once_and_a_missing_table_or_race_is_quiet(self):
        from django.db import IntegrityError, ProgrammingError
        specialist, zoom = SimpleNamespace(pk=1), SimpleNamespace(pk=50)
        atomic = mock.patch('callcentre.events_hub.transaction.atomic', return_value=mock.MagicMock())
        with atomic, mock.patch.object(events_hub.EventsHubCall.objects, 'get_or_create') as keep:
            events_hub.keep_matches([({'id': 'd1'}, specialist, zoom)])
        keep.assert_called_once_with(events_dial_id='d1', defaults={'call': zoom, 'agent': specialist})
        for problem in (ProgrammingError('no table'), IntegrityError('taken')):
            with atomic, mock.patch.object(events_hub.EventsHubCall.objects, 'get_or_create', side_effect=problem):
                events_hub.keep_matches([({'id': 'd1'}, specialist, zoom)])
        with atomic, mock.patch.object(events_hub.EventsHubCall.objects, 'filter', side_effect=ProgrammingError('no table')):
            self.assertFalse(events_hub.kept_for_another_press(zoom, {'id': 'd1'}))


@override_settings(CALLCENTRE_PUBLIC_URL='https://cc.example.test')
class CallResultTests(SimpleTestCase):
    def result(self, recordings, texts, call):
        with mock.patch('callcentre.call_log.recordings_of', return_value={call.pk: recordings}), \
                mock.patch.object(events_hub.ZoomPhoneRecording.objects, 'filter',
                                  return_value=mock.Mock(values_list=mock.Mock(return_value=list(texts.items())))):
            return events_hub.call_result({'id': 'd1'}, call)

    def test_carries_the_result_recordings_with_signed_links_and_the_ready_transcript(self):
        data = self.result([{'id': 9, 'transcript': 'ready', 'duration_seconds': 90}], {9: 'Agent: Hello'}, zoom_call(50, 2))
        self.assertEqual((data['status'], data['cc_call_id'], data['result'], data['duration_seconds']), ('matched', 50, 'answered', 95))
        self.assertEqual((data['transcript_status'], data['transcript_text']), ('ready', 'Agent: Hello'))
        link = data['recordings'][0]['audio_url']
        self.assertTrue(link.startswith('https://cc.example.test/api/callcentre/events/recordings/'))
        token = link.split('/recordings/')[1].split('/audio/')[0]
        self.assertEqual(signing.loads(token, salt=events_hub.RECORDING_SALT), {'r': 9, 'c': 50})

    def test_an_answered_call_without_a_recording_yet_waits_and_an_unanswered_one_does_not(self):
        self.assertEqual(self.result([], {}, zoom_call(50, 2))['transcript_status'], 'pending')
        self.assertEqual(self.result([], {}, zoom_call(50, 2, result='no_answer'))['transcript_status'], 'none')


class RecordingAudioTests(SimpleTestCase):
    def play(self, account, token, on_call=None, me=None):
        request = RequestFactory().get('/')
        request.user = account
        found = mock.Mock(first=mock.Mock(return_value=SimpleNamespace(pk=9)))
        calls = mock.Mock(filter=mock.Mock(return_value=mock.Mock(first=mock.Mock(return_value=SimpleNamespace(pk=50)))))
        with mock.patch.object(events_views.ZoomPhoneRecording.objects, 'filter', return_value=found), \
                mock.patch('callcentre.zoom_views.recording_calls', return_value=calls), \
                mock.patch('callcentre.zoom_views.current_account_filter', return_value=Q()), \
                mock.patch('callcentre.services.identify_agent', return_value=on_call), \
                mock.patch('callcentre.services.agent_for', return_value=me), \
                mock.patch('callcentre.zoom_recordings.recording_audio', return_value=(io.BytesIO(b'audio'), 'audio/mpeg')):
            return events_views.events_recording_audio(request, token)

    def token(self):
        return signing.dumps({'r': 9, 'c': 50}, salt=events_hub.RECORDING_SALT, compress=True)

    def test_a_forged_link_is_not_found(self):
        self.assertEqual(self.play(user(DIRECTOR_GROUP), 'forged:token').status_code, 404)
        other_salt = signing.dumps({'r': 9, 'c': 50}, salt='something-else')
        self.assertEqual(self.play(user(DIRECTOR_GROUP), other_salt).status_code, 404)

    def test_plays_to_directors_and_the_specialist_on_the_call_only(self):
        reply = self.play(user(DIRECTOR_GROUP), self.token())
        self.assertEqual((reply.status_code, reply['Content-Type']), (200, 'audio/mpeg'))
        me = SimpleNamespace(pk=1)
        self.assertEqual(self.play(user(AGENT_GROUP), self.token(), on_call=me, me=me).status_code, 200)
        self.assertEqual(self.play(user(AGENT_GROUP), self.token(), on_call=SimpleNamespace(pk=2), me=me).status_code, 403)
        self.assertEqual(self.play(user(), self.token()).status_code, 403)
