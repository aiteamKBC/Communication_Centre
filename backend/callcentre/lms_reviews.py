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
import json
from datetime import datetime, timezone

from django.db import connections

from . import graph
from .db import LMS
from .rules import LONDON, REVIEWS_SINCE, email_key

# LMS review type (lower case) -> the call centre's review kind. Two kinds of progress review stay separate cases.
# Aptem has exported the monthly coaching meeting under three names; the LMS treats them as one (review_history.py).
REVIEW_KINDS = {
    'monthly coaching meeting': 'mcm',
    'monthly coaching': 'mcm',
    'mcm': 'mcm',
    'progress review': 'pr',
    'progress review (+ skills radar)': 'pr',
}
MCM_NAMES = [name for name, kind in REVIEW_KINDS.items() if kind == 'mcm']
# Review status, normalised as the LMS does (both sources) -> call reason.
# ``in-progress`` past its date counts as missed: a review the coach began but has not finished by the
# planned day did not actually happen on time, so the learner still needs the catch-up call.
STATUS_REASONS = {'not-scheduled': 'due', 'scheduled': 'missed', 'in-progress': 'missed',
                  'awaiting-signature': 'signature'}
IMPORTED_REASONS = NATIVE_REASONS = STATUS_REASONS
# (review kind, call reason) -> case type.
CASE_TYPES = {('mcm', 'due'): 'mcm', ('pr', 'due'): 'pr', ('mcm', 'missed'): 'mcm_missed',
              ('pr', 'missed'): 'pr_missed', ('mcm', 'signature'): 'signature', ('pr', 'signature'): 'signature'}
# Booking statuses the LMS shows for an imported review even when the booking's sync is not verified.
BOOKING_STATUSES = {'completed', 'awaiting-signature', 'cancelled', 'failed'}


def normalise_status(value):
    """One status vocabulary for both sources, as the LMS's learner_api.review_history._normalise_status."""
    text = str(value or '').strip().lower().replace(' ', '-').replace('_', '-')
    return {'finished': 'completed', 'complete': 'completed', 'planned': 'not-scheduled', 'not-booked': 'not-scheduled',
            'inprogress': 'in-progress', 'awaitingsignature': 'awaiting-signature'}.get(text, text)


def verified_missing_signature(row):
    """Only a verified signature snapshot can turn a completed review into a signature case."""
    snapshot = row.get('signature_status')
    if isinstance(snapshot, str):
        try:
            snapshot = json.loads(snapshot)
        except (TypeError, ValueError):
            snapshot = None
    return isinstance(snapshot, dict) and snapshot.get('verified') is True and snapshot.get('state') == 'missing'


def signature_missing_roles(row):
    """Return the required signature roles that are verified as missing in an imported review."""
    snapshot = row.get('signature_status')
    if isinstance(snapshot, str):
        try:
            snapshot = json.loads(snapshot)
        except (TypeError, ValueError):
            snapshot = None
    if not isinstance(snapshot, dict) or snapshot.get('verified') is not True:
        return []
    roles = snapshot.get('roles')
    if not isinstance(roles, dict):
        return []
    return sorted(role for role, value in roles.items()
                  if isinstance(value, dict) and value.get('required') is True and value.get('status') == 'missing')


def signature_contacts(row):
    """The LMS follow-up contacts for missing signature roles, when supplied by the snapshot."""
    snapshot = row.get('signature_status')
    if isinstance(snapshot, str):
        try:
            snapshot = json.loads(snapshot)
        except (TypeError, ValueError):
            snapshot = None
    roles = snapshot.get('roles') if isinstance(snapshot, dict) else None
    return {role: value.get('follow_up_contact') for role, value in (roles or {}).items()
            if isinstance(value, dict) and value.get('required') is True and value.get('status') == 'missing'
            and isinstance(value.get('follow_up_contact'), dict)}


def actionable_signature(row):
    """Only learner/employer signatures create call-centre work; coach-only and unknown are ignored."""
    return bool(set(signature_missing_roles(row)) & {'learner', 'employer'})


# An imported review as the LMS shows it: the raw Aptem row, then its new-LMS booking ("Coach".coach_calendar_event,
# by exact key or the learner's own booking key) and its form continuation ("Coach".coach_imported_review_instance).
# The joins follow coach_api.review_sources (linked_overlay, linked_booking); more than one match is a conflict.
IMPORTED_SQL = '''SELECT r.id, lower(trim(r.learner_email)) AS email, trim(r.review_type) AS review_type, r.status,
        r.completed_date, r.updated_at, (r.planned_scheduled_date AT TIME ZONE 'Europe/London')::date AS planned_day,
        r.review_data->'signature_status' AS signature_status,
        o.matches AS overlay_matches, o.status AS overlay_status, o.completed_at AS overlay_completed,
        b.matches AS booking_matches, b.status AS booking_status, b.verified AS booking_verified,
        b.scheduled_date AS booking_day, b.event_id AS booking_event_id, b.learner_id AS booking_learner_id,
        b.graph_event_id, b.graph_organizer_email
    FROM "Learner".reviews r
    LEFT JOIN "Learner".learners p ON p.id = r.learner_id
    LEFT JOIN LATERAL (
        SELECT count(*) AS matches, max(x.status) AS status, max(x.completed_at) AS completed_at, max(x.event_key) AS event_key
        FROM "Coach".coach_imported_review_instance x
        WHERE x.learner_id = r.learner_id
          AND (x.source_review_id = r.id
               OR (x.source_review_id IS NULL AND x.event_key = 'imported-review:' || trim(r.aptem_review_id)))
    ) o ON TRUE
    LEFT JOIN LATERAL (
        SELECT count(*) AS matches, max(e.status) AS status, max(e.scheduled_date) AS scheduled_date,
               max(e.id) AS event_id, max(e.learner_id) AS learner_id,
               max(e.graph_event_id) AS graph_event_id, max(e.graph_organizer_email) AS graph_organizer_email,
               bool_or(e.sync_state = 'synced' AND coalesce(e.graph_event_id, '') <> ''
                       AND (coalesce(e.meeting_link, '') <> '' OR coalesce(e.graph_web_link, '') <> '')) AS verified
        FROM "Coach".coach_calendar_event e
        WHERE e.event_type = CASE WHEN lower(trim(r.review_type)) = ANY(%(mcm)s) THEN 'mcr' ELSE 'progress-review' END
          AND coalesce(e.review_instance_id, '') = '' AND coalesce(e.review_template_id, '') = ''
          AND ((e.learner_id = r.learner_id
                AND (e.event_key = 'imported-review:' || trim(r.aptem_review_id) OR e.event_key = o.event_key))
               OR (array_length(string_to_array(e.idempotency_key, ':'), 1) = 6
                   AND split_part(e.idempotency_key, ':', 1) = 'learner-book'
                   AND split_part(e.idempotency_key, ':', 2)
                       = CASE WHEN lower(trim(r.review_type)) = ANY(%(mcm)s) THEN 'mcm' ELSE 'progress-review' END
                   AND split_part(e.idempotency_key, ':', 3)
                       = CASE WHEN p.learner_type = 'commercial' THEN 'commercial' ELSE 'apprenticeship' END
                   AND split_part(e.idempotency_key, ':', 4) = p.enrolment_id::text
                   AND split_part(e.idempotency_key, ':', 6) = r.id::text
                   AND e.learner_id IN (r.learner_id, p.enrolment_id)))
    ) b ON TRUE
    WHERE {where}'''
# Only current, verified Aptem membership can create new cases. REF_SQL below
# deliberately retains historical ID lookup for existing tickets and evidence.
IMPORTED_WHERE = '''lower(trim(r.review_type)) = ANY(%(kinds)s) AND nullif(trim(r.learner_email), '') IS NOT NULL
      AND r.review_data->'aptem_visibility'->>'verified' = 'true'
      AND r.review_data->'aptem_visibility'->>'visible' = 'true'
      AND greatest((r.planned_scheduled_date AT TIME ZONE 'Europe/London')::date, b.scheduled_date) >= %(since)s'''
# New-LMS reviews. An unbooked review has no calendar event, so the learner's own profile gives the email, and a
# cancelled booking puts the review back on its target date. ``aptem_source``: the LMS reads this learner's reviews
# from Aptem (coach_api.review_sources.resolve_review_source: enrolment Aptem ID, then profile Aptem ID).
NATIVE_DAY = "CASE WHEN e.id IS NULL OR e.status = 'cancelled' THEN i.target_date ELSE coalesce(e.scheduled_date, i.target_date) END"
NATIVE_EMAIL = "coalesce(nullif(trim(e.learner_email), ''), l.email_normalized)"
NATIVE_SQL = f'''SELECT i.id, i.learner_id AS profile_id, lower(trim({NATIVE_EMAIL})) AS email,
        trim(t.name) AS review_type, i.status, i.completed_at, {NATIVE_DAY} AS day,
        e.id AS booking_event_id, e.learner_id AS booking_learner_id,
        e.graph_event_id, e.graph_organizer_email, e.status AS booking_status,
        coalesce(coalesce(nullif(trim(u.aptem_id::text), ''), nullif(trim(l.aptem_id::text), '')) ~ '^0*[1-9][0-9]*$',
                 false) AS aptem_source
    FROM curriculum.review_instances i
    JOIN curriculum.review_templates t ON t.id = i.review_template_id
    LEFT JOIN "Coach".coach_calendar_event e ON e.id = i.calendar_event_id
    LEFT JOIN "Learner".learners l ON l.id = i.learner_id
    LEFT JOIN enrolment."Created_users" u ON u.id = l.enrolment_id AND coalesce(l.learner_type, '') <> 'commercial'
    WHERE lower(trim(t.name)) = ANY(%(kinds)s) AND nullif(trim({NATIVE_EMAIL}), '') IS NOT NULL
      AND {NATIVE_DAY} >= %(since)s'''


def _fetch(cursor, sql, params=()):
    cursor.execute(sql, params)
    columns = [c[0] for c in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


# Call-centre review kind -> coach_calendar_event.event_type, so we can find a replacement
# booking after a Teams cancellation.
BOOKING_EVENT_TYPES = {'mcm': 'mcr', 'pr': 'progress-review'}


def _as_london_date(iso_string):
    """Parse a Graph ``start.dateTime`` into a London calendar date, or None if unusable."""
    if not iso_string:
        return None
    try:
        when = datetime.fromisoformat(str(iso_string).replace('Z', '+00:00'))
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when.astimezone(LONDON).date()


def _replacement_booking(cursor, learner_id, event_type, exclude_id):
    """A newer, non-cancelled booking for the same learner & event type — the LMS form's answer
    to 'if this Teams meeting was cancelled, was a replacement booked?'."""
    if learner_id is None or not event_type:
        return None
    cursor.execute(
        '''SELECT scheduled_date, status, graph_event_id, graph_organizer_email
           FROM "Coach".coach_calendar_event
           WHERE learner_id = %s AND event_type = %s AND id <> %s
             AND coalesce(status, '') <> 'cancelled'
             AND scheduled_date IS NOT NULL
           ORDER BY updated_at DESC NULLS LAST
           LIMIT 1''',
        [learner_id, event_type, exclude_id or 0])
    row = cursor.fetchone()
    if not row:
        return None
    return {'scheduled_date': row[0], 'status': row[1], 'graph_event_id': row[2], 'graph_organizer_email': row[3]}


def _graph_state(cache, organizer, event_id):
    """Memoise Graph lookups for one sync pass so each Teams event is fetched at most once."""
    key = (organizer or '', event_id or '')
    if not key[0] or not key[1]:
        return None
    if key not in cache:
        cache[key] = graph.event_state(organizer, event_id)
    return cache[key]


def _reconcile_imported(cursor, row, cache):
    """Overlay the real Teams state onto an imported review's booking columns.

    * Teams says the meeting moved → update ``booking_day`` so a now-future meeting stops looking missed.
    * Teams says cancelled/deleted and the LMS has a replacement booking → follow the replacement.
    * Teams says cancelled/deleted and no replacement exists → leave the row alone so the review still
      shows as missed (the meeting didn't happen; the learner still needs a catch-up call).
    * Graph unavailable or no event id → leave the row untouched (trust the LMS cache)."""
    kind = REVIEW_KINDS.get(str(row.get('review_type') or '').strip().lower())
    if not kind or not row.get('booking_matches'):
        return
    state = _graph_state(cache, row.get('graph_organizer_email'), row.get('graph_event_id'))
    if state is None:
        return
    if state.get('found') and not state.get('cancelled'):
        new_day = _as_london_date(state.get('start'))
        if new_day:
            row['booking_day'] = new_day
        return
    replacement = _replacement_booking(cursor, row.get('booking_learner_id'),
                                       BOOKING_EVENT_TYPES.get(kind), row.get('booking_event_id'))
    if replacement:
        row['booking_day'] = replacement['scheduled_date']
        row['booking_status'] = replacement['status']


def _reconcile_native(cursor, row, cache):
    """Same reconciliation for a new-LMS review (``curriculum.review_instances``)."""
    kind = REVIEW_KINDS.get(str(row.get('review_type') or '').strip().lower())
    if not kind or not row.get('booking_event_id'):
        return
    state = _graph_state(cache, row.get('graph_organizer_email'), row.get('graph_event_id'))
    if state is None:
        return
    if state.get('found') and not state.get('cancelled'):
        new_day = _as_london_date(state.get('start'))
        if new_day:
            row['day'] = new_day
            if normalise_status(row.get('status')) == 'cancelled':
                row['status'] = 'scheduled'
        return
    replacement = _replacement_booking(cursor, row.get('booking_learner_id'),
                                       BOOKING_EVENT_TYPES.get(kind), row.get('booking_event_id'))
    if replacement:
        row['day'] = replacement['scheduled_date']
        row['status'] = replacement['status'] or 'scheduled'
        return
    # No replacement: the Teams meeting disappeared without a new booking taking its place, so the
    # review still owes a catch-up call. Normalise the review's own status to 'scheduled' so a review
    # the LMS has already marked 'cancelled' does not silently vanish from the missed list.
    if normalise_status(row.get('status')) == 'cancelled':
        row['status'] = 'scheduled'


def imported_state(row):
    """(status, day, completed) of an imported review as the LMS shows it (review_sources.apply_imported_state);
    None while more than one booking or form continuation claims it, which the LMS refuses to choose between."""
    # Aptem marks the review itself completed when the meeting/form is finished, then keeps the
    # signature workflow open afterwards.  A verified signature snapshot is the authoritative
    # source for that transition; checking completed_date first silently hid missing signatures.
    if verified_missing_signature(row):
        return 'awaiting-signature', row.get('booking_day') or row.get('planned_day'), None
    source = normalise_status(row.get('status'))
    planned = row.get('planned_day')
    if source == 'completed' or row.get('completed_date'):
        return 'completed', planned, row.get('completed_date') or row.get('updated_at')
    if (row.get('booking_matches') or 0) > 1 or (row.get('overlay_matches') or 0) > 1:
        return None
    status, day = source, planned
    if row.get('booking_matches'):
        booking = normalise_status(row.get('booking_status'))
        if row.get('booking_verified') or booking in BOOKING_STATUSES:
            status = booking
        day = row.get('booking_day') or day
    if row.get('overlay_matches'):
        local = normalise_status(row.get('overlay_status'))
        # An unstarted form must not demote an existing booking.
        if local != 'not-scheduled' or status == 'not-scheduled':
            status = local
    return status, day, row.get('overlay_completed') if status == 'completed' else None


def classify(review_type, status, day, completed, today, reasons=STATUS_REASONS):
    """The case type for one review, or None when nobody needs a call about it."""
    kind = REVIEW_KINDS.get(str(review_type or '').strip().lower())
    reason = reasons.get(normalise_status(status))
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
    params = {'kinds': list(REVIEW_KINDS), 'mcm': MCM_NAMES, 'since': REVIEWS_SINCE}
    with connections[LMS].cursor() as cursor:
        imported = _fetch(cursor, IMPORTED_SQL.format(where=IMPORTED_WHERE), params)
        native = _fetch(cursor, NATIVE_SQL, params)
        graph_cache = {}
        for row in imported:
            _reconcile_imported(cursor, row, graph_cache)
        for row in native:
            _reconcile_native(cursor, row, graph_cache)
    reviews = []
    for row in imported:
        state = imported_state(row)
        if state:
            reviews.append((row, 'reviews', *state))
    for row in native:
        # Legacy mode keeps the LMS's rule: a learner whose reviews come from Aptem is never read from Curriculum.
        if people is None and row.get('aptem_source'):
            continue
        reviews.append((row, 'instance', row['status'], row['day'], row['completed_at']))
    items = []
    for row, prefix, status, day, completed in reviews:
        email = email_key(row['email'])
        if people is not None:
            if email not in people:
                continue
            if prefix == 'instance' and (row.get('profile_id') is None or not people.resolve('profile', row.get('profile_id'), email)):
                continue
            email = people[email]['learner_email']
        case_type = classify(row['review_type'], status, day, completed, today)
        if case_type == 'signature' and (prefix != 'reviews' or not actionable_signature(row)):
            continue
        if case_type:
            items.append({'email': email, 'case_type': case_type, 'review_type': row['review_type'],
                          'day': day, 'ref': f'{prefix}:{row["id"]}',
                          'missing_signature_roles': signature_missing_roles(row) if prefix == 'reviews' else [],
                          'signature_contacts': signature_contacts(row) if prefix == 'reviews' else {}})
    return items


def group_items(items):
    """One call per learner, case type and review type (letter case ignored): {(email, case_type, type): [items]}."""
    groups = {}
    for item in items:
        groups.setdefault((item['email'], item['case_type'], review_key(item['review_type'])), []).append(item)
    return groups


def review_key(review_type):
    return ' '.join(str(review_type or '').split()).lower()


REF_SQL = {
    'reviews': IMPORTED_SQL.format(where='r.id::text = ANY(%(ids)s)'),
    'instance': '''SELECT id, status, completed_at AS completed, updated_at FROM curriculum.review_instances
        WHERE id = ANY(%(ids)s)''',
}


def ref_states(refs):
    """Current LMS state of the given review refs, as the LMS shows them: {ref: {status, completed, updated_at}}."""
    by_prefix = {}
    for ref in refs:
        prefix, _, key = str(ref).partition(':')
        if prefix in REF_SQL and key:
            by_prefix.setdefault(prefix, []).append(key)
    states = {}
    with connections[LMS].cursor() as cursor:
        for prefix, keys in by_prefix.items():
            for row in _fetch(cursor, REF_SQL[prefix], {'ids': keys, 'mcm': MCM_NAMES}):
                if prefix == 'reviews':
                    state = imported_state(row)
                    if not state:
                        continue   # conflicting bookings: no state is proof
                    row = {**row, 'id': row['id'], 'status': state[0], 'completed': state[2], 'updated_at': row['updated_at']}
                states[f'{prefix}:{row["id"]}'] = row
    return states


def done(case_type, state):
    """Whether this review no longer needs the call: completed (and, for a signature, signed off)."""
    status = normalise_status(state.get('status'))
    if case_type == 'signature':
        return status == 'completed'
    return status == 'completed' or bool(state.get('completed'))
