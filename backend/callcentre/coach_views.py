"""The coaches' screen of the Engagement Centre (coach_centre.py). Only accounts with Engagement Centre coach ticked get
in, and the coach is the signed-in account's email: nothing the browser sends names the coach."""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST

from . import coach_centre
from .access import coach_refused
from .views import body, guarded

coach_only = guarded(lambda user: coach_refused(user))


def display_name(user):
    return f'{user.first_name} {user.last_name}'.strip() or user.get_username()


def overview(request, **extra):
    return JsonResponse({**coach_centre.overview(request.user.email, display_name(request.user)), **extra})


@coach_only
@require_GET
def coach_home(request):
    return overview(request)


@coach_only
@require_POST
@csrf_protect
def coach_caught_up(request):
    """Mark the coach's missed lectures as caught up in a catch-up session with them."""
    data = body(request)
    closed = coach_centre.mark_caught_up(request.user.email, display_name(request.user), data.get('ids'), data.get('note'))
    return overview(request, closed=closed)


@coach_only
@require_POST
@csrf_protect
def coach_do_not_call(request):
    """Take one of the coach's learners off every call list, or lift what a coach added."""
    data, actor = body(request), display_name(request.user)
    if data.get('action') == 'add':
        coach_centre.take_off_lists(request.user.email, actor, data.get('learner_email'), data.get('reason'),
                                    data.get('note'), data.get('until'))
    elif data.get('action') == 'remove':
        coach_centre.lift(request.user.email, actor, data.get('id'), data.get('note'))
    else:
        raise ValueError('Unknown action.')
    return overview(request)
