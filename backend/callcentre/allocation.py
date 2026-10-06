"""Learner allocation: one engagement specialist per learner, chosen by a manager.

A learner's current and future cases follow their specialist; other specialists cannot claim them.
Learners without an allocation stay in the shared queue. Until the allocation tables are created
(see docs/callcentre-port/allocation.sql) every learner is in the shared queue.
"""
from django.db import ProgrammingError, transaction

from .db import DB
from .models import Allocation


def owners(emails=None):
    """{learner email: agent id} for allocated learners."""
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            rows = Allocation.objects.exclude(agent=None)
            if emails is not None:
                rows = rows.filter(learner_email__in=list(emails))
            return dict(rows.values_list('learner_email', 'agent_id'))
    except ProgrammingError:
        return {}
