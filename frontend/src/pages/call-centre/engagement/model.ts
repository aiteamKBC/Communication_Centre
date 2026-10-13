// Presentation rules for the Engagement Centre screens. The server stays authoritative for access and outcomes.
import type { AgentStats, CallRating, Case, Overview, OverviewCase } from '../api';

export type CallTab = { key: string; label: string; icon: string; hint: string; reasons: [string, string][] };

/** Recurring feedback calls: completed by the feedback form after an answered call, due again three months later. */
export const isSatisfaction = (c: { source_type?: string }) => c.source_type === 'learner_satisfaction' || c.source_type === 'employer_feedback';

export const CALL_TABS: CallTab[] = [
  { key: 'missed', label: 'Missed', icon: 'calendar',
    reasons: [['attendance', 'Missed session'], ['mcm_missed', 'Missed monthly coaching'], ['pr_missed', 'Missed progress review'], ['signature', 'Missing signature']],
    hint: 'Check the missed activity and agree a new time. Request outstanding signatures without rebooking a completed meeting.' },
  { key: 'due', label: 'Due', icon: 'calendar', reasons: [['mcm', 'Monthly coaching'], ['pr', 'Progress review'], ['otj', 'Off-the-job hours'], ['epa', 'EPA']],
    hint: 'Monthly coaching, progress reviews, off-the-job hours and EPA preparation that are overdue. Agree a booking or a support action.' },
  { key: 'nextday', label: 'Next Day', icon: 'calendar', reasons: [],
    hint: 'Confirm tomorrow’s coaching sessions and reviews with each learner.' },
  { key: 'learner_satisfaction', label: 'Learner Satisfaction', icon: 'people', reasons: [],
    hint: 'Active, Delivery and Onboarding learners: complete a satisfaction review every three calendar months. First reviews are due now. Unanswered calls and emails do not complete a review.' },
  { key: 'employer_satisfaction', label: 'Employer Satisfaction', icon: 'people', reasons: [],
    hint: 'Each employer (line manager) with their learners: complete a feedback call every three calendar months. Unanswered calls do not complete a review.' },
  { key: 'manager', label: 'Extra Calls by Manager', icon: 'message', reasons: [],
    hint: 'Additional calls requested by a manager. Follow the request’s purpose and record the agreed outcome; the case closes when a specialist resolves it.' },
  { key: 'tech', label: 'Technical issues', icon: 'settings', reasons: [],
    hint: 'Technical issues raised in the technical support system. A ticket waits there until support closes it; then call the learner to confirm it is fixed and resolve the case.' },
];


export const ISSUE_LABELS: Record<string, string> = {
  attendance: 'Missed lecture', pr: 'Progress review overdue', mcm: 'Monthly coaching overdue',
  pr_missed: 'Missed progress review', mcm_missed: 'Missed monthly coaching', signature: 'Missing signature', otj: 'Off-the-job hours',
  epa: 'EPA preparation', reminder: 'Tomorrow’s appointment', manual: 'Extra call by manager',
  learner_satisfaction: 'Learner satisfaction', employer_feedback: 'Employer satisfaction', tech_support: 'Technical issue',
};

export const ISSUE_ACTIONS: Record<string, string> = {
  attendance: 'Agree a catch-up session.',
  pr: 'Book the overdue progress review with the coach.',
  mcm: 'Book the overdue monthly coaching meeting.',
  pr_missed: 'Find out why the progress review was missed and agree to rebook it.',
  mcm_missed: 'Find out why the monthly coaching meeting was missed and agree to rebook it.',
  signature: 'Ask the learner to sign the review in the LMS.',
  otj: 'Agree support to record and recover off-the-job hours.',
  epa: 'Confirm the learner’s EPA preparation and next step.',
  reminder: 'Confirm attendance at tomorrow’s appointment or rebook it.',
  tech_support: 'Confirm with the learner that the technical issue is fixed, then resolve the case.',
  employer_feedback: 'Record the employer’s satisfaction score, feedback, any issue and the agreed action. Complete feedback after an answered call.',
  learner_satisfaction: 'Record the learner’s satisfaction score, feedback, any issue and the agreed action. Complete feedback after an answered call.',
};

/** The help-desk ticket on a technical-issue case, in words. */
export function helpdeskStatus(helpdesk: NonNullable<Case['helpdesk']>) {
  const status = helpdesk.helpdesk_status || 'Open';
  if (status === 'Closed') return 'Closed in the ticket system: awaiting learner confirmation';
  return `${status} in the ticket system${helpdesk.helpdesk_reason ? ` · ${helpdesk.helpdesk_reason}` : ''}`;
}

const OUTCOMES: [string, string][] = [['reached', 'Reached'], ['no_answer', 'No answer'], ['wrong_number', 'Wrong number'], ['callback', 'Callback requested'], ['refused', 'Refused or problem']];
const PROMISE_LABELS: Record<string, string> = {
  catch_up_session: 'Book a catch-up session', watch_recording: 'Watch the recording',
  book_pr: 'Book the progress review', book_mcm: 'Book the monthly coaching meeting', log_hours: 'Log off-the-job hours',
  epa_step: 'Complete the EPA step', sign_review: 'Sign the review', other: 'Other',
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
  if (isSatisfaction(c)) {
    if (outcome === 'reached') return 'Save the call outcome, then use Complete feedback. Only a completed review starts the next three-month period.';
    if (outcome === 'no_answer') return 'The review stays open. Follow up on the chosen date, or the next working morning. If it cannot be done, close it without feedback.';
  }
  if (outcome === 'reached' && option) {
    const days = c.promises[option];
    return days === null
      ? 'The case closes now: the learner has agreed to do it.'
      : `The case waits ${days} day${days === 1 ? '' : 's'} for proof. If nothing shows up, it comes back to the top of the list.`;
  }
  return {
    reached: c.specialist_closes ? 'Resolve the case once the call’s purpose is done.' : 'The case comes back tomorrow morning unless the learner agrees something.',
    no_answer: `Marked as a missed call and moved to the bottom of the list (${c.attempts} unanswered so far).`,
    wrong_number: 'Recorded on the case; it comes back next working day. Say what happened in the note.',
    callback: 'The case comes back to the list at the time you choose.',
    refused: 'Recorded on the case; it comes back next working day. Say what the learner said in the note.',
  }[outcome] || '';
}

/** Splits an outcome choice into the outcome and the agreed option the server expects. */
export function splitOutcome(choice: string) {
  const [outcome, option = ''] = choice.split(':');
  return { outcome, option };
}

const londonFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
export const londonDate = (value: string | null | undefined) => (value ? londonFormat.format(new Date(value)) : '');
const londonClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });

/** `hour`:00 London time, `workdays` working days (Mon-Fri) after today London time. */
export function londonWorkdayAt(workdays: number, hour: number) {
  const day = new Date(`${londonDate(new Date().toISOString())}T12:00:00Z`);
  for (let left = workdays; left > 0;) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() % 6 !== 0) left -= 1;
  }
  return londonWallTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, 0);
}

/** A London wall-clock time as an instant: taken as UTC, then London's offset from UTC at that moment removed. */
function londonWallTime(year: number, month: number, day: number, hour: number, minute: number) {
  const guess = Date.UTC(year, month, day, hour, minute);
  const part = Object.fromEntries(londonClock.formatToParts(new Date(guess)).map(p => [p.type, Number(p.value)]));
  const offset = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - guess;
  return new Date(guess - offset);
}

/** A datetime-local value ("2026-10-08T10:00") read as London time, whatever the computer's time zone. */
export function londonInput(value: string) {
  const [date, time = '00:00'] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return londonWallTime(year, month - 1, day, hour, minute);
}

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

// Review cases name their LMS review type; the two kinds of progress review are told apart this way.
const REVIEW_CASES = new Set(['pr', 'mcm', 'pr_missed', 'mcm_missed', 'signature']);
const PLAIN_REVIEW_NAMES = new Set(['progress review', 'monthly coaching meeting']);
export const issueLabel = (c: Pick<OverviewCase, 'source_type' | 'issue_name'>) => {
  if (c.source_type === 'manual') return c.issue_name;
  const label = ISSUE_LABELS[c.source_type] || c.issue_name;
  const named = REVIEW_CASES.has(c.source_type) && c.issue_name
    && (c.source_type === 'signature' || !PLAIN_REVIEW_NAMES.has(c.issue_name.toLowerCase()));
  return named ? `${label}: ${c.issue_name}` : label;
};
/** What the specialist should achieve on the call. */
export const casePurpose = (c: Pick<OverviewCase, 'source_type' | 'issue_name' | 'purpose'>) =>
  (c.source_type === 'manual' ? c.purpose : ISSUE_ACTIONS[c.source_type]) || c.issue_name;
export const activeCase = (c: Pick<OverviewCase, 'status'>) => c.status !== 'resolved';

/** A case is due for a call unless it is waiting on evidence, an AI decision or a future callback. */
export function dueForCall(c: OverviewCase, now = Date.now()) {
  if (!activeCase(c) || ['pending_verification', 'ai_suggested_close'].includes(c.status)) return false;
  return !c.next_followup_at || Date.parse(c.next_followup_at) <= now;
}

export function categoryFor(c: OverviewCase, today: string, nextWorkday: string) {
  if (c.source_type === 'tech_support') return 'tech';
  if (c.status === 'ai_suggested_close') return 'ai';
  if (['attendance', 'pr_missed', 'mcm_missed', 'signature'].includes(c.source_type)) return 'missed';
  if (['pr', 'mcm', 'otj', 'epa'].includes(c.source_type)) return 'due';
  if (c.source_type === 'reminder') return londonDate(c.booking_at) === nextWorkday ? 'nextday' : null;
  if (c.source_type === 'employer_feedback') return 'employer_satisfaction';
  if (c.source_type === 'learner_satisfaction') return 'learner_satisfaction';
  if (c.source_type === 'manual') return 'manager';
  return null;
}

export const categoryCases = (cases: OverviewCase[], key: string, today: string, nextWorkday: string) =>
  cases.filter(c => activeCase(c) && categoryFor(c, today, nextWorkday) === key);

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
  c.status === 'resolved' ? 'green' : c.sla_breached ? 'amber' : '';

export function shortGuide(c: Pick<OverviewCase, 'learner_name' | 'source_type' | 'purpose'>, operator: string) {
  const first = c.learner_name.split(' ')[0];
  const op = operator.split(' ')[0];
  const questions: Record<string, string> = {
    otj: 'What learning have you completed recently? What is making it difficult to record or complete your hours? What support would help this week?',
    reminder: 'Can you confirm tomorrow’s appointment and whether you can attend? Do we need to arrange another time?',
    attendance: 'What prevented you from attending? Can we book you a catch-up session?',
    pr_missed: 'What stopped the progress review going ahead? Can we agree a new time with your coach?',
    mcm_missed: 'What stopped the coaching meeting going ahead? Can we agree a new time with your coach?',
    signature: 'Your review is waiting for your signature in the LMS. Can you sign it today? Do you need help finding it?',
    employer_feedback: 'How satisfied are you with the apprenticeship and our coaching, from 1 to 5? How are your learners progressing, what could we improve, and what support would help?',
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
  ['history', 'History', 'clock'], ['progress', 'My progress', 'chart'], ['reviews', 'My call reviews', 'chart'],
  ['reports', 'Reports', 'file'],
];

/** Calls the AI actually judged (excludes not rated). */
export const ratedCalls = (counts: Record<CallRating, number> | undefined) => (counts ? counts.excellent + counts.good + counts.bad : 0);

export const deskLabel = (overview: Overview, key: string) => {
  const menu = DESK_MENUS.find(item => item[0] === key);
  if (!menu) return 'Call next';
  const cases = categoryCases(overview.cases, key, overview.today, overview.next_workday);
  const counted = key === 'learner_satisfaction' || key === 'employer_satisfaction' ? cases.filter(c => dueForCall(c)) : cases;
  return CALL_TABS.some(tab => tab.key === key) ? `${menu[1]} (${uniqueLearners(counted).length})` : menu[1];
};

export type AllocationChange = { email: string; agent_id: number | null; revision: number };
/** Learners who must stay with one specialist: an employer's (line manager's) learners, or one learner on their own. */
export type AllocationUnit = { key: string; emails: string[] };

/**
 * Hands whole units to specialists so each gets a similar number of learners. A unit stays with the
 * specialist who has most of it while that stays within a fair share, so as few learners as possible move;
 * the rest go, largest first, to whoever has the fewest so far. Returns learner email -> specialist.
 */
export function balanceUnits(units: AllocationUnit[], current: Map<string, number | null>, operators: number[]) {
  const owners = new Map<string, number>();
  if (!operators.length) return owners;
  const load = new Map(operators.map(id => [id, 0]));
  const share = Math.ceil(units.reduce((sum, unit) => sum + unit.emails.length, 0) / operators.length);
  const give = (unit: AllocationUnit, id: number) => {
    unit.emails.forEach(email => owners.set(email, id));
    load.set(id, (load.get(id) || 0) + unit.emails.length);
  };
  const rest: AllocationUnit[] = [];
  for (const unit of [...units].sort((a, b) => b.emails.length - a.emails.length || a.key.localeCompare(b.key))) {
    const counts = new Map<number, number>();
    for (const email of unit.emails) {
      const id = current.get(email);
      if (id != null && load.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const keep = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    if (keep !== undefined && (load.get(keep) || 0) + unit.emails.length <= share) give(unit, keep);
    else rest.push(unit);
  }
  for (const unit of rest) give(unit, operators.reduce((best, next) => ((load.get(next) || 0) < (load.get(best) || 0) ? next : best)));
  return owners;
}

/** Units whose learners would be with more than one specialist (the shared queue counts as one). */
export const splitUnits = <T extends AllocationUnit>(units: T[], ownerOf: (email: string) => number | null) =>
  units.filter(unit => new Set(unit.emails.map(ownerOf)).size > 1);
