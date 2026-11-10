"""Run with python check_isolated_tests.py callcentre.test_history; no live services."""
import json
import unittest
import uuid
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import RequestFactory, TestCase

from .models import Agent, CallIntent, CallMatch, CaseCall, CaseTicket, TicketEvent, ZoomPhoneCall
from .services import identify_agent
from .views import my_history


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Isolated SQLite tests only.')
class MonthlyHistoryTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        self.now = datetime(2026, 10, 20, 12, tzinfo=dt_timezone.utc)
        self.user = get_user_model().objects.create_user('alice', email='alice@login.test')
        self.other_user = get_user_model().objects.create_user('bob', email='bob@login.test')
        self.agent = Agent.objects.create(user=self.user, display_name='Alice', zoom_email='alice@zoom.test',
                                          zoom_user_id='alice-id', zoom_account='student')
        self.other = Agent.objects.create(user=self.other_user, display_name='Bob', zoom_email='bob@zoom.test',
                                          zoom_user_id='bob-id', zoom_account='student')
        for target, value in (
            ('callcentre.views.refused', None),
            ('callcentre.views.timezone.now', self.now),
        ):
            mock = patch(target, return_value=value)
            mock.start()
            self.addCleanup(mock.stop)

    def call(self, internal=True, **fields):
        values = dict(source_account='student', zoom_account_id='account', history_id=str(uuid.uuid4()),
                      direction='outbound', caller_email=self.agent.zoom_email,
                      caller_user_id=self.agent.zoom_user_id, callee_name='Learner',
                      callee_number='+447700900123', started_at=self.now - timedelta(hours=1),
                      ended_at=self.now - timedelta(minutes=55), result='answered', duration_seconds=300)
        values.update(fields)
        call = ZoomPhoneCall.objects.create(**values)
        agent = identify_agent(call, [self.agent, self.other])
        if internal and agent:
            CallMatch.objects.create(call=call, agent=agent, learner_email='learner@test.test')
            CallIntent.objects.create(agent=agent, learner_email='learner@test.test',
                                      number=call.callee_number, matched_call=call)
        return call

    def case(self, **fields):
        values = dict(source_type='attendance', reason_key=str(uuid.uuid4()), learner_name='Learner',
                      learner_email='learner@test.test', due_at=self.now)
        values.update(fields)
        return CaseTicket.objects.create(**values)

    def get(self, user=None, **query):
        request = RequestFactory().get('/api/callcentre/my-history/', query)
        request.user = user or self.user
        response = my_history(request)
        return response.status_code, json.loads(response.content)

    def test_own_actual_calls_only_and_time_only_for_answered_calls(self):
        self.call()
        self.call(result='no_answer', duration_seconds=90, ended_at=None)
        self.call(result='busy', duration_seconds=20)
        self.call(result='other', duration_seconds=60)
        self.call(caller_email=self.other.zoom_email, caller_user_id=self.other.zoom_user_id)
        self.call(direction='inbound')
        self.call(started_at=self.now + timedelta(hours=1), ended_at=self.now + timedelta(hours=2))
        self.call(ended_at=self.now + timedelta(hours=1))
        self.case(next_followup_at=self.now + timedelta(days=1))
        status, data = self.get()
        self.assertEqual(status, 200)
        self.assertEqual(data['agent']['email'], 'alice@login.test')
        self.assertEqual(data['month'], '2026-10')
        self.assertEqual(data['summary'], dict(attempts=4, connected=1, not_answered=2, other=1,
                                              seconds=300, active_days=1, missing_duration=0, resolved=0))
        self.assertEqual(len(data['calls']), 4)
        self.assertEqual(sum(day['attempts'] for day in data['daily']), 4)

    def test_operator_cannot_read_another_person_and_director_can_preview(self):
        self.assertEqual(self.get(agent_id=self.other.pk)[0], 403)
        self.user.is_superuser = True
        status, data = self.get(agent_id=self.other.pk)
        self.assertEqual(status, 200)
        self.assertEqual(data['agent']['id'], self.other.pk)

    def test_missing_profile_is_not_someone_elses_history(self):
        user = get_user_model().objects.create_user('unlinked')
        self.assertEqual(self.get(user=user)[0], 403)

    def test_month_boundaries_use_london_and_previous_month_stays_available(self):
        self.call(started_at=datetime(2026, 9, 30, 22, 59, tzinfo=dt_timezone.utc))
        self.call(started_at=datetime(2026, 9, 30, 23, 0, tzinfo=dt_timezone.utc))
        _, october = self.get()
        _, september = self.get(month='2026-09')
        self.assertEqual(october['total'], 1)
        self.assertEqual(october['daily'][0]['day'], '2026-10-01')
        self.assertEqual(september['total'], 1)
        self.assertEqual(september['daily'][0]['day'], '2026-09-30')
        with patch('callcentre.views.timezone.now', return_value=datetime(2026, 11, 1, 1, tzinfo=dt_timezone.utc)):
            self.assertEqual(self.get()[1]['month'], '2026-11')
            self.assertEqual(self.get(month='2026-10')[1]['total'], 1)

    def test_a_call_with_several_cases_is_counted_once_and_keeps_original_agent(self):
        call = self.call()
        match = CallMatch.objects.get(call=call)
        for _ in range(2):
            CaseCall.objects.create(match=match, ticket=self.case(claimed_by=self.other), outcome='no_answer')
        self.agent.zoom_email = 'new@zoom.test'
        self.agent.zoom_user_id = 'new-id'
        self.agent.save()
        ZoomPhoneCall.objects.filter(pk=call.pk).update(zoom_account_id='old-account')
        _, data = self.get()
        self.assertEqual(data['total'], 1)
        self.assertEqual(len(data['calls'][0]['cases']), 2)
        self.assertEqual(data['calls'][0]['contact_email'], 'learner@test.test')
        self.assertEqual(self.get(user=self.other_user)[1]['total'], 0)

    def test_external_calls_and_conflicting_identity_are_not_counted(self):
        self.call(internal=False, caller_email=self.agent.zoom_email.upper(), caller_user_id='')
        self.call(caller_email=self.agent.zoom_email, caller_user_id=self.other.zoom_user_id)
        _, data = self.get()
        self.assertEqual(data['total'], 0)

    def test_missing_duration_is_explicit_and_resolution_is_scoped(self):
        self.call(duration_seconds=None)
        self.case(resolved_agent=self.agent, resolved_at=self.now, status='resolved')
        self.case(resolved_agent=self.other, resolved_at=self.now, status='resolved')
        _, data = self.get()
        self.assertEqual(data['summary']['missing_duration'], 1)
        self.assertEqual(data['summary']['seconds'], 0)
        self.assertIsNone(data['calls'][0]['duration_seconds'])
        self.assertEqual(data['summary']['resolved'], 1)

    def test_pagination_does_not_change_month_totals_or_duplicate_calls(self):
        for _ in range(31):
            self.call()
        _, first = self.get()
        _, second = self.get(page=2)
        self.assertTrue(first['has_next'])
        self.assertFalse(second['has_next'])
        self.assertEqual(len(first['calls']), 30)
        self.assertEqual(len(second['calls']), 1)
        self.assertEqual(first['summary'], second['summary'])
        self.assertFalse({call['id'] for call in first['calls']} & {call['id'] for call in second['calls']})

    def test_reopening_a_case_does_not_erase_earlier_months_achievement(self):
        ticket = self.case(resolved_agent=self.agent, resolved_at=self.now, status='resolved')
        TicketEvent.objects.create(ticket=ticket, kind='resolved', agent=self.agent)
        self.assertEqual(self.get()[1]['summary']['resolved'], 1)
        CaseTicket.objects.filter(pk=ticket.pk).update(status='new', resolved_at=None, resolved_agent=None)
        with patch('callcentre.views.timezone.now', return_value=datetime(2026, 11, 1, 1, tzinfo=dt_timezone.utc)):
            self.assertEqual(self.get()[1]['summary']['resolved'], 0)
            self.assertEqual(self.get(month='2026-10')[1]['summary']['resolved'], 1)

    def test_invalid_future_month_and_page_are_rejected(self):
        for query in ({'month': '2026-11'}, {'month': 'invalid'}, {'page': '0'}, {'page': 'nan'}):
            self.assertEqual(self.get(**query)[0], 400)
