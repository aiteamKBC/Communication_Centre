"""Copy LMS session counts into the existing local preview by module ID.

Source access is read only. Run without arguments to check, then --apply.
"""
import json
import sys

import psycopg
from psycopg.conninfo import conninfo_to_dict

from .bootstrap import PRIVATE, PORT, load_env


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise SystemExit('Use no arguments to check or --apply to copy session counts.')
    apply = sys.argv[1:] == ['--apply']
    source = conninfo_to_dict(load_env(PRIVATE / 'lms-source.env')['LMS_REFERENCE_SOURCE_URL'])
    source.update(options='-c default_transaction_read_only=on', connect_timeout=10)
    with psycopg.connect(**source) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        conn.execute('SET LOCAL statement_timeout=20000')
        if conn.execute('SHOW transaction_read_only').fetchone()[0] != 'on':
            raise RuntimeError('The LMS source must be read only.')
        counts = dict(conn.execute('SELECT module_catalogue_id,sessions_number FROM curriculum.modules').fetchall())

    state = json.loads((PRIVATE / 'state.json').read_text())
    with psycopg.connect(host='127.0.0.1', port=PORT, dbname='tp_lms_reference_source',
                         user='tp_lms_test_owner', password=state['ownerPassword']) as conn:
        if conn.execute('SELECT host(inet_server_addr()),inet_server_port(),current_database(),current_user').fetchone() != (
                '127.0.0.1', PORT, 'tp_lms_reference_source', 'tp_lms_test_owner'):
            raise RuntimeError('Unexpected local preview destination.')
        conn.execute('LOCK TABLE curriculum.modules IN ACCESS EXCLUSIVE MODE')
        before = conn.execute("SELECT module_catalogue_id,to_jsonb(m)-'sessions_number' FROM curriculum.modules m ORDER BY module_catalogue_id").fetchall()
        ids = [row[0] for row in before]
        if any(ident not in counts for ident in ids):
            raise RuntimeError('A preview module has no LMS source match; no counts copied.')
        print(f'Matched {len(ids)} preview modules to read-only LMS session counts.')
        if not apply:
            conn.rollback()
            return
        conn.execute('ALTER TABLE curriculum.modules ADD COLUMN IF NOT EXISTS sessions_number integer')
        backup = PRIVATE / 'lms-session-counts-before-restore.json'
        if not backup.exists():
            backup.write_text(json.dumps(conn.execute('SELECT module_catalogue_id,sessions_number FROM curriculum.modules').fetchall()), encoding='utf-8')
        with conn.cursor() as cursor:
            cursor.executemany('UPDATE curriculum.modules SET sessions_number=%s WHERE module_catalogue_id=%s',
                               [(counts[ident], ident) for ident in ids])
        after = conn.execute("SELECT module_catalogue_id,to_jsonb(m)-'sessions_number' FROM curriculum.modules m ORDER BY module_catalogue_id").fetchall()
        if after != before:
            raise RuntimeError('Unexpected module change; rolling back.')
        actual = dict(conn.execute('SELECT module_catalogue_id,sessions_number FROM curriculum.modules').fetchall())
        if actual != {ident: counts[ident] for ident in ids}:
            raise RuntimeError('Session count verification failed; rolling back.')
    print('Local LMS session counts verified. Other module fields and the captured reference are preserved.')


if __name__ == '__main__':
    main()
