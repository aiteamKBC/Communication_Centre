"""The coaches' screen of the Engagement Centre (coach_centre.py). Only accounts with Engagement Centre coach ticked get
in, and the coach is the signed-in account's email: nothing the browser sends names the coach.

Directors get the Coaches tab instead: every coach, and any coach's desk, named by the ``coach`` the page sends (a
director may open any desk). What a director does there is recorded as the director's."""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST

from . import coach_centre
from .access import coach_refused
from .manage_views import require_manager
from .rules import email_key
from .views import authenticated, body, guarded

coach_only = guarded(lambda user: coach_refused(user))


def display_name(user):
    return f'{user.first_name} {user.last_name}'.strip() or user.get_username()


def overview(email, name, **extra):
    return JsonResponse({**coach_centre.overview(email, name), **extra})


def caught_up(request, coach, name, role):
    """Mark the coach's missed lectures as caught up in a catch-up session with the coach."""
    data = body(request)
    closed = coach_centre.mark_caught_up(coach, display_name(request.user), data.get('ids'), data.get('note'), role)
    return overview(coach, name, closed=closed)


def do_not_call(request, coach, name, role):
    """Take one of the coach's learners off every call list, or lift an entry."""
    data, actor = body(request), display_name(request.user)
    if data.get('action') == 'add':
        coach_centre.take_off_lists(coach, actor, data.get('learner_email'), data.get('reason'), data.get('note'),
                                    data.get('until'), role)
    elif data.get('action') == 'remove':
        coach_centre.lift(coach, actor, data.get('id'), data.get('note'), role)
    else:
        raise ValueError('Unknown action.')
    return overview(coach, name)


def absence(request, coach, name, role):
    """Mark one of the learner's coming lectures as an authorised absence, or cancel one not applied yet."""
    data, actor = body(request), display_name(request.user)
    if data.get('action') == 'add':
        coach_centre.mark_absent(coach, actor, data.get('learner_email'), data.get('session_ref'), data.get('reason'),
                                 data.get('note'), role)
    elif data.get('action') == 'cancel':
        coach_centre.cancel_absence(coach, actor, data.get('id'), data.get('note'), role)
    else:
        raise ValueError('Unknown action.')
    return overview(coach, name)


@coach_only
@require_GET
def coach_home(request):
    return overview(request.user.email, display_name(request.user))


@coach_only
@require_POST
@csrf_protect
def coach_caught_up(request):
    return caught_up(request, request.user.email, display_name(request.user), 'coach')


@coach_only
@require_POST
@csrf_protect
def coach_do_not_call(request):
    return do_not_call(request, request.user.email, display_name(request.user), 'coach')


@coach_only
@require_POST
@csrf_protect
def coach_absence(request):
    return absence(request, request.user.email, display_name(request.user), 'coach')


# --- the director's Coaches tab ------------------------------------------------------------------

def chosen(value):
    coach = email_key(value)
    if not coach:
        raise ValueError('Choose a coach.')
    return coach, coach_centre.coach_name(coach)


@authenticated
@require_GET
def coaches(request):
    require_manager(request.user)
    return JsonResponse(coach_centre.coaches())


@authenticated
@require_GET
def coach_log(request):
    """What was done on the coaches' desks, newest first: one coach's, or everyone's."""
    require_manager(request.user)
    return JsonResponse({'entries': coach_centre.activity(request.GET.get('coach') or None)})


@authenticated
@require_GET
def coach_desk(request):
    require_manager(request.user)
    return overview(*chosen(request.GET.get('coach')))


@authenticated
@require_POST
@csrf_protect
def coach_desk_caught_up(request):
    require_manager(request.user)
    return caught_up(request, *chosen(body(request).get('coach')), 'director')


@authenticated
@require_POST
@csrf_protect
def coach_desk_do_not_call(request):
    require_manager(request.user)
    return do_not_call(request, *chosen(body(request).get('coach')), 'director')


@authenticated
@require_POST
@csrf_protect
def coach_desk_absence(request):
    require_manager(request.user)
    return absence(request, *chosen(body(request).get('coach')), 'director')
