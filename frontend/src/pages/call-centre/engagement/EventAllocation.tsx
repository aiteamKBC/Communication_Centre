import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, post } from '../api';
import { eventDay } from './events';
import type { Allocated, AllocationData, AllocationEvent } from './events';
import { balanceUnits, shortDate } from './model';

// Events kept in the Events hub; read and saved through events/allocations/ (events_views.py), all or nothing.
const DAYS = [14, 30, 60, 90, 180];
// Events takes at most this many changes per request.
const SAVE_BATCH = 500;
const NOBODY = 'none';
const ALL = 'all';
const SEVERAL = 'several';

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id, index) => id === b[index]);
const same = (a: Allocated, b: Allocated) => a.all_agents === b.all_agents && (a.all_agents || sameIds(a.agent_ids, b.agent_ids));
const stored = (event: AllocationEvent): Allocated => ({ all_agents: event.all_agents, agent_ids: event.agent_ids });
const isUnallocated = (allocated: Allocated) => !allocated.all_agents && !allocated.agent_ids.length;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function phaseTag(event: AllocationEvent) {
  if (event.phase === 'confirmation') return <span className="ec-tag green">Confirmation calls open</span>;
  if (event.phase === 'feedback') return <span className="ec-tag amber">Feedback calls open</span>;
  return <span className="ec-tag">Calls open {shortDate(event.calls_open_at)}</span>;
}

/** Event allocation: which specialists call each event's bookings. An event allocated to nobody is hidden from every
 * specialist, so its confirmation calls are not made until a director allocates it. */
export default function EventAllocation({ csrf, onWorkspace }: { csrf: string; onWorkspace: (agentId: number) => void }) {
  const [days, setDays] = useState(60);
  const [data, setData] = useState<AllocationData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [picks, setPicks] = useState<Map<string, Allocated>>(new Map());
  const [search, setSearch] = useState('');
  const [show, setShow] = useState('all');
  const [reasons, setReasons] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<AllocationData>(`events/allocations/?days=${days}`));
      setLoadError('');
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : 'Event allocation could not be loaded.');
    }
    setPicks(new Map());
    setReasons([]);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const board = data?.board;
  const events = useMemo(() => board?.events || [], [board]);
  const everyone = useMemo(() => board?.agents || [], [board]);
  const agents = useMemo(() => everyone.filter(agent => agent.active), [everyone]);
  const byId = useMemo(() => new Map(events.map(event => [event.event_id, event])), [events]);
  const planned = useCallback((event: AllocationEvent) => picks.get(event.event_id) || stored(event), [picks]);
  const changes = useMemo(() => events.filter(event => picks.has(event.event_id) && !same(planned(event), stored(event))), [events, picks, planned]);

  const nameOf = useCallback((id: number) => {
    const agent = everyone.find(item => item.id === id);
    return agent ? `${agent.name}${agent.active ? '' : ' (switched off)'}` : 'Former specialist';
  }, [everyone]);
  const describe = useCallback((allocated: Allocated) => (allocated.all_agents ? 'All specialists'
    : allocated.agent_ids.length ? allocated.agent_ids.map(nameOf).join(', ') : 'Nobody (hidden from specialists)'), [nameOf]);

  // Switched-off specialists who still have events: their events are not called until handed over.
  const stranded = useMemo(() => everyone.filter(agent => !agent.active).map(agent => ({
    agent, events: events.filter(event => !planned(event).all_agents && planned(event).agent_ids.includes(agent.id)).length,
  })).filter(row => row.events > 0), [everyone, events, planned]);

  const unallocated = events.filter(event => isUnallocated(planned(event)));
  const openUnallocated = unallocated.filter(event => event.phase === 'confirmation');
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    const agent = show.startsWith('agent:') ? Number(show.slice(6)) : null;
    return events.filter(event => {
      const allocated = planned(event);
      const match = show === 'all' || (show === NOBODY ? isUnallocated(allocated) : show === 'open' ? event.phase !== null
        : show === ALL ? allocated.all_agents : agent !== null && !allocated.all_agents && allocated.agent_ids.includes(agent));
      return match && (!query || [event.event_name, event.location].join(' ').toLowerCase().includes(query));
    });
  }, [events, show, search, planned]);

  const note = (reason: string) => setReasons(current => (current.includes(reason) ? current : [...current, reason]));

  function give(updates: [string, Allocated][]) {
    setPicks(current => {
      const next = new Map(current);
      for (const [eventId, allocated] of updates) {
        const event = byId.get(eventId);
        const value = { all_agents: allocated.all_agents, agent_ids: allocated.all_agents ? [] : [...new Set(allocated.agent_ids)].sort((a, b) => a - b) };
        if (event && same(value, stored(event))) next.delete(eventId);
        else next.set(eventId, value);
      }
      return next;
    });
    setMessage({ text: '', error: false });
  }

  function choose(event: AllocationEvent, value: string) {
    if (value === SEVERAL) return;
    give([[event.event_id, value === ALL ? { all_agents: true, agent_ids: [] }
      : { all_agents: false, agent_ids: value === NOBODY ? [] : [Number(value)] }]]);
    note('Allocated by hand');
  }

  function toggle(event: AllocationEvent, id: number, checked: boolean) {
    const ids = planned(event).all_agents ? [] : planned(event).agent_ids;
    give([[event.event_id, { all_agents: false, agent_ids: checked ? [...ids, id] : ids.filter(item => item !== id) }]]);
    note('Allocated by hand');
  }

  /** Bookings each specialist calls as planned (events for all specialists excluded: everyone shares those). */
  const bookingsOf = useCallback((id: number) => events.reduce((sum, event) => {
    const allocated = planned(event);
    return !allocated.all_agents && allocated.agent_ids.includes(id) ? sum + event.booked : sum;
  }, 0), [events, planned]);

  /** Events with nobody or one specialist go to one specialist each, so the bookings even out; events shared by several
   * specialists or all of them are left as they are. */
  function balance() {
    const units = events.filter(event => !planned(event).all_agents && planned(event).agent_ids.length <= 1)
      .map(event => ({ key: event.event_id, emails: [event.event_id], booked: event.booked }));
    const owners = balanceUnits(units, new Map(units.map(unit => [unit.key, planned(byId.get(unit.key)!).agent_ids[0] ?? null])),
      agents.map(agent => agent.id), unit => Math.max(unit.booked, 1));
    give([...owners].map(([eventId, id]) => [eventId, { all_agents: false, agent_ids: [id] }]));
    setReasons(['Balanced by bookings']);
    setMessage({ text: 'Balanced by bookings, keeping events shared by several specialists as they are. Check the changes, then save.', error: false });
  }

  /** Only the events nobody has: each to the specialist with the fewest bookings so far. */
  function shareUnallocated() {
    const loads = new Map(agents.map(agent => [agent.id, bookingsOf(agent.id)]));
    const updates: [string, Allocated][] = [];
    for (const event of [...unallocated].sort((a, b) => b.booked - a.booked)) {
      const id = [...loads.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];
      loads.set(id, (loads.get(id) || 0) + Math.max(event.booked, 1));
      updates.push([event.event_id, { all_agents: false, agent_ids: [id] }]);
    }
    give(updates);
    note('Unallocated events shared out');
    setMessage({ text: `${plural(updates.length, 'event')} shared out to the specialists with the fewest bookings. Check, then save.`, error: false });
  }

  /** Every event planned for `from` goes to `to` (both keep their other specialists); from "nobody", the unallocated events. */
  function handOver() {
    const target = Number(to);
    const updates: [string, Allocated][] = [];
    for (const event of events) {
      const allocated = planned(event);
      if (from === NOBODY ? isUnallocated(allocated) : !allocated.all_agents && allocated.agent_ids.includes(Number(from))) {
        updates.push([event.event_id, { all_agents: false, agent_ids: [...allocated.agent_ids.filter(id => id !== Number(from)), target] }]);
      }
    }
    const fromName = from === NOBODY ? 'the unallocated events' : nameOf(Number(from));
    if (!updates.length) {
      setMessage({ text: `${from === NOBODY ? 'There are no unallocated events' : `${fromName} has no events`} to hand over.`, error: true });
      return;
    }
    give(updates);
    note(`Handover from ${fromName} to ${nameOf(target)}`);
    setMessage({ text: `${plural(updates.length, 'event')} handed over in the plan. Check, then save.`, error: false });
  }

  async function save() {
    const hidden = changes.filter(event => isUnallocated(planned(event)) && event.phase === 'confirmation');
    if (hidden.length && !window.confirm(`${plural(hidden.length, 'event')} with confirmation calls open now would be allocated to nobody, so no specialist would call ${hidden.length === 1 ? 'its' : 'their'} bookings. Save anyway?`)) return;
    setBusy(true);
    try {
      let changed = 0;
      for (let start = 0; start < changes.length; start += SAVE_BATCH) {
        const result = await post<{ changed: number }>('events/allocations/', csrf, {
          changes: changes.slice(start, start + SAVE_BATCH).map(event => ({ event_id: event.event_id, ...planned(event), expected: stored(event) })),
          reason: reasons.join('; ') || 'Allocated by hand',
        });
        changed += result.changed;
      }
      await load();
      setMessage({ text: `${plural(changed, 'event')} allocated.`, error: false });
    } catch (failure) {
      setMessage({ text: failure instanceof Error ? failure.message : 'The allocation could not be saved.', error: true });
    } finally {
      setBusy(false);
    }
  }

  const heading = <h2>Event allocation</h2>;
  if (loadError) return <section className="ec-card">{heading}<p className="ec-alert" role="alert">{loadError}</p><button type="button" onClick={() => void load()}>Try again</button></section>;
  if (!data) return <section className="ec-card"><p>Loading event allocation…</p></section>;
  if (!data.enabled) return <section className="ec-card">{heading}<p className="ec-muted">The Events hub is not connected. Set EVENTS_API_URL and EVENTS_INTEGRATION_KEY on this server.</p></section>;
  if (!board) return <section className="ec-card">{heading}<p className="ec-alert" role="alert">{data.error || 'The Events hub did not answer.'}</p><button type="button" onClick={() => void load()}>Try again</button></section>;

  const selectValue = (allocated: Allocated) => (allocated.all_agents ? ALL : !allocated.agent_ids.length ? NOBODY
    : allocated.agent_ids.length === 1 ? String(allocated.agent_ids[0]) : SEVERAL);
  const options = (allocated: Allocated) => [
    ...agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>),
    // A switched-off specialist stays listed on the events they still have, so the row says who it is.
    ...allocated.agent_ids.filter(id => !agents.some(agent => agent.id === id)).map(id => <option key={id} value={id} disabled>{nameOf(id)}</option>),
  ];

  return (
    <>
      <section className="ec-card ec-allocation-intro">
        <div className="ec-head">
          <div>
            {heading}
            <p>Choose who calls each event’s bookings: one specialist, several, or all of them. Specialists see an event only while its
              calls are open (confirmation calls from two days before, feedback calls for a week after). <strong>An event allocated to
              nobody is hidden from every specialist</strong>, so its bookings are not called until you allocate it.</p>
          </div>
          <div className="ec-buttons">
            <button type="button" disabled={busy || !agents.length || !events.length} onClick={balance}>Balance by bookings</button>
            <button type="button" disabled={busy || !agents.length || !unallocated.length} onClick={shareUnallocated}>Share out unallocated</button>
            <button type="button" disabled={busy} onClick={() => void load()}>Refresh</button>
          </div>
        </div>
        <div className="ec-grid">
          {agents.map(agent => {
            const mine = events.filter(event => !planned(event).all_agents && planned(event).agent_ids.includes(agent.id));
            return (
              <div key={agent.id} className="ec-stat">
                <span>{agent.name}</span><strong>{mine.length}</strong>
                <span>{plural(mine.length, 'event')} · {plural(bookingsOf(agent.id), 'booking')}{mine.some(event => event.phase) ? ` · ${mine.filter(event => event.phase).length} open now` : ''}</span>
                {agent.agent_id !== null && <button type="button" onClick={() => onWorkspace(agent.agent_id!)}>View calling workspace</button>}
              </div>
            );
          })}
          <div className="ec-stat"><span>All specialists</span><strong>{events.filter(event => planned(event).all_agents).length}</strong>
            <span>events every specialist calls</span></div>
          <div className="ec-stat"><span>Not allocated</span><strong>{unallocated.length}</strong>
            <span>events hidden from specialists{openUnallocated.length ? `, ${openUnallocated.length} with calls open now` : ''}</span>
            <button type="button" disabled={busy || !unallocated.length} onClick={() => { setFrom(NOBODY); setTo(''); }}>Give to a specialist…</button></div>
        </div>
        {!agents.length && <p className="ec-alert" role="alert">The Events hub has no specialists yet. The worker sends the active specialists every cycle; check it is running.</p>}
        {openUnallocated.length > 0 && (
          <p className="ec-alert" role="alert">
            {plural(openUnallocated.length, 'event has', 'events have')} confirmation calls open now and nobody allocated: {openUnallocated.slice(0, 5).map(event => event.event_name).join(', ')}{openUnallocated.length > 5 ? ` and ${openUnallocated.length - 5} more` : ''}.
          </p>
        )}
        {stranded.map(({ agent, events: count }) => (
          <p key={agent.id} className="ec-alert" role="alert">
            {agent.name} is switched off but still has {plural(count, 'event')}. They cannot call them; hand them over.
            {' '}<button type="button" disabled={busy} onClick={() => { setFrom(String(agent.id)); setTo(''); }}>Hand over their events</button>
          </p>
        ))}
        <div className="ec-tools" aria-label="Hand over events">
          <label>Hand over all events of
            <select value={from} onChange={event => setFrom(event.target.value)}>
              <option value="">Choose a specialist…</option>
              <option value={NOBODY}>Nobody: the unallocated events ({unallocated.length})</option>
              {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              {stranded.map(({ agent }) => <option key={agent.id} value={agent.id}>{agent.name} (switched off)</option>)}
            </select>
          </label>
          <label>to
            <select value={to} onChange={event => setTo(event.target.value)}>
              <option value="">Choose…</option>
              {agents.filter(agent => String(agent.id) !== from).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy || !from || !to} onClick={handOver}>Hand over</button>
        </div>
      </section>

      <section className="ec-card">
        <div className="ec-tools">
          <input type="search" aria-label="Search events" placeholder="Event or location" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Show" value={show} onChange={event => setShow(event.target.value)}>
            <option value="all">All events ({events.length})</option>
            <option value={NOBODY}>Not allocated ({unallocated.length})</option>
            <option value="open">Calls open now ({events.filter(event => event.phase).length})</option>
            <option value={ALL}>For all specialists</option>
            {agents.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>With {agent.name}</option>)}
          </select>
          <select aria-label="Events starting in the next" value={days} disabled={busy} onChange={event => setDays(Number(event.target.value))}>
            {DAYS.map(value => <option key={value} value={value}>Next {value} days</option>)}
          </select>
        </div>
        <div className="ec-table-wrap ec-allocation-roster">
          <table>
            <thead><tr><th>Event</th><th>Bookings</th><th>Now with</th><th>Give to</th></tr></thead>
            <tbody>
              {shown.map(event => {
                const allocated = planned(event);
                const value = selectValue(allocated);
                return (
                  <tr key={event.event_id} className={isUnallocated(allocated) && event.phase === 'confirmation' ? 'is-split' : undefined}>
                    <td><strong>{event.event_name}</strong><small>{eventDay(event.start_at)}{event.location ? ` · ${event.location}` : ''}</small>
                      {phaseTag(event)}</td>
                    <td>{event.booked}<small>{event.to_call} still to call</small></td>
                    <td>{describe(stored(event))}</td>
                    <td>
                      <select aria-label={`Give ${event.event_name} to`} disabled={busy} value={value} onChange={change => choose(event, change.target.value)}>
                        <option value={NOBODY}>Nobody (hidden)</option>
                        <option value={ALL}>All specialists</option>
                        {options(allocated)}
                        {value === SEVERAL && <option value={SEVERAL} disabled>{plural(allocated.agent_ids.length, 'specialist')}</option>}
                      </select>
                      {!allocated.all_agents && agents.length > 1 && (
                        <details>
                          <summary>Several specialists</summary>
                          <div className="ec-checks">
                            {agents.map(agent => (
                              <label key={agent.id}>
                                <input type="checkbox" disabled={busy} checked={allocated.agent_ids.includes(agent.id)}
                                  onChange={change => toggle(event, agent.id, change.target.checked)} />
                                {agent.name}
                              </label>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && <tr><td colSpan={4}>{events.length ? 'No events match.' : `No events in the next ${days} days.`}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ec-allocation-toolbar">
          <span className="ec-status" role="status" aria-live="polite" style={message.error ? { color: '#963e48' } : undefined}>{message.text}</span>
          <button type="button" disabled={busy || !changes.length} onClick={() => { setPicks(new Map()); setReasons([]); setMessage({ text: '', error: false }); }}>Undo changes</button>
          <button type="button" className="primary" disabled={busy || !changes.length} onClick={() => void save()}>
            {busy ? 'Saving…' : changes.length ? `Save ${plural(changes.length, 'change')}` : 'No changes'}
          </button>
        </div>
      </section>

      <details className="ec-card ec-allocation-history">
        <summary>Recent event allocation changes ({board.history.length})</summary>
        {board.history.length ? (
          <div className="ec-table-wrap">
            <table>
              <thead><tr><th>Event</th><th>Change</th><th>By</th></tr></thead>
              <tbody>
                {board.history.map(row => (
                  <tr key={row.id}>
                    <td>{row.event_name}<small>{shortDate(row.created_at)}</small></td>
                    <td>{describe(row.before)} → {describe(row.after)}</td>
                    <td>{row.actor || 'Unknown'}<small>{row.reason}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="ec-muted">No event allocation changes yet.</p>}
      </details>
    </>
  );
}

