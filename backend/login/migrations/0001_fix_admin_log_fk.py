from django.conf import settings
from django.db import migrations


def fix_admin_log_fk(apps, schema_editor):
    if 'login_db' not in settings.DATABASES:
        return

    from django.db import connections

    with connections['login_db'].cursor() as cursor:
        # Drop the stale FK that points to users_user (leftover from a previous
        # AUTH_USER_MODEL = 'users.User' setup). The constraint name is fixed by
        # Django's migration history, so we reference it directly.
        cursor.execute("""
            ALTER TABLE django_admin_log
            DROP CONSTRAINT IF EXISTS django_admin_log_user_id_c564eba6_fk_users_user_id
        """)

        # Re-add the FK pointing to auth_user, matching Django's expected shape.
        cursor.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints
                    WHERE constraint_name = 'django_admin_log_user_id_c564eba6_fk_auth_user_id'
                      AND table_name = 'django_admin_log'
                ) THEN
                    ALTER TABLE django_admin_log
                    ADD CONSTRAINT django_admin_log_user_id_c564eba6_fk_auth_user_id
                    FOREIGN KEY (user_id)
                    REFERENCES auth_user(id)
                    DEFERRABLE INITIALLY DEFERRED;
                END IF;
            END $$
        """)


class Migration(migrations.Migration):

    dependencies = []

    operations = [
        migrations.RunPython(fix_admin_log_fk, migrations.RunPython.noop),
    ]
