"""Copy only the verified LMS projection; source access is repeatable-read/read-only."""
import hashlib
import json
from pathlib import Path
import secrets

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

PRIVATE = Path(__file__).resolve().parent / 'private'
FIELDS = 'module_catalogue_id, programme_id, programme_name, title, start_date, end_date'
DBNAME = 'tp_lms_reference_source'
READER = 'tp_lms_reference_reader'


def main():
    if (PRIVATE / 'lms-reader.json').exists():
        raise RuntimeError('An isolated LMS copy already exists; refusing to replace it.')
    source_url = (PRIVATE / 'lms-source.env').read_text(encoding='utf-8').strip().split('=', 1)[1]
    source = conninfo_to_dict(source_url)
    source.update(options='-c default_transaction_read_only=on', connect_timeout=10)
    with psycopg.connect(**source) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        assert conn.execute('SHOW transaction_read_only').fetchone()[0] == 'on'
        rows = conn.execute(f'SELECT {FIELDS} FROM curriculum.modules ORDER BY module_catalogue_id').fetchall()
        assert len(rows) == conn.execute('SELECT count(*) FROM curriculum.modules').fetchone()[0]
        records = [list(row[:4]) + [v.isoformat() if v is not None else None for v in row[4:]] for row in rows]
    # The selected projection excludes descriptions, staff, learners and notes.
    backup = json.dumps({'schema': 'curriculum', 'table': 'modules', 'fields': FIELDS.split(', '), 'records': records}, ensure_ascii=False, indent=2)
    (PRIVATE / 'lms-modules-backup.json').write_text(backup, encoding='utf-8')
    state = json.loads((PRIVATE / 'state.json').read_text())
    owner = dict(host='127.0.0.1', port=55432, user='tp_lms_test_owner', password=state['ownerPassword'])
    password = secrets.token_urlsafe(32)
    with psycopg.connect(**owner, dbname='postgres', autocommit=True) as admin:
        destination = admin.execute('SELECT host(inet_server_addr()),inet_server_port(),current_user').fetchone()
        if destination != ('127.0.0.1', 55432, 'tp_lms_test_owner'):
            raise RuntimeError('Unsafe test cluster destination.')
        if admin.execute('SELECT 1 FROM pg_database WHERE datname=%s', (DBNAME,)).fetchone():
            raise RuntimeError('Existing LMS fixture database found; refusing to overwrite it.')
        admin.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT').format(sql.Identifier(READER), sql.Literal(password)))
        admin.execute(sql.SQL('ALTER ROLE {} SET default_transaction_read_only=on').format(sql.Identifier(READER)))
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(DBNAME)))
        admin.execute(sql.SQL('REVOKE ALL ON DATABASE {} FROM PUBLIC').format(sql.Identifier(DBNAME)))
        admin.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO {}').format(sql.Identifier(DBNAME), sql.Identifier(READER)))
    with psycopg.connect(**owner, dbname=DBNAME) as fixture:
        assert fixture.execute('SELECT current_database()').fetchone()[0] == DBNAME
        fixture.execute('CREATE SCHEMA curriculum')
        fixture.execute('''CREATE TABLE curriculum.modules (
            module_catalogue_id varchar PRIMARY KEY, programme_id varchar,
            programme_name varchar, title text, start_date date, end_date date)''')
        with fixture.cursor() as cur:
            cur.executemany(f'INSERT INTO curriculum.modules ({FIELDS}) VALUES (%s,%s,%s,%s,%s,%s)', records)
        fixture.execute(sql.SQL('GRANT USAGE ON SCHEMA curriculum TO {}').format(sql.Identifier(READER)))
        fixture.execute(sql.SQL('GRANT SELECT ON curriculum.modules TO {}').format(sql.Identifier(READER)))
    reader = dict(host='127.0.0.1', port=55432, dbname=DBNAME, user=READER, password=password)
    with psycopg.connect(**reader) as conn:
        assert conn.execute('SHOW transaction_read_only').fetchone()[0] == 'on'
        assert not conn.execute("SELECT has_table_privilege(current_user,'curriculum.modules','INSERT,UPDATE,DELETE,TRUNCATE')").fetchone()[0]
        assert conn.execute('SELECT count(*) FROM curriculum.modules').fetchone()[0] == len(records)
    (PRIVATE / 'lms-reader.json').write_text(json.dumps(reader, indent=2), encoding='utf-8')
    (PRIVATE / 'lms-isolation.json').write_text(json.dumps({'host': '127.0.0.1', 'port': 55432, 'database': DBNAME, 'records': len(records), 'sourceReadOnly': True, 'readerCannotWrite': True, 'backupSha256': hashlib.sha256(backup.encode()).hexdigest()}, indent=2), encoding='utf-8')
    print('LMS consistent read-only projection restored locally:', len(records), 'modules.')
    print('Independent local reader verified: SELECT only; original connection is not used by the application.')


if __name__ == '__main__':
    main()
