"""Prepare/restore local test copies without writing to any source database.

Run --initialise first, start the printed local cluster, then run --restore.
Raw backups and all credentials remain in the ignored private directory.
"""
import io
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import urllib.request
import zipfile

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / 'private'
BIN = ROOT / 'pgsql' / 'bin'
PORT = 55432
DATABASES = {'default': 'tp_lms_reference_app', 'login_db': 'tp_lms_reference_auth'}
URL = 'https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip'
TABLES = {
    'default': ['Training_plan', 'Modules', 'training_plan_holidays', 'training_plan_module_definitions',
                'training_plan_program_configs', 'ksb_profiles', 'tutor_profiles', 'coach_profiles',
                'module_learner_mappings', 'django_migrations', 'audit_logs', 'django_session'],
    'login_db': ['auth_user', 'auth_group', 'auth_permission', 'auth_user_groups',
                 'auth_user_user_permissions', 'auth_group_permissions', 'django_content_type'],
}


class RemoteZip(io.RawIOBase):
    """EDB supports byte ranges: download only server/client files, not pgAdmin."""
    def __init__(self):
        with urllib.request.urlopen(urllib.request.Request(URL, method='HEAD'), timeout=20) as r:
            self.size = int(r.headers['Content-Length'])
        self.position = 0
        self.buffer_start = 0
        self.buffer = b''

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        return self.position

    def read(self, size=-1):
        end = self.size - 1 if size < 0 else min(self.size - 1, self.position + size - 1)
        if end < self.position:
            return b''
        if self.buffer_start <= self.position and end < self.buffer_start + len(self.buffer):
            offset = self.position - self.buffer_start
            data = self.buffer[offset:offset + end - self.position + 1]
            self.position += len(data)
            return data
        requested_start = self.position
        fetched_end = min(self.size - 1, max(end, requested_start + 2 * 1024 * 1024 - 1))
        request = urllib.request.Request(URL, headers={'Range': f'bytes={requested_start}-{fetched_end}'})
        with urllib.request.urlopen(request, timeout=45) as response:
            if response.status != 206:
                raise RuntimeError('Expected a ranged response from the official binary archive.')
            self.buffer = response.read()
        self.buffer_start = requested_start
        data = self.buffer[:end - requested_start + 1]
        self.position += len(data)
        return data


def load_env(path):
    result = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def run(tool, args, env=None):
    r = subprocess.run([str(BIN / (tool + '.exe')), *args], env=env,
                       capture_output=True, timeout=180, creationflags=subprocess.CREATE_NO_WINDOW)
    if r.returncode:
        (PRIVATE / (tool + '.error.log')).write_bytes(r.stderr + r.stdout)
        raise RuntimeError(f'{tool} failed; details are in its ignored private error log.')


def pg_env(info, source=False):
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    for key, target in [('host', 'HOST'), ('port', 'PORT'), ('dbname', 'DATABASE'), ('user', 'USER'), ('password', 'PASSWORD'), ('sslmode', 'SSLMODE')]:
        if key in info:
            env['PG' + target] = str(info[key])
    env['PGCONNECT_TIMEOUT'] = '10'
    if source:
        env['PGOPTIONS'] = '-c default_transaction_read_only=on'
    return env


def initialise():
    PRIVATE.mkdir(exist_ok=True)
    binaries_ready = PRIVATE / 'binaries-ready'
    if not binaries_ready.exists():
        print('Downloading only PostgreSQL server/client binaries from EDB.', flush=True)
        with zipfile.ZipFile(RemoteZip()) as archive:
            names = [n for n in archive.namelist() if n.startswith(('pgsql/bin/', 'pgsql/lib/', 'pgsql/share/'))]
            for index, name in enumerate(names):
                target = (ROOT / name).resolve()
                if not target.is_relative_to(ROOT):
                    raise RuntimeError('Unsafe binary archive path.')
                archive.extract(name, ROOT)
                if index and index % 150 == 0:
                    print(f'Extracted {index}/{len(names)} PostgreSQL files.', flush=True)
        binaries_ready.write_text('PostgreSQL 17.11 server/client extraction complete.', encoding='ascii')
    state_file = PRIVATE / 'state.json'
    if state_file.exists():
        state = json.loads(state_file.read_text())
    else:
        state = {'ownerPassword': secrets.token_urlsafe(32), 'password': secrets.token_urlsafe(32)}
        state_file.write_text(json.dumps(state), encoding='utf-8')
    data = PRIVATE / 'pgdata'
    if not (data / 'PG_VERSION').exists():
        pwfile = PRIVATE / 'init-password.txt'
        pwfile.write_text(state['ownerPassword'], encoding='ascii')
        try:
            run('initdb', ['-D', str(data), '-U', 'tp_lms_test_owner', '-A', 'scram-sha-256', '--pwfile', str(pwfile), '--encoding=UTF8', '--locale=C'])
        finally:
            pwfile.unlink(missing_ok=True)
        with (data / 'postgresql.conf').open('a') as f:
            f.write(f"\nlisten_addresses='127.0.0.1'\nport={PORT}\n")
    print('Local cluster initialised; no source database accessed. Start this cluster, then run --restore.', flush=True)


def verify_local(conn, name):
    result = conn.execute('SELECT host(inet_server_addr()), inet_server_port(), current_database(), current_user').fetchone()
    if result != ('127.0.0.1', PORT, name, 'tp_lms_test_app'):
        raise RuntimeError('Refusing a database destination outside the isolated local server.')


def sanitise(conn, alias):
    if alias == 'login_db':
        conn.execute("UPDATE auth_user SET username='test-user-'||id, email='test-user-'||id||'@example.invalid', first_name='Test', last_name='User '||id, password='!disabled-test-copy', last_login=NULL")
        return
    for table, prefix in [('tutor_profiles', 'Tutor'), ('coach_profiles', 'Coach')]:
        names = conn.execute(sql.SQL('SELECT id,name FROM {}').format(sql.Identifier(table))).fetchall()
        for ident, old in names:
            new = f'Test {prefix} {ident}'
            conn.execute(sql.SQL("UPDATE {} SET name=%s, normalized_name=%s, email='', phone='', notes='', availability_notes='' WHERE id=%s").format(sql.Identifier(table)), (new, new.lower(), ident))
            field = 'Tutor_name' if prefix == 'Tutor' else 'coach_name'
            conn.execute(sql.SQL('UPDATE "Training_plan" SET {}=%s WHERE {}=%s').format(sql.Identifier(field), sql.Identifier(field)), (new, old))
    rows = conn.execute('SELECT id,notes,session_coverage_json,group_name,"Cohort_name" FROM "Training_plan"').fetchall()
    for ident, notes, coverage, old_group, old_cohort in rows:
        group_label = 'Test Group ' + hashlib.sha256(str(old_group or '').encode()).hexdigest()[:8]
        cohort_label = 'Test Cohort ' + hashlib.sha256(str(old_cohort or '').encode()).hexdigest()[:8]
        markers = []
        for line in (notes or '').splitlines():
            if not line.startswith('__'):
                break
            if line.startswith('__coach_name:'):
                line = '__coach_name:Test Coach'
            if line.startswith('__group_name:'):
                line = '__group_name:' + group_label
            markers.append(line)
        try:
            coverage = json.loads(coverage or '[]')
        except (TypeError, ValueError):
            coverage = []
        for item in coverage:
            for field in ('coverageNotes', 'coverageReason', 'tutorUnavailableNotes', 'tutorUnavailableReason'):
                if field in item:
                    item[field] = ''
        conn.execute('UPDATE "Training_plan" SET notes=%s,session_coverage_json=%s,group_name=%s,"Cohort_name"=%s,archived_by=%s,archive_reason=%s WHERE id=%s', ('\n'.join(markers), json.dumps(coverage), group_label, cohort_label, '', '', ident))
    conn.execute('UPDATE "Training_plan" SET coach_name=\'Test Coach\'')
    conn.execute('UPDATE "Training_plan" p SET "Tutor_name"=COALESCE((SELECT t.name FROM tutor_profiles t WHERE t.id=p.tutor_profile_id),\'Test Tutor\')')
    conn.execute('UPDATE "Modules" SET "Notes"=\'\'')
    conn.execute("UPDATE ksb_profiles SET created_by='',description=''")


def restore():
    if (PRIVATE / 'isolation.json').exists():
        raise RuntimeError('An isolated copy already exists; refusing to replace it.')
    state = json.loads((PRIVATE / 'state.json').read_text())
    with psycopg.connect(host='127.0.0.1', port=PORT, dbname='postgres', user='tp_lms_test_owner', password=state['ownerPassword'], autocommit=True) as admin:
        if not admin.execute("SELECT 1 FROM pg_roles WHERE rolname='tp_lms_test_app'").fetchone():
            admin.execute(sql.SQL('CREATE ROLE tp_lms_test_app LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE').format(sql.Literal(state['password'])))
        for name in DATABASES.values():
            if not admin.execute('SELECT 1 FROM pg_database WHERE datname=%s', (name,)).fetchone():
                admin.execute(sql.SQL('CREATE DATABASE {} OWNER tp_lms_test_app').format(sql.Identifier(name)))
    source = load_env(ROOT.parent / '.env')
    login = ROOT.parent / 'login' / '.env.login'
    source.update(load_env(login if login.exists() else ROOT.parent / '.env.login'))
    receipt = {'host': '127.0.0.1', 'port': PORT, 'databases': DATABASES, 'sourceReadOnly': True, 'sanitised': True, 'counts': {}}
    for alias, key in [('default', 'DATABASE_URL'), ('login_db', 'login_DATABASE_URL')]:
        info = conninfo_to_dict(source[key])
        info['options'] = '-c default_transaction_read_only=on'
        with psycopg.connect(**info) as original:
            original.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            assert original.execute('SHOW transaction_read_only').fetchone()[0] == 'on'
            exported = original.execute('SELECT pg_export_snapshot()').fetchone()[0]
            args = ['--format=custom', '--no-owner', '--no-acl', '--no-comments', '--no-publications', '--no-subscriptions', '--snapshot', exported, '--file', str(PRIVATE / (alias + '.dump'))]
            for table in TABLES[alias]:
                args += ['--table', 'public."' + table + '"']
            for table in ('audit_logs', 'django_session', 'module_learner_mappings'):
                args += ['--exclude-table-data', 'public.' + table]
            run('pg_dump', args, pg_env(info, source=True))
            count = original.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier('Training_plan' if alias == 'default' else 'auth_user'))).fetchone()[0]
        local = dict(host='127.0.0.1', port=PORT, dbname=DATABASES[alias], user='tp_lms_test_app', password=state['password'])
        with psycopg.connect(**local) as conn:
            verify_local(conn, local['dbname'])
        run('pg_restore', ['--exit-on-error', '--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname', local['dbname'], str(PRIVATE / (alias + '.dump'))], pg_env(local))
        with psycopg.connect(**local) as conn:
            verify_local(conn, local['dbname'])
            assert conn.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier('Training_plan' if alias == 'default' else 'auth_user'))).fetchone()[0] == count
            sanitise(conn, alias)
        receipt['counts'][alias] = count
        print(alias, 'restored and sanitised:', count, 'primary records; isolated destination verified.', flush=True)
    (PRIVATE / 'isolation.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print('Isolated application databases ready. Production configuration unchanged.', flush=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['--initialise']:
        initialise()
    elif sys.argv[1:] == ['--restore']:
        restore()
    else:
        raise SystemExit('Use --initialise or --restore.')
