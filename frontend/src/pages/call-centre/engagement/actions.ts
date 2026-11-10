import { api, post } from '../api';
import type { CaseDetail, OverviewCase } from '../api';
import { shortDate } from './model';

/** Who is working: `name` is the specialist whose desk is shown (the signed-in user outside a preview). */
export type Session = { csrf: string; agentId: number | null; canAct: boolean; isManager: boolean; preview: boolean; name: string;
  /** False on another specialist's desk: Zoom records calls under the caller's own account, so they would not attach. */
  ownDesk?: boolean;
  /** Technical issues can be raised in the technical support system. */
  helpdesk?: boolean;
  /** This desk makes the employer satisfaction calls only (the director chose it as an employer specialist). */
  employerDesk?: boolean };

type ActionResult = { zoom_url?: string; tel_url?: string; number?: string; caller_id?: string; applied?: boolean; held?: boolean;
  /** From Call: the cases the call covers. */
  ticket_ids?: number[] };

/** Runs a case command as the session's operating agent. A call hands the number to the Zoom desktop app. */
export async function caseAction(session: Session, id: number, command: string, payload: Record<string, unknown> = {}) {
  const result = await post<ActionResult>(`tickets/${id}/${command}/`, session.csrf, { ...payload, agent_id: session.agentId });
  if ((command === 'call' || command === 'employer_call') && result.zoom_url) window.location.href = result.zoom_url;
  return result;
}

/** The call just ended: ask the worker to fetch it from Zoom now instead of at its next cycle. Best effort only. */
export function requestCallSync(session: Session) {
  if (session.preview || !session.canAct) return;
  post('call-sync/', session.csrf, {}).catch(() => {});
}

/** One case; with `agentId`, its open call is the one that specialist's desk made. */
export const loadCase = (id: number, agentId?: number | null, history = false) => {
  const query = new URLSearchParams({ ...(agentId ? { agent_id: String(agentId) } : {}), ...(history ? { history: '1' } : {}) }).toString();
  return api<CaseDetail>(`tickets/${id}/${query ? `?${query}` : ''}`);
};

/** Why the Call button is unavailable for a case, or '' when the session can call. A `recall` calls a held case now,
 * so its follow-up date is no reason to wait. */
export function callDisabledReason(c: OverviewCase, session: Session, now = Date.now(), recall = false) {
  if (session.preview) return 'Read-only preview';
  if (c.status === 'resolved') return 'Case is not active';
  // A director's task: only its receiver calls the learner (a director still can).
  if (c.cover?.direct && c.cover.to_agent_id !== session.agentId && !session.isManager) return `Covered by ${c.cover.to_name}`;
  if (!recall && c.next_followup_at && Date.parse(c.next_followup_at) > now) return 'Follow-up not due yet';
  if (c.claimed_agent_id && c.claimed_agent_id !== session.agentId) return `In progress with ${c.claimed_by}`;
  const phone = c.employer_signature_missing && session.employerDesk ? c.call_phone : c.learner_phone;
  if (!phone?.trim()) return 'No number recorded';
  if (!session.agentId) return 'Agent profile needed';
  // TEMPORARY: the director may call from any specialist's desk until every specialist has their own account.
  // Remove `!session.isManager` once they do.
  if (session.ownDesk === false && !session.isManager) return 'Calls go out from your own Zoom account: call from your own desk';
  return '';
}

/** A case held after an unanswered call that its list can call again now (Recall): the tries used and left. Null for a
 * case that is due (it is simply called) or held for any other reason. */
export function recallFor(c: OverviewCase, now = Date.now()) {
  if (!c.recall || c.status === 'resolved' || !c.next_followup_at || Date.parse(c.next_followup_at) <= now) return null;
  return { ...c.recall, left: Math.max(0, c.recall.max - c.recall.used) };
}
export type RecallState = NonNullable<ReturnType<typeof recallFor>>;

/** Beside a Recall button: when the case comes back by itself, and whether it can be recalled now. */
export const recallHint = (recall: RecallState, followUp: string | null) => (recall.left
  ? `Not answered: back on the list ${shortDate(followUp)}. Recall to try again now.`
  : `All ${recall.max} recalls used: back on the list ${shortDate(followUp)}.`);

/** Saves a case's outcome. The server attaches it to the case's last call (never an earlier one): held while Zoom may
 * still report that call (`applied: false`), saved without a call when Zoom has none, so a save is never refused for want of one. */
export function saveOutcome(session: Session, id: number, data: { outcome: string; note: string; option?: string; callback_at?: string | null }) {
  return caseAction(session, id, 'plan', { option: data.option || '', note: data.note, outcome: data.outcome, callback_at: data.callback_at || null });
}
