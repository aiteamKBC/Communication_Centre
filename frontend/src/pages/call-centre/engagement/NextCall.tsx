import { useEffect, useMemo, useState } from 'react';
import type { Overview, OverviewCase } from '../api';
import { caseAction, callDisabledReason, loadCase, requestCallSync } from './actions';
import type { Session } from './actions';
import BookSession from './BookSession';
import BookingEmail from './BookingEmail';
import BookingPage from './BookingPage';
import CallOutcome from './CallOutcome';
import Dialog from './Dialog';
import EmployerCheck from './EmployerCheck';
import MeetingTools from './MeetingTools';
import SatisfactionEmail from './SatisfactionEmail';
import TechIssue from './TechIssue';
import CaseDates from './CaseDates';
import CaseFilters, { EMPTY_CASE_FILTERS, matchesCaseFilters } from './CaseFilters';
import { orderTickets, TICKET_ORDERS, type TicketOrder } from './ticketOrder';
import { TASK, activeCase, appointmentTime, casePurpose, categoryFor, contactKey, dueForCall, issueLabel, promiseLabel, shortDate, uniqueLearners, when } from './model';

type Props = { overview: Overview; session: Session; onRefresh: () => void; notify: (message: string, error?: boolean) => void; onOpen: (id: number) => void;
  /** The desk's topics in calling order, when the director has given it tasks: learners are taken topic by topic. */
  topics?: string[] };

/** Whether this desk calls about the case: a task given to it (and what comes along on its calls) whatever kind of desk
 * it is; otherwise its own kind of case (employer calls on an employer desk), unless someone else covers it. */
const onDesk = (c: OverviewCase, employerDesk: boolean) => c.desk === 'task' || c.desk === 'call'
  || (c.desk !== 'covered' && (c.source_type === 'employer_feedback' || !!c.optional) === employerDesk);

/** The simple calling screen: one learner, Call, End call, then the outcome of the whole call (CallOutcome), saved together. */
export default function NextCall({ overview, session, onRefresh, notify, onOpen, topics }: Props) {
  // An employer specialist's next calls are the employers (and their own optional calls' callbacks); everyone else's are learners.
  const employerDesk = !!session.employerDesk;
  const [caseFilters, setCaseFilters] = useState({ ...EMPTY_CASE_FILTERS });
  const [order, setOrder] = useState<TicketOrder>('newest');
  const [done, setDone] = useState<Set<string>>(new Set());
  // Which learner in the list is shown: Back and Next move through it; a saved learner leaves it, bringing the next one here.
  const [position, setPosition] = useState(0);
  // The person being called and their issues, kept as they were when Call was pressed: a Zoom result arriving
  // mid-call must not move them off the screen before the outcome is saved. `ended` once End call is pressed.
  const [calling, setCalling] = useState<{ key: string; person: OverviewCase; issues: OverviewCase[]; ended: boolean } | null>(null);
  // Missed-lecture cases whose catch-up was booked during the call: the booking closed them.
  const [booked, setBooked] = useState<Set<number>>(new Set());
  const [emailFor, setEmailFor] = useState<number | null>(null);
  const [satisfactionEmailFor, setSatisfactionEmailFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const eligible = useMemo(() => overview.cases.filter(c => activeCase(c) && categoryFor(c, overview.today, overview.next_workday) !== null
    && c.desk !== 'call' && onDesk(c, employerDesk) && !!c.learner_phone && dueForCall(c)
    && (!c.claimed_agent_id || c.claimed_agent_id === session.agentId)), [overview, session.agentId, employerDesk]);
  // The same order as the call sheets: one learner per contact, in the chosen ticket order; with tasks, topic by topic
  // in the order the director set (the sort keeps the ticket order within a topic).
  const queue = useMemo(() => {
    const rank = (c: OverviewCase) => {
      const at = topics ? topics.indexOf(c.desk === 'task' && c.cover ? `${TASK}${c.cover.task_id}` : categoryFor(c, overview.today, overview.next_workday) || '') : 0;
      return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    };
    const ordered = orderTickets(eligible.filter(c => matchesCaseFilters(c, caseFilters)), order);
    return uniqueLearners(topics ? [...ordered].sort((a, b) => rank(a) - rank(b)) : ordered).filter(c => !done.has(contactKey(c)));
  }, [eligible, caseFilters, order, done, topics, overview.today, overview.next_workday]);
  const at = Math.min(position, Math.max(queue.length - 1, 0));
  const next = queue[at] || null;
  const current = calling ? calling.person : next;
  const issues = calling ? calling.issues : next ? orderTickets(overview.cases.filter(c => contactKey(c) === contactKey(next) && activeCase(c)
    && onDesk(c, employerDesk) && dueForCall(c)), order) : [];
  const allCases = current ? overview.cases.filter(c => activeCase(c) && contactKey(c) === contactKey(current)).length : 0;

  function reset(next: Set<string>) {
    setDone(next);
    setCalling(null);
    setBooked(new Set());
  }

  async function call() {
    if (!current) return;
    setBusy(true);
    try {
      const result = await caseAction(session, current.id, 'call');
      // The server says which cases the call covers; those are the ones the outcome is recorded for.
      const onCall = result.ticket_ids ? orderTickets(overview.cases.filter(c => result.ticket_ids!.includes(c.id)), order) : [];
      setCalling({ key: contactKey(current), person: current, issues: onCall.length ? onCall : issues, ended: false });
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  // A booked catch-up is the proof a missed-lecture case waits for: the case is closed, so no outcome is needed for it.
  function sessionBooked(c: OverviewCase, sessionType: string) {
    if (sessionType === 'catch-up') setBooked(new Set(booked).add(c.id));
    onRefresh();
  }

  /** The same actions as the calling sheet: book with the coach or on the coach's page, the booking email, the satisfaction email. */
  function tools(c: OverviewCase) {
    if (booked.has(c.id)) return <p className="ec-tag">Catch-up booked: case closed</p>;
    const bookable = c.bookable.length > 0;
    const techIssue = c.source_type !== 'employer_feedback' && c.source_type !== 'tech_support';
    if (!bookable && !c.booking_email && c.source_type !== 'learner_satisfaction' && !techIssue && !c.meeting && !c.employer_check) return null;
    return (
      <div className="ec-buttons ed-next-tools">
        <MeetingTools c={c} session={session} notify={notify} onChanged={onRefresh} />
        <EmployerCheck c={c} session={session} notify={notify} onChanged={onRefresh} />
        {bookable && <BookSession caseId={c.id} session={session} notify={notify} onBooked={type => sessionBooked(c, type)} />}
        <BookingPage c={c} />
        {c.booking_email && <button type="button" disabled={session.preview} onClick={() => setEmailFor(c.id)}>Booking email</button>}
        {c.source_type === 'learner_satisfaction' && <button type="button" disabled={session.preview || !c.learner_email}
          onClick={() => setSatisfactionEmailFor(c.id)}>Email</button>}
        {techIssue && <TechIssue caseId={c.id} learner={c.learner_name} session={session} notify={notify} onRaised={onRefresh} />}
      </div>
    );
  }

  function callSaved(message: string) {
    if (!current) return;
    notify(message);
    reset(new Set(done).add(contactKey(current)));
    onRefresh();
  }

  // A call saved in Full case moves this screen on too: the server no longer has it open.
  useEffect(() => {
    if (!calling) return undefined;
    let live = true;
    loadCase(calling.person.id, session.agentId)
      .then(detail => { if (live && !detail.open_call) callSaved(`The call with ${calling.person.learner_name} was saved in Full case.`); })
      .catch(() => {});
    return () => { live = false; };
  }, [overview.generated_at]); // eslint-disable-line react-hooks/exhaustive-deps -- check again only when the list reloads

  const toolbar = (
    <div className="ed-sheet-toolbar">
      <select aria-label="Ticket order" value={order} disabled={!!calling} onChange={event => setOrder(event.target.value as TicketOrder)}>
        {Object.entries(TICKET_ORDERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  );
  const filtered = Object.values(caseFilters).some(Boolean);
  const choices = <>{toolbar}<CaseFilters cases={eligible} value={caseFilters} onChange={setCaseFilters} /></>;
  // The person to call comes first; the order and filters wait behind one line until wanted.
  const filters = (
    <details className="ed-next-filters">
      <summary>Filter and order{filtered ? ' · filters on' : ''}</summary>
      {choices}
    </details>
  );

  if (!current) {
    return (
      <section className="ec-card ed-next">
        {filtered ? <div className="ed-next-filters">{choices}</div> : filters}
        <div className="ec-empty">
          <h3>Nobody else to call right now</h3>
          <p>Learners come back here when their follow-up is due.</p>
        </div>
      </section>
    );
  }

  const reason = callDisabledReason(current, session);
  return (
    <section className="ec-card ed-next">
      {filters}
      <p className="ec-muted">{calling ? (calling.ended ? 'Call ended: record what happened' : 'On the call') : `Next call · learner ${at + 1} of ${queue.length} · ${TICKET_ORDERS[order]}`}</p>
      <Dialog open={emailFor !== null} onClose={() => setEmailFor(null)}>
        {emailFor !== null && <BookingEmail key={emailFor} caseId={emailFor} session={session} />}
      </Dialog>
      <Dialog open={satisfactionEmailFor !== null} onClose={() => setSatisfactionEmailFor(null)}>
        {satisfactionEmailFor !== null && <SatisfactionEmail key={satisfactionEmailFor} caseId={satisfactionEmailFor} session={session} />}
      </Dialog>
      <h2 className="ed-next-name">{current.learner_name}</h2>
      <p className="ec-muted">{current.programme || 'Programme not recorded'} · Coach: {current.coach || 'not recorded'} · {current.learner_phone}</p>
      {current.called_back_at && <p className="ec-tag red">Rang us {when(current.called_back_at)} and nobody answered: call back now</p>}
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
              <button type="button" className="primary ed-next-call ed-end-call" onClick={() => { requestCallSync(session); setCalling({ ...calling, ended: true }); }}>
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
                <button type="button" disabled={at === 0} onClick={() => setPosition(at - 1)}>Back</button>
                <button type="button" disabled={at >= queue.length - 1} onClick={() => setPosition(at + 1)}>Next</button>
                <button type="button" className="ed-sheet-link" onClick={() => onOpen(current.id)}>Full case</button>
              </div>
            </>
          )}
        </>
      ) : null}
      {/* Kept mounted while back on the call, so what was chosen is not lost. */}
      {calling && (
        <div hidden={!calling.ended}>
          <CallOutcome key={calling.key} callFrom={calling.person.id} name={calling.person.learner_name} issues={issues}
            session={session} notify={notify} onSaved={callSaved} closed={booked} tools={tools} />
          <div className="ec-buttons" style={{ marginTop: '.5rem' }}>
            <button type="button" onClick={() => setCalling({ ...calling, ended: false })}>Back to the call</button>
          </div>
        </div>
      )}
    </section>
  );
}
