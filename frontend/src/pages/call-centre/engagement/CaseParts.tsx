import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { CaseDetail } from '../api';
import { caseAction, pickCall } from './actions';
import type { Session } from './actions';
import { QUICK_FOLLOW_UPS, closesCase, duration, human, isSatisfaction, londonInput, longDate, outcomeChoices, outcomeHelp, promiseLabel, splitOutcome, when, workdayInput } from './model';

type FormProps = { detail: CaseDetail; session: Session; onSaved: (message: string) => void; onError: (message: string) => void; compact?: boolean };

/** Outcome of the latest Zoom call, resolution and notes for one case. */
export function NextStepForm({ detail, session, onSaved, onError, compact = false }: FormProps) {
  const ticket = detail.ticket;
  const resolved = ticket.status === 'resolved';
  const choices = outcomeChoices(ticket);
  const [picked, setChoice] = useState('');
  // Falls back to the first choice when the form moves to a case of another type.
  const choice = choices.some(([value]) => value === picked) ? picked : choices[0][0];
  const { outcome } = splitOutcome(choice);
  const [callId, setCallId] = useState('');
  const [callback, setCallback] = useState('');
  // Only proof closes a case; a manager can close one by hand, a specialist only those with nothing to prove.
  const canClose = !isSatisfaction(ticket) && (session.isManager || ticket.specialist_closes);
  const [note, setNote] = useState('');
  const [closeReason, setCloseReason] = useState('wrong_number');
  const [busy, setBusy] = useState(false);
  const blocked = session.preview || !session.canAct || (!!ticket.claimed_agent_id && ticket.claimed_agent_id !== session.agentId);
  const calls = detail.calls;

  const callKey = `${ticket.id}:${calls.map(call => call.call_id).join(',')}`;
  useEffect(() => {
    setCallId(String(pickCall(calls, outcome, session)?.call_id ?? ''));
  }, [callKey]); // eslint-disable-line react-hooks/exhaustive-deps -- re-pick only when the case or its calls change
  useEffect(() => {
    setNote('');
    setCallback('');
  }, [ticket.id]);

  async function run(command: string, payload: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await caseAction(session, ticket.id, command, payload);
      setNote('');
      onSaved(message);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'The case could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!callId) {
      onError('Zoom has not reported a call for this case yet. Call the learner, then save once the call appears.');
      return;
    }
    void run('outcome', {
      call_id: Number(callId), ...splitOutcome(choice), note,
      // The chosen follow-up applies to every outcome; an outcome that closes the case ignores it.
      callback_at: callback ? londonInput(callback).toISOString() : null,
    }, 'Next step saved.');
  }

  return (
    <form className={compact ? 'ed-outcome' : 'ec-form'} onSubmit={submit}>
      {compact && <h3>Agree the next step</h3>}
      <fieldset disabled={blocked || busy} style={compact ? undefined : { display: 'contents' }}>
        <label className="wide">Outcome and agreed action
          <textarea value={note} maxLength={5000} onChange={event => setNote(event.target.value)} placeholder="What was agreed, who will act and by when?" />
        </label>
        <div className={compact ? 'ec-form' : 'wide ec-form'}>
          <label>Call outcome
            <select value={choice} onChange={event => setChoice(event.target.value)}>
              {choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Zoom call
            <select value={callId} onChange={event => setCallId(event.target.value)}>
              {!calls.length && <option value="">No verified call yet</option>}
              {calls.map(call => <option key={call.call_id} value={call.call_id}>{when(call.started_at)} · {human(call.result)}{call.outcome ? ` · ${human(call.outcome)}` : ''}</option>)}
            </select>
          </label>
          {!closesCase(choice, ticket) && (
            <div>
              <label>{outcome === 'callback' ? 'Callback date and time (London)' : 'Follow-up date (London, optional)'}
                <input type="datetime-local" required={outcome === 'callback'} value={callback} onChange={event => setCallback(event.target.value)} />
              </label>
              <div className="ec-buttons">
                {QUICK_FOLLOW_UPS.map(([days, label]) => (
                  <button key={days} type="button" title={`${longDate(workdayInput(days))} at 10:00 London`} onClick={() => setCallback(workdayInput(days))}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        {!resolved && <p className="ec-muted wide" role="note">{outcomeHelp(choice, ticket)}</p>}
        <div className="ec-buttons wide">
          {!resolved && <button type="submit" className="primary">Save next step</button>}
          {!resolved && canClose && (
            <button type="button" disabled={!note.trim()} onClick={() => void run('resolve', { note, option: ticket.resolution_option || 'other' }, 'Case resolved.')}>
              {ticket.status === 'ai_suggested_close' ? 'Approve and resolve' : 'Resolve case'}
            </button>
          )}
          {!resolved && isSatisfaction(ticket) && (
            <>
              <select aria-label="Why the review cannot be done" value={closeReason} onChange={event => setCloseReason(event.target.value)}>
                <option value="wrong_number">Wrong number</option>
                <option value="refused">Refused feedback</option>
                <option value="unreachable">Could not be reached</option>
              </select>
              <button type="button" disabled={!note.trim()} onClick={() => void run('close_review', { reason: closeReason, note }, 'Review closed. The next one is due in three months.')}>Close without feedback</button>
            </>
          )}
          {ticket.status === 'ai_suggested_close' && <button type="button" onClick={() => void run('reject_ai', { note }, 'AI suggestion rejected.')}>Reject AI suggestion</button>}
          {resolved && !isSatisfaction(ticket) && <button type="button" className="primary" disabled={!note.trim()} onClick={() => void run('reopen', { note }, 'Case reopened.')}>Reopen case</button>}
          {resolved && session.isManager && !ticket.archived && <button type="button" onClick={() => void run('archive', {}, 'Case archived.')}>Archive</button>}
          <button type="button" disabled={!note.trim()} onClick={() => void run('note', { note }, 'Note saved.')}>Save as note</button>
        </div>
      </fieldset>
      {session.preview
        ? <p className="ec-muted wide">Preview is read-only. Specialists save outcomes for the cases they are working on.</p>
        : !session.canAct ? <p className="ec-muted wide">Ask a manager to set up your agent profile before recording outcomes.</p>
          : ticket.claimed_agent_id && ticket.claimed_agent_id !== session.agentId ? <p className="ec-muted wide">{ticket.claimed_by} is working on this case.</p>
            : <p className="ec-muted wide">{ticket.promised_at && !resolved
              ? `${ticket.promise_missed ? 'Promise missed' : 'Waiting for the learner'}: ${promiseLabel(ticket.resolution_option)} by ${longDate(ticket.promised_at)}. `
              : ''}{isSatisfaction(ticket) ? 'Use Complete feedback after the answered call; ordinary outcomes do not complete the review.' : canClose
              ? 'An outcome is recorded against a call Zoom has verified.'
              : 'The case closes by itself when the learner’s action shows up; if it does not by the deadline, it comes back to the queue.'}</p>}
    </form>
  );
}

export function CallEvidence({ detail, onRecording }: { detail: CaseDetail; onRecording: (callId: number) => void }) {
  if (!detail.calls.length) return <p className="ec-muted">Recordings, transcripts and outcomes will appear with verified Zoom calls.</p>;
  return (
    <>
      {detail.calls.map(call => (
        <details key={call.call_id}>
          <summary>{longDate(call.started_at)} · {human(call.result)} · {call.duration_seconds === null ? 'Duration unknown' : duration(call.duration_seconds)}</summary>
          <p>{call.agent}{call.manual ? ' · dialled manually' : ''}</p>
          <p>{call.outcome ? `Outcome: ${human(call.outcome)}` : 'Outcome not recorded yet.'}</p>
          <button type="button" onClick={() => onRecording(call.call_id)}>Recording & transcript</button>
        </details>
      ))}
    </>
  );
}

const eventText = (data: Record<string, unknown>) => {
  const parts = ['note', 'outcome', 'option', 'reason', 'error', 'problem', 'agreed_action', 'next_due_at'].map(key => data[key]).filter(Boolean).map(value => human(String(value)));
  if (data.score) parts.unshift(`Satisfaction: ${data.score}/5`);
  return parts.join(' · ');
};

export function Timeline({ detail, limit }: { detail: CaseDetail; limit?: number }) {
  const events = limit ? detail.events.slice(0, limit) : detail.events;
  return (
    <>
      <div className="ec-timeline">
        {events.map(item => (
          <article key={item.id}>
            <span className="ec-muted">{longDate(item.created_at)} · {human(item.kind)}</span>
            {eventText(item.data) && <p>{eventText(item.data)}</p>}
            <div className="ec-muted">{item.actor}</div>
          </article>
        ))}
        {!events.length && <p className="ec-muted">The first update will appear here.</p>}
      </div>
      {!!detail.emails.length && (
        <>
          <h3>Email delivery</h3>
          {detail.emails.map(email => (
            <details key={email.id}>
              <summary>{email.subject} · {human(email.status)}</summary>
              <pre>{email.text}</pre>
              {email.error && <p>{email.error}</p>}
            </details>
          ))}
        </>
      )}
    </>
  );
}
