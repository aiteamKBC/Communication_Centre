import { useState } from 'react';
import type { Overview } from '../api';
import Dialog from './Dialog';
import Register from './Register';
import { ISSUE_LABELS, badges, downloadBlob, duration, issueLabel, longDate, points, when } from './model';

type Props = {
  overview: Overview; month: string;
  onMonth: (month: string) => void; onView: (view: string) => void; onPreview: (agentId: number) => void; onOpenCase: (id: number) => void;
};

const colours = ['#60359a', '#268a8b'];

function Chart({ overview }: { overview: Overview }) {
  const rows = overview.agents[0]?.month.daily || [];
  if (!rows.some(day => overview.agents.some(agent => agent.month.daily.find(d => d.day === day.day)?.seconds))) {
    return <div className="ec-empty">The daily call-time curve will appear when verified call records arrive.</div>;
  }
  const target = Math.max(0, ...overview.agents.map(agent => agent.target_seconds));
  const max = Math.max(target, 1, ...overview.agents.flatMap(agent => agent.month.daily.map(day => day.seconds)));
  const y = (seconds: number) => 160 - (seconds / max) * 135;
  const x = (index: number) => 40 + (index / Math.max(1, rows.length - 1)) * 645;
  return (
    <>
      <svg className="ec-chart" viewBox="0 0 720 190" role="img" aria-label="Verified connected call time by day">
        <line x1="35" y1="160" x2="695" y2="160" stroke="#d9d6e1" />
        {target > 0 && (
          <>
            <line x1="35" y1={y(target)} x2="695" y2={y(target)} stroke="#bbb" strokeDasharray="5 5" />
            <text x="40" y={y(target) - 6}>{duration(target)} target</text>
          </>
        )}
        {overview.agents.map((agent, index) => (
          <polyline key={agent.id} fill="none" stroke={colours[index % 2]} strokeWidth="3"
            points={rows.map((row, j) => `${x(j)},${y(agent.month.daily.find(d => d.day === row.day)?.seconds || 0)}`).join(' ')} />
        ))}
        <text x="35" y="183">{rows[0].day}</text>
        <text x="610" y="183">{rows[rows.length - 1].day}</text>
      </svg>
      <div className="ec-legend">
        {overview.agents.map((agent, index) => <span key={agent.id} style={{ '--colour': colours[index % 2] } as React.CSSProperties}>{agent.display_name}</span>)}
      </div>
    </>
  );
}

function reportHTML(overview: Overview) {
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const best = [...overview.agents].sort((a, b) => b.month.seconds - a.month.seconds)[0];
  return `<h2>Engagement performance · ${esc(overview.month)}</h2><p>Prepared ${esc(longDate(overview.generated_at))}</p>`
    + '<table><thead><tr><th>Operator</th><th>Attempts</th><th>Answered</th><th>Connected time</th><th>Resolved</th><th>SLA breaches</th></tr></thead><tbody>'
    + overview.agents.map(a => `<tr><td>${esc(a.display_name)}</td><td>${a.month.attempts}</td><td>${a.month.connected}</td><td>${duration(a.month.seconds)}</td><td>${a.month.resolved}</td><td>${a.month.sla_breaches}</td></tr>`).join('')
    + `</tbody></table><p>Most connected time: ${esc(best?.display_name || 'No verified calls')}</p>`
    + `<section><h3>Resolutions</h3><p>By specialists ${overview.resolutions.agent} · by AI review ${overview.resolutions.ai} · by source evidence ${overview.resolutions.system}. Unclaimed SLA breaches: ${overview.unclaimed_breaches}.</p></section>`
    + '<p>Call figures come from Zoom Phone records. Missing telephone coverage is not evidence of inactivity.</p>';
}

/** Director overview: bookings, call review, operator desks, KPIs, performance and the calling register. */
export default function Director({ overview, month, onMonth, onView, onPreview, onOpenCase }: Props) {
  const [report, setReport] = useState(false);
  const open = overview.cases;
  const waitingAi = open.filter(c => c.status === 'ai_suggested_close').length;
  const coachesWithLinks = new Set(open.filter(c => Object.keys(c.booking_links).length).map(c => c.coach)).size;
  const needsManager = open.filter(c => ['unreachable', 'escalated'].includes(c.status));
  const stats: [string, number, string][] = [
    ['Open support cases', open.length, 'Across the calling register'],
    ['Waiting for the learner', open.filter(c => ['pending_learner', 'pending_verification'].includes(c.status)).length, 'Callback booked, or a promise waiting for its deadline'],
    ['Missed calls', open.filter(c => c.missed_call).length, 'Last call unanswered; at the bottom of their list'],
    ['Needs a manager', needsManager.length, '3 missed calls, wrong number, refusal or 2 missed promises'],
  ];

  return (
    <>
      <section className="ec-card">
        <h2>Needs a manager ({needsManager.length})</h2>
        {needsManager.length ? (
          <>
            <p className="ec-muted">Open each case, then close it with a reason or send it back to the calling list with a note for the specialist.</p>
            <div className="ec-table-wrap">
              <table>
                <thead><tr><th>Learner</th><th>Why</th><th>Last action</th><th /></tr></thead>
                <tbody>
                  {needsManager.slice(0, 50).map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.learner_name}</strong><small>{issueLabel(c)}</small></td>
                      <td>{c.status === 'unreachable' ? `${c.attempts} missed calls` : c.promise_missed ? 'Promises missed' : 'Wrong number or refused'}</td>
                      <td>{when(c.last_action_at)}<small>{c.last_actor}</small></td>
                      <td><button type="button" className="primary" onClick={() => onOpenCase(c.id)}>Open case</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {needsManager.length > 50 && <p className="ec-muted">First 50 shown, in priority order.</p>}
          </>
        ) : <p className="ec-muted">Nothing needs you right now.</p>}
      </section>

      <section className="ec-card">
        <h2>Coach bookings · Microsoft Bookings</h2>
        <p>Booking pages are mapped for {coachesWithLinks} coaches in the current register. Calendar reading is not connected yet.</p>
        <button type="button" onClick={() => onView('calendar')}>Open coach calendars</button>{' '}
        <button type="button" onClick={() => onView('bookings')}>Open coach booking links</button>
      </section>

      <section className="ec-card ed-lower">
        <div className="ec-head">
          <div><h2>Call red flags</h2><p className="ec-muted">Recorded-call evidence for every specialist. AI findings require a human review.</p></div>
          <button type="button" disabled>Process pending call reviews</button>
        </div>
        <p className="ec-alert">Transcript red-flag analysis is not connected yet. Zoom transcripts are available under Zoom Phone.</p>
        <p className="ec-muted">{overview.connections.ai ? `${waitingAi} AI close suggestions await a specialist decision in the calling workspace.` : 'AI case review is switched off.'}</p>
      </section>

      <section className="ec-card ec-preview-options">
        <div><h2>See the operator’s call desk</h2><p>Your director access includes every specialist. Preview their individual queues and daily progress here.</p></div>
        <div className="ec-buttons">
          {overview.agents.map(agent => (
            <button key={agent.id} type="button" className="primary" onClick={() => onPreview(agent.id)}>View {agent.display_name.split(' ')[0]}’s screen</button>
          ))}
          {!overview.agents.length && <span className="ec-muted">No active agent profiles. Add one under Zoom Phone.</span>}
        </div>
      </section>

      <div className="ec-grid">
        {stats.map(([label, value, hint]) => <div key={label} className="ec-card ec-stat"><span>{label}</span><strong>{value}</strong><span>{hint}</span></div>)}
      </div>

      <section className="ec-card ec-allocation-intro">
        <div className="ec-head">
          <div><h2>Learner allocation</h2><p>Keep each learner with one specialist. Review workloads, share learners evenly or arrange a handover.</p></div>
          <button type="button" className="primary" onClick={() => onView('allocations')}>Manage learner allocation</button>
        </div>
      </section>

      <section className="ec-card">
        <div className="ec-head">
          <h2>Operator performance</h2>
          <div className="ec-buttons">
            <label>Report month <input type="month" value={month} max={overview.today.slice(0, 7)} onChange={event => event.target.value && onMonth(event.target.value)} /></label>
            <button type="button" onClick={() => setReport(true)}>Monthly report</button>
            <button type="button" disabled title="Development actions are not connected yet.">+ SMART action</button>
          </div>
        </div>
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Specialist</th><th>Calls today</th><th>Connected time</th><th>Call quality</th><th>Points today</th><th>Achievements</th></tr></thead>
            <tbody>
              {overview.agents.map(agent => (
                <tr key={agent.id}>
                  <td><strong>{agent.display_name}</strong><small>{agent.sync.last_success_at ? `Zoom synced ${when(agent.sync.last_success_at)}` : 'Zoom sync pending'}</small></td>
                  <td>{agent.today.attempts}<small>{agent.today.connected} connected</small></td>
                  <td>{duration(agent.today.seconds)}<small>Target {duration(agent.target_seconds)}</small></td>
                  <td>Unscored<small>Transcript scoring not connected</small></td>
                  <td>{points(agent.today, agent.target_seconds)}</td>
                  <td>{badges(agent.today, agent.target_seconds).map(name => <span key={name} className="ec-tag">★ {name}</span>)}{!badges(agent.today, agent.target_seconds).length && '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Chart overview={overview} />
        <p className="ec-muted">Time is taken from Zoom Phone. Duration points stop at the daily target; unscored calls are not scored as zero.</p>
      </section>

      <div style={{ height: '1.2rem' }} />
      <div className="ec-split">
        <section className="ec-card">
          <h2>Contact and support patterns</h2>
          <div className="ec-table-wrap">
            <table>
              <thead><tr><th>Issue</th><th>Open</th><th>Awaiting reply</th></tr></thead>
              <tbody>
                {Object.entries(ISSUE_LABELS).map(([key, label]) => (
                  <tr key={key}><td>{label}</td><td>{open.filter(c => c.source_type === key).length}</td><td>{open.filter(c => c.source_type === key && c.status === 'pending_learner').length}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ec-muted">Repeated unanswered calls flag a contact review. They do not establish that a learner has disengaged.</p>
        </section>
        <div className="ec-stack">
          <section className="ec-card">
            <h2>Ask about the call evidence</h2>
            <p>Explore expressed feedback, support barriers, commitments and observable call practice.</p>
            <form onSubmit={event => event.preventDefault()}>
              <label>Your question<textarea name="prompt" placeholder="What are the main barriers learners mentioned, and which actions helped?" disabled /></label>
              <div className="ec-buttons" style={{ marginTop: '1rem' }}><button type="submit" disabled>Request transcript analysis</button></div>
            </form>
            <p className="ec-muted">Transcript analysis connection pending.</p>
            <button type="button" disabled>View saved analyses</button>
          </section>
          <section className="ec-card">
            <h2>Red flags & development</h2>
            {overview.agents.filter(agent => agent.month.sla_breaches > 0).map(agent => (
              <p key={agent.id}>{agent.display_name}: {agent.month.sla_breaches} SLA breaches this month. Review the cases and agree support.</p>
            ))}
            {!overview.agents.some(agent => agent.month.sla_breaches > 0) && <p className="ec-muted">No SLA breach flags for worked cases this month.</p>}
            {overview.unclaimed_breaches > 0 && <p>{overview.unclaimed_breaches} cases breached their due date before anyone claimed them.</p>}
          </section>
        </div>
      </div>
      <div style={{ height: '1.2rem' }} />
      <Register overview={overview} onOpenCase={onOpenCase} />

      <Dialog open={report} onClose={() => setReport(false)}>
        <h2>Monthly engagement report · {overview.month}</h2>
        <div className="ec-report" dangerouslySetInnerHTML={{ __html: reportHTML(overview) }} />
        <button
          type="button"
          onClick={() => downloadBlob(new Blob([`<!doctype html><html lang="en-GB"><meta charset="utf-8"><title>KBC Engagement Report</title><style>body{font:16px/1.6 Arial,sans-serif;max-width:1100px;margin:40px auto;padding:20px;color:#25223b}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}h1,h2{color:#60359a}section{margin:25px 0}</style><h1>Kent Business College</h1>${reportHTML(overview)}</html>`], { type: 'text/html' }), `KBC-Engagement-${overview.month}.html`)}
        >
          Download report
        </button>
      </Dialog>
    </>
  );
}
