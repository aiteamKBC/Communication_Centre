import unittest
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TestCase
from django.utils import timezone

from .desk_progress import worked
from .models import Agent, CaseTicket, TicketEvent
from .rules import LONDON


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'In-memory SQLite runner only.')
class DeskProgressTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        self.agent = Agent.objects.create(user=get_user_model().objects.create_user('operator'), display_name='Operator',
                                          zoom_email='operator@example.org', zoom_account='student')

    def case(self, **changes):
        return CaseTicket.objects.create(**{
            'source_type': 'attendance', 'reason_key': str(uuid.uuid4()), 'learner_name': 'Amy', 'learner_email': 'amy@example.org',
            'learner_phone': '+447700900123', 'due_at': timezone.now(), **changes})

    def test_one_row_per_case_with_the_last_result_and_the_task_it_was_called_for(self):
        lecture, review = self.case(), self.case(source_type='signature', source_data={'employer_signature_missing': True})
        TicketEvent.objects.create(ticket=lecture, kind='dial_requested', agent=self.agent, data={'task_id': 4})
        TicketEvent.objects.create(ticket=lecture, kind='outcome', agent=self.agent, data={'outcome': 'reached'})
        TicketEvent.objects.create(ticket=lecture, kind='resolved', agent=self.agent, data={})
        TicketEvent.objects.create(ticket=review, kind='outcome', agent=self.agent, data={'outcome': 'no_answer'})
        TicketEvent.objects.create(ticket=review, kind='zoom_result', agent=self.agent, data={})   # not a saved result
        TicketEvent.objects.create(ticket=self.case(), kind='outcome', data={'outcome': 'reached'})   # no specialist
        rows = {row['case_id']: row for row in worked(timezone.now().astimezone(LONDON).date())}
        self.assertEqual(set(rows), {lecture.pk, review.pk})
        self.assertEqual((rows[lecture.pk]['outcome'], rows[lecture.pk]['resolved'], rows[lecture.pk]['task_id']), ('reached', True, 4))
        self.assertEqual((rows[review.pk]['outcome'], rows[review.pk]['resolved']), ('no_answer', False))
        self.assertTrue(rows[review.pk]['employer_signature_missing'])

    def test_only_the_day_asked(self):
        TicketEvent.objects.create(ticket=self.case(), kind='outcome', agent=self.agent, data={'outcome': 'reached'})
        self.assertEqual(worked((timezone.now() - timedelta(days=1)).astimezone(LONDON).date()), [])
