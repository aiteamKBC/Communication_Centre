"""Read-only monthly achievements, attributed to the person who made the call."""
from collections import defaultdict

from django.db.models import Q

from .models import CallMatch, CaseTicket, TicketEvent
from .rules import FAILED_RESULTS, LONDON
from .call_scope import system_calls
from .voicemail_calls import effective_result


def monthly_history(agent, lower, upper, now, page, page_size=30):
    # Retained in-system matches preserve attribution after identity or allocation changes.
    calls = list(system_calls().filter(
        Q(ended_at__isnull=True) | Q(ended_at__lte=now),
        callmatch__agent=agent, direction='outbound', started_at__gte=lower, started_at__lt=upper,
        started_at__lte=now,
    ).select_related('callmatch').order_by('-started_at', '-id'))

    daily = defaultdict(lambda: {'attempts': 0, 'connected': 0, 'not_answered': 0, 'other': 0, 'seconds': 0})
    for call in calls:
        row = daily[call.started_at.astimezone(LONDON).date().isoformat()]
        row['attempts'] += 1
        # A voicemail that picked up is not connected; its time stays in the talk time (voicemail_calls).
        result = effective_result(call)
        row['connected'] += result == 'answered'
        row['not_answered'] += result in FAILED_RESULTS
        row['other'] += result != 'answered' and result not in FAILED_RESULTS
        if call.result == 'answered':
            row['seconds'] += call.duration_seconds or 0

    summary = {key: sum(row[key] for row in daily.values())
               for key in ('attempts', 'connected', 'not_answered', 'other', 'seconds')}
    summary['active_days'] = len(daily)
    summary['missing_duration'] = sum(call.result == 'answered' and call.duration_seconds is None for call in calls)
    # Resolution events survive reopening; keep legacy resolutions without events too.
    resolved_ids = set(TicketEvent.objects.filter(
        agent=agent, kind='resolved', created_at__gte=lower, created_at__lt=upper, created_at__lte=now,
    ).values_list('ticket_id', flat=True))
    resolved_ids.update(CaseTicket.objects.filter(
        resolved_agent=agent, resolved_at__gte=lower, resolved_at__lt=upper, resolved_at__lte=now,
    ).values_list('pk', flat=True))
    summary['resolved'] = len(resolved_ids)

    selected = calls[(page - 1) * page_size:page * page_size]
    matches = {match.call_id: match for match in CallMatch.objects.filter(
        agent=agent, call_id__in=[call.pk for call in selected],
    ).prefetch_related('cases__ticket')}
    items = []
    for call in selected:
        match = matches.get(call.pk)
        cases = sorted(match.cases.all(), key=lambda item: item.ticket_id) if match else []
        items.append({
            'id': call.pk, 'started_at': call.started_at, 'result': call.result,
            'duration_seconds': call.duration_seconds if call.result == 'answered' else 0,
            'contact_name': call.callee_name or (cases[0].ticket.learner_name if cases else ''),
            'contact_email': match.learner_email if match else '', 'number': call.callee_number,
            'cases': [{'id': item.ticket_id, 'source_type': item.ticket.source_type,
                       'outcome': item.outcome} for item in cases],
        })
    return {
        'summary': summary, 'daily': [{'day': day, **row} for day, row in sorted(daily.items())],
        'calls': items, 'page': page, 'page_size': page_size,
        'total': len(calls), 'has_next': len(calls) > page * page_size,
    }
