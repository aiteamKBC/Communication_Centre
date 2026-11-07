// The Events hub: a separate site (events.kentbusinesscollege.net) for event confirmation and feedback calls.
// The server reads it for these pages (backend/callcentre/events_hub.py); nobody signs in to it, its buttons go
// through events/open/, which makes a one-minute pass at the click.

/** One event this specialist calls about: confirmations (today's task) before it, optional feedback after it. */
export type EventTask = {
  event_id: string; event_name: string; start_at: string; end_at: string | null;
  phase: 'confirmation' | 'feedback'; required: boolean;
  booked: number; to_call: number; confirmed: number; attended: number;
  calls_open_at: string; feedback_open: boolean; feedback_closes_at: string; feedback_recorded: number;
};

/** A specialist's own event-call figures for a period (Events api_events/stats.py). */
export type EventNumbers = {
  dialled: number; answered: number; talk_seconds: number; answer_rate: number;
  contacted: number; confirmed: number; declined: number; confirmed_rate: number;
  feedback: number; average_rating: number | null;
};

export type EventCalls = {
  enabled: boolean; can_open: boolean; tasks: EventTask[]; error?: string;
  /** Null when Events does not know this account as an agent. */
  numbers: { today: EventNumbers; this_week: EventNumbers; last_week: EventNumbers } | null;
};

export type EventsSummary = {
  upcoming_7_days: { events: number; booked: number; contacted_rate: number; confirmed_rate: number };
  calls_open_now: { event_id: string; event_name: string; start_at: string; to_call: number; booked: number }[];
  unallocated_events: { event_id: string; event_name: string; start_at: string }[];
  last_event: { event_id: string; event_name: string; start_at: string; booked: number; attended: number; absent: number; show_up_rate: number } | null;
  feedback_30_days: { answered: number; average_rating: number | null };
  feedback_window_days: number;
  /** Zoom calls made from the Events hub in the last 7 days, matched by this server's worker. */
  calls_7_days?: EventCallFigures & { by_agent: (EventCallFigures & { name: string })[] };
};

export type EventCallFigures = { dialled: number; answered: number; talk_seconds: number; answer_rate: number };

export type EventsPanelData = { enabled: boolean; can_open: boolean; summary: EventsSummary | null; error?: string };

/** One event on the Director page's Event allocation; specialists are named by their account (auth_user) id. */
export type AllocationEvent = {
  event_id: string; event_name: string; location: string; start_at: string; end_at: string | null; calls_open_at: string;
  /** Calls open now (confirmation before the event, feedback after it); null before they open. */
  phase: 'confirmation' | 'feedback' | null;
  booked: number; to_call: number; all_agents: boolean; agent_ids: number[];
};
export type AllocationAgent = { id: number; name: string; email: string; active: boolean; agent_id: number | null };
export type Allocated = { all_agents: boolean; agent_ids: number[] };
export type AllocationHistory = { id: string; event_name: string; created_at: string; actor: string; reason: string; before: Allocated; after: Allocated };
export type AllocationBoard = { days: number; events: AllocationEvent[]; agents: AllocationAgent[]; history: AllocationHistory[] };
export type AllocationData = { enabled: boolean; board: AllocationBoard | null; error?: string };

export const eventDay = (value: string) => new Date(value).toLocaleString('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
});

/** Opens a page of the Events hub signed in as the current account (a new tab, so the desk stays open). */
export const eventsLink = (next: string) => `/api/callcentre/events/open/?next=${encodeURIComponent(next)}`;
export const eventPath = (eventId: string) => `/events/${eventId}`;
