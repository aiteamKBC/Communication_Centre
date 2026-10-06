import { api, post } from '../api';
import type { CaseDetail, OverviewCase } from '../api';

/** Who is working: `name` is the specialist whose desk is shown (the signed-in user outside a preview). */
export type Session = { csrf: string; agentId: number | null; canAct: boolean; isManager: boolean; preview: boolean; name: string };

/** Runs a case command as the session's operating agent; a call hands the number to the Zoom desktop app. */
export async function caseAction(session: Session, id: number, command: string, payload: Record<string, unknown> = {}) {
  const result = await post<{ zoom_url?: string; tel_url?: string; applied?: boolean }>(`tickets/${id}/${command}/`, session.csrf, { ...payload, agent_id: session.agentId });
  if (command === 'call' && result.zoom_url) window.location.href = result.zoom_url;
  return result;
}

export const loadCase = (id: number) => api<CaseDetail>(`tickets/${id}/`);

/** Why the Call button is unavailable for a case, or '' when the session can call. */
export function callDisabledReason(c: OverviewCase, session: Session, now = Date.now()) {
  if (session.preview) return 'Read-only preview';
  if (c.status === 'resolved') return 'Case is not active';
  if (c.attempts >= 3) return '3 attempts made: manager follow-up';
  if (c.next_followup_at && Date.parse(c.next_followup_at) > now) return 'Follow-up not due yet';
  if (c.claimed_agent_id && c.claimed_agent_id !== session.agentId) return `In progress with ${c.claimed_by}`;
  if (!c.learner_phone?.trim()) return 'No number recorded';
  if (!session.agentId) return 'Agent profile needed';
  return '';
}

/** Records an outcome against the most recent Zoom call linked to the case. */
export async function saveOutcome(session: Session, id: number, data: { outcome: string; note: string; option?: string; callback_at?: string | null }) {
  const detail = await loadCase(id);
  const call = detail.calls.find(item => !item.outcome) || detail.calls[0];
  if (!call) throw new Error('Zoom has not reported a call for this case yet. Call the learner, then save once the call appears (sync runs every few minutes).');
  return caseAction(session, id, 'outcome', { call_id: call.call_id, option: data.option || '', note: data.note, outcome: data.outcome, callback_at: data.callback_at || null });
}
