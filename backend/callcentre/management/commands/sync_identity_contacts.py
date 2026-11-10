"""Scoped rollout refresh. Never runs Zoom, Graph, mail, evidence or source writes."""
import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from callcentre.db import DB
from callcentre.identity import enabled
from callcentre.sources import unified_directory, refresh_contacts
from callcentre.learner_satisfaction import generate, eligible, generate_employers


class Command(BaseCommand):
    help = 'Preview unified contact refresh; --apply updates call-centre contact snapshots and satisfaction only.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        try:
            people = unified_directory()
        except Exception as exc:
            raise CommandError(f'Identity sources unavailable ({type(exc).__name__}); nothing changed.') from None
        if not people.sources_complete:
            raise CommandError('Identity conflicts prevent refresh; review /api/callcentre/identity-status/.')
        result = {'contacts': len(people), 'eligible': sum(eligible(p) for p in people.satisfaction),
                  'writes': False, 'external_messages': 0}
        if options['apply']:
            if not enabled():
                raise CommandError('Activate CALLCENTRE_IDENTITY_MODE=unified before --apply.')
            with transaction.atomic(using=DB):
                result['refreshed_cases'] = refresh_contacts(people)
                result['learner_satisfaction'] = generate(people)
                result['employer_feedback'] = generate_employers(people)
            result['writes'] = True
        self.stdout.write(json.dumps(result))
