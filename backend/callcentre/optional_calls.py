"""Optional calls: an employer specialist may call any learner in the directory, at any time, when they choose to.

Each call opens a one-off case owned by the specialist (a ``manual`` case marked ``optional``), so the call is matched,
recorded and counted like any other, but it is never a task: nobody else sees it, it is not overdue, and the after-call
form closes it (a callback keeps it on the specialist's own list until then). The call is also linked to the
learner's open satisfaction review, if any, without taking it off the other agents' lists: feedback the specialist
gives on the call completes that review once Zoom reports the call answered. Feedback from a learner whose review is
already done for this period is kept with the call and changes no schedule.
"""
import uuid
from datetime import timedelta

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from .db import DB
from .employer_desk import SATISFACTION, optional, specialists
from .learner_satisfaction import clean_feedback
from .models import CaseTicket
from .rules import email_key
from .services import can_work, create_intent, event
from .sources import cached_directory, learner_directory


def require_caller(user, agent):
    """Optional calls are for the employer specialists (and a director operating one's desk)."""
    if not agent:
        raise PermissionDenied('Ask a manager to set up your agent profile before calling.')
    if agent.pk not in specialists():
        raise PermissionDenied('Calling any learner is for the employer specialists.')


def satisfaction_status():
    """Each learner's satisfaction review: due now (an open review) or done, with the last feedback."""
    status = {}
    reviews = CaseTicket.objects.filter(source_type=SATISFACTION).order_by('learner_email', '-created_at')
    for review in reviews.values('learner_email', 'status', 'source_data'):
        email = review['learner_email']
        if email in status:
            continue
        data = review['source_data'] if isinstance(review['source_data'], dict) else {}
        if review['status'] != 'resolved' and not data.get('eligible', True):
            continue   # set aside (not eligible now): no review to complete
        feedback = data.get('feedback') if isinstance(data.get('feedback'), dict) else {}
        status[email] = {'due': review['status'] != 'resolved',
                         'last_completed_at': data.get('last_completed_at') or None, 'score': feedback.get('score'),
                         'next_due_at': data.get('next_due_at') or None}
    return status


def directory():
    """Every learner in the directory, with their satisfaction review and how many open cases they have."""
    reviews = satisfaction_status()
    open_cases = dict(CaseTicket.objects.open().exclude(source_type='employer_feedback').values('learner_email')
                      .annotate(count=Count('pk')).values_list('learner_email', 'count'))
    # The cached directory (refreshed every 5 minutes) keeps the search quick; starting a call reads it fresh.
    people = sorted(cached_directory().values(), key=lambda p: (p['learner_name'].lower(), p['learner_email']))
    return [{'email': p['learner_email'], 'name': p['learner_name'], 'phone': p['learner_phone'], 'programme': p['programme'],
             'organisation': p['organisation'], 'coach': p['coach'], 'manager': p['manager_name'],
             'open_cases': open_cases.get(p['learner_email'], 0), 'satisfaction': reviews.get(p['learner_email'])}
            for p in people]


def start(agent, learner_email, actor):
    """Open the optional call's case and dial it; returns (case, intent)."""
    people = learner_directory()
    email = email_key(learner_email)
    if email not in people:
        raise ValueError('Choose a learner from the directory.')
    person = people[email]
    if not person['learner_phone']:
        raise ValueError('This learner has no phone number recorded.')
    now = timezone.now()
    with transaction.atomic(using=DB):
        case = CaseTicket.objects.create(**{
            **person, 'source_type': 'manual', 'risk': 'green', 'last_actor': agent.display_name,
            'reason_key': f'optional:{person["learner_email"]}:{uuid.uuid4()}',
            # Never overdue: the case closes when the call is saved.
            'due_at': now + timedelta(days=365),
            'source_data': {'title': 'Optional call', 'optional': True, 'agent_id': agent.pk, 'requested_by': agent.display_name,
                            'purpose': f'An optional call {agent.display_name} chose to make. Agree anything the learner needs.'},
        })
        event(case, 'created', {'source': 'optional', 'title': 'Optional call'}, agent, actor)
        intent = create_intent(case.pk, agent, actor=actor)
    return case, intent


@transaction.atomic(using=DB)
def extra_feedback(ticket_id, user, data, acting_agent=None):
    """Satisfaction feedback given on an optional call when the learner's review is already done for this period:
    kept with the call, it completes nothing and changes no schedule."""
    ticket = CaseTicket.objects.select_for_update().get(pk=ticket_id)
    agent = can_work(ticket, user, acting_agent=acting_agent)
    if not optional(ticket.source_data):
        raise ValueError('Extra feedback is recorded on an optional call.')
    fields = clean_feedback(data.get('score'), data.get('problem'), data.get('agreed_action'), data.get('note'))
    event(ticket, 'satisfaction_feedback_extra', fields, agent, None if agent else user.get_username())
