import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, post } from '../api';
import type { Session } from './actions';
import { when } from './model';

type Entry = {
  id: number; learner_email: string; learner_name: string; reason: string; reason_label: string; note: string;
  added_by: string; added_at: string; removed_by: string; removed_at: string | null; removed_note: string;
};
type Data = { set_up: boolean; not_set_up: string; reasons: Record<string, string>; current: Entry[]; history: Entry[] };
type Learner = { email: string; name: string; programme: string; coach: string };

/** Director card: learners taken off every call list while they stay active learners. No calls; emails still allowed. */
export default function DoNotCall({ session, onChanged, notify }: {
  session: Session; onChanged: () => void; notify: (message: string, error?: boolean) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [removeNote, setRemoveNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Data>('do-not-call/')
      .then(result => {
        setData({ set_up: false, not_set_up: '', reasons: {}, current: [], history: [], ...result });
        setError('');
      })
      .catch(failure => setError(failure instanceof Error ? failure.message : 'The do-not-call list could not load.'));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!adding || learners) return;
    api<{ learners: Learner[] }>('learners/')
      .then(result => setLearners(result.learners))
      .catch(failure => setError(failure instanceof Error ? failure.message : 'The learner list could not load.'));
  }, [adding, learners]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (learners || []).filter(l => !query || [l.name, l.email, l.programme, l.coach].join(' ').toLowerCase().includes(query)).slice(0, 200);
  }, [learners, search]);

  async function send(payload: Record<string, unknown>, message: string) {
    setBusy(true);
    setError('');
    try {
      setData(await post<Data>('do-not-call/', session.csrf, payload));
      notify(message);
      onChanged();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const name = learners?.find(l => l.email === email)?.name || email;
    if (await send({ action: 'add', learner_email: email, reason, note }, `${name} is off every call list.`)) {
      setAdding(false);
      setSearch('');
      setEmail('');
      setReason('');
      setNote('');
    }
  }

  async function remove() {
    if (!removing) return;
    if (await send({ action: 'remove', id: removing.id, note: removeNote }, `${removing.learner_name || removing.learner_email} is back on the call lists.`)) {
      setRemoving(null);
      setRemoveNote('');
    }
  }

  return (
    <section className="ec-card ec-settings">
      <h2>Do not call</h2>
      {!data ? <p className="ec-muted">{error || 'Loading…'}</p> : (
        <>
          <p className="ec-muted">
            Learners who stay on their programme but must not be phoned. Their cases are on no call list and nobody can call
            them; they can still be emailed. A learner who has withdrawn needs no entry: set Withdrawn in the LMS and they leave
            every list.
          </p>
          {data.not_set_up && <p className="ec-alert">{data.not_set_up}</p>}
          {data.current.length > 0 ? (
            <ul className="ec-settings-history">
              {data.current.map(entry => (
                <li key={entry.id}>
                  <strong>{entry.learner_name || entry.learner_email}</strong> · {entry.reason_label}
                  <div className="ec-muted">{entry.note}</div>
                  <div className="ec-muted">Added by {entry.added_by} · {when(entry.added_at)}</div>
                  {removing?.id === entry.id ? (
                    <fieldset disabled={busy}>
                      <label>Why can they be called again?
                        <textarea rows={2} maxLength={1000} value={removeNote} onChange={event => setRemoveNote(event.target.value)} />
                      </label>
                      <div className="ec-buttons">
                        <button type="button" className="primary" onClick={() => void remove()}>{busy ? 'Saving…' : 'Put back on the call lists'}</button>
                        <button type="button" onClick={() => setRemoving(null)}>Cancel</button>
                      </div>
                    </fieldset>
                  ) : (
                    <button type="button" className="ed-sheet-link" disabled={busy || !session.isManager}
                      onClick={() => { setRemoving(entry); setRemoveNote(''); }}>Remove from the list</button>
                  )}
                </li>
              ))}
            </ul>
          ) : data.set_up && <p className="ec-muted">Nobody is on the list.</p>}
          {data.set_up && session.isManager && (adding ? (
            <fieldset disabled={busy}>
              <label>Find a learner
                <input type="search" value={search} placeholder="Name, email, programme or coach" onChange={event => setSearch(event.target.value)} />
              </label>
              <label>Learner
                <select value={email} disabled={!learners} onChange={event => setEmail(event.target.value)}>
                  <option value="">{learners ? `Choose a learner (${shown.length}${shown.length === 200 ? '+' : ''} shown)` : 'Loading learners…'}</option>
                  {shown.map(l => <option key={l.email} value={l.email}>{l.name || l.email} · {l.programme || 'Programme not recorded'}</option>)}
                </select>
              </label>
              <label>Reason
                <select value={reason} onChange={event => setReason(event.target.value)}>
                  <option value="">Choose a reason</option>
                  {Object.entries(data.reasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Note for the team
                <textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)}
                  placeholder="What the team needs to know. No medical details." />
              </label>
              <div className="ec-buttons">
                <button type="button" className="primary" disabled={!email || !reason} onClick={() => void add()}>{busy ? 'Saving…' : 'Take off every call list'}</button>
                <button type="button" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </fieldset>
          ) : <button type="button" onClick={() => setAdding(true)}>+ Add a learner</button>)}
          {error && <p className="ec-alert" role="alert">{error}</p>}
          {data.history.length > 0 && (
            <details>
              <summary>Removed from the list</summary>
              <ul className="ec-settings-history">
                {data.history.map(entry => (
                  <li key={entry.id}>
                    <strong>{entry.learner_name || entry.learner_email}</strong> · {entry.reason_label} · added by {entry.added_by} {when(entry.added_at)}
                    <div className="ec-muted">Removed by {entry.removed_by} · {when(entry.removed_at)}: {entry.removed_note}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
