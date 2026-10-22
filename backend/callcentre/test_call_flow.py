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
from .models import Agent, Allocation, CallIntent, CallMatch, CaseCall, CaseTicket, ZoomPhoneCall
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
