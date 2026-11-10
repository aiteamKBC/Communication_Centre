"""The college email template: the booking email a specialist sends after a call, and the automatic reminders.

Only the coach's Bookings link that fits the case is offered: progress review and monthly coaching have their own
pages; a missed lecture's catch-up and anything else use the coach's support page (as "Book with coach" did).
A signature case has no link: the learner signs in the LMS. The specialist may reword the subject and the message;
the greeting, button and sign-off stay fixed. ``automatic`` words the email for a reminder sent without a call.
"""
from html import escape
from uuid import UUID

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import DatabaseError, IntegrityError, transaction
from django.utils import timezone

from . import email_settings, mailer
from .booking_links import booking_links
from .db import DB
from .models import CaseTicket, EmailDelivery, EmailQuota
from .rules import LONDON, email_key
from .lms_booking import DURATION, TITLES
from .services import Conflict, can_work, event

SUBJECT_MAX, MESSAGE_MAX = 180, 5000
# Case types with no booking email: employer and satisfaction calls, signatures (the learner signs in the LMS),
# tomorrow's appointment (already booked) and technical issues (support has the work).
NO_BOOKING_EMAIL = ('satisfaction', 'employer_feedback', 'learner_satisfaction', 'signature', 'reminder', 'tech_support')
SERVICES = {
    'pr': ('pr', 'Book your progress review', 'progress review'),
    'mcm': ('mcm', 'Book your monthly coaching session', 'monthly coaching session'),
}
SERVICES.update(pr_missed=SERVICES['pr'], mcm_missed=SERVICES['mcm'])
SUPPORT = ('support', 'Book a session with your coach', 'session')
CATCH_UP = ('support', 'Book your catch-up session', 'catch-up session')
HELP_LINE = 'Choose a time that suits you; the invitation follows by email.'
NO_LINK_LINE = 'Your coach will confirm a time with you.'
LOGO = 'https://kentbusinesscollege.org/email-assets/logo.png'
TEXT_STYLE = 'margin:0 0 14px;color:#4C4C4C;font-size:15px;line-height:1.6'


def _check(key, label, state, detail=''):
    return {'key': key, 'label': label, 'state': state, 'detail': detail}


def _data(ticket):
    return ticket.source_data if isinstance(ticket.source_data, dict) else {}


def employer_signature_missing(ticket):
    return ticket.source_type == 'signature' and bool(_data(ticket).get('employer_signature_missing'))


def recipient_for(ticket, role=''):
    return email_key(ticket.manager_email if employer_signature_missing(ticket) and role != 'learner' else ticket.learner_email)


def _when(ticket):
    return f'{ticket.overdue_since:%A %d %B %Y}' if ticket.overdue_since else ''


def service(ticket):
    """(Bookings link kind, button label, noun) for this case; None for a signature, which has nothing to book."""
    if ticket.source_type == 'signature':
        return None
    return CATCH_UP if ticket.source_type == 'attendance' else SERVICES.get(ticket.source_type, SUPPORT)


def _say(sentence, automatic):
    """A reminder states the reason; an email after a call recalls the conversation first."""
    if automatic:
        return sentence
    return f'Thank you for speaking with us today.\n\nAs we discussed, {sentence[0].lower()}{sentence[1:]}'


def defaults(ticket, automatic=False, recipient_role=''):
    """The case's link and default wording: (button label, url, help line, subject, message)."""
    coach, when = ticket.coach or 'your coach', _when(ticket)
    on = f' on {when}' if when else ''
    if ticket.source_type == 'signature':
        review = str(_data(ticket).get('review_type') or 'review').strip()
        if employer_signature_missing(ticket) and recipient_role != 'learner':
            employer = ticket.manager_name or 'the employer'
            return ('', '', '', f"Please sign {ticket.learner_name}'s {review}",
                    _say(f"{employer}, the employer signature for {ticket.learner_name}'s {review} is still missing. "
                         'Please open the review in the LMS and sign it, or reply to this email if you need help.', automatic))
        return ('', '', '', f'Please sign your {review}',
                _say(f'Your {review}{" from " + when if when else ""} is waiting for your signature. Please sign in '
                     'to the LMS and sign it, or reply to this email if you need help.', automatic))
    kind, label, noun = service(ticket)
    url = booking_links(ticket.coach).get(kind, '')
    if ticket.source_type == 'attendance':
        title = str(_data(ticket).get('module') or '').strip() or 'your lecture'
        return (label, url, HELP_LINE, f'Book your catch-up session for {title}',
                _say(f'You missed {title}{on}. Please book a catch-up session with {coach} so you do not fall '
                     'behind.', automatic))
    if ticket.source_type in ('pr_missed', 'mcm_missed'):
        return (label, url, HELP_LINE, f'Rebook your {noun}',
                _say(f'Your {noun}{on} did not go ahead. Please book a new time with {coach} using the button '
                     'below.', automatic))
    subject = f'Book your {noun} with Kent Business College'
    if automatic:
        overdue = 'is overdue' if ticket.source_type in ('pr', 'mcm') else 'is due'
        return (label, url, HELP_LINE, subject,
                f'Your {noun} {overdue}. Please book it with {coach} using the button below.')
    return (label, url, HELP_LINE, subject,
            f'Thank you for speaking with us today.\n\nAs agreed, please book your next {noun} with {coach} '
            'using the button below.')


def layout(subject, greeting, message, sender, button='', url='', help_line='', no_link_line='', buttons=()):
    """(text, html) in the college style: heading, greeting, message paragraphs, buttons, sign-off.

    ``button``/``url`` is the usual single call to action; ``buttons`` lists several (a survey's score links).
    """
    sender = sender or 'KBC Learner Support'
    buttons = list(buttons) or ([(button, url)] if url else [])
    if buttons:
        link_text = '\n'.join(f'{label}: {link}' for label, link in buttons) + (f'\n{help_line}' if help_line else '')
        action = ''.join(f'<p style="margin:14px 0 8px"><a href="{escape(link, quote=True)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;'
                         'background:#241453;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;'
                         f'padding:12px 22px;border-radius:6px">{escape(label)}</a></p>' for label, link in buttons)
        if help_line:
            action += f'<p style="margin:0 0 14px;color:#6B6B6B;font-size:13px;line-height:1.5">{escape(help_line)}</p>'
    else:
        link_text = no_link_line
        action = f'<p style="{TEXT_STYLE}">{escape(no_link_line)}</p>' if no_link_line else ''
    text = '\n\n'.join(part for part in (f'Hello {greeting},', message, link_text,
                                         f'Kind regards,\n{sender}\nKent Business College') if part)
    paragraphs = ''.join(f'<p style="{TEXT_STYLE}">{escape(part).replace(chr(10), "<br>")}</p>'
                         for part in message.split('\n\n') if part.strip())
    html = ('<!doctype html><html><body style="margin:0;padding:24px 0;background:#F9F4EC;font-family:Arial,sans-serif">'
            '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:auto;'
            'background:#ffffff;border-radius:8px"><tr><td style="padding:30px">'
            f'<img src="{LOGO}" alt="Kent Business College" width="180">'
            f'<h2 style="margin:24px 0 16px;color:#241453;font-size:20px">{escape(subject)}</h2>'
            f'<p style="{TEXT_STYLE}">Hello {escape(greeting)},</p>' + paragraphs + action
            + f'<p style="margin:24px 0 0;color:#4C4C4C;font-size:15px;line-height:1.6">Kind regards,<br>{escape(sender)}'
            '<br>Kent Business College</p></td></tr></table></body></html>')
    return text, html


def render(ticket, sender, subject=None, message=None, automatic=False, recipient_role=''):
    """Subject, plain text and HTML for this case; the specialist's wording replaces the defaults when given."""
    button, url, help_line, default_subject, default_message = defaults(ticket, automatic, recipient_role)
    subject = ' '.join(str(subject if subject is not None else default_subject).split())[:SUBJECT_MAX]
    message = str(message if message is not None else default_message).strip()[:MESSAGE_MAX]
    if not subject:
        raise ValueError('Enter a subject.')
    if not message:
        raise ValueError('Enter a message.')
    first = ((ticket.manager_name if employer_signature_missing(ticket) and recipient_role != 'learner' else ticket.learner_name) or '').split(' ')[0] or 'there'
    text, html = layout(subject, first, message, sender, button, url, help_line,
                        '' if ticket.source_type == 'signature' else NO_LINK_LINE)
    return {'subject': subject, 'message': message, 'text': text, 'html': html,
            'link': {'label': button, 'url': url}}


def readiness(ticket, recipient_role=''):
    """What stands between this draft and sending it: the email itself, then the sending setup."""
    checks = []
    try:
        target = recipient_for(ticket, recipient_role)
        validate_email(target)
        checks.append(_check('recipient', 'Employer email address' if employer_signature_missing(ticket) and recipient_role != 'learner' else 'Learner email address', 'ok', target))
    except ValidationError:
        checks.append(_check('recipient', 'Employer email address' if employer_signature_missing(ticket) and recipient_role != 'learner' else 'Learner email address', 'missing', 'No valid email on the case.'))

    button, url, *_ = defaults(ticket, recipient_role=recipient_role)
    checks.append(_check('link', f'{button} link', 'ok' if url or employer_signature_missing(ticket) else 'missing', url or (
        f'{ticket.coach} has no Microsoft Bookings link for this. Ask a manager to add it to the booking links.'
        if ticket.coach else 'The case has no coach, so there is no Bookings link.')))

    config = email_settings.current()
    live = config['email_mode'] == 'live'
    checks.append(_check('mode', 'Email sending switched on', 'ok' if live else 'warning',
                         'Live sending is on (Director → Settings).' if live else
                         'Dry run: Send records the email on the case but does not send it. '
                         'A director can switch to live in Settings.'))
    checks.append(_check('gateway', 'Microsoft 365 sending (no-reply mailbox)', 'ok' if mailer.configured() else 'missing',
                         f'Sends as {mailer.sender()}.' if mailer.configured() else f'Set {", ".join(mailer.missing())}.'))
    try:
        today = timezone.now().astimezone(LONDON).date()
        sent = EmailQuota.objects.filter(recipient=recipient_for(ticket, recipient_role), day=today).values_list('count', flat=True).first() or 0
        cap = max(0, config['daily_cap'])
        checks.append(_check('quota', 'Daily email limit for this learner', 'ok' if sent < cap else 'missing',
                             f'{sent} of {cap} emails sent today (limit set in Director → Settings).'))
    except DatabaseError:
        checks.append(_check('quota', 'Daily email limit for this learner', 'warning', 'Could not be checked.'))
    return checks


def delivery_result(delivery):
    return {'id': delivery.pk, 'status': delivery.status, 'mode': delivery.mode, 'recipient': delivery.recipient,
            'error': delivery.error}


def send(ticket_id, user, sender, data, acting_agent=None):
    """Send this case's booking email to the learner and record it on the case. Dry run records it only.

    The delivery is committed BEFORE Microsoft 365 is called, so a retry with the same request id returns it and an
    email is never sent twice. A crash or timeout after that leaves it 'sending'/'unknown' for a mailbox check.
    """
    try:
        request_id = str(UUID(str(data.get('request_id', ''))))
    except ValueError:
        raise ValueError('A valid email request ID is required.') from None
    key = f'booking-email:{ticket_id}:{request_id}'
    # durable=True: the external send can never sit inside a transaction that rolls back afterwards.
    with transaction.atomic(using=DB, durable=True):
        ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
        agent = can_work(ticket, user, acting_agent=acting_agent)
        if (ticket.source_type in NO_BOOKING_EMAIL and not employer_signature_missing(ticket)) or ticket.archived:
            raise ValueError('This case has no booking email.')
        recipient_role = str(data.get('recipient_role') or '')
        if recipient_role not in ('', 'learner', 'employer'):
            raise ValueError('Invalid email recipient.')
        draft = render(ticket, sender, data.get('subject'), data.get('message'), recipient_role=recipient_role)
        recipient = recipient_for(ticket, recipient_role)
        previous = EmailDelivery.objects.filter(dedupe_key=key).first()
        if previous:
            if previous.subject != draft['subject'] or previous.text != draft['text'] or previous.recipient != recipient:
                raise Conflict('This request ID was already used for another message.')
            return delivery_result(previous)
        try:
            validate_email(recipient)
        except ValidationError:
            raise ValueError('No valid email address is recorded for this learner.') from None
        config = email_settings.current()
        mode = config['email_mode']
        if mode == 'live' and not mailer.configured():
            raise Conflict(f"Email sending is not configured: {', '.join(mailer.missing())}.")
        if EmailDelivery.objects.filter(ticket=ticket, kind='booking_manual', status__in=['sending', 'unknown']).exists():
            raise Conflict('An earlier booking email has an uncertain result. Check Sent Items before sending again.')
        quota, _ = EmailQuota.objects.select_for_update().get_or_create(
            recipient=recipient, day=timezone.now().astimezone(LONDON).date())
        if quota.count >= max(0, config['daily_cap']):
            raise Conflict('The daily email limit for this learner has been reached.')
        quota.count += 1
        quota.save(update_fields=['count'])
        delivery = EmailDelivery.objects.create(
            ticket=ticket, dedupe_key=key, recipient=recipient, kind='booking_manual', mode=mode,
            status='dry_run' if mode == 'dry_run' else 'sending', subject=draft['subject'], html=draft['html'],
            text=draft['text'])
        actor = None if agent else user.get_username()
        event(ticket, 'email_dry_run' if mode == 'dry_run' else 'email_requested',
              {'delivery_id': delivery.pk, 'stage': 'booking', 'recipient': recipient, 'mode': mode}, agent, actor)
    if mode == 'dry_run':
        return delivery_result(delivery)
    try:
        mailer.send(recipient, delivery.subject, delivery.html)
        delivery.status, delivery.sent_at = 'accepted', timezone.now()
    except mailer.MailError as exc:
        delivery.status = 'unknown' if exc.uncertain else 'failed'
        delivery.error = ('Microsoft acceptance is uncertain. Check Sent Items before retrying.' if exc.uncertain
                          else 'Microsoft refused the email. Check the mail app permission and sender mailbox.')
    with transaction.atomic(using=DB):
        delivery.save(update_fields=['status', 'sent_at', 'error'])
        event(ticket, 'email_' + delivery.status,
              {'delivery_id': delivery.pk, 'stage': 'booking', 'recipient': recipient, 'mode': mode}, agent, actor)
    return delivery_result(delivery)


def confirmation(booked, session_type, lecture=''):
    """(subject, text, html) telling the learner what was booked from the Engagement Centre: with whom and when."""
    title = TITLES[session_type]
    start = booked['start'].astimezone(LONDON)
    when = f"{start:%A} {start.day} {start:%B %Y} at {start:%H:%M}"
    subject = f'Your {title.lower()} with {booked["coach"]} is booked'
    about = f' for {lecture}' if lecture else ''
    message = (f'Your {title.lower()}{about} with {booked["coach"]} is booked for {when} (UK time). '
               f'It lasts {DURATION} minutes.\n\nThe Microsoft Teams invitation has been sent to this email address. '
               f'If the time no longer works, please contact {booked["coach"]} before the session starts.')
    url = booked['join_url'] if str(booked.get('join_url') or '').startswith('https://') else ''
    first = (booked.get('learner_name') or '').split(' ')[0] or 'there'
    text, html = layout(subject, first, message, '', 'Join the Teams meeting', url)
    return subject, text, html


def send_confirmation(ticket_id, booked, session_type, agent=None, actor=None):
    """Email the learner that their session is booked, once per booking, and record it on the case.

    Runs after the booking is saved, so it can never undo or block it: the result is returned as a status and any
    problem is recorded on the delivery. Dry run records the email without sending it.
    """
    key = f'booking-confirmation:{booked["event_key"]}'
    recipient = email_key(booked.get('learner_email'))
    with transaction.atomic(using=DB):
        ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
        previous = EmailDelivery.objects.filter(dedupe_key=key).first()
        if previous:
            return delivery_result(previous)
        try:
            validate_email(recipient)
        except ValidationError:
            return {'status': 'skipped', 'recipient': recipient, 'error': 'No valid learner email on the booking.'}
        lecture = str(_data(ticket).get('module') or '').strip() if session_type == 'catch-up' else ''
        subject, text, html = confirmation(booked, session_type, lecture)
        mode = email_settings.current()['email_mode']
        if mode == 'live' and not mailer.configured():
            mode = 'dry_run'
        try:
            with transaction.atomic(using=DB):
                delivery = EmailDelivery.objects.create(
                    ticket=ticket, dedupe_key=key, recipient=recipient, kind='booking_confirmation', mode=mode,
                    status='dry_run' if mode == 'dry_run' else 'sending', subject=subject, html=html, text=text)
        except IntegrityError:
            return delivery_result(EmailDelivery.objects.get(dedupe_key=key))
        event(ticket, 'email_dry_run' if mode == 'dry_run' else 'email_requested',
              {'delivery_id': delivery.pk, 'stage': 'booking_confirmation', 'recipient': recipient, 'mode': mode},
              agent, actor)
    if mode == 'dry_run':
        return delivery_result(delivery)
    try:
        mailer.send(recipient, delivery.subject, delivery.html)
        delivery.status, delivery.sent_at = 'accepted', timezone.now()
    except mailer.MailError as exc:
        delivery.status = 'unknown' if exc.uncertain else 'failed'
        delivery.error = ('Microsoft acceptance is uncertain. Check Sent Items before retrying.' if exc.uncertain
                          else 'Microsoft refused the email. Check the mail app permission and sender mailbox.')
    with transaction.atomic(using=DB):
        delivery.save(update_fields=['status', 'sent_at', 'error'])
        event(ticket, 'email_' + delivery.status,
              {'delivery_id': delivery.pk, 'stage': 'booking_confirmation', 'recipient': recipient, 'mode': mode},
              agent, actor)
    return delivery_result(delivery)
