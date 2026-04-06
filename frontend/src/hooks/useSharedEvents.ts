import { useEffect, useState } from 'react';
import { CalendarEvent, sortCalendarEvents } from '../mocks/events';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_UPPER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

type ApiEvent = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  date: string;
  registrationLink?: string;
  time?: string;
  type?: string;
};

function normalizeDate(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const [day = '1', month = 'Jan', year = '1970'] = value.split(' ');
  const monthIndex = MONTH_ABBR.indexOf(month);
  return new Date(Number(year), monthIndex >= 0 ? monthIndex : 0, Number(day));
}

function normalizeApiEvent(event: ApiEvent): CalendarEvent {
  const dateObj = normalizeDate(event.date);
  const dayNum = dateObj.getDate();
  const monthIdx = dateObj.getMonth();
  const year = dateObj.getFullYear();
  const normalizedType = event.type === 'offline' ? 'offline' : 'online';

  return {
    id: String(event.id),
    title: event.title,
    date: `${dayNum} ${MONTH_ABBR[monthIdx]} ${year}`,
    day: String(dayNum),
    month: MONTH_UPPER[monthIdx],
    type: normalizedType,
    time: event.time || undefined,
    location: event.location || undefined,
    description: event.description || undefined,
    registrationLink: event.registrationLink || undefined,
  };
}

export function useSharedEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true);
        const response = await fetch('/api/events/');
        if (!response.ok) {
          throw new Error('Failed to load events.');
        }
        const payload = (await response.json()) as ApiEvent[];
        setEvents(sortCalendarEvents(payload.map(normalizeApiEvent)));
        setError(null);
      } catch {
        setError('Unable to load events from the database.');
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, []);

  const addEvent = async (event: CalendarEvent): Promise<void> => {
    const response = await fetch('/api/events/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: event.title,
        date: event.date,
        time: event.time,
        location: event.location,
        registrationLink: event.registrationLink,
        description: event.description,
        type: event.type,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to save event.');
    }

    const saved = normalizeApiEvent((await response.json()) as ApiEvent);
    setEvents(current => sortCalendarEvents([...current, saved]));
  };

  return {
    events,
    loading,
    error,
    addEvent,
  };
}
