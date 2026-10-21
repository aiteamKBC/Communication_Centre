import { useMemo, useState } from 'react';
import type { Overview, OverviewCase } from '../api';
import { caseAction, callDisabledReason } from './actions';
import type { Session } from './actions';
import BookSession from './BookSession';
import BookingEmail from './BookingEmail';
import BookingPage from './BookingPage';
import Dialog from './Dialog';
import SatisfactionEmail from './SatisfactionEmail';
import SatisfactionFeedback from './SatisfactionFeedback';
import TechIssue from './TechIssue';
import CaseDates from './CaseDates';
import CaseFilters, { EMPTY_CASE_FILTERS, matchesCaseFilters } from './CaseFilters';
import { orderTickets, TICKET_ORDERS, type TicketOrder } from './ticketOrder';
import {
  QUICK_FOLLOW_UPS, activeCase, appointmentTime, casePurpose, categoryFor, closesCase, contactKey, dueForCall, isSatisfaction,
  issueLabel, londonInput, longDate, outcomeChoices, outcomeHelp, promiseLabel, shortDate, splitOutcome, uniqueLearners, workdayInput,
} from './model';

type Props = { overview: Overview; session: Session; onRefresh: () => void; notify: (message: string, error?: boolean) => void; onOpen: (id: number) => void };

// Outcomes beyond the call sheet's: a case the specialist closes is resolved, a satisfaction review completed in its form.
const DONE = 'done';
const FEEDBACK = 'feedback';
// Marks an issue whose catch-up was booked from Next call (the booking closed its case).
const BOOKED = 'booked';

/** The call sheet's outcome choices, plus Done for a case the specialist closes and the feedback form for a review. */
function choicesFor(c: OverviewCase): [string, string][] {
  const choices = outcomeChoices(c);
  if (isSatisfaction(c)) return [[FEEDBACK, 'Reached: complete feedback'], ...choices.slice(1)];
  if (c.specialist_closes) return [[DONE, 'Done: resolve the case'], ...choices];
  return choices;
}

function helpFor(choice: string, c: OverviewCase) {
  if (choice === FEEDBACK) return 'Save opens the feedback form. Only a completed review starts the next three-month period.';
  if (choice === DONE) return 'The case is resolved when you save.';
  return outcomeHelp(choice, c);
}

/** The simple calling screen: one learner, Call, End call, then the outcome of each issue, saved together. */
export default function NextCall({ overview, session, onRefresh, notify, onOpen }: Props) {
  const [caseFilters, setCaseFilters] = useState({ ...EMPTY_CASE_FILTERS });
  const [order, setOrder] = useState<TicketOrder>('newest');
  const [done, setDone] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  // The person being called and their issues, kept as they were when Call was pressed: a Zoom result arriving
  // mid-call must not move them off the screen before the outcome is saved. `ended` once End call is pressed.
  const [calling, setCalling] = useState<{ key: string; person: OverviewCase; issues: OverviewCase[]; ended: boolean } | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [feedbackFor, setFeedbackFor] = useState<OverviewCase | null>(null);
  const [emailFor, setEmailFor] = useState<number | null>(null);
  const [satisfactionEmailFor, setSatisfactionEmailFor] = useState<number | null>(null);
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);

  const eligible = useMemo(() => overview.cases.filter(c => activeCase(c) && categoryFor(c, overview.today, overview.next_workday) !== null
    && c.source_type !== 'employer_feedback' && !!c.learner_phone && dueForCall(c)
    && (!c.claimed_agent_id || c.claimed_agent_id === session.agentId)), [overview, session.agentId]);
  // The same order as the call sheets: one learner per contact, in the chosen ticket order.
  const queue = useMemo(() => uniqueLearners(orderTickets(eligible.filter(c => matchesCaseFilters(c, caseFilters)), order))
    .filter(c => !done.has(contactKey(c))), [eligible, caseFilters, order, done]);
  const waiting = queue.filter(c => !skipped.has(contactKey(c)));
  const next = waiting[0] || null;
  const current = calling ? calling.person : next;
  const issues = calling ? calling.issues : next ? orderTickets(overview.cases.filter(c => contactKey(c) === contactKey(next) && activeCase(c)
    && c.source_type !== 'employer_feedback' && dueForCall(c)), order) : [];
  const allCases = current ? overview.cases.filter(c => activeCase(c) && contactKey(c) === contactKey(current)).length : 0;

  function reset(next: Set<string>) {
    setDone(next);
    setCalling(null);
    setSaved(new Set());
    setFeedbackFor(null);
    setPicked(new Map());
    setNote('');
    setFollowUp('');
  }

  async function call() {
    if (!current) return;
    setBusy(true);
    try {
      await caseAction(session, current.id, 'call');
      setCalling({ key: contactKey(current), person: current, issues, ended: false });
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!current) return;
    const chosen = issues.map(c => [c, picked.get(c.id)] as const);
    const outcomes = chosen.map(([, choice]) => splitOutcome(choice || '').outcome);
    if (note.trim().length < 10) {
      notify('Add a short note: what was agreed and the next action (at least 10 characters).', true);
      return;
    }
    if (outcomes.includes('callback') && !followUp) {
      notify('Choose the date and time for the callback.', true);
      return;
    }
    const at = followUp ? londonInput(followUp) : null;
    if (at && at.getTime() <= Date.now()) {
      notify('Choose a follow-up time in the future.', true);
      return;
    }
    setBusy(true);
    try {
      let held = false;
      const savedNow = new Set(saved);
      for (const [c, choice] of chosen) {
        if (!choice || savedNow.has(c.id) || choice === FEEDBACK || choice === BOOKED) continue;
        if (choice === DONE) {
          await caseAction(session, c.id, 'resolve', { note: note.trim(), option: 'other' });
        } else {
          // Held until Zoom reports the call when it has not yet; Zoom's result must fit the outcome.
          const result = await caseAction(session, c.id, 'plan', {
            ...splitOutcome(choice), note: note.trim(), callback_at: at ? at.toISOString() : null,
          });
          held = held || !result.applied;
        }
        savedNow.add(c.id);
        setSaved(new Set(savedNow));
      }
      const feedback = chosen.find(([c, choice]) => choice === FEEDBACK && !savedNow.has(c.id));
      if (feedback) {
        // The other issues are saved; the review is completed in its form, then the call moves on.
        setFeedbackFor(feedback[0]);
        return;
      }
      notify(held ? `Saved for ${current.learner_name}. It is applied as soon as Zoom reports the call.` : `Saved for ${current.learner_name}.`);
      reset(new Set(done).add(contactKey(current)));
      onRefresh();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The outcome could not be saved.', true);
    } finally {
      setBusy(false);
    }
  }

  // A booked catch-up is the proof a missed-lecture case waits for: the case is closed, so no outcome is needed for it.
  function booked(c: OverviewCase, sessionType: string) {
    if (sessionType === 'catch-up') {
      setSaved(new Set(saved).add(c.id));
      setPicked(new Map(picked).set(c.id, BOOKED));
    }
    onRefresh();
  }

  /** The same actions as the calling sheet: book with the coach or on the coach's page, the booking email, the satisfaction email. */
  function tools(c: OverviewCase) {
    if (picked.get(c.id) === BOOKED) return <p className="ec-tag">Catch-up booked: case closed</p>;
    const bookable = c.bookable.length > 0;
    const techIssue = c.source_type !== 'employer_feedback' && c.source_type !== 'tech_support';
    if (!bookable && !c.booking_email && c.source_type !== 'learner_satisfaction' && !techIssue) return null;
    return (
      <div className="ec-buttons ed-next-tools">
        {bookable && <BookSession caseId={c.id} session={session} notify={notify} onBooked={type => booked(c, type)} />}
        <BookingPage c={c} />
        {c.booking_email && <button type="button" disabled={session.preview} onClick={() => setEmailFor(c.id)}>Booking email</button>}
        {c.source_type === 'learner_satisfaction' && <button type="button" disabled={session.preview || !c.learner_email}
          onClick={() => setSatisfactionEmailFor(c.id)}>Email</button>}
        {techIssue && <TechIssue caseId={c.id} learner={c.learner_name} session={session} notify={notify} onRaised={onRefresh} />}
      </div>
    );
  }

  function feedbackSaved() {
    if (!current) return;
    notify(`Feedback completed for ${current.learner_name}. The next review is due in three calendar months.`);
    reset(new Set(done).add(contactKey(current)));
    onRefresh();
  }

  const toolbar = (
    <div className="ed-sheet-toolbar">
      <select aria-label="Ticket order" value={order} disabled={!!calling} onChange={event => setOrder(event.target.value as TicketOrder)}>
        {Object.entries(TICKET_ORDERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  );

  if (!current) {
    return (
      <section className="ec-card ed-next">
        {toolbar}
        <CaseFilters cases={eligible} value={caseFilters} onChange={setCaseFilters} />
        <div className="ec-empty">
          <h3>Nobody else to call right now</h3>
          <p>{skipped.size ? `You skipped ${skipped.size} ${skipped.size === 1 ? 'learner' : 'learners'}.` : 'Learners come back here when their follow-up is due.'}</p>
          {skipped.size > 0 && <button type="button" onClick={() => setSkipped(new Set())}>Show skipped learners</button>}
        </div>
      </section>
    );
  }

  const reason = callDisabledReason(current, session);
  const ready = issues.length > 0 && issues.every(c => picked.has(c.id));
  const closing = issues.every(c => [DONE, FEEDBACK, BOOKED].includes(picked.get(c.id) || '') || closesCase(picked.get(c.id) || '', c));
  return (
    <section className="ec-card ed-next">
      {toolbar}
      <CaseFilters cases={eligible} value={caseFilters} onChange={setCaseFilters} />
      <p className="ec-muted">{calling ? (calling.ended ? 'Call ended: record what happened' : 'On the call') : `Next call · ${waiting.length} ${waiting.length === 1 ? 'learner' : 'learners'} to call · ${TICKET_ORDERS[order]}`}</p>
      <Dialog open={feedbackFor !== null} onClose={() => setFeedbackFor(null)}>
        {feedbackFor && <SatisfactionFeedback key={feedbackFor.id} caseId={feedbackFor.id} name={feedbackFor.learner_name} session={session} onSaved={feedbackSaved} />}
      </Dialog>
      <Dialog open={emailFor !== null} onClose={() => setEmailFor(null)}>
        {emailFor !== null && <BookingEmail key={emailFor} caseId={emailFor} session={session} />}
      </Dialog>
      <Dialog open={satisfactionEmailFor !== null} onClose={() => setSatisfactionEmailFor(null)}>
        {satisfactionEmailFor !== null && <SatisfactionEmail key={satisfactionEmailFor} caseId={satisfactionEmailFor} session={session} />}
      </Dialog>
      <h2 className="ed-next-name">{current.learner_name}</h2>
      <p className="ec-muted">{current.programme || 'Programme not recorded'} · Coach: {current.coach || 'not recorded'} · {current.learner_phone}</p>
      {current.missed_call && <p className="ec-tag">Missed call · {current.attempts} unanswered</p>}
      {current.promise_missed && <p className="ec-tag">Promise missed: call again</p>}
      <button type="button" className="ed-sheet-link" onClick={() => onOpen(current.id)}>All cases ({allCases}{overview.cases_truncated ? '+' : ''})</button>

      {!calling?.ended ? (
        <>
          <h3>Why you are calling</h3>
          <ul>
            {issues.map(c => (
              <li key={c.id}>
                <strong>{issueLabel(c)}</strong>{c.source_type === 'attendance' && c.issue_date ? ` · ${shortDate(c.issue_date)}` : ''}
                {c.source_type === 'reminder' && c.booking_at ? ` · ${c.issue_name} · ${appointmentTime(c.booking_at)}` : ''}
                <CaseDates ticket={c} />
                <div className="ec-muted">{Object.keys(c.promises).length ? `Ask them to: ${Object.keys(c.promises).map(promiseLabel).join(' or ')}` : casePurpose(c)}</div>
                {tools(c)}
              </li>
            ))}
          </ul>
          {calling ? (
            <>
              <button type="button" className="primary ed-next-call ed-end-call" onClick={() => setCalling({ ...calling, ended: true })}>
                End call
              </button>
              <p className="ec-muted">Hang up in Zoom, then press End call to record the outcome. Nothing changes on the case until you save.</p>
              <div className="ec-buttons" style={{ marginTop: '.5rem' }}>
                <button type="button" onClick={() => reset(done)}>Cancel: the call did not go out</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="primary ed-next-call" disabled={busy || !!reason} title={reason || undefined} onClick={() => void call()}>
                {busy ? 'Opening Zoom…' : '📞 Call'}
              </button>
              {reason && <p className="ec-muted">{reason}</p>}
              <div className="ec-buttons" style={{ marginTop: '1rem' }}>
                <button type="button" onClick={() => setSkipped(new Set(skipped).add(contactKey(current)))}>Skip</button>
                <button type="button" className="ed-sheet-link" onClick={() => onOpen(current.id)}>Full case</button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {issues.map(c => (
            <div key={c.id} className="ed-next-outcome">
              <label>{issueLabel(c)}: what happened?
                {picked.get(c.id) === BOOKED ? <p className="ec-tag">Catch-up booked: case closed</p> : (
                  <select aria-label={`Outcome for ${issueLabel(c)}`} disabled={busy || saved.has(c.id)} value={picked.get(c.id) || ''}
                    onChange={event => setPicked(new Map(picked).set(c.id, event.target.value))}>
                    <option value="">Choose outcome…</option>
                    {choicesFor(c).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                )}
              </label>
              {picked.get(c.id) && picked.get(c.id) !== BOOKED && <small>{helpFor(picked.get(c.id)!, c)}</small>}
              {tools(c)}
            </div>
          ))}
          <label>Notes / agreed action
            <textarea rows={3} maxLength={3500} placeholder="What was agreed? Who will do what, by when?" value={note} onChange={event => setNote(event.target.value)} />
          </label>
          <label>Follow-up (London time)
            <input type="datetime-local" value={followUp} onChange={event => setFollowUp(event.target.value)} />
          </label>
          <div className="ed-quick-dates">
            {QUICK_FOLLOW_UPS.map(([days, label]) => (
              <button key={days} type="button" className="ed-sheet-link" title={`${longDate(workdayInput(days))} at 10:00 London`}
                onClick={() => setFollowUp(workdayInput(days))}>{label}</button>
            ))}
          </div>
          {followUp && <small>{closing ? 'These outcomes close the case, so the date is not used.' : `Back in the list ${longDate(followUp)}`}</small>}
          <div className="ec-buttons" style={{ marginTop: '1rem' }}>
            <button type="button" className="primary ed-next-call" disabled={busy || !ready} onClick={() => void save()}>{busy ? 'Saving…' : 'Save and next'}</button>
          </div>
          <div className="ec-buttons" style={{ marginTop: '.5rem' }}>
            <button type="button" disabled={busy} onClick={() => setCalling({ ...calling, ended: false })}>Back to the call</button>
          </div>
        </>
      )}
    </section>
  );
}
