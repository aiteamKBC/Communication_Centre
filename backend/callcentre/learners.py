"""The call centre's learner directory, merged from the LMS and Aptem at read time.

The LMS (``enrolment."Created_users"``) is the master list: new learners, test learners and
learners who never reach Aptem all come from it. Aptem (``aptem_auto_extracting``) fills the
gaps and supplies phone numbers and line managers. Neither database is written; when one
source is unavailable the directory is built from the other.

Field rules: name, programme and organisation come from the LMS first; the learner's phone comes
from Aptem first; line-manager details come from Aptem. The coach follows ``pick_coach``, from
``enrolment`` only (never ``"Learner".learners``) with Aptem as the last resort.

Only learners confirmed active are included in the calling directory. A non-active
status in either source takes precedence over Active in the other source.
"""
import re
from functools import cached_property

from django.conf import settings

from .rules import email_key, normalize_phone

# LMS rows that were folded into another row; the surviving row carries the learner.
SKIPPED_LMS_STATUSES = {'duplicate - merged'}
# The LMS's own grouping of programme statuses (coach_api.views.normalize_program_status).
BREAK_STATUSES = {'break', 'onbreak', 'onabreak', 'onmaternitybreak', 'onillnessbreak', 'onotherbreak'}
ACTIVE_STATUSES = {'active', 'delivery'}   # Delivery: active, still on the old LMS (not yet invited)


# Test and QA accounts in the LMS: named with the word "Test" or "QA" (every such learner is one; no real name has the
# word), or on a reserved test domain. Kept off every call list and given no reminders; their cases stay as they are.
TEST_NAME = re.compile(r'\b(test|qa)\b', re.IGNORECASE)
TEST_DOMAINS = {'example.test', 'example.invalid'}


def is_test_learner(profile):
    email = email_key(profile.get('learner_email'))
    return bool(TEST_NAME.search(str(profile.get('learner_name') or '')) or email.rsplit('@', 1)[-1] in TEST_DOMAINS)


def test_emails(people):
    """Every email (main and other) of the directory's test learners and of the accounts confirmed as tests
    (``CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS``)."""
    found = {email_key(profile.get('learner_email')) for profile in people.values() if is_test_learner(profile)}
    confirmed = set(getattr(settings, 'CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS', []))
    for person in getattr(people, 'satisfaction', None) or []:
        if confirmed.intersection(person.get('identifiers', [])):
            found |= {identifier[6:] for identifier in person['identifiers'] if identifier.startswith('email:')}
    aliases = getattr(people, 'aliases', None) or {}
    return frozenset((found | {alias for alias, main in aliases.items() if main in found}) - {''})


def program_status(raw):
    """'break', 'active', 'withdrawn' or the status itself, grouped exactly as the LMS groups them."""
    normalized = str(raw or '').strip().lower().replace(' ', '')
    if normalized in BREAK_STATUSES:
        return 'break'
    if normalized in ACTIVE_STATUSES:
        return 'active'
    return normalized


def calling_status(lms_status, aptem_status):
    """Retain source provenance; a known non-active status wins over Active."""
    supplied = [(str(value).strip(), source) for value, source in (
        (lms_status or '', 'lms'), (aptem_status or '', 'aptem')) if str(value).strip()]
    return next((item for item in supplied if program_status(item[0]) != 'active'),
                supplied[0] if supplied else ('', ''))


# Owner names that are not a coach: a learner showing one of these needs the next source.
PLACEHOLDER_COACHES = {'default owner'}

# A learner withdrawn in the LMS is Withdrawn here too, even while Programme_status still says Active: their
# Created_users " Status" (the column name starts with a space) or their learner record's lifecycle_status
# ("Learner".learners, as on the learner page, linked by enrolment_id) says withdrawn. Aptem then drops them from its
# active extract, so no other source says so.
LMS_LEARNERS_SQL = '''SELECT id, "Username", "Email", "Phone_number", aptem_id, "Coach_name", "Coach_email",
    "Case_owner", "Programme",
    CASE WHEN lower(trim(u." Status")) = 'withdrawn'
              OR EXISTS (SELECT 1 FROM "Learner".learners l
                         WHERE l.enrolment_id = u.id AND lower(trim(l.lifecycle_status)) = 'withdrawn')
         THEN 'Withdrawn' ELSE "Programme_status" END AS "Programme_status",
    "Orgnization", "Employer", "Line_manager", "Cohort", "Group"
    FROM enrolment."Created_users" u'''
STAFF_SQL = 'SELECT "Username", "Email" FROM enrolment."Staff_users"'


def staff_emails(staff_rows):
    """Staff name -> email, only where the name is unique (as the LMS's case_owner_coach)."""
    found = {}
    for row in staff_rows:
        name = ' '.join(_text(row.get('Username')).split()).casefold()
        if name:
            found.setdefault(name, set()).add(email_key(row.get('Email')))
    return {name: next(iter(emails)) for name, emails in found.items() if len(emails) == 1 and all(emails)}


def pick_coach(coach_name, coach_email, case_owner, aptem_owner, staff):
    """(name, email) of the learner's coach: Coach_name, else Case_owner, else Aptem's owner.

    Blank and placeholder names ("Default Owner") fall through to the next source. The email is the
    Created_users Coach_email for Coach_name, otherwise the unique staff account with that name.
    """
    for name, email in ((coach_name, coach_email), (case_owner, ''), (aptem_owner, '')):
        name = ' '.join(_text(name).split())
        if name and name.casefold() not in PLACEHOLDER_COACHES:
            return name, email_key(email) or staff.get(name.casefold(), '')
    return '', ''


APTEM_LEARNERS_SQL = '''SELECT "ID", "FullName", "Email", "Learner Phone", "OwnerName",
    "OrganizationName", "Program Name", "ManagerName", "ManagerEmail", "Manager Phone", "Program-Status"
    FROM public.aptem_auto_extracting'''


class Learners(dict):
    """Profiles keyed by the learner's main email; any other email the learner has also resolves.

    Iteration (``values()``/``items()``) yields each learner once, so phone directories and
    survey grouping never double count; ``in`` and ``[]`` accept every known email so source
    rows recorded under the Aptem email still find the learner. ``cohorts`` holds each LMS
    learner's cohort and group, kept apart from the profile because profiles are copied onto cases;
    ``coach_emails`` maps each coach name (casefolded) to its email where only one email is known;
    ``active`` holds every email of confirmed Active/Delivery learners, with no
    conflicting non-active status in either source.
    ``manager_phones`` maps each line-manager (employer) email to the one phone Aptem gives them,
    left out when their rows disagree.
    """

    def __init__(self, profiles, aliases, cohorts=None, on_break=frozenset(), coach_emails=None, active=frozenset(),
                 satisfaction=None, manager_phones=None):
        super().__init__(profiles)
        self.aliases = aliases
        self.cohorts = cohorts or {}
        self.on_break = on_break
        self.coach_emails = coach_emails or {}
        self.active = active
        self.satisfaction = satisfaction or []
        self.manager_phones = manager_phones or {}
        self.sources_complete = True

    def __contains__(self, key):
        return dict.__contains__(self, key) or key in self.aliases

    def __missing__(self, key):
        return dict.__getitem__(self, self.aliases[key])

    def get(self, key, default=None):
        return self[key] if key in self else default

    @cached_property
    def managers(self):
        """Line-manager (employer) email -> the main emails of their learners in the directory."""
        found = {}
        for profile in self.values():
            if profile['manager_email']:
                found.setdefault(profile['manager_email'], []).append(profile['learner_email'])
        return found


def _text(value):
    return str(value or '').strip()


def _unique_by_email(rows, email_field):
    """Index rows by email, dropping every email that appears more than once (ambiguous)."""
    result, ambiguous = {}, set()
    for row in rows:
        email = email_key(row.get(email_field))
        if not email:
            continue
        if email in result:
            ambiguous.add(email)
        result[email] = row
    for email in ambiguous:
        result.pop(email)
    return result


def _aptem_profile(row):
    return {
        'learner_email': email_key(row['Email']), 'learner_name': _text(row['FullName']),
        'learner_phone': normalize_phone(row['Learner Phone']), 'coach': _text(row['OwnerName']),
        'organisation': _text(row['OrganizationName']), 'programme': _text(row['Program Name']),
        'manager_name': _text(row['ManagerName']), 'manager_email': email_key(row['ManagerEmail']),
    }


def satisfaction_person(profile, lms=None, aptem=None):
    """Source identity and raw status live outside the fields copied onto cases."""
    lms, aptem = lms or {}, aptem or {}
    identifiers = []
    aptem_id = aptem.get('ID') if aptem.get('ID') is not None else lms.get('aptem_id')
    if _text(aptem_id):
        identifiers.append('aptem:' + _text(aptem_id))
    if lms.get('id') is not None:
        identifiers.append('lms:' + str(lms['id']))
    identifiers.extend('email:' + email for email in sorted({
        email_key(profile.get('learner_email')), email_key(aptem.get('Email'))} - {''}))
    status, source = calling_status(lms.get('Programme_status'), aptem.get('Program-Status'))
    return {'profile': profile, 'identifiers': identifiers,
            'programme_status': status, 'status_source': source}


def merge(lms_rows, aptem_rows, staff_rows=()):
    """Build the directory. Either input may be empty when its source is unavailable."""
    staff = staff_emails(staff_rows)
    coaches = {}

    def coach(*sources):
        name, email = pick_coach(*sources, staff)
        if name and email:
            coaches.setdefault(name.casefold(), set()).add(email)
        return name

    aptem_by_email = _unique_by_email(aptem_rows, 'Email')
    aptem_ids = {}
    for row in aptem_rows:
        if row.get('ID') is not None:
            aptem_ids.setdefault(_text(row['ID']), []).append(row)
    aptem_by_id = {key: rows[0] for key, rows in aptem_ids.items() if len(rows) == 1}
    lms_by_email = _unique_by_email(
        [row for row in lms_rows if _text(row.get('Programme_status')).lower() not in SKIPPED_LMS_STATUSES], 'Email')

    profiles, aliases, used, cohorts, on_break = {}, {}, set(), {}, set()
    satisfaction = []
    for email, row in lms_by_email.items():
        aptem = aptem_by_id.get(_text(row.get('aptem_id'))) or aptem_by_email.get(email)
        status, _ = calling_status(row.get('Programme_status'), (aptem or {}).get('Program-Status'))
        if program_status(status) == 'break':
            on_break.update(({email, email_key(aptem['Email'])} if aptem else {email}) - {''})
            continue
        cohorts[email] = {'cohort': _text(row.get('Cohort')), 'group': _text(row.get('Group'))}
        fallback = _aptem_profile(aptem) if aptem else {}
        profiles[email] = {
            'learner_email': email,
            'learner_name': _text(row.get('Username')) or fallback.get('learner_name', ''),
            'learner_phone': fallback.get('learner_phone') or normalize_phone(row.get('Phone_number')),
            'coach': coach(row.get('Coach_name'), row.get('Coach_email'), row.get('Case_owner'), fallback.get('coach')),
            'organisation': _text(row.get('Orgnization')) or _text(row.get('Employer')) or fallback.get('organisation', ''),
            'programme': _text(row.get('Programme')) or fallback.get('programme', ''),
            'manager_name': fallback.get('manager_name') or _text(row.get('Line_manager')),
            'manager_email': fallback.get('manager_email', ''),
        }
        satisfaction.append(satisfaction_person(profiles[email], row, aptem))
        if aptem:
            aptem_email = email_key(aptem['Email'])
            used.add(aptem_email)
            if aptem_email and aptem_email != email:
                aliases[aptem_email] = email

    # Aptem-only learners still need a positive Active status.
    for email, row in aptem_by_email.items():
        if email not in used and email not in profiles and email not in aliases and email not in on_break:
            profiles[email] = {**_aptem_profile(row), 'coach': coach('', '', '', row['OwnerName'])}
            satisfaction.append(satisfaction_person(profiles[email], aptem=row))
            if program_status(row.get('Program-Status')) == 'break':
                on_break.add(email)
    # Contacts without email still have a stable source identity; never invent an email.
    for row in lms_rows:
        if email_key(row.get('Email')) or row.get('id') is None:
            continue
        matches = aptem_ids.get(_text(row.get('aptem_id')), [])
        aptem = matches[0] if len(matches) == 1 else None
        profile = _aptem_profile(aptem) if aptem else {key: '' for key in (
            'learner_email', 'learner_name', 'learner_phone', 'coach', 'organisation', 'programme', 'manager_name', 'manager_email')}
        profile.update(learner_name=_text(row.get('Username')) or profile['learner_name'],
                       learner_phone=profile['learner_phone'] or normalize_phone(row.get('Phone_number')),
                       coach=coach(row.get('Coach_name'), row.get('Coach_email'), row.get('Case_owner'), profile['coach']),
                       programme=_text(row.get('Programme')) or profile['programme'],
                       organisation=_text(row.get('Orgnization')) or profile['organisation'])
        person = satisfaction_person(profile, row, aptem)
        matching = [item for item in satisfaction if set(item['identifiers']) & set(person['identifiers'])]
        if len(matching) > 1:
            continue
        for item in matching:
            satisfaction.remove(item)
        satisfaction.append(person)
    known_ids = {identity for item in satisfaction for identity in item['identifiers']}
    for row in aptem_rows:
        if email_key(row.get('Email')) or row.get('ID') is None:
            continue
        person = satisfaction_person(_aptem_profile(row), aptem=row)
        if not set(person['identifiers']) & known_ids and len(aptem_ids[_text(row['ID'])]) == 1:
            satisfaction.append(person)
            known_ids.update(person['identifiers'])
    manager_phones = {}
    for row in aptem_rows:
        manager, phone = email_key(row.get('ManagerEmail')), normalize_phone(row.get('Manager Phone'))
        if manager and phone:
            manager_phones.setdefault(manager, set()).add(phone)
    # Keep inactive source identities in satisfaction for reconciliation, but never
    # expose their profiles to call requests, allocations, reminders or risk imports.
    active = {identifier[6:] for person in satisfaction if program_status(person['programme_status']) == 'active'
              for identifier in person['identifiers'] if identifier.startswith('email:')} - on_break
    profiles = {email: profile for email, profile in profiles.items() if email in active}
    aliases = {alias: email for alias, email in aliases.items()
               if alias not in profiles and alias in active and email in profiles}
    active &= set(profiles) | set(aliases)
    return Learners(profiles, aliases, cohorts,
                    frozenset(on_break), {name: next(iter(emails)) for name, emails in coaches.items() if len(emails) == 1},
                    frozenset(active), satisfaction=satisfaction,
                    manager_phones={manager: next(iter(phones)) for manager, phones in manager_phones.items() if len(phones) == 1})
