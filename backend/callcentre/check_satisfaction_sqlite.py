"""Isolated workflow smoke test: python -m callcentre.check_satisfaction_sqlite.

Does not import project settings, read .env, or connect to any external database.
"""
from datetime import datetime, timedelta
from unittest.mock import patch


def main():
    import django
    from django.conf import settings

    if settings.configured:
        raise RuntimeError('Run this check in its own process, without project settings.')
    settings.configure(
        SECRET_KEY='isolated-test-only', USE_TZ=True, DEFAULT_AUTO_FIELD='django.db.models.BigAutoField',
        INSTALLED_APPS=['django.contrib.auth', 'django.contrib.contenttypes', 'callcentre'],
        DATABASES={name: {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}
                   for name in ('default', 'login_db')},
        DATABASE_ROUTERS=['backend.db_routers.CallCentreRouter'],
        CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS=[], CALLCENTRE_HOLIDAYS=[],
    )
    django.setup()
    from django.apps import apps
    from django.contrib.auth import get_user_model
    from django.core.exceptions import PermissionDenied
    from django.db import connections
    from callcentre.learner_satisfaction import complete, generate, next_review_at
    from callcentre.learners import merge
    from callcentre.models import Agent, CallMatch, CaseCall, CaseTicket, TicketEvent, ZoomPhoneCall
    from callcentre.rules import LONDON
    from callcentre.services import Conflict, apply_call_result, record_outcome, resolve
    from callcentre.test_learner_satisfaction import aptem, lms

    connection = connections['login_db']
    assert connection.vendor == 'sqlite' and connection.settings_dict['NAME'] == ':memory:'
    with connection.schema_editor() as editor:
        for model in apps.get_models():
            editor.create_model(model)

    user = get_user_model().objects.using('login_db').create(username='operator', is_active=True)
    agent = Agent.objects.create(user=user, display_name='Operator', zoom_email='operator@example.org', zoom_account='student')
    now = datetime(2026, 10, 4, 12, tzinfo=LONDON)
    people = merge([lms()], [aptem()])
    checked = 0

    def raises(expected, fn):
        try:
            fn()
        except expected:
            return
        raise AssertionError(f'Expected {expected.__name__}')

    with patch('django.utils.timezone.now', return_value=now), patch('callcentre.sources.on_break_emails', return_value=[]):
        assert generate(people)['created'] == 1
        assert generate(people)['created'] == 0
        assert CaseTicket.objects.count() == 1
        ticket = CaseTicket.objects.get()
        assert ticket.learner_phone == '' and ticket.status == 'new'
        checked += 1

        incomplete = merge([], [aptem()])
        incomplete.sources_complete = False
        assert 'skipped' in generate(incomplete)
        ticket.refresh_from_db()
        assert ticket.source_data['eligible']
        checked += 1

        feedback = dict(score=4, problem='None', action='No action needed', note='Learner is happy with their coaching.')
        raises(ValueError, lambda: complete(ticket.pk, user, **feedback))
        raises(ValueError, lambda: resolve(ticket.pk, user, note='Try generic close'))
        checked += 1

        call = ZoomPhoneCall.objects.create(
            source_account='student', zoom_account_id='test-account', history_id='one', direction='outbound',
            started_at=now + timedelta(minutes=1), ended_at=now + timedelta(minutes=5), result='no_answer')
        match = CallMatch.objects.create(call=call, agent=agent, learner_email=ticket.learner_email)
        link = CaseCall.objects.create(ticket=ticket, match=match)
        apply_call_result(match)
        ticket.refresh_from_db()
        assert ticket.attempts == 1 and ticket.status == 'new' and ticket.next_followup_at > now
        assert 'last_completed_at' not in ticket.source_data
        raises(ValueError, lambda: complete(ticket.pk, user, **feedback))
        checked += 1

        call.result = 'answered'
        call.save(update_fields=['result'])
        apply_call_result(match)
        record_outcome(ticket.pk, user, call.pk, 'reached', note='Reached and discussing feedback')
        ticket.refresh_from_db()
        assert ticket.status != 'resolved' and 'last_completed_at' not in ticket.source_data
        checked += 1

        raises(ValueError, lambda: complete(ticket.pk, user, **{**feedback, 'score': True}))
        viewer = get_user_model().objects.using('login_db').create(username='viewer', is_active=True)
        raises(PermissionDenied, lambda: complete(ticket.pk, viewer, **feedback))
        checked += 1

        completed_at = now + timedelta(minutes=10)
        with patch('django.utils.timezone.now', return_value=completed_at):
            complete(ticket.pk, user, **feedback)
            raises(Conflict, lambda: complete(ticket.pk, user, **feedback))
        ticket.refresh_from_db()
        assert ticket.status == 'resolved'
        assert TicketEvent.objects.filter(kind='learner_feedback_completed').count() == 1
        assert generate(people, next_review_at(completed_at) - timedelta(seconds=1))['renewed'] == 0
        checked += 1

        next_due = next_review_at(completed_at)
        with patch('django.utils.timezone.now', return_value=next_due):
            assert generate(people, next_due)['renewed'] == 1
            assert generate(people, next_due)['renewed'] == 0
        previous_id = ticket.pk
        ticket = CaseTicket.objects.exclude(status='resolved').get()
        assert ticket.status == 'new' and ticket.attempts == 0 and ticket.created_at == next_due
        assert CaseTicket.objects.count() == 2
        assert CaseTicket.objects.get(pk=previous_id).resolved_at == completed_at
        raises(ValueError, lambda: complete(ticket.pk, user, **feedback))  # previous cycle's call is not proof
        raises(ValueError, lambda: record_outcome(ticket.pk, user, call.pk, 'reached', note='Old call'))
        checked += 1

        generate(merge([lms(Programme_status='Withdrawn')], [aptem()]), next_due)
        ticket.refresh_from_db()
        assert not ticket.source_data['eligible'] and not CaseTicket.objects.open().exists()
        assert TicketEvent.objects.filter(kind='learner_feedback_completed').count() == 1
        checked += 1

        generate(merge([lms(Email='new@example.org')], [aptem()]), next_due)
        ticket.refresh_from_db()
        assert ticket.source_data['eligible'] and ticket.learner_email == 'new@example.org'
        assert CaseTicket.objects.count() == 2
        checked += 1

        settings.CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS = ['lms:1']
        generate(people, next_due)
        ticket.refresh_from_db()
        assert not ticket.source_data['eligible']
        settings.CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS = []
        checked += 1

        without_email = merge([lms(id=2, Email='', aptem_id=None), lms(id=3, Email='', aptem_id=None)], [])
        assert generate(without_email)['created'] == 2
        assert generate(without_email)['created'] == 0
        assert CaseTicket.objects.filter(learner_email='').count() == 2
        checked += 1

    print(f'Passed {checked} isolated SQLite workflow scenarios. No external databases accessed.')


if __name__ == '__main__':
    main()
