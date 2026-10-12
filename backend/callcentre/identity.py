"""Read-only, source-qualified identity directory shared by application consumers.

No source IDs, sessions, reviews or historical cases are rewritten. Metadata stays
outside the profile fields copied to CaseTicket. Conflicts are never fuzzy-matched.
"""
from collections import defaultdict

from django.conf import settings

from .learners import Learners, SKIPPED_LMS_STATUSES, pick_coach, program_status, staff_emails
from .rules import email_key, normalize_phone

APTEM_SQL = '''SELECT "ID", "FullName", "Email", "Learner Phone", "OwnerName", "OwnerEmail",
    "OrganizationName", "Program Name", "ManagerName", "ManagerEmail", "Manager Phone",
    "Program-Status", "Group", subprogramme FROM "LMS"."Aptem_users"'''
PROFILES_SQL = '''SELECT id, enrolment_id, aptem_id, email_normalized, phone_number
    FROM "Learner".learners'''
MAP_SQL = '''SELECT enrolment_id, aptem_id, legacy_lms_id FROM
    khaled_learning_hub.learner_identity_map WHERE status = 'approved' '''
ACCOUNTS_SQL = '''SELECT a.source_system, a.source_learner_id, a.enrolment_id,
    a.source_email, a.canonical_email FROM khaled_learning_hub.learner_source_accounts a
    JOIN khaled_learning_hub.learner_identity_map m ON m.enrolment_id = a.enrolment_id
    WHERE m.status = 'approved' AND a.approved_at IS NOT NULL'''


def enabled():
    return getattr(settings, 'CALLCENTRE_IDENTITY_MODE', 'legacy') == 'unified'


def text(value):
    return str(value).strip() if value is not None else ''


def index(items, key):
    result = defaultdict(list)
    for item in items:
        value = key(item)
        if value:
            result[value].append(item)
    return result


class Directory(Learners):
    def resolve(self, source=None, source_id=None, email=None):
        """A supplied known ID and email must agree. Unknown IDs cannot override email."""
        by_id = self.by_source.get((source, text(source_id))) if source else None
        by_email = self.by_email.get(email_key(email)) if email else None
        if email and email_key(email) in self.ambiguous_emails:
            return None
        if by_id and email and email_key(email) not in by_id['emails']:
            return None
        if by_id and by_email and by_id is not by_email:
            return None
        return by_id or (by_email if not text(source_id) else None)

    def summary(self):
        from collections import Counter
        return {'mode': getattr(settings, 'CALLCENTRE_IDENTITY_MODE', 'legacy'),
                'source': 'callcentre_lms: LMS.Aptem_users + enrolment.Created_users',
                'sources_complete': self.sources_complete, 'loaded_at': getattr(self, 'loaded_at', None),
                'people': len(self.records), 'contacts': len(self),
                'statuses': dict(Counter(p['programme_status'] for p in self.records.values())),
                'identity_conflicts': self.conflicts, 'ambiguous_email_count': len(self.ambiguous_emails),
                'field_conflicts': self.field_conflicts,
                'policy': {'coach': 'Current enrolment first; conflicts retained for review',
                           'dates': 'Existing risk source retained pending date confirmation',
                           'historical_phones': False}}

    def calendar_person(self, row):
        # Calendar learner_id contains BOTH profile IDs and enrolment IDs. Require
        # email corroboration, rather than assuming either numeric namespace wins.
        if not text(row.get('learner_id')) or not email_key(row.get('learner_email')):
            return None
        matches = [self.resolve(source, row.get('learner_id'), row.get('learner_email'))
                   for source in ('profile', 'lms')]
        matches = {p['person_id']: p for p in matches if p}
        return next(iter(matches.values())) if len(matches) == 1 else None

    def phone_contacts(self):
        """Exact normalized phone only; shared learner/manager numbers remain unknown."""
        buckets = defaultdict(dict)
        for person in self.records.values():
            profile = person['profile']
            phone = profile['learner_phone']
            if phone:
                buckets[phone][person['person_id']] = {
                    'name': profile['learner_name'], 'email': profile['learner_email'],
                    'role': 'learner', 'coach': profile['coach'], 'person_id': person['person_id']}
            manager = profile['manager_email']
            if person['manager_phone'] and manager:
                buckets[person['manager_phone']]['manager:' + manager] = {
                    'name': profile['manager_name'], 'email': manager, 'role': 'line_manager',
                    'coach': '', 'person_id': 'manager:' + manager}
        return {phone: next(iter(values.values())) for phone, values in buckets.items() if len(values) == 1}


def build(enrolments, aptem_rows, staff=(), profiles=(), mappings=(), accounts=()):
    """Pure snapshot builder. Explicit ID assertions must all agree before joining."""
    enrolments = [r for r in enrolments if text(r.get('Programme_status')).lower() not in SKIPPED_LMS_STATUSES]
    eid = index(enrolments, lambda r: text(r.get('id')))
    aid = index(aptem_rows, lambda r: text(r.get('ID')))
    ee = index(enrolments, lambda r: email_key(r.get('Email')))
    ae = index(aptem_rows, lambda r: email_key(r.get('Email')))
    pr = index(profiles, lambda r: text(r.get('enrolment_id')))
    mp = index(mappings, lambda r: text(r.get('enrolment_id')))
    ac = index(accounts, lambda r: text(r.get('enrolment_id')))
    staff_by_name = staff_emails(staff)
    conflicts, blocked, assignments = [], set(), {}

    def conflict(kind, enrolment='', aptem=''):
        conflicts.append({'kind': kind, 'lms_id': enrolment, 'aptem_id': aptem})
        if enrolment:
            blocked.add(enrolment)

    for key, group in eid.items():
        if len(group) != 1:
            conflict('duplicate_enrolment_id', key)
            continue
        row = group[0]
        assertions = {text(row.get('aptem_id')), text(row.get('id_aptem'))} - {''}
        assertions.update(text(r.get('aptem_id')) for r in pr[key] + mp[key] if text(r.get('aptem_id')))
        assertions.update(text(r['source_learner_id']) for r in ac[key] if r['source_system'] == 'aptem')
        if len(assertions) > 1:
            conflict('conflicting_aptem_ids', key)
            continue
        linked = next(iter(assertions), '')
        mail = email_key(row.get('Email'))
        fallback = ae.get(mail, [])
        if linked and len(fallback) == 1 and text(fallback[0]['ID']) != linked:
            conflict('id_email_disagreement', key, linked)
            continue
        if not linked and len(ee.get(mail, [])) == len(fallback) == 1:
            linked = text(fallback[0]['ID'])
        if linked and len(aid.get(linked, [])) > 1:
            conflict('duplicate_aptem_id', key, linked)
            continue
        assignments[key] = linked
    claims = index(list(assignments), lambda key: assignments[key])
    for key, owners in claims.items():
        if len(owners) > 1:
            for owner in owners:
                conflict('aptem_claimed_by_multiple_enrolments', owner, key)
    result = Directory({}, {})
    result.records, result.by_source, result.by_email = {}, {}, {}
    result.conflicts, result.field_conflicts = conflicts, []
    result.ambiguous_emails = set()
    used = set()

    def add(row, aptem):
        row, aptem = row or {}, aptem or {}
        key, apid = text(row.get('id')), text(aptem.get('ID')) or assignments.get(text(row.get('id')), '')
        person_id = 'lms:' + key if key else 'aptem:' + apid
        email = email_key(row.get('Email')) or email_key(aptem.get('Email'))
        emails = {email, email_key(aptem.get('Email'))} - {''}
        source_ids = {('lms', key)} if key else set()
        if apid:
            source_ids.add(('aptem', apid))
        for record in pr.get(key, []):
            source_ids.add(('profile', text(record['id'])))
            if record.get('email_normalized'):
                emails.add(email_key(record['email_normalized']))
        for record in mp.get(key, []):
            if text(record.get('legacy_lms_id')):
                source_ids.add(('legacy_lms', text(record['legacy_lms_id'])))
        for record in ac.get(key, []):
            source_ids.add((record['source_system'], text(record['source_learner_id'])))
            emails.update(email_key(record.get(field)) for field in ('source_email', 'canonical_email') if record.get(field))
        coach, coach_email = pick_coach(row.get('Coach_name'), row.get('Coach_email'), row.get('Case_owner'),
                                        aptem.get('OwnerName'), staff_by_name)
        owner_email = email_key(aptem.get('OwnerEmail'))
        if coach == text(aptem.get('OwnerName')) and owner_email and not row.get('Coach_email'):
            coach_email = owner_email
        if owner_email and coach_email and owner_email != coach_email:
            result.field_conflicts.append({'kind': 'coach_disagreement', 'person_id': person_id})
        profile = {
            'learner_email': email, 'learner_name': text(row.get('Username')) or text(aptem.get('FullName')),
            'learner_phone': normalize_phone(aptem.get('Learner Phone')) or normalize_phone(row.get('Phone_number')),
            'coach': coach, 'organisation': text(row.get('Orgnization')) or text(row.get('Employer')) or text(aptem.get('OrganizationName')),
            'programme': text(row.get('Programme')) or text(aptem.get('Program Name')),
            'manager_name': text(aptem.get('ManagerName')) or text(row.get('Line_manager')),
            'manager_email': email_key(aptem.get('ManagerEmail'))}
        status = text(row.get('Programme_status')) or text(aptem.get('Program-Status'))
        person = {'person_id': person_id, 'profile': profile, 'emails': sorted(emails),
                  'source_ids': sorted(source_ids), 'coach_email': coach_email,
                  'manager_phone': normalize_phone(aptem.get('Manager Phone')),
                  'programme_status': status, 'status_source': 'lms' if row.get('Programme_status') else 'aptem',
                  'identifiers': sorted(f'{s}:{v}' for s, v in source_ids) + ['email:' + e for e in sorted(emails)],
                  'provenance': {'status': 'enrolment.Created_users' if row.get('Programme_status') else 'LMS.Aptem_users',
                                 'email': 'enrolment.Created_users' if email_key(row.get('Email')) == email else 'LMS.Aptem_users',
                                 'phone': 'LMS.Aptem_users' if normalize_phone(aptem.get('Learner Phone')) else 'enrolment.Created_users',
                                 'manager': 'LMS.Aptem_users'},
                  'enrolment': row, 'aptem': aptem}
        result.records[person_id] = person
        if program_status(status) == 'break':
            result.on_break = result.on_break | emails
        else:
            result.satisfaction.append(person)
        if email:
            result.cohorts[email] = {'cohort': text(row.get('Cohort')), 'group': text(row.get('Group'))}

    for key, group in eid.items():
        if key in blocked:
            continue
        linked = assignments.get(key, '')
        matching = aid.get(linked, [])
        add(group[0], matching[0] if len(matching) == 1 else None)
        used.add(linked)
    # Claimed/quarantined records must not reappear as a different Aptem-only person.
    claimed = {v for v in assignments.values() if v}
    for key in blocked:
        for row in eid.get(key, []):
            claimed.update(text(row.get(field)) for field in ('aptem_id', 'id_aptem') if text(row.get(field)))
            claimed.update(text(r['ID']) for r in ae.get(email_key(row.get('Email')), []))
    for key, group in aid.items():
        if len(group) > 1:
            conflict('duplicate_aptem_id', aptem=key)
        elif key not in used and key not in claimed:
            add(None, group[0])
    # A profile without enrolment_id can corroborate an Aptem identity by ID + email.
    for record in profiles:
        person = next((p for p in result.records.values() if ('aptem', text(record.get('aptem_id'))) in p['source_ids']
                       and email_key(record.get('email_normalized')) in p['emails']), None)
        if person and not record.get('enrolment_id'):
            pair = ('profile', text(record['id']))
            if pair not in person['source_ids']:
                person['source_ids'].append(pair)
                person['identifiers'].append('profile:' + pair[1])
    mail_claims, id_claims, coaches = defaultdict(list), defaultdict(list), defaultdict(set)
    for person in result.records.values():
        for email in person['emails']:
            mail_claims[email].append(person)
        for pair in person['source_ids']:
            id_claims[pair].append(person)
        if person['profile']['coach'] and person['coach_email']:
            coaches[person['profile']['coach'].casefold()].add(person['coach_email'])
    result.by_source = {k: p[0] for k, p in id_claims.items() if len(p) == 1}
    for email, persons in mail_claims.items():
        if len(persons) != 1:
            result.ambiguous_emails.add(email)
            continue
        person = persons[0]
        result.by_email[email] = person
        main = person['profile']['learner_email']
        if program_status(person['programme_status']) != 'break' and main and len(mail_claims[main]) == 1:
            result[main] = person['profile']
            if email != main:
                result.aliases[email] = main
            if program_status(person['programme_status']) == 'active':
                result.active = result.active | {email}
    result.coach_emails = {k: next(iter(v)) for k, v in coaches.items() if len(v) == 1}
    manager_phones = defaultdict(set)
    for person in result.records.values():
        if person['profile']['manager_email'] and person['manager_phone']:
            manager_phones[person['profile']['manager_email']].add(person['manager_phone'])
    # Employer feedback calls (learner_satisfaction.employer_contacts): one agreed number per line manager.
    result.manager_phones = {k: next(iter(v)) for k, v in manager_phones.items() if len(v) == 1}
    # A contradictory snapshot cannot authoritatively retire existing cases.
    result.sources_complete = not conflicts and not result.ambiguous_emails
    return result
