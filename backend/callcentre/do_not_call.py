"""Do not call: learners a director takes off every call list while they stay active learners (for example a medical
reason that stops them taking phone calls). Their cases stay in the database but are on no list (``rules.out_of_scope``)
and nobody can phone them (``services.create_intent``); emails are still allowed. A learner who has left needs no entry:
a Withdrawn status in the LMS or Aptem already takes them off.

Entries live in ``callcenter_do_not_call``; removing someone ends the entry and keeps it as history. Every case list
reads the table (``listed``), so docs/callcentre-port/do_not_call.sql must run before this code is deployed.
"""
from django.db import IntegrityError, ProgrammingError, transaction
from django.utils import timezone

from .db import DB
from .models import DoNotCall
from .rules import email_key

NOT_SET_UP = 'Do not call is not set up yet. Run docs/callcentre-port/do_not_call.sql on the call-centre database.'
# Kept to what the call list needs: never a diagnosis.
REASONS = {'medical': 'Medical: cannot take phone calls', 'requested': 'Asked not to be called', 'other': 'Other'}


def current():
    """The entries in force, or None while the table is missing."""
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            return list(DoNotCall.objects.filter(removed_at=None).order_by('learner_name', 'learner_email'))
    except ProgrammingError:
        return None


def listed():
    """The emails on the list, as a subquery: case lists leave them out in the same query."""
    return DoNotCall.objects.filter(removed_at=None).values('learner_email')


def emails():
    """Emails of the learners on the list (empty while it is not set up)."""
    return frozenset(email_key(entry.learner_email) for entry in current() or [])


def entry_json(entry):
    return {'id': entry.pk, 'learner_email': entry.learner_email, 'learner_name': entry.learner_name,
            'reason': entry.reason, 'reason_label': REASONS.get(entry.reason, entry.reason), 'note': entry.note,
            'added_by': entry.added_by, 'added_at': entry.added_at, 'removed_by': entry.removed_by,
            'removed_at': entry.removed_at, 'removed_note': entry.removed_note}


def listing():
    entries = current()
    if entries is None:
        return {'set_up': False, 'not_set_up': NOT_SET_UP, 'reasons': REASONS, 'current': [], 'history': []}
    history = DoNotCall.objects.exclude(removed_at=None).order_by('-removed_at')[:50]
    return {'set_up': True, 'not_set_up': '', 'reasons': REASONS,
            'current': [entry_json(entry) for entry in entries], 'history': [entry_json(entry) for entry in history]}


def add(email, name, reason, note, actor):
    """Take a learner off every call list. ``email`` is their main email in the learner directory."""
    email, note = email_key(email), str(note or '').strip()
    if not email:
        raise ValueError('Choose a learner.')
    if reason not in REASONS:
        raise ValueError('Choose a reason.')
    if not 5 <= len(note) <= 1000:
        raise ValueError('Add a note of 5 to 1,000 characters: what the team needs to know, not medical details.')
    if current() is None:
        raise ValueError(NOT_SET_UP)
    try:
        with transaction.atomic(using=DB):
            return DoNotCall.objects.create(learner_email=email, learner_name=str(name or '').strip()[:255], reason=reason,
                                            note=note, added_by=actor)
    except IntegrityError:
        raise ValueError('This learner is already on the do-not-call list.') from None


def remove(entry_id, note, actor):
    """Put a learner back on the call lists; the entry is kept as history."""
    note = str(note or '').strip()
    if not 5 <= len(note) <= 1000:
        raise ValueError('Say why the learner can be called again (5 to 1,000 characters).')
    with transaction.atomic(using=DB):
        entry = DoNotCall.objects.select_for_update().filter(pk=entry_id, removed_at=None).first()
        if entry is None:
            raise ValueError('This learner is no longer on the list. Reload the page.')
        entry.removed_at, entry.removed_by, entry.removed_note = timezone.now(), actor, note
        entry.save(update_fields=['removed_at', 'removed_by', 'removed_note'])
    return entry
