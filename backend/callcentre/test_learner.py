"""The test learner: one missed-lecture case that is always first on the list and never stays closed.

Switched on by CALLCENTRE_TEST_LEARNER_PHONE (a phone you can answer); CALLCENTRE_TEST_LEARNER_EMAIL optionally
gives it a mailbox you can read. The case cycle creates the case, and after
it is closed, sent to a manager or otherwise moved on, the next cycle puts it back as new, so it can be worked
again and again. Remove the setting and the case leaves every list; its row stays in the database untouched.

It never reaches the rest of the system: the learner is not in the LMS or Aptem, gets no reminder emails and no
evidence checks, its calls are left out of the agent reports, and a booking is only simulated (no coach calendar, Teams
meeting or LMS absence report).
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from . import lms_booking
from .db import DB
from .models import CaseTicket
from .rules import LONDON, add_workdays, email_key, missed_lectures_ready_until, normalize_phone
from .services import event

KEY = 'test-learner'
DEFAULT_EMAIL = 'test-learner@callcentre.invalid'
MODULE = 'Test lecture'
COACH = 'Test Coach'
# How long a moved-on test case stays as it is, so its result can be seen, before the next cycle resets it.
SHOW_RESULT_FOR = timedelta(minutes=2)


def configured():
    return getattr(settings, 'CALLCENTRE_TEST_LEARNER_PHONE', '')


def phone():
    return normalize_phone(configured())


def email():
    return email_key(getattr(settings, 'CALLCENTRE_TEST_LEARNER_EMAIL', '')) or DEFAULT_EMAIL


def is_test(ticket):
    return ticket.reason_key == KEY


def hidden():
    """The test case when the test learner is switched off (nothing when it is on)."""
    return Q(reason_key=KEY) if not phone() else Q(pk__in=[])


def fresh_fields(now):
    today = now.astimezone(LONDON).date()
    return {'status': 'new', 'archived': False, 'escalated': False, 'sla_breached': False, 'attempts': 0,
            'resolved_at': None, 'resolved_by': '', 'resolved_agent': None, 'resolution_option': '',
            'promised_at': None, 'next_followup_at': None, 'claimed_by': None, 'claimed_at': None,
            'last_activity_at': None, 'evidence_after': now, 'overdue_since': missed_lectures_ready_until(today),
            'due_at': add_workdays(now, 2)}


@transaction.atomic(using=DB)
def ensure():
    """Create the test case, or put it back as new once it has moved on. Run by the case cycle."""
    if not configured():
        return None
    number = phone()
    if not number:
        raise ValueError('CALLCENTRE_TEST_LEARNER_PHONE is not a valid phone number.')
    now = timezone.now()
    case = CaseTicket.objects.select_for_update().filter(reason_key=KEY).first()
    if not case:
        case = CaseTicket.objects.create(
            reason_key=KEY, source_type='attendance', learner_email=email(), learner_name='Test Learner (not real)',
            learner_phone=number, coach=COACH, organisation='Test (not real)', programme='Test programme',
            source_data={'module': MODULE, 'test': True}, misses=1, **fresh_fields(now))
        event(case, 'created', {'source': 'test_learner'})
        return 'created'
    if (case.learner_phone, case.learner_email) != (number, email()):
        case.learner_phone, case.learner_email = number, email()
        CaseTicket.objects.filter(pk=case.pk).update(learner_phone=number, learner_email=case.learner_email)
    claimed = case.claimed_by_id and case.last_activity_at and case.last_activity_at > now - timedelta(minutes=30)
    moved_on = case.status != 'new' or case.archived or case.attempts
    if not moved_on or claimed or case.last_action_at > now - SHOW_RESULT_FOR:
        return None
    previous = case.status
    for name, value in fresh_fields(now).items():
        setattr(case, name, value)
    case.save()
    event(case, 'test_reset', {'previous': previous})
    return 'reset'


def booking_preview(ticket):
    """What the booking panel shows, without reading the LMS or a coach calendar."""
    return {
        'coach': {'name': COACH, 'email': ''},
        'learner': {'name': ticket.learner_name, 'email': ticket.learner_email},
        'types': [{'key': key, 'label': lms_booking.TITLES[key]} for key in lms_booking.session_types(ticket)],
        'lecture': {'date': ticket.overdue_since, 'title': MODULE},
        'reasons': [{'key': key, 'label': label} for key, label in lms_booking.REASONS.items()],
        'timezone': 'Europe/London',
        'slots': [{'start': s.isoformat(), 'date': s.date().isoformat(), 'time': s.strftime('%H:%M')}
                  for s in lms_booking.slot_starts()],
    }


def book(ticket, session_type, start, reason_category=''):
    """Check a booking like the real one, then pretend it was made. Nothing is written outside the case."""
    if session_type not in lms_booking.session_types(ticket):
        raise ValueError('That session type cannot be booked from this case.')
    if session_type == lms_booking.CATCH_UP and reason_category not in lms_booking.REASONS:
        raise ValueError('Choose the reason for the absence.')
    start = start.astimezone(LONDON)
    if start not in lms_booking.slot_starts(day=start.date()):
        raise ValueError('Pick one of the offered times.')
    return {'event_key': f'test:{session_type}:{start.isoformat()}', 'start': start, 'join_url': '', 'report_id': None,
            'link_warning': 'Test learner: nothing was booked in the LMS or Teams.', 'coach': COACH, 'replayed': False}
