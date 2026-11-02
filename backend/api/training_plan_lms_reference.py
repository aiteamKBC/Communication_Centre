"""LMS reference only: never use Training Plan saves or write to the LMS source."""
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


def read_lms_reference_records():
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
    info.update(connect_timeout=5, options='-c default_transaction_read_only=on -c statement_timeout=20000')
    try:
        with psycopg.connect(**info) as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            if conn.execute('SHOW transaction_read_only').fetchone()[0] != 'on':
                raise LmsReferenceSourceError('LMS reference source access must be read only.')
            selectable, writable = conn.execute(
                "SELECT has_table_privilege(current_user,%s,'SELECT'), has_table_privilege(current_user,%s,'INSERT,UPDATE,DELETE,TRUNCATE')",
                (SOURCE_TABLE, SOURCE_TABLE)).fetchone()
            if not selectable or writable:
                raise LmsReferenceSourceError('The configured LMS account must have SELECT permission and no write permissions on modules.')
            columns = dict(conn.execute(
                "SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='curriculum' AND table_name='modules'").fetchall())
            if any(field not in columns for field in SOURCE_FIELDS) or columns['start_date'] != 'date' or columns['end_date'] != 'date':
                raise LmsReferenceSourceError('The LMS modules schema does not match the verified programme/module/date mapping.')
            rows = conn.execute('SELECT ' + ','.join(SOURCE_FIELDS) + ' FROM curriculum.modules ORDER BY module_catalogue_id').fetchall()
            expected = conn.execute('SELECT count(*) FROM curriculum.modules').fetchone()[0]
            if len(rows) != expected:
                raise LmsReferenceSourceError('The complete LMS reference could not be read.')
    except psycopg.Error:
        # Do not return/log connection strings, SQL errors, credentials or source hosts.
        raise LmsReferenceSourceError('The LMS reference source is unavailable. No reference was saved.') from None
    records, identifiers = [], set()
    for source_id, programme_id, programme, module, start, end in rows:
        if source_id is None or not str(source_id).strip() or str(source_id) in identifiers:
            raise LmsReferenceSourceError('LMS module identifiers must be present and unique. No reference was saved.')
        identifiers.add(str(source_id))
        for value in (start, end):
            if value is not None and (not isinstance(value, date) or isinstance(value, datetime)):
                raise LmsReferenceSourceError('LMS module dates must be date-only values.')
        records.append({'sourceModuleId': str(source_id),
                        'sourceProgrammeId': str(programme_id) if programme_id is not None else None,
                        'programme': programme, 'module': module,
                        'startDate': start.isoformat() if start is not None else None,
                        'endDate': end.isoformat() if end is not None else None})
    return records


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
    except DatabaseError:
        return JsonResponse({'detail': 'Reference storage is unavailable. No capture was saved; retry after reloading.'}, status=503)
