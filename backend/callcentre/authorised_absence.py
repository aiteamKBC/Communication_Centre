"""Authorised absences: a coming lecture a learner told their coach they will miss, with the reason.

On the coaches' screen (coach_centre.py) the coach picks one of the learner's lectures in the next two weeks. When the
register later shows the learner absent from it, the missed-lecture case closes as soon as it is made (``apply``, run
by the cycle straight after the cases are made), so nobody calls about it and the coach need not remember to mark it.

**Which lectures are the learner's**, read-only from the LMS with the LMS's own rules (learner_api.learning_plan
``_effective_plan_ids`` and training_plan_dashboard ``_plan_session_rows``), but stricter where the LMS guesses:

* the modules on the learner's saved plan (``Training_plan``, else ``Learning_plan`` on their enrolment row). A saved
  plan with no explicit selection also takes the modules preset on their group;
* with no saved plan, the modules preset on their group;
* the group is the ``group_id`` every learner profile on the enrolment agrees on. The LMS falls back to the group's
  *name*, which it says itself is blind to the cohort (the same name recurs in every cohort), so that fallback is not
  used: a learner whose group is not known exactly is offered only their saved plan's lectures, never a guess;
* a learner with more than one enrolment row for their emails is offered nothing;
* each module's live sessions, following the LMS's shared-series owner (``teams_shared_source_module_id``), active and
  starting in the next ``WINDOW``. A recurring series offers only its real occurrences.

**Matching the case**: a case from the LMS live register names its register row, whose occurrence is compared with the
absence's; any other case (the legacy register) matches on the learner, the lecture date and the module, and only
when exactly one absence fits.
"""
import json
from collections import defaultdict
from datetime import timedelta, timezone as dt_timezone

from django.db import IntegrityError, ProgrammingError, transaction
from django.utils import timezone

from .alternative_sessions import module_key, utc
from .db import DB, LMS
from .models import AuthorisedAbsence, CaseTicket
from .rules import AUTHORISED_ABSENCE, LONDON, email_key
from .services import close
from .sources import rows

NOT_SET_UP = ('Authorised absences are not set up yet. Run docs/callcentre-port/coach_centre.sql on the call-centre '
              'database.')
REASONS = {'illness': 'Illness or medical appointment', 'work': 'Work commitments', 'family': 'Family or personal reasons',
           'holiday': 'Holiday', 'other': 'Other'}
WINDOW = timedelta(days=14)
# Statuses that never make a session upcoming (the LMS's INACTIVE_EVENT_STATUSES).
INACTIVE = {'cancelled', 'canceled', 'completed', 'deleted', 'failed', 'superseded', 'awaiting-signature'}
# After this many days with no missed-lecture case, the learner most likely attended.
NO_CASE_AFTER = timedelta(days=7)


def ready():
    try:
        with transaction.atomic(using=DB):
            AuthorisedAbsence.objects.exists()
        return True
    except ProgrammingError:
        return False


# --- the learner's coming lectures ---------------------------------------------------------------

def text(value):
    return str(value or '').strip()


def parsed(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return None
    return value


def saved_plan(row):
    """The plan stored on the enrolment row, as the LMS reads it (mappers.stored_training_plan): None when unsaved."""
    for column in ('Training_plan', 'Learning_plan'):
        plan = parsed(row.get(column))
        if isinstance(plan, list):
            return [entry for entry in plan if isinstance(entry, dict)]
    return None


def plan_modules(plan, preset):
    """The LMS's ``_effective_plan_ids``: saved plan, else the group preset; a saved plan without an explicit selection
    also takes the preset's other modules. ``preset`` is [] when the group is not known exactly."""
    if plan is None:
        return list(preset)
    ids = [text(entry.get('moduleId')) for entry in plan if text(entry.get('moduleId'))]
    if not ids or any(entry.get('assignmentMode') == 'explicit' for entry in plan):
        return ids
    return ids + [module for module in preset if module not in set(ids)]


def enrolments(emails):
    """{main email: enrolment row} for learners with exactly one enrolment row among their emails."""
    found = rows(LMS, '''SELECT id, lower(trim("Email")) AS email, "Training_plan", "Learning_plan"
        FROM enrolment."Created_users" WHERE lower(trim("Email")) = ANY(%s)''', [sorted(emails)])
    by_learner = defaultdict(dict)
    for row in found:
        main = emails.get(row['email'])
        if main:
            by_learner[main][row['id']] = row
    return {main: next(iter(items.values())) for main, items in by_learner.items() if len(items) == 1}


def group_ids(enrolment_ids):
    """{enrolment id: group id} where every learner profile on the enrolment agrees on one group id."""
    found = defaultdict(set)
    for row in rows(LMS, '''SELECT enrolment_id, group_id FROM "Learner".learners WHERE enrolment_id = ANY(%s)''',
                    [list(enrolment_ids)]):
        found[row['enrolment_id']].add(text(row['group_id']))
    return {key: next(iter(values)) for key, values in found.items() if len(values) == 1 and '' not in values}


def presets(groups):
    """{group id: module ids}, without the modules whose roster is manual (as ``_group_module_ids``)."""
    if not groups:
        return {}
    found = {}
    for row in rows(LMS, '''SELECT group_id, module_ids FROM curriculum.groups
            WHERE group_id = ANY(%s) AND deleted_at IS NULL AND COALESCE(is_programme_deleted, FALSE) = FALSE''',
                    [sorted(groups)]):
        ids = parsed(row['module_ids'])
        found.setdefault(text(row['group_id']), []).append([text(i) for i in ids] if isinstance(ids, list) else [])
    # A group id names one group; if it ever named two, neither is trusted.
    found = {group: lists[0] for group, lists in found.items() if len(lists) == 1}
    wanted = sorted({module for ids in found.values() for module in ids if module})
    manual = {text(row['module_catalogue_id']) for row in rows(LMS, '''SELECT module_catalogue_id FROM curriculum.modules
        WHERE module_catalogue_id = ANY(%s) AND COALESCE(learner_roster_mode, 'inherited') = 'manual' ''', [wanted])} if wanted else set()
    return {group: [module for module in ids if module and module not in manual] for group, ids in found.items()}


SESSIONS_SQL = '''WITH RECURSIVE owners(module_id, owner_id, depth) AS (
        SELECT m.module_catalogue_id, coalesce(nullif(btrim(m.teams_shared_source_module_id), ''), m.module_catalogue_id), 0
        FROM curriculum.modules m WHERE m.module_catalogue_id = ANY(%s)
        UNION ALL
        SELECT owners.module_id, btrim(m.teams_shared_source_module_id), owners.depth + 1
        FROM owners JOIN curriculum.modules m ON m.module_catalogue_id = owners.owner_id
        WHERE coalesce(btrim(m.teams_shared_source_module_id), '') <> '' AND owners.depth < 5
    ), delivery AS (SELECT DISTINCT ON (module_id) module_id, owner_id FROM owners ORDER BY module_id, depth DESC)
    SELECT delivery.module_id, target.title AS module_title, s.id AS session_id, s.repeat_pattern, s.start_datetime,
        s.duration_minutes, s.status AS series_status, o.id AS occurrence_id, o.session_number, o.scheduled_start,
        o.scheduled_end, o.status
    FROM delivery
    JOIN curriculum.live_sessions s ON s.module_catalogue_id = delivery.owner_id
    JOIN curriculum.modules target ON target.module_catalogue_id = delivery.module_id
    LEFT JOIN curriculum.live_session_occurrences o ON o.live_session_id = s.id
    WHERE coalesce(o.scheduled_start, s.start_datetime) >= %s AND coalesce(o.scheduled_start, s.start_datetime) < %s
    ORDER BY coalesce(o.scheduled_start, s.start_datetime), coalesce(o.id, s.id)::text'''


def active(status):
    return text(status).casefold() not in INACTIVE


def session_json(row):
    starts = utc(row['scheduled_start'] or row['start_datetime'])
    ends = utc(row['scheduled_end']) if row['scheduled_end'] else (
        starts + timedelta(minutes=row['duration_minutes']) if row['duration_minutes'] else None)
    ref = f'occurrence:{row["occurrence_id"]}' if row['occurrence_id'] else f'series:{row["session_id"]}'
    return {'ref': ref, 'occurrence_id': text(row['occurrence_id']), 'module_id': text(row['module_id']),
            'module': text(row['module_title']), 'session_number': row['session_number'],
            'starts_at': starts, 'ends_at': ends, 'date': starts.astimezone(LONDON).date()}


def upcoming(learners, emails, now=None):
    """{main email: the learner's lectures starting in the next ``WINDOW``}, for these learners ({main email: profile});
    ``emails`` maps every email of theirs to the main one."""
    now = now or timezone.now()
    found = enrolments(emails)
    if not found:
        return {}
    groups = group_ids({row['id'] for row in found.values()})
    preset = presets(set(groups.values()))
    modules = {main: plan_modules(saved_plan(row), preset.get(groups.get(row['id']), []))
               for main, row in found.items()}
    wanted = sorted({module for ids in modules.values() for module in ids})
    if not wanted:
        return {}
    bounds = [moment.astimezone(dt_timezone.utc).replace(tzinfo=None) for moment in (now, now + WINDOW)]
    by_module = defaultdict(dict)
    for row in rows(LMS, SESSIONS_SQL, [wanted, *bounds]):
        if not active(row['series_status']) or (row['occurrence_id'] and not active(row['status'])):
            continue
        # Recurring dates come from real occurrences only; never made up from the pattern.
        if not row['occurrence_id'] and text(row['repeat_pattern']) not in ('', 'none'):
            continue
        session = session_json(row)
        by_module[session['module_id']][session['ref']] = session
    result = {}
    for main, ids in modules.items():
        sessions = {ref: session for module in ids for ref, session in by_module.get(module, {}).items()}
        if sessions:
            result[main] = sorted(sessions.values(), key=lambda s: (s['starts_at'], s['ref']))
    return result


# --- recording ------------------------------------------------------------------------------------

def absence_json(absence, now=None):
    now = now or timezone.now()
    if absence.cancelled_at:
        state = 'cancelled'
    elif absence.ticket_id:
        state = 'applied'
    elif absence.starts_at > now:
        state = 'coming'
    elif absence.session_date + NO_CASE_AFTER < now.astimezone(LONDON).date():
        state = 'no_absence'
    else:
        state = 'waiting'
    return {'id': absence.pk, 'session_ref': absence.session_ref, 'date': absence.session_date,
            'starts_at': absence.starts_at, 'module': absence.module, 'reason': absence.reason,
            'reason_label': REASONS.get(absence.reason, absence.reason), 'note': absence.note,
            'added_by': absence.added_by, 'added_role': absence.added_role, 'created_at': absence.created_at,
            'cancelled_by': absence.cancelled_by, 'cancelled_at': absence.cancelled_at, 'ticket_id': absence.ticket_id,
            'applied_at': absence.applied_at, 'state': state}


def recent(emails, now=None):
    """{main email: their absences of the last 30 days and to come}, newest lecture first; None while not set up."""
    now = now or timezone.now()
    try:
        with transaction.atomic(using=DB):
            found = list(AuthorisedAbsence.objects.filter(learner_email__in=list(set(emails.values())),
                                                          session_date__gte=(now - timedelta(days=30)).astimezone(LONDON).date())
                         .order_by('-starts_at', '-pk'))
    except ProgrammingError:
        return None
    result = defaultdict(list)
    for absence in found:
        result[email_key(absence.learner_email)].append(absence_json(absence, now))
    return result


def add(learner, coach_email, session, reason, note, actor, role):
    """Record that ``learner`` (a profile) will miss ``session`` (one of ``upcoming``'s) for ``reason``."""
    note = text(note)
    if reason not in REASONS:
        raise ValueError('Choose a reason.')
    if len(note) > 1000:
        raise ValueError('Keep the note to 1,000 characters.')
    if not ready():
        raise ValueError(NOT_SET_UP)
    try:
        with transaction.atomic(using=DB):
            return AuthorisedAbsence.objects.create(
                learner_email=learner['learner_email'], learner_name=learner['learner_name'][:255],
                coach_email=email_key(coach_email), session_ref=session['ref'], occurrence_id=session['occurrence_id'],
                session_date=session['date'], starts_at=session['starts_at'], module=session['module'][:255],
                module_id=session['module_id'], reason=reason, note=note, added_by=actor, added_role=role)
    except IntegrityError:
        raise ValueError('This lecture is already marked as an authorised absence.') from None


def cancel(absence_id, learner_emails, note, actor):
    """Withdraw an absence that has not closed a case yet. Returns it."""
    note = text(note)
    if len(note) > 1000:
        raise ValueError('Keep the note to 1,000 characters.')
    with transaction.atomic(using=DB):
        absence = AuthorisedAbsence.objects.select_for_update().filter(pk=absence_id, cancelled_at=None).first()
        if absence is None or email_key(absence.learner_email) not in learner_emails:
            raise ValueError('This absence is no longer recorded. Reload the page.')
        if absence.ticket_id:
            raise ValueError('This absence has already closed its missed-lecture case.')
        absence.cancelled_at, absence.cancelled_by, absence.cancelled_note = timezone.now(), actor, note
        absence.save(update_fields=['cancelled_at', 'cancelled_by', 'cancelled_note'])
    return absence


# --- closing the case -----------------------------------------------------------------------------

def case_occurrences(cases):
    """{case pk: LMS occurrence id} for cases made from the LMS live register."""
    keys = {text((c.source_data or {}).get('attendance_key')): c.pk for c in cases}
    keys = {key: pk for key, pk in keys.items() if key.isdigit()}
    if not keys:
        return {}
    found = rows(LMS, '''SELECT id::text AS key, occurrence_id::text AS occurrence_id
        FROM curriculum.live_session_learner_attendance WHERE id::text = ANY(%s)''', [list(keys)])
    return {keys[row['key']]: text(row['occurrence_id']) for row in found if row['key'] in keys}


def matches(case, occurrence, absences):
    """The one absence this case is about, or None."""
    module = module_key((case.source_data or {}).get('module'))
    if occurrence:
        exact = [a for a in absences if a.occurrence_id == occurrence]
        if exact:
            return exact[0] if len(exact) == 1 else None
        # Another occurrence the same day is another lecture; only a one-off session without one can still fit.
        absences = [a for a in absences if not a.occurrence_id]
    fits = [a for a in absences if a.session_date == case.overdue_since and module and module_key(a.module) == module]
    return fits[0] if len(fits) == 1 else None


def apply(people):
    """Close the open missed-lecture cases of lectures marked as authorised absences. Returns how many closed."""
    if not ready():
        return 0
    pending = list(AuthorisedAbsence.objects.filter(cancelled_at=None, ticket=None))
    if not pending:
        return 0
    by_learner = defaultdict(list)
    for absence in pending:
        by_learner[email_key(absence.learner_email)].append(absence)

    def main(email):
        email = email_key(email)
        return people.aliases.get(email, email) if hasattr(people, 'aliases') else email

    cases = [case for case in CaseTicket.objects.filter(
        source_type='attendance', archived=False, overdue_since__in={a.session_date for a in pending}).exclude(status='resolved')
        if main(case.learner_email) in by_learner]
    occurrences = case_occurrences(cases)
    closed = 0
    for case in cases:
        absence = matches(case, occurrences.get(case.pk), by_learner[main(case.learner_email)])
        if absence is None:
            continue
        with transaction.atomic(using=DB):
            locked = CaseTicket.objects.select_for_update().get(pk=case.pk)
            held = AuthorisedAbsence.objects.select_for_update().get(pk=absence.pk)
            if locked.status == 'resolved' or held.cancelled_at or held.ticket_id:
                continue
            close(locked, None, held.added_role, AUTHORISED_ABSENCE,
                  {'note': held.note, 'reason': held.reason, 'authorised_absence_id': held.pk,
                   'coach_email': held.coach_email}, held.added_by)
            held.ticket, held.applied_at = locked, timezone.now()
            held.save(update_fields=['ticket', 'applied_at'])
            by_learner[main(case.learner_email)].remove(absence)
            closed += 1
    return closed

