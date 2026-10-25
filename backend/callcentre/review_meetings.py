"""Progress reviews and monthly coaching meetings, read from the coaches' Outlook calendars (Microsoft Graph, the
calendar app) and kept in ``ReviewMeeting``, with every change in ``ReviewMeetingEvent``.

Each cycle reads every coach's calendar for today and the next ``DAYS_AHEAD`` days, plus the calendar of any
colleague who organised one of the meetings (a booking mailbox), whose copy has the learner's reply. A meeting is one
row per Outlook ``iCalUId`` (the same in every calendar it is in). Against what was stored it records: found, moved,
the learner matched, the learner's reply, cancelled by the organiser in Outlook, removed from Outlook (looked up again
before it is believed), back again. The next day's PR/MCM reminders come from these rows (sources.load_bookings).

A specialist can cancel a meeting from a reminder (``cancel``: Outlook's cancel on the organiser's copy, which emails
the attendees) or move it to a time the coach is free (``reschedule``: Outlook sends the attendees the new time); the
LMS calendar entry made for it is cancelled or moved too, and the coach gets a note. A reached call on the
reminder confirms the meeting (``confirmed``).
"""
import logging
import re
from datetime import datetime, time, timedelta, timezone as dt_timezone
from urllib.parse import quote, urlencode

from django.db import connections, transaction
from django.utils import timezone

from . import graph
from .db import DB, LMS
from .models import ReviewMeeting, ReviewMeetingEvent
from .rules import LONDON, email_key
from .services import Conflict

logger = logging.getLogger(__name__)

DAYS_AHEAD = 14
# What the subject says, after _plain(): a progress review, or a monthly coaching meeting (also "Coaching with <coach> -
# <learner>"). Staff meetings ("Weekly coaching meeting") name no learner and are left out by the matching.
SUBJECTS = (('pr', re.compile(r'\bprogress review\b')), ('mcm', re.compile(r'\bmonthly coaching\b|^coaching with ')))
SELECT = 'subject,start,end,isCancelled,attendees,organizer,iCalUId'
REPLIES = {'accepted', 'tentativelyAccepted', 'declined', 'none', 'notResponded'}
NO_REPLY = {'none', 'notResponded'}
CANCEL_REASONS = {
    'cannot_attend': 'The learner cannot attend',
    'learner_asked': 'The learner asked to cancel',
    'rebooked': 'Rebooked for another time',
    'other': 'Other',
}
RESCHEDULE_REASONS = {key: CANCEL_REASONS[key] for key in ('cannot_attend', 'learner_asked', 'other')}
LABELS = {'pr': 'progress review', 'mcm': 'monthly coaching meeting'}


class CancelRefused(Conflict):
    """The meeting cannot be cancelled from here; the message says why."""


def _plain(value):
    """Lower-case words only. Apostrophes join (O'Brien and Obrien are the same name); other marks separate words."""
    return ' '.join(re.sub(r'[^a-z ]', ' ', re.sub(r"['’`]", '', str(value or '').lower())).split())


def review_type(subject):
    plain = _plain(subject)
    return next((kind for kind, pattern in SUBJECTS if pattern.search(plain)), None)


def _address(item):
    return email_key(((item or {}).get('emailAddress') or {}).get('address'))


def _moment(value):
    """A Graph dateTimeTimeZone read with ``Prefer: outlook.timezone="UTC"``."""
    if not value or not value.get('dateTime'):
        return None
    return datetime.fromisoformat(value['dateTime'][:19]).replace(tzinfo=dt_timezone.utc)


class Matcher:
    """Finds the one learner a meeting is for: an invited learner first, then the learner the subject names in full
    ("Jane Doe", or "Doe, Jane"), then a surname the subject names among the coach's own learners. Coaches are never
    the learner, even one who is also enrolled."""

    def __init__(self, people, staff):
        self.people = people
        self.staff = set(staff)
        self.names, self.coach_of, self.surnames = {}, {}, {}
        coach_emails = getattr(people, 'coach_emails', {}) or {}
        for profile in people.values():
            email = email_key(profile.get('learner_email'))
            if not email or email in self.staff:
                continue
            coach = coach_emails.get(' '.join(str(profile.get('coach') or '').split()).casefold(), '')
            self.coach_of[email] = coach
            parts = _plain(profile.get('learner_name')).split()
            if len(parts) >= 2:
                for name in {' '.join(parts), ' '.join([parts[-1], *parts[:-1]])}:
                    self.names.setdefault(name, set()).add(email)
                if len(parts[-1]) >= 3:
                    self.surnames.setdefault(parts[-1], set()).add(email)

    def main(self, email):
        return email_key(self.people[email]['learner_email']) if email in self.people else ''

    def match(self, subject, attendees, coach):
        invited = {self.main(email) for email in attendees if email in self.people and email not in self.staff} - {''} - self.staff
        if len(invited) == 1:
            return invited.pop(), 'email'
        if len(invited) > 1:
            return '', ''
        padded = f' {_plain(subject)} '
        named = {email for name, emails in self.names.items() if f' {name} ' in padded for email in emails}
        if len(named) > 1 and coach:
            named = {email for email in named if self.coach_of.get(email) == coach} or named
        if len(named) == 1:
            return named.pop(), 'name'
        if named or not coach:
            return '', ''
        # A short name or a misspelt first name ("Rosie" for Rosemary): the surname among this coach's learners.
        words = set(padded.split())
        by_surname = {email for surname, emails in self.surnames.items() if surname in words
                      for email in emails if self.coach_of.get(email) == coach}
        return (by_surname.pop(), 'surname') if len(by_surname) == 1 else ('', '')


def record(meeting, kind, detail=None, actor='System', agent=None):
    ReviewMeetingEvent.objects.create(meeting=meeting, kind=kind, detail=detail or {}, actor=actor or 'System', agent=agent)


def _calendar(mailbox, start, end):
    """The mailbox's events between start and end (all pages), or None when it has no calendar Graph can read."""
    base = graph.settings()['base_url'].rstrip('/') + '/'
    path = f'{graph.user_path(mailbox)}/calendarView?' + urlencode(
        {'startDateTime': start.isoformat(), 'endDateTime': end.isoformat(), '$top': 200, '$select': SELECT})
    events = []
    while path:
        try:
            page = graph.request('GET', path, headers={'Prefer': 'outlook.timezone="UTC"'})
        except graph.GraphError as exc:
            if exc.status == 404:   # not a mailbox (a group or an unlicensed account): nothing to read, not a failure
                return None
            raise
        events.extend(page.get('value') or [])
        path = (page.get('@odata.nextLink') or '').replace(base, '')
    return events


def _event(mailbox, event_id):
    """One copy of a meeting by its id, or None when Outlook no longer has it."""
    try:
        return graph.request('GET', f'{graph.user_path(mailbox)}/events/{quote(event_id, safe="")}?$select={SELECT}',
                             headers={'Prefer': 'outlook.timezone="UTC"'})
    except graph.GraphError as exc:
        if exc.status == 404:
            return None
        raise


def mailboxes(people):
    """The coaches' calendars: every coach email the learner directory knows."""
    return sorted({email_key(email) for email in (getattr(people, 'coach_emails', {}) or {}).values()} - {''})


def sync(people, now=None):
    """Read the coaches' calendars and bring the stored meetings in step. Returns what changed."""
    if not graph.configured():
        raise graph.GraphError('Microsoft Graph (calendar) is not configured.')
    now = now or timezone.now()
    start = datetime.combine(now.astimezone(LONDON).date(), time.min, LONDON)
    end = start + timedelta(days=DAYS_AHEAD + 1)
    coaches = mailboxes(people)
    domains = {email.rsplit('@', 1)[-1] for email in coaches}
    # Organisers seen before (booking mailboxes) are read too: their copy has the learner's reply.
    organisers = set(ReviewMeeting.objects.filter(start_at__gte=start - timedelta(days=30))
                     .values_list('organizer_email', flat=True).distinct())
    queue = coaches + sorted(email for email in organisers - set(coaches) if email.rsplit('@', 1)[-1] in domains)
    copies, read, failed, absent = {}, set(), [], []

    def read_mailbox(mailbox):
        try:
            events = _calendar(mailbox, start, end)
        except graph.GraphError as exc:
            failed.append(mailbox)
            logger.warning('Outlook calendar %s could not be read: %s', mailbox, exc)
            return
        read.add(mailbox)
        if events is None:
            absent.append(mailbox)
            return
        for event in events:
            kind = review_type(event.get('subject'))
            if kind and event.get('iCalUId') and _moment(event.get('start')):
                copies.setdefault(event['iCalUId'], []).append((mailbox, kind, event))

    for mailbox in queue:
        read_mailbox(mailbox)
    # A colleague organised one of this run's meetings and their calendar was not read: read it now.
    for organiser in sorted({_address((event.get('organizer') or {})) for found in copies.values() for _, _, event in found}
                            - read - set(failed) - {''}):
        if organiser.rsplit('@', 1)[-1] in domains:
            read_mailbox(organiser)

    matcher = Matcher(people, set(coaches) | read)
    summary = {'calendars': len(read) - len(absent), 'unreadable': len(failed), 'meetings': len(copies),
               'found': 0, 'moved': 0, 'replies': 0, 'cancelled': 0, 'removed': 0, 'back': 0}
    for uid, found in copies.items():
        _apply(uid, found, matcher, coaches, now, summary)
    # Gone from every calendar read: looked up by id before it counts as removed (a meeting moved beyond the window
    # is still there). Skipped when a calendar failed, which could hide a meeting that is still there.
    if not failed:
        for meeting in ReviewMeeting.objects.filter(status=ReviewMeeting.SCHEDULED, start_at__gte=start, start_at__lt=end) \
                .exclude(ical_uid__in=list(copies)):
            _recheck(meeting, matcher, coaches, now, summary)
    if failed:
        summary['error'] = f'{len(failed)} Outlook calendar(s) could not be read; removals were not checked this time.'
    return summary


def _pick(found, coaches):
    """The copy to trust: the organiser's own when it was read, else a coach's, else any."""
    organiser = _address(found[0][2].get('organizer'))
    own = [item for item in found if item[0] == organiser]
    mine = [item for item in found if item[0] in coaches]
    return (own or mine or found)[0], organiser


def _apply(uid, found, matcher, coaches, now, summary):
    (mailbox, kind, event), organiser = _pick(found, coaches)
    cancelled = any(item[2].get('isCancelled') for item in found)
    coach = organiser if organiser in coaches else next((item[0] for item in found if item[0] in coaches), organiser)
    attendees = {_address(item): item.get('status') or {} for item in event.get('attendees') or [] if _address(item)}
    learner, matched_by = matcher.match(event.get('subject'), attendees, coach)
    start_at, end_at = _moment(event.get('start')), _moment(event.get('end'))
    # The learner's reply is only reliable on the organiser's copy.
    reply = attendees.get(learner, {}) if mailbox == organiser and learner else {}
    response = reply.get('response') if reply.get('response') in REPLIES else ''
    replied_at = datetime.fromisoformat(reply['time'].replace('Z', '+00:00')) if reply.get('time') and not reply['time'].startswith('0001') else None
    name = matcher.people[learner]['learner_name'] if learner else ''
    with transaction.atomic(using=DB):
        meeting = ReviewMeeting.objects.select_for_update().filter(ical_uid=uid).first()
        if meeting is None:
            meeting = ReviewMeeting.objects.create(
                ical_uid=uid, review_type=kind, subject=(event.get('subject') or '')[:500], organizer_email=organiser,
                coach_email=coach, event_mailbox=mailbox, event_id=event.get('id', ''), start_at=start_at, end_at=end_at,
                learner_email=learner, learner_name=name, matched_by=matched_by, learner_response=response,
                learner_response_at=replied_at, first_seen_at=now, last_seen_at=now,
                **({'status': ReviewMeeting.CANCELLED, 'cancelled_how': 'outlook', 'cancelled_at': now} if cancelled else {}))
            record(meeting, 'found', {'start': start_at.isoformat(), 'subject': meeting.subject, 'organizer': organiser,
                                      'learner': learner, 'matched_by': matched_by, 'response': response})
            if cancelled:
                record(meeting, 'cancelled_in_outlook', {'start': start_at.isoformat()})
            summary['found'] += 1
            return
        changed = {'last_seen_at': now, 'subject': (event.get('subject') or '')[:500], 'review_type': kind,
                   'event_mailbox': mailbox, 'event_id': event.get('id', ''), 'organizer_email': organiser,
                   'coach_email': coach, 'end_at': end_at}
        if start_at != meeting.start_at:
            record(meeting, 'moved', {'from': meeting.start_at.isoformat(), 'to': start_at.isoformat()})
            changed['start_at'] = start_at
            summary['moved'] += 1
        if learner and learner != meeting.learner_email:
            record(meeting, 'learner_matched', {'from': meeting.learner_email, 'to': learner, 'matched_by': matched_by})
            changed.update(learner_email=learner, learner_name=name, matched_by=matched_by)
        # A reply that is still "no reply" after the meeting was moved is not news.
        quiet = response in NO_REPLY and meeting.learner_response in NO_REPLY | {''}
        if response and response != meeting.learner_response and quiet:
            changed.update(learner_response=response, learner_response_at=replied_at)
        elif response and response != meeting.learner_response:
            record(meeting, 'learner_replied', {'response': response, 'previous': meeting.learner_response,
                                                'at': replied_at.isoformat() if replied_at else None})
            changed.update(learner_response=response, learner_response_at=replied_at)
            summary['replies'] += 1
        if cancelled and meeting.status == ReviewMeeting.SCHEDULED:
            record(meeting, 'cancelled_in_outlook', {'start': start_at.isoformat()})
            changed.update(status=ReviewMeeting.CANCELLED, cancelled_how='outlook', cancelled_at=now, cancelled_by='', cancel_reason='')
            summary['cancelled'] += 1
        elif not cancelled and meeting.status == ReviewMeeting.CANCELLED and meeting.cancelled_how == 'removed':
            # Removed, then back in the calendar (a calendar that failed, or the meeting restored).
            record(meeting, 'back_in_outlook', {'start': start_at.isoformat()})
            changed.update(status=ReviewMeeting.SCHEDULED, cancelled_how='', cancelled_at=None)
            summary['back'] += 1
        ReviewMeeting.objects.filter(pk=meeting.pk).update(**changed, updated_at=now)


def _recheck(meeting, matcher, coaches, now, summary):
    try:
        event = _event(meeting.event_mailbox, meeting.event_id) if meeting.event_mailbox and meeting.event_id else None
    except graph.GraphError as exc:
        logger.warning('Review meeting %s could not be looked up: %s', meeting.pk, exc)
        return
    if event is None or not review_type(event.get('subject')):
        with transaction.atomic(using=DB):
            locked = ReviewMeeting.objects.select_for_update().get(pk=meeting.pk)
            if locked.status != ReviewMeeting.SCHEDULED:
                return
            record(locked, 'removed_from_outlook', {'start': locked.start_at.isoformat(),
                                                    'subject_now': (event or {}).get('subject')})
            ReviewMeeting.objects.filter(pk=locked.pk).update(status=ReviewMeeting.CANCELLED, cancelled_how='removed',
                                                              cancelled_at=now, updated_at=now)
        summary['removed'] += 1
        return
    _apply(meeting.ical_uid, [(meeting.event_mailbox, review_type(event.get('subject')), event)], matcher, coaches, now, summary)


def meeting_for(ticket):
    """The Outlook meeting a next-day reminder is about: by the meeting id the reminder was made from, else the same
    learner, type and time (a reminder made earlier from another source)."""
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    if data.get('booking_source') == 'outlook' and data.get('booking_id'):
        found = ReviewMeeting.objects.filter(ical_uid=data['booking_id']).first()
        if found:
            return found
    if ticket.source_type != 'reminder' or not ticket.booking_at or data.get('session_type') not in LABELS:
        return None
    return ReviewMeeting.objects.filter(learner_email=email_key(ticket.learner_email), review_type=data['session_type'],
                                        start_at=ticket.booking_at).order_by('-last_seen_at').first()


def meetings_for(tickets):
    """``meeting_for`` for many reminders at once: {ticket id: meeting}."""
    reminders = [t for t in tickets if t.source_type == 'reminder' and (t.source_data or {}).get('session_type') in LABELS]
    if not reminders:
        return {}
    by_uid = {m.ical_uid: m for m in ReviewMeeting.objects.filter(
        ical_uid__in=[t.source_data.get('booking_id') for t in reminders if t.source_data.get('booking_source') == 'outlook'])}
    by_slot = {(m.learner_email, m.review_type, m.start_at): m for m in ReviewMeeting.objects.filter(
        learner_email__in={email_key(t.learner_email) for t in reminders},
        start_at__in={t.booking_at for t in reminders if t.booking_at}).order_by('last_seen_at')}
    found = {}
    for ticket in reminders:
        meeting = by_uid.get(ticket.source_data.get('booking_id')) if ticket.source_data.get('booking_source') == 'outlook' else None
        meeting = meeting or by_slot.get((email_key(ticket.learner_email), ticket.source_data.get('session_type'), ticket.booking_at))
        if meeting:
            found[ticket.pk] = meeting
    return found


def summary_json(meeting):
    """What a reminder shows about its meeting."""
    return {'id': meeting.pk, 'status': meeting.status, 'cancelled_how': meeting.cancelled_how,
            'learner_response': meeting.learner_response, 'confirmed': bool(meeting.confirmed_at),
            'organizer': meeting.organizer_email, 'cancellable': cancellable(meeting) is None}


def cancellable(meeting, now=None):
    """None when a specialist can cancel or move the meeting from here, else why not."""
    if meeting.status != ReviewMeeting.SCHEDULED:
        return 'This meeting is already cancelled.'
    if meeting.start_at <= (now or timezone.now()):
        return 'This meeting has already started.'
    if not meeting.organizer_email:
        return 'Outlook did not say who organised this meeting.'
    return None


def _locked(meeting_id):
    meeting = ReviewMeeting.objects.select_for_update().get(pk=meeting_id)
    refused = cancellable(meeting)
    if refused:
        raise CancelRefused(refused)
    return meeting


def _organiser_copy(meeting):
    """The organiser's own copy of the meeting: only that one can cancel or move it for everyone."""
    copies = graph.request('GET', f"{graph.user_path(meeting.organizer_email)}/events?" + urlencode(
        {'$filter': "iCalUId eq '{}'".format(meeting.ical_uid.replace("'", "''")), '$select': 'id,isCancelled'}))
    own = next(iter(copies.get('value') or []), None)
    if own is None:
        raise CancelRefused(f'The meeting is not in the organiser’s calendar ({meeting.organizer_email}), so it cannot be changed from here.')
    return own


def _length(meeting):
    from .lms_booking import DURATION
    return (meeting.end_at - meeting.start_at) if meeting.end_at and meeting.end_at > meeting.start_at else timedelta(minutes=DURATION)


def _reason(reason, note, allowed):
    if reason not in allowed:
        raise ValueError('Choose why.')
    note = str(note or '').strip()[:2000]
    return note, f'{CANCEL_REASONS[reason]}{": " + note if note else ""}'


def cancel(meeting_id, reason, note, agent, actor, ticket=None):
    """Cancel the meeting in Outlook from the organiser's copy (Outlook emails the attendees), cancel the LMS calendar
    entry made for it, note it for the coach, and record it all."""
    note, because = _reason(reason, note, CANCEL_REASONS)
    who = agent.display_name if agent else actor
    with transaction.atomic(using=DB):
        meeting = _locked(meeting_id)
        when = meeting.start_at.astimezone(LONDON)
        try:
            own = _organiser_copy(meeting)
            graph.request('POST', f"{graph.user_path(meeting.organizer_email)}/events/{quote(own['id'], safe='')}/cancel", {
                'Comment': f'Your {LABELS[meeting.review_type]} on {when:%A %d %B} at {when:%H:%M} has been cancelled, '
                           'as agreed with the Kent Business College engagement team. Please contact your coach to book a new time.'})
        except graph.GraphError as exc:
            record(meeting, 'cancel_failed', {'reason': reason, 'error': str(exc)}, who, agent)
            raise CancelRefused(f'Outlook did not cancel the meeting ({exc}). Nothing was changed.') from exc
        now = timezone.now()
        ReviewMeeting.objects.filter(pk=meeting.pk).update(
            status=ReviewMeeting.CANCELLED, cancelled_how='engagement_centre', cancelled_at=now, cancelled_by=who,
            cancel_reason=because, updated_at=now)
        record(meeting, 'cancelled_by_specialist', {'reason': reason, 'note': note, 'case_id': ticket.pk if ticket else None,
                                                    'organizer': meeting.organizer_email, 'event_id': own['id']}, who, agent)
    _in_lms(meeting, own['id'], who, None)
    _tell_coach(meeting, meeting.start_at, None, because, who)
    return ReviewMeeting.objects.get(pk=meeting.pk)


def free_times(meeting, now=None):
    """The times the meeting can move to: the coach's free hour slots in the next two weeks (as Book with coach offers
    them), the meeting's own time aside."""
    from . import lms_booking
    length = _length(meeting)
    starts = lms_booking.slot_starts(now)
    if not starts:
        return []
    own = (meeting.start_at, meeting.start_at + length)
    busy = [(a, b) for a, b in lms_booking.coach_busy(meeting.coach_email or meeting.organizer_email, starts[0], starts[-1] + length)
            if (a, b) != own]
    return [s for s in starts if s != meeting.start_at and not any(s < b and s + length > a for a, b in busy)]


def reschedule(meeting_id, start, reason, note, agent, actor, ticket=None):
    """Move the meeting to a time the coach is free: Outlook sends the attendees the updated meeting, the LMS calendar
    entry moves with it, the coach gets a note, and it is recorded. The learner's reply and any confirmation were for
    the old time, so they are cleared."""
    note, because = _reason(reason, note, RESCHEDULE_REASONS)
    who = agent.display_name if agent else actor
    with transaction.atomic(using=DB):
        meeting = _locked(meeting_id)
        if start not in free_times(meeting):
            raise CancelRefused('That time is not free in the coach’s calendar any more. Choose another.')
        old, length = meeting.start_at, _length(meeting)
        try:
            own = _organiser_copy(meeting)
            graph.request('PATCH', f"{graph.user_path(meeting.organizer_email)}/events/{quote(own['id'], safe='')}", {
                'start': {'dateTime': start.astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': 'UTC'},
                'end': {'dateTime': (start + length).astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': 'UTC'}})
        except graph.GraphError as exc:
            record(meeting, 'reschedule_failed', {'reason': reason, 'to': start.isoformat(), 'error': str(exc)}, who, agent)
            raise CancelRefused(f'Outlook did not move the meeting ({exc}). Nothing was changed.') from exc
        ReviewMeeting.objects.filter(pk=meeting.pk).update(
            start_at=start, end_at=start + length, confirmed_at=None, confirmed_by='', learner_response='',
            learner_response_at=None, updated_at=timezone.now())
        record(meeting, 'rescheduled_by_specialist', {'from': old.isoformat(), 'to': start.isoformat(), 'reason': reason,
                                                      'note': note, 'case_id': ticket.pk if ticket else None}, who, agent)
    _in_lms(meeting, own['id'], who, start)
    _tell_coach(meeting, old, start, because, who)
    return ReviewMeeting.objects.get(pk=meeting.pk)


def _in_lms(meeting, event_id, who, moved_to):
    """The LMS calendar entry the meeting was booked from, if any, is cancelled (or moved) too."""
    try:
        with connections[LMS].cursor() as cursor:
            if moved_to is None:
                cursor.execute('''UPDATE "Coach".coach_calendar_event SET status = 'cancelled', updated_at = now()
                    WHERE graph_event_id = %s AND lower(graph_organizer_email) = %s AND status IN ('scheduled', 'in-progress')''',
                               [event_id, meeting.organizer_email])
            else:
                local = moved_to.astimezone(LONDON)
                cursor.execute('''UPDATE "Coach".coach_calendar_event SET scheduled_date = %s, scheduled_time = %s, updated_at = now()
                    WHERE graph_event_id = %s AND lower(graph_organizer_email) = %s AND status IN ('scheduled', 'in-progress')''',
                               [local.date(), local.time().replace(tzinfo=None), event_id, meeting.organizer_email])
            changed = cursor.rowcount
    except Exception as exc:
        record(meeting, 'lms_change_failed', {'error': type(exc).__name__}, who)
        logger.exception('LMS calendar entry for review meeting %s was not changed', meeting.pk)
        return
    if changed:
        record(meeting, 'lms_cancelled' if moved_to is None else 'lms_moved', {'entries': changed}, who)


def _tell_coach(meeting, old, new, because, who):
    """A note to the coach: the meeting was cancelled (``new`` None) or moved to ``new``. Sent only when email is live."""
    from . import email_settings, mailer
    if not meeting.coach_email:
        return
    was = old.astimezone(LONDON)
    learner = meeting.learner_name or meeting.learner_email or 'The learner'
    label = LABELS[meeting.review_type]
    if new is None:
        subject = f'Cancelled: {learner} – {label} {was:%a %d %b %H:%M}'
        what = (f'was cancelled by {_html(who)} from the Engagement Centre.</p>'
                '<p>Outlook has told the learner. Please agree a new time with them.')
    else:
        moved = new.astimezone(LONDON)
        subject = f'Moved: {learner} – {label} to {moved:%a %d %b %H:%M}'
        what = (f'was moved by {_html(who)} from the Engagement Centre to <strong>{moved:%A %d %B} at {moved:%H:%M}</strong>, '
                'a time your calendar showed free.</p><p>Outlook has sent the learner the new time.')
    html = f'<p>{_html(learner)}’s {label} on {was:%A %d %B} at {was:%H:%M} {what}</p><p>Reason: {_html(because)}</p>'
    if email_settings.current()['email_mode'] != 'live':
        record(meeting, 'coach_note', {'to': meeting.coach_email, 'sent': False, 'why': 'Email is in dry-run mode.'}, who)
        return
    try:
        mailer.send(meeting.coach_email, subject, html)
    except mailer.MailError as exc:
        record(meeting, 'coach_note', {'to': meeting.coach_email, 'sent': False, 'why': str(exc)}, who)
        return
    record(meeting, 'coach_note', {'to': meeting.coach_email, 'sent': True}, who)


def _html(value):
    return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def confirmed(ticket, agent, actor):
    """The learner was reached on the next-day call about this meeting: they confirmed it."""
    meeting = meeting_for(ticket)
    if not meeting or meeting.status != ReviewMeeting.SCHEDULED or meeting.confirmed_at:
        return
    who = agent.display_name if agent else (actor or 'System')
    now = timezone.now()
    ReviewMeeting.objects.filter(pk=meeting.pk, confirmed_at__isnull=True).update(confirmed_at=now, confirmed_by=who, updated_at=now)
    record(meeting, 'confirmed_on_call', {'case_id': ticket.pk}, who, agent)


def listing(start, end, status='all', query=''):
    """The meetings between two London dates for the audit page, and how many are in each state."""
    meetings = ReviewMeeting.objects.filter(start_at__gte=datetime.combine(start, time.min, LONDON),
                                            start_at__lt=datetime.combine(end + timedelta(days=1), time.min, LONDON))
    counts = {
        'total': meetings.count(),
        'scheduled': meetings.filter(status='scheduled').count(),
        'confirmed': meetings.filter(status='scheduled', confirmed_at__isnull=False).count(),
        'declined': meetings.filter(status='scheduled', learner_response='declined').count(),
        'cancelled_here': meetings.filter(cancelled_how='engagement_centre').count(),
        'cancelled_outlook': meetings.filter(cancelled_how='outlook').count(),
        'removed': meetings.filter(cancelled_how='removed').count(),
        'unmatched': meetings.filter(learner_email='').count(),
    }
    filters = {'scheduled': {'status': 'scheduled'}, 'confirmed': {'status': 'scheduled', 'confirmed_at__isnull': False},
               'declined': {'status': 'scheduled', 'learner_response': 'declined'}, 'cancelled': {'status': 'cancelled'},
               'cancelled_here': {'cancelled_how': 'engagement_centre'}, 'unmatched': {'learner_email': ''}}
    if status in filters:
        meetings = meetings.filter(**filters[status])
    query = str(query or '').strip().lower()
    items = [meeting_json(m) for m in meetings[:1000]]
    if query:
        items = [item for item in items if query in ' '.join(str(item[key]) for key in ('learner_name', 'learner_email', 'coach_email', 'subject')).lower()]
    return {'items': items, 'counts': counts}


def meeting_json(meeting, events=None):
    item = {key: getattr(meeting, key) for key in (
        'id', 'review_type', 'subject', 'organizer_email', 'coach_email', 'learner_email', 'learner_name', 'matched_by',
        'learner_response', 'status', 'cancelled_how', 'cancelled_by', 'cancel_reason', 'confirmed_by')}
    for key in ('start_at', 'end_at', 'learner_response_at', 'cancelled_at', 'confirmed_at', 'first_seen_at', 'last_seen_at'):
        value = getattr(meeting, key)
        item[key] = value.isoformat() if value else None
    if events is not None:
        item['events'] = [{'at': e.at.isoformat(), 'kind': e.kind, 'detail': e.detail, 'actor': e.actor} for e in events]
    return item
