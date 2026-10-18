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

    from callcentre.check_satisfaction_email_sqlite import check_email
    checked += check_email(user, agent)
    checked += check_employers(user, agent, raises)
    print(f'Passed {checked} isolated SQLite workflow scenarios. No external databases accessed.')


def check_employers(user, agent, raises):
    """Employer feedback calls: one per line manager, hidden for three months after completed feedback."""
    from django.core.exceptions import PermissionDenied
    from django.contrib.auth import get_user_model
    from callcentre.learner_satisfaction import (EMPLOYER, close_without_feedback, complete, generate_employers,
                                                 next_review_at)
    from callcentre.learners import merge
    from callcentre.lms_booking import session_types
    from callcentre.models import CallMatch, CaseCall, CaseTicket, TicketEvent, ZoomPhoneCall
    from callcentre.rules import LONDON, due_at
    from callcentre.services import apply_call_result, resolve
    from callcentre.test_learner_satisfaction import aptem, lms

    now = datetime(2026, 10, 5, 12, tzinfo=LONDON)
    boss = {'ManagerName': 'Boss', 'ManagerEmail': 'boss@example.org', 'Manager Phone': '07700 900123'}
    people = merge([lms(id=21, Email='a@example.org', aptem_id=31), lms(id=22, Email='b@example.org', aptem_id=32)],
                   [aptem(ID=31, Email='a@example.org', FullName='Ann', **boss), aptem(ID=32, Email='b@example.org', FullName='Ben', **boss)])
    employers = CaseTicket.objects.filter(source_type=EMPLOYER)
    checked = 0
    with patch('django.utils.timezone.now', return_value=now), patch('callcentre.sources.on_break_emails', return_value=[]):
        assert generate_employers(people)['created'] == 1
        assert generate_employers(people)['created'] == 0
        ticket = employers.get(manager_email='boss@example.org')
        assert ticket.learner_email == ticket.manager_email == 'boss@example.org' and ticket.learner_name == 'Boss'
        assert ticket.learner_phone == '+447700900123'
        assert [item['email'] for item in ticket.source_data['learners']] == ['a@example.org', 'b@example.org']
        assert ticket.due_at == due_at(EMPLOYER, now) > now and session_types(ticket) == []   # not born past SLA; no booking
        checked += 1

        feedback = dict(score=5, problem='None', action='No action needed', note='Employer is happy with both learners.')
        raises(ValueError, lambda: complete(ticket.pk, user, **feedback))
        raises(ValueError, lambda: resolve(ticket.pk, user, note='Try generic close'))
        call = ZoomPhoneCall.objects.create(
            source_account='student', zoom_account_id='test-account', history_id='employer', direction='outbound',
            started_at=now + timedelta(minutes=1), ended_at=now + timedelta(minutes=5), result='answered')
        match = CallMatch.objects.create(call=call, agent=agent, learner_email=ticket.learner_email)
        CaseCall.objects.create(ticket=ticket, match=match)
        apply_call_result(match)
        completed_at = now + timedelta(minutes=10)
        with patch('django.utils.timezone.now', return_value=completed_at):
            complete(ticket.pk, user, **feedback)
        ticket.refresh_from_db()
        assert ticket.status == 'resolved' and not employers.filter(pk=ticket.pk).open().exists()
        assert TicketEvent.objects.filter(kind='employer_feedback_completed').count() == 1
        checked += 1

        next_due = next_review_at(completed_at)
        assert generate_employers(people, next_due - timedelta(seconds=1))['renewed'] == 0
        assert generate_employers(people, next_due)['renewed'] == 1
        assert generate_employers(people, next_due)['renewed'] == 0
        renewal = employers.exclude(status='resolved').get(manager_email='boss@example.org')
        assert renewal.due_at == due_at(EMPLOYER, next_due) and renewal.source_data['previous_case_id'] == ticket.pk
        checked += 1

        alone = merge([lms(id=21, Email='a@example.org', aptem_id=31)], [aptem(ID=31, Email='a@example.org', FullName='Ann')])
        generate_employers(alone, next_due)
        renewal.refresh_from_db()
        assert not renewal.source_data['eligible'] and not employers.open().filter(manager_email='boss@example.org').exists()
        generate_employers(people, next_due)
        renewal.refresh_from_db()
        assert renewal.source_data['eligible'] and employers.count() == 4   # current employer email check; boss: done + renewal; manager@ from `alone`
        checked += 1

        # A manager whose learners have all left is not called.
        left = merge([lms(id=21, Email='a@example.org', aptem_id=31, Programme_status='Withdrawn')],
                     [aptem(ID=31, Email='a@example.org', FullName='Ann', **boss)])
        generate_employers(left, next_due)
        renewal.refresh_from_db()
        assert not renewal.source_data['eligible']
        generate_employers(people, next_due)
        checked += 1

        # Closing a review that cannot be done needs an agent profile or manager access; it comes back three months later.
        specialist = get_user_model().objects.using('login_db').create(username='specialist', is_active=True)
        raises(PermissionDenied, lambda: close_without_feedback(renewal.pk, specialist, 'refused', 'Declined to talk'))
        manager = get_user_model().objects.using('login_db').create(username='manager', is_active=True, is_superuser=True)
        raises(ValueError, lambda: close_without_feedback(renewal.pk, manager, 'refused', ''))
        closed_at = next_due + timedelta(days=1)
        with patch('django.utils.timezone.now', return_value=closed_at):
            close_without_feedback(renewal.pk, manager, 'refused', 'Declined to talk')
        renewal.refresh_from_db()
        assert renewal.status == 'resolved' and renewal.resolution_option == 'closed_without_feedback'
        assert generate_employers(people, next_review_at(closed_at) - timedelta(seconds=1))['renewed'] == 0
        assert generate_employers(people, next_review_at(closed_at))['renewed'] == 1
        checked += 1
    return checked


if __name__ == '__main__':
    main()
