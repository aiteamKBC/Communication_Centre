"""Recall: call a case again now when its last call went unanswered, instead of waiting for its follow-up.

Saving No answer (nobody answered, a voicemail picked up, or Zoom never reported the call) holds the case until the
next working morning or the follow-up chosen. A held case stays off Today's Call next; from its list the specialist may
recall it, at most MAX_RECALLS times while it is held. Each recall is a Call press marked ``recall`` on the case's
``dial_requested`` event, so the tries are counted from the case's history and need no column of their own. An ordinary
call, once the case is due again, starts a fresh count.
"""
from django.db.models import F, Q

from .models import TicketEvent

MAX_RECALLS = 3
# The saved outcomes that set a case's follow-up: the latest says why the case is held.
FOLLOW_UP_KINDS = ('outcome', 'not_discussed', 'optional_outcome')
# Held after No answer the case is 'new'; a recall pressed on it claims it ('in_progress') without moving its follow-up.
HELD_STATUSES = ('new', 'in_progress')


def states(tickets, now):
    """{case id: {'used': tries, 'max': MAX_RECALLS}} for each case held after an unanswered call (its recalls used up
    or not). Cases that are due, or held for any other reason (a callback, a promise, proof), are left out."""
    held = [ticket.pk for ticket in tickets
            if ticket.status in HELD_STATUSES and ticket.next_followup_at and ticket.next_followup_at > now]
    if not held:
        return {}
    events = (TicketEvent.objects.filter(ticket_id__in=held, kind__in=(*FOLLOW_UP_KINDS, 'dial_requested'))
              # Since the case was last reopened, as the follow-up itself is (views.with_followup_agent).
              .filter(Q(ticket__evidence_after__isnull=True) | Q(created_at__gt=F('ticket__evidence_after')))
              .order_by('ticket_id', 'created_at', 'id').values_list('ticket_id', 'kind', 'data'))
    unanswered, used = {}, {}
    for pk, kind, data in events:
        data = data or {}
        if kind == 'dial_requested':
            used[pk] = used.get(pk, 0) + 1 if data.get('recall') else 0
        else:
            unanswered[pk] = kind == 'outcome' and data.get('outcome') == 'no_answer'
    return {pk: {'used': min(used.get(pk, 0), MAX_RECALLS), 'max': MAX_RECALLS} for pk, held_after in unanswered.items()
            if held_after}


def can_recall(state):
    return bool(state) and state['used'] < MAX_RECALLS
