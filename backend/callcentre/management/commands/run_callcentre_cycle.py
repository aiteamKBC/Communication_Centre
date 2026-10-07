import json
import logging
import signal
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from django.utils import timezone

from callcentre.cycle import run_call_sync, run_cycle
from callcentre.cycle_requests import call_sync_requested

logger = logging.getLogger(__name__)


def stop(signum, frame):
    # systemd stops the worker with SIGTERM: leave through run_cycle's finally, which releases the cycle lock.
    raise SystemExit(0)


class Command(BaseCommand):
    help = 'Poll Zoom, build Call Centre cases and evaluate evidence/reminders. Email defaults to dry-run.'

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true')
        parser.add_argument('--interval', type=int, default=300)
        parser.add_argument('--skip-zoom', action='store_true')
        parser.add_argument('--skip-ai', action='store_true')
        parser.add_argument('--skip-emails', action='store_true')

    def handle(self, *args, **options):
        if options['interval'] < 60:
            raise CommandError('Interval must be at least 60 seconds.')
        signal.signal(signal.SIGTERM, stop)
        try:
            while True:
                close_old_connections()
                try:
                    result = run_cycle(skip_zoom=options['skip_zoom'], skip_ai=options['skip_ai'], skip_emails=options['skip_emails'])
                    self.stdout.write(json.dumps(result, default=str))
                except Exception:
                    # A looping worker keeps going; the next cycle tries again.
                    if not options['loop']:
                        raise
                    logger.exception('Call Centre cycle failed')
                if not options['loop']:
                    break
                self.wait(options['interval'])
        except (KeyboardInterrupt, SystemExit):
            self.stdout.write('Call Centre cycle stopped.')

    def wait(self, interval):
        """Sleep until the next cycle. A finished in-page call (Smart Embed) brings a quick call sync forward."""
        deadline = time.monotonic() + interval
        since = timezone.now()
        while time.monotonic() < deadline:
            time.sleep(min(5, max(0, deadline - time.monotonic())))
            try:
                if call_sync_requested(since):
                    since = timezone.now()
                    self.stdout.write(json.dumps({'call_sync': run_call_sync()}, default=str))
            except Exception:
                logger.exception('Quick call sync failed')
            finally:
                close_old_connections()
