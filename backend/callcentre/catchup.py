"""Booking completes a calling task; confirmed absence creates a new one."""
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from .db import DB, LMS
from .models import CaseTicket
from .rules import LONDON, email_key
from .services import close, event
from .sources import rows, upsert_case


def adopt_lms_bookings(people):
    """Also honour bookings made directly in the LMS, linked to the exact lecture."""
    from .lms_booking import kbc_report_id
    pending = list(CaseTicket.objects.filter(source_type='attendance', archived=False)
                   .exclude(status='resolved').exclude(source_data__has_key='catchup_booking'))
    if not pending:
        return 0
    emails = {e for t in pending for p in [people.resolve(email=t.learner_email)] if p for e in p['emails']}
    days = {t.overdue_since for t in pending if t.overdue_since}
    if not emails or not days:
        return 0
    registers = rows(DB, '''SELECT "key", "Email", "date", "module" FROM public.kbc_attendance
        WHERE lower(trim("Email")) = ANY(%s) AND "date" = ANY(%s)''', [list(emails), list(days)])
    reports = rows(LMS, '''SELECT r.id AS report_id, r.attendance_id, r.learner_email AS report_email,
            e.id, e.event_key, e.learner_id, e.learner_email, e.scheduled_date, e.scheduled_time,
            e.owner_name, e.meeting_link
        FROM "Coach".coach_absence_report r JOIN "Coach".coach_calendar_event e
          ON e.event_key = r.catchup_event_key
        WHERE r.status = 'approved' AND e.event_type = 'catch-up'
          AND e.status IN ('scheduled', 'completed') AND e.scheduled_time IS NOT NULL
          AND e.scheduled_date IS NOT NULL AND coalesce(e.sync_state, '') NOT IN ('failed', 'syncing')''')
    closed = 0
    for ticket in pending:
        person = people.resolve(email=ticket.learner_email)
        if not person:
            continue
        register_keys = {str(r['key']) for r in registers if r['key']
                         and email_key(r['Email']) in person['emails']
                         and r['date'] == ticket.overdue_since
                         and str(r['module'] or '').strip() == str(ticket.source_data.get('module') or '').strip()}
        if len(register_keys) != 1:
            continue
        report_id = kbc_report_id(next(iter(register_keys)))
        matches = [r for r in reports if r['attendance_id'] == report_id
                   and email_key(r['report_email']) in person['emails']
                   and people.calendar_person(r) is person
                   and r['event_key'] != (ticket.source_data.get('catchup_no_show') or {}).get('event_key')]
        if len(matches) != 1:
            continue
        row = matches[0]
        record = {'session_type': 'catch-up', 'event_key': row['event_key'],
                  'start': datetime.combine(row['scheduled_date'], row['scheduled_time'], LONDON).isoformat(),
                  'coach': row['owner_name'], 'join_url': row['meeting_link'],
                  'lms_report_id': row['report_id'], 'link_warning': ''}
        with transaction.atomic(using=DB):
            locked = CaseTicket.objects.select_for_update().get(pk=ticket.pk)
            if locked.status == 'resolved' or locked.source_data.get('catchup_booking'):
                continue
            locked.source_data = {**locked.source_data, 'catchup_booking': record}
            event(locked, 'session_booked', {**record, 'source': 'lms'})
            close(locked, None, 'system', 'catch_up_session',
                  {'note': 'Catch-up booking verified in the LMS.', 'booking': record})
            closed += 1
    return closed


def confirmed_absence(key, people, person, now=None, read=rows):
    """Pending/unknown attendance is NOT a no-show. Read the exact booked event."""
    data = read(LMS, '''SELECT e.id, e.learner_id, e.learner_email, e.event_type, e.status,
            e.scheduled_date, e.scheduled_time, e.duration_minutes,
            a.id AS attendance_id, a.email AS participant_email, a.attended,
            a.status AS attendance_status
        FROM "Coach".coach_calendar_event e JOIN "Coach".coach_meeting_attendance a
          ON a.calendar_event_id = e.id
        WHERE e.event_key = %s AND a.role = 'learner' AND a.is_current IS TRUE''', [key])
    if not data or any(people.calendar_person(r) is not person for r in data):
        return None
    matched = [r for r in data if email_key(r['participant_email']) in person['emails']]
    if not matched:
        return None
    for r in matched:
        if (r['event_type'] != 'catch-up' or r['status'] in ('cancelled', 'not-scheduled')
                or r['attended'] is not False or r['attendance_status'] != 'absent'
                or not r['scheduled_date'] or not r['scheduled_time']):
            return None
        end = datetime.combine(r['scheduled_date'], r['scheduled_time'], LONDON) + timedelta(
            minutes=r['duration_minutes'] or 60)
        if end > (now or timezone.now()):
            return None
    return {'event_key': key, 'calendar_id': matched[0]['id'],
            'attendance_ids': sorted({r['attendance_id'] for r in matched}),
            'date': matched[0]['scheduled_date'].isoformat()}


def sync(people):
    """Idempotent, preserving the original closed case and each booked session."""
    if not hasattr(people, 'resolve') or not people.sources_complete:
        return {'closed': 0, 'created': 0}
    closed, created = adopt_lms_bookings(people), 0
    candidates = CaseTicket.objects.filter(source_type='attendance', archived=False,
                                          source_data__has_key='catchup_booking')
    for original in candidates.iterator():
        booking = original.source_data.get('catchup_booking') or {}
        key = booking.get('event_key')
        if not key or not original.events.filter(kind='session_booked', data__event_key=key).exists():
            continue
        person = people.resolve(email=original.learner_email)
        if not person:
            continue
        with transaction.atomic(using=DB):
            locked = CaseTicket.objects.select_for_update().get(pk=original.pk)
            if locked.status == 'pending_verification':
                close(locked, None, 'system', 'catch_up_session',
                      {'note': 'Catch-up booking completes the calling task.', 'booking': booking})
                closed += 1
            if locked.status != 'resolved':
                continue
            proof = confirmed_absence(key, people, person)
            if not proof:
                continue
            data = {k: v for k, v in original.source_data.items()
                    if k not in ('catchup_booking', 'catchup_no_show', 'previous_case_id')}
            data.update(catchup_no_show=proof, previous_case_id=original.pk)
            followup, added = upsert_case('attendance', person['profile'],
                f'catchup-no-show:{key}', overdue=original.overdue_since,
                data=data, person=person)
            if added:
                event(followup, 'catchup_missed', {'previous_case_id': original.pk, **proof})
                created += 1
    return {'closed': closed, 'created': created}
