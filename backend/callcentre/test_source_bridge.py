"""Source identity contracts; all rows are synthetic and all external reads are mocked."""
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from . import learners, lms_booking
from .learner_satisfaction import eligible
from .test_learner_satisfaction import aptem, lms


class SourceBridgeTests(SimpleTestCase):
    def test_equal_numeric_ids_from_different_sources_do_not_merge_people(self):
        old = aptem(ID=20, Email='old@example.org')
        new = lms(id=20, aptem_id=None, Email='new@example.org')
        people = learners.merge([new], [old])
        self.assertEqual(len(people), 2)
        self.assertEqual(len(people.satisfaction), 2)
        self.assertIn('aptem:20', people.satisfaction[1]['identifiers'])
        self.assertIn('lms:20', people.satisfaction[0]['identifiers'])

    def test_id_link_preserves_old_email_for_activity_and_reviews(self):
        old = aptem(ID=20, Email='old@example.org')
        new = lms(id=100, aptem_id='20', Email='new@example.org')
        people = learners.merge([new], [old])
        self.assertEqual(len(people), 1)
        self.assertIs(people['old@example.org'], people['new@example.org'])
        self.assertIn('old@example.org', people.active)
        self.assertEqual(set(people.satisfaction[0]['identifiers']), {
            'aptem:20', 'lms:100', 'email:old@example.org', 'email:new@example.org'})

    def test_new_onboarding_person_without_aptem_id_or_phone_is_retained(self):
        people = learners.merge([lms(id=100, aptem_id=None, Programme_status='Onboarding')], [])
        self.assertEqual(len(people.satisfaction), 1)
        person = people.satisfaction[0]
        self.assertFalse(eligible(person))
        self.assertIn('lms:100', person['identifiers'])
        self.assertFalse(person['profile']['learner_phone'])

    def test_current_enrolment_status_overrides_historical_active_status(self):
        people = learners.merge([lms(Programme_status='Withdrawn')], [aptem()])
        self.assertFalse(eligible(people.satisfaction[0]))
        self.assertFalse(people.active)

    def test_same_manager_can_have_learners_with_different_coaches(self):
        people = learners.merge([], [
            aptem(ID=20, Email='first@example.org', OwnerName='Coach A', ManagerEmail='manager@example.org'),
            aptem(ID=21, Email='second@example.org', OwnerName='Coach B', ManagerEmail='manager@example.org'),
        ])
        self.assertEqual({p['manager_email'] for p in people.values()}, {'manager@example.org'})
        self.assertEqual({p['coach'] for p in people.values()}, {'Coach A', 'Coach B'})

    def test_native_booking_keeps_enrolment_id_not_an_aptem_or_profile_id(self):
        new = lms(id=100, aptem_id=None, Coach_name='Coach A', Coach_email='coach@example.org', Case_owner='')

        def read(alias, sql, params=()):
            if 'FROM enrolment."Created_users"' in sql:
                return [new]
            if 'FROM public.aptem_auto_extracting' in sql:
                return []
            if sql == learners.STAFF_SQL:
                return []
            raise AssertionError('Unexpected query')

        with patch('callcentre.sources.rows', side_effect=read), patch('callcentre.graph.request') as graph:
            person = lms_booking.lms_learner(new['Email'])
        self.assertEqual(person['source_id'], 100)
        self.assertIsNone(person['aptem_id'])
        self.assertEqual(person['coach_email'], 'coach@example.org')
        graph.assert_not_called()

    def test_catchup_id_mismatch_is_reported_without_writing_an_absence_link(self):
        # Documents the current integration gap: a native learner can be bookable,
        # but the legacy register cannot be linked merely by reusing a numeric ID.
        cursor = Mock()
        report_id, warning = lms_booking._link_report(
            cursor, {'event_key': 'isolated-test'}, {'register_id': 100},
            {'source_id': 100, 'aptem_id': None}, 'work', '', 'Test operator')
        self.assertIsNone(report_id)
        self.assertIn('does not match', warning)
        cursor.execute.assert_not_called()

    def test_conflicting_register_id_cannot_be_attached_to_another_aptem_learner(self):
        cursor = Mock()
        _, warning = lms_booking._link_report(
            cursor, {'event_key': 'isolated-test'}, {'register_id': 21},
            {'source_id': 100, 'aptem_id': '20'}, 'work', '', 'Test operator')
        self.assertTrue(warning)
        cursor.execute.assert_not_called()
