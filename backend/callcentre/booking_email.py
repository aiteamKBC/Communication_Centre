"""The booking email a specialist sends a learner after a call: one template, the case's own link, a readiness check.

Only the coach's Bookings link that fits the case is offered: progress review and monthly coaching have their own
pages; a missed lecture's catch-up and anything else use the coach's support page (as "Book with coach" did).
The specialist may reword the subject and the message; the greeting, button and sign-off stay fixed.
"""
from html import escape
from urllib.parse import urlparse

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import DatabaseError
from django.utils import timezone

from .booking_links import booking_links
from .models import EmailQuota
from .rules import LONDON, email_key

SUBJECT_MAX, MESSAGE_MAX = 180, 5000
SERVICES = {
    'pr': ('pr', 'Book your progress review', 'progress review'),
    'mcm': ('mcm', 'Book your monthly coaching session', 'monthly coaching session'),
}
SUPPORT = ('support', 'Book a session with your coach', 'session')
CATCH_UP = ('support', 'Book your catch-up session', 'catch-up session')


def _https(url):
    parts = urlparse(url or '')
    return parts.scheme == 'https' and bool(parts.netloc)


def _check(key, label, state, detail=''):
    return {'key': key, 'label': label, 'state': state, 'detail': detail}


def _lecture(ticket):
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    title = str(data.get('module') or '').strip() or 'your lecture'
    when = f'{ticket.overdue_since:%A %d %B %Y}' if ticket.overdue_since else ''
    return title, when


def service(ticket):
    """(Bookings link kind, button label, noun) for this case."""
    return CATCH_UP if ticket.source_type == 'attendance' else SERVICES.get(ticket.source_type, SUPPORT)


def defaults(ticket):
    """The case's link and default wording: (button label, url, help line, subject, message)."""
    coach = ticket.coach or 'your coach'
    kind, label, noun = service(ticket)
    url = booking_links(ticket.coach).get(kind, '')
    help_line = 'Choose a time that suits you; the invitation follows by email.'
    if ticket.source_type == 'attendance':
        title, when = _lecture(ticket)
        return (label, url, help_line, f'Book your catch-up session for {title}',
                f'Thank you for speaking with us today.\n\nAs we discussed, you missed {title}'
                + (f' on {when}' if when else '') + f'. Please book a catch-up session with {coach} '
                'so you do not fall behind.')
    return (label, url, help_line, f'Book your {noun} with Kent Business College',
            f'Thank you for speaking with us today.\n\nAs agreed, please book your next {noun} with {coach} '
            'using the button below.')


def render(ticket, sender, subject=None, message=None):
    """Subject, plain text and HTML for this case; the specialist's wording replaces the defaults when given."""
    button, url, help_line, default_subject, default_message = defaults(ticket)
    subject = ' '.join(str(subject if subject is not None else default_subject).split())[:SUBJECT_MAX]
    message = str(message if message is not None else default_message).strip()[:MESSAGE_MAX]
    if not subject:
        raise ValueError('Enter a subject.')
    if not message:
        raise ValueError('Enter a message.')
    first = (ticket.learner_name or '').split(' ')[0] or 'there'
    sender = sender or 'KBC Learner Support'
    link_text = f'{button}: {url}\n{help_line}' if url else 'Your coach will confirm a time with you.'
    text = f'Hello {first},\n\n{message}\n\n{link_text}\n\nKind regards,\n{sender}\nKent Business College'
    paragraphs = ''.join(f'<p style="margin:0 0 14px;color:#4C4C4C;font-size:15px;line-height:1.6">'
                         f'{escape(part).replace(chr(10), "<br>")}</p>' for part in message.split('\n\n') if part.strip())
    action = (f'<p style="margin:22px 0 8px"><a href="{escape(url, quote=True)}" style="display:inline-block;'
              'background:#241453;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;'
              f'border-radius:6px">{escape(button)}</a></p>'
              f'<p style="margin:0 0 14px;color:#6B6B6B;font-size:13px;line-height:1.5">{escape(help_line)}</p>'
              if url else '<p style="margin:0 0 14px;color:#4C4C4C;font-size:15px">Your coach will confirm a time with you.</p>')
    html = ('<!doctype html><html><body style="margin:0;padding:24px 0;background:#F9F4EC;font-family:Arial,sans-serif">'
            '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:auto;'
            'background:#ffffff;border-radius:8px"><tr><td style="padding:30px">'
            '<img src="https://kentbusinesscollege.org/email-assets/logo.png" alt="Kent Business College" width="180">'
            f'<h2 style="margin:24px 0 16px;color:#241453;font-size:20px">{escape(subject)}</h2>'
            f'<p style="margin:0 0 14px;color:#4C4C4C;font-size:15px">Hello {escape(first)},</p>'
            + paragraphs + action
            + f'<p style="margin:24px 0 0;color:#4C4C4C;font-size:15px;line-height:1.6">Kind regards,<br>{escape(sender)}'
            '<br>Kent Business College</p></td></tr></table></body></html>')
    return {'subject': subject, 'message': message, 'text': text, 'html': html,
            'link': {'label': button, 'url': url}}


def readiness(ticket):
    """What stands between this draft and sending it: the email itself, then the sending setup."""
    checks = []
    try:
        validate_email(email_key(ticket.learner_email))
        checks.append(_check('recipient', 'Learner email address', 'ok', ticket.learner_email))
    except ValidationError:
        checks.append(_check('recipient', 'Learner email address', 'missing', 'No valid email on the case.'))

    button, url, *_ = defaults(ticket)
    checks.append(_check('link', f'{button} link', 'ok' if url else 'missing', url or (
        f'{ticket.coach} has no Microsoft Bookings link for this. Ask a manager to add it to the booking links.'
        if ticket.coach else 'The case has no coach, so there is no Bookings link.')))

    live = settings.CALLCENTRE_EMAIL_MODE == 'live'
    checks.append(_check('mode', 'Email sending switched on', 'ok' if live else 'missing',
                         'CALLCENTRE_EMAIL_MODE is live.' if live else
                         f'CALLCENTRE_EMAIL_MODE is “{settings.CALLCENTRE_EMAIL_MODE}”; set it to live.'))
    gateway = _https(settings.N8N_EMAIL_WEBHOOK)
    checks.append(_check('gateway', 'Email gateway (n8n)', 'ok' if gateway else 'missing',
                         'N8N_EMAIL_WEBHOOK is set.' if gateway else 'N8N_EMAIL_WEBHOOK is not set to an https address.'))
    try:
        today = timezone.now().astimezone(LONDON).date()
        sent = EmailQuota.objects.filter(recipient=email_key(ticket.learner_email), day=today).values_list('count', flat=True).first() or 0
        cap = max(0, settings.CALLCENTRE_EMAIL_DAILY_CAP)
        checks.append(_check('quota', 'Daily email limit for this learner', 'ok' if sent < cap else 'missing',
                             f'{sent} of {cap} emails sent today (CALLCENTRE_EMAIL_DAILY_CAP).'))
    except DatabaseError:
        checks.append(_check('quota', 'Daily email limit for this learner', 'warning', 'Could not be checked.'))
    checks.append(_check('send', 'Send button in the call centre', 'missing',
                         'Not built yet: needs your go-ahead to send through the gateway and record it on the case.'))
    return checks
