import { useState } from 'react';
import type { Overview } from '../api';
import { listProgress, outcomeLabel, when } from './model';
import type { DeskWork } from './model';

const result = (row: DeskWork) => {
  const saved = row.outcome === 'feedback' ? 'Feedback completed' : row.outcome === 'not_discussed' ? 'Not discussed'
    : row.outcome ? outcomeLabel(row.outcome) : '';
  return [saved, row.resolved ? 'closed' : ''].filter(Boolean).join(' · ') || 'Closed';
};

/** One line for a specialist's card: the list Call next is on and how far through it they are. */
export function NowOn({ overview, agentId, worked }: { overview: Overview; agentId: number; worked: DeskWork[] | undefined }) {
  if (!worked) return null;
  const { lists, current } = listProgress(overview, agentId, worked);
  const done = lists.reduce((total, list) => total + list.done.length, 0);
  const list = lists.find(item => item.key === current);
  return (
    <small className="dd-now-on">
      {list ? <>Now on <b>{list.label}</b>: {list.done.length} done, {list.remaining.length} to call</> : 'Every list called'}
      {` · ${done} done today`}
    </small>
  );
}

/** A specialist's lists in their Today order: finished today, still to call now, and waiting. A list opens its people. */
export default function DeskProgress({ overview, agentId, name, worked, error, onOpenCase }: {
  overview: Overview; agentId: number; name: string; worked: DeskWork[] | undefined; error: string; onOpenCase: (id: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const { lists, current } = listProgress(overview, agentId, worked || []);
  const shown = lists.find(list => list.key === (open || current));

  return (
    <section className="dd-section" aria-labelledby="dd-their-lists">
      <header className="dd-section-head">
        <div>
          <p className="dd-eyebrow">Today, list by list as Call next takes them</p>
          <h2 id="dd-their-lists">{name}’s lists</h2>
          <p className="dd-muted">Done: a result saved today (any outcome). To call: due now. Waiting: on the list, not due yet.</p>
        </div>
      </header>
      {error && !worked && <p className="ec-alert" role="alert">{error}</p>}
      <div className="dd-lists" role="tablist" aria-label={`${name}’s lists`}>
        {lists.map(list => (
          <button key={list.key} type="button" role="tab" aria-selected={shown?.key === list.key}
            className={`dd-list${list.key === current ? ' now' : ''}${list.remaining.length || list.done.length ? '' : ' empty'}`}
            onClick={() => setOpen(list.key)}>
            <span>{list.label}{list.key === current && <em>Now</em>}</span>
            <strong>{list.done.length}<small> done</small></strong>
            <small>{list.remaining.length} to call · {list.waiting} waiting</small>
          </button>
        ))}
      </div>
      {shown && (
        <div className="dd-pair">
          <article className="dd-panel">
            <h3>Done today: {shown.label}</h3>
            {shown.done.length ? (
              <ul className="dd-list-people">
                {[...shown.done].sort((a, b) => b.at.localeCompare(a.at)).map(row => (
                  <li key={row.case_id}>
                    <button type="button" className="ed-sheet-link" onClick={() => onOpenCase(row.case_id)}>{row.learner_name || row.learner_email}</button>
                    <span>{result(row)}</span><small>{when(row.at)}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="dd-muted">{worked ? 'Nobody yet today.' : 'Loading…'}</p>}
          </article>
          <article className="dd-panel">
            <h3>Still to call: {shown.label}</h3>
            {shown.remaining.length ? (
              <ul className="dd-list-people">
                {shown.remaining.map(c => (
                  <li key={c.id}>
                    <button type="button" className="ed-sheet-link" onClick={() => onOpenCase(c.id)}>{c.call_name || c.learner_name || c.learner_email}</button>
                    <span>{c.missed_call ? 'Last call not answered' : c.attempts ? `${c.attempts} missed ${c.attempts === 1 ? 'call' : 'calls'}` : 'Not called yet'}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="dd-muted">Nobody to call on this list now.</p>}
          </article>
        </div>
      )}
    </section>
  );
}
