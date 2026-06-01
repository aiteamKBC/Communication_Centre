from types import SimpleNamespace
from datetime import timedelta

from django.test import SimpleTestCase
from django.utils import timezone

from .views import _session_display_login_at


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
