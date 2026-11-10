"""Technical issues raised in the KBC technical support (help-desk) site, and their status.

A specialist raises a learner's technical issue during a call; the server creates the help-desk ticket for the
learner's email through the help desk's ticket form API (``POST /api/tickets``) and opens a ``tech_support`` case
holding the ticket number. The worker follows the ticket (``GET /api/tickets/<id>/chat-history``): once support
closes it, the case is due and the specialist calls the learner to confirm the issue is fixed.

The help desk is not changed: it has no integration login, so these are its public learner endpoints. The ticket
is created as the learner's own (the specialist is named in its description), and its status is checked, not
pushed. Only the server talks to the help desk; nothing the browser sends is used as the ticket's requester.
"""
import re
from datetime import timedelta

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .db import DB
from .models import CaseTicket
from .rules import add_workdays
from .services import event

# (connect, read) seconds. The help-desk server drops some new connections, so a failed connect is retried: nothing
# reached it, so even creating a ticket is safe to repeat. Once a request is sent it is never repeated.
TIMEOUT_SECONDS = (5, 15)
CONNECT_ATTEMPTS = 3
# The help desk's technical sub-categories a specialist may choose. Coverage tickets have their own flow there.
SUBCATEGORIES = ('LMS', 'Aptem', 'Teams', 'Others')
TICKET_ID = re.compile(r'^KBC-\d{6,}$')
CLOSED = 'Closed'
# Until support closes the ticket the case is waiting on them, not on the specialist: it is only due (and counts
# against the SLA) once the ticket is closed and the learner needs the confirmation call.
WAITING_DUE_DAYS = 365


class HelpdeskError(Exception):
    pass


def enabled():
    return bool(settings.CALLCENTRE_HELPDESK_URL)


def _request(method, path, **kwargs):
    if not enabled():
        raise HelpdeskError('Technical support is not connected. Set CALLCENTRE_HELPDESK_URL.')
    for attempt in range(CONNECT_ATTEMPTS):
        try:
            response = requests.request(method, settings.CALLCENTRE_HELPDESK_URL + path, timeout=TIMEOUT_SECONDS,
                                        allow_redirects=False, **kwargs)
            break
        except requests.ConnectTimeout:
            if attempt + 1 == CONNECT_ATTEMPTS:
                raise HelpdeskError('The technical support system could not be reached. Try again shortly.') from None
        except requests.RequestException:
            raise HelpdeskError('The technical support system did not answer. ' + (
                'The ticket may still have been created there: check with technical support before raising it again.'
                if method == 'POST' else 'Try again shortly.')) from None
    try:
        data = response.json()
    except ValueError:
        data = None
    if not isinstance(data, dict):
        raise HelpdeskError(f'The technical support system returned an unexpected response ({response.status_code}).')
    if response.status_code >= 400:
        message = str(data.get('message') or '').strip()[:300]
        raise HelpdeskError(message or f'The technical support system refused the request ({response.status_code}).')
    return data


def create_ticket(email, subcategory, inquiry):
    """Create a technical ticket for this learner; returns the help desk's ticket number (KBC-…)."""
    data = _request('POST', '/api/tickets', json={
        'email': email, 'category': 'Technical', 'technicalSubcategory': subcategory, 'inquiry': inquiry})
    public_id = str((data.get('ticket') or {}).get('id') or '')
    if not TICKET_ID.match(public_id):
        raise HelpdeskError('The technical support system did not return a ticket number.')
    return public_id, (data.get('ticket') or {})


def ticket_status(public_id):
    """{'status', 'reason'} of a ticket, from the help desk."""
    if not TICKET_ID.match(public_id):
        raise HelpdeskError('Invalid ticket number.')
    ticket = _request('GET', f'/api/tickets/{public_id}/chat-history').get('ticket') or {}
    status = str(ticket.get('status') or '')
    if not status:
        raise HelpdeskError('The technical support system did not return the ticket status.')
    return {'status': status, 'reason': str(ticket.get('statusReason') or '')}


def raise_issue(origin, agent, actor, subcategory, description, request_key):
    """Raise the learner of ``origin`` (a case the specialist may work) as a help-desk ticket and open a case for it.
    Returns (case, created). A repeated request key returns the case it already made, without a second ticket."""
    if subcategory not in SUBCATEGORIES:
        raise ValueError('Choose what the issue is with.')
    description = description.strip()
    if not 10 <= len(description) <= 3000:
        raise ValueError('Describe the issue in 10 to 3,000 characters.')
    if not origin.learner_email:
        raise ValueError('This contact has no email address, so a ticket cannot be raised for them.')
    existing = CaseTicket.objects.filter(source_type='tech_support', source_data__request_key=request_key).first()
    if existing:
        return existing, False
    inquiry = (f'{description}\n\nRaised by {agent.display_name} (KBC Engagement Centre) during a call with '
               f'{origin.learner_name or "the learner"}.')
    public_id, ticket = create_ticket(origin.learner_email, subcategory, inquiry)
    now = timezone.now()
    fields = {field: getattr(origin, field) for field in (
        'learner_email', 'learner_name', 'learner_phone', 'coach', 'organisation', 'programme', 'manager_name', 'manager_email')}
    with transaction.atomic(using=DB):
        case = CaseTicket.objects.create(
            **fields, source_type='tech_support', source_id=int(public_id.split('-')[1]),
            reason_key=f'tech_support:{public_id}', risk='amber', status='pending_verification', last_actor=actor,
            due_at=now + timedelta(days=WAITING_DUE_DAYS),
            source_data={
                'ticket': public_id, 'subcategory': subcategory, 'description': description, 'raised_by': agent.display_name,
                'raised_from_case': origin.pk, 'request_key': request_key,
                'helpdesk_status': str(ticket.get('status') or 'Open'), 'helpdesk_reason': '',
                'helpdesk_checked_at': now.isoformat(),
            })
        event(case, 'created', {'source': 'tech_support', 'ticket': public_id, 'subcategory': subcategory,
                                'description': description}, agent)
        event(origin, 'tech_issue_raised', {'ticket': public_id, 'case': case.pk}, agent)
    return case, True


def apply_status(case, status, reason, now):
    """Mirror the ticket's status on its locked case.

    Closed (newly): due for the confirmation call. Not closed: the case waits on support, so a call made meanwhile
    (missed, or answered with nothing to resolve yet) does not put it back on the list. A callback the specialist
    set, or a case someone is working on now, is left alone."""
    data = dict(case.source_data)
    was_closed = data.get('helpdesk_status') == CLOSED
    data.update({'helpdesk_status': status, 'helpdesk_reason': reason, 'helpdesk_checked_at': now.isoformat()})
    data.pop('helpdesk_error', None)
    case.source_data = data
    if status == CLOSED:
        if not was_closed:
            case.status, case.next_followup_at = 'new', None
            case.due_at, case.sla_breached = add_workdays(now, 2), False
            event(case, 'helpdesk_closed', {'ticket': data['ticket'], 'reason': reason})
    elif case.status in ('new', 'pending_verification') and not case.claimed_by_id:
        case.status, case.next_followup_at = 'pending_verification', None
        case.due_at, case.sla_breached = now + timedelta(days=WAITING_DUE_DAYS), False
        if was_closed:
            event(case, 'helpdesk_reopened', {'ticket': data['ticket'], 'status': status})
    case.save()


def sync():
    """Follow every open technical-issue case's ticket. Returns how many changed state."""
    if not enabled():
        return 'Not connected'
    changed, failed = 0, 0
    for pk in CaseTicket.objects.open().filter(source_type='tech_support').values_list('pk', flat=True):
        public_id = CaseTicket.objects.filter(pk=pk).values_list('source_data__ticket', flat=True).first() or ''
        try:
            found = ticket_status(public_id)
        except HelpdeskError as exc:
            failed += 1
            with transaction.atomic(using=DB):
                case = CaseTicket.objects.select_for_update().get(pk=pk)
                case.source_data = {**case.source_data, 'helpdesk_error': str(exc)}
                case.save(update_fields=['source_data', 'updated_at'])
            continue
        with transaction.atomic(using=DB):
            case = CaseTicket.objects.select_for_update().get(pk=pk)
            before = (case.status, case.source_data.get('helpdesk_status'))
            apply_status(case, found['status'], found['reason'], timezone.now())
            changed += before != (case.status, found['status'])
    return {'changed': changed, 'unavailable': failed}
