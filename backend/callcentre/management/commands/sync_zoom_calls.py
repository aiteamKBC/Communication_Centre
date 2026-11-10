import time
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from callcentre.zoom_phone import ZoomError, account_labels, sync_account, validate_config


class Command(BaseCommand):
    help = 'Sync Zoom Phone calls, recording metadata and transcripts into the dashboard database.'

    def add_arguments(self, parser):
        parser.add_argument('--account', default='all', help='An account key from the Zoom Phone page, or all.')
        parser.add_argument('--from', dest='start', type=date.fromisoformat)
        parser.add_argument('--to', dest='end', type=date.fromisoformat)
        parser.add_argument('--loop', action='store_true')
        parser.add_argument('--interval', type=int, default=300)
        parser.add_argument('--check-config', action='store_true')
        parser.add_argument('--calls-only', action='store_true', help='Skip recording and transcript collection.')

    def handle(self, *args, **options):
        labels = account_labels()
        keys = list(labels) if options['account'] == 'all' else [options['account']]
        if any(key not in labels for key in keys):
            raise CommandError(f'Unknown Zoom account. Accounts: {", ".join(labels) or "none yet"}.')
        if options['interval'] < 60:
            raise CommandError('The sync interval must be at least 60 seconds.')
        if options['loop'] and (options['start'] or options['end']):
            raise CommandError('Use date ranges for one-off imports, not --loop.')
        if options['start'] and options['end'] and options['start'] > options['end']:
            raise CommandError('--from must not be after --to.')
        ready = []
        for key in keys:
            try:
                validate_config(key)
                ready.append(key)
                self.stdout.write(f'{labels[key]}: credentials configured (not authenticated yet).')
            except ZoomError as exc:
                self.stderr.write(f'{labels[key]}: {exc}')
        if options['check_config']:
            if len(ready) != len(keys):
                raise CommandError('Zoom configuration is incomplete.')
            return
        if not ready:
            raise CommandError('No Zoom accounts are set up. Add them on the Zoom Phone page.')
        try:
            while True:
                failed = len(ready) != len(keys)
                for key in ready:
                    close_old_connections()
                    try:
                        count = sync_account(key, options['start'], options['end'],
                                             include_recordings=not options['calls_only'])
                        self.stdout.write(f'{labels[key]}: {count} records processed.')
                    except ZoomError as exc:
                        failed = True
                        self.stderr.write(f'{labels[key]}: {exc}')
                if not options['loop']:
                    if failed:
                        raise CommandError('One or more accounts were not synced; successful accounts were saved.')
                    break
                close_old_connections()
                time.sleep(options['interval'])
        except KeyboardInterrupt:
            self.stdout.write('Zoom sync stopped.')
