from types import SimpleNamespace
from unittest.mock import patch

from django.db import ProgrammingError
from django.db.models import Q
from django.test import SimpleTestCase

from . import do_not_call
from .models import CaseTicket


class DoNotCallTests(SimpleTestCase):
    def test_learners_on_the_list_leave_every_call_list(self):
        with patch('callcentre.sources.on_break_emails', return_value=frozenset()), \
                patch('callcentre.sources.active_case_contacts', return_value=Q()):
            sql = str(CaseTicket.objects.open().query)
        self.assertIn('FROM "callcenter_do_not_call" U0 WHERE U0."removed_at" IS NULL', sql)
        self.assertIn('employer_signature_missing', sql)   # the employer's own signature call stays

    def test_nobody_is_taken_off_until_the_table_exists(self):
        with patch('callcentre.do_not_call.transaction.atomic'),                 patch('callcentre.do_not_call.DoNotCall.objects.filter', side_effect=ProgrammingError('missing')):
            self.assertIsNone(do_not_call.current())
            self.assertEqual(do_not_call.emails(), frozenset())
            self.assertFalse(do_not_call.listing()['set_up'])
            with self.assertRaisesMessage(ValueError, 'not set up'):
                do_not_call.add('a@x.test', 'A', 'medical', 'Cannot take calls', 'director')

    def test_adding_needs_a_learner_a_reason_and_a_note(self):
        with self.assertRaisesMessage(ValueError, 'Choose a learner.'):
            do_not_call.add('', 'A', 'medical', 'Cannot take calls', 'director')
        with self.assertRaisesMessage(ValueError, 'Choose a reason.'):
            do_not_call.add('a@x.test', 'A', 'heart', 'Cannot take calls', 'director')
        with self.assertRaisesMessage(ValueError, 'Add a note'):
            do_not_call.add('a@x.test', 'A', 'medical', ' ', 'director')

    def test_removing_needs_a_reason(self):
        with self.assertRaisesMessage(ValueError, 'Say why'):
            do_not_call.remove(1, '', 'director')

    def test_nobody_can_phone_them(self):
        from .services import Conflict, create_intent
        ticket = SimpleNamespace(source_type='attendance', next_followup_at=None, source_data={},
                                 learner_email='resting@example.com', learner_phone='07700 900123')
        with patch('callcentre.services.CaseTicket.objects.get', return_value=ticket), \
                patch('callcentre.services.do_not_call_emails', return_value=frozenset({'resting@example.com'})), \
                self.assertRaisesMessage(Conflict, 'do-not-call list'):
            create_intent.__wrapped__(1, SimpleNamespace())   # without its transaction: no database in these tests
