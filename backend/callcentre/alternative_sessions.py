"""Missed lectures: the same session with another group of the learner's cohort, read-only from the LMS.

A cohort can run one module in parallel groups (a copy per group, often named by its weekday: "Martech - Thur" /
"Martech - Fri"). The same session number of the same module in another group of the same programme and cohort is
the same lecture, so a learner who missed it can attend it there: the call guide suggests it, and the case keeps it
when the learner says they will go (rules.OTHER_GROUP closes the case). The matching rules are the LMS's own
(``learner_api/alternative_recovery.py`` in the LMS): when anything is ambiguous, no session is offered.

Only missed lectures from the LMS live-session register have a session to match (their ``attendance_key`` is the
register row ``curriculum.live_session_learner_attendance.id``); the legacy kbc_attendance register has none.
"""
import re
from collections import defaultdict
from datetime import timezone as dt_timezone

from django.utils import timezone

from .db import LMS
from .models import CaseTicket
from .sources import rows

INACTIVE = {'cancelled', 'canceled', 'deleted', 'failed', 'superseded'}
# " - Thur", " (Fri)", " Monday" ... at the end of a module title.
WEEKDAY_SUFFIX = re.compile(
    r'(?:\s*[-–—]\s*|\s+\(?)(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)\)?$')


def utc(moment):
    """The LMS stores session times as UTC without a time zone (``timestamp``), as its own code reads them."""
    return moment.replace(tzinfo=dt_timezone.utc) if timezone.is_naive(moment) else moment


def active(status):
    return str(status or '').strip().casefold() not in INACTIVE


def module_key(title):
    """One name for a module's copies across groups: without a trailing " copy" or weekday."""
    key = ' '.join(str(title or '').split()).casefold()
    key = key[:-5].rstrip() if key.endswith(' copy') else key
    return WEEKDAY_SUFFIX.sub('', key).rstrip()


def usable(module):
    return bool(module and not module['is_programme_deleted'] and module['programme_id'] and module['cohort_id']
                and module['group_id'])


def other_group_series(series, module, modules, cohort_series):
    """Group id -> (module, series) of the one active series each other group runs for this module. Nothing when the
    learner's own module has more than one active series, and no group that runs more than one."""
    own = [s for s in cohort_series if s['module_catalogue_id'] == module['module_catalogue_id'] and active(s['status'])]
    key = module_key(module['title'] or series['module_title'])
    if not key or len(own) != 1 or own[0]['id'] != series['id']:
        return {}
    copies = {m['module_catalogue_id']: m for m in modules
              if m['group_id'] != module['group_id'] and module_key(m['title']) == key}
    by_group = defaultdict(list)
    for item in cohort_series:
        copy = copies.get(item['module_catalogue_id'])
        if copy and active(item['status']):
            by_group[copy['group_id']].append((copy, item))
    return {group: pairs[0] for group, pairs in by_group.items() if len(pairs) == 1}


def missed_sessions(cases):
    """Case pk -> the LMS occurrence the case is about, with its series and module. Matched on the register row named
    by the case and checked against the case's lecture date and module, so a legacy register key is never mistaken
    for an LMS row."""
    keys = {str(c.source_data.get('attendance_key') or '').strip(): c for c in cases}
    keys = {key: case for key, case in keys.items() if key.isdigit()}
    if not keys:
        return {}
    found = rows(LMS, '''SELECT la.id::text AS key, (o.scheduled_start)::date AS day,
            COALESCE(NULLIF(trim(m.title), ''), la.module_catalogue_id) AS module,
            o.id AS occurrence_id, o.session_number, o.status AS occurrence_status,
            s.id AS series_id, s.status AS series_status, s.module_catalogue_id, s.module_title
        FROM curriculum.live_session_learner_attendance la
        JOIN curriculum.live_session_occurrences o ON o.id = la.occurrence_id
        JOIN curriculum.live_sessions s ON s.id = o.live_session_id
        LEFT JOIN curriculum.modules m ON m.module_catalogue_id = la.module_catalogue_id
        WHERE la.attendance_status = 'absent' AND la.id::text = ANY(%s)''', [list(keys)])
    missed = {}
    for row in found:
        case = keys.get(row['key'])
        if (case and row['day'] == case.overdue_since
                and str(row['module'] or '').strip() == str(case.source_data.get('module') or '').strip()
                and row['session_number'] is not None and active(row['occurrence_status']) and active(row['series_status'])):
            missed[case.pk] = row
    return missed


def alternatives(cases, now=None):
    """Case pk -> the earliest session still ahead with another group: ``occurrence_id``, ``starts_at``, ``group``.
    Cases with none are left out."""
    now = now or timezone.now()
    missed = missed_sessions(cases)
    if not missed:
        return {}
    module_rows = rows(LMS, '''SELECT module_catalogue_id, programme_id, cohort_id, group_id, group_name, title,
            is_programme_deleted FROM curriculum.modules
        WHERE deleted_at IS NULL AND module_catalogue_id = ANY(%s)''', [list({m['module_catalogue_id'] for m in missed.values()})])
    own_module = {m['module_catalogue_id']: m for m in module_rows}
    contexts = {pk: (row, own_module.get(row['module_catalogue_id'])) for pk, row in missed.items()}
    contexts = {pk: context for pk, context in contexts.items() if usable(context[1])}
    if not contexts:
        return {}
    cohorts = {(module['programme_id'], module['cohort_id']) for _row, module in contexts.values()}
    modules = [m for m in rows(LMS, '''SELECT module_catalogue_id, programme_id, cohort_id, group_id, group_name, title
            FROM curriculum.modules
        WHERE deleted_at IS NULL AND NOT is_programme_deleted AND coalesce(group_id, '') <> ''
          AND programme_id = ANY(%s) AND cohort_id = ANY(%s)''',
                                 [list({c[0] for c in cohorts}), list({c[1] for c in cohorts})])
               if (m['programme_id'], m['cohort_id']) in cohorts]
    series = rows(LMS, '''SELECT id, module_catalogue_id, status, module_title FROM curriculum.live_sessions
        WHERE module_catalogue_id = ANY(%s)''', [list({m['module_catalogue_id'] for m in modules})]) if modules else []
    by_cohort = defaultdict(lambda: ([], []))
    cohort_of = {m['module_catalogue_id']: (m['programme_id'], m['cohort_id']) for m in modules}
    for m in modules:
        by_cohort[cohort_of[m['module_catalogue_id']]][0].append(m)
    for item in series:
        by_cohort[cohort_of[item['module_catalogue_id']]][1].append(item)

    matched = {}
    for pk, (row, module) in contexts.items():
        cohort_modules, cohort_series = by_cohort[(module['programme_id'], module['cohort_id'])]
        found = other_group_series({'id': row['series_id'], 'module_title': row['module_title']}, module,
                                   cohort_modules, cohort_series)
        if found:
            matched[pk] = found
    if not matched:
        return {}
    candidates = rows(LMS, '''SELECT id, live_session_id, session_number, scheduled_start, status
        FROM curriculum.live_session_occurrences
        WHERE live_session_id = ANY(%s) AND session_number = ANY(%s) AND scheduled_start > %s
        ORDER BY scheduled_start, id''', [list({pair[1]['id'] for found in matched.values() for pair in found.values()}),
                                         list({contexts[pk][0]['session_number'] for pk in matched}), now])
    result = {}
    for pk, found in matched.items():
        group_of = {pair[1]['id']: pair[0] for pair in found.values()}
        number = contexts[pk][0]['session_number']
        first = next((o for o in candidates if o['session_number'] == number and o['live_session_id'] in group_of
                      and active(o['status'])), None)
        if first:
            module = group_of[first['live_session_id']]
            result[pk] = {'occurrence_id': str(first['id']), 'starts_at': utc(first['scheduled_start']),
                          'group': str(module['group_name'] or module['group_id']).strip()}
    return result


def refresh_alternative_sessions(now=None):
    """Store each open missed lecture's session with another group (or clear it when there is none still ahead).
    A closed case keeps what it had when it closed, e.g. the session the learner said they would attend.
    Returns how many cases changed. A failed LMS read raises, so nothing is cleared on an outage."""
    now = now or timezone.now()
    cases = list(CaseTicket.objects.filter(source_type='attendance', archived=False).exclude(status='resolved'))
    found = alternatives(cases, now)
    changed = 0
    for case in cases:
        match = found.get(case.pk)
        values = {'alternative_occurrence_id': match['occurrence_id'] if match else '',
                  'alternative_session_at': match['starts_at'] if match else None,
                  'alternative_group': match['group'][:255] if match else ''}
        if any(getattr(case, field) != value for field, value in values.items()):
            CaseTicket.objects.filter(pk=case.pk).update(**values)
            changed += 1
    return changed
