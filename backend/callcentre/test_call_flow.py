"""The call flow end to end on a real (in-memory) database: Zoom's call result, the outcome a specialist
records, the follow-up date and where the learner sits in the list.

Run with ``python check_isolated_tests.py callcentre.test_call_flow``. Skipped anywhere else, so a plain
``manage.py test`` never builds these tables on a configured server.
"""
import unittest
import uuid
from datetime import datetime, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connections, transaction
from django.db.models import ProtectedError, Q
from django.test import TestCase
from django.utils import timezone

from .allocation import owners
from .models import Agent, Allocation, CallIntent, CallMatch, CaseCall, CaseTicket, Setting, ZoomPhoneCall, ZoomSyncState
from .rules import LONDON, add_workdays, missed_call, promise_deadline
from .services import (Conflict, agent_for, allocated_owner, apply_call_result, can_work, claim, create_intent,
                       event, open_call, plan_outcome, record_outcome, save_call)
from .learner_satisfaction import held_feedback
from .views import rank, with_followup_agent, with_last_call

# Without routers these tests write to 'default'; in production the call-centre tables are on login_db, the alias
# save_call's transaction uses. This is save_call in a transaction on the database the tests write to.
one_transaction = transaction.atomic(using='default')(save_call.__wrapped__)


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class CallFlowTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        patches = [mock.patch('callcentre.services.allocated_owner', return_value=None),
                   mock.patch('callcentre.sources.on_break_emails', return_value=frozenset()),
                   mock.patch('callcentre.sources.active_case_contacts', return_value=Q())]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.user = get_user_model().objects.create_user('alice')
        self.agent = Agent.objects.create(user=self.user, display_name='Alice', zoom_email='alice@kbc.test', zoom_account='student')
        self.now = timezone.now()

    def case(self, name, source_type='epa', **fields):
        ticket = CaseTicket.objects.create(
            source_type=source_type, reason_key=f'{source_type}:{name}', learner_email=f'{name}@x.test',
            learner_name=name.title(), learner_phone=f'+4477009000{len(name):02d}', due_at=self.now + timedelta(days=2),
            **fields)
        CaseTicket.objects.filter(pk=ticket.pk).update(created_at=self.now - timedelta(hours=1))
        return CaseTicket.objects.get(pk=ticket.pk)

    def zoom(self, ticket, result, minutes_ago=5):
        """A call Zoom reports for this case, matched to Alice, with its result applied as the sync does."""
        call = ZoomPhoneCall.objects.create(
            source_account='student', zoom_account_id='account', history_id=str(uuid.uuid4()), direction='outbound',
            started_at=self.now - timedelta(minutes=minutes_ago), ended_at=self.now - timedelta(minutes=minutes_ago - 1),
            result=result)
        match = CallMatch.objects.create(call=call, agent=self.agent, learner_email=ticket.learner_email)
        intent = CallIntent.objects.create(agent=self.agent, learner_email=ticket.learner_email,
                                          number=ticket.learner_phone, matched_call=call)
        intent.tickets.add(ticket)
        CaseCall.objects.create(ticket=ticket, match=match)
        apply_call_result(match)
        return call

    def listed(self):
        """The Engagement Centre's list, in the order the overview sends it."""
        tickets = list(with_last_call(CaseTicket.objects.open()))
        tickets.sort(key=lambda ticket: rank(ticket, timezone.now()), reverse=True)
        return [ticket.learner_name for ticket in tickets]

    def fresh(self, ticket):
        return with_last_call(CaseTicket.objects.filter(pk=ticket.pk)).get()

    def morning(self, workdays=1):
        return datetime.combine(add_workdays(timezone.now(), workdays).date(), time(9), tzinfo=LONDON)

    # Not answered

    def test_zoom_reporting_an_unanswered_call_does_not_move_the_case(self):
        ann = self.case('ann', status='in_progress')
        self.zoom(ann, 'no_answer')
        ann = self.fresh(ann)
        # Counted and flagged, but only the specialist's saved outcome moves the case on.
        self.assertEqual((ann.status, ann.attempts, ann.next_followup_at), ('in_progress', 1, None))
        self.assertTrue(missed_call(ann))

    def test_an_unanswered_learner_waits_for_the_next_working_day_then_comes_back_at_the_bottom(self):
        ann = self.case('ann', risk='red', overdue_since=self.now.date() - timedelta(days=30))
        self.case('ben')
        self.case('cat')
        record_outcome(ann.pk, self.user, self.zoom(ann, 'no_answer').pk, 'no_answer')
        ann = self.fresh(ann)
        self.assertEqual((ann.status, ann.attempts, ann.next_followup_at), ('new', 1, self.morning()))
        self.assertTrue(missed_call(ann))
        with self.assertRaisesMessage(Conflict, 'The next follow-up is not due yet.'):
            create_intent(ann.pk, self.agent)
        # Red risk and 30 days overdue would put Ann first; the missed call puts her last.
        self.assertEqual(self.listed()[-1], 'Ann')

    def test_each_unanswered_call_is_counted_once(self):
        ann = self.case('ann')
        for minutes, result in ((30, 'no_answer'), (20, 'busy'), (10, 'voicemail')):
            call = self.zoom(ann, result, minutes)
        apply_call_result(CallMatch.objects.get(call=call))   # a re-sync of the same call
        self.assertEqual(self.fresh(ann).attempts, 3)

    def test_an_answered_call_after_missed_ones_takes_the_learner_off_the_bottom(self):
        ann = self.case('ann')
        self.case('ben')
        self.zoom(ann, 'no_answer', 30)
        record_outcome(ann.pk, self.user, self.zoom(ann, 'answered', 10).pk, 'reached', 'epa_step')
        ann = self.fresh(ann)
        self.assertFalse(missed_call(ann))
        self.assertEqual(ann.status, 'pending_verification')

    def test_an_unanswered_satisfaction_review_comes_back_next_working_morning(self):
        ann = self.case('ann', source_type='learner_satisfaction')
        record_outcome(ann.pk, self.user, self.zoom(ann, 'no_answer').pk, 'no_answer')
        self.assertEqual(self.fresh(ann).next_followup_at, self.morning())

    def test_no_answer_saved_before_zoom_reports_the_call_is_applied_when_it_does(self):
        ann = self.case('ann')
        intent = CallIntent.objects.create(agent=self.agent, learner_email=ann.learner_email, number=ann.learner_phone)
        intent.tickets.add(ann)
        self.assertFalse(plan_outcome(ann.pk, self.user, 'no_answer'))
        self.assertIsNone(self.fresh(ann).next_followup_at)
        call = ZoomPhoneCall.objects.create(
            source_account='student', zoom_account_id='account', history_id=str(uuid.uuid4()), direction='outbound',
            started_at=self.now - timedelta(minutes=2), ended_at=self.now - timedelta(minutes=1), result='no_answer')
        match = CallMatch.objects.create(call=call, agent=self.agent, learner_email=ann.learner_email)
        CallIntent.objects.filter(pk=intent.pk).update(matched_call=call)
        CaseCall.objects.create(ticket=ann, match=match)
        apply_call_result(match)
        ann = self.fresh(ann)
        self.assertEqual((ann.status, ann.attempts, ann.next_followup_at), ('new', 1, self.morning()))

    def test_a_broken_promise_ranks_with_red_risk_above_everyone_else(self):
        self.case('ben', overdue_since=self.now.date() - timedelta(days=30))
        self.case('ann', promised_at=self.now - timedelta(hours=1))
        self.case('cat', risk='red', overdue_since=self.now.date() - timedelta(days=40))
        # Ann's broken promise beats Ben's 30 days overdue; within the red tier the most overdue comes first.
        self.assertEqual(self.listed(), ['Cat', 'Ann', 'Ben'])

    # Follow-up dates

    def test_the_chosen_follow_up_date_is_kept_for_every_outcome(self):
        chosen = add_workdays(self.now, 3).replace(microsecond=0)
        for outcome, result, option, note in (('reached', 'answered', 'epa_step', ''),
                                              ('callback', 'answered', '', ''),
                                              ('wrong_number', 'answered', '', 'Number belongs to someone else'),
                                              ('refused', 'answered', '', 'Asked us not to call this week'),
                                              ('no_answer', 'no_answer', '', '')):
            with self.subTest(outcome):
                ticket = self.case(outcome)
                call = self.zoom(ticket, result)
                record_outcome(ticket.pk, self.user, call.pk, outcome, option, note, chosen)
                ticket.refresh_from_db()
                self.assertEqual(ticket.next_followup_at, chosen)

    def test_without_a_date_each_outcome_has_its_own_follow_up(self):
        reached = self.case('reached')
        record_outcome(reached.pk, self.user, self.zoom(reached, 'answered').pk, 'reached', 'epa_step')
        reached.refresh_from_db()
        self.assertEqual(reached.next_followup_at, promise_deadline('epa', 'epa_step', timezone.now()))
        wrong = self.case('wrong')
        record_outcome(wrong.pk, self.user, self.zoom(wrong, 'answered').pk, 'wrong_number', '', 'Not their number')
        wrong.refresh_from_db()
        self.assertEqual(wrong.next_followup_at, self.morning())
        missed = self.case('missed')
        record_outcome(missed.pk, self.user, self.zoom(missed, 'no_answer').pk, 'no_answer')
        missed.refresh_from_db()
        self.assertEqual(missed.next_followup_at, self.morning())

    def test_the_next_working_morning_skips_weekends_and_bank_holidays(self):
        from .services import next_workday_morning
        # Thursday 24 December 2026: Friday 25 and Monday 28 are bank holidays, so the next call is Tuesday 29.
        self.assertEqual(next_workday_morning(datetime(2026, 12, 24, 15, tzinfo=LONDON)), datetime(2026, 12, 29, 9, tzinfo=LONDON))

    def test_a_follow_up_in_the_past_is_refused(self):
        ann = self.case('ann')
        with self.assertRaisesMessage(ValueError, 'Choose a future follow-up time.'):
            record_outcome(ann.pk, self.user, self.zoom(ann, 'answered').pk, 'refused', '', 'Busy', self.now - timedelta(hours=1))

    def test_a_follow_up_on_a_bank_holiday_is_refused(self):
        ann = self.case('ann')
        with mock.patch('callcentre.services.timezone.now', return_value=datetime(2026, 12, 23, 12, tzinfo=LONDON)):
            with self.assertRaisesMessage(ValueError, 'not called at weekends or on bank holidays'):
                record_outcome(ann.pk, self.user, self.zoom(ann, 'answered').pk, 'callback', '', '',
                               datetime(2026, 12, 25, 10, tzinfo=LONDON))

    def test_a_closing_outcome_closes_the_case_whatever_the_date(self):
        ann = self.case('ann', source_type='manual')
        CaseTicket.objects.filter(pk=ann.pk).update(source_type='pr')
        record_outcome(ann.pk, self.user, self.zoom(ann, 'answered').pk, 'reached', 'book_pr', '', add_workdays(self.now, 5))
        ann.refresh_from_db()
        self.assertEqual((ann.status, ann.next_followup_at), ('resolved', None))

    def test_a_learner_cannot_be_called_before_their_follow_up(self):
        ann = self.case('ann')
        call = self.zoom(ann, 'answered')
        record_outcome(ann.pk, self.user, call.pk, 'callback', '', '', add_workdays(self.now, 3))
        with self.assertRaisesMessage(Conflict, 'The next follow-up is not due yet.'):
            create_intent(ann.pk, self.agent)
        CaseTicket.objects.filter(pk=ann.pk).update(next_followup_at=self.now - timedelta(minutes=1))
        create_intent(ann.pk, self.agent)   # due again: the call can start

    # One call, every case saved together

    def learner_with(self, *source_types):
        """Ann with one case per source type, all on the call started from the first."""
        tickets = [CaseTicket.objects.create(
            source_type=source_type, reason_key=f'{source_type}:ann:{index}', learner_email='ann@x.test', learner_name='Ann',
            learner_phone='+447700900001', due_at=self.now + timedelta(days=2)) for index, source_type in enumerate(source_types)]
        CaseTicket.objects.filter(pk__in=[ticket.pk for ticket in tickets]).update(created_at=self.now - timedelta(hours=1))
        create_intent(tickets[0].pk, self.agent)
        return tickets

    def outcomes(self, ticket):
        return list(ticket.events.filter(kind='outcome_pending').values_list('data__outcome', flat=True))

    def test_an_unanswered_call_is_saved_for_every_case_at_once(self):
        tickets = self.learner_with('epa', 'epa', 'manual')
        items = [{'id': ticket.pk, 'outcome': 'no_answer'} for ticket in tickets]
        self.assertFalse(save_call(tickets[0].pk, self.user, items))   # held until Zoom reports the call
        self.assertEqual([self.outcomes(ticket) for ticket in tickets], [['no_answer']] * 3)

    def test_one_case_failing_saves_none_of_them(self):
        epa, manual = self.learner_with('epa', 'manual')
        # Refused needs a note: the second case fails, so the first one's outcome is rolled back too.
        with self.assertRaisesMessage(ValueError, 'Say what the learner said.'):
            one_transaction(epa.pk, self.user, [{'id': epa.pk, 'outcome': 'reached', 'option': 'epa_step'},
                                          {'id': manual.pk, 'outcome': 'refused'}])
        self.assertEqual((self.outcomes(epa), self.outcomes(manual)), ([], []))

    def test_a_case_that_was_not_on_the_call_is_refused(self):
        epa, = self.learner_with('epa')
        ben = self.case('ben')
        with self.assertRaisesMessage(Conflict, 'was not part of this call'):
            one_transaction(epa.pk, self.user, [{'id': epa.pk, 'outcome': 'no_answer'}, {'id': ben.pk, 'outcome': 'no_answer'}])
        self.assertEqual(self.outcomes(epa), [])

    def test_the_call_must_have_been_made(self):
        ann = self.case('ann')
        with self.assertRaisesMessage(ValueError, 'Call the learner first.'):
            save_call(ann.pk, self.user, [{'id': ann.pk, 'outcome': 'no_answer'}])

    def test_answered_cases_get_their_own_outcomes_and_an_undiscussed_one_waits(self):
        epa, manual, other = self.learner_with('epa', 'manual', 'epa')
        save_call(epa.pk, self.user, [{'id': epa.pk, 'outcome': 'reached', 'option': 'epa_step'},
                                      {'id': manual.pk, 'outcome': 'resolve'},
                                      {'id': other.pk, 'outcome': 'not_discussed'}], note='Agreed the EPA step by Friday.')
        epa, manual, other = (self.fresh(ticket) for ticket in (epa, manual, other))
        self.assertEqual(self.outcomes(epa), ['reached'])
        self.assertEqual(manual.status, 'resolved')
        # Not discussed: no outcome, released and back in the list next working morning.
        self.assertEqual((self.outcomes(other), other.status, other.claimed_by_id, other.next_followup_at),
                         ([], 'new', None, self.morning()))


    def test_full_case_offers_the_unsaved_call_until_it_is_saved_once(self):
        epa, manual = self.learner_with('epa', 'manual')
        # Straight after Call, any of its cases offers the whole call, before Zoom reports anything.
        self.assertEqual(open_call(manual, self.agent), {'ticket_ids': sorted([epa.pk, manual.pk])})
        save_call(manual.pk, self.user, [{'id': epa.pk, 'outcome': 'no_answer'}, {'id': manual.pk, 'outcome': 'no_answer'}])
        self.assertIsNone(open_call(epa, self.agent))
        # Saved in Full case, so the Next call screen cannot record it a second time.
        with self.assertRaisesMessage(Conflict, 'This call has already been saved.'):
            save_call(epa.pk, self.user, [{'id': epa.pk, 'outcome': 'no_answer'}])
        self.assertEqual(self.outcomes(epa), ['no_answer'])

    # Whose follow-up it is (the Follow-ups page)

    def followup_agent(self, ticket):
        return with_followup_agent(CaseTicket.objects.filter(pk=ticket.pk)).get().followup_agent_id

    def test_a_follow_up_belongs_to_the_specialist_whose_call_set_it(self):
        ann, ben, cat = self.case('ann'), self.case('ben'), self.case('cat')
        record_outcome(ann.pk, self.user, self.zoom(ann, 'no_answer').pk, 'no_answer')
        record_outcome(ben.pk, self.user, self.zoom(ben, 'answered').pk, 'callback', '', '', add_workdays(self.now, 2))
        self.assertEqual([self.followup_agent(ticket) for ticket in (ann, ben, cat)], [self.agent.pk, self.agent.pk, None])

    def test_an_undiscussed_case_on_the_call_is_the_callers_follow_up_too(self):
        epa, other = self.learner_with('epa', 'epa')
        save_call(epa.pk, self.user, [{'id': epa.pk, 'outcome': 'not_discussed'}, {'id': other.pk, 'outcome': 'not_discussed'}])
        self.assertEqual((self.followup_agent(epa), self.followup_agent(other)), (self.agent.pk, self.agent.pk))

    def test_the_latest_call_owns_the_follow_up_and_a_reopen_clears_it(self):
        ann = self.case('ann')
        record_outcome(ann.pk, self.user, self.zoom(ann, 'no_answer').pk, 'no_answer')
        bob = Agent.objects.create(user=get_user_model().objects.create_user('bob'), display_name='Bob',
                                   zoom_email='bob@kbc.test', zoom_account='student')
        event(ann, 'outcome', {'outcome': 'callback'}, bob)
        self.assertEqual(self.followup_agent(ann), bob.pk)
        CaseTicket.objects.filter(pk=ann.pk).update(evidence_after=timezone.now() + timedelta(seconds=1))
        self.assertIsNone(self.followup_agent(ann))

class Directory(dict):
    managers = {}


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class AgentRemovalTests(TestCase):
    """What happens to a specialist's learners when the specialist is switched off or their account is closed."""
    databases = {'default', 'login_db'}

    def setUp(self):
        patches = [mock.patch('callcentre.sources.cached_directory', return_value=Directory()),
                   mock.patch('callcentre.sources.on_break_emails', return_value=frozenset()),
                   mock.patch('callcentre.sources.active_case_contacts', return_value=Q())]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        users = get_user_model().objects
        self.alice = Agent.objects.create(user=users.create_user('alice'), display_name='Alice', zoom_email='alice@kbc.test', zoom_account='student')
        self.bob = Agent.objects.create(user=users.create_user('bob'), display_name='Bob', zoom_email='bob@kbc.test', zoom_account='student')
        Allocation.objects.create(learner_email='ann@x.test', agent=self.bob, updated_by='manager')
        self.ticket = CaseTicket.objects.create(source_type='epa', reason_key='epa:ann', learner_email='ann@x.test', learner_name='Ann',
                                                learner_phone='+447700900001', due_at=timezone.now() + timedelta(days=2))

    def switch_off(self, agent):
        from .manage_views import save_agent   # what the Zoom Phone page does when Active is unticked
        save_agent(agent, {'active': False})

    def test_an_active_specialists_learner_is_theirs_alone(self):
        self.assertEqual(allocated_owner('ann@x.test', 'epa'), self.bob.pk)
        with self.assertRaisesMessage(PermissionDenied, 'Bob looks after this learner'):
            can_work(self.ticket, self.alice.user)

    def test_a_switched_off_specialists_learners_go_to_the_shared_queue(self):
        self.switch_off(self.bob)
        self.assertEqual(owners(), {})
        self.assertIsNone(allocated_owner('ann@x.test', 'epa'))
        self.assertEqual(can_work(self.ticket, self.alice.user), self.alice)   # anyone can now call Ann
        # The allocation is kept, so switching Bob back on gives him his learners again.
        self.assertEqual(Allocation.objects.get(learner_email='ann@x.test').agent, self.bob)
        self.bob.active = True
        self.bob.save()
        self.assertEqual(allocated_owner('ann@x.test', 'epa'), self.bob.pk)

    def test_a_closed_login_does_the_same(self):
        self.bob.user.is_active = False
        self.bob.user.save()
        self.assertIsNone(allocated_owner('ann@x.test', 'epa'))
        self.assertEqual(can_work(self.ticket, self.alice.user), self.alice)

    def test_a_switched_off_specialist_cannot_call_or_claim(self):
        self.switch_off(self.bob)
        self.assertIsNone(agent_for(self.bob.user))
        with self.assertRaisesMessage(PermissionDenied, 'Agent is inactive.'):
            claim(self.ticket.pk, self.bob)

    def test_a_case_a_switched_off_specialist_was_working_on_is_released_at_once(self):
        claim(self.ticket.pk, self.bob)
        self.switch_off(self.bob)
        self.ticket.refresh_from_db()
        self.assertEqual((self.ticket.claimed_by, self.ticket.status), (None, 'new'))
        self.assertEqual(can_work(self.ticket, self.alice.user), self.alice)

    def test_a_case_held_by_a_closed_login_is_released_by_the_next_cycle(self):
        from .services import expire_claims
        claim(self.ticket.pk, self.bob)
        self.bob.user.is_active = False
        self.bob.user.save()
        expire_claims(timezone.now())
        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.claimed_by)

    def test_specialists_and_their_history_cannot_be_deleted(self):
        with self.assertRaises(ValidationError):
            self.bob.delete()
        with self.assertRaises(ProtectedError):
            self.bob.user.delete()

    def test_the_allocation_page_names_a_switched_off_specialists_learners(self):
        import json
        from django.test import RequestFactory
        from .manage_views import allocations
        people = {'ann@x.test': {'learner_email': 'ann@x.test', 'learner_name': 'Ann', 'programme': '', 'organisation': '',
                                 'coach': '', 'manager_email': '', 'manager_name': ''}}
        self.switch_off(self.bob)
        request = RequestFactory().get('/')
        request.user = get_user_model().objects.create_superuser('director', 'director@kbc.test', 'x')
        with mock.patch('callcentre.manage_views.learner_directory', return_value=people):
            data = json.loads(allocations(request).content)
        # Ann shows in the shared queue, still named as Bob's, and Bob is listed for a handover.
        self.assertEqual((data['learners'][0]['agent_id'], data['learners'][0]['allocated_to']), (None, self.bob.pk))
        self.assertEqual(data['inactive'], [{'id': self.bob.pk, 'display_name': 'Bob', 'learners': 1}])

    def test_a_manager_approves_or_rejects_an_ai_suggestion_from_the_director_page(self):
        import json
        from django.test import RequestFactory
        from .views import action
        director = get_user_model().objects.create_superuser('director', 'director@kbc.test', 'x')

        def post(ticket, command, data):
            request = RequestFactory().post('/', data=json.dumps(data), content_type='application/json')
            request.user, request._dont_enforce_csrf_checks = director, True
            return action(request, ticket.pk, command)

        rejected = CaseTicket.objects.create(source_type='epa', reason_key='epa:ben', learner_email='ben@x.test', learner_name='Ben',
                                             status='ai_suggested_close', due_at=timezone.now() + timedelta(days=2))
        CaseTicket.objects.filter(pk=self.ticket.pk).update(status='ai_suggested_close')
        self.assertEqual(post(self.ticket, 'resolve', {'note': 'Learner confirmed the EPA date.', 'option': 'epa_step'}).status_code, 200)
        self.assertEqual(post(rejected, 'reject_ai', {'note': 'Not done yet.'}).status_code, 200)
        self.ticket.refresh_from_db()
        rejected.refresh_from_db()
        self.assertEqual((self.ticket.status, rejected.status), ('resolved', 'new'))


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class EmployerSpecialistTests(TestCase):
    """The director hands employer satisfaction calls to chosen specialists: only they work them, and only those."""
    databases = {'default', 'login_db'}

    def setUp(self):
        patches = [mock.patch('callcentre.sources.cached_directory', return_value=Directory()),
                   mock.patch('callcentre.sources.on_break_emails', return_value=frozenset()),
                   mock.patch('callcentre.sources.active_case_contacts', return_value=Q())]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        users = get_user_model().objects
        self.alice = Agent.objects.create(user=users.create_user('alice'), display_name='Alice', zoom_email='alice@kbc.test', zoom_account='student')
        self.bob = Agent.objects.create(user=users.create_user('bob'), display_name='Bob', zoom_email='bob@kbc.test', zoom_account='student')
        # Ann is Bob's learner; Max is a line manager with an employer satisfaction case.
        Allocation.objects.create(learner_email='ann@x.test', agent=self.bob, updated_by='manager')
        due = timezone.now() + timedelta(days=2)
        self.learner = CaseTicket.objects.create(source_type='epa', reason_key='epa:ann', learner_email='ann@x.test', learner_name='Ann',
                                                 learner_phone='+447700900001', due_at=due)
        self.employer = CaseTicket.objects.create(source_type='employer_feedback', reason_key='employer:max', learner_email='max@x.test',
                                                  learner_name='Max', learner_phone='+447700900002', due_at=due)

    def make_specialists(self, *agents, enabled=True, revision=0):
        from .employer_desk import save
        return save({'enabled': enabled, 'agent_ids': [agent.pk for agent in agents]}, revision, 'Employer calls week', 'director')

    def test_it_is_off_until_a_director_switches_it_on(self):
        from .employer_desk import specialists
        self.assertEqual(specialists(), frozenset())
        claim(self.employer.pk, self.alice)   # anyone may call an employer
        self.assertEqual(allocated_owner('ann@x.test', 'epa'), self.bob.pk)

    def test_only_the_specialists_call_employers_and_they_call_nobody_else(self):
        self.make_specialists(self.bob)
        with self.assertRaisesMessage(Conflict, 'made by the employer specialists'):
            create_intent(self.employer.pk, self.alice)
        with self.assertRaisesMessage(PermissionDenied, 'made by the employer specialists'):
            can_work(self.employer, self.alice.user)
        create_intent(self.employer.pk, self.bob)
        with self.assertRaisesMessage(Conflict, 'employer satisfaction calls only'):
            create_intent(self.learner.pk, self.bob)

    def test_a_specialists_learners_go_to_the_shared_queue_and_come_back_when_it_is_switched_off(self):
        revision = self.make_specialists(self.bob)
        self.assertIsNone(allocated_owner('ann@x.test', 'epa'))
        self.assertIsNone(allocated_owner('max@x.test', 'employer_feedback'))
        claim(self.learner.pk, self.alice)   # Ann is in the shared queue now
        self.make_specialists(enabled=False, revision=revision)
        self.assertEqual(allocated_owner('ann@x.test', 'epa'), self.bob.pk)

    def test_a_switched_off_specialist_no_longer_counts(self):
        self.make_specialists(self.bob)
        Agent.objects.filter(pk=self.bob.pk).update(active=False)
        from .employer_desk import specialists
        self.assertEqual(specialists(), frozenset())

    def test_the_choice_is_checked_and_kept_with_its_reason(self):
        from .employer_desk import history
        with self.assertRaisesMessage(ValueError, 'Choose at least one employer specialist'):
            self.make_specialists()
        revision = self.make_specialists(self.alice)
        with self.assertRaisesMessage(Conflict, 'since you opened them'):
            self.make_specialists(self.bob)   # an out-of-date revision
        self.make_specialists(self.bob, revision=revision)
        self.assertEqual([entry['value']['agent_ids'] for entry in history()], [[self.bob.pk], [self.alice.pk]])

    # Optional calls: the employer specialist calls any learner, and can complete their satisfaction review

    def optional_call(self, agent):
        ann_review = CaseTicket.objects.create(source_type='learner_satisfaction', reason_key='satisfaction:ann', learner_email='ann@x.test',
                                               learner_name='Ann', learner_phone='+447700900001', due_at=timezone.now() + timedelta(days=2))
        case = CaseTicket.objects.create(source_type='manual', reason_key='optional:ann', learner_email='ann@x.test', learner_name='Ann',
                                         learner_phone='+447700900001', due_at=timezone.now() + timedelta(days=365),
                                         source_data={'title': 'Optional call', 'optional': True, 'agent_id': agent.pk})
        return case, ann_review, create_intent(case.pk, agent)

    def zoom_reports(self, intent, result):
        # The call made just now, after the review was opened.
        call = ZoomPhoneCall.objects.create(
            source_account='student', zoom_account_id='account', history_id=str(uuid.uuid4()), direction='outbound',
            started_at=timezone.now(), ended_at=timezone.now(), result=result)
        match = CallMatch.objects.create(call=call, agent=intent.agent, learner_email=intent.learner_email)
        CallIntent.objects.filter(pk=intent.pk).update(matched_call=call)
        for ticket in intent.tickets.all():
            CaseCall.objects.create(ticket=ticket, match=match)
        apply_call_result(match)

    def test_an_optional_call_covers_only_itself_and_the_learners_satisfaction_review(self):
        self.make_specialists(self.bob)
        case, review, intent = self.optional_call(self.bob)
        self.assertEqual(set(intent.tickets.all()), {case, review})
        # Only the call itself is Bob's: the review and Ann's other case stay on everyone else's lists.
        review.refresh_from_db()
        self.learner.refresh_from_db()
        self.assertEqual((review.claimed_by_id, self.learner.claimed_by_id), (None, None))
        with self.assertRaisesMessage(PermissionDenied, 'Bob looks after this learner'):
            can_work(case, self.alice.user)

    def test_saving_an_optional_call_closes_it_unless_a_callback_is_booked(self):
        self.make_specialists(self.bob)
        case, _, _ = self.optional_call(self.bob)
        save_call(case.pk, self.bob.user, [{'id': case.pk, 'outcome': 'no_answer'}])
        case.refresh_from_db()
        self.assertEqual(case.status, 'resolved')

    def test_feedback_on_the_call_completes_the_review_once_zoom_reports_it_answered(self):
        from .learner_satisfaction import complete
        self.make_specialists(self.bob)
        _, review, intent = self.optional_call(self.bob)
        feedback = dict(score=5, problem='None', action='No action needed', note='Very happy with the course so far.')
        self.assertFalse(complete(review.pk, self.bob.user, **feedback))   # held: Zoom has not reported the call
        review.refresh_from_db()
        self.assertNotEqual(review.status, 'resolved')
        # The case shows the feedback as saved and waiting, so the form is not offered again as if nothing happened.
        self.assertEqual((held_feedback(review)['state'], held_feedback(review)['by']), ('held', 'Bob'))
        self.zoom_reports(intent, 'answered')
        review.refresh_from_db()
        self.assertEqual((review.status, review.source_data['feedback']['score']), ('resolved', 5))
        self.assertIsNone(held_feedback(review))
        self.assertIn('next_due_at', review.source_data)

    def test_held_feedback_is_dropped_when_zoom_reports_the_call_unanswered(self):
        from .learner_satisfaction import complete
        self.make_specialists(self.bob)
        _, review, intent = self.optional_call(self.bob)
        complete(review.pk, self.bob.user, score=4, problem='None', action='No action needed', note='Happy with the coaching.')
        self.zoom_reports(intent, 'no_answer')
        review.refresh_from_db()
        self.assertNotEqual(review.status, 'resolved')
        self.assertTrue(review.events.filter(kind='feedback_pending_dropped').exists())
        self.assertEqual(held_feedback(review)['state'], 'dropped')
        self.assertIn('answered', held_feedback(review)['reason'])
        with self.assertRaisesMessage(ValueError, 'not answered'):
            complete(review.pk, self.bob.user, score=4, problem='None', action='No action needed', note='Happy with the coaching.')

    # The call log: every call and what it did to each case on it

    def logged(self, agents=None):
        from .call_log import call_log
        return call_log(timezone.now() - timedelta(days=1), timezone.now() + timedelta(seconds=1), agents)

    def test_the_call_log_shows_the_feedback_and_the_closing_an_optional_call_brought(self):
        from .learner_satisfaction import complete
        self.make_specialists(self.bob)
        case, review, intent = self.optional_call(self.bob)
        complete(review.pk, self.bob.user, score=5, problem='None', action='No action needed', note='Very happy with the course so far.')
        save_call(case.pk, self.bob.user, [{'id': case.pk, 'outcome': 'reached'}])
        row, = self.logged()['calls']
        cases = {item['id']: item for item in row['cases']}
        self.assertEqual((row['agent']['name'], row['zoom']['state'], row['saved']), ('Bob', 'waiting', True))
        self.assertEqual(cases[review.pk]['feedback']['state'], 'waiting')   # held until Zoom reports the call
        self.assertIsNotNone(cases[case.pk]['closed'])
        self.zoom_reports(intent, 'answered')
        row, = self.logged()['calls']
        review_row = next(item for item in row['cases'] if item['id'] == review.pk)
        self.assertEqual((row['zoom']['state'], review_row['feedback']['state'], review_row['feedback']['score']), ('answered', 'completed', 5))
        self.assertEqual((review_row['status'], self.logged()['summary']['feedback']), ('resolved', 1))

    def test_the_call_log_shows_the_outcome_once_zoom_reports_it_and_the_booking_made_on_the_call(self):
        intent = create_intent(self.learner.pk, self.bob)
        event(self.learner, 'session_booked', {'session_type': 'pr', 'start': '2026-11-02T10:00:00+00:00', 'coach': 'Coach Carter',
                                               'join_url': 'https://zoom.test/j/1', 'link_warning': ''}, self.bob)
        save_call(self.learner.pk, self.bob.user, [{'id': self.learner.pk, 'outcome': 'reached', 'option': 'epa_step'}])
        case, = self.logged()['calls'][0]['cases']
        self.assertEqual((case['outcome']['state'], case['outcome']['outcome']), ('waiting', 'reached'))
        self.assertEqual(case['bookings'][0]['coach'], 'Coach Carter')
        self.zoom_reports(intent, 'answered')
        case, = self.logged()['calls'][0]['cases']
        self.assertEqual((case['outcome']['state'], case['outcome']['option']), ('applied', 'epa_step'))
        self.assertEqual(self.logged()['summary'], {'calls': 1, 'answered': 1, 'not_matched': 0, 'closed': 0, 'booked': 1, 'feedback': 0})

    def test_what_happens_after_the_next_call_belongs_to_the_next_call(self):
        first = create_intent(self.learner.pk, self.bob)
        save_call(self.learner.pk, self.bob.user, [{'id': self.learner.pk, 'outcome': 'not_discussed'}])
        CallIntent.objects.filter(pk=first.pk).update(created_at=timezone.now() - timedelta(minutes=15))   # a new call, not a redial
        CaseTicket.objects.filter(pk=self.learner.pk).update(next_followup_at=None)   # due again
        create_intent(self.learner.pk, self.bob)
        event(self.learner, 'session_booked', {'session_type': 'pr', 'start': '2026-11-02T10:00:00+00:00', 'coach': 'Coach Carter'}, self.bob)
        newer, older = self.logged()['calls']
        self.assertEqual((len(newer['cases'][0]['bookings']), len(older['cases'][0]['bookings'])), (1, 0))
        self.assertEqual(older['cases'][0]['outcome']['state'], 'not_discussed')
        self.assertFalse(newer['saved'])

    def test_an_outcome_zoom_never_reported_a_call_for_is_shown_as_not_applied(self):
        intent = create_intent(self.learner.pk, self.bob)
        save_call(self.learner.pk, self.bob.user, [{'id': self.learner.pk, 'outcome': 'no_answer'}])
        CallIntent.objects.filter(pk=intent.pk).update(created_at=timezone.now() - timedelta(minutes=40))
        row, = self.logged()['calls']
        self.assertEqual(row['zoom']['state'], 'not_matched')
        self.assertEqual((row['cases'][0]['outcome']['state'], row['cases'][0]['outcome']['reason']),
                         ('dropped', 'Zoom has no call for this Call press.'))

    def test_a_specialist_sees_only_their_own_calls_and_a_manager_sees_everyones(self):
        import json
        from django.test import RequestFactory
        from .views import call_log_view
        create_intent(self.learner.pk, self.bob)
        create_intent(self.employer.pk, self.alice)

        def get(user, **query):
            request = RequestFactory().get('/', query)
            request.user = user
            with mock.patch('callcentre.views.refused', return_value=None):
                response = call_log_view(request)
            return response.status_code, json.loads(response.content)

        status, data = get(self.bob.user)
        self.assertEqual((status, [row['agent']['name'] for row in data['calls']], 'agents' in data), (200, ['Bob'], False))
        self.assertEqual(get(self.bob.user, agent_id=self.alice.pk)[0], 403)
        director = get_user_model().objects.create_superuser('director', 'director@kbc.test', 'x')
        status, data = get(director)
        self.assertEqual(sorted(row['agent']['name'] for row in data['calls']), ['Alice', 'Bob'])
        self.assertEqual([row['agent']['name'] for row in get(director, agent_id=self.alice.pk)[1]['calls']], ['Alice'])
        self.assertEqual(get(director, days=5)[0], 400)


def zoom_accounts(*accounts):
    """Zoom accounts as the Zoom Phone page saves them: (key, name, Zoom Account ID), no secret."""
    Setting.objects.update_or_create(key='zoom_accounts', defaults={'updated_by': 'director', 'value': {'accounts': [
        {'key': key, 'label': label, 'account_id': account_id, 'client_id': 'client', 'secret': '', 'secret_end': ''}
        for key, label, account_id in accounts]}})


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class PhoneLineTests(TestCase):
    """The director's Zoom numbers: add them, test them, and see whether each line's calls reach a specialist."""
    databases = {'default', 'login_db'}
    LINE = '+441622958989'

    def setUp(self):
        patches = [mock.patch('callcentre.zoom_lines.zoom_lookup', return_value={
                       'checked': False, 'found': None, 'account': '', 'status': '', 'assignee': '', 'problem': 'no scope'}),
                   mock.patch('callcentre.sources.cached_directory', return_value=Directory()),
                   mock.patch('callcentre.sources.on_break_emails', return_value=frozenset()),
                   mock.patch('callcentre.sources.active_case_contacts', return_value=Q())]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.tina = Agent.objects.create(user=get_user_model().objects.create_user('tina'), display_name='Tina',
                                         zoom_email='tina@kbc.test', zoom_account='student')
        zoom_accounts(('student', 'Student', 'account'), ('office', 'Office', 'office-account'))

    def call(self, matched, **fields):
        call = ZoomPhoneCall.objects.create(**{
            'source_account': 'student', 'zoom_account_id': 'account', 'history_id': str(uuid.uuid4()), 'direction': 'outbound',
            'caller_number': self.LINE, 'callee_number': '+447700900001', 'started_at': timezone.now() - timedelta(minutes=5),
            'ended_at': timezone.now(), 'result': 'answered', **fields})
        if matched:
            CallMatch.objects.create(call=call, agent=self.tina, learner_email='ann@x.test')
        return call

    def line(self, **fields):
        from .zoom_lines import add
        return add({'number': self.LINE, 'account': 'student', 'label': 'Student line', **fields}, 'director')

    def give(self, agent, number):
        from .manage_views import save_agent
        return save_agent(agent, {'zoom_phone_number': number})

    def test_a_number_is_added_once_with_its_zoom_account(self):
        from .zoom_lines import add, stored
        with self.assertRaisesMessage(ValueError, 'international format'):
            add({'number': 'hello', 'account': 'student'}, 'director')
        with self.assertRaisesMessage(ValueError, 'Choose the Zoom account'):
            add({'number': self.LINE}, 'director')
        self.line(zoom_email='Student@KBC.test')
        with self.assertRaisesMessage(ValueError, 'already in the list'):
            self.line()
        with self.assertRaisesMessage(ValueError, 'already has the Zoom user email'):
            add({'number': '+441622958990', 'account': 'student', 'zoom_email': 'student@kbc.test'}, 'director')
        self.assertEqual([(line['number'], line['account'], line['zoom_email']) for line in stored()],
                         [(self.LINE, 'student', 'student@kbc.test')])

    def test_a_specialist_gets_one_listed_number_and_takes_its_zoom_account(self):
        from .zoom_lines import add
        self.line()
        add({'number': '+441622958955', 'account': 'office'}, 'director')
        with self.assertRaisesMessage(ValueError, 'Phone numbers list'):
            self.give(self.tina, '+441622000000')
        self.assertEqual(self.give(self.tina, '+441622958955').zoom_account, 'office')   # the number's account
        self.give(self.tina, self.LINE)
        safiyah = Agent.objects.create(user=get_user_model().objects.create_user('safiyah'), display_name='Safiyah',
                                       zoom_email='safiyah@kbc.test', zoom_account='student')
        with self.assertRaisesMessage(ValueError, 'Tina already has +441622958989: one number per specialist'):
            self.give(safiyah, self.LINE)

    def test_a_call_on_a_listed_line_is_its_specialists_whatever_email_zoom_shows(self):
        from .services import match_call
        self.line()
        self.give(self.tina, self.LINE)
        ann = CaseTicket.objects.create(source_type='epa', reason_key='epa:ann', learner_email='ann@x.test', learner_name='Ann',
                                        learner_phone='+447700900001', due_at=timezone.now() + timedelta(days=2))
        CaseTicket.objects.filter(pk=ann.pk).update(created_at=timezone.now() - timedelta(hours=1))
        CallIntent.objects.filter(pk=create_intent(ann.pk, self.tina).pk).update(created_at=timezone.now() - timedelta(minutes=6))
        # Zoom names a team user, not Tina's sign-in email: the line still says it is Tina's call.
        call = self.call(matched=False, caller_email='team@zoom.test')
        self.assertEqual(match_call(call.pk).agent_id, self.tina.pk)

    def test_the_status_follows_the_lines_calls_setup_and_who_has_it(self):
        from .zoom_lines import test, update
        self.line()
        self.call(matched=False)
        self.assertEqual(test(self.LINE, 'director')['status'], 'no_agent')   # nobody has the number
        self.give(self.tina, self.LINE)
        result = test(self.LINE, 'director')
        self.assertEqual((result['status'], result['unmatched_7_days'], result['agents']), ('unmatched', 1, ['Tina']))
        CallMatch.objects.create(call=ZoomPhoneCall.objects.get(), agent=self.tina, learner_email='ann@x.test')
        self.assertEqual(test(self.LINE, 'director')['status'], 'working')
        # Zoom attaches a user to the line's calls that the number does not have yet.
        self.call(matched=True, caller_email='student@kbc.test')
        result = test(self.LINE, 'director')
        self.assertEqual(result['status'], 'check_setup')
        self.assertIn('student@kbc.test', result['warnings'][0])
        update(self.LINE, {'account': 'student', 'zoom_email': 'student@kbc.test'}, 'director')
        self.assertEqual(test(self.LINE, 'director')['status'], 'ready')   # no call since the change yet
        self.call(matched=True, caller_email='student@kbc.test', started_at=timezone.now())
        self.assertEqual(test(self.LINE, 'director')['status'], 'working')

    def test_changing_a_numbers_account_moves_its_specialist_too(self):
        from .zoom_lines import update
        self.line()
        self.give(self.tina, self.LINE)
        update(self.LINE, {'account': 'office'}, 'director')
        self.tina.refresh_from_db()
        self.assertEqual(self.tina.zoom_account, 'office')

    def test_refresh_brings_each_number_up_to_date_with_zoom_and_tests_them_all(self):
        from .zoom_lines import add, refresh, stored
        add({'number': self.LINE, 'account': 'student', 'label': 'Alice Saunders', 'from_zoom': True}, 'director')
        add({'number': '+441622958955', 'account': 'student', 'label': 'My own name'}, 'director')
        add({'number': '+441622958000', 'account': 'student'}, 'director')
        self.give(self.tina, self.LINE)
        in_zoom = {'student': [{'number': '+441622958955', 'display_name': 'Engagement Team', 'assignee': 'Team', 'status': 'normal'}],
                   'office': [{'number': self.LINE, 'display_name': 'Tina line', 'assignee': 'Tina Wright', 'status': 'normal'}]}
        with mock.patch('callcentre.zoom_accounts.zoom_numbers', side_effect=lambda key: in_zoom[key]):
            result = refresh('director')
        lines = {line['number']: line for line in stored()}
        # Zoom renamed and moved the first number; the second keeps the name typed here; the third is not in Zoom any more.
        self.assertEqual((lines[self.LINE]['label'], lines[self.LINE]['account'], lines[self.LINE]['zoom_owner']), ('Tina line', 'office', 'Tina Wright'))
        self.assertEqual((lines['+441622958955']['label'], lines['+441622958955']['zoom_name']), ('My own name', 'Engagement Team'))
        self.assertEqual(result['not_in_zoom'], ['+441622958000'])
        self.assertEqual(len(result['changes']), 2)
        self.tina.refresh_from_db()
        self.assertEqual(self.tina.zoom_account, 'office')   # the specialist follows the number
        self.assertTrue(all(line['test'] for line in lines.values()))
        self.assertEqual(lines['+441622958000']['test']['status'], 'not_found')

    def test_calls_from_before_a_change_no_longer_raise_warnings(self):
        from .zoom_lines import test, update
        self.line()
        self.give(self.tina, self.LINE)
        self.call(matched=True, caller_email='old@kbc.test', started_at=timezone.now() - timedelta(hours=2))
        self.assertIn('old@kbc.test', test(self.LINE, 'director')['warnings'][0])
        update(self.LINE, {'account': 'student', 'zoom_email': 'new@kbc.test'}, 'director')
        self.assertEqual(test(self.LINE, 'director')['warnings'], [])   # the old call was made before the change

    def test_calls_not_matched_before_a_change_are_shown_but_no_longer_count(self):
        from .zoom_lines import test, update
        self.line()
        self.give(self.tina, self.LINE)
        self.call(matched=False, started_at=timezone.now() - timedelta(hours=2))   # from the Zoom app, under the old setup
        self.assertEqual(test(self.LINE, 'director')['status'], 'unmatched')
        update(self.LINE, {'account': 'student', 'zoom_email': 'tina@kbc.test'}, 'director')
        result = test(self.LINE, 'director')
        self.assertEqual((result['status'], result['unmatched_7_days'], result['unmatched_since_change']), ('ready', 1, 0))
        self.assertTrue(result['changed_at'])
        self.call(matched=False, started_at=timezone.now())   # a new one does count
        self.assertEqual(test(self.LINE, 'director')['status'], 'unmatched')

    def test_a_number_in_use_cannot_be_removed(self):
        from .zoom_lines import remove, stored
        self.line()
        self.give(self.tina, self.LINE)
        with self.assertRaisesMessage(ValueError, 'Tina has this number'):
            remove(self.LINE, 'director')
        self.give(self.tina, '')
        remove(self.LINE, 'director')
        self.assertEqual(stored(), [])


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class ZoomAccountTests(TestCase):
    """The director adds the Zoom accounts on the Zoom Phone page: the secret is kept encrypted and never sent back."""
    databases = {'default', 'login_db'}
    APP = {'label': 'Student', 'account_id': 'AbC123', 'client_id': 'client_1', 'client_secret': 'top-secret-9f2a'}

    def setUp(self):
        from cryptography.fernet import Fernet
        patch = mock.patch.dict('os.environ', {'ZOOM_SECRETS_KEY': Fernet.generate_key().decode()})
        patch.start()
        self.addCleanup(patch.stop)

    def test_an_account_is_saved_with_its_secret_encrypted_and_never_shown(self):
        from .zoom_accounts import add, public, stored
        from .zoom_phone import account_config, account_labels, validate_config
        add(self.APP, 'director')
        account, = stored()
        self.assertNotIn('top-secret', str(account))
        self.assertEqual((public(account)['secret_end'], 'secret' in public(account)), ('9f2a', False))
        self.assertEqual(account_labels(), {'student': 'Student'})
        self.assertEqual(account_config('student')['client_secret'], 'top-secret-9f2a')
        self.assertEqual(validate_config('student')['account_id'], 'AbC123')

    def test_without_the_servers_key_nothing_is_saved_and_the_page_is_told_why(self):
        from .errors import FieldError
        from .zoom_accounts import add, stored
        with mock.patch.dict('os.environ', {'ZOOM_SECRETS_KEY': ''}):
            with self.assertRaisesMessage(FieldError, 'ZOOM_SECRETS_KEY is missing') as raised:
                add(self.APP, 'director')
        self.assertEqual((raised.exception.field, stored()), ('client_secret', []))

    def test_each_mistake_names_its_field(self):
        from .errors import FieldError
        from .zoom_accounts import add
        for field, value, message in (('label', '', 'Enter the name'), ('account_id', 'has spaces', 'does not look like'),
                                      ('client_secret', '', 'Enter the Client Secret')):
            with self.assertRaisesMessage(FieldError, message) as raised:
                add({**self.APP, field: value}, 'director')
            self.assertEqual(raised.exception.field, field)
        add(self.APP, 'director')
        with self.assertRaisesMessage(FieldError, 'already uses this Account ID') as raised:
            add({**self.APP, 'label': 'Again'}, 'director')
        self.assertEqual(raised.exception.field, 'account_id')

    def test_an_account_synced_before_gets_its_call_history_back(self):
        from .zoom_accounts import add, stored
        ZoomSyncState.objects.create(source_account='office', zoom_account_id='Off1ce')
        ZoomSyncState.objects.create(source_account='finance', zoom_account_id='0ther')
        add({**self.APP, 'label': 'Accounts team', 'account_id': 'Off1ce'}, 'director')
        add({**self.APP, 'label': 'Finance', 'account_id': 'New1'}, 'director')
        # Finance is new: it never takes the key another Zoom account's calls were synced under.
        self.assertEqual([account['key'] for account in stored()], ['office', 'finance_2'])

    def test_an_edit_keeps_the_secret_unless_a_new_one_is_given(self):
        from .zoom_accounts import add, update
        from .zoom_phone import account_config
        add(self.APP, 'director')
        update('student', {'label': 'Students', 'client_id': 'client_2', 'client_secret': ''}, 'director')
        self.assertEqual(account_config('student'), {'account_id': 'AbC123', 'client_id': 'client_2', 'client_secret': 'top-secret-9f2a'})
        update('student', {'label': 'Students', 'client_id': 'client_2', 'client_secret': 'new-secret'}, 'director')
        self.assertEqual(account_config('student')['client_secret'], 'new-secret')

    def test_an_account_with_numbers_on_it_cannot_be_removed(self):
        from .zoom_accounts import add, remove, stored
        from .zoom_lines import add as add_line
        add(self.APP, 'director')
        add_line({'number': '+441622958989', 'account': 'student'}, 'director')
        with self.assertRaisesMessage(ValueError, '+441622958989'):
            remove('student', 'director')
        self.assertEqual(len(stored()), 1)

    def test_the_test_names_the_field_or_the_missing_zoom_scope(self):
        from .zoom_accounts import add, test

        class Response:
            def __init__(self, status, payload):
                self.status_code, self.ok, self.payload = status, status < 400, payload

            def json(self):
                return self.payload

            def close(self):
                pass

        add(self.APP, 'director')
        refused = {'field': 'client_id', 'message': 'Zoom does not accept the Client ID and Client Secret together.'}
        with mock.patch('callcentre.zoom_accounts._sign_in', return_value=(None, refused)):
            result = test('student', 'director')
        self.assertEqual((result['status'], result['problem']['field']), ('failed', 'client_id'))
        client = mock.Mock()
        client.api_get.side_effect = [Response(200, {}), Response(200, {}), Response(400, {
            'code': 4711, 'message': 'Invalid access token, does not contain scopes:[phone:read:list_numbers:admin].'}), Response(200, {})]
        with mock.patch('callcentre.zoom_accounts._sign_in', return_value=(client, None)):
            result = test('student', 'director')
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['checks'][2]['scopes'], ['phone:read:list_numbers:admin'])
        self.assertIn('phone:read:list_numbers:admin', result['checks'][2]['message'])
        # Zoom's token lists the granted scopes: the Zoom status needs one; renaming is optional and never makes it partial.
        client = mock.Mock(scopes=frozenset({'phone:read:list_call_logs:admin', 'user:read:presence_status:admin'}))
        client.api_get.return_value = Response(200, {})
        with mock.patch('callcentre.zoom_accounts._sign_in', return_value=(client, None)):
            result = test('student', 'director')
        found = {check['name']: check for check in result['checks']}
        self.assertEqual((result['status'], found['presence']['ok'], found['rename']['ok']), ('working', True, False))
        self.assertIn('phone:update:number:admin', found['rename']['message'])
        client.scopes = frozenset({'phone:write:admin'})
        with mock.patch('callcentre.zoom_accounts._sign_in', return_value=(client, None)):
            result = test('student', 'director')
        found = {check['name']: check for check in result['checks']}
        self.assertEqual((result['status'], found['presence']['scopes'], found['rename']['ok']), ('partial', ['user:read:presence_status:admin'], True))

    def test_an_unexpected_server_error_reaches_the_page_with_a_reference(self):
        import json
        from django.test import RequestFactory
        from .views import authenticated

        @authenticated
        def broken(request):
            raise RuntimeError('boom')
        request = RequestFactory().get('/api/callcentre/broken/')
        request.user = get_user_model().objects.create_user('someone')
        with mock.patch('callcentre.views.refused', return_value=None), self.assertLogs('callcentre.views', 'ERROR') as logged, \
                self.settings(DEBUG=True):
            response = broken(request)
        data = json.loads(response.content)
        self.assertEqual(response.status_code, 500)
        self.assertIn(data['reference'], logged.output[0])
        self.assertIn('RuntimeError: boom', data['debug']['error'])
        self.assertIn('in broken', data['debug']['where'])

    def test_the_accounts_numbers_are_listed_with_their_zoom_owner_and_whether_they_are_in_our_list(self):
        from .zoom_accounts import add, numbers
        from .zoom_lines import add as add_line

        class Response:
            ok, status_code = True, 200

            def __init__(self, payload):
                self.payload = payload

            def json(self):
                return self.payload

            def close(self):
                pass

        add(self.APP, 'director')
        add_line({'number': '+441622958989', 'account': 'student'}, 'director')
        pages = [Response({'next_page_token': 'next', 'phone_numbers': [
                     {'number': '+44 1622 958989', 'display_name': 'Student line', 'status': 'normal',
                      'assignee': {'id': 'u1', 'name': 'Team', 'type': 'user', 'extension_number': 801}}]}),
                 Response({'next_page_token': '', 'phone_numbers': [{'number': '+441622958955', 'status': 'normal'}]}),
                 Response({'policy': {'auto_call_recording': {'enable': True, 'recording_calls': 'both', 'recording_transcription': True}}})]
        with mock.patch('callcentre.zoom_phone.ZoomClient.api_get', side_effect=pages) as api_get:
            found = numbers('student')
        self.assertEqual(api_get.call_args_list[1].kwargs['params']['next_page_token'], 'next')   # every page is read
        self.assertEqual([(item['number'], item['listed'], item['assignee'], item['extension']) for item in found],
                         [('+441622958955', False, '', ''), ('+441622958989', True, 'Team', '801')])
        self.assertEqual(api_get.call_args_list[2].args[0], '/phone/users/u1')
        self.assertEqual((found[1]['recording']['state'], found[1]['recording']['calls'], found[1]['recording']['transcription']),
                         ('on', 'all calls', True))
        self.assertEqual(found[0]['recording']['state'], 'not_user')   # nobody has it in Zoom

    def test_a_missing_phone_users_scope_is_named_once_for_every_number(self):
        from .zoom_accounts import add, numbers

        class Response:
            def __init__(self, status, payload):
                self.status_code, self.ok, self.payload = status, status < 400, payload

            def json(self):
                return self.payload

            def close(self):
                pass

        add(self.APP, 'director')
        owned = [{'number': f'+44162295890{n}', 'assignee': {'id': f'u{n}', 'name': f'User {n}', 'type': 'user'}} for n in (1, 2)]
        pages = [Response(200, {'phone_numbers': owned}),
                 Response(400, {'code': 4711, 'message': 'Invalid access token, does not contain scopes:[phone:read:user:admin].'})]
        with mock.patch('callcentre.zoom_phone.ZoomClient.api_get', side_effect=pages) as api_get:
            found = numbers('student')
        self.assertEqual(api_get.call_count, 2)   # asked once, not once per user
        self.assertEqual({item['recording']['reason'] for item in found},
                         {'The Zoom app needs the scope phone:read:user:admin to read it.'})


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class ZoomWebhookTests(TestCase):
    """Zoom's webhooks: only a request signed with the account's Secret Token is answered, and a phone event asks the
    worker for a quick call sync."""
    databases = {'default', 'login_db'}
    TOKEN = 'webhook_token_1234'

    def setUp(self):
        from cryptography.fernet import Fernet
        from .zoom_accounts import add
        patch = mock.patch.dict('os.environ', {'ZOOM_SECRETS_KEY': Fernet.generate_key().decode()})
        patch.start()
        self.addCleanup(patch.stop)
        add({**ZoomAccountTests.APP, 'webhook_secret': self.TOKEN}, 'director')

    def send(self, payload, token=TOKEN, stamp=None, key='student'):
        import hashlib
        import hmac
        import json
        import time as clock
        body = json.dumps(payload)
        stamp = str(int(clock.time()) if stamp is None else stamp)
        signature = 'v0=' + hmac.new(token.encode(), f'v0:{stamp}:{body}'.encode(), hashlib.sha256).hexdigest()
        return self.client.post(f'/api/zoom-webhook/{key}/', body, content_type='application/json',
                                headers={'x-zm-request-timestamp': stamp, 'x-zm-signature': signature})

    def test_zoom_validates_the_url_with_the_secret_token(self):
        import hashlib
        import hmac
        from .zoom_accounts import public, stored
        response = self.send({'event': 'endpoint.url_validation', 'payload': {'plainToken': 'abc'}})
        self.assertEqual(response.status_code, 200)   # no session needed
        self.assertEqual(response.json(), {'plainToken': 'abc',
                                           'encryptedToken': hmac.new(self.TOKEN.encode(), b'abc', hashlib.sha256).hexdigest()})
        account = public(stored()[0])
        self.assertNotIn(self.TOKEN, str(stored()))
        self.assertEqual((account['webhook_end'], bool(account['webhook']['validated_at'])), ('1234', True))

    def test_a_phone_event_asks_for_a_quick_call_sync(self):
        from .cycle_requests import call_sync_requested
        before = timezone.now() - timedelta(seconds=1)
        response = self.send({'event': 'phone.caller_call_log_completed', 'payload': {}})
        self.assertEqual((response.status_code, response.json()['queued']), (200, True))
        self.assertTrue(call_sync_requested(before))

    def test_events_that_are_not_a_call_ending_do_not_read_the_call_history(self):
        from .cycle_requests import ZOOM_CHECK_REQUEST, call_sync_requested, requested
        before = timezone.now() - timedelta(seconds=1)
        self.assertFalse(self.send({'event': 'phone.caller_ringing', 'payload': {}}).json()['queued'])   # live calls only
        # Something else changed in Zoom: the numbers are checked, once within the hour.
        self.assertEqual([self.send({'event': event, 'payload': {}}).json()['queued'] for event in ('phone.sms_sent', 'phone.fax_log_deleted')],
                         [True, False])
        self.assertFalse(call_sync_requested(before))
        self.assertTrue(requested(ZOOM_CHECK_REQUEST, before))

    def test_a_request_not_signed_with_the_token_is_refused_and_the_reason_kept(self):
        from .cycle_requests import call_sync_requested
        from .zoom_accounts import public, stored
        before = timezone.now() - timedelta(seconds=1)
        self.assertEqual(self.send({'event': 'phone.caller_ended'}, token='wrong').status_code, 401)
        self.assertEqual(self.send({'event': 'phone.caller_ended'}, stamp=1).status_code, 401)   # an old request replayed
        self.assertEqual(self.send({'event': 'phone.caller_ended'}, key='nobody').status_code, 404)
        self.assertFalse(call_sync_requested(before))
        self.assertIn('too old', public(stored()[0])['webhook']['rejected'])

    def test_the_token_is_kept_when_left_empty_and_can_be_turned_off(self):
        from .zoom_accounts import stored, update
        update('student', {'label': 'Student', 'client_id': 'client_1'}, 'director')
        self.assertEqual(stored()[0]['webhook_end'], '1234')
        update('student', {'label': 'Student', 'client_id': 'client_1', 'remove_webhook': 'true'}, 'director')
        self.assertNotIn('webhook_secret', stored()[0])
        self.assertEqual(self.send({'event': 'phone.caller_ended'}).status_code, 401)
