"""Administration checks against isolated databases, never configured live accounts.

Run with: python check_isolated_tests.py login.test_administration
"""

import json

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.test import Client, TestCase, override_settings

from callcentre.models import Agent

from .access import ACCESS_GROUPS, ensure_access_groups
from .permissions import ensure_permission_catalog, get_effective_permissions


DB = 'login_db'
BASE = '/api/administration/'
BACKEND = 'login.backends.LoginDBModelBackend'
STRONG_PASSWORD = 'Account-setup-River-8492!'
NEXT_PASSWORD = 'Changed-Prairie-5173!'
MIDDLEWARE = [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]


@override_settings(
    AUTHENTICATION_BACKENDS=[BACKEND],
    DATABASE_ROUTERS=[
        'backend.db_routers.AuthAdminRouter',
        'backend.db_routers.CallCentreRouter',
    ],
    MIDDLEWARE=MIDDLEWARE,
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
    AUTH_PASSWORD_VALIDATORS=[{
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 12},
    }],
)
class AdministrationTests(TestCase):
    databases = {'default', DB}

    @classmethod
    def setUpTestData(cls):
        ContentType.objects.clear_cache()
        ContentType.objects.db_manager(DB).get_for_model(get_user_model())
        ensure_access_groups(DB)
        cls.admin = cls.make_user('administrator', ['access_admin'])
        cls.ordinary = cls.make_user('team.member', ['access_marketing'])
        cls.it_user = cls.make_user('it.member', ['access_it'])
        cls.superuser = cls.make_user('super.administrator', [], is_staff=True, is_superuser=True)
        cls.staff = cls.make_user('django.staff', [], is_staff=True)

    @classmethod
    def tearDownClass(cls):
        try:
            super().tearDownClass()
        finally:
            ContentType.objects.clear_cache()

    @staticmethod
    def make_user(username, roles=(), **extra):
        user = get_user_model().objects.db_manager(DB).create_user(
            username=username,
            email=f'{username}@example.com',
            password=STRONG_PASSWORD,
            first_name='Test',
            last_name=username,
            **extra,
        )
        if roles:
            user.groups.add(*Group.objects.using(DB).filter(name__in=[ACCESS_GROUPS[key] for key in roles]))
        return user

    def setUp(self):
        self.client.force_login(self.admin, backend=BACKEND)

    def sign_in(self, user, *, csrf=False):
        client = Client(enforce_csrf_checks=csrf)
        client.force_login(user, backend=BACKEND)
        return client

    def detail(self, user, client=None):
        response = (client or self.client).get(f'{BASE}users/{user.pk}/')
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()['user']

    def write(self, method, path, data, client=None, **headers):
        return getattr(client or self.client, method)(
            path, data=json.dumps(data), content_type='application/json', **headers,
        )

    def update(self, user, data, client=None, revision=None):
        current = self.detail(user, client)
        return self.write('patch', f'{BASE}users/{user.pk}/', {
            'revision': revision if revision is not None else current['revision'], **data,
        }, client)

    def create_payload(self, username='new.colleague', **extra):
        return {
            'username': username, 'email': f'{username}@example.com',
            'firstName': 'New', 'lastName': 'Colleague',
            'password': STRONG_PASSWORD, 'isActive': True,
            'roles': ['access_operations'], **extra,
        }

    def assert_refused(self, response):
        self.assertIn(response.status_code, {400, 403, 409}, response.content)

    def test_anonymous_and_inactive_sessions_cannot_read_administration(self):
        anonymous = Client()
        for route in ('session/', 'users/', 'roles/', 'history/', f'users/{self.ordinary.pk}/'):
            with self.subTest(route=route):
                self.assertEqual(anonymous.get(BASE + route).status_code, 401)

        self.admin.is_active = False
        self.admin.save(using=DB, update_fields=['is_active'])
        self.assertEqual(self.client.get(BASE + 'session/').status_code, 401)

    def test_regular_and_it_accounts_cannot_impersonate_an_admin(self):
        for user in (self.ordinary, self.it_user, self.staff):
            client = self.sign_in(user)
            for route in ('session/', 'users/', 'roles/', 'history/'):
                with self.subTest(user=user.username, route=route):
                    response = client.get(
                        BASE + route,
                        {'userId': self.admin.pk, 'email': self.admin.email, 'adminAccess': 'true'},
                        HTTP_X_USER_ID=str(self.admin.pk), HTTP_X_USER_EMAIL=self.admin.email,
                    )
                    self.assertEqual(response.status_code, 403, response.content)
            response = self.write('post', BASE + 'users/', self.create_payload(), client)
            self.assertEqual(response.status_code, 403)
            for method, suffix, data in (
                ('patch', '', {'firstName': 'Forged', 'revision': 'forged'}),
                ('delete', '', {'revision': 'forged', 'confirmUsername': self.admin.username}),
                ('post', 'password/', {'revision': 'forged', 'password': NEXT_PASSWORD}),
            ):
                response = self.write(method, f'{BASE}users/{self.admin.pk}/{suffix}', data, client)
                self.assertEqual(response.status_code, 403, response.content)

        self.admin.refresh_from_db(using=DB)
        self.assertEqual(self.admin.first_name, 'Test')
        self.assertTrue(self.admin.check_password(STRONG_PASSWORD))
        self.assertFalse(get_user_model().objects.using(DB).filter(username='new.colleague').exists())

    def test_admin_and_superuser_sessions_expose_their_own_capabilities(self):
        response = self.client.get(BASE + 'session/', {'userId': self.superuser.pk})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['currentUserId'], self.admin.pk)
        self.assertTrue(payload['canManageAdministration'])
        self.assertFalse(payload['canManagePrivilegedAccounts'])
        self.assertIsNone(payload['djangoAdminUrl'])
        self.assertIn('csrftoken', response.cookies)

        payload = self.sign_in(self.superuser).get(BASE + 'session/').json()
        self.assertTrue(payload['canManagePrivilegedAccounts'])
        self.assertEqual(payload['djangoAdminUrl'], '/admin/')

    def test_removing_admin_role_revokes_access_on_next_request(self):
        self.admin.groups.remove(Group.objects.using(DB).get(name=ACCESS_GROUPS['access_admin']))
        self.assertEqual(self.client.get(BASE + 'users/').status_code, 403)

    def test_csrf_is_required_for_creating_updating_deleting_and_password_changes(self):
        client = self.sign_in(self.admin, csrf=True)
        response = client.get(BASE + 'session/')
        self.assertEqual(response.status_code, 200)
        token = client.cookies['csrftoken'].value
        self.assertEqual(self.write('post', BASE + 'users/', self.create_payload(), client).status_code, 403)
        response = self.write('post', BASE + 'users/', self.create_payload(), client, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201, response.content)
        target = response.json()['user']
        endpoint = f"{BASE}users/{target['id']}/"
        for method, suffix, data in (
            ('patch', '', {'revision': target['revision'], 'firstName': 'Changed'}),
            ('delete', '', {'revision': target['revision'], 'confirmUsername': target['username']}),
            ('post', 'password/', {'revision': target['revision'], 'password': NEXT_PASSWORD}),
        ):
            with self.subTest(method=method, suffix=suffix):
                self.assertEqual(self.write(method, endpoint + suffix, data, client).status_code, 403)

    def test_user_and_role_lists_read_actual_login_database_memberships(self):
        response = self.client.get(BASE + 'users/', {'q': 'team.member', 'pageSize': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['total'], 1)
        user = response.json()['users'][0]
        self.assertEqual(user['id'], self.ordinary.pk)
        self.assertEqual(user['roles'], ['access_marketing'])
        self.assertTrue(user['canEdit'])
        self.assertTrue(user['canDelete'])
        self.assertNotIn('password', user)

        response = self.client.get(BASE + 'users/', {'role': 'access_it', 'status': 'active'})
        self.assertEqual([item['id'] for item in response.json()['users']], [self.it_user.pk])
        role_payload = self.client.get(BASE + 'roles/').json()['roles']
        self.assertEqual({role['id'] for role in role_payload}, set(ACCESS_GROUPS))
        marketing = next(role for role in role_payload if role['id'] == 'access_marketing')
        self.assertEqual(marketing['assignedCount'], 1)

    def test_user_list_paginates_without_exposing_credentials(self):
        first = self.client.get(BASE + 'users/', {'page': 1, 'pageSize': 2}).json()
        second = self.client.get(BASE + 'users/', {'page': 2, 'pageSize': 2}).json()
        self.assertEqual(first['total'], 5)
        self.assertEqual(len(first['users']), 2)
        self.assertEqual(len(second['users']), 2)
        self.assertFalse({row['id'] for row in first['users']} & {row['id'] for row in second['users']})
        self.assertNotIn(STRONG_PASSWORD, json.dumps(first))
        self.assertNotIn(self.admin.password, json.dumps(first))

    def test_admin_creates_real_user_with_hashed_password_and_native_admin_log(self):
        response = self.write('post', BASE + 'users/', self.create_payload())
        self.assertEqual(response.status_code, 201, response.content)
        result = response.json()['user']
        user = get_user_model().objects.using(DB).get(pk=result['id'])
        self.assertEqual(user.first_name, 'New')
        self.assertEqual(user.last_name, 'Colleague')
        self.assertTrue(user.check_password(STRONG_PASSWORD))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(set(user.groups.values_list('name', flat=True)), {ACCESS_GROUPS['access_operations']})
        self.assertFalse(get_user_model().objects.using('default').filter(username=user.username).exists())
        log = LogEntry.objects.using(DB).get(object_id=str(user.pk), action_flag=ADDITION)
        self.assertEqual(log.user_id, self.admin.pk)
        self.assertNotIn(STRONG_PASSWORD, log.change_message)
        self.assertNotIn(user.password, log.change_message)
        self.assertNotIn(STRONG_PASSWORD, response.content.decode())
        self.assertNotIn(user.password, response.content.decode())

    def test_profile_and_roles_update_roundtrips_native_group_membership(self):
        unrelated = Group.objects.using(DB).create(name='Legacy reporting group')
        self.ordinary.groups.add(unrelated)
        response = self.update(self.ordinary, {
            'firstName': 'Updated', 'lastName': 'Person', 'email': 'updated.person@example.com',
            'roles': ['access_operations', 'access_event_manager', f'group:{unrelated.pk}'],
        })
        self.assertEqual(response.status_code, 200, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertEqual(self.ordinary.email, 'updated.person@example.com')
        self.assertEqual(self.ordinary.get_full_name(), 'Updated Person')
        self.assertEqual(set(self.ordinary.groups.values_list('name', flat=True)), {
            unrelated.name, ACCESS_GROUPS['access_operations'], ACCESS_GROUPS['access_event_manager'],
        })
        self.assertEqual(response.json()['user']['otherGroups'], [unrelated.name])
        self.assertTrue(LogEntry.objects.using(DB).filter(object_id=str(self.ordinary.pk), action_flag=CHANGE).exists())

    def test_stale_revision_cannot_overwrite_newer_roles_or_profile(self):
        original = self.detail(self.ordinary)
        response = self.update(self.ordinary, {'firstName': 'Latest', 'roles': ['access_operations']})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotEqual(response.json()['user']['revision'], original['revision'])
        response = self.write('patch', f'{BASE}users/{self.ordinary.pk}/', {
            'revision': original['revision'], 'firstName': 'Stale', 'roles': ['access_marketing'],
        })
        self.assertEqual(response.status_code, 409, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertEqual(self.ordinary.first_name, 'Latest')
        self.assertEqual(set(self.ordinary.groups.values_list('name', flat=True)), {ACCESS_GROUPS['access_operations']})

    def test_stale_revision_blocks_password_reset_and_delete(self):
        original = self.detail(self.ordinary)
        response = self.update(self.ordinary, {'firstName': 'Latest'})
        self.assertEqual(response.status_code, 200)
        for method, suffix, extra in (
            ('post', 'password/', {'password': NEXT_PASSWORD}),
            ('delete', '', {'confirmUsername': self.ordinary.username}),
        ):
            with self.subTest(method=method):
                response = self.write(method, f'{BASE}users/{self.ordinary.pk}/{suffix}', {
                    'revision': original['revision'], **extra,
                })
                self.assertEqual(response.status_code, 409, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertTrue(self.ordinary.check_password(STRONG_PASSWORD))

    def test_invalid_profile_role_boolean_and_password_values_are_rejected(self):
        for invalid in (
            {'email': 'not-an-email'}, {'roles': ['not-a-system-role']},
            {'roles': 'access_admin'}, {'isActive': 'false'}, {'username': 'has spaces'},
        ):
            with self.subTest(invalid=invalid):
                response = self.update(self.ordinary, invalid)
                self.assertEqual(response.status_code, 400, response.content)
        response = self.write('post', BASE + 'users/', self.create_payload(password='short'))
        self.assertEqual(response.status_code, 400, response.content)
        response = self.write('post', f'{BASE}users/{self.ordinary.pk}/password/', {
            'revision': self.detail(self.ordinary)['revision'], 'password': 'short',
        })
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(get_user_model().objects.using(DB).filter(username='new.colleague').exists())
        self.ordinary.refresh_from_db(using=DB)
        self.assertTrue(self.ordinary.is_active)
        self.assertEqual(self.ordinary.username, 'team.member')

    def test_duplicate_username_and_missing_revision_do_not_change_accounts(self):
        response = self.write('post', BASE + 'users/', self.create_payload(username=self.ordinary.username))
        self.assertIn(response.status_code, {400, 409}, response.content)
        response = self.write('patch', f'{BASE}users/{self.ordinary.pk}/', {'firstName': 'No revision'})
        self.assertIn(response.status_code, {400, 409}, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertEqual(self.ordinary.first_name, 'Test')

    def test_admin_cannot_grant_django_staff_or_superuser_privileges(self):
        for field in ('isStaff', 'isSuperuser'):
            with self.subTest(field=field):
                response = self.update(self.ordinary, {field: True})
                self.assertEqual(response.status_code, 403, response.content)
                response = self.write('post', BASE + 'users/', self.create_payload(**{field: True}))
                self.assertEqual(response.status_code, 403, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertFalse(self.ordinary.is_staff)
        self.assertFalse(self.ordinary.is_superuser)

    def test_admin_cannot_modify_delete_or_reset_privileged_accounts(self):
        for target in (self.superuser, self.staff):
            current = self.detail(target)
            self.assertFalse(current['canEdit'])
            self.assertFalse(current['canDelete'])
            for method, suffix, extra in (
                ('patch', '', {'firstName': 'Escalated'}),
                ('delete', '', {'confirmUsername': target.username}),
                ('post', 'password/', {'password': NEXT_PASSWORD}),
            ):
                with self.subTest(target=target.username, method=method):
                    response = self.write(method, f'{BASE}users/{target.pk}/{suffix}', {
                        'revision': current['revision'], **extra,
                    })
                    self.assertEqual(response.status_code, 403, response.content)
            target.refresh_from_db(using=DB)
            self.assertEqual(target.first_name, 'Test')
            self.assertTrue(target.check_password(STRONG_PASSWORD))

    def test_direct_permission_holders_are_protected_from_ordinary_admin(self):
        content_type = ContentType.objects.db_manager(DB).get_for_model(get_user_model())
        permission, _ = Permission.objects.using(DB).get_or_create(
            content_type=content_type, codename='change_user', defaults={'name': 'Can change user'},
        )
        self.ordinary.user_permissions.add(permission)
        current = self.detail(self.ordinary)
        self.assertFalse(current['canEdit'])
        response = self.write('post', f'{BASE}users/{self.ordinary.pk}/password/', {
            'revision': current['revision'], 'password': NEXT_PASSWORD,
        })
        self.assertEqual(response.status_code, 403)

    def test_permission_bearing_group_members_cannot_be_taken_over_by_admin(self):
        content_type = ContentType.objects.db_manager(DB).get_for_model(get_user_model())
        permission, _ = Permission.objects.using(DB).get_or_create(
            content_type=content_type, codename='change_user', defaults={'name': 'Can change user'},
        )
        powerful_group = Group.objects.using(DB).create(name='Legacy account managers')
        powerful_group.permissions.add(permission)
        self.ordinary.groups.add(powerful_group)
        current = self.detail(self.ordinary)
        self.assertFalse(current['canEdit'])
        response = self.write('patch', f'{BASE}users/{self.ordinary.pk}/', {
            'revision': current['revision'], 'email': 'takeover@example.com',
        })
        self.assertEqual(response.status_code, 403, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertEqual(self.ordinary.email, 'team.member@example.com')

    def test_admin_cannot_assign_a_known_role_carrying_django_permissions(self):
        content_type = ContentType.objects.db_manager(DB).get_for_model(get_user_model())
        permission, _ = Permission.objects.using(DB).get_or_create(
            content_type=content_type, codename='change_user', defaults={'name': 'Can change user'},
        )
        powerful_role = Group.objects.using(DB).get(name=ACCESS_GROUPS['access_operations'])
        powerful_role.permissions.add(permission)
        for target, role_ids in (
            (self.ordinary, ['access_operations']),
            (self.admin, ['access_admin', 'access_operations']),
        ):
            with self.subTest(target=target.username):
                response = self.update(target, {'roles': role_ids})
                self.assertEqual(response.status_code, 403, response.content)
                self.assertFalse(target.groups.filter(pk=powerful_role.pk).exists())
        response = self.write('post', BASE + 'users/', self.create_payload(roles=['access_operations']))
        self.assertEqual(response.status_code, 403, response.content)
        self.assertFalse(get_user_model().objects.using(DB).filter(username='new.colleague').exists())

    def test_superuser_can_manage_django_flags_and_preserves_direct_permissions(self):
        client = self.sign_in(self.superuser)
        content_type = ContentType.objects.db_manager(DB).get_for_model(get_user_model())
        permission, _ = Permission.objects.using(DB).get_or_create(
            content_type=content_type, codename='change_user', defaults={'name': 'Can change user'},
        )
        self.ordinary.user_permissions.add(permission)
        response = self.update(self.ordinary, {'isStaff': True, 'isSuperuser': True}, client)
        self.assertEqual(response.status_code, 200, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertTrue(self.ordinary.is_staff)
        self.assertTrue(self.ordinary.is_superuser)
        self.assertTrue(self.ordinary.user_permissions.filter(pk=permission.pk).exists())

    def test_administrator_cannot_delete_deactivate_or_remove_own_admin_role(self):
        current = self.detail(self.admin)
        self.assertFalse(current['canDelete'])
        for method, payload in (
            ('delete', {'confirmUsername': self.admin.username}),
            ('patch', {'isActive': False}),
            ('patch', {'roles': ['access_marketing']}),
        ):
            with self.subTest(method=method, payload=payload):
                response = self.write(method, f'{BASE}users/{self.admin.pk}/', {
                    'revision': current['revision'], **payload,
                })
                self.assert_refused(response)
        self.admin.refresh_from_db(using=DB)
        self.assertTrue(self.admin.is_active)
        self.assertTrue(self.admin.groups.filter(name=ACCESS_GROUPS['access_admin']).exists())

    def test_last_django_superuser_cannot_remove_their_superuser_status(self):
        client = self.sign_in(self.superuser)
        response = self.update(self.superuser, {'isSuperuser': False}, client)
        self.assert_refused(response)
        self.superuser.refresh_from_db(using=DB)
        self.assertTrue(self.superuser.is_superuser)

    def test_superuser_cannot_remove_their_own_django_panel_access(self):
        client = self.sign_in(self.superuser)
        response = self.update(self.superuser, {'isStaff': False}, client)
        self.assert_refused(response)
        self.superuser.refresh_from_db(using=DB)
        self.assertTrue(self.superuser.is_staff)

    def test_new_django_superuser_must_also_be_allowed_into_django_admin(self):
        client = self.sign_in(self.superuser)
        response = self.write('post', BASE + 'users/', self.create_payload(
            isSuperuser=True, isStaff=False,
        ), client)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(get_user_model().objects.using(DB).filter(username='new.colleague').exists())

    def test_last_usable_django_superuser_cannot_be_deactivated_by_staffless_superuser(self):
        # Legacy data can contain a superuser without Django panel access. It must
        # not count as a replacement for the last account able to enter that panel.
        legacy = self.make_user('legacy.superuser', [], is_superuser=True, is_staff=False)
        response = self.update(self.superuser, {'isActive': False}, self.sign_in(legacy))
        self.assert_refused(response)
        self.superuser.refresh_from_db(using=DB)
        self.assertTrue(self.superuser.is_active)

    def test_password_reset_hashes_password_and_never_exposes_it_in_audit(self):
        current = self.detail(self.ordinary)
        response = self.write('post', f'{BASE}users/{self.ordinary.pk}/password/', {
            'revision': current['revision'], 'password': NEXT_PASSWORD,
        })
        self.assertEqual(response.status_code, 200, response.content)
        self.ordinary.refresh_from_db(using=DB)
        self.assertTrue(self.ordinary.check_password(NEXT_PASSWORD))
        self.assertFalse(self.ordinary.check_password(STRONG_PASSWORD))
        self.assertNotEqual(response.json()['user']['revision'], current['revision'])
        logs = list(LogEntry.objects.using(DB).filter(object_id=str(self.ordinary.pk)))
        self.assertTrue(logs)
        for value in (response.content.decode(), json.dumps([log.change_message for log in logs])):
            self.assertNotIn(NEXT_PASSWORD, value)
            self.assertNotIn(self.ordinary.password, value)

    def test_password_change_invalidates_other_sessions_but_preserves_own_session(self):
        ordinary_client = self.sign_in(self.ordinary)
        current = self.detail(self.ordinary)
        response = self.write('post', f'{BASE}users/{self.ordinary.pk}/password/', {
            'revision': current['revision'], 'password': NEXT_PASSWORD,
        })
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(ordinary_client.get(BASE + 'session/').status_code, 401)

        own = self.detail(self.admin)
        response = self.write('post', f'{BASE}users/{self.admin.pk}/password/', {
            'revision': own['revision'], 'password': NEXT_PASSWORD,
        })
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.client.get(BASE + 'session/').status_code, 200)

    def test_agent_assignment_and_deactivation_preserve_specialist_history(self):
        response = self.update(self.ordinary, {'roles': ['access_call_centre_agent']})
        self.assertEqual(response.status_code, 200, response.content)
        agent = Agent.objects.using(DB).get(user_id=self.ordinary.pk)
        self.assertTrue(agent.active)

        response = self.update(self.ordinary, {'isActive': False})
        self.assertEqual(response.status_code, 200, response.content)
        agent.refresh_from_db(using=DB)
        self.assertFalse(agent.active)
        self.assertEqual(Agent.objects.using(DB).filter(user_id=self.ordinary.pk).count(), 1)

        response = self.update(self.ordinary, {'isActive': True})
        self.assertEqual(response.status_code, 200, response.content)
        agent.refresh_from_db(using=DB)
        self.assertTrue(agent.active)

        response = self.update(self.ordinary, {'roles': []})
        self.assertEqual(response.status_code, 200, response.content)
        agent.refresh_from_db(using=DB)
        self.assertFalse(agent.active)

    def test_protected_specialist_account_cannot_be_deleted(self):
        self.update(self.ordinary, {'roles': ['access_call_centre_agent']})
        current = self.detail(self.ordinary)
        response = self.write('delete', f'{BASE}users/{self.ordinary.pk}/', {
            'revision': current['revision'], 'confirmUsername': self.ordinary.username,
        })
        self.assertEqual(response.status_code, 409, response.content)
        self.assertTrue(get_user_model().objects.using(DB).filter(pk=self.ordinary.pk).exists())
        self.assertTrue(Agent.objects.using(DB).filter(user_id=self.ordinary.pk).exists())

    def test_deletion_requires_exact_confirmation_and_records_native_history(self):
        current = self.detail(self.ordinary)
        response = self.write('delete', f'{BASE}users/{self.ordinary.pk}/', {
            'revision': current['revision'], 'confirmUsername': 'wrong.person',
        })
        self.assertEqual(response.status_code, 400, response.content)
        self.assertTrue(get_user_model().objects.using(DB).filter(pk=self.ordinary.pk).exists())

        response = self.write('delete', f'{BASE}users/{self.ordinary.pk}/', {
            'revision': current['revision'], 'confirmUsername': self.ordinary.username,
        })
        self.assertIn(response.status_code, {200, 204}, response.content)
        self.assertFalse(get_user_model().objects.using(DB).filter(pk=self.ordinary.pk).exists())
        log = LogEntry.objects.using(DB).get(object_id=str(self.ordinary.pk), action_flag=DELETION)
        self.assertEqual(log.user_id, self.admin.pk)
        history = self.client.get(BASE + 'history/').json()
        self.assertEqual(history['total'], 1)
        self.assertEqual(history['entries'][0]['id'], log.pk)
        self.assertTrue(history['entries'][0]['actor'])
        self.assertTrue(history['entries'][0]['summary'])

    def test_accounts_that_authored_admin_history_are_retained_and_can_be_deactivated(self):
        former_admin = self.make_user('former.admin', ['access_admin'])
        content_type = ContentType.objects.db_manager(DB).get_for_model(get_user_model())
        existing_log = LogEntry.objects.using(DB).create(
            user_id=former_admin.pk, content_type_id=content_type.pk,
            object_id=str(self.ordinary.pk), object_repr=self.ordinary.username,
            action_flag=CHANGE, change_message='Changed roles.',
        )
        response = self.write('delete', f'{BASE}users/{former_admin.pk}/', {
            'revision': self.detail(former_admin)['revision'], 'confirmUsername': former_admin.username,
        })
        self.assertEqual(response.status_code, 409, response.content)
        self.assertTrue(get_user_model().objects.using(DB).filter(pk=former_admin.pk).exists())
        self.assertTrue(LogEntry.objects.using(DB).filter(pk=existing_log.pk).exists())

        response = self.update(former_admin, {'isActive': False})
        self.assertEqual(response.status_code, 200, response.content)
        former_admin.refresh_from_db(using=DB)
        self.assertFalse(former_admin.is_active)
        self.assertTrue(LogEntry.objects.using(DB).filter(pk=existing_log.pk).exists())

    def test_get_requests_and_missing_targets_never_mutate_accounts(self):
        response = self.client.get(f'{BASE}users/{self.ordinary.pk}/password/')
        self.assertEqual(response.status_code, 405)
        response = self.client.get(f'{BASE}users/9999999/')
        self.assertEqual(response.status_code, 404)
        self.ordinary.refresh_from_db(using=DB)
        self.assertTrue(self.ordinary.check_password(STRONG_PASSWORD))

    def create_role(self, name='News authors', permissions=None, client=None):
        response = self.write('post', BASE + 'roles/', {
            'name': name, 'permissions': ['login.add_news'] if permissions is None else permissions,
        }, client)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()['role']

    def role_detail(self, role, client=None):
        response = (client or self.client).get(f"{BASE}roles/{role['groupId']}/")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()['role']

    def test_custom_role_is_native_group_and_assigns_effective_permissions(self):
        role = self.create_role()
        group = Group.objects.using(DB).get(pk=role['groupId'])
        self.assertEqual(role['id'], f'group:{group.pk}')
        self.assertEqual(group.name, 'News authors')
        self.assertEqual(list(group.permissions.values_list('codename', flat=True)), ['add_news'])
        self.assertFalse(Group.objects.using('default').filter(name=group.name).exists())
        self.assertTrue(role['canEdit'])
        self.assertTrue(role['canAssign'])
        response = self.update(self.ordinary, {'roles': [role['id']]})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()['user']['canEdit'])
        self.assertEqual(response.json()['user']['roles'], [role['id']])
        rights = get_effective_permissions(self.ordinary)
        self.assertIn('login.add_news', rights)
        self.assertNotIn('login.delete_news', rights)
        filtered = self.client.get(BASE + 'users/', {'role': role['id']}).json()
        self.assertEqual([user['id'] for user in filtered['users']], [self.ordinary.pk])
        self.assertEqual(self.role_detail(role)['assignedCount'], 1)

    def test_custom_role_permission_edits_take_effect_and_native_group_changes_are_visible(self):
        role = self.create_role()
        self.update(self.ordinary, {'roles': [role['id']]})
        role = self.role_detail(role)
        response = self.write('patch', f"{BASE}roles/{role['groupId']}/", {
            'revision': role['revision'], 'name': 'News editors', 'permissions': ['login.change_news'],
        })
        self.assertEqual(response.status_code, 200, response.content)
        rights = get_effective_permissions(self.ordinary)
        self.assertIn('login.change_news', rights)
        self.assertNotIn('login.add_news', rights)
        group = Group.objects.using(DB).get(pk=role['groupId'])
        self.assertEqual(group.name, 'News editors')
        permissions = ensure_permission_catalog(DB)
        group.permissions.set([permissions['login.delete_events']])
        group.name = 'Native Django role'
        group.save(using=DB)
        native = self.role_detail(role)
        self.assertEqual(native['name'], group.name)
        self.assertIn('login.delete_events', native['permissions'])
        self.assertNotIn('login.change_news', native['permissions'])
        self.assertIn('login.delete_events', get_effective_permissions(self.ordinary))
        self.assertNotIn('login.change_news', get_effective_permissions(self.ordinary))

    def test_role_delete_requires_exact_name_and_preserves_other_access(self):
        role = self.create_role()
        self.update(self.ordinary, {'roles': [role['id'], 'access_operations']})
        self.ordinary.user_permissions.add(ensure_permission_catalog(DB)['login.change_events'])
        role = self.role_detail(role)
        endpoint = f"{BASE}roles/{role['groupId']}/"
        response = self.write('delete', endpoint, {'revision': role['revision'], 'confirmName': 'wrong'})
        self.assertEqual(response.status_code, 400, response.content)
        response = self.write('delete', endpoint, {'revision': role['revision'], 'confirmName': role['name']})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(Group.objects.using(DB).filter(pk=role['groupId']).exists())
        self.assertTrue(self.ordinary.groups.filter(name=ACCESS_GROUPS['access_operations']).exists())
        self.assertTrue(self.ordinary.user_permissions.filter(codename='change_events').exists())
        self.assertNotIn('login.add_news', get_effective_permissions(self.ordinary))
        history = self.client.get(BASE + 'history/').json()['entries']
        role_history = [entry for entry in history if entry['objectType'] == 'role']
        self.assertEqual({entry['action'] for entry in role_history}, {'created', 'deleted'})
        self.assertIn('1 user(s)', role_history[0]['summary'])

    def test_role_revision_detects_membership_and_native_permission_changes(self):
        role = self.create_role()
        endpoint = f"{BASE}roles/{role['groupId']}/"
        self.update(self.ordinary, {'roles': [role['id']]})
        response = self.write('delete', endpoint, {'revision': role['revision'], 'confirmName': role['name']})
        self.assertEqual(response.status_code, 409, response.content)
        role = self.role_detail(role)
        Group.objects.using(DB).get(pk=role['groupId']).permissions.clear()
        response = self.write('patch', endpoint, {
            'revision': role['revision'], 'name': 'Stale edit', 'permissions': ['login.delete_news'],
        })
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(Group.objects.using(DB).get(pk=role['groupId']).name, role['name'])

    def test_custom_role_validation_rejects_unknown_native_permissions_and_duplicate_names(self):
        role = self.create_role()
        for data in (
            {'name': '', 'permissions': []},
            {'name': 'x' * 151, 'permissions': []},
            {'name': role['name'].upper(), 'permissions': []},
            {'name': 'admin access', 'permissions': []},
            {'name': 'Escalated', 'permissions': ['auth.change_user']},
            {'name': 'Escalated', 'permissions': ['login.change_unknown']},
            {'name': 'Invalid', 'permissions': 'login.add_news'},
        ):
            with self.subTest(data=data):
                response = self.write('post', BASE + 'roles/', data)
                self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Group.objects.using(DB).exclude(name__in=ACCESS_GROUPS.values()).count(), 1)

    def test_system_roles_cannot_be_renamed_or_deleted_even_by_superuser(self):
        group = Group.objects.using(DB).get(name=ACCESS_GROUPS['access_admin'])
        role = self.role_detail({'groupId': group.pk})
        self.assertTrue(role['isSystem'])
        self.assertFalse(role['canEdit'])
        self.assertFalse(role['canDelete'])
        for method, payload in (
            ('patch', {'name': 'Replaced admin', 'permissions': []}),
            ('delete', {'confirmName': group.name}),
        ):
            response = self.write(method, f'{BASE}roles/{group.pk}/', {
                'revision': role['revision'], **payload,
            }, self.sign_in(self.superuser))
            self.assertEqual(response.status_code, 403, response.content)
        self.assertTrue(Group.objects.using(DB).filter(pk=group.pk, name=group.name).exists())

    def test_advanced_native_role_is_protected_and_permissions_survive_superuser_edit(self):
        content_type = ContentType.objects.db_manager(DB).get_for_model(get_user_model())
        permission, _ = Permission.objects.using(DB).get_or_create(
            content_type=content_type, codename='change_user', defaults={'name': 'Can change user'},
        )
        group = Group.objects.using(DB).create(name='Native account managers')
        group.permissions.add(permission)
        role = self.role_detail({'groupId': group.pk})
        self.assertFalse(role['canEdit'])
        self.assertFalse(role['canAssign'])
        self.assertEqual(role['unmanagedPermissions'][0]['id'], 'auth.change_user')
        response = self.update(self.ordinary, {'roles': [role['id']]})
        self.assertEqual(response.status_code, 403)
        response = self.write('patch', f'{BASE}roles/{group.pk}/', {
            'revision': role['revision'], 'name': group.name, 'permissions': ['login.add_news'],
        })
        self.assertEqual(response.status_code, 403)
        response = self.write('patch', f'{BASE}roles/{group.pk}/', {
            'revision': role['revision'], 'name': group.name, 'permissions': ['login.add_news'],
        }, self.sign_in(self.superuser))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(group.permissions.filter(pk=permission.pk).exists())
        self.assertTrue(group.permissions.filter(codename='add_news').exists())

    def test_custom_role_writes_require_csrf_and_administrator_session(self):
        role = self.create_role()
        payloads = (
            ('post', BASE + 'roles/', {'name': 'Blocked', 'permissions': []}),
            ('patch', f"{BASE}roles/{role['groupId']}/", {
                'revision': role['revision'], 'name': 'Blocked', 'permissions': [],
            }),
            ('delete', f"{BASE}roles/{role['groupId']}/", {
                'revision': role['revision'], 'confirmName': role['name'],
            }),
        )
        for client in (self.sign_in(self.admin, csrf=True), self.sign_in(self.ordinary), self.sign_in(self.it_user)):
            for method, endpoint, data in payloads:
                with self.subTest(method=method):
                    self.assertEqual(self.write(method, endpoint, data, client).status_code, 403)
        self.assertTrue(Group.objects.using(DB).filter(pk=role['groupId'], name=role['name']).exists())

    def test_safe_direct_permissions_do_not_block_ordinary_account_management(self):
        self.ordinary.user_permissions.add(ensure_permission_catalog(DB)['login.add_news'])
        self.assertTrue(self.detail(self.ordinary)['canEdit'])
        response = self.update(self.ordinary, {'firstName': 'Updated'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(self.ordinary.user_permissions.filter(codename='add_news').exists())

    def test_unchecking_custom_role_removes_only_that_membership(self):
        role = self.create_role()
        self.update(self.ordinary, {'roles': [role['id'], 'access_operations']})
        response = self.update(self.ordinary, {'roles': ['access_operations']})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(self.ordinary.groups.filter(pk=role['groupId']).exists())
        self.assertTrue(self.ordinary.groups.filter(name=ACCESS_GROUPS['access_operations']).exists())
        self.assertNotIn('login.add_news', get_effective_permissions(self.ordinary))

    def test_superuser_can_remove_advanced_group_without_removing_direct_permissions(self):
        content_type, _ = ContentType.objects.using(DB).get_or_create(app_label='auth', model='user')
        permission, _ = Permission.objects.using(DB).get_or_create(
            content_type=content_type, codename='change_user', defaults={'name': 'Can change user'},
        )
        group = Group.objects.using(DB).create(name='Native account managers')
        group.permissions.add(permission)
        self.ordinary.groups.add(group)
        self.ordinary.user_permissions.add(permission)
        response = self.update(self.ordinary, {'roles': []}, self.sign_in(self.superuser))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(self.ordinary.groups.filter(pk=group.pk).exists())
        self.assertTrue(self.ordinary.user_permissions.filter(pk=permission.pk).exists())

