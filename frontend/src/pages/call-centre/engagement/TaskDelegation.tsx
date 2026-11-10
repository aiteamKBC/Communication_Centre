import { useMemo, useState } from 'react';
import { post, useCallCentre } from '../api';
import type { DelegatedTask, Overview, OverviewCase } from '../api';
import Dialog from './Dialog';
import { activeCase, categoryFor, deskLayout, deskTopics, listLabel, memberKey, taskLabel, when } from './model';

type Row = { id: number; display_name: string };
type AbsenceRow = { id: number; agent_id: number; agent_name: string; line_cover_id: number | null; line_cover_name: string; started_at: string; started_by: string };
type HistoryRow = { id: number; task_id: number | null; absence_id: number | null; action: string; data: Record<string, unknown>; actor: string; created_at: string };
type Page = { set_up: boolean; not_set_up: string; day: string; tasks: DelegatedTask[]; absences: AbsenceRow[]; agents: Row[]; history: HistoryRow[] };
type Props = { overview: Overview; csrf: string; onChanged: () => void; notify: (message: string, error?: boolean) => void };

/** Whose list: a specialist's desk, the shared queue or the employer calls. */
type Desk = { key: string; source: DelegatedTask['source']; agentId: number | null; label: string };
/** One part of a list: who receives it, how many of its learners (when split), and where it goes on their Today page. */
type Part = { to: number | null; count: number; after: string };
/** A person on a list, with their cases on it. */
type Person = { key: string; name: string; cases: OverviewCase[]; coveredBy: string };

const LISTS = ['nextday', 'missed', 'due', 'learner_satisfaction', 'employer_satisfaction', 'manager', 'tech', 'followups'];
const ACTIONS: Record<string, string> = { delegated: 'Delegated', recalled: 'Recalled', absent: 'Marked absent', back: 'Marked back in' };

function onDesk(c: OverviewCase, desk: Desk, team: number[]) {
  if (c.optional || !activeCase(c)) return false;
  if (desk.source === 'agent') return c.allocated_agent_id === desk.agentId;
  if (desk.source === 'employer') return team.length > 0 && c.source_type === 'employer_feedback';
  return !c.allocated_agent_id && !(team.length && c.source_type === 'employer_feedback');
}

/** The people on one list of a desk, in the lists' priority order (the server's). */
function people(overview: Overview, desk: Desk, list: string): Person[] {
  const team = overview.employer_specialists || [];
  const found = new Map<string, Person>();
  for (const c of overview.cases) {
    const on = list === 'followups'
      ? desk.source === 'agent' && activeCase(c) && !c.optional && c.followup_agent_id === desk.agentId
      : onDesk(c, desk, team) && categoryFor(c, overview.today, overview.next_workday) === list;
    if (!on) continue;
    const key = memberKey(c);
    const person = found.get(key) || { key, name: c.learner_name, cases: [], coveredBy: '' };
    person.cases.push(c);
    if (c.cover?.direct) person.coveredBy = c.cover.to_name;
    found.set(key, person);
  }
  return [...found.values()];
}

/** Split `pool` into the parts, in order: each part takes its count, the last part the rest. */
function split(pool: string[], parts: Part[]) {
  let at = 0;
  return parts.map((part, index) => {
    const take = index === parts.length - 1 ? pool.length - at : Math.max(0, Math.min(part.count, pool.length - at));
    const chosen = pool.slice(at, at + take);
    at += take;
    return chosen;
  });
}

/** What the server is sent for one list. A whole list given to one person takes it as it is, new learners and all. */
function payload(pool: string[], parts: Part[], newTo: number, whole: boolean) {
  if (whole && parts.length === 1) return [{ to_agent_id: parts[0].to, learners: [], catch_new: true, after_topic: parts[0].after }];
  const shares = split(pool, parts);
  return parts.map((part, index) => ({ to_agent_id: part.to, learners: shares[index], catch_new: index === newTo, after_topic: part.after }));
}

const evenly = (parts: Part[], total: number) => parts.map((part, index) => ({
  ...part, count: Math.floor(total / parts.length) + (index < total % parts.length ? 1 : 0),
}));

/** The parts of one list: receivers, how the learners are shared between them, where each goes in their Today order,
 * and who takes the list's new learners. */
function Parts({ pool, parts, setParts, newTo, setNewTo, whole, receivers, overview, list, from }: {
  pool: string[]; parts: Part[]; setParts: (parts: Part[]) => void; newTo: number; setNewTo: (index: number) => void; whole: boolean;
  receivers: Row[]; overview: Overview; list: string; from: string;
}) {
  const shares = split(pool, parts);
  const places = (agentId: number | null) => {
    if (!agentId) return [];
    const topics = deskTopics(deskLayout(overview, agentId).lists, overview.tasks, agentId);
    return topics.map(key => [key, `After their ${listLabel(key, overview.tasks)}`]);
  };
  const change = (index: number, value: Partial<Part>) => setParts(parts.map((part, at) => (at === index ? { ...part, ...value } : part)));
  return (
    <div className="td-parts">
      {parts.map((part, index) => (
        <fieldset key={index} className="td-part">
          <legend>{parts.length > 1 ? `Part ${index + 1}` : 'Give it to'}</legend>
          <label>Specialist
            <select value={part.to ?? ''} onChange={event => {
              const to = Number(event.target.value) || null;
              const options = places(to);
              change(index, { to, after: options.some(([key]) => key === list) ? list : '' });
            }}>
              <option value="">Choose…</option>
              {receivers.map(agent => <option key={agent.id} value={agent.id}>{agent.display_name}</option>)}
            </select>
          </label>
          {parts.length > 1 && (
            <label>Learners
              {index === parts.length - 1
                ? <input type="text" readOnly value={`The rest (${shares[index].length})`} aria-label={`Learners for part ${index + 1}`} />
                : <input type="number" min={0} max={pool.length} value={part.count} aria-label={`Learners for part ${index + 1}`}
                  onChange={event => change(index, { count: Math.max(0, Number(event.target.value) || 0) })} />}
            </label>
          )}
          <label>On their Today page
            <select value={part.after} disabled={!part.to} onChange={event => change(index, { after: event.target.value })}>
              <option value="">First, before everything</option>
              {places(part.to).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          {parts.length > 1 && <button type="button" className="ed-sheet-link" onClick={() => {
            setParts(parts.filter((_, at) => at !== index));
            if (newTo >= index) setNewTo(newTo === index ? (whole ? 0 : -1) : newTo - 1);
          }}>Remove part</button>}
        </fieldset>
      ))}
      <div className="ec-buttons">
        <button type="button" onClick={() => setParts(evenly([...parts, { to: null, count: 0, after: '' }], pool.length))}>Add another specialist</button>
        {parts.length > 1 && <button type="button" onClick={() => setParts(evenly(parts, pool.length))}>Split evenly</button>}
      </div>
      {(parts.length > 1 || !whole) && (
        <label className="td-new">New learners on this list go to
          <select value={newTo} onChange={event => setNewTo(Number(event.target.value))}>
            {!whole && <option value={-1}>Stay with {from}</option>}
            {parts.map((part, index) => <option key={index} value={index}>
              {receivers.find(agent => agent.id === part.to)?.display_name || `Part ${index + 1}`}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** The director hands a list to other specialists until they recall it, and marks specialists absent. */
export default function TaskDelegation({ overview, csrf, onChanged, notify }: Props) {
  const [day, setDay] = useState(overview.today);
  const { data, error, refresh } = useCallCentre<Page>(`delegation/?day=${day}`);
  const team = useMemo(() => overview.employer_specialists || [], [overview.employer_specialists]);
  const agents = useMemo(() => data?.agents || overview.agents.map(agent => ({ id: agent.id, display_name: agent.display_name })),
    [data, overview.agents]);
  const absent = new Set((data?.absences || []).map(item => item.agent_id));
  const desks: Desk[] = [
    ...agents.map(agent => ({ key: `agent:${agent.id}`, source: 'agent' as const, agentId: agent.id,
      label: `${agent.display_name}${absent.has(agent.id) ? ' (absent)' : ''}` })),
    { key: 'shared', source: 'shared', agentId: null, label: 'Shared queue' },
    ...(team.length ? [{ key: 'employer', source: 'employer' as const, agentId: null, label: 'Employer calls' }] : []),
  ];
  const [deskKey, setDeskKey] = useState('');
  const desk = desks.find(item => item.key === deskKey) || null;
  const [list, setList] = useState('');
  const [whole, setWhole] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [first, setFirst] = useState(10);
  const [parts, setParts] = useState<Part[]>([{ to: null, count: 0, after: '' }]);
  const [newTo, setNewTo] = useState(0);
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);

  const lists = !desk ? [] : LISTS.filter(key => (desk.source === 'employer' ? key === 'employer_satisfaction'
    : key !== 'employer_satisfaction' || !team.length) && !(desk.source !== 'agent' && key === 'followups'));
  const onList = desk && list ? people(overview, desk, list) : [];
  const free = onList.filter(person => !person.coveredBy);
  const pool = whole ? free.map(person => person.key) : free.filter(person => picked.has(person.key)).map(person => person.key);
  const receivers = agents.filter(agent => agent.id !== desk?.agentId);

  function chooseDesk(key: string) {
    setDeskKey(key);
    setList('');
  }
  function chooseList(key: string) {
    setList(key);
    setWhole(true);
    setPicked(new Set());
    setParts([{ to: null, count: 0, after: '' }]);
    setNewTo(0);
  }
  function chooseMode(isWhole: boolean) {
    setWhole(isWhole);
    setNewTo(isWhole ? 0 : -1);
  }

  async function send(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await post('delegation/', csrf, body);
      notify(message);
      refresh();
      onChanged();
      return true;
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'That did not save.', true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function delegate() {
    if (!desk || !list) return;
    if (parts.some(part => !part.to)) { notify('Choose who receives each part.', true); return; }
    if (!whole && !pool.length) { notify('Choose the learners to hand over.', true); return; }
    const sent = await send({ action: 'delegate', source: desk.source, from_agent_id: desk.agentId, category: list,
      parts: payload(pool, parts, newTo, whole) }, `${listLabel(list)} delegated.`);
    if (sent) chooseList(list);
  }

  const active = (data?.tasks || []).filter(task => !task.recalled_at);
  const recalledToday = (data?.tasks || []).filter(task => task.recalled_at);
  const agentName = (id: unknown) => agents.find(agent => agent.id === id)?.display_name || (id ? `#${id}` : 'nobody');
  const place = (task: DelegatedTask) => (task.after_topic ? `after their ${listLabel(task.after_topic, overview.tasks)}` : 'first');

  return (
    <div className="dd td">
      {data && !data.set_up && <p className="ec-alert" role="alert">{data.not_set_up}</p>}
      {error && <p className="ec-alert" role="alert">{error}</p>}

      <section className="dd-section" aria-labelledby="td-plan">
        <header className="dd-section-head">
          <div>
            <p className="dd-eyebrow">Until you recall it</p>
            <h2 id="td-plan">Hand over a list</h2>
            <p className="dd-muted">Choose whose list, then the whole list or some of its learners, and who calls them. Their calls count for them; recalling gives everything back as it stands.</p>
          </div>
          <div className="ec-buttons"><button type="button" className="primary" onClick={() => setPlanning(true)}>Mark someone absent…</button></div>
        </header>
        <div className="td-step">
          <label>Whose list
            <select value={deskKey} onChange={event => chooseDesk(event.target.value)}>
              <option value="">Choose…</option>
              {desks.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        </div>
        {desk && (
          <div className="td-lists" role="radiogroup" aria-label="Which list">
            {lists.map(key => {
              const here = people(overview, desk, key);
              const covered = here.filter(person => person.coveredBy).length;
              return (
                <button key={key} type="button" role="radio" aria-checked={list === key} className="td-list" onClick={() => chooseList(key)}>
                  <b>{here.length}</b><span>{listLabel(key)}</span>{covered > 0 && <small>{covered} already covered</small>}
                </button>
              );
            })}
          </div>
        )}
        {desk && list && (
          <div className="td-builder">
            <div className="td-mode" role="radiogroup" aria-label="Which learners">
              <label><input type="radio" checked={whole} onChange={() => chooseMode(true)} /> The whole list ({free.length}), and its new learners</label>
              <label><input type="radio" checked={!whole} onChange={() => chooseMode(false)} /> Chosen learners</label>
            </div>
            {!whole && (
              <div className="td-pick">
                <div className="ec-buttons">
                  <label>First<input type="number" min={1} max={free.length} value={first} onChange={event => setFirst(Math.max(1, Number(event.target.value) || 1))} /></label>
                  <button type="button" onClick={() => setPicked(new Set(free.slice(0, first).map(person => person.key)))}>Pick the first {Math.min(first, free.length)}</button>
                  <button type="button" onClick={() => setPicked(new Set(free.map(person => person.key)))}>All</button>
                  <button type="button" onClick={() => setPicked(new Set())}>None</button>
                  <span className="ec-muted">{picked.size} chosen</span>
                </div>
                <ul className="td-people">
                  {onList.map(person => (
                    <li key={person.key}>
                      <label>
                        <input type="checkbox" disabled={!!person.coveredBy} checked={picked.has(person.key)} onChange={event => {
                          const next = new Set(picked);
                          if (event.target.checked) next.add(person.key); else next.delete(person.key);
                          setPicked(next);
                        }} />
                        <strong>{person.name}</strong>
                        <small>{person.coveredBy ? `Covered by ${person.coveredBy}` : `${person.cases.length} ${person.cases.length === 1 ? 'case' : 'cases'}`}</small>
                      </label>
                    </li>
                  ))}
                  {!onList.length && <li className="ec-muted">Nobody on this list right now.</li>}
                </ul>
              </div>
            )}
            <Parts pool={pool} parts={parts} setParts={setParts} newTo={newTo} setNewTo={setNewTo} whole={whole} receivers={receivers}
              overview={overview} list={list} from={desk.label} />
            <div className="ec-buttons">
              <button type="button" className="primary" disabled={busy || !data?.set_up} onClick={() => void delegate()}>
                Delegate {whole && parts.length === 1 ? `the whole ${listLabel(list)}` : `${pool.length} ${pool.length === 1 ? 'learner' : 'learners'}`}
              </button>
            </div>
          </div>
        )}
      </section>

      {(data?.absences.length || 0) > 0 && (
        <section className="dd-section" aria-labelledby="td-absent">
          <header className="dd-section-head"><div><p className="dd-eyebrow">Away now</p><h2 id="td-absent">Absent</h2></div></header>
          <ul className="td-absences">
            {data!.absences.map(item => <AbsentRow key={item.id} item={item} busy={busy} onBack={recall => void send(
              { action: 'back', agent_id: item.agent_id, recall }, `${item.agent_name} is back${recall ? ' and has their lists again' : ''}.`)} />)}
          </ul>
        </section>
      )}

      <section className="dd-section" aria-labelledby="td-tasks">
        <header className="dd-section-head">
          <div><p className="dd-eyebrow">What each task did</p><h2 id="td-tasks">Tasks</h2></div>
          <div className="ec-buttons">
            <label className="dd-month">Day<input type="date" value={day} max={overview.today} onChange={event => event.target.value && setDay(event.target.value)} /></label>
            <button type="button" onClick={refresh}>Refresh</button>
          </div>
        </header>
        <div className="ec-table-wrap dd-panel dd-flush">
          <table className="rm-table td-table">
            <thead><tr><th>List</th><th>Covered by</th><th>Learners</th><th>Open now</th><th>Called</th><th>Reached</th><th>Closed</th><th>Delegated</th><th /></tr></thead>
            <tbody>
              {[...active, ...recalledToday].map(task => (
                <tr key={task.id} className={task.recalled_at ? 'td-recalled' : ''}>
                  <td><strong>{taskLabel(task)}</strong><small>{task.absence_id ? 'While absent · ' : ''}{place(task)}</small></td>
                  <td>{task.to_name}{!task.seen_at && !task.recalled_at && <small>Not opened yet</small>}</td>
                  <td>{task.catch_new ? (task.learners.length ? `${task.learners.length} + new ones` : 'Whole list') : task.learners.length}</td>
                  <td>{task.counts?.open ?? '–'}</td><td>{task.counts?.called ?? '–'}</td>
                  <td>{task.counts?.reached ?? '–'}</td><td>{task.counts?.closed ?? '–'}</td>
                  <td>{task.created_by}<small>{when(task.created_at)}</small></td>
                  <td>{task.recalled_at ? <small>Recalled {when(task.recalled_at)}</small>
                    : <button type="button" disabled={busy} onClick={() => void send({ action: 'recall', task_ids: [task.id] }, `${taskLabel(task)} is back with ${task.from_name}.`)}>Recall</button>}</td>
                </tr>
              ))}
              {!active.length && !recalledToday.length && <tr><td colSpan={9}>No tasks on this day.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dd-section" aria-labelledby="td-history">
        <header className="dd-section-head"><div><p className="dd-eyebrow">Every change, by whom</p><h2 id="td-history">History</h2></div></header>
        <ol className="rm-history">
          {(data?.history || []).map(item => (
            <li key={item.id}>
              <strong>{ACTIONS[item.action] || item.action}</strong>
              <span>{item.action === 'delegated'
                ? `${listLabel(String(item.data.category))} to ${agentName(item.data.to_agent_id)} · ${item.data.catch_new && !item.data.learners ? 'whole list'
                  : `${item.data.learners} ${item.data.learners === 1 ? 'learner' : 'learners'}${item.data.catch_new ? ' + new ones' : ''}`}`
                : item.action === 'recalled' ? `From ${agentName(item.data.to_agent_id)}`
                  : item.action === 'absent' ? `${agentName(item.data.agent_id)} · line cover ${agentName(item.data.line_cover_id)}`
                    : `${agentName(item.data.agent_id)} · ${item.data.recalled} tasks recalled`}</span>
              <small>{item.actor} · {when(item.created_at)}</small>
            </li>
          ))}
          {!data?.history.length && <li className="ec-muted">Nothing delegated yet.</li>}
        </ol>
      </section>

      <Dialog open={planning} onClose={() => setPlanning(false)} title="Mark someone absent">
        {planning && <AbsencePlan overview={overview} agents={agents} absent={absent} busy={busy}
          onSave={async body => { if (await send({ action: 'absent', ...body }, 'Marked absent. Their lists are with the specialists you chose.')) setPlanning(false); }} />}
      </Dialog>
    </div>
  );
}

function AbsentRow({ item, busy, onBack }: { item: AbsenceRow; busy: boolean; onBack: (recall: boolean) => void }) {
  const [recall, setRecall] = useState(true);
  return (
    <li>
      <div><strong>{item.agent_name}</strong><small>Since {when(item.started_at)} · line cover {item.line_cover_name || 'nobody'}</small></div>
      <label><input type="checkbox" checked={recall} onChange={event => setRecall(event.target.checked)} /> Recall all their tasks now</label>
      <button type="button" disabled={busy} onClick={() => onBack(recall)}>Mark back in</button>
    </li>
  );
}

/** Mark absent: who covers the phone line, and for each of their lists, leave it or give it to one or more specialists. */
function AbsencePlan({ overview, agents, absent, busy, onSave }: {
  overview: Overview; agents: Row[]; absent: Set<number>; busy: boolean; onSave: (body: Record<string, unknown>) => void;
}) {
  const [agentId, setAgentId] = useState<number | null>(null);
  const [lineCover, setLineCover] = useState<number | null>(null);
  const [plans, setPlans] = useState<Record<string, { give: boolean; parts: Part[]; newTo: number }>>({});
  const desk: Desk | null = agentId ? { key: `agent:${agentId}`, source: 'agent', agentId, label: agents.find(a => a.id === agentId)?.display_name || '' } : null;
  const team = overview.employer_specialists || [];
  const lists = desk ? LISTS.filter(key => key !== 'employer_satisfaction' || !team.length).map(key => [key, people(overview, desk, key).filter(p => !p.coveredBy)] as const)
    .filter(([key, here]) => here.length || key === 'nextday') : [];
  const receivers = agents.filter(agent => agent.id !== agentId && !absent.has(agent.id));
  const plan = (key: string) => plans[key] || { give: false, parts: [{ to: null, count: 0, after: key }], newTo: 0 };
  const setPlan = (key: string, value: Partial<ReturnType<typeof plan>>) => setPlans(current => ({ ...current, [key]: { ...plan(key), ...value } }));

  function save() {
    const chosen = lists.filter(([key]) => plan(key).give);
    if (chosen.some(([key]) => plan(key).parts.some(part => !part.to))) return;
    onSave({ agent_id: agentId, line_cover_id: lineCover, lists: chosen.map(([key, here]) => ({
      category: key, parts: payload(here.map(person => person.key), plan(key).parts, plan(key).newTo, true) })) });
  }

  return (
    <div className="td-absence">
      <div className="td-step">
        <label>Who is absent
          <select value={agentId ?? ''} onChange={event => { setAgentId(Number(event.target.value) || null); setPlans({}); }}>
            <option value="">Choose…</option>
            {agents.filter(agent => !absent.has(agent.id)).map(agent => <option key={agent.id} value={agent.id}>{agent.display_name}</option>)}
          </select>
        </label>
        {desk && (
          <label>Who covers their phone line
            <select value={lineCover ?? ''} onChange={event => setLineCover(Number(event.target.value) || null)}>
              <option value="">Nobody (missed calls wait for them)</option>
              {receivers.map(agent => <option key={agent.id} value={agent.id}>{agent.display_name}</option>)}
            </select>
          </label>
        )}
      </div>
      {desk && lists.map(([key, here]) => (
        <section key={key} className="td-absence-list" aria-label={listLabel(key)}>
          <header>
            <strong>{listLabel(key)} · {here.length}</strong>
            <label><input type="checkbox" checked={plan(key).give} onChange={event => setPlan(key, { give: event.target.checked })} /> Hand it over</label>
          </header>
          {plan(key).give
            ? <Parts pool={here.map(person => person.key)} parts={plan(key).parts} setParts={parts => setPlan(key, { parts })} newTo={plan(key).newTo}
              setNewTo={newTo => setPlan(key, { newTo })} whole receivers={receivers} overview={overview} list={key} from={desk.label} />
            : <p className="ec-muted">Stays with {desk.label}.</p>}
        </section>
      ))}
      {desk && (
        <div className="ec-buttons">
          <button type="button" className="primary" disabled={busy} onClick={save}>Mark {desk.label} absent</button>
        </div>
      )}
    </div>
  );
}
