import { useEffect, useState } from 'react';
import type { Issue, Overview } from '../api';
import { callDisabledReason, caseAction } from './actions';
import type { Session } from './actions';
import CallOutcome from './CallOutcome';
import { activeCase, contactKey, dueForCall, issueLabel } from './model';
import LearnerCases from './LearnerCases';
import LearnerPanel from './LearnerPanel';
import { useCase } from './useCase';

/** Full case: the learner once, one Call for all their cases with one form to record it, then every case one under
 * another on the same page. The list on the left scrolls to a case. */
export default function LearnerWorkspace({ id, overview, session, onSaved, notify, onRefresh }: {
  id: number; overview: Overview; session: Session; onSaved: (message: string) => void;
  notify: (message: string, error?: boolean) => void; onRefresh: () => void;
}) {
  const [selected, setSelected] = useState(id);
  // The call just made (its cases), and the one already saved, so it is not offered again while the page reloads.
  const [called, setCalled] = useState<number[] | null>(null);
  const [recorded, setRecorded] = useState('');
  const [busy, setBusy] = useState(false);
  const { detail, error, refresh } = useCase(id, session.agentId);
  useEffect(() => { refresh(); }, [overview.generated_at, refresh]);
  const initial = detail?.ticket || overview.cases.find(c => c.id === id);
  // The learner's open cases: one closed during the call (a booked catch-up, a resolved case) drops off the page.
  const cases = new Map<number, Issue>();
  if (initial) {
    for (const c of overview.cases) {
      if (activeCase(c) && contactKey(c) === contactKey(initial)) cases.set(c.id, c);
    }
    for (const c of detail?.issues || []) {
      if (activeCase(c)) cases.set(c.id, c);
    }
  }

  // The call: shown as soon as it is made, from here or from Next call before Full case was opened.
  const callIds = called || detail?.open_call?.ticket_ids || null;
  const callCases = callIds && callIds.join() !== recorded ? overview.cases.filter(c => callIds.includes(c.id)) : [];
  const due = initial ? overview.cases.filter(c => contactKey(c) === contactKey(initial) && activeCase(c) && dueForCall(c)) : [];
  const callFrom = due.find(c => c.id === id) || due[0];
  const reason = callFrom ? callDisabledReason(callFrom, session) : '';
  const labels = [...due.reduce((all, c) => all.set(issueLabel(c), (all.get(issueLabel(c)) || 0) + 1), new Map<string, number>())]
    .map(([label, count]) => (count > 1 ? `${label} ×${count}` : label));
  const employer = initial?.source_type === 'employer_feedback';

  async function call() {
    if (!callFrom) return;
    setBusy(true);
    try {
      const result = await caseAction(session, callFrom.id, 'call');
      setRecorded('');
      setCalled(result.ticket_ids || [callFrom.id]);
      notify('Zoom Phone opened. When you hang up, record what happened for every case at the top of Full case.');
      refresh();
      onRefresh();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  function callSaved(message: string) {
    setRecorded(callIds!.join());
    setCalled(null);
    refresh();
    onSaved(message);
  }

  function open(caseId: number) {
    setSelected(caseId);
    document.getElementById(`ed-case-${caseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return <div className="ed-contact-workspace">
    <aside>
      <LearnerCases cases={[...cases.values()]} selected={selected} onOpen={open} />
      {error && <p role="alert">Could not load all cases. {error} <button type="button" onClick={refresh}>Retry</button></p>}
      {!detail && !error && <p role="status">Loading all cases…</p>}
      {overview.cases_truncated && !detail && <p>More cases may be available when loading completes.</p>}
    </aside>
    <div className="ed-contact-panel">
      {initial && (
        <section className="ec-card ed-call-record">
          <h2>{initial.learner_name}</h2>
          <p className="ec-muted">{employer
            ? `Employer · ${initial.organisation || 'Organisation not recorded'}`
            : `${initial.programme || 'Programme not recorded'} · ${initial.organisation || 'Employer not recorded'} · Coach: ${initial.coach || 'not recorded'}`}</p>
          <p className="ed-call-phone"><strong>{initial.learner_phone || 'Phone number not recorded'}</strong></p>
          {detail && (
            <details className="ed-disclosure">
              <summary>Learner context & contacts</summary>
              <dl className="ec-dl">
                {[['Email', detail.ticket.learner_email], ['Employer', detail.ticket.organisation], ['Line manager', detail.ticket.manager_name],
                  ['Line manager email', detail.ticket.manager_email], ['Unanswered calls', String(detail.ticket.attempts)]]
                  .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
              </dl>
            </details>
          )}
          {callCases.length > 0 ? (
            <>
              <h3>Record this call · {callCases.length} {callCases.length === 1 ? 'case' : 'cases'}</h3>
              <CallOutcome key={callIds!.join()} callFrom={callCases[0].id} name={initial.learner_name} issues={callCases} session={session}
                notify={notify} onSaved={callSaved} saveLabel="Save the call" />
            </>
          ) : callFrom ? (
            <>
              <h3>Call · {due.length} {due.length === 1 ? 'case' : 'cases'}</h3>
              <p className="ec-muted">One call covers {labels.join(' · ')}. When you hang up, record what happened for all of them here, in one form.</p>
              <button type="button" className="primary" disabled={busy || !!reason} title={reason || undefined} onClick={() => void call()}>
                {busy ? 'Opening Zoom…' : '📞 Call'}
              </button>
              {reason && <p className="ec-muted">{reason}.</p>}
            </>
          ) : <p className="ec-muted">No case is due for a call now: learners come back when their follow-up is due.</p>}
        </section>
      )}
      {initial && detail && !cases.size && <section className="ec-card"><p>All of {initial.learner_name}’s cases are closed.</p></section>}
      {[...cases.keys()].map(caseId => <LearnerPanel key={caseId} id={caseId} overview={overview} session={session} inWorkspace
        hidden={false} showRelated={false} onOpen={open} onNext={() => {}} hasNext={false}
        onSaved={message => { refresh(); onSaved(message); }} notify={notify}
        onRefresh={() => { refresh(); onRefresh(); }} />)}
    </div>
  </div>;
}
