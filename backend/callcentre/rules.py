import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db.models import Q

LONDON = ZoneInfo('Europe/London')
BANK_HOLIDAYS = {
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
    '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
    '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
}
# The system cutoff: missed lectures and reviews dated before it are too old to call about. No case is opened
# for them and older open cases are left out of every list. Change the date here; the database is not touched.
SYSTEM_CUTOFF = date(2026, 9, 1)
MISSED_LECTURES_SINCE = SYSTEM_CUTOFF
REVIEWS_SINCE = SYSTEM_CUTOFF
# Cases made from the LMS reviews (lms_reviews.py): overdue, missed and unsigned reviews.
REVIEW_CATEGORIES = {'pr', 'mcm', 'pr_missed', 'mcm_missed', 'signature'}
# A missed lecture waits this many calendar days after the lecture date before it becomes a case,
# so late attendance corrections land first. Absent on the 1st → on the list on the 4th.
MISSED_LECTURE_DELAY_DAYS = 3
# Case types switched off for now: none are created and open ones are left out of every list.
# 'satisfaction' (emailed quarterly employer surveys) was replaced by employer_feedback calls on 2026-10-05.
PAUSED_CATEGORIES = {'otj', 'satisfaction'}
# Recurring feedback calls: one open case per contact, completed by the feedback form after an answered call,
# then due again three calendar months later (learner_satisfaction.py).
SATISFACTION_TYPES = {'learner_satisfaction', 'employer_feedback'}


def missed_lectures_ready_until(today):
    """The latest lecture date whose absence is old enough to call about."""
    return today - timedelta(days=MISSED_LECTURE_DELAY_DAYS)


def out_of_scope():
    """Open cases the call centre does not work on now. They stay in the database, untouched."""
    from .sources import on_break_emails   # sources imports this module
    from .test_learner import hidden as test_learner_off
    ready = missed_lectures_ready_until(datetime.now(LONDON).date())
    return (Q(source_type__in=PAUSED_CATEGORIES)
            | Q(source_type__in=SATISFACTION_TYPES | {'reminder'}, source_data__has_key='eligible', source_data__eligible=False)
            | Q(learner_email__in=on_break_emails())
            | test_learner_off()
            | Q(source_type='attendance', overdue_since__lt=MISSED_LECTURES_SINCE)
            | Q(source_type='attendance', overdue_since__gt=ready)
            | Q(source_type__in=REVIEW_CATEGORIES, overdue_since__lt=REVIEWS_SINCE)
            # Progress review / monthly coaching cases from Aptem's old tables, replaced by the LMS reviews.
            | (Q(source_type__in=('pr', 'mcm')) & ~Q(source_data__has_key='review_type')))


SLA_DAYS = {'attendance': 2, 'mcm': 3, 'pr': 3, 'mcm_missed': 3, 'pr_missed': 3, 'signature': 3, 'otj': 5, 'epa': 5,
            'satisfaction': 14, 'learner_satisfaction': 10, 'employer_feedback': 10}
FAILED_RESULTS = {'no_answer', 'missed', 'busy', 'voicemail', 'rejected'}
WAITING = {'pending_learner', 'pending_verification', 'ai_suggested_close', 'unreachable', 'escalated'}
# What a learner can agree to on a call, per case type, and the calendar days they have to do it.
# The case stays open until source evidence proves it; a missed deadline returns it to the queue.
# None: agreeing closes the case straight away (MVP — booking proof is not connected yet).
PROMISES = {
    'attendance': {'catch_up_session': 7},
    'pr': {'book_pr': None},
    'mcm': {'book_mcm': None},
    'pr_missed': {'book_pr': None},
    'mcm_missed': {'book_mcm': None},
    'signature': {'sign_review': None},
    'otj': {'log_hours': 7},
    'epa': {'epa_step': 7},
    'reminder': {},
    'manual': {},
}
# Cases with nothing to prove: the call itself is the work, so the specialist closes them.
SPECIALIST_CLOSES = {'reminder', 'manual'}
OPTIONS = {option for options in PROMISES.values() for option in options} | {'other'}
# A learner who misses this many promises on one case goes to a manager instead of back to the queue.
MAX_MISSED_PROMISES = 2
# Missed calls on one case before it goes to a manager.
MAX_MISSED_CALLS = 3


def same_contact(ticket):
    """Cases of the same person in the same role. Someone who is a learner and also a line manager is two contacts:
    a call about their own learning is not their employer feedback call, and the other way round."""
    return Q(learner_email=ticket.learner_email) & (Q(source_type='employer_feedback') if ticket.source_type == 'employer_feedback'
                                                    else ~Q(source_type='employer_feedback'))


def contact_key(ticket):
    if ticket.source_type == 'employer_feedback':
        return 'employer:' + ticket.learner_email if ticket.learner_email else f'case:{ticket.pk}'
    return ticket.source_data.get('person_id') or ticket.learner_email or f'case:{ticket.pk}'


def email_key(value):
    return str(value or '').strip().lower()


def normalize_phone(value):
    value = str(value or '').strip()
    if not value or re.search(r'[^\d\s()+.\-]', value):
        return ''
    digits = re.sub(r'\D', '', value)
    if value.startswith('00'):
        digits = digits[2:]
    elif digits.startswith('0'):
        digits = '44' + digits[1:]
    elif not value.startswith('+') and not digits.startswith('44'):
        return ''
    if digits.startswith('440'):
        digits = '44' + digits[3:]
    if not 8 <= len(digits) <= 15 or digits.startswith('0'):
        return ''
    if digits.startswith('44') and len(digits) != 12:
        return ''
    return '+' + digits


def working_day(day):
    holidays = BANK_HOLIDAYS | set(getattr(settings, 'CALLCENTRE_HOLIDAYS', []))
    return day.weekday() < 5 and day.isoformat() not in holidays


def next_workday(day):
    candidate = day + timedelta(days=1)
    while not working_day(candidate):
        candidate += timedelta(days=1)
    return candidate


def add_workdays(moment, count):
    local = moment.astimezone(LONDON)
    day = local.date()
    while count:
        day = next_workday(day)
        count -= 1
    return datetime.combine(day, local.timetz(), tzinfo=LONDON)


def due_at(category, now, booking_at=None):
    if category == 'reminder':
        if booking_at is None:
            raise ValueError('Reminder needs a confirmed session time.')
        return booking_at
    return add_workdays(now, SLA_DAYS[category])


def promise_deadline(category, option, now):
    """17:00 London on the last day the learner has to keep the promise."""
    day = now.astimezone(LONDON).date() + timedelta(days=PROMISES[category][option])
    return datetime.combine(day, time(17), tzinfo=LONDON)


def priority(ticket, now):
    today = now.astimezone(LONDON).date()
    overdue = max(0, (today - ticket.overdue_since).days) if ticket.overdue_since else 0
    tomorrow = bool(ticket.booking_at and ticket.booking_at.astimezone(LONDON).date() == next_workday(today))
    # A missed call drops to the bottom; a broken promise ranks with red risk at the top.
    return (not missed_call(ticket), promise_missed(ticket, now) or ticket.risk == 'red', ticket.due_at < now,
            overdue, ticket.misses, tomorrow, -ticket.attempts)


def missed_call(ticket):
    """The latest call on an open case went unanswered. Needs the ``last_call_result`` annotation."""
    return ticket.status != 'resolved' and getattr(ticket, 'last_call_result', None) in FAILED_RESULTS


def promise_missed(ticket, now):
    """The learner's agreed deadline passed without proof and the case is back with the specialists."""
    return bool(ticket.promised_at and ticket.promised_at <= now and ticket.status in ('new', 'in_progress', 'escalated'))


def parse_moment(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=LONDON)
    if isinstance(value, dict):
        # Microsoft booking values may contain an explicit timezone.
        dt = datetime.fromisoformat(value['dateTime'].replace('Z', '+00:00'))
        if dt.tzinfo:
            return dt
        zone = value.get('timeZone', 'Europe/London')
        return dt.replace(tzinfo=ZoneInfo('Europe/London' if zone == 'GMT Standard Time' else zone))
    dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return dt if dt.tzinfo else dt.replace(tzinfo=LONDON)
