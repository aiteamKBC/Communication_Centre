"""Read-only local snapshot of the LMS curriculum.modules table.

Run with the backend virtualenv: python scripts/export_database_snapshot.py
Add --export to save JSON, CSV and gzip JSONL beside the schema. Other tables or
sources require explicit --tables and --sources arguments. Credentials never enter
the output; authentication/session tables and credential columns are excluded.
"""
import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import uuid

from dotenv import dotenv_values
import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

BASE = Path(__file__).resolve().parents[1]
SOURCES = {
    'default': ('DATABASE_URL',),
    'login_db': ('login_DATABASE_URL',),
    'safeguarding_db': ('safe_gaurding_database_url', 'SUPPORT_TICKETS_DATABASE_URL'),
    'ofsted_db': ('ofested_command_database_url',),
    'aptem_db': ('APTEM_DATABASE_URL', 'aptem_DATABASE_URL'),
    'callcentre_aptem': ('CALLCENTRE_APTEM_DATABASE_URL',),
    'callcentre_lms': ('CALLCENTRE_LMS_DATABASE_URL',),
    'training_plan_lms_reference': ('TRAINING_PLAN_LMS_REFERENCE_DATABASE_URL',),
}
SECRET_COLUMN = re.compile(
    r'password|passwd|pwd|secret|token|session_key|session_data|api_?key|'
    r'private_?key|client_?credential|connection_?string|database_?url', re.I)
SECRET_TABLE = re.compile(
    r'(^|_)(tokens?|secrets?|credentials?|api_?keys?)(_|$)|'
    r'^django_session$|^authtoken_|^oauth2_provider_|^socialaccount_socialtoken$', re.I)


def json_default(value):
    if isinstance(value, (datetime,)) or hasattr(value, 'isoformat'):
        return value.isoformat()
    if isinstance(value, (Decimal, uuid.UUID)):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        import base64
        return {'$base64': base64.b64encode(bytes(value)).decode('ascii')}
    raise TypeError(type(value).__name__)


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=json_default), encoding='utf-8')


def configuration(local=False):
    values = dict(os.environ)
    env_file = BASE / ('.env.local' if local else '.env')
    if not env_file.exists():
        raise RuntimeError('The selected backend environment file is missing.')
    values.update({k: v for k, v in dotenv_values(env_file).items() if v is not None})
    login = BASE / 'login' / ('.env.login.local' if local else '.env.login')
    if not login.exists():
        login = BASE / 'login' / '.env.login'
    if not login.exists():
        login = BASE / '.env.login'
    if login.exists():
        values.update({k: v for k, v in dotenv_values(login).items() if v is not None})
    return {alias: next((values[k] for k in keys if values.get(k)), None)
            for alias, keys in SOURCES.items()}


def inventory(conn):
    tables = []
    rows = conn.execute("""
        SELECT n.nspname,c.relname,c.relkind,c.reltuples::bigint,
               pg_total_relation_size(c.oid),
               has_table_privilege(c.oid,'SELECT'),obj_description(c.oid,'pg_class')
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p','m','v')
          AND n.nspname NOT IN ('pg_catalog','information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
          AND NOT c.relispartition
        ORDER BY n.nspname,c.relname
    """).fetchall()
    all_columns = {}
    for schema, name, column, data_type, required in conn.execute("""
        SELECT n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p','m','v') AND a.attnum>0 AND NOT a.attisdropped
          AND n.nspname NOT IN ('pg_catalog','information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
          AND NOT c.relispartition
        ORDER BY n.nspname,c.relname,a.attnum
    """).fetchall():
        all_columns.setdefault((schema, name), []).append((column, data_type, required))
    all_constraints = {}
    for schema, name, constraint, kind, definition in conn.execute("""
        SELECT n.nspname,c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid)
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
          AND NOT c.relispartition
        ORDER BY n.nspname,c.relname,k.conname
    """).fetchall():
        all_constraints.setdefault((schema, name), []).append((constraint, kind, definition))
    for schema, name, kind, estimated, size, selectable, comment in rows:
        columns = all_columns.get((schema, name), [])
        constraints = all_constraints.get((schema, name), [])
        tables.append({
            'schema': schema, 'table': name, 'kind': kind,
            'estimated_rows': estimated, 'total_bytes': size, 'selectable': selectable,
            'columns': [{'name': n, 'type': t, 'nullable': not required,
                         'excluded': bool(SECRET_COLUMN.search(n))}
                        for n, t, required in columns],
            'constraints': [{'name': n, 'type': t, 'definition': d} for n, t, d in constraints],
            'excluded': schema == 'neon_auth' or bool(SECRET_TABLE.search(name)),
        })
    return tables


def export_table(conn, table, folder, index):
    if table['excluded']:
        return {'status': 'excluded_authentication_table'}
    if not table['selectable']:
        return {'status': 'not_selectable'}
    if table['kind'] == 'v':
        return {'status': 'schema_only_view'}
    columns = [c['name'] for c in table['columns'] if not c['excluded']]
    if not columns:
        return {'status': 'no_exportable_columns'}
    filename = f'{index:04d}.jsonl.gz'
    target = folder / filename
    digest = hashlib.sha256()
    count = 0
    query = sql.SQL('SELECT {} FROM {}').format(
        sql.SQL(',').join(map(sql.Identifier, columns)),
        sql.Identifier(table['schema'], table['table']))
    try:
        with conn.transaction():
            with conn.cursor(name=f'export_{index}') as cursor:
                cursor.execute(query)
                with gzip.open(target, 'wb') as output:
                    while batch := cursor.fetchmany(1000):
                        for row in batch:
                            line = (json.dumps(dict(zip(columns, row)), ensure_ascii=False,
                                               default=json_default) + '\n').encode('utf-8')
                            output.write(line)
                            digest.update(line)
                            count += 1
            expected = conn.execute(sql.SQL('SELECT count(*) FROM {}').format(
                sql.Identifier(table['schema'], table['table']))).fetchone()[0]
            if count != expected:
                raise ValueError('Row count mismatch')
        with gzip.open(target, 'rt', encoding='utf-8') as data:
            records = [json.loads(line) for line in data]
        json_path = folder / f'{index:04d}.json'
        csv_path = folder / f'{index:04d}.csv'
        write_json(json_path, records)
        with csv_path.open('w', encoding='utf-8-sig', newline='') as output:
            writer = csv.DictWriter(output, fieldnames=columns)
            writer.writeheader()
            for record in records:
                writer.writerow({k: json.dumps(v, ensure_ascii=False)
                                 if isinstance(v, (dict, list)) else v for k, v in record.items()})
        return {'status': 'exported', 'file': filename, 'rows': count,
                'json_file': json_path.name, 'csv_file': csv_path.name,
                'sha256_uncompressed': digest.hexdigest(), 'compressed_bytes': target.stat().st_size}
    except Exception as exc:
        target.unlink(missing_ok=True)
        return {'status': 'failed', 'error_type': type(exc).__name__,
                'sqlstate': getattr(exc, 'sqlstate', None)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', action='store_true')
    parser.add_argument('--local', action='store_true')
    parser.add_argument('--sources', nargs='+', choices=list(SOURCES),
                        default=['training_plan_lms_reference'])
    parser.add_argument('--tables', nargs='+', default=['curriculum.modules'],
                        help='Exact schema.table names; defaults to curriculum.modules only')
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    root = BASE / 'private_exports' / stamp
    root.mkdir(parents=True)
    manifest = {'created_at_utc': stamp, 'mode': 'export' if args.export else 'inventory',
                'source_read_only': True, 'environment': 'local' if args.local else 'default',
                'format': 'UTF-8 gzip JSON Lines; one object per row; nulls preserved',
                'credential_columns_excluded': True, 'sources': {}}
    manifest['requested_tables'] = args.tables
    identities = {}
    for alias, url in configuration(args.local).items():
        if args.sources and alias not in args.sources:
            continue
        if not url:
            manifest['sources'][alias] = {'status': 'not_configured'}
            continue
        print(f'{alias}: connecting (read only)', flush=True)
        source = manifest['sources'][alias] = {}
        try:
            info = conninfo_to_dict(url)
            identity = tuple(info.get(k) for k in ('host','port','dbname','user'))
            if identity in identities:
                source.update(status='duplicate', same_source_as=identities[identity])
                continue
            info.update(connect_timeout=12, options='-c default_transaction_read_only=on')
            connection = None
            for attempt in range(2):
                try:
                    connection = psycopg.connect(**info)
                    break
                except psycopg.OperationalError:
                    if attempt:
                        raise
                    print(f'{alias}: retrying connection', flush=True)
            with connection as conn:
                conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                conn.execute("SET LOCAL statement_timeout='120s'")
                conn.execute("SET LOCAL lock_timeout='5s'")
                if conn.execute('SHOW transaction_read_only').fetchone()[0] != 'on':
                    raise RuntimeError('Read-only transaction was not established')
                source['row_security_active'] = conn.execute('SHOW row_security').fetchone()[0]
                tables = [t for t in inventory(conn)
                          if f'{t["schema"]}.{t["table"]}' in args.tables]
                missing = set(args.tables) - {f'{t["schema"]}.{t["table"]}' for t in tables}
                if missing:
                    raise ValueError('One or more requested tables were not found')
                source.update(status='inventoried', tables=tables)
                folder = root / alias
                folder.mkdir()
                write_json(folder / 'schema.json', tables)
                print(f'{alias}: {len(tables)} tables/views; '
                      f'{sum(max(0,t["estimated_rows"]) for t in tables):,} estimated rows; '
                      f'{sum(t["total_bytes"] for t in tables)/1048576:.1f} MiB on server', flush=True)
                if args.export:
                    for i, table in enumerate(tables, start=1):
                        table['export'] = export_table(conn, table, folder, i)
                        result = table['export']
                        print(f'{alias}.{table["schema"]}.{table["table"]}: '
                              f'{result["status"]} {result.get("rows", "")}', flush=True)
                    source['status'] = ('partial' if any(t['export']['status'] in ('failed','not_selectable')
                                                       for t in tables) else 'exported')
                identities[identity] = alias
        except Exception as exc:
            source.update(status='failed', error_type=type(exc).__name__,
                          sqlstate=getattr(exc, 'sqlstate', None))
            print(f'{alias}: unavailable ({type(exc).__name__}; details suppressed to protect connection secrets)', flush=True)
        write_json(root / 'manifest.json', manifest)
    write_json(root / 'manifest.json', manifest)
    print(f'Saved: {root}', flush=True)
    return 1 if any(s['status'] in ('failed','partial') for s in manifest['sources'].values()) else 0


if __name__ == '__main__':
    raise SystemExit(main())
