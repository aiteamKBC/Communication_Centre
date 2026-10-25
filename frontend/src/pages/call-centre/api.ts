// Client for the call-centre backend (/api/callcentre/, /api/zoom/).
// Identity comes from the Django session cookie set at sign-in; writes send the CSRF token
// returned by config/.

import { useCallback, useEffect, useState } from 'react';
import { csrfToken as cookieCsrfToken } from '../../utils/apiSession';

export type Case = {
  /** Next-day reminders of a progress review or monthly coaching: the Outlook meeting. */
  meeting?: ReviewMeetingSummary | null;
  /** Next-day progress reviews: the employer (line manager) is confirmed too (employer_check.py). */
  employer_check?: EmployerCheck | null;
  id: number; source_type: string; source_id: number | null; learner_email: string; learner_name: string;
  issue_name: string; issue_date: string | null;
  module?: string;
  filter_contexts?: { coach: string; cohort: string; module: string }[];
  missed_lecture?: {
    module: string; title: string; date: string | null;
    starts_at: string | null; ends_at: string | null;
    time_status: 'matched' | 'missing' | 'ambiguous' | 'unavailable';
  } | null;
  /** EPA dates from the last synced Aptem snapshot; absent on older servers. */
  programme_end_date?: string | null; gateway_review_date?: string | null;
  learner_phone: string; coach: string; organisation: string; programme: string; manager_name: string; manager_email: string;
  contact_key?: string; programme_status?: string; satisfaction_next_due_at?: string | null;
  /** Employer feedback calls: the line manager's learners in the directory. */
  employer_learners?: { name: string; email: string; programme: string }[];
  status: string; risk: string; claimed_by: string | null; claimed_agent_id: number | null;
  last_actor: string; last_action_at: string; attempts: number; next_followup_at: string | null;
  due_at: string; sla_breached: boolean; sla_days_overdue: number; learner_days_overdue: number; misses: number;
  booking_at: string | null; ai_summary: string; ai_confidence: number | null; resolution_option: string;
  resolved_at: string | null; resolved_by: string; archived: boolean; escalated: boolean;
  created_at: string; priority_why: string; source_data: Record<string, unknown>;
  /** Manager requests only: why to call and who asked. */
  purpose: string; requested_by: string;
  /** Technical issues only: the ticket in the technical support system and its last known status. */
  helpdesk: { ticket: string; subcategory: string; description: string; raised_by: string; helpdesk_status: string;
    helpdesk_reason: string; helpdesk_checked_at: string | null; helpdesk_error?: string | null } | null;
  /** What the learner agreed to and the deadline; a missed promise is back in the queue. */
  promised_at: string | null; promise_missed: boolean;
  /** What the learner can agree to (option -> days to do it, null: agreeing closes the case); without options a specialist closes the case. */
  promises: Record<string, number | null>; specialist_closes: boolean;
  /** The latest call went unanswered: the case sits at the bottom of its list. */
  missed_call: boolean;
  /** The learner rang and nobody answered (inbound): their cases are at the top of the list until someone calls back. */
  called_back_at: string | null;
  /** Session types the call centre can book straight into the coach's LMS calendar for this case. */
  bookable: ('catch-up' | 'student-support')[];
  /** The case has a booking email (the coach's booking link, or the review's rebooking link). */
  booking_email: boolean;
};

export type Issue = Pick<Case, 'id' | 'source_type' | 'status' | 'issue_name' | 'issue_date'>
  & Partial<Pick<Case, 'created_at' | 'booking_at' | 'next_followup_at'>>;

/** A case as listed by overview/ (no source_data). */
export type OverviewCase = Omit<Case, 'source_data' | 'priority_why'> & { booking_links: BookingLinks; allocated_agent_id: number | null;
  /** An optional call an employer specialist chose to make (to any learner): theirs only, never a task. */
  optional?: boolean;
  /** The specialist whose saved call set the case's current follow-up; null when no call has set one. */
  followup_agent_id: number | null; contact_sources?: Record<string, string> };
export type BookingLinks = Partial<Record<'pr' | 'mcm' | 'support', string>>;
/** The employer step of a next-day progress review: the line manager, how to reach them, and what they said. */
export type EmployerCheck = {
  manager_name: string; manager_email: string; manager_phone: string;
  result: '' | 'confirmed' | 'cannot_attend' | 'no_answer' | 'not_reachable' | 'no_manager'; label: string; done: boolean;
  note: string; by: string; at: string | null; tries: number;
};
/** A next-day reminder's Outlook review meeting (review_meetings.py): cancelled or not, the learner's reply, confirmed on a call. */
export type ReviewMeetingSummary = {
  id: number; status: 'scheduled' | 'cancelled'; cancelled_how: '' | 'outlook' | 'removed' | 'engagement_centre';
  learner_response: string; confirmed: boolean; organizer: string; cancellable: boolean;
};

export type DayStats = { day: string; attempts: number; connected: number; seconds: number };
export type AgentStats = {
  id: number; display_name: string; zoom_account: string; zoom_phone_number: string; target_seconds: number;
  today: { attempts: number; connected: number; seconds: number };
  month: {
    attempts: number; connected: number; seconds: number; resolved: number; pending: number; sla_breaches: number;
    unique_learners: number; emails: number; daily: DayStats[];
  };
  sync: { last_success_at: string | null; error: string; recordings_error: string };
};

export type Overview = {
  today: string; next_workday: string; month: string; generated_at: string;
  /** Bank holidays and college closures from today (ISO dates): no calls on these days. */
  holidays: string[];
  access: { role: 'director' | 'operator' | 'viewer'; agent_id: number | null; is_superuser: boolean; display_name: string; email: string };
  agents: AgentStats[]; cases: OverviewCase[]; cases_truncated: boolean;
  /** Specialists who make every employer satisfaction call (director's choice); empty when that is off. */
  employer_specialists?: number[];
  resolutions: { agent: number; ai: number; system: number }; unclaimed_breaches: number;
  sources: Config['sources']; cycle: Config['cycle'];
  connections: { calling: boolean; email_mode: string; ai: boolean };
  /** AI call ratings for the month: every specialist's for managers, only their own for a specialist. */
  call_reviews: { agents: Record<string, Record<CallRating, number>>; flags: CallFlag[] } | null;
};

export type CallRating = 'excellent' | 'good' | 'bad' | 'not_rated';
/** The AI's rating of one call transcript, with notes on what went wrong and what to change. */
export type CallReview = { rating: CallRating; went_wrong: string[]; needs_change: string[]; summary: string; analysed_at: string };
export type CallFlag = CallReview & { recording_id: number; started_at: string; agent_id: number | null; agent_name: string };

export type CaseCall = {
  call_id: number; agent: string; agent_id: number; manual: boolean; result: string; started_at: string; duration_seconds: number | null; outcome: string;
  /** Made since the case (or its current satisfaction cycle) was opened, reopened or sent back. */
  current: boolean;
};
export type HeldFeedback = { state: 'held' | 'dropped'; at: string; by: string; reason: string };

export type CaseDetail = {
  ticket: Case & { booking_links: BookingLinks }; issues: Issue[]; calls: CaseCall[]; has_more_events: boolean;
  events: { id: number; kind: string; actor: string; data: Record<string, unknown>; call_id: number | null; created_at: string }[];
  emails: { id: number; kind: string; status: string; mode: string; subject: string; text: string; error: string; created_at: string }[];
  /** The signed-in specialist's call to this learner (last two hours) whose outcome is not saved yet: the cases it covers. */
  open_call?: { ticket_ids: number[] } | null;
  /** Satisfaction feedback saved before Zoom reported its call: waiting (`held`), or `dropped` (call not answered). */
  held_feedback?: HeldFeedback | null;
};

export type Config = {
  csrf_token: string; agent_id: number | null; is_manager: boolean; is_superuser: boolean; email_mode: string; ai_enabled: boolean;
  /** Specialists can raise technical issues in the technical support system. */
  helpdesk: boolean;
  agents: { id: number; display_name: string; zoom_account: string; zoom_phone_number: string }[];
  sources: { name: string; last_success_at: string | null; details: { error?: string; checked_at?: string } }[];
  cycle: { last_success_at: string | null } | null;
};

type RequestOptions = Parameters<typeof fetch>[1];

/** A failed request, with what the server said about it: the form field to fix, the reference to find it in the server
 * log, and (on a developer's machine) what failed and where. */
export class ApiError extends Error {
  status: number;
  field: string;
  reference: string;
  debug: { error: string; where: string } | null;

  constructor(message: string, status: number, details: { field?: string; reference?: string; debug?: { error: string; where: string } } = {}) {
    super(message);
    this.status = status;
    this.field = details.field || '';
    this.reference = details.reference || '';
    this.debug = details.debug || null;
  }
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    throw new ApiError('Could not reach the server. Check the backend is running and your internet connection, then try again.', 0);
  }
  const payload = await response.json().catch(() => null);
  if (payload === null) {
    throw new ApiError(response.ok ? 'The server answered with something that is not data. Reload the page and try again.'
      : `The server failed (HTTP ${response.status}) and sent no details. The backend log has the cause.`, response.status);
  }
  if (!response.ok) {
    throw new ApiError(payload.detail || `The request failed (HTTP ${response.status}).`, response.status,
      { field: payload.field, reference: payload.reference, debug: payload.debug });
  }
  return payload as T;
}

export const api = <T,>(path: string, options: RequestOptions = {}) => request<T>(`/api/callcentre/${path}`, options);

export function post<T>(path: string, csrfToken: string, payload: Record<string, unknown>, method = 'POST') {
  return api<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': cookieCsrfToken() || csrfToken },
    body: JSON.stringify(payload),
  });
}

/** Loads a call-centre resource and (with `poll`) refreshes it every 60 s while the browser tab is visible.
 * A failed refresh keeps the last data on screen; only a sign-in or permission failure clears it. */
export function useCallCentre<T>(path: string | null, poll = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(0);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<T>(path, { signal: controller.signal })
      .then(value => {
        if (!controller.signal.aborted) {
          setData(value);
          setStatus(200);
        }
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Request failed.');
        const status = reason instanceof ApiError ? reason.status : 0;
        setStatus(status);
        if (status === 401 || status === 403) setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);

  useEffect(() => {
    if (!poll) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refresh, poll]);

  return { data, error, status, loading, refresh };
}

export const londonDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/** A Zoom account's name, from the accounts a report lists; the key when it is not among them. */
export const accountLabel = (key: string, accounts: { key: string; label: string }[] = []) =>
  accounts.find(account => account.key === key)?.label || key || 'No account';

export const transcriptStatusLabels: Record<string, string> = {
  ready: 'Ready', pending: 'Processing', disabled: 'Transcription disabled',
  unavailable: 'Transcript unavailable', error: 'Sync failed',
};

export const RATING_LABELS: Record<CallRating, string> = {
  excellent: 'Excellent', good: 'Good', bad: 'Bad', not_rated: 'Not rated',
};

/** The same simple rules the AI is given (backend/callcentre/ai.py RATING_CRITERIA). */
export const RATING_RULES: [CallRating, string][] = [
  ['excellent', 'Polite greeting, says who they are and that they are from KBC, explains why they are calling, listens and answers correctly, agrees a clear next step with a date, closes politely.'],
  ['good', 'Professional and the call did its job, but one or two of the excellent points were missed (for example no date for the next step).'],
  ['bad', 'Rude or impatient, wrong or confusing information, no reason given for the call, ignores the learner, no next step, or personal details shared without checking who answered.'],
  ['not_rated', 'No real conversation: no answer, voicemail only, wrong number, or too short to judge.'],
];

export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
