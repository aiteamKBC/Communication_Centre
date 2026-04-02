export interface EventMedia {
  id: string;
  kind: 'image' | 'video';
  url: string;
  name: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  day: string;
  month: string;
  type: 'online' | 'offline';
  time?: string;
  location?: string;
  description?: string;
  registrationLink?: string;
  media?: EventMedia[];
  image?: string;
}

export const events: CalendarEvent[] = [];

const MONTH_ABBR_TO_INDEX: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export const EVENT_STORAGE_KEY = 'kbc-calendar-events';

export function parseCalendarEventDate(event: Pick<CalendarEvent, 'date'>): Date {
  const [dayPart = '1', monthPart = 'Jan', yearPart = '1970'] = event.date.split(' ');
  const day = parseInt(dayPart, 10);
  const month = MONTH_ABBR_TO_INDEX[monthPart] ?? 0;
  const year = parseInt(yearPart, 10);
  return new Date(year, month, day);
}

export function sortCalendarEvents(items: CalendarEvent[]): CalendarEvent[] {
  return [...items].sort((left, right) => {
    const dateDiff = parseCalendarEventDate(left).getTime() - parseCalendarEventDate(right).getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return left.title.localeCompare(right.title);
  });
}
