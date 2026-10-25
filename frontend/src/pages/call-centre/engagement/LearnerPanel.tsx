import { useEffect, useState } from 'react';
import type { Overview } from '../api';
import { callDisabledReason, caseAction } from './actions';
import type { Session } from './actions';
import BookSession from './BookSession';
import BookingEmail from './BookingEmail';
import BookingPage from './BookingPage';
import CallOutcome from './CallOutcome';
import Dialog from './Dialog';
import SatisfactionEmail from './SatisfactionEmail';
import SatisfactionFeedback from './SatisfactionFeedback';
import TechIssue from './TechIssue';
import CaseDates from './CaseDates';
import LearnerCases from './LearnerCases';
import { CallEvidence, NextStepForm, Timeline } from './CaseParts';
import { casePurpose, feedbackMessage, helpdeskStatus, human, isSatisfaction, issueLabel, longDate, satisfactionRecipient, shortGuide } from './model';
import RecordingDialog from './Recordings';
import { useCase } from './useCase';

type Props = {
  id: number; overview: Overview; session: Session; hidden: boolean;
  onOpen: (id: number) => void; onNext: () => void; hasNext: boolean;
  onSaved: (message: string) => void; notify: (message: string, error?: boolean) => void;
  /** Reloads the desk's case list (a booking can close a case). */
  onRefresh?: () => void;
  showRelated?: boolean;
};

/** One learner's call workspace in the desk's Follow-ups: call, record the call, and the case's details. */
export default function LearnerPanel({ id, overview, session, hidden, onOpen, onNext, hasNext, onSaved, notify, onRefresh, showRelated = true }: Props) {
  const { detail, error, refresh } = useCase(id, session.agentId);
  // The call just made from this panel (its cases), and the one already saved, so it is not offered again while reloading.
  const [called, setCalled] = useState<number[] | null>(null);
  const [recorded, setRecorded] = useState('');
  const [recording, setRecording] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [bookingEmailOpen, setBookingEmailOpen] = useState(false);
  useEffect(() => { if (!hidden) refresh(); }, [hidden, overview.generated_at, refresh]);

  const className = 'ec-card ed-learner';
  if (error) return <article className={className} id={`ed-case-${id}`} hidden={hidden}><p role="alert">{error}</p></article>;
  if (!detail) return <article className={className} id={`ed-case-${id}`} hidden={hidden}><p role="status">Loading the case…</p></article>;
  const c = detail.ticket;
  const employer = c.source_type === 'employer_feedback';
  const listed = overview.cases.find(item => item.id === c.id);
  const callReason = listed ? callDisabledReason(listed, session) : 'Case is not active';
  const related = detail.issues.filter(issue => issue.id !== c.id);
  const lastCall = detail.calls[0];
  const callIds = called || detail.open_call?.ticket_ids || null;
  const callCases = callIds && callIds.join() !== recorded ? overview.cases.filter(item => callIds.includes(item.id)) : [];

  const epaRaw = c.source_type === 'epa' ? (c.source_data?.epa_metrics as Record<string, string | number> | undefined) : undefined;
  const epa = epaRaw && Object.keys(epaRaw).length > 0 ? epaRaw : undefined;
  const epaPair = (done?: string | number, total?: string | number, status?: string | number) => {
    const ratio = `${done ?? ''}`.trim() && `${total ?? ''}`.trim() ? `${done} / ${total}` : '';
    return [ratio, `${status ?? ''}`.trim()].filter(Boolean).join(' · ');
  };

  async function call() {
    setBusy(true);
    try {
      const result = await caseAction(session, c.id, 'call');
      const ids = result.ticket_ids || [c.id];
      notify('Zoom Phone opened. When you hang up, record the call for every case in “Record this call”.');
      setRecorded('');
      setCalled(ids);
      refresh();
      onRefresh?.();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={className} id={`ed-case-${c.id}`} hidden={hidden}>
      <div className="ec-head">
        <div>
          <p className="ec-eyebrow">{issueLabel(c)}</p>
          <h2>{c.learner_name}</h2>
          <p className="ec-muted">{employer
            ? `Employer · ${c.organisation || 'Organisation not recorded'}`
            : `${c.programme || 'Programme not recorded'} · ${c.organisation || 'Employer not recorded'}`}</p>
        </div>
        <span className="ec-tag">{human(c.status)}</span>
      </div>
      {showRelated && !!related.length && <LearnerCases cases={[c, ...related]} selected={c.id} onOpen={onOpen} />}
      <div className="ed-phone-line"><strong>{c.learner_phone || 'Phone number not recorded'}</strong>{!employer && <span>Coach: {c.coach || 'Not recorded'}</span>}</div>
      {employer && <p className="ec-muted">Learners: {c.employer_learners?.map(l => l.name).join(', ') || 'None in the directory'}</p>}
      <p className="ed-purpose">{casePurpose(c)}</p>
      <CaseDates ticket={c} />
      {c.helpdesk && (
        <p className="ec-muted">Ticket {c.helpdesk.ticket} ({c.helpdesk.subcategory}) · {helpdeskStatus(c.helpdesk)} · raised by {c.helpdesk.raised_by}
          {c.helpdesk.helpdesk_error ? ` · Last status check failed: ${c.helpdesk.helpdesk_error}` : ''}</p>
      )}
      <div className="ec-buttons">
        <button type="button" className="primary" disabled={busy || !!callReason} title={callReason || undefined} onClick={() => void call()}>{employer ? 'Call employer' : 'Call learner'}</button>
        {c.status !== 'resolved' && !!c.bookable.length && <BookSession caseId={c.id} session={session} notify={notify} onBooked={() => { refresh(); onRefresh?.(); }} />}
        {c.status !== 'resolved' && <BookingPage c={c} />}
        {c.status !== 'resolved' && c.booking_email && <button type="button" disabled={session.preview} onClick={() => setBookingEmailOpen(true)}>Booking email</button>}
        {!employer && c.source_type !== 'tech_support' && <TechIssue caseId={c.id} learner={c.learner_name} session={session} notify={notify} onRaised={() => { refresh(); onRefresh?.(); }} />}
        {isSatisfaction(c) && <button type="button"
          disabled={session.preview || !session.canAct || !satisfactionRecipient(c)}
          onClick={() => setEmailOpen(true)}>Email</button>}
      </div>
      {callReason && <p className="ec-muted ed-call-note">{session.preview ? `Calls are disabled in this director preview. ${session.name} must sign in to call.` : `${callReason}.`}</p>}
      {c.sla_breached
        ? <p className="ed-verification">This call is {c.sla_days_overdue} {c.sla_days_overdue === 1 ? 'day' : 'days'} past its due date. First confirm the learner’s current position.</p>
        : <p className="ec-muted">Call due by {longDate(c.due_at)}</p>}

      <details className="ed-disclosure">
        <summary>Learner context & contacts</summary>
        <dl className="ec-dl">
          {[['Email', c.learner_email], ['Employer', c.organisation], ['Line manager', c.manager_name], ['Line manager email', c.manager_email], ['Unanswered calls', String(c.attempts)], ['In progress with', c.claimed_by || 'Nobody']]
            .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
        </dl>
        {lastCall ? <><h3>Last call</h3><p>{longDate(lastCall.started_at)} · {human(lastCall.result)}{lastCall.outcome ? ` · ${human(lastCall.outcome)}` : ''}</p></> : <p className="ec-muted">No verified call yet.</p>}
      </details>

      {epa && (
        <details className="ed-disclosure" open>
          <summary>EPA readiness</summary>
          <p className="ec-muted">Figures from the last Aptem sync — check the learner’s current position before agreeing the next step.</p>
          <dl className="ec-dl">
            {[
              ['Gateway review', epa.gateway_review_date],
              ['Programme end', epa.end_date],
              ['KSBs', epaPair(epa.ksb_completed, epa.ksb_total, epa.ksb_status)],
              ['Off-the-job hours', epaPair(epa.otj_completed, epa.otj_planned, epa.otj_status)],
              ['Components', epaPair(epa.components_completed, epa.components_target, epa.components_status)],
              ['Progress variance', epa.progress_variance],
              ['Coach RAG', epa.coach_rag],
            ].map(([label, value]) => <div key={label as string}><dt>{label}</dt><dd>{`${value ?? ''}`.trim() || 'Not recorded'}</dd></div>)}
          </dl>
        </details>
      )}

      <details className="ed-disclosure" open>
        <summary>Short call guide</summary>
        <ol className="ec-script">{shortGuide(c, session.name).map(line => <li key={line}>{line}</li>)}</ol>
        {c.ai_summary && <p className="ec-muted">AI case review: {c.ai_summary}</p>}
      </details>

      {callCases.length > 0 && (
        <section className="ed-outcome">
          <h3>Record this call</h3>
          <CallOutcome key={callIds!.join()} callFrom={callCases[0].id} name={c.learner_name} issues={callCases} session={session} notify={notify}
            saveLabel="Save the call" onSaved={message => {
              setRecorded(callIds!.join());
              setCalled(null);
              refresh();
              onSaved(message);
            }} />
        </section>
      )}
      {callCases.length === 0 && <NextStepForm compact detail={detail} session={session} onSaved={message => { refresh(); onSaved(message); }} onError={message => notify(message, true)} />}
      {isSatisfaction(c) && c.status !== 'resolved' && <section className="ed-disclosure">
        <SatisfactionFeedback key={c.id} caseId={c.id} name={c.learner_name} employer={employer} session={session}
          held={detail.held_feedback} onSaved={held => { refresh(); onSaved(feedbackMessage(held)); }} />
      </section>}
      {isSatisfaction(c) && c.status === 'resolved' && c.satisfaction_next_due_at &&
        <p>Next satisfaction review: {longDate(c.satisfaction_next_due_at)}</p>}
      <div className="ec-buttons" style={{ marginTop: '.5rem' }}>
        <button type="button" disabled={!hasNext} onClick={onNext}>Next learner</button>
      </div>

      <details className="ed-disclosure">
        <summary>Notes, recordings & evidence ({detail.events.length})</summary>
        <CallEvidence detail={detail} onRecording={setRecording} />
        <Timeline detail={detail} limit={12} />
      </details>
      <RecordingDialog callId={recording} onClose={() => setRecording(null)} />
      <Dialog open={bookingEmailOpen} onClose={() => setBookingEmailOpen(false)}>
        {bookingEmailOpen && <BookingEmail key={c.id} caseId={c.id} session={session} />}
      </Dialog>
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)}>
        {emailOpen && <SatisfactionEmail key={c.id} caseId={c.id} session={session} employer={employer} />}
      </Dialog>
    </article>
  );
}
