"""What changed in Zoom: numbers added or removed, a number given to someone else or renamed, automatic recording
switched on or off. Checked hourly by the cycle (sooner when a Zoom webhook says something changed), by comparing
each account's numbers with the last check. Read-only towards Zoom.
"""
import logging
from datetime import timedelta

from django.utils import timezone

from .models import CycleState
from .rules import parse_moment

logger = logging.getLogger(__name__)
SNAPSHOT = 'zoom_snapshot'
CHANGES = 'zoom_changes'
EVERY = timedelta(hours=1)
KEEP = 200


def _view(item):
    recording = item.get('recording') or {}
    return {'name': item['display_name'], 'owner': item['assignee'], 'owner_type': item['assignee_type'], 'status': item['status'],
            'recording': recording.get('state', 'unknown'), 'recorded_calls': recording.get('calls', ''),
            'listed': item.get('listed', False), 'specialists': item.get('specialists', [])}


def differences(before, after):
    """(what, serious) for one number seen in both checks. Serious: it can stop calls being matched or recorded."""
    found = []
    listed = after['listed']
    if before['owner'] != after['owner']:
        found.append((f'now belongs to {after["owner"] or "nobody"} in Zoom (was {before["owner"] or "nobody"})', listed))
    if before['name'] != after['name']:
        found.append((f'renamed in Zoom from “{before["name"] or "no name"}” to “{after["name"] or "no name"}”', False))
    if before['recording'] != after['recording'] and 'unknown' not in (before['recording'], after['recording']):
        found.append((f'automatic recording turned {after["recording"]}', listed and after['recording'] == 'off'))
    elif before['recording'] == after['recording'] == 'on' and before['recorded_calls'] != after['recorded_calls']:
        found.append((f'automatic recording now records {after["recorded_calls"] or "other calls"}', False))
    if before['status'] != after['status']:
        found.append((f'status in Zoom changed from {before["status"] or "none"} to {after["status"] or "none"}', False))
    return found


def check(now=None, force=False):
    """Compare every account's numbers with the last check; record what changed. Returns how many changes, or None when
    it is not time yet. An account Zoom does not answer for keeps its last check."""
    from .zoom_accounts import labels, numbers
    now = now or timezone.now()
    state = CycleState.objects.filter(name=SNAPSHOT).first()
    if not force and state and state.last_success_at and state.last_success_at > now - EVERY:
        return None
    previous = state.details if state and isinstance(state.details, dict) else {}
    snapshot, changes = dict(previous), []
    for key, label in labels().items():
        try:
            found = {item['number']: _view(item) for item in numbers(key)}
        except Exception as exc:   # noqa: BLE001 - one account failing keeps its last check; the others go on
            logger.warning('Zoom check for %s failed: %s', key, exc)
            continue
        old = previous.get(key)
        if old is not None:
            for number in sorted(set(found) - set(old)):
                changes.append({'number': number, 'account': label, 'what': 'added to the account in Zoom', 'serious': False})
            for number in sorted(set(old) - set(found)):
                changes.append({'number': number, 'account': label, 'what': 'removed from the account in Zoom',
                                'serious': old[number]['listed']})
            for number in sorted(set(found) & set(old)):
                for what, serious in differences(old[number], found[number]):
                    changes.append({'number': number, 'account': label, 'what': what, 'serious': serious,
                                    'specialists': found[number]['specialists']})
        snapshot[key] = found
    CycleState.objects.update_or_create(name=SNAPSHOT, defaults={'details': snapshot, 'last_success_at': now})
    if changes:
        log = CycleState.objects.filter(name=CHANGES).first()
        kept = list(log.details.get('changes', [])) if log and isinstance(log.details, dict) else []
        stamped = [{**change, 'at': now.isoformat()} for change in changes]
        CycleState.objects.update_or_create(name=CHANGES, defaults={'details': {'changes': (stamped + kept)[:KEEP]}, 'last_success_at': now})
    return len(changes)


def recent(days=30, now=None):
    now = now or timezone.now()
    log = CycleState.objects.filter(name=CHANGES).first()
    rows = log.details.get('changes', []) if log and isinstance(log.details, dict) else []
    checked = CycleState.objects.filter(name=SNAPSHOT).values_list('last_success_at', flat=True).first()
    return {'changes': [row for row in rows if parse_moment(row['at']) >= now - timedelta(days=days)], 'checked_at': checked}
