"""Everything done with one learner (or employer contact), across all their cases, open or closed: for Full case.

Calls (with their recordings and the AI's rating, to play and read in place), what each call recorded on each case,
the cases' history, and the missed calls and voicemails the person left. A specialist sees the missed calls they would
see on their own desk; a director sees them all.
"""
from django.db.models import Q
from django.utils import timezone

from .call_log import recordings_of
from .call_scope import system_case_calls
from .models import CaseCall, CaseTicket, TicketEvent
from .rules import email_key, same_contact

CALLS = 40
EVENTS = 80
MISSED = 20


def contact_cases(ticket):
    """The person's cases, newest first (the same contact as ``rules.same_contact``)."""
    query = same_contact(ticket) if ticket.learner_email else Q(pk=ticket.pk)
    return list(CaseTicket.objects.filter(query).order_by('-created_at').values_list('pk', 'source_type')[:300])


def history(ticket, user, agent, now=None):
    now = now or timezone.now()
    cases = contact_cases(ticket)
    ids = [pk for pk, _ in cases]
    labels = {pk: CaseTicket(source_type=kind).get_source_type_display() for pk, kind in cases}
    calls = {}
    links = (system_case_calls(CaseCall.objects.filter(ticket_id__in=ids)).select_related('match__call', 'match__agent')
             .order_by('-match__call__started_at', 'ticket_id'))
    for link in links:
        call = link.match.call
        if call.pk not in calls and len(calls) >= CALLS:
            continue
        item = calls.setdefault(call.pk, {
            'call': call, 'call_id': call.pk, 'started_at': call.started_at, 'result': call.result, 'direction': call.direction,
            'duration_seconds': call.duration_seconds, 'agent': link.match.agent.display_name, 'manual': link.match.manual,
            'cases': []})
        item['cases'].append({'id': link.ticket_id, 'label': labels.get(link.ticket_id, ''), 'outcome': link.outcome})
    recorded = recordings_of([item['call'] for item in calls.values()])
    for item in calls.values():
        item['recordings'] = recorded.get(item.pop('call').pk, [])
    events = [{'id': e.pk, 'kind': e.kind, 'actor': e.actor, 'data': e.data, 'created_at': e.created_at,
               'case_id': e.ticket_id, 'case_label': labels.get(e.ticket_id, '')}
              for e in TicketEvent.objects.filter(ticket_id__in=ids).order_by('-created_at', '-id')[:EVENTS]]
    return {'calls': list(calls.values()), 'events': events, 'cases': len(ids), 'missed_calls': missed_calls(ticket, user, agent, now)}


def missed_calls(ticket, user, agent, now):
    """The person's missed calls and voicemails this user may see; empty before inbound.sql has run."""
    from . import inbound
    email = email_key(ticket.learner_email)
    if not email or not inbound.ready():
        return []
    items = inbound.visible(inbound.Inbound.objects.filter(caller_email__iexact=email)
                            .select_related('call', 'voicemail', 'agent', 'assigned_agent'), user, agent)
    return [inbound.row(item, now) for item in items.order_by('-received_at')[:MISSED]]
