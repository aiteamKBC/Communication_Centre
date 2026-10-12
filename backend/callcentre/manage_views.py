"""Call-centre endpoints that replace legacy dashboard pieces not ported as-is.

* ``agents`` / ``agent_detail`` replace the Django admin page managers used to set up
  Zoom agent profiles (directors only: Django super admins). Profiles are created by ticking
  Call centre access in Django admin (``access.sync_agent``).
* ``activity_log`` replaces ``GET /api/coaches/all``: instead of shipping every
  ``coaches_data`` column to the browser, it returns one month of outbound Zoom calls
  already matched to learners and coaches.
* ``learners`` / ``call_requests`` back the director's "Request a call": a manager picks a
  learner from the merged LMS + Aptem directory and adds a call to the calling register.
"""
import json
import uuid
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, ProgrammingError, transaction
from django.db.models import Count
from django.db.models.functions import TruncMonth
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from . import email_settings, mailer
from .access import is_director
from .db import DB
from .models import Agent, Allocation, AllocationHistory, CallMatch, CaseTicket, ZoomPhoneCall
from .rules import LONDON, email_key, normalize_phone
from .services import Conflict, event
from .sources import learner_directory, rows
from .views import authenticated, body

AGENT_FIELDS = ('display_name', 'zoom_email', 'zoom_user_id', 'zoom_phone_number', 'zoom_account',
                'daily_talk_target_minutes', 'active')


def require_manager(user):
    if not is_director(user):
        raise PermissionDenied('Only managers can manage agents.')


def agent_json(agent):
    return {'id': agent.pk, 'user_id': agent.user_id, 'user_email': agent.user.email,
            **{field: getattr(agent, field) for field in AGENT_FIELDS}}


def save_agent(agent, data):
    for field in AGENT_FIELDS:
        if field in data:
            setattr(agent, field, data[field])
    try:
        agent.full_clean()
    except ValidationError as exc:
        raise ValueError('; '.join(f'{field}: {" ".join(errors)}' for field, errors in exc.message_dict.items())) from None
    agent.save()
    return agent


@authenticated
@require_http_methods(['GET', 'POST'])
@csrf_protect
def agents(request):
    require_manager(request.user)
    if request.method == 'POST':
        data = body(request)
        user = get_user_model().objects.using(DB).filter(pk=int(data.get('user_id') or 0), is_active=True).first()
        if user is None:
            raise ValueError('Choose an active account.')
        if Agent.objects.filter(user=user).exists():
            raise ValueError('This account already has an agent profile.')
        agent = save_agent(Agent(user=user), data)
        return JsonResponse({'agent': agent_json(agent)}, status=201)
    taken = set(Agent.objects.values_list('user_id', flat=True))
    users = get_user_model().objects.using(DB).filter(is_active=True).order_by('first_name', 'last_name', 'email')
    return JsonResponse({
        'agents': [agent_json(agent) for agent in Agent.objects.select_related('user').order_by('display_name')],
        'accounts': [{'id': user.pk, 'email': user.email,
                      'name': f'{user.first_name} {user.last_name}'.strip() or user.username}
                     for user in users if user.pk not in taken],
    })


@authenticated
@require_http_methods(['PATCH'])
@csrf_protect
def agent_detail(request, pk):
    require_manager(request.user)
    agent = Agent.objects.select_related('user').get(pk=pk)
    return JsonResponse({'agent': agent_json(save_agent(agent, body(request)))})


def phone_keys(value):
    """Unified mode uses exact normalized numbers, never ambiguous suffixes."""
    from .identity import enabled
    from .rules import normalize_phone
    if enabled():
        phone = normalize_phone(value)
        return [phone] if phone else []
    digits = ''.join(ch for ch in str(value or '') if ch.isdigit())
    if digits.startswith('0044'):
        digits = digits[2:]
    if digits.startswith('44'):
        digits = '0' + digits[2:]
    if len(digits) == 10 and not digits.startswith('0'):
        digits = '0' + digits
    return [key for key in (digits, digits[-10:], digits[-9:]) if key]


def activity_phone_directory(people=None):
    """Coach caseloads keyed by phone, for labelling calls in the activity log."""
    from .identity import enabled
    if enabled():
        people = people if people is not None else learner_directory()
        return {phone: {'learner_name': p['name'], 'learner_email': p['email'], 'coach': p['coach']}
                for phone, p in people.phone_contacts().items()}
    directory = {}
    for coach in rows(DB, 'SELECT case_owner, learners_json FROM public.coaches_data'):
        learners = coach['learners_json']
        if isinstance(learners, str):
            try:
                learners = json.loads(learners)
            except ValueError:
                learners = []
        for learner in learners if isinstance(learners, list) else []:
            if not isinstance(learner, dict):
                continue
            entry = {'learner_name': str(learner.get('FullName') or ''), 'learner_email': str(learner.get('Email') or ''),
                     'coach': str(coach['case_owner'] or learner.get('LMS__Tutor_Name') or '')}
            for key in phone_keys(learner.get('learner_phone')):
                directory[key] = entry
    return directory


@authenticated
@require_GET
def activity_log(request):
    today = datetime.now(LONDON).date()
    month = request.GET.get('month') or today.strftime('%Y-%m')
    start = date.fromisoformat(month + '-01')
    end = date(start.year + start.month // 12, start.month % 12 + 1, 1)
    outbound = ZoomPhoneCall.objects.filter(direction='outbound')
    # order_by() clears the model's default ordering, which would otherwise defeat DISTINCT.
    months = sorted({value.astimezone(LONDON).strftime('%Y-%m') for value in outbound.order_by().annotate(
        month=TruncMonth('started_at', tzinfo=LONDON)).values_list('month', flat=True).distinct()} | {today.strftime('%Y-%m')},
        reverse=True)
    calls = outbound.filter(started_at__gte=datetime.combine(start, time.min, tzinfo=LONDON),
                            started_at__lt=datetime.combine(end, time.min, tzinfo=LONDON)).exclude(callee_number='')
    from .identity import enabled
    people = learner_directory() if enabled() else None
    directory = activity_phone_directory(people)
    linked = dict(CallMatch.objects.filter(call__in=calls).values_list('call_id', 'learner_email')) if people is not None else {}
    daily, details = {}, []
    for call in calls.order_by('started_at').values('id', 'callee_number', 'started_at', 'result'):
        day = call['started_at'].astimezone(LONDON).date().isoformat()
        answered = call['result'] == 'answered'
        totals = daily.setdefault(day, {'date': day, 'calls': 0, 'answered': 0, 'not_answered': 0})
        totals['calls'] += 1
        totals['answered' if answered else 'not_answered'] += 1
        learner = next((directory[key] for key in phone_keys(call['callee_number']) if key in directory), {})
        if call['id'] in linked:
            person = people.resolve(email=linked[call['id']])
            # Existing call attribution wins over a phone that may have changed owner.
            learner = person['profile'] if person else {'learner_email': linked[call['id']]}
        details.append({'id': call['id'], 'date': day, 'phone': call['callee_number'], 'answered': answered,
                        'learner_name': learner.get('learner_name', ''), 'learner_email': learner.get('learner_email', ''),
                        'coach': learner.get('coach', '')})
    return JsonResponse({'month': month, 'months': months, 'daily': list(daily.values()),
                         'total_calls': len(details), 'recent_calls': details[::-1][:30]})


@authenticated
@require_GET
def learners(request):
    """The merged learner directory for the request form (managers only)."""
    require_manager(request.user)
    people = sorted(learner_directory().values(), key=lambda p: (p['learner_name'].lower(), p['learner_email']))
    return JsonResponse({'learners': [{
        'email': p['learner_email'], 'name': p['learner_name'], 'phone': p['learner_phone'],
        'programme': p['programme'], 'coach': p['coach'], 'organisation': p['organisation'],
    } for p in people]})


@authenticated
@require_GET
def identity_status(request):
    """Manager-only, read-only identity provenance and review queue (no secret values)."""
    require_manager(request.user)
    from .sources import unified_directory
    try:
        people = unified_directory()
    except Exception:
        return JsonResponse({'detail': 'Identity sources unavailable; no records were changed.'}, status=503)
    return JsonResponse(people.summary())


@authenticated
@require_POST
@csrf_protect
def call_requests(request):
    """Add a manager-requested call to the calling register as an open "manual" case."""
    require_manager(request.user)
    data = body(request)
    try:
        request_key = str(uuid.UUID(str(data.get('request_key', ''))))
    except ValueError:
        raise ValueError('The request key is missing or invalid.') from None
    title = str(data.get('title', '')).strip()
    purpose = str(data.get('purpose', '')).strip()
    if not 3 <= len(title) <= 180:
        raise ValueError('Enter a call title of 3 to 180 characters.')
    if not 10 <= len(purpose) <= 4000:
        raise ValueError('Explain the purpose and approach in 10 to 4,000 characters.')
    today = timezone.now().astimezone(LONDON).date()
    due = date.fromisoformat(str(data.get('due_date', '')))
    if not today <= due <= today + timedelta(days=365):
        raise ValueError('Choose a due date from today up to a year ahead.')
    people = learner_directory()
    email = email_key(data.get('learner_email'))
    if email not in people:
        raise ValueError('Choose a learner from the directory.')
    person = people[email]
    phone = normalize_phone(data.get('phone')) if str(data.get('phone', '')).strip() else person['learner_phone']
    if str(data.get('phone', '')).strip() and not phone:
        raise ValueError('Enter a valid UK or international phone number.')
    if not phone:
        raise ValueError('This learner has no phone number. Enter the number to call.')
    actor = request.user.get_username()
    with transaction.atomic(using=DB):
        case, created = CaseTicket.objects.get_or_create(reason_key=f'manual:{person["learner_email"]}:{request_key}', defaults={
            **person, 'learner_phone': phone, 'source_type': 'manual', 'risk': 'amber', 'last_actor': actor,
            'due_at': datetime.combine(due, time(17), tzinfo=LONDON),
            'source_data': {'title': title, 'purpose': purpose, 'requested_by': actor},
        })
        if created:
            event(case, 'created', {'source': 'manual', 'title': title, 'purpose': purpose}, actor=actor)
    return JsonResponse({'id': case.pk, 'created': created}, status=201 if created else 200)



@authenticated
@require_http_methods(['GET', 'POST'])
@csrf_protect
def settings_view(request):
    """Director settings (Settings tab): the automatic reminder emails and the sending mode."""
    require_manager(request.user)
    if request.method == 'POST':
        data = body(request)
        if type(data.get('revision')) is not int:
            raise ValueError('Reload the settings and try again.')
        revision = email_settings.save(data.get('values'), data['revision'], data.get('reason'),
                                       request.user.get_username(), mailer.configured())
        return JsonResponse({'ok': True, 'revision': revision})
    values, revision, set_up = email_settings.stored()
    return JsonResponse({
        'values': values, 'defaults': email_settings.defaults(), 'revision': revision, 'set_up': set_up,
        'not_set_up': '' if set_up else email_settings.NOT_SET_UP,
        'reminder_types': [{'key': key, 'label': label} for key, label in email_settings.REMINDER_TYPES.items()],
        'sending': {'configured': mailer.configured(), 'sender': mailer.sender(), 'missing': mailer.missing(),
                    'live_allowed': settings.CALLCENTRE_EMAIL_LIVE_ALLOWED},
        'history': email_settings.history(),
    })


ALLOCATION_NOT_SET_UP = 'Learner allocation is not set up yet. Run docs/callcentre-port/allocation.sql on the call-centre database.'


@authenticated
@require_http_methods(['GET', 'POST'])
@csrf_protect
def allocations(request):
    """Managers allocate learners to engagement specialists; every change is kept with its reason."""
    require_manager(request.user)
    people = learner_directory()
    try:
        if request.method == 'POST':
            return JsonResponse(save_allocations(request, people))
        current = {row.learner_email: row for row in Allocation.objects.all()}
        history = list(AllocationHistory.objects.order_by('-created_at', '-id').values(
            'id', 'learner_email', 'previous_agent_id', 'agent_id', 'reason', 'actor', 'created_at')[:50])
    except ProgrammingError:
        return JsonResponse({'detail': ALLOCATION_NOT_SET_UP}, status=503)

    def main_email(email):
        return people[email]['learner_email'] if email in people else email

    work = {}
    for row in CaseTicket.objects.open().values('learner_email').annotate(cases=Count('id')):
        key = main_email(row['learner_email'])
        work[key] = work.get(key, 0) + row['cases']
    names = {p['learner_email']: p['learner_name'] for p in people.values()}
    operators = list(Agent.objects.filter(active=True, user__is_active=True).order_by('display_name').values('id', 'display_name'))
    active = {operator['id'] for operator in operators}

    def owner(email):
        # A switched-off specialist's learners are in the shared queue (allocation.owners).
        agent_id = current[email].agent_id if email in current else None
        return agent_id if agent_id in active else None

    return JsonResponse({
        'learners': [{
            'email': p['learner_email'], 'name': p['learner_name'], 'programme': p['programme'],
            'organisation': p['organisation'], 'coach': p['coach'],
            'manager_email': p['manager_email'], 'manager_name': p['manager_name'],
            'agent_id': owner(p['learner_email']),
            'revision': current[p['learner_email']].revision if p['learner_email'] in current else 0,
            'active_cases': work.get(p['learner_email'], 0),
        } for p in sorted(people.values(), key=lambda p: (p['learner_name'].lower(), p['learner_email']))],
        'operators': operators,
        'history': [{**h, 'learner_name': names.get(h['learner_email'], h['learner_email'])} for h in history],
    })


def save_allocations(request, people):
    """Apply a reviewed allocation plan. Each change carries the revision the manager saw, so a stale plan is refused."""
    data = body(request, limit=200000)
    reason = str(data.get('reason', '')).strip()
    changes = data.get('changes')
    if not 5 <= len(reason) <= 1000:
        raise ValueError('Add an allocation reason of 5 to 1,000 characters.')
    if not isinstance(changes, list) or not 1 <= len(changes) <= 1000:
        raise ValueError('Select between 1 and 1,000 learners.')
    operators = set(Agent.objects.filter(active=True, user__is_active=True).values_list('pk', flat=True))
    plan = {}
    for change in changes:
        if not isinstance(change, dict) or type(change.get('revision')) is not int or change['revision'] < 0:
            raise ValueError('Refresh the allocation screen and review the selection again.')
        email = email_key(change.get('email'))
        if email not in people:
            raise ValueError('A selected learner is no longer in the directory. Refresh and try again.')
        agent_id = change.get('agent_id')
        if agent_id is not None and (type(agent_id) is not int or agent_id not in operators):
            raise ValueError('Choose an active engagement specialist.')
        email = people[email]['learner_email']
        if email in plan:
            raise ValueError('Select each learner only once.')
        plan[email] = (agent_id, change['revision'])
    actor = request.user.get_username()
    changed = 0
    try:
        with transaction.atomic(using=DB):
            current = {row.learner_email: row for row in Allocation.objects.select_for_update().filter(learner_email__in=list(plan))}
            for email, (agent_id, revision) in plan.items():
                row = current.get(email)
                if (row.revision if row else 0) != revision:
                    raise Conflict('Allocations changed since you loaded them. Refresh and review again.')
                previous = row.agent_id if row else None
                if previous == agent_id:
                    continue
                if row:
                    row.agent_id, row.revision, row.updated_by = agent_id, row.revision + 1, actor
                    row.save()
                else:
                    Allocation.objects.create(learner_email=email, agent_id=agent_id, updated_by=actor)
                AllocationHistory.objects.create(learner_email=email, previous_agent_id=previous, agent_id=agent_id,
                                                 reason=reason, actor=actor)
                changed += 1
    except IntegrityError:
        raise Conflict('Allocations changed since you loaded them. Refresh and review again.') from None
    return {'ok': True, 'changed': changed}
