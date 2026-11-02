"""Integration checks on the restored PostgreSQL copies, never on source databases.

Run: venv/Scripts/python.exe -m training_plan_lms_reference_dev.test_reference
No Django test database creation/flush is used. Live-plan mutations roll back;
only this feature's test reference table is truncated between concurrency tests.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
import os
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

os.environ['DJANGO_SETTINGS_MODULE'] = 'training_plan_lms_reference_dev.settings'
import django
django.setup()

import psycopg
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connections, DatabaseError, IntegrityError, transaction
from django.test import RequestFactory, override_settings

from api.models import TrainingPlan, TrainingPlanLmsReference
from api.training_plan_lms_reference import read_lms_reference_records, training_plan_lms_reference
from api.views import training_plan_items_snapshot, training_plan_version, training_plan_session_detail

PRIVATE = Path(__file__).resolve().parent / 'private'


def verify_destinations():
    from .verify import main
    main()
    source = settings.TRAINING_PLAN_LMS_REFERENCE_SOURCE
    assert (source['host'], source['port'], source['dbname'], source['user']) == (
        '127.0.0.1', 55432, 'tp_lms_reference_source', 'tp_lms_reference_reader')


def actor(username, email):
    user, created = get_user_model().objects.db_manager('login_db').get_or_create(
        username=username, defaults={'email': email, 'is_active': True})
    if created:
        user.set_unusable_password()
        user.save(using='login_db', update_fields=['password'])
    return user


def request(user, method='GET', body=None, suffix=''):
    rf = RequestFactory()
    req = rf.generic(method, '/api/training-plan/lms-reference/' + suffix,
                     data=json.dumps(body if body is not None else {}), content_type='application/json')
    req.user = user
    return training_plan_lms_reference(req)


def fixture_owner():
    state = json.loads((PRIVATE / 'state.json').read_text())
    conn = psycopg.connect(host='127.0.0.1', port=55432, dbname='tp_lms_reference_source',
                           user='tp_lms_test_owner', password=state['ownerPassword'])
    assert conn.execute('SELECT host(inet_server_addr()),inet_server_port(),current_database()').fetchone() == (
        '127.0.0.1', 55432, 'tp_lms_reference_source')
    return conn


class ReferenceChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        verify_destinations()
        cls.manager = get_user_model().objects.using('login_db').get(username='training-plan-local-preview')
        cls.viewer = actor('reference-test-viewer', 'reference-viewer@example.invalid')

    def setUp(self):
        self.atomic = transaction.atomic()
        self.atomic.__enter__()
        self.assertFalse(TrainingPlanLmsReference.objects.exists(), 'Tests require an uncaptured local reference table.')

    def tearDown(self):
        transaction.set_rollback(True)
        self.atomic.__exit__(None, None, None)

    def capture(self):
        response = request(self.manager, 'POST')
        self.assertEqual(response.status_code, 201, response.content)
        return json.loads(response.content)['reference']

    def test_complete_verified_mapping_dates_missing_values_and_no_source_writes(self):
        before_plan = training_plan_items_snapshot()
        before_source = read_lms_reference_records()
        reference = self.capture()
        self.assertEqual(reference['records'], before_source)
        self.assertEqual(reference['count'], 332)
        self.assertTrue(any(row['startDate'] is None for row in reference['records']))
        self.assertTrue(any(row['endDate'] is None for row in reference['records']))
        for row in reference['records']:
            for key in ('startDate', 'endDate'):
                if row[key] is not None:
                    self.assertEqual(date.fromisoformat(row[key]).isoformat(), row[key])
        self.assertEqual(training_plan_items_snapshot(), before_plan)
        self.assertEqual(read_lms_reference_records(), before_source)

    def test_live_changes_and_deletion_do_not_change_reference(self):
        reference = self.capture()
        row = TrainingPlan.objects.first()
        row.module_name = 'Changed only in isolated live plan'
        row.save(update_fields=['module_name'])
        TrainingPlan.objects.exclude(pk=row.pk).first().delete()
        self.assertEqual(json.loads(request(self.viewer).content)['reference'], reference)

    def test_lms_changes_do_not_change_reference_and_get_never_reads_source(self):
        reference = self.capture()
        owner = fixture_owner()
        try:
            source_id = owner.execute('SELECT module_catalogue_id FROM curriculum.modules ORDER BY module_catalogue_id LIMIT 1').fetchone()[0]
            owner.execute("UPDATE curriculum.modules SET title='Changed in LMS test copy',start_date='2040-01-01' WHERE module_catalogue_id=%s", (source_id,))
            owner.execute('DELETE FROM curriculum.modules WHERE module_catalogue_id=(SELECT module_catalogue_id FROM curriculum.modules ORDER BY module_catalogue_id DESC LIMIT 1)')
            with patch('api.training_plan_lms_reference.read_lms_reference_records', side_effect=AssertionError('GET must not read LMS')):
                self.assertEqual(json.loads(request(self.manager).content)['reference'], reference)
                self.assertEqual(json.loads(request(self.viewer).content)['reference'], reference)
        finally:
            owner.rollback()
            owner.close()

    def test_viewer_cannot_capture_and_nobody_can_mutate(self):
        self.assertEqual(request(self.viewer, 'POST').status_code, 403)
        self.capture()
        for user in (self.manager, self.viewer):
            for method in ('PATCH', 'PUT', 'DELETE'):
                self.assertEqual(request(user, method).status_code, 405)
        self.assertEqual(request(self.manager, 'POST').status_code, 409)

    def test_anonymous_cannot_read_or_capture(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertEqual(request(AnonymousUser()).status_code, 401)
        self.assertEqual(request(AnonymousUser(), 'POST').status_code, 401)

    def test_client_rows_and_filtered_capture_are_rejected(self):
        self.assertEqual(request(self.manager, 'POST', {'records': []}).status_code, 400)
        self.assertEqual(request(self.manager, 'POST', suffix='?programme=filtered').status_code, 400)
        self.assertFalse(TrainingPlanLmsReference.objects.exists())

    def test_failed_capture_leaves_no_partial_reference(self):
        invalid = dict(settings.TRAINING_PLAN_LMS_REFERENCE_SOURCE, dbname='tp_lms_reference_missing_test_database')
        with override_settings(TRAINING_PLAN_LMS_REFERENCE_SOURCE=invalid):
            self.assertEqual(request(self.manager, 'POST').status_code, 503)
        self.assertFalse(TrainingPlanLmsReference.objects.exists())
        with patch('api.training_plan_lms_reference.TrainingPlanLmsReference.objects.create', side_effect=DatabaseError('simulated local insertion failure')):
            self.assertEqual(request(self.manager, 'POST').status_code, 503)
        self.assertFalse(TrainingPlanLmsReference.objects.exists())

    def test_database_blocks_reference_update_and_delete(self):
        self.capture()
        with self.assertRaises(IntegrityError), transaction.atomic():
            TrainingPlanLmsReference.objects.filter(pk=1).update(records=[])
        with self.assertRaises(IntegrityError), transaction.atomic():
            TrainingPlanLmsReference.objects.filter(pk=1).delete()

    def test_source_reader_cannot_write_even_if_transaction_read_only_is_disabled(self):
        with psycopg.connect(**settings.TRAINING_PLAN_LMS_REFERENCE_SOURCE) as reader:
            reader.execute('SET TRANSACTION READ WRITE')
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                reader.execute('UPDATE curriculum.modules SET title=title')

    def test_date_values_do_not_shift_with_application_timezone(self):
        baseline = read_lms_reference_records()
        with override_settings(TIME_ZONE='Pacific/Kiritimati'):
            self.assertEqual(read_lms_reference_records(), baseline)

    def test_original_partial_save_and_stale_version_protection(self):
        self.capture()
        version = training_plan_version()
        row = TrainingPlan.objects.filter(is_archived=False).first()
        rf = RequestFactory()
        req = rf.patch(f'/api/training-plan/sessions/{row.pk}/',
                       data=json.dumps({'version': version, 'notes': row.notes + '\nIsolated reference regression check'}), content_type='application/json')
        req.user = self.manager
        response = training_plan_session_detail(req, row.pk)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotEqual(training_plan_version(), version)
        req = rf.patch(f'/api/training-plan/sessions/{row.pk}/',
                       data=json.dumps({'version': version, 'notes': 'Must not overwrite'}), content_type='application/json')
        req.user = self.manager
        self.assertEqual(training_plan_session_detail(req, row.pk).status_code, 409)


class ConcurrentCaptureCheck(unittest.TestCase):
    def test_simultaneous_captures_have_one_winner(self):
        verify_destinations()
        self.assertFalse(TrainingPlanLmsReference.objects.exists())
        manager = get_user_model().objects.using('login_db').get(username='training-plan-local-preview')
        original = read_lms_reference_records
        barrier = threading.Barrier(2)

        def simultaneous_read():
            rows = original()
            barrier.wait(timeout=15)
            return rows

        def capture(_):
            try:
                return request(manager, 'POST').status_code
            finally:
                connections.close_all()

        try:
            with patch('api.training_plan_lms_reference.read_lms_reference_records', side_effect=simultaneous_read):
                with ThreadPoolExecutor(max_workers=2) as pool:
                    results = list(pool.map(capture, range(2)))
            self.assertEqual(sorted(results), [201, 409])
            self.assertEqual(TrainingPlanLmsReference.objects.count(), 1)
            self.assertEqual(TrainingPlanLmsReference.objects.get(pk=1).records, original())
        finally:
            # Test cleanup only, on the verified isolated local reference table.
            with connections['default'].cursor() as cursor:
                cursor.execute('TRUNCATE training_plan_lms_reference')


if __name__ == '__main__':
    unittest.main(verbosity=2)
