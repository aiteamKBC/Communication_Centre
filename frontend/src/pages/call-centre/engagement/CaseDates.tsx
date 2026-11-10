import type { OverviewCase } from '../api';
import { longDate, when } from './model';
import { hasDate, type TicketDates as Dates } from './ticketOrder';

const DATED_ISSUES = new Set(['attendance', 'pr', 'mcm', 'pr_missed', 'mcm_missed', 'signature', 'epa']);
const DATE_LABELS: Record<string, string> = { attendance: 'Missed lecture date', pr: 'Review due', mcm: 'Review due', epa: 'EPA follow-up from' };
type Props = Dates & Pick<OverviewCase, 'source_type' | 'programme_end_date' | 'gateway_review_date'> &
  Partial<Pick<OverviewCase, 'due_at' | 'next_followup_at' | 'missed_lecture'>>;

const lectureTime = (value: string) => new Date(value).toLocaleTimeString('en-GB', {
  timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Keep source dates and record creation distinct; missing source dates are never invented. */
export default function CaseDates({ ticket }: { ticket: Props }) {
  const label = DATE_LABELS[ticket.source_type] || 'Issue date';
  const lecture = ticket.missed_lecture;
  return (
    <div className="ed-ticket-dates">
      {ticket.source_type === 'epa' && <>
        <span>Programme end: {hasDate(ticket.programme_end_date)
          ? <time dateTime={ticket.programme_end_date}>{longDate(ticket.programme_end_date)}</time> : 'Not recorded'}</span>
        <span>Gateway review: {hasDate(ticket.gateway_review_date)
          ? <time dateTime={ticket.gateway_review_date}>{longDate(ticket.gateway_review_date)}</time> : 'Not recorded'}</span>
      </>}
      {hasDate(ticket.issue_date)
        ? <span>{label}: <time dateTime={ticket.issue_date}>{longDate(ticket.issue_date)}</time></span>
        : DATED_ISSUES.has(ticket.source_type) && <span>{label}: Not recorded in source</span>}
      {ticket.source_type === 'attendance' && <>
        {lecture?.title && lecture.title !== lecture.module && <span>Lecture: {lecture.title}</span>}
        <span>Lecture time: {hasDate(lecture?.starts_at)
          ? <>
            <time dateTime={lecture.starts_at} title={when(lecture.starts_at)}>{lectureTime(lecture.starts_at)}</time>
            {hasDate(lecture.ends_at) && <>–<time dateTime={lecture.ends_at} title={when(lecture.ends_at)}>
              {longDate(lecture.ends_at) !== longDate(lecture.starts_at) ? `${longDate(lecture.ends_at)} ` : ''}
              {lectureTime(lecture.ends_at)}
            </time></>} (London)
          </>
          : lecture?.time_status === 'ambiguous' ? 'Multiple sessions — confirm in timetable'
            : lecture?.time_status === 'unavailable' ? 'Timetable temporarily unavailable'
              : 'Not recorded in source'}</span>
      </>}
      {hasDate(ticket.booking_at) && <span>Appointment: <time dateTime={ticket.booking_at}>{when(ticket.booking_at)} (London)</time></span>}
      <span>Ticket opened: {hasDate(ticket.created_at)
        ? <time dateTime={ticket.created_at} title={`${when(ticket.created_at)} (London)`}>{longDate(ticket.created_at)}</time>
        : 'Not recorded'}</span>
      {hasDate(ticket.due_at) && <span>Call due by: <time dateTime={ticket.due_at}>{longDate(ticket.due_at)}</time></span>}
      {hasDate(ticket.next_followup_at) && <span>Next follow-up: <time dateTime={ticket.next_followup_at}>{when(ticket.next_followup_at)} (London)</time></span>}
    </div>
  );
}
