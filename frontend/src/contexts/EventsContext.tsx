import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CalendarEvent, EventMedia, sortCalendarEvents } from '../mocks/events';
import { useRealtimeResource } from '../hooks/useRealtimeUpdates';
import { containsUnsafeDataImage } from '../pages/events/components/eventMediaUpload';

// ─── Types ────────────────────────────────────────────────────────────────────

const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

type ApiEvent = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  date: string;
  registrationLink?: string;
  time?: string;
  type?: string;
  coverImage?: string;
  moreImages?: string;
};

function normalizeDate(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const [day = '1', month = 'Jan', year = '1970'] = value.split(' ');
  const monthIndex = MONTH_ABBR.indexOf(month);
  return new Date(Number(year), monthIndex >= 0 ? monthIndex : 0, Number(day));
}

function parseMoreImages(raw: string | undefined): EventMedia[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Array<Record<string, string>>).map((item, i) => ({
      id: item.id ?? `db-gallery-${i}`,
      kind: (item.kind === 'video' ? 'video' : 'image') as 'image' | 'video',
      url: item.url ?? '',
      name: item.name ?? `media-${i}`,
    }));
  } catch {
    return [];
  }
}

function normalizeApiEvent(event: ApiEvent): CalendarEvent {
  const dateObj  = normalizeDate(event.date);
  const dayNum   = dateObj.getDate();
  const monthIdx = dateObj.getMonth();
  const year     = dateObj.getFullYear();

  const allMedia: EventMedia[] = [];
  if (event.coverImage) {
    allMedia.push({ id: 'db-cover', kind: 'image', url: event.coverImage, name: 'cover', isCover: true });
  }
  allMedia.push(...parseMoreImages(event.moreImages));

  return {
    id: String(event.id),
    title: event.title,
    date: `${dayNum} ${MONTH_ABBR[monthIdx]} ${year}`,
    day: String(dayNum),
    month: MONTH_UPPER[monthIdx],
    type: event.type === 'offline' ? 'offline' : 'online',
    time: event.time || undefined,
    location: event.location || undefined,
    description: event.description || undefined,
    registrationLink: event.registrationLink || undefined,
    image: event.coverImage || undefined,
    media: allMedia.length ? allMedia : undefined,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

type EventsContextValue = {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  addEvent: (event: CalendarEvent) => Promise<void>;
  updateEvent: (event: CalendarEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  // Triggers the initial events fetch. Called by useEventsContext on first
  // consumption so the request only fires on pages that actually read events
  // (Home, Events) instead of every page the provider wraps.
  ensureLoaded: () => void;
};

const EventsContext = createContext<EventsContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents]   = useState<CalendarEvent[]>([]);
  // Starts false because the fetch is deferred until a consumer asks for it;
  // ensureLoaded flips it to true when the first request actually begins.
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchEvents = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await fetch('/api/events/');
      if (!response.ok) throw new Error('Failed to load events.');
      const payload = (await response.json()) as ApiEvent[];
      setEvents(sortCalendarEvents(payload.map(normalizeApiEvent)));
      setError(null);
    } catch {
      setError('Unable to load events from the database.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Fetch once, on first consumption (see ensureLoaded in the context value),
  // rather than unconditionally on provider mount.
  const ensureLoaded = useCallback(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void fetchEvents();
  }, [fetchEvents]);

  // Realtime refreshes only matter once events have been loaded; the callback
  // is a no-op until then so a background update on an events-less page does
  // not trigger a fetch.
  useRealtimeResource('events', () => { if (hasLoadedRef.current) void fetchEvents(false); });

  const serializePayload = (event: CalendarEvent) => {
    const coverItem = event.media?.find(m => m.isCover);
    const galleryItems = event.media?.filter(m => !m.isCover) ?? [];
    const coverImage = coverItem?.url ?? event.image ?? '';

    if (containsUnsafeDataImage(coverImage) || galleryItems.some(item => containsUnsafeDataImage(item.url))) {
      throw new Error('Unsafe image payload detected. Please wait for all images to finish uploading before saving.');
    }

    return {
      title: event.title,
      date: event.date,
      time: event.time,
      location: event.location,
      registrationLink: event.registrationLink,
      description: event.description,
      type: event.type,
      coverImage,
      moreImages: galleryItems.length
        ? JSON.stringify(galleryItems.map(m => ({ id: m.id, kind: m.kind, url: m.url, name: m.name })))
        : '',
    };
  };

  const addEvent = async (event: CalendarEvent): Promise<void> => {
    const response = await fetch('/api/events/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializePayload(event)),
    });
    if (!response.ok) throw new Error('Failed to save event.');
    const saved = normalizeApiEvent((await response.json()) as ApiEvent);
    setEvents(current => sortCalendarEvents([...current, saved]));
  };

  const updateEvent = async (event: CalendarEvent): Promise<void> => {
    const response = await fetch(`/api/events/${event.id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializePayload(event)),
    });
    if (!response.ok) throw new Error('Failed to update event.');
    const updated = normalizeApiEvent((await response.json()) as ApiEvent);
    setEvents(current => sortCalendarEvents(current.map(e => e.id === event.id ? updated : e)));
  };

  const deleteEvent = async (id: string): Promise<void> => {
    const response = await fetch(`/api/events/${id}/`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete event.');
    setEvents(current => current.filter(e => e.id !== id));
  };

  return (
    <EventsContext.Provider value={{ events, loading, error, addEvent, updateEvent, deleteEvent, refresh: fetchEvents, ensureLoaded }}>
      {children}
    </EventsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEventsContext(): EventsContextValue {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error('useEventsContext must be used inside <EventsProvider>');
  // First consumer on a page triggers the (deferred) initial fetch. Pages that
  // never call this hook never trigger the events request.
  useEffect(() => { ctx.ensureLoaded(); }, [ctx]);
  return ctx;
}
