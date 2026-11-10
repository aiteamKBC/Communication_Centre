"""Read-only, batched lecture schedule details for existing and newly created cases."""
import logging
from collections import defaultdict
from datetime import date

from django.db import DatabaseError

from .db import DB
from .sources import rows

logger = logging.getLogger(__name__)


def add_lecture_times(cases):
    """Only an unambiguous, non-cancelled date/module match can supply a time.

    Attendance records contain a date and module, but no lecture ID or clock time.
    Do not guess between multiple sessions or substitute ticket/record creation time.
    This enriches response dictionaries only; existing case progress is never written.
    """
    lectures = [case['missed_lecture'] for case in cases if case.get('missed_lecture')]
    dated = [lecture for lecture in lectures if lecture['date'] and lecture['module']]
    if not dated:
        return
    try:
        scheduled = rows(DB, '''SELECT session_date, module, subject, scheduled_start, scheduled_end
            FROM public.lecture_sessions
            WHERE session_date = ANY(%s) AND trim(module) = ANY(%s)
                AND is_cancelled IS NOT TRUE''',
            [sorted({date.fromisoformat(str(lecture['date'])) for lecture in dated}),
             sorted({lecture['module'] for lecture in dated})])
    except (DatabaseError, RuntimeError):
        logger.warning('Lecture schedule unavailable; displaying attendance dates only.')
        for lecture in dated:
            lecture['time_status'] = 'unavailable'
        return
    matches = defaultdict(list)
    for row in scheduled:
        matches[(str(row['session_date']), str(row['module'] or '').strip())].append(row)
    for lecture in dated:
        candidates = matches[(str(lecture['date']), lecture['module'])]
        if len(candidates) > 1:
            lecture['time_status'] = 'ambiguous'
        elif len(candidates) == 1:
            row = candidates[0]
            if row['scheduled_start'] is not None:
                lecture.update(
                    title=str(row['subject'] or '').strip() or lecture['module'],
                    starts_at=row['scheduled_start'], ends_at=row['scheduled_end'],
                    time_status='matched',
                )
