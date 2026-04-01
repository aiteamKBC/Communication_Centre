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
