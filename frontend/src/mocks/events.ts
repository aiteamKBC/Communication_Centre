export interface EventMedia {
  id: string;
  name: string;
  url: string;
  kind: 'image' | 'video';
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  day: string;
  month: string;
  department: string;
  type: 'online' | 'offline';
  time?: string;
  location?: string;
  description?: string;
  organiser?: string;
  registrationLink?: string;
  image?: string;
  media?: EventMedia[];
}

export const events: CalendarEvent[] = [];
