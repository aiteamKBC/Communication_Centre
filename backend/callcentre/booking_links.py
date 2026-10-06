"""Each coach's Microsoft Bookings links, from the LMS's own catalogue, matched by coach email.

``data/coach_bookings.json`` is a copy of the LMS's ``backend/old_otjh/data/coach_bookings.json``;
replace it whenever the LMS copy changes. The coach's email comes from the LMS enrolment records
(``sources.coach_email``), never from the coach's name, so a similar name cannot pick up another
coach's links.
"""
import json
from pathlib import Path
from urllib.parse import urlsplit

# Catalogue session -> the call centre's link kind.
KINDS = {'progress_review': 'pr', 'coaching_session': 'mcm', 'support_session': 'support'}


def _https(url):
    parts = urlsplit(str(url or '').strip())
    return parts.scheme == 'https' and bool(parts.hostname)


def _load():
    coaches = json.loads((Path(__file__).parent / 'data' / 'coach_bookings.json').read_text(encoding='utf-8'))['coaches']
    catalogue = {}
    for coach in coaches:
        links = coach.get('links') or {}
        catalogue[str(coach.get('email') or '').strip().casefold()] = {
            kind: links[session].strip() for session, kind in KINDS.items() if _https(links.get(session))}
    return catalogue


CATALOGUE = _load()


def links_for_email(email):
    """{'pr', 'mcm', 'support'} -> url for the coach with this email ({} when the coach has none)."""
    return dict(CATALOGUE.get(str(email or '').strip().casefold(), {}))


def booking_links(coach):
    """The links of the coach with this name, through the email the LMS enrolment records give it."""
    from .sources import coach_email   # sources reads the LMS; imported here to keep this module light
    return links_for_email(coach_email(coach))
