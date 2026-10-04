"""The call centre's learner directory, merged from the LMS and Aptem at read time.

The LMS (``enrolment."Created_users"``) is the master list: new learners, test learners and
learners who never reach Aptem all come from it. Aptem (``aptem_auto_extracting``) fills the
gaps and supplies phone numbers and line managers. Neither database is written; when one
source is unavailable the directory is built from the other.

Field rules: coach, name, programme and organisation come from the LMS first; the learner's
phone comes from Aptem first; line-manager details come from Aptem.

Learners the LMS has on a break in learning are left out entirely (Aptem cannot add them back);
their emails are kept in ``Learners.on_break`` so their open cases can be hidden too.
"""
from .rules import email_key, normalize_phone

# LMS rows that were folded into another row; the surviving row carries the learner.
SKIPPED_LMS_STATUSES = {'duplicate - merged'}
# The LMS's own grouping of programme statuses (coach_api.views.normalize_program_status).
BREAK_STATUSES = {'break', 'onbreak', 'onabreak', 'onmaternitybreak', 'onillnessbreak', 'onotherbreak'}
ACTIVE_STATUSES = {'active', 'delivery'}   # Delivery: active, still on the old LMS (not yet invited)


def program_status(raw):
    """'break', 'active', 'withdrawn' or the status itself, grouped exactly as the LMS groups them."""
    normalized = str(raw or '').strip().lower().replace(' ', '')
    if normalized in BREAK_STATUSES:
        return 'break'
    if normalized in ACTIVE_STATUSES:
        return 'active'
    return normalized

LMS_LEARNERS_SQL = '''SELECT id, "Username", "Email", "Phone_number", aptem_id, "Coach_name",
    "Programme", "Programme_status", "Orgnization", "Employer", "Line_manager", "Cohort", "Group"
    FROM enrolment."Created_users"'''
APTEM_LEARNERS_SQL = '''SELECT "ID", "FullName", "Email", "Learner Phone", "OwnerName",
    "OrganizationName", "Program Name", "ManagerName", "ManagerEmail", "Program-Status"
    FROM public.aptem_auto_extracting'''


class Learners(dict):
    """Profiles keyed by the learner's main email; any other email the learner has also resolves.

    Iteration (``values()``/``items()``) yields each learner once, so phone directories and
    survey grouping never double count; ``in`` and ``[]`` accept every known email so source
    rows recorded under the Aptem email still find the learner. ``cohorts`` holds each LMS
    learner's cohort and group, kept apart from the profile because profiles are copied onto cases.
    """

    def __init__(self, profiles, aliases, cohorts=None, on_break=frozenset(), satisfaction=None):
        super().__init__(profiles)
        self.aliases = aliases
        self.cohorts = cohorts or {}
        self.on_break = on_break
        self.satisfaction = satisfaction or []
        self.sources_complete = True

    def __contains__(self, key):
        return dict.__contains__(self, key) or key in self.aliases

    def __missing__(self, key):
        return dict.__getitem__(self, self.aliases[key])


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
    """Keep source identity/status outside the fields copied onto CaseTicket."""
    lms, aptem = lms or {}, aptem or {}
    identifiers = []
    aptem_id = aptem.get('ID') if aptem.get('ID') is not None else lms.get('aptem_id')
    if _text(aptem_id):
        identifiers.append('aptem:' + _text(aptem_id))
    if lms.get('id') is not None:
        identifiers.append('lms:' + str(lms['id']))
    identifiers.extend('email:' + email for email in sorted({
        email_key(profile.get('learner_email')), email_key(aptem.get('Email'))} - {''}))
    return {'profile': profile, 'identifiers': identifiers,
            # Preserve the current LMS-first directory policy. Delivery is NOT silently Active here.
            'programme_status': _text(lms.get('Programme_status')) or _text(aptem.get('Program-Status')),
            'status_source': 'lms' if _text(lms.get('Programme_status')) else 'aptem'}


def merge(lms_rows, aptem_rows):
    """Build the directory. Either input may be empty when its source is unavailable."""
    aptem_by_email = _unique_by_email(aptem_rows, 'Email')
    aptem_by_id = {str(row['ID']): row for row in aptem_by_email.values() if row.get('ID') is not None}
    lms_by_email = _unique_by_email(
        [row for row in lms_rows if _text(row.get('Programme_status')).lower() not in SKIPPED_LMS_STATUSES], 'Email')

    profiles, aliases, used, cohorts, on_break, satisfaction = {}, {}, set(), {}, set(), []
    for email, row in lms_by_email.items():
        if program_status(row.get('Programme_status')) == 'break':
            aptem = aptem_by_id.get(_text(row.get('aptem_id'))) or aptem_by_email.get(email)
            on_break.update({email, email_key(aptem['Email'])} if aptem else {email})
            continue
        cohorts[email] = {'cohort': _text(row.get('Cohort')), 'group': _text(row.get('Group'))}
        aptem = aptem_by_id.get(_text(row.get('aptem_id'))) or aptem_by_email.get(email)
        fallback = _aptem_profile(aptem) if aptem else {}
        profiles[email] = {
            'learner_email': email,
            'learner_name': _text(row.get('Username')) or fallback.get('learner_name', ''),
            'learner_phone': fallback.get('learner_phone') or normalize_phone(row.get('Phone_number')),
            'coach': _text(row.get('Coach_name')) or fallback.get('coach', ''),
            'organisation': _text(row.get('Orgnization')) or _text(row.get('Employer')) or fallback.get('organisation', ''),
            'programme': _text(row.get('Programme')) or fallback.get('programme', ''),
            'manager_name': fallback.get('manager_name') or _text(row.get('Line_manager')),
            'manager_email': fallback.get('manager_email', ''),
        }
        satisfaction.append(satisfaction_person(profiles[email], row, aptem))
        if aptem:
            aptem_email = email_key(aptem['Email'])
            used.add(aptem_email)
            if aptem_email != email:
                aliases[aptem_email] = email

    # Aptem learners the LMS does not have yet (or no longer lists) keep their cases.
    for email, row in aptem_by_email.items():
        if email not in used and email not in profiles and email not in aliases and email not in on_break:
            profiles[email] = _aptem_profile(row)
            satisfaction.append(satisfaction_person(profiles[email], aptem=row))
    # Missing email is not a reason to omit a learner from satisfaction follow-up.
    # Do not fabricate a deliverable email; stable source IDs identify these contacts.
    known_ids = {identity for item in satisfaction for identity in item['identifiers']}
    aptem_ids = {}
    for row in aptem_rows:
        aptem_ids.setdefault(_text(row.get('ID')), []).append(row)
    for row in lms_rows:
        if email_key(row.get('Email')) or row.get('id') is None:
            continue
        matches = aptem_ids.get(_text(row.get('aptem_id')), [])
        aptem = matches[0] if len(matches) == 1 else None
        profile = _aptem_profile(aptem) if aptem else {key: '' for key in (
            'learner_email', 'learner_name', 'learner_phone', 'coach', 'organisation', 'programme', 'manager_name', 'manager_email')}
        profile.update(learner_name=_text(row.get('Username')) or profile['learner_name'],
                       learner_phone=profile['learner_phone'] or normalize_phone(row.get('Phone_number')),
                       coach=_text(row.get('Coach_name')) or profile['coach'],
                       programme=_text(row.get('Programme')) or profile['programme'],
                       organisation=_text(row.get('Orgnization')) or profile['organisation'])
        person = satisfaction_person(profile, row, aptem)
        # Replace an Aptem-only candidate with its LMS-enriched identity/status.
        matching = [item for item in satisfaction if set(item['identifiers']) & set(person['identifiers'])]
        if len(matching) > 1:
            continue
        for item in matching:
            satisfaction.remove(item)
        satisfaction.append(person)
        known_ids.update(person['identifiers'])
    for row in aptem_rows:
        if email_key(row.get('Email')) or row.get('ID') is None:
            continue
        person = satisfaction_person(_aptem_profile(row), aptem=row)
        if not set(person['identifiers']) & known_ids and len(aptem_ids[_text(row['ID'])]) == 1:
            satisfaction.append(person)
            known_ids.update(person['identifiers'])
    return Learners(profiles, {alias: email for alias, email in aliases.items() if alias not in profiles}, cohorts,
                    frozenset(on_break), satisfaction)
