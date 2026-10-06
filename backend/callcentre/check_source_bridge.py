"""Read-only audit of the candidate Aptem source and existing LMS data paths.

Run: python -m callcentre.check_source_bridge
Loads the configured connections, but all SQL goes through SET TRANSACTION READ ONLY.
Prints aggregate JSON only: no credentials, names, emails or telephone numbers.
Exit 2 means integration gaps were found; this never switches a source or repairs data.
"""
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import timedelta


def text(value):
    return str(value or '').strip()


def groups(items, key):
    result = defaultdict(list)
    for item in items:
        value = key(item)
        if value:
            result[value].append(item)
    return result


def audit():
    from .identity import enabled
    if enabled():
        from .check_identity import audit as unified_audit
        result = unified_audit()
        result['snapshot_checks_passed'] = bool(result['identity_gate_passed']
            and not result['sessions']['orphan_absence_links']
            and result['sessions']['catchup_total'] == result['sessions']['catchup_matched'])
        return result
    from django.db import router
    from django.utils import timezone
    from api.models import AptemAutoExtracting
    from . import learners, lms_reviews
    from .learner_satisfaction import eligible
    from .manage_views import phone_keys
    from .rules import email_key, normalize_phone, LONDON
    from .sources import rows, source_transaction

    candidate_sql = learners.APTEM_LEARNERS_SQL.replace(
        'FROM public.aptem_auto_extracting',
        ', "OwnerEmail", "Manager Phone", case_owner_id FROM "LMS"."Aptem_users"')
    candidate = rows('callcentre_lms', candidate_sql)
    enrolments = rows('callcentre_lms', learners.LMS_LEARNERS_SQL)
    staff = rows('callcentre_lms', learners.STAFF_SQL)
    profiles = rows('callcentre_lms', '''SELECT id, enrolment_id, aptem_id, email_normalized, phone_number
        FROM "Learner".learners''')
    people = learners.merge(enrolments, candidate, staff)
    selected = [p for p in people.satisfaction if eligible(p)]
    ids = groups(candidate, lambda r: text(r['ID']))
    emails = groups(candidate, lambda r: email_key(r['Email']))
    frequencies = Counter(i for p in people.satisfaction for i in p['identifiers'])
    selected_enrolments = [r for r in enrolments if text(r['Programme_status']).lower() in {'active', 'onboarding'}]
    missing = [r for r in selected_enrolments
               if text(r['aptem_id']) not in ids and email_key(r['Email']) not in emails]
    identity_disagreements = sum(
        len(ids.get(text(r['aptem_id']), [])) == 1
        and len(emails.get(email_key(r['Email']), [])) == 1
        and ids[text(r['aptem_id'])][0]['ID'] != emails[email_key(r['Email'])][0]['ID']
        for r in enrolments)
    profile_enrolments = groups(profiles, lambda r: text(r['enrolment_id']))
    historical_contacts = rows('callcentre_lms', '''SELECT "ID", "Email", "Learner Phone"
        FROM "Learner"."Aptem_users"''')
    historical_ids = groups(historical_contacts, lambda r: text(r['ID']))
    recoverable = 0
    historical_recoverable = 0
    for person in selected:
        if person['profile']['learner_phone']:
            continue
        keys = [i.removeprefix('lms:') for i in person['identifiers'] if i.startswith('lms:')]
        matches = [p for key in keys for p in profile_enrolments.get(key, [])]
        # A diagnostic only: require a unique exact FK match AND a matching email.
        if (len(matches) == 1 and email_key(matches[0]['email_normalized']) == person['profile']['learner_email']
                and normalize_phone(matches[0]['phone_number'])):
            recoverable += 1
        if len(matches) != 1 or email_key(matches[0]['email_normalized']) != person['profile']['learner_email']:
            continue
        historical = historical_ids.get(text(matches[0]['aptem_id']), [])
        if (len(historical) == 1 and email_key(historical[0]['Email']) == person['profile']['learner_email']
                and normalize_phone(historical[0]['Learner Phone'])):
            historical_recoverable += 1
    report = {
        'checked_at': timezone.now().isoformat(), 'mode': 'read_only',
        'source': 'callcentre_lms: LMS.Aptem_users + enrolment.Created_users',
        'learners': {
            'candidate_rows': len(candidate), 'enrolment_rows': len(enrolments),
            'candidate_statuses': dict(Counter(r['Program-Status'] for r in candidate)),
            'duplicate_candidate_ids': sum(len(v) > 1 for v in ids.values()),
            'duplicate_candidate_emails': sum(len(v) > 1 for v in emails.values()),
            'id_email_disagreements': identity_disagreements,
            'combined_profiles': len(people), 'eligible_satisfaction_people': len(selected),
            'eligible_ambiguous_identities': sum(any(frequencies[i] > 1 for i in p['identifiers']) for p in selected),
            'eligible_enrolments_absent_from_candidate': len(missing),
            'combined_eligible_missing_phone': sum(not p['profile']['learner_phone'] for p in selected),
            'missing_phones_available_via_exact_profile_link': recoverable,
            'missing_phones_available_via_profile_to_historical_aptem_and_matching_email': historical_recoverable,
        },
    }

    # Activity currently reads this legacy JSON, not learners.merge(). Reproduce its key policy.
    activity = rows('login_db', 'SELECT case_owner, learners_json FROM public.coaches_data')
    activity_keys, activity_emails = defaultdict(set), set()
    for coach in activity:
        payload = coach['learners_json']
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except ValueError:
                payload = []
        for learner in payload if isinstance(payload, list) else []:
            if not isinstance(learner, dict):
                continue
            email = email_key(learner.get('Email'))
            if email:
                activity_emails.add(email)
            for key in phone_keys(learner.get('learner_phone')):
                if email:
                    activity_keys[key].add(email)
    merged_phones = defaultdict(set)
    for person in people.values():
        phone = normalize_phone(person['learner_phone'])
        if phone:
            merged_phones[phone].add(person['learner_email'])
    calls = rows('login_db', '''SELECT callee_number, count(*) AS calls FROM dashboard_zoom_phone_call
        WHERE direction='outbound' AND started_at >= %s AND started_at <= %s
          AND nullif(trim(callee_number), '') IS NOT NULL GROUP BY callee_number''',
        [timezone.now() - timedelta(days=30), timezone.now()])
    report['activity'] = {
        'actual_source': 'login_db.public.coaches_data.learners_json',
        'legacy_learner_emails': len(activity_emails),
        'combined_eligible_absent_from_legacy_json': sum(p['profile']['learner_email'] not in activity_emails for p in selected),
        'ambiguous_legacy_phone_keys': sum(len(v) > 1 for v in activity_keys.values()),
        'outbound_calls_last_30_days': sum(r['calls'] for r in calls),
        'calls_labelled_by_legacy_keys': sum(r['calls'] for r in calls if any(k in activity_keys for k in phone_keys(r['callee_number']))),
        'calls_uniquely_matched_by_combined_exact_phone': sum(r['calls'] for r in calls if len(merged_phones.get(normalize_phone(r['callee_number']), set())) == 1),
    }

    calendar = rows('callcentre_lms', '''SELECT id, event_key, learner_id, learner_email, event_type, status
        FROM "Learner".coach_calendar_event''')
    catchups = [r for r in calendar if r['event_type'] == 'catch-up']
    reports = rows('callcentre_lms', '''SELECT learner_id, learner_email, catchup_event_key, status
        FROM "Coach".coach_absence_report''')
    keys = {r['event_key'] for r in calendar}
    pid = {r['id']: r for r in profiles}
    eid = {r['id']: r for r in enrolments}
    report['catchup'] = {
        'sessions': len(catchups), 'statuses': dict(Counter(r['status'] for r in catchups)),
        'sessions_matched_by_combined_email': sum(email_key(r['learner_email']) in people for r in catchups),
        'sessions_matched_by_candidate_email_only': sum(email_key(r['learner_email']) in emails for r in catchups),
        'approved_reports_with_missing_calendar_key': sum(r['status'] == 'approved' and bool(text(r['catchup_event_key']))
                                                         and r['catchup_event_key'] not in keys for r in reports),
        'calendar_rows': len(calendar),
        'calendar_profile_id_and_email_match': sum(r['learner_id'] in pid and email_key(pid[r['learner_id']]['email_normalized']) == email_key(r['learner_email']) for r in calendar),
        'calendar_enrolment_id_and_email_match': sum(r['learner_id'] in eid and email_key(eid[r['learner_id']]['Email']) == email_key(r['learner_email']) for r in calendar),
    }
    with source_transaction('callcentre_lms'):
        reviews = lms_reviews.review_items(timezone.now().astimezone(LONDON).date())
    report['reviews'] = {
        'due_items_before_status_filter': len(reviews),
        'items_matched_by_combined_directory': sum(r['email'] in people for r in reviews),
        'items_with_active_or_delivery_identity': sum(r['email'] in people and r['email'] in people.active for r in reviews),
    }
    columns = {r['column_name'] for r in rows('callcentre_lms', '''SELECT column_name
        FROM information_schema.columns WHERE table_schema='LMS' AND table_name='Aptem_users' ''')}
    alias = router.db_for_read(AptemAutoExtracting)
    current_exists = rows(alias, "SELECT to_regclass('public.aptem_auto_extracting') IS NOT NULL AS present")[0]['present']
    report['training_plan'] = {
        'current_alias': alias, 'current_source_table_exists': current_exists,
        'candidate_missing_model_columns': sorted({f.column for f in AptemAutoExtracting._meta.fields} - columns),
    }
    report['checks'] = {
        'candidate_ids_unique': report['learners']['duplicate_candidate_ids'] == 0,
        'candidate_emails_unique': report['learners']['duplicate_candidate_emails'] == 0,
        'enrolment_id_email_matches_agree': identity_disagreements == 0,
        'eligible_identities_unambiguous': report['learners']['eligible_ambiguous_identities'] == 0,
        'legacy_activity_phone_keys_unambiguous': report['activity']['ambiguous_legacy_phone_keys'] == 0,
        'approved_catchup_references_exist': report['catchup']['approved_reports_with_missing_calendar_key'] == 0,
        'training_plan_current_source_exists': current_exists,
        'candidate_matches_training_plan_model': not report['training_plan']['candidate_missing_model_columns'],
    }
    report['snapshot_checks_passed'] = all(report['checks'].values())
    report['limitations'] = [
        'This audit does not enable the candidate source or change application routing.',
        'Email and phone matches are technical matches, not confirmation of real-world ownership.',
        'No outbound emails, calls or bookings are exercised.',
        'Passing these data checks is not certification that the entire site is error-free.',
    ]
    return report


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()
    try:
        result = audit()
    except Exception as exc:
        # Do not print provider errors which may contain secrets or record values.
        print(json.dumps({'mode': 'read_only', 'audit_incomplete': True, 'error_type': type(exc).__name__}))
        return 1
    print(json.dumps(result, indent=2, default=str))
    return 0 if result['snapshot_checks_passed'] else 2


if __name__ == '__main__':
    sys.exit(main())
