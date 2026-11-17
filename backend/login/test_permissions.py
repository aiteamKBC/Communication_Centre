"""Real native groups and routed API authorization, using isolated SQLite only."""
import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.http import JsonResponse
from django.test import Client, RequestFactory, TestCase, override_settings

from api.permissions import protect_api_view, required_permissions
from .access import ACCESS_GROUPS, ensure_access_groups, get_user_access_payload
from .permissions import (BASELINE_PERMISSIONS, SAFE_PERMISSION_CODES, ensure_permission_catalog,
                          get_effective_permissions, has_app_permission, permission_catalog)


BACKEND = 'login.backends.LoginDBModelBackend'


@override_settings(
    AUTHENTICATION_BACKENDS=[BACKEND],
    DATABASE_ROUTERS=['backend.db_routers.AuthAdminRouter', 'backend.db_routers.CallCentreRouter'],
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
    MIDDLEWARE=[
        'django.contrib.sessions.middleware.SessionMiddleware',
        'django.middleware.csrf.CsrfViewMiddleware',
        'django.contrib.auth.middleware.AuthenticationMiddleware',
        'django.contrib.messages.middleware.MessageMiddleware',
        'login.middleware.ApiLoginRequiredMiddleware',
    ],
)
class CustomPermissionTests(TestCase):
    databases = {'default', 'login_db'}

    @classmethod
    def setUpTestData(cls):
        ContentType.objects.clear_cache()
        ensure_access_groups('login_db')
        cls.catalog = ensure_permission_catalog('login_db')
        cls.user = get_user_model().objects.db_manager('login_db').create_user(
            username='custom.editor', email='custom.editor@example.com', password='test-password')
        cls.role = Group.objects.using('login_db').create(name='Custom news creator')
        cls.user.groups.add(cls.role)

    @classmethod
    def tearDownClass(cls):
        try:
            super().tearDownClass()
        finally:
            ContentType.objects.clear_cache()

    def setUp(self):
        self.client.force_login(self.user, backend=BACKEND)

    def grant(self, *codes):
        self.role.permissions.add(*(self.catalog[f'login.{code}'] for code in codes))

    def write(self, method, path, data, client=None, **headers):
        return getattr(client or self.client, method)(path, data=json.dumps(data),
                                                    content_type='application/json', **headers)

    def test_catalog_uses_native_permissions_and_real_proxy_content_type(self):
        from .models import CommunicationAccess
        self.assertEqual(set(self.catalog), SAFE_PERMISSION_CODES)
        self.assertEqual(ensure_permission_catalog('login_db'), self.catalog)
        for permission in self.catalog.values():
            self.assertEqual(permission._state.db, 'login_db')
            self.assertEqual(permission.content_type.model_class(), CommunicationAccess)
        self.grant('add_news')
        self.assertTrue(self.user.has_perm('login.add_news'))
        self.assertTrue(has_app_permission(self.user, 'add_news'))

    def test_baseline_read_access_is_honest_in_catalog_and_never_grants_writes(self):
        self.assertEqual(get_effective_permissions(self.user), set(BASELINE_PERMISSIONS))
        marked = {permission['id'] for section in permission_catalog()
                  for permission in section['permissions'] if permission['baseline']}
        self.assertEqual(marked, BASELINE_PERMISSIONS)
        self.assertNotIn('login.view_user_activity', marked)
        self.assertFalse(has_app_permission(self.user, 'add_news'))

    def test_native_group_and_direct_permission_changes_take_effect_without_cache(self):
        self.grant('change_events')
        self.assertTrue(has_app_permission(self.user, 'change_events'))
        self.role.permissions.clear()
        self.assertFalse(has_app_permission(self.user, 'change_events'))
        self.user.user_permissions.add(self.catalog['login.change_events'])
        self.assertTrue(has_app_permission(self.user, 'change_events'))
        self.user.user_permissions.clear()
        self.assertFalse(has_app_permission(self.user, 'change_events'))
        self.grant('change_events')
        self.user.groups.remove(self.role)
        self.assertFalse(has_app_permission(self.user, 'change_events'))

    def test_matching_codename_on_wrong_content_type_does_not_grant_access(self):
        content_type, _ = ContentType.objects.using('login_db').get_or_create(app_label='login', model='unrelated')
        impostor = Permission.objects.using('login_db').create(
            content_type=content_type, codename='add_news', name='Unrelated permission')
        self.role.permissions.add(impostor)
        self.assertFalse(has_app_permission(self.user, 'add_news'))

    def test_fixed_groups_retain_rights_without_seeding_new_memberships(self):
        marketing = Group.objects.using('login_db').get(name=ACCESS_GROUPS['access_marketing'])
        self.user.groups.add(marketing)
        self.assertTrue(has_app_permission(self.user, 'add_news'))
        self.assertTrue(has_app_permission(self.user, 'delete_news'))
        self.assertFalse(has_app_permission(self.user, 'delete_events'))
        self.user.groups.add(Group.objects.using('login_db').get(name=ACCESS_GROUPS['access_it']))
        self.assertTrue(has_app_permission(self.user, 'view_user_activity'))

    def test_custom_permissions_change_capabilities_without_impersonating_a_job_role(self):
        self.grant('change_news', 'add_training_plan', 'view_user_activity')
        access = get_user_access_payload(self.user)
        self.assertTrue(access['canManageNews'])
        self.assertTrue(access['canManageCohorts'])
        self.assertTrue(access['canViewUserActivity'])
        self.assertFalse(access['adminAccess'])
        self.assertFalse(access['operationsAccess'])
        self.assertFalse(access['callCentreAgentAccess'])
        self.assertEqual(access['permissions'], sorted(get_effective_permissions(self.user)))
        self.assertEqual(self.client.get('/api/administration/session/').status_code, 403)

    def test_inactive_and_anonymous_users_have_no_effective_permissions(self):
        self.grant('add_news')
        self.assertEqual(get_effective_permissions(AnonymousUser()), set())
        self.user.is_active = False
        self.user.is_superuser = True
        self.assertEqual(get_effective_permissions(self.user), set())

    def test_native_staff_flag_does_not_grant_app_mutations(self):
        self.user.is_staff = True
        self.user.save(using='login_db', update_fields=['is_staff'])
        self.assertFalse(has_app_permission(self.user, 'add_news'))
        self.assertEqual(self.write('post', '/api/news/', {'title': 'No', 'summary': 'No'}).status_code, 403)

    def test_superuser_receives_app_capabilities_without_assigning_fixed_roles(self):
        self.user.is_superuser = True
        self.assertEqual(get_effective_permissions(self.user), set(SAFE_PERMISSION_CODES))

    def test_news_creator_can_create_but_cannot_edit_delete_or_create_other_content(self):
        self.grant('add_news')
        created = self.write('post', '/api/news/', {'title': 'Custom role article', 'summary': 'Test summary'})
        self.assertEqual(created.status_code, 201, created.content)
        identifier = created.json()['id']
        self.assertEqual(self.client.get(f'/api/news/{identifier}/').status_code, 200)
        self.assertEqual(self.write('patch', f'/api/news/{identifier}/', {'title': 'Changed', 'summary': 'Changed'}).status_code, 403)
        self.assertEqual(self.write('delete', f'/api/news/{identifier}/', {}).status_code, 403)
        self.assertEqual(self.write('post', '/api/events/', {'title': 'Event', 'date': '2026-11-17'}).status_code, 403)
        self.grant('change_news')
        updated = self.write('patch', f'/api/news/{identifier}/', {'title': 'Changed', 'summary': 'Changed'})
        self.assertEqual(updated.status_code, 200, updated.content)
        self.role.permissions.remove(self.catalog['login.change_news'])
        self.assertEqual(self.write('patch', f'/api/news/{identifier}/', {'title': 'No', 'summary': 'No'}).status_code, 403)

    def test_user_activity_and_audit_logs_require_explicit_read_permission(self):
        for path in ('/api/user-activity/', '/api/audit-logs/'):
            self.assertEqual(self.client.get(path).status_code, 403)
        self.grant('view_user_activity')
        for path in ('/api/user-activity/', '/api/audit-logs/'):
            self.assertEqual(self.client.get(path).status_code, 200)

    def test_real_api_requires_csrf_even_with_a_valid_permission(self):
        self.grant('add_news')
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user, backend=BACKEND)
        client.get('/api/news/')
        data = {'title': 'CSRF protected', 'summary': 'Test'}
        self.assertEqual(self.write('post', '/api/news/', data, client).status_code, 403)
        token = client.cookies['csrftoken'].value
        self.assertEqual(self.write('post', '/api/news/', data, client, HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_route_policy_protects_semantic_actions_and_bulk_replace(self):
        expected = {
            ('training-plan', 'POST'): ('login.add_training_plan', 'login.change_training_plan', 'login.delete_training_plan'),
            ('training-plan-archive-cohort', 'PATCH'): ('login.delete_training_plan',),
            ('training-plan-archive-module', 'PATCH'): ('login.delete_training_plan',),
            ('training-plan-restore-cohort', 'PATCH'): ('login.change_training_plan',),
            ('dashboard-cards-reorder', 'POST'): ('login.change_dashboard_cards',),
            ('leadership-message', 'POST'): ('login.add_news', 'login.change_news'),
        }
        for (name, method), required in expected.items():
            self.assertEqual(required_permissions(name, method), required)
        self.grant('change_training_plan')
        response = self.write('post', '/api/training-plan/', {'items': []})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.write('patch', '/api/training-plan/cohorts/x/archive/', {}).status_code, 403)
        self.assertEqual(self.write('post', '/api/training-plan/cohorts/', {}).status_code, 403)

    def test_restricted_mutations_are_rejected_before_view_or_database_work(self):
        cases = (
            ('/api/events/', 'post'), ('/api/news/', 'post'), ('/api/employees/', 'post'),
            ('/api/urgent-notice/', 'post'), ('/api/leadership-message/', 'post'),
            ('/api/dashboard-cards/', 'post'), ('/api/training-plan/', 'post'),
            ('/api/training-plan/cohorts/', 'post'), ('/api/training-plan-holidays/', 'post'),
            ('/api/training-plan-holiday-types/', 'patch'), ('/api/training-plan-modules/', 'post'),
            ('/api/training-plan-program-configs/', 'post'), ('/api/modules/', 'post'),
            ('/api/tutor-profiles/', 'post'), ('/api/coach-profiles/', 'post'),
            ('/api/ksb-profiles/', 'post'), ('/api/training-plan/lms-reference/', 'post'),
            ('/api/training-plan/modules/1/', 'patch'), ('/api/upload-image/', 'post'),
        )
        for path, method in cases:
            with self.subTest(path=path, method=method):
                response = self.write(method, path, {})
                self.assertEqual(response.status_code, 403, response.content)

    def test_cohort_patch_checks_add_and_delete_deltas_before_any_mutation(self):
        from api.models import TrainingPlan
        from api.views import training_plan_version

        first = TrainingPlan.objects.create(
            cohort_name='Cohort', program='Programme', starting_date_lable='2026-01-01',
            module_name='First module', group_name='Group', coach_name='', tutor_name='',
            start_date='2026-01-05', end_date='2026-01-19', sessions_number='3',
            notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1')
        second = TrainingPlan.objects.create(
            cohort_name='Cohort', program='Programme', starting_date_lable='2026-01-01',
            module_name='Second module', group_name='Group', coach_name='', tutor_name='',
            start_date='2026-02-05', end_date='2026-02-19', sessions_number='3',
            notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b2')
        first_block = {'trainingPlanId': str(first.pk), 'groupId': 'g1', 'blockId': 'b1', 'moduleName': 'Edited first'}
        second_block = {'trainingPlanId': str(second.pk), 'groupId': 'g1', 'blockId': 'b2'}
        new_block = {'groupId': 'g1', 'blockId': 'b3', 'moduleName': 'New module',
                     'startDate': '2026-03-01', 'endDate': '2026-03-15', 'sessionsNumber': '3'}

        def edit(blocks):
            return self.write('patch', '/api/training-plan/cohorts/c1/', {
                'version': training_plan_version(), 'programmeId': 'p1', 'cohortName': 'Edited cohort',
                'startingDateLabel': '2026-01-01', 'allowBlockMembershipChanges': True, 'blocks': blocks})

        self.grant('change_training_plan')
        self.assertEqual(edit([first_block, second_block, new_block]).status_code, 403)
        self.assertEqual(edit([first_block]).status_code, 403)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.module_name, 'First module')
        self.assertFalse(second.is_archived)
        self.assertEqual(TrainingPlan.objects.count(), 2)
        # Editing existing blocks remains possible without Add or Delete.
        response = edit([first_block, second_block])
        self.assertEqual(response.status_code, 200, response.content)
        self.grant('add_training_plan')
        response = edit([first_block, second_block, new_block])
        self.assertEqual(response.status_code, 200, response.content)
        added = TrainingPlan.objects.get(module_name='New module')
        added_block = {'trainingPlanId': str(added.pk), 'groupId': 'g1', 'blockId': 'b3'}
        self.assertEqual(edit([first_block, added_block]).status_code, 403)
        self.grant('delete_training_plan')
        response = edit([first_block, added_block])
        self.assertEqual(response.status_code, 200, response.content)
        second.refresh_from_db()
        self.assertTrue(second.is_archived)

    def test_holiday_type_upsert_cannot_overwrite_with_add_permission_alone(self):
        from api.models import TrainingPlanHoliday

        self.grant('add_training_plan')
        payload = {'value': 'permission-test', 'label': 'Permission test', 'color': '#112233'}
        response = self.write('post', '/api/training-plan-holiday-types/', payload)
        self.assertEqual(response.status_code, 201, response.content)
        record = TrainingPlanHoliday.objects.get(type='permission-test')
        payload['color'] = '#445566'
        response = self.write('post', '/api/training-plan-holiday-types/', payload)
        self.assertEqual(response.status_code, 403)
        record.refresh_from_db()
        self.assertEqual(record.color, '#112233')
        self.grant('change_training_plan')
        response = self.write('post', '/api/training-plan-holiday-types/', payload)
        self.assertEqual(response.status_code, 201, response.content)
        record.refresh_from_db()
        self.assertEqual(record.color, '#445566')

    def test_forced_profile_deletion_also_requires_edit_for_unlinking_references(self):
        from api.models import CoachProfile, TutorProfile

        self.grant('delete_training_plan')
        coach = CoachProfile.objects.create(name='Permission coach', normalized_name='permission coach')
        tutor = TutorProfile.objects.create(name='Permission tutor', normalized_name='permission tutor')
        for path, profile in (('coach-profiles', coach), ('tutor-profiles', tutor)):
            response = self.write('delete', f'/api/{path}/{profile.pk}/?force=1',
                                  {'confirmForceDelete': True},
                                  HTTP_X_KBC_PROFILE_FORCE_DELETE='internal-admin-debug')
            self.assertEqual(response.status_code, 403)
            self.assertIn('login.change_training_plan', response.json()['requiredPermissions'])
            self.assertTrue(type(profile).objects.filter(pk=profile.pk).exists())
        self.grant('change_training_plan')
        for path, profile in (('coach-profiles', coach), ('tutor-profiles', tutor)):
            response = self.write('delete', f'/api/{path}/{profile.pk}/?force=1',
                                  {'confirmForceDelete': True},
                                  HTTP_X_KBC_PROFILE_FORCE_DELETE='internal-admin-debug')
            self.assertEqual(response.status_code, 200, response.content)
            self.assertFalse(type(profile).objects.filter(pk=profile.pk).exists())

    def test_upload_only_requires_a_content_creation_or_edit_permission(self):
        self.grant('delete_news')
        self.assertEqual(self.write('post', '/api/upload-image/', {}).status_code, 403)
        self.grant('add_events')
        # Permission succeeds and the upload view validates the missing file.
        self.assertEqual(self.write('post', '/api/upload-image/', {}).status_code, 400)

    def test_unknown_mutation_routes_fail_closed_and_forged_identity_is_ignored(self):
        request = RequestFactory().post('/api/future-mutation/', {}, content_type='application/json')
        request.user = self.user
        request._dont_enforce_csrf_checks = True
        view = protect_api_view(lambda request: JsonResponse({'called': True}), 'future-mutation')
        self.assertEqual(view(request).status_code, 403)
        client = Client()
        self.assertEqual(client.get('/api/user-activity/?userId=1&adminAccess=true').status_code, 401)

    def test_routed_dashboard_card_permissions_do_not_grant_engagement_access(self):
        self.grant('add_dashboard_cards', 'change_dashboard_cards')
        payload = {'title': 'Managed by custom role', 'url': 'https://example.com/dashboard', 'audience': 'coaches'}
        response = self.write('post', '/api/dashboard-cards/', payload)
        self.assertEqual(response.status_code, 201, response.content)
        identifier = response.json()['id']
        detail = self.client.get(f'/api/dashboard-cards/{identifier}/')
        self.assertEqual(detail.status_code, 200)
        self.assertFalse(detail.json()['visibleToMe'])
        self.assertEqual(self.write('delete', f'/api/dashboard-cards/{identifier}/', {}).status_code, 403)
        self.grant('delete_dashboard_cards')
        self.assertEqual(self.write('delete', f'/api/dashboard-cards/{identifier}/', {}).status_code, 200)

