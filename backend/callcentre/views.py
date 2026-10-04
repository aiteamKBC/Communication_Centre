import json
from datetime import date, timedelta
from functools import wraps
from urllib.parse import urlencode

from django.core import signing
from django.core.exceptions import ObjectDoesNotExist, PermissionDenied
from django.db import DatabaseError, transaction
from django.db.models import Avg, Count, OuterRef, Q, Subquery
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from . import email_settings, lms_booking
from .ai import ai_enabled
from .allocation import owners
from .booking_email import readiness as booking_email_readiness, render as render_booking_email
from .booking_links import booking_links
from .db import DB
from .evidence import satisfaction_evidence
from .models import Agent, CaseCall, CaseTicket, CycleState, EmployerSatisfaction
from .reports import performance
from .rules import (LONDON, OPTIONS, PROMISES, REVIEW_CATEGORIES, SPECIALIST_CLOSES, missed_call, normalize_phone, parse_moment,
                    priority, promise_missed)
from .services import Conflict, agent_for, can_work, claim, close, create_intent, event, operating_agent, plan_outcome, record_outcome, release, release_fields, reopen, resolve, send_back


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
}


def issue_json(ticket):
    data = ticket.source_data if isinstance(ticket.source_data, dict) else {}
    name = ''
    if ticket.source_type == 'attendance':
        name = str(data.get('module') or '').strip()
    elif ticket.source_type == 'reminder':
        name = str(data.get('session_type') or '').strip()
    elif ticket.source_type == 'manual':
        name = str(data.get('title') or '').strip()
    elif ticket.source_type in REVIEW_CATEGORIES:
        name = str(data.get('review_type') or '').strip()
    return {
        'id': ticket.pk,
        'source_type': ticket.source_type,
        'status': ticket.status,
        'issue_name': name or ISSUE_NAMES.get(ticket.source_type, ticket.source_type.title()),
        'issue_date': ticket.overdue_since,
    }


def authenticated(fn):
    @wraps(fn)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated or not request.user.is_active:
            return JsonResponse({'detail': 'An active signed-in account is required.'}, status=401)
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
    latest = CaseCall.objects.filter(ticket=OuterRef('pk')).exclude(processed_result='').order_by(
        '-match__call__started_at', '-match__call_id')
    return cases.annotate(last_call_result=Subquery(latest.values('processed_result')[:1]))


def ticket_json(ticket):
    now = timezone.now()
    active_claim = bool(ticket.claimed_by_id and ticket.last_activity_at and ticket.last_activity_at > now - timedelta(minutes=30))
    score = priority(ticket, now)
    return {
        **issue_json(ticket), 'source_id': ticket.source_id,
        'learner_email': ticket.learner_email, 'learner_name': ticket.learner_name, 'learner_phone': ticket.learner_phone,
        'contact_key': ticket.learner_email or f'case:{ticket.pk}',
        'programme_status': ticket.source_data.get('programme_status', ''),
        'satisfaction_next_due_at': ticket.source_data.get('next_due_at'),
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
        'promised_at': ticket.promised_at, 'promise_missed': promise_missed(ticket, now), 'missed_call': missed_call(ticket),
        # What the learner can agree to (option -> days to do it); without options the specialist closes the case.
        'promises': PROMISES.get(ticket.source_type, {}), 'specialist_closes': ticket.source_type in SPECIALIST_CLOSES,
        'purpose': str(ticket.source_data.get('purpose') or '') if isinstance(ticket.source_data, dict) else '',
        'requested_by': str(ticket.source_data.get('requested_by') or '') if isinstance(ticket.source_data, dict) else '',
        'priority_why': f"Risk: {ticket.risk}; SLA: {'overdue' if score[2] else 'within due date'}; learner overdue: {score[3]} days; misses: {ticket.misses}; tomorrow: {bool(score[5])}; failed attempts: {ticket.attempts}",
    }


@authenticated
@require_GET
def config(request):
    agent = agent_for(request.user)
    agents = Agent.objects.filter(active=True, user__is_active=True)
    if not request.user.is_superuser:
        agents = agents.filter(user=request.user)
    return JsonResponse({
        'csrf_token': get_token(request), 'agent_id': agent.pk if agent else None,
        'is_manager': request.user.is_staff, 'is_superuser': request.user.is_superuser,
        'agents': list(agents.order_by('zoom_account').values(
            'id', 'display_name', 'zoom_account', 'zoom_phone_number')),
        'email_mode': email_settings.current()['email_mode'], 'ai_enabled': ai_enabled(),
        'sources': list(CycleState.objects.filter(name__startswith='source:').values('name', 'last_success_at', 'details')),
        'cycle': CycleState.objects.filter(name='cycle').values('last_success_at', 'details', 'locked_until').first(),
    })


OVERVIEW_CASE_LIMIT = 3000


@authenticated
@require_GET
def overview(request):
    """Everything the Engagement Centre screens render: active cases in priority order and call stats for a month."""
    now = timezone.now()
    today = now.astimezone(LONDON).date()
    month = request.GET.get('month') or today.strftime('%Y-%m')
    start = date.fromisoformat(month + '-01')
    if start > today or start.year < 2020:
        raise ValueError('Choose a month up to the current month.')
    following = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    end = min(following - timedelta(days=1), today)
    report = performance(start, end)
    agent = agent_for(request.user)
    is_manager = request.user.is_staff or request.user.is_superuser

    tickets = list(with_last_call(CaseTicket.objects.open().select_related('claimed_by')))
    tickets.sort(key=lambda ticket: priority(ticket, now), reverse=True)
    allocated = owners()
    cases = []
    for ticket in tickets[:OVERVIEW_CASE_LIMIT]:
        item = ticket_json(ticket)
        item.pop('source_data')
        item.pop('priority_why')
        item['allocated_agent_id'] = allocated.get(ticket.learner_email)
        cases.append(item)

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
        'today': today.isoformat(), 'month': month, 'generated_at': now,
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
    qs = with_last_call(CaseTicket.objects.select_related('claimed_by').exclude(source_type='satisfaction'))
    if view == 'history':
        qs = qs.filter(Q(status='resolved') | Q(archived=True))
    else:
        qs = qs.open()
        if view == 'due':
            qs = qs.filter(due_at__lt=timezone.now())
        if view == 'ai':
            qs = qs.filter(status='ai_suggested_close')
        if view == 'tomorrow':
            tomorrow = timezone.now().astimezone(LONDON).date() + timedelta(days=1)
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
    groups = {}
    now = timezone.now()
    for ticket in qs:
        group = groups.setdefault(ticket.learner_email, {'learner_email': ticket.learner_email,
            'learner_name': ticket.learner_name, 'coach': ticket.coach, 'learner_phone': ticket.learner_phone,
            'tickets': [], '_priority': priority(ticket, now)})
        group['tickets'].append(ticket_json(ticket))
        group['_priority'] = max(group['_priority'], priority(ticket, now))
    ordered = sorted(groups.values(), key=lambda g: (g['_priority'], g['learner_email']), reverse=True)
    selected = ordered[(page - 1) * 30:page * 30]
    for group in selected:
        group.pop('_priority')
    coaches = list(CaseTicket.objects.exclude(coach='').values_list('coach', flat=True).distinct().order_by('coach'))
    return JsonResponse({'groups': selected, 'total': len(groups), 'page': page, 'has_next': page * 30 < len(groups), 'coaches': coaches})


@authenticated
@require_GET
def detail(request, pk):
    ticket = with_last_call(CaseTicket.objects.select_related('claimed_by')).get(pk=pk)
    page = int(request.GET.get('event_page', 1))
    if not 1 <= page <= 100000:
        raise ValueError('Invalid timeline page.')
    events = ticket.events.order_by('-id')
    calls = ticket.calls.select_related('match__call', 'match__agent').order_by('-match__call__started_at')
    issues = (CaseTicket.objects.open().filter(learner_email=ticket.learner_email) if ticket.learner_email
              else CaseTicket.objects.open().filter(pk=ticket.pk))
    return JsonResponse({'ticket': ticket_json(ticket),
        'issues': [issue_json(issue) for issue in issues],
        'events': list(events.values('id', 'kind', 'actor', 'data', 'call_id', 'created_at')[(page - 1) * 50:page * 50]),
        'has_more_events': events.count() > page * 50,
        'calls': [{'call_id': item.match.call_id, 'agent': item.match.agent.display_name, 'manual': item.match.manual,
                   'result': item.match.call.result, 'started_at': item.match.call.started_at,
                   'duration_seconds': item.match.call.duration_seconds, 'outcome': item.outcome} for item in calls],
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
        return JsonResponse({'intent_id': intent.pk, 'zoom_url': zoom_url, 'tel_url': 'tel:' + intent.number})
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
    elif command == 'send_back':
        send_back(pk, request.user, str(data.get('note', ''))[:5000])
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
                if not request.user.is_staff or ticket.status != 'resolved':
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
    record = {'session_type': data['session_type'], 'event_key': booked['event_key'], 'start': booked['start'].isoformat(),
              'coach': booked['coach'], 'join_url': booked['join_url'], 'lms_report_id': booked['report_id'],
              'link_warning': booked['link_warning']}
    actor = None if agent else request.user.get_username()
    with transaction.atomic(using=DB):
        ticket = CaseTicket.objects.select_for_update().get(pk=pk)
        if not booked['replayed']:
            event(ticket, 'session_booked', record, agent, actor)
        # A booked catch-up is the proof a missed-lecture case waits for.
        if data['session_type'] == lms_booking.CATCH_UP and ticket.status != 'resolved':
            close(ticket, agent, 'agent', 'catch_up_session', {'note': 'Catch-up booked in the LMS.', 'booking': record}, actor)
    return JsonResponse({'booking': record, 'warning': booked['link_warning'] or booked.get('option_warning', '')}, status=201)


@authenticated
@require_POST
@csrf_protect
def booking_email(request, pk):
    """Render the booking email for this case (default or reworded) with what it still needs to be sent. Sends nothing."""
    ticket = CaseTicket.objects.get(pk=pk)
    if ticket.source_type in ('satisfaction', 'signature'):
        raise ValueError('This case has no booking email.')
    data = body(request)
    agent = operating_agent(request.user, int(data['agent_id']) if data.get('agent_id') else None)
    if not agent and not request.user.is_staff:
        raise PermissionDenied('An active agent profile or manager permission is required.')
    sender = agent.display_name if agent else (request.user.get_full_name() or request.user.get_username())
    draft = render_booking_email(ticket, sender, data.get('subject'), data.get('message'))
    return JsonResponse({**draft, 'recipient': ticket.learner_email, 'checks': booking_email_readiness(ticket)})


@authenticated
@require_GET
def agent_report(request):
    today = timezone.now().astimezone(LONDON).date()
    start = date.fromisoformat(request.GET.get('from', today.isoformat()))
    end = date.fromisoformat(request.GET.get('to', today.isoformat()))
    if start > end or end > today or (end - start).days > 365:
        raise ValueError('Choose a date range of at most 366 days, ending no later than today.')
    return JsonResponse(performance(start, end))


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
