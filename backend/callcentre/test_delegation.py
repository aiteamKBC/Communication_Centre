"""Task delegation: a director hands a list to another specialist until recalled, and marks specialists absent.

Run with ``python check_isolated_tests.py callcentre.test_delegation`` (in-memory SQLite only).
"""
import json
import unittest
import uuid
from datetime import datetime, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db import connections
from django.db.models import Q
from django.test import RequestFactory, TestCase
from django.utils import timezone

from . import delegation
from .models import (Agent, Allocation, CaseTicket, CycleState, DelegatedTask, DelegationHistory, Inbound, Setting, TicketEvent,
                     ZoomPhoneCall)
from .rules import LONDON, next_workday
from .services import Conflict, can_work, claim, create_intent
from .test_call_flow import Directory, zoom_accounts

SAFIYAH_LINE = '+441622958772'


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class DelegationTests(TestCase):
    """Safiyah looks after Ann and Ben; Alice and Liza cover; a director plans it."""
    databases = {'default', 'login_db'}

    def setUp(self):
        patches = [mock.patch('callcentre.sources.cached_directory', return_value=Directory()),
                   mock.patch('callcentre.sources.on_break_emails', return_value=frozenset()),
                   mock.patch('callcentre.sources.active_case_contacts', return_value=Q()),
                   # Engagement Centre access (Django admin groups) is tested in tests.py.
                   mock.patch('callcentre.views.refused', return_value=None)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        zoom_accounts(('student', 'Student', 'account'))
        users = get_user_model().objects
        self.safiyah, self.alice, self.liza = (
            Agent.objects.create(user=users.create_user(name.lower()), display_name=name, zoom_email=f'{name.lower()}@kbc.test',
                                 zoom_account='student', zoom_phone_number=line)
            for name, line in (('Safiyah', SAFIYAH_LINE), ('Alice', '+441622958955'), ('Liza', '+441622958989')))
        self.director = users.create_user('director', is_superuser=True)
        for email in ('ann@x.test', 'ben@x.test', 'cat@x.test'):
            Allocation.objects.create(learner_email=email, agent=self.safiyah, updated_by='manager')
        self.tomorrow = datetime.combine(next_workday(timezone.now().astimezone(LONDON).date()), time(10), tzinfo=LONDON)

    def case(self, name, source_type='reminder', **fields):
        if source_type == 'reminder':
            fields.setdefault('booking_at', self.tomorrow)
        ticket = CaseTicket.objects.create(
            source_type=source_type, reason_key=f'{source_type}:{name}:{uuid.uuid4()}', learner_email=f'{name}@x.test',
            learner_name=name.title(), learner_phone=f'+4477009000{len(name):02d}', due_at=timezone.now() + timedelta(days=2), **fields)
        CaseTicket.objects.filter(pk=ticket.pk).update(created_at=timezone.now() - timedelta(hours=1))
        return CaseTicket.objects.get(pk=ticket.pk)

    def delegate(self, category='nextday', parts=None, source='agent', from_agent=None):
        parts = parts or [{'to_agent_id': self.alice.pk, 'learners': [], 'catch_new': True, 'after_topic': 'nextday'}]
        return delegation.delegate({'source': source, 'from_agent_id': (from_agent or self.safiyah).pk if source == 'agent' else None,
                                    'category': category, 'parts': parts}, 'director')

    def covers(self, ticket):
        cover = delegation.cover_of(ticket)
        return (cover.task.to_agent.display_name, cover.direct) if cover else None

    def can(self, agent, ticket):
        try:
            return can_work(ticket, agent.user) == agent
        except PermissionDenied:
            return False

    # Who works a delegated learner

    def test_a_whole_list_goes_to_the_receiver_with_its_new_cases_and_only_that_list(self):
        ann = self.case('ann')
        lecture = self.case('ben', 'attendance')
        self.delegate()
        self.assertEqual(self.covers(ann), ('Alice', True))
        self.assertIsNone(self.covers(lecture))   # another list stays with Safiyah
        self.assertEqual((self.can(self.alice, ann), self.can(self.safiyah, ann)), (True, False))
        self.assertEqual((self.can(self.alice, lecture), self.can(self.safiyah, lecture)), (False, True))
        # A new next-day reminder for her learners goes to Alice too, until recalled.
        cat = self.case('cat')
        self.assertEqual(self.covers(cat), ('Alice', True))
        with self.assertRaisesMessage(Conflict, 'Alice covers this learner'):
            claim(cat.pk, self.safiyah)

    def test_chosen_learners_only(self):
        ann, ben = self.case('ann'), self.case('ben')
        self.delegate(parts=[{'to_agent_id': self.alice.pk, 'learners': ['ann@x.test'], 'catch_new': False, 'after_topic': ''}])
        self.assertEqual((self.covers(ann), self.covers(ben)), (('Alice', True), None))

    def test_a_split_list_sends_each_part_to_its_receiver_and_the_new_ones_to_the_part_chosen(self):
        ann, ben = self.case('ann'), self.case('ben')
        self.delegate(parts=[{'to_agent_id': self.alice.pk, 'learners': ['ann@x.test'], 'catch_new': True, 'after_topic': ''},
                             {'to_agent_id': self.liza.pk, 'learners': ['ben@x.test'], 'catch_new': False, 'after_topic': 'missed'}])
        self.assertEqual((self.covers(ann), self.covers(ben)), (('Alice', True), ('Liza', True)))
        self.assertEqual(self.covers(self.case('cat')), ('Alice', True))   # a learner chosen by name beats "and new ones"

    def test_the_receivers_call_covers_the_learners_other_due_cases_without_taking_them(self):
        ann = self.case('ann')
        lecture = self.case('ann', 'attendance')
        self.delegate()
        self.assertEqual(self.covers(lecture), ('Alice', False))
        self.assertEqual((self.can(self.alice, lecture), self.can(self.safiyah, lecture)), (True, True))
        intent = create_intent(ann.pk, self.alice)
        self.assertEqual(set(intent.tickets.values_list('pk', flat=True)), {ann.pk, lecture.pk})
        named = dict(TicketEvent.objects.filter(kind='dial_requested').values_list('ticket_id', 'data__task_id'))
        task = DelegatedTask.objects.get()
        self.assertEqual(named, {ann.pk: task.pk, lecture.pk: None})

    def test_a_learner_is_with_one_receiver_the_earliest_task_wins(self):
        ann = self.case('ann')
        lecture = self.case('ann', 'attendance')
        self.delegate()
        self.delegate('missed', [{'to_agent_id': self.liza.pk, 'learners': [], 'catch_new': True, 'after_topic': ''}])
        self.assertEqual((self.covers(ann), self.covers(lecture)), (('Alice', True), ('Alice', False)))
        self.assertFalse(self.can(self.liza, lecture))

    def test_a_receiver_can_be_an_employer_specialist_and_take_employer_calls(self):
        Setting.objects.create(key='employer_specialists', value={'enabled': True, 'agent_ids': [self.liza.pk]}, updated_by='d')
        ann = self.case('ann')
        boss = self.case('boss', 'employer_feedback')
        self.assertFalse(self.can(self.liza, ann))   # an employer specialist does not call learners...
        self.delegate(parts=[{'to_agent_id': self.liza.pk, 'learners': [], 'catch_new': True, 'after_topic': ''}])
        self.assertTrue(self.can(self.liza, ann))    # ...unless a task gives her them
        self.assertFalse(self.can(self.alice, boss))
        self.delegate('employer_satisfaction', [{'to_agent_id': self.alice.pk, 'learners': [], 'catch_new': True, 'after_topic': ''}],
                      source='employer')
        self.assertTrue(self.can(self.alice, boss))
        self.assertFalse(self.can(self.liza, boss))

    def test_recall_gives_everything_back_as_it_stands(self):
        ann = self.case('ann')
        self.delegate()
        claim(ann.pk, self.alice)
        delegation.recall([DelegatedTask.objects.get().pk], 'director')
        self.assertIsNone(self.covers(ann))
        CaseTicket.objects.filter(pk=ann.pk).update(last_activity_at=timezone.now() - timedelta(hours=1))
        ann.refresh_from_db()
        self.assertEqual((self.can(self.safiyah, ann), self.can(self.alice, ann)), (True, False))
        self.assertEqual(list(DelegationHistory.objects.values_list('action', flat=True).order_by('id')), ['delegated', 'recalled'])

    def test_what_a_director_cannot_delegate(self):
        self.case('ann')
        with self.assertRaisesMessage(ValueError, 'cannot cover their own list'):
            self.delegate(parts=[{'to_agent_id': self.safiyah.pk, 'learners': [], 'catch_new': True, 'after_topic': ''}])
        with self.assertRaisesMessage(ValueError, 'Only one part'):
            self.delegate(parts=[{'to_agent_id': self.alice.pk, 'learners': ['a@x.test'], 'catch_new': True, 'after_topic': ''},
                                 {'to_agent_id': self.liza.pk, 'learners': ['b@x.test'], 'catch_new': True, 'after_topic': ''}])
        with self.assertRaisesMessage(ValueError, 'Follow-ups belong to a specialist'):
            self.delegate('followups', source='shared')
        self.delegate()
        with self.assertRaisesMessage(Conflict, 'already go to Alice'):
            self.delegate(parts=[{'to_agent_id': self.liza.pk, 'learners': [], 'catch_new': True, 'after_topic': ''}])
        self.delegate(parts=[{'to_agent_id': self.liza.pk, 'learners': ['ann@x.test'], 'catch_new': False, 'after_topic': ''}])
        with self.assertRaisesMessage(Conflict, 'already delegated from this list'):
            self.delegate(parts=[{'to_agent_id': self.alice.pk, 'learners': ['ann@x.test'], 'catch_new': False, 'after_topic': ''}])

    def test_follow_ups_a_specialist_booked_can_be_delegated(self):
        lecture = self.case('dan', 'attendance')
        TicketEvent.objects.create(ticket=lecture, kind='outcome', data={'outcome': 'callback'}, agent=self.safiyah, actor='Safiyah')
        self.delegate('followups')
        self.assertEqual(self.covers(lecture), ('Alice', True))

    # Absent, back, and the phone line

    def test_marking_absent_delegates_her_lists_and_her_line_cover_sees_her_missed_calls(self):
        from .inbound import visible
        self.case('ann')
        delegation.mark_absent({'agent_id': self.safiyah.pk, 'line_cover_id': self.liza.pk, 'lists': [
            {'category': 'nextday', 'parts': [{'to_agent_id': self.alice.pk, 'learners': [], 'catch_new': True, 'after_topic': ''}]}]},
            'director')
        with self.assertRaisesMessage(Conflict, 'already marked absent'):
            delegation.mark_absent({'agent_id': self.safiyah.pk, 'line_cover_id': None, 'lists': []}, 'director')
        ring = lambda number, kind, email='': Inbound.objects.create(
            kind=kind, caller_number=number, caller_email=email, line=SAFIYAH_LINE, agent=self.safiyah,
            received_at=timezone.now(), call=ZoomPhoneCall.objects.create(
                source_account='student', zoom_account_id='account', history_id=str(uuid.uuid4()), direction='inbound',
                started_at=timezone.now(), result='no_answer', caller_number=number, callee_number=SAFIYAH_LINE))
        covered = ring('+447700900003', Inbound.CALLBACK, 'ann@x.test')
        other = ring('+447700900005', Inbound.CALLBACK, 'ben@x.test')
        stranger = ring('+447700900777', Inbound.ENQUIRY)
        seen = lambda agent: set(visible(Inbound.objects.all(), agent.user, agent).values_list('pk', flat=True))
        self.assertEqual(seen(self.alice), {covered.pk})                 # Ann is in Alice's task
        self.assertEqual(seen(self.liza), {other.pk, stranger.pk})      # the rest of Safiyah's line: her line cover
        self.assertEqual(seen(self.safiyah), {other.pk, stranger.pk})   # still hers once she is back
        self.assertEqual(delegation.mark_back({'agent_id': self.safiyah.pk, 'recall': True}, 'director'), 1)
        self.assertEqual(seen(self.liza), set())
        self.assertFalse(DelegatedTask.objects.filter(recalled_at__isnull=True).exists())

    # The receiver, the overview and the director's page

    def test_the_overview_names_who_covers_each_case_and_lists_the_tasks(self):
        from .views import overview
        ann = self.case('ann')
        self.case('ben', 'attendance')
        self.delegate()
        request = RequestFactory().get('/')
        request.user = self.alice.user
        directory = Directory()
        directory.coach_emails = {}
        with mock.patch('callcentre.sources.cached_directory', return_value=directory), mock.patch('callcentre.views.performance', return_value={'agents': [], 'resolutions': {}, 'unclaimed_breaches': 0}), \
                mock.patch('callcentre.views.call_reviews', return_value=None):
            data = json.loads(overview(request).content)
        cover = {case['id']: case['cover'] for case in data['cases']}
        self.assertEqual(cover[ann.pk], {'task_id': DelegatedTask.objects.get().pk, 'to_agent_id': self.alice.pk, 'to_name': 'Alice',
                                         'from_name': 'Safiyah', 'direct': True})
        self.assertEqual(len([value for value in cover.values() if value]), 1)
        self.assertEqual([(task['from_name'], task['category'], task['to_name'], task['catch_new']) for task in data['tasks']],
                         [('Safiyah', 'nextday', 'Alice', True)])

    def test_the_director_plans_recalls_and_sees_what_each_task_did_today(self):
        from .manage_views import task_delegation
        from .views import delegation_seen
        ann = self.case('ann')

        def send(view, user, data=None):
            request = RequestFactory().post('/', json.dumps(data), content_type='application/json') if data is not None else RequestFactory().get('/')
            request.user, request._dont_enforce_csrf_checks = user, True
            response = view(request)
            return response.status_code, json.loads(response.content)

        status, created = send(task_delegation, self.director, {'action': 'delegate', 'source': 'agent', 'from_agent_id': self.safiyah.pk,
                               'category': 'nextday', 'parts': [{'to_agent_id': self.alice.pk, 'learners': ['ann@x.test'],
                                                                 'catch_new': False, 'after_topic': 'missed'}]})
        self.assertEqual(status, 200)
        self.assertEqual(send(task_delegation, self.alice.user, {'action': 'recall', 'task_ids': created['task_ids']})[0], 403)
        create_intent(ann.pk, self.alice)
        status, page = send(task_delegation, self.director)
        task, = page['tasks']
        self.assertEqual((task['to_name'], task['after_topic'], task['learners'], task['counts']['called'], task['counts']['open']),
                         ('Alice', 'missed', ['ann@x.test'], 1, 1))
        seen = send(delegation_seen, self.alice.user, {'task_ids': created['task_ids']})
        self.assertEqual(seen[1].get('seen'), 1, seen)
        self.assertEqual(send(task_delegation, self.director, {'action': 'recall', 'task_ids': created['task_ids']})[1]['recalled'], 1)
        self.assertEqual([item['action'] for item in send(task_delegation, self.director)[1]['history']], ['recalled', 'delegated'])

    def test_nothing_is_delegated_before_the_tables_exist(self):
        from django.db import ProgrammingError
        ann = self.case('ann')
        with mock.patch.object(DelegatedTask.objects, 'filter', side_effect=ProgrammingError('missing')):
            self.assertEqual(delegation.active_tasks(), [])
            self.assertTrue(self.can(self.safiyah, ann))
        self.assertEqual(CycleState.objects.filter(name='x').count(), 0)
