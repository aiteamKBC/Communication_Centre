"""Task delegation: a director hands one list of a desk to another specialist until recalled.

A task is one list (``category``: Next day, Missed, Due, Follow-ups...) of one desk: a specialist's (``from_agent``),
the shared queue, or the employer calls. It covers the learners chosen for it, and with ``catch_new`` every other
case on that list too, including new ones, so it keeps taking the list until a director recalls it. A list can be
split into parts (one task each, sharing a ``group``), each with its receiver and its place in that receiver's Today
order (``after_topic``).

While a learner is covered, the receiver works their cases on that list and nobody else does (the owner sees them
read-only); the receiver's call also covers the learner's other due cases, as every call does, without taking those
from their owner. A learner is with one receiver at a time: when two tasks would send them to different people, the
learner's earliest task wins (a learner chosen by name before a list's "and new ones"). Calls count for whoever
makes them. Recalling a task gives everything back to its owner as it stands.

A specialist marked absent has a line cover: the missed calls to their number that no task covers go to them.
Until docs/callcentre-port/task_delegation.sql runs, nothing is delegated.
"""
import uuid
from collections import defaultdict
from datetime import datetime, time, timedelta

from django.db import IntegrityError, ProgrammingError, transaction
from django.db.models import F, OuterRef, Q, Subquery
from django.utils import timezone

from .allocation import learner_owner, manager_owners, owners
from .db import DB
from .employer_desk import EMPLOYER as EMPLOYER_CASE, optional, specialists
from .models import (Absence, Agent, CaseTicket, DelegatedLearner, DelegatedTask, DelegationHistory, TicketEvent)
from .rules import LONDON, email_key, next_workday, same_contact

NOT_SET_UP = 'Task delegation is not set up yet. Run docs/callcentre-port/task_delegation.sql on the call-centre database.'
CATEGORIES = {
    'due': 'Due', 'nextday': 'Next Day', 'missed': 'Missed', 'learner_satisfaction': 'Learner Satisfaction',
    'employer_satisfaction': 'Employer Satisfaction', 'manager': 'Extra Calls by Manager', 'tech': 'Technical issues',
    'followups': 'Follow-ups',
}
SOURCES = (DelegatedTask.AGENT, DelegatedTask.SHARED, DelegatedTask.EMPLOYER)
FIRST = ''   # after_topic: before everything else on the receiver's Today page


def category_for(ticket, next_day):
    """The list a case is on (the desk's ``categoryFor``), or None."""
    source = ticket.source_type
    if source == 'tech_support':
        return 'tech'
    if source in ('attendance', 'pr_missed', 'mcm_missed', 'signature'):
        return 'missed'
    if source in ('pr', 'mcm', 'otj', 'epa'):
        return 'due'
    if source == 'reminder':
        return 'nextday' if ticket.booking_at and ticket.booking_at.astimezone(LONDON).date() == next_day else None
    if source == EMPLOYER_CASE:
        return 'employer_satisfaction'
    if source == 'learner_satisfaction':
        return 'learner_satisfaction'
    if source == 'manual':
        return 'manager'
    return None


def member(ticket):
    """How a task names a person: their email, 'employer:<email>' as a line manager, or the case without an email."""
    email = email_key(ticket.learner_email)
    if not email:
        return f'case:{ticket.pk}'
    return f'employer:{email}' if ticket.source_type == EMPLOYER_CASE else email


def active_tasks():
    """Tasks not recalled, to an active specialist, oldest first, each with ``contacts`` (its chosen learners)."""
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            tasks = list(DelegatedTask.objects.filter(recalled_at__isnull=True, to_agent__active=True, to_agent__user__is_active=True)
                         .select_related('to_agent', 'from_agent').order_by('created_at', 'pk'))
            chosen = defaultdict(set)
            for task_id, contact in DelegatedLearner.objects.filter(task__in=tasks).values_list('task_id', 'contact'):
                chosen[task_id].add(contact)
    except ProgrammingError:
        return []
    for task in tasks:
        task.contacts = chosen[task.pk]
    return tasks


def followup_agents(ticket_ids):
    """{case id: the specialist whose saved call set its current follow-up} (the desk's Follow-ups list)."""
    from .services import NOT_DISCUSSED   # services imports this module
    latest = TicketEvent.objects.filter(ticket=OuterRef('pk'), kind__in=('outcome', NOT_DISCUSSED)).filter(
        Q(ticket__evidence_after__isnull=True) | Q(created_at__gt=F('ticket__evidence_after'))).order_by('-created_at', '-id')
    return {pk: agent for pk, agent in CaseTicket.objects.filter(pk__in=ticket_ids).annotate(
        followup=Subquery(latest.values('agent_id')[:1])).values_list('pk', 'followup') if agent}


class Cover:
    """A case covered by ``task``: on the task's list (``direct``), or another case of a learner the task covers, which
    the receiver's call covers too."""
    __slots__ = ('task', 'direct')

    def __init__(self, task, direct):
        self.task, self.direct = task, direct


class Coverage:
    """The active tasks and what each case is covered by."""

    def __init__(self, tasks=None, today=None):
        self.tasks = active_tasks() if tasks is None else tasks
        if self.tasks:
            self.allocated = owners()
            self.team = specialists()
            self._managers = None
            self.next_day = next_workday(today or timezone.now().astimezone(LONDON).date())

    def owner(self, ticket):
        """The specialist whose desk the case is on (None: the shared queue), as the overview shows it."""
        if ticket.source_type == EMPLOYER_CASE:
            if self.team:
                return None
            if self._managers is None:
                self._managers = manager_owners(self.allocated)
            return self._managers.get(ticket.learner_email)
        owner = learner_owner(ticket.learner_email, self.allocated)
        return None if owner in self.team else owner

    def lists(self, ticket, followup_agent=None):
        """Every (source, from agent, list) the case is on: its own list, and the Follow-ups of whoever set its follow-up."""
        if optional(ticket.source_data) or ticket.status == 'resolved':
            return []
        found = []
        category = category_for(ticket, self.next_day)
        if category:
            if ticket.source_type == EMPLOYER_CASE and self.team:
                found.append((DelegatedTask.EMPLOYER, None, category))
            else:
                owner = self.owner(ticket)
                found.append((DelegatedTask.AGENT, owner, category) if owner else (DelegatedTask.SHARED, None, category))
        if followup_agent:
            found.append((DelegatedTask.AGENT, followup_agent, 'followups'))
        return found

    def resolve(self, tickets, followups=None):
        """{case id: Cover} for the cases a task covers. ``tickets`` should hold every open case of the people asked
        about, so one receiver is chosen per person."""
        if not self.tasks:
            return {}
        followups = followups or {}
        best = {}
        for ticket in tickets:
            contact, lists = member(ticket), self.lists(ticket, followups.get(ticket.pk))
            for task in self.tasks:
                if (task.source, task.from_agent_id, task.category) not in lists:
                    continue
                # A learner chosen by name beats a list's "and new ones"; then the earliest task.
                rank = 0 if contact in task.contacts else 1 if task.catch_new else None
                if rank is None:
                    continue
                candidate = (rank, task.created_at, task.pk)
                if ticket.pk not in best or candidate < best[ticket.pk][0]:
                    best[ticket.pk] = (candidate, task)
        receivers = {}
        for ticket in tickets:
            if ticket.pk in best:
                contact = member(ticket)
                if contact not in receivers or best[ticket.pk][0] < receivers[contact][0]:
                    receivers[contact] = best[ticket.pk]
        found = {}
        for ticket in tickets:
            receiver = receivers.get(member(ticket))
            if not receiver:
                continue
            own = best.get(ticket.pk)
            found[ticket.pk] = (Cover(own[1], True) if own and own[1].to_agent_id == receiver[1].to_agent_id
                                else Cover(receiver[1], False))
        return found


def cover_of(ticket):
    """What covers this case (None: nothing), judged with the person's other open cases."""
    coverage = Coverage()
    if not coverage.tasks:
        return None
    tickets = list(CaseTicket.objects.open().filter(same_contact(ticket))) if ticket.learner_email else []
    if ticket.pk not in {item.pk for item in tickets}:
        tickets.append(ticket)
    return coverage.resolve(tickets, followup_agents([item.pk for item in tickets])).get(ticket.pk)


def work_rule(ticket, agent):
    """What delegation says about this specialist working this case: True when they cover the learner (it overrides
    the allocation and the employer-desk split), a refusal when someone else covers this case, None when it says nothing."""
    cover = cover_of(ticket)
    if not cover:
        return None
    if cover.task.to_agent_id == agent.pk:
        return True
    if cover.direct:
        return (f'{cover.task.to_agent.display_name} covers this learner for now (a task from the director). '
                'Ask a director to recall it.')
    return None


def desk_name(task):
    if task.source == DelegatedTask.SHARED:
        return 'Shared queue'
    if task.source == DelegatedTask.EMPLOYER:
        return 'Employer calls'
    return task.from_agent.display_name if task.from_agent else 'Unknown'


def cover_json(cover):
    task = cover.task
    return {'task_id': task.pk, 'to_agent_id': task.to_agent_id, 'to_name': task.to_agent.display_name,
            'from_name': desk_name(task), 'direct': cover.direct}


def open_absences():
    """{absent specialist id: Absence}; {} before the tables exist."""
    try:
        with transaction.atomic(using=DB):
            return {item.agent_id: item for item in Absence.objects.filter(ended_at__isnull=True).select_related('agent', 'line_cover')}
    except ProgrammingError:
        return {}


def phone_covers():
    """For the missed calls: ({person: who covers them}, {absent specialist id: their line cover id or None})."""
    away = {agent_id: item.line_cover_id for agent_id, item in open_absences().items()}
    coverage = Coverage()
    if not coverage.tasks:
        return {}, away
    tickets = list(CaseTicket.objects.open())
    covered = coverage.resolve(tickets, followup_agents([ticket.pk for ticket in tickets]))
    people = {}
    for ticket in tickets:
        if ticket.pk in covered:
            people[member(ticket)] = covered[ticket.pk].task.to_agent_id
    return people, away


def task_json(task, counts=None):
    return {
        'id': task.pk, 'group': task.group, 'source': task.source, 'from_agent_id': task.from_agent_id, 'from_name': desk_name(task),
        'category': task.category, 'category_label': CATEGORIES.get(task.category, task.category),
        'to_agent_id': task.to_agent_id, 'to_name': task.to_agent.display_name, 'catch_new': task.catch_new,
        'after_topic': task.after_topic, 'learners': sorted(getattr(task, 'contacts', ())), 'absence_id': task.absence_id,
        'created_at': task.created_at, 'created_by': task.created_by, 'recalled_at': task.recalled_at,
        'recalled_by': task.recalled_by, 'seen_at': task.seen_at, **({'counts': counts} if counts is not None else {}),
    }


def _agent(pk, what):
    agent = Agent.objects.filter(pk=pk, active=True, user__is_active=True).first() if type(pk) is int else None
    if not agent:
        raise ValueError(f'Choose an active specialist {what}.')
    return agent


def _parts(source, from_agent, category, parts):
    """The parts of one list checked: who receives each, which learners, whether it takes the new ones, where it goes."""
    from .services import Conflict   # services imports this module
    if source not in SOURCES:
        raise ValueError('Choose whose list to delegate.')
    if category not in CATEGORIES:
        raise ValueError('Choose a list to delegate.')
    if source != DelegatedTask.AGENT and category == 'followups':
        raise ValueError('Follow-ups belong to a specialist: choose their desk.')
    if not isinstance(parts, list) or not 1 <= len(parts) <= 20:
        raise ValueError('Give the list to at least one specialist.')
    checked, chosen = [], set()
    for part in parts:
        if not isinstance(part, dict):
            raise ValueError('Give the list to at least one specialist.')
        receiver = _agent(part.get('to_agent_id'), 'to give it to')
        if from_agent and receiver.pk == from_agent.pk:
            raise ValueError(f'{receiver.display_name} cannot cover their own list.')
        learners = part.get('learners')
        catch_new = part.get('catch_new')
        if type(catch_new) is not bool or not isinstance(learners, list) or len(learners) > 5000 or any(
                not isinstance(item, str) or not item.strip() or len(item) > 300 for item in learners):
            raise ValueError('Choose the learners for each part, or the whole list.')
        if not learners and not catch_new:
            raise ValueError(f'Choose learners for {receiver.display_name}, or give them the whole list.')
        learners = {item.strip().lower() for item in learners}
        if learners & chosen:
            raise ValueError('A learner can be in one part only.')
        chosen |= learners
        after = part.get('after_topic', FIRST)
        if after != FIRST and after not in CATEGORIES and not (isinstance(after, str) and after.startswith('task:')):
            raise ValueError('Choose where the task goes on their Today page.')
        checked.append((receiver, learners, catch_new, after))
    if sum(1 for _, _, catch_new, _ in checked if catch_new) > 1:
        raise ValueError('Only one part can also take the list’s new learners.')
    same_list = DelegatedTask.objects.filter(recalled_at__isnull=True, source=source, from_agent=from_agent, category=category)
    if any(catch_new for _, _, catch_new, _ in checked) and same_list.filter(catch_new=True).exists():
        held = same_list.filter(catch_new=True).select_related('to_agent').first()
        raise Conflict(f'This list’s new learners already go to {held.to_agent.display_name}. Recall that task first.')
    taken = set(DelegatedLearner.objects.filter(task__in=same_list, contact__in=chosen).values_list('contact', flat=True))
    if taken:
        raise Conflict(f'{len(taken)} of these learners are already delegated from this list. Recall that task first, or leave them out.')
    return checked


def _create(source, from_agent, category, checked, actor, group, absence=None):
    tasks = []
    for receiver, learners, catch_new, after in checked:
        task = DelegatedTask.objects.create(source=source, from_agent=from_agent, category=category, to_agent=receiver,
                                            catch_new=catch_new, after_topic=after, group=group, absence=absence, created_by=actor)
        DelegatedLearner.objects.bulk_create([DelegatedLearner(task=task, contact=contact) for contact in sorted(learners)])
        DelegationHistory.objects.create(task=task, absence=absence, action='delegated', actor=actor, data={
            'source': source, 'from_agent_id': from_agent.pk if from_agent else None, 'category': category,
            'to_agent_id': receiver.pk, 'learners': len(learners), 'catch_new': catch_new, 'after_topic': after})
        tasks.append(task)
    return tasks


def _from(source, from_agent_id):
    """The specialist whose desk a list is from (None for the shared queue and the employer calls)."""
    if source != DelegatedTask.AGENT or type(from_agent_id) is not int:
        return None
    return Agent.objects.filter(pk=from_agent_id).first()


def delegate(data, actor):
    """Create the tasks for one list: ``{source, from_agent_id, category, parts: [{to_agent_id, learners, catch_new,
    after_topic}]}``. Returns the new tasks' ids."""
    source = data.get('source')
    from_agent = _from(source, data.get('from_agent_id'))
    if source == DelegatedTask.AGENT and not from_agent:
        raise ValueError('Choose whose list to delegate.')
    try:
        with transaction.atomic(using=DB):
            checked = _parts(source, from_agent, data.get('category'), data.get('parts'))
            return [task.pk for task in _create(source, from_agent, data['category'], checked, actor, str(uuid.uuid4()))]
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def recall(task_ids, actor):
    """Give these tasks back to their owners, as they stand. Returns how many were recalled."""
    if not isinstance(task_ids, list) or not task_ids or any(type(pk) is not int for pk in task_ids):
        raise ValueError('Choose the tasks to recall.')
    try:
        with transaction.atomic(using=DB):
            tasks = list(DelegatedTask.objects.select_for_update().filter(pk__in=task_ids, recalled_at__isnull=True))
            now = timezone.now()
            for task in tasks:
                task.recalled_at, task.recalled_by = now, actor
                task.save(update_fields=['recalled_at', 'recalled_by'])
                DelegationHistory.objects.create(task=task, action='recalled', actor=actor, data={'to_agent_id': task.to_agent_id})
            return len(tasks)
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def mark_absent(data, actor):
    """Mark a specialist away: ``{agent_id, line_cover_id, lists: [{category, parts: [...]}]}``, each list delegated
    from their desk like ``delegate`` (a list left out stays with them). Returns the absence id."""
    from .services import Conflict   # services imports this module
    agent = _agent(data.get('agent_id'), 'to mark absent')
    cover_id = data.get('line_cover_id')
    line_cover = _agent(cover_id, 'to cover their phone line') if cover_id is not None else None
    if line_cover and line_cover.pk == agent.pk:
        raise ValueError(f'{agent.display_name} cannot cover their own line.')
    lists = data.get('lists') or []
    if not isinstance(lists, list) or len(lists) > len(CATEGORIES):
        raise ValueError('Choose what happens to each list.')
    try:
        with transaction.atomic(using=DB):
            if Absence.objects.filter(agent=agent, ended_at__isnull=True).exists():
                raise Conflict(f'{agent.display_name} is already marked absent.')
            checked = []
            for item in lists:
                if not isinstance(item, dict):
                    raise ValueError('Choose what happens to each list.')
                checked.append((item.get('category'), _parts(DelegatedTask.AGENT, agent, item.get('category'), item.get('parts'))))
            if len({category for category, _ in checked}) != len(checked):
                raise ValueError('Each list once, please.')
            absence = Absence.objects.create(agent=agent, line_cover=line_cover, started_by=actor)
            group = str(uuid.uuid4())
            tasks = [task.pk for category, parts in checked for task in _create(DelegatedTask.AGENT, agent, category, parts, actor, group, absence)]
            DelegationHistory.objects.create(absence=absence, action='absent', actor=actor, data={
                'agent_id': agent.pk, 'line_cover_id': line_cover.pk if line_cover else None, 'tasks': tasks})
            return absence.pk
    except IntegrityError:
        raise Conflict(f'{agent.display_name} is already marked absent.') from None
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def mark_back(data, actor):
    """End a specialist's absence; with ``recall`` every task from their desk goes back to them. Returns how many."""
    agent_id = data.get('agent_id')
    if type(agent_id) is not int or type(data.get('recall')) is not bool:
        raise ValueError('Choose who is back, and whether their tasks come back to them.')
    try:
        with transaction.atomic(using=DB):
            absence = Absence.objects.select_for_update().filter(agent_id=agent_id, ended_at__isnull=True).first()
            if not absence:
                raise ValueError('This specialist is not marked absent.')
            absence.ended_at, absence.ended_by = timezone.now(), actor
            absence.save(update_fields=['ended_at', 'ended_by'])
            ids = list(DelegatedTask.objects.filter(recalled_at__isnull=True, source=DelegatedTask.AGENT, from_agent_id=agent_id)
                       .values_list('pk', flat=True)) if data['recall'] else []
            recalled = recall(ids, actor) if ids else 0
            DelegationHistory.objects.create(absence=absence, action='back', actor=actor, data={'agent_id': agent_id, 'recalled': recalled})
            return recalled
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def mark_seen(agent, task_ids):
    """The receiver opened their new tasks: the Today banner stops showing them."""
    if not isinstance(task_ids, list) or any(type(pk) is not int for pk in task_ids):
        raise ValueError('Choose the tasks.')
    try:
        with transaction.atomic(using=DB):
            return DelegatedTask.objects.filter(pk__in=task_ids, to_agent=agent, seen_at__isnull=True).update(seen_at=timezone.now())
    except ProgrammingError:
        return 0


def summary(day):
    """Each task live on ``day`` (London): learners it covers now, and what its receiver did for them that day."""
    start = datetime.combine(day, time.min, tzinfo=LONDON)
    end = start + timedelta(days=1)
    try:
        with transaction.atomic(using=DB):
            tasks = list(DelegatedTask.objects.filter(created_at__lt=end).filter(Q(recalled_at__isnull=True) | Q(recalled_at__gte=start))
                         .select_related('to_agent', 'from_agent').order_by('created_at', 'pk'))
    except ProgrammingError:
        return {'set_up': False, 'tasks': []}
    chosen = defaultdict(set)
    for task_id, contact in DelegatedLearner.objects.filter(task__in=tasks).values_list('task_id', 'contact'):
        chosen[task_id].add(contact)
    for task in tasks:
        task.contacts = chosen[task.pk]
    coverage = Coverage()
    open_now = defaultdict(set)
    if coverage.tasks:
        tickets = list(CaseTicket.objects.open())
        for pk, cover in coverage.resolve(tickets, followup_agents([ticket.pk for ticket in tickets])).items():
            if cover.direct:
                open_now[cover.task.pk].add(pk)
    rows = []
    for task in tasks:
        called = TicketEvent.objects.filter(kind='dial_requested', data__task_id=task.pk, created_at__gte=start, created_at__lt=end)
        ids = set(called.values_list('ticket_id', flat=True))
        done = TicketEvent.objects.filter(ticket_id__in=ids, agent_id=task.to_agent_id, created_at__gte=start, created_at__lt=end)
        rows.append({**task_json(task), 'counts': {
            'open': len(open_now.get(task.pk, ())), 'called': len(ids),
            'reached': done.filter(kind='outcome', data__outcome='reached').values('ticket_id').distinct().count(),
            'closed': done.filter(kind='resolved').values('ticket_id').distinct().count(),
        }})
    return {'set_up': True, 'tasks': rows}


def history(limit=50):
    try:
        with transaction.atomic(using=DB):
            return list(DelegationHistory.objects.order_by('-created_at', '-id').values(
                'id', 'task_id', 'absence_id', 'action', 'data', 'actor', 'created_at')[:limit])
    except ProgrammingError:
        return []
