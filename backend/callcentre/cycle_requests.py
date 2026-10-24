"""Requests for an early cycle, kept apart from cycle.py so views can ask for one without importing the pipeline."""
from datetime import timedelta

from django.utils import timezone

from .models import CycleState

CALL_SYNC_REQUEST = 'call_sync_request'


def request_call_sync(actor, gap=timedelta(seconds=30)):
    """A call ended (in the page, or Zoom's webhook says so): ask the worker for a quick call sync (at most one per gap)."""
    now = timezone.now()
    state, _ = CycleState.objects.get_or_create(name=CALL_SYNC_REQUEST)
    if state.last_success_at and state.last_success_at > now - gap:
        return False
    CycleState.objects.filter(name=CALL_SYNC_REQUEST).update(last_success_at=now, details={'by': actor})
    return True


def call_sync_requested(since):
    return CycleState.objects.filter(name=CALL_SYNC_REQUEST, last_success_at__gt=since).exists()
