"""Pure tests; never connect to the configured production databases."""
from datetime import datetime
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from . import learners
from .learner_satisfaction import cycle_due, eligible, next_review_at
from .rules import LONDON


def lms(**changes):
    return {'id': 1, 'Username': 'Learner', 'Email': 'learner@example.org', 'Phone_number': '',
            'aptem_id': 10, 'Programme_status': 'Active', **changes}


def aptem(**changes):
    return {'ID': 10, 'FullName': 'Learner', 'Email': 'learner@example.org', 'Learner Phone': '',
            'OwnerName': 'Coach', 'OrganizationName': 'Company', 'Program Name': 'Programme',
            'ManagerName': 'Manager', 'ManagerEmail': 'manager@example.org', 'Program-Status': 'Active', **changes}


class LearnerSatisfactionRulesTests(SimpleTestCase):
    def test_three_calendar_months_not_ninety_days(self):
        self.assertEqual(next_review_at(datetime(2026, 1, 31, 9, tzinfo=LONDON)), datetime(2026, 4, 30, 9, tzinfo=LONDON))
        self.assertEqual(next_review_at(datetime(2027, 11, 30, 9, tzinfo=LONDON)), datetime(2028, 2, 29, 9, tzinfo=LONDON))
        self.assertEqual(next_review_at(datetime(2026, 11, 30, 9, tzinfo=LONDON)), datetime(2027, 2, 28, 9, tzinfo=LONDON))

    def test_dst_preserves_london_wall_time(self):
        due = next_review_at(datetime(2026, 1, 4, 10, tzinfo=LONDON))
        self.assertEqual((due.month, due.hour, due.utcoffset().total_seconds()), (4, 10, 3600))

    @override_settings(CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS=[])
    def test_only_active_and_delivery(self):
        for status in ('Active', 'active', 'Delivery'):
            self.assertTrue(eligible({'programme_status': status, 'identifiers': ['lms:1']}))
        for status in ('Withdrawn', 'Completed', 'OnBreak', '', 'ReadyToEnrol', ' Onboarding '):
            self.assertFalse(eligible({'programme_status': status, 'identifiers': ['lms:1']}))

    @override_settings(CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS=['lms:1'])
    def test_only_confirmed_test_identity_is_excluded(self):
        self.assertFalse(eligible({'programme_status': 'Active', 'identifiers': ['aptem:10', 'lms:1']}))
        self.assertTrue(eligible({'programme_status': 'Active', 'identifiers': ['lms:2'], 'name': 'Testing Solutions'}))

    def test_lms_status_wins_with_provenance_and_ids(self):
        people = learners.merge([lms()], [aptem()])
        person = people.satisfaction[0]
        self.assertEqual(person['programme_status'], 'Active')
        self.assertEqual(person['status_source'], 'lms')
        self.assertEqual(person['identifiers'], ['aptem:10', 'lms:1', 'email:learner@example.org'])
        self.assertNotIn('programme_status', people['learner@example.org'])

    def test_missing_phone_does_not_remove_learner(self):
        person = learners.merge([], [aptem()]).satisfaction[0]
        self.assertEqual(person['programme_status'], 'Active')
        self.assertEqual(person['profile']['learner_phone'], '')
        self.assertTrue(eligible(person))

    def test_missing_email_keeps_stable_identity_without_fake_email(self):
        person = learners.merge([lms(Email='', aptem_id=None)], []).satisfaction[0]
        self.assertEqual(person['identifiers'], ['lms:1'])
        self.assertEqual(person['profile']['learner_email'], '')

    def test_missing_lms_email_can_match_aptem_id_without_duplicate(self):
        people = learners.merge([lms(Email='', Programme_status='Withdrawn')], [aptem()])
        self.assertEqual(len(people.satisfaction), 1)
        self.assertEqual(people.satisfaction[0]['programme_status'], 'Withdrawn')

    def test_aptem_without_email_still_has_a_candidate(self):
        people = learners.merge([], [aptem(Email='')])
        self.assertEqual(len(people.satisfaction), 1)
        self.assertEqual(people.satisfaction[0]['identifiers'], ['aptem:10'])

    def test_completion_is_the_only_clock(self):
        now = datetime(2026, 10, 4, 12, tzinfo=LONDON)
        ticket = SimpleNamespace(status='new', source_data={'last_completed_at': '2026-01-01T12:00:00+00:00'})
        self.assertFalse(cycle_due(ticket, now))  # never reopen an already open case
        ticket.status, ticket.source_data = 'resolved', {}
        self.assertFalse(cycle_due(ticket, now))  # arbitrary resolution is not completion
        ticket.source_data = {'last_completed_at': '2026-07-04T12:00:00+01:00'}
        self.assertTrue(cycle_due(ticket, now))
        self.assertFalse(cycle_due(ticket, now.replace(hour=11)))

    def test_partial_source_load_does_not_become_authoritative(self):
        from .sources import learner_directory
        with mock.patch('callcentre.sources.rows', side_effect=[[lms()], RuntimeError('offline')]):
            self.assertFalse(learner_directory().sources_complete)

    def test_no_automatic_evidence_for_satisfaction(self):
        from .evidence import check_evidence
        self.assertIsNone(check_evidence(SimpleNamespace(source_type='learner_satisfaction')))
