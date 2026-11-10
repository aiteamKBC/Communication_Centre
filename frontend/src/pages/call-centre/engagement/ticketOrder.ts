import type { OverviewCase } from '../api';

export type TicketDates = Pick<OverviewCase, 'issue_date' | 'booking_at' | 'created_at'>;
export type TicketOrder = 'priority' | 'oldest' | 'newest';
export const TICKET_ORDERS: Record<TicketOrder, string> = {
  priority: 'Priority order', oldest: 'Oldest first', newest: 'Newest first',
};

export const hasDate = (value: string | null | undefined): value is string =>
  !!value && Number.isFinite(Date.parse(value));

/** The age of the issue, not when its record happened to be imported or updated. */
export function ticketOrderDate(ticket: TicketDates) {
  return [ticket.issue_date, ticket.booking_at, ticket.created_at].find(hasDate);
}

const ukDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Match whole UK calendar days, including both ends, using the same date as ordering. */
export function matchesTicketDate(ticket: TicketDates, from = '', to = '') {
  if (!from && !to) return true;
  if (from && to && from > to) return false;
  const value = ticketOrderDate(ticket);
  if (!value) return false;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ukDay.format(new Date(value));
  return (!from || day >= from) && (!to || day <= to);
}

/** Keep the server's priority order for ties, and undated tickets last in either direction. */
export function orderTickets<T extends TicketDates>(tickets: T[], order: TicketOrder): T[] {
  if (order === 'priority') return [...tickets];
  return [...tickets].sort((a, b) => {
    const left = ticketOrderDate(a);
    const right = ticketOrderDate(b);
    if (!left) return right ? 1 : 0;
    if (!right) return -1;
    return (Date.parse(left) - Date.parse(right)) * (order === 'oldest' ? 1 : -1);
  });
}
