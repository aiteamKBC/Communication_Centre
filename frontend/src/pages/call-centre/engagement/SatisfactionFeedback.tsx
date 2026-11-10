import { useState } from 'react';
import type { FormEvent } from 'react';
import type { HeldFeedback } from '../api';
import { caseAction } from './actions';
import type { Session } from './actions';
import { when } from './model';

export default function SatisfactionFeedback({ caseId, name, employer = false, session, onSaved, command = 'complete_feedback', extra = false, held = null }: {
  caseId: number; name: string; employer?: boolean; session: Session;
  /** Feedback already saved on this review and waiting for Zoom, or dropped because the call was not answered. */
  held?: HeldFeedback | null;
  /** `held`: given straight after the call, it completes the review once Zoom reports the call answered. */
  onSaved: (held?: boolean) => void;
  /** `extra_feedback` on an optional call whose learner's review is already done: kept with the call only. */
  command?: string; extra?: boolean;
}) {
  const who = employer ? 'Employer' : 'Learner';
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Saved here and waiting for Zoom; `editing` shows the form again to replace what was saved.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const waiting = savedAt ? { at: savedAt, by: '' } : held?.state === 'held' ? held : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || session.preview || !session.canAct) return;
    setBusy(true);
    setError('');
    try {
      const result = await caseAction(session, caseId, command, {
        score: Number(score), note, problem, agreed_action: action,
      });
      if (result.held) {
        setSavedAt(new Date().toISOString());
        setEditing(false);
      }
      onSaved(!!result.held);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Feedback could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (waiting && !editing) {
    return <>
      <h2>{who} feedback saved</h2>
      <p role="status">Saved {when(waiting.at)}{waiting.by ? ` by ${waiting.by}` : ''}. It completes this review as soon as Zoom
        confirms the call was answered, usually within a few minutes. You do not need to wait here or save it again.</p>
      <p className="ec-muted">If Zoom reports the call as not answered, the review stays open and this page says so.</p>
      <button type="button" disabled={session.preview || !session.canAct} onClick={() => setEditing(true)}>Change the feedback</button>
    </>;
  }

  return <>
    <h2>Complete {who.toLowerCase()} feedback</h2>
    {held?.state === 'dropped' && !savedAt && <p className="ec-alert" role="alert">
      The feedback saved {when(held.at)} was not used: Zoom reported the call as not answered. Call again, then complete the review.</p>}
    <p>{extra
      ? `${name}: their review is already done for this period, so this feedback is kept with the call and changes no dates.`
      : `${name}: saving completes this review once Zoom confirms the call was answered (you do not need to wait); the next is due in three calendar months.`}</p>
    <form className="ec-form" onSubmit={event => void submit(event)}>
      <fieldset disabled={busy || session.preview || !session.canAct} style={{ display: 'contents' }}>
        <label className="wide">Satisfaction score
          <select required value={score} onChange={event => setScore(event.target.value)}>
            <option value="">Choose a score</option>
            {[['1', 'Very dissatisfied'], ['2', 'Dissatisfied'], ['3', 'Neutral'], ['4', 'Satisfied'], ['5', 'Very satisfied']].map(([value, label]) =>
              <option key={value} value={value}>{value} — {label}</option>)}
          </select>
        </label>
        <label className="wide">{who} feedback
          <textarea required minLength={10} maxLength={3500} rows={3} value={note} onChange={event => setNote(event.target.value)} />
        </label>
        <label className="wide">Issue raised (write None if there is no issue)
          <textarea required maxLength={3500} rows={2} value={problem} onChange={event => setProblem(event.target.value)} />
        </label>
        <label className="wide">Agreed action, owner and date (or No action needed)
          <textarea required maxLength={3500} rows={2} value={action} onChange={event => setAction(event.target.value)} />
        </label>
        {error && <p className="ec-alert wide" role="alert">{error}</p>}
        <button type="submit" className="primary">{busy ? 'Saving…' : 'Complete review'}</button>
      </fieldset>
    </form>
  </>;
}
