// Presentation rules for the Engagement Centre screens. The server stays authoritative for access and outcomes.
import type { AgentStats, Overview, OverviewCase } from '../api';

export type CallTab = { key: string; label: string; icon: string; hint: string; reasons: [string, string][] };

export const CALL_TABS: CallTab[] = [
  // Missed monthly coaching, missed progress reviews and missing signatures have no source connected yet, so they show 0.
  { key: 'missed', label: 'Missed', icon: 'calendar',
    reasons: [['attendance', 'Missed session'], ['mcm_missed', 'Missed monthly coaching'], ['pr_missed', 'Missed progress review'], ['signature', 'Missing signature']],
    hint: 'Check the missed activity and agree a new time. Request outstanding signatures without rebooking a completed meeting.' },
  { key: 'due', label: 'Due', icon: 'calendar', reasons: [['mcm', 'Monthly coaching'], ['pr', 'Progress review'], ['otj', 'Off-the-job hours'], ['epa', 'EPA']],
    hint: 'Monthly coaching, progress reviews, off-the-job hours and EPA preparation that are overdue. Agree a booking or a support action.' },
  { key: 'nextday', label: 'Next Day', icon: 'calendar', reasons: [],
    hint: 'Confirm tomorrow’s coaching sessions and reviews with each learner.' },
  { key: 'learner_satisfaction', label: 'Learner Satisfaction', icon: 'people', reasons: [],
    hint: 'Active and Onboarding learners: complete a satisfaction review every three calendar months. First reviews are due now. Unanswered calls and emails do not complete a review.' },
  { key: 'employer_satisfaction', label: 'Employer Satisfaction', icon: 'people', reasons: [],
    hint: 'Speak with each line manager every quarter. A survey link is emailed after the call; low scores are escalated.' },
  { key: 'manager', label: 'Extra Calls by Manager', icon: 'message', reasons: [],
    hint: 'Additional calls requested by a manager. Follow the request’s purpose and record the agreed outcome; the case closes when a specialist resolves it.' },
  { key: 'ai', label: 'AI suggestions', icon: 'check', reasons: [],
    hint: 'Cases the AI review suggests closing. Approve to resolve, or reject to return the case to the calling list.' },
];

export const ISSUE_LABELS: Record<string, string> = {
  attendance: 'Missed lecture', pr: 'Progress review overdue', mcm: 'Monthly coaching overdue', otj: 'Off-the-job hours',
  epa: 'EPA preparation', reminder: 'Tomorrow’s appointment', satisfaction: 'Employer satisfaction',
  manual: 'Extra call by manager',
  learner_satisfaction: 'Learner satisfaction',
};

export const ISSUE_ACTIONS: Record<string, string> = {
  attendance: 'Agree a catch-up session.',
  pr: 'Book the overdue progress review with the coach.',
  mcm: 'Book the overdue monthly coaching meeting.',
  otj: 'Agree support to record and recover off-the-job hours.',
  epa: 'Confirm the learner’s EPA preparation and next step.',
  reminder: 'Confirm attendance at tomorrow’s appointment or rebook it.',
  satisfaction: 'Record the line manager’s feedback and any agreed actions.',
  learner_satisfaction: 'Record the learner’s satisfaction score, feedback, any issue and the agreed action. Complete feedback after an answered call.',
};

const OUTCOMES: [string, string][] = [['reached', 'Reached'], ['no_answer', 'No answer'], ['wrong_number', 'Wrong number'], ['callback', 'Callback requested'], ['refused', 'Refused or problem: send to manager']];
const PROMISE_LABELS: Record<string, string> = {
  catch_up_session: 'Book a catch-up session', watch_recording: 'Watch the recording',
  book_pr: 'Book the progress review', book_mcm: 'Book the monthly coaching meeting', log_hours: 'Log off-the-job hours',
  epa_step: 'Complete the EPA step', other: 'Other',
};
export const promiseLabel = (option: string) => PROMISE_LABELS[option] || human(option);

/**
 * Outcome choices for one case. A reached learner is recorded with what they agreed to, as
 * `reached:<option>`; cases with nothing to agree keep a plain "Reached".
 */
export function outcomeChoices(c: Pick<OverviewCase, 'promises'>): [string, string][] {
  const promises = Object.entries(c.promises);
  const reached: [string, string][] = promises.length
    ? promises.map(([option, days]) => [`reached:${option}`, `Agreed: ${promiseLabel(option)} ${days === null ? '(closes the case)' : `(within ${days} day${days === 1 ? '' : 's'})`}`])
    : [['reached', 'Reached']];
  return [...reached, ...OUTCOMES.slice(1)];
}
/** What happens to the case after an outcome choice is saved. */
export function outcomeHelp(choice: string, c: Pick<OverviewCase, 'promises' | 'specialist_closes' | 'attempts'> & { source_type?: string }) {
  const { outcome, option } = splitOutcome(choice);
  if (c.source_type === 'learner_satisfaction') {
    if (outcome === 'reached') return 'Save the call outcome, then use Complete feedback. Only a completed review starts the next three-month period.';
    if (outcome === 'no_answer') return 'The review stays open. Follow up on the chosen date, or the next working morning. Three failed calls need manager follow-up.';
  }
  if (outcome === 'reached' && option) {
    const days = c.promises[option];
    return days === null
      ? 'The case closes now: the learner has agreed to book it.'
      : `The case waits ${days} day${days === 1 ? '' : 's'} for proof. If nothing shows up, it comes back to the top of the list.`;
  }
  return {
    reached: c.specialist_closes ? 'Resolve the case once the call’s purpose is done.' : 'The case comes back tomorrow morning unless the learner agrees something.',
    no_answer: `Marked as a missed call and moved to the bottom of the list. After 3 missed calls a manager takes over (${c.attempts} so far).`,
    wrong_number: 'Sent to a manager to find the right number. Say what happened in the note.',
    callback: 'The case comes back to the list at the time you choose.',
    refused: 'Sent to a manager. Say what the learner said in the note.',
  }[outcome] || '';
}

/** Splits an outcome choice into the outcome and the agreed option the server expects. */
export function splitOutcome(choice: string) {
  const [outcome, option = ''] = choice.split(':');
  return { outcome, option };
}

const londonFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
export const londonDate = (value: string | null | undefined) => (value ? londonFormat.format(new Date(value)) : '');
export const nextDay = (today: string) => new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

export const human = (value: string | null | undefined) => String(value || '').replaceAll('_', ' ');
export const longDate = (value: string | null | undefined) => (value
  ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
  : 'Not recorded');
export const shortDate = (value: string | null | undefined) => (value
  ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
  : 'Not set');
export const when = (value: string | null | undefined) => (value
  ? new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : 'Not yet');
export const duration = (seconds: number | null | undefined) => `${Math.floor((Number(seconds) || 0) / 3600)}h ${Math.floor(((Number(seconds) || 0) % 3600) / 60)}m`;

export const issueLabel = (c: Pick<OverviewCase, 'source_type' | 'issue_name'>) =>
  (c.source_type === 'manual' ? c.issue_name : ISSUE_LABELS[c.source_type] || c.issue_name);
/** What the specialist should achieve on the call. */
export const casePurpose = (c: Pick<OverviewCase, 'source_type' | 'issue_name' | 'purpose'>) =>
  (c.source_type === 'manual' ? c.purpose : ISSUE_ACTIONS[c.source_type]) || c.issue_name;
export const activeCase = (c: Pick<OverviewCase, 'status'>) => c.status !== 'resolved';

/** A case is due for a call unless it is waiting on evidence, an AI decision or a future callback. */
export function dueForCall(c: OverviewCase, now = Date.now()) {
  if (!activeCase(c) || ['pending_verification', 'ai_suggested_close'].includes(c.status)) return false;
  if (c.source_type === 'learner_satisfaction' && Date.parse(c.due_at) > now) return false;
  return !c.next_followup_at || Date.parse(c.next_followup_at) <= now;
}

export function categoryFor(c: OverviewCase, today: string) {
  if (c.status === 'ai_suggested_close') return 'ai';
  if (c.source_type === 'attendance') return 'missed';
  if (['pr', 'mcm', 'otj', 'epa'].includes(c.source_type)) return 'due';
  if (c.source_type === 'reminder') return londonDate(c.booking_at) === nextDay(today) ? 'nextday' : null;
  if (c.source_type === 'satisfaction') return 'employer_satisfaction';
  if (c.source_type === 'learner_satisfaction') return 'learner_satisfaction';
  if (c.source_type === 'manual') return 'manager';
  return null;
}

export const categoryCases = (cases: OverviewCase[], key: string, today: string) =>
  cases.filter(c => activeCase(c) && categoryFor(c, today) === key);

export const contactKey = (c: Pick<OverviewCase, 'learner_email'> & { contact_key?: string; id?: number }) =>
  c.contact_key || c.learner_email.toLowerCase() || `case:${c.id}`;

/** The server already orders by priority; keep the first case per learner. */
export function uniqueLearners(cases: OverviewCase[]) {
  const seen = new Set<string>();
  return cases.filter(c => {
    const key = contactKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CallGroup = { key: string; label: string; purpose: string; cases: OverviewCase[] };

export function callGroups(cases: OverviewCase[], mode: string): CallGroup[] {
  const groups = new Map<string, CallGroup>();
  for (const c of cases) {
    let identity: string[];
    let label: string;
    if (mode === 'class') {
      if (c.source_type !== 'attendance' || !c.issue_date) continue;
      identity = [c.issue_name, c.issue_date];
      label = `${c.issue_name} · ${c.issue_date}`;
    } else if (mode === 'programme') {
      if (!c.programme) continue;
      identity = [c.programme];
      label = c.programme;
    } else if (mode === 'event') {
      continue;
    } else {
      if (!c.coach) continue;
      identity = [c.coach];
      label = c.coach;
    }
    // Never batch different reasons together.
    const key = JSON.stringify([mode, c.source_type, ...identity]);
    if (!groups.has(key)) groups.set(key, { key, label, purpose: issueLabel(c), cases: [] });
    groups.get(key)!.cases.push(c);
  }
  return [...groups.values()].map(g => ({ ...g, cases: uniqueLearners(g.cases) }));
}

export function matchesSearch(c: OverviewCase, query: string) {
  const q = query.trim().toLowerCase();
  return !q || [c.learner_name, c.learner_email, c.learner_phone, c.programme, c.coach, c.organisation].join(' ').toLowerCase().includes(q);
}

/** Daily points from verified Zoom records: call-time target (100) and completed calls (5 each, 100). Quality is not scored. */
export function points(today: AgentStats['today'], target: number) {
  return Math.round(Math.min(100, target ? (today.seconds / target) * 100 : 0)) + Math.min(100, today.connected * 5);
}

export function badges(today: AgentStats['today'], target: number) {
  return [
    ...(target && today.seconds >= target ? ['Call-time target'] : []),
    ...(today.connected >= 10 ? ['Ten connections'] : []),
  ];
}

export const caseTone = (c: Pick<OverviewCase, 'status' | 'sla_breached'>) =>
  c.status === 'resolved' ? 'green' : c.status === 'escalated' ? 'red' : c.sla_breached ? 'amber' : '';

export function shortGuide(c: Pick<OverviewCase, 'learner_name' | 'source_type' | 'manager_name' | 'purpose'>, operator: string) {
  const first = (c.source_type === 'satisfaction' ? c.manager_name || c.learner_name : c.learner_name).split(' ')[0];
  const op = operator.split(' ')[0];
  const questions: Record<string, string> = {
    otj: 'What learning have you completed recently? What is making it difficult to record or complete your hours? What support would help this week?',
    reminder: 'Can you confirm tomorrow’s appointment and whether you can attend? Do we need to arrange another time?',
    attendance: 'What prevented you from attending? Can we book you a catch-up session?',
    satisfaction: 'What is going well with teaching and coaching? What could we improve, and is there any support you need?',
    learner_satisfaction: 'How satisfied are you with your learning and coaching, from 1 to 5? What is going well, what could improve, and what support would help?',
  };
  return [
    `Hello ${first}, it’s ${op} from Kent Business College. Is now a good time? Calls are recorded for quality and follow-up; confirm you are comfortable before continuing.`,
    (c.source_type === 'manual' && c.purpose) || questions[c.source_type] || 'What is your current position with this action? What would help you take the next step?',
    'Agree an action, its owner and a date. Check understanding and confirm how the learner will receive the next steps.',
  ];
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) || /^[=+\-@]/.test(text) ? `"${text.replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"` : text;
};
export const csvText = (headers: string[], rows: Record<string, unknown>[]) =>
  [headers.join(','), ...rows.map(row => headers.map(h => csvCell(row[h])).join(','))].join('\r\n');

export const DESK_MENUS: [string, string, string][] = [
  ['next', 'Next call', 'phone'],
  ...CALL_TABS.map(tab => [tab.key, tab.label, tab.icon] as [string, string, string]),
  ['groups', 'Call groups', 'people'], ['bookings', 'Coach booking links', 'calendar'], ['followups', 'Follow-ups', 'calendar'],
  ['history', 'History', 'clock'], ['progress', 'My progress', 'chart'], ['reports', 'Reports', 'file'],
];

export const deskLabel = (overview: Overview, key: string) => {
  const menu = DESK_MENUS.find(item => item[0] === key);
  if (!menu) return 'Call next';
  const cases = categoryCases(overview.cases, key, overview.today);
  const counted = key === 'learner_satisfaction' ? cases.filter(c => dueForCall(c)) : cases;
  return CALL_TABS.some(tab => tab.key === key) ? `${menu[1]} (${uniqueLearners(counted).length})` : menu[1];
};

export type AllocationChange = { email: string; agent_id: number | null; revision: number };

/**
 * Who each selected learner moves to. "even" balances total learners per specialist, counting existing
 * allocations and keeping a learner's current specialist on a tie; unselected learners never move.
 */
export function allocationPlan(learners: AllocationChange[], selected: Set<string>, operators: number[], target: 'even' | number | null) {
  if (target === 'even' && !operators.length) throw new Error('There are no active specialists.');
  if (typeof target === 'number' && !operators.includes(target)) throw new Error('Choose an active specialist.');
  const counts = new Map(operators.map(id => [id, learners.filter(l => !selected.has(l.email) && l.agent_id === id).length]));
  return learners.filter(l => selected.has(l.email)).sort((a, b) => a.email.localeCompare(b.email)).flatMap(l => {
    let owner = target === 'even' ? null : target;
    if (target === 'even') {
      const fewest = Math.min(...counts.values());
      const choices = operators.filter(id => counts.get(id) === fewest);
      owner = l.agent_id !== null && choices.includes(l.agent_id) ? l.agent_id : choices[0];
      counts.set(owner, (counts.get(owner) || 0) + 1);
    }
    return owner === l.agent_id ? [] : [{ email: l.email, agent_id: owner, revision: l.revision }];
  });
}

export type AllocationGroup = { key: string; emails: string[] };
export type GroupChoice = 'even' | number | null;

/** Hands each whole group to one specialist: largest groups first, always to whoever has the fewest learners so far. */
export function balanceGroups(groups: AllocationGroup[], operators: number[]) {
  const load = new Map(operators.map(id => [id, 0]));
  const choices = new Map<string, GroupChoice>();
  if (!operators.length) return choices;
  for (const group of [...groups].sort((a, b) => b.emails.length - a.emails.length || a.key.localeCompare(b.key))) {
    const id = operators.reduce((best, next) => ((load.get(next) || 0) < (load.get(best) || 0) ? next : best));
    choices.set(group.key, id);
    load.set(id, (load.get(id) || 0) + group.emails.length);
  }
  return choices;
}

/** One plan from per-group choices. A learner in several groups (several modules) follows the first group listed. */
export function groupedPlan(learners: AllocationChange[], groups: AllocationGroup[], choices: Map<string, GroupChoice>, operators: number[]) {
  const planned = new Set<string>();
  const changes: AllocationChange[] = [];
  for (const group of groups) {
    const choice = choices.get(group.key);
    if (choice === undefined) continue;
    const fresh = new Set(group.emails.filter(email => !planned.has(email)));
    fresh.forEach(email => planned.add(email));
    changes.push(...allocationPlan(learners, fresh, operators, choice));
  }
  return changes;
}
