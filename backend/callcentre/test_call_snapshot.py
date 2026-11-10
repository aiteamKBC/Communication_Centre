from datetime import datetime, timedelta, timezone as dt_timezone
from types import SimpleNamespace

from django.test import SimpleTestCase

from . import call_log

PRESS = datetime(2026, 11, 5, 10, 0, tzinfo=dt_timezone.utc)


def event(kind, data=None, minutes=0):
    return SimpleNamespace(kind=kind, data=data or {}, created_at=PRESS + timedelta(minutes=minutes))


def ticket(**fields):
    values = {field: '' for field in call_log.CONTACT_FIELDS}
    return SimpleNamespace(**{**values, **fields})


class ContactAtTests(SimpleTestCase):
    def test_the_first_refresh_after_the_call_holds_the_value_then(self):
        now = ticket(learner_phone='+44 3', coach='Coach C')
        refreshed = [event('identity_contacts_refreshed', {'previous_contact': {'learner_phone': '+44 1'}}, 5),
                     event('identity_contacts_refreshed', {'previous_contact': {'learner_phone': '+44 2', 'coach': 'Coach B'}}, 9)]
        found = call_log.contact_at(now, refreshed)
        self.assertEqual(found['learner_phone'], '+44 1')
        self.assertEqual(found['coach'], 'Coach B')

    def test_without_a_refresh_the_case_shows_what_it_holds(self):
        self.assertEqual(call_log.contact_at(ticket(learner_name='Amy'), [])['learner_name'], 'Amy')


class StateBeforeTests(SimpleTestCase):
    def test_closed_then_reopened_is_open_with_the_last_outcome(self):
        found = call_log.state_before([
            event('outcome', {'outcome': 'no_answer', 'callback_at': (PRESS - timedelta(days=1)).isoformat()}, -3000),
            event('resolved', minutes=-2000), event('reopened', minutes=-1000),
            event('outcome', {'outcome': 'callback', 'note': 'After 5', 'callback_at': (PRESS + timedelta(hours=2)).isoformat(),
                              'promised_at': '2026-11-07'}, -60),
        ], PRESS)
        self.assertFalse(found['closed'])
        self.assertEqual(found['last_outcome']['outcome'], 'callback')
        self.assertEqual(found['last_outcome']['note'], 'After 5')
        self.assertIsNotNone(found['next_followup_at'])
        self.assertEqual(found['promised_at'], '2026-11-07')

    def test_a_past_follow_up_or_promise_is_not_shown(self):
        found = call_log.state_before([event('outcome', {'outcome': 'callback', 'callback_at': (PRESS - timedelta(hours=1)).isoformat(),
                                                         'promised_at': '2026-11-01'}, -120)], PRESS)
        self.assertIsNone(found['next_followup_at'])
        self.assertIsNone(found['promised_at'])

    def test_nothing_before_the_call(self):
        self.assertEqual(call_log.state_before([], PRESS),
                         {'closed': False, 'next_followup_at': None, 'promised_at': None, 'last_outcome': None})
