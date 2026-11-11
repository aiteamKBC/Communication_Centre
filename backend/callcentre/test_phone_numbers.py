from unittest.mock import patch

from django.test import SimpleTestCase

from . import phone_numbers
from .learners import Learners


def profile(email, phone='447700900001', manager='boss@acme.uk'):
    return {'learner_email': email, 'learner_name': 'Amy', 'learner_phone': phone, 'manager_email': manager,
            'manager_name': 'Bo Boss', 'programme': 'L3', 'organisation': 'Acme', 'coach': ''}


class ApplyTests(SimpleTestCase):
    def test_legacy_directory_learner_by_any_email_and_line_manager(self):
        amy = profile('amy@learners.uk')
        survey = {'profile': profile('amy@learners.uk')}
        people = Learners({'amy@learners.uk': amy}, {'amy@aptem.uk': 'amy@learners.uk'}, satisfaction=[survey],
                          manager_phones={'boss@acme.uk': '447700900099'})
        phone_numbers.apply(people, {('learner', 'amy@aptem.uk'): '447700900222', ('employer', 'boss@acme.uk'): '447700900333'})
        self.assertEqual(people['amy@learners.uk']['learner_phone'], '447700900222')
        self.assertEqual(survey['profile']['learner_phone'], '447700900222')
        self.assertEqual(people.manager_phones['boss@acme.uk'], '447700900333')

    def test_unified_records_carry_the_number_for_incoming_calls_too(self):
        person = {'emails': ['amy@learners.uk', 'amy@aptem.uk'], 'profile': profile('amy@learners.uk'),
                  'manager_phone': '447700900099'}
        people = Learners({}, {})
        people.records = {'p1': person}
        phone_numbers.apply(people, {('learner', 'amy@aptem.uk'): '447700900222', ('employer', 'boss@acme.uk'): '447700900333'})
        self.assertEqual(person['profile']['learner_phone'], '447700900222')
        self.assertEqual(person['manager_phone'], '447700900333')

    def test_nothing_set_leaves_the_lms_numbers(self):
        people = Learners({'amy@learners.uk': profile('amy@learners.uk')}, {})
        phone_numbers.apply(people, {})
        self.assertEqual(people['amy@learners.uk']['learner_phone'], '447700900001')


class SetNumberTests(SimpleTestCase):
    def call(self, phone, current='447700900001', found=None):
        with patch.object(phone_numbers, 'latest', return_value={} if found is None else found):
            return phone_numbers.set_number('learner', 'amy@learners.uk', set(), 'Amy', phone, current, '', 'director')

    def test_refuses_a_bad_number_the_same_number_and_an_empty_one_with_nothing_to_undo(self):
        with self.assertRaisesMessage(ValueError, 'valid phone number'):
            self.call('not a number')
        with self.assertRaisesMessage(ValueError, 'already their number'):
            self.call('07700 900001')
        with self.assertRaisesMessage(ValueError, 'Enter the new number'):
            self.call('')

    def test_not_set_up(self):
        with patch.object(phone_numbers, 'latest', return_value=None):
            with self.assertRaisesMessage(ValueError, 'not set up'):
                phone_numbers.set_number('learner', 'amy@learners.uk', set(), 'Amy', '07700 900222', '', '', 'director')
