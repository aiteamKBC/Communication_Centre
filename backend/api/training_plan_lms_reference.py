"""LMS reference only: never use Training Plan saves or write to the LMS source."""
from contextlib import contextmanager
from datetime import date, datetime
import hashlib
import json
import os

import psycopg
from psycopg.conninfo import conninfo_to_dict
from django.conf import settings
from django.db import DatabaseError, IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.vary import vary_on_cookie

from login.access import get_user_access_payload
from .models import TrainingPlanLmsReference

SOURCE_TABLE = 'curriculum.modules'
SOURCE_FIELDS = ('module_catalogue_id', 'programme_id', 'programme_name', 'title', 'start_date', 'end_date')


class LmsReferenceSourceError(Exception):
    pass


@contextmanager
def lms_source_connection():
    source = getattr(settings, 'TRAINING_PLAN_LMS_REFERENCE_SOURCE', None)
    if source is None:
        url = os.getenv('TRAINING_PLAN_LMS_REFERENCE_DATABASE_URL', '').strip()
        if not url:
            raise LmsReferenceSourceError('The read-only LMS reference connection is not configured.')
        try:
            source = conninfo_to_dict(url)
        except psycopg.Error:
            raise LmsReferenceSourceError('The LMS reference connection configuration is invalid.') from None
    if not isinstance(source, dict):
        raise LmsReferenceSourceError('The LMS reference connection configuration is invalid.')
    info = dict(source)
    # Neon transaction poolers reject statement_timeout as a startup option.
    # Set it inside the same read-only transaction as the source queries.
    info.update(connect_timeout=5, options='-c default_transaction_read_only=on')
    try:
        with psycopg.connect(**info) as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            conn.execute('SET LOCAL statement_timeout=20000')
            if conn.execute('SHOW transaction_read_only').fetchone()[0] != 'on':
                raise LmsReferenceSourceError('LMS reference source access must be read only.')
            selectable, writable = conn.execute(
                "SELECT has_table_privilege(current_user,%s,'SELECT'), has_table_privilege(current_user,%s,'INSERT,UPDATE,DELETE,TRUNCATE')",
                (SOURCE_TABLE, SOURCE_TABLE)).fetchone()
            if not selectable or writable:
                raise LmsReferenceSourceError('The configured LMS account must have SELECT permission and no write permissions on modules.')
            yield conn
    except psycopg.Error:
        raise LmsReferenceSourceError('The LMS reference source is unavailable. No reference was saved.') from None


def read_lms_reference_records():
    with lms_source_connection() as conn:
        columns = dict(conn.execute(
            "SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='curriculum' AND table_name='modules'").fetchall())
        required = tuple(field for field in SOURCE_FIELDS if field != 'start_date')
        created_type = columns.get('created_at')
        if (any(field not in columns for field in required)
                or columns['end_date'] != 'date'
                or ('start_date' in columns and columns['start_date'] != 'date')
                or (created_type is not None and created_type not in (
                    'date', 'timestamp without time zone', 'timestamp with time zone'))
                or ('start_date' not in columns and created_type is None)):
            raise LmsReferenceSourceError('The LMS modules schema does not match the verified programme/module/date mapping.')
        fields = [field if field in columns else 'NULL' for field in SOURCE_FIELDS]
        created_date = ('(created_at AT TIME ZONE \'UTC\')::date'
                        if created_type == 'timestamp with time zone' else
                        'created_at::date' if created_type else 'NULL')
        rows = conn.execute('SELECT ' + ','.join([*fields, created_date])
                            + ' FROM curriculum.modules ORDER BY module_catalogue_id').fetchall()
        expected = conn.execute('SELECT count(*) FROM curriculum.modules').fetchone()[0]
        if len(rows) != expected:
            raise LmsReferenceSourceError('The complete LMS reference could not be read.')
    records, identifiers = [], set()
    for source_id, programme_id, programme, module, start, end, created_date in rows:
        if source_id is None or not str(source_id).strip() or str(source_id) in identifiers:
            raise LmsReferenceSourceError('LMS module identifiers must be present and unique. No reference was saved.')
        identifiers.add(str(source_id))
        for value in (start, end, created_date):
            if value is not None and (not isinstance(value, date) or isinstance(value, datetime)):
                raise LmsReferenceSourceError('LMS module dates must be date-only values.')
        effective_start = start if start is not None else created_date
        record = {'sourceModuleId': str(source_id),
                        'sourceProgrammeId': str(programme_id) if programme_id is not None else None,
                        'programme': programme, 'module': module,
                        'startDate': effective_start.isoformat() if effective_start is not None else None,
                        'endDate': end.isoformat() if end is not None else None}
        if start is None and created_date is not None:
            record['startDateSource'] = 'created_at'
        records.append(record)
    return records


def read_lms_tutor_names(module_ids):
    if not module_ids:
        return {}
    with lms_source_connection() as conn:
        column = conn.execute("SELECT data_type FROM information_schema.columns "
                              "WHERE table_schema='curriculum' AND table_name='modules' "
                              "AND column_name='tutor_name'").fetchone()
        if not column:
            return {}
        if column[0] not in ('character varying', 'text', 'character'):
            raise LmsReferenceSourceError('The LMS tutor name field has an unsupported format.')
        rows = conn.execute('SELECT module_catalogue_id,tutor_name FROM curriculum.modules '
                            'WHERE module_catalogue_id::text = ANY(%s)', (module_ids,)).fetchall()
    return {str(module_id): (name or '').strip() for module_id, name in rows}


def read_lms_cohorts(module_ids):
    if not module_ids:
        return {}
    with lms_source_connection() as conn:
        columns = {row[0] for row in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='curriculum' "
            "AND table_name='modules' AND column_name IN ('cohort_id','cohort_name','group_name')").fetchall()}
        if not columns:
            return {}
        fields = [field if field in columns else 'NULL' for field in ('cohort_id', 'cohort_name', 'group_name')]
        rows = conn.execute('SELECT module_catalogue_id,' + ','.join(fields)
                            + ' FROM curriculum.modules WHERE module_catalogue_id::text = ANY(%s)',
                            (module_ids,)).fetchall()
    return {str(module_id): {'cohortId': str(cohort_id) if cohort_id is not None else None,
                            'cohortName': (cohort_name or '').strip(),
                            'groupName': (group_name or '').strip()}
            for module_id, cohort_id, cohort_name, group_name in rows}


@never_cache
@vary_on_cookie
def training_plan_lms_cohorts(request):
    """Read cohort labels by source module ID without changing the captured dates."""
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated or not user.is_active:
        return JsonResponse({'detail': 'Sign in to view LMS cohorts.'}, status=401)
    if request.method != 'GET':
        response = JsonResponse({'detail': 'LMS cohorts are read only.'}, status=405)
        response['Allow'] = 'GET'
        return response
    try:
        reference = TrainingPlanLmsReference.objects.filter(pk=1).first()
        module_ids = [str(row['sourceModuleId']) for row in reference.records] if reference else []
        return JsonResponse({'cohorts': read_lms_cohorts(module_ids)})
    except (LmsReferenceSourceError, DatabaseError):
        return JsonResponse({'detail': 'LMS cohorts could not be loaded. Please retry.'}, status=503)


@never_cache
@vary_on_cookie
def training_plan_lms_tutors(request):
    """Read current LMS names separately, leaving the immutable date capture intact."""
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated or not user.is_active:
        return JsonResponse({'detail': 'Sign in to view LMS tutor names.'}, status=401)
    if request.method != 'GET':
        response = JsonResponse({'detail': 'LMS tutor names are read only.'}, status=405)
        response['Allow'] = 'GET'
        return response
    try:
        reference = TrainingPlanLmsReference.objects.filter(pk=1).first()
        module_ids = [str(row['sourceModuleId']) for row in reference.records] if reference else []
        return JsonResponse({'tutorNames': read_lms_tutor_names(module_ids)})
    except (LmsReferenceSourceError, DatabaseError):
        return JsonResponse({'detail': 'LMS tutor names could not be loaded. Please retry.'}, status=503)


def reference_payload(record):
    return {'id': record.id, 'createdAt': record.created_at.isoformat(),
            'createdBy': record.created_by, 'count': len(record.records),
            'contentSha256': record.content_sha256, 'records': record.records}


@never_cache
@vary_on_cookie
def training_plan_lms_reference(request):
    # Match the existing Training Plan's signed-in viewer scope. It currently has
    # no programme/tenant-specific row restriction; no new role or permission.
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated or not user.is_active:
        return JsonResponse({'detail': 'Sign in to view the LMS reference.'}, status=401)
    if request.method not in ('GET', 'POST'):
        response = JsonResponse({'detail': 'The LMS reference is read only; replacement and mutation are not supported.'}, status=405)
        response['Allow'] = 'GET, POST'
        return response
    if request.method == 'POST':
        access = get_user_access_payload(user)
        if not (access.get('operationsAccess') or access.get('adminAccess')):
            return JsonResponse({'detail': 'Training Plan management permission is required to capture the LMS reference.'}, status=403)
        try:
            body = json.loads(request.body or b'{}')
        except (ValueError, UnicodeDecodeError):
            return JsonResponse({'detail': 'Expected an empty JSON object.'}, status=400)
        if body != {} or request.GET:
            return JsonResponse({'detail': 'Capture accepts no client records or filters; it reads all authorised LMS modules.'}, status=400)
    try:
        existing = TrainingPlanLmsReference.objects.filter(pk=1).first()
        if request.method == 'GET':
            return JsonResponse({'reference': reference_payload(existing) if existing else None})
        if existing:
            return JsonResponse({'detail': 'An LMS reference already exists and cannot be replaced.'}, status=409)
        records = read_lms_reference_records()
        digest = hashlib.sha256(json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
        # The complete capture is a single INSERT. A fixed primary key arbitrates
        # simultaneous captures without ever updating/replacing an existing row.
        with transaction.atomic():
            record = TrainingPlanLmsReference.objects.create(id=1, records=records,
                created_by={'id': str(user.pk), 'name': user.get_full_name().strip() or user.username},
                content_sha256=digest)
        return JsonResponse({'reference': reference_payload(record)}, status=201)
    except LmsReferenceSourceError as error:
        return JsonResponse({'detail': str(error)}, status=503)
    except IntegrityError:
        return JsonResponse({'detail': 'Another manager captured the LMS reference first. The existing reference was preserved.'}, status=409)
    except DatabaseError as error:
        # PostgreSQL's undefined_table identifies an unapplied storage migration.
        # Do not expose the underlying exception, SQL or connection details.
        if getattr(error.__cause__, 'sqlstate', None) == '42P01':
            return JsonResponse({
                'code': 'reference_storage_not_ready',
                'detail': 'LMS reference storage has not been set up. Ask an administrator to complete setup.',
            }, status=503)
        detail = ('Reference storage is unavailable. Retry loading the reference.'
                  if request.method == 'GET' else
                  'Reference storage is unavailable. Reload the reference to check whether the capture was saved before trying again.')
        return JsonResponse({'code': 'reference_storage_unavailable', 'detail': detail}, status=503)
