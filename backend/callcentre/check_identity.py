"""Read-only rollout gate: python -m callcentre.check_identity.

Uses configured connections, SELECT only; never runs a cycle, sends email or books.
Exit 2 = identity/case preservation blocker. Operational orphans are reported, not repaired.
Set CALLCENTRE_IDENTITY_MODE=unified only after reviewing this report and isolated tests.
Set it back to legacy to roll back readers; source rows and historical cases are untouched.
"""
import json
import os


def audit():
    from collections import Counter
    from django.test import override_settings
    from . import learners, lms_reviews
    from .db import LMS, DB, APTEM
    from .sources import rows, unified_directory, source_transaction
    from .learner_satisfaction import eligible
    from .rules import LONDON
    from django.utils import timezone

    people = unified_directory()
    old = learners.merge(rows(LMS, learners.LMS_LEARNERS_SQL), rows(APTEM, learners.APTEM_LEARNERS_SQL),
                         rows(LMS, learners.STAFF_SQL))
    report = people.summary()
    report['read_only'] = True
    report['comparison'] = {'old_contacts': len(old), 'new_contacts': len(people),
                            'old_eligible': sum(eligible(p) for p in old.satisfaction),
                            'new_eligible': sum(eligible(p) for p in people.satisfaction),
                            'lost_old_contacts': sum(email not in people.by_email for email in old),
                            'new_contacts_added': sum(email not in old for email in people)}
    cases = rows(DB, '''SELECT source_data FROM callcenter_case
        WHERE source_type='learner_satisfaction' AND status <> 'resolved' ''')
    counts = Counter(i for p in people.satisfaction for i in p['identifiers'])
    missing_cases = 0
    for case in cases:
        data = case['source_data']
        data = json.loads(data) if isinstance(data, str) else data
        if data.get('eligible', True) and not any(counts[i] == 1 for i in data.get('identifiers', [])):
            missing_cases += 1
    report['unmatched_open_eligible_cases'] = missing_cases
    events = rows(LMS, '''SELECT id, event_key, learner_id, learner_email, event_type
        FROM "Learner".coach_calendar_event''')
    reports = rows(LMS, '''SELECT catchup_event_key FROM "Coach".coach_absence_report
        WHERE status='approved' AND nullif(trim(catchup_event_key), '') IS NOT NULL''')
    keys = {r['event_key'] for r in events}
    report['sessions'] = {'total': len(events),
                          'identity_matched': sum(people.calendar_person(r) is not None for r in events),
                          'catchup_total': sum(r['event_type'] == 'catch-up' for r in events),
                          'catchup_matched': sum(r['event_type'] == 'catch-up' and people.calendar_person(r) is not None for r in events),
                          'orphan_absence_links': sum(r['catchup_event_key'] not in keys for r in reports)}
    with source_transaction(LMS):
        reviews = lms_reviews.review_items(timezone.now().astimezone(LONDON).date(), people=people)
    report['reviews'] = {'matched_due_items': len(reviews), 'unique_source_refs': len({r['ref'] for r in reviews})}
    with override_settings(CALLCENTRE_IDENTITY_MODE='unified'):
        from api.views import aptem_source_records
        training = aptem_source_records()
    report['training_source_rows'] = len(training)
    report['identity_gate_passed'] = bool(people.sources_complete and not missing_cases
                                         and not report['comparison']['lost_old_contacts'])
    return report


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    import django
    django.setup()
    try:
        report = audit()
    except Exception as exc:
        print(json.dumps({'read_only': True, 'error_type': type(exc).__name__, 'complete': False}))
        return 1
    print(json.dumps(report, indent=2))
    return 0 if report['identity_gate_passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
