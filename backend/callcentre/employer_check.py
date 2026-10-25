"""A progress review on the next working day is confirmed with the learner and with their employer (line manager).

The learner is confirmed on the reminder's call as before. The employer is a second step on the same reminder: the
specialist rings the line manager (their number comes from Aptem, through the learner directory) and records what they
said. The reminder cannot be resolved until the employer step has a final result; "no answer" is not one (try again,
or record that they could not be reached). Each result is kept on the case and in the review meeting's history.
"""
import logging
from urllib.parse import urlencode

from django.db import DatabaseError, transaction
from django.utils import timezone

from .db import DB
from .models import CaseTicket
from .rules import email_key, normalize_phone
from .services import Conflict, can_work, event

logger = logging.getLogger(__name__)

RESULTS = {
    'confirmed': 'Employer confirmed the review',
    'cannot_attend': 'Employer says the learner cannot attend',
    'no_answer': 'No answer from the employer',
    'not_reachable': 'Employer could not be reached',
    'no_manager': 'No line manager on record',
}
# A result that completes the step. After "no answer" the employer is tried again.
FINAL = set(RESULTS) - {'no_answer'}


def required(ticket):
    """Only next-day reminders of a progress review need the employer too."""
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    return ticket.source_type == 'reminder' and data.get('session_type') == 'pr'


def _check(ticket):
    return (ticket.source_data or {}).get('employer_check') or {}


def missing(ticket):
    return required(ticket) and _check(ticket).get('result') not in FINAL


def manager_phone(ticket):
    """The line manager's one phone number in Aptem, if they have one."""
    if not ticket.manager_email:
        return ''
    from .sources import cached_directory
    try:
        return cached_directory().manager_phones.get(email_key(ticket.manager_email), '')
    except Exception:   # the directory cannot be read now: the step still shows, without a number
        logger.warning('Line manager phone unavailable for case %s', ticket.pk)
        return ''


def state(ticket):
    """What a progress review reminder shows about the employer: who, how to reach them, and the result so far."""
    if not required(ticket):
        return None
    check = _check(ticket)
    result = check.get('result', '')
    return {'manager_name': ticket.manager_name, 'manager_email': ticket.manager_email, 'manager_phone': manager_phone(ticket),
            'result': result, 'label': RESULTS.get(result, ''), 'done': result in FINAL, 'note': check.get('note', ''),
            'by': check.get('by', ''), 'at': check.get('at'), 'tries': len(check.get('history') or [])}


@transaction.atomic(using=DB)
def record(ticket_id, user, result, note, acting_agent=None):
    """Record what the employer said about tomorrow's progress review."""
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if not required(ticket):
        raise Conflict('Only next-day progress reviews are confirmed with the employer.')
    if ticket.status == 'resolved' or ticket.archived:
        raise Conflict('This case is closed.')
    if result not in RESULTS:
        raise ValueError('Choose what the employer said.')
    note = str(note or '').strip()[:2000]
    if result in ('cannot_attend', 'not_reachable') and not note:
        raise ValueError('Say what happened, for the coach and the learner’s record.')
    who = agent.display_name if agent else (user.get_full_name() or user.get_username())
    entry = {'result': result, 'note': note, 'by': who, 'at': timezone.now().isoformat()}
    history = [*(_check(ticket).get('history') or []), entry][-20:]
    ticket.source_data = {**ticket.source_data, 'employer_check': {**entry, 'history': history}}
    ticket.save(update_fields=['source_data', 'updated_at'])
    event(ticket, 'employer_check', {'result': result, 'note': note, 'manager_email': ticket.manager_email},
          agent, None if agent else who)
    _audit(ticket, entry, agent)
    return state(ticket)


def _audit(ticket, entry, agent):
    """The review meeting's history shows the employer's answer too."""
    from . import review_meetings
    try:
        with transaction.atomic(using=DB):
            meeting = review_meetings.meeting_for(ticket)
            if meeting:
                review_meetings.record(meeting, 'employer_checked', {'result': entry['result'], 'note': entry['note'],
                                                                     'case_id': ticket.pk, 'manager': ticket.manager_email},
                                       entry['by'], agent)
    except DatabaseError:   # before review_meetings.sql has run
        logger.warning('Employer check of case %s not added to its review meeting', ticket.pk)


def dial(ticket_id, user, acting_agent=None):
    """Ring the line manager from Zoom Phone, with the specialist's own caller ID; recorded on the case."""
    ticket = CaseTicket.objects.get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if not agent:
        raise Conflict('Calls are made from a specialist’s own desk.')
    if not required(ticket):
        raise Conflict('Only next-day progress reviews are confirmed with the employer.')
    number = normalize_phone(manager_phone(ticket))
    if not number:
        raise ValueError('Aptem has no phone number for this line manager. Email them, or record that they could not be reached.')
    zoom_url = 'zoomphonecall://' + number
    caller_id = normalize_phone(agent.zoom_phone_number)
    if caller_id:
        zoom_url += '?' + urlencode({'callerid': caller_id})
    event(ticket, 'employer_dialled', {'number': number, 'manager_email': ticket.manager_email}, agent)
    return {'zoom_url': zoom_url, 'tel_url': 'tel:' + number, 'number': number}
