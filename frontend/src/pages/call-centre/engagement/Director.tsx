import { useState } from 'react';
import type { AgentStats, CallFlag, Overview, OverviewCase } from '../api';
import { caseAction } from './actions';
import type { Session } from './actions';
import { CallReviewDialog, RatingRules } from './CallReview';
import Dialog from './Dialog';
import EmployerSpecialists from './EmployerSpecialists';
import Register from './Register';
import { ISSUE_LABELS, badges, dueForCall, ratedCalls, downloadBlob, duration, issueLabel, longDate, points, when } from './model';

type Props = {
  overview: Overview; month: string; session: Session;
  onMonth: (month: string) => void; onChanged: () => void; notify: (message: string, error?: boolean) => void; onPreview: (agentId: number) => void; onOpenCase: (id: number) => void;
};

// Case types switched off on the server (rules.PAUSED_CATEGORIES): no cases to count.
const PAUSED = new Set(['otj']);
const colours = ['#60359a', '#268a8b', '#c0632b', '#2f6db5', '#a3326e', '#5b8a2a'];

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
          <polyline key={agent.id} fill="none" stroke={colours[index % colours.length]} strokeWidth="3"
            points={rows.map((row, j) => `${x(j)},${y(agent.month.daily.find(d => d.day === row.day)?.seconds || 0)}`).join(' ')} />
        ))}
        <text x="35" y="183">{rows[0].day}</text>
        <text x="610" y="183">{rows[rows.length - 1].day}</text>
      </svg>
      <div className="ec-legend">
        {overview.agents.map((agent, index) => <span key={agent.id} style={{ '--colour': colours[index % colours.length] } as React.CSSProperties}>{agent.display_name}</span>)}
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

function quality(overview: Overview, agent: AgentStats) {
  const counts = overview.call_reviews?.agents[agent.id];
  const rated = ratedCalls(counts);
  if (!counts || !rated) return <>Unscored<small>No rated calls this month</small></>;
  return <>{counts.excellent} excellent · {counts.good} good<small className={counts.bad ? 'danger' : undefined}>{counts.bad} bad · {rated} rated this month</small></>;
}

/** AI close suggestions: the AI read a call and thinks the case is done; a manager approves or rejects it. */
function WaitingForManager({ cases, session, onOpenCase, onChanged, notify }: {
  cases: OverviewCase[]; session: Session; onOpenCase: (id: number) => void; onChanged: () => void; notify: (message: string, error?: boolean) => void;
}) {
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState<number | null>(null);

  async function decide(c: OverviewCase, approve: boolean) {
    const note = (notes.get(c.id) || '').trim();
    if (approve && !note) {
      notify('Add a short reason before approving.', true);
      return;
    }
    setBusy(c.id);
    try {
      await caseAction(session, c.id, approve ? 'resolve' : 'reject_ai', approve ? { note, option: c.resolution_option || 'other' } : { note });
      notify(approve ? `${c.learner_name}: case resolved.` : `${c.learner_name}: AI suggestion rejected; the case is back in the list.`);
      onChanged();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The case could not be updated.', true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ec-card">
      <h2>Cases waiting for a manager ({cases.length})</h2>
      <p className="ec-muted">The AI read the call and suggests the case is done. Check its summary, then approve (the case closes) or reject (it goes back to the list).</p>
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Learner</th><th>AI summary</th><th>Your reason</th><th /></tr></thead>
          <tbody>
            {cases.map(c => (
              <tr key={c.id}>
                <td><strong>{c.learner_name}</strong><small>{issueLabel(c)}</small></td>
                <td>{c.ai_summary || 'No summary recorded.'}<small>Confidence {Math.round((c.ai_confidence || 0) * 100)}%</small></td>
                <td><textarea rows={2} maxLength={5000} aria-label={`Reason for ${c.learner_name}`} value={notes.get(c.id) || ''}
                  onChange={event => setNotes(current => new Map(current).set(c.id, event.target.value))} /></td>
                <td>
                  <div className="ec-buttons">
                    <button type="button" className="primary" disabled={busy !== null} onClick={() => void decide(c, true)}>Approve and resolve</button>
                    <button type="button" disabled={busy !== null} onClick={() => void decide(c, false)}>Reject</button>
                    <button type="button" onClick={() => onOpenCase(c.id)}>Open case</button>
                  </div>
                </td>
              </tr>
            ))}
            {!cases.length && <tr><td colSpan={4}>No AI suggestions are waiting.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Director overview: call review, operator desks, KPIs, performance and the calling register. */
export default function Director({ overview, month, session, onMonth, onChanged, notify, onPreview, onOpenCase }: Props) {
  const [report, setReport] = useState(false);
  const [flag, setFlag] = useState<CallFlag | null>(null);
  const flags = overview.call_reviews?.flags || [];
  const open = overview.cases;
  const waiting = open.filter(c => c.status === 'ai_suggested_close');
  const mine = (agent: AgentStats) => open.filter(c => c.allocated_agent_id === agent.id);
  const stats: [string, number, string][] = [
    ['Open support cases', open.length, 'Across the calling register'],
    ['Due to call now', open.filter(c => dueForCall(c)).length, 'Not waiting on a callback, a promise or evidence'],
    ['Past their call date', open.filter(c => c.sla_breached).length, 'The call was due before today'],
    ['In the shared queue', open.filter(c => !c.allocated_agent_id).length, 'Learners not allocated to a specialist'],
    ['Waiting for the learner', open.filter(c => ['pending_learner', 'pending_verification'].includes(c.status)).length, 'Callback booked, or a promise waiting for its deadline'],
    ['Missed calls', open.filter(c => c.missed_call).length, 'Last call unanswered; at the bottom of their list'],
  ];

  return (
    <>
      <EmployerSpecialists session={session} onChanged={onChanged} notify={notify} />

      <section className="ec-card ed-lower">
        <div className="ec-head">
          <div><h2>Call red flags</h2><p className="ec-muted">The AI rates each call transcript excellent, good or bad as it arrives. Calls rated bad are listed here with what went wrong and what to change. AI findings require a human review.</p></div>
        </div>
        {!overview.connections.ai ? <p className="ec-alert">AI call review is switched off, so transcripts are not being rated.</p> : (
          <div className="ec-table-wrap">
            <table>
              <thead><tr><th>Call</th><th>What went wrong</th><th>What needs to change</th><th /></tr></thead>
              <tbody>
                {flags.map(item => (
                  <tr key={item.recording_id}>
                    <td><strong>{item.agent_name}</strong><small>{when(item.started_at)}</small></td>
                    <td>{item.went_wrong.join(' ')}</td>
                    <td>{item.needs_change.join(' ')}</td>
                    <td><button type="button" onClick={() => setFlag(item)}>Review call</button></td>
                  </tr>
                ))}
                {!flags.length && <tr><td colSpan={4}>No calls rated bad in {overview.month}.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <RatingRules />
        {!overview.connections.ai && <p className="ec-muted">AI case review is switched off.</p>}
      </section>

      {(overview.connections.ai || waiting.length > 0) && (
        <WaitingForManager cases={waiting} session={session} onOpenCase={onOpenCase} onChanged={onChanged} notify={notify} />
      )}

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

      <section className="ec-card">
        <div className="ec-head">
          <h2>Operator performance</h2>
          <div className="ec-buttons">
            <label>Report month <input type="month" value={month} max={overview.today.slice(0, 7)} onChange={event => event.target.value && onMonth(event.target.value)} /></label>
            <button type="button" onClick={() => setReport(true)}>Monthly report</button>
          </div>
        </div>
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Specialist</th><th>Calls today</th><th>Connected time</th><th>Call quality</th><th>Missed calls</th><th>Broken promises</th><th>Points today</th><th>Achievements</th></tr></thead>
            <tbody>
              {overview.agents.map(agent => (
                <tr key={agent.id}>
                  <td><strong>{agent.display_name}</strong><small>{agent.sync.last_success_at ? `Zoom synced ${when(agent.sync.last_success_at)}` : 'Zoom sync pending'}</small></td>
                  <td>{agent.today.attempts}<small>{agent.today.connected} connected</small></td>
                  <td>{duration(agent.today.seconds)}<small>Target {duration(agent.target_seconds)}</small></td>
                  <td>{quality(overview, agent)}</td>
                  <td>{mine(agent).filter(c => c.missed_call).length}<small>open cases, last call unanswered</small></td>
                  <td>{mine(agent).filter(c => c.promise_missed).length}<small>deadline passed, nothing done</small></td>
                  <td>{points(agent.today, agent.target_seconds)}</td>
                  <td>{badges(agent.today, agent.target_seconds).map(name => <span key={name} className="ec-tag">★ {name}</span>)}{!badges(agent.today, agent.target_seconds).length && '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Chart overview={overview} />
        <p className="ec-muted">Missed calls and broken promises count the open cases of each specialist’s allocated learners (the shared queue is not included). Time is taken from Zoom Phone. Duration points stop at the daily target; unscored calls are not scored as zero.</p>
      </section>

      <div style={{ height: '1.2rem' }} />
      <div className="ec-split">
        <section className="ec-card">
          <h2>Contact and support patterns</h2>
          <div className="ec-table-wrap">
            <table>
              <thead><tr><th>Issue</th><th>Open</th><th>Awaiting reply</th></tr></thead>
              <tbody>
                {Object.entries(ISSUE_LABELS).filter(([key]) => !PAUSED.has(key)).map(([key, label]) => (
                  <tr key={key}><td>{label}</td><td>{open.filter(c => c.source_type === key).length}</td><td>{open.filter(c => c.source_type === key && c.status === 'pending_learner').length}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ec-muted">Repeated unanswered calls flag a contact review. They do not establish that a learner has disengaged.</p>
        </section>
        <div className="ec-stack">
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

      <CallReviewDialog call={flag} onClose={() => setFlag(null)} />
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
