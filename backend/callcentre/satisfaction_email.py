"""Explicit, audited satisfaction emails. Never completes a review or schedules a reminder."""
from uuid import UUID

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from . import email_settings, mailer
from .booking_email import layout
from .db import DB
from .models import CaseTicket, EmailDelivery, EmailQuota
from .rules import LONDON
from .services import Conflict, can_work, event


def contact(ticket):
    if ticket.source_type not in ('learner_satisfaction', 'satisfaction'):
        raise ValueError('This email is only for satisfaction cases.')
    employer = ticket.source_type == 'satisfaction'
    address = ticket.manager_email if employer else ticket.learner_email
    name = ticket.manager_name if employer else ticket.learner_name
    return str(address or '').strip().lower(), name or 'there'


def check_open(ticket):
    if (ticket.archived or ticket.status == 'resolved'
            or (ticket.source_type == 'learner_satisfaction' and not ticket.source_data.get('eligible'))):
        raise Conflict('This satisfaction case is closed or no longer eligible.')


def valid_address(address):
    try:
        validate_email(address)
    except ValidationError:
        return False
    return True


def draft(ticket):
    recipient, name = contact(ticket)
    check_open(ticket)
    config = email_settings.current()
    reason = ''
    if not valid_address(recipient):
        reason = 'No valid email address is recorded for this contact.'
    elif not mailer.configured():
        reason = 'Microsoft 365 email is not configured.'
    elif config['email_mode'] != 'live':
        reason = 'Email is in dry-run mode. A director must enable live sending in Settings.'
    else:
        quota = EmailQuota.objects.filter(recipient=recipient, day=timezone.now().astimezone(LONDON).date()).first()
        if config['daily_cap'] <= (quota.count if quota else 0):
            reason = 'The daily email limit for this contact has been reached.'
    kind = 'employer' if ticket.source_type == 'satisfaction' else 'learner'
    return {
        'recipient': recipient, 'name': name, 'sender': mailer.sender(),
        'subject': f'KBC: {kind} satisfaction follow-up',
        'message': ('We would like to hear about your experience with Kent Business College. '
                    'What is going well, what could we improve, and is there any support you need?\n\n'
                    'Please contact your coach or the college with your feedback or a convenient time to speak. '
                    'Please do not reply to this no-reply mailbox.'),
        'can_send': not reason, 'reason': reason,
    }


def result(delivery):
    return {'id': delivery.pk, 'status': delivery.status, 'recipient': delivery.recipient,
            'error': delivery.error}


def send(ticket_id, user, data, acting_agent=None):
    """Commit the reservation BEFORE calling Graph; retries return it, never send twice.

    A crash/timeout after reservation remains sending/unknown and needs mailbox review.
    No automatic retry can duplicate a message whose acceptance is uncertain.
    """
    try:
        request_id = str(UUID(str(data.get('request_id', ''))))
    except ValueError:
        raise ValueError('A valid email request ID is required.') from None
    subject, message = data.get('subject'), data.get('message')
    if not isinstance(subject, str) or not 1 <= len(subject.strip()) <= 180 or '\n' in subject or '\r' in subject:
        raise ValueError('Enter a subject of 1 to 180 characters, on one line.')
    if not isinstance(message, str) or not 1 <= len(message.strip()) <= 5000:
        raise ValueError('Enter a message of 1 to 5,000 characters.')
    subject, message = subject.strip(), message.strip()
    key = f'satisfaction-email:{ticket_id}:{request_id}'
    # durable=True also prevents a caller from wrapping the external send in a rollback-able transaction.
    with transaction.atomic(using=DB, durable=True):
        ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
        agent = can_work(ticket, user, acting_agent=acting_agent)
        recipient, name = contact(ticket)
        text, html = layout(subject, name, message, mailer.SENDER_NAME)
        previous = EmailDelivery.objects.filter(dedupe_key=key).first()
        if previous:
            if previous.subject != subject or previous.text != text or previous.recipient != recipient:
                raise Conflict('This request ID was already used for another message.')
            return result(previous)
        check_open(ticket)
        if not valid_address(recipient):
            raise ValueError('No valid email address is recorded for this contact.')
        config = email_settings.current()
        if config['email_mode'] != 'live' or not mailer.configured():
            raise Conflict('Live Microsoft 365 email sending is not enabled.')
        # Block another click (including reopening the dialog) while acceptance is uncertain.
        if EmailDelivery.objects.filter(ticket=ticket, kind='satisfaction_manual', status__in=['sending', 'unknown']).exists():
            raise Conflict('An earlier email has an uncertain result. Check Sent Items before sending again.')
        quota, _ = EmailQuota.objects.select_for_update().get_or_create(
            recipient=recipient, day=timezone.now().astimezone(LONDON).date())
        if quota.count >= config['daily_cap']:
            raise Conflict('The daily email limit for this contact has been reached.')
        quota.count += 1
        quota.save(update_fields=['count'])
        delivery = EmailDelivery.objects.create(
            ticket=ticket, dedupe_key=key, recipient=recipient, kind='satisfaction_manual', mode='live',
            status='sending', subject=subject, html=html, text=text)
        event(ticket, 'email_requested', {'delivery_id': delivery.pk, 'recipient': recipient},
              agent, user.get_username())
    try:
        mailer.send(recipient, subject, html)
        delivery.status, delivery.sent_at = 'accepted', timezone.now()
    except mailer.MailError as exc:
        delivery.status = 'unknown' if exc.uncertain else 'failed'
        delivery.error = ('Microsoft acceptance is uncertain. Check Sent Items before retrying.' if exc.uncertain
                          else 'Microsoft refused the email. Check the mail app permission and sender mailbox.')
    with transaction.atomic(using=DB):
        delivery.save(update_fields=['status', 'sent_at', 'error'])
        event(ticket, 'email', {'delivery_id': delivery.pk, 'status': delivery.status, 'recipient': recipient},
              agent, user.get_username())
    return result(delivery)
