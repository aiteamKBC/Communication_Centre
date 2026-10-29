"""A specialist's week in numbers (the scorecard), and the answered calls Zoom kept no recording of.

Everything comes from calls started here (or a learner's answered call, inbound.link_call) and verified against Zoom.
It is shown on the page only; nobody is emailed.
"""
from datetime import datetime, time, timedelta

from django.utils import timezone

from .call_log import SHORT_ANSWER_SECONDS
from .call_scope import system_calls
from .models import Agent, CallIntent, CaseTicket, TicketEvent, ZoomPhoneRecording
from .rules import FAILED_RESULTS, LONDON, working_day
from .voicemail_calls import effective_result, reached

# A recording is expected for an answered call this long, once Zoom has had time to process it.
RECORDING_MIN_SECONDS = 30
RECORDING_GRACE = timedelta(hours=3)


def week_of(day):
    """The Monday of the week ``day`` is in."""
    return day - timedelta(days=day.weekday())


def bounds(monday):
    return (datetime.combine(monday, time.min, tzinfo=LONDON), datetime.combine(monday + timedelta(days=7), time.min, tzinfo=LONDON))


def _median(values):
    values = sorted(values)
    return round(values[len(values) // 2]) if values else None


def missing_recordings(lower, upper, agents=None, now=None):
    """Answered calls of at least RECORDING_MIN_SECONDS with no recording in Zoom, a few hours after they ended:
    automatic recording is off for that number, or Zoom failed to record. Newest first."""
    now = now or timezone.now()
    calls = (system_calls().filter(result='answered', duration_seconds__gte=RECORDING_MIN_SECONDS, started_at__gte=lower,
                                   started_at__lt=upper, ended_at__lte=now - RECORDING_GRACE)
             .select_related('callmatch__agent').order_by('-started_at'))
    if agents is not None:
        calls = calls.filter(callmatch__agent__in=agents)
    rows = []
    for call in calls:
        recorded = ZoomPhoneRecording.objects.filter(source_account=call.source_account, zoom_account_id=call.zoom_account_id)
        found = (recorded.filter(call_log_id=call.history_id).exists()
                 or (call.call_id and recorded.filter(call_id=call.call_id).exists()))
        if not found:
            number = call.caller_number if call.direction == 'outbound' else call.callee_number
            rows.append({'call_id': call.pk, 'started_at': call.started_at, 'duration_seconds': call.duration_seconds,
                         'direction': call.direction, 'agent': call.callmatch.agent.display_name, 'agent_id': call.callmatch.agent_id,
                         'line': number, 'learner_email': call.callmatch.learner_email})
    return rows


def card(agent, lower, upper, now=None):
    """One specialist's numbers between ``lower`` and ``upper``."""
    from . import inbound
    from .ai import call_reviews
    now = now or timezone.now()
    calls = list(system_calls().filter(callmatch__agent=agent, started_at__gte=lower, started_at__lt=min(upper, now))
                 .select_related('callmatch'))
    made = [call for call in calls if call.direction == 'outbound']
    # Talk time is everything Zoom reports as answered; a voicemail that picked up is not an answered call.
    answered = [call for call in made if call.result == 'answered']
    spoke = [call for call in answered if reached(call)]
    incoming = [call for call in calls if call.direction == 'inbound' and call.result == 'answered']
    talk_out = sum(call.duration_seconds or 0 for call in answered)
    talk_in = sum(call.duration_seconds or 0 for call in incoming)
    # The target counts the working days so far: a week in progress is not judged on days still to come.
    first = lower.astimezone(LONDON).date()
    last = min(upper.astimezone(LONDON).date() - timedelta(days=1), now.astimezone(LONDON).date())
    days = sum(working_day(first + timedelta(days=offset)) for offset in range((last - first).days + 1))
    intents = CallIntent.objects.filter(agent=agent, matched_call__in=[call.pk for call in calls]).select_related('matched_call')
    saved = dict(TicketEvent.objects.filter(kind='call_saved', data__intent_id__in=[intent.pk for intent in intents])
                 .values_list('data__intent_id', 'created_at'))
    wraps = [(saved[intent.pk] - intent.matched_call.ended_at).total_seconds() for intent in intents
             if intent.pk in saved and intent.matched_call.ended_at and saved[intent.pk] >= intent.matched_call.ended_at]
    reviews = call_reviews(lower, upper, [agent], own_only=True)['agents'][agent.pk]
    return {
        'agent': {'id': agent.pk, 'name': agent.display_name},
        'calls': len(made), 'answered': len(spoke), 'not_answered': sum(effective_result(call) in FAILED_RESULTS for call in made),
        'reach_rate': round(100 * len(spoke) / len(made)) if made else None,
        'learners_reached': len({call.callmatch.learner_email for call in spoke + incoming}),
        'talk_seconds': talk_out + talk_in, 'talk_out_seconds': talk_out, 'incoming_answered': len(incoming), 'talk_in_seconds': talk_in,
        'target_seconds': agent.daily_talk_target_minutes * 60 * days, 'working_days': days,
        'short_answered': sum(call.duration_seconds is not None and call.duration_seconds < SHORT_ANSWER_SECONDS for call in answered),
        'wrap_up_median_seconds': _median(wraps), 'forms_saved': len(wraps), 'forms_missing': len(intents) - len(saved),
        'closed': CaseTicket.objects.filter(resolved_agent=agent, resolved_at__gte=lower, resolved_at__lt=upper).count(),
        'callbacks': inbound.callback_stats(agent, lower, upper),
        'recordings_missing': len(missing_recordings(lower, upper, [agent], now)),
        'reviews': reviews,
    }


def scorecards(monday, agents=None, now=None):
    lower, upper = bounds(monday)
    agents = agents if agents is not None else list(Agent.objects.filter(active=True, user__is_active=True).order_by('display_name'))
    return {'week': monday.isoformat(), 'from': lower, 'to': upper, 'cards': [card(agent, lower, upper, now) for agent in agents]}

