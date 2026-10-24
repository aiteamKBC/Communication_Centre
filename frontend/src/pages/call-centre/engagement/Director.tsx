import { useState } from 'react';
import type { CallFlag, Overview, OverviewCase } from '../api';
import { caseAction } from './actions';
import type { Session } from './actions';
import { CallReviewDialog, RatingRules } from './CallReview';
import CallLog from './CallLog';
import { caseload, monthTotals } from './dashboard';
import Dialog from './Dialog';
import { Figure } from './DirectorHome';
import MissedCalls from './MissedCalls';
import Register from './Register';
import { MissingRecordings, Scorecard, TranscriptSearch } from './Scorecard';
import { downloadBlob, duration, issueLabel, longDate, when } from './model';

type Notify = (message: string, error?: boolean) => void;

function reportHTML(overview: Overview) {
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const best = [...overview.agents].sort((a, b) => b.month.seconds - a.month.seconds)[0];
  return `<h2>Engagement performance · ${esc(overview.month)}</h2><p>Prepared ${esc(longDate(overview.generated_at))}</p>`
    + '<table><thead><tr><th>Specialist</th><th>Calls</th><th>Answered</th><th>Talk time</th><th>Resolved</th><th>Cases gone late</th></tr></thead><tbody>'
    + overview.agents.map(a => `<tr><td>${esc(a.display_name)}</td><td>${a.month.attempts}</td><td>${a.month.connected}</td><td>${duration(a.month.seconds)}</td><td>${a.month.resolved}</td><td>${a.month.sla_breaches}</td></tr>`).join('')
    + `</tbody></table><p>Most talk time: ${esc(best?.display_name || 'No verified calls')}</p>`
    + `<section><h3>Resolutions</h3><p>By specialists ${overview.resolutions.agent} · by AI review ${overview.resolutions.ai} · by source evidence ${overview.resolutions.system}. Unclaimed SLA breaches: ${overview.unclaimed_breaches}.</p></section>`
    + '<p>Call figures come from Zoom Phone records. Missing telephone coverage is not evidence of inactivity.</p>';
}

/** AI close suggestions: the AI read a call and thinks the case is done; a manager approves or rejects it. */
function WaitingForManager({ cases, session, onOpenCase, onChanged, notify }: {
  cases: OverviewCase[]; session: Session; onOpenCase: (id: number) => void; onChanged: () => void; notify: Notify;
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

/** Calls: the learners waiting for a call back, and every call made with what it did. */
export function CallsPage({ overview, session, onOpenCase }: { overview: Overview; session: Session; onOpenCase: (id: number) => void }) {
  return (
    <div className="dd">
      <MissedCalls session={session} revision={overview.generated_at} onOpenCase={onOpenCase} />
      <CallLog agentId={null} manager revision={overview.generated_at} onOpen={onOpenCase} />
    </div>
  );
}

/** Call quality: AI suggestions to decide, calls rated bad, calls Zoom did not record, and transcript search. */
export function QualityPage({ overview, session, onOpenCase, onChanged, notify }: {
  overview: Overview; session: Session; onOpenCase: (id: number) => void; onChanged: () => void; notify: Notify;
}) {
  const [flag, setFlag] = useState<CallFlag | null>(null);
  const flags = overview.call_reviews?.flags || [];
  const waiting = overview.cases.filter(c => c.status === 'ai_suggested_close');
  return (
    <div className="dd">
      {(overview.connections.ai || waiting.length > 0) && (
        <WaitingForManager cases={waiting} session={session} onOpenCase={onOpenCase} onChanged={onChanged} notify={notify} />
      )}
      <section className="ec-card">
        <div className="ec-head">
          <div><h2>Calls rated bad</h2><p className="ec-muted">The AI rates each call transcript excellent, good or bad as it arrives. Calls rated bad are listed here with what went wrong and what to change. AI findings require a human review.</p></div>
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
      </section>
      <MissingRecordings revision={overview.generated_at} />
      <TranscriptSearch manager />
      <CallReviewDialog call={flag} onClose={() => setFlag(null)} />
    </div>
  );
}

/** The calling register: where every open case stands, then the full list to filter and open. */
export function CasesPage({ overview, onOpenCase }: { overview: Overview; onOpenCase: (id: number) => void }) {
  const load = caseload(overview.cases);
  return (
    <div className="dd">
      <div className="dd-figures">
        <Figure label="Open cases" value={load.open} hint={overview.cases_truncated ? 'List truncated' : 'Across the calling register'} />
        <Figure label="Due to call now" value={load.due} hint="Not waiting on a call-back, promise or evidence" />
        <Figure label="Past their call date" value={load.late} tone={load.late ? 'bad' : undefined} hint="The call was due before today" />
        <Figure label="In the shared queue" value={load.unallocated} hint="Not allocated to a specialist" />
        <Figure label="Waiting for the learner" value={load.waiting} hint="Call-back booked or a promise running" />
        <Figure label="Last call not answered" value={load.missed} hint="At the bottom of their list" />
      </div>
      <Register overview={overview} onOpenCase={onOpenCase} />
    </div>
  );
}

/** Weekly scorecards for every specialist, and the monthly report to download. */
export function ScorecardsPage({ overview }: { overview: Overview }) {
  const [report, setReport] = useState(false);
  const totals = monthTotals(overview.agents);
  return (
    <div className="dd">
      <section className="ec-card dd-report">
        <div>
          <h2>Monthly report · {overview.month}</h2>
          <p className="ec-muted">{totals.attempts} calls, {duration(totals.seconds)} of talk time and {totals.resolved} cases resolved, per specialist. Change the month on the Overview.</p>
        </div>
        <button type="button" className="primary" onClick={() => setReport(true)}>Open the monthly report</button>
      </section>
      <Scorecard manager revision={overview.generated_at} />
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
    </div>
  );
}
