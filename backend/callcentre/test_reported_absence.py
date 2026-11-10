from datetime import date
from types import SimpleNamespace

from django.test import SimpleTestCase

from . import reported_absence as ra
from .lms_booking import kbc_report_id

DAY = date(2026, 11, 3)
EMAILS = {'amy@learners.uk', 'amy@work.uk'}
CASE = SimpleNamespace(overdue_since=DAY)


def report(attendance_id, email='amy@work.uk', day=DAY, learner_id=62, status='pending', catchup=None, pk=9):
    return {'id': pk, 'attendance_id': attendance_id, 'learner_id': learner_id, 'learner_email': email,
            'session_date': day, 'status': status, 'reason_category': 'illness', 'catchup_event_key': catchup}


def live(absence_id=5, method='recorded'):
    return {'occurrence_id': '501', 'module_catalogue_id': 'mk-1', 'absence_id': absence_id,
            'source_learner_id': 62, 'recovery_method': method}


class LiveReportTests(SimpleTestCase):
    def test_no_ledger_row_means_not_reported(self):
        self.assertIsNone(ra.live_report(CASE, EMAILS, live(absence_id=None), [report(kbc_report_id('62:teams:501'))]))

    def test_the_report_hashed_to_the_lecture_decides(self):
        found = ra.live_report(CASE, EMAILS, live(), [report(kbc_report_id('62:teams:501'))])
        self.assertEqual(found, {'report_id': 9, 'ledger_id': 5, 'status': 'pending', 'reason_category': 'illness'})
        shared = ra.live_report(CASE, EMAILS, live(), [report(kbc_report_id('62:teams:501:mk-1'), status='approved')])
        self.assertEqual(shared['status'], 'approved')
        self.assertIsNone(ra.live_report(CASE, EMAILS, live(), [report(kbc_report_id('62:teams:501'), status='declined')]))

    def test_a_blank_report_email_still_matches_on_the_source_learner(self):
        self.assertIsNotNone(ra.live_report(CASE, EMAILS, live(), [report(kbc_report_id('62:teams:501'), email='')]))
        self.assertIsNone(ra.live_report(CASE, EMAILS, live(), [report(kbc_report_id('62:teams:501'), email='bob@x.uk'),
                                                                 report(1, status='declined', email='')]))

    def test_without_a_hashed_match_the_ledger_counts_unless_a_report_that_day_is_declined(self):
        self.assertEqual(ra.live_report(CASE, EMAILS, live(), [])['status'], 'reported')
        self.assertIsNone(ra.live_report(CASE, EMAILS, live(), [report(1, status='declined')]))
        self.assertIsNone(ra.live_report(CASE, EMAILS, live(), [report(1, catchup='ev-1')]))
        # Another learner's or another day's decline is not this lecture's.
        self.assertIsNotNone(ra.live_report(CASE, EMAILS, live(), [report(1, status='declined', learner_id=70),
                                                                    report(2, status='declined', day=date(2026, 11, 4))]))

    def test_a_catch_up_is_left_to_the_catch_up_follow_up(self):
        self.assertIsNone(ra.live_report(CASE, EMAILS, live(method='catch-up'), []))
        self.assertIsNone(ra.live_report(CASE, EMAILS, live(), [report(kbc_report_id('62:teams:501'), catchup='ev-1')]))


class LegacyReportTests(SimpleTestCase):
    def test_matches_any_of_its_register_keys(self):
        found = report(kbc_report_id('k-pm'))
        self.assertEqual(ra.legacy_report(CASE, EMAILS, {'k-am', 'k-pm'}, [found])['report_id'], 9)
        self.assertIsNone(ra.legacy_report(CASE, EMAILS, {'k-am'}, [found]))
        self.assertIsNone(ra.legacy_report(CASE, EMAILS, set(), [found]))

    def test_another_learner_day_or_a_declined_or_catch_up_report_does_not_count(self):
        keys = {'k-am'}
        self.assertIsNone(ra.legacy_report(CASE, EMAILS, keys, [report(kbc_report_id('k-am'), email='bob@x.uk')]))
        self.assertIsNone(ra.legacy_report(CASE, EMAILS, keys, [report(kbc_report_id('k-am'), day=date(2026, 11, 4))]))
        self.assertIsNone(ra.legacy_report(CASE, EMAILS, keys, [report(kbc_report_id('k-am'), status='declined')]))
        self.assertIsNone(ra.legacy_report(CASE, EMAILS, keys, [report(kbc_report_id('k-am'), catchup='ev-1')]))
