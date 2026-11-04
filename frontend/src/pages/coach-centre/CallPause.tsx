import { useState } from 'react';
import { londonDay, post } from '../call-centre/api';
import ErrorNotice from '../call-centre/engagement/ErrorNotice';
import type { Problem } from '../call-centre/engagement/formErrors';
import { lectureDay, when } from '../call-centre/engagement/model';
import type { CoachLearner, CoachOverview } from './types';

type Period = '' | 'date' | 'lifted';

/** The latest last day the server accepts: a year (366 days) from today. */
function latestDay() {
  const day = new Date(`${londonDay()}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 366);
  return day.toISOString().slice(0, 10);
}

/** Whether the Engagement Centre may phone the learner: the coach takes them off every call list, with a reason and a
 * note, through a last day or until lifted, and lifts what a coach added. */
export default function CallPause({ learner, setUp, notSetUp, reasons, onSaved }: {
  learner: CoachLearner; setUp: boolean; notSetUp: string; reasons: Record<string, string>;
  onSaved: (data: CoachOverview, message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [period, setPeriod] = useState<Period>('');
  const [until, setUntil] = useState('');
  const [lifting, setLifting] = useState(false);
  const [liftNote, setLiftNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const entry = learner.do_not_call;
  const who = learner.name || learner.email;
  const ready = !!reason && note.trim().length >= 5 && (period === 'lifted' || (period === 'date' && !!until));

  async function send(payload: Record<string, unknown>, action: string, message: string) {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await post<CoachOverview>('coach/do-not-call/', '', payload), message);
      return true;
    } catch (error) {
      setProblem({ action, error });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const done = await send({ action: 'add', learner_email: learner.email, reason, note, until: period === 'date' ? until : null },
      'Stopping the calls', period === 'date' ? `${who} will not be called until the end of ${lectureDay(until)}.` : `${who} will not be called until you lift it.`);
    if (done) {
      setAdding(false);
      setReason('');
      setNote('');
      setPeriod('');
      setUntil('');
    }
  }

  async function lift() {
    if (!entry) return;
    if (await send({ action: 'remove', id: entry.id, note: liftNote }, 'Allowing calls again', `${who} can be called again.`)) {
      setLifting(false);
      setLiftNote('');
    }
  }

  return (
    <section className="ec-card cc-section" aria-labelledby="cc-calls-title">
      <h3 id="cc-calls-title">Calls from the Engagement Centre</h3>
      {!setUp && <p className="ec-alert">{notSetUp}</p>}
      {entry ? (
        <div className="cc-paused">
          <p><span className="ec-tag red">Not being called</span>{' '}
            <strong>{entry.until ? `until the end of ${lectureDay(entry.until)}` : 'until lifted'}</strong>
          </p>
          <dl className="ec-dl">
            <div><dt>Reason</dt><dd>{entry.reason_label}</dd></div>
            <div><dt>Added</dt><dd>{entry.added_by}{entry.added_role === 'director' ? ' (Engagement Centre director)' : ''} · {when(entry.added_at)}</dd></div>
            <div className="wide"><dt>Note</dt><dd>{entry.note}</dd></div>
          </dl>
          <p className="ec-muted">Nobody phones {who} and their cases are on no call list. They can still be emailed.</p>
          {entry.added_role !== 'coach' ? (
            <p className="ec-muted">The Engagement Centre director added this. Ask them if {who} can be called again.</p>
          ) : lifting ? (
            <fieldset disabled={busy} className="cc-form">
              <label>Why can they be called again?
                <textarea rows={2} maxLength={1000} value={liftNote} onChange={event => setLiftNote(event.target.value)} />
              </label>
              <ErrorNotice problem={problem} />
              <div className="ec-buttons">
                <button type="button" className="primary" disabled={liftNote.trim().length < 5} onClick={() => void lift()}>
                  {busy ? 'Saving…' : 'Allow calls again'}
                </button>
                <button type="button" onClick={() => setLifting(false)}>Cancel</button>
              </div>
            </fieldset>
          ) : (
            <button type="button" onClick={() => { setProblem(null); setLifting(true); }}>Lift: allow calls again</button>
          )}
        </div>
      ) : adding ? (
        <fieldset disabled={busy} className="cc-form">
          <p className="ec-muted">
            While this is on, nobody phones {who} about anything and their cases are on no call list. They can still be emailed.
          </p>
          <label>Reason
            <select value={reason} onChange={event => setReason(event.target.value)}>
              <option value="">Choose a reason</option>
              {Object.entries(reasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Note for the Engagement Centre
            <textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)}
              placeholder="What the team needs to know. No medical details." />
          </label>
          <fieldset className="cc-period">
            <legend>For how long?</legend>
            <label className="cc-check">
              <input type="radio" name="cc-period" checked={period === 'date'} onChange={() => setPeriod('date')} />
              Until a date
            </label>
            {period === 'date' && (
              <label className="cc-until">Last day without calls
                <input type="date" value={until} min={londonDay()} max={latestDay()} onChange={event => setUntil(event.target.value)} />
                <small className="ec-muted">Calls start again the day after.</small>
              </label>
            )}
            <label className="cc-check">
              <input type="radio" name="cc-period" checked={period === 'lifted'} onChange={() => setPeriod('lifted')} />
              Until I lift it (I don’t know for how long)
            </label>
          </fieldset>
          <ErrorNotice problem={problem} />
          <div className="ec-buttons">
            <button type="button" className="primary" disabled={!ready} onClick={() => void add()}>{busy ? 'Saving…' : 'Stop the calls'}</button>
            <button type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </fieldset>
      ) : (
        <>
          <p><span className="ec-tag green">Can be called</span></p>
          <button type="button" disabled={!setUp} onClick={() => { setProblem(null); setAdding(true); }}>Don’t call this learner…</button>
        </>
      )}
    </section>
  );
}
