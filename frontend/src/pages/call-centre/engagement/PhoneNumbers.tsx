import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, post } from '../api';
import type { Session } from './actions';
import { when } from './model';

type Role = 'learner' | 'employer';
type Person = { role: Role; email: string; name: string; phone: string; detail: string };
type Change = {
  id: number; role: Role; role_label: string; email: string; name: string; phone: string; previous_phone: string; note: string;
  changed_by: string; changed_at: string;
};
type Data = {
  set_up: boolean; not_set_up: string; roles: Record<Role, string>; people: Person[]; current: Change[]; history: Change[];
  saved?: Change & { cases: number };
};

const EMPTY: Data = { set_up: false, not_set_up: '', roles: { learner: 'Learner', employer: 'Line manager' }, people: [], current: [], history: [] };
const complete = (result: Partial<Data>): Data => ({ ...EMPTY, ...result });

/** A stored number (447700900123) as people read it. */
const shown = (phone: string) => (phone ? `+${phone}` : 'No number');

/** Director card: change any learner's or line manager's phone number for the call centre. The LMS and Aptem keep
 * theirs; the call centre uses this one until it is put back. */
export default function PhoneNumbers({ session, onChanged, notify }: {
  session: Session; onChanged: () => void; notify: (message: string, error?: boolean) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState<Role>('learner');
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Data>('phone-numbers/')
      .then(result => { setData(complete(result)); setError(''); })
      .catch(failure => setError(failure instanceof Error ? failure.message : 'Phone numbers could not load.'));
  }, []);
  useEffect(load, [load]);

  const choices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.people || []).filter(p => p.role === role
      && (!query || [p.name, p.email, p.phone, p.detail].join(' ').toLowerCase().includes(query))).slice(0, 200);
  }, [data, role, search]);
  const person = data?.people.find(p => p.role === role && p.email === email) || null;
  const override = data?.current.find(c => c.role === role && c.email === email) || null;

  async function save(payload: { role: Role; email: string; name: string; phone: string; note: string }) {
    setBusy(true);
    setError('');
    try {
      const result = complete(await post<Data>('phone-numbers/', session.csrf, payload));
      setData(result);
      const cases = result.saved?.cases || 0;
      notify(payload.phone
        ? `${payload.name}'s number is now ${shown(result.saved?.phone || '')}${cases ? ` on ${cases} open ${cases === 1 ? 'case' : 'cases'}` : ''}.`
        : `${payload.name} is back on the LMS/Aptem number.`);
      onChanged();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The number could not be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function change() {
    if (!person) return;
    if (await save({ role, email, name: person.name, phone, note })) {
      setPhone('');
      setNote('');
    }
  }

  return (
    <section className="ec-card ec-settings" aria-labelledby="ec-phone-numbers">
      <h2 id="ec-phone-numbers">Phone numbers</h2>
      {!data ? <p className="ec-muted">{error || 'Loading…'}</p> : (
        <>
          <p className="ec-muted">
            Change the number the call centre rings for any learner or line manager. Calls, the employer check, incoming-call
            matching and every open case use it straight away. The LMS and Aptem are not changed: put their number back here
            at any time.
          </p>
          {data.not_set_up && <p className="ec-alert">{data.not_set_up}</p>}
          {data.set_up && session.isManager && (
            <fieldset disabled={busy}>
              <div className="ec-buttons" role="radiogroup" aria-label="Whose number">
                {(Object.entries(data.roles) as [Role, string][]).map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" name="phone-role" value={value} checked={role === value}
                      onChange={() => { setRole(value); setEmail(''); setPhone(''); }} /> {label}
                  </label>
                ))}
              </div>
              <label>Find {role === 'learner' ? 'a learner' : 'a line manager'}
                <input type="search" value={search} placeholder="Name, email, number or employer" onChange={event => setSearch(event.target.value)} />
              </label>
              <label>{data.roles[role]}
                <select value={email} onChange={event => { setEmail(event.target.value); setPhone(''); }}>
                  <option value="">{`Choose (${choices.length}${choices.length === 200 ? '+' : ''} shown)`}</option>
                  {choices.map(p => <option key={p.email} value={p.email}>{p.name} · {shown(p.phone)}{p.detail ? ` · ${p.detail}` : ''}</option>)}
                </select>
              </label>
              {person && (
                <>
                  <p className="ec-muted">
                    Now: <strong>{shown(person.phone)}</strong>
                    {override ? ` · set by ${override.changed_by} ${when(override.changed_at)} (LMS/Aptem had ${shown(override.previous_phone)})` : ' · from the LMS/Aptem'}
                  </p>
                  <label>New number
                    <input type="tel" value={phone} placeholder="e.g. 07700 900123" autoComplete="off" onChange={event => setPhone(event.target.value)} />
                  </label>
                  <label>Note (optional)
                    <textarea rows={2} maxLength={1000} value={note} placeholder="Where the new number came from"
                      onChange={event => setNote(event.target.value)} />
                  </label>
                  <div className="ec-buttons">
                    <button type="button" className="primary" disabled={!phone.trim()} onClick={() => void change()}>
                      {busy ? 'Saving…' : 'Use this number'}</button>
                    {override && (
                      <button type="button" onClick={() => void save({ role, email, name: person.name, phone: '', note })}>
                        Put the LMS/Aptem number back</button>
                    )}
                  </div>
                </>
              )}
            </fieldset>
          )}
          {error && <p className="ec-alert" role="alert">{error}</p>}
          {data.current.length > 0 && (
            <>
              <h3>Numbers changed here</h3>
              <ul className="ec-settings-history">
                {data.current.map(item => (
                  <li key={item.id}>
                    <strong>{item.name || item.email}</strong> · {item.role_label} · {shown(item.phone)}
                    <div className="ec-muted">LMS/Aptem had {shown(item.previous_phone)} · set by {item.changed_by} {when(item.changed_at)}
                      {item.note ? ` · ${item.note}` : ''}</div>
                    {session.isManager && (
                      <button type="button" className="ed-sheet-link" disabled={busy}
                        onClick={() => void save({ role: item.role, email: item.email, name: item.name || item.email, phone: '', note: '' })}>
                        Put the LMS/Aptem number back</button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.history.length > 0 && (
            <details>
              <summary>Every change</summary>
              <ul className="ec-settings-history">
                {data.history.map(item => (
                  <li key={item.id}>
                    <strong>{item.name || item.email}</strong> · {item.role_label} · {item.phone ? `Set to ${shown(item.phone)} (LMS/Aptem: ${shown(item.previous_phone)})` : 'LMS/Aptem number back'}
                    <div className="ec-muted">{item.changed_by} · {when(item.changed_at)}{item.note ? ` · ${item.note}` : ''}</div>
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
