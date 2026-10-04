import { useState } from 'react';
import type { Overview } from '../api';
import { callDisabledReason, caseAction } from './actions';
import type { Session } from './actions';
import BookSession from './BookSession';
import { CallEvidence, NextStepForm, Timeline } from './CaseParts';
import { casePurpose, caseTone, human, issueLabel, longDate, shortGuide } from './model';
import RecordingDialog from './Recordings';
import { useCase } from './useCase';

type Props = { id: number; overview: Overview; session: Session; onOpen: (id: number) => void; notify: (message: string, error?: boolean) => void; onChanged: () => void };

/** The director's full learner call workspace for one case. */
export default function CaseWorkspace({ id, overview, session, onOpen, notify, onChanged }: Props) {
  const { detail, error, refresh } = useCase(id);
  const [recording, setRecording] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <p role="alert">{error}</p>;
  if (!detail) return <p role="status">Loading the learner’s case…</p>;
  const c = detail.ticket;
  const listed = overview.cases.find(item => item.id === c.id);
  const callReason = listed ? callDisabledReason(listed, session) : 'Case is not active';
  const mine = !!c.claimed_agent_id && c.claimed_agent_id === session.agentId;

  async function run(command: string, message: string) {
    setBusy(true);
    try {
      await caseAction(session, c.id, command);
      notify(message);
      refresh();
      onChanged();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The case could not be updated.', true);
    } finally {
      setBusy(false);
    }
  }

  const saved = (message: string) => {
    notify(message);
    refresh();
    onChanged();
  };

  return (
    <>
      <div className="ec-head">
        <div><h2 style={{ margin: 0 }}>{c.learner_name}</h2><span className="ec-muted">{c.programme || 'Programme not recorded'} · {c.organisation || 'Employer not recorded'}</span></div>
        <span className={`ec-tag ${caseTone(c)}`}>{human(c.status)}</span>
      </div>
      <div className="ec-split">
        <div className="ec-stack">
          <section className="ec-card">
            <h2>{issueLabel(c)}</h2>
            <p>{casePurpose(c)}</p>
            <dl className="ec-dl">
              {[
                ['Engagement specialist', c.claimed_by || 'Not in progress'], ['Learner phone', c.learner_phone],
                ['Learner email', c.learner_email], ['Employer', c.organisation], ['Line manager', c.manager_name],
                ['Line manager email', c.manager_email], ['Coach', c.coach], ['Due', longDate(c.due_at)],
                ['Next contact', c.next_followup_at ? longDate(c.next_followup_at) : 'Due now'], ['Call attempts', `${c.attempts} of 3`],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
            </dl>
            <div className="ec-alert">
              {c.sla_breached ? `Overdue by ${c.sla_days_overdue} days. ` : ''}
              {c.learner_days_overdue ? `The learner’s activity has been outstanding for ${c.learner_days_overdue} days. ` : ''}
              Check the learner’s current position before discussing a recorded gap.
            </div>
            <div className="ec-buttons">
              <button type="button" className="primary" disabled={busy || !!callReason} title={callReason || undefined} onClick={() => void run('call', 'Zoom Phone opened. Record the outcome once Zoom reports the call.')}>Call learner</button>
              {!session.preview && c.status !== 'resolved' && (
                <button type="button" disabled={busy || !session.agentId || (!!c.claimed_agent_id && !mine)} onClick={() => void run(mine ? 'release' : 'claim', mine ? 'Case released.' : 'Case claimed.')}>
                  {mine ? 'Release case' : 'Claim case'}
                </button>
              )}
              {c.status !== 'resolved' && <BookSession caseId={c.id} session={session} notify={notify} onBooked={() => { refresh(); onChanged(); }} />}
            </div>
            {callReason && <p className="ec-muted">{callReason}.</p>}
          </section>
          {detail.issues.filter(issue => issue.id !== c.id).length > 0 && (
            <section className="ec-card">
              <h2>Other open issues for this learner</h2>
              <p>Review these together to avoid separate calls about the same learner.</p>
              {detail.issues.filter(issue => issue.id !== c.id).map(issue => (
                <p key={issue.id}><button type="button" onClick={() => onOpen(issue.id)}>{issueLabel(issue)}</button> · {human(issue.status)}</p>
              ))}
            </section>
          )}
          <section className="ec-card">
            <h2>Purposeful call guide</h2>
            <p className="ec-muted">Use your judgement and the learner’s answers.</p>
            <ol className="ec-script">{shortGuide(c, session.name).map(line => <li key={line}>{line}</li>)}</ol>
          </section>
          {c.ai_summary && (
            <section className="ec-card">
              <h2>AI case review</h2>
              <p>{c.ai_summary}</p>
              <p className="ec-muted">Confidence {Math.round((c.ai_confidence || 0) * 100)}%. AI findings require a human decision.</p>
            </section>
          )}
          <section className="ec-card"><h2>Call evidence</h2><CallEvidence detail={detail} onRecording={setRecording} /></section>
        </div>
        <div className="ec-stack">
          <section className="ec-card">
            <h2>Next step</h2>
            <NextStepForm detail={detail} session={session} onSaved={saved} onError={message => notify(message, true)} />
          </section>
          <section className="ec-card"><h2>Latest activity</h2><Timeline detail={detail} /></section>
        </div>
      </div>
      <RecordingDialog callId={recording} onClose={() => setRecording(null)} />
    </>
  );
}
