"""The coaches' screen of the Engagement Centre.

A coach (an account with **Engagement Centre coach** ticked in Django admin, ``access.is_coach``) sees only their own
learners: the active learners whose coach's email in the LMS (the directory's ``coach_emails``, as for the booking
emails) is the signed-in account's email. Identity is the session's account, never an email the browser sends.

For each learner the coach sees the missed lectures the Engagement Centre has open, and can:

* mark missed lectures as caught up in a catch-up session with them: each case closes (``CAUGHT_UP_WITH_COACH``,
  resolved by ``coach``). The LMS register is not changed;
* take the learner off every call list (``do_not_call``) with a reason and a note, through a chosen last day or until
  lifted, and lift what a coach added. An entry the director added stays the director's to remove.
"""
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from . import do_not_call
from .db import DB
from .learners import test_emails
from .models import CaseTicket
from .rules import CAUGHT_UP_WITH_COACH, MISSED_LECTURES_SINCE, email_key
from .services import close
from .sources import cached_directory

# Lectures one action can mark caught up.
MOST_AT_ONCE = 200
# How far back the screen lists lectures already marked caught up.
RECENT = timedelta(days=30)


def name_key(name):
    return ' '.join(str(name or '').split()).casefold()


def coach_learners(email, people):
    """The coach's active learners as {main email: profile}, and {every email of theirs: main email}."""
    email = email_key(email)
    if not email:
        return {}, {}
    tests = test_emails(people)
    mine = {profile['learner_email']: profile for profile in people.values()
            if profile['learner_email'] and profile['learner_email'] not in tests
            and people.coach_emails.get(name_key(profile['coach'])) == email}
    emails = {main: main for main in mine}
    emails.update({alias: main for alias, main in people.aliases.items() if main in mine})
    return mine, emails


def open_lectures(emails):
    """The open missed-lecture cases of these learners: those the Engagement Centre would call about, or will."""
    return (CaseTicket.objects.filter(source_type='attendance', archived=False, learner_email__in=list(emails),
                                      overdue_since__gte=MISSED_LECTURES_SINCE)
            .exclude(status='resolved')
            .exclude(Q(source_data__has_key='eligible') & Q(source_data__eligible=False)))


def lecture_state(ticket):
    """Where the call centre is with a missed lecture, for the coach."""
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    booking = data.get('catchup_booking') or {}
    if booking:
        return {'state': 'catch_up_booked', 'at': booking.get('start')}
    if ticket.status == 'pending_verification' and ticket.resolution_option == 'catch_up_session' and ticket.promised_at:
        return {'state': 'promised', 'at': ticket.promised_at}
    if ticket.status == 'pending_learner':
        return {'state': 'callback', 'at': ticket.next_followup_at}
    if ticket.claimed_by_id:
        return {'state': 'calling', 'at': None}
    return {'state': 'waiting', 'at': None}


def lecture_json(ticket):
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    return {'id': ticket.pk, 'date': ticket.overdue_since, 'module': str(data.get('module') or '').strip(),
            'missed_catch_up': bool(data.get('catchup_no_show')), 'attempts': ticket.attempts, **lecture_state(ticket)}


def overview(email, display_name):
    people = cached_directory()
    mine, emails = coach_learners(email, people)
    lectures = {}
    for ticket in open_lectures(emails).order_by('overdue_since', 'pk'):
        lectures.setdefault(emails.get(email_key(ticket.learner_email)), []).append(lecture_json(ticket))
    caught_up = {}
    recent = (CaseTicket.objects.filter(source_type='attendance', learner_email__in=list(emails),
                                        resolution_option=CAUGHT_UP_WITH_COACH, resolved_at__gte=timezone.now() - RECENT)
              .order_by('-resolved_at'))
    for ticket in recent:
        caught_up.setdefault(emails.get(email_key(ticket.learner_email)), []).append({
            'id': ticket.pk, 'date': ticket.overdue_since, 'module': str((ticket.source_data or {}).get('module') or '').strip(),
            'marked_at': ticket.resolved_at, 'by_coach': ticket.resolved_by == 'coach'})
    entries = do_not_call.current()
    on_list = {email_key(entry.learner_email): entry for entry in entries or []}
    learners = sorted(mine.values(), key=lambda p: (p['learner_name'].casefold(), p['learner_email']))
    return {
        'coach': {'email': email_key(email), 'name': display_name},
        # Without both learner sources the list may be short; the page says so instead of showing it as complete.
        'complete': people.sources_complete,
        'do_not_call': {'set_up': entries is not None, 'not_set_up': '' if entries is not None else do_not_call.NOT_SET_UP,
                        'reasons': do_not_call.REASONS},
        'learners': [{
            'email': p['learner_email'], 'name': p['learner_name'], 'programme': p['programme'],
            'organisation': p['organisation'], 'lectures': lectures.get(p['learner_email'], []),
            'caught_up': caught_up.get(p['learner_email'], []),
            'do_not_call': do_not_call.entry_json(on_list[p['learner_email']]) if p['learner_email'] in on_list else None,
        } for p in learners],
    }


def case_ids(value):
    if not isinstance(value, list) or not value or len(value) > MOST_AT_ONCE:
        raise ValueError(f'Choose 1 to {MOST_AT_ONCE} missed lectures.')
    if any(type(item) is not int for item in value):
        raise ValueError('Reload the page and try again.')
    return sorted(set(value))


@transaction.atomic(using=DB)
def mark_caught_up(email, actor, ids, note):
    """Close the coach's own open missed-lecture cases as caught up with them. Cases already closed in the meantime (or
    not the coach's) are left as they are. Returns how many closed."""
    ids, note = case_ids(ids), str(note or '').strip()
    if len(note) > 1000:
        raise ValueError('Keep the note to 1,000 characters.')
    _, emails = coach_learners(email, cached_directory())
    tickets = list(open_lectures(emails).select_for_update().filter(pk__in=ids).order_by('pk'))
    for ticket in tickets:
        close(ticket, None, 'coach', CAUGHT_UP_WITH_COACH,
              {'note': note, 'coach_email': email_key(email), 'caught_up_with_coach': True}, actor)
    return len(tickets)


def last_day(value):
    """The chosen last day of a do-not-call entry, or None for “until lifted”."""
    if value in (None, ''):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValueError('Choose a valid last day.') from None


def take_off_lists(email, actor, learner_email, reason, note, until):
    mine, _ = coach_learners(email, cached_directory())
    learner = mine.get(email_key(learner_email))
    if not learner:
        raise ValueError('Choose one of your learners.')
    return do_not_call.add(learner['learner_email'], learner['learner_name'], reason, note, actor,
                           until=last_day(until), role='coach')


def lift(email, actor, entry_id, note):
    if type(entry_id) is not int:
        raise ValueError('Reload the page and try again.')
    _, emails = coach_learners(email, cached_directory())
    return do_not_call.remove(entry_id, note, actor, coach_learners=set(emails))
