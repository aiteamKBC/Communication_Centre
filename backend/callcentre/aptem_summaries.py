"""Read-only learner risk signals for case generation.

Ported from the legacy dashboard's summary views (``progress_review_summary``,
``mcr_summary``, ``otj_at_risk_summary``, ``epa_summary`` and the weekly
attendance check), keeping only the fields the case generator consumes. The
thresholds and date rules are unchanged. Aptem tables are read through the
``APTEM`` alias and ``public.kbc_attendance`` through ``DB``; the caller wraps
each loader in a read-only transaction.
"""
import re
from datetime import date, datetime, timedelta

from django.db import connections

from .db import APTEM, DB

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


def is_completed_status(value):
    return 'completed' in str(value or '').strip().lower()


def is_archived_status(value):
    return 'archived' in str(value or '').strip().lower()


def is_countable_progress_review_slot(planned_value):
    text = str(planned_value or '').strip().lower()
    return 'personal support plan' not in text and 'gateway review' not in text


def normalize_attendance_value(value):
    if value is True or value == 1:
        return 1
    if value is False or value == 0:
        return 0
    normalized = str(value or '').strip().lower()
    if normalized in {'1', 'present', 'attended', 'yes', 'true'}:
        return 1
    if normalized in {'0', 'absent', 'missed', 'no', 'false'}:
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


def _overdue_slots(row, date_key, status_key, count, today):
    """Past, uncompleted, unarchived planned dates: (count, latest overdue date)."""
    overdue, latest = 0, None
    for i in range(1, count + 1):
        planned = row.get(f'{date_key}{i}')
        planned_date = parse_date_safe(planned)
        status = str(row.get(f'{status_key}{i}') or '').strip()
        if not planned_date or (date_key.startswith('Review') and not is_countable_progress_review_slot(planned)):
            continue
        if planned_date < today and not is_completed_status(status) and not is_archived_status(status):
            overdue += 1
            latest = max(latest or planned_date, planned_date)
    return overdue, latest


def progress_review_rows(today=None):
    today = today or date.today()
    columns = ', '.join(f'"Review Planned Date{i}", "Review Status{i}"' for i in range(1, 17))
    rows = _fetch(APTEM, f'''SELECT "ID", "Email", {columns} FROM public.progress_review
        WHERE LOWER(COALESCE("Status", '')) = 'active' ''')
    result = []
    for row in rows:
        overdue, latest = _overdue_slots(row, 'Review Planned Date', 'Review Status', 16, today)
        result.append({
            'id': row.get('ID'), 'email': str(row.get('Email') or '').strip().lower(),
            'overduePrCount': overdue, 'duePrDate': latest.isoformat() if latest else '',
            'reviewStatus': overdue_status(overdue),
        })
    return result


def mcm_rows(today=None):
    today = today or date.today()
    columns = ', '.join(f'"MCM{i}", "Status{i}"' for i in range(1, 23))
    rows = _fetch(APTEM, f'''SELECT "ID", "Email", {columns} FROM public."MCR"
        WHERE LOWER(COALESCE("Status", '')) = 'active' ''')
    result = []
    for row in rows:
        overdue, latest = _overdue_slots(row, 'MCM', 'Status', 22, today)
        result.append({
            'id': row.get('ID'), 'email': str(row.get('Email') or '').strip().lower(),
            'overdue_count': overdue, 'risk': mcm_risk(overdue),
            'next_mcm_date': latest.isoformat() if latest else '',
        })
    return result


def otj_rows():
    rows = _fetch(APTEM, '''SELECT "ID", "Email", "OTJHoursStatus" FROM public.aptem_auto_extracting
        WHERE "Program-Status" = 'Active' AND "OTJHoursStatus" IS NOT NULL AND "OTJHoursStatus" != '' ''')
    return [{'id': str(row.get('ID') or ''), 'email': str(row.get('Email') or '').strip().lower(),
             'otjHoursStatus': row.get('OTJHoursStatus') or ''} for row in rows]


def epa_overdue_rows(today=None):
    """Active learners still open more than 7 days after their End-Date."""
    today = today or date.today()
    rows = _fetch(APTEM, '''SELECT "ID", "Email", "Program-Status", "Subscription Status", "End-Date"
        FROM public.aptem_auto_extracting''')
    result = []
    for row in rows:
        active = 'active' in {str(row.get('Program-Status') or '').strip().lower(),
                              str(row.get('Subscription Status') or '').strip().lower()}
        end_date = parse_date_safe(row.get('End-Date'))
        if active and end_date and today > end_date + timedelta(days=7):
            result.append({'id': row.get('ID'), 'email': str(row.get('Email') or '').strip().lower(),
                           'endDate': end_date.isoformat()})
    return result


def attendance_missed_for_week(week_start, week_end):
    """Learners whose latest attendance row in the week is a miss, with their missed count.

    The count is the number of distinct missed (email, module, date) sessions up
    to that date across all history; a date counts as missed if any row for it is.
    """
    rows = _fetch(DB, '''SELECT "Email", "date", "Attendance", "module" FROM public.kbc_attendance
        WHERE "date" >= %s AND "date" <= %s ORDER BY "Email", "date" ASC''', [week_start, week_end])
    latest = {}
    for row in rows:
        email = str(row['Email'] or '').strip().lower()
        if email and row['date']:
            latest[email] = row
    learners = [{'email': email, 'attendance_date': row['date'].isoformat(),
                 'attendance_module': str(row['module'] or '').strip()}
                for email, row in latest.items() if normalize_attendance_value(row['Attendance']) == 0]
    if not learners:
        return []
    emails = sorted({item['email'] for item in learners})
    placeholders = ','.join(['%s'] * len(emails))
    history = _fetch(DB, f'''SELECT "Email", "module", "date", "Attendance" FROM public.kbc_attendance
        WHERE lower("Email") IN ({placeholders})''', emails)
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
