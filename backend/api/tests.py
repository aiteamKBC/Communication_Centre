import json
from types import SimpleNamespace
from datetime import date, timedelta

from django.test import Client, SimpleTestCase, TestCase
from django.utils import timezone

from .models import TrainingPlanHoliday
from .views import _session_display_login_at, training_plan_holidays_version


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


class TrainingPlanHolidaySaveTests(TestCase):
	def test_editing_existing_holiday_preserves_id(self):
		holiday = TrainingPlanHoliday.objects.create(
			label='Christmas 25',
			start_date=date(2025, 12, 22),
			end_date=date(2025, 12, 28),
			type='bank-holiday',
			color='#ECFDF5',
		)
		holiday_id = holiday.id

		response = Client().post(
			'/api/training-plan-holidays/',
			data=json.dumps({
				'version': training_plan_holidays_version(),
				'items': [{
					'id': str(holiday.id),
					'label': 'Christmas Break 25',
					'startDate': '2025-12-22',
					'endDate': '2025-12-28',
					'type': 'bank-holiday',
					'color': '#ECFDF5',
				}],
			}),
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(TrainingPlanHoliday.objects.count(), 1)
		holiday.refresh_from_db()
		self.assertEqual(holiday.id, holiday_id)
		self.assertEqual(holiday.label, 'Christmas Break 25')

		payload = response.json()
		self.assertEqual(payload['saved'], 1)
		self.assertEqual(payload['items'][0]['id'], str(holiday_id))
