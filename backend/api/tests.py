import json
import shutil
import tempfile
from types import SimpleNamespace
from datetime import date, timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, SimpleTestCase, TestCase
from django.test.utils import override_settings
from django.utils import timezone

from django.db import connection

from .models import AuditLog, CoachProfile, Employee, Module, TrainingPlan, TrainingPlanHoliday, TrainingPlanModuleDefinition, TrainingPlanProgramConfig, TutorProfile
from .views import (
	LEGACY_TRAINING_PLAN_FULL_SAVE_FLAG_VALUE,
	MAX_UPLOAD_IMAGE_SIZE_BYTES,
	MAX_UPLOAD_IMAGE_SIZE_MB,
	MIGRATED_TRAINING_PLAN_FULL_SAVE_SOURCES,
	PROFILE_FORCE_DELETE_CONFIRM_VALUE,
	_session_display_login_at,
	is_probable_tutor_profile_match,
	training_plan_holiday_types_version,
	training_plan_module_definitions_version,
	training_plan_program_configs_version,
	training_plan_holidays_version,
	training_plan_version,
)


def serialize_training_plan_for_test(row):
	row.refresh_from_db()
	return {
		'cohort_name': row.cohort_name,
		'program': row.program,
		'starting_date_lable': row.starting_date_lable,
		'module_name': row.module_name,
		'group_name': row.group_name,
		'coach_name': row.coach_name,
		'tutor_name': row.tutor_name,
		'tutor_profile_id': row.tutor_profile_id,
		'start_date': row.start_date,
		'end_date': row.end_date,
		'sessions_number': row.sessions_number,
		'session_week_day': row.session_week_day,
		'session_start_time': row.session_start_time,
		'session_end_time': row.session_end_time,
		'session_ksb_json': row.session_ksb_json,
		'session_coverage_json': row.session_coverage_json,
		'ksb_profile_id': row.ksb_profile_id,
		'programme_display_order': row.programme_display_order,
		'cohort_display_order': row.cohort_display_order,
		'is_archived': row.is_archived,
		'archived_at': row.archived_at.isoformat() if row.archived_at else '',
		'archived_by': row.archived_by,
		'archive_reason': row.archive_reason,
		'notes': row.notes,
	}


class UserActivitySessionDisplayTests(SimpleTestCase):
	def test_future_login_time_is_clamped_to_last_seen(self):
		now = timezone.now()
		last_seen_at = now - timedelta(minutes=1)
		session = SimpleNamespace(
			login_at=now + timedelta(minutes=45),
			last_seen_at=last_seen_at,
			logout_at=None,
		)

		self.assertEqual(_session_display_login_at(session, now), last_seen_at)

	def test_login_time_after_server_now_is_clamped_to_now(self):
		now = timezone.now()
		session = SimpleNamespace(
			login_at=now + timedelta(minutes=45),
			last_seen_at=None,
			logout_at=None,
		)

		self.assertEqual(_session_display_login_at(session, now), now)


class TutorProfileMatchingTests(SimpleTestCase):
	def test_short_names_with_different_initials_are_not_duplicate_warnings(self):
		self.assertFalse(is_probable_tutor_profile_match('Osama', 'Samar'))

	def test_exact_tutor_name_is_duplicate_warning(self):
		self.assertTrue(is_probable_tutor_profile_match(' Osama ', 'osama'))

	def test_close_long_tutor_name_is_duplicate_warning(self):
		self.assertTrue(is_probable_tutor_profile_match('Mohamed Ali', 'Mohammad Ali'))


class UploadImageEndpointTests(TestCase):
	def setUp(self):
		self.client = Client()
		self.media_root = tempfile.mkdtemp()
		self.override = override_settings(MEDIA_ROOT=self.media_root)
		self.override.enable()
		AuditLog.objects.all().delete()

	def tearDown(self):
		self.override.disable()
		shutil.rmtree(self.media_root, ignore_errors=True)

	def test_upload_image_accepts_valid_image_under_limit(self):
		file = SimpleUploadedFile(
			'event-photo.jpg',
			b'\xff\xd8\xff' + b'a' * 1024,
			content_type='image/jpeg',
		)

		response = self.client.post('/api/upload-image/', {'file': file, 'folder': 'events'})

		self.assertEqual(response.status_code, 201)
		payload = response.json()
		self.assertTrue(payload['url'].startswith('/media/uploads/events/'))
		self.assertTrue(AuditLog.objects.filter(entity='Image', action='upload', after__folder='events').exists())

	def test_upload_image_rejects_image_over_limit_without_saving(self):
		file = SimpleUploadedFile(
			'too-large.jpg',
			b'\xff\xd8\xff' + b'a' * (MAX_UPLOAD_IMAGE_SIZE_BYTES + 1),
			content_type='image/jpeg',
		)

		response = self.client.post('/api/upload-image/', {'file': file, 'folder': 'events'})

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.json(), {
			'detail': f'Image is too large. Maximum allowed size is {MAX_UPLOAD_IMAGE_SIZE_MB}MB.',
			'maxSizeBytes': MAX_UPLOAD_IMAGE_SIZE_BYTES,
			'maxSizeMb': MAX_UPLOAD_IMAGE_SIZE_MB,
		})
		self.assertFalse(AuditLog.objects.filter(entity='Image', action='upload', object_label='too-large.jpg').exists())

	def test_upload_image_rejects_non_image_file(self):
		file = SimpleUploadedFile(
			'document.pdf',
			b'%PDF-1.4',
			content_type='application/pdf',
		)

		response = self.client.post('/api/upload-image/', {'file': file, 'folder': 'events'})

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.content.decode(), 'Only image uploads are allowed.')


class EmployeeDeleteSafetyTests(TestCase):
	_created_employee_table = False

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		existing_tables = connection.introspection.table_names()
		if Employee._meta.db_table not in existing_tables:
			with connection.schema_editor() as schema_editor:
				schema_editor.create_model(Employee)
			cls._created_employee_table = True

	@classmethod
	def tearDownClass(cls):
		if cls._created_employee_table:
			with connection.schema_editor() as schema_editor:
				schema_editor.delete_model(Employee)
		super().tearDownClass()

	def setUp(self):
		Employee.objects.all().delete()
		AuditLog.objects.all().delete()
		self.client = Client()

	def create_employee(self, name, reports_to=None):
		return Employee.objects.create(
			full_name=name,
			job_title='',
			department='Ops',
			reports_to=reports_to,
			email='',
			phone='',
		)

	def test_delete_employee_reparents_direct_reports_to_manager_and_audits(self):
		manager = self.create_employee('Manager')
		target = self.create_employee('Lead', reports_to=str(manager.pk))
		report = self.create_employee('Report', reports_to=str(target.pk))

		response = self.client.delete(f'/api/employees/{target.pk}/')

		self.assertEqual(response.status_code, 200)
		self.assertFalse(Employee.objects.filter(pk=target.pk).exists())
		report.refresh_from_db()
		self.assertEqual(report.reports_to, str(manager.pk))
		self.assertTrue(AuditLog.objects.filter(
			entity='Employee',
			action='delete',
			object_id=str(target.pk),
			metadata__directReportsReparented=1,
			metadata__previousManagerId=str(manager.pk),
			metadata__newManagerId=str(manager.pk),
		).exists())

	def test_delete_employee_clears_direct_reports_when_manager_is_missing(self):
		target = self.create_employee('Lead', reports_to='999999')
		report = self.create_employee('Report', reports_to=str(target.pk))

		response = self.client.delete(f'/api/employees/{target.pk}/')

		self.assertEqual(response.status_code, 200)
		report.refresh_from_db()
		self.assertIsNone(report.reports_to)
		self.assertTrue(AuditLog.objects.filter(
			entity='Employee',
			action='delete',
			object_id=str(target.pk),
			metadata__directReportsReparented=1,
			metadata__previousManagerId='999999',
			metadata__newManagerId=None,
		).exists())


class TutorCoachProfileDeleteSafetyTests(TestCase):
	_created_training_plan_table = False

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		existing_tables = connection.introspection.table_names()
		if TrainingPlan._meta.db_table not in existing_tables:
			with connection.schema_editor() as schema_editor:
				schema_editor.create_model(TrainingPlan)
			cls._created_training_plan_table = True

	@classmethod
	def tearDownClass(cls):
		if cls._created_training_plan_table:
			with connection.schema_editor() as schema_editor:
				schema_editor.delete_model(TrainingPlan)
		super().tearDownClass()

	def setUp(self):
		TrainingPlan.objects.all().delete()
		TutorProfile.objects.all().delete()
		CoachProfile.objects.all().delete()
		AuditLog.objects.all().delete()
		self.client = Client()

	def create_training_plan_row(self, **overrides):
		values = {
			'cohort_name': 'Cohort 1',
			'program': 'Programme',
			'starting_date_lable': '2026-01-01',
			'module_name': 'Module',
			'group_name': 'Group',
			'coach_name': '',
			'tutor_name': '',
			'tutor_profile_id': None,
			'start_date': '2026-01-05',
			'end_date': '2026-01-19',
			'sessions_number': '3',
			'session_week_day': 'monday',
			'session_start_time': '09:00',
			'session_end_time': '11:00',
			'session_ksb_json': '',
			'session_coverage_json': '',
			'ksb_profile_id': None,
			'programme_display_order': 0,
			'cohort_display_order': 0,
			'is_archived': False,
			'archived_at': None,
			'archived_by': '',
			'archive_reason': '',
			'notes': '',
		}
		values.update(overrides)
		return TrainingPlan.objects.create(**values)

	def create_tutor(self):
		return TutorProfile.objects.create(name='Tutor One', normalized_name='tutor one')

	def create_coach(self):
		return CoachProfile.objects.create(name='Coach One', normalized_name='coach one')

	def force_delete_headers(self):
		return {'HTTP_X_KBC_PROFILE_FORCE_DELETE': PROFILE_FORCE_DELETE_CONFIRM_VALUE}

	def test_tutor_default_delete_deactivates_and_preserves_training_plan_references(self):
		tutor = self.create_tutor()
		coverage = [{'sessionNumber': 1, 'assignedTutorProfileId': str(tutor.id), 'coverageStatus': 'none', 'tutorUnavailable': False}]
		row = self.create_training_plan_row(tutor_name=tutor.name, tutor_profile_id=tutor.id, session_coverage_json=json.dumps(coverage))

		response = self.client.delete(f'/api/tutor-profiles/{tutor.id}/')

		self.assertEqual(response.status_code, 200)
		payload = response.json()
		self.assertFalse(payload['deleted'])
		self.assertTrue(payload['deactivated'])
		tutor.refresh_from_db()
		row.refresh_from_db()
		self.assertFalse(tutor.is_active)
		self.assertEqual(row.tutor_profile_id, tutor.id)
		self.assertEqual(row.tutor_name, 'Tutor One')
		self.assertEqual(json.loads(row.session_coverage_json), coverage)

	def test_tutor_force_delete_without_confirmation_returns_forbidden(self):
		tutor = self.create_tutor()
		row = self.create_training_plan_row(tutor_name=tutor.name, tutor_profile_id=tutor.id)

		with self.assertLogs('api.views', level='WARNING') as captured:
			response = self.client.delete(f'/api/tutor-profiles/{tutor.id}/?force=1')

		self.assertEqual(response.status_code, 403)
		self.assertTrue(any('TUTOR_PROFILE_FORCE_DELETE_ATTEMPTED' in message for message in captured.output))
		tutor.refresh_from_db()
		row.refresh_from_db()
		self.assertTrue(tutor.is_active)
		self.assertEqual(row.tutor_profile_id, tutor.id)

	def test_tutor_force_delete_with_confirmation_unlinks_and_audits(self):
		tutor = self.create_tutor()
		row = self.create_training_plan_row(tutor_name=tutor.name, tutor_profile_id=tutor.id)

		with self.assertLogs('api.views', level='WARNING') as captured:
			response = self.client.delete(
				f'/api/tutor-profiles/{tutor.id}/?force=1',
				data=json.dumps({'confirmForceDelete': True}),
				content_type='application/json',
				**self.force_delete_headers(),
			)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.json()['deleted'])
		self.assertTrue(any('TUTOR_PROFILE_FORCE_DELETE_ATTEMPTED' in message and '"accepted": true' in message for message in captured.output))
		self.assertFalse(TutorProfile.objects.filter(pk=tutor.id).exists())
		row.refresh_from_db()
		self.assertIsNone(row.tutor_profile_id)
		self.assertEqual(row.tutor_name, '')
		self.assertTrue(AuditLog.objects.filter(entity='TutorProfile', action='delete', object_id=str(tutor.id), metadata__force=True).exists())

	def test_coach_default_delete_deactivates_and_preserves_coverage_references(self):
		coach = self.create_coach()
		coverage = [{'sessionNumber': 1, 'coverageCoachProfileId': str(coach.id), 'coverageStatus': 'covered', 'tutorUnavailable': True, 'coverageReason': 'Cover needed'}]
		row = self.create_training_plan_row(coach_name=coach.name, session_coverage_json=json.dumps(coverage))

		response = self.client.delete(f'/api/coach-profiles/{coach.id}/')

		self.assertEqual(response.status_code, 200)
		payload = response.json()
		self.assertFalse(payload['deleted'])
		self.assertTrue(payload['deactivated'])
		coach.refresh_from_db()
		row.refresh_from_db()
		self.assertFalse(coach.is_active)
		self.assertEqual(row.coach_name, 'Coach One')
		self.assertEqual(json.loads(row.session_coverage_json), coverage)

	def test_coach_force_delete_without_confirmation_returns_forbidden(self):
		coach = self.create_coach()
		coverage = [{'sessionNumber': 1, 'coverageCoachProfileId': str(coach.id), 'coverageStatus': 'covered', 'tutorUnavailable': True, 'coverageReason': 'Cover needed'}]
		row = self.create_training_plan_row(coach_name=coach.name, session_coverage_json=json.dumps(coverage))

		with self.assertLogs('api.views', level='WARNING') as captured:
			response = self.client.delete(f'/api/coach-profiles/{coach.id}/?force=1')

		self.assertEqual(response.status_code, 403)
		self.assertTrue(any('COACH_PROFILE_FORCE_DELETE_ATTEMPTED' in message for message in captured.output))
		coach.refresh_from_db()
		row.refresh_from_db()
		self.assertTrue(coach.is_active)
		self.assertEqual(json.loads(row.session_coverage_json), coverage)

	def test_coach_force_delete_with_confirmation_unlinks_coverage_and_audits(self):
		coach = self.create_coach()
		coverage = [{'sessionNumber': 1, 'coverageCoachProfileId': str(coach.id), 'coverageStatus': 'covered', 'tutorUnavailable': True, 'coverageReason': 'Cover needed'}]
		row = self.create_training_plan_row(coach_name=coach.name, session_coverage_json=json.dumps(coverage))

		with self.assertLogs('api.views', level='WARNING') as captured:
			response = self.client.delete(
				f'/api/coach-profiles/{coach.id}/?force=1',
				data=json.dumps({'confirmForceDelete': True}),
				content_type='application/json',
				**self.force_delete_headers(),
			)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.json()['deleted'])
		self.assertTrue(any('COACH_PROFILE_FORCE_DELETE_ATTEMPTED' in message and '"accepted": true' in message for message in captured.output))
		self.assertFalse(CoachProfile.objects.filter(pk=coach.id).exists())
		row.refresh_from_db()
		next_coverage = json.loads(row.session_coverage_json)
		self.assertEqual(next_coverage[0].get('coverageCoachProfileId', ''), '')
		self.assertEqual(next_coverage[0].get('coverageStatus'), 'required')
		self.assertEqual(row.coach_name, 'Coach One')
		self.assertTrue(AuditLog.objects.filter(entity='CoachProfile', action='delete', object_id=str(coach.id), metadata__force=True).exists())

	def test_unknown_tutor_and_coach_ids_return_not_found(self):
		tutor_response = self.client.delete('/api/tutor-profiles/999999/')
		coach_response = self.client.delete('/api/coach-profiles/999999/')

		self.assertEqual(tutor_response.status_code, 404)
		self.assertEqual(coach_response.status_code, 404)

	def test_profile_get_lists_handle_inactive_profiles_as_before(self):
		tutor = self.create_tutor()
		coach = self.create_coach()
		tutor.is_active = False
		tutor.save(update_fields=['is_active'])
		coach.is_active = False
		coach.save(update_fields=['is_active'])

		self.assertEqual(self.client.get('/api/tutor-profiles/').json(), [])
		self.assertEqual(self.client.get('/api/coach-profiles/').json(), [])
		self.assertEqual(len(self.client.get('/api/tutor-profiles/?includeInactive=1').json()), 1)
		self.assertEqual(len(self.client.get('/api/coach-profiles/?includeInactive=1').json()), 1)


class TrainingPlanHolidaySaveTests(TestCase):
	def setUp(self):
		TrainingPlanHoliday.objects.all().delete()
		self.client = Client()

	def create_holiday(self, label='Christmas 25', start_date=date(2025, 12, 22), end_date=date(2025, 12, 28), holiday_type='bank-holiday', color='#ECFDF5'):
		return TrainingPlanHoliday.objects.create(
			label=label,
			start_date=start_date,
			end_date=end_date,
			type=holiday_type,
			color=color,
		)

	def post_json(self, path, payload):
		return self.client.post(path, data=json.dumps(payload), content_type='application/json')

	def patch_json(self, path, payload):
		return self.client.patch(path, data=json.dumps(payload), content_type='application/json')

	def delete_json(self, path, payload):
		return self.client.delete(path, data=json.dumps(payload), content_type='application/json')

	def test_get_holidays_still_returns_items_and_version(self):
		holiday = self.create_holiday()

		response = self.client.get('/api/training-plan-holidays/')

		self.assertEqual(response.status_code, 200)
		payload = response.json()
		self.assertEqual(payload['items'][0]['id'], str(holiday.id))
		self.assertTrue(payload['version'])

	def test_create_one_holiday_does_not_delete_existing_holidays(self):
		existing = self.create_holiday()

		response = self.post_json('/api/training-plan-holidays/', {
			'version': training_plan_holidays_version(),
			'label': 'Spring Break',
			'startDate': '2026-04-01',
			'endDate': '2026-04-05',
			'type': 'term-break',
			'color': '#E8F4FD',
		})

		self.assertEqual(response.status_code, 201)
		self.assertEqual(TrainingPlanHoliday.objects.count(), 2)
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=existing.pk).exists())
		self.assertTrue(TrainingPlanHoliday.objects.filter(label='Spring Break').exists())
		self.assertIn('version', response.json())

	def test_update_one_holiday_only_changes_that_record(self):
		target = self.create_holiday()
		other = self.create_holiday(
			label='Spring Break',
			start_date=date(2026, 4, 1),
			end_date=date(2026, 4, 5),
			holiday_type='term-break',
			color='#E8F4FD',
		)

		response = self.patch_json(f'/api/training-plan-holidays/{target.id}/', {
			'version': training_plan_holidays_version(),
			'label': 'Christmas Break 25',
			'startDate': '2025-12-22',
			'endDate': '2025-12-29',
			'type': 'bank-holiday',
			'color': '#ECFDF5',
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(target.label, 'Christmas Break 25')
		self.assertEqual(target.end_date, date(2025, 12, 29))
		self.assertEqual(other.label, 'Spring Break')
		self.assertEqual(other.end_date, date(2026, 4, 5))

	def test_delete_one_holiday_does_not_delete_unrelated_holidays(self):
		target = self.create_holiday()
		other = self.create_holiday(
			label='Spring Break',
			start_date=date(2026, 4, 1),
			end_date=date(2026, 4, 5),
			holiday_type='term-break',
			color='#E8F4FD',
		)

		response = self.delete_json(f'/api/training-plan-holidays/{target.id}/', {
			'version': training_plan_holidays_version(),
		})

		self.assertEqual(response.status_code, 200)
		self.assertFalse(TrainingPlanHoliday.objects.filter(pk=target.pk).exists())
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=other.pk).exists())

	def test_stale_write_returns_conflict(self):
		target = self.create_holiday()
		stale_version = training_plan_holidays_version()
		self.create_holiday(
			label='Spring Break',
			start_date=date(2026, 4, 1),
			end_date=date(2026, 4, 5),
			holiday_type='term-break',
			color='#E8F4FD',
		)

		response = self.patch_json(f'/api/training-plan-holidays/{target.id}/', {
			'version': stale_version,
			'label': 'Stale Update',
		})

		self.assertEqual(response.status_code, 409)
		target.refresh_from_db()
		self.assertEqual(target.label, 'Christmas 25')

	def test_unknown_fields_are_rejected(self):
		response = self.post_json('/api/training-plan-holidays/', {
			'version': training_plan_holidays_version(),
			'label': 'Christmas Break',
			'startDate': '2025-12-22',
			'endDate': '2025-12-28',
			'type': 'bank-holiday',
			'color': '#ECFDF5',
			'unexpected': True,
		})

		self.assertEqual(response.status_code, 400)
		self.assertEqual(TrainingPlanHoliday.objects.count(), 0)

		holiday = self.create_holiday()
		response = self.patch_json(f'/api/training-plan-holidays/{holiday.id}/', {
			'version': training_plan_holidays_version(),
			'label': 'Christmas Break',
			'unexpected': True,
		})
		self.assertEqual(response.status_code, 400)

	def test_missing_items_from_submitted_payload_are_not_silently_deleted(self):
		existing = self.create_holiday()

		response = self.post_json('/api/training-plan-holidays/', {
			'version': training_plan_holidays_version(),
			'label': 'Spring Break',
			'startDate': '2026-04-01',
			'endDate': '2026-04-05',
			'type': 'term-break',
			'color': '#E8F4FD',
		})

		self.assertEqual(response.status_code, 201)
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=existing.pk).exists())

	def test_full_list_replace_style_payload_is_blocked(self):
		holiday = self.create_holiday()

		response = self.post_json('/api/training-plan-holidays/', {
			'version': training_plan_holidays_version(),
			'items': [{
				'id': str(holiday.id),
				'label': 'Christmas Break 25',
				'startDate': '2025-12-22',
				'endDate': '2025-12-28',
				'type': 'bank-holiday',
				'color': '#ECFDF5',
			}],
		})

		self.assertEqual(response.status_code, 403)
		self.assertEqual(TrainingPlanHoliday.objects.count(), 1)
		holiday.refresh_from_db()
		self.assertEqual(holiday.label, 'Christmas 25')


class TrainingPlanHolidayTypeSafetyTests(TestCase):
	def setUp(self):
		TrainingPlanHoliday.objects.all().delete()
		AuditLog.objects.all().delete()
		self.client = Client()

	def create_type_marker(self, value='bank-holiday', label='Bank Holiday', color='#ECFDF5'):
		return TrainingPlanHoliday.objects.create(
			label=f'__holiday_type__:{label}',
			start_date=date(2099, 1, 1),
			end_date=date(2099, 1, 1),
			type=value,
			color=color,
		)

	def delete_json(self, path, payload):
		return self.client.delete(path, data=json.dumps(payload), content_type='application/json')

	def test_get_holiday_types_returns_version_header(self):
		self.create_type_marker()

		response = self.client.get('/api/training-plan-holiday-types/')

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.headers.get('X-KBC-Training-Plan-Holiday-Types-Version'))
		self.assertEqual(response.json()[0]['value'], 'bank-holiday')

	def test_delete_holiday_type_deletes_only_one_marker_and_audits(self):
		target = self.create_type_marker(value='bank-holiday', label='Bank Holiday')
		other = self.create_type_marker(value='term-break', label='Term Break')
		real_holiday = TrainingPlanHoliday.objects.create(
			label='Christmas 25',
			start_date=date(2025, 12, 22),
			end_date=date(2025, 12, 28),
			type='bank-holiday',
			color='#ECFDF5',
		)

		response = self.delete_json('/api/training-plan-holiday-types/', {
			'id': str(target.id),
			'value': 'bank-holiday',
			'version': training_plan_holiday_types_version(),
		})

		self.assertEqual(response.status_code, 200)
		self.assertFalse(TrainingPlanHoliday.objects.filter(pk=target.pk).exists())
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=other.pk).exists())
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=real_holiday.pk).exists())
		self.assertTrue(AuditLog.objects.filter(entity='TrainingPlanHolidayType', action='delete', object_id=str(target.id), metadata__matchedCount=1).exists())

	def test_delete_holiday_type_rejects_ambiguous_marker_rows(self):
		first = self.create_type_marker(value='bank-holiday', label='Bank Holiday')
		second = self.create_type_marker(value='bank-holiday', label='Bank Holiday Copy')

		response = self.delete_json('/api/training-plan-holiday-types/', {
			'value': 'bank-holiday',
		})

		self.assertEqual(response.status_code, 409)
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=first.pk).exists())
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=second.pk).exists())
		self.assertTrue(AuditLog.objects.filter(entity='TrainingPlanHolidayType', action='reject', metadata__matchedCount=2).exists())

	def test_holiday_type_full_replace_payload_is_blocked(self):
		self.create_type_marker()

		response = self.delete_json('/api/training-plan-holiday-types/', {
			'items': [],
			'value': 'bank-holiday',
		})

		self.assertEqual(response.status_code, 403)
		self.assertEqual(TrainingPlanHoliday.objects.count(), 1)

	def test_holiday_type_stale_optional_version_is_rejected(self):
		target = self.create_type_marker(value='bank-holiday', label='Bank Holiday')
		stale_version = training_plan_holiday_types_version()
		self.create_type_marker(value='term-break', label='Term Break')

		response = self.delete_json('/api/training-plan-holiday-types/', {
			'id': str(target.id),
			'value': 'bank-holiday',
			'version': stale_version,
		})

		self.assertEqual(response.status_code, 409)
		self.assertTrue(TrainingPlanHoliday.objects.filter(pk=target.pk).exists())


class TrainingPlanModuleDefinitionScopedTests(TestCase):
	def setUp(self):
		TrainingPlanModuleDefinition.objects.all().delete()
		self.client = Client()

	def create_definition(self, module_id='module-a', name='Module A', default_sessions=3, bg='#111111', tx='#ffffff'):
		return TrainingPlanModuleDefinition.objects.create(
			module_id=module_id,
			name=name,
			default_sessions=default_sessions,
			bg=bg,
			tx=tx,
		)

	def post_json(self, path, payload):
		return self.client.post(path, data=json.dumps(payload), content_type='application/json')

	def patch_json(self, path, payload):
		return self.client.patch(path, data=json.dumps(payload), content_type='application/json')

	def delete_json(self, path, payload):
		return self.client.delete(path, data=json.dumps(payload), content_type='application/json')

	def test_get_module_definitions_still_returns_array_with_version_header(self):
		self.create_definition()

		response = self.client.get('/api/training-plan-modules/')

		self.assertEqual(response.status_code, 200)
		payload = response.json()
		self.assertIsInstance(payload, list)
		self.assertEqual(payload[0]['id'], 'module-a')
		self.assertTrue(response.headers.get('X-KBC-Training-Plan-Modules-Version'))

	def test_create_one_module_definition_does_not_delete_existing_definitions(self):
		self.create_definition()

		response = self.post_json('/api/training-plan-modules/', {
			'version': training_plan_module_definitions_version(),
			'id': 'module-b',
			'name': 'Module B',
			'defaultSessions': 5,
			'bg': '#222222',
			'tx': '#ffffff',
		})

		self.assertEqual(response.status_code, 201)
		self.assertEqual(TrainingPlanModuleDefinition.objects.count(), 2)
		self.assertTrue(TrainingPlanModuleDefinition.objects.filter(module_id='module-a').exists())
		self.assertTrue(TrainingPlanModuleDefinition.objects.filter(module_id='module-b').exists())

	def test_update_one_module_definition_only_changes_that_record(self):
		target = self.create_definition()
		other = self.create_definition('module-b', 'Module B', 7, '#222222', '#000000')

		response = self.patch_json(f'/api/training-plan-modules/{target.module_id}/', {
			'version': training_plan_module_definitions_version(),
			'name': 'Module A Updated',
			'defaultSessions': 9,
			'bg': '#333333',
			'tx': '#ffffff',
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(target.name, 'Module A Updated')
		self.assertEqual(target.default_sessions, 9)
		self.assertEqual(other.name, 'Module B')
		self.assertEqual(other.default_sessions, 7)

	def test_delete_one_module_definition_does_not_delete_unrelated_records(self):
		target = self.create_definition()
		self.create_definition('module-b', 'Module B')

		response = self.delete_json(f'/api/training-plan-modules/{target.module_id}/', {
			'version': training_plan_module_definitions_version(),
		})

		self.assertEqual(response.status_code, 200)
		self.assertFalse(TrainingPlanModuleDefinition.objects.filter(module_id='module-a').exists())
		self.assertTrue(TrainingPlanModuleDefinition.objects.filter(module_id='module-b').exists())

	def test_stale_write_returns_conflict(self):
		target = self.create_definition()
		stale_version = training_plan_module_definitions_version()
		self.create_definition('module-b', 'Module B')

		response = self.patch_json(f'/api/training-plan-modules/{target.module_id}/', {
			'version': stale_version,
			'name': 'Stale Update',
		})

		self.assertEqual(response.status_code, 409)
		target.refresh_from_db()
		self.assertEqual(target.name, 'Module A')

	def test_unknown_fields_are_rejected(self):
		response = self.post_json('/api/training-plan-modules/', {
			'version': training_plan_module_definitions_version(),
			'id': 'module-a',
			'name': 'Module A',
			'defaultSessions': 3,
			'unexpected': True,
		})

		self.assertEqual(response.status_code, 400)
		self.assertEqual(TrainingPlanModuleDefinition.objects.count(), 0)

		self.create_definition()
		response = self.patch_json('/api/training-plan-modules/module-a/', {
			'version': training_plan_module_definitions_version(),
			'name': 'Module A',
			'unexpected': True,
		})
		self.assertEqual(response.status_code, 400)

	def test_old_full_replace_payload_is_blocked(self):
		self.create_definition()

		response = self.post_json('/api/training-plan-modules/', {
			'items': [{
				'id': 'module-b',
				'name': 'Module B',
				'defaultSessions': 4,
				'bg': '#222222',
				'tx': '#ffffff',
			}],
		})

		self.assertEqual(response.status_code, 403)
		self.assertEqual(TrainingPlanModuleDefinition.objects.count(), 1)
		self.assertTrue(TrainingPlanModuleDefinition.objects.filter(module_id='module-a').exists())


class TrainingPlanProgramConfigScopedTests(TestCase):
	def setUp(self):
		TrainingPlanProgramConfig.objects.all().delete()
		self.client = Client()

	def create_config(self, program_id='prog-a', name='Programme A', sub='Sub A', color='#111111'):
		return TrainingPlanProgramConfig.objects.create(
			program_id=program_id,
			name=name,
			sub=sub,
			color=color,
		)

	def post_json(self, path, payload):
		return self.client.post(path, data=json.dumps(payload), content_type='application/json')

	def patch_json(self, path, payload):
		return self.client.patch(path, data=json.dumps(payload), content_type='application/json')

	def delete_json(self, path, payload):
		return self.client.delete(path, data=json.dumps(payload), content_type='application/json')

	def test_get_programme_configs_still_returns_array_with_version_header(self):
		self.create_config()

		response = self.client.get('/api/training-plan-program-configs/')

		self.assertEqual(response.status_code, 200)
		payload = response.json()
		self.assertIsInstance(payload, list)
		self.assertEqual(payload[0]['id'], 'prog-a')
		self.assertTrue(response.headers.get('X-KBC-Training-Plan-Program-Configs-Version'))

	def test_create_one_programme_config_does_not_delete_existing_configs(self):
		self.create_config()

		response = self.post_json('/api/training-plan-program-configs/', {
			'version': training_plan_program_configs_version(),
			'id': 'prog-b',
			'name': 'Programme B',
			'sub': 'Sub B',
			'color': '#222222',
		})

		self.assertEqual(response.status_code, 201)
		self.assertEqual(TrainingPlanProgramConfig.objects.count(), 2)
		self.assertTrue(TrainingPlanProgramConfig.objects.filter(program_id='prog-a').exists())
		self.assertTrue(TrainingPlanProgramConfig.objects.filter(program_id='prog-b').exists())

	def test_update_one_programme_config_only_changes_that_record(self):
		target = self.create_config()
		other = self.create_config('prog-b', 'Programme B', 'Sub B', '#222222')

		response = self.patch_json(f'/api/training-plan-program-configs/{target.program_id}/', {
			'version': training_plan_program_configs_version(),
			'name': 'Programme A Updated',
			'sub': 'Updated Sub',
			'color': '#333333',
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(target.name, 'Programme A Updated')
		self.assertEqual(target.sub, 'Updated Sub')
		self.assertEqual(other.name, 'Programme B')
		self.assertEqual(other.sub, 'Sub B')

	def test_delete_one_programme_config_does_not_delete_unrelated_records(self):
		target = self.create_config()
		self.create_config('prog-b', 'Programme B')

		response = self.delete_json(f'/api/training-plan-program-configs/{target.program_id}/', {
			'version': training_plan_program_configs_version(),
		})

		self.assertEqual(response.status_code, 200)
		self.assertFalse(TrainingPlanProgramConfig.objects.filter(program_id='prog-a').exists())
		self.assertTrue(TrainingPlanProgramConfig.objects.filter(program_id='prog-b').exists())

	def test_stale_write_returns_conflict(self):
		target = self.create_config()
		stale_version = training_plan_program_configs_version()
		self.create_config('prog-b', 'Programme B')

		response = self.patch_json(f'/api/training-plan-program-configs/{target.program_id}/', {
			'version': stale_version,
			'name': 'Stale Update',
		})

		self.assertEqual(response.status_code, 409)
		target.refresh_from_db()
		self.assertEqual(target.name, 'Programme A')

	def test_unknown_fields_are_rejected(self):
		response = self.post_json('/api/training-plan-program-configs/', {
			'version': training_plan_program_configs_version(),
			'id': 'prog-a',
			'name': 'Programme A',
			'unexpected': True,
		})

		self.assertEqual(response.status_code, 400)
		self.assertEqual(TrainingPlanProgramConfig.objects.count(), 0)

		self.create_config()
		response = self.patch_json('/api/training-plan-program-configs/prog-a/', {
			'version': training_plan_program_configs_version(),
			'name': 'Programme A',
			'unexpected': True,
		})
		self.assertEqual(response.status_code, 400)

	def test_old_full_replace_payload_is_blocked(self):
		self.create_config()

		response = self.post_json('/api/training-plan-program-configs/', {
			'items': [{
				'id': 'prog-b',
				'name': 'Programme B',
				'sub': 'Sub B',
				'color': '#222222',
			}],
		})

		self.assertEqual(response.status_code, 403)
		self.assertEqual(TrainingPlanProgramConfig.objects.count(), 1)
		self.assertTrue(TrainingPlanProgramConfig.objects.filter(program_id='prog-a').exists())


class TrainingPlanPartialUpdateTests(TestCase):
	_created_training_plan_table = False

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		existing_tables = connection.introspection.table_names()
		if TrainingPlan._meta.db_table not in existing_tables:
			with connection.schema_editor() as schema_editor:
				schema_editor.create_model(TrainingPlan)
			cls._created_training_plan_table = True

	@classmethod
	def tearDownClass(cls):
		if cls._created_training_plan_table:
			with connection.schema_editor() as schema_editor:
				schema_editor.delete_model(TrainingPlan)
		super().tearDownClass()

	def setUp(self):
		TrainingPlan.objects.all().delete()
		Module.objects.all().delete()
		self.tutor = TutorProfile.objects.create(name='Tutor One', normalized_name='tutor one')
		self.coverage_tutor = TutorProfile.objects.create(name='Tutor Two', normalized_name='tutor two')
		self.row = self.create_training_plan_row(module_name='Module A', tutor_profile_id=self.tutor.id, tutor_name=self.tutor.name)
		self.other_row = self.create_training_plan_row(module_name='Module B', tutor_profile_id=self.coverage_tutor.id, tutor_name=self.coverage_tutor.name)

	def create_training_plan_row(self, **overrides):
		values = {
			'cohort_name': 'Cohort 1',
			'program': 'Programme',
			'starting_date_lable': '2026-01-01',
			'module_name': 'Module',
			'group_name': 'Group',
			'coach_name': 'Coach',
			'tutor_name': '',
			'tutor_profile_id': None,
			'start_date': '2026-01-05',
			'end_date': '2026-01-19',
			'sessions_number': '3',
			'session_week_day': 'monday',
			'session_start_time': '09:00',
			'session_end_time': '11:00',
			'session_ksb_json': json.dumps([
				{'knowledgeCodes': ['K1'], 'skillCodes': [], 'behaviourCodes': []},
				{'knowledgeCodes': [], 'skillCodes': ['S1'], 'behaviourCodes': []},
				{'knowledgeCodes': [], 'skillCodes': [], 'behaviourCodes': ['B1']},
			]),
			'session_coverage_json': '',
			'ksb_profile_id': None,
			'programme_display_order': 0,
			'cohort_display_order': 0,
			'is_archived': False,
			'archived_at': None,
			'archived_by': '',
			'archive_reason': '',
			'notes': 'Existing notes',
		}
		values.update(overrides)
		return TrainingPlan.objects.create(**values)

	def current_version(self):
		return training_plan_version()

	def patch_json(self, path, payload):
		return Client().patch(path, data=json.dumps(payload), content_type='application/json')

	def post_json(self, path, payload):
		return Client().post(path, data=json.dumps(payload), content_type='application/json')

	def order_invariant_snapshot(self):
		snapshot = {}
		for row in TrainingPlan.objects.order_by('id'):
			item = serialize_training_plan_for_test(row)
			item.pop('programme_display_order', None)
			item.pop('cohort_display_order', None)
			item.pop('is_archived', None)
			item.pop('archived_at', None)
			item.pop('archived_by', None)
			item.pop('archive_reason', None)
			snapshot[row.id] = item
		return snapshot

	def module_add_for_tutor_payload(self, **overrides):
		row = {
			'programmeId': 'p1',
			'cohortId': 'c1',
			'cohortName': 'Cohort A',
			'program': 'Programme One',
			'startingDateLabel': '2026-01-01',
			'moduleName': 'New Tutor Module',
			'groupName': 'Group 1',
			'coachName': 'Coach 1',
			'tutorName': self.tutor.name,
			'tutorProfileId': str(self.tutor.id),
			'startDate': '2026-03-02',
			'endDate': '2026-03-16',
			'sessionsNumber': '3',
			'sessionWeekDay': 'monday',
			'sessionStartTime': '09:00',
			'sessionEndTime': '11:00',
			'sessionKsbMappings': [
				{'knowledgeCodes': ['K1'], 'skillCodes': [], 'behaviourCodes': []},
				{'knowledgeCodes': [], 'skillCodes': ['S1'], 'behaviourCodes': []},
				{'knowledgeCodes': [], 'skillCodes': [], 'behaviourCodes': ['B1']},
			],
			'sessionCoverage': [],
			'ksbProfileId': '',
			'programmeDisplayOrder': 0,
			'cohortDisplayOrder': 0,
			'notes': '__program_id:p1\n__cohort_id:c1\n__group_id:g-new\n__block_id:b-new\n__module_color:#4A6DB0\nCatalogue notes',
		}
		payload = {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c1',
			'groupId': 'g-new',
			'blockId': 'b-new',
			'moduleStableId': 'module-new',
			'tutorProfileId': str(self.tutor.id),
			'row': row,
		}
		payload.update(overrides)
		return payload

	def cohort_add_payload(self, **overrides):
		rows = [
			{
				'programmeId': 'p1',
				'cohortId': 'c-new',
				'cohortName': 'New Cohort',
				'program': 'Programme One',
				'startingDateLabel': '2026-04-01',
				'moduleName': 'Module One',
				'groupName': 'Group A',
				'coachName': 'Coach A',
				'tutorName': self.tutor.name,
				'tutorProfileId': str(self.tutor.id),
				'startDate': '2026-04-06',
				'endDate': '2026-04-20',
				'sessionsNumber': '3',
				'sessionWeekDay': 'monday',
				'sessionStartTime': '09:00',
				'sessionEndTime': '11:00',
				'sessionKsbMappings': [{'knowledgeCodes': ['K1'], 'skillCodes': [], 'behaviourCodes': []}],
				'sessionCoverage': [],
				'ksbProfileId': '',
				'programmeDisplayOrder': 0,
				'cohortDisplayOrder': 2,
				'notes': '__program_id:p1\n__cohort_id:c-new\n__group_id:g-new-a\n__block_id:b-new-a\n__holiday_ids:h1|h2\n__cohort_color:#123456\n__module_color:#4A6DB0\n__cohort_end_date:2026-05-04\nModule notes A',
			},
			{
				'programmeId': 'p1',
				'cohortId': 'c-new',
				'cohortName': 'New Cohort',
				'program': 'Programme One',
				'startingDateLabel': '2026-04-01',
				'moduleName': 'Module Two',
				'groupName': 'Group B',
				'coachName': 'Coach B',
				'tutorName': self.coverage_tutor.name,
				'tutorProfileId': str(self.coverage_tutor.id),
				'startDate': '2026-04-13',
				'endDate': '2026-05-04',
				'sessionsNumber': '4',
				'sessionWeekDay': 'tuesday, thursday',
				'sessionStartTime': '10:00',
				'sessionEndTime': '12:00',
				'sessionKsbMappings': [{'knowledgeCodes': [], 'skillCodes': ['S1'], 'behaviourCodes': []}],
				'sessionCoverage': [{'sessionNumber': 2, 'assignedTutorProfileId': str(self.coverage_tutor.id), 'coverageStatus': 'required', 'tutorUnavailable': True}],
				'ksbProfileId': '7',
				'programmeDisplayOrder': 0,
				'cohortDisplayOrder': 2,
				'notes': '__program_id:p1\n__cohort_id:c-new\n__group_id:g-new-b\n__block_id:b-new-b\n__cohort_color:#123456\n__module_color:#C49A00\n__cohort_end_date:2026-05-04\nModule notes B',
			},
		]
		payload = {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c-new',
			'rows': rows,
		}
		payload.update(overrides)
		return payload

	def test_partial_session_update_changes_only_target_session(self):
		before_count = TrainingPlan.objects.count()
		self.row.notes = '__block_id:block-a\n__module_color:#4A6DB0\nExisting visible module notes'
		self.row.save(update_fields=['notes'])
		other_before = serialize_training_plan_for_test(self.other_row)

		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/', {
			'version': self.current_version(),
			'startDate': '2026-01-12',
			'endDate': '2026-01-26',
			'sessionStartTime': '10:00',
			'sessionEndTime': '12:00',
			'sessionWeekDay': 'monday',
			'tutorProfileId': str(self.coverage_tutor.id),
			'coachName': 'Coach Updated',
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.row.refresh_from_db()
		self.other_row.refresh_from_db()
		self.assertEqual(self.row.start_date, '2026-01-12')
		self.assertEqual(self.row.end_date, '2026-01-26')
		self.assertEqual(self.row.session_start_time, '10:00')
		self.assertEqual(self.row.session_end_time, '12:00')
		self.assertEqual(self.row.session_week_day, 'monday')
		self.assertEqual(self.row.tutor_profile_id, self.coverage_tutor.id)
		self.assertEqual(self.row.tutor_name, self.coverage_tutor.name)
		self.assertEqual(self.row.coach_name, 'Coach Updated')
		self.assertIn('__module_color:#4A6DB0', self.row.notes)
		self.assertEqual(serialize_training_plan_for_test(self.other_row), other_before)
		self.assertTrue(AuditLog.objects.filter(object_label=f'SESSION_SCHEDULE_PARTIAL_UPDATE session {self.row.pk}').exists())

	def test_notes_partial_update_changes_only_target_row_and_does_not_reduce_count(self):
		self.row.notes = '__block_id:block-a\n__module_color:#4A6DB0\nExisting notes'
		self.row.save(update_fields=['notes'])
		before_count = TrainingPlan.objects.count()
		other_before = TrainingPlan.objects.get(pk=self.other_row.pk).notes

		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/', {
			'version': self.current_version(),
			'notes': 'Updated notes',
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.row.refresh_from_db()
		self.other_row.refresh_from_db()
		self.assertEqual(self.row.notes, '__block_id:block-a\n__module_color:#4A6DB0\nUpdated notes')
		self.assertEqual(self.other_row.notes, other_before)
		self.assertTrue(AuditLog.objects.filter(object_label=f'SESSION_NOTES_PARTIAL_UPDATE session {self.row.pk}').exists())

	def test_assignment_partial_update_changes_only_target_row_and_does_not_reduce_count(self):
		before_count = TrainingPlan.objects.count()
		other_before = serialize_training_plan_for_test(self.other_row)

		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/', {
			'version': self.current_version(),
			'tutorProfileId': str(self.coverage_tutor.id),
			'coachName': 'Coach Assigned',
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.row.refresh_from_db()
		self.other_row.refresh_from_db()
		self.assertEqual(self.row.tutor_profile_id, self.coverage_tutor.id)
		self.assertEqual(self.row.tutor_name, self.coverage_tutor.name)
		self.assertEqual(self.row.coach_name, 'Coach Assigned')
		self.assertEqual(serialize_training_plan_for_test(self.other_row), other_before)
		self.assertTrue(AuditLog.objects.filter(object_label=f'SESSION_ASSIGNMENT_PARTIAL_UPDATE session {self.row.pk}').exists())

	def test_coverage_update_changes_only_coverage_fields_for_target_session(self):
		before_count = TrainingPlan.objects.count()
		before_other = TrainingPlan.objects.get(pk=self.other_row.pk).session_coverage_json

		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/coverage/', {
			'version': self.current_version(),
			'sessionNumber': 2,
			'assignedTutorProfileId': str(self.tutor.id),
			'tutorUnavailable': True,
			'tutorUnavailableReason': 'Annual leave',
			'coverageTutorProfileId': str(self.coverage_tutor.id),
			'coverageReason': 'Qualified cover',
			'coverageNotes': 'Only this session',
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.row.refresh_from_db()
		self.other_row.refresh_from_db()
		coverage = json.loads(self.row.session_coverage_json)
		self.assertEqual(len(coverage), 1)
		self.assertEqual(coverage[0]['sessionNumber'], 2)
		self.assertEqual(coverage[0]['coverageTutorProfileId'], str(self.coverage_tutor.id))
		self.assertEqual(self.other_row.session_coverage_json, before_other)

	def test_ksb_update_changes_only_ksb_fields_for_target_session(self):
		before_count = TrainingPlan.objects.count()
		other_before = TrainingPlan.objects.get(pk=self.other_row.pk).session_ksb_json

		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/ksb/', {
			'version': self.current_version(),
			'sessionNumber': 2,
			'knowledgeCodes': ['k2', 'K2', 'bad'],
			'skillCodes': ['s3'],
			'behaviourCodes': ['b4'],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.row.refresh_from_db()
		self.other_row.refresh_from_db()
		mappings = json.loads(self.row.session_ksb_json)
		self.assertEqual(mappings[1], {'knowledgeCodes': ['K2'], 'skillCodes': ['S3'], 'behaviourCodes': ['B4']})
		self.assertEqual(self.other_row.session_ksb_json, other_before)
		self.assertTrue(AuditLog.objects.filter(object_label=f'SESSION_KSB_PARTIAL_UPDATE session {self.row.pk}').exists())

	def test_module_partial_update_changes_only_target_row_and_does_not_reduce_count(self):
		before_count = TrainingPlan.objects.count()
		other_before = serialize_training_plan_for_test(self.other_row)

		response = self.patch_json(f'/api/training-plan/modules/{self.row.pk}/', {
			'version': self.current_version(),
			'moduleName': 'Module A Updated',
			'tutorProfileId': str(self.coverage_tutor.id),
			'notes': '__block_id:block-a\nUpdated visible module notes',
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.row.refresh_from_db()
		self.other_row.refresh_from_db()
		self.assertEqual(self.row.module_name, 'Module A Updated')
		self.assertEqual(self.row.tutor_profile_id, self.coverage_tutor.id)
		self.assertEqual(self.row.tutor_name, self.coverage_tutor.name)
		self.assertEqual(self.row.notes, '__block_id:block-a\nUpdated visible module notes')
		self.assertEqual(serialize_training_plan_for_test(self.other_row), other_before)
		self.assertTrue(AuditLog.objects.filter(object_label=f'MODULE_PARTIAL_UPDATE module {self.row.pk}').exists())

	def test_module_color_partial_update_changes_only_target_row_and_does_not_reduce_count(self):
		self.row.notes = '__block_id:block-a\n__module_color:#4A6DB0\nExisting visible module notes'
		self.row.save(update_fields=['notes'])
		self.other_row.notes = '__block_id:block-b\n__module_color:#1B2A4A\nOther visible module notes'
		self.other_row.save(update_fields=['notes'])
		before_count = TrainingPlan.objects.count()
		other_before = serialize_training_plan_for_test(self.other_row)

		response = self.patch_json(f'/api/training-plan/modules/{self.row.pk}/', {
			'version': self.current_version(),
			'color': '#C49A00',
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.row.refresh_from_db()
		self.other_row.refresh_from_db()
		self.assertIn('__module_color:#C49A00', self.row.notes)
		self.assertIn('Existing visible module notes', self.row.notes)
		self.assertEqual(serialize_training_plan_for_test(self.other_row), other_before)
		self.assertTrue(AuditLog.objects.filter(object_label=f'MODULE_PARTIAL_UPDATE module {self.row.pk}').exists())

	def test_programme_reorder_persists_and_changes_only_order_fields(self):
		TrainingPlan.objects.all().delete()
		p1_row = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1', programme_display_order=0, cohort_display_order=0)
		p1_row_2 = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nP1 C2', programme_display_order=0, cohort_display_order=1)
		p2_row = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\nP2 C3', programme_display_order=1, cohort_display_order=0)
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_snapshot = self.order_invariant_snapshot()

		response = self.patch_json('/api/training-plan/reorder/programmes/', {
			'version': self.current_version(),
			'programmeIds': ['p2', 'p1'],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids))
		self.assertEqual(self.order_invariant_snapshot(), before_snapshot)
		p1_row.refresh_from_db()
		p1_row_2.refresh_from_db()
		p2_row.refresh_from_db()
		self.assertEqual(p1_row.programme_display_order, 1)
		self.assertEqual(p1_row_2.programme_display_order, 1)
		self.assertEqual(p2_row.programme_display_order, 0)
		payload = response.json()
		self.assertEqual([item['programmeId'] for item in payload['items'][:1]], ['p2'])
		self.assertTrue(AuditLog.objects.filter(object_label='PROGRAMME_REORDER_PARTIAL_UPDATE').exists())

	def test_cohort_reorder_persists_and_changes_only_order_fields(self):
		TrainingPlan.objects.all().delete()
		c1_row = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1', programme_display_order=0, cohort_display_order=0)
		c1_row_2 = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', module_name='Module Extra', notes='__program_id:p1\n__cohort_id:c1\nP1 C1 extra', programme_display_order=0, cohort_display_order=0)
		c2_row = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nP1 C2', programme_display_order=0, cohort_display_order=1)
		other_programme = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\nP2 C3', programme_display_order=1, cohort_display_order=0)
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_snapshot = self.order_invariant_snapshot()

		response = self.patch_json('/api/training-plan/reorder/cohorts/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortIds': ['c2', 'c1'],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids))
		self.assertEqual(self.order_invariant_snapshot(), before_snapshot)
		c1_row.refresh_from_db()
		c1_row_2.refresh_from_db()
		c2_row.refresh_from_db()
		other_programme.refresh_from_db()
		self.assertEqual(c1_row.cohort_display_order, 1)
		self.assertEqual(c1_row_2.cohort_display_order, 1)
		self.assertEqual(c2_row.cohort_display_order, 0)
		self.assertEqual(other_programme.cohort_display_order, 0)
		payload = response.json()
		p1_items = [item for item in payload['items'] if item['programmeId'] == 'p1']
		self.assertEqual(p1_items[0]['cohortId'], 'c2')
		self.assertTrue(AuditLog.objects.filter(object_label='COHORT_REORDER_PARTIAL_UPDATE').exists())

	def test_reorder_rejects_missing_duplicate_unknown_cross_scope_and_stale_ids(self):
		TrainingPlan.objects.all().delete()
		self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1', programme_display_order=0, cohort_display_order=0)
		self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nP1 C2', programme_display_order=0, cohort_display_order=1)
		self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\nP2 C3', programme_display_order=1, cohort_display_order=0)

		missing = self.patch_json('/api/training-plan/reorder/programmes/', {
			'version': self.current_version(),
			'programmeIds': ['p2'],
		})
		self.assertEqual(missing.status_code, 400)
		self.assertIn('missingIds', missing.json())

		duplicate = self.patch_json('/api/training-plan/reorder/programmes/', {
			'version': self.current_version(),
			'programmeIds': ['p1', 'p1'],
		})
		self.assertEqual(duplicate.status_code, 400)

		unknown = self.patch_json('/api/training-plan/reorder/programmes/', {
			'version': self.current_version(),
			'programmeIds': ['p1', 'p2', 'p9'],
		})
		self.assertEqual(unknown.status_code, 400)
		self.assertIn('unknownIds', unknown.json())

		cross_scope = self.patch_json('/api/training-plan/reorder/cohorts/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortIds': ['c1', 'c3'],
		})
		self.assertEqual(cross_scope.status_code, 400)
		self.assertIn('crossScopeIds', cross_scope.json())

		stale_version = self.current_version()
		self.create_training_plan_row(program='Programme Three', cohort_name='Cohort D', notes='__program_id:p3\n__cohort_id:c4\nP3 C4', programme_display_order=2, cohort_display_order=0)
		stale = self.patch_json('/api/training-plan/reorder/programmes/', {
			'version': stale_version,
			'programmeIds': ['p2', 'p1'],
		})
		self.assertEqual(stale.status_code, 409)

	def test_cohort_edit_updates_only_target_active_cohort_metadata(self):
		TrainingPlan.objects.all().delete()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_color:#4A6DB0\nExisting A', module_name='Module A', group_name='Old G1', coach_name='Old Coach', start_date='2026-01-05', session_start_time='09:00', programme_display_order=0, cohort_display_order=2)
		target_b = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\nExisting B', module_name='Module B', group_name='Old G2', coach_name='Old Coach 2', start_date='2026-02-05', session_start_time='10:00', programme_display_order=0, cohort_display_order=2)
		other = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nOther', module_name='Module C', group_name='Other G', coach_name='Other Coach', programme_display_order=0, cohort_display_order=3)
		archived_same = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nArchived', module_name='Module D', group_name='Archived G', coach_name='Archived Coach', is_archived=True, archived_at=timezone.now(), archived_by='admin@example.com', archive_reason='Stay archived', programme_display_order=0, cohort_display_order=2)
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		other_before = serialize_training_plan_for_test(other)
		archived_before = serialize_training_plan_for_test(archived_same)
		session_module_before = {
			row.id: {
				'module_name': row.module_name,
				'tutor_name': row.tutor_name,
				'tutor_profile_id': row.tutor_profile_id,
				'start_date': row.start_date,
				'end_date': row.end_date,
				'sessions_number': row.sessions_number,
				'session_week_day': row.session_week_day,
				'session_start_time': row.session_start_time,
				'session_end_time': row.session_end_time,
				'session_ksb_json': row.session_ksb_json,
				'session_coverage_json': row.session_coverage_json,
				'programme_display_order': row.programme_display_order,
				'cohort_display_order': row.cohort_display_order,
			}
			for row in (target_a, target_b)
		}

		response = self.patch_json('/api/training-plan/cohorts/c1/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortName': 'Cohort A Updated',
			'startingDateLabel': '2026-01-10',
			'cohortColor': '#123456',
			'cohortEndDate': '2026-06-30',
			'holidayIds': ['h1', 'h2'],
			'ksbProfileId': '',
			'blocks': [
				{'trainingPlanId': str(target_a.id), 'blockId': 'b1', 'groupId': 'g1', 'groupName': 'New G1', 'coachName': 'New Coach'},
				{'trainingPlanId': str(target_b.id), 'blockId': 'b2', 'groupId': 'g2', 'groupName': 'New G2', 'coachName': 'New Coach 2'},
			],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids))
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		other.refresh_from_db()
		archived_same.refresh_from_db()
		self.assertEqual(target_a.cohort_name, 'Cohort A Updated')
		self.assertEqual(target_b.cohort_name, 'Cohort A Updated')
		self.assertEqual(target_a.starting_date_lable, '2026-01-10')
		self.assertEqual(target_a.group_name, 'New G1')
		self.assertEqual(target_b.group_name, 'New G2')
		self.assertEqual(target_a.coach_name, 'New Coach')
		self.assertEqual(target_b.coach_name, 'New Coach 2')
		self.assertIn('__holiday_ids:h1|h2', target_a.notes)
		self.assertIn('__cohort_color:#123456', target_a.notes)
		self.assertIn('__cohort_end_date:2026-06-30', target_a.notes)
		self.assertIn('__module_color:#4A6DB0', target_a.notes)
		self.assertIn('Existing A', target_a.notes)
		for row in (target_a, target_b):
			self.assertEqual(session_module_before[row.id]['module_name'], row.module_name)
			self.assertEqual(session_module_before[row.id]['start_date'], row.start_date)
			self.assertEqual(session_module_before[row.id]['session_start_time'], row.session_start_time)
			self.assertEqual(session_module_before[row.id]['cohort_display_order'], row.cohort_display_order)
			self.assertEqual(session_module_before[row.id]['programme_display_order'], row.programme_display_order)
			self.assertEqual(session_module_before[row.id]['session_ksb_json'], row.session_ksb_json)
			self.assertEqual(session_module_before[row.id]['session_coverage_json'], row.session_coverage_json)
		self.assertEqual(serialize_training_plan_for_test(other), other_before)
		self.assertEqual(serialize_training_plan_for_test(archived_same), archived_before)
		payload = response.json()
		self.assertEqual(payload['cohort_id'], 'c1')
		self.assertEqual(payload['updated_count'], 2)
		self.assertTrue(AuditLog.objects.filter(object_label='COHORT_EDIT_PARTIAL_UPDATE').exists())
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_cohort_edit_can_update_add_and_archive_modules_without_replace_all(self):
		TrainingPlan.objects.all().delete()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nExisting A', module_name='Module A', group_name='Old G1', coach_name='Old Coach', start_date='2026-01-05', end_date='2026-01-12', sessions_number='2', session_start_time='09:00', programme_display_order=0, cohort_display_order=2)
		target_b = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\nExisting B', module_name='Module B', group_name='Old G2', coach_name='Old Coach 2', start_date='2026-02-05', programme_display_order=0, cohort_display_order=2)
		other = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nOther', module_name='Module C', group_name='Other G', coach_name='Other Coach', programme_display_order=0, cohort_display_order=3)
		before_other = serialize_training_plan_for_test(other)

		response = self.patch_json('/api/training-plan/cohorts/c1/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortName': 'Cohort A Updated',
			'startingDateLabel': '2026-01-10',
			'cohortColor': '#123456',
			'cohortEndDate': '2026-07-31',
			'holidayIds': ['h1'],
			'ksbProfileId': '',
			'allowBlockMembershipChanges': True,
			'blocks': [
				{
					'trainingPlanId': str(target_a.id),
					'blockId': 'b1',
					'groupId': 'g1',
					'groupName': 'New G1',
					'coachName': 'New Coach',
					'moduleName': 'Module A Updated',
					'moduleColor': '#654321',
					'tutorName': 'Tutor Updated',
					'startDate': '2026-01-12',
					'endDate': '2026-01-26',
					'sessionsNumber': '3',
					'sessionWeekDay': 'monday',
					'sessionStartTime': '10:00',
					'sessionEndTime': '12:00',
					'sessionKsbMappings': [{'knowledgeCodes': ['K1'], 'skillCodes': ['S1'], 'behaviourCodes': []}],
					'sessionCoverage': [{'sessionNumber': 1, 'coverageStatus': 'required'}],
					'notes': 'Updated notes',
				},
				{
					'blockId': 'b-new',
					'groupId': 'g1',
					'groupName': 'New G1',
					'coachName': 'New Coach',
					'moduleName': 'Module New',
					'moduleColor': '#112233',
					'tutorName': 'Tutor New',
					'startDate': '2026-03-02',
					'endDate': '2026-03-16',
					'sessionsNumber': '2',
					'sessionWeekDay': 'monday',
					'sessionStartTime': '13:00',
					'sessionEndTime': '15:00',
					'sessionKsbMappings': [],
					'sessionCoverage': [],
					'notes': 'New notes',
				},
			],
		})

		self.assertEqual(response.status_code, 200)
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(target_a.module_name, 'Module A Updated')
		self.assertEqual(target_a.group_name, 'New G1')
		self.assertEqual(target_a.coach_name, 'New Coach')
		self.assertEqual(target_a.tutor_name, 'Tutor Updated')
		self.assertEqual(target_a.start_date, '2026-01-12')
		self.assertEqual(target_a.end_date, '2026-01-26')
		self.assertEqual(target_a.sessions_number, '3')
		self.assertEqual(target_a.session_start_time, '10:00')
		self.assertIn('__module_color:#654321', target_a.notes)
		self.assertEqual(json.loads(target_a.session_ksb_json)[0]['knowledgeCodes'], ['K1'])
		self.assertTrue(target_b.is_archived)
		created = TrainingPlan.objects.get(notes__contains='__block_id:b-new')
		self.assertEqual(created.module_name, 'Module New')
		self.assertEqual(created.cohort_name, 'Cohort A Updated')
		self.assertEqual(created.programme_display_order, target_a.programme_display_order)
		self.assertEqual(created.cohort_display_order, target_a.cohort_display_order)
		self.assertEqual(serialize_training_plan_for_test(other), before_other)
		payload = response.json()
		self.assertEqual(payload['updated_count'], 1)
		self.assertEqual(payload['created_count'], 1)
		self.assertEqual(payload['archived_count'], 1)
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_cohort_edit_rejects_unsafe_scope_and_stale_version(self):
		TrainingPlan.objects.all().delete()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1', module_name='Module A')
		target_b = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1 extra', module_name='Module B')
		other = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nP1 C2', module_name='Module C')

		base_payload = {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortName': 'Cohort A Updated',
			'startingDateLabel': '2026-01-10',
			'holidayIds': [],
			'blocks': [
				{'trainingPlanId': str(target_a.id), 'blockId': 'b1', 'groupId': 'g1', 'groupName': 'New G1', 'coachName': 'New Coach'},
				{'trainingPlanId': str(target_b.id), 'blockId': 'b2', 'groupId': 'g2', 'groupName': 'New G2', 'coachName': 'New Coach 2'},
			],
		}

		missing_id = self.patch_json('/api/training-plan/cohorts/row-123/', base_payload)
		self.assertEqual(missing_id.status_code, 400)

		missing_scope_row = self.patch_json('/api/training-plan/cohorts/c1/', {
			**base_payload,
			'blocks': base_payload['blocks'][:1],
		})
		self.assertEqual(missing_scope_row.status_code, 400)
		self.assertIn('missingIds', missing_scope_row.json())

		cross_scope = self.patch_json('/api/training-plan/cohorts/c1/', {
			**base_payload,
			'blocks': [base_payload['blocks'][0], {'trainingPlanId': str(other.id), 'blockId': 'b3', 'groupId': 'g3', 'groupName': 'Other', 'coachName': 'Other'}],
		})
		self.assertEqual(cross_scope.status_code, 400)
		self.assertIn('crossScopeIds', cross_scope.json())

		unknown = self.patch_json('/api/training-plan/cohorts/c1/', {
			**base_payload,
			'blocks': [*base_payload['blocks'], {'trainingPlanId': '999999', 'blockId': 'b9', 'groupId': 'g9', 'groupName': 'Unknown', 'coachName': 'Unknown'}],
		})
		self.assertEqual(unknown.status_code, 400)
		self.assertIn('unknownIds', unknown.json())

		stale_version = self.current_version()
		self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\nP2 C3', module_name='Module D')
		stale = self.patch_json('/api/training-plan/cohorts/c1/', {
			**base_payload,
			'version': stale_version,
		})
		self.assertEqual(stale.status_code, 409)
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		self.assertEqual(target_a.cohort_name, 'Cohort A')
		self.assertEqual(target_b.cohort_name, 'Cohort A')

	def test_cohort_add_scoped_create_adds_only_new_cohort_rows(self):
		TrainingPlan.objects.all().delete()
		existing = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nExisting', module_name='Existing Module', programme_display_order=0, cohort_display_order=0)
		other_cohort = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\n__group_id:g2\n__block_id:b2\nOther cohort', module_name='Other Cohort Module', programme_display_order=0, cohort_display_order=1)
		other_programme = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\n__group_id:g3\n__block_id:b3\nOther programme', module_name='Other Programme Module', programme_display_order=1, cohort_display_order=0)
		archived = self.create_training_plan_row(program='Programme One', cohort_name='Archived Cohort', notes='__program_id:p1\n__cohort_id:c-archived\n__group_id:g4\n__block_id:b4\nArchived', module_name='Archived Module', is_archived=True, archived_at=timezone.now(), archived_by='admin@example.com', archive_reason='Stay archived')
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_existing = serialize_training_plan_for_test(existing)
		before_other_cohort = serialize_training_plan_for_test(other_cohort)
		before_other_programme = serialize_training_plan_for_test(other_programme)
		before_archived = serialize_training_plan_for_test(archived)

		response = self.post_json('/api/training-plan/cohorts/', self.cohort_add_payload())

		self.assertEqual(response.status_code, 201)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids) + 2)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))[:len(before_ids)], before_ids)
		self.assertEqual(serialize_training_plan_for_test(existing), before_existing)
		self.assertEqual(serialize_training_plan_for_test(other_cohort), before_other_cohort)
		self.assertEqual(serialize_training_plan_for_test(other_programme), before_other_programme)
		self.assertEqual(serialize_training_plan_for_test(archived), before_archived)
		created = list(TrainingPlan.objects.filter(notes__contains='__cohort_id:c-new').order_by('id'))
		self.assertEqual(len(created), 2)
		self.assertEqual([row.module_name for row in created], ['Module One', 'Module Two'])
		self.assertEqual(created[0].cohort_name, 'New Cohort')
		self.assertEqual(created[0].program, 'Programme One')
		self.assertEqual(created[0].group_name, 'Group A')
		self.assertEqual(created[0].tutor_profile_id, self.tutor.id)
		self.assertEqual(created[0].start_date, '2026-04-06')
		self.assertEqual(created[0].end_date, '2026-04-20')
		self.assertEqual(created[0].sessions_number, '3')
		self.assertEqual(created[0].session_week_day, 'monday')
		self.assertEqual(json.loads(created[0].session_ksb_json)[0]['knowledgeCodes'], ['K1'])
		self.assertEqual(json.loads(created[1].session_coverage_json)[0]['sessionNumber'], 2)
		self.assertEqual(created[1].ksb_profile_id, 7)
		self.assertIn('__cohort_color:#123456', created[0].notes)
		self.assertIn('__module_color:#C49A00', created[1].notes)
		payload = response.json()
		self.assertEqual(payload['created_count'], 2)
		self.assertEqual(payload['skipped_count'], 0)
		self.assertEqual(payload['identifiers']['cohortId'], 'c-new')
		self.assertTrue(AuditLog.objects.filter(object_label='COHORT_ADD_SCOPED_CREATE').exists())
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_cohort_add_rejects_missing_full_save_existing_row_and_stale_payloads(self):
		TrainingPlan.objects.all().delete()
		self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nExisting', module_name='Existing Module')

		missing = self.post_json('/api/training-plan/cohorts/', self.cohort_add_payload(cohortId=''))
		self.assertEqual(missing.status_code, 400)

		full_save_like = self.post_json('/api/training-plan/cohorts/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c-new',
			'items': self.cohort_add_payload()['rows'],
		})
		self.assertEqual(full_save_like.status_code, 400)

		existing_row_payload = self.cohort_add_payload()
		existing_row_payload['rows'][0]['id'] = '123'
		existing_row = self.post_json('/api/training-plan/cohorts/', existing_row_payload)
		self.assertEqual(existing_row.status_code, 400)

		stale_version = self.current_version()
		self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\n__group_id:g2\n__block_id:b2\nNew row', module_name='Other Module')
		stale = self.post_json('/api/training-plan/cohorts/', self.cohort_add_payload(version=stale_version))
		self.assertEqual(stale.status_code, 409)
		self.assertEqual(TrainingPlan.objects.filter(notes__contains='__cohort_id:c-new').count(), 0)

	def test_cohort_add_duplicate_retry_and_conflicting_identity(self):
		TrainingPlan.objects.all().delete()
		self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nExisting', module_name='Existing Module')
		payload = self.cohort_add_payload()
		first = self.post_json('/api/training-plan/cohorts/', payload)
		self.assertEqual(first.status_code, 201)
		created_ids = first.json()['created_ids']

		retry = self.post_json('/api/training-plan/cohorts/', payload)

		self.assertEqual(retry.status_code, 200)
		self.assertEqual(TrainingPlan.objects.filter(notes__contains='__cohort_id:c-new').count(), 2)
		self.assertEqual(retry.json()['created_count'], 0)
		self.assertEqual(retry.json()['skipped_count'], 2)
		self.assertEqual(retry.json()['skipped_ids'], created_ids)

		conflict_payload = self.cohort_add_payload(version=training_plan_version())
		conflict_payload['rows'][0]['moduleName'] = 'Changed Module'
		conflict = self.post_json('/api/training-plan/cohorts/', conflict_payload)
		self.assertEqual(conflict.status_code, 400)
		self.assertEqual(TrainingPlan.objects.filter(notes__contains='__cohort_id:c-new').count(), 2)
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_cohort_archive_marks_only_target_rows_and_get_excludes_archived(self):
		TrainingPlan.objects.all().delete()
		c1_row = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1', module_name='Module A', programme_display_order=0, cohort_display_order=0)
		c1_row_2 = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1 extra', module_name='Module B', programme_display_order=0, cohort_display_order=0)
		c2_row = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nP1 C2', module_name='Module C', programme_display_order=0, cohort_display_order=1)
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_snapshot = self.order_invariant_snapshot()

		response = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c1',
			'trainingPlanIds': [str(c1_row.id), str(c1_row_2.id)],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids))
		self.assertEqual(self.order_invariant_snapshot(), before_snapshot)
		c1_row.refresh_from_db()
		c1_row_2.refresh_from_db()
		c2_row.refresh_from_db()
		self.assertTrue(c1_row.is_archived)
		self.assertTrue(c1_row_2.is_archived)
		self.assertFalse(c2_row.is_archived)
		self.assertIsNotNone(c1_row.archived_at)
		payload = response.json()
		self.assertEqual(payload['count'], 1)
		self.assertEqual(payload['items'][0]['cohortId'], 'c2')
		self.assertTrue(AuditLog.objects.filter(object_label='COHORT_ARCHIVE_PARTIAL_UPDATE').exists())

		get_payload = Client().get('/api/training-plan/').json()
		self.assertEqual([item['cohortId'] for item in get_payload['items']], ['c2'])
		include_archived = Client().get('/api/training-plan/?includeArchived=1').json()
		self.assertEqual(len(include_archived['items']), 3)

	def test_cohort_archive_does_not_scope_by_legacy_name_identity(self):
		TrainingPlan.objects.all().delete()
		legacy = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', starting_date_lable='2026-01-01', notes='Legacy row without markers', module_name='Module A')
		before = serialize_training_plan_for_test(legacy)

		response = self.patch_json('/api/training-plan/cohorts/cohort%20a::2026-01-01/archive/', {
			'version': self.current_version(),
			'programmeId': 'programme one',
			'cohortId': 'cohort a::2026-01-01',
			'trainingPlanIds': [str(legacy.id)],
		})

		self.assertEqual(response.status_code, 404)
		legacy.refresh_from_db()
		self.assertEqual(serialize_training_plan_for_test(legacy), before)
		self.assertFalse(AuditLog.objects.filter(object_label='COHORT_ARCHIVE_PARTIAL_UPDATE').exists())

	def test_cohort_edit_does_not_scope_by_legacy_name_identity(self):
		TrainingPlan.objects.all().delete()
		legacy = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', starting_date_lable='2026-01-01', notes='Legacy row without markers', module_name='Module A')
		before = serialize_training_plan_for_test(legacy)

		response = self.patch_json('/api/training-plan/cohorts/cohort%20a::2026-01-01/', {
			'version': self.current_version(),
			'programmeId': 'programme one',
			'cohortName': 'Renamed Cohort',
			'startingDateLabel': '2026-01-01',
			'blocks': [{
				'trainingPlanId': legacy.id,
				'groupId': 'g1',
				'blockId': 'b1',
				'groupName': 'Group',
				'coachName': 'Coach',
				'moduleName': 'Module A',
				'startDate': '2026-01-05',
				'endDate': '2026-01-19',
				'sessionsNumber': '3',
			}],
		})

		self.assertEqual(response.status_code, 404)
		legacy.refresh_from_db()
		self.assertEqual(serialize_training_plan_for_test(legacy), before)
		self.assertFalse(AuditLog.objects.filter(object_label='COHORT_EDIT_PARTIAL_UPDATE').exists())

	def test_module_archive_marks_only_matching_module_scope(self):
		TrainingPlan.objects.all().delete()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nTarget A', module_name='Shared Module', programme_display_order=0, cohort_display_order=0)
		target_b = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\nTarget B', module_name='Shared Module', programme_display_order=1, cohort_display_order=0)
		other = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nOther', module_name='Other Module', programme_display_order=0, cohort_display_order=0)
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_snapshot = self.order_invariant_snapshot()

		response = self.patch_json('/api/training-plan/modules/archive/', {
			'version': self.current_version(),
			'moduleName': 'Shared Module',
			'trainingPlanIds': [str(target_a.id), str(target_b.id)],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids))
		self.assertEqual(self.order_invariant_snapshot(), before_snapshot)
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		other.refresh_from_db()
		self.assertTrue(target_a.is_archived)
		self.assertTrue(target_b.is_archived)
		self.assertFalse(other.is_archived)
		payload = response.json()
		self.assertEqual(payload['count'], 1)
		self.assertEqual(payload['items'][0]['moduleName'], 'Other Module')
		self.assertTrue(AuditLog.objects.filter(object_label='MODULE_ARCHIVE_PARTIAL_UPDATE').exists())

	def test_module_linked_rows_partial_update_changes_only_target_rows(self):
		TrainingPlan.objects.all().delete()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_color:#4A6DB0\nTarget A', module_name='Shared Module', programme_display_order=0, cohort_display_order=0)
		target_b = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_color:#4A6DB0\nTarget B', module_name='Shared Module', programme_display_order=0, cohort_display_order=0)
		other_module = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g3\n__block_id:b3\nOther module', module_name='Other Module', programme_display_order=0, cohort_display_order=0)
		other_cohort = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\n__group_id:g4\n__block_id:b4\nOther cohort', module_name='Other Module', programme_display_order=0, cohort_display_order=1)
		other_programme = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\n__group_id:g5\n__block_id:b5\nOther programme', module_name='Other Module', programme_display_order=1, cohort_display_order=0)
		archived_same_module = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g6\n__block_id:b6\nArchived target', module_name='Shared Module', is_archived=True, archived_at=timezone.now(), archived_by='admin@example.com', archive_reason='Keep archived')
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_count = TrainingPlan.objects.count()
		before_other_module = serialize_training_plan_for_test(other_module)
		before_other_cohort = serialize_training_plan_for_test(other_cohort)
		before_other_programme = serialize_training_plan_for_test(other_programme)
		before_archived = serialize_training_plan_for_test(archived_same_module)
		preserved_a = serialize_training_plan_for_test(target_a)
		preserved_b = serialize_training_plan_for_test(target_b)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'Shared Module',
			'moduleName': 'Renamed Shared Module',
			'linkedRows': [
				{'trainingPlanId': str(target_a.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g1', 'blockId': 'b1'},
				{'trainingPlanId': str(target_b.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g2', 'blockId': 'b2'},
			],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		self.assertEqual(target_a.module_name, 'Renamed Shared Module')
		self.assertEqual(target_b.module_name, 'Renamed Shared Module')
		after_a = serialize_training_plan_for_test(target_a)
		after_b = serialize_training_plan_for_test(target_b)
		preserved_a['module_name'] = 'Renamed Shared Module'
		preserved_b['module_name'] = 'Renamed Shared Module'
		preserved_a['notes'] = '__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_color:#4A6DB0\n__module_catalogue_id:42\nTarget A'
		preserved_b['notes'] = '__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_color:#4A6DB0\n__module_catalogue_id:42\nTarget B'
		self.assertEqual(after_a, preserved_a)
		self.assertEqual(after_b, preserved_b)
		self.assertEqual(serialize_training_plan_for_test(other_module), before_other_module)
		self.assertEqual(serialize_training_plan_for_test(other_cohort), before_other_cohort)
		self.assertEqual(serialize_training_plan_for_test(other_programme), before_other_programme)
		self.assertEqual(serialize_training_plan_for_test(archived_same_module), before_archived)
		payload = response.json()
		self.assertEqual(payload['updated_count'], 2)
		self.assertEqual(payload['identifiers']['moduleCatalogueId'], '42')
		self.assertEqual(payload['identifiers']['linkedRows'][0]['trainingPlanId'], target_a.id)
		self.assertTrue(AuditLog.objects.filter(object_label='MODULE_LINKED_ROWS_PARTIAL_UPDATE').exists())
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_module_linked_rows_partial_update_rejects_missing_and_ambiguous_identifiers(self):
		TrainingPlan.objects.all().delete()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nTarget A', module_name='Shared Module')
		target_b = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\nTarget B', module_name='Shared Module')
		before_a = serialize_training_plan_for_test(target_a)
		before_b = serialize_training_plan_for_test(target_b)

		missing = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'Shared Module',
			'moduleName': 'Renamed Shared Module',
			'linkedRows': [{'trainingPlanId': str(target_a.id), 'programmeId': 'p1', 'cohortId': 'c1'}],
		})
		self.assertEqual(missing.status_code, 400)

		ambiguous = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'Shared Module',
			'moduleName': 'Renamed Shared Module',
			'linkedRows': [
				{'trainingPlanId': str(target_a.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g1', 'blockId': 'b1'},
				{'trainingPlanId': str(target_b.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g1', 'blockId': 'b1'},
			],
		})
		self.assertEqual(ambiguous.status_code, 400)

		cross_scope = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'Shared Module',
			'moduleName': 'Renamed Shared Module',
			'linkedRows': [{'trainingPlanId': str(target_a.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g1', 'blockId': 'wrong-block'}],
		})
		self.assertEqual(cross_scope.status_code, 400)
		self.assertIn('crossScopeIds', cross_scope.json())

		self.assertEqual(serialize_training_plan_for_test(target_a), before_a)
		self.assertEqual(serialize_training_plan_for_test(target_b), before_b)

	def test_module_linked_rows_update_uses_catalogue_id_when_names_are_duplicated(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_catalogue_id:42\nFirst PPC',
			module_name='PPC',
			programme_display_order=0,
			cohort_display_order=0,
		)
		same_name_other_catalogue = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_catalogue_id:99\nSecond PPC',
			module_name='PPC',
			programme_display_order=0,
			cohort_display_order=0,
		)
		before_other = serialize_training_plan_for_test(same_name_other_catalogue)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'PPC',
			'moduleName': 'Renamed PPC',
			'linkedRows': [
				{'trainingPlanId': str(target.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g1', 'blockId': 'b1'},
			],
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		same_name_other_catalogue.refresh_from_db()
		self.assertEqual(target.module_name, 'Renamed PPC')
		self.assertEqual(serialize_training_plan_for_test(same_name_other_catalogue), before_other)

	def test_duplicate_module_rename_catalogue_42_updates_only_marker_42(self):
		TrainingPlan.objects.all().delete()
		Module.objects.create(module_id=42, module_name='PPC', module_colour='#111111', number_of_sessions='3')
		Module.objects.create(module_id=99, module_name='PPC', module_colour='#884400', number_of_sessions='3')
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_catalogue_id:42\nFirst PPC',
			module_name='PPC',
		)
		other = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_catalogue_id:99\nSecond PPC',
			module_name='PPC',
		)
		before_other = serialize_training_plan_for_test(other)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'PPC',
			'moduleName': 'PPC3',
			'linkedRows': [],
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(target.module_name, 'PPC3')
		self.assertEqual(serialize_training_plan_for_test(other), before_other)
		payload = response.json()
		self.assertEqual(payload['updatedRows'], [target.id])
		self.assertEqual(payload['skippedAmbiguousRows'], [])

	def test_duplicate_module_rename_catalogue_99_updates_only_marker_99(self):
		TrainingPlan.objects.all().delete()
		Module.objects.create(module_id=42, module_name='PPC', module_colour='#111111', number_of_sessions='3')
		Module.objects.create(module_id=99, module_name='PPC', module_colour='#884400', number_of_sessions='3')
		other = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_catalogue_id:42\nFirst PPC',
			module_name='PPC',
		)
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_catalogue_id:99\nSecond PPC',
			module_name='PPC',
		)
		before_other = serialize_training_plan_for_test(other)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '99',
			'previousModuleName': 'PPC',
			'moduleName': 'PPC99',
			'linkedRows': [],
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(target.module_name, 'PPC99')
		self.assertEqual(serialize_training_plan_for_test(other), before_other)
		payload = response.json()
		self.assertEqual(payload['updatedRows'], [target.id])
		self.assertEqual(payload['skippedAmbiguousRows'], [])

	def test_duplicate_module_rename_does_not_update_legacy_rows_by_name_alone(self):
		TrainingPlan.objects.all().delete()
		Module.objects.create(module_id=42, module_name='PPC', module_colour='#111111', number_of_sessions='3')
		Module.objects.create(module_id=99, module_name='PPC', module_colour='#884400', number_of_sessions='3')
		legacy = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nLegacy PPC without stable module id',
			module_name='PPC',
		)
		before = serialize_training_plan_for_test(legacy)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'PPC',
			'moduleName': 'PPC3',
			'linkedRows': [],
		})

		self.assertEqual(response.status_code, 200)
		legacy.refresh_from_db()
		self.assertEqual(serialize_training_plan_for_test(legacy), before)
		self.assertEqual(response.json()['updatedRows'], [])
		self.assertEqual(response.json()['skippedAmbiguousRows'], [legacy.id])

	def test_duplicate_module_rename_safely_repairs_legacy_row_with_unique_colour_match(self):
		TrainingPlan.objects.all().delete()
		Module.objects.create(module_id=42, module_name='PPC', module_colour='#111111', number_of_sessions='3')
		Module.objects.create(module_id=99, module_name='PPC', module_colour='#884400', number_of_sessions='3')
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_color:#111111\nLegacy PPC colour match',
			module_name='PPC',
		)
		other = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_color:#884400\nOther legacy PPC colour match',
			module_name='PPC',
		)
		before_other = serialize_training_plan_for_test(other)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'PPC',
			'moduleName': 'PPC3',
			'linkedRows': [],
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(target.module_name, 'PPC3')
		self.assertIn('__module_catalogue_id:42', target.notes)
		self.assertEqual(serialize_training_plan_for_test(other), before_other)
		self.assertEqual(response.json()['updatedRows'], [target.id])
		self.assertEqual(response.json()['skippedAmbiguousRows'], [other.id])

	def test_module_linked_rows_update_can_resolve_rows_without_client_ids(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_catalogue_id:42\nPPC row',
			module_name='PPC',
			programme_display_order=0,
			cohort_display_order=0,
		)
		other_same_name = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_catalogue_id:99\nOther PPC row',
			module_name='PPC',
			programme_display_order=0,
			cohort_display_order=0,
		)
		before_other = serialize_training_plan_for_test(other_same_name)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'PPC',
			'moduleName': 'PPC From Server Scope',
			'linkedRows': [],
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other_same_name.refresh_from_db()
		self.assertEqual(target.module_name, 'PPC From Server Scope')
		self.assertEqual(serialize_training_plan_for_test(other_same_name), before_other)
		payload = response.json()
		self.assertEqual(payload['updated_count'], 1)
		self.assertEqual(payload['identifiers']['linkedRows'][0]['trainingPlanId'], target.id)

	def test_catalogue_module_rename_updates_linked_timeline_rows_end_to_end(self):
		TrainingPlan.objects.all().delete()
		Module.objects.all().delete()
		catalogue_module = Module.objects.create(
			module_name='PPC',
			module_colour='#585e6a',
			number_of_sessions='15',
			notes='Catalogue note',
		)
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes=f'__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_catalogue_id:{catalogue_module.module_id}\nTimeline PPC row',
			module_name='PPC',
			programme_display_order=0,
			cohort_display_order=0,
		)
		other = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\n__module_catalogue_id:999999\nOther PPC row',
			module_name='PPC',
			programme_display_order=0,
			cohort_display_order=0,
		)
		before_other = serialize_training_plan_for_test(other)

		catalogue_response = self.patch_json(f'/api/modules/{catalogue_module.module_id}/', {
			'id': catalogue_module.module_id,
			'name': 'PPC End To End',
			'colour': '#585e6a',
			'sessions': '15',
			'notes': 'Catalogue note updated',
			'sessionNames': [],
			'sessionDescriptions': [],
			'sessionKsbMappings': [],
		})
		self.assertEqual(catalogue_response.status_code, 200)

		timeline_response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': str(catalogue_module.module_id),
			'previousModuleName': 'PPC',
			'moduleName': 'PPC End To End',
			'linkedRows': [],
		})
		self.assertEqual(timeline_response.status_code, 200)

		catalogue_module.refresh_from_db()
		target.refresh_from_db()
		other.refresh_from_db()
		self.assertEqual(catalogue_module.module_name, 'PPC End To End')
		self.assertEqual(catalogue_module.notes, 'Catalogue note updated')
		self.assertEqual(target.module_name, 'PPC End To End')
		self.assertEqual(serialize_training_plan_for_test(other), before_other)
		self.assertEqual(timeline_response.json()['updated_count'], 1)
		self.assertEqual(timeline_response.json()['items'][0]['moduleName'], 'PPC End To End')
		get_payload = Client().get('/api/training-plan/').json()
		modules_by_id = {item['id']: item['moduleName'] for item in get_payload['items']}
		self.assertEqual(modules_by_id[target.id], 'PPC End To End')
		self.assertEqual(modules_by_id[other.id], 'PPC')

	def test_module_linked_rows_update_backfills_missing_block_and_catalogue_markers(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\nLegacy PPC without block or catalogue id',
			module_name='PPC',
			programme_display_order=0,
			cohort_display_order=0,
		)

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': self.current_version(),
			'moduleCatalogueId': '42',
			'previousModuleName': 'PPC',
			'moduleName': 'PPC Renamed',
			'linkedRows': [
				{'trainingPlanId': str(target.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g1', 'blockId': f'tp-{target.id}'},
			],
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		self.assertEqual(target.module_name, 'PPC Renamed')
		self.assertIn(f'__block_id:tp-{target.id}', target.notes)
		self.assertIn('__module_catalogue_id:42', target.notes)

	def test_module_archive_rejects_ambiguous_name_scope_with_multiple_catalogue_ids(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__module_catalogue_id:42\nFirst PPC', module_name='PPC')
		other_same_name = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\n__module_catalogue_id:99\nSecond PPC', module_name='PPC')

		response = self.patch_json('/api/training-plan/modules/archive/', {
			'version': self.current_version(),
			'moduleName': 'PPC',
			'trainingPlanIds': [str(target.id), str(other_same_name.id)],
		})

		self.assertEqual(response.status_code, 400)
		self.assertIn('moduleCatalogueIds', response.json())

	def test_module_archive_rejects_name_only_duplicate_catalogue_with_unmarked_legacy_rows(self):
		TrainingPlan.objects.all().delete()
		Module.objects.create(module_id=42, module_name='PPC', module_colour='#111111', number_of_sessions='3')
		Module.objects.create(module_id=99, module_name='PPC', module_colour='#884400', number_of_sessions='3')
		target = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nLegacy first PPC', module_name='PPC')
		other_same_name = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\nLegacy second PPC', module_name='PPC')
		before_target = serialize_training_plan_for_test(target)
		before_other = serialize_training_plan_for_test(other_same_name)

		response = self.patch_json('/api/training-plan/modules/archive/', {
			'version': self.current_version(),
			'moduleName': 'PPC',
			'trainingPlanIds': [str(target.id), str(other_same_name.id)],
		})

		self.assertEqual(response.status_code, 400)
		self.assertIn('ambiguous', response.json()['detail'])
		target.refresh_from_db()
		other_same_name.refresh_from_db()
		self.assertEqual(serialize_training_plan_for_test(target), before_target)
		self.assertEqual(serialize_training_plan_for_test(other_same_name), before_other)

	def test_module_linked_rows_partial_update_rejects_stale_version(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nTarget', module_name='Shared Module')
		stale_version = self.current_version()
		self.create_training_plan_row(program='Programme Two', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\n__group_id:g2\n__block_id:b2\nNew row', module_name='Other Module')

		response = self.patch_json('/api/training-plan/modules/linked-rows/', {
			'version': stale_version,
			'moduleCatalogueId': '42',
			'previousModuleName': 'Shared Module',
			'moduleName': 'Renamed Shared Module',
			'linkedRows': [{'trainingPlanId': str(target.id), 'programmeId': 'p1', 'cohortId': 'c1', 'groupId': 'g1', 'blockId': 'b1'}],
		})

		self.assertEqual(response.status_code, 409)
		target.refresh_from_db()
		self.assertEqual(target.module_name, 'Shared Module')

	def test_programme_linked_rows_partial_update_changes_only_target_programme_rows(self):
		TrainingPlan.objects.all().delete()
		target_a = self.create_training_plan_row(program='Old Programme L3', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\n__module_color:#4A6DB0\nTarget A', module_name='Module A', programme_display_order=2, cohort_display_order=3, session_coverage_json=json.dumps([{'sessionNumber': 1, 'coverageStatus': 'required'}]))
		target_b = self.create_training_plan_row(program='Old Programme L3', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\n__group_id:g2\n__block_id:b2\n__cohort_color:#123456\nTarget B', module_name='Module B', programme_display_order=2, cohort_display_order=4)
		other_programme = self.create_training_plan_row(program='Other Programme', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\n__group_id:g3\n__block_id:b3\nOther programme', module_name='Module C', programme_display_order=1, cohort_display_order=0)
		archived_same_programme = self.create_training_plan_row(program='Old Programme L3', cohort_name='Archived Cohort', notes='__program_id:p1\n__cohort_id:c4\n__group_id:g4\n__block_id:b4\nArchived target', module_name='Archived Module', is_archived=True, archived_at=timezone.now(), archived_by='admin@example.com', archive_reason='Keep archived', programme_display_order=2, cohort_display_order=5)
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_count = TrainingPlan.objects.count()
		before_other = serialize_training_plan_for_test(other_programme)
		before_archived = serialize_training_plan_for_test(archived_same_programme)
		preserved_a = serialize_training_plan_for_test(target_a)
		preserved_b = serialize_training_plan_for_test(target_b)

		response = self.patch_json('/api/training-plan/programmes/p1/linked-rows/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'program': 'New Programme L4',
			'trainingPlanIds': [str(target_a.id), str(target_b.id)],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		self.assertEqual(target_a.id, before_ids[0])
		self.assertEqual(target_a.program, 'New Programme L4')
		self.assertEqual(target_b.program, 'New Programme L4')
		self.assertIn('__program_id:p1', target_a.notes)
		self.assertIn('__module_color:#4A6DB0', target_a.notes)
		self.assertIn('Target A', target_a.notes)
		after_a = serialize_training_plan_for_test(target_a)
		after_b = serialize_training_plan_for_test(target_b)
		preserved_a['program'] = 'New Programme L4'
		preserved_b['program'] = 'New Programme L4'
		self.assertEqual(after_a, preserved_a)
		self.assertEqual(after_b, preserved_b)
		self.assertEqual(serialize_training_plan_for_test(other_programme), before_other)
		self.assertEqual(serialize_training_plan_for_test(archived_same_programme), before_archived)
		payload = response.json()
		self.assertEqual(payload['programme_id'], 'p1')
		self.assertEqual(payload['updated_count'], 2)
		self.assertEqual(payload['identifiers']['programmeId'], 'p1')
		self.assertEqual(payload['allowedFieldsUpdated'], ['program', 'notesMetadata.programmeId'])
		self.assertTrue(AuditLog.objects.filter(object_label='PROGRAMME_LINKED_ROWS_PARTIAL_UPDATE').exists())
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_programme_linked_rows_partial_update_rejects_unsafe_payloads(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(program='Old Programme L3', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nTarget', module_name='Module A')
		other = self.create_training_plan_row(program='Other Programme', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\n__group_id:g2\n__block_id:b2\nOther', module_name='Module B')
		before_target = serialize_training_plan_for_test(target)
		before_other = serialize_training_plan_for_test(other)

		missing_programme_id = self.patch_json('/api/training-plan/programmes/%20/linked-rows/', {
			'version': self.current_version(),
			'program': 'New Programme L4',
			'trainingPlanIds': [str(target.id)],
		})
		self.assertEqual(missing_programme_id.status_code, 400)

		mismatch = self.patch_json('/api/training-plan/programmes/p1/linked-rows/', {
			'version': self.current_version(),
			'programmeId': 'p2',
			'program': 'New Programme L4',
			'trainingPlanIds': [str(target.id)],
		})
		self.assertEqual(mismatch.status_code, 400)

		full_save_like = self.patch_json('/api/training-plan/programmes/p1/linked-rows/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'program': 'New Programme L4',
			'trainingPlanIds': [str(target.id)],
			'items': [],
		})
		self.assertEqual(full_save_like.status_code, 400)

		cross_scope = self.patch_json('/api/training-plan/programmes/p1/linked-rows/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'program': 'New Programme L4',
			'trainingPlanIds': [str(target.id), str(other.id)],
		})
		self.assertEqual(cross_scope.status_code, 400)
		self.assertIn('crossScopeIds', cross_scope.json())

		self.assertEqual(serialize_training_plan_for_test(target), before_target)
		self.assertEqual(serialize_training_plan_for_test(other), before_other)

	def test_programme_linked_rows_partial_update_rejects_missing_markers_and_stale_version(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(program='p1', cohort_name='Cohort A', notes='__cohort_id:c1\n__group_id:g1\n__block_id:b1\nTarget', module_name='Module A')
		missing_marker = self.patch_json('/api/training-plan/programmes/p1/linked-rows/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'program': 'New Programme L4',
			'trainingPlanIds': [str(target.id)],
		})
		self.assertEqual(missing_marker.status_code, 400)
		target.refresh_from_db()
		self.assertEqual(target.program, 'p1')

		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(program='Old Programme L3', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nTarget', module_name='Module A')
		stale_version = self.current_version()
		self.create_training_plan_row(program='Other Programme', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\n__group_id:g2\n__block_id:b2\nOther', module_name='Module B')
		stale = self.patch_json('/api/training-plan/programmes/p1/linked-rows/', {
			'version': stale_version,
			'programmeId': 'p1',
			'program': 'New Programme L4',
			'trainingPlanIds': [str(target.id)],
		})
		self.assertEqual(stale.status_code, 409)
		target.refresh_from_db()
		self.assertEqual(target.program, 'Old Programme L3')

	def test_module_add_for_tutor_scoped_create_adds_only_new_row(self):
		TrainingPlan.objects.all().delete()
		existing = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nExisting', module_name='Existing Module', programme_display_order=0, cohort_display_order=0)
		other_module = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g2\n__block_id:b2\nOther module', module_name='Other Module', programme_display_order=0, cohort_display_order=0)
		other_cohort = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\n__group_id:g3\n__block_id:b3\nOther cohort', module_name='Other Cohort Module', programme_display_order=0, cohort_display_order=1)
		other_programme = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\n__group_id:g4\n__block_id:b4\nOther programme', module_name='Other Programme Module', programme_display_order=1, cohort_display_order=0)
		archived = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g5\n__block_id:b5\nArchived', module_name='Archived Module', is_archived=True, archived_at=timezone.now(), archived_by='admin@example.com', archive_reason='Stay archived')
		before_existing = serialize_training_plan_for_test(existing)
		before_other_module = serialize_training_plan_for_test(other_module)
		before_other_cohort = serialize_training_plan_for_test(other_cohort)
		before_other_programme = serialize_training_plan_for_test(other_programme)
		before_archived = serialize_training_plan_for_test(archived)
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))

		response = self.post_json('/api/training-plan/modules/add-for-tutor/', self.module_add_for_tutor_payload())

		self.assertEqual(response.status_code, 201)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids) + 1)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))[:len(before_ids)], before_ids)
		self.assertEqual(serialize_training_plan_for_test(existing), before_existing)
		self.assertEqual(serialize_training_plan_for_test(other_module), before_other_module)
		self.assertEqual(serialize_training_plan_for_test(other_cohort), before_other_cohort)
		self.assertEqual(serialize_training_plan_for_test(other_programme), before_other_programme)
		self.assertEqual(serialize_training_plan_for_test(archived), before_archived)
		created = TrainingPlan.objects.get(notes__contains='__block_id:b-new')
		self.assertEqual(created.module_name, 'New Tutor Module')
		self.assertEqual(created.cohort_name, 'Cohort A')
		self.assertEqual(created.program, 'Programme One')
		self.assertEqual(created.group_name, 'Group 1')
		self.assertEqual(created.coach_name, 'Coach 1')
		self.assertEqual(created.tutor_profile_id, self.tutor.id)
		self.assertEqual(created.tutor_name, self.tutor.name)
		self.assertEqual(created.start_date, '2026-03-02')
		self.assertEqual(created.end_date, '2026-03-16')
		self.assertEqual(created.sessions_number, '3')
		self.assertEqual(created.session_week_day, 'monday')
		self.assertEqual(created.session_start_time, '09:00')
		self.assertEqual(created.session_end_time, '11:00')
		self.assertEqual(json.loads(created.session_ksb_json)[0]['knowledgeCodes'], ['K1'])
		self.assertEqual(json.loads(created.session_coverage_json), [])
		self.assertEqual(created.programme_display_order, 0)
		self.assertEqual(created.cohort_display_order, 0)
		payload = response.json()
		self.assertEqual(payload['created_count'], 1)
		self.assertEqual(payload['skipped_count'], 0)
		self.assertEqual(payload['created_ids'], [created.id])
		self.assertEqual(payload['identifiers']['blockId'], 'b-new')
		self.assertTrue(AuditLog.objects.filter(object_label='MODULE_ADD_FOR_TUTOR_SCOPED_CREATE').exists())
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_module_add_for_tutor_rejects_missing_full_save_and_stale_payloads(self):
		TrainingPlan.objects.all().delete()
		existing = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nExisting', module_name='Existing Module')

		missing = self.post_json('/api/training-plan/modules/add-for-tutor/', self.module_add_for_tutor_payload(groupId=''))
		self.assertEqual(missing.status_code, 400)

		full_save_like = self.post_json('/api/training-plan/modules/add-for-tutor/', {
			'version': self.current_version(),
			'items': [self.module_add_for_tutor_payload()['row']],
		})
		self.assertEqual(full_save_like.status_code, 400)

		stale_version = self.current_version()
		self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\n__group_id:g2\n__block_id:b2\nNew row', module_name='Other Module')
		stale = self.post_json('/api/training-plan/modules/add-for-tutor/', self.module_add_for_tutor_payload(version=stale_version))
		self.assertEqual(stale.status_code, 409)
		self.assertEqual(TrainingPlan.objects.filter(notes__contains='__block_id:b-new').count(), 0)
		self.assertEqual(TrainingPlan.objects.filter(pk=existing.id).count(), 1)

	def test_module_add_for_tutor_duplicate_retry_does_not_create_duplicate(self):
		TrainingPlan.objects.all().delete()
		self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__group_id:g1\n__block_id:b1\nExisting', module_name='Existing Module')
		payload = self.module_add_for_tutor_payload()
		first = self.post_json('/api/training-plan/modules/add-for-tutor/', payload)
		self.assertEqual(first.status_code, 201)
		created_id = first.json()['created_ids'][0]

		retry = self.post_json('/api/training-plan/modules/add-for-tutor/', payload)

		self.assertEqual(retry.status_code, 200)
		self.assertEqual(TrainingPlan.objects.filter(notes__contains='__block_id:b-new').count(), 1)
		self.assertEqual(retry.json()['created_count'], 0)
		self.assertEqual(retry.json()['skipped_count'], 1)
		self.assertEqual(retry.json()['skipped_ids'], [created_id])
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())

	def test_cohort_restore_brings_archived_rows_back_without_recreating(self):
		TrainingPlan.objects.all().delete()
		now = timezone.now()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nTarget A', module_name='Module A', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Recovery test')
		target_b = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nTarget B', module_name='Module B', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Recovery test')
		active = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nActive', module_name='Module C')
		unrelated_archived = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\nArchived', module_name='Module D', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Stay archived')
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_snapshot = self.order_invariant_snapshot()

		get_before = Client().get('/api/training-plan/').json()
		self.assertEqual([item['cohortId'] for item in get_before['items']], ['c2'])
		include_before = Client().get('/api/training-plan/?includeArchived=1').json()
		self.assertEqual(len(include_before['items']), 4)

		response = self.patch_json('/api/training-plan/cohorts/c1/restore/', {
			'version': self.current_version(),
			'programmeId': 'p1',
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids))
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		active.refresh_from_db()
		unrelated_archived.refresh_from_db()
		self.assertFalse(target_a.is_archived)
		self.assertFalse(target_b.is_archived)
		self.assertIsNone(target_a.archived_at)
		self.assertEqual(target_a.archived_by, '')
		self.assertEqual(target_a.archive_reason, '')
		self.assertFalse(active.is_archived)
		self.assertTrue(unrelated_archived.is_archived)
		self.assertEqual(unrelated_archived.archive_reason, 'Stay archived')
		after_snapshot = self.order_invariant_snapshot()
		self.assertEqual(after_snapshot, before_snapshot)
		payload = response.json()
		self.assertEqual(payload['restored_count'], 2)
		self.assertEqual(payload['cohort_id'], 'c1')
		get_after = Client().get('/api/training-plan/').json()
		self.assertEqual([item['cohortId'] for item in get_after['items']], ['c1', 'c1', 'c2'])
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())
		audit = AuditLog.objects.get(object_label='COHORT_RESTORE_PARTIAL_UPDATE')
		self.assertIsNone(audit.before)
		self.assertIsNone(audit.after)
		self.assertEqual(audit.metadata['restoredCount'], 2)

	def test_module_restore_brings_archived_rows_back_without_recreating(self):
		TrainingPlan.objects.all().delete()
		now = timezone.now()
		target_a = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nTarget A', module_name='Shared Module', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Recovery test')
		target_b = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\nTarget B', module_name='Shared Module', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Recovery test')
		active_same_module = self.create_training_plan_row(program='Programme Three', cohort_name='Cohort D', notes='__program_id:p3\n__cohort_id:c4\nActive', module_name='Shared Module')
		unrelated_archived = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nOther', module_name='Other Module', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Stay archived')
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))
		before_snapshot = self.order_invariant_snapshot()

		response = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'Shared Module',
			'trainingPlanIds': [str(target_a.id), str(target_b.id)],
		})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids)
		self.assertEqual(TrainingPlan.objects.count(), len(before_ids))
		target_a.refresh_from_db()
		target_b.refresh_from_db()
		active_same_module.refresh_from_db()
		unrelated_archived.refresh_from_db()
		self.assertFalse(target_a.is_archived)
		self.assertFalse(target_b.is_archived)
		self.assertFalse(active_same_module.is_archived)
		self.assertTrue(unrelated_archived.is_archived)
		self.assertIsNone(target_b.archived_at)
		self.assertEqual(target_b.archived_by, '')
		self.assertEqual(target_b.archive_reason, '')
		self.assertEqual(self.order_invariant_snapshot(), before_snapshot)
		payload = response.json()
		self.assertEqual(payload['restored_count'], 2)
		self.assertEqual(payload['moduleName'], 'Shared Module')
		self.assertFalse(AuditLog.objects.filter(action='replace', object_label='Training Plan timeline').exists())
		audit = AuditLog.objects.get(object_label='MODULE_RESTORE_PARTIAL_UPDATE')
		self.assertIsNone(audit.before)
		self.assertIsNone(audit.after)
		self.assertEqual(audit.metadata['restoredCount'], 2)

	def test_module_restore_uses_catalogue_id_when_names_are_duplicated(self):
		TrainingPlan.objects.all().delete()
		now = timezone.now()
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\n__module_catalogue_id:42\nFirst archived PPC',
			module_name='PPC',
			is_archived=True,
			archived_at=now,
			archived_by='admin@example.com',
			archive_reason='Recovery test',
		)
		other_same_name = self.create_training_plan_row(
			program='Programme Two',
			cohort_name='Cohort B',
			notes='__program_id:p2\n__cohort_id:c2\n__module_catalogue_id:99\nSecond archived PPC',
			module_name='PPC',
			is_archived=True,
			archived_at=now,
			archived_by='admin@example.com',
			archive_reason='Stay archived',
		)

		response = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'PPC',
			'moduleCatalogueId': '42',
			'trainingPlanIds': [str(target.id)],
		})

		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		other_same_name.refresh_from_db()
		self.assertFalse(target.is_archived)
		self.assertTrue(other_same_name.is_archived)
		self.assertEqual(other_same_name.archive_reason, 'Stay archived')
		self.assertEqual(response.json()['moduleCatalogueId'], '42')

	def test_module_restore_rejects_ambiguous_name_scope_with_multiple_catalogue_ids(self):
		TrainingPlan.objects.all().delete()
		now = timezone.now()
		target = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\n__module_catalogue_id:42\nFirst archived PPC', module_name='PPC', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Recovery test')
		other_same_name = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort B', notes='__program_id:p2\n__cohort_id:c2\n__module_catalogue_id:99\nSecond archived PPC', module_name='PPC', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Stay archived')

		response = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'PPC',
			'trainingPlanIds': [str(target.id), str(other_same_name.id)],
		})

		self.assertEqual(response.status_code, 400)
		self.assertIn('moduleCatalogueIds', response.json())

	def test_module_restore_rejects_name_only_duplicate_catalogue_with_unmarked_legacy_rows(self):
		TrainingPlan.objects.all().delete()
		Module.objects.create(module_id=42, module_name='PPC', module_colour='#111111', number_of_sessions='3')
		Module.objects.create(module_id=99, module_name='PPC', module_colour='#884400', number_of_sessions='3')
		now = timezone.now()
		target = self.create_training_plan_row(
			program='Programme One',
			cohort_name='Cohort A',
			notes='__program_id:p1\n__cohort_id:c1\nLegacy first archived PPC',
			module_name='PPC',
			is_archived=True,
			archived_at=now,
			archived_by='admin@example.com',
			archive_reason='Recovery test',
		)
		other_same_name = self.create_training_plan_row(
			program='Programme Two',
			cohort_name='Cohort B',
			notes='__program_id:p2\n__cohort_id:c2\nLegacy second archived PPC',
			module_name='PPC',
			is_archived=True,
			archived_at=now,
			archived_by='admin@example.com',
			archive_reason='Stay archived',
		)
		before_target = serialize_training_plan_for_test(target)
		before_other = serialize_training_plan_for_test(other_same_name)

		response = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'PPC',
			'trainingPlanIds': [str(target.id), str(other_same_name.id)],
		})

		self.assertEqual(response.status_code, 400)
		self.assertIn('ambiguous', response.json()['detail'])
		target.refresh_from_db()
		other_same_name.refresh_from_db()
		self.assertEqual(serialize_training_plan_for_test(target), before_target)
		self.assertEqual(serialize_training_plan_for_test(other_same_name), before_other)

	def test_restore_rejects_missing_or_unsafe_scope_and_no_match_is_safe(self):
		TrainingPlan.objects.all().delete()
		now = timezone.now()
		target = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nTarget', module_name='Module A', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Recovery test')
		active = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nActive', module_name='Module A')
		other_archived = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nOther', module_name='Module B', is_archived=True, archived_at=now, archived_by='admin@example.com', archive_reason='Stay archived')
		before_ids = list(TrainingPlan.objects.order_by('id').values_list('id', flat=True))

		missing_programme = self.patch_json('/api/training-plan/cohorts/c1/restore/', {
			'version': self.current_version(),
		})
		self.assertEqual(missing_programme.status_code, 400)

		missing_module = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
		})
		self.assertEqual(missing_module.status_code, 400)

		active_id = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'Module A',
			'trainingPlanIds': [str(active.id)],
		})
		self.assertEqual(active_id.status_code, 400)
		self.assertIn('activeIds', active_id.json())

		cross_scope = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'Module A',
			'trainingPlanIds': [str(other_archived.id)],
		})
		self.assertEqual(cross_scope.status_code, 400)
		self.assertIn('crossScopeIds', cross_scope.json())

		unknown = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'Module A',
			'trainingPlanIds': ['999999'],
		})
		self.assertEqual(unknown.status_code, 400)
		self.assertIn('unknownIds', unknown.json())

		no_match_cohort = self.patch_json('/api/training-plan/cohorts/does-not-exist/restore/', {
			'version': self.current_version(),
			'programmeId': 'p1',
		})
		self.assertEqual(no_match_cohort.status_code, 200)
		self.assertEqual(no_match_cohort.json()['restored_count'], 0)

		no_match_module = self.patch_json('/api/training-plan/modules/restore/', {
			'version': self.current_version(),
			'moduleName': 'Missing Module',
		})
		self.assertEqual(no_match_module.status_code, 200)
		self.assertEqual(no_match_module.json()['restored_count'], 0)
		stale_version = self.current_version()
		new_active = self.create_training_plan_row(program='Programme Two', cohort_name='Cohort C', notes='__program_id:p2\n__cohort_id:c3\nNew active row', module_name='Module C')
		stale = self.patch_json('/api/training-plan/cohorts/c1/restore/', {
			'version': stale_version,
			'programmeId': 'p1',
		})
		self.assertEqual(stale.status_code, 409)
		self.assertEqual(list(TrainingPlan.objects.order_by('id').values_list('id', flat=True)), before_ids + [new_active.id])
		target.refresh_from_db()
		active.refresh_from_db()
		other_archived.refresh_from_db()
		self.assertTrue(target.is_archived)
		self.assertFalse(active.is_archived)
		self.assertTrue(other_archived.is_archived)

	def test_archive_rejects_missing_unknown_cross_scope_and_stale_requests(self):
		TrainingPlan.objects.all().delete()
		c1_row = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1', module_name='Module A')
		c1_row_2 = self.create_training_plan_row(program='Programme One', cohort_name='Cohort A', notes='__program_id:p1\n__cohort_id:c1\nP1 C1 extra', module_name='Module B')
		c2_row = self.create_training_plan_row(program='Programme One', cohort_name='Cohort B', notes='__program_id:p1\n__cohort_id:c2\nP1 C2', module_name='Module A')

		programme_only = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
		})
		self.assertEqual(programme_only.status_code, 400)
		self.assertIn('cohortId', programme_only.json()['detail'])

		mismatched_cohort = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c2',
			'trainingPlanIds': [str(c1_row.id), str(c1_row_2.id)],
		})
		self.assertEqual(mismatched_cohort.status_code, 400)

		missing_row_ids = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c1',
		})
		self.assertEqual(missing_row_ids.status_code, 400)
		self.assertIn('trainingPlanIds', missing_row_ids.json()['detail'])

		missing = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c1',
			'trainingPlanIds': [str(c1_row.id)],
		})
		self.assertEqual(missing.status_code, 400)
		self.assertIn('missingIds', missing.json())

		unknown = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c1',
			'trainingPlanIds': [str(c1_row.id), str(c1_row_2.id), '999999'],
		})
		self.assertEqual(unknown.status_code, 400)
		self.assertIn('unknownIds', unknown.json())

		cross_scope = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'c1',
			'trainingPlanIds': [str(c1_row.id), str(c1_row_2.id), str(c2_row.id)],
		})
		self.assertEqual(cross_scope.status_code, 400)
		self.assertIn('crossScopeIds', cross_scope.json())

		module_cross_scope = self.patch_json('/api/training-plan/modules/archive/', {
			'version': self.current_version(),
			'moduleName': 'Module B',
			'trainingPlanIds': [str(c1_row_2.id), str(c1_row.id)],
		})
		self.assertEqual(module_cross_scope.status_code, 400)
		self.assertIn('crossScopeIds', module_cross_scope.json())

		stale_version = self.current_version()
		self.create_training_plan_row(program='Programme Three', cohort_name='Cohort C', notes='__program_id:p3\n__cohort_id:c3\nP3 C3', module_name='Module Z')
		stale = self.patch_json('/api/training-plan/cohorts/c1/archive/', {
			'version': stale_version,
			'programmeId': 'p1',
			'cohortId': 'c1',
			'trainingPlanIds': [str(c1_row.id), str(c1_row_2.id)],
		})
		self.assertEqual(stale.status_code, 409)

	def test_cohort_archive_allows_row_style_ids_only_when_exact_scope_exists(self):
		TrainingPlan.objects.all().delete()
		target = self.create_training_plan_row(program='Programme One', cohort_name='Generated Cohort', notes='__program_id:p1\n__cohort_id:row-123\nGenerated exact scope', module_name='Module A')
		sibling = self.create_training_plan_row(program='Programme One', cohort_name='Sibling Cohort', notes='__program_id:p1\n__cohort_id:c2\nSibling', module_name='Module B')

		missing_scope = self.patch_json('/api/training-plan/cohorts/db-row-999/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'db-row-999',
			'trainingPlanIds': [str(target.id)],
		})
		self.assertEqual(missing_scope.status_code, 400)
		target.refresh_from_db()
		sibling.refresh_from_db()
		self.assertFalse(target.is_archived)
		self.assertFalse(sibling.is_archived)

		response = self.patch_json('/api/training-plan/cohorts/row-123/archive/', {
			'version': self.current_version(),
			'programmeId': 'p1',
			'cohortId': 'row-123',
			'trainingPlanIds': [str(target.id)],
		})
		self.assertEqual(response.status_code, 200)
		target.refresh_from_db()
		sibling.refresh_from_db()
		self.assertTrue(target.is_archived)
		self.assertFalse(sibling.is_archived)
		self.assertEqual(response.json()['cohortId'], 'row-123')

	def test_invalid_id_returns_404(self):
		response = self.patch_json('/api/training-plan/sessions/999999/', {
			'version': self.current_version(),
			'notes': 'No row',
		})
		self.assertEqual(response.status_code, 404)

	def test_invalid_tutor_id_returns_validation_error(self):
		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/', {
			'version': self.current_version(),
			'tutorProfileId': '999999',
		})
		self.assertEqual(response.status_code, 400)
		self.assertIn('unknown active tutor profile', response.json()['detail'])

	def test_session_partial_update_rejects_unsafe_payload_fields(self):
		before_count = TrainingPlan.objects.count()
		before_row = serialize_training_plan_for_test(self.row)
		before_other = serialize_training_plan_for_test(self.other_row)

		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/', {
			'version': self.current_version(),
			'moduleName': 'Unsafe module rename',
		})

		self.assertEqual(response.status_code, 400)
		self.assertIn('Unsupported field', response.json()['detail'])
		self.assertEqual(TrainingPlan.objects.count(), before_count)
		self.assertEqual(serialize_training_plan_for_test(self.row), before_row)
		self.assertEqual(serialize_training_plan_for_test(self.other_row), before_other)

	def test_stale_version_returns_409(self):
		stale_version = self.current_version()
		self.create_training_plan_row(module_name='Module C')

		response = self.patch_json(f'/api/training-plan/sessions/{self.row.pk}/', {
			'version': stale_version,
			'notes': 'Stale write',
		})

		self.assertEqual(response.status_code, 409)
		self.row.refresh_from_db()
		self.assertEqual(self.row.notes, 'Existing notes')

	def test_legacy_full_save_still_works_with_existing_protections(self):
		items = Client().get('/api/training-plan/').json()['items']
		items[0]['notes'] = 'Legacy save still works'

		response = Client().post('/api/training-plan/', data=json.dumps({
			'version': self.current_version(),
			'items': items,
			'confirmLegacyReplaceAll': True,
		}), content_type='application/json', HTTP_X_KBC_LEGACY_TRAINING_PLAN_FULL_SAVE=LEGACY_TRAINING_PLAN_FULL_SAVE_FLAG_VALUE)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()['saved'], len(items))
		self.assertEqual(TrainingPlan.objects.count(), len(items))

	def test_legacy_full_save_requires_internal_admin_debug_flag(self):
		items = Client().get('/api/training-plan/').json()['items']

		response = Client().post('/api/training-plan/', data=json.dumps({
			'version': self.current_version(),
			'items': items,
			'confirmLegacyReplaceAll': True,
		}), content_type='application/json')

		self.assertEqual(response.status_code, 403)
		self.assertIn('explicit internal/admin/debug flag', response.json()['detail'])
		self.assertEqual(TrainingPlan.objects.count(), 2)

	def test_legacy_full_save_rejects_migrated_source_labels(self):
		items = Client().get('/api/training-plan/').json()['items']

		for source in sorted(MIGRATED_TRAINING_PLAN_FULL_SAVE_SOURCES):
			with self.subTest(source=source):
				response = Client().post('/api/training-plan/', data=json.dumps({
					'version': self.current_version(),
					'items': items,
					'confirmLegacyReplaceAll': True,
				}), content_type='application/json', HTTP_X_KBC_TRAINING_PLAN_SAVE_SOURCE=source, HTTP_X_KBC_LEGACY_TRAINING_PLAN_FULL_SAVE=LEGACY_TRAINING_PLAN_FULL_SAVE_FLAG_VALUE)

				self.assertEqual(response.status_code, 403)
				self.assertIn('cannot use legacy replace-all', response.json()['detail'])
				self.assertEqual(TrainingPlan.objects.count(), 2)

	def test_scoped_migrated_flow_does_not_trigger_legacy_full_save_warning(self):
		with patch('api.views.logger.warning') as warning:
			response = Client().patch(f'/api/training-plan/sessions/{self.row.pk}/', data=json.dumps({
				'version': self.current_version(),
				'notes': 'Scoped save only',
			}), content_type='application/json', HTTP_X_KBC_TRAINING_PLAN_SAVE_SOURCE='cohort_edit')

		self.assertEqual(response.status_code, 200)
		self.row.refresh_from_db()
		self.assertEqual(self.row.notes, 'Scoped save only')
		self.assertFalse(any('LEGACY_TRAINING_PLAN_FULL_SAVE_TRIGGERED' in str(call) for call in warning.call_args_list))

	def test_health_endpoint_returns_200(self):
		response = Client().get('/api/health/')
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json(), {'status': 'ok', 'service': 'communication-centre-backend'})
