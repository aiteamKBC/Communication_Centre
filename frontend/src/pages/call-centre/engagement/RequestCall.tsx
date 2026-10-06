import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, post } from '../api';
import Dialog from './Dialog';

type Learner = { email: string; name: string; phone: string; programme: string; coach: string; organisation: string };
type Props = { open: boolean; csrf: string; today: string; onClose: () => void; onCreated: (message: string) => void };

/** "Extra call by manager": add a call for any learner in the merged LMS + Aptem directory. */
export default function RequestCall({ open, csrf, today, onClose, onCreated }: Props) {
  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [due, setDue] = useState(today);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open || learners) return;
    api<{ learners: Learner[] }>('learners/')
      .then(data => setLearners(data.learners))
      .catch(reason => setLoadError(reason instanceof Error ? reason.message : 'The learner list could not be loaded.'));
  }, [open, learners]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (learners || []).filter(l => !query || [l.name, l.email, l.programme, l.coach].join(' ').toLowerCase().includes(query)).slice(0, 200);
  }, [learners, search]);
  const chosen = learners?.find(l => l.email === email);

  function choose(value: string) {
    setEmail(value);
    setPhone(learners?.find(l => l.email === value)?.phone || '');
  }

  function close() {
    setError('');
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await post<{ created: boolean }>('requests/', csrf, { request_key: requestKey, learner_email: email, phone, due_date: due, title, purpose });
      onCreated(result.created ? `Call for ${chosen?.name || email} added to Extra Calls by Manager.` : 'This request was already added.');
      setRequestKey(crypto.randomUUID());
      setEmail('');
      setPhone('');
      setTitle('');
      setPurpose('');
      setSearch('');
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The call could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close}>
      <h2>Extra call by manager</h2>
      {error && <p className="ec-modal-error danger" role="alert">{error}</p>}
      {loadError && <p className="ec-modal-error danger" role="alert">{loadError}</p>}
      <form id="ec-task" className="ec-form" onSubmit={submit}>
        <label className="wide">Find a learner
          <input type="search" value={search} placeholder="Name, email, programme or coach" onChange={event => setSearch(event.target.value)} />
        </label>
        <label className="wide">Learner
          <select name="learner_email" required value={email} onChange={event => choose(event.target.value)} disabled={!learners}>
            <option value="">{learners ? `Choose a learner (${shown.length}${shown.length === 200 ? '+' : ''} shown)` : 'Loading learners…'}</option>
            {chosen && !shown.includes(chosen) && <option value={chosen.email}>{chosen.name} · {chosen.programme}</option>}
            {shown.map(l => <option key={l.email} value={l.email}>{l.name || l.email} · {l.programme || 'Programme not recorded'}</option>)}
          </select>
        </label>
        {chosen && <p className="wide ec-muted">{chosen.email} · Coach: {chosen.coach || 'Not recorded'} · {chosen.organisation || 'Employer not recorded'}</p>}
        <label>Phone to call
          <input name="phone" type="tel" placeholder="+44…" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} />
        </label>
        <label>Due date
          <input name="due_date" type="date" required min={today} value={due} onChange={event => setDue(event.target.value)} />
        </label>
        <label className="wide">Call title
          <input name="title" required minLength={3} maxLength={180} placeholder="A supportive check-in" value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label className="wide">Purpose and suggested approach
          <textarea name="purpose" required minLength={10} maxLength={4000} placeholder="Explain the context, what to ask and the intended outcome." value={purpose} onChange={event => setPurpose(event.target.value)} />
        </label>
        <p className="wide ec-muted">The call joins the shared calling register under Extra Calls by Manager. A specialist claims it when they call; it closes when they resolve it.</p>
        <button className="primary" type="submit" disabled={busy || !email}>{busy ? 'Adding…' : 'Add to calling register'}</button>
      </form>
    </Dialog>
  );
}
