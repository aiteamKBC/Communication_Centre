import { useState } from 'react';
import type { EmployerCheck as Check } from '../api';
import { caseAction } from './actions';
import type { Session } from './actions';
import { when } from './model';

const RESULTS: [Check['result'], string][] = [
  ['confirmed', 'Employer confirmed the review'], ['cannot_attend', 'Employer says the learner cannot attend'],
  ['no_answer', 'No answer: try again'], ['not_reachable', 'Could not reach the employer'], ['no_manager', 'No line manager on record'],
];
const NEEDS_NOTE = new Set(['cannot_attend', 'not_reachable']);

/** On a next-day progress review: confirm it with the employer (line manager) as well as the learner. Ring them from
 * Zoom, then record what they said. The reminder cannot be resolved until this has a final answer. */
export default function EmployerCheck({ c, session, notify, onChanged }: {
  c: { id: number; learner_name: string; employer_check?: Check | null }; session: Session;
  notify: (message: string, error?: boolean) => void; onChanged: () => void;
}) {
  const [result, setResult] = useState<Check['result']>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const check = c.employer_check;
  if (!check) return null;
  const tone = check.done ? (check.result === 'confirmed' ? 'green' : 'red') : 'amber';
  const disabled = session.preview || !session.canAct || busy;

  async function call() {
    setBusy(true);
    try {
      await caseAction(session, c.id, 'employer_call');
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await caseAction(session, c.id, 'employer_check', { result, note: note.trim() });
      notify(`Employer step saved for ${c.learner_name}: ${RESULTS.find(([key]) => key === result)?.[1]}.`);
      setResult('');
      setNote('');
      onChanged();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The employer step could not be saved.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ed-employer" aria-label={`Employer confirmation for ${c.learner_name}`}>
      <header>
        <strong>Employer confirmation</strong>
        <span className={`ec-tag ${tone}`}>{check.result ? check.label : 'Not confirmed yet'}</span>
      </header>
      <p>{check.manager_name || 'Line manager'}
        {check.manager_email ? <> · <a href={`mailto:${check.manager_email}`}>{check.manager_email}</a></> : ' · no email on record'}
        {check.manager_phone ? ` · ${check.manager_phone}` : ' · no phone in Aptem'}</p>
      {check.result && <small>{check.by}{check.at ? ` · ${when(check.at)}` : ''}{check.note ? ` · “${check.note}”` : ''}{check.tries > 1 ? ` · ${check.tries} tries` : ''}</small>}
      {!check.done && (
        <div className="ed-employer-record">
          {check.manager_phone && <button type="button" className="primary" disabled={disabled} onClick={() => void call()}>📞 Call employer</button>}
          <select aria-label={`What the employer said about ${c.learner_name}’s review`} value={result} disabled={disabled}
            onChange={event => setResult(event.target.value as Check['result'])}>
            <option value="">What did the employer say…</option>
            {RESULTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {result && (
            <input aria-label={`Employer note for ${c.learner_name}`} maxLength={2000} value={note} disabled={disabled}
              placeholder={NEEDS_NOTE.has(result) ? 'What happened (needed)' : 'Note (optional)'} onChange={event => setNote(event.target.value)} />
          )}
          <button type="button" disabled={disabled || !result || (NEEDS_NOTE.has(result) && !note.trim())} onClick={() => void save()}>
            Save employer step
          </button>
        </div>
      )}
    </section>
  );
}
