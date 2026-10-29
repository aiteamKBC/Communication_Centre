import { useCallback, useEffect, useState } from 'react';
import { api, post } from '../api';
import type { Session } from './actions';
import { lectureDay, when } from './model';

type Edit = {
  id: number; ticket_id: number; learner_email: string; learner_name: string; record_ref: string; session_date: string | null;
  module: string; lecture: string; action: string; action_label: string; reason_label: string; note: string;
  before: Record<string, unknown>; after: Record<string, unknown>; state: string; error: string; actor: string; created_at: string;
  ai_state: string; ai_label: string; ai_evidence: string; ai_checked_at: string | null;
  undone_by: string; undone_at: string | null; undone_note: string;
};
type Listing = { set_up: boolean; not_set_up: string; ai_states: Record<string, string>; summary: Record<string, number>; edits: Edit[] };

const AI_TONE: Record<string, string> = { confirmed: 'green', not_confirmed: 'red', unclear: 'amber', no_call: 'amber', no_recording: 'amber' };
// The checks a director should look at first.
const TO_REVIEW = ['not_confirmed', 'unclear', 'no_call', 'no_recording'];

/** Director page: every attendance correction made on missed-lecture calls (they change the LMS register), who made
 * it and why, and whether the AI heard the learner confirm it on the call. A director can undo one. */
export default function AttendanceEdits({ session, notify, onOpenCase }: {
  session: Session; notify: (message: string, error?: boolean) => void; onOpenCase: (id: number) => void;
}) {
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [aiState, setAiState] = useState('');
  const [undoing, setUndoing] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Listing>(`attendance-edits/?days=${days}${aiState ? `&ai_state=${aiState}` : ''}`)
      .then(result => { setData(result); setError(''); })
      .catch(failure => setError(failure instanceof Error ? failure.message : 'The attendance corrections could not load.'));
  }, [days, aiState]);
  useEffect(load, [load]);

  async function undo(edit: Edit) {
    setBusy(true);
    setError('');
    try {
      setData(await post<Listing>('attendance-edits/', session.csrf, { action: 'undo', id: edit.id, note, days, ai_state: aiState }));
      notify(`Undone: ${edit.learner_name || edit.learner_email}’s ${lectureDay(edit.session_date)} lecture is back as it was in the LMS.`);
      setUndoing(null);
      setNote('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The correction could not be undone.');
    } finally {
      setBusy(false);
    }
  }

  const review = data ? TO_REVIEW.reduce((total, state) => total + (data.summary[state] || 0), 0) : 0;
  return (
    <section className="ec-card" aria-label="Attendance edits">
      <div className="ec-head">
        <div>
          <h2>Attendance edits</h2>
          <p className="ec-muted">Lectures marked attended or absent, or deleted, on missed-lecture calls. Each one changed the
            learner’s register in the LMS. After the call the AI reads the transcript and says whether the learner confirmed it.</p>
        </div>
        <div className="ec-buttons">
          <label>AI check
            <select value={aiState} onChange={event => setAiState(event.target.value)}>
              <option value="">All</option>
              {Object.entries(data?.ai_states || {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Period
            <select value={days} onChange={event => setDays(Number(event.target.value))}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
          </label>
          <button type="button" onClick={load}>Refresh</button>
        </div>
      </div>
      {data?.not_set_up && <p className="ec-alert">{data.not_set_up}</p>}
      {error && <p className="ec-alert" role="alert">{error}</p>}
      {data?.set_up && (
        <div className="ed-log-totals">
          <article><span>Corrections</span><strong>{Object.values(data.summary).reduce((a, b) => a + b, 0)}</strong><small>In the period</small></article>
          <article><span>Confirmed on the call</span><strong>{data.summary.confirmed || 0}</strong><small>By the AI</small></article>
          <article><span>To review</span><strong>{review}</strong><small>Not confirmed, unclear or no call</small></article>
          <article><span>Waiting</span><strong>{data.summary.pending || 0}</strong><small>For the transcript</small></article>
        </div>
      )}
      {!data && !error && <p role="status">Loading attendance corrections…</p>}
      {data?.set_up && (
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>When</th><th>Learner</th><th>Lecture</th><th>Change and reason</th><th>AI check</th><th /></tr></thead>
            <tbody>
              {data.edits.map(edit => (
                <tr key={edit.id}>
                  <td>{when(edit.created_at)}<small>{edit.actor}</small></td>
                  <td><strong>{edit.learner_name || edit.learner_email}</strong><small>{edit.learner_email}</small></td>
                  <td>{lectureDay(edit.session_date)}<small>{edit.lecture} · {edit.module || 'Module not recorded'}</small>
                    <small>{edit.record_ref.startsWith('live:') ? 'Live register' : 'KBC register'}</small></td>
                  <td><strong>{edit.action_label}</strong><small>{edit.reason_label}</small>
                    {edit.note && <small className="ed-log-note">“{edit.note}”</small>}</td>
                  <td><span className={`ec-tag ${AI_TONE[edit.ai_state] || ''}`}>{edit.ai_label}</span>
                    {edit.ai_evidence && <small className="ed-log-note">“{edit.ai_evidence}”</small>}</td>
                  <td>
                    {edit.state === 'failed' ? <small className="danger">Not saved in the LMS: {edit.error}</small>
                      : edit.state === 'undone' ? <small>Undone by {edit.undone_by} · {when(edit.undone_at)}{edit.undone_note ? `: ${edit.undone_note}` : ''}</small>
                        : undoing === edit.id ? (
                          <fieldset disabled={busy}>
                            <label>Why undo it?
                              <textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
                            </label>
                            <div className="ec-buttons">
                              <button type="button" className="primary" onClick={() => void undo(edit)}>{busy ? 'Undoing…' : 'Undo in the LMS'}</button>
                              <button type="button" onClick={() => setUndoing(null)}>Cancel</button>
                            </div>
                          </fieldset>
                        ) : (
                          <div className="ec-buttons">
                            <button type="button" onClick={() => onOpenCase(edit.ticket_id)}>Open case</button>
                            <button type="button" disabled={!session.isManager} onClick={() => { setUndoing(edit.id); setNote(''); }}>Undo</button>
                          </div>
                        )}
                  </td>
                </tr>
              ))}
              {!data.edits.length && <tr><td colSpan={6}>No attendance corrections in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
