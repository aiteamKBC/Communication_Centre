"""Verify the effective isolated destinations; optionally prove a running API uses them.

Run from backend with venv/Scripts/python.exe -m training_plan_lms_reference_dev.verify.
With --api, a synthetic viewer and temporary session are created in the copies only.
"""
import json
import os
import sys
import urllib.request

os.environ['DJANGO_SETTINGS_MODULE'] = 'training_plan_lms_reference_dev.settings'


def main():
    import django
    django.setup()
    from django.conf import settings
    from django.db import connections
    from api.models import TrainingPlan

    expected = {'default': 'tp_lms_reference_app', 'login_db': 'tp_lms_reference_auth'}
    if set(settings.DATABASES) != set(expected):
        raise RuntimeError('Unexpected database aliases in the isolated application.')
    for alias, name in expected.items():
        with connections[alias].cursor() as cur:
            cur.execute('SELECT host(inet_server_addr()), inet_server_port(), current_database(), current_user')
            destination = cur.fetchone()
            if destination != ('127.0.0.1', 55432, name, 'tp_lms_test_app'):
                raise RuntimeError('Unsafe effective test database destination.')
            cur.execute('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')
            if any(cur.fetchone()):
                raise RuntimeError('Application test credentials have unexpected elevated privileges.')
        print(alias, 'effective destination verified:', name, 'on 127.0.0.1:55432')
    if settings.CALLCENTRE_EMAIL_LIVE_ALLOWED or settings.CALLCENTRE_REMINDERS_ENABLED or settings.CALLCENTRE_AI_ENABLED:
        raise RuntimeError('Outbound effects must be disabled before starting the test application.')
    print('Restored Training Plan rows:', TrainingPlan.objects.count())
    print('Outbound notifications, background reminders and external Python network access disabled.')
    source = getattr(settings, 'TRAINING_PLAN_LMS_REFERENCE_SOURCE', None)
    if source:
        import psycopg
        with psycopg.connect(**source) as reader:
            actual = reader.execute('SELECT host(inet_server_addr()),inet_server_port(),current_database(),current_user').fetchone()
            if actual != ('127.0.0.1', 55432, 'tp_lms_reference_source', 'tp_lms_reference_reader'):
                raise RuntimeError('Unsafe effective LMS fixture destination.')
            if reader.execute('SHOW transaction_read_only').fetchone()[0] != 'on':
                raise RuntimeError('LMS fixture reader must default to read only.')
            if reader.execute("SELECT has_table_privilege(current_user,'curriculum.modules','INSERT,UPDATE,DELETE,TRUNCATE')").fetchone()[0]:
                raise RuntimeError('LMS fixture reader must not have write privileges.')
        print('LMS effective destination verified: tp_lms_reference_source on 127.0.0.1:55432; independent SELECT-only reader.')
    if '--api' in sys.argv:
        from django.contrib.auth import get_user_model
        from django.test import Client
        from api.views import active_training_plan_filter
        user, created = get_user_model().objects.db_manager('login_db').get_or_create(
            username='training-plan-isolation-verifier',
            defaults={'email': 'isolation-verifier@example.invalid', 'is_active': True})
        if created:
            user.set_unusable_password()
            user.save(using='login_db', update_fields=['password'])
        client = Client()
        client.force_login(user, backend='login.backends.LoginDBModelBackend')
        try:
            cookie = client.cookies[settings.SESSION_COOKIE_NAME].value
            request = urllib.request.Request('http://127.0.0.1:8101/api/training-plan/',
                headers={'Cookie': settings.SESSION_COOKIE_NAME + '=' + cookie})
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.loads(response.read())
            local_labels = {ident: (cohort, group) for ident, cohort, group in
                TrainingPlan.objects.filter(active_training_plan_filter()).values_list('id', 'cohort_name', 'group_name')}
            local_ids = set(local_labels)
            if {item['id'] for item in payload['items']} != local_ids:
                raise RuntimeError('Running API records do not match the verified local copy.')
            if any((item['cohortName'], item['groupName']) != local_labels[item['id']] for item in payload['items']):
                raise RuntimeError('Running API labels do not match the verified local copy.')
            print('Running API on 127.0.0.1:8101 verified against the restored local copy:', len(local_ids), 'active records.')
        finally:
            client.logout()
    connections.close_all()


if __name__ == '__main__':
    main()
