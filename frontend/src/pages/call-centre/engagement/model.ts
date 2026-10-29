// Presentation rules for the Engagement Centre screens. The server stays authoritative for access and outcomes.
import type { AgentStats, BookingLinks, CallRating, Case, DelegatedTask, Overview, OverviewCase } from '../api';

export type CallTab = { key: string; label: string; icon: string; hint: string; reasons: [string, string][] };

/** Recurring feedback calls: completed by the feedback form after an answered call, due again three months later. */
export const isSatisfaction = (c: { source_type?: string }) => c.source_type === 'learner_satisfaction' || c.source_type === 'employer_feedback';

/** The explicit satisfaction email recipient; employer cases use the line manager email from Aptem. */
export const satisfactionRecipient = (c: Pick<OverviewCase, 'source_type' | 'learner_email' | 'manager_email'>) =>
  c.source_type === 'employer_feedback' ? c.manager_email : c.learner_email;

export const CALL_TABS: CallTab[] = [
  // Off-the-job hours cases are paused on the server (rules.PAUSED_CATEGORIES); add ['otj', 'Off-the-job hours'] back with them.
  { key: 'due', label: 'Due', icon: 'calendar', reasons: [['mcm', 'Monthly coaching'], ['pr', 'Progress review'], ['epa', 'EPA']],
    hint: 'Progress reviews and monthly coaching that are due but not booked yet: send the booking email. EPA: learners past their end date; check their gateway and EPA position and agree the next step.' },
  { key: 'nextday', label: 'Next Day', icon: 'calendar', reasons: [],
    hint: 'Appointments on the next working day. Confirm each learner will attend; if they cannot, ask them to contact their coach to rearrange.' },
  { key: 'missed', label: 'Missed', icon: 'calendar',
    reasons: [['attendance', 'Missed session'], ['mcm_missed', 'Missed monthly coaching'], ['pr_missed', 'Missed progress review'], ['signature', 'Missing signature']],
    hint: 'Missed lectures, reviews that were booked but are not completed, and finished reviews waiting for a signature. Agree a catch-up or a new review time; for a signature, ask the learner to sign in the LMS (nothing to book).' },
  { key: 'learner_satisfaction', label: 'Learner Satisfaction', icon: 'people', reasons: [],
    hint: 'Active, Delivery and Onboarding learners: complete a satisfaction review every three calendar months. First reviews are due now. Unanswered calls and emails do not complete a review.' },
  { key: 'employer_satisfaction', label: 'Employer Satisfaction', icon: 'people', reasons: [],
    hint: 'Each employer (line manager) with their learners: complete a feedback call every three calendar months. Unanswered calls do not complete a review.' },
  { key: 'missing_signature', label: 'MISSING SIGNATURE', icon: 'message', reasons: [],
    hint: 'Employer signatures confirmed missing in the LMS. Call the employer, ask them to sign the review, and use Email to send a reminder.' },
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
  attendance: 'The register shows the learner absent from this lecture. Find out why, then agree they attend the same lecture with another group (this closes the case), book a catch-up session with their coach (Book with coach) or send the booking email.',
  pr: 'The progress review is due and not booked yet. Agree when the learner will book it and send the booking email with their coach’s progress review link.',
  mcm: 'The monthly coaching meeting is due and not booked yet. Agree when the learner will book it and send the booking email with their coach’s coaching link.',
  pr_missed: 'The progress review was booked but is not completed in the LMS. Check whether it went ahead; if not, send the booking email so the learner can rebook it.',
  mcm_missed: 'The monthly coaching meeting was booked but is not completed in the LMS. Check whether it went ahead; if not, send the booking email so the learner can rebook it.',
  signature: 'The review is finished and waiting for the learner’s signature. Ask them to sign it in the LMS; there is nothing to book.',
  otj: 'Agree support to record and recover off-the-job hours.',
  epa: 'The learner is past their programme end date and still active. Check where they are with gateway and the end-point assessment and agree the next step; book a support session with their coach if they need help.',
  reminder: 'Confirm the learner will attend tomorrow’s appointment; for a progress review, confirm it with their employer too. If they cannot come, cancel it or move it to a time the coach is free, and say why in the note.',
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
  catch_up_session: 'Book a catch-up session', watch_recording: 'Watch the recording', other_group_session: 'Attend this lecture with another group',
  attended_other_group: 'Attended this lecture with another group (covering lecture)',
  book_pr: 'Book the progress review', book_mcm: 'Book the monthly coaching meeting', log_hours: 'Log off-the-job hours',
  epa_step: 'Complete the EPA step', sign_review: 'Sign the review', other: 'Other',
};
export const promiseLabel = (option: string) => PROMISE_LABELS[option] || human(option);
/** A lecture's day from the register (an ISO date, no time): "Tue, 6 Oct 2026". */
export const lectureDay = (date: string | null) => date
  ? new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  : 'Date not recorded';
export const outcomeLabel = (outcome: string) => OUTCOMES.find(([key]) => key === outcome)?.[1] || human(outcome);

/** The other group's session for a missed lecture, in words: "Group B on Thu 6 Nov at 14:00". */
export const otherGroupSession = (session: { starts_at: string; group: string }) => `${session.group || 'another group'} on ${appointmentTime(session.starts_at)}`;
const OTHER_GROUP = 'other_group_session';

/**
 * Outcome choices for one case. A reached learner is recorded with what they agreed to, as
 * `reached:<option>`; cases with nothing to agree keep a plain "Reached".
 */
export function outcomeChoices(c: Pick<OverviewCase, 'promises'> & Partial<Pick<OverviewCase, 'alternative_session'>>): [string, string][] {
  const promises = Object.entries(c.promises);
  const reached: [string, string][] = promises.length
    ? promises.map(([option, days]) => [`reached:${option}`, `Agreed: ${option === OTHER_GROUP && c.alternative_session
      ? `Attend this lecture with ${otherGroupSession(c.alternative_session)}` : promiseLabel(option)} ${days === null ? '(closes the case)' : `(within ${days} day${days === 1 ? '' : 's'})`}`])
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
      : `The case waits ${days} day${days === 1 ? '' : 's'} for proof (or until the follow-up date, if you choose one). If nothing shows up, it comes back to the top of the list.`;
  }
  return {
    reached: c.specialist_closes ? 'Resolve the case once the call’s purpose is done.' : 'The case comes back next working morning (or on the follow-up date, if you choose one) unless the learner agrees something.',
    no_answer: `Marked as a missed call (${c.attempts} unanswered so far). Held until the next working morning (or the follow-up date, if you choose one), then back at the bottom of the list.`,
    wrong_number: 'Recorded on the case; it comes back next working day (or on the follow-up date, if you choose one). Say what happened in the note.',
    callback: 'The case comes back to the list at the time you choose.',
    refused: 'Recorded on the case; it comes back next working day (or on the follow-up date, if you choose one). Say what the learner said in the note.',
  }[outcome] || '';
}

/** The outcome closes the case straight away (the learner agreed something with nothing to wait for). */
export function closesCase(choice: string, c: Pick<OverviewCase, 'promises'>) {
  const { outcome, option } = splitOutcome(choice);
  return outcome === 'reached' && !!option && c.promises[option] === null;
}

/** Quick follow-up choices: working days from today, at 10:00 London time. */
export const QUICK_FOLLOW_UPS: [number, string][] = [[3, '+3 days'], [5, '+5 days']];
/** A datetime-local value for 10:00 London, `workdays` working days from today. */
export const workdayInput = (workdays: number) => `${londonDate(londonWorkdayAt(workdays, 10).toISOString())}T10:00`;

/** Splits an outcome choice into the outcome and the agreed option the server expects. */
export function splitOutcome(choice: string) {
  const [outcome, option = ''] = choice.split(':');
  return { outcome, option };
}

const londonFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
export const londonDate = (value: string | null | undefined) => (value ? londonFormat.format(new Date(value)) : '');
const londonClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });

// Bank holidays and college closures, from the server (overview.holidays); set whenever the overview loads.
let holidays = new Set<string>();
export const setHolidays = (dates: string[] | undefined) => { holidays = new Set(dates || []); };

/** `hour`:00 London time, `workdays` working days (Mon-Fri, not a bank holiday) after today London time. */
export function londonWorkdayAt(workdays: number, hour: number) {
  const day = new Date(`${londonDate(new Date().toISOString())}T12:00:00Z`);
  for (let left = workdays; left > 0;) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() % 6 !== 0 && !holidays.has(day.toISOString().slice(0, 10))) left -= 1;
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
/** Zoom results that are not a conversation. `cut_off`: an outgoing call answered for under 10 seconds (voicemail
 * picking up, or the learner hanging up at once). */
export const FAILED_RESULTS = new Set(['no_answer', 'missed', 'busy', 'voicemail', 'rejected', 'cut_off']);
/** A Zoom call result in words. */
export const callResult = (result: string | null | undefined) => (result === 'cut_off' ? 'cut off · under 10 s' : human(result));
/** Form values have no UTC offset: interpret them in London, never the browser's zone. */
const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ? londonInput(value)
  : new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
export const longDate = (value: string | null | undefined) => (value
  ? displayDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
  : 'Not recorded');
export const shortDate = (value: string | null | undefined) => (value
  ? displayDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
  : 'Not set');
export const when = (value: string | null | undefined) => (value
  ? displayDate(value).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : 'Not yet');
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
  // A learner who rang and was missed is called back now, whatever follow-up the case waits for.
  return !!c.called_back_at || !c.next_followup_at || Date.parse(c.next_followup_at) <= now;
}

export function categoryFor(c: OverviewCase, today: string, nextWorkday: string) {
  if (c.source_type === 'tech_support') return 'tech';
  if (c.source_type === 'signature' && c.employer_signature_missing) return 'missing_signature';
  if (['attendance', 'pr_missed', 'mcm_missed', 'signature'].includes(c.source_type)) return 'missed';
  if (['pr', 'mcm', 'otj', 'epa'].includes(c.source_type)) return 'due';
  if (c.source_type === 'reminder') return londonDate(c.booking_at) === nextWorkday ? 'nextday' : null;
  if (c.source_type === 'employer_feedback') return 'employer_satisfaction';
  if (c.source_type === 'learner_satisfaction') return 'learner_satisfaction';
  if (c.source_type === 'manual') return 'manager';
  return null;
}

export function belongsToCategory(c: OverviewCase, key: string, today: string, nextWorkday: string) {
  if (key === 'missing_signature') return c.source_type === 'signature' && !!c.employer_signature_missing;
  if (key === 'missed' && c.source_type === 'signature') return !!c.learner_signature_missing;
  return categoryFor(c, today, nextWorkday) === key;
}

/** Sources whose last read failed. A source the cycle no longer reads (e.g. a paused one) keeps its old error;
 * only errors from the last two hours describe the lists as they are now. */
export const failingSources = (overview: Pick<Overview, 'sources'>, now = Date.now()) =>
  overview.sources.filter(source => source.details?.error && source.details.checked_at
    && now - Date.parse(source.details.checked_at) < 2 * 60 * 60 * 1000);

export const categoryCases = (cases: OverviewCase[], key: string, today: string, nextWorkday: string) =>
  cases.filter(c => activeCase(c) && belongsToCategory(c, key, today, nextWorkday));

export const contactKey = (c: Pick<OverviewCase, 'learner_email'> & { contact_key?: string; id?: number; source_type?: string }) =>
  c.contact_key || (c.learner_email.trim()
    ? `${c.source_type === 'employer_feedback' ? 'employer:' : ''}${c.learner_email.trim().toLowerCase()}`
    : `case:${c.id}`);

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

export function matchesSearch(c: OverviewCase, query: string) {
  const q = query.trim().toLowerCase();
  return !q || [c.learner_name, c.learner_email, c.learner_phone, c.call_name, c.call_email, c.call_phone,
    c.manager_name, c.manager_email, c.programme, c.coach, c.organisation].join(' ').toLowerCase().includes(q);
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

/** An appointment's day and London time, e.g. "Thu 15 Oct at 10:00". */
export const appointmentTime = (value: string) => {
  const at = new Date(value);
  const day = at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  return `${day} at ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`;
};

const REVIEW_PAGES: Record<string, ['pr' | 'mcm', string]> = {
  pr: ['pr', 'progress review'], pr_missed: ['pr', 'progress review'],
  mcm: ['mcm', 'monthly coaching'], mcm_missed: ['mcm', 'monthly coaching'],
};

/** The coach's Bookings page for a due or missed review, when the coach has one. */
export function reviewBookingPage(c: { source_type: string; booking_links: BookingLinks }) {
  const [kind, noun] = REVIEW_PAGES[c.source_type] || [];
  const url = kind && c.booking_links[kind];
  return url && url.startsWith('https://') ? { url, noun } : null;
}

/** What the booking tools do for this case, or why there is nothing to book. */
export function bookingHint(c: Pick<OverviewCase, 'source_type' | 'bookable' | 'booking_links' | 'meeting' | 'employer_signature_missing'>) {
  if (c.meeting?.cancellable) return 'Already booked. If the learner cannot attend, cancel it or move it to a time the coach is free.';
  if (c.bookable.includes('catch-up')) return 'Book a catch-up or support session in the coach’s LMS calendar, or send the booking email.';
  if (c.bookable.length) return 'Book a support session in the coach’s LMS calendar, or send the booking email.';
  if (reviewBookingPage(c)) return 'Book it with the learner on the coach’s page (use the learner’s own name and email), or send the booking email. The coach links it to the LMS review.';
  const rebook = 'The learner rebooks the review from the coach’s page in the booking email.';
  if (c.source_type === 'signature' && c.employer_signature_missing) return 'Nothing to book: call or email the employer and ask them to sign the review in the LMS.';
  return ({
    pr: 'The learner books the review from the coach’s page in the booking email.',
    mcm: 'The learner books the meeting from the coach’s page in the booking email.',
    pr_missed: rebook, mcm_missed: rebook,
    signature: 'Nothing to book: the learner signs the review in the LMS.',
    reminder: 'Already booked. If the learner cannot attend, they contact their coach to rearrange.',
    learner_satisfaction: 'No booking for a satisfaction call.',
    tech_support: 'No booking: technical support has the issue.',
  } as Record<string, string>)[c.source_type] || '';
}

type GuideCase =Pick<OverviewCase, 'learner_name' | 'source_type' | 'purpose' | 'issue_name' | 'issue_date' | 'booking_at' | 'coach' | 'booking_links'>
  & Partial<Pick<OverviewCase, 'alternative_session'>>;

/** The call guide: the opening, what to say about this case, and how to close. Words the specialist can say as written. */
export function shortGuide(c: GuideCase, operator: string) {
  const first = c.learner_name.split(' ')[0];
  const op = operator.split(' ')[0];
  const coach = c.coach || 'your coach';
  const on = c.issue_date ? ` on ${longDate(c.issue_date)}` : '';
  const review = c.issue_name || 'review';
  // The booking email carries the coach's page for this kind of review; without one the coach arranges the time.
  const link = c.booking_links[c.source_type.startsWith('pr') ? 'pr' : 'mcm'];
  const book = link ? `I’ll email you the link to book it straight into ${coach}’s calendar.` : `I’ll ask ${coach} to contact you with a time.`;
  const rebook = link ? 'I’ll email you the link to book a new time.' : `I’ll ask ${coach} to contact you with a new time.`;
  const catchUp = c.issue_name.startsWith('Missed catch-up');
  const questions: Record<string, string> = {
    otj: 'What learning have you completed recently? What is making it difficult to record or complete your hours? What support would help this week?',
    reminder: c.booking_at
      ? `You have a ${review.toLowerCase()} with ${coach} on ${appointmentTime(c.booking_at)}. Can you confirm you will be there? If you can’t make it, please contact ${coach} to rearrange.`
      : `Can you confirm you will attend tomorrow’s ${review.toLowerCase()} with ${coach}? If you can’t make it, please contact ${coach} to rearrange.`,
    attendance: catchUp
      ? `Our records show you missed the catch-up session booked for ${c.issue_name.replace(/^Missed catch-up( — )?/, '') || 'your missed lecture'}. What happened? Can we book another catch-up with ${coach}?`
      : `Our register shows you as absent from ${c.issue_name || 'your lecture'}${on}. Is everything OK? What stopped you attending? (If you did attend, tell me and we will check the register.) ${c.alternative_session
        ? `The same lecture runs with ${otherGroupSession(c.alternative_session)}: can you join that one? If not, can we book a catch-up session with ${coach}?`
        : `Can you attend this lecture with another group? If not, can we book a catch-up session with ${coach} so you don’t fall behind?`}`,
    pr: `Your progress review with ${coach} is due and isn’t booked yet. When would suit you? ${book}`,
    mcm: `Your monthly coaching meeting with ${coach} is due and isn’t booked yet. When would suit you? ${book}`,
    pr_missed: `Your ${review.toLowerCase()}${on} isn’t showing as completed. Did it go ahead? If it did, I’ll note it so ${coach} can complete the record. If not, ${rebook}`,
    mcm_missed: `Your ${review.toLowerCase()}${on} isn’t showing as completed. Did it go ahead? If it did, I’ll note it so ${coach} can complete the record. If not, ${rebook}`,
    signature: `Your ${review.toLowerCase()} is finished and is waiting for your signature in the LMS. Can you sign it today? I can talk you through finding it.`,
    epa: 'Your programme end date has passed, so you should now be getting ready for gateway and your end-point assessment. Where are you up to? What do you need from your coach to move forward?',
    tech_support: 'I’m following up the technical issue you reported. Is it working for you now, or is it still causing problems?',
    employer_feedback: 'How satisfied are you with the apprenticeship and our coaching, from 1 to 5? How are your learners progressing, what could we improve, and what support would help?',
    learner_satisfaction: 'How satisfied are you with your learning and coaching, from 1 to 5? What is going well, what could improve, and what support would help?',
  };
  return [
    `Hello, could I speak to ${first}? It’s ${op} from Kent Business College. Is now a good time? Calls are recorded for quality and follow-up; check they are comfortable before you continue.`,
    (c.source_type === 'manual' && c.purpose) || questions[c.source_type] || 'What is your current position with this action? What would help you take the next step?',
    'Agree what happens next, who does it and by when. Repeat it back to check they understand, and tell them what they will receive (for example the booking email).',
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

/** The desk's pages. My lists holds the call sheets and Follow-ups as tabs; How I'm doing holds the week, the month,
 * call reviews and achievements as tabs. */
export const DESK_PAGES: [string, string, string][] = [
  ['today', 'Today', 'grid'], ['lists', 'My lists', 'file'], ['learners', 'Call a learner', 'phone'], ['rang', 'Missed calls', 'phone'],
  ['calls', 'My calls', 'clock'], ['doing', 'How I’m doing', 'chart'], ['bookings', 'Booking links', 'calendar'],
];
export const DOING_TABS: [string, string][] = [['week', 'This week'], ['month', 'This month'], ['reviews', 'Call reviews'], ['achievements', 'Achievements']];
// Sections from before the desk was regrouped, so saved links still open the right place.
const OLD_SECTIONS: Record<string, string> = { next: 'today', reports: 'month', history: 'achievements', progress: 'achievements' };

export type DeskLayout = { pages: [string, string, string][]; lists: string[] };

/** The desk for this specialist. With employer specialists chosen, theirs has the employer calls (and Call a learner, for
 * any learner) and everyone else's no employer calls; nobody else has Call a learner. */
export function deskLayout(overview: Pick<Overview, 'employer_specialists'>, agentId: number | null): DeskLayout {
  const team = overview.employer_specialists || [];
  const employer = agentId !== null && team.includes(agentId);
  const sheets = CALL_TABS.map(tab => tab.key).filter(key => (employer
    ? key === 'employer_satisfaction' || key === 'missing_signature'
    : !team.length || (key !== 'employer_satisfaction' && key !== 'missing_signature')));
  return { pages: DESK_PAGES.filter(([key]) => (employer ? key !== 'bookings' : key !== 'learners')), lists: [...sheets, 'followups'] };
}

/** A task given to this desk is a list of its own, `task:<id>`, placed among the desk's lists. */
export const TASK = 'task:';
export const taskKey = (task: Pick<DelegatedTask, 'id'>) => `${TASK}${task.id}`;
export const taskOf = (key: string, tasks: DelegatedTask[] | undefined) =>
  (key.startsWith(TASK) ? tasks?.find(task => taskKey(task) === key) : undefined);
/** "Safiyah’s Next Day", or "Shared queue · Next Day". */
export const taskLabel = (task: Pick<DelegatedTask, 'source' | 'from_name' | 'category_label'>) =>
  (task.source === 'agent' ? `${task.from_name}’s ${task.category_label}` : `${task.from_name} · ${task.category_label}`);

/** The desk's topics in calling order: its own lists, with each task given to it placed where the director put it
 * (after a list or after another task; first, or at the end when that place is gone). */
export function deskTopics(lists: string[], tasks: DelegatedTask[] | undefined, agentId: number | null) {
  const mine = (tasks || []).filter(task => task.to_agent_id === agentId);
  const order: string[] = [];
  const place = (key: string) => {
    order.push(key);
    mine.filter(task => task.after_topic === key).forEach(task => place(taskKey(task)));
  };
  mine.filter(task => task.after_topic === '').forEach(task => place(taskKey(task)));
  lists.forEach(place);
  mine.filter(task => !order.includes(taskKey(task))).forEach(task => order.push(taskKey(task)));
  return order;
}

/** How a task names a person (delegation.member): their email, `employer:<email>` as a line manager, or the case. */
export const memberKey = (c: Pick<OverviewCase, 'learner_email' | 'source_type' | 'id'>) => {
  const email = c.learner_email.trim().toLowerCase();
  if (!email) return `case:${c.id}`;
  return c.source_type === 'employer_feedback' ? `employer:${email}` : email;
};

/** The section the address asks for (old addresses included) and the desk page it sits on. */
export function deskSection(asked: string | null, layout: DeskLayout) {
  const section = OLD_SECTIONS[asked || ''] || asked || 'today';
  if (layout.lists.includes(section) || section.startsWith(TASK)) return { section, page: 'lists' };
  if (DOING_TABS.some(([key]) => key === section)) return { section, page: 'doing' };
  if (section === 'lists') return { section: layout.lists[0], page: 'lists' };
  if (section === 'doing') return { section: DOING_TABS[0][0], page: 'doing' };
  return layout.pages.some(([key]) => key === section) ? { section, page: section } : { section: 'today', page: 'today' };
}

export const listLabel = (key: string, tasks?: DelegatedTask[]) => {
  const task = taskOf(key, tasks);
  if (task) return taskLabel(task);
  return key === 'followups' ? 'Follow-ups' : CALL_TABS.find(tab => tab.key === key)?.label || human(key);
};

/** A case on the desk's own lists: not a task given to it, not covered by someone else, not just along on a call. */
export const ownWork = (c: Pick<OverviewCase, 'desk'>) => !c.desk || c.desk === 'own';

/** The cases of a task given to this desk. */
export const taskCases = (cases: OverviewCase[], key: string) =>
  cases.filter(c => activeCase(c) && c.desk === 'task' && !!c.cover && `${TASK}${c.cover.task_id}` === key);

/** The cases a list counts: feedback lists only those due now, Follow-ups only those this specialist's own call set;
 * a task, its cases. */
function listCases(overview: Pick<Overview, 'cases' | 'today' | 'next_workday'>, key: string, agentId: number | null) {
  if (key.startsWith(TASK)) return taskCases(overview.cases, key).filter(c => !isSatisfaction(c) || dueForCall(c));
  const own = overview.cases.filter(ownWork);
  if (key === 'followups') return own.filter(c => activeCase(c) && agentId !== null && c.followup_agent_id === agentId);
  const cases = categoryCases(own, key, overview.today, overview.next_workday);
  return key === 'learner_satisfaction' || key === 'employer_satisfaction' ? cases.filter(c => dueForCall(c)) : cases;
}

/** People on one list (one per contact). */
export const listCount = (overview: Pick<Overview, 'cases' | 'today' | 'next_workday'>, key: string, agentId: number | null) =>
  uniqueLearners(listCases(overview, key, agentId)).length;

/** People on any of the call sheets, each counted once. */
export const listsTotal = (overview: Pick<Overview, 'cases' | 'today' | 'next_workday'>, layout: DeskLayout, topics: string[] = layout.lists) =>
  uniqueLearners(topics.filter(key => key !== 'followups').flatMap(key => listCases(overview, key, null))).length;

/** A specialist's desk: their allocated learners plus the shared queue; with employer specialists chosen, theirs holds
 * the employer calls (and missing employer signatures) only, and everyone else's none. A director's task adds the
 * learners it gives them, whoever owns them (`task`, and their other cases that come along on the call); a case covered
 * by someone else stays on its owner's lists read-only (`covered`). */
export function deskCases<T extends Pick<Overview, 'cases' | 'employer_specialists'>>(overview: T, agentId: number): T {
  const team = overview.employer_specialists || [];
  const employerDesk = team.includes(agentId);
  const onThisDesk = (c: OverviewCase) => (!c.allocated_agent_id || c.allocated_agent_id === agentId)
    && (!team.length || (employerDesk
      ? c.source_type === 'employer_feedback' || !!c.optional || (c.source_type === 'signature' && !!c.employer_signature_missing)
      : c.source_type !== 'employer_feedback' && !c.optional
        && (c.source_type !== 'signature' || !!c.learner_signature_missing)));
  const cases = overview.cases.flatMap((c): OverviewCase[] => {
    if (c.cover && c.cover.to_agent_id === agentId) return [{ ...c, desk: c.cover.direct ? 'task' : onThisDesk(c) ? 'own' : 'call' }];
    return onThisDesk(c) ? [{ ...c, desk: c.cover?.direct ? 'covered' : 'own' }] : [];
  });
  return { ...overview, cases };
}

/** Whether Call next takes this case on a desk: its own work (employer calls on an employer desk), or a director's task. */
export const callsOnDesk = (c: OverviewCase, employerDesk: boolean) => c.desk === 'task' || c.desk === 'call'
  || (c.desk !== 'covered' && (employerDesk
    ? c.source_type === 'employer_feedback' || !!c.optional || (c.source_type === 'signature' && !!c.employer_signature_missing)
    : c.source_type !== 'employer_feedback' && !c.optional));

/** A case Call next offers this specialist now: on one of their lists, due, with a number, and not claimed by another. */
export const callable = (c: OverviewCase, agentId: number | null, employerDesk: boolean, today: string, nextWorkday: string) =>
  activeCase(c) && categoryFor(c, today, nextWorkday) !== null && c.desk !== 'call' && callsOnDesk(c, employerDesk)
  && !!c.learner_phone && dueForCall(c) && (!c.claimed_agent_id || c.claimed_agent_id === agentId);

/** A case a specialist saved a result on today (desk-progress/): any outcome, a close or completed feedback. */
export type DeskWork = {
  agent_id: number; case_id: number; learner_name: string; learner_email: string; contact_key: string; source_type: string;
  booking_at: string | null; employer_signature_missing: boolean; learner_signature_missing: boolean; task_id: number | null;
  outcome: string; resolved: boolean; at: string; status: string;
};
export type ListProgress = { key: string; label: string; done: DeskWork[]; remaining: OverviewCase[]; waiting: number };

/** A specialist's lists in their Today order: who they finished today on each (by the list the case is on, or the task
 * it was called for), who Call next still has for them now, and who waits (not due yet). ``current`` is the list Call
 * next is on: the first with someone still to call. */
export function listProgress(overview: Overview, agentId: number, worked: DeskWork[]) {
  const employerDesk = (overview.employer_specialists || []).includes(agentId);
  const desk = deskCases(overview, agentId);
  const topics = deskTopics(deskLayout(overview, agentId).lists, overview.tasks, agentId);
  const listOf = (row: DeskWork) => (row.task_id && topics.includes(`${TASK}${row.task_id}`) ? `${TASK}${row.task_id}`
    : categoryFor({ ...row, id: row.case_id } as unknown as OverviewCase, overview.today, overview.next_workday));
  const mine = worked.filter(row => row.agent_id === agentId);
  const lists: ListProgress[] = topics.map(key => {
    const done = [...new Map(mine.filter(row => listOf(row) === key).map(row => [row.contact_key || row.learner_email, row])).values()];
    // The feed names a person by case or email; the overview by its own contact key: either one matching is the person.
    const finished = new Set(done.flatMap(row => [row.contact_key, row.learner_email.trim().toLowerCase()]).filter(Boolean));
    const cases = listCases(desk, key, agentId);
    const remaining = uniqueLearners(cases.filter(c => callable(c, agentId, employerDesk, overview.today, overview.next_workday)));
    const due = new Set(remaining.map(contactKey));
    const waiting = uniqueLearners(cases).filter(c => !due.has(contactKey(c)) && !finished.has(contactKey(c))
      && !finished.has(c.learner_email.trim().toLowerCase())).length;
    return { key, label: listLabel(key, overview.tasks), done, remaining, waiting };
  });
  return { lists, current: lists.find(list => list.remaining.length)?.key || null };
}

/** What saving the satisfaction feedback did: completed now (`held` only for feedback saved before it completed straight away). */
export const feedbackMessage = (held?: boolean) => (held
  ? 'Feedback saved. It completes the review as soon as Zoom reports the call answered (usually within 10 minutes).'
  : 'Feedback completed. Next review is due in three calendar months.');

/** Calls the AI actually judged (excludes not rated). */
export const ratedCalls = (counts: Record<CallRating, number> | undefined) => (counts ? counts.excellent + counts.good + counts.bad : 0);

export type AllocationChange = { email: string; agent_id: number | null; revision: number };
/** Learners who must stay with one specialist: an employer's (line manager's) learners, or one learner on their own. */
export type AllocationUnit = { key: string; emails: string[] };

/**
 * Hands whole units to specialists so each gets a similar load: by default the number of learners, or any
 * `weight` (e.g. open cases). A unit stays with the specialist who has most of it while that stays within a
 * fair share, so as few learners as possible move; the rest go, heaviest first, to whoever has the least so far.
 * Returns learner email -> specialist.
 */
export function balanceUnits<T extends AllocationUnit>(units: T[], current: Map<string, number | null>, operators: number[],
  weight: (unit: T) => number = unit => unit.emails.length) {
  const owners = new Map<string, number>();
  if (!operators.length) return owners;
  const load = new Map(operators.map(id => [id, 0]));
  const share = Math.ceil(units.reduce((sum, unit) => sum + weight(unit), 0) / operators.length);
  const give = (unit: T, id: number) => {
    unit.emails.forEach(email => owners.set(email, id));
    load.set(id, (load.get(id) || 0) + weight(unit));
  };
  const rest: T[] = [];
  for (const unit of [...units].sort((a, b) => weight(b) - weight(a) || b.emails.length - a.emails.length || a.key.localeCompare(b.key))) {
    const counts = new Map<number, number>();
    for (const email of unit.emails) {
      const id = current.get(email);
      if (id != null && load.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const keep = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    if (keep !== undefined && (load.get(keep) || 0) + weight(unit) <= share) give(unit, keep);
    else rest.push(unit);
  }
  for (const unit of rest) give(unit, operators.reduce((best, next) => ((load.get(next) || 0) < (load.get(best) || 0) ? next : best)));
  return owners;
}

/** Units whose learners would be with more than one specialist (the shared queue counts as one). */
export const splitUnits = <T extends AllocationUnit>(units: T[], ownerOf: (email: string) => number | null) =>
  units.filter(unit => new Set(unit.emails.map(ownerOf)).size > 1);
