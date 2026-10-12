"""Book a coach session straight into the LMS coach calendar, with its Teams meeting.

Mirrors the LMS booking path (``coach_api.views.reserve_coach_calendar_booking`` →
``synchronize_reserved_calendar_event`` → ``sync_calendar_event_to_graph``) and, for a missed
lecture, the LMS absence report that links the catch-up to it (``learner_api.absence_reports``).
Keep both in step with the LMS: the LMS screens read these rows as if the LMS had written them.

Only the LMS's simple session types are bookable here. Progress reviews and monthly coaching are
generated LMS review slots tied to review forms and are deliberately not created from outside the LMS.
"""
import hashlib
import re
import uuid
from datetime import datetime, time, timedelta, timezone as dt_timezone
from html import escape

from django.db import IntegrityError, connections, transaction
from django.utils import timezone

from . import graph
from .aptem_summaries import normalize_attendance_value
from .db import APTEM, DB, LMS
from .learners import STAFF_SQL, pick_coach, program_status, staff_emails
from .rules import LONDON, email_key, working_day
from .services import Conflict

CATCH_UP, SUPPORT = 'catch-up', 'student-support'
TITLES = {CATCH_UP: 'Catch-up Session', SUPPORT: 'Student Support'}
DURATION = 60
FIRST_HOUR, LAST_HOUR = 9, 16          # whole hour-long slots inside 09:00-17:00 UK
LEAD = timedelta(minutes=60)
DAYS_AHEAD = 14
REASONS = {
    'illness': 'Illness or medical appointment',
    'work': 'Work commitment',
    'emergency': 'Family or personal emergency',
    'travel': 'Travel disruption',
    'technical': 'Technical issue',
    'other': 'Other',
}
COVERED_YEARS = range(2026, 2029)
ACTIVE_STATUSES = ('not-scheduled', 'scheduled', 'in-progress', 'awaiting-signature')
LOCK_SCOPE = '__calendar_booking__'
KBC_REPORT_ID_BASE = 8_000_000_000_000_000_000
KBC_REPORT_ID_RANGE = 1_000_000_000_000_000_000
REQUEST_ID = re.compile(r'^[A-Za-z0-9-]{8,64}$')


class Unavailable(RuntimeError):
    """An outside system (Graph, a database) could not be used; nothing was booked."""


def session_types(ticket):
    # Employers are not learners: no coach session is booked from an employer call.
    if ticket.source_type in ('employer_feedback', 'satisfaction'):
        return []
    return [CATCH_UP, SUPPORT] if ticket.source_type == 'attendance' else [SUPPORT]


def bookable_day(day):
    return working_day(day) and day.year in COVERED_YEARS


def kbc_report_id(key):
    """The LMS's absence-report id for a kbc_attendance key (learner_api.absence_reports._kbc_attendance_report_id)."""
    digest = hashlib.sha256(str(key).encode('utf-8')).digest()
    return KBC_REPORT_ID_BASE + int.from_bytes(digest[:8], 'big') % KBC_REPORT_ID_RANGE


def _fetch(cursor, sql, params=()):
    cursor.execute(sql, params)
    columns = [c[0] for c in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def lms_learner(email):
    """The learner and their coach as the LMS enrolment record (enrolment."Created_users") gives them.

    Unified mode resolves source aliases through the shared directory. The calendar row
    is still filed under Created_users.id, not a profile ID or an Aptem ID. Legacy mode
    retains the original direct enrolment lookup for reader rollback.
    """
    from .sources import rows, learner_directory
    from .identity import enabled
    if enabled():
        people = learner_directory()
        if not people.sources_complete:
            raise Unavailable('Learner identity could not be verified; no booking was made.')
        person = people.resolve(email=email)
        if not person or not person['enrolment']:
            raise ValueError('No unique LMS enrolment is linked to this contact. Review their identity before booking.')
        if program_status(person['programme_status']) != 'active':
            raise ValueError('Only an Active or Delivery LMS enrolment can currently book this session type.')
        if not person['coach_email']:
            raise ValueError('No verified coach email is available for this learner.')
        aptem_ids = [value for source, value in person['source_ids'] if source == 'aptem']
        return {'source_id': person['enrolment']['id'], 'aptem_id': aptem_ids[0] if aptem_ids else None,
                'name': person['profile']['learner_name'], 'email': person['profile']['learner_email'],
                'coach_email': person['coach_email'], 'coach_name': person['profile']['coach']}
    found = rows(LMS, '''SELECT id, aptem_id, "Username", "Email", "Programme_status", "Coach_name", "Coach_email",
            "Case_owner" FROM enrolment."Created_users"
        WHERE lower(trim("Email")) = %s AND lower(coalesce("Programme_status", '')) <> 'duplicate - merged' ''',
                 [email_key(email)])
    if not found:
        raise ValueError('This learner is not in the LMS (Aptem only), so the LMS cannot take a booking for them.')
    if len(found) > 1:
        raise ValueError('More than one LMS learner uses this email. Book from the LMS instead.')
    row = found[0]
    status = program_status(row['Programme_status'])
    if status == 'break':
        raise ValueError('This learner is on a break in learning in the LMS, so no session can be booked for them.')
    if status != 'active':
        raise ValueError(f'This learner’s LMS status is “{(row["Programme_status"] or "").strip() or "not set"}”, '
                         'not Active, so the LMS cannot take a booking for them. Check their status with the LMS team.')
    try:
        owners = rows(APTEM, '''SELECT DISTINCT "OwnerName" FROM public.aptem_auto_extracting
            WHERE "ID"::text = %s OR lower(trim("Email")) = %s''', [str(row['aptem_id'] or '').strip(), email_key(email)])
    except Exception:
        owners = []
    aptem_owner = owners[0]['OwnerName'] if len(owners) == 1 else ''
    coach_name, coach_email = pick_coach(row['Coach_name'], row['Coach_email'], row['Case_owner'], aptem_owner,
                                         staff_emails(rows(LMS, STAFF_SQL)))
    if not coach_email:
        raise ValueError(f'No email is recorded in the LMS for the learner’s coach ({coach_name or "none set"}). '
                         'Ask for their coach to be set in the LMS first.')
    name = (row['Username'] or '').strip() or 'Learner'
    return {'source_id': row['id'], 'aptem_id': row['aptem_id'], 'name': name, 'email': email_key(row['Email']),
            'coach_email': coach_email, 'coach_name': coach_name}


def missed_lecture(ticket):
    """The register row this missed-lecture case is about, read-only from kbc_attendance."""
    from .sources import rows
    module = str((ticket.source_data or {}).get('module') or '').strip()
    from .identity import enabled
    emails = [ticket.learner_email]
    if enabled():
        from .sources import learner_directory
        person = learner_directory().resolve(email=ticket.learner_email)
        if not person:
            raise Conflict('Learner identity requires review before linking a missed lecture.')
        emails = person['emails']
    found = rows(DB, '''SELECT "ID", "key", "date", "Attendance", "module", "lecture_name" FROM public.kbc_attendance
        WHERE lower(trim("Email")) = ANY(%s) AND "date" = %s AND trim(coalesce("module", '')) = %s''',
                 [emails, ticket.overdue_since, module])
    missed = [r for r in found if normalize_attendance_value(r['Attendance']) == 0 and str(r['key'] or '').strip()]
    recorded_key = ticket.source_data.get('attendance_key')
    if recorded_key:
        missed = [r for r in missed if str(r['key']) == str(recorded_key)]
    if not missed:
        raise Conflict('The register no longer shows this lecture as missed.')
    if len({str(r['key']).strip() for r in missed}) > 1:
        raise Conflict('The register has more than one entry for this lecture. Book it from the LMS.')
    row = missed[0]
    return {'key': str(row['key']).strip(), 'register_id': row['ID'], 'date': row['date'],
            'title': str(row['lecture_name'] or '').strip() or module or 'Attendance session'}


# --- free slots -------------------------------------------------------------------------------

def _utc(value):
    return datetime.fromisoformat(str(value)[:19]).replace(tzinfo=dt_timezone.utc)


def coach_busy(coach, start, end):
    """Busy periods: anything not free in Outlook, plus the coach's live LMS bookings."""
    try:
        data = graph.request('POST', f'{graph.user_path(coach)}/calendar/getSchedule', {
            'schedules': [coach],
            'startTime': {'dateTime': start.astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': 'UTC'},
            'endTime': {'dateTime': end.astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': 'UTC'},
            'availabilityViewInterval': 15,
        }, headers={'Prefer': 'outlook.timezone="UTC"'})
    except graph.GraphError as exc:
        raise Unavailable('The coach’s calendar could not be read, so no times can be offered. Try again shortly.') from exc
    schedule = next((s for s in data.get('value') or [] if email_key(s.get('scheduleId')) == coach), None)
    if not schedule or schedule.get('error'):
        raise Unavailable('The coach’s calendar could not be read, so no times can be offered.')
    busy = [(_utc(item['start']['dateTime']), _utc(item['end']['dateTime']))
            for item in schedule.get('scheduleItems') or [] if str(item.get('status', '')).lower() != 'free']
    with connections[LMS].cursor() as cursor:
        booked = _fetch(cursor, '''SELECT scheduled_date, scheduled_time, duration_minutes FROM "Coach".coach_calendar_event
            WHERE lower(owner_email) = %s AND scheduled_date BETWEEN %s AND %s AND scheduled_time IS NOT NULL
              AND status NOT IN ('cancelled', 'not-scheduled')''',
                        [coach, start.astimezone(LONDON).date() - timedelta(days=1), end.astimezone(LONDON).date()])
    for row in booked:
        at = datetime.combine(row['scheduled_date'], row['scheduled_time'], LONDON)
        busy.append((at, at + timedelta(minutes=row['duration_minutes'] or DURATION)))
    return busy


def slot_starts(now=None, day=None):
    """Hour-long UK slots on offer before the coach's calendar is checked: weekdays, no bank holidays, 09-17,
    an hour's notice."""
    earliest = (now or timezone.now()) + LEAD
    first = earliest.astimezone(LONDON).date()
    days = [day] if day else [first + timedelta(days=n) for n in range(DAYS_AHEAD)]
    return [s for d in days if bookable_day(d) for hour in range(FIRST_HOUR, LAST_HOUR + 1)
            if (s := datetime.combine(d, time(hour), LONDON)) >= earliest]


def free_slots(coach, now=None, day=None):
    """The offered slots (slot_starts) the coach is free for."""
    starts = slot_starts(now, day)
    if not starts:
        return []
    busy = coach_busy(coach, starts[0], starts[-1] + timedelta(minutes=DURATION))
    length = timedelta(minutes=DURATION)
    return [s for s in starts if not any(s < b and s + length > a for a, b in busy)]


# --- booking ----------------------------------------------------------------------------------

def _existing_report(cursor, lecture, lock=False):
    rows = _fetch(cursor, '''SELECT r.id, r.status, r.catchup_event_key, e.status AS event_status,
            e.scheduled_date, e.scheduled_time
        FROM "Coach".coach_absence_report r
        LEFT JOIN "Coach".coach_calendar_event e ON e.event_key = r.catchup_event_key
        WHERE r.attendance_id = %s''' + (' FOR UPDATE OF r' if lock else ''), [kbc_report_id(lecture['key'])])
    return rows[0] if rows else None


def _missed_previous_catchup(cursor, report, lecture):
    key = lecture.get('previous_catchup')
    if not key or report.get('catchup_event_key') != key:
        return False
    from .catchup import confirmed_absence
    from .sources import cached_directory
    people = cached_directory()
    if not hasattr(people, 'resolve') or not people.sources_complete:
        return False
    person = people.resolve(email=lecture.get('learner_email'))
    return bool(person and confirmed_absence(key, people, person,
                read=lambda alias, sql, params: _fetch(cursor, sql, params)))


def check_lecture_free(cursor, lecture):
    """Refuse before any meeting exists if this lecture already has a catch-up in the LMS."""
    report = _existing_report(cursor, lecture)
    if (report and report['status'] != 'declined' and report['event_status'] in (*ACTIVE_STATUSES, 'completed')
            and not _missed_previous_catchup(cursor, report, lecture)):
        when = f" on {report['scheduled_date']:%d %b %Y} at {report['scheduled_time']:%H:%M}" if report['scheduled_date'] else ''
        raise Conflict(f'This lecture already has a catch-up in the LMS{when}.')
    return report


def _reserve(person, session_type, start, notes, idempotency_key):
    """Insert the LMS calendar row under the LMS's per-learner lock and rules; returns (row, created)."""
    local = start.astimezone(LONDON)
    day, at = local.date(), local.time().replace(second=0, microsecond=0)
    learner_id, coach = person['source_id'], person['coach_email']
    with transaction.atomic(using=LMS), connections[LMS].cursor() as cursor:
        cursor.execute('''INSERT INTO "Coach".coach_calendar_sequence (learner_id, event_type, last_sequence, updated_at)
            VALUES (%s, %s, 0, now()) ON CONFLICT (learner_id, event_type) DO NOTHING''', [learner_id, LOCK_SCOPE])
        cursor.execute('''SELECT id FROM "Coach".coach_calendar_sequence WHERE learner_id = %s AND event_type = %s
            FOR UPDATE''', [learner_id, LOCK_SCOPE])
        replay = _fetch(cursor, '''SELECT * FROM "Coach".coach_calendar_event
            WHERE owner_email = %s AND idempotency_key = %s''', [coach, idempotency_key])
        if replay:
            row = replay[0]
            if (row['learner_id'] != learner_id or row['event_type'] != session_type
                    or row['scheduled_date'] != day or row['scheduled_time'] != at):
                raise ValueError('This booking request was already used for a different session.')
            return row, False
        # One coach, one slot: the free times were read before this transaction, so bookings for this coach and
        # day are serialized here and the slot is checked again.
        cursor.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', [f'callcentre-coach:{coach.lower()}:{day.isoformat()}'])
        for other in _fetch(cursor, '''SELECT scheduled_time, duration_minutes FROM "Coach".coach_calendar_event
            WHERE lower(owner_email) = lower(%s) AND scheduled_date = %s AND scheduled_time IS NOT NULL
              AND status = ANY(%s)''', [coach, day, list(ACTIVE_STATUSES)]):
            other_start = datetime.combine(day, other['scheduled_time'])
            mine = datetime.combine(day, at)
            if mine < other_start + timedelta(minutes=other['duration_minutes'] or DURATION) and mine + timedelta(minutes=DURATION) > other_start:
                raise Conflict('That time has just been taken in the coach’s calendar. Pick another time.')
        # By email: LMS rows carry a profile id or a Created_users id, two unrelated number ranges.
        nearby = _fetch(cursor, '''SELECT event_type, sequence, scheduled_date, scheduled_time, duration_minutes, status
            FROM "Coach".coach_calendar_event
            WHERE lower(learner_email) = %s AND scheduled_time IS NOT NULL
              AND scheduled_date BETWEEN %s AND %s AND status = ANY(%s)''',
                        [person['email'], min(day - timedelta(days=1), day - timedelta(days=day.weekday())),
                         max(day + timedelta(days=1), day + timedelta(days=6 - day.weekday())), list(ACTIVE_STATUSES)])
        week = (day - timedelta(days=day.weekday()), day + timedelta(days=6 - day.weekday()))
        for other in nearby:
            other_start = datetime.combine(other['scheduled_date'], other['scheduled_time'])
            if (other['event_type'] == session_type and other['status'] != 'not-scheduled'
                    and week[0] <= other['scheduled_date'] <= week[1]):
                raise Conflict(f"The learner already has a {TITLES[session_type].lower()} that week "
                               f"({other_start:%a %d %b at %H:%M}). The LMS allows one per week.")
            other_end = other_start + timedelta(minutes=other['duration_minutes'] or DURATION)
            mine = datetime.combine(day, at)
            if mine < other_end and mine + timedelta(minutes=DURATION) > other_start:
                raise Conflict(f'The learner already has an LMS session at {other_start:%a %d %b %H:%M}. Choose another time.')
        cursor.execute('''SELECT coalesce(max(sequence), 0) FROM "Coach".coach_calendar_event
            WHERE learner_id = %s AND event_type = %s''', [learner_id, session_type])
        current_max = cursor.fetchone()[0]
        cursor.execute('''INSERT INTO "Coach".coach_calendar_sequence (learner_id, event_type, last_sequence, updated_at)
            VALUES (%s, %s, %s, now()) ON CONFLICT (learner_id, event_type) DO NOTHING''',
                       [learner_id, session_type, current_max])
        cursor.execute('''UPDATE "Coach".coach_calendar_sequence SET last_sequence = greatest(last_sequence, %s) + 1,
            updated_at = now() WHERE learner_id = %s AND event_type = %s RETURNING last_sequence''',
                       [current_max, learner_id, session_type])
        sequence = cursor.fetchone()[0]
        row = _fetch(cursor, '''INSERT INTO "Coach".coach_calendar_event (event_key, owner_email, owner_name, learner_id,
                learner_name, learner_email, event_type, sequence, target_date, scheduled_date, scheduled_time,
                duration_minutes, status, meeting_provider, meeting_link, graph_event_id, graph_web_link, notes,
                last_graph_sync_error, created_at, updated_at, review_responses, manager_signed_by,
                graph_organizer_email, operation_id, idempotency_key, sync_state, sync_attempt_count, last_sync_attempt_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'scheduled', '', '', '', '', %s, '', now(), now(),
                    '{}'::jsonb, '', '', %s, %s, 'syncing', 1, now())
            RETURNING *''', [f'{session_type}:{learner_id}:{sequence}:{day.isoformat()}', coach, person['coach_name'],
                             learner_id, person['name'], person['email'], session_type, sequence, day, day, at, DURATION,
                             notes, uuid.uuid4(), idempotency_key])[0]
        return row, True


def _invitation(row, title):
    when, at = row['scheduled_date'], row['scheduled_time'].strftime('%H:%M')
    date_label = f"{when:%A}, {when.day} {when:%B %Y}"
    details = [('Session', title), ('Learner', row['learner_name']), ('Coach', row['owner_name']),
               ('Date', date_label), ('Time', at), ('Duration', f'{DURATION} minutes'),
               ('Learner email', row['learner_email']), ('Notes', row['notes'])]
    rows = ''.join(f'<p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><span style="color:#64748b;">{escape(k)}:</span> '
                   f'<span style="color:#0f172a;font-weight:600;">{escape(str(v))}</span></p>' for k, v in details if v)
    intro = f"{row['learner_name']} has booked this session for {date_label} at {at}."
    return (
        '<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;"><div style="max-width:640px;background:#ffffff;'
        'border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><div style="padding:18px 24px;background:#123c69;color:#ffffff;">'
        '<div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.8;">KBC LMS</div>'
        f'<div style="margin-top:6px;font-size:20px;font-weight:700;">{escape(title)}</div></div><div style="padding:22px 24px;">'
        f'<p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">{escape(intro)}</p>'
        f'<div style="padding:12px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">{rows}</div>'
        '<p style="margin:20px 0 0;color:#334155;font-size:13px;line-height:1.6;">Please use the Microsoft Teams link included '
        'in this invitation to join the meeting.</p><p style="margin:8px 0 0;color:#64748b;font-size:12px;line-height:1.5;">'
        'If this time no longer works, please contact your coach before the scheduled start time.</p></div>'
        '<div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11.5px;">'
        'Sent via KBC LMS.</div></div></div>')


def _create_meeting(row):
    """The Teams meeting on the coach's calendar: learner and coach invited (Graph never emails the organizer)."""
    title = TITLES[row['event_type']]
    start = datetime.combine(row['scheduled_date'], row['scheduled_time'])
    coach, mailbox = row['owner_email'], graph.user_path(row['owner_email'])
    created = graph.request('POST', f'{mailbox}/events', {
        'subject': f"{title} - {row['learner_name']}",
        'start': {'dateTime': start.strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': graph.TIMEZONE},
        'end': {'dateTime': (start + timedelta(minutes=DURATION)).strftime('%Y-%m-%dT%H:%M:%S'), 'timeZone': graph.TIMEZONE},
        'body': {'contentType': 'HTML', 'content': _invitation(row, title)},
        'isOnlineMeeting': True, 'onlineMeetingProvider': 'teamsForBusiness',
        'transactionId': str(row['operation_id']),
        'attendees': [{'emailAddress': {'address': email, 'name': name}, 'type': 'required'}
                      for email, name in ((row['learner_email'], row['learner_name']), (coach, row['owner_name'])) if email],
    })
    join = (created.get('onlineMeeting') or {}).get('joinUrl') or ''
    if created.get('id') and not join:
        created = graph.request('GET', f"{mailbox}/events/{created['id']}")
        join = (created.get('onlineMeeting') or {}).get('joinUrl') or ''
    return {'graph_event_id': created.get('id') or '', 'meeting_link': join or created.get('webLink') or '',
            'graph_web_link': created.get('webLink') or '', 'join_url': join}


def _fail(row, message):
    with connections[LMS].cursor() as cursor:
        cursor.execute('''UPDATE "Coach".coach_calendar_event SET status = 'cancelled', sync_state = 'failed',
            last_graph_sync_error = %s, updated_at = now() WHERE id = %s''', [message[:500], row['id']])


def _link_report(cursor, row, lecture, person, reason_category, reason_note, agent_name):
    """Create the lecture's LMS absence report, or attach this catch-up to the one already there.

    A new report is 'pending' with no evidence: the call centre took the reason by phone, the coach approves it.
    An existing report keeps its status.
    """
    # Created_users.aptem_id is text; the register "ID" is a number.
    if str(lecture['register_id']).strip() != str(person['aptem_id'] or '').strip():
        return None, 'The register id does not match the learner’s LMS Aptem id, so the LMS cannot show the link.'
    taken = _fetch(cursor, '''SELECT id FROM "Coach".coach_absence_report WHERE catchup_event_key = %s
        AND status <> 'declined' ''', [row['event_key']])
    if taken:
        return None, 'This catch-up is already linked to another lecture.'
    report = _existing_report(cursor, lecture, lock=True)
    if report:
        if report['status'] == 'declined':
            return None, 'The coach declined the learner’s absence report for this lecture; it was left as it is.'
        if (report['event_status'] in (*ACTIVE_STATUSES, 'completed')
                and not _missed_previous_catchup(cursor, report, lecture)):
            return None, 'The lecture was linked to another catch-up a moment ago.'
        cursor.execute('''UPDATE "Coach".coach_absence_report SET catchup_event_key = %s, recovery_method = 'catch-up',
            updated_at = now() WHERE id = %s''', [row['event_key'], report['id']])
        return report['id'], ''
    cursor.execute('SELECT count(*) FROM "Coach".coach_absence_report WHERE learner_id = %s', [person['source_id']])
    previous = cursor.fetchone()[0]
    reason = reason_note if reason_category == 'other' else REASONS[reason_category]
    cursor.execute('''INSERT INTO "Coach".coach_absence_report (attendance_id, owner_email, owner_name, learner_id,
            learner_name, learner_email, session_title, session_date, session_time, reason_category, reason, reported_by,
            status, evidence_provided, coach_note, created_at, updated_at, attendance_rate, evidence_image_url,
            evidence_kind, evidence_text, previous_absences, recovery_method, catchup_event_key)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, %s, 'pending', false, '', now(), now(), NULL, '', 'text',
                %s, %s, 'catch-up', %s) RETURNING id''',
                   [kbc_report_id(lecture['key']), person['coach_email'], person['coach_name'], person['source_id'],
                    person['name'], person['email'], lecture['title'][:255],
                    lecture['date'], reason_category, reason, person['email'],
                    f'Told the call centre by phone (taken by {agent_name}).', previous, row['event_key']])
    return cursor.fetchone()[0], ''


def book(ticket, session_type, start, request_id, agent_name, reason_category='', reason_note=''):
    """Book one LMS session for this case's learner; returns what was booked. Nothing is booked on error."""
    if session_type not in session_types(ticket):
        raise ValueError('That session type cannot be booked from this case.')
    if not REQUEST_ID.match(str(request_id or '')):
        raise ValueError('Missing booking request id.')
    if not graph.configured():
        raise Unavailable('Teams booking is not configured on this server (Microsoft Graph settings missing).')
    lecture = None
    if session_type == CATCH_UP:
        if reason_category not in REASONS:
            raise ValueError('Choose the reason for the absence.')
        reason_note = str(reason_note or '').strip()[:1000]
        if reason_category == 'other' and len(reason_note) < 3:
            raise ValueError('Say what the reason was.')
        lecture = missed_lecture(ticket)
        missed = ticket.source_data.get('catchup_no_show') or {}
        if missed.get('event_key'):
            lecture = {**lecture, 'previous_catchup': missed['event_key'],
                       'learner_email': ticket.learner_email}
    person = lms_learner(ticket.learner_email)
    start = start.astimezone(LONDON)
    if start.date() < (lecture['date'] if lecture else start.date()):
        raise ValueError('A catch-up must be on or after the lecture date.')
    if start not in free_slots(person['coach_email'], day=start.date()):
        raise Conflict('That time has just been taken or is no longer free. Pick another time.')
    if lecture:
        with connections[LMS].cursor() as cursor:
            check_lecture_free(cursor, lecture)

    notes = f'Booked by the call centre ({agent_name}).'
    try:
        row, created = _reserve(person, session_type, start, notes, f'callcentre:{request_id}')
    except IntegrityError as exc:
        raise Conflict('Another booking for this learner landed at the same moment. Reload and try again.') from exc
    if not created and row['sync_state'] == 'synced':
        return {'event_key': row['event_key'], 'start': start, 'join_url': row['meeting_link'], 'report_id': None,
                'link_warning': '', 'coach': row['owner_name'], 'replayed': True}
    if not created:
        raise Conflict('This booking is still being processed or failed earlier. Close the panel and book again.')

    try:
        meeting = _create_meeting(row)
        if not meeting['graph_event_id'] or not meeting['meeting_link']:
            raise graph.GraphError('Teams did not return a meeting link.')
    except graph.GraphError as exc:
        _fail(row, f'Call centre booking: {exc}')
        raise Unavailable('The Teams meeting could not be created, so nothing was booked. Try again shortly.') from exc

    report_id, link_warning = None, ''
    try:
        with transaction.atomic(using=LMS), connections[LMS].cursor() as cursor:
            cursor.execute('''UPDATE "Coach".coach_calendar_event SET graph_event_id = %s, graph_organizer_email = %s,
                meeting_provider = 'Microsoft Teams', meeting_link = %s, graph_web_link = %s, sync_state = 'synced',
                last_graph_sync_error = '', updated_at = now() WHERE id = %s''',
                           [meeting['graph_event_id'], row['owner_email'], meeting['meeting_link'],
                            meeting['graph_web_link'], row['id']])
            if lecture:
                report_id, link_warning = _link_report(cursor, row, lecture, person, reason_category, reason_note, agent_name)
    except Exception:
        # The LMS could not record the meeting: take it out of the coach's calendar again (LMS compensation rule).
        try:
            graph.request('DELETE', f"{graph.user_path(row['owner_email'])}/events/{meeting['graph_event_id']}")
            _fail(row, 'Call centre booking: saving to the LMS failed; the Teams meeting was removed.')
        except Exception:
            with connections[LMS].cursor() as cursor:
                cursor.execute('''UPDATE "Coach".coach_calendar_event SET sync_state = 'reconciliation',
                    graph_event_id = %s, graph_organizer_email = %s, last_graph_sync_error = %s, updated_at = now()
                    WHERE id = %s''', [meeting['graph_event_id'], row['owner_email'],
                                       'Call centre booking: LMS save and Teams removal both failed.', row['id']])
        raise

    option_warning = graph.apply_meeting_options(row['owner_email'], meeting['join_url'],
                                                 [row['learner_email'], row['owner_email']]) if meeting['join_url'] else ''
    return {'event_key': row['event_key'], 'start': start, 'join_url': meeting['meeting_link'], 'report_id': report_id,
            'link_warning': link_warning, 'option_warning': option_warning, 'coach': row['owner_name'], 'replayed': False}
