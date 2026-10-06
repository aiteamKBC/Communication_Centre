"""Progress reviews and monthly coaching from the LMS; replaces Aptem's ``progress_review`` and ``"MCR"`` tables.

Two LMS sources. Legacy mode keeps the LMS's original per-learner source selection;
unified mode includes both, with distinct source-qualified review references:

* ``"Learner".reviews`` — the reviews imported from Aptem, matched to the learner by its own ``learner_email``.
* ``curriculum.review_instances`` — the new LMS's own reviews. Unified mode checks
  its profile ID against the shared identity directory and corroborates the calendar email.

Each review is one of three call reasons: ``due`` (date passed, never booked), ``missed`` (booked, date passed,
not completed) or ``signature`` (waiting for a signature). Reviews in progress are the coach's to finish and are
left out, as are completed and archived ones. Only review dates from ``REVIEWS_SINCE`` count.
"""
from django.db import connections

from .db import LMS
from .rules import REVIEWS_SINCE, email_key

# LMS review type (lower case) -> the call centre's review kind. Two kinds of progress review stay separate cases.
REVIEW_KINDS = {
    'monthly coaching meeting': 'mcm',
    'progress review': 'pr',
    'progress review (+ skills radar)': 'pr',
}
# Imported (Aptem) review status -> call reason.
IMPORTED_REASONS = {'not scheduled': 'due', 'scheduled': 'missed', 'awaitingsignature': 'signature'}
# New LMS review status -> call reason.
NATIVE_REASONS = {'not-scheduled': 'due', 'scheduled': 'missed', 'awaiting-signature': 'signature'}
# (review kind, call reason) -> case type.
CASE_TYPES = {('mcm', 'due'): 'mcm', ('pr', 'due'): 'pr', ('mcm', 'missed'): 'mcm_missed',
              ('pr', 'missed'): 'pr_missed', ('mcm', 'signature'): 'signature', ('pr', 'signature'): 'signature'}

IMPORTED_SQL = '''SELECT id, lower(trim(learner_email)) AS email, trim(review_type) AS review_type, status,
        (planned_scheduled_date AT TIME ZONE 'Europe/London')::date AS day, completed_date
    FROM "Learner".reviews
    WHERE lower(trim(review_type)) = ANY(%s) AND nullif(trim(learner_email), '') IS NOT NULL
      AND (planned_scheduled_date AT TIME ZONE 'Europe/London')::date BETWEEN %s AND %s'''
IMPORTED_EMAILS_SQL = '''SELECT DISTINCT lower(trim(learner_email)) FROM "Learner".reviews
    WHERE nullif(trim(learner_email), '') IS NOT NULL'''
NATIVE_SQL = '''SELECT i.id, i.learner_id AS profile_id, lower(trim(e.learner_email)) AS email, trim(t.name) AS review_type, i.status,
        coalesce(e.scheduled_date, i.target_date) AS day, i.completed_at
    FROM curriculum.review_instances i
    JOIN curriculum.review_templates t ON t.id = i.review_template_id
    JOIN "Coach".coach_calendar_event e ON e.id = i.calendar_event_id
    WHERE lower(trim(t.name)) = ANY(%s) AND nullif(trim(e.learner_email), '') IS NOT NULL
      AND coalesce(e.scheduled_date, i.target_date) BETWEEN %s AND %s'''


def _fetch(cursor, sql, params=()):
    cursor.execute(sql, params)
    columns = [c[0] for c in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _fetch_rows(cursor, sql, params=()):
    cursor.execute(sql, params)
    return cursor.fetchall()


def classify(review_type, status, day, completed, today, reasons):
    """The case type for one review, or None when nobody needs a call about it."""
    kind = REVIEW_KINDS.get(str(review_type or '').strip().lower())
    reason = reasons.get(str(status or '').strip().lower())
    if not kind or not reason or day is None or day < REVIEWS_SINCE:
        return None
    # A due or missed review needs its date to have passed and no completion; a signature is waited for from the day.
    if reason != 'signature' and (completed or day >= today):
        return None
    if reason == 'signature' and day > today:
        return None
    return CASE_TYPES[(kind, reason)]


def review_items(today, people=None):
    """Every review needing a call: {email, case_type, review_type, day, ref}. ``ref`` names the LMS row."""
    kinds = list(REVIEW_KINDS)
    with connections[LMS].cursor() as cursor:
        imported = _fetch(cursor, IMPORTED_SQL, [kinds, REVIEWS_SINCE, today])
        has_imported = {email for (email,) in _fetch_rows(cursor, IMPORTED_EMAILS_SQL)}
        native = _fetch(cursor, NATIVE_SQL, [kinds, REVIEWS_SINCE, today])
    items = []
    for rows, reasons, prefix, done in ((imported, IMPORTED_REASONS, 'reviews', 'completed_date'),
                                        (native, NATIVE_REASONS, 'instance', 'completed_at')):
        for row in rows:
            email = email_key(row['email'])
            if people is not None:
                if email not in people:
                    continue
                if prefix == 'instance' and (row.get('profile_id') is None or not people.resolve('profile', row.get('profile_id'), email)):
                    continue
                email = people[email]['learner_email']
            if people is None and prefix == 'instance' and email in has_imported:
                continue   # the LMS's rule: a learner with imported reviews is never read from Curriculum
            case_type = classify(row['review_type'], row['status'], row['day'], row[done], today, reasons)
            if case_type:
                items.append({'email': email, 'case_type': case_type, 'review_type': row['review_type'],
                              'day': row['day'], 'ref': f'{prefix}:{row["id"]}'})
    return items


def group_items(items):
    """One call per learner, case type and review type: {(email, case_type, review_type): [items]}."""
    groups = {}
    for item in items:
        groups.setdefault((item['email'], item['case_type'], item['review_type']), []).append(item)
    return groups


REF_SQL = {
    'reviews': '''SELECT id::text AS id, status, completed_date AS completed, updated_at FROM "Learner".reviews
        WHERE id::text = ANY(%s)''',
    'instance': '''SELECT id, status, completed_at AS completed, updated_at FROM curriculum.review_instances
        WHERE id = ANY(%s)''',
}


def ref_states(refs):
    """Current LMS state of the given review refs: {ref: {status, completed, updated_at}}."""
    by_prefix = {}
    for ref in refs:
        prefix, _, key = str(ref).partition(':')
        if prefix in REF_SQL and key:
            by_prefix.setdefault(prefix, []).append(key)
    states = {}
    with connections[LMS].cursor() as cursor:
        for prefix, keys in by_prefix.items():
            for row in _fetch(cursor, REF_SQL[prefix], [keys]):
                states[f'{prefix}:{row["id"]}'] = row
    return states


def done(case_type, state):
    """Whether this review no longer needs the call: completed (and, for a signature, signed off)."""
    status = str(state.get('status') or '').strip().lower()
    if case_type == 'signature':
        return status == 'completed'
    return status == 'completed' or bool(state.get('completed'))
