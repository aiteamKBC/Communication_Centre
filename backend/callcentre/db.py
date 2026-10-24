"""Database aliases for the call centre.

The call-centre tables, Zoom tables, ``coaches_data``, ``kbc_attendance`` and the
lecture tables live in the same database as ``auth_user`` (``login_db``). Aptem is a
separate read-only source; it gets its own alias so CC's existing ``aptem_db`` routing
for ``/api/aptem/*`` is not changed. The LMS database (``enrolment."Created_users"``) is the
read-only master learner list.
"""

DB = 'login_db'
APTEM = 'callcentre_aptem'
LMS = 'callcentre_lms'
# New Era (read-only): the coaches' Outlook meetings, where the next day's MCMs and progress reviews come from.
NEW_ERA = 'callcentre_newera'
