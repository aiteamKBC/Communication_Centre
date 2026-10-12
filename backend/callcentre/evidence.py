from datetime import datetime, time

from django.utils import timezone

from . import lms_reviews
from .aptem_summaries import normalize_attendance_value
from .db import DB, LMS
from .rules import LONDON, REVIEW_CATEGORIES, email_key, parse_moment
from .sources import rows, source_transaction


def evidence_cutoff(ticket):
    return ticket.evidence_after or ticket.created_at


class EvidenceSnapshot:
    """Read each evidence source once per cycle; never treat a failed load as empty success."""
    def __init__(self, tickets):
        self.attendance, self.review_states, self.errors = {}, {}, {}
        categories = {t.source_type for t in tickets}
        if 'attendance' in categories:
            since = min(evidence_cutoff(t).astimezone(LONDON).date() for t in tickets if t.source_type == 'attendance')
            try:
                data = rows(DB, '''SELECT "ID", "Email", "module", "date", "Attendance"
                    FROM public.kbc_attendance WHERE "date" > %s AND "date" <= %s ORDER BY "date" DESC''',
                    [since, timezone.now().astimezone(LONDON).date()])
                from .identity import enabled
                from .sources import cached_directory
                people = cached_directory() if enabled() else None
                if people is not None and (not hasattr(people, 'resolve') or not people.sources_complete):
                    raise ValueError('Identity source unavailable for attendance verification.')
                for row in data:
                    email = email_key(row['Email'])
                    if people is not None:
                        person = people.resolve('aptem', row['ID'], email)
                        if not person:
                            continue
                        for alias in person['emails']:
                            self.attendance.setdefault((alias, row['module']), []).append(row)
                    else:
                        self.attendance.setdefault((email, row['module']), []).append(row)
            except Exception as exc:
                self.errors['attendance'] = type(exc).__name__
        refs = [ref for t in tickets if t.source_type in REVIEW_CATEGORIES for ref in t.source_data.get('review_refs', [])]
        if refs:
            try:
                with source_transaction(LMS):
                    self.review_states = lms_reviews.ref_states(refs)
            except Exception as exc:
                for category in REVIEW_CATEGORIES:
                    self.errors[category] = type(exc).__name__


def valid_evidence(ticket, evidence):
    if not isinstance(evidence, dict) or evidence.get('ambiguous') or not evidence.get('source_ok'):
        return False
    if email_key(evidence.get('learner_email')) != ticket.learner_email:
        return False
    allowed = {
        'attendance': {'attendance_present'}, 'pr': {'pr_completed'}, 'mcm': {'mcm_completed'},
        'pr_missed': {'pr_completed'}, 'mcm_missed': {'mcm_completed'}, 'signature': {'review_signed'},
        'otj': set(), 'epa': set(),
        'reminder': {'session_attended'}, 'satisfaction': {'survey_response'},
    }
    if evidence.get('kind') not in allowed.get(ticket.source_type, set()) or not evidence.get('table') or not evidence.get('row_key'):
        return False
    try:
        observed = parse_moment(evidence['date'])
        return evidence_cutoff(ticket) < observed <= timezone.now()
    except (ValueError, TypeError, KeyError):
        return False


def proof(ticket, kind, table, key, when, value):
    result = {'source_ok': True, 'ambiguous': False, 'learner_email': ticket.learner_email,
              'kind': kind, 'table': table, 'row_key': str(key), 'date': when.isoformat(), 'value': value}
    return result if valid_evidence(ticket, result) else None


def attendance_evidence(ticket, snapshot=None):
    if ticket.source_data.get('catchup_booking'):
        return session_attendance_evidence(ticket, catchup=True)
    if ticket.source_data.get('catchup_no_show'):
        return None  # Attendance at another lecture cannot complete this task.
    from .identity import enabled
    if snapshot is None and enabled():
        snapshot = EvidenceSnapshot([ticket])
    module = ticket.source_data.get('module')
    if not module:
        return None
    since = max(evidence_cutoff(ticket).astimezone(LONDON).date(), ticket.overdue_since or ticket.created_at.date())
    if snapshot:
        if 'attendance' in snapshot.errors:
            raise ValueError('Attendance evidence unavailable.')
        data = [r for r in snapshot.attendance.get((ticket.learner_email, module), []) if r['date'] > since]
    else:
        data = rows(DB, '''SELECT "ID", "date", "Attendance" FROM public.kbc_attendance
        WHERE LOWER(TRIM("Email")) = %s AND "module" = %s AND "date" > %s AND "date" <= %s
        ORDER BY "date" DESC''',
        [ticket.learner_email, module, since,
         timezone.now().astimezone(LONDON).date()])
    # Conflicting attendance rows for the same day are not sufficient proof.
    for row in data:
        same_day = [r for r in data if r['date'] == row['date']]
        if all(normalize_attendance_value(r['Attendance']) == 1 for r in same_day):
            return proof(ticket, 'attendance_present', 'kbc_attendance', row['ID'],
                         datetime.combine(row['date'], time.min, tzinfo=LONDON), {'module': module, 'attendance': 1})
    return None


def review_evidence(ticket, snapshot=None):
    """A review on the case is done in the LMS: completed, or for a signature case, signed off."""
    refs = ticket.source_data.get('review_refs') or []
    if not refs:
        return None
    if snapshot:
        if ticket.source_type in snapshot.errors:
            raise ValueError('LMS review evidence unavailable.')
        states = snapshot.review_states
    else:
        with source_transaction(LMS):
            states = lms_reviews.ref_states(refs)
    kind = 'review_signed' if ticket.source_type == 'signature' else ticket.source_type.split('_')[0] + '_completed'
    from .identity import enabled
    if enabled() and not all(ref in states and lms_reviews.done(ticket.source_type, states[ref]) for ref in refs):
        return None
    for ref in refs:
        state = states.get(ref)
        if state and lms_reviews.done(ticket.source_type, state):
            # When the LMS recorded it: a completion date can predate the case (an Aptem meeting imported later).
            moments = [parse_moment(value) for value in (state.get('completed'), state.get('updated_at')) if value]
            table = 'Learner.reviews' if ref.startswith('reviews:') else 'curriculum.review_instances'
            return proof(ticket, kind, table, ref, max(moments, default=timezone.now()), {'status': state.get('status')})
    return None


def reminder_evidence(ticket, snapshot=None):
    if ticket.source_data.get('booking_source') != 'Learner.coach_calendar_event':
        return None
    return session_attendance_evidence(ticket)


def session_attendance_evidence(ticket, catchup=False):
    """Proof from an exact calendar FK AND actual learner attendance, never booking status."""
    from .sources import cached_directory
    booking = ticket.source_data.get('catchup_booking') or {}
    key = booking.get('event_key') if catchup else ticket.source_data.get('booking_id')
    if not key or (catchup and (booking.get('link_warning') or not booking.get('lms_report_id'))):
        return None
    people = cached_directory()
    if not hasattr(people, 'resolve') or not people.sources_complete:
        return None
    person = people.resolve(email=ticket.learner_email)
    if not person:
        return None
    data = rows(LMS, '''SELECT e.id, e.learner_id, e.learner_email, e.event_type, e.status,
            e.scheduled_date, e.scheduled_time, a.id AS attendance_id, a.email AS participant_email,
            a.attended, a.updated_at
        FROM "Learner".coach_calendar_event e JOIN "Coach".coach_meeting_attendance a
            ON a.calendar_event_id = e.id
        WHERE e.event_key = %s AND a.role = 'learner' AND a.is_current IS TRUE''', [key])
    # Duplicate/conflicting attendance is not proof. Teacher rows are excluded by role AND email.
    matched = [r for r in data if people.calendar_person(r) is person
               and email_key(r['participant_email']) in person['emails']]
    if not matched or any(r['attended'] is not True or r['status'] == 'cancelled' for r in matched):
        return None
    if catchup:
        reports = rows(LMS, '''SELECT learner_email, catchup_event_key FROM "Coach".coach_absence_report
            WHERE id = %s AND status = 'approved' ''', [booking['lms_report_id']])
        if (len(reports) != 1 or reports[0]['catchup_event_key'] != key
                or email_key(reports[0]['learner_email']) not in person['emails']
                or any(r['event_type'] != 'catch-up' for r in matched)):
            return None
    row = matched[0]
    if not row['scheduled_date'] or not row['scheduled_time'] or not row['updated_at']:
        return None
    scheduled = datetime.combine(row['scheduled_date'], row['scheduled_time'], LONDON)
    if scheduled > timezone.now() or scheduled <= evidence_cutoff(ticket):
        return None
    return proof(ticket, 'attendance_present' if catchup else 'session_attended',
                 'Coach.coach_meeting_attendance', row['attendance_id'], row['updated_at'],
                 {'calendar_id': row['id'], 'event_key': key, 'attended': True})


def undated_status_evidence(ticket, snapshot=None):
    # OTJ/EPA snapshots have no trustworthy transition timestamp; require human approval.
    return None


def satisfaction_evidence(ticket, snapshot=None):
    survey = getattr(ticket, 'survey', None)
    if survey and survey.responded_at:
        return proof(ticket, 'survey_response', 'callcenter_satisfaction', survey.pk, survey.responded_at, {'score': survey.score})
    return None


CHECKS = {'attendance': attendance_evidence, 'pr': review_evidence, 'mcm': review_evidence,
          'pr_missed': review_evidence, 'mcm_missed': review_evidence, 'signature': review_evidence,
          'otj': undated_status_evidence, 'epa': undated_status_evidence,
          'reminder': reminder_evidence, 'satisfaction': satisfaction_evidence,
          # A manager's request closes only when a specialist resolves it.
          'manual': lambda ticket, snapshot=None: None,
          'learner_satisfaction': lambda ticket, snapshot=None: None,
          'employer_feedback': lambda ticket, snapshot=None: None}


def check_evidence(ticket, snapshot=None):
    return CHECKS[ticket.source_type](ticket, snapshot)
