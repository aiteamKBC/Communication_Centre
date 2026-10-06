"""The college email template: the booking email a specialist sends after a call, and the automatic reminders.

Only the coach's Bookings link that fits the case is offered: progress review and monthly coaching have their own
pages; a missed lecture's catch-up and anything else use the coach's support page (as "Book with coach" did).
A signature case has no link: the learner signs in the LMS. The specialist may reword the subject and the message;
the greeting, button and sign-off stay fixed. ``automatic`` words the email for a reminder sent without a call.
"""
from html import escape

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import DatabaseError
from django.utils import timezone

from . import email_settings, mailer
from .booking_links import booking_links
from .models import EmailQuota
from .rules import LONDON, email_key

SUBJECT_MAX, MESSAGE_MAX = 180, 5000
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


def defaults(ticket, automatic=False):
    """The case's link and default wording: (button label, url, help line, subject, message)."""
    coach, when = ticket.coach or 'your coach', _when(ticket)
    on = f' on {when}' if when else ''
    if ticket.source_type == 'signature':
        review = str(_data(ticket).get('review_type') or 'review').strip()
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
        action = ''.join(f'<p style="margin:14px 0 8px"><a href="{escape(link, quote=True)}" style="display:inline-block;'
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


def render(ticket, sender, subject=None, message=None, automatic=False):
    """Subject, plain text and HTML for this case; the specialist's wording replaces the defaults when given."""
    button, url, help_line, default_subject, default_message = defaults(ticket, automatic)
    subject = ' '.join(str(subject if subject is not None else default_subject).split())[:SUBJECT_MAX]
    message = str(message if message is not None else default_message).strip()[:MESSAGE_MAX]
    if not subject:
        raise ValueError('Enter a subject.')
    if not message:
        raise ValueError('Enter a message.')
    first = (ticket.learner_name or '').split(' ')[0] or 'there'
    text, html = layout(subject, first, message, sender, button, url, help_line,
                        '' if ticket.source_type == 'signature' else NO_LINK_LINE)
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

    config = email_settings.current()
    live = config['email_mode'] == 'live'
    checks.append(_check('mode', 'Email sending switched on', 'ok' if live else 'missing',
                         'Live sending is on (Director → Settings).' if live else
                         'Emails are recorded only (dry run). A director can switch to live in Settings.'))
    checks.append(_check('gateway', 'Microsoft 365 sending (no-reply mailbox)', 'ok' if mailer.configured() else 'missing',
                         f'Sends as {mailer.sender()}.' if mailer.configured() else f'Set {", ".join(mailer.missing())}.'))
    try:
        today = timezone.now().astimezone(LONDON).date()
        sent = EmailQuota.objects.filter(recipient=email_key(ticket.learner_email), day=today).values_list('count', flat=True).first() or 0
        cap = max(0, config['daily_cap'])
        checks.append(_check('quota', 'Daily email limit for this learner', 'ok' if sent < cap else 'missing',
                             f'{sent} of {cap} emails sent today (limit set in Director → Settings).'))
    except DatabaseError:
        checks.append(_check('quota', 'Daily email limit for this learner', 'warning', 'Could not be checked.'))
    checks.append(_check('send', 'Send button in the call centre', 'missing',
                         'Not built yet: needs your go-ahead to send through the gateway and record it on the case.'))
    return checks
