// Client for the call-centre backend (/api/callcentre/, /api/zoom/).
// Identity comes from the Django session cookie set at sign-in; writes send the CSRF token
// returned by config/.

import { useCallback, useEffect, useState } from 'react';

export type Case = {
  id: number; source_type: string; source_id: number | null; learner_email: string; learner_name: string;
  issue_name: string; issue_date: string | null;
  learner_phone: string; coach: string; organisation: string; programme: string; manager_name: string; manager_email: string;
  status: string; risk: string; claimed_by: string | null; claimed_agent_id: number | null;
  last_actor: string; last_action_at: string; attempts: number; next_followup_at: string | null;
  due_at: string; sla_breached: boolean; sla_days_overdue: number; learner_days_overdue: number; misses: number;
  booking_at: string | null; ai_summary: string; ai_confidence: number | null; resolution_option: string;
  resolved_at: string | null; resolved_by: string; archived: boolean; escalated: boolean;
  created_at: string; priority_why: string; source_data: Record<string, unknown>;
  /** Manager requests only: why to call and who asked. */
  purpose: string; requested_by: string;
  /** What the learner agreed to and the deadline; a missed promise is back in the queue. */
  promised_at: string | null; promise_missed: boolean;
  /** What the learner can agree to (option -> days to do it, null: agreeing closes the case); without options a specialist closes the case. */
  promises: Record<string, number | null>; specialist_closes: boolean;
  /** The latest call went unanswered: the case sits at the bottom of its list. */
  missed_call: boolean;
  /** Session types the call centre can book straight into the coach's LMS calendar for this case. */
  bookable: ('catch-up' | 'student-support')[];
};

export type Issue = Pick<Case, 'id' | 'source_type' | 'status' | 'issue_name' | 'issue_date'>;

/** A case as listed by overview/ (no source_data). */
export type OverviewCase = Omit<Case, 'source_data' | 'priority_why'> & { booking_links: BookingLinks; allocated_agent_id: number | null };
export type BookingLinks = Partial<Record<'pr' | 'mcm' | 'support', string>>;

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
  today: string; month: string; generated_at: string;
  access: { role: 'director' | 'operator' | 'viewer'; agent_id: number | null; is_superuser: boolean; display_name: string; email: string };
  agents: AgentStats[]; cases: OverviewCase[]; cases_truncated: boolean;
  resolutions: { agent: number; ai: number; system: number }; unclaimed_breaches: number;
  sources: Config['sources']; cycle: Config['cycle'];
  connections: { calling: boolean; email_mode: string; ai: boolean };
};

export type CaseCall = { call_id: number; agent: string; manual: boolean; result: string; started_at: string; duration_seconds: number | null; outcome: string };
export type CaseDetail = {
  ticket: Case & { booking_links: BookingLinks }; issues: Issue[]; calls: CaseCall[]; has_more_events: boolean;
  events: { id: number; kind: string; actor: string; data: Record<string, unknown>; call_id: number | null; created_at: string }[];
  emails: { id: number; kind: string; status: string; mode: string; subject: string; text: string; error: string; created_at: string }[];
};

export type Config = {
  csrf_token: string; agent_id: number | null; is_manager: boolean; is_superuser: boolean; email_mode: string; ai_enabled: boolean;
  agents: { id: number; display_name: string; zoom_account: string; zoom_phone_number: string }[];
  sources: { name: string; last_success_at: string | null; details: { error?: string } }[];
  cycle: { last_success_at: string | null } | null;
};

type RequestOptions = Parameters<typeof fetch>[1];

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
  const payload = await response.json().catch(() => ({ detail: 'The server returned an invalid response.' }));
  if (!response.ok) throw new ApiError(payload.detail || 'Request failed.', response.status);
  return payload as T;
}

export const api = <T,>(path: string, options: RequestOptions = {}) => request<T>(`/api/callcentre/${path}`, options);

export function post<T>(path: string, csrfToken: string, payload: Record<string, unknown>, method = 'POST') {
  return api<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify(payload),
  });
}

/** Loads a call-centre resource and refreshes it every 60 s while the browser tab is visible. */
export function useCallCentre<T>(path: string | null) {
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
        setStatus(reason instanceof ApiError ? reason.status : 0);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { data, error, status, loading, refresh };
}

export const stamp = (value: string | null | undefined) => (value
  ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(value))
  : '--');

export const category = (value: string) => ({
  attendance: 'Lecture', pr: 'PR', mcm: 'MCM', otj: 'OTJ', epa: 'EPA', reminder: 'Reminder', satisfaction: 'Satisfaction',
}[value] || value);

export function issueLabel(issue: Pick<Case, 'source_type' | 'issue_name' | 'issue_date'>) {
  const name = issue.issue_name?.trim() || category(issue.source_type);
  if (issue.source_type !== 'attendance' || !issue.issue_date) return name;
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
    .format(new Date(`${issue.issue_date}T12:00:00Z`));
  return `${name} - ${date}`;
}

export const statusLabel = (value: string) => value.replace(/_/g, ' ');

export const londonDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export const hours = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;

export const accountLabel = (key: string) => (key === 'office' ? 'Office (Accountant)' : 'Student');

export const transcriptStatusLabels: Record<string, string> = {
  ready: 'Ready', pending: 'Processing', disabled: 'Transcription disabled',
  unavailable: 'Transcript unavailable', error: 'Sync failed',
};

export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
