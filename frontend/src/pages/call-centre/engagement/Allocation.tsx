import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, post } from '../api';
import { allocationPlan, balanceGroups, groupedPlan, shortDate } from './model';
import type { AllocationChange, AllocationGroup, GroupChoice } from './model';

type Learner = AllocationChange & {
  name: string; programme: string; organisation: string; coach: string; cohort: string; group: string; modules: string[];
  active_cases: number; next_contact: string | null; last_call: string | null;
};
type Operator = { id: number; display_name: string };
type History = { id: number; learner_email: string; learner_name: string; previous_agent_id: number | null; agent_id: number | null; reason: string; actor: string; created_at: string };
type Data = { learners: Learner[]; operators: Operator[]; history: History[] };
type Filters = { search: string; owner: string; coach: string; programme: string };

const NO_FILTERS: Filters = { search: '', owner: 'all', coach: 'all', programme: 'all' };
const DIMENSIONS: [string, string][] = [
  ['coach', 'Coach'], ['programme', 'Programme'], ['cohort', 'Cohort'], ['group', 'Group'],
  ['organisation', 'Employer'], ['modules', 'Module (missed lectures)'],
];

/** Learners grouped by one field; a learner with several missed-lecture modules is in each module's group. */
function groupLearners(learners: Learner[], dimension: string): AllocationGroup[] {
  const groups = new Map<string, string[]>();
  for (const l of learners) {
    const keys = dimension === 'modules' ? l.modules : [String(l[dimension as 'coach'] || '') || 'Not recorded'];
    for (const key of keys) groups.set(key, [...(groups.get(key) || []), l.email]);
  }
  return [...groups.entries()].map(([key, emails]) => ({ key, emails })).sort((a, b) => a.key.localeCompare(b.key));
}

/** Learner allocation: one engagement specialist per learner. Their current and future cases follow them. */
export default function Allocation({ csrf, onWorkspace }: { csrf: string; onWorkspace: (agentId: number) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('even');
  const [plan, setPlan] = useState<AllocationChange[]>([]);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const statusRef = useRef<HTMLDivElement>(null);
  const [dimension, setDimension] = useState('coach');
  const [choices, setChoices] = useState<Map<string, GroupChoice>>(new Map());

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('allocations/'));
      setLoadError('');
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : 'Allocations could not be loaded.');
    }
    setSelected(new Set());
    setPlan([]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const learners = useMemo(() => data?.learners || [], [data]);
  const operators = useMemo(() => data?.operators || [], [data]);
  const ownerName = (id: number | null) => (id === null ? 'Shared queue' : operators.find(p => p.id === id)?.display_name || 'Former specialist');
  const rows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return learners.filter(l => (filters.owner === 'all' || (filters.owner === 'none' ? l.agent_id === null : l.agent_id === Number(filters.owner)))
      && (filters.coach === 'all' || l.coach === filters.coach) && (filters.programme === 'all' || l.programme === filters.programme)
      && (!query || [l.name, l.email, l.programme, l.organisation, l.coach].join(' ').toLowerCase().includes(query)));
  }, [learners, filters]);
  const groups = useMemo(() => groupLearners(learners, dimension), [learners, dimension]);
  const byEmail = useMemo(() => new Map(learners.map(l => [l.email, l])), [learners]);
  const options = (key: 'coach' | 'programme') => [...new Set(learners.map(l => l[key]).filter(Boolean))].sort();

  function filter(key: keyof Filters, value: string) {
    setFilters(current => ({ ...current, [key]: value }));
    setSelected(new Set());
    setPlan([]);
  }

  function toggle(email: string, on: boolean) {
    setSelected(current => {
      const next = new Set(current);
      if (on) next.add(email);
      else next.delete(email);
      return next;
    });
    setPlan([]);
  }

  function choose(key: string, value: string) {
    setChoices(current => {
      const next = new Map(current);
      if (value === '') next.delete(key);
      else next.set(key, value === 'even' ? 'even' : value === 'none' ? null : Number(value));
      return next;
    });
    setPlan([]);
  }

  function reviewGroups() {
    try {
      const changes = groupedPlan(learners, groups, choices, operators.map(p => p.id));
      setPlan(changes);
      setSaveError('');
      setMessage({ text: changes.length ? 'Review the changes below, then add a reason to confirm.' : 'These groups are already allocated as chosen.', error: false });
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'The allocation could not be prepared.', error: true });
    }
  }

  function review() {
    try {
      const changes = allocationPlan(learners, selected, operators.map(p => p.id), target === 'even' ? 'even' : target === 'none' ? null : Number(target));
      setPlan(changes);
      setSaveError('');
      setMessage({ text: changes.length ? 'Review the changes below, then add a reason to confirm.' : 'These learners are already allocated as requested.', error: false });
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'The allocation could not be prepared.', error: true });
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setSaveError('Write a reason of at least 5 characters.');
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      const result = await post<{ changed: number }>('allocations/', csrf, { changes: plan, reason: reason.trim() });
      setReason('');
      setChoices(new Map());
      await load();
      setMessage({ text: `${result.changed} ${result.changed === 1 ? 'learner' : 'learners'} allocated. See the history below.`, error: false });
      // The review box closes on success, so bring the confirmation into view.
      statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'The allocation could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <section className="ec-card"><h2>Learner allocation</h2><p className="ec-alert" role="alert">{loadError}</p><button type="button" onClick={() => void load()}>Try again</button></section>;
  if (!data) return <section className="ec-card"><p>Loading learner allocation…</p></section>;

  const allShown = rows.length > 0 && rows.every(l => selected.has(l.email));
  return (
    <>
      <section className="ec-card ec-allocation-intro">
        <div className="ec-head">
          <div>
            <h2>One learner, one engagement specialist</h2>
            <p>Allocate each learner to a specialist. Their current and future cases stay together, so one conversation can cover several issues. Other specialists cannot claim an allocated learner.</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void load()}>Refresh allocations</button>
        </div>
        <div className="ec-grid">
          {operators.map(p => {
            const owned = learners.filter(l => l.agent_id === p.id);
            return (
              <div key={p.id} className="ec-stat">
                <span>{p.display_name}</span><strong>{owned.length}</strong>
                <span>learners · {owned.reduce((sum, l) => sum + l.active_cases, 0)} active cases</span>
                <button type="button" onClick={() => onWorkspace(p.id)}>View calling workspace</button>
              </div>
            );
          })}
          <div className="ec-stat"><span>Shared queue</span><strong>{learners.filter(l => l.agent_id === null).length}</strong><span>Not allocated: any specialist can call them. Allocating does not create a call.</span></div>
        </div>
      </section>

      <div ref={statusRef} className="ec-status" role="status" aria-live="polite" style={message.error ? { color: '#963e48' } : undefined}>{message.text}</div>
      <section className="ec-card">
        <div className="ec-head">
          <div>
            <h2>Allocate whole groups</h2>
            <p>Group learners, then give each group to one specialist so a coach’s learners, a class or a cohort stay with the same person. “Balance whole groups” fills every row so each specialist gets a similar number of learners.</p>
          </div>
          <div className="ec-buttons">
            <label>Group learners by
              <select value={dimension} disabled={busy} onChange={event => { setDimension(event.target.value); setChoices(new Map()); setPlan([]); }}>
                {DIMENSIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy || !groups.length || !operators.length} onClick={() => { setChoices(balanceGroups(groups, operators.map(p => p.id))); setPlan([]); }}>Balance whole groups</button>
          </div>
        </div>
        <div className="ec-table-wrap ec-allocation-roster">
          <table>
            <thead><tr><th>{DIMENSIONS.find(([value]) => value === dimension)?.[1]}</th><th>Learners</th><th>Now with</th><th>Allocate to</th></tr></thead>
            <tbody>
              {groups.map(g => {
                const now = new Map<string, number>();
                for (const email of g.emails) {
                  const name = ownerName(byEmail.get(email)?.agent_id ?? null);
                  now.set(name, (now.get(name) || 0) + 1);
                }
                const choice = choices.get(g.key);
                return (
                  <tr key={g.key}>
                    <td><strong>{g.key}</strong></td>
                    <td>{g.emails.length}</td>
                    <td>{[...now.entries()].map(([name, count]) => `${name} ${count}`).join(' · ')}</td>
                    <td>
                      <select aria-label={`Allocate ${g.key}`} disabled={busy} value={choice === undefined ? '' : choice === null ? 'none' : String(choice)} onChange={event => choose(g.key, event.target.value)}>
                        <option value="">Keep as is</option>
                        {operators.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                        <option value="even">Split evenly</option>
                        <option value="none">Shared queue</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
              {!groups.length && <tr><td colSpan={4}>{dimension === 'modules' ? 'No learners have open missed-lecture cases.' : 'No learners to group.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ec-allocation-toolbar">
          <span>{choices.size} {choices.size === 1 ? 'group' : 'groups'} chosen</span>
          <button type="button" disabled={busy || !choices.size} onClick={() => { setChoices(new Map()); setPlan([]); }}>Clear choices</button>
          <button type="button" className="primary" disabled={busy || !choices.size} onClick={reviewGroups}>Review allocation</button>
        </div>
        {dimension === 'modules' && <p className="ec-muted">A learner who missed lectures in several modules follows the first module listed.</p>}
      </section>

      <section className="ec-card">
        <h2>Choose individual learners</h2>
        <p>Select a coach, select all learners shown, then choose a specialist or an even split. Each learner’s current and future cases follow the chosen specialist.</p>
        <div className="ec-tools">
          <input type="search" aria-label="Search learners" placeholder="Learner, programme, employer or coach" value={filters.search} onChange={event => filter('search', event.target.value)} />
          <select aria-label="Current specialist" value={filters.owner} onChange={event => filter('owner', event.target.value)}>
            <option value="all">All allocations</option><option value="none">Shared queue</option>
            {operators.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <select aria-label="Coach" value={filters.coach} onChange={event => filter('coach', event.target.value)}>
            <option value="all">All coaches</option>
            {options('coach').map(value => <option key={value} value={value}>{value} ({learners.filter(l => l.coach === value).length})</option>)}
          </select>
          <select aria-label="Programme" value={filters.programme} onChange={event => filter('programme', event.target.value)}>
            <option value="all">All programmes</option>
            {options('programme').map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="ec-allocation-toolbar">
          <label className="ec-checks">
            <input type="checkbox" checked={allShown} disabled={busy || !rows.length}
              onChange={event => { setSelected(new Set(event.target.checked ? rows.map(l => l.email) : [])); setPlan([]); }} />
            {' '}Select all {rows.length} learners shown
          </label>
          <span>{selected.size} selected</span>
          <button type="button" disabled={busy || !selected.size} onClick={() => { setSelected(new Set()); setPlan([]); }}>Clear selection</button>
        </div>
        <div className="ec-table-wrap ec-allocation-roster">
          <table>
            <thead><tr><th>Select</th><th>Learner</th><th>Current specialist</th><th>Open work</th><th>Latest call</th></tr></thead>
            <tbody>
              {rows.slice(0, 500).map(l => (
                <tr key={l.email}>
                  <td><input type="checkbox" aria-label={`Select ${l.name}`} checked={selected.has(l.email)} disabled={busy} onChange={event => toggle(l.email, event.target.checked)} /></td>
                  <td><strong>{l.name || l.email}</strong><small>{l.programme || 'Programme not recorded'}</small><small>{l.organisation || 'Employer not recorded'}</small><small>Coach: {l.coach || 'Not recorded'}</small></td>
                  <td>{ownerName(l.agent_id)}</td>
                  <td>{l.active_cases} active cases{l.next_contact && <small>Next contact {shortDate(l.next_contact)}</small>}</td>
                  <td>{l.last_call ? shortDate(l.last_call) : 'No recorded call'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5}>No learners match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="ec-muted">{rows.length} of {learners.length} learners shown{rows.length > 500 ? ' (first 500 listed; select all still includes every learner shown)' : ''}. Changing filters clears the selection.</p>
        <div className="ec-allocation-toolbar">
          <label>Allocate selected learners
            <select value={target} disabled={busy} onChange={event => { setTarget(event.target.value); setPlan([]); }}>
              <option value="even">Share evenly between specialists</option>
              {operators.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              <option value="none">Return to the shared queue</option>
            </select>
          </label>
          <button type="button" className="primary" disabled={busy || !selected.size} onClick={review}>Review allocation</button>
        </div>
        <p className="ec-muted">Sharing evenly balances total allocated learners, including existing allocations. The review shows exactly who will move.</p>
      </section>

      {plan.length > 0 && (
        <section className="ec-card ec-allocation-review">
          <h2>Review {plan.length} allocation {plan.length === 1 ? 'change' : 'changes'}</h2>
          <p>All cases move with the learner. Notes and previous calls stay with each case. Learners are not contacted by this action.</p>
          <div className="ec-table-wrap ec-allocation-roster">
            <table>
              <thead><tr><th>Learner</th><th>From</th><th>To</th></tr></thead>
              <tbody>
                {plan.map(change => {
                  const learner = learners.find(l => l.email === change.email);
                  return <tr key={change.email}><td>{learner?.name || change.email}</td><td>{ownerName(learner?.agent_id ?? null)}</td><td>{ownerName(change.agent_id)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <form onSubmit={confirm}>
            <label>Allocation or handover reason
              <textarea required minLength={5} maxLength={1000} value={reason} placeholder="For example: balance this intake’s workload and continue the agreed follow-ups." onChange={event => setReason(event.target.value)} />
            </label>
            {saveError && <p className="ec-modal-error danger" role="alert">{saveError}</p>}
            <div className="ec-buttons">
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm allocation'}</button>
              <button type="button" disabled={busy} onClick={() => setPlan([])}>Cancel changes</button>
            </div>
          </form>
        </section>
      )}

      <section className="ec-card ec-allocation-history">
        <h2>Recent allocation history</h2>
        {data.history.length ? (
          <>
            <div className="ec-table-wrap">
              <table>
                <thead><tr><th>Learner</th><th>Handover</th><th>Reason</th></tr></thead>
                <tbody>
                  {data.history.map(h => (
                    <tr key={h.id}>
                      <td>{h.learner_name}<small>{shortDate(h.created_at)}</small></td>
                      <td>{ownerName(h.previous_agent_id)} → {ownerName(h.agent_id)}</td>
                      <td>{h.reason}<small>{h.actor}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ec-muted">Latest 50 changes.</p>
          </>
        ) : <p className="ec-muted">No allocation changes yet. Each change will be recorded here with its reason.</p>}
      </section>
    </>
  );
}
