"""The Events hub on the Engagement Centre: the Today page's event calls, the director's panel, and the way in.

Everything comes from the Events server (events_hub.py). When it is not connected or does not answer, these return
``enabled``/``error`` so the pages show a quiet note instead of failing.
"""
from django.core import signing
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, HttpResponseRedirect, JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_http_methods

from . import events_hub
from .access import is_director
from .models import ZoomPhoneRecording
from .views import authenticated, body

# Days ahead the allocation page lists; Events allows 1 to 180.
ALLOCATION_DAYS = (14, 30, 60, 90, 180)


@never_cache
@authenticated
@require_GET
def events_open(request):
    """Opens the Events hub signed in as this account. The pass is made at the click and is in the redirect only."""
    try:
        url = events_hub.entry_url(request.user, request.GET.get('next', ''))
    except events_hub.EventsHubError as exc:
        return JsonResponse({'detail': str(exc)}, status=503)
    return HttpResponseRedirect(url)


@authenticated
@require_GET
def events_my_calls(request):
    """This specialist's event calls and own event-call numbers for the Today page."""
    result = {'enabled': events_hub.enabled(), 'can_open': events_hub.entry_enabled(), 'tasks': [], 'numbers': None}
    if result['enabled']:
        try:
            result['tasks'], result['numbers'] = events_hub.agent_tasks(request.user)
        except events_hub.EventsHubError as exc:
            result['error'] = str(exc)
    return JsonResponse(result)


@never_cache
@authenticated
@require_GET
def events_recording_audio(request, token):
    """Play the recording of a call made from the Events hub. The link is signed here when the call is matched
    (events_hub.recording_link); it plays to a director, or to the specialist whose line made the call."""
    from .services import agent_for, identify_agent
    from .zoom_phone import ZoomError
    from .zoom_recordings import recording_audio
    from .zoom_views import current_account_filter, recording_calls
    try:
        data = signing.loads(token, salt=events_hub.RECORDING_SALT)
        recording_id, call_pk = int(data['r']), int(data['c'])
    except (signing.BadSignature, KeyError, TypeError, ValueError):
        return JsonResponse({'detail': 'Recording not found.'}, status=404)
    recording = ZoomPhoneRecording.objects.filter(current_account_filter(), pk=recording_id).first()
    zoom_call = recording_calls(recording).filter(pk=call_pk).first() if recording else None
    if zoom_call is None:
        return JsonResponse({'detail': 'Recording not found.'}, status=404)
    if not is_director(request.user):
        agent, on_call = agent_for(request.user), identify_agent(zoom_call)
        if agent is None or on_call is None or on_call.pk != agent.pk:
            raise PermissionDenied('Only directors or the specialist on this call can play its recording.')
    try:
        file, content_type = recording_audio(recording)
    except ZoomError as exc:
        return JsonResponse({'detail': str(exc), 'source': 'zoom'}, status=502)
    response = FileResponse(file, content_type=content_type)
    response['Cache-Control'] = 'no-store'
    return response


@authenticated
@require_GET
def events_summary(request):
    """The director's Events panel: the next week's events, calls open now, the last event and feedback."""
    if not is_director(request.user):
        raise PermissionDenied('Only directors see the Events summary.')
    result = {'enabled': events_hub.enabled(), 'can_open': events_hub.entry_enabled(), 'summary': None}
    if result['enabled']:
        try:
            result['summary'] = events_hub.director_summary()
        except events_hub.EventsHubError as exc:
            result['error'] = str(exc)
    return JsonResponse(result)


@authenticated
@require_http_methods(['GET', 'POST'])
@csrf_protect
def events_allocations(request):
    """The Director page's Event allocation: which specialists call each event's bookings. Kept in Events; read and
    saved here so directors allocate events where they allocate learners."""
    if not is_director(request.user):
        raise PermissionDenied('Only directors allocate events.')
    if not events_hub.enabled():
        return JsonResponse({'enabled': False, 'board': None})
    if request.method == 'POST':
        try:
            data = body(request, limit=400000)
        except ValueError as exc:
            return JsonResponse({'detail': str(exc)}, status=400)
        changes, reason = data.get('changes'), data.get('reason', '')
        if not isinstance(changes, list) or not changes or not isinstance(reason, str):
            return JsonResponse({'detail': 'Send the changes to save.'}, status=400)
        try:
            changed = events_hub.save_allocation(request.user, changes, reason.strip()[:500])
        except events_hub.AllocationStale as exc:
            names = f' ({", ".join(exc.events[:5])}{" and more" if len(exc.events) > 5 else ""})' if exc.events else ''
            return JsonResponse({'detail': f'{exc}{names}. Nothing was saved: refresh to see the latest, then make your changes again.',
                                 'events': exc.events}, status=409)
        except events_hub.AllocationRefused as exc:
            return JsonResponse({'detail': str(exc)}, status=400)
        except events_hub.EventsHubError as exc:
            return JsonResponse({'detail': str(exc)}, status=503)
        return JsonResponse({'changed': changed})
    try:
        days = int(request.GET.get('days', 60))
    except ValueError:
        days = 0
    if days not in ALLOCATION_DAYS:
        return JsonResponse({'detail': f'Choose {", ".join(map(str, ALLOCATION_DAYS))} days.'}, status=400)
    try:
        return JsonResponse({'enabled': True, 'board': events_hub.allocation_board(days)})
    except events_hub.EventsHubError as exc:
        return JsonResponse({'enabled': True, 'board': None, 'error': str(exc)})
