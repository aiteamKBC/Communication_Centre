from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from django.utils import timezone

from . import cycle


def fake_os(kill=None, name='posix', pid=100):
    os = MagicMock(**{'getpid.return_value': pid, 'kill.side_effect': kill})
    os.name = name
    return os


class AbandonedTests(SimpleTestCase):
    def token(self, pid=200, host=None):
        return f'{pid}:{host or cycle.HOST}:0123456789abcdef'

    def test_a_dead_process_on_this_server_has_abandoned_the_lock(self):
        with patch.object(cycle, 'os', fake_os(kill=ProcessLookupError)):
            self.assertTrue(cycle.abandoned(self.token()))

    def test_a_live_or_foreign_holder_keeps_it(self):
        with patch.object(cycle, 'os', fake_os()):
            self.assertFalse(cycle.abandoned(self.token()))   # alive
        with patch.object(cycle, 'os', fake_os(kill=PermissionError)):
            self.assertFalse(cycle.abandoned(self.token()))   # alive under another user
        with patch.object(cycle, 'os', fake_os(kill=ProcessLookupError)) as os:
            self.assertFalse(cycle.abandoned(self.token(host='ffffffff')))   # another server
            self.assertFalse(cycle.abandoned(self.token(pid=100)))   # this process
            self.assertFalse(cycle.abandoned('0b9e2c1a-7d3f-4e8a-9c11-5a6b7c8d9e0f'))   # a token from before pids
            os.kill.assert_not_called()

    def test_windows_never_signals(self):
        # os.kill there ends the process instead of checking it.
        with patch.object(cycle, 'os', fake_os(kill=ProcessLookupError, name='nt')) as os:
            self.assertFalse(cycle.abandoned(self.token()))
            os.kill.assert_not_called()

    def test_new_tokens_fit_the_column(self):
        with patch.object(cycle, 'os', fake_os(pid=4194304)):
            token = cycle.lock_token()
        self.assertLessEqual(len(token), 36)
        self.assertEqual(token.split(':')[:2], ['4194304', cycle.HOST])


class CycleLockTests(SimpleTestCase):
    def run_lock(self, state, held=1):
        objects = MagicMock()
        objects.get_or_create.return_value = (state, False)
        objects.filter.return_value.update.return_value = held
        with patch.object(cycle.CycleState, 'objects', objects), patch.object(cycle, 'release_lock') as release:
            with cycle.cycle_lock(timedelta(hours=2)) as token:
                pass
        return token, objects.filter.call_args_list[0].args[0], release

    def test_a_lock_left_by_a_killed_worker_is_taken_over(self):
        stale = SimpleNamespace(token='200:' + cycle.HOST + ':0123456789abcdef', locked_until=timezone.now() + timedelta(hours=1))
        with patch.object(cycle, 'abandoned', return_value=True):
            token, condition, release = self.run_lock(stale)
        self.assertIn(('token', stale.token), condition.children)
        self.assertTrue(token)
        release.assert_called_once_with(token)

    def test_a_live_holder_is_waited_for(self):
        live = SimpleNamespace(token='200:' + cycle.HOST + ':0123456789abcdef', locked_until=timezone.now() + timedelta(hours=1))
        with patch.object(cycle, 'abandoned', return_value=False):
            token, condition, release = self.run_lock(live, held=0)
        self.assertNotIn(('token', live.token), condition.children)
        self.assertIsNone(token)
        release.assert_not_called()
