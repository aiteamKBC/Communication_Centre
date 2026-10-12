import { useState } from 'react';
import type { Overview } from '../api';
import { callDisabledReason, caseAction } from './actions';
import type { Session } from './actions';
import BookSession from './BookSession';
import Dialog from './Dialog';
import SatisfactionEmail from './SatisfactionEmail';
import SatisfactionFeedback from './SatisfactionFeedback';
import { CallEvidence, NextStepForm, Timeline } from './CaseParts';
import { MAX_MISSED_CALLS, casePurpose, human, isSatisfaction, issueLabel, longDate, shortGuide } from './model';
import RecordingDialog from './Recordings';
import { useCase } from './useCase';

type Props = {
  id: number; overview: Overview; session: Session; hidden: boolean;
  onOpen: (id: number) => void; onNext: () => void; hasNext: boolean;
  onSaved: (message: string) => void; notify: (message: string, error?: boolean) => void;
};

/** One learner's call workspace inside the operator desk. */
export default function LearnerPanel({ id, overview, session, hidden, onOpen, onNext, hasNext, onSaved, notify }: Props) {
  const { detail, error, refresh } = useCase(id);
  const [recording, setRecording] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  if (error) return <article className="ec-card ed-learner" hidden={hidden}><p role="alert">{error}</p></article>;
  if (!detail) return <article className="ec-card ed-learner" hidden={hidden}><p role="status">Loading the learner’s workspace…</p></article>;
  const c = detail.ticket;
  const employer = c.source_type === 'employer_feedback';
  const listed = overview.cases.find(item => item.id === c.id);
  const callReason = listed ? callDisabledReason(listed, session) : 'Case is not active';
  const related = detail.issues.filter(issue => issue.id !== c.id);
  const lastCall = detail.calls[0];

  const epaRaw = c.source_type === 'epa' ? (c.source_data?.epa_metrics as Record<string, string | number> | undefined) : undefined;
  const epa = epaRaw && Object.keys(epaRaw).length > 0 ? epaRaw : undefined;
  const epaPair = (done?: string | number, total?: string | number, status?: string | number) => {
    const ratio = `${done ?? ''}`.trim() && `${total ?? ''}`.trim() ? `${done} / ${total}` : '';
    return [ratio, `${status ?? ''}`.trim()].filter(Boolean).join(' · ');
  };

  async function call() {
    setBusy(true);
    try {
      await caseAction(session, c.id, 'call');
      notify('Zoom Phone opened. Record the outcome once Zoom reports the call.');
      refresh();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="ec-card ed-learner" hidden={hidden}>
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
      <div className="ed-phone-line"><strong>{c.learner_phone || 'Phone number not recorded'}</strong>{!employer && <span>Coach: {c.coach || 'Not recorded'}</span>}</div>
      {employer && <p className="ec-muted">Learners: {c.employer_learners?.map(l => l.name).join(', ') || 'None in the directory'}</p>}
      <p className="ed-purpose">{casePurpose(c)}</p>
      <div className="ec-buttons">
        <button type="button" className="primary" disabled={busy || !!callReason} title={callReason || undefined} onClick={() => void call()}>{employer ? 'Call employer' : 'Call learner'}</button>
        {c.status !== 'resolved' && !employer && <BookSession caseId={c.id} session={session} notify={notify} onBooked={refresh} />}
        {c.source_type === 'learner_satisfaction' && <button type="button"
          disabled={session.preview || !session.canAct || !c.learner_email}
          onClick={() => setEmailOpen(true)}>Email</button>}
      </div>
      {callReason && <p className="ec-muted ed-call-note">{session.preview ? `Calls are disabled in this director preview. ${session.name} must sign in to call.` : `${callReason}.`}</p>}
      {c.sla_breached
        ? <p className="ed-verification">Overdue by {c.sla_days_overdue} days. First confirm the learner’s current position.</p>
        : <p className="ec-muted">Due {longDate(c.due_at)}</p>}

      <details className="ed-disclosure">
        <summary>Learner context & contacts</summary>
        <dl className="ec-dl">
          {[['Email', c.learner_email], ['Employer', c.organisation], ['Line manager', c.manager_name], ['Line manager email', c.manager_email], ['Call attempts', `${c.attempts} of ${MAX_MISSED_CALLS}`], ['In progress with', c.claimed_by || 'Nobody']]
            .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
        </dl>
        {lastCall ? <><h3>Last call</h3><p>{longDate(lastCall.started_at)} · {human(lastCall.result)}{lastCall.outcome ? ` · ${human(lastCall.outcome)}` : ''}</p></> : <p className="ec-muted">No verified call yet.</p>}
        {!!related.length && (
          <>
            <h3>Other open issues</h3>
            {related.map(issue => <button key={issue.id} type="button" onClick={() => onOpen(issue.id)}>{issueLabel(issue)}</button>)}
          </>
        )}
      </details>

      {epa && (
        <details className="ed-disclosure" open>
          <summary>EPA readiness</summary>
          <p className="ec-muted">Live figures from Aptem — check the learner’s real position before agreeing the next step.</p>
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

      <NextStepForm compact detail={detail} session={session} onSaved={message => { refresh(); onSaved(message); }} onError={message => notify(message, true)} />
      {isSatisfaction(c) && c.status !== 'resolved' && <section className="ed-disclosure">
        <SatisfactionFeedback key={c.id} caseId={c.id} name={c.learner_name} employer={employer} session={session}
          onSaved={() => { refresh(); onSaved('Feedback completed. Next review is due in three calendar months.'); }} />
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
      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)}>
        {emailOpen && <SatisfactionEmail key={c.id} caseId={c.id} session={session} />}
      </Dialog>
    </article>
  );
}
