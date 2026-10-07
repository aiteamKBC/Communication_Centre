import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, post } from '../api';
import { balanceUnits, shortDate, splitUnits } from './model';
import type { AllocationChange, AllocationUnit } from './model';

type Learner = AllocationChange & {
  name: string; programme: string; organisation: string; coach: string; manager_email: string; manager_name: string; active_cases: number;
};
type Operator = { id: number; display_name: string };
type History = { id: number; learner_email: string; learner_name: string; previous_agent_id: number | null; agent_id: number | null; reason: string; actor: string; created_at: string };
type Data = { learners: Learner[]; operators: Operator[]; history: History[] };
/** One row: an employer (line manager) and their learners, or a learner with no employer recorded. */
type Row = AllocationUnit & { name: string; detail: string; employer: boolean; learners: Learner[] };

// The server takes at most this many changes per request.
const SAVE_BATCH = 1000;

function employerRows(learners: Learner[]): Row[] {
  const rows = new Map<string, Row>();
  for (const l of learners) {
    const key = l.manager_email ? `manager:${l.manager_email}` : `learner:${l.email}`;
    const row = rows.get(key) || {
      key, emails: [], learners: [], employer: !!l.manager_email,
      name: l.manager_email ? l.manager_name || l.manager_email : l.name || l.email, detail: l.organisation,
    };
    row.emails.push(l.email);
    row.learners.push(l);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => Number(b.employer) - Number(a.employer) || a.name.localeCompare(b.name));
}

/** Learner allocation by employer: an employer's learners stay with one specialist, who also makes the employer's calls. */
export default function Allocation({ csrf, onWorkspace }: { csrf: string; onWorkspace: (agentId: number) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [picks, setPicks] = useState<Map<string, number | null>>(new Map());
  const [search, setSearch] = useState('');
  const [show, setShow] = useState('all');
  const [balanced, setBalanced] = useState(false);
  const [message, setMessage] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('allocations/'));
      setLoadError('');
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : 'Allocations could not be loaded.');
    }
    setPicks(new Map());
    setBalanced(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const learners = useMemo(() => data?.learners || [], [data]);
  const operators = useMemo(() => data?.operators || [], [data]);
  const rows = useMemo(() => employerRows(learners), [learners]);
  const byEmail = useMemo(() => new Map(learners.map(l => [l.email, l])), [learners]);
  const ownerOf = useCallback((email: string) => (picks.has(email) ? picks.get(email) ?? null : byEmail.get(email)?.agent_id ?? null), [picks, byEmail]);
  const changes = useMemo(() => learners.flatMap(l => {
    const owner = ownerOf(l.email);
    return owner === l.agent_id ? [] : [{ email: l.email, agent_id: owner, revision: l.revision }];
  }), [learners, ownerOf]);
  const splits = useMemo(() => splitUnits(rows.filter(r => r.employer), ownerOf), [rows, ownerOf]);
  const splitKeys = useMemo(() => new Set(splits.map(r => r.key)), [splits]);
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(r => (show === 'all' || (show === 'split' ? splitKeys.has(r.key) : r.emails.some(email => ownerOf(email) === null)))
      && (!query || [r.name, r.detail, ...r.learners.flatMap(l => [l.name, l.email, l.coach])].join(' ').toLowerCase().includes(query)));
  }, [rows, show, search, splitKeys, ownerOf]);

  const ownerName = (id: number | null) => (id === null ? 'Shared queue' : operators.find(p => p.id === id)?.display_name || 'Former specialist');
  const optionValue = (id: number | null) => (id === null ? 'none' : String(id));

  function give(emails: string[], value: string) {
    const owner = value === 'none' ? null : Number(value);
    setPicks(current => {
      const next = new Map(current);
      for (const email of emails) {
        if (byEmail.get(email)?.agent_id === owner) next.delete(email);
        else next.set(email, owner);
      }
      return next;
    });
    setMessage({ text: '', error: false });
  }

  function balance() {
    const owners = balanceUnits(rows, new Map(learners.map(l => [l.email, l.agent_id])), operators.map(p => p.id));
    setPicks(new Map([...owners].filter(([email, id]) => byEmail.get(email)?.agent_id !== id)));
    setBalanced(true);
    setMessage({ text: 'Balanced by employer. Check the changes, then save.', error: false });
  }

  async function save() {
    if (splits.length && !window.confirm(`${splits.length} ${splits.length === 1 ? 'employer has' : 'employers have'} learners with different specialists, so more than one specialist would call ${splits.length === 1 ? 'that employer' : 'those employers'}. Save anyway?`)) return;
    setBusy(true);
    try {
      let changed = 0;
      for (let start = 0; start < changes.length; start += SAVE_BATCH) {
        const result = await post<{ changed: number }>('allocations/', csrf, {
          changes: changes.slice(start, start + SAVE_BATCH), reason: balanced ? 'Balanced by employer' : 'Allocated by employer',
        });
        changed += result.changed;
      }
      await load();
      setMessage({ text: `${changed} ${changed === 1 ? 'learner' : 'learners'} allocated.`, error: false });
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'The allocation could not be saved.', error: true });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <section className="ec-card"><h2>Learner allocation</h2><p className="ec-alert" role="alert">{loadError}</p><button type="button" onClick={() => void load()}>Try again</button></section>;
  if (!data) return <section className="ec-card"><p>Loading learner allocation…</p></section>;

  return (
    <>
      <section className="ec-card ec-allocation-intro">
        <div className="ec-head">
          <div>
            <h2>Allocate by employer</h2>
            <p>An employer’s learners stay with one specialist, who also makes that employer’s satisfaction calls. Other specialists cannot claim an allocated learner.</p>
          </div>
          <div className="ec-buttons">
            <button type="button" disabled={busy || !operators.length || !rows.length} onClick={balance}>Balance by employer</button>
            <button type="button" disabled={busy} onClick={() => void load()}>Refresh</button>
          </div>
        </div>
        <div className="ec-grid">
          {operators.map(p => {
            const owned = learners.filter(l => ownerOf(l.email) === p.id);
            return (
              <div key={p.id} className="ec-stat">
                <span>{p.display_name}</span><strong>{owned.length}</strong>
                <span>learners · {rows.filter(r => r.employer && r.emails.some(email => ownerOf(email) === p.id)).length} employers</span>
                <button type="button" onClick={() => onWorkspace(p.id)}>View calling workspace</button>
              </div>
            );
          })}
          <div className="ec-stat"><span>Shared queue</span><strong>{learners.filter(l => ownerOf(l.email) === null).length}</strong><span>learners any specialist can call</span></div>
        </div>
      </section>

      <section className="ec-card">
        <div className="ec-tools">
          <input type="search" aria-label="Search employers and learners" placeholder="Employer, organisation, learner or coach" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Show" value={show} onChange={event => setShow(event.target.value)}>
            <option value="all">All employers ({rows.length})</option>
            <option value="split">Split between specialists ({splits.length})</option>
            <option value="shared">With learners in the shared queue</option>
          </select>
        </div>
        {splits.length > 0 && (
          <p className="ec-alert" role="status">
            {splits.length} {splits.length === 1 ? 'employer has' : 'employers have'} learners with different specialists: {splits.slice(0, 5).map(r => r.name).join(', ')}{splits.length > 5 ? ` and ${splits.length - 5} more` : ''}. Give each employer to one specialist, or save anyway.
          </p>
        )}
        <div className="ec-table-wrap ec-allocation-roster">
          <table>
            <thead><tr><th>Employer</th><th>Learners</th><th>Now with</th><th>Give to</th></tr></thead>
            <tbody>
              {shown.map(r => {
                const now = new Map<string, number>();
                r.emails.forEach(email => { const name = ownerName(byEmail.get(email)?.agent_id ?? null); now.set(name, (now.get(name) || 0) + 1); });
                const planned = new Set(r.emails.map(ownerOf));
                const value = planned.size === 1 ? optionValue([...planned][0]) : 'mixed';
                return (
                  <tr key={r.key} className={splitKeys.has(r.key) ? 'is-split' : undefined}>
                    <td><strong>{r.name}</strong><small>{r.employer ? r.detail || 'Organisation not recorded' : 'No employer recorded'}</small></td>
                    <td>
                      {r.learners.length === 1 ? r.learners[0].name || r.learners[0].email : (
                        <details>
                          <summary>{r.learners.length} learners</summary>
                          {r.learners.map(l => (
                            <label key={l.email} className="ec-allocation-learner">
                              {l.name || l.email}
                              <select aria-label={`Give ${l.name || l.email} to`} disabled={busy} value={optionValue(ownerOf(l.email))} onChange={event => give([l.email], event.target.value)}>
                                {operators.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                                <option value="none">Shared queue</option>
                              </select>
                            </label>
                          ))}
                        </details>
                      )}
                    </td>
                    <td>{[...now.entries()].map(([name, count]) => (r.emails.length === 1 ? name : `${name} ${count}`)).join(' · ')}</td>
                    <td>
                      <select aria-label={`Give ${r.name} to`} disabled={busy} value={value} onChange={event => give(r.emails, event.target.value)}>
                        {value === 'mixed' && <option value="mixed" disabled>Split between specialists</option>}
                        {operators.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                        <option value="none">Shared queue</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
              {!shown.length && <tr><td colSpan={4}>No employers match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ec-allocation-toolbar">
          <span className="ec-status" role="status" aria-live="polite" style={message.error ? { color: '#963e48' } : undefined}>{message.text}</span>
          <button type="button" disabled={busy || !changes.length} onClick={() => { setPicks(new Map()); setBalanced(false); setMessage({ text: '', error: false }); }}>Undo changes</button>
          <button type="button" className="primary" disabled={busy || !changes.length} onClick={() => void save()}>
            {busy ? 'Saving…' : changes.length ? `Save ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}` : 'No changes'}
          </button>
        </div>
      </section>

      <details className="ec-card ec-allocation-history">
        <summary>Recent allocation changes ({data.history.length})</summary>
        {data.history.length ? (
          <div className="ec-table-wrap">
            <table>
              <thead><tr><th>Learner</th><th>Handover</th><th>By</th></tr></thead>
              <tbody>
                {data.history.map(h => (
                  <tr key={h.id}>
                    <td>{h.learner_name}<small>{shortDate(h.created_at)}</small></td>
                    <td>{ownerName(h.previous_agent_id)} → {ownerName(h.agent_id)}</td>
                    <td>{h.actor}<small>{h.reason}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="ec-muted">No allocation changes yet.</p>}
      </details>
    </>
  );
}
