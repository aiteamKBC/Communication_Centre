from datetime import timedelta
from urllib.parse import urlparse

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from . import booking_email, email_settings, mailer, test_learner
from .db import DB
from .models import CaseTicket, EmailDelivery, EmailQuota, EmployerSatisfaction
from .rules import LONDON, email_key
from .services import event, release_fields


def survey_token(survey):
    return signing.dumps({'id': survey.pk, 'nonce': str(survey.nonce)}, salt='callcentre-survey')


SENDER = 'KBC Learner Support'
# What the line manager is told the learner's case is about.
CASE_TOPICS = {
    'attendance': 'a missed lecture', 'pr': 'an overdue progress review', 'mcm': 'an overdue monthly coaching meeting',
    'pr_missed': 'a missed progress review', 'mcm_missed': 'a missed monthly coaching meeting',
    'signature': 'a review waiting for their signature', 'otj': 'their off-the-job hours',
    'epa': 'their end-point assessment preparation', 'reminder': 'an upcoming session',
}


def reminder_day(age, days):
    """The latest reminder day this case age has reached, or None."""
    reached = [day for day in sorted(days) if day <= age]
    return reached[-1] if reached else None


def reminder_stage(age, days):
    """The learner email due at this case age: 'initial' on day 0, else 'day<N>' for the latest reminder day reached."""
    day = reminder_day(age, days)
    if day is None:
        return None
    return 'initial' if day == 0 else f'day{day}'


def render_email(ticket, kind):
    """(subject, text, html) for one automatic email on the college template (booking_email.layout).

    ``kind`` is the reminder stage ('initial', 'day<N>'), 'escalation' (to the line manager) or 'low_score'.
    """
    if kind == 'escalation':
        subject = f'Support needed for {ticket.learner_name}'
        message = (f'We have been trying to reach {ticket.learner_name} about '
                   f'{CASE_TOPICS.get(ticket.source_type, "their programme")} and have not been able to resolve it.\n\n'
                   'Please encourage them to contact Kent Business College or their coach as soon as possible.')
        text, html = booking_email.layout(subject, ticket.manager_name or 'there', message, SENDER)
        return subject, text, html
    if kind == 'low_score':
        subject = 'Thank you for your feedback'
        message = (f'Thank you for rating your experience with Kent Business College ({ticket.survey.score}/5). '
                   'A member of our management team will contact you to follow up.')
        text, html = booking_email.layout(subject, ticket.manager_name or 'there', message, SENDER)
        return subject, text, html
    reminder = '' if kind == 'initial' else 'Reminder: '
    if ticket.source_type == 'satisfaction':
        subject = f'{reminder}Your quarterly feedback for Kent Business College'
        origin = settings.CALLCENTRE_PUBLIC_URL
        buttons = []
        if urlparse(origin).scheme == 'https' and urlparse(origin).netloc:
            token = survey_token(ticket.survey)
            buttons = [(f'Rate {score}/5', f'{origin}/api/callcentre/survey/{token}/?score={score}') for score in range(1, 6)]
        message = 'Please rate your experience with Kent Business College from 1 (poor) to 5 (excellent).'
        text, html = booking_email.layout(subject, ticket.manager_name or 'there', message, SENDER, buttons=buttons,
                                          no_link_line='' if buttons else 'The survey link is not available yet.')
        return subject, text, html
    if ticket.source_type == 'reminder':
        start = ticket.booking_at.astimezone(LONDON).strftime('%A %d %B %Y at %H:%M')
        subject = f'{reminder}Your upcoming session with Kent Business College'
        message = (f'Your {ticket.source_data.get("session_type", "support")} session is on {start} (UK time). '
                   'Please confirm with your coach, or let us know if you need another time.')
        first = (ticket.learner_name or '').split(' ')[0] or 'there'
        text, html = booking_email.layout(subject, first, message, SENDER)
        return subject, text, html
    default_subject = booking_email.defaults(ticket, automatic=True)[3]
    draft = booking_email.render(ticket, SENDER, subject=reminder + default_subject, automatic=True)
    return draft['subject'], draft['text'], draft['html']


def send_ticket_email(ticket_id, stage):
    """Send (or, in dry run, record) one automatic email for a case.

    The delivery row is committed before Microsoft 365 is called, so a crash or a rollback after the send can
    never send it again: a row left as 'sending' is checked by hand against the no-reply Sent Items.
    """
    delivery = _record_delivery(ticket_id, stage)
    if delivery is None or delivery.mode != 'live':
        return delivery
    # Microsoft 365 (mailer.py). A timeout is indeterminate: never blindly retry and double-send.
    try:
        mailer.send(delivery.recipient, delivery.subject, delivery.html, cc=[delivery.cc] if delivery.cc else [])
        delivery.status, delivery.sent_at = 'accepted', timezone.now()
    except mailer.MailError as exc:
        delivery.status = 'unknown' if exc.uncertain else 'failed'
        delivery.error = (f'Delivery uncertain ({exc}); check the no-reply Sent Items before retrying.'
                          if exc.uncertain else f'{exc} Review before retrying.')[:500]
    delivery.save(update_fields=['status', 'error', 'sent_at'])
    event(delivery.ticket, 'email_' + delivery.status,
          {'delivery_id': delivery.pk, 'stage': stage, 'recipient': delivery.recipient, 'mode': delivery.mode})
    return delivery


@transaction.atomic(using=DB)
def _record_delivery(ticket_id, stage):
    """Check and record one email under the case lock; returns the delivery (live: still 'sending'), or None."""
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    # Learner satisfaction email has its own future Azure delivery path, never n8n.
    if ticket.source_type == 'learner_satisfaction':
        return None
    if (ticket.status == 'resolved' and stage != 'low_score') or ticket.archived:
        return None
    config = email_settings.current()
    mode = config['email_mode']
    if mode not in ('dry_run', 'live'):
        raise ValueError('The email mode must be dry_run or live.')
    key = f'{ticket.pk}:{stage}:{mode}'
    if ticket.evidence_after:
        key += ':' + ticket.evidence_after.isoformat()
    if EmailDelivery.objects.filter(dedupe_key=key).exists():
        return None
    recipient = email_key(ticket.manager_email if stage in ('escalation', 'low_score') else ticket.learner_email)
    try:
        validate_email(recipient)
    except ValidationError:
        if not ticket.events.filter(kind='email_blocked', data__stage=stage).exists():
            event(ticket, 'email_blocked', {'stage': stage, 'reason': 'Valid recipient missing.'})
        return None
    if ticket.source_type == 'satisfaction' and stage != 'low_score':
        if ticket.survey.expires_at <= timezone.now() or ticket.survey.responded_at:
            return None
        if mode == 'live' and (not settings.CALLCENTRE_PUBLIC_URL.startswith('https://')):
            return None
    day = timezone.now().astimezone(LONDON).date()
    quota, _ = EmailQuota.objects.get_or_create(recipient=recipient, day=day)
    quota = EmailQuota.objects.select_for_update().get(pk=quota.pk)
    if quota.count >= max(0, config['daily_cap']):
        return None
    subject, text, html = render_email(ticket, stage)
    cc = email_key(config['escalation_cc']) if stage in ('escalation', 'low_score') else ''
    if stage == 'low_score' and not cc:
        if not ticket.events.filter(kind='email_blocked', data__stage=stage).exists():
            event(ticket, 'email_blocked', {'stage': stage, 'reason': 'Internal escalation CC is not configured.'})
        return None
    if cc:
        validate_email(cc)
    if mode == 'live' and not mailer.configured():
        if not ticket.events.filter(kind='email_blocked', data__stage=stage).exists():
            event(ticket, 'email_blocked', {'stage': stage, 'reason': f'Email sending is not configured: {", ".join(mailer.missing())}.'})
        return None
    delivery = EmailDelivery.objects.create(ticket=ticket, dedupe_key=key, recipient=recipient, kind=stage,
        mode=mode, subject=subject, html=html, text=text, cc=cc, status='dry_run' if mode == 'dry_run' else 'sending')
    quota.count += 1
    quota.save(update_fields=['count'])
    if mode == 'dry_run':
        event(ticket, 'email_dry_run', {'delivery_id': delivery.pk, 'stage': stage, 'recipient': recipient, 'mode': mode})
    return delivery


def process_emails(limit=200):
    """Send the due reminder emails; does nothing unless the director has switched reminders on (Settings tab).

    Each open case of a chosen type gets one email per reminder day of its age. From the escalation day (or 3
    missed calls) the line manager is emailed and the case goes to a manager. The email mode still decides whether
    anything leaves the building (dry run records only).
    """
    config = email_settings.current()
    if not config['reminders_enabled']:
        return 0
    now = timezone.now()
    today = now.astimezone(LONDON).date()
    since = email_settings.sending_since(config) if config['email_mode'] == 'live' else None
    processed = 0
    escalate_day = max(0, config['escalate_day'])
    # Manager-requested calls are follow-ups by a specialist, not automated learner reminders.
    tickets = (CaseTicket.objects.open().filter(source_type__in=config['reminder_types']).exclude(source_type='manual')
               .exclude(reason_key=test_learner.KEY))
    for ticket in tickets.order_by('created_at').iterator():
        start = (ticket.evidence_after or ticket.created_at).astimezone(LONDON).date()
        age = (today - start).days
        # A stage that fell due before sending started is part of the backlog: it is not sent.
        fresh = lambda day: since is None or start + timedelta(days=day) >= since  # noqa: E731
        day = reminder_day(age, config['reminder_days'])
        stages = [reminder_stage(age, config['reminder_days'])] if day is not None and fresh(day) else []
        unreachable = ticket.status == 'unreachable' and (
            since is None or bool(ticket.last_contact_at and ticket.last_contact_at.astimezone(LONDON).date() >= since))
        if escalate_day and ((age >= escalate_day and fresh(escalate_day)) or unreachable):
            stages.append('escalation')
        for stage in stages:
            delivery = send_ticket_email(ticket.pk, stage)
            if delivery:
                processed += 1
                if stage == 'escalation':
                    with transaction.atomic(using=DB):
                        locked = CaseTicket.objects.select_for_update().get(pk=ticket.pk)
                        if locked.status != 'resolved' and not locked.escalated:
                            locked.escalated = True
                            locked.status = 'escalated'
                            release_fields(locked)
                            locked.save()
                            event(locked, 'escalated', {'reason': 'Reminder schedule exhausted', 'email_mode': delivery.mode})
            if processed >= limit:
                return processed
    for survey in EmployerSatisfaction.objects.filter(score__lte=2):
        if send_ticket_email(survey.ticket_id, 'low_score'):
            processed += 1
        if processed >= limit:
            break
    return processed
