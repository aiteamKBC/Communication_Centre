import { api, post } from '../api';
import type { CaseCall, CaseDetail, OverviewCase } from '../api';
import { dialInPage } from './smartEmbed';

/** Who is working: `name` is the specialist whose desk is shown (the signed-in user outside a preview). */
export type Session = { csrf: string; agentId: number | null; canAct: boolean; isManager: boolean; preview: boolean; name: string;
  /** False on another specialist's desk: Zoom records calls under the caller's own account, so they would not attach. */
  ownDesk?: boolean;
  /** Technical issues can be raised in the technical support system. */
  helpdesk?: boolean };

type ActionResult = { zoom_url?: string; tel_url?: string; number?: string; caller_id?: string; applied?: boolean };

/** Runs a case command as the session's operating agent. A call dials in the page's Zoom phone (Smart Embed)
 * when it is there, otherwise it hands the number to the Zoom desktop app. */
export async function caseAction(session: Session, id: number, command: string, payload: Record<string, unknown> = {}) {
  const result = await post<ActionResult>(`tickets/${id}/${command}/`, session.csrf, { ...payload, agent_id: session.agentId });
  if (command === 'call' && !(result.number && dialInPage(result.number, result.caller_id)) && result.zoom_url) {
    window.location.href = result.zoom_url;
  }
  return result;
}

export const loadCase = (id: number) => api<CaseDetail>(`tickets/${id}/`);

/** Why the Call button is unavailable for a case, or '' when the session can call. */
export function callDisabledReason(c: OverviewCase, session: Session, now = Date.now()) {
  if (session.preview) return 'Read-only preview';
  if (c.status === 'resolved') return 'Case is not active';
  if (c.next_followup_at && Date.parse(c.next_followup_at) > now) return 'Follow-up not due yet';
  if (c.claimed_agent_id && c.claimed_agent_id !== session.agentId) return `In progress with ${c.claimed_by}`;
  if (!c.learner_phone?.trim()) return 'No number recorded';
  if (!session.agentId) return 'Agent profile needed';
  // TEMPORARY: the director may call from any specialist's desk until every specialist has their own account.
  // Remove `!session.isManager` once they do.
  if (session.ownDesk === false && !session.isManager) return 'Calls go out from your own Zoom account: call from your own desk';
  return '';
}

const FAILED = ['no_answer', 'missed', 'busy', 'voicemail', 'rejected'];

/** The call an outcome belongs to: the newest one in this cycle, made by this specialist (any for a manager),
 * whose Zoom result fits the outcome. Calls arrive newest first. */
export function pickCall(calls: CaseCall[], outcome: string, session: Session) {
  const usable = calls.filter(call => call.current && (session.isManager || call.agent_id === session.agentId));
  const fits = (call: CaseCall) => (outcome === 'no_answer' ? FAILED.includes(call.result)
    : outcome === 'wrong_number' || call.result === 'answered');
  return usable.find(call => !call.outcome && fits(call)) || usable.find(fits) || usable[0];
}

/** Records an outcome against the Zoom call it belongs to (``pickCall``). */
export async function saveOutcome(session: Session, id: number, data: { outcome: string; note: string; option?: string; callback_at?: string | null }) {
  const detail = await loadCase(id);
  const call = pickCall(detail.calls, data.outcome, session);
  if (!call) throw new Error('Zoom has not reported a call for this case yet. Call the learner, then save once the call appears (sync runs every few minutes).');
  return caseAction(session, id, 'outcome', { call_id: call.call_id, option: data.option || '', note: data.note, outcome: data.outcome, callback_at: data.callback_at || null });
}
