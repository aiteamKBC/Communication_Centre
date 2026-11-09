"""Restore tutor display names in the verified local preview; source is read only.

Check with no arguments, then apply with --apply. Contact fields stay sanitised.
"""
from datetime import datetime, timezone
import json
import sys

import psycopg
from psycopg.conninfo import conninfo_to_dict

from .bootstrap import PRIVATE, PORT, ROOT, load_env, verify_local


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise SystemExit('Use no arguments to check or --apply to restore tutor names.')
    apply = sys.argv[1:] == ['--apply']
    source = conninfo_to_dict(load_env(ROOT.parent / '.env')['DATABASE_URL'])
    source.update(options='-c default_transaction_read_only=on', connect_timeout=10)
    with psycopg.connect(**source) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        conn.execute('SET LOCAL statement_timeout=20000')
        if conn.execute('SHOW transaction_read_only').fetchone()[0] != 'on':
            raise RuntimeError('The source must be read only.')
        original_rows = {row[0]: row[1:] for row in conn.execute(
            'SELECT id,"Tutor_name",tutor_profile_id FROM "Training_plan"')}
        original_profiles = {row[0]: row[1:] for row in conn.execute(
            'SELECT id,name,normalized_name FROM tutor_profiles')}

    state = json.loads((PRIVATE / 'state.json').read_text())
    with psycopg.connect(host='127.0.0.1', port=PORT, dbname='tp_lms_reference_app',
                         user='tp_lms_test_app', password=state['password']) as conn:
        verify_local(conn, 'tp_lms_reference_app')
        rows = conn.execute('SELECT id,"Tutor_name",tutor_profile_id FROM "Training_plan" ORDER BY id FOR UPDATE').fetchall()
        profiles = conn.execute('SELECT id,name,normalized_name FROM tutor_profiles ORDER BY id FOR UPDATE').fetchall()
        row_changes, profile_changes = [], []
        for ident, name, profile_id in rows:
            original = original_rows.get(ident)
            if original is None or original[1] != profile_id:
                raise RuntimeError('A plan row or assignment has changed; no names restored.')
            allowed = {original[0], f'Test Tutor {profile_id}' if profile_id in original_profiles else 'Test Tutor'}
            if name not in allowed:
                raise RuntimeError('A tutor name was independently edited; no names restored.')
            if name != original[0]:
                row_changes.append((original[0], ident))
        for ident, name, normalized in profiles:
            original = original_profiles.get(ident)
            if original is None or (name, normalized) not in (
                    original, (f'Test Tutor {ident}', f'test tutor {ident}')):
                raise RuntimeError('A tutor profile was independently edited; no names restored.')
            if (name, normalized) != original:
                profile_changes.append((*original, ident))
        print(f'Matched {len(rows)} plan rows and {len(profiles)} profiles; '
              f'{len(row_changes)} plan names and {len(profile_changes)} profile names need restoration.')
        if not apply:
            conn.rollback()
            return

        backup = PRIVATE / 'tutor-names-before-restore.json'
        if not backup.exists():
            backup.write_text(json.dumps({'rows': rows, 'profiles': profiles}, ensure_ascii=False), encoding='utf-8')
        plan_before = conn.execute('SELECT id,to_jsonb(p)-\'Tutor_name\' FROM "Training_plan" p ORDER BY id').fetchall()
        profiles_before = conn.execute("SELECT id,to_jsonb(p)-'name'-'normalized_name' FROM tutor_profiles p ORDER BY id").fetchall()
        with conn.cursor() as cursor:
            cursor.executemany('UPDATE "Training_plan" SET "Tutor_name"=%s WHERE id=%s', row_changes)
            cursor.executemany('UPDATE tutor_profiles SET name=%s,normalized_name=%s WHERE id=%s', profile_changes)
        if conn.execute('SELECT id,to_jsonb(p)-\'Tutor_name\' FROM "Training_plan" p ORDER BY id').fetchall() != plan_before:
            raise RuntimeError('Unexpected plan change; rolling back.')
        if conn.execute("SELECT id,to_jsonb(p)-'name'-'normalized_name' FROM tutor_profiles p ORDER BY id").fetchall() != profiles_before:
            raise RuntimeError('Unexpected profile change; rolling back.')
        actual_rows = conn.execute('SELECT id,"Tutor_name",tutor_profile_id FROM "Training_plan"').fetchall()
        actual_profiles = conn.execute('SELECT id,name,normalized_name FROM tutor_profiles').fetchall()
        if any(tuple(row[1:]) != original_rows[row[0]] for row in actual_rows):
            raise RuntimeError('Plan name verification failed; rolling back.')
        if any(tuple(row[1:]) != original_profiles[row[0]] for row in actual_profiles):
            raise RuntimeError('Profile name verification failed; rolling back.')

    receipt_path = PRIVATE / 'isolation.json'
    receipt = json.loads(receipt_path.read_text())
    receipt['tutorNames'] = 'original'
    receipt['tutorNamesRestoredAt'] = datetime.now(timezone.utc).isoformat()
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('Original tutor names verified in the local preview. Assignments, dates and contact fields preserved.')


if __name__ == '__main__':
    main()
