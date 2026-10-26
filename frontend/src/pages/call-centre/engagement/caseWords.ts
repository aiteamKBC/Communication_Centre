// Words for Full case: what a case is about, its state, and its history in plain language.
import type { Case } from '../api';
import { appointmentTime, callResult, human, longDate, shortDate } from './model';

export const STATUS_NAMES: Record<string, string> = {
  new: 'To call', in_progress: 'Being worked', pending_learner: 'Callback booked', pending_verification: 'Waiting for proof',
  ai_suggested_close: 'AI suggests closing', resolved: 'Closed', unreachable: 'Unreachable', escalated: 'Escalated',
};

/** The day or meeting a case is about, in one line. */
export function caseWhen(c: Pick<Case, 'source_type' | 'issue_name' | 'issue_date' | 'booking_at' | 'missed_lecture'>) {
  if (c.source_type === 'reminder' && c.booking_at) return `${c.issue_name} · ${appointmentTime(c.booking_at)}`;
  if (c.source_type === 'attendance') {
    const title = c.missed_lecture?.title || c.missed_lecture?.module || c.issue_name;
    return [c.issue_date ? `Lecture ${shortDate(c.issue_date)}` : 'Lecture', title].filter(Boolean).join(' · ');
  }
  return [c.issue_name, c.issue_date ? shortDate(c.issue_date) : ''].filter(Boolean).join(' · ');
}

/** When the call is due, or how late it is. */
export function dueText(c: Pick<Case, 'status' | 'sla_breached' | 'sla_days_overdue' | 'due_at' | 'next_followup_at'>) {
  if (c.status === 'resolved') return '';
  if (c.next_followup_at && Date.parse(c.next_followup_at) > Date.now()) return `Back on ${longDate(c.next_followup_at)}`;
  if (c.sla_breached) return `${c.sla_days_overdue} ${c.sla_days_overdue === 1 ? 'day' : 'days'} late`;
  return `Call by ${longDate(c.due_at)}`;
}

const EVENT_NAMES: Record<string, string> = {
  created: 'Case opened', dial_requested: 'Call started', call_saved: 'Call saved', outcome: 'Outcome recorded',
  outcome_pending: 'Outcome waiting for Zoom', outcome_pending_dropped: 'Outcome not applied', outcome_call_linked: 'Zoom call attached',
  outcome_call_mismatch: 'Outcome does not match Zoom', feedback_call_linked: 'Zoom call attached',
  feedback_call_mismatch: 'Feedback on a call Zoom reports not answered',
  not_discussed: 'Not discussed',
  resolved: 'Closed', reopened: 'Reopened', note: 'Note', claimed: 'Taken', released: 'Released', session_booked: 'Session booked',
  meeting_cancelled: 'Meeting cancelled', meeting_rescheduled: 'Meeting moved', employer_check: 'Employer step',
  employer_dialled: 'Employer rung', email_dry_run: 'Email (dry run)', email_requested: 'Email sent', reminder_eligibility_changed: 'Reminder changed',
  learner_feedback_completed: 'Satisfaction feedback completed', employer_feedback_completed: 'Employer feedback completed',
};
export const eventName = (kind: string) => EVENT_NAMES[kind] || human(kind);

const EMPLOYER_RESULTS: Record<string, string> = {
  confirmed: 'Employer confirmed', cannot_attend: 'Employer says the learner cannot attend', no_answer: 'No answer from the employer',
  not_reachable: 'Employer could not be reached', no_manager: 'No line manager on record',
};

/** The useful part of an event's data, in words. */
export function eventText(kind: string, data: Record<string, unknown>) {
  const text = (key: string) => (data[key] === undefined || data[key] === null ? '' : String(data[key]));
  if (kind === 'employer_check') return [EMPLOYER_RESULTS[text('result')] || human(text('result')), text('note')].filter(Boolean).join(': ');
  if (kind === 'meeting_rescheduled' && text('to')) return `Moved to ${appointmentTime(text('to'))}`;
  if (kind === 'meeting_cancelled') return text('reason');
  if (kind === 'outcome_call_linked' || kind === 'feedback_call_linked') return `Zoom: ${callResult(text('result'))}`;
  if (kind === 'outcome_call_mismatch') return `Saved as ${human(text('outcome'))}, but Zoom reports ${callResult(text('result'))}`;
  if (kind === 'feedback_call_mismatch') return `Zoom reports ${callResult(text('result'))}`;
  if (data.without_call) return [eventText('', { ...data, without_call: false }), 'saved without a Zoom call'].filter(Boolean).join(' · ');
  const parts = ['note', 'outcome', 'option', 'reason', 'error', 'problem', 'agreed_action'].map(text).filter(Boolean).map(human);
  if (data.score) parts.unshift(`Satisfaction: ${text('score')}/5`);
  return parts.join(' · ');
}
