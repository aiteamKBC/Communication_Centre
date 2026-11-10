"""Reversible browser-test mutations, guarded to the local copies only."""
import json
import os
from pathlib import Path
import secrets
import sys

os.environ['DJANGO_SETTINGS_MODULE'] = 'training_plan_lms_reference_dev.settings'
import django
django.setup()

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from api.models import TrainingPlan
from .test_reference import fixture_owner, verify_destinations

PRIVATE = Path(__file__).resolve().parent / 'private'
STASH = PRIVATE / 'ui-fixture-restore.json'


def main():
    verify_destinations()
    action = sys.argv[1]
    if action == '--viewer':
        path = PRIVATE / 'viewer-access.json'
        if not path.exists():
            email = 'reference-ui-viewer@example.invalid'
            password = secrets.token_urlsafe(24)
            if get_user_model().objects.using('login_db').filter(username='reference-ui-viewer').exists():
                raise RuntimeError('Refusing to reset an existing test viewer account.')
            get_user_model().objects.db_manager('login_db').create_user('reference-ui-viewer', email, password)
            path.write_text(json.dumps({'email': email, 'password': password}), encoding='utf-8')
        return
    if action == '--change':
        if STASH.exists():
            raise RuntimeError('Restore the previous browser fixtures first.')
        plan = TrainingPlan.objects.filter(is_archived=False).first()
        saved_plan = {field.attname: field.value_from_object(plan) for field in plan._meta.fields}
        with fixture_owner() as source:
            rows = source.execute('SELECT module_catalogue_id,programme_id,programme_name,title,start_date,end_date FROM curriculum.modules ORDER BY module_catalogue_id LIMIT 2').fetchall()
            records = [list(r[:4]) + [d.isoformat() if d is not None else None for d in r[4:]] for r in rows]
            STASH.write_text(json.dumps({'plan': saved_plan, 'lms': records}, default=str), encoding='utf-8')
            source.execute("UPDATE curriculum.modules SET title='Isolated LMS changed after capture',start_date='2041-01-01',end_date='2041-12-31' WHERE module_catalogue_id=%s", (rows[0][0],))
            source.execute('DELETE FROM curriculum.modules WHERE module_catalogue_id=%s', (rows[1][0],))
        plan.delete()
        return
    if action == '--restore':
        if not STASH.exists():
            return
        data = json.loads(STASH.read_text())
        plan = dict(data['plan'])
        fields = list(TrainingPlan._meta.fields)
        quote = connection.ops.quote_name
        columns = ','.join(quote(field.column) for field in fields)
        updates = ','.join(f'{quote(field.column)}=excluded.{quote(field.column)}' for field in fields if not field.primary_key)
        values = [field.get_db_prep_save(plan[field.attname], connection) for field in fields]
        # The restored source schema uses GENERATED ALWAYS identity IDs. Restore
        # the exact deleted fixture ID without altering that schema or sequence.
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(f'INSERT INTO {quote(TrainingPlan._meta.db_table)} ({columns}) OVERRIDING SYSTEM VALUE '
                           f'VALUES ({",".join(["%s"] * len(fields))}) ON CONFLICT (id) DO UPDATE SET {updates}', values)
        with fixture_owner() as source:
            for row in data['lms']:
                source.execute('''INSERT INTO curriculum.modules (module_catalogue_id,programme_id,programme_name,title,start_date,end_date)
                    VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (module_catalogue_id) DO UPDATE SET
                    programme_id=excluded.programme_id,programme_name=excluded.programme_name,title=excluded.title,
                    start_date=excluded.start_date,end_date=excluded.end_date''', row)
        STASH.unlink()
        return
    raise RuntimeError('Expected --viewer, --change or --restore.')


if __name__ == '__main__':
    main()
