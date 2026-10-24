import { useEffect, useState } from 'react';
import { post, useCallCentre } from '../api';
import type { Session } from './actions';
import ErrorNotice from './ErrorNotice';
import type { Problem } from './formErrors';
import { when } from './model';

type Item = {
  id: number; caller_number: string; caller_name: string; caller_email: string; caller_role: string; line: string;
  received_at: string; result: string; agent: string;
  status: 'open' | 'done'; done_how: string; done_by: string; done_at: string | null; note: string; waited_minutes: number;
  case_id: number | null; voicemail_id: number | null;
  voicemail: { duration_seconds: number | null; transcript_status: string; transcript: string } | null;
};
type Listing = {
  items: Item[];
  summary: { open: number; received: number; done: number; median_minutes: number | null; within_hour: number; days: number };
};

const RESULTS: Record<string, string> = { no_answer: 'Missed', voicemail: 'Left a voicemail', other: 'Hung up while ringing' };
const DONE: Record<string, string> = { called_back: 'Called back', got_through: 'Rang again and got through', marked: 'Marked done' };
const ROLES: Record<string, string> = { learner: 'Learner', line_manager: 'Line manager' };

const waited = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} days`);

/** Learners and line managers we know who rang and were missed: their specialist calls them back, and the learner's
 * cases go to the top of the list. Each closes by itself when someone calls the number back or the caller gets through;
 * otherwise mark it done with a note. */
export default function MissedCalls({ session, revision, onOpenCase, agentId }: {
  session: Session; revision: string; onOpenCase: (id: number) => void; agentId?: number;
}) {
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const [days, setDays] = useState(7);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const { data, error, loading, refresh } = useCallCentre<Listing>(`inbound/?kind=callback&status=${status}&days=${days}${agentId ? `&agent_id=${agentId}` : ''}`);
  useEffect(() => { refresh(); }, [revision, refresh]);

  async function act(item: Item, action: string) {
    setProblem(null);
    setBusy(item.id);
    try {
      await post('inbound/', session.csrf, { id: item.id, action, note: notes[item.id] || '' });
      setNotes(current => ({ ...current, [item.id]: '' }));
      refresh();
    } catch (failure) {
      setProblem({ action: `${action === 'done' ? 'Marking' : 'Reopening'} ${item.caller_name || item.caller_number}`, error: failure });
    } finally {
      setBusy(null);
    }
  }

  const summary = data?.summary;
  return (
    <section className="ec-card" aria-label="Missed calls">
      <div className="ec-head">
        <div>
          <h2>Missed calls to call back</h2>
          <p className="ec-muted">Learners and line managers who rang and nobody answered. Call them back from their case (the Call button), so the call
            counts: it closes here by itself, and their cases sit at the top of the list until then.</p>
        </div>
        <div className="ec-buttons">
          <label>Show
            <select value={status} onChange={event => setStatus(event.target.value as 'open' | 'done')}>
              <option value="open">Still to call back</option><option value="done">Done</option>
            </select>
          </label>
          <label>Period
            <select value={days} onChange={event => setDays(Number(event.target.value))}>
              <option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
          </label>
          <button type="button" onClick={refresh}>Refresh</button>
        </div>
      </div>
      {error && <p className="ec-alert" role="alert">{error}</p>}
      <ErrorNotice problem={problem} />
      {summary && (
        <div className="ed-log-totals">
          <article><span>Still to call back</span><strong>{summary.open}</strong><small>All time</small></article>
          <article><span>Missed</span><strong>{summary.received}</strong><small>In the period</small></article>
          <article><span>Called back</span><strong>{summary.done}</strong><small>{summary.within_hour} within an hour</small></article>
          <article><span>Typical wait</span><strong>{summary.median_minutes === null ? '—' : waited(summary.median_minutes)}</strong><small>Until called back</small></article>
        </div>
      )}
      {loading && !data && <p role="status">Loading missed calls…</p>}
      {data && (
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Who rang</th><th>When</th><th>Number they rang</th><th>{status === 'open' ? 'Waiting' : 'Done'}</th><th /></tr></thead>
            <tbody>
              {data.items.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.caller_name || item.caller_number}</strong>
                    <small>{item.caller_name ? item.caller_number : 'Not a number we know'}{item.caller_role ? ` · ${ROLES[item.caller_role] || item.caller_role}` : ''}</small>
                    {item.caller_email && <small>{item.caller_email}</small>}</td>
                  <td>{when(item.received_at)}<small>{RESULTS[item.result] || item.result}</small>
                    {item.voicemail && item.voicemail_id && (
                      <div className="ed-voicemail">
                        {item.voicemail.transcript
                          ? <small className="ed-log-note">“{item.voicemail.transcript}”</small>
                          : <small>{item.voicemail.transcript_status === 'pending' ? 'Transcript on its way' : 'No transcript'}</small>}
                        {playing === item.voicemail_id
                          ? <audio controls autoPlay src={`/api/callcentre/voicemails/${item.voicemail_id}/audio/`} aria-label="Voicemail" />
                          : <button type="button" onClick={() => setPlaying(item.voicemail_id)}>Play voicemail{item.voicemail.duration_seconds ? ` (${item.voicemail.duration_seconds} s)` : ''}</button>}
                      </div>
                    )}</td>
                  <td>{item.line || '—'}<small>{item.agent || 'Shared line'}</small></td>
                  <td>{item.status === 'open'
                    ? <span className={`ec-tag ${item.waited_minutes > 240 ? 'red' : item.waited_minutes > 60 ? 'amber' : ''}`}>{waited(item.waited_minutes)}</span>
                    : <>{DONE[item.done_how] || item.done_how}<small>{item.done_by}{item.done_at ? ` · ${when(item.done_at)}` : ''} · after {waited(item.waited_minutes)}</small></>}
                    {item.note && <small className="ed-log-note">“{item.note}”</small>}</td>
                  <td>
                    <div className="ec-buttons">
                      {item.case_id && <button type="button" className="primary" onClick={() => onOpenCase(item.case_id!)}>Open case to call back</button>}
                      {item.status === 'open' ? (
                        <>
                          <input aria-label={`What happened with ${item.caller_name || item.caller_number}`} placeholder="What happened (to mark done)"
                            maxLength={2000} value={notes[item.id] || ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))} />
                          <button type="button" disabled={busy !== null || !(notes[item.id] || '').trim()} onClick={() => void act(item, 'done')}>Mark done</button>
                        </>
                      ) : <button type="button" disabled={busy !== null} onClick={() => void act(item, 'reopen')}>Reopen</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan={5}>{status === 'open' ? 'Nobody is waiting for a call back.' : 'None done in this period.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
