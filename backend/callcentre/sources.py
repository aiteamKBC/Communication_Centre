"""Case generation from the read-only learner sources.

Ported from the legacy dashboard. Unlike the original, nothing here reads or writes the
legacy ticket tables or ``dashboard_bookings``: cases come only from the live Aptem /
attendance signals and the ``coaches_data`` bookings. Learners come from the merged LMS +
Aptem directory in ``learners.py``.
"""
import hashlib
import json
import time
from contextlib import contextmanager
from datetime import timedelta
from urllib.parse import urlparse

from django.conf import settings
from django.db import DatabaseError, connections, transaction
from django.utils import timezone

from . import aptem_summaries as summaries
from . import learners
from . import lms_reviews
from .db import APTEM, DB, LMS
from .models import CaseTicket, CycleState
from .rules import (LONDON, MISSED_LECTURES_SINCE, PAUSED_CATEGORIES, REVIEW_CATEGORIES, due_at, email_key, missed_lectures_ready_until,
                    normalize_phone, parse_moment)
from .services import event


@contextmanager
def source_transaction(alias):
    if alias not in settings.DATABASES:
        raise RuntimeError(f'Database alias {alias!r} is not configured.')
    with transaction.atomic(using=alias):
        if connections[alias].vendor == 'postgresql':
            with connections[alias].cursor() as cursor:
                cursor.execute('SET TRANSACTION READ ONLY')
                cursor.execute("SET LOCAL statement_timeout = '20s'")
        yield


def rows(alias, sql, params=()):
    with source_transaction(alias), connections[alias].cursor() as cursor:
        cursor.execute(sql, params)
        columns = [item[0] for item in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _staff():
    """Staff accounts, to find a case owner's email; empty when they cannot be read."""
    try:
        return rows(LMS, learners.STAFF_SQL)
    except Exception:
        return []


def profiles():
    """The merged LMS + Aptem learner directory; works while either source is reachable."""
    lms = get_source('lms_learners', lambda: rows(LMS, learners.LMS_LEARNERS_SQL))
    aptem = get_source('aptem_learners', lambda: rows(APTEM, learners.APTEM_LEARNERS_SQL))
    if lms is None and aptem is None:
        raise RuntimeError('Neither learner source is available.')
    return learners.merge(lms or [], aptem or [], _staff())


def learner_directory():
    """The merged directory for on-demand lookups; unlike ``profiles`` it records no source health."""
    loaded = []
    for alias, sql in ((LMS, learners.LMS_LEARNERS_SQL), (APTEM, learners.APTEM_LEARNERS_SQL)):
        try:
            loaded.append(rows(alias, sql))
        except Exception:
            loaded.append(None)
    if all(item is None for item in loaded):
        raise DatabaseError('Neither learner source is available.')
    return learners.merge(*(item or [] for item in loaded), _staff())


DIRECTORY_REFRESH_SECONDS = 300
_cached = {'directory': learners.Learners({}, {}), 'next_refresh': 0.0}


def cached_directory():
    """The directory, refreshed at most every 5 minutes, for what every page asks of the LMS:
    who is on a break and each coach's email. While the LMS cannot be read the last one is kept.
    """
    now = time.monotonic()
    if now >= _cached['next_refresh']:
        _cached['next_refresh'] = now + DIRECTORY_REFRESH_SECONDS
        try:
            lms = rows(LMS, learners.LMS_LEARNERS_SQL)
        except Exception:
            return _cached['directory']
        try:
            aptem = rows(APTEM, learners.APTEM_LEARNERS_SQL)
        except Exception:
            aptem = []
        _cached['directory'] = learners.merge(lms, aptem, _staff())
    return _cached['directory']


def on_break_emails():
    """Emails of learners the LMS has on a break."""
    return cached_directory().on_break


def coach_email(name):
    """The email of the coach with this name, as the LMS enrolment records give it; '' if unknown."""
    return cached_directory().coach_emails.get(' '.join(str(name or '').split()).casefold(), '')


def source_health(name, error='', count=0):
    state, _ = CycleState.objects.get_or_create(name='source:' + name)
    state.details = {'error': error, 'count': count, 'checked_at': timezone.now().isoformat()}
    if not error:
        state.last_success_at = timezone.now()
    state.save()


def get_source(name, fn):
    try:
        value = fn()
        source_health(name, count=len(value))
        return value
    except Exception as exc:
        # Provider/DB exceptions may include credentials or personal values.
        source_health(name, error=f'{name} unavailable ({type(exc).__name__}); no automatic resolution from this source.')
        return None


def reason_key(category, email, discriminator):
    digest = hashlib.sha256(str(discriminator).encode()).hexdigest()[:32]
    return f'{category}:{email}:{digest}'


@transaction.atomic(using=DB)
def upsert_case(category, profile, discriminator, *, risk='amber', overdue=None,
                misses=0, booking_at=None, data=None):
    now = timezone.now()
    email = email_key(profile.get('learner_email'))
    if not email:
        return None, False
    key = reason_key(category, email, discriminator)
    defaults = {**profile, 'learner_email': email, 'learner_phone': normalize_phone(profile.get('learner_phone')),
                'source_type': category,
                'risk': risk, 'overdue_since': overdue, 'misses': misses, 'booking_at': booking_at,
                'source_data': data or {}, 'due_at': due_at(category, now, booking_at)}
    case, created = CaseTicket.objects.get_or_create(reason_key=key, defaults=defaults)
    if created:
        event(case, 'created', {'source': category, 'source_id': case.source_id, 'reason': str(discriminator)})
    elif case.status != 'resolved':
        # Refresh contacts/risk, but never reset workflow, claims, SLA or previous decisions.
        changes = {k: defaults[k] for k in profile if k != 'learner_email'}
        changes.update(risk=risk, misses=misses)
        CaseTicket.objects.filter(pk=case.pk).update(**changes)
    return case, created


def _read(fn, alias):
    """Run a summary loader inside a read-only transaction on the alias it reads."""
    def load():
        with source_transaction(alias):
            return fn()
    return load


def generate_risks(people):
    today = timezone.now().astimezone(LONDON).date()
    total = 0
    existing = list(CaseTicket.objects.exclude(status='resolved').values('source_type', 'learner_email', 'overdue_since', 'source_data'))
    open_reasons = {(c['source_type'], c['learner_email'], c['overdue_since'] if c['source_type'] == 'attendance' else None,
                     c['source_data'].get('module', '') if c['source_type'] == 'attendance'
                     else c['source_data'].get('review_type', '') if c['source_type'] in REVIEW_CATEGORIES else '')
                    for c in existing}

    def attendance():
        # Rows newer than the delay are not read at all, so a fresh absence cannot hide an older one in its week.
        ready = missed_lectures_ready_until(today)
        output = []
        monday = ready - timedelta(days=ready.weekday())
        for week in range(4):
            start = monday - timedelta(weeks=week)
            output.extend(summaries.attendance_missed_for_week(start, min(ready, start + timedelta(days=6))))
        return output

    loaders = {
        'otj': _read(summaries.otj_rows, APTEM),
        'epa': _read(summaries.epa_overdue_rows, APTEM),
        'attendance': _read(attendance, DB),
    }
    for category, loader in loaders.items():
        if category in PAUSED_CATEGORIES:
            continue
        data = get_source(category, loader)
        if data is None:
            continue
        for item in data:
            email = email_key(item.get('email'))
            if email not in people:
                continue
            count, risk, overdue, module = 1, 'amber', None, ''
            if category == 'otj':
                count = int(str(item.get('otjHoursStatus', '')).lower() == 'at risk')
            elif category == 'epa':
                end = summaries.parse_date_safe(item.get('endDate'))
                overdue = end + timedelta(days=7) if end else None
                risk = 'red'
            else:
                count = item.get('missed_count', 1)
                overdue = summaries.parse_date_safe(item.get('attendance_date'))
                module = item.get('attendance_module', '')
                risk = summaries.attendance_risk(count)
                if overdue and overdue < MISSED_LECTURES_SINCE:
                    continue
            if not count:
                continue
            open_key = (category, email, overdue if category == 'attendance' else None, module if category == 'attendance' else '')
            if open_key in open_reasons:
                continue
            discriminator = f'{overdue}:{module}' if overdue else f"source:{item.get('id', email)}"
            # A resolved reason keeps its reason_key, so it stays closed until a distinct dated issue appears.
            _, fresh = upsert_case(category, people[email], discriminator, risk=risk, overdue=overdue,
                                   misses=count, data={'module': module, 'source_learner_id': str(item.get('id', ''))})
            total += fresh
            open_reasons.add(open_key)
    return total + generate_review_cases(people, today, open_reasons)


def generate_review_cases(people, today, open_reasons):
    """Overdue, missed and unsigned reviews from the LMS: one case per learner, case type and review type."""
    items = get_source('lms_reviews', _read(lambda: lms_reviews.review_items(today), LMS))
    if items is None:
        return 0
    total = 0
    for (email, category, review_type), group in lms_reviews.group_items(items).items():
        # Only learners the LMS has as Active or Delivery: withdrawn and completed learners get no review calls.
        if email not in people or email not in people.active:
            continue
        open_key = (category, email, None, review_type)
        if open_key in open_reasons:
            continue
        count, overdue = len(group), max(item['day'] for item in group)
        risk = ('red' if summaries.overdue_status(count) == 'Due' else 'amber') if category == 'pr' else (
            summaries.mcm_risk(count) if category == 'mcm' else 'amber')
        _, fresh = upsert_case(category, people[email], f'{overdue}:{review_type}', risk=risk, overdue=overdue,
                               misses=count, data={'review_type': review_type,
                                                   'review_refs': sorted(item['ref'] for item in group)[:50]})
        total += fresh
        open_reasons.add(open_key)
    return total


def refresh_recording_links():
    data = rows(DB, '''SELECT s.module, s.session_date, r.recording_url_written
        FROM public.lecture_sessions s JOIN public.lecture_recording_links r ON r.lecture_id = s.lecture_id
        WHERE s.is_cancelled IS NOT TRUE AND r.recording_url_written IS NOT NULL''')
    links = {}
    for row in data:
        url = str(row['recording_url_written'] or '').strip()
        if urlparse(url).scheme == 'https' and urlparse(url).netloc:
            links.setdefault((str(row['module']), str(row['session_date'])), set()).add(url)
    changed = 0
    for ticket in CaseTicket.objects.filter(source_type='attendance', archived=False).exclude(status='resolved'):
        urls = links.get((ticket.source_data.get('module'), str(ticket.overdue_since)), set())
        url = next(iter(urls)) if len(urls) == 1 else ''
        if ticket.source_data.get('recording_url', '') != url:
            data = {**ticket.source_data, 'recording_url': url}
            CaseTicket.objects.filter(pk=ticket.pk).update(source_data=data)
            changed += 1
    return list(links)


def decode_json(value):
    return json.loads(value) if isinstance(value, str) else value


def load_bookings(people):
    tomorrow = timezone.now().astimezone(LONDON).date() + timedelta(days=1)
    result = {}
    coach_rows = rows(DB, '''SELECT case_owner, "booked_students_PR" AS pr,
        "booked_students_MCM" AS mcm, "booked_students_StSupport" AS support FROM public.coaches_data''')
    for coach in coach_rows:
        for field, category in [('pr', 'pr'), ('mcm', 'mcm'), ('support', 'support')]:
            raw = decode_json(coach.get(field)) or {}
            items = raw.get('students', []) if isinstance(raw, dict) else []
            for item in items:
                email = email_key(item.get('customerEmail'))
                if email not in people or (item.get('matched_student_email') and email_key(item['matched_student_email']) != email):
                    continue
                try:
                    start = parse_moment(item.get('startDateTime'))
                except (ValueError, TypeError, KeyError):
                    continue
                if start.astimezone(LONDON).date() != tomorrow:
                    continue
                key = f'{email}:{category}:{start.astimezone(LONDON).isoformat()}'
                result.setdefault(key, {'email': email, 'start': start, 'type': category,
                                        'id': str(item.get('appointmentId', '')), 'source': 'coaches_data'})
    return list(result.values())


def generate_reminders(people, bookings):
    count = 0
    for booking in bookings:
        _, created = upsert_case('reminder', people[booking['email']],
            f"{booking['type']}:{booking['start'].astimezone(LONDON).isoformat()}", booking_at=booking['start'],
            data={'booking_id': booking['id'], 'booking_source': booking['source'], 'session_type': booking['type']})
        count += created
    return count
