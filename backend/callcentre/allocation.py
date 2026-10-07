"""Learner allocation: one engagement specialist per learner, chosen by a manager.

A learner's current and future cases follow their specialist; other specialists cannot claim them.
A line manager's employer survey follows the specialist of their learners (``manager_owners``).
Learners without an allocation stay in the shared queue. Until the allocation tables are created
(see docs/callcentre-port/allocation.sql) every learner is in the shared queue.
"""
from collections import Counter

from django.db import ProgrammingError, transaction

from .db import DB
from .models import Allocation


def owners(emails=None):
    """{learner email: agent id} for learners allocated to an active specialist."""
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            rows = Allocation.objects.filter(agent__active=True, agent__user__is_active=True)
            if emails is not None:
                rows = rows.filter(learner_email__in=list(emails))
            return dict(rows.values_list('learner_email', 'agent_id'))
    except ProgrammingError:
        return {}


def manager_owners(allocated=None):
    """{line-manager email: agent id}. An employer case follows the specialist who looks after most
    of that manager's learners; on a tie, the agent with the lowest id."""
    from .sources import cached_directory   # sources imports services, which imports this module
    allocated = owners() if allocated is None else allocated
    found = {}
    for manager, learners in cached_directory().managers.items():
        counts = Counter(allocated[email] for email in learners if email in allocated)
        if counts:
            found[manager] = min(counts, key=lambda agent: (-counts[agent], agent))
    return found
