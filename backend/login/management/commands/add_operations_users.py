from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import connections
from login.access import ensure_access_groups, ACCESS_GROUPS

User = get_user_model()

USERS = [
    {
        'email': 'Mohamed.Gamal@kentbusinesscollege.com',
        'first_name': 'Mohamed',
        'last_name': 'Gamal',
    },
    {
        'email': 'Holom.mark@kentbusinesscollege.com',
        'first_name': 'Holom',
        'last_name': 'Mark',
    },
]


def _fix_sequence(db_alias):
    with connections[db_alias].cursor() as cursor:
        cursor.execute(
            "SELECT setval(pg_get_serial_sequence('auth_user', 'id'), "
            "COALESCE((SELECT MAX(id) FROM auth_user), 0) + 1, false);"
        )


class Command(BaseCommand):
    help = 'Add Mohamed Gamal and Holom Mark with Operations Access'

    def handle(self, *args, **options):
        ensure_access_groups(using='login_db')

        from django.contrib.auth.models import Group
        ops_group = Group.objects.using('login_db').get(name=ACCESS_GROUPS['access_operations'])

        _fix_sequence('login_db')

        for user_data in USERS:
            email = user_data['email']
            username = email.lower()

            user, created = User.objects.using('login_db').get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'first_name': user_data['first_name'],
                    'last_name': user_data['last_name'],
                    'is_active': True,
                    'is_staff': False,
                },
            )

            if not created:
                user.email = email
                user.first_name = user_data['first_name']
                user.last_name = user_data['last_name']
                user.is_active = True
                user.save(using='login_db')

            user.groups.set([ops_group])

            status = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(
                f'{status}: {email} — Operations Access granted'
            ))
