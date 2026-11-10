"""Absences the learner reported in the LMS (Report Absence, on the web or the app), read only.

A pending or approved report for the exact lecture closes its missed-lecture case as soon as it is made (``apply``,
run by the cycle straight after the cases are made), the same as an authorised absence, so nobody calls about a
lecture the learner has already explained. A declined report is ignored. So is a report with a catch-up linked:
catchup.py follows that booking, and its no-show, instead.

The LMS keeps a report in two places (learner_api.absence_reports):

* ``"Coach".coach_absence_report``, every report with the coach's decision, keyed by its lecture
  (learner_api.attendance_lectures ``report_id``, the hash in lms_booking ``kbc_report_id``): a legacy
  ``kbc_attendance`` register key, or ``<learner id>:teams:<session>`` for an LMS live lecture, where the session is
  the occurrence, or ``<occurrence>:<module>`` when the lecture is shared from another module;
* ``curriculum.live_session_absences``, only for LMS live lectures, one row per occurrence and learner profile: the
  same pair as the live register row the case was made from. It holds the recovery choice but never the decline.

**A case from the LMS live register** needs its ``live_session_absences`` row. The report hashed to that lecture then
decides; when none is found by the hash, the case closes only if none of the learner's reports that day is declined
or has a catch-up, since that one may be this lecture's. **A case from the legacy register** matches its register
keys hashed the same way. Either way the report names the learner (one of their emails, or the live row's source
learner id when the LMS left the email blank) and the lecture's date.

A case closed this way keeps ``lms_absence_report`` in its data, so one a manager reopens is not closed again.
"""
from django.db import transaction

from .db import DB, LMS
from .lms_booking import kbc_report_id
from .models import CaseTicket
from .rules import LMS_ABSENCE_REPORT, MISSED_LECTURES_SINCE, email_key
from .services import close
from .sources import rows


def live_ids(learner_id, attendance):
    """The report ids the LMS gives this learner's LMS live lecture."""
    occurrence, module = attendance['occurrence_id'], attendance['module_catalogue_id']
    sessions = [occurrence] + ([f'{occurrence}:{module}'] if module else [])
    return {kbc_report_id(f'{learner_id}:teams:{session}') for session in sessions}


def counts(report):
    return report['status'] in ('pending', 'approved') and not report['catchup_event_key']


def record(report=None, attendance=None):
    """What the closed case keeps of the report."""
    return {'report_id': report['id'] if report else None,
            'ledger_id': attendance['absence_id'] if attendance else None,
            'status': report['status'] if report else 'reported',
            'reason_category': (report['reason_category'] or '') if report else ''}


def live_report(case, emails, attendance, reports):
    """For a case from the LMS live register: what the learner reported for it, or None."""
    if attendance['absence_id'] is None or attendance['recovery_method'] == 'catch-up':
        return None
    learner = attendance['source_learner_id']
    mine = [r for r in reports if r['session_date'] == case.overdue_since and r['learner_id'] == learner
            and (not r['learner_email'] or email_key(r['learner_email']) in emails)]
    ids = live_ids(learner, attendance)
    exact = [r for r in mine if r['attendance_id'] in ids]
    if exact:
        return record(exact[0], attendance) if counts(exact[0]) else None
    return None if any(not counts(r) for r in mine) else record(None, attendance)


def legacy_report(case, emails, register_keys, reports):
    """For a case from the legacy register: what the learner reported for it, or None."""
    ids = {kbc_report_id(key) for key in register_keys}
    found = [r for r in reports if r['session_date'] == case.overdue_since and r['attendance_id'] in ids
             and email_key(r['learner_email']) in emails]
    return record(found[0]) if found and counts(found[0]) else None


def apply(people):
    """Close the open missed-lecture cases of lectures the learner reported missing in the LMS. Returns how many."""
    cases = [case for case in CaseTicket.objects.filter(source_type='attendance', archived=False,
                                                        overdue_since__gte=MISSED_LECTURES_SINCE).exclude(status='resolved')
             if not (case.source_data or {}).get('lms_absence_report')]
    if not cases:
        return 0

    def emails_of(case):
        person = people.resolve(email=case.learner_email) if hasattr(people, 'resolve') else None
        return set(person['emails']) if person else {email_key(case.learner_email)}

    emails = {case.pk: emails_of(case) for case in cases}
    every_email = sorted({e for found in emails.values() for e in found})
    days = sorted({case.overdue_since for case in cases})

    keys = sorted({str((c.source_data or {}).get('attendance_key') or '') for c in cases} - {''})
    live = {str(r['key']): r for r in rows(LMS, '''SELECT la.id::text AS key, la.occurrence_id::text AS occurrence_id,
            la.module_catalogue_id::text AS module_catalogue_id, lower(trim(la.learner_email)) AS email,
            (o.scheduled_start)::date AS day, a.id AS absence_id, a.source_learner_id, a.recovery_method
        FROM curriculum.live_session_learner_attendance la
        JOIN curriculum.live_session_occurrences o ON o.id = la.occurrence_id
        LEFT JOIN curriculum.live_session_absences a
          ON a.occurrence_id = la.occurrence_id AND a.learner_profile_id = la.learner_profile_id
        WHERE la.id::text = ANY(%s)''', [keys])} if keys else {}
    learner_ids = sorted({r['source_learner_id'] for r in live.values() if r['source_learner_id'] is not None})
    reports = rows(LMS, '''SELECT id, attendance_id, learner_id, learner_email, session_date, status, reason_category,
            catchup_event_key
        FROM "Coach".coach_absence_report
        WHERE session_date = ANY(%s) AND (lower(trim(learner_email)) = ANY(%s) OR learner_id = ANY(%s))''',
                   [days, every_email, learner_ids])
    if not reports and not any(r['absence_id'] for r in live.values()):
        return 0
    registers = rows(DB, '''SELECT "key", lower(trim("Email")) AS email, "date", "module" FROM public.kbc_attendance
        WHERE lower(trim("Email")) = ANY(%s) AND "date" = ANY(%s)''', [every_email, days])

    closed = 0
    for case in cases:
        data = case.source_data or {}
        attendance = live.get(str(data.get('attendance_key') or ''))
        # The live register row must be this learner's lecture that day; otherwise the key is a legacy register's.
        if attendance is not None and attendance['email'] in emails[case.pk] and attendance['day'] == case.overdue_since:
            found = live_report(case, emails[case.pk], attendance, reports)
        else:
            module = str(data.get('module') or '').strip()
            register_keys = {str(r['key']) for r in registers if r['key'] and r['email'] in emails[case.pk]
                             and r['date'] == case.overdue_since and str(r['module'] or '').strip() == module}
            found = legacy_report(case, emails[case.pk], register_keys, reports)
        if found is None:
            continue
        with transaction.atomic(using=DB):
            locked = CaseTicket.objects.select_for_update().get(pk=case.pk)
            if locked.status == 'resolved' or (locked.source_data or {}).get('lms_absence_report'):
                continue
            locked.source_data = {**(locked.source_data or {}), 'lms_absence_report': found}
            close(locked, None, 'system', LMS_ABSENCE_REPORT,
                  {'note': f"The learner reported this absence in the LMS ({found['status']}).", **found})
            closed += 1
    return closed
