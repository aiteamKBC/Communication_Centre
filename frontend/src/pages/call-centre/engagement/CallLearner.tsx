import { useEffect, useMemo, useState } from 'react';
import { api, post } from '../api';
import type { Overview } from '../api';
import type { Session } from './actions';
import CallOutcome from './CallOutcome';
import SatisfactionFeedback from './SatisfactionFeedback';
import { feedbackMessage, longDate } from './model';

type Satisfaction = { due: boolean; last_completed_at: string | null; score: number | null; next_due_at: string | null } | null;
type Learner = {
  email: string; name: string; phone: string; programme: string; organisation: string; coach: string; manager: string;
  open_cases: number; satisfaction: Satisfaction;
};
type Dialled = { zoom_url?: string; case_id: number; satisfaction_case_id: number | null };
/** The optional call just made: its case, and the learner's open satisfaction review it can complete. */
type Call = { caseId: number; satisfactionId: number | null; saved: boolean; feedback: boolean };

function reviewText(review: Satisfaction) {
  if (!review) return 'No satisfaction review on record.';
  const last = review.last_completed_at ? `last done ${longDate(review.last_completed_at)}${review.score ? ` (score ${review.score}/5)` : ''}` : '';
  if (review.due) return `Satisfaction review due now${last ? `; ${last}` : ''}.`;
  return `Satisfaction review done for this period${last ? `: ${last}` : ''}${review.next_due_at ? `; next due ${longDate(review.next_due_at)}` : ''}.`;
}

/** An employer specialist's optional calls: find any learner, call them, record the call and, if they like, their feedback. */
export default function CallLearner({ overview, session, notify, onRefresh }: {
  overview: Overview; session: Session; notify: (message: string, error?: boolean) => void; onRefresh: () => void;
}) {
  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Learner | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ learners: Learner[] }>(`optional-calls/${session.agentId ? `?agent_id=${session.agentId}` : ''}`)
      .then(data => { if (live) setLearners(data.learners); })
      .catch(failure => { if (live) setError(failure instanceof Error ? failure.message : 'The learner list could not be loaded.'); });
    return () => { live = false; };
  }, [session.agentId]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (learners || []).filter(l => !query
      || [l.name, l.email, l.organisation, l.manager, l.coach, l.programme].join(' ').toLowerCase().includes(query)).slice(0, 50);
  }, [learners, search]);
  const optionalCase = call ? overview.cases.find(c => c.id === call.caseId) : undefined;

  async function dial() {
    if (!chosen) return;
    setBusy(true);
    try {
      const result = await post<Dialled>('optional-calls/', session.csrf, { learner_email: chosen.email, agent_id: session.agentId });
      if (result.zoom_url) window.location.href = result.zoom_url;
      setCall({ caseId: result.case_id, satisfactionId: result.satisfaction_case_id, saved: false, feedback: false });
      notify(`Zoom Phone opened for ${chosen.name}. When you hang up, record the call below.`);
      onRefresh();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    setCall(null);
    setChosen(null);
    onRefresh();
  }

  if (chosen) {
    return (
      <section className="ec-card ed-next ed-call-learner">
        <h2 className="ed-next-name">{chosen.name}</h2>
        <p className="ec-muted">{chosen.programme || 'Programme not recorded'} · {chosen.organisation || 'Employer not recorded'}
          {chosen.manager ? ` · Line manager: ${chosen.manager}` : ''} · Coach: {chosen.coach || 'not recorded'}</p>
        <p className="ed-call-phone"><strong>{chosen.phone || 'Phone number not recorded'}</strong></p>
        <p>{reviewText(chosen.satisfaction)}{chosen.open_cases ? ` ${chosen.open_cases} open ${chosen.open_cases === 1 ? 'case' : 'cases'} with the other specialists.` : ''}</p>

        {!call ? (
          <>
            <p className="ec-muted">An optional call: it is on nobody’s list and is never overdue. Saving the call closes it.</p>
            <button type="button" className="primary ed-next-call" disabled={busy || !chosen.phone || session.preview || !session.canAct}
              onClick={() => void dial()}>{busy ? 'Opening Zoom…' : '📞 Call'}</button>
            <div className="ec-buttons" style={{ marginTop: '1rem' }}>
              <button type="button" disabled={busy} onClick={() => setChosen(null)}>Back to the learners</button>
            </div>
          </>
        ) : (
          <>
            {!call.saved && (optionalCase ? (
              <CallOutcome key={call.caseId} callFrom={call.caseId} name={chosen.name} issues={[optionalCase]} session={session} notify={notify}
                saveLabel="Save the call" onSaved={message => { notify(message); setCall({ ...call, saved: true }); onRefresh(); }} />
            ) : <p role="status">Loading the call…</p>)}
            {call.saved && <p className="ec-tag">Call saved.</p>}
            {call.feedback && <p className="ec-tag">Satisfaction feedback saved.</p>}

            {!call.feedback && <details className="ed-disclosure" open={call.saved}>
              <summary>Satisfaction feedback (optional)</summary>
              {call.satisfactionId ? (
                <>
                  <p className="ec-muted">Their review is due: this feedback counts as their review once Zoom confirms the call was answered, and it leaves the other agents’ lists.</p>
                  <SatisfactionFeedback key={call.satisfactionId} caseId={call.satisfactionId} name={chosen.name} session={session}
                    onSaved={held => { notify(feedbackMessage(held)); setCall({ ...call, feedback: true }); }} />
                </>
              ) : (
                <SatisfactionFeedback key={call.caseId} caseId={call.caseId} name={chosen.name} session={session} command="extra_feedback" extra
                  onSaved={() => { notify('Feedback saved with the call.'); setCall({ ...call, feedback: true }); }} />
              )}
            </details>}
            {call.saved && (
              <div className="ec-buttons" style={{ marginTop: '1rem' }}>
                <button type="button" className="primary" onClick={finish}>Call another learner</button>
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="ec-card ed-call-learner">
      <h2>Call a learner</h2>
      <p className="ec-muted">Any learner, at any time. These calls are optional: they are on nobody’s list and never overdue. If their satisfaction review is due, you can complete it on the call.</p>
      <input type="search" aria-label="Search learners" placeholder="Learner, email, employer, line manager or coach" value={search}
        onChange={event => setSearch(event.target.value)} />
      {error && <p className="ec-alert" role="alert">{error}</p>}
      {!learners && !error && <p role="status">Loading learners…</p>}
      {learners && (
        <>
          <p className="ec-muted">{shown.length < (learners.length) ? `Showing ${shown.length} of ${learners.length} learners: search to narrow down.` : `${shown.length} learners`}</p>
          <ul className="ed-learner-results">
            {shown.map(l => (
              <li key={l.email}>
                <button type="button" onClick={() => setChosen(l)}>
                  <strong>{l.name || l.email}</strong>
                  <span>{l.organisation || 'Employer not recorded'}{l.manager ? ` · ${l.manager}` : ''} · {l.programme || 'Programme not recorded'}</span>
                  <small>{l.satisfaction?.due ? 'Satisfaction review due' : l.satisfaction?.last_completed_at ? `Review done ${longDate(l.satisfaction.last_completed_at)}` : 'No review on record'}
                    {l.phone ? '' : ' · no phone number'}</small>
                </button>
              </li>
            ))}
            {!shown.length && <li className="ec-muted">No learners match.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
