"""Incoming calls: who called the team's numbers, and what still needs a call back.

* A missed call (or voicemail) from a learner or line manager we know is a **call-back**: it goes to the learner's
  specialist (else the specialist whose number was called), and the learner's cases go to the top of the list.
* A missed call from a number we do not know is an **enquiry** (someone asking about apprenticeships): directors see
  them and give them to whoever handles sales.
* Either is done when someone calls the number back, the caller gets through, or it is marked done (with a note).
* An answered call from a learner on a specialist's own number counts as contact: it is linked to the learner's cases
  due now as if the specialist had pressed Call, so the after-call form records what was agreed.

Zoom's call history is the evidence; nothing here calls Zoom. The follow-ups live in ``callcenter_inbound``
(docs/callcentre-port/inbound.sql): until it exists, the lists say so and the rest works as before.
"""
from datetime import timedelta

from django.core.exceptions import PermissionDenied
from django.db import DatabaseError, ProgrammingError, transaction
from django.db.models import Q
from django.utils import timezone

from .db import DB
from .models import Agent, CallIntent, CallMatch, CaseCall, CaseTicket, CycleState, Inbound, ZoomPhoneCall
from .rules import email_key, normalize_phone

NOT_SET_UP = 'Missed calls are not set up yet. Run docs/callcentre-port/inbound.sql on the call-centre database.'
# Zoom's results for an incoming call nobody took. 'other' is Zoom's "abandoned": the caller hung up while it rang.
MISSED = ('no_answer', 'voicemail', 'other')
# How far back the follow-ups start, and how long an answered call can wait to be linked to the learner's cases.
LOOKBACK = timedelta(days=14)
ANSWERED_LOOKBACK = timedelta(hours=2)
CALLER_DIRECTORY = 'caller_directory'


def ready():
    """Whether callcenter_inbound exists."""
    try:
        with transaction.atomic(using=DB):
            Inbound.objects.exists()
        return True
    except (ProgrammingError, DatabaseError):
        return False


def caller_directory():
    """Phone -> {name, email, role} for every learner and line manager with a number only they have."""
    state = CycleState.objects.filter(name=CALLER_DIRECTORY).first()
    return state.details if state and isinstance(state.details, dict) else {}


def save_caller_directory(people):
    """Kept by the cycle with the phone directory (cycle.update_phone_directory)."""
    if hasattr(people, 'phone_contacts'):
        directory = {phone: {'name': entry['name'], 'email': entry['email'], 'role': entry['role']}
                     for phone, entry in people.phone_contacts().items() if entry['email']}
    else:
        directory = {}
        for person in people.values():
            if person['learner_phone'] and person['learner_email']:
                directory[person['learner_phone']] = {'name': person['learner_name'], 'email': person['learner_email'], 'role': 'learner'}
    CycleState.objects.update_or_create(name=CALLER_DIRECTORY, defaults={'details': directory, 'last_success_at': timezone.now()})


def who_called(number, directory=None):
    """The learner or line manager this number belongs to, or None: {name, email, role}."""
    if not number:
        return None
    directory = caller_directory() if directory is None else directory
    if number in directory:
        return directory[number]
    # A learner with a case but not (yet) in the directory: their case's number, when only one learner has it.
    emails = set(CaseTicket.objects.filter(learner_phone=number).exclude(source_type='employer_feedback')
                 .values_list('learner_email', flat=True)[:2])
    if len(emails) == 1:
        email = emails.pop()
        name = CaseTicket.objects.filter(learner_email=email).values_list('learner_name', flat=True).first() or ''
        return {'name': name, 'email': email_key(email), 'role': 'learner'}
    return None


def own_numbers():
    """The team's own numbers: a call between them is internal, not a call-back or an enquiry."""
    from .zoom_lines import stored
    numbers = {line['number'] for line in stored()}
    numbers.update(normalize_phone(n) for n in Agent.objects.exclude(zoom_phone_number='').values_list('zoom_phone_number', flat=True))
    numbers.discard('')
    return numbers


def line_agent(call):
    """The specialist whose own number was called (only one specialist has it), or None."""
    line = normalize_phone(call.callee_number)
    if not line:
        return None
    agents = [agent for agent in Agent.objects.filter(active=True, user__is_active=True, zoom_account=call.source_account)
              if normalize_phone(agent.zoom_phone_number) == line]
    return agents[0] if len(agents) == 1 else None


def sync(now=None):
    """Add the missed calls not followed up yet, close the ones called back or got through, and link answered calls
    from learners to their cases. Returns counts; a missing table only skips the follow-ups."""
    from .zoom_views import current_account_filter
    now = now or timezone.now()
    result = {'linked': link_answered(now)}
    if not ready():
        result['inbound'] = 'not set up'
        return result
    directory, own = caller_directory(), own_numbers()
    added = 0
    missed = (ZoomPhoneCall.objects.filter(current_account_filter(), direction='inbound', result__in=MISSED,
                                           started_at__gte=now - LOOKBACK, inbound__isnull=True)
              .order_by('started_at'))
    for call in missed:
        number = normalize_phone(call.caller_number)
        # Hidden numbers and the team's own lines are nobody to call back.
        if not number or number in own:
            continue
        # A voicemail read before its call record already started the follow-up: the call joins it.
        early = Inbound.objects.filter(call__isnull=True, voicemail__zoom_account_id=call.zoom_account_id).filter(
            Q(voicemail__call_history_id=call.history_id) | (Q(voicemail__call_id=call.call_id) if call.call_id else Q(pk__in=[]))).first()
        if early:
            Inbound.objects.filter(pk=early.pk).update(call=call, agent=early.agent or line_agent(call), updated_at=timezone.now())
            continue
        caller = who_called(number, directory)
        Inbound.objects.get_or_create(call=call, defaults={
            'kind': Inbound.CALLBACK if caller else Inbound.ENQUIRY, 'caller_number': number,
            'caller_name': (caller or {}).get('name', '') or call.caller_name, 'caller_email': email_key((caller or {}).get('email', '')),
            'caller_role': (caller or {}).get('role', ''), 'line': normalize_phone(call.callee_number), 'received_at': call.started_at,
            'agent': line_agent(call)})
        added += 1
    result.update(inbound_added=added, inbound_done=close_answered())
    return result


def close_answered():
    """Close each open follow-up whose number was called back, or that called again and got through."""
    closed = 0
    for item in Inbound.objects.filter(status='open').order_by('received_at'):
        later = ZoomPhoneCall.objects.filter(started_at__gt=item.received_at)
        back = later.filter(direction='outbound', callee_number__in=_forms(item.caller_number)).order_by('started_at').first()
        through = later.filter(direction='inbound', result='answered', caller_number__in=_forms(item.caller_number)).order_by('started_at').first()
        first = min((call for call in (back, through) if call), key=lambda call: call.started_at, default=None)
        if not first:
            continue
        how = 'called_back' if first is back else 'got_through'
        match = CallMatch.objects.filter(call=first).select_related('agent').first()
        who = match.agent.display_name if match else (first.caller_name if how == 'called_back' else '')
        Inbound.objects.filter(pk=item.pk, status='open').update(
            status='done', done_how=how, done_at=first.started_at, done_call=first, done_by=who or 'Zoom', updated_at=timezone.now())
        closed += 1
    return closed


def _forms(number):
    """The ways Zoom may have written the number: as dialled (+44…) or in national form (0…)."""
    forms = {number}
    if number.startswith('+44'):
        forms.add('0' + number[3:])
    return list(forms)


def link_answered(now):
    """An answered call from a learner on a specialist's own number: linked to the learner's cases due now, as a call
    the specialist made from here, so its outcome is saved with the after-call form and its recording is reviewed."""
    from .zoom_views import current_account_filter
    calls = ZoomPhoneCall.objects.filter(current_account_filter(), direction='inbound', result='answered', ended_at__isnull=False,
                                         started_at__gte=now - ANSWERED_LOOKBACK, callmatch__isnull=True)
    directory = caller_directory()
    linked = 0
    for call in calls:
        caller = who_called(normalize_phone(call.caller_number), directory)
        agent = line_agent(call)
        if caller and caller['role'] == 'learner' and agent and link_call(call, agent, caller['email']):
            linked += 1
    return linked


@transaction.atomic(using=DB)
def link_call(call, agent, learner_email):
    """Link an answered incoming call to the learner's open cases the specialist may work. False when none is due."""
    from .services import Conflict, apply_call_result, call_cases, claim, event
    call = ZoomPhoneCall.objects.select_for_update().get(pk=call.pk)
    if CallMatch.objects.filter(call=call).exists():
        return False
    start = CaseTicket.objects.open().filter(learner_email__iexact=learner_email).exclude(source_type__in=('satisfaction', 'employer_feedback'))
    first = start.filter(created_at__lte=call.started_at).order_by('pk').first()
    if not first:
        return False
    tickets = []
    for ticket in call_cases(first, call.started_at):
        try:
            claim(ticket.pk, agent, timezone.now(), actor=agent.display_name)
        except (Conflict, PermissionDenied):
            continue   # another specialist's learner, or on another call: left as it is
        tickets.append(ticket)
    if not tickets:
        return False
    number = normalize_phone(call.caller_number)
    intent = CallIntent.objects.create(agent=agent, learner_email=email_key(learner_email), number=number, matched_call=call)
    intent.tickets.add(*tickets)
    match = CallMatch.objects.create(call=call, agent=agent, learner_email=email_key(learner_email), manual=False)
    for ticket in tickets:
        CaseCall.objects.create(ticket=ticket, match=match)
        event(ticket, 'inbound_call', {'intent_id': intent.pk, 'match_id': match.pk, 'number': number}, agent=agent, call=call)
    apply_call_result(match)
    return True


def open_callbacks():
    """Learner email -> when they last called and were missed, for the follow-ups still open. {} before the table exists."""
    if not ready():
        return {}
    found = {}
    for email, at in Inbound.objects.filter(status='open', kind=Inbound.CALLBACK).exclude(caller_email='').values_list('caller_email', 'received_at'):
        found[email] = max(found.get(email, at), at)
    return found


def visible(items, user, agent):
    """What this person sees: a director everything; a specialist the call-backs of their learners (or to their number
    when the learner has nobody), and unknown callers to their number or given to them."""
    from .access import is_director
    if is_director(user):
        return items
    if not agent:
        return items.none()
    from .allocation import learner_owner, owners
    allocated = owners()

    def theirs(item):
        owner = learner_owner(item.caller_email, allocated) if item.caller_email else None
        # The learner's specialist; for a learner nobody looks after, whoever's number was called (or anyone).
        return owner == agent.pk if owner else item.agent_id in (agent.pk, None)
    mine = [item.pk for item in items.filter(kind=Inbound.CALLBACK) if theirs(item)]
    return items.filter(Q(pk__in=mine) | Q(kind=Inbound.ENQUIRY, assigned_agent=agent)
                        | Q(kind=Inbound.ENQUIRY, assigned_agent=None, agent=agent))


def row(item, now):
    call = item.call
    return {
        'id': item.pk, 'kind': item.kind, 'caller_number': item.caller_number, 'caller_name': item.caller_name,
        'caller_email': item.caller_email, 'caller_role': item.caller_role, 'line': item.line,
        'received_at': item.received_at, 'result': call.result if call else 'voicemail',
        'agent': item.agent.display_name if item.agent else '', 'assigned_agent_id': item.assigned_agent_id,
        'assigned_agent': item.assigned_agent.display_name if item.assigned_agent else '',
        'status': item.status, 'done_how': item.done_how, 'done_by': item.done_by, 'done_at': item.done_at,
        'note': item.note, 'voicemail_id': item.voicemail_id,
        'voicemail': {'duration_seconds': item.voicemail.duration_seconds, 'transcript_status': item.voicemail.transcript_status,
                      'transcript': item.voicemail.transcript_text} if item.voicemail else None,
        # The learner's case to call them from (the Call button there is what counts the call).
        'case_id': CaseTicket.objects.open().filter(learner_email__iexact=item.caller_email).exclude(source_type='satisfaction')
        .order_by('pk').values_list('pk', flat=True).first() if item.caller_email else None,
        'waited_minutes': round(((item.done_at or now) - item.received_at).total_seconds() / 60),
    }


def listing(user, agent, kind, status, days, now=None, of_agent=None):
    """The follow-ups of one kind this person sees (a director may narrow them to one specialist's desk), newest first, with
    how quickly call-backs were made."""
    if not ready():
        raise ValueError(NOT_SET_UP)
    now = now or timezone.now()
    items = Inbound.objects.filter(kind=kind).select_related('call', 'voicemail', 'agent', 'assigned_agent')
    items = visible(items, user, agent)
    if of_agent:   # what that specialist sees on their own desk
        items = visible(items, of_agent.user, of_agent)
    if status == 'open':
        shown = items.filter(status='open')
    else:
        shown = items.filter(status='done', done_at__gte=now - timedelta(days=days))
    recent = items.filter(received_at__gte=now - timedelta(days=days))
    done = [item for item in recent.filter(status='done', done_how__in=('called_back', 'got_through'))]
    waits = sorted((item.done_at - item.received_at).total_seconds() / 60 for item in done)
    return {
        'items': [row(item, now) for item in shown[:300]],
        'summary': {
            'open': items.filter(status='open').count(), 'received': recent.count(), 'done': len(done),
            'median_minutes': round(waits[len(waits) // 2]) if waits else None,
            'within_hour': sum(wait <= 60 for wait in waits), 'days': days,
        },
    }


@transaction.atomic(using=DB)
def change(pk, user, agent, action, note='', assign_to=None):
    """Mark a follow-up done (with a note), reopen it, or give an enquiry to a specialist (directors)."""
    from .access import is_director
    if not ready():
        raise ValueError(NOT_SET_UP)
    item = Inbound.objects.select_for_update().filter(pk=pk).first()
    if not item or not visible(Inbound.objects.filter(pk=pk), user, agent).exists():
        raise PermissionDenied('This missed call is not one of yours.')
    actor = agent.display_name if agent else user.get_username()
    note = str(note or '').strip()[:2000]
    if action == 'done':
        if item.status == 'done':
            raise ValueError('It is already done.')
        if not note:
            raise ValueError('Say what happened, e.g. "Sent the course details by email".')
        item.status, item.done_how, item.done_by, item.done_at, item.note = 'done', 'marked', actor, timezone.now(), note
    elif action == 'reopen':
        if item.status != 'done':
            raise ValueError('It is still open.')
        item.status, item.done_how, item.done_by, item.done_at, item.done_call = 'open', '', '', None, None
        item.note = '\n'.join(part for part in (item.note, f'Reopened by {actor}: {note}' if note else f'Reopened by {actor}') if part)
    elif action == 'assign':
        if not is_director(user):
            raise PermissionDenied('Only a director gives enquiries to a specialist.')
        if item.kind != Inbound.ENQUIRY:
            raise ValueError('Call-backs go to the learner’s specialist.')
        target = Agent.objects.filter(pk=assign_to, active=True).first() if assign_to else None
        if assign_to and not target:
            raise ValueError('Choose an active specialist.')
        item.assigned_agent = target
    else:
        raise ValueError('Unknown action.')
    item.save()
    return item


def callback_stats(agent, lower, upper):
    """A specialist's call-backs in a period: received, called back, how quickly, still open."""
    if not ready():
        return None
    items = list(Inbound.objects.filter(kind=Inbound.CALLBACK, received_at__gte=lower, received_at__lt=upper)
                 .filter(Q(done_call__callmatch__agent=agent) | Q(agent=agent)).distinct())
    done = [item for item in items if item.status == 'done' and item.done_how in ('called_back', 'got_through')]
    waits = sorted((item.done_at - item.received_at).total_seconds() / 60 for item in done)
    return {'received': len(items), 'done': len(done), 'open': sum(item.status == 'open' for item in items),
            'median_minutes': round(waits[len(waits) // 2]) if waits else None}
