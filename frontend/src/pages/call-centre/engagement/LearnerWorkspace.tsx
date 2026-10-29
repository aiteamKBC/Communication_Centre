import { useEffect, useState } from 'react';
import type { Overview, OverviewCase } from '../api';
import { callDisabledReason, caseAction } from './actions';
import type { Session } from './actions';
import CallOutcome from './CallOutcome';
import CaseCard from './CaseCard';
import CaseHistory from './CaseHistory';
import { STATUS_NAMES, caseWhen, dueText } from './caseWords';
import { activeCase, contactKey, dueForCall, human, issueLabel, when } from './model';
import { useCase } from './useCase';

/** Full case: one person and everything about them, for Today, the lists and the director.
 *
 * At the top, who they are, their number and one Call for every open case, with the flags that change the conversation
 * (they rang us, declined tomorrow's meeting, a call is late). After a call, its form is right there. Then, beside a rail
 * of why we are calling and how to reach them, one card per open case with its steps and actions, and the history of
 * everything done with them: calls to play and read, missed calls and voicemails, the timeline and emails. */
export default function LearnerWorkspace({ id, overview, session, onSaved, notify, onRefresh }: {
  id: number; overview: Overview; session: Session; onSaved: (message: string) => void;
  notify: (message: string, error?: boolean) => void; onRefresh: () => void;
}) {
  const [selected, setSelected] = useState(id);
  // The call just made (its cases), and the one already saved, so it is not offered again while the page reloads.
  const [called, setCalled] = useState<number[] | null>(null);
  const [recorded, setRecorded] = useState('');
  const [busy, setBusy] = useState(false);
  const { detail, error, refresh } = useCase(id, session.agentId, true);
  useEffect(() => { refresh(); }, [overview.generated_at, refresh]);
  const person = detail?.ticket || overview.cases.find(c => c.id === id);

  // The person's open cases as the lists see them (with their meeting and employer steps), then any only the case knows.
  // Matched on the lists' key for this person: the case on its own may name them differently (person ID or email).
  const known = overview.cases.find(c => c.id === id || detail?.issues.some(issue => issue.id === c.id));
  const listed = person ? overview.cases.filter(c => activeCase(c) && contactKey(c) === contactKey(known || person)) : [];
  const caseIds = [...new Set([...listed.map(c => c.id), ...(detail?.issues || []).filter(activeCase).map(c => c.id)])];
  const due = listed.filter(c => dueForCall(c));
  const callFrom = due.find(c => c.id === id) || due[0];
  const reason = callFrom ? callDisabledReason(callFrom, session) : '';
  const callIds = called || detail?.open_call?.ticket_ids || null;
  const callCases = callIds && callIds.join() !== recorded ? overview.cases.filter(c => callIds.includes(c.id)) : [];
  const employer = person?.source_type === 'employer_feedback';

  async function call() {
    if (!callFrom) return;
    setBusy(true);
    try {
      const result = await caseAction(session, callFrom.id, 'call');
      setRecorded('');
      setCalled(result.ticket_ids || [callFrom.id]);
      notify('Zoom Phone opened. When you hang up, record the call for every case just below.');
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

  if (!person) return error ? <p role="alert">{error} <button type="button" onClick={refresh}>Try again</button></p> : <p role="status">Loading…</p>;
  const flags = personFlags(listed, person.learner_name);
  const phone = person.learner_phone;
  const managerPhone = detail?.ticket.manager_phone || '';

  return (
    <div className="lf ed-contact-workspace">
      <header className="lf-band">
        <div className="lf-who">
          <p className="lf-eyebrow">{employer ? 'Employer' : 'Learner'} · {caseIds.length} open {caseIds.length === 1 ? 'case' : 'cases'}</p>
          <h2>{person.learner_name}</h2>
          <p>{employer
            ? person.organisation || 'Organisation not recorded'
            : [person.programme || 'Programme not recorded', person.organisation, person.coach && `Coach ${person.coach}`].filter(Boolean).join(' · ')}</p>
          {flags.length > 0 && <ul className="lf-flags">{flags.map(([text, tone]) => <li key={text} className={tone}>{text}</li>)}</ul>}
        </div>
        <div className="lf-call">
          <strong className="lf-phone">{phone || 'No phone number'}</strong>
          {callCases.length > 0 ? <p>On the call: record it below</p> : callFrom ? (
            <>
              <button type="button" className="lf-call-button" disabled={busy || !!reason} title={reason || undefined} onClick={() => void call()}>
                {busy ? 'Opening Zoom…' : `📞 Call · ${due.length} ${due.length === 1 ? 'case' : 'cases'}`}
              </button>
              {reason && <p>{reason}</p>}
            </>
          ) : <p>No case is due for a call now.</p>}
        </div>
      </header>

      {callCases.length > 0 && (
        <section className="lf-record" aria-labelledby="lf-record-title">
          <h3 id="lf-record-title">Record this call · {callCases.length} {callCases.length === 1 ? 'case' : 'cases'}</h3>
          <CallOutcome key={callIds!.join()} callFrom={callCases[0].id} name={person.learner_name} issues={callCases} session={session}
            notify={notify} onSaved={callSaved} saveLabel="Save the call" />
        </section>
      )}

      <div className="lf-grid">
        <aside className="lf-rail">
          <nav aria-label="Why you are calling">
            <h3>Why you’re calling</h3>
            <ul className="lf-reasons">
              {caseIds.map(caseId => {
                const c = listed.find(item => item.id === caseId) || detail?.issues.find(item => item.id === caseId);
                if (!c) return null;
                const full = 'sla_breached' in c ? (c as OverviewCase) : null;
                return (
                  <li key={caseId}>
                    <button type="button" aria-current={selected === caseId ? 'true' : undefined} data-contact-case={caseId} onClick={() => open(caseId)}>
                      <strong>{issueLabel(c)}</strong>
                      <span>{full ? caseWhen(full) : c.issue_name}</span>
                      <small className={full?.sla_breached ? 'danger' : ''}>{full ? dueText(full) : STATUS_NAMES[c.status] || human(c.status)}</small>
                    </button>
                  </li>
                );
              })}
              {!caseIds.length && <li className="ec-muted">All of {person.learner_name}’s cases are closed.</li>}
            </ul>
          </nav>
          <section className="lf-contact" aria-label="How to reach them">
            <h3>Contact</h3>
            <dl>
              <div><dt>Phone</dt><dd>{phone || 'Not recorded'}</dd></div>
              <div><dt>Email</dt><dd>{person.learner_email ? <a href={`mailto:${person.learner_email}`}>{person.learner_email}</a> : 'Not recorded'}</dd></div>
              {!employer && <>
                <div><dt>Employer</dt><dd>{person.organisation || 'Not recorded'}</dd></div>
                <div><dt>Line manager</dt><dd>{person.manager_name || 'Not recorded'}
                  {person.manager_email && <small><a href={`mailto:${person.manager_email}`}>{person.manager_email}</a></small>}
                  {managerPhone && <small>{managerPhone}</small>}</dd></div>
                <div><dt>Coach</dt><dd>{person.coach || 'Not recorded'}</dd></div>
              </>}
              <div><dt>Unanswered calls</dt><dd>{person.attempts}</dd></div>
              {person.claimed_by && <div><dt>Being called by</dt><dd>{person.claimed_by}</dd></div>}
            </dl>
          </section>
          {error && <p role="alert">Could not load everything. {error} <button type="button" onClick={refresh}>Retry</button></p>}
        </aside>

        <div className="lf-main">
          {caseIds.map(caseId => (
            <CaseCard key={caseId} id={caseId} overview={overview} session={session} selected={selected === caseId}
              onSaved={message => { refresh(); onSaved(message); }} notify={notify} onRefresh={() => { refresh(); onRefresh(); }} />
          ))}
          <CaseHistory detail={detail} onOpenCase={open} />
        </div>
      </div>
    </div>
  );
}

/** What changes the conversation before it starts. */
function personFlags(cases: OverviewCase[], name: string): [string, string][] {
  const flags: [string, string][] = [];
  const rang = cases.map(c => c.called_back_at).filter(Boolean).sort().pop();
  if (rang) flags.push([`${name.split(' ')[0]} rang ${when(rang)}: call back first`, 'red']);
  if (cases.some(c => c.meeting?.learner_response === 'declined' && c.meeting.status === 'scheduled')) flags.push(['Declined tomorrow’s meeting in Outlook', 'red']);
  if (cases.some(c => c.promise_missed)) flags.push(['A promise was missed', 'amber']);
  const late = cases.filter(c => c.sla_breached).length;
  if (late) flags.push([`${late} ${late === 1 ? 'call is' : 'calls are'} late`, 'amber']);
  if (cases.some(c => c.employer_check && !c.employer_check.done)) flags.push(['Employer to confirm tomorrow’s review', 'gold']);
  if (cases.some(c => c.missed_call)) flags.push(['Last call went unanswered', '']);
  return flags;
}
