import { useEffect, useState } from 'react';
import {
  CalendarEvent,
  EVENT_STORAGE_KEY,
  events as defaultEvents,
  sortCalendarEvents,
} from '../mocks/events';

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CalendarEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.day === 'string' &&
    typeof candidate.month === 'string' &&
    (candidate.type === 'online' || candidate.type === 'offline')
  );
}

function readEvents(): CalendarEvent[] {
  if (typeof window === 'undefined') {
    return sortCalendarEvents(defaultEvents);
  }

  try {
    const raw = window.localStorage.getItem(EVENT_STORAGE_KEY);
    if (!raw) {
      return sortCalendarEvents(defaultEvents);
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return sortCalendarEvents(defaultEvents);
    }

    return sortCalendarEvents(parsed.filter(isCalendarEvent));
  } catch {
    return sortCalendarEvents(defaultEvents);
  }
}

function writeEvents(items: CalendarEvent[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(sortCalendarEvents(items)));
}

export function useSharedEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>(() => readEvents());

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === EVENT_STORAGE_KEY) {
        setEvents(readEvents());
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const addEvent = (event: CalendarEvent) => {
    setEvents(current => {
      const next = sortCalendarEvents([...current, event]);
      writeEvents(next);
      return next;
    });
  };

  return {
    events,
    addEvent,
  };
}
