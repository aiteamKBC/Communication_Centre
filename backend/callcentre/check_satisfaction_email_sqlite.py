"""Invoked only by check_satisfaction_sqlite in its fresh in-memory database."""
import json
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import PermissionDenied
from django.db import connections
from django.test import RequestFactory, override_settings
from django.utils import timezone

from . import mailer, satisfaction_email
from .models import CaseTicket, EmailDelivery, EmailQuota, TicketEvent
from .services import Conflict
from .views import satisfaction_email_view


def check_email(user, agent):
    assert connections['login_db'].settings_dict['NAME'] == ':memory:'
    config = {'email_mode': 'live', 'daily_cap': 2}

    def case(**kwargs):
        return CaseTicket.objects.create(reason_key=str(uuid4()), source_type='learner_satisfaction',
                                         learner_email=f'{uuid4()}@example.org', learner_name='Test Learner',
                                         source_data={'eligible': True}, due_at=timezone.now(), **kwargs)

    def payload(**kwargs):
        return {'request_id': str(uuid4()), 'subject': 'Feedback', 'message': '<script>feedback</script>', **kwargs}

    def raises(exception, fn):
        try:
            fn()
        except exception:
            return
        raise AssertionError(f'Expected {exception.__name__}')

    with patch('callcentre.email_settings.current', return_value=config), \
            patch('callcentre.mailer.configured', return_value=True), \
            patch('callcentre.mailer.sender', return_value='no-reply@example.org'), \
            patch('callcentre.mailer.send') as deliver:
        ticket, data = case(), payload(recipient='attacker@example.org')

        def accepted(*args):
            assert not connections['login_db'].in_atomic_block
            assert EmailDelivery.objects.filter(ticket=ticket, status='sending').exists()

        deliver.side_effect = accepted
        first = satisfaction_email.send(ticket.pk, user, data, agent)
        assert first['status'] == 'accepted' and first['recipient'] == ticket.learner_email
        assert satisfaction_email.send(ticket.pk, user, data, agent) == first
        assert deliver.call_count == 1
        assert '<script>' not in deliver.call_args.args[2] and '&lt;script&gt;' in deliver.call_args.args[2]
        ticket.refresh_from_db()
        assert ticket.status == 'new' and 'last_completed_at' not in ticket.source_data
        assert TicketEvent.objects.filter(ticket=ticket, kind='email').count() == 1
        raises(Conflict, lambda: satisfaction_email.send(ticket.pk, user, {**data, 'message': 'changed'}, agent))
        deliver.side_effect = None
        satisfaction_email.send(ticket.pk, user, payload(), agent)
        raises(Conflict, lambda: satisfaction_email.send(ticket.pk, user, payload(), agent))
        assert EmailQuota.objects.get(recipient=ticket.learner_email).count == 2

        employer = case(manager_email='manager@example.org', manager_name='Test Manager')
        employer.source_type = 'satisfaction'
        employer.save()
        assert satisfaction_email.draft(employer)['recipient'] == 'manager@example.org'
        assert satisfaction_email.send(employer.pk, user, payload(), agent)['recipient'] == 'manager@example.org'
        employer.manager_email = ''
        employer.save()
        assert not satisfaction_email.draft(employer)['can_send']
        raises(ValueError, lambda: satisfaction_email.send(employer.pk, user, payload(), agent))

        timeout_case, timeout_data = case(), payload()
        deliver.side_effect = mailer.MailError('do not expose provider details', uncertain=True)
        timeout = satisfaction_email.send(timeout_case.pk, user, timeout_data, agent)
        assert timeout['status'] == 'unknown' and 'provider details' not in timeout['error']
        calls = deliver.call_count
        assert satisfaction_email.send(timeout_case.pk, user, timeout_data, agent) == timeout
        raises(Conflict, lambda: satisfaction_email.send(timeout_case.pk, user, payload(), agent))
        assert deliver.call_count == calls

        deliver.side_effect = mailer.MailError('refused', uncertain=False)
        assert satisfaction_email.send(case().pk, user, payload(), agent)['status'] == 'failed'
        deliver.reset_mock()
        blocked = case()
        config['email_mode'] = 'dry_run'
        assert not satisfaction_email.draft(blocked)['can_send']
        raises(Conflict, lambda: satisfaction_email.send(blocked.pk, user, payload(), agent))
        config['email_mode'] = 'live'
        raises(ValueError, lambda: satisfaction_email.send(blocked.pk, user, payload(request_id='invalid'), agent))
        blocked.status = 'resolved'
        blocked.save()
        raises(Conflict, lambda: satisfaction_email.send(blocked.pk, user, payload(), agent))
        assert not deliver.called

        # HTTP boundary: unauthenticated / CSRF rejection and viewer authorization.
        factory = RequestFactory()
        request = factory.post('/', data=json.dumps(payload()), content_type='application/json')
        request.user = AnonymousUser()
        assert satisfaction_email_view(request, ticket.pk).status_code == 401
        request.user = user
        with override_settings(ALLOWED_HOSTS=['testserver']):
            assert satisfaction_email_view(request, ticket.pk).status_code == 403
        viewer = type(user).objects.using('login_db').get(username='viewer')
        raises(PermissionDenied, lambda: satisfaction_email.send(case().pk, viewer, payload()))
        other_claim = case(claimed_by=agent, last_activity_at=timezone.now())
        manager = type(user).objects.using('login_db').create(username='email-manager', is_superuser=True)
        raises(Conflict, lambda: satisfaction_email.send(other_claim.pk, manager, payload()))
        assert not deliver.called
    return 11
