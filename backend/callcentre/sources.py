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
from django.db.models import Q
from django.utils import timezone

from . import aptem_summaries as summaries
from . import learners
from . import identity
from . import lms_reviews
from .db import APTEM, DB, LMS
from .models import CaseTicket, CycleState, TicketEvent
from .rules import (LONDON, MISSED_LECTURES_SINCE, PAUSED_CATEGORIES, REVIEW_CATEGORIES, due_at, email_key, missed_lectures_ready_until, next_workday,
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
    """Configured directory; unified mode requires every identity input to load."""
    if identity.enabled():
        people = get_source('unified_identity', unified_directory)
        if people is None:
            raise DatabaseError('Unified identity unavailable; existing cases retained.')
        if not people.sources_complete:
            source_health('unified_identity', error='Conflicting identities; review identity-status. Existing cases retained.')
        return people
    lms = get_source('lms_learners', lambda: rows(LMS, learners.LMS_LEARNERS_SQL))
    aptem = get_source('aptem_learners', lambda: rows(APTEM, learners.APTEM_LEARNERS_SQL))
    if lms is None and aptem is None:
        raise RuntimeError('Neither learner source is available.')
    people = learners.merge(lms or [], aptem or [], _staff())
    people.sources_complete = lms is not None and aptem is not None
    return people


def learner_directory():
    """The merged directory for on-demand lookups; unlike ``profiles`` it records no source health."""
    if identity.enabled():
        return unified_directory()
    loaded = []
    for alias, sql in ((LMS, learners.LMS_LEARNERS_SQL), (APTEM, learners.APTEM_LEARNERS_SQL)):
        try:
            loaded.append(rows(alias, sql))
        except Exception:
            loaded.append(None)
    if all(item is None for item in loaded):
        raise DatabaseError('Neither learner source is available.')
    people = learners.merge(*(item or [] for item in loaded), _staff())
    people.sources_complete = all(item is not None for item in loaded)
    return people


def unified_directory():
    """All inputs are required. A failed source must never look like an empty roster."""
    people = identity.build(
        rows(LMS, learners.LMS_LEARNERS_SQL.replace('SELECT id,', 'SELECT id, id_aptem,')),
        rows(LMS, identity.APTEM_SQL), rows(LMS, learners.STAFF_SQL),
        rows(LMS, identity.PROFILES_SQL), rows(LMS, identity.MAP_SQL), rows(LMS, identity.ACCOUNTS_SQL))
    people.loaded_at = timezone.now().isoformat()
    return people


DIRECTORY_REFRESH_SECONDS = 300
_cached = {'directory': learners.Learners({}, {}), 'next_refresh': 0.0, 'complete': False}


def cached_directory():
    """The directory, refreshed at most every 5 minutes, for what every page asks of the LMS:
    who is on a break, each coach's email and each employer's learners. While the LMS cannot be read
    the last one is kept; while Aptem cannot, the last directory built from both is kept, because line
    managers (employer allocation) come only from Aptem.
    """
    now = time.monotonic()
    if now >= _cached['next_refresh']:
        _cached['next_refresh'] = now + DIRECTORY_REFRESH_SECONDS
        if identity.enabled():
            try:
                fresh = unified_directory()
            except Exception:
                _cached['directory'].sources_complete = False
                return _cached['directory']
            _cached['directory'] = fresh
            return fresh
        try:
            lms = rows(LMS, learners.LMS_LEARNERS_SQL)
        except Exception:
            return _cached['directory']
        try:
            aptem = rows(APTEM, learners.APTEM_LEARNERS_SQL)
        except Exception:
            if _cached['complete']:
                return _cached['directory']
            aptem = None
        _cached['directory'] = learners.merge(lms, aptem or [], _staff())
        _cached['complete'] = aptem is not None
    return _cached['directory']


def on_break_emails():
    """Emails of learners either source has on a break."""
    return cached_directory().on_break


def active_case_contacts():
    """Allow current active learners and employers with at least one active learner.

    This is evaluated when queues are read, independently of old case snapshots
    and whether the background worker has reconciled eligibility yet.
    """
    from .learner_satisfaction import eligible, employer_contacts
    people = cached_directory()
    identities = {identifier for person in people.satisfaction if eligible(person)
                  for identifier in person['identifiers'] if not identifier.startswith('email:')}
    learners_scope = Q(learner_email__in=people.active) | (
        Q(learner_email='') & (Q(source_data__person_id__in=identities)
                              | Q(source_data__identifiers__0__in=identities)))
    return ((~Q(source_type='employer_feedback') & learners_scope)
            | Q(source_type='employer_feedback', learner_email__in=list(employer_contacts(people))))


def coach_email(name):
    """The email of the coach with this name, as the LMS enrolment records give it; '' if unknown."""
    return cached_directory().coach_emails.get(' '.join(str(name or '').split()).casefold(), '')


def manager_phone_directory():
    """Manager email -> the one unambiguous manager phone across every Aptem source we read.

    Deliberately conservative like the learner-derived path: a manager email is included only
    when all sources agree on a single number, so a shared or conflicting number is never
    attributed to the wrong person. Used only as a fallback when no learner supplies the number.
    """
    phones = {}

    def add(email, value):
        key, number = email_key(email), normalize_phone(value)
        if key and number:
            phones.setdefault(key, set()).add(number)

    for row in rows(APTEM, 'SELECT "ManagerEmail", "Manager Phone", "manager_phone" FROM public.aptem_auto_extracting'):
        add(row.get('ManagerEmail'), row.get('Manager Phone'))
        add(row.get('ManagerEmail'), row.get('manager_phone'))
    if identity.enabled():
        try:
            for row in rows(LMS, 'SELECT "ManagerEmail", "Manager Phone" FROM "LMS"."Aptem_users"'):
                add(row.get('ManagerEmail'), row.get('Manager Phone'))
        except DatabaseError:
            pass
    return {email: next(iter(numbers)) for email, numbers in phones.items() if len(numbers) == 1}


def source_health(name, error='', count=0):
    state, _ = CycleState.objects.get_or_create(name='source:' + name)
    state.details = {'error': error, 'count': count, 'checked_at': timezone.now().isoformat()}
    if not error:
        state.last_success_at = timezone.now()
    state.save()


def get_source(name, fn):
    try:
        value = fn()
        # A loader returns its rows, or (refresh steps) the number of records it changed.
        source_health(name, count=value if isinstance(value, int) else len(value))
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
                misses=0, booking_at=None, data=None, person=None):
    now = timezone.now()
    email = email_key(profile.get('learner_email'))
    if not email:
        return None, False
    key = reason_key(category, email, discriminator)
    defaults = {**profile, 'learner_email': email, 'learner_phone': normalize_phone(profile.get('learner_phone')),
                'source_type': category,
                'risk': risk, 'overdue_since': overdue, 'misses': misses, 'booking_at': booking_at,
                'source_data': data or {}, 'due_at': due_at(category, now, booking_at)}
    if person:
        defaults['source_data'] = {**defaults['source_data'], 'person_id': person['person_id'],
                                   'identity_source_ids': person['identifiers'], 'contact_sources': person.get('provenance', {})}
    old = list(CaseTicket.objects.filter(reason_key__in=[reason_key(category, e, discriminator)
               for e in person['emails']])) if person else []
    if len(old) > 1:
        return None, False  # existing duplicate histories require review, never auto-merge
    if old:
        case, created = old[0], False
    else:
        case, created = CaseTicket.objects.get_or_create(reason_key=key, defaults=defaults)
    if created:
        event(case, 'created', {'source': category, 'source_id': case.source_id, 'reason': str(discriminator)})
    elif case.status != 'resolved':
        # Refresh contacts/risk, but never reset workflow, claims, SLA or previous decisions.
        changes = {k: defaults[k] for k in profile if k != 'learner_email'}
        changes.update(risk=risk, misses=misses)
        CaseTicket.objects.filter(pk=case.pk).update(**changes)
    return case, created


@transaction.atomic(using=DB)
def refresh_contacts(people):
    """Refresh open case contact snapshots only; keep case IDs, email keys and history."""
    if not hasattr(people, 'resolve') or not people.sources_complete:
        return 0
    changed, audit = [], []
    now = timezone.now()
    fields = ['learner_name', 'learner_phone', 'coach', 'organisation', 'programme', 'manager_name', 'manager_email',
              'source_data', 'last_actor', 'last_action_at']
    for ticket in CaseTicket.objects.select_for_update().filter(archived=False).exclude(status='resolved').exclude(
            source_type__in=('satisfaction', 'employer_feedback')):
        person = people.resolve(email=ticket.learner_email)
        if not person:
            continue
        values = {k: v for k, v in person['profile'].items() if k != 'learner_email'}
        if ticket.source_type == 'manual':
            values.pop('learner_phone', None)   # a requested call keeps the number the manager entered
        values['source_data'] = {**ticket.source_data, 'person_id': person['person_id'],
                                 'identity_source_ids': person['identifiers'], 'contact_sources': person.get('provenance', {})}
        previous = {k: getattr(ticket, k) for k, v in values.items() if k != 'source_data' and getattr(ticket, k) != v}
        if not previous and values['source_data'] == ticket.source_data:
            continue
        for key, value in values.items():
            setattr(ticket, key, value)
        ticket.last_actor, ticket.last_action_at = 'System', now
        changed.append(ticket)
        audit.append(TicketEvent(ticket=ticket, kind='identity_contacts_refreshed', actor='System',
                                 data={'previous_contact': previous, 'person_id': person['person_id']}))
    CaseTicket.objects.bulk_update(changed, fields, batch_size=100)
    TicketEvent.objects.bulk_create(audit, batch_size=200)
    return len(changed)


def _read(fn, alias):
    """Run a summary loader inside a read-only transaction on the alias it reads."""
    def load():
        with source_transaction(alias):
            return fn()
    return load


def set_eligible(ticket_id, allowed, reason):
    """Set a case aside while its source no longer reports the issue, or bring it back. Nothing is resolved: the
    case keeps its history and returns, with ``eligible`` true, as soon as the source reports the issue again."""
    with transaction.atomic(using=DB):
        ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
        if ticket.status == 'resolved' or ticket.source_data.get('eligible', True) == allowed:
            return False
        ticket.source_data = {**ticket.source_data, 'eligible': allowed, 'eligibility_reason': reason}
        ticket.save(update_fields=['source_data', 'updated_at'])
        event(ticket, 'eligibility_changed', {'eligible': allowed, 'reason': reason})
        return True


def open_key(people, source_type, email, overdue_since, data):
    """What one open case is about: the same key means the same issue, whichever email the source used."""
    email = people.get(email, {}).get('learner_email', email)
    if source_type == 'attendance':
        return source_type, email, overdue_since, str(data.get('module', '')).strip()
    if source_type in REVIEW_CATEGORIES:
        return source_type, email, None, lms_reviews.review_key(data.get('review_type', ''))
    return source_type, email, None, ''


def generate_risks(people, categories=None):
    today = timezone.now().astimezone(LONDON).date()
    total = 0
    existing = list(CaseTicket.objects.exclude(status='resolved').values(
        'pk', 'source_type', 'learner_email', 'overdue_since', 'source_data', 'archived'))
    open_reasons = {open_key(people, c['source_type'], c['learner_email'], c['overdue_since'], c['source_data']) for c in existing}
    ready = missed_lectures_ready_until(today)
    # Attendance is read for the four weeks up to ``ready``; only cases in that window can be checked against it.
    first_week = ready - timedelta(days=ready.weekday()) - timedelta(weeks=3)

    def attendance():
        # Rows newer than the delay are not read at all, so a fresh absence cannot hide an older one in its week.
        output = []
        for week in range(4):
            start = first_week + timedelta(weeks=week)
            output.extend(summaries.attendance_missed_for_week(start, min(ready, start + timedelta(days=6))))
        return output

    loaders = {
        'otj': _read(summaries.otj_rows, APTEM),
        'epa': _read(lambda: summaries.epa_overdue_rows(today), APTEM),
        'attendance': _read(attendance, DB),
    }
    # Which open cases each source can vouch for: those it would raise again today.
    in_window = {'epa': lambda c: True,
                 'attendance': lambda c: bool(c['overdue_since']) and first_week <= c['overdue_since'] <= ready}
    for category, loader in loaders.items():
        if categories is not None and category not in categories:
            continue
        if category in PAUSED_CATEGORIES:
            continue
        data = get_source(category, loader)
        if data is None:
            continue
        seen = set()
        for item in data:
            email = email_key(item.get('email'))
            if email not in people:
                continue
            email = people[email]['learner_email']
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
            key = open_key(people, category, email, overdue, {'module': module})
            seen.add(key)
            if key in open_reasons:
                continue
            discriminator = f'{overdue}:{module}' if overdue else f"source:{item.get('id', email)}"
            # A resolved reason keeps its reason_key, so it stays closed until a distinct dated issue appears.
            _, fresh = upsert_case(category, people[email], discriminator, risk=risk, overdue=overdue,
                                   misses=count, data={'module': module, 'source_learner_id': str(item.get('id', '')),
                                                       'attendance_key': item.get('attendance_key', '')},
                                   person=people.resolve(email=email) if hasattr(people, 'resolve') else None)
            total += fresh
            open_reasons.add(key)
        retire(people, [c for c in existing if c['source_type'] == category and not c['archived']
                        and in_window.get(category, lambda c: True)(c)],
               seen, 'No longer reported by the source (register corrected, EPA date changed or learner no longer active).')
    return total + (generate_review_cases(people, today, open_reasons, existing) if categories is None else 0)


def retire(people, cases, current, reason, keep=None):
    """Set aside the open cases whose issue the source no longer reports, and bring back those it reports again.
    ``keep(case)`` holds a case back from being set aside (its own proof will resolve it)."""
    for case in cases:
        reported = open_key(people, case['source_type'], case['learner_email'], case['overdue_since'], case['source_data']) in current
        if case['source_data'].get('eligible', True) == reported or (not reported and keep and keep(case)):
            continue
        set_eligible(case['pk'], reported, 'Reported by the source again.' if reported else reason)


def generate_review_cases(people, today, open_reasons, existing=()):
    """Overdue, missed and unsigned reviews from the LMS: one case per learner, case type and review type.

    An open case collects every review ref the LMS reports for its issue. When the LMS stops reporting the issue
    (booked, rebooked, cancelled, moved on to a signature, or the learner left) the case is set aside, unless all
    its reviews are done: then the evidence check resolves it with that proof.
    """
    items = get_source('lms_reviews', _read(lambda: lms_reviews.review_items(
        today, people=people) if identity.enabled() else lms_reviews.review_items(today), LMS))
    if items is None:
        return 0
    # The LMS row may use an alias (e.g. the Aptem email): group under the learner's main email.
    items = [{**item, 'email': people.get(item['email'], {}).get('learner_email', item['email'])} for item in items]
    open_cases = {}
    for case in existing:
        if case['source_type'] in REVIEW_CATEGORIES and not case['archived']:
            key = open_key(people, case['source_type'], case['learner_email'], case['overdue_since'], case['source_data'])
            open_cases.setdefault(key, []).append(case)
    total, current = 0, set()
    for (email, category, review), group in lms_reviews.group_items(items).items():
        # Only learners the LMS has as Active or Delivery: withdrawn and completed learners get no review calls.
        if email not in people or email not in people.active:
            continue
        key = (category, email, None, review)
        current.add(key)
        refs = sorted({item['ref'] for item in group})
        if key in open_reasons:
            for case in open_cases.get(key, []):
                add_review_refs(case['pk'], refs)
            continue
        days = [item['day'] for item in group]
        review_type = group[0]['review_type']
        person = people.resolve(email=email) if hasattr(people, 'resolve') else None
        discriminator = f'{max(days)}:{review_type}'
        if not closed_case_covers(category, person['emails'] if person else [email], discriminator, refs):
            # A closed case already has this key but not these reviews: they are a new issue, not the closed one.
            discriminator += ':' + hashlib.sha256(','.join(refs).encode()).hexdigest()[:12]
        count = len(group)
        risk = ('red' if summaries.overdue_status(count) == 'Due' else 'amber') if category == 'pr' else (
            summaries.mcm_risk(count) if category == 'mcm' else 'amber')
        # Overdue since the earliest review on the case, so its age and priority are not understated.
        _, fresh = upsert_case(category, people[email], discriminator, risk=risk, overdue=min(days), misses=count,
                               data={'review_type': review_type, 'review_refs': refs[:50]}, person=person)
        total += fresh
        open_reasons.add(key)
    candidates = [case for cases in open_cases.values() for case in cases]
    done = reviews_done([case for case in candidates if open_key(
        people, case['source_type'], case['learner_email'], case['overdue_since'], case['source_data']) not in current])
    retire(people, candidates, current, 'The LMS no longer reports this review as needing a call '
           '(booked, rebooked, cancelled, waiting for a signature, or the learner is not active).',
           keep=lambda case: done is None or case['pk'] in done)
    return total


def add_review_refs(ticket_id, refs):
    """Keep every review the LMS reports for an open case's issue on the case, so its proof covers all of them."""
    with transaction.atomic(using=DB):
        ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
        known = list(ticket.source_data.get('review_refs') or [])
        merged = known + [ref for ref in refs if ref not in known]
        if merged != known and ticket.status != 'resolved':
            ticket.source_data = {**ticket.source_data, 'review_refs': merged[:50]}
            ticket.save(update_fields=['source_data', 'updated_at'])


def closed_case_covers(category, emails, discriminator, refs):
    """Whether a resolved case with this reason key already covered these reviews (then it stays closed)."""
    closed = CaseTicket.objects.filter(reason_key__in=[reason_key(category, email, discriminator) for email in emails],
                                       status='resolved').values_list('source_data', flat=True)
    return all(set(refs) <= set((data or {}).get('review_refs') or []) for data in closed)


def reviews_done(cases):
    """IDs of the cases all of whose reviews are done in the LMS; None when the LMS cannot be read."""
    refs = sorted({ref for case in cases for ref in case['source_data'].get('review_refs') or []})
    if not refs:
        return set()
    try:
        with source_transaction(LMS):
            states = lms_reviews.ref_states(refs)
    except Exception:
        return None
    return {case['pk'] for case in cases if case['source_data'].get('review_refs')
            and all(ref in states and lms_reviews.done(case['source_type'], states[ref])
                    for ref in case['source_data']['review_refs'])}


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


# EPA readiness figures surfaced on the case card, read live from the Aptem extract.
# (label, column) pairs; numeric/date values are coerced to JSON-safe strings below.
EPA_METRIC_COLUMNS = (
    ('gateway_review_date', 'Gateway Review Date'), ('end_date', 'End-Date'),
    ('ksb_completed', 'TotalCompletedKSB'), ('ksb_total', 'TotalTargetKSB'), ('ksb_status', 'KSBStatus'),
    ('otj_completed', 'Completed'), ('otj_planned', 'Planned'), ('otj_status', 'OTJHoursStatus'),
    ('components_completed', 'TotalCompCount'), ('components_target', 'TargetCompCount'), ('components_status', 'CompStatus'),
    ('progress_variance', 'ProgressVariance'), ('coach_rag', 'Coach-RAG'),
)


def _epa_metric_value(value):
    """JSON-safe scalar for source_data: '' for blanks, ISO for dates, plain number/str otherwise."""
    if value is None:
        return ''
    from datetime import date as _date
    if isinstance(value, _date):
        return value.isoformat()
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip()
    return text


def refresh_epa_metrics():
    """Attach live EPA readiness figures (KSB, off-the-job hours, components, gateway date)
    to open EPA cases from ``aptem_auto_extracting``. Keeps the card showing real progress,
    and clears figures for learners who have left the extract."""
    cols = ', '.join('"%s"' % column for _, column in EPA_METRIC_COLUMNS)
    rows_by_email = {}
    for row in rows(APTEM, f'SELECT "Email", {cols} FROM public.aptem_auto_extracting'):
        key = email_key(row.get('Email'))
        if key:
            rows_by_email[key] = row
    changed = 0
    for ticket in CaseTicket.objects.filter(source_type='epa', archived=False).exclude(status='resolved'):
        row = rows_by_email.get(email_key(ticket.learner_email))
        metrics = {label: _epa_metric_value(row.get(column)) for label, column in EPA_METRIC_COLUMNS} if row else {}
        if ticket.source_data.get('epa_metrics', {}) != metrics:
            data = {**ticket.source_data, 'epa_metrics': metrics}
            CaseTicket.objects.filter(pk=ticket.pk).update(source_data=data)
            changed += 1
    return changed


def decode_json(value):
    return json.loads(value) if isinstance(value, str) else value


def load_bookings(people):
    tomorrow = next_workday(timezone.now().astimezone(LONDON).date())
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
                # On a break, withdrawn or completed: no reminder (the calendar path below checks the same).
                person = people.resolve(email=email) if hasattr(people, 'resolve') else None
                if person and program_is_paused(person):
                    continue
                email = people[email]['learner_email']
                key = f'{email}:{category}:{start.astimezone(LONDON).isoformat()}'
                result.setdefault(key, {'email': email, 'start': start, 'type': category,
                                        'id': str(item.get('appointmentId', '')), 'source': 'coaches_data'})
    if identity.enabled():
        from datetime import datetime
        calendar_rows = rows(LMS, '''SELECT id, event_key, learner_id, learner_email, event_type,
            status, scheduled_date, scheduled_time FROM "Learner".coach_calendar_event
            WHERE scheduled_date = %s AND scheduled_time IS NOT NULL''', [tomorrow])
        types = {'catch-up': 'support', 'student-support': 'support', 'progress-review': 'pr',
                 'monthly-coaching': 'mcm', 'monthly-coaching-meeting': 'mcm', 'mcr': 'mcm',
                 'first-session': 'first-session', 'lms-introduction': 'lms-introduction'}
        for item in calendar_rows:
            person = people.calendar_person(item)
            category = types.get(item['event_type'])
            start = datetime.combine(item['scheduled_date'], item['scheduled_time'], LONDON)
            email = person['profile']['learner_email'] if person else people.get(
                email_key(item['learner_email']), {}).get('learner_email', '')
            key = f'{email}:{category}:{start.isoformat()}'
            # An exact calendar appointment supersedes its legacy JSON copy, including cancellation/completion and
            # a learner who is now paused, so stale reminders cannot reappear.
            result.pop(key, None)
            if not person or not category or not email or program_is_paused(person):
                continue
            if item['status'] not in ('scheduled', 'in-progress', 'awaiting-signature'):
                continue
            result[key] = {'email': email, 'start': start, 'type': category,
                           'id': str(item['event_key']), 'source': 'Learner.coach_calendar_event'}
    return list(result.values())


def program_is_paused(person):
    return learners.program_status(person['programme_status']) != 'active'


def generate_reminders(people, bookings):
    from datetime import datetime, time as day_time
    tomorrow = next_workday(timezone.now().astimezone(LONDON).date())
    start = datetime.combine(tomorrow, day_time.min, LONDON)
    expected = {(b['email'], b['type'], b['start']) for b in bookings}
    for ticket in CaseTicket.objects.filter(source_type='reminder', archived=False,
            booking_at__gte=start, booking_at__lt=start+timedelta(days=1)).exclude(status='resolved'):
        if ticket.source_data.get('booking_source') not in ('coaches_data', 'Learner.coach_calendar_event'):
            continue
        person = people.get(ticket.learner_email)
        email = person['learner_email'] if person else ticket.learner_email
        allowed = (email, ticket.source_data.get('session_type'), ticket.booking_at) in expected
        if ticket.source_data.get('eligible', True) != allowed:
            ticket.source_data = {**ticket.source_data, 'eligible': allowed,
                                  'eligibility_reason': 'Matched current booking' if allowed else 'Booking absent, cancelled, rescheduled or no longer eligible'}
            ticket.save(update_fields=['source_data', 'updated_at'])
            event(ticket, 'reminder_eligibility_changed', {'eligible': allowed})
    count = 0
    for booking in bookings:
        _, created = upsert_case('reminder', people[booking['email']],
            f"{booking['type']}:{booking['start'].astimezone(LONDON).isoformat()}", booking_at=booking['start'],
            data={'booking_id': booking['id'], 'booking_source': booking['source'], 'session_type': booking['type']},
            person=people.resolve(email=booking['email']) if hasattr(people, 'resolve') else None)
        count += created
    return count
