import type { Overview } from '../api';
import { listProgress } from './model';
import type { DeskWork } from './model';

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

/** A specialist's lists in their Today order: how many finished today, still to call now, and waiting. */
export default function DeskProgress({ overview, agentId, name, worked, error }: {
  overview: Overview; agentId: number; name: string; worked: DeskWork[] | undefined; error: string;
}) {
  const { lists, current } = listProgress(overview, agentId, worked || []);

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
      <ul className="dd-lists" aria-label={`${name}’s lists`}>
        {lists.map(list => (
          <li key={list.key} className={`dd-list${list.key === current ? ' now' : ''}${list.remaining.length || list.done.length ? '' : ' empty'}`}>
            <span>{list.label}{list.key === current && <em>Now</em>}</span>
            <strong>{list.done.length}<small> done</small></strong>
            <small>{list.remaining.length} to call · {list.waiting} waiting</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
