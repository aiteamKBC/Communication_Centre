"""Phone numbers a director sets for a learner or a line manager (employer), used instead of the LMS or Aptem number.

The LMS and Aptem stay as they are: the number lives in ``callcenter_phone_number_change`` and is laid over the
learner directory every time it loads (``apply``, from sources), so every call, the employer check, the caller
directory for incoming calls and the cases the cycle refreshes all use it. Saving also puts it on the person's open
cases straight away (``set_number``), with an entry in each case's timeline.

Every change is a new row: the latest for a person is in force, and an empty number puts the LMS/Aptem one back.
Until docs/callcentre-port/phone_numbers.sql runs, nothing is laid over and the card says it is not set up.
"""
import logging

from django.db import DatabaseError, ProgrammingError, transaction
from django.utils import timezone

from .db import DB
from .models import CaseTicket, PhoneNumberChange, TicketEvent
from .rules import email_key, normalize_phone

logger = logging.getLogger(__name__)
NOT_SET_UP = 'Phone numbers are not set up yet. Run docs/callcentre-port/phone_numbers.sql on the call-centre database.'
ROLES = {'learner': 'Learner', 'employer': 'Line manager'}
EMPLOYER_CASE = 'employer_feedback'
# A requested call keeps the number the manager typed in (sources.refresh_contacts).
KEEPS_ITS_NUMBER = ('manual',)


def latest():
    """{(role, email): the change in force}, newest per person; None while the table is missing."""
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            found = {}
            for change in PhoneNumberChange.objects.order_by('changed_at', 'id'):
                found[(change.role, email_key(change.email))] = change
            return found
    except ProgrammingError:
        return None


def numbers():
    """{(role, email): number} for the people with a number set now (empty while not set up)."""
    return {key: change.phone for key, change in (latest() or {}).items() if change.phone}


def apply(people, chosen=None):
    """Lay the directors' numbers over a learner directory (legacy ``learners.Learners`` or unified
    ``identity.Directory``), in place. Returns it."""
    if chosen is None:
        try:
            chosen = numbers()
        except DatabaseError:
            # The numbers cannot be read now: the directory keeps the LMS/Aptem numbers rather than fail to load.
            logger.exception('Phone numbers unavailable; the LMS/Aptem numbers are used.')
            return people
    if not chosen:
        return people
    learners = {email: phone for (role, email), phone in chosen.items() if role == 'learner'}
    managers = {email: phone for (role, email), phone in chosen.items() if role == 'employer'}
    aliases = getattr(people, 'aliases', {})
    # A number set under any of a learner's emails is theirs.
    mains = {aliases.get(email, email): phone for email, phone in learners.items()}
    for profile in list(people.values()) + [person['profile'] for person in getattr(people, 'satisfaction', [])]:
        phone = mains.get(email_key(profile.get('learner_email')))
        if phone:
            profile['learner_phone'] = phone
    for person in getattr(people, 'records', {}).values():
        phone = next((learners[email] for email in person['emails'] if email in learners), None)
        if phone:
            person['profile']['learner_phone'] = phone
        manager = email_key(person['profile'].get('manager_email'))
        if manager in managers:
            person['manager_phone'] = managers[manager]
    if hasattr(people, 'manager_phones'):
        people.manager_phones.update(managers)
    return people


def open_cases(role, emails):
    """The person's open cases that carry this number."""
    cases = CaseTicket.objects.filter(archived=False, learner_email__in=list(emails)).exclude(status='resolved')
    if role == 'employer':
        return cases.filter(source_type=EMPLOYER_CASE)
    return cases.exclude(source_type__in=(EMPLOYER_CASE, *KEEPS_ITS_NUMBER))


def set_number(role, email, emails, name, phone, current, note, actor):
    """Use ``phone`` for this person from now on, or the LMS/Aptem number again when it is empty. ``emails`` are all the
    person's emails (their cases may be under any); ``current`` is the number the call centre has for them now.
    Returns (the change, how many open cases changed)."""
    if role not in ROLES:
        raise ValueError('Choose a learner or a line manager.')
    email = email_key(email)
    if not email:
        raise ValueError('Choose a person from the list.')
    text = str(phone or '').strip()
    number = normalize_phone(text)
    if text and not number:
        raise ValueError('Enter a valid phone number, e.g. 07700 900123 or +44 7700 900123.')
    note = str(note or '').strip()
    if len(note) > 1000:
        raise ValueError('Keep the note under 1,000 characters.')
    found = latest()
    if found is None:
        raise ValueError(NOT_SET_UP)
    in_force = found.get((role, email))
    if not text and not (in_force and in_force.phone):
        raise ValueError('Enter the new number.')
    if text and number == normalize_phone(current):
        raise ValueError('That is already their number.')
    # The LMS/Aptem number: while one set here is in force, the directory shows that one instead.
    source = in_force.previous_phone if in_force and in_force.phone else normalize_phone(current)
    with transaction.atomic(using=DB):
        change = PhoneNumberChange.objects.create(
            role=role, email=email, name=str(name or '').strip()[:255], phone=number,
            previous_phone=source, note=note, changed_by=actor)
        # The open cases take the new number now, or the LMS/Aptem one again when it is put back.
        target, changed = number or source, 0
        if target:
            now = timezone.now()
            for ticket in open_cases(role, {email, *map(email_key, emails)}).select_for_update():
                if normalize_phone(ticket.learner_phone) == target:
                    continue
                TicketEvent.objects.create(ticket=ticket, kind='phone_changed', actor=actor, data={
                    'previous': ticket.learner_phone, 'phone': target, 'role': role, 'note': note, 'restored': not number})
                CaseTicket.objects.filter(pk=ticket.pk).update(learner_phone=target, last_actor=actor, last_action_at=now)
                changed += 1
    # Every page's directory reloads with the new number (sources.cached_directory).
    from .sources import reload_directory
    reload_directory()
    return change, changed


def change_json(change):
    return {'id': change.pk, 'role': change.role, 'role_label': ROLES.get(change.role, change.role), 'email': change.email,
            'name': change.name, 'phone': change.phone, 'previous_phone': change.previous_phone, 'note': change.note,
            'changed_by': change.changed_by, 'changed_at': change.changed_at}


def listing(people):
    """The card: everyone whose number can be changed, the numbers set now, and the last changes."""
    found = latest()
    if found is None:
        return {'set_up': False, 'not_set_up': NOT_SET_UP, 'roles': ROLES, 'people': [], 'current': [], 'history': []}
    choices = [{'role': 'learner', 'email': p['learner_email'], 'name': p['learner_name'], 'phone': p['learner_phone'],
                'detail': ' · '.join(filter(None, [p['programme'], p['organisation']]))}
               for p in people.values() if p.get('learner_email')]
    managers = {}
    for profile in people.values():
        manager = email_key(profile.get('manager_email'))
        if manager and manager not in managers:
            managers[manager] = {'role': 'employer', 'email': manager, 'name': profile.get('manager_name') or manager,
                                 'phone': people.manager_phones.get(manager, '') if hasattr(people, 'manager_phones') else '',
                                 'detail': profile.get('organisation') or ''}
    choices.extend(managers.values())
    choices.sort(key=lambda item: (item['name'].lower(), item['email']))
    history = PhoneNumberChange.objects.order_by('-changed_at', '-id')[:50]
    return {'set_up': True, 'not_set_up': '', 'roles': ROLES, 'people': choices,
            'current': [change_json(change) for change in sorted(found.values(), key=lambda c: c.name.lower()) if change.phone],
            'history': [change_json(change) for change in history]}
