"""Copy LMS bank holidays into the verified local preview; source is read only.

Run without arguments to inspect, then --apply to add missing local holidays.
Existing local rows must still match the source; they are never replaced.
"""
import json
import sys

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from .bootstrap import PRIVATE, PORT, load_env


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise SystemExit('Use no arguments to check or --apply to copy LMS holidays.')
    source = conninfo_to_dict(load_env(PRIVATE / 'lms-source.env')['LMS_REFERENCE_SOURCE_URL'])
    source.update(options='-c default_transaction_read_only=on', connect_timeout=5)
    with psycopg.connect(**source) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        conn.execute('SET LOCAL statement_timeout=20000')
        rows = conn.execute('SELECT id,title,holiday_date FROM curriculum.england_holidays ORDER BY holiday_date,id').fetchall()
    print(f'Read {len(rows)} LMS bank holidays using a read-only transaction.')
    if '--apply' not in sys.argv:
        return
    state = json.loads((PRIVATE / 'state.json').read_text())
    reader = json.loads((PRIVATE / 'lms-reader.json').read_text())
    if (reader['host'], reader['port'], reader['dbname'], reader['user']) != (
            '127.0.0.1', PORT, 'tp_lms_reference_source', 'tp_lms_reference_reader'):
        raise RuntimeError('Unexpected preview reader destination.')
    with psycopg.connect(host='127.0.0.1', port=PORT, dbname='tp_lms_reference_source',
                         user='tp_lms_test_owner', password=state['ownerPassword']) as conn:
        if conn.execute('SELECT host(inet_server_addr()),inet_server_port(),current_database(),current_user').fetchone() != (
                '127.0.0.1', PORT, 'tp_lms_reference_source', 'tp_lms_test_owner'):
            raise RuntimeError('Unexpected local preview destination.')
        conn.execute('CREATE TABLE IF NOT EXISTS curriculum.england_holidays '
                     '(id varchar(128) PRIMARY KEY,title varchar(255),holiday_date date NOT NULL)')
        existing = conn.execute('SELECT id,title,holiday_date FROM curriculum.england_holidays').fetchall()
        expected = {row[0]: row for row in rows}
        if any(row != expected.get(row[0]) for row in existing):
            raise RuntimeError('Local holidays have changed; refusing to overwrite them.')
        existing_ids = {row[0] for row in existing}
        with conn.cursor() as cursor:
            cursor.executemany('INSERT INTO curriculum.england_holidays (id,title,holiday_date) VALUES (%s,%s,%s)',
                               [row for row in rows if row[0] not in existing_ids])
        conn.execute(sql.SQL('GRANT SELECT ON curriculum.england_holidays TO {}').format(sql.Identifier(reader['user'])))
        if conn.execute('SELECT id,title,holiday_date FROM curriculum.england_holidays ORDER BY holiday_date,id').fetchall() != rows:
            raise RuntimeError('Holiday copy verification failed; rolling back.')
    print('Local LMS holiday overlay prepared. Module data and saved plans are unchanged.')


if __name__ == '__main__':
    main()
