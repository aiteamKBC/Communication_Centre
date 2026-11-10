import { useEffect, useState } from 'react';
import type { Overview } from '../api';
import type { Session } from './actions';
import AttendancePanel from './AttendancePanel';
import BookSession from './BookSession';
import BookingEmail from './BookingEmail';
import BookingPage from './BookingPage';
import CaseDates from './CaseDates';
import { NextStepForm } from './CaseParts';
import { STATUS_NAMES, caseWhen, dueText } from './caseWords';
import Dialog from './Dialog';
import EmployerCheck from './EmployerCheck';
import MeetingTools from './MeetingTools';
import { casePurpose, feedbackMessage, helpdeskStatus, human, isSatisfaction, issueLabel, longDate, satisfactionRecipient, shortGuide } from './model';
import SatisfactionEmail from './SatisfactionEmail';
import SatisfactionFeedback from './SatisfactionFeedback';
import TechIssue from './TechIssue';
import { useCase } from './useCase';

type Props = {
  id: number; overview: Overview; session: Session; selected: boolean;
  onSaved: (message: string) => void; notify: (message: string, error?: boolean) => void; onRefresh: () => void;
};

const EPA_ROWS: [string, (epa: Record<string, string | number>) => string | number | undefined][] = [
  ['Gateway review', epa => epa.gateway_review_date], ['Programme end', epa => epa.end_date],
  ['KSBs', epa => pair(epa.ksb_completed, epa.ksb_total, epa.ksb_status)],
  ['Off-the-job hours', epa => pair(epa.otj_completed, epa.otj_planned, epa.otj_status)],
  ['Components', epa => pair(epa.components_completed, epa.components_target, epa.components_status)],
  ['Progress variance', epa => epa.progress_variance], ['Coach RAG', epa => epa.coach_rag],
];
function pair(done?: string | number, total?: string | number, status?: string | number) {
  const ratio = `${done ?? ''}`.trim() && `${total ?? ''}`.trim() ? `${done} / ${total}` : '';
  return [ratio, `${status ?? ''}`.trim()].filter(Boolean).join(' · ');
}

/** One of the learner's open cases in Full case: what it is about and what to achieve, the meeting and employer steps
 * for tomorrow's reviews, the actions (book, email, report an issue), and, tucked away, the call guide and recording an
 * outcome by hand. The call itself is made and recorded once for all cases, at the top of Full case. */
export default function CaseCard({ id, overview, session, selected, onSaved, notify, onRefresh }: Props) {
  const { detail, error, refresh } = useCase(id, session.agentId);
  const [emailOpen, setEmailOpen] = useState(false);
  const [bookingEmailOpen, setBookingEmailOpen] = useState(false);
  useEffect(() => { refresh(); }, [overview.generated_at, refresh]);
  const changed = () => { refresh(); onRefresh(); };

  if (error) return <article className="lf-case" id={`ed-case-${id}`}><p role="alert">{error}</p></article>;
  if (!detail) return <article className="lf-case" id={`ed-case-${id}`}><p role="status">Loading the case…</p></article>;
  const c = detail.ticket;
  const employer = c.source_type === 'employer_feedback';
  const open = c.status !== 'resolved';
  const late = c.sla_breached && open;
  const epaRaw = c.source_type === 'epa' ? (c.source_data?.epa_metrics as Record<string, string | number> | undefined) : undefined;
  const epa = epaRaw && Object.keys(epaRaw).length ? epaRaw : undefined;
  const canClose = !isSatisfaction(c) && (session.isManager || c.specialist_closes);
  const attendance = c.source_type === 'attendance';

  return (
    <article className={`lf-case${selected ? ' selected' : ''}${late ? ' late' : ''}`} id={`ed-case-${id}`} aria-label={`${issueLabel(c)}: ${caseWhen(c)}`}>
      <header className="lf-case-head">
        <div>
          <p className="lf-kind">{issueLabel(c)}</p>
          <h3>{caseWhen(c)}</h3>
        </div>
        <div className="lf-case-state">
          <span className={`ec-tag ${c.status === 'resolved' ? 'green' : late ? 'red' : ''}`}>{STATUS_NAMES[c.status] || human(c.status)}</span>
          {dueText(c) && <small>{dueText(c)}</small>}
        </div>
      </header>

      {/* A missed lecture: the learner's register beside the case, to read before calling and correct on the call. */}
      <div className={attendance ? 'lf-case-split' : undefined}>
        <div className="lf-case-body">
          <p className="lf-purpose">{casePurpose(c)}</p>
          {late && <p className="lf-warning">This call is {c.sla_days_overdue} {c.sla_days_overdue === 1 ? 'day' : 'days'} late: first check where the learner is now.</p>}
          <CaseDates ticket={c} />
          {c.helpdesk && (
            <p className="lf-note">Ticket {c.helpdesk.ticket} ({c.helpdesk.subcategory}) · {helpdeskStatus(c.helpdesk)} · raised by {c.helpdesk.raised_by}
              {c.helpdesk.helpdesk_error ? ` · last status check failed: ${c.helpdesk.helpdesk_error}` : ''}</p>
          )}
          {employer && <p className="lf-note">Learners: {c.employer_learners?.map(l => l.name).join(', ') || 'none in the directory'}</p>}
          {c.ai_summary && <p className="lf-note">AI case review: {c.ai_summary}</p>}

          {open && (c.meeting || c.employer_check) && (
            <div className="lf-steps">
              <MeetingTools c={c} session={session} notify={notify} onChanged={changed} />
              <EmployerCheck c={c} session={session} notify={notify} onChanged={changed} />
            </div>
          )}

          {open && (
            <div className="lf-actions">
              {!!c.bookable.length && <BookSession caseId={c.id} session={session} notify={notify} onBooked={changed} />}
              <BookingPage c={c} />
              {c.booking_email && <button type="button" disabled={session.preview} onClick={() => setBookingEmailOpen(true)}>Booking email</button>}
              {isSatisfaction(c) && <button type="button" disabled={session.preview || !session.canAct || !satisfactionRecipient(c)}
                onClick={() => setEmailOpen(true)}>Satisfaction email</button>}
              {!employer && c.source_type !== 'tech_support' && <TechIssue caseId={c.id} learner={c.learner_name} session={session} notify={notify} onRaised={changed} />}
            </div>
          )}

          {epa && (
            <details className="lf-more" open>
              <summary>EPA readiness</summary>
              <p className="ec-muted">From the last Aptem sync: check the learner’s current position before agreeing the next step.</p>
              <dl className="ec-dl">
                {EPA_ROWS.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{`${value(epa) ?? ''}`.trim() || 'Not recorded'}</dd></div>)}
              </dl>
            </details>
          )}
          {isSatisfaction(c) && open && (
            <details className="lf-more" open={!!detail.held_feedback}>
              <summary>Satisfaction feedback</summary>
              <SatisfactionFeedback key={c.id} caseId={c.id} name={c.learner_name} employer={employer} session={session}
                held={detail.held_feedback} onSaved={held => { refresh(); onSaved(feedbackMessage(held)); }} />
            </details>
          )}
          {isSatisfaction(c) && !open && c.satisfaction_next_due_at && <p className="lf-note">Next satisfaction review: {longDate(c.satisfaction_next_due_at)}</p>}

          <details className="lf-more">
            <summary>Call guide</summary>
            <ol className="ec-script">{shortGuide(c, session.name).map(line => <li key={line}>{line}</li>)}</ol>
          </details>
          <details className="lf-more">
            <summary>{canClose ? 'Resolve, record by hand or add a note' : 'Record an outcome by hand or add a note'}</summary>
            <NextStepForm compact detail={detail} session={session} onSaved={message => { refresh(); onSaved(message); }} onError={message => notify(message, true)} />
          </details>
        </div>
        {attendance && <AttendancePanel caseId={c.id} open={open} session={session} notify={notify} onChanged={changed} />}
      </div>

      <Dialog open={bookingEmailOpen} onClose={() => setBookingEmailOpen(false)}>
        {bookingEmailOpen && <BookingEmail key={c.id} caseId={c.id} session={session} />}
      </Dialog>
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)}>
        {emailOpen && <SatisfactionEmail key={c.id} caseId={c.id} session={session} employer={employer} />}
      </Dialog>
    </article>
  );
}
