import { useState } from 'react';
import type { FormEvent } from 'react';
import { caseAction } from './actions';
import type { Session } from './actions';

export default function SatisfactionFeedback({ caseId, name, session, onSaved }: {
  caseId: number; name: string; session: Session; onSaved: () => void;
}) {
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || session.preview || !session.canAct) return;
    setBusy(true);
    setError('');
    try {
      await caseAction(session, caseId, 'complete_feedback', {
        score: Number(score), note, problem, agreed_action: action,
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Feedback could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h2>Complete learner feedback</h2>
    <p>{name}: an answered, synced Zoom call is required. Saving completes this review; the next is due in three calendar months.</p>
    <form className="ec-form" onSubmit={event => void submit(event)}>
      <fieldset disabled={busy || session.preview || !session.canAct} style={{ display: 'contents' }}>
        <label className="wide">Satisfaction score
          <select required value={score} onChange={event => setScore(event.target.value)}>
            <option value="">Choose a score</option>
            {[['1', 'Very dissatisfied'], ['2', 'Dissatisfied'], ['3', 'Neutral'], ['4', 'Satisfied'], ['5', 'Very satisfied']].map(([value, label]) =>
              <option key={value} value={value}>{value} — {label}</option>)}
          </select>
        </label>
        <label className="wide">Learner feedback
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
