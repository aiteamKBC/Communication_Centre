from django.core.management.base import BaseCommand, CommandError

from callcentre.learner_satisfaction import eligible, employer_contacts, generate, generate_employers
from callcentre.sources import learner_directory


class Command(BaseCommand):
    help = 'Refresh learner and employer satisfaction only (no calls, emails, AI or other case generation).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Read sources and report eligibility; write nothing.')

    def handle(self, *args, **options):
        try:
            people = learner_directory()
        except Exception as exc:
            raise CommandError(f'Learner sources unavailable ({type(exc).__name__}).') from None
        if not people.sources_complete:
            raise CommandError('Both learner sources must load successfully. No satisfaction cases changed.')
        if options['dry_run']:
            selected = [person for person in people.satisfaction if eligible(person)]
            self.stdout.write(str({
                'eligible': len(selected),
                'active': sum(person['programme_status'].lower() == 'active' for person in selected),
                'onboarding': sum(person['programme_status'].lower() == 'onboarding' for person in selected),
                'without_phone': sum(not person['profile']['learner_phone'] for person in selected),
                'without_email': sum(not person['profile']['learner_email'] for person in selected),
                'employers': len(contacts := employer_contacts(people)),
                'employers_without_phone': sum(not profile['learner_phone'] for profile, _ in contacts.values()),
                'writes': 0,
            }))
            return
        self.stdout.write(str({'learners': generate(people), 'employers': generate_employers(people)}))
