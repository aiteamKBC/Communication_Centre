"""Review meetings read from the coaches' Outlook calendars: matching, keeping them in step, the next-day reminders made
from them, cancelling one from a reminder, and the audit. Microsoft Graph is faked; nothing leaves the test."""
import json
import unittest
import uuid
from datetime import datetime, time, timedelta, timezone as dt_timezone
from unittest import mock
from urllib.parse import parse_qs, unquote, urlparse

from django.contrib.auth import get_user_model
from django.db import connections
from django.db.models import Q
from django.test import RequestFactory, TestCase
from django.utils import timezone

from . import graph, review_meetings, sources
from .learners import Learners
from .models import CaseTicket, ReviewMeeting, TicketEvent
from .rules import LONDON, next_workday

TOMORROW = next_workday(timezone.now().astimezone(LONDON).date())


def at(day, hour, minute=0):
    return datetime.combine(day, time(hour, minute), LONDON)


def outlook(uid, subject, start, organiser='med@kbc.test', attendees=(), cancelled=False, event_id=None):
    """An Outlook event as Graph returns it (times in UTC)."""
    utc = start.astimezone(dt_timezone.utc)
    return {'iCalUId': uid, 'id': event_id or f'id-{uid}', 'subject': subject, 'isCancelled': cancelled,
            'start': {'dateTime': utc.strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
            'end': {'dateTime': (utc + timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S.0000000'), 'timeZone': 'UTC'},
            'organizer': {'emailAddress': {'address': organiser}},
            'attendees': [{'emailAddress': {'address': address}, 'status': {'response': response, 'time': '2026-10-20T09:00:00Z'}}
                          for address, response in attendees]}


def directory():
    profiles = {email: {'learner_email': email, 'learner_name': name, 'coach': coach} for email, name, coach in (
        ('ann@mail.test', 'Ann Lee', 'Carol Coach'),
        ('rosemary@mail.test', 'Rosemary Sweeney', 'Med Maher'),
        ('warren@mail.test', 'Warren Mortimer', 'Med Maher'),
        ('ellen@mail.test', "Ellen O'Brien", 'Med Maher'),
        ('jade@mail.test', 'Jade Seamer', 'Med Maher'),
        # A coach who is also enrolled on a programme.
        ('med@kbc.test', 'Med Maher', 'Aib Shousha'),
    )}
    return Learners(profiles, {}, coach_emails={'carol coach': 'carol@kbc.test', 'med maher': 'med@kbc.test',
                                                'aib shousha': 'aib@kbc.test'})


class MatchingTests(unittest.TestCase):
    def setUp(self):
        people = directory()
        self.matcher = review_meetings.Matcher(people, set(review_meetings.mailboxes(people)))

    def match(self, subject, attendees=(), coach='med@kbc.test'):
        return self.matcher.match(subject, {address: {} for address in attendees}, coach)

    def test_what_counts_as_a_review(self):
        self.assertEqual(review_meetings.review_type('Progress Review Meeting with Radwa - Ann Lee'), 'pr')
        self.assertEqual(review_meetings.review_type('Monthly Coaching Review with Med Maher - Jade Seamer'), 'mcm')
        self.assertEqual(review_meetings.review_type('Coaching with Patryk - Hilary Chapman'), 'mcm')
        for other in ('Weekly coaching meeting', 'PR Presentation', 'Thomas Emblem - Gateway Review', 'LMS MCM submission issue'):
            self.assertIsNone(review_meetings.review_type(other), other)

    def test_the_invited_learner_wins_and_a_coach_is_never_the_learner(self):
        # Med Maher is the coach and also enrolled; Jade is invited.
        self.assertEqual(self.match('Monthly Coaching Review with Med Maher - Someone Else', ['med@kbc.test', 'jade@mail.test']),
                         ('jade@mail.test', 'email'))
        # Only the coach invited: the subject decides, and "Med Maher" in it is not a learner here.
        self.assertEqual(self.match('Monthly Coaching Review with Med Maher - Jade Seamer', ['med@kbc.test']), ('jade@mail.test', 'name'))
        # Two learners invited: nobody.
        self.assertEqual(self.match('Monthly coaching', ['jade@mail.test', 'warren@mail.test']), ('', ''))

    def test_names_written_surname_first_with_an_apostrophe_or_shortened_are_found(self):
        self.assertEqual(self.match('Monthly Coaching Review with Med Maher - Mortimer, Warren'), ('warren@mail.test', 'name'))
        self.assertEqual(self.match('Monthly Coaching Review with Med Maher - Ellen Obrien'), ('ellen@mail.test', 'name'))
        # "Rosie": the surname among this coach's learners.
        self.assertEqual(self.match('Monthly Coaching Review with Med Maher - Rosie  Sweeney'), ('rosemary@mail.test', 'surname'))
        # The same surname under another coach is not this coach's learner.
        self.assertEqual(self.match('Progress review with Carol - Rosie Sweeney', coach='carol@kbc.test'), ('', ''))


class FakeGraph:
    """Calendars by mailbox, and what a lookup by id or a cancel does."""

    def __init__(self):
        self.calendars, self.failing, self.lookups, self.requests = {}, set(), {}, []
        self.cancel_error = None

    def __call__(self, method, path, payload=None, headers=None, profile='calendar'):
        self.requests.append((method, path, payload))
        mailbox = unquote(path.split('/')[1])
        if method == 'GET' and '/calendarView?' in path:
            if mailbox in self.failing:
                raise graph.GraphError('Microsoft Graph GET failed (503).', 503)
            if mailbox not in self.calendars:
                raise graph.GraphError('Microsoft Graph GET failed (404 MailboxNotEnabledForRESTAPI).', 404)
            return {'value': self.calendars[mailbox]}
        if method == 'GET' and '/events?' in path:   # the organiser's copy by iCalUId
            uid = parse_qs(urlparse(path).query)['$filter'][0].split("'")[1]
            found = [e for e in self.calendars.get(mailbox, []) if e['iCalUId'] == uid]
            return {'value': [{'id': e['id'], 'isCancelled': e['isCancelled']} for e in found]}
        if method == 'GET' and '/events/' in path:
            event = self.lookups.get(unquote(path.split('/events/')[1].split('?')[0]))
            if event is None:
                raise graph.GraphError('Microsoft Graph GET failed (404 ErrorItemNotFound).', 404)
            return event
        if method == 'PATCH' and '/events/' in path:
            if self.cancel_error:
                raise self.cancel_error
            return {}
        if method == 'POST' and path.endswith('/cancel'):
            if self.cancel_error:
                raise self.cancel_error
            return {}
        raise AssertionError(f'Unexpected Graph call {method} {path}')


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class ReviewMeetingTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        self.people = directory()
        self.graph = FakeGraph()
        patches = [mock.patch.object(graph, 'request', side_effect=self.graph),
                   mock.patch.object(graph, 'configured', return_value=True),
                   mock.patch.object(graph, 'settings', return_value={'base_url': 'https://graph.test/v1.0'}),
                   mock.patch('callcentre.sources.cached_directory', return_value=self.people),
                   mock.patch('callcentre.sources.on_break_emails', return_value=frozenset()),
                   mock.patch('callcentre.sources.active_case_contacts', return_value=Q())]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def sync(self):
        return review_meetings.sync(self.people)

    def kinds(self, uid):
        return [e.kind for e in ReviewMeeting.objects.get(ical_uid=uid).events.order_by('at', 'id')]

    def test_meetings_are_found_with_the_learners_reply_then_moved_cancelled_removed_and_back(self):
        later = TOMORROW + timedelta(days=2)
        rosemary = outlook('A', 'Monthly Coaching Review with Med Maher - Rosie Sweeney', at(TOMORROW, 10),
                           attendees=[('rosemary@mail.test', 'accepted')])
        # Booked through the booking mailbox: Carol's copy has no replies; the organiser's copy (read too) has Ann's.
        ann_copy = outlook('B', 'Progress Review with Carol - Ann Lee', at(TOMORROW, 11), organiser='bookings@kbc.test',
                           attendees=[('ann@mail.test', 'none'), ('carol@kbc.test', 'accepted')])
        ann_own = {**ann_copy, 'id': 'organiser-B', 'attendees': [{'emailAddress': {'address': 'ann@mail.test'},
                                                                  'status': {'response': 'declined', 'time': '2026-10-21T08:00:00Z'}}]}
        warren = outlook('C', 'Monthly Coaching Review with Med Maher - Mortimer, Warren', at(later, 15))
        staff = outlook('D', 'Weekly coaching meeting', at(TOMORROW, 9))
        self.graph.calendars = {'med@kbc.test': [rosemary, warren, staff], 'carol@kbc.test': [ann_copy],
                                'bookings@kbc.test': [ann_own]}
        summary = self.sync()
        self.assertEqual((summary['meetings'], summary['found'], summary['unreadable']), (3, 3, 0))
        meetings = {m.ical_uid: m for m in ReviewMeeting.objects.all()}
        self.assertEqual((meetings['A'].learner_email, meetings['A'].matched_by, meetings['A'].learner_response),
                         ('rosemary@mail.test', 'email', 'accepted'))
        self.assertEqual((meetings['B'].learner_email, meetings['B'].learner_response, meetings['B'].event_mailbox,
                          meetings['B'].coach_email), ('ann@mail.test', 'declined', 'bookings@kbc.test', 'carol@kbc.test'))
        self.assertEqual(meetings['C'].learner_email, 'warren@mail.test')

        # Rosemary's meeting moves, Ann's is cancelled by the organiser, Warren's disappears and is gone when looked up.
        self.graph.calendars = {'med@kbc.test': [{**rosemary, **outlook('A', rosemary['subject'], at(TOMORROW, 14),
                                                                       attendees=[('rosemary@mail.test', 'accepted')])}],
                                'carol@kbc.test': [{**ann_copy, 'isCancelled': True}], 'bookings@kbc.test': []}
        summary = self.sync()
        self.assertEqual((summary['moved'], summary['cancelled'], summary['removed']), (1, 1, 1))
        self.assertEqual(ReviewMeeting.objects.get(ical_uid='A').start_at, at(TOMORROW, 14))
        self.assertEqual(self.kinds('A'), ['found', 'moved'])
        self.assertEqual(self.kinds('B'), ['found', 'cancelled_in_outlook'])
        self.assertEqual(self.kinds('C'), ['found', 'removed_from_outlook'])
        self.assertEqual(ReviewMeeting.objects.get(ical_uid='C').cancelled_how, 'removed')

        # Warren's comes back (it was in a calendar that is now read again).
        self.graph.calendars['med@kbc.test'].append(warren)
        self.sync()
        self.assertEqual(ReviewMeeting.objects.get(ical_uid='C').status, 'scheduled')
        self.assertEqual(self.kinds('C'), ['found', 'removed_from_outlook', 'back_in_outlook'])

    def test_a_calendar_that_cannot_be_read_stops_removals_and_a_meeting_moved_away_is_moved_not_removed(self):
        rosemary = outlook('A', 'Monthly Coaching Review with Med Maher - Rosie Sweeney', at(TOMORROW, 10))
        self.graph.calendars = {'med@kbc.test': [rosemary], 'carol@kbc.test': []}
        self.sync()
        # Med's calendar fails: nothing is believed removed.
        self.graph.failing = {'med@kbc.test'}
        summary = self.sync()
        self.assertEqual((summary['unreadable'], summary['removed']), (1, 0))
        self.assertIn('could not be read', summary['error'])
        self.assertEqual(ReviewMeeting.objects.get(ical_uid='A').status, 'scheduled')
        # Moved beyond the calendar window: it is still in Outlook, so it is moved, not removed.
        self.graph.failing = set()
        self.graph.calendars['med@kbc.test'] = []
        far = TOMORROW + timedelta(days=30)
        self.graph.lookups['id-A'] = outlook('A', rosemary['subject'], at(far, 10))
        summary = self.sync()
        meeting = ReviewMeeting.objects.get(ical_uid='A')
        self.assertEqual((meeting.status, meeting.start_at, summary['removed']), ('scheduled', at(far, 10), 0))
        self.assertEqual(self.kinds('A'), ['found', 'moved'])
        # aib@kbc.test has no mailbox (404): not a failure.
        self.assertEqual(summary['unreadable'], 0)

    def test_the_next_day_reminders_are_the_scheduled_matched_meetings_of_the_next_working_day(self):
        jade = outlook('J', 'Monthly Coaching Review with Med Maher - Jade Seamer', at(TOMORROW, 11))
        cancelled = outlook('K', 'Progress Review with Med - Warren Mortimer', at(TOMORROW, 12), cancelled=True)
        nobody = outlook('L', 'Monthly coaching with Med - Someone Unknown', at(TOMORROW, 13))
        later = outlook('M', 'Monthly coaching with Med - Ellen OBrien', at(TOMORROW + timedelta(days=1), 13))
        self.graph.calendars = {'med@kbc.test': [jade, cancelled, nobody, later]}
        self.sync()
        with mock.patch.object(sources, 'rows', return_value=[]):
            bookings = sources.load_bookings(self.people)
        self.assertEqual([(b['email'], b['type'], b['id'], b['source']) for b in bookings], [('jade@mail.test', 'mcm', 'J', 'outlook')])
        # The reminder made from it, then the meeting cancelled in Outlook: the reminder is set aside.
        sources.generate_reminders(self.people, bookings)
        reminder = CaseTicket.objects.get(source_type='reminder')
        self.assertEqual((reminder.source_data['booking_source'], reminder.source_data['booking_id']), ('outlook', 'J'))
        self.graph.calendars['med@kbc.test'][0] = {**jade, 'isCancelled': True}
        self.sync()
        with mock.patch.object(sources, 'rows', return_value=[]):
            sources.generate_reminders(self.people, sources.load_bookings(self.people))
        reminder.refresh_from_db()
        self.assertFalse(reminder.source_data['eligible'])

    def reminder(self):
        jade = outlook('J', 'Monthly Coaching Review with Med Maher - Jade Seamer', at(TOMORROW, 11),
                       attendees=[('jade@mail.test', 'accepted')])
        self.graph.calendars = {'med@kbc.test': [jade]}
        self.sync()
        return CaseTicket.objects.create(
            source_type='reminder', reason_key='reminder:jade', learner_email='jade@mail.test', learner_name='Jade Seamer',
            booking_at=at(TOMORROW, 11), due_at=at(TOMORROW, 11),
            source_data={'booking_source': 'outlook', 'booking_id': 'J', 'session_type': 'mcm'})

    def meeting_view(self, ticket, data=None):
        from .views import ticket_meeting
        director = get_user_model().objects.create_superuser(f'director-{uuid.uuid4().hex[:12]}', 'director@kbc.test', 'x')
        request = (RequestFactory().post('/', data=json.dumps(data), content_type='application/json') if data is not None
                   else RequestFactory().get('/'))
        request.user, request._dont_enforce_csrf_checks = director, True
        return ticket_meeting(request, ticket.pk)

    def post_cancel(self, ticket, data):
        return self.meeting_view(ticket, {'action': 'cancel', **data})

    def test_cancelling_from_a_reminder_cancels_in_outlook_and_the_lms_tells_the_coach_and_records_it(self):
        ticket = self.reminder()
        lms = mock.MagicMock()
        lms.cursor.return_value.__enter__.return_value.rowcount = 1
        with mock.patch.object(review_meetings, 'connections', {review_meetings.LMS: lms}):
            response = self.post_cancel(ticket, {'reason': 'cannot_attend', 'note': 'Work shift moved'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(json.loads(response.content)['meeting']['status'], 'cancelled')
        calls = [(method, unquote(path).split('?')[0]) for method, path, _ in self.graph.requests if 'calendarView' not in path]
        self.assertEqual(calls, [('GET', 'users/med@kbc.test/events'), ('POST', 'users/med@kbc.test/events/id-J/cancel')])
        comment = self.graph.requests[-1][2]['Comment']
        self.assertIn('monthly coaching meeting', comment)
        self.assertNotIn('Work shift', comment)   # the specialist's note stays internal
        meeting = ReviewMeeting.objects.get(ical_uid='J')
        self.assertEqual((meeting.status, meeting.cancelled_how, meeting.cancel_reason),
                         ('cancelled', 'engagement_centre', 'The learner cannot attend: Work shift moved'))
        self.assertEqual(self.kinds('J'), ['found', 'cancelled_by_specialist', 'lms_cancelled', 'coach_note'])
        note = meeting.events.get(kind='coach_note').detail
        self.assertEqual((note['to'], note['sent']), ('med@kbc.test', False))   # email is in dry-run mode in tests
        sql, params = lms.cursor.return_value.__enter__.return_value.execute.call_args[0]
        self.assertIn('"Coach".coach_calendar_event', sql)
        self.assertEqual(params, ['id-J', 'med@kbc.test'])
        self.assertTrue(TicketEvent.objects.filter(ticket=ticket, kind='meeting_cancelled').exists())
        # Already cancelled: refused, nothing sent to Outlook again.
        sent = len(self.graph.requests)
        self.assertEqual(self.post_cancel(ticket, {'reason': 'other'}).status_code, 409)
        self.assertEqual(len(self.graph.requests), sent)

    def test_a_cancel_outlook_refuses_changes_nothing_and_is_recorded(self):
        ticket = self.reminder()
        self.graph.cancel_error = graph.GraphError('Microsoft Graph POST failed (403 ErrorAccessDenied).', 403)
        response = self.post_cancel(ticket, {'reason': 'learner_asked'})
        self.assertEqual(response.status_code, 409)
        self.assertIn('Outlook did not cancel', json.loads(response.content)['detail'])
        self.assertEqual(ReviewMeeting.objects.get(ical_uid='J').status, 'scheduled')
        self.assertEqual(self.kinds('J'), ['found', 'cancel_failed'])
        self.assertEqual(self.post_cancel(ticket, {'reason': 'not a reason'}).status_code, 400)

    def test_a_reached_next_day_call_confirms_the_meeting_and_the_case_shows_it(self):
        from .services import confirm_review_meeting
        from .views import detail
        ticket = self.reminder()
        confirm_review_meeting(ticket, None, 'Alice')
        meeting = ReviewMeeting.objects.get(ical_uid='J')
        self.assertEqual(meeting.confirmed_by, 'Alice')
        self.assertEqual(self.kinds('J'), ['found', 'confirmed_on_call'])
        director = get_user_model().objects.create_superuser('viewer', 'viewer@kbc.test', 'x')
        request = RequestFactory().get('/')
        request.user = director
        response = detail(request, ticket.pk)
        self.assertEqual(response.status_code, 200, response.content)
        shown = json.loads(response.content)['ticket']['meeting']
        self.assertEqual((shown['status'], shown['learner_response'], shown['confirmed'], shown['cancellable']),
                         ('scheduled', 'accepted', True, True))

    def test_the_audit_lists_meetings_with_counts_and_one_meeting_with_its_history_for_directors_only(self):
        from .views import review_meetings_view
        ticket = self.reminder()
        self.graph.calendars['med@kbc.test'].append(outlook('K', 'Progress Review with Med - Warren Mortimer', at(TOMORROW, 12), cancelled=True))
        self.sync()
        users = get_user_model().objects
        director = users.create_superuser('boss', 'boss@kbc.test', 'x')

        def get(user, **params):
            request = RequestFactory().get('/', params)
            request.user = user
            return review_meetings_view(request)
        self.assertEqual(get(users.create_user('plain')).status_code, 403)
        listing = json.loads(get(director).content)
        self.assertEqual(listing['counts']['total'], 2)
        self.assertEqual((listing['counts']['scheduled'], listing['counts']['cancelled_outlook']), (1, 1))
        self.assertEqual([i['learner_name'] for i in json.loads(get(director, status='cancelled').content)['items']], ['Warren Mortimer'])
        one = json.loads(get(director, id=ReviewMeeting.objects.get(ical_uid='J').pk).content)
        self.assertEqual([e['kind'] for e in one['meeting']['events']], ['found'])
        self.assertEqual(one['case_ids'], [ticket.pk])

    def test_rescheduling_moves_the_meeting_to_a_free_time_of_the_coach_in_outlook_and_the_lms(self):
        ticket = self.reminder()
        day = TOMORROW + timedelta(days=1)
        offered = [at(day, 9), at(day, 10), at(day, 11)]
        busy = [(at(day, 10), at(day, 11)), (at(TOMORROW, 11), at(TOMORROW, 12))]   # a meeting at 10; this meeting itself
        lms = mock.MagicMock()
        lms.cursor.return_value.__enter__.return_value.rowcount = 1
        with mock.patch('callcentre.lms_booking.slot_starts', return_value=offered),                 mock.patch('callcentre.lms_booking.coach_busy', return_value=busy) as coach_busy,                 mock.patch.object(review_meetings, 'connections', {review_meetings.LMS: lms}):
            times = json.loads(self.meeting_view(ticket).content)['times']
            self.assertEqual([t['start'] for t in times], [at(day, 9).isoformat(), at(day, 11).isoformat()])
            self.assertEqual(coach_busy.call_args[0][0], 'med@kbc.test')
            # A time that is not free is refused, and nothing reaches Outlook.
            taken = self.meeting_view(ticket, {'action': 'reschedule', 'start': at(day, 10).isoformat(), 'reason': 'cannot_attend'})
            self.assertEqual(taken.status_code, 409)
            self.assertFalse([r for r in self.graph.requests if r[0] == 'PATCH'])
            moved = self.meeting_view(ticket, {'action': 'reschedule', 'start': at(day, 9).isoformat(), 'reason': 'learner_asked',
                                               'note': 'Prefers mornings'})
        self.assertEqual(moved.status_code, 200, moved.content)
        method, path, payload = [r for r in self.graph.requests if r[0] == 'PATCH'][0]
        self.assertEqual(unquote(path), 'users/med@kbc.test/events/id-J')
        self.assertEqual(payload['start'], {'dateTime': at(day, 9).astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': 'UTC'})
        self.assertEqual(payload['end']['dateTime'], at(day, 10).astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'))
        meeting = ReviewMeeting.objects.get(ical_uid='J')
        self.assertEqual((meeting.status, meeting.start_at, meeting.learner_response), ('scheduled', at(day, 9), ''))
        self.assertEqual(self.kinds('J'), ['found', 'rescheduled_by_specialist', 'lms_moved', 'coach_note'])
        sql, params = lms.cursor.return_value.__enter__.return_value.execute.call_args[0]
        self.assertIn('scheduled_date', sql)
        self.assertEqual(params[:3], [day, time(9), 'id-J'])
        self.assertTrue(TicketEvent.objects.filter(ticket=ticket, kind='meeting_rescheduled').exists())
        # The next sync sees Outlook at the new time: no extra "moved".
        self.graph.calendars['med@kbc.test'] = [outlook('J', 'Monthly Coaching Review with Med Maher - Jade Seamer', at(day, 9),
                                                        attendees=[('jade@mail.test', 'none')])]
        self.sync()
        self.assertEqual(self.kinds('J'), ['found', 'rescheduled_by_specialist', 'lms_moved', 'coach_note'])

    def test_test_learners_get_no_reminders_and_are_off_every_list(self):
        from .learners import is_test_learner, test_emails
        from .rules import out_of_scope
        people = directory()
        people['qa@mail.test'] = {'learner_email': 'qa@mail.test', 'learner_name': 'APM L4 Oct 26 (Test)', 'coach': 'Med Maher'}
        people['launch@example.test'] = {'learner_email': 'launch@example.test', 'learner_name': 'Launch Check', 'coach': 'Med Maher'}
        self.assertTrue(is_test_learner(people['qa@mail.test']))
        self.assertTrue(is_test_learner(people['launch@example.test']))
        self.assertFalse(is_test_learner({'learner_email': 'jo@mail.test', 'learner_name': 'Jo Testa'}))
        self.assertEqual(test_emails(people), {'qa@mail.test', 'launch@example.test'})
        self.people = people
        self.graph.calendars = {'med@kbc.test': [outlook('Q', 'Monthly coaching with Med', at(TOMORROW, 9), attendees=[('qa@mail.test', 'accepted')]),
                                                 outlook('J', 'Monthly coaching with Med - Jade Seamer', at(TOMORROW, 10))]}
        self.sync()
        self.assertEqual(ReviewMeeting.objects.get(ical_uid='Q').learner_email, 'qa@mail.test')   # kept for the audit
        self.assertEqual([b['email'] for b in sources.review_bookings(people, TOMORROW)], ['jade@mail.test'])
        case = CaseTicket.objects.create(source_type='manual', reason_key='manual:qa', learner_email='qa@mail.test', learner_name='QA',
                                         due_at=timezone.now())
        with mock.patch('callcentre.sources.cached_directory', return_value=people):
            self.assertFalse(CaseTicket.objects.exclude(out_of_scope()).filter(pk=case.pk).exists())

    def pr_reminder(self, **fields):
        return CaseTicket.objects.create(**{
            'source_type': 'reminder', 'reason_key': f'reminder:{uuid.uuid4().hex[:8]}', 'learner_email': 'ann@mail.test',
            'learner_name': 'Ann Lee', 'manager_name': 'Max Manager', 'manager_email': 'max@employer.test',
            'booking_at': at(TOMORROW, 14), 'due_at': at(TOMORROW, 14),
            'source_data': {'booking_source': 'outlook', 'booking_id': 'P', 'session_type': 'pr'}, **fields})

    def test_a_next_day_progress_review_is_confirmed_with_the_employer_before_it_can_be_resolved(self):
        from . import employer_check
        from .models import Agent
        from .services import resolve
        self.people.manager_phones = {'max@employer.test': '+447700900555'}
        self.graph.calendars = {'carol@kbc.test': [outlook('P', 'Progress Review with Carol - Ann Lee', at(TOMORROW, 14),
                                                           organiser='carol@kbc.test', attendees=[('ann@mail.test', 'accepted')])]}
        self.sync()
        ticket = self.pr_reminder()
        users = get_user_model().objects
        boss = users.create_superuser('boss-pr', 'boss@kbc.test', 'x')
        alice = Agent.objects.create(user=users.create_user('alice-pr'), display_name='Alice', zoom_email='alice@kbc.test',
                                     zoom_account='student', zoom_phone_number='+441622958955')
        shown = employer_check.state(ticket)
        self.assertEqual((shown['manager_name'], shown['manager_phone'], shown['done']), ('Max Manager', '+447700900555', False))
        # Not resolvable yet; "no answer" does not finish the step.
        with self.assertRaisesRegex(ValueError, 'employer'):
            resolve(ticket.pk, boss, note='Learner confirmed', acting_agent=alice)
        employer_check.record(ticket.pk, boss, 'no_answer', '', acting_agent=alice)
        with self.assertRaisesRegex(ValueError, 'employer'):
            resolve(ticket.pk, boss, note='Learner confirmed', acting_agent=alice)
        with self.assertRaisesRegex(ValueError, 'Say what happened'):
            employer_check.record(ticket.pk, boss, 'not_reachable', '', acting_agent=alice)
        dialled = employer_check.dial(ticket.pk, boss, acting_agent=alice)
        self.assertEqual(dialled['zoom_url'], 'zoomphonecall://+447700900555?callerid=%2B441622958955')
        done = employer_check.record(ticket.pk, boss, 'confirmed', 'Max will release Ann at 2pm', acting_agent=alice)
        self.assertEqual((done['result'], done['done'], done['by'], done['tries']), ('confirmed', True, 'Alice', 2))
        resolve(ticket.pk, boss, note='Learner and employer confirmed', acting_agent=alice)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'resolved')
        kinds = list(TicketEvent.objects.filter(ticket=ticket).order_by('id').values_list('kind', flat=True))
        self.assertEqual([k for k in kinds if k.startswith('employer')], ['employer_check', 'employer_dialled', 'employer_check'])
        self.assertEqual([e.detail['result'] for e in ReviewMeeting.objects.get(ical_uid='P').events.filter(kind='employer_checked')],
                         ['no_answer', 'confirmed'])

    def test_only_progress_reviews_need_the_employer_and_a_manager_without_a_number_cannot_be_rung(self):
        from . import employer_check
        from .services import resolve
        boss = get_user_model().objects.create_superuser('boss-mcm', 'boss@kbc.test', 'x')
        coaching = self.pr_reminder(source_data={'booking_source': 'outlook', 'booking_id': 'M', 'session_type': 'mcm'})
        self.assertIsNone(employer_check.state(coaching))
        resolve(coaching.pk, boss, note='Learner confirmed')
        review = self.pr_reminder()
        self.assertEqual(employer_check.state(review)['manager_phone'], '')
        with self.assertRaisesRegex(Exception, 'Calls are made from a specialist'):
            employer_check.dial(review.pk, boss)
        with self.assertRaisesRegex(Exception, 'Only next-day progress reviews'):
            employer_check.record(coaching.pk, boss, 'confirmed', '')
