"""Active-only calling queues; synthetic sources and in-memory databases only."""
import unittest
import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from . import identity, learners
from .models import Agent, CallIntent, CaseTicket, TicketEvent
from .services import Conflict, create_intent
from .test_learner_satisfaction import aptem, lms
from .views import ticket_json


class ActiveDirectoryTests(SimpleTestCase):
    def test_non_active_status_in_either_source_excludes_all_email_aliases(self):
        for build in (learners.merge, identity.build):
            for status in ('OnBreak', 'On Break', 'Withdrawn', 'Completed', 'Onboarding', 'ReadyToEnrol'):
                for inactive_source in ('lms', 'aptem'):
                    with self.subTest(builder=build.__name__, status=status, source=inactive_source):
                        people = build(
                            [lms(Programme_status=status if inactive_source == 'lms' else 'Active')],
                            [aptem(Email='old@example.org', **{
                                'Program-Status': status if inactive_source == 'aptem' else 'Active'})])
                        self.assertFalse(people)
                        self.assertFalse(people.active)
                        self.assertFalse(people.managers)
                        self.assertNotIn('old@example.org', people)

    def test_positive_status_required_but_one_source_can_supply_it(self):
        for build in (learners.merge, identity.build):
            for lms_status, aptem_status, allowed in (
                ('', '', False), ('Active', '', True), ('', 'Active', True), ('Delivery', 'Active', True),
            ):
                with self.subTest(builder=build.__name__, statuses=(lms_status, aptem_status)):
                    people = build([lms(Programme_status=lms_status)], [aptem(**{'Program-Status': aptem_status})])
                    self.assertEqual('learner@example.org' in people, allowed)

    def test_aptem_only_inactive_learner_is_not_callable(self):
        for build in (learners.merge, identity.build):
            people = build([], [aptem(**{'Program-Status': 'OnBreak'})])
            self.assertFalse(people)
            self.assertFalse(people.active)

    def test_missing_email_does_not_ignore_aptem_break_status(self):
        for build in (learners.merge, identity.build):
            people = build([lms()], [aptem(Email='', **{'Program-Status': 'OnBreak'})])
            self.assertFalse(people)
            self.assertFalse(people.active)
            self.assertNotIn('', people.on_break)

    def test_learner_withdrawn_on_the_lms_learner_page_is_withdrawn_here(self):
        # Created_users can still say Active after the LMS learner record (and Aptem) say withdrawn.
        sql = ' '.join(learners.LMS_LEARNERS_SQL.split())
        self.assertIn('l.enrolment_id = u.id AND lower(trim(l.lifecycle_status)) = \'withdrawn\'', sql)
        self.assertIn('lower(trim(u." Status")) = \'withdrawn\'', sql)
        self.assertIn("THEN 'Withdrawn' ELSE \"Programme_status\" END AS \"Programme_status\"", sql)
        self.assertTrue(sql.startswith('SELECT id,'))   # unified_directory adds id_aptem after it

    def test_unified_identity_keeps_inactive_person_for_historical_evidence(self):
        people = identity.build([lms()], [aptem(**{'Program-Status': 'OnBreak'})])
        self.assertEqual(people.resolve('lms', 1)['programme_status'], 'OnBreak')
        self.assertFalse(people)


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'In-memory SQLite runner only.')
@override_settings(CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS=[])
class ActiveQueueTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        self.lms_rows = [lms(), lms(id=2, aptem_id=20, Email='paused@example.org')]
        self.aptem_rows = [aptem(), aptem(ID=20, Email='paused@example.org', **{'Program-Status': 'OnBreak'})]
        mocked = patch('callcentre.sources.cached_directory', return_value=learners.merge(self.lms_rows, self.aptem_rows))
        self.directory = mocked.start()
        self.addCleanup(mocked.stop)

    def case(self, email, **changes):
        return CaseTicket.objects.create(**{
            'source_type': 'manual', 'reason_key': str(uuid.uuid4()), 'learner_name': email,
            'learner_email': email, 'learner_phone': '+447700900123', 'due_at': timezone.now(), **changes,
        })

    def test_existing_inactive_cases_hidden_without_changing_records_or_notes(self):
        active = self.case('learner@example.org')
        paused = self.case('paused@example.org')
        unknown = self.case('unknown@example.org')
        note = TicketEvent.objects.create(ticket=paused, kind='note', actor='Operator', data={'note': 'Keep this history'})
        self.assertEqual(list(CaseTicket.objects.open().values_list('pk', flat=True)), [active.pk])
        self.assertEqual(CaseTicket.objects.count(), 3)
        paused.refresh_from_db()
        self.assertEqual(paused.status, 'new')
        self.assertFalse(paused.archived)
        self.assertEqual(TicketEvent.objects.get(pk=note.pk).data['note'], 'Keep this history')
        self.assertTrue(CaseTicket.objects.filter(pk=unknown.pk).exists())

    def test_every_case_category_uses_current_status_not_stale_snapshot(self):
        for source_type, _ in CaseTicket.CATEGORIES:
            with self.subTest(source_type=source_type):
                ticket = self.case('paused@example.org', source_type=source_type,
                                   source_data={'eligible': True, 'programme_status': 'Active', 'review_type': 'progress'})
                self.assertFalse(CaseTicket.objects.open().filter(pk=ticket.pk).exists())

    def test_reactivation_restores_existing_ticket(self):
        ticket = self.case('paused@example.org')
        self.assertFalse(CaseTicket.objects.open().filter(pk=ticket.pk).exists())
        self.aptem_rows[1]['Program-Status'] = 'Active'
        self.directory.return_value = learners.merge(self.lms_rows, self.aptem_rows)
        self.assertTrue(CaseTicket.objects.open().filter(pk=ticket.pk).exists())
        self.assertEqual(CaseTicket.objects.count(), 1)

    def test_inactive_ticket_cannot_start_call(self):
        ticket = self.case('paused@example.org')
        user = get_user_model().objects.create_user('operator')
        agent = Agent.objects.create(user=user, display_name='Operator', zoom_email='operator@example.org', zoom_account='student')
        with patch('callcentre.services.allocated_owner', return_value=None):
            with self.assertRaises(Conflict):
                create_intent(ticket.pk, agent)
        self.assertFalse(CallIntent.objects.exists())

    def test_shared_employer_keeps_only_active_learners_and_preserves_history(self):
        listed = [{'name': 'Active learner', 'email': 'learner@example.org'},
                  {'name': 'Paused learner', 'email': 'paused@example.org'}]
        ticket = self.case('manager@example.org', source_type='employer_feedback', source_data={'learners': listed})
        self.assertTrue(CaseTicket.objects.open().filter(pk=ticket.pk).exists())
        self.assertEqual(ticket_json(ticket)['employer_learners'], listed[:1])
        self.assertEqual(ticket.source_data['learners'], listed)
        ticket.status = 'resolved'
        self.assertEqual(ticket_json(ticket)['employer_learners'], listed)
        self.aptem_rows[0]['Program-Status'] = 'OnBreak'
        self.directory.return_value = learners.merge(self.lms_rows, self.aptem_rows)
        self.assertFalse(CaseTicket.objects.open().filter(pk=ticket.pk).exists())

    def test_no_email_case_requires_current_active_source_identity(self):
        self.directory.return_value = learners.merge([lms(Email='', aptem_id=None)], [])
        active = self.case('', source_data={'identifiers': ['lms:1']})
        unknown = self.case('', source_data={'identifiers': ['lms:999']})
        self.assertTrue(CaseTicket.objects.open().filter(pk=active.pk).exists())
        self.assertFalse(CaseTicket.objects.open().filter(pk=unknown.pk).exists())

    def test_empty_directory_does_not_expose_unknown_contacts(self):
        ticket = self.case('learner@example.org')
        self.directory.return_value = learners.merge([], [])
        self.assertFalse(CaseTicket.objects.open().filter(pk=ticket.pk).exists())
