import json
import uuid
from datetime import date, datetime, time, timedelta
from functools import wraps
from urllib.parse import urlencode

from django.core import signing
from django.core.exceptions import ObjectDoesNotExist, PermissionDenied
from django.db import DatabaseError, transaction
from django.db.models import Avg, Count, F, Max, OuterRef, Q, Subquery
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from . import email_settings, helpdesk, lms_booking, satisfaction_email
from .aptem_summaries import parse_date_safe
from .learner_satisfaction import close_without_feedback, complete as complete_learner_feedback
from .access import is_director, refused
from .ai import ai_enabled, call_reviews
from .cycle_requests import request_call_sync
from .allocation import learner_owner, manager_owners, owners
from .booking_email import (NO_BOOKING_EMAIL, readiness as booking_email_readiness, render as render_booking_email,
                            send as send_booking_email)
from .booking_links import booking_links
from .db import DB
from .evidence import satisfaction_evidence
from .models import Agent, CaseCall, CaseTicket, CycleState, EmployerSatisfaction
from .reports import performance
from .call_scope import system_case_calls
from .history import monthly_history
from .lecture_details import add_lecture_times
from .case_filters import add_filter_contexts
from .rules import (LONDON, OPTIONS, PROMISES, REVIEW_CATEGORIES, SPECIALIST_CLOSES, contact_key, holidays_from, missed_call, next_workday,
                    normalize_phone, parse_moment, priority, promise_missed, same_contact)
from .services import Conflict, agent_for, can_work, claim, close, create_intent, event, operating_agent, plan_outcome, record_outcome, release, release_fields, reopen, resolve


ISSUE_NAMES = {
    'attendance': 'Lecture',
    'pr': 'Progress review',
    'mcm': 'MCM',
    'pr_missed': 'Missed progress review',
    'mcm_missed': 'Missed MCM',
    'signature': 'Missing signature',
    'otj': 'OTJ',
    'epa': 'EPA',
    'reminder': 'Reminder',
    'manual': 'Extra call',
    'learner_satisfaction': 'Learner satisfaction',
    'employer_feedback': 'Employer satisfaction',
    'tech_support': 'Technical issue',
}
# Tomorrow's appointments, by the session type the booking source records (sources.load_bookings).
APPOINTMENT_NAMES = {
    'pr': 'Progress review',
    'mcm': 'Monthly coaching meeting',
    'support': 'Coach support session',
    'first-session': 'First session',
    'lms-introduction': 'LMS introduction',
}


def issue_json(ticket):
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    name = ''
    if ticket.source_type == 'attendance':
        name = str(data.get('module') or '').strip()
        if data.get('catchup_no_show'):
            name = 'Missed catch-up' + (f' — {name}' if name else '')
    elif ticket.source_type == 'reminder':
        kind = str(data.get('session_type') or '').strip()
        name = APPOINTMENT_NAMES.get(kind, kind.replace('-', ' ').capitalize())
    elif ticket.source_type == 'manual':
        name = str(data.get('title') or '').strip()
    elif ticket.source_type == 'tech_support':
        name = ' · '.join(str(data.get(key) or '') for key in ('ticket', 'subcategory') if data.get(key))
    elif ticket.source_type in REVIEW_CATEGORIES:
        name = str(data.get('review_type') or '').strip()
    return {
        'id': ticket.pk,
        'source_type': ticket.source_type,
        'status': ticket.status,
        'issue_name': name or ISSUE_NAMES.get(ticket.source_type, ticket.source_type.title()),
        'issue_date': ticket.overdue_since,
        'missed_lecture': {
            'module': str(data.get('module') or '').strip(),
            'title': str(data.get('module') or '').strip(),
            'date': ticket.overdue_since,
            'starts_at': None, 'ends_at': None, 'time_status': 'missing',
        } if ticket.source_type == 'attendance' else None,
    }


def epa_dates(ticket):
    """Dates from the last Aptem snapshot, without querying or changing source records."""
    if ticket.source_type != 'epa':
        return {}
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    metrics = data.get('epa_metrics')
    metrics = metrics if isinstance(metrics, dict) else {}
    return {
        'programme_end_date': parse_date_safe(metrics.get('end_date')),
        'gateway_review_date': parse_date_safe(metrics.get('gateway_review_date')),
    }


def authenticated(fn):
    @wraps(fn)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated or not request.user.is_active:
            return JsonResponse({'detail': 'An active signed-in account is required.'}, status=401)
        denied = refused(request.user)
        if denied:
            return denied
        try:
            return fn(request, *args, **kwargs)
        except ObjectDoesNotExist:
            return JsonResponse({'detail': 'Record not found.'}, status=404)
        except PermissionDenied as exc:
            return JsonResponse({'detail': str(exc)}, status=403)
        except Conflict as exc:
            return JsonResponse({'detail': str(exc)}, status=409)
        except (ValueError, TypeError, KeyError) as exc:
            return JsonResponse({'detail': str(exc) or 'Invalid request.'}, status=400)
        except DatabaseError:
            return JsonResponse({'detail': 'Call Centre is temporarily unavailable. Check database connectivity.'}, status=503)
    return never_cache(wrapper)


def body(request, limit=16000):
    if len(request.body) > limit:
        raise ValueError('Request too large.')
    data = json.loads(request.body or '{}')
    if not isinstance(data, dict):
        raise ValueError('A JSON object is required.')
    return data


def with_last_call(cases):
    """Annotate each case with its latest call's Zoom result, which flags a missed call."""
    latest = system_case_calls().filter(ticket=OuterRef('pk')).exclude(processed_result='').order_by(
        '-match__call__started_at', '-match__call_id')
    return cases.annotate(last_call_result=Subquery(latest.values('processed_result')[:1]))


def rank(ticket, now):
    """List order: the case priority."""
    return priority(ticket, now)


def ticket_json(ticket):
    now = timezone.now()
    active_claim = bool(ticket.claimed_by_id and ticket.last_activity_at and ticket.last_activity_at > now - timedelta(minutes=30))
    score = priority(ticket, now)
    employer_learners = ticket.source_data.get('learners', []) if ticket.source_type == 'employer_feedback' else []
    if employer_learners and ticket.status != 'resolved' and not ticket.archived:
        from .sources import cached_directory
        active = cached_directory().active
        employer_learners = [person for person in employer_learners if person.get('email', '').strip().lower() in active]
    return {
        **issue_json(ticket), **epa_dates(ticket), 'source_id': ticket.source_id,
        'module': str(ticket.source_data.get('module') or '').strip(),
        'learner_email': ticket.learner_email, 'learner_name': ticket.learner_name, 'learner_phone': ticket.learner_phone,
        'contact_key': contact_key(ticket),
        'programme_status': ticket.source_data.get('programme_status', ''),
        'contact_sources': ticket.source_data.get('contact_sources', {}),
        'satisfaction_next_due_at': ticket.source_data.get('next_due_at'),
        'employer_learners': employer_learners,
        'coach': ticket.coach, 'organisation': ticket.organisation, 'programme': ticket.programme,
        'manager_name': ticket.manager_name, 'manager_email': ticket.manager_email,
        'status': ticket.status, 'risk': ticket.risk, 'claimed_by': ticket.claimed_by.display_name if active_claim else None,
        'claimed_agent_id': ticket.claimed_by_id if active_claim else None, 'last_actor': ticket.last_actor,
        'last_action_at': ticket.last_action_at, 'attempts': ticket.attempts, 'next_followup_at': ticket.next_followup_at,
        'due_at': ticket.due_at, 'sla_breached': ticket.status != 'resolved' and ticket.due_at < now,
        'sla_days_overdue': max(0, (now.astimezone(LONDON).date() - ticket.due_at.astimezone(LONDON).date()).days),
        'learner_days_overdue': score[3], 'misses': ticket.misses, 'booking_at': ticket.booking_at,
        'ai_summary': ticket.ai_summary, 'ai_confidence': ticket.ai_confidence, 'resolution_option': ticket.resolution_option,
        'resolved_at': ticket.resolved_at, 'resolved_by': ticket.resolved_by, 'archived': ticket.archived,
        'created_at': ticket.created_at, 'escalated': ticket.escalated, 'source_data': ticket.source_data,
        'booking_links': booking_links(ticket.coach), 'bookable': lms_booking.session_types(ticket),
        'booking_email': ticket.source_type not in NO_BOOKING_EMAIL,
        'promised_at': ticket.promised_at, 'promise_missed': promise_missed(ticket, now), 'missed_call': missed_call(ticket),
        # What the learner can agree to (option -> days to do it); without options the specialist closes the case.
        'promises': PROMISES.get(ticket.source_type, {}), 'specialist_closes': ticket.source_type in SPECIALIST_CLOSES,
        'purpose': str(ticket.source_data.get('purpose') or '') if isinstance(ticket.source_data, dict) else '',
        'requested_by': str(ticket.source_data.get('requested_by') or '') if isinstance(ticket.source_data, dict) else '',
        'helpdesk': {key: ticket.source_data.get(key) for key in (
            'ticket', 'subcategory', 'description', 'raised_by', 'helpdesk_status', 'helpdesk_reason', 'helpdesk_checked_at',
            'helpdesk_error')} if ticket.source_type == 'tech_support' else None,
        'priority_why': f"Risk: {ticket.risk}; SLA: {'overdue' if score[2] else 'within due date'}; learner overdue: {score[3]} days; misses: {ticket.misses}; tomorrow: {bool(score[5])}; failed attempts: {ticket.attempts}",
    }


@authenticated
@require_http_methods(['GET', 'POST'])
@csrf_protect
def satisfaction_email_view(request, pk):
    data = body(request) if request.method == 'POST' else {}
    agent_id = data.get('agent_id') if request.method == 'POST' else request.GET.get('agent_id')
    agent = operating_agent(request.user, int(agent_id) if agent_id else None)
    if request.method == 'POST':
        return JsonResponse(satisfaction_email.send(pk, request.user, data, acting_agent=agent))
    ticket = CaseTicket.objects.get(pk=pk)
    can_work(ticket, request.user, acting_agent=agent)
    return JsonResponse(satisfaction_email.draft(ticket))


@authenticated
@require_POST
@csrf_protect
def call_sync(request):
    """An in-page (Smart Embed) call ended: the worker syncs Zoom's call history straight away.

    Only a nudge: nothing the browser reports is stored. The call, its result and the case evidence still come
    from Zoom's own call history.
    """
    if not agent_for(request.user) and not is_director(request.user):
        raise PermissionDenied('An active agent profile is required.')
    return JsonResponse({'queued': request_call_sync(request.user.get_username())})


@authenticated
@require_GET
def config(request):
    agent = agent_for(request.user)
    agents = Agent.objects.filter(active=True, user__is_active=True)
    if not is_director(request.user):
        agents = agents.filter(user=request.user)
    return JsonResponse({
        'csrf_token': get_token(request), 'agent_id': agent.pk if agent else None,
        'is_manager': is_director(request.user), 'is_superuser': request.user.is_superuser,
        'agents': list(agents.order_by('zoom_account').values(
            'id', 'display_name', 'zoom_account', 'zoom_phone_number')),
        'email_mode': email_settings.current()['email_mode'], 'ai_enabled': ai_enabled(),
        'helpdesk': helpdesk.enabled(),
        'sources': list(CycleState.objects.filter(name__startswith='source:').values('name', 'last_success_at', 'details')),
        'cycle': CycleState.objects.filter(name='cycle').values('last_success_at', 'details', 'locked_until').first(),
    })


OVERVIEW_CASE_LIMIT = 3000


def report_month(request, today):
    """The requested report month as (first day, last day so far), plus London-time bounds [lower, upper)."""
    month = request.GET.get('month') or today.strftime('%Y-%m')
    start = date.fromisoformat(month + '-01')
    if start > today or start.year < 2020:
        raise ValueError('Choose a month up to the current month.')
    following = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    end = min(following - timedelta(days=1), today)
    return month, start, end, (datetime.combine(start, time.min, tzinfo=LONDON),
                               datetime.combine(end + timedelta(days=1), time.min, tzinfo=LONDON))


@authenticated
@require_GET
def overview(request):
    """Everything the Engagement Centre screens render: active cases in priority order and call stats for a month."""
    now = timezone.now()
    today = now.astimezone(LONDON).date()
    month, start, end, bounds = report_month(request, today)
    report = performance(start, end)
    agent = agent_for(request.user)
    is_manager = is_director(request.user)

    tickets = list(with_last_call(CaseTicket.objects.open().select_related('claimed_by')))
    tickets.sort(key=lambda ticket: rank(ticket, now), reverse=True)
    allocated = owners()
    employers = manager_owners(allocated)
    cases = []
    for ticket in tickets[:OVERVIEW_CASE_LIMIT]:
        item = ticket_json(ticket)
        item.pop('source_data')
        item.pop('priority_why')
        item['allocated_agent_id'] = (employers.get(ticket.learner_email) if ticket.source_type == 'employer_feedback'
                                      else learner_owner(ticket.learner_email, allocated))
        cases.append(item)

    add_lecture_times(cases)
    add_filter_contexts(cases)
    agents = []
    for row in report['agents']:
        current = next((day for day in row['daily'] if day['date'] == today.isoformat()), None)
        agents.append({
            'id': row['id'], 'display_name': row['name'], 'zoom_account': row['account'],
            'zoom_phone_number': row['zoom_phone_number'], 'target_seconds': row['daily_target_minutes'] * 60,
            'today': {'attempts': current['calls'], 'connected': current['answered'], 'seconds': current['seconds']} if current
            else {'attempts': 0, 'connected': 0, 'seconds': 0},
            'month': {'attempts': row['calls'], 'connected': row['answered'], 'seconds': row['seconds'],
                      'resolved': row['resolved'], 'pending': row['pending'], 'sla_breaches': row['sla_breaches'],
                      'unique_learners': row['unique_learners'], 'emails': row['emails'],
                      'daily': [{'day': day['date'], 'attempts': day['calls'], 'connected': day['answered'],
                                 'seconds': day['seconds']} for day in row['daily']]},
            'sync': row['sync'],
        })

    return JsonResponse({
        'today': today.isoformat(), 'next_workday': next_workday(today).isoformat(), 'holidays': holidays_from(today),
        'month': month, 'generated_at': now,
        'access': {
            'role': 'director' if is_manager else 'operator' if agent else 'viewer',
            'agent_id': agent.pk if agent else None, 'is_superuser': request.user.is_superuser,
            'display_name': (agent.display_name if agent else '') or request.user.get_full_name() or request.user.get_username(),
            'email': request.user.email,
        },
        'agents': agents, 'cases': cases, 'cases_truncated': len(tickets) > OVERVIEW_CASE_LIMIT,
        'resolutions': report['resolutions'], 'unclaimed_breaches': report['unclaimed_breaches'],
        'sources': list(CycleState.objects.filter(name__startswith='source:').values('name', 'last_success_at', 'details')),
        'cycle': CycleState.objects.filter(name='cycle').values('last_success_at', 'details').first(),
        'connections': {'calling': bool(agent), 'email_mode': email_settings.current()['email_mode'], 'ai': ai_enabled()},
        # AI call ratings name specialists' weak calls: managers see everyone's, a specialist only their own.
        'call_reviews': call_reviews(*bounds, list(Agent.objects.filter(active=True, user__is_active=True))) if is_manager
        else call_reviews(*bounds, [agent], own_only=True) if agent else None,
    })


@authenticated
@require_GET
def queue(request):
    view = request.GET.get('view', 'queue')
    if view not in {'queue', 'tomorrow', 'due', 'ai', 'history'}:
        raise ValueError('Invalid queue view.')
    page = int(request.GET.get('page', 1))
    if not 1 <= page <= 100000:
        raise ValueError('Invalid page.')
    qs = CaseTicket.objects.select_related('claimed_by').exclude(source_type='satisfaction')
    if view == 'history':
        qs = qs.filter(Q(status='resolved') | Q(archived=True))
    else:
        qs = qs.open()
        if view == 'due':
            qs = qs.filter(due_at__lt=timezone.now())
        if view == 'ai':
            qs = qs.filter(status='ai_suggested_close')
        if view == 'tomorrow':
            tomorrow = next_workday(timezone.now().astimezone(LONDON).date())
            from datetime import datetime, time
            qs = qs.filter(source_type='reminder', booking_at__gte=datetime.combine(tomorrow, time.min, tzinfo=LONDON),
                           booking_at__lt=datetime.combine(tomorrow + timedelta(days=1), time.min, tzinfo=LONDON))
    for name in ('coach', 'source_type', 'status'):
        value = request.GET.get(name, '').strip()
        if value:
            qs = qs.filter(**{name: value})
    if request.GET.get('due') == 'overdue':
        qs = qs.filter(due_at__lt=timezone.now())
    elif request.GET.get('due') == 'within':
        qs = qs.filter(due_at__gte=timezone.now())
    text = request.GET.get('q', '').strip()[:200]
    if text:
        qs = qs.filter(Q(learner_email__icontains=text) | Q(learner_name__icontains=text) | Q(learner_phone__icontains=text))
    claimed = Q(claimed_by__isnull=False, last_activity_at__gt=timezone.now() - timedelta(minutes=30))
    if request.GET.get('claimed') == 'yes':
        qs = qs.filter(claimed)
    elif request.GET.get('claimed') == 'no':
        qs = qs.exclude(claimed)
    emails = None
    if view == 'history':
        latest = (qs.values('learner_email').annotate(latest=Max('resolved_at'))
                  .order_by(F('latest').desc(nulls_last=True), 'learner_email'))
        total = latest.count()
        emails = [row['learner_email'] for row in latest[(page - 1) * 30:page * 30]]
        qs = qs.filter(learner_email__in=emails)
    groups = {}
    now = timezone.now()
    for ticket in with_last_call(qs):
        group = groups.setdefault(ticket.learner_email, {'learner_email': ticket.learner_email,
            'learner_name': ticket.learner_name, 'coach': ticket.coach, 'learner_phone': ticket.learner_phone,
            'tickets': [], '_priority': rank(ticket, now)})
        group['tickets'].append(ticket_json(ticket))
        group['_priority'] = max(group['_priority'], rank(ticket, now))
    if emails is not None:
        selected = sorted(groups.values(), key=lambda g: emails.index(g['learner_email']))
    else:
        ordered = sorted(groups.values(), key=lambda g: (g['_priority'], g['learner_email']), reverse=True)
        total = len(groups)
        selected = ordered[(page - 1) * 30:page * 30]
    for group in selected:
        group.pop('_priority')
    add_lecture_times([item for group in selected for item in group['tickets']])
    coaches = list(CaseTicket.objects.exclude(coach='').values_list('coach', flat=True).distinct().order_by('coach'))
    return JsonResponse({'groups': selected, 'total': total, 'page': page, 'has_next': page * 30 < total, 'coaches': coaches})


@authenticated
@require_GET
def detail(request, pk):
    ticket = with_last_call(CaseTicket.objects.select_related('claimed_by')).get(pk=pk)
    page = int(request.GET.get('event_page', 1))
    if not 1 <= page <= 100000:
        raise ValueError('Invalid timeline page.')
    events = ticket.events.order_by('-id')
    calls = system_case_calls(ticket.calls.all()).select_related('match__call', 'match__agent').order_by('-match__call__started_at')
    issues = CaseTicket.objects.open().filter(same_contact(ticket) if ticket.learner_email else Q(pk=ticket.pk))
    person_id = ticket.source_data.get('person_id')
    if person_id and ticket.source_type != 'employer_feedback':
        same_person = Q(source_data__person_id=person_id)
        if ticket.learner_email:
            same_person |= same_contact(ticket)
        issues = CaseTicket.objects.open().exclude(source_type='employer_feedback').filter(same_person)
    payload = ticket_json(ticket)
    add_lecture_times([payload])
    return JsonResponse({'ticket': payload,
        'issues': [{**issue_json(issue), 'created_at': issue.created_at, 'booking_at': issue.booking_at,
                    'next_followup_at': issue.next_followup_at} for issue in issues],
        'events': list(events.values('id', 'kind', 'actor', 'data', 'call_id', 'created_at')[(page - 1) * 50:page * 50]),
        'has_more_events': events.count() > page * 50,
        'calls': [{'call_id': item.match.call_id, 'agent': item.match.agent.display_name, 'agent_id': item.match.agent_id,
                   'manual': item.match.manual, 'result': item.match.call.result, 'started_at': item.match.call.started_at,
                   'duration_seconds': item.match.call.duration_seconds, 'outcome': item.outcome,
                   'current': item.match.call.started_at >= (ticket.evidence_after or ticket.created_at)} for item in calls],
        'emails': list(ticket.emails.order_by('-id').values('id', 'kind', 'status', 'mode', 'subject', 'text', 'error', 'created_at')[:30]),
    })


@authenticated
@require_POST
@csrf_protect
def action(request, pk, command):
    data = body(request)
    agent = operating_agent(request.user, data.get('agent_id'))
    if command in ('claim', 'call'):
        if not agent:
            raise PermissionDenied('Ask a manager to set up your agent profile before claiming or calling.')
        if command == 'claim':
            ticket = claim(pk, agent, actor=request.user.get_username())
            return JsonResponse({'ticket': ticket_json(ticket)})
        intent = create_intent(pk, agent, actor=request.user.get_username())
        zoom_url = 'zoomphonecall://' + intent.number
        caller_id = normalize_phone(agent.zoom_phone_number)
        if caller_id:
            zoom_url += '?' + urlencode({'callerid': caller_id})
        return JsonResponse({'intent_id': intent.pk, 'zoom_url': zoom_url, 'tel_url': 'tel:' + intent.number,
                             'number': intent.number, 'caller_id': caller_id})
    if command == 'complete_feedback':
        complete_learner_feedback(pk, request.user, score=data.get('score'), problem=data.get('problem'),
                                 action=data.get('agreed_action'), note=data.get('note'), acting_agent=agent)
    elif command == 'release':
        release(pk, request.user, acting_agent=agent)
    elif command == 'resolve':
        resolve(pk, request.user, note=str(data.get('note', ''))[:5000], option=data.get('option', 'other'), acting_agent=agent)
    elif command == 'plan':
        # The outcome straight after a call; held until Zoom reports the call if it has not yet.
        applied = plan_outcome(pk, request.user, data.get('outcome', ''), option=data.get('option', ''),
                               note=str(data.get('note', ''))[:5000],
                               callback_at=parse_moment(data['callback_at']) if data.get('callback_at') else None, acting_agent=agent)
        return JsonResponse({'ok': True, 'applied': applied})
    elif command == 'close_review':
        close_without_feedback(pk, request.user, data.get('reason', ''), data.get('note', ''), acting_agent=agent)
    elif command == 'reopen':
        reopen(pk, request.user, str(data.get('note', ''))[:5000], acting_agent=agent)
    elif command == 'outcome':
        record_outcome(pk, request.user, int(data['call_id']), data['outcome'], option=data.get('option', ''),
                       note=str(data.get('note', ''))[:5000], callback_at=parse_moment(data['callback_at']) if data.get('callback_at') else None,
                       acting_agent=agent)
    elif command in ('note', 'archive', 'reject_ai'):
        with transaction.atomic(using=DB):
            ticket = CaseTicket.objects.select_for_update().get(pk=pk)
            agent = can_work(ticket, request.user, acting_agent=agent)
            note = str(data.get('note', '')).strip()[:5000]
            if command == 'archive':
                if not is_director(request.user) or ticket.status != 'resolved':
                    raise PermissionDenied('Only managers can archive resolved cases.')
                ticket.archived = True
            elif command == 'reject_ai':
                if ticket.status != 'ai_suggested_close':
                    raise Conflict('There is no pending AI suggestion.')
                ticket.status = 'new'
                release_fields(ticket)
            elif not note:
                raise ValueError('Enter a note.')
            if ticket.claimed_by_id and agent and ticket.claimed_by_id == agent.pk:
                ticket.last_activity_at = timezone.now()
            ticket.save()
            event(ticket, command, {'note': note}, agent, None if agent else request.user.get_username())
    else:
        raise ValueError('Unknown action.')
    return JsonResponse({'ok': True})


@authenticated
@require_http_methods(['GET', 'POST'])
@csrf_protect
def booking(request, pk):
    """Book a coach session in the LMS calendar for this case's learner (GET: who, what and the free times)."""
    ticket = CaseTicket.objects.get(pk=pk)
    data = body(request) if request.method == 'POST' else {}
    agent_id = data.get('agent_id') if request.method == 'POST' else request.GET.get('agent_id')
    agent = operating_agent(request.user, int(agent_id) if agent_id else None)
    can_work(ticket, request.user, acting_agent=agent)
    if ticket.status == 'resolved' or ticket.archived:
        raise Conflict('This case is closed.')
    if not lms_booking.session_types(ticket):
        raise Conflict('Coach sessions are not booked from employer calls.')
    try:
        if request.method == 'GET':
            person = lms_booking.lms_learner(ticket.learner_email)
            lecture = lms_booking.missed_lecture(ticket) if ticket.source_type == 'attendance' else None
            slots = lms_booking.free_slots(person['coach_email'])
            return JsonResponse({
                'coach': {'name': person['coach_name'], 'email': person['coach_email']},
                'learner': {'name': person['name'], 'email': person['email']},
                'types': [{'key': key, 'label': lms_booking.TITLES[key]} for key in lms_booking.session_types(ticket)],
                'lecture': lecture and {'date': lecture['date'], 'title': lecture['title']},
                'reasons': [{'key': key, 'label': label} for key, label in lms_booking.REASONS.items()],
                'timezone': 'Europe/London',
                'slots': [{'start': s.isoformat(), 'date': s.date().isoformat(), 'time': s.strftime('%H:%M')} for s in slots],
            })
        booked = lms_booking.book(ticket, str(data.get('session_type', '')), parse_moment(data['start']),
                                  data.get('request_id'), agent.display_name if agent else request.user.get_username(),
                                  str(data.get('reason_category', '')), str(data.get('reason_note', '')))
    except lms_booking.Unavailable as exc:
        return JsonResponse({'detail': str(exc)}, status=503)
    return booked_response(request, pk, data, agent, booked)


def booked_response(request, pk, data, agent, booked):
    """Record a made booking on the case; a booked catch-up closes a missed-lecture case."""
    record = {'session_type': data['session_type'], 'event_key': booked['event_key'], 'start': booked['start'].isoformat(),
              'coach': booked['coach'], 'join_url': booked['join_url'], 'lms_report_id': booked['report_id'],
              'link_warning': booked['link_warning']}
    actor = None if agent else request.user.get_username()
    with transaction.atomic(using=DB):
        ticket = CaseTicket.objects.select_for_update().get(pk=pk)
        if not booked['replayed'] or not ticket.events.filter(kind='session_booked', data__event_key=record['event_key']).exists():
            event(ticket, 'session_booked', record, agent, actor)
        # Booking completes the calling task; a no-show creates a separate case.
        if data['session_type'] == lms_booking.CATCH_UP and ticket.status != 'resolved':
            previous_booking = ticket.source_data.get('catchup_booking') or {}
            if booked['replayed'] and previous_booking.get('event_key') == record['event_key']:
                record = previous_booking  # Replay does not carry the report linkage.
            ticket.source_data = {**ticket.source_data, 'catchup_booking': record}
            close(ticket, agent, 'agent', 'catch_up_session',
                  {'note': 'Catch-up booked in the LMS.', 'booking': record}, actor)
    return JsonResponse({'booking': record, 'warning': booked['link_warning'] or booked.get('option_warning', '')}, status=201)


@authenticated
@require_POST
@csrf_protect
def booking_email(request, pk):
    """Render the booking email for this case (default or reworded) with what it still needs to be sent. Sends nothing."""
    ticket = CaseTicket.objects.get(pk=pk)
    if ticket.source_type in NO_BOOKING_EMAIL:
        raise ValueError('This case has no booking email.')
    data = body(request)
    agent = operating_agent(request.user, int(data['agent_id']) if data.get('agent_id') else None)
    if not agent and not is_director(request.user):
        raise PermissionDenied('An active agent profile or manager permission is required.')
    sender = agent.display_name if agent else (request.user.get_full_name() or request.user.get_username())
    draft = render_booking_email(ticket, sender, data.get('subject'), data.get('message'))
    return JsonResponse({**draft, 'recipient': ticket.learner_email, 'checks': booking_email_readiness(ticket),
                         'mode': email_settings.current()['email_mode']})


@authenticated
@require_POST
@csrf_protect
def booking_email_send(request, pk):
    """Send the booking email (as shown in the preview) to the learner and record it on the case."""
    data = body(request)
    agent = operating_agent(request.user, int(data['agent_id']) if data.get('agent_id') else None)
    if not agent and not is_director(request.user):
        raise PermissionDenied('An active agent profile or manager permission is required.')
    sender = agent.display_name if agent else (request.user.get_full_name() or request.user.get_username())
    return JsonResponse(send_booking_email(pk, request.user, sender, data, acting_agent=agent))


@authenticated
@require_POST
@csrf_protect
def tech_issue(request, pk):
    """Raise the learner of case ``pk`` as a technical support ticket and open a technical-issue case to follow it.
    The requester is the case's learner, never an email from the request."""
    data = body(request)
    agent = operating_agent(request.user, int(data['agent_id']) if data.get('agent_id') else None)
    if not agent:
        raise PermissionDenied('An agent profile is required to raise a technical issue.')
    try:
        request_key = str(uuid.UUID(str(data.get('request_key', ''))))
    except ValueError:
        raise ValueError('The request key is missing or invalid.') from None
    origin = CaseTicket.objects.get(pk=pk)
    can_work(origin, request.user, acting_agent=agent)
    try:
        case, created = helpdesk.raise_issue(origin, agent, request.user.get_username(), str(data.get('subcategory', '')),
                                             str(data.get('description', '')), request_key)
    except helpdesk.HelpdeskError as exc:
        return JsonResponse({'detail': str(exc)}, status=502)
    return JsonResponse({'id': case.pk, 'ticket': case.source_data['ticket'], 'created': created}, status=201 if created else 200)


@authenticated
@require_GET
def my_call_reviews(request):
    """Every AI-rated call of one specialist in a month: their own, or any specialist's for a manager."""
    today = timezone.now().astimezone(LONDON).date()
    _, _, _, bounds = report_month(request, today)
    agent_id = request.GET.get('agent_id')
    if agent_id and is_director(request.user):
        agent = Agent.objects.get(pk=int(agent_id))
    else:
        agent = agent_for(request.user)
        if agent is None or (agent_id and int(agent_id) != agent.pk):
            raise PermissionDenied('You can only see your own call reviews.')
    reviews = call_reviews(*bounds, [agent], own_only=True, all_calls=True)
    return JsonResponse({'agent_id': agent.pk, 'counts': reviews['agents'][agent.pk], 'calls': reviews['calls']})


@authenticated
@require_GET
def agent_report(request):
    today = timezone.now().astimezone(LONDON).date()
    start = date.fromisoformat(request.GET.get('from', today.isoformat()))
    end = date.fromisoformat(request.GET.get('to', today.isoformat()))
    if start > end or end > today or (end - start).days > 365:
        raise ValueError('Choose a date range of at most 366 days, ending no later than today.')
    return JsonResponse(performance(start, end))


@never_cache
@authenticated
@require_GET
def my_history(request):
    now = timezone.now()
    today = now.astimezone(LONDON).date()
    month, _, _, (lower, upper) = report_month(request, today)
    page = int(request.GET.get('page', '1'))
    if not 1 <= page <= 1000000:
        raise ValueError('Invalid page.')
    agent_id = request.GET.get('agent_id')
    if agent_id and is_director(request.user):
        agent = Agent.objects.select_related('user').get(pk=int(agent_id))
    else:
        agent = agent_for(request.user)
        if agent is None or (agent_id and int(agent_id) != agent.pk):
            raise PermissionDenied('You can only see your own monthly achievements.')
    return JsonResponse({
        'month': month, 'current_month': today.strftime('%Y-%m'), 'timezone': 'Europe/London',
        'agent': {'id': agent.pk, 'name': agent.display_name, 'email': agent.user.email},
        **monthly_history(agent, lower, upper, now, page),
    })


@authenticated
@require_GET
def satisfaction_report(request):
    surveys = EmployerSatisfaction.objects.select_related('ticket').order_by('-quarter', 'manager_email')
    quarter = request.GET.get('quarter', '')
    if quarter:
        surveys = surveys.filter(quarter=quarter)
    page = int(request.GET.get('page', 1))
    if page < 1:
        raise ValueError('Invalid page.')
    return JsonResponse({'surveys': list(surveys.values('id', 'ticket_id', 'manager_email', 'organisation', 'quarter',
        'score', 'comment', 'responded_at', 'expires_at', 'ticket__status', 'ticket__escalated')[(page - 1) * 30:page * 30]),
        'has_next': surveys.count() > page * 30,
        'trend': list(EmployerSatisfaction.objects.filter(score__isnull=False).values('quarter', 'organisation')
                      .annotate(average=Avg('score'), responses=Count('id')).order_by('quarter', 'organisation'))})


@never_cache
@require_http_methods(['GET', 'POST'])
@csrf_protect
def survey(request, token):
    try:
        signed = signing.loads(token, salt='callcentre-survey', max_age=30 * 86400)
        with transaction.atomic(using=DB):
            item = EmployerSatisfaction.objects.select_for_update().get(pk=signed['id'], nonce=signed['nonce'])
            if item.responded_at or item.expires_at <= timezone.now():
                return render(request, 'callcenter/survey.html', {'message': 'This survey link has expired or has already been used.'}, status=410)
            if request.method == 'POST':
                score = int(request.POST.get('score', '0'))
                if score not in range(1, 6):
                    raise ValueError('Choose a score from 1 to 5.')
                item.score, item.comment, item.responded_at = score, request.POST.get('comment', '').strip()[:5000], timezone.now()
                item.save(update_fields=['score', 'comment', 'responded_at'])
                ticket = CaseTicket.objects.select_for_update().get(pk=item.ticket_id)
                ticket.escalated = score <= 2
                ticket.save(update_fields=['escalated'])
                event(ticket, 'survey_response', {'survey_id': item.pk, 'score': score, 'low_score': score <= 2}, actor='Employer')
                resolve(ticket.pk, evidence=satisfaction_evidence(ticket))
                return render(request, 'callcenter/survey.html', {'message': 'Thank you. Your feedback has been recorded.'})
            score = request.GET.get('score', '')
            return render(request, 'callcenter/survey.html', {'scores': range(1, 6), 'selected': score})
    except (signing.BadSignature, ObjectDoesNotExist, ValueError, KeyError, TypeError):
        return render(request, 'callcenter/survey.html', {'message': 'This survey link or response is invalid.'}, status=400)
