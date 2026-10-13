"""Each coach's Microsoft Bookings links, matched by coach email.

The links come from the coach's page in the LMS coach directory (``login.coach_directory``, edited in
LMS admin -> Coach directory), read through the read-only LMS database at most once a minute, so a link
changed there appears here without a deploy. The LMS is only read, never changed.

Which page belongs to a coach: the page a director confirmed in the Engagement Centre
(``CoachBookingPage``), else the page ``data/coach_bookings.json`` gives the coach's email. That file is
a copy of the LMS's ``backend/old_otjh/data/coach_bookings.json``, the catalogue the directory was first
imported from, so its slugs are the directory's. Until the directory has been read once, the file's own
links are used.

The coach's email comes from the LMS enrolment records (``sources.coach_email``), never from the coach's
name, so a similar name cannot pick up another coach's links. Names only suggest a page for a director
to confirm.
"""
import json
import logging
import time
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.db import ProgrammingError

from .db import LMS

logger = logging.getLogger(__name__)

# Catalogue session -> the call centre's link kind.
KINDS = {'progress_review': 'pr', 'coaching_session': 'mcm', 'support_session': 'support'}
REFRESH_SECONDS = 60
DIRECTORY_SQL = 'SELECT slug, name, links FROM login.coach_directory'


def _https(url):
    parts = urlsplit(str(url or '').strip())
    return parts.scheme == 'https' and bool(parts.hostname)


def _kinds(links):
    links = links if isinstance(links, dict) else json.loads(links or '{}')
    return {kind: links[session].strip() for session, kind in KINDS.items()
            if isinstance(links.get(session), str) and _https(links[session])}


def _key(email):
    return str(email or '').strip().casefold()


def _load():
    coaches = json.loads((Path(__file__).parent / 'data' / 'coach_bookings.json').read_text(encoding='utf-8'))['coaches']
    links, slugs = {}, {}
    for coach in coaches:
        email = _key(coach.get('email'))
        if email:
            links[email] = _kinds(coach.get('links') or {})
            slugs[email] = str(coach.get('slug') or '')
    return links, slugs


CATALOGUE, CATALOGUE_SLUGS = _load()
# pages: slug -> {'name', 'links'} from the LMS directory, None until it has been read once.
_cached = {'pages': None, 'confirmed': {}, 'next_refresh': 0.0}


def _read_pages():
    from .sources import rows   # sources reads the LMS; imported here to keep this module light
    return {row['slug']: {'name': row['name'], 'links': _kinds(row['links'])} for row in rows(LMS, DIRECTORY_SQL)}


def _read_confirmed():
    from .models import CoachBookingPage
    return dict(CoachBookingPage.objects.values_list('coach_email', 'page_slug'))


def refresh(force=False):
    """Re-read the LMS directory and the confirmed pages, at most once a minute unless forced.
    Whatever cannot be read keeps its last good copy."""
    now = time.monotonic()
    if not force and now < _cached['next_refresh']:
        return
    _cached['next_refresh'] = now + REFRESH_SECONDS
    if LMS in settings.DATABASES:
        try:
            _cached['pages'] = _read_pages()
        except Exception:
            logger.warning('LMS coach directory could not be read; keeping the last booking pages', exc_info=True)
    try:
        _cached['confirmed'] = _read_confirmed()
    except ProgrammingError:
        pass   # docs/callcentre-port/coach_booking_pages.sql has not been run: the catalogue pages apply
    except Exception:
        logger.warning('Confirmed coach booking pages could not be read; keeping the last ones', exc_info=True)


def pages():
    """slug -> {'name', 'links'} from the LMS coach directory, or None while it has never been read."""
    refresh()
    return _cached['pages']


def page_for(email):
    """(slug, source) of the coach's page: source is 'confirmed', 'catalogue' or '' (no page)."""
    email = _key(email)
    if email in _cached['confirmed']:
        return _cached['confirmed'][email], 'confirmed'
    slug = CATALOGUE_SLUGS.get(email, '')
    return slug, 'catalogue' if slug else ''


def suggest(coach_name, directory):
    """The one directory page whose name is the coach's full name, else their first name; '' if none or several.
    Only a suggestion for a director to confirm: names are never used to pick links on their own."""
    name = ' '.join(str(coach_name or '').split()).casefold()
    if not name or not directory:
        return ''
    for wanted in dict.fromkeys([name, name.split()[0]]):
        found = [slug for slug, page in directory.items() if ' '.join(str(page['name']).split()).casefold() == wanted]
        if found:
            return found[0] if len(found) == 1 else ''
    return ''


def confirm(email, slug, actor):
    """Store the director's choice of page ('' = no booking page) and use it straight away."""
    from .models import CoachBookingPage
    CoachBookingPage.objects.update_or_create(coach_email=_key(email), defaults={'page_slug': slug, 'updated_by': actor})
    refresh(force=True)


def links_for_email(email):
    """{'pr', 'mcm', 'support'} -> url for the coach with this email ({} when the coach has none)."""
    refresh()
    email = _key(email)
    if not email:
        return {}
    slug, _ = page_for(email)
    if _cached['pages'] is None:
        # The directory has never been read: only the catalogue's own page can be shown, from the bundled file.
        return dict(CATALOGUE.get(email, {})) if slug and slug == CATALOGUE_SLUGS.get(email) else {}
    page = _cached['pages'].get(slug)
    return dict(page['links']) if page else {}


def booking_links(coach):
    """The links of the coach with this name, through the email the LMS enrolment records give it."""
    from .sources import coach_email   # sources reads the LMS; imported here to keep this module light
    return links_for_email(coach_email(coach))
