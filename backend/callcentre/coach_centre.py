"""The coaches' screen of the Engagement Centre.

A coach (an account with **Engagement Centre coach** ticked in Django admin, ``access.is_coach``) sees only their own
learners: the active learners whose coach's email in the LMS (the directory's ``coach_emails``, as for the booking
emails) is the signed-in account's email. Identity is the session's account, never an email the browser sends.

For each learner the coach sees the missed lectures the Engagement Centre has open, and can:

* mark missed lectures as caught up in a catch-up session with them: each case closes (``CAUGHT_UP_WITH_COACH``,
  resolved by ``coach``, or ``director`` on the coach's desk). The LMS register is not changed;
* take the learner off every call list (``do_not_call``) with a reason and a note, through a chosen last day or until
  lifted, and lift what a coach added. An entry the director added stays the director's to remove;
* mark one of the learner's lectures in the next two weeks as an authorised absence, with a reason
  (``authorised_absence``): its missed-lecture case closes as soon as the register shows them absent.

Everything done on a desk is kept in the coach log (``callcenter_coach_log``), which directors read on the Coaches tab.

Directors see every coach (``coaches``, the Coaches tab) and can open any coach's desk: the same screen, where what they
do is recorded as the director's (``role``).
"""
from collections import Counter, defaultdict
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from . import authorised_absence, do_not_call
from .access import COACH_GROUP
from .db import DB
from .learners import test_emails
from .models import CaseTicket, CoachLog
from .rules import CAUGHT_UP_WITH_COACH, MISSED_LECTURES_SINCE, email_key
from .services import close
from .sources import cached_directory

# Lectures one action can mark caught up.
MOST_AT_ONCE = 200
# How far back the screen lists lectures already marked caught up.
RECENT = timedelta(days=30)
LOG_ACTIONS = {'caught_up': 'Marked a missed lecture as caught up', 'absence_added': 'Marked an authorised absence',
               'absence_cancelled': 'Cancelled an authorised absence', 'do_not_call_added': 'Stopped the calls',
               'do_not_call_lifted': 'Allowed calls again'}


def log(coach_email, actor, role, action, learner_email, learner_name, details):
    CoachLog.objects.create(coach_email=email_key(coach_email), actor=actor, actor_role=role, action=action,
                            learner_email=email_key(learner_email), learner_name=str(learner_name or '')[:255],
                            details=details)


def log_json(entry):
    return {'id': entry.pk, 'coach_email': entry.coach_email, 'actor': entry.actor, 'actor_role': entry.actor_role,
            'action': entry.action, 'action_label': LOG_ACTIONS.get(entry.action, entry.action),
            'learner_email': entry.learner_email, 'learner_name': entry.learner_name, 'details': entry.details,
            'created_at': entry.created_at}


def activity(coach=None, limit=300):
    """The newest entries of the coach log, for one coach or all."""
    entries = CoachLog.objects.order_by('-created_at', '-pk')
    if coach:
        entries = entries.filter(coach_email=email_key(coach))
    return [log_json(entry) for entry in entries[:limit]]


def name_key(name):
    return ' '.join(str(name or '').split()).casefold()


def by_coach(people):
    """Every active learner (test accounts left out) as {coach email: {main email: profile}}; a learner whose coach
    has no one known email is under ''."""
    tests = test_emails(people)
    found = defaultdict(dict)
    for profile in people.values():
        if profile['learner_email'] and profile['learner_email'] not in tests:
            found[people.coach_emails.get(name_key(profile['coach']), '')][profile['learner_email']] = profile
    return found


def with_aliases(mine, people):
    """{every email of these learners: main email}."""
    emails = {main: main for main in mine}
    emails.update({alias: main for alias, main in people.aliases.items() if main in mine})
    return emails


def coach_learners(email, people):
    """The coach's active learners as {main email: profile}, and {every email of theirs: main email}."""
    email = email_key(email)
    if not email:
        return {}, {}
    mine = by_coach(people).get(email, {})
    return mine, with_aliases(mine, people)


def coaches():
    """Every coach with active learners, for the director's Coaches tab: their learners, open missed lectures, learners
    not being called, and whether their account has the coaches' screen."""
    people = cached_directory()
    groups = by_coach(people)
    unmatched = len(groups.pop('', {}))
    owner = {email: coach for coach, mine in groups.items() for email in with_aliases(mine, people)}
    lectures, learners_missing = Counter(), defaultdict(set)
    for email in open_lectures(owner).values_list('learner_email', flat=True):
        coach = owner.get(email_key(email))
        if coach:
            lectures[coach] += 1
            learners_missing[coach].add(people.aliases.get(email_key(email), email_key(email)))
    paused = {email_key(entry.learner_email) for entry in do_not_call.current() or []}
    with_access = {email_key(email) for email in get_user_model().objects.using(DB).filter(
        groups__name=COACH_GROUP, is_active=True).values_list('email', flat=True)}
    found = [{
        'email': coach,
        'name': common_name(mine),
        'learners': len(mine), 'missed_lectures': lectures[coach], 'learners_with_missed': len(learners_missing[coach]),
        'not_called': len(paused & set(mine)), 'has_access': coach in with_access,
    } for coach, mine in groups.items()]
    return {'coaches': sorted(found, key=lambda c: (c['name'].casefold(), c['email'])), 'unmatched_learners': unmatched,
            'complete': people.sources_complete}


def common_name(mine):
    """The coach's name as the LMS gives it on most of their learners, or ''."""
    names = Counter(' '.join(profile['coach'].split()) for profile in mine.values())
    return names.most_common(1)[0][0] if names else ''


def coach_name(email):
    return common_name(coach_learners(email, cached_directory())[0])


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
            'marked_at': ticket.resolved_at, 'marked_by': ticket.resolved_by})
    entries = do_not_call.current()
    on_list = {email_key(entry.learner_email): entry for entry in entries or []}
    absences = authorised_absence.recent(emails)
    coming, coming_error = {}, ''
    try:
        coming = authorised_absence.upcoming(mine, emails)
    except Exception:   # noqa: BLE001 - the LMS being unreadable must not hide the rest of the desk
        coming_error = 'The coming lectures could not be read from the LMS just now. Refresh in a few minutes.'
    learners = sorted(mine.values(), key=lambda p: (p['learner_name'].casefold(), p['learner_email']))
    return {
        'coach': {'email': email_key(email), 'name': display_name},
        # Without both learner sources the list may be short; the page says so instead of showing it as complete.
        'complete': people.sources_complete,
        'do_not_call': {'set_up': entries is not None, 'not_set_up': '' if entries is not None else do_not_call.NOT_SET_UP,
                        'reasons': do_not_call.REASONS},
        'absences': {'set_up': absences is not None, 'not_set_up': '' if absences is not None else authorised_absence.NOT_SET_UP,
                     'reasons': authorised_absence.REASONS, 'days': authorised_absence.WINDOW.days, 'error': coming_error},
        'learners': [{
            'email': p['learner_email'], 'name': p['learner_name'], 'programme': p['programme'],
            'organisation': p['organisation'], 'lectures': lectures.get(p['learner_email'], []),
            'caught_up': caught_up.get(p['learner_email'], []),
            'do_not_call': do_not_call.entry_json(on_list[p['learner_email']]) if p['learner_email'] in on_list else None,
            'upcoming': coming.get(p['learner_email'], []),
            'absences': (absences or {}).get(p['learner_email'], []),
        } for p in learners],
    }


def case_ids(value):
    if not isinstance(value, list) or not value or len(value) > MOST_AT_ONCE:
        raise ValueError(f'Choose 1 to {MOST_AT_ONCE} missed lectures.')
    if any(type(item) is not int for item in value):
        raise ValueError('Reload the page and try again.')
    return sorted(set(value))


@transaction.atomic(using=DB)
def mark_caught_up(email, actor, ids, note, role='coach'):
    """Close the coach's own open missed-lecture cases as caught up with them, marked by the coach or, on the coach's
    desk, the director (``role``). Cases already closed in the meantime (or not the coach's) are left as they are.
    Returns how many closed."""
    ids, note = case_ids(ids), str(note or '').strip()
    if len(note) > 1000:
        raise ValueError('Keep the note to 1,000 characters.')
    _, emails = coach_learners(email, cached_directory())
    tickets = list(open_lectures(emails).select_for_update().filter(pk__in=ids).order_by('pk'))
    for ticket in tickets:
        close(ticket, None, role, CAUGHT_UP_WITH_COACH,
              {'note': note, 'coach_email': email_key(email), 'caught_up_with_coach': True}, actor)
        log(email, actor, role, 'caught_up', ticket.learner_email, ticket.learner_name,
            {'case_id': ticket.pk, 'date': ticket.overdue_since.isoformat() if ticket.overdue_since else None,
             'module': str((ticket.source_data or {}).get('module') or '').strip(), 'note': note})
    return len(tickets)


def last_day(value):
    """The chosen last day of a do-not-call entry, or None for “until lifted”."""
    if value in (None, ''):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValueError('Choose a valid last day.') from None


def chosen_learner(email, learner_email, role):
    """One of the coach's learners (their profile), and every email of the coach's learners."""
    mine, emails = coach_learners(email, cached_directory())
    learner = mine.get(email_key(learner_email))
    if not learner:
        raise ValueError('Choose one of your learners.' if role == 'coach' else 'Choose one of this coach’s learners.')
    return learner, emails


@transaction.atomic(using=DB)
def take_off_lists(email, actor, learner_email, reason, note, until, role='coach'):
    learner, _ = chosen_learner(email, learner_email, role)
    entry = do_not_call.add(learner['learner_email'], learner['learner_name'], reason, note, actor,
                            until=last_day(until), role=role)
    log(email, actor, role, 'do_not_call_added', entry.learner_email, entry.learner_name,
        {'entry_id': entry.pk, 'reason': entry.reason, 'reason_label': do_not_call.REASONS.get(entry.reason, entry.reason),
         'until': entry.until.isoformat() if entry.until else None, 'note': entry.note})
    return entry


@transaction.atomic(using=DB)
def lift(email, actor, entry_id, note, role='coach'):
    """Lift an entry on one of the coach's learners: a coach only what a coach added, a director any."""
    if type(entry_id) is not int:
        raise ValueError('Reload the page and try again.')
    _, emails = coach_learners(email, cached_directory())
    if role == 'director':
        entry = do_not_call.in_force().filter(pk=entry_id).first()
        if entry is None or email_key(entry.learner_email) not in emails:
            raise ValueError('This learner is no longer on the list. Reload the page.')
        entry = do_not_call.remove(entry_id, note, actor)
    else:
        entry = do_not_call.remove(entry_id, note, actor, coach_learners=set(emails))
    log(email, actor, role, 'do_not_call_lifted', entry.learner_email, entry.learner_name,
        {'entry_id': entry.pk, 'note': entry.removed_note})
    return entry


@transaction.atomic(using=DB)
def mark_absent(email, actor, learner_email, session_ref, reason, note, role='coach'):
    """Mark one of the learner's lectures (the next two weeks, or started with no register yet) as an authorised absence.
    The lecture must be one the LMS assigns them now (``authorised_absence.upcoming``): nothing the browser sends is
    taken as a lecture."""
    learner, emails = chosen_learner(email, learner_email, role)
    own = {alias: main for alias, main in emails.items() if main == learner['learner_email']}
    sessions = authorised_absence.upcoming({learner['learner_email']: learner}, own).get(learner['learner_email'], [])
    session = next((item for item in sessions if item['ref'] == str(session_ref or '')), None)
    if session is None:
        raise ValueError('Choose one of the learner’s lectures in the list. Reload the page: its register may have come in.')
    absence = authorised_absence.add(learner, email, session, reason, note, actor, role)
    log(email, actor, role, 'absence_added', learner['learner_email'], learner['learner_name'],
        {'absence_id': absence.pk, 'date': session['date'].isoformat(), 'starts_at': session['starts_at'].isoformat(),
         'module': session['module'], 'reason': reason, 'reason_label': authorised_absence.REASONS[reason],
         'note': absence.note})
    return absence


@transaction.atomic(using=DB)
def cancel_absence(email, actor, absence_id, note, role='coach'):
    if type(absence_id) is not int:
        raise ValueError('Reload the page and try again.')
    _, emails = coach_learners(email, cached_directory())
    absence = authorised_absence.cancel(absence_id, set(emails), note, actor)
    log(email, actor, role, 'absence_cancelled', absence.learner_email, absence.learner_name,
        {'absence_id': absence.pk, 'date': absence.session_date.isoformat(), 'module': absence.module,
         'note': absence.cancelled_note})
    return absence
