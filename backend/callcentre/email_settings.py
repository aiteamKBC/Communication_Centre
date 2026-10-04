"""Email settings the director manages from the Settings tab (automatic reminders and sending mode).

The values live in ``callcenter_setting`` (key ``email``; see docs/callcentre-port/settings.sql) and every save is
kept in ``callcenter_setting_history`` with its reason. Until a director saves, or while the table is missing, the
``.env`` defaults in settings.py apply — reminders off and dry run. The Microsoft 365 credentials are never stored
here: they stay in ``.env`` and the tab only shows whether they are set.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, ProgrammingError, transaction

from .db import DB
from .models import Setting, SettingHistory
from .services import Conflict

KEY = 'email'
NOT_SET_UP = 'Settings are not set up yet. Run docs/callcentre-port/settings.sql on the call-centre database.'
# Case types a reminder can be sent for, in the order the tab lists them.
REMINDER_TYPES = {
    'attendance': 'Missed lecture', 'pr': 'Progress review overdue', 'mcm': 'Monthly coaching overdue',
    'pr_missed': 'Missed progress review', 'mcm_missed': 'Missed monthly coaching', 'signature': 'Missing signature',
    'satisfaction': 'Employer feedback survey', 'epa': 'EPA preparation', 'otj': 'Off-the-job hours',
    'reminder': 'Tomorrow’s appointment',
}
MAX_DAY = 60


def defaults():
    """The .env values (settings.py), used until a director saves the tab."""
    return {
        'reminders_enabled': bool(settings.CALLCENTRE_REMINDERS_ENABLED),
        'email_mode': settings.CALLCENTRE_EMAIL_MODE if settings.CALLCENTRE_EMAIL_MODE in ('dry_run', 'live') else 'dry_run',
        'reminder_days': sorted(settings.CALLCENTRE_REMINDER_DAYS),
        'escalate_day': settings.CALLCENTRE_REMINDER_ESCALATE_DAY,
        'reminder_types': [key for key in REMINDER_TYPES if key in settings.CALLCENTRE_REMINDER_TYPES],
        'daily_cap': settings.CALLCENTRE_EMAIL_DAILY_CAP,
        'escalation_cc': str(settings.CALLCENTRE_ESCALATION_EMAIL or '').strip().lower(),
    }


def stored():
    """(values, revision, set_up). Missing table or no saved row: the defaults, revision 0."""
    try:
        # The savepoint keeps a missing table from breaking the caller's transaction.
        with transaction.atomic(using=DB):
            row = Setting.objects.filter(key=KEY).first()
    except ProgrammingError:
        return defaults(), 0, False
    if row is None or not isinstance(row.value, dict):
        return defaults(), 0, True
    return {**defaults(), **row.value}, row.revision, True


def current():
    """The email settings in force now."""
    return stored()[0]


def clean(data):
    """Validated settings from the tab; raises ValueError with what to fix."""
    if not isinstance(data, dict):
        raise ValueError('Settings must be an object.')
    mode = data.get('email_mode')
    if mode not in ('dry_run', 'live'):
        raise ValueError('Choose whether emails are recorded only (dry run) or really sent (live).')
    days = data.get('reminder_days')
    if (not isinstance(days, list) or not 1 <= len(days) <= 10
            or any(type(day) is not int or not 0 <= day <= MAX_DAY for day in days)):
        raise ValueError(f'Reminder days: between 1 and 10 whole numbers from 0 to {MAX_DAY}.')
    escalate = data.get('escalate_day')
    if type(escalate) is not int or not 0 <= escalate <= MAX_DAY:
        raise ValueError(f'Manager escalation day: a whole number from 0 (never) to {MAX_DAY}.')
    types = data.get('reminder_types')
    if not isinstance(types, list) or any(t not in REMINDER_TYPES for t in types):
        raise ValueError('Choose the reminder case types from the list.')
    cap = data.get('daily_cap')
    if type(cap) is not int or not 0 <= cap <= 10:
        raise ValueError('Daily limit per learner: a whole number from 0 to 10.')
    cc = str(data.get('escalation_cc') or '').strip().lower()
    if cc:
        try:
            validate_email(cc)
        except ValidationError:
            raise ValueError('The manager copy address is not a valid email.') from None
    if type(data.get('reminders_enabled')) is not bool:
        raise ValueError('Choose whether automatic reminders are on or off.')
    return {'reminders_enabled': data['reminders_enabled'], 'email_mode': mode, 'reminder_days': sorted(set(days)),
            'escalate_day': escalate, 'reminder_types': [key for key in REMINDER_TYPES if key in types],
            'daily_cap': cap, 'escalation_cc': cc}


def save(data, revision, reason, actor, can_send):
    """Store the director's settings if nobody changed them since ``revision``; returns the new revision."""
    values = clean(data)
    reason = str(reason or '').strip()
    if not 5 <= len(reason) <= 1000:
        raise ValueError('Say why you are changing the settings (5 to 1,000 characters).')
    if values['email_mode'] == 'live' and not can_send:
        raise ValueError('Live sending needs the Microsoft 365 mail settings in .env first.')
    try:
        with transaction.atomic(using=DB):
            row = Setting.objects.select_for_update().filter(key=KEY).first()
            if (row.revision if row else 0) != revision:
                raise Conflict('Someone changed the settings since you opened them. Reload and check again.')
            previous = {**defaults(), **row.value} if row else None
            if row:
                row.value, row.revision, row.updated_by = values, row.revision + 1, actor
                row.save()
            else:
                row = Setting.objects.create(key=KEY, value=values, updated_by=actor)
            SettingHistory.objects.create(key=KEY, previous=previous, value=values, reason=reason, actor=actor)
            return row.revision
    except IntegrityError:
        raise Conflict('Someone changed the settings since you opened them. Reload and check again.') from None
    except ProgrammingError:
        raise ValueError(NOT_SET_UP) from None


def history(limit=20):
    try:
        with transaction.atomic(using=DB):
            return list(SettingHistory.objects.filter(key=KEY).order_by('-created_at', '-id').values(
                'id', 'previous', 'value', 'reason', 'actor', 'created_at')[:limit])
    except ProgrammingError:
        return []
