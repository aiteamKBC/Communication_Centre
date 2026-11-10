"""What each specialist worked on their desk today, for the director's view of their lists: every case with a result
saved today by that specialist (any outcome, or closed or feedback completed). The screens put each case on its list
with the same rules as the specialist's Today page (model.ts categoryFor), so the numbers match what they see.

Resolved cases leave the overview, so what was finished can only come from the case events.
"""
from datetime import datetime, time, timedelta

from .booking_email import employer_signature_missing
from .models import TicketEvent
from .rules import LONDON, contact_key

# A result saved on a case: the call's outcome (or "not discussed"), an optional call, a close, or feedback completed.
WORKED = ('outcome', 'not_discussed', 'optional_outcome', 'resolved', 'learner_feedback_completed',
          'employer_feedback_completed')


def worked(day):
    """[{agent_id, case_id, ...}] for ``day`` (London): one row per specialist and case, with the last result saved."""
    lower = datetime.combine(day, time.min, tzinfo=LONDON)
    upper = lower + timedelta(days=1)
    today = TicketEvent.objects.filter(created_at__gte=lower, created_at__lt=upper, agent__isnull=False)
    # The task a call was made for, when a director had given the case to this specialist.
    tasks = {(item['agent_id'], item['ticket_id']): item['data'].get('task_id')
             for item in today.filter(kind='dial_requested').values('agent_id', 'ticket_id', 'data')
             if isinstance(item['data'], dict) and item['data'].get('task_id')}
    rows = {}
    for item in today.filter(kind__in=WORKED).select_related('ticket').order_by('created_at', 'id'):
        ticket, data = item.ticket, item.data if isinstance(item.data, dict) else {}
        key = (item.agent_id, ticket.pk)
        row = rows.setdefault(key, {
            'agent_id': item.agent_id, 'case_id': ticket.pk, 'learner_name': ticket.learner_name,
            'learner_email': ticket.learner_email, 'contact_key': contact_key(ticket), 'source_type': ticket.source_type,
            'booking_at': ticket.booking_at, 'employer_signature_missing': employer_signature_missing(ticket),
            'learner_signature_missing': bool((ticket.source_data or {}).get('learner_signature_missing')),
            'task_id': tasks.get(key), 'outcome': '', 'resolved': False, 'at': None})
        row['at'] = item.created_at
        if item.kind == 'resolved':
            row['resolved'] = True
        elif item.kind in ('outcome', 'optional_outcome'):
            row['outcome'] = str(data.get('outcome') or '')
        elif item.kind == 'not_discussed':
            row['outcome'] = 'not_discussed'
        else:
            row['outcome'] = 'feedback'
        row['status'] = ticket.status
    return list(rows.values())
