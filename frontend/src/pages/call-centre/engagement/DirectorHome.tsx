import { useCallCentre } from '../api';
import type { Overview } from '../api';
import { Bars, CallsByDay, QualityStrip, TalkByDay } from './charts';
import { byReason, caseload, monthTotals, ranked, rate } from './dashboard';
import type { Live } from './live';
import { liveSeconds } from './live';
import { duration, failingSources } from './model';
import Switchboard from './Switchboard';

export type Go = (view: string, extra?: Record<string, string>) => void;

const monthName = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** A figure for the month: the number large, what it counts beneath. */
export function Figure({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className={`dd-figure${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** What needs the director now: each item opens the page where it is dealt with. Hidden when nothing does. */
function NeedsYou({ overview, go }: { overview: Overview; go: Go }) {
  const callbacks = useCallCentre<{ summary: { open: number } }>('inbound/?kind=callback&status=open&days=7');
  const changes = useCallCentre<{ changes: { serious: boolean }[] }>('zoom-changes/?days=7');
  const recordings = useCallCentre<{ calls: unknown[] }>('missing-recordings/?days=7');
  const load = caseload(overview.cases);
  const items: [number, string, string, Record<string, string>?][] = [
    [load.ai, 'AI suggestions to approve or reject', 'quality'],
    [callbacks.data?.summary.open || 0, 'learners waiting for a call back', 'calls'],
    [load.late, 'cases past their call date', 'cases'],
    [(overview.call_reviews?.flags || []).length, 'calls rated bad this month', 'quality'],
    [load.unallocated, 'learners in the shared queue', 'allocations'],
    [(changes.data?.changes || []).filter(change => change.serious).length, 'Zoom changes that stop matching or recording', 'phone'],
    [recordings.data?.calls.length || 0, 'answered calls Zoom did not record (7 days)', 'quality'],
    [failingSources(overview).length, 'data sources not reading', 'settings'],
  ];
  const shown = items.filter(([count]) => count > 0);
  return (
    <section className="dd-needs" aria-label="Needs you">
      <h2>Needs you</h2>
      {shown.length ? (
        <ul>
          {shown.map(([count, label, view, extra]) => (
            <li key={label}><button type="button" onClick={() => go(view, extra)}><b>{count}</b>{label}<span aria-hidden="true">→</span></button></li>
          ))}
        </ul>
      ) : <p>Nothing is waiting for you right now.</p>}
    </section>
  );
}

/** The director's overview: the board live, what needs attention, the month in figures and graphs, and the team ranked. */
export default function DirectorHome({ overview, live, now, go, onMonth }: {
  overview: Overview; live: Live | null; now: number; go: Go; onMonth: (month: string) => void;
}) {
  const agents = overview.agents;
  const totals = monthTotals(agents);
  const load = caseload(overview.cases);
  const reviews = overview.call_reviews?.agents || {};
  const team = { excellent: 0, good: 0, bad: 0 };
  Object.values(reviews).forEach(counts => { team.excellent += counts.excellent; team.good += counts.good; team.bad += counts.bad; });
  const openSpecialist = (id: number) => go('specialist', { agent: String(id) });
  const current = overview.month === overview.today.slice(0, 7);

  return (
    <div className="dd">
      <Switchboard agents={agents} live={live} now={now} onOpen={openSpecialist} />
      <NeedsYou overview={overview} go={go} />

      <section className="dd-section" aria-labelledby="dd-month">
        <header className="dd-section-head">
          <div>
            <p className="dd-eyebrow">The month in calls{current ? ' so far' : ''}</p>
            <h2 id="dd-month">{monthName(overview.month)}</h2>
          </div>
          <label className="dd-month">Month
            <input type="month" value={overview.month} max={overview.today.slice(0, 7)} onChange={event => event.target.value && onMonth(event.target.value)} />
          </label>
        </header>
        <div className="dd-figures">
          <Figure label="Calls made" value={totals.attempts} hint={`${totals.connected} answered`} />
          <Figure label="Answer rate" value={totals.answerRate === null ? '—' : `${totals.answerRate}%`} hint="Answered of calls made" />
          <Figure label="Talk time" value={duration(totals.seconds)} hint="Confirmed by Zoom" />
          <Figure label="Learners reached" value={totals.learners} hint="Added up per specialist" />
          <Figure label="Cases resolved" value={totals.resolved} hint={`${overview.resolutions.ai} by AI review · ${overview.resolutions.system} by evidence`} />
          <Figure label="Cases gone late" value={totals.breaches} hint="Passed their call date this month" tone={totals.breaches ? 'bad' : undefined} />
        </div>
        <div className="dd-pair">
          <article className="dd-panel">
            <h3>Talk time per day</h3>
            <p className="dd-muted">Each colour is a specialist; the gold line is the team’s daily target.</p>
            <TalkByDay agents={agents} />
          </article>
          <article className="dd-panel">
            <h3>Calls per day</h3>
            <p className="dd-muted">Answered, and not answered (voicemail, no answer, busy).</p>
            <CallsByDay agents={agents} />
          </article>
        </div>
      </section>

      <section className="dd-section" aria-labelledby="dd-cases">
        <header className="dd-section-head">
          <div><p className="dd-eyebrow">Right now</p><h2 id="dd-cases">The calling list</h2></div>
          <button type="button" onClick={() => go('cases')}>Open the calling register</button>
        </header>
        <div className="dd-trio">
          <article className="dd-panel">
            <h3>Why learners are on the list</h3>
            <Bars label="Open cases by reason" rows={byReason(overview.cases).slice(0, 8)} onPick={() => go('cases')} />
          </article>
          <article className="dd-panel">
            <h3>Where the cases stand</h3>
            <Bars label="Open cases by stage" tone="teal" rows={[
              { key: 'due', label: 'Due to call now', value: load.due },
              { key: 'late', label: 'Past their call date', value: load.late },
              { key: 'waiting', label: 'Waiting for the learner', value: load.waiting, hint: 'Call-back booked or a promise' },
              { key: 'missed', label: 'Last call not answered', value: load.missed },
              { key: 'promises', label: 'Promise broken', value: load.promises },
              { key: 'ai', label: 'AI suggests closing', value: load.ai },
            ]} />
            <p className="dd-total"><b>{load.open}</b> open cases{overview.cases_truncated ? ' (list truncated)' : ''}</p>
          </article>
          <article className="dd-panel">
            <h3>Call quality this month</h3>
            <p className="dd-muted">The AI rates each recorded call.</p>
            <div className="dd-team-quality"><QualityStrip counts={team} /></div>
            <button type="button" onClick={() => go('quality')}>Review call quality</button>
          </article>
        </div>
      </section>

      <section className="dd-section" aria-labelledby="dd-team">
        <header className="dd-section-head">
          <div><p className="dd-eyebrow">Ranked by talk time this month</p><h2 id="dd-team">The team</h2></div>
          <button type="button" onClick={() => go('scorecards')}>Weekly scorecards</button>
        </header>
        <div className="dd-panel dd-flush">
          <div className="ec-table-wrap">
            <table className="dd-table">
              <thead><tr><th>Specialist</th><th>Today</th><th>Calls</th><th>Answer rate</th><th>Talk time</th><th>Resolved</th><th>Call quality</th><th>Their open cases</th></tr></thead>
              <tbody>
                {ranked(agents).map((agent, index) => {
                  const mine = caseload(overview.cases.filter(c => c.allocated_agent_id === agent.id));
                  const today = agent.today.seconds + liveSeconds(live?.calls, agent.id, now);
                  return (
                    <tr key={agent.id}>
                      <td><button type="button" className="dd-name" onClick={() => openSpecialist(agent.id)}><i>{index + 1}</i>{agent.display_name}</button></td>
                      <td>{duration(today)}<small>of {duration(agent.target_seconds)}</small></td>
                      <td>{agent.month.attempts}<small>{agent.month.connected} answered</small></td>
                      <td>{rate(agent.month.connected, agent.month.attempts) ?? '—'}{agent.month.attempts ? '%' : ''}</td>
                      <td>{duration(agent.month.seconds)}</td>
                      <td>{agent.month.resolved}</td>
                      <td><QualityStrip counts={reviews[agent.id]} /></td>
                      <td>{mine.open}<small className={mine.late ? 'dd-bad' : undefined}>{mine.late} past their date</small></td>
                    </tr>
                  );
                })}
                {!agents.length && <tr><td colSpan={8}>No active specialists.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
