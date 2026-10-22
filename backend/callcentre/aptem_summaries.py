"""Read-only learner risk signals for case generation.

Ported from the legacy dashboard's summary views (``otj_at_risk_summary``,
``epa_summary`` and the weekly attendance check), keeping only the fields the
case generator consumes. Progress reviews and monthly coaching now come from the
LMS (``lms_reviews.py``); their risk thresholds stay here. Aptem tables are read through the
``APTEM`` alias and ``public.kbc_attendance`` through ``DB``; the caller wraps
each loader in a read-only transaction.
"""
import re
from datetime import date, datetime, timedelta

from django.db import connections

from .db import APTEM, DB, LMS

# EPA cases are only raised while the learner is recently overdue: 7 days to 7+EPA_RECENCY_DAYS
# days past their End-Date. Older entries drop off so the queue stays to recent EPA entrants.
EPA_RECENCY_DAYS = 60

DATE_FORMATS = ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d', '%d-%m-%y', '%d/%m/%y', '%d %b %Y', '%d %B %Y')
DATE_IN_TEXT = re.compile(
    r'(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})')


def parse_date_safe(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    value = str(value).strip()
    if not value or value.upper() == 'N/A':
        return None
    candidates = [value]
    match = DATE_IN_TEXT.search(value)
    if match:
        candidates.append(match.group(1).strip())
    for candidate in candidates:
        for fmt in DATE_FORMATS:
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
    return None


def normalize_attendance_value(value):
    if value is True or value == 1:
        return 1
    if value is False or value == 0:
        return 0
    normalized = str(value or '').strip().lower()
    if normalized in {'1', 'present', 'attended', 'yes', 'true', 'p', 'late'}:
        return 1
    if normalized in {'0', 'absent', 'missed', 'no', 'false', 'a'}:
        return 0
    return None


def attendance_risk(missed_count):
    try:
        count = int(missed_count or 0)
    except (TypeError, ValueError):
        count = 0
    return 'red' if count >= 3 else 'amber'


def overdue_status(overdue_count):
    if overdue_count <= 0:
        return 'Ahead'
    if overdue_count > 12:
        return 'Due'
    if overdue_count > 10:
        return 'At Risk'
    return 'Normal'


def mcm_risk(overdue_count):
    if overdue_count >= 3:
        return 'red'
    if overdue_count >= 1:
        return 'amber'
    return 'green'


def _fetch(alias, sql, params=()):
    with connections[alias].cursor() as cursor:
        cursor.execute(sql, params)
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def otj_rows():
    rows = _fetch(APTEM, '''SELECT "ID", "Email", "OTJHoursStatus" FROM public.aptem_auto_extracting
        WHERE "Program-Status" = 'Active' AND "OTJHoursStatus" IS NOT NULL AND "OTJHoursStatus" != '' ''')
    return [{'id': str(row.get('ID') or ''), 'email': str(row.get('Email') or '').strip().lower(),
             'otjHoursStatus': row.get('OTJHoursStatus') or ''} for row in rows]


def epa_overdue_rows(today=None):
    """Active learners recently overdue for EPA: more than 7 and at most 7+EPA_RECENCY_DAYS days past End-Date.

    The upper bound keeps the queue to recent EPA entries only; once a learner is more than
    7+EPA_RECENCY_DAYS past End-Date the source stops reporting them and their cases are set aside.
    """
    today = today or date.today()
    rows = _fetch(APTEM, '''SELECT "ID", "Email", "Program-Status", "Subscription Status", "End-Date"
        FROM public.aptem_auto_extracting''')
    result = []
    for row in rows:
        # The programme status decides; the subscription status only when no programme status is recorded,
        # so a completed or withdrawn programme with a still-active subscription is not called about EPA.
        programme = str(row.get('Program-Status') or '').strip().lower()
        active = (programme or str(row.get('Subscription Status') or '').strip().lower()) == 'active'
        end_date = parse_date_safe(row.get('End-Date'))
        if active and end_date and end_date + timedelta(days=7) < today <= end_date + timedelta(days=7 + EPA_RECENCY_DAYS):
            result.append({'id': row.get('ID'), 'email': str(row.get('Email') or '').strip().lower(),
                           'endDate': end_date.isoformat()})
    return result


def live_attendance_missed_for_week(week_start, week_end):
    """Missed live-session lectures in the window, from the LMS ``curriculum`` attendance (current learners).

    A learner is absent from one occurrence when ``attendance_status = 'absent'``. The lecture date is the
    occurrence's ``scheduled_start``; the module name comes from ``curriculum.modules`` (the catalogue id when
    the title is absent). The return shape matches :func:`attendance_missed_for_week` so the old ``kbc_attendance``
    source and this one feed the same case pipeline. ``missed_count`` is the number of distinct absent
    (module) sessions for the learner up to that date, for the red/amber risk threshold.
    """
    rows = _fetch(LMS, '''SELECT lower(trim(la.learner_email)) AS email, (o.scheduled_start)::date AS day,
            COALESCE(NULLIF(trim(m.title), ''), la.module_catalogue_id) AS module, la.id AS key
        FROM curriculum.live_session_learner_attendance la
        JOIN curriculum.live_session_occurrences o ON o.id = la.occurrence_id
        LEFT JOIN curriculum.modules m ON m.module_catalogue_id = la.module_catalogue_id
        WHERE la.attendance_status = 'absent' AND o.scheduled_start::date >= %s AND o.scheduled_start::date <= %s''',
                    [week_start, week_end])
    learners = [{'email': row['email'], 'attendance_date': row['day'].isoformat(),
                 'attendance_module': str(row['module'] or '').strip(), 'attendance_key': str(row['key'])}
                for row in rows if row['email'] and row['day']]
    if not learners:
        return []
    emails = sorted({item['email'] for item in learners})
    placeholders = ','.join(['%s'] * len(emails))
    history = _fetch(LMS, f'''SELECT lower(trim(la.learner_email)) AS email, (o.scheduled_start)::date AS day,
            COALESCE(NULLIF(trim(m.title), ''), la.module_catalogue_id) AS module
        FROM curriculum.live_session_learner_attendance la
        JOIN curriculum.live_session_occurrences o ON o.id = la.occurrence_id
        LEFT JOIN curriculum.modules m ON m.module_catalogue_id = la.module_catalogue_id
        WHERE la.attendance_status = 'absent' AND lower(trim(la.learner_email)) IN ({placeholders})''', emails)
    dates = {}
    for row in history:
        if row['email'] and row['day']:
            dates.setdefault((row['email'], str(row['module'] or '').strip()), set()).add(row['day'].isoformat())
    for item in learners:
        session_dates = dates.get((item['email'], item['attendance_module']), set())
        item['missed_count'] = sum(1 for day in session_dates if day <= item['attendance_date']) or 1
    return learners


def lazy_learner_emails():
    """Emails of learners on recorded-session ('lazy') attendance mode, from the LMS.

    These learners follow the recordings instead of attending live, so a missed live
    lecture is not a real absence for them and must not become a missed-lecture case.
    Read from ``"Learner".attendance_preferences`` (``mode`` = ``lazy``) joined to the LMS
    directory for the learner's email. ``live`` learners and learners with no preference
    row are not returned, so they are still called about missed lectures as before.
    """
    rows = _fetch(LMS, '''SELECT lower(trim(u."Email")) AS email
        FROM "Learner".attendance_preferences p
        JOIN enrolment."Created_users" u ON u.id = p.learner_id
        WHERE p.mode = 'lazy' ''')
    return {row['email'] for row in rows if row['email']}


def attendance_missed_for_week(week_start, week_end):
    """Each unambiguous missed learner/date/module session in the requested week.

    The count is the number of distinct missed (email, module, date) sessions up
    to that date across all history; a date counts as missed if any row for it is.
    """
    rows = _fetch(DB, '''SELECT "key", "Email", "date", "Attendance", "module" FROM public.kbc_attendance
        WHERE "date" >= %s AND "date" <= %s ORDER BY "Email", "date" ASC''', [week_start, week_end])
    sessions = {}
    register_keys = {}
    for row in rows:
        email = str(row['Email'] or '').strip().lower()
        if email and row['date']:
            key = (email, row['date'], str(row['module'] or '').strip())
            sessions.setdefault(key, set()).add(normalize_attendance_value(row['Attendance']))
            if row.get('key'):
                register_keys.setdefault(key, set()).add(str(row['key']))
    # Every dated module is independent. Missing or contradictory attendance needs review, never an automatic
    # absence call; absent on every register that day (e.g. morning and afternoon) is a missed lecture.
    learners = [{'email': email, 'attendance_date': day.isoformat(), 'attendance_module': module,
                 'attendance_key': min(register_keys.get((email, day, module), {''}))}
                for (email, day, module), states in sessions.items() if states == {0}]
    if not learners:
        return []
    emails = sorted({item['email'] for item in learners})
    placeholders = ','.join(['%s'] * len(emails))
    history = _fetch(DB, f'''SELECT "Email", "module", "date", "Attendance" FROM public.kbc_attendance
        WHERE lower(trim("Email")) IN ({placeholders})''', emails)
    missed = {}
    for row in history:
        key = (str(row['Email'] or '').strip().lower(), str(row['module'] or '').strip(), str(row['date']))
        missed[key] = missed.get(key, False) or normalize_attendance_value(row['Attendance']) == 0
    dates = {}
    for (email, module, day), is_missed in missed.items():
        if is_missed:
            dates.setdefault((email, module), set()).add(day)
    for item in learners:
        session_dates = dates.get((item['email'], item['attendance_module']), set())
        item['missed_count'] = sum(1 for day in session_dates if day <= item['attendance_date']) or 1
    return learners
