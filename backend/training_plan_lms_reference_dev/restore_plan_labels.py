"""Restore original cohort/group labels in the existing local preview only.

The source connection is read only. Authentication, free text and contact data
stay sanitised. Run without arguments to check, then with --apply to restore.
"""
from datetime import datetime, timezone
import hashlib
import json
import sys

import psycopg
from psycopg.conninfo import conninfo_to_dict

from .bootstrap import PRIVATE, PORT, ROOT, load_env, verify_local


def original_group_marker(notes):
    for line in (notes or '').splitlines():
        if not line.startswith('__'):
            break
        if line.startswith('__group_name:'):
            return line
    return None


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise SystemExit('Use no arguments to check or --apply to restore labels.')
    apply = sys.argv[1:] == ['--apply']
    source = conninfo_to_dict(load_env(ROOT.parent / '.env')['DATABASE_URL'])
    source.update(options='-c default_transaction_read_only=on', connect_timeout=10)
    with psycopg.connect(**source) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        if conn.execute('SHOW transaction_read_only').fetchone()[0] != 'on':
            raise RuntimeError('The original database must be read only.')
        originals = {row[0]: row[1:] for row in conn.execute(
            'SELECT id,"Cohort_name",group_name,notes FROM "Training_plan"')}

    state = json.loads((PRIVATE / 'state.json').read_text())
    with psycopg.connect(host='127.0.0.1', port=PORT, dbname='tp_lms_reference_app',
                         user='tp_lms_test_app', password=state['password']) as conn:
        verify_local(conn, 'tp_lms_reference_app')
        rows = conn.execute(
            'SELECT id,"Cohort_name",group_name,notes FROM "Training_plan" ORDER BY id FOR UPDATE').fetchall()
        changes = []
        for ident, cohort, group, notes in rows:
            if ident not in originals:
                raise RuntimeError('A preview record has no source match; no labels changed.')
            source_cohort, source_group, source_notes = originals[ident]
            for label, original, prefix in ((cohort, source_cohort, 'Test Cohort '),
                                             (group, source_group, 'Test Group ')):
                anonymised = prefix + hashlib.sha256(str(original or '').encode()).hexdigest()[:8]
                if label not in (original, anonymised):
                    raise RuntimeError('A label was edited independently; no labels changed.')
            marker = original_group_marker(source_notes)
            restored_notes = '\n'.join(
                (marker or '__group_name:' + (source_group or ''))
                if line.startswith('__group_name:') else line
                for line in (notes or '').splitlines())
            if (cohort, group, notes) != (source_cohort, source_group, restored_notes):
                changes.append((source_cohort, source_group, restored_notes, ident))
        print(f'Matched {len(rows)} preview records to read-only source; {len(changes)} labels need restoration.')
        if not apply:
            conn.rollback()
            return
        backup = PRIVATE / 'plan-labels-before-restore.json'
        if not backup.exists():
            backup.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
        with conn.cursor() as cursor:
            cursor.executemany(
                'UPDATE "Training_plan" SET "Cohort_name"=%s,group_name=%s,notes=%s WHERE id=%s', changes)
        actual = conn.execute('SELECT id,"Cohort_name",group_name FROM "Training_plan"').fetchall()
        if any((cohort, group) != originals[ident][:2] for ident, cohort, group in actual):
            raise RuntimeError('Label verification failed; rolling back.')
    receipt_path = PRIVATE / 'isolation.json'
    receipt = json.loads(receipt_path.read_text())
    receipt['trainingPlanLabels'] = 'original'
    receipt['labelsRestoredAt'] = datetime.now(timezone.utc).isoformat()
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('Original cohort/group labels restored and verified in the local preview. Source was read only.')


if __name__ == '__main__':
    main()
