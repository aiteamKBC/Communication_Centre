from datetime import timedelta
from urllib.parse import urlparse

from django.conf import settings
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from . import booking_email, email_settings, mailer
from .db import DB
from .models import CaseTicket, EmailDelivery, EmailQuota, EmployerSatisfaction, TicketEvent
from .rules import LONDON, due_at, email_key
from .services import event, release_fields
from .sources import reason_key


def survey_token(survey):
    return signing.dumps({'id': survey.pk, 'nonce': str(survey.nonce)}, salt='callcentre-survey')


@transaction.atomic(using=DB)
def generate_surveys(people):
    now = timezone.now()
    today = now.astimezone(LONDON).date()
    quarter = f'{today.year}-Q{(today.month - 1) // 3 + 1}'
    managers = {}
    for person in people.values():
        email = email_key(person.get('manager_email'))
        try:
            validate_email(email)
        except ValidationError:
            continue
        managers.setdefault(email, []).append(person)
    issued = set(EmployerSatisfaction.objects.filter(quarter=quarter).values_list('manager_email', flat=True))
    existing = {c.reason_key: c for c in CaseTicket.objects.filter(source_type='satisfaction')}
    new, pending = [], []
    for email, learners in managers.items():
        if email in issued:
            continue
        key = reason_key('satisfaction', email, quarter)
        case = existing.get(key)
        if not case:
            case = CaseTicket(learner_email=email, learner_name=learners[0]['manager_name'] or email,
                organisation=', '.join(sorted({p['organisation'] for p in learners}))[:255],
                manager_email=email, manager_name=learners[0]['manager_name'], source_type='satisfaction',
                reason_key=key, due_at=due_at('satisfaction', now),
                source_data={'quarter': quarter, 'learner_count': len(learners)})
            new.append(case)
        pending.append((email, case))
    CaseTicket.objects.bulk_create(new, batch_size=200)
    TicketEvent.objects.bulk_create([TicketEvent(ticket=case, kind='created', data={'quarter': quarter}) for case in new], batch_size=200)
    EmployerSatisfaction.objects.bulk_create([EmployerSatisfaction(ticket=case, manager_email=email,
        quarter=quarter, organisation=case.organisation, expires_at=now + timedelta(days=30)) for email, case in pending], batch_size=200)
    return len(managers)


SENDER = 'KBC Learner Support'
# What the line manager is told the learner's case is about.
CASE_TOPICS = {
    'attendance': 'a missed lecture', 'pr': 'an overdue progress review', 'mcm': 'an overdue monthly coaching meeting',
    'pr_missed': 'a missed progress review', 'mcm_missed': 'a missed monthly coaching meeting',
    'signature': 'a review waiting for their signature', 'otj': 'their off-the-job hours',
    'epa': 'their end-point assessment preparation', 'reminder': 'an upcoming session',
}


def reminder_stage(age, days):
    """The learner email due at this case age: 'initial' on day 0, else 'day<N>' for the latest reminder day reached."""
    reached = [day for day in days if day <= age]
    if not reached:
        return None
    return 'initial' if reached[-1] == 0 else f'day{reached[-1]}'


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


@transaction.atomic(using=DB)
def send_ticket_email(ticket_id, stage):
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
    if mode == 'live':
        # Microsoft 365 (mailer.py). A timeout is indeterminate: never blindly retry and double-send.
        try:
            mailer.send(recipient, subject, html, cc=[cc] if cc else [])
            delivery.status, delivery.sent_at = 'accepted', timezone.now()
        except mailer.MailError as exc:
            delivery.status = 'unknown' if exc.uncertain else 'failed'
            delivery.error = (f'Delivery uncertain ({exc}); check the no-reply Sent Items before retrying.'
                              if exc.uncertain else f'{exc} Review before retrying.')[:500]
        delivery.save(update_fields=['status', 'error', 'sent_at'])
    event(ticket, 'email_' + delivery.status, {'delivery_id': delivery.pk, 'stage': stage, 'recipient': recipient, 'mode': mode})
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
    processed = 0
    escalate_day = max(0, config['escalate_day'])
    # Manager-requested calls are follow-ups by a specialist, not automated learner reminders.
    tickets = CaseTicket.objects.open().filter(source_type__in=config['reminder_types']).exclude(source_type='manual')
    for ticket in tickets.order_by('created_at').iterator():
        age = (now.astimezone(LONDON).date() - (ticket.evidence_after or ticket.created_at).astimezone(LONDON).date()).days
        stages = [stage for stage in [reminder_stage(age, config['reminder_days'])] if stage]
        if escalate_day and (age >= escalate_day or ticket.status == 'unreachable'):
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
