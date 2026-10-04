from datetime import datetime, time

from django.utils import timezone

from .aptem_summaries import normalize_attendance_value, parse_date_safe
from .db import APTEM, DB
from .rules import LONDON, email_key, parse_moment
from .sources import rows


def evidence_cutoff(ticket):
    return ticket.evidence_after or ticket.created_at


class EvidenceSnapshot:
    """Read each evidence source once per cycle; never treat a failed load as empty success."""
    def __init__(self, tickets):
        self.attendance, self.reviews, self.errors = {}, {}, {}
        categories = {t.source_type for t in tickets}
        if 'attendance' in categories:
            since = min(evidence_cutoff(t).astimezone(LONDON).date() for t in tickets if t.source_type == 'attendance')
            try:
                data = rows(DB, '''SELECT "ID", "Email", "module", "date", "Attendance"
                    FROM public.kbc_attendance WHERE "date" > %s AND "date" <= %s ORDER BY "date" DESC''',
                    [since, timezone.now().astimezone(LONDON).date()])
                for row in data:
                    self.attendance.setdefault((email_key(row['Email']), row['module']), []).append(row)
            except Exception as exc:
                self.errors['attendance'] = type(exc).__name__
        for category, table, column in [('pr', 'progress_review', 'Last Actually Completed PR'), ('mcm', 'MCR', 'Last Actually Completed  MCM')]:
            if category not in categories:
                continue
            try:
                data = rows(APTEM, f'SELECT "ID", "Email", "{column}" AS completed FROM public."{table}"')
                for row in data:
                    self.reviews.setdefault((category, email_key(row['Email'])), []).append(row)
            except Exception as exc:
                self.errors[category] = type(exc).__name__


def valid_evidence(ticket, evidence):
    if not isinstance(evidence, dict) or evidence.get('ambiguous') or not evidence.get('source_ok'):
        return False
    if email_key(evidence.get('learner_email')) != ticket.learner_email:
        return False
    allowed = {
        'attendance': {'attendance_present'}, 'pr': {'pr_booking', 'pr_completed'},
        'mcm': {'mcm_booking', 'mcm_completed'}, 'otj': set(), 'epa': set(),
        'reminder': {'session_attended'}, 'satisfaction': {'survey_response'},
    }
    if evidence.get('kind') not in allowed[ticket.source_type] or not evidence.get('table') or not evidence.get('row_key'):
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
    # Completion dates in Aptem are the only evidence source; dashboard bookings were not ported.
    category = ticket.source_type
    table, column = ('progress_review', 'Last Actually Completed PR') if category == 'pr' else ('MCR', 'Last Actually Completed  MCM')
    if snapshot:
        if category in snapshot.errors:
            raise ValueError('Review completion evidence unavailable.')
        result = snapshot.reviews.get((category, ticket.learner_email), [])
    else:
        result = rows(APTEM, f'SELECT "ID", "{column}" AS completed FROM public."{table}" WHERE LOWER(TRIM("Email")) = %s',
                      [ticket.learner_email])
    if len(result) != 1:
        return None
    completed = parse_date_safe(result[0]['completed'])
    if not completed or completed <= evidence_cutoff(ticket).astimezone(LONDON).date():
        return None
    return proof(ticket, category + '_completed', table, result[0]['ID'],
                 datetime.combine(completed, time.min, tzinfo=LONDON), {'completed': completed.isoformat()})


def reminder_evidence(ticket, snapshot=None):
    # Existing sources cannot yet establish exact appointment attendance safely.
    return None


def undated_status_evidence(ticket, snapshot=None):
    # OTJ/EPA snapshots have no trustworthy transition timestamp; require human approval.
    return None


def satisfaction_evidence(ticket, snapshot=None):
    survey = getattr(ticket, 'survey', None)
    if survey and survey.responded_at:
        return proof(ticket, 'survey_response', 'callcenter_satisfaction', survey.pk, survey.responded_at, {'score': survey.score})
    return None


CHECKS = {'attendance': attendance_evidence, 'pr': review_evidence, 'mcm': review_evidence,
          'otj': undated_status_evidence, 'epa': undated_status_evidence,
          'reminder': reminder_evidence, 'satisfaction': satisfaction_evidence,
          # A manager's request closes only when a specialist resolves it.
          'manual': lambda ticket, snapshot=None: None}


def check_evidence(ticket, snapshot=None):
    return CHECKS[ticket.source_type](ticket, snapshot)
