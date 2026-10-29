import { useState } from 'react';
import type { CallFlag, Overview } from '../api';
import { useCallCentre } from '../api';
import type { Session } from './actions';
import { CallReviewDialog } from './CallReview';
import DeskProgress, { NowOn } from './DeskProgress';
import CallLog from './CallLog';
import { Bars, CallsByDay, QualityStrip, TalkByDay } from './charts';
import { byReason, caseload, firstName, monthTotals, ranked, rate } from './dashboard';
import { Figure } from './DirectorHome';
import type { Go } from './DirectorHome';
import type { Live } from './live';
import { liveSeconds } from './live';
import MissedCalls from './MissedCalls';
import { duration, when } from './model';
import type { DeskWork } from './model';
import { Scorecard } from './Scorecard';
import Switchboard from './Switchboard';

/** Every specialist at a glance: today against target and the month so far. Each card opens their page. */
export function SpecialistIndex({ overview, live, now, go }: { overview: Overview; live: Live | null; now: number; go: Go }) {
  const reviews = overview.call_reviews?.agents || {};
  // Today's work of every specialist, for each one's list progress.
  const progress = useCallCentre<{ day: string; worked: DeskWork[] }>('desk-progress/');
  return (
    <div className="dd">
      <div className="dd-people">
        {ranked(overview.agents).map(agent => {
          const today = agent.today.seconds + liveSeconds(live?.calls, agent.id, now);
          const share = agent.target_seconds ? Math.min(1, today / agent.target_seconds) : 0;
          const mine = caseload(overview.cases.filter(c => c.allocated_agent_id === agent.id));
          const presence = live?.presence?.agents[String(agent.id)];
          return (
            <button key={agent.id} type="button" className="dd-person" onClick={() => go('specialist', { agent: String(agent.id) })}>
              <span className="dd-person-head">
                <strong>{agent.display_name}</strong>
                <span>{presence?.label || 'Status unknown'}</span>
              </span>
              <span className="dd-person-today">
                <span className="dd-meter light" aria-hidden="true"><span className={`dd-meter-fill${share >= 1 ? ' met' : ''}`} style={{ width: `${share * 100}%` }} /></span>
                <small>{duration(today)} of {duration(agent.target_seconds)} today</small>
              </span>
              <NowOn overview={overview} agentId={agent.id} worked={progress.data?.worked} />
              <span className="dd-person-figures">
                <span><b>{agent.month.attempts}</b>calls</span>
                <span><b>{rate(agent.month.connected, agent.month.attempts) ?? '—'}{agent.month.attempts ? '%' : ''}</b>answered</span>
                <span><b>{duration(agent.month.seconds)}</b>talk</span>
                <span><b>{mine.open}</b>open cases</span>
              </span>
              <QualityStrip counts={reviews[agent.id]} />
            </button>
          );
        })}
        {!overview.agents.length && <p className="dd-empty">No active specialists yet. Add one under Zoom Phone.</p>}
      </div>
    </div>
  );
}

/** One specialist up close: live now, the month in figures and graphs, call quality, their caseload, their week, the
 * learners waiting for their call back, and every call they made. */
export function SpecialistPage({ overview, agentId, live, now, go, session, onOpenCase, onPreview }: {
  overview: Overview; agentId: number; live: Live | null; now: number; go: Go; session: Session;
  onOpenCase: (id: number) => void; onPreview: (id: number) => void;
}) {
  const [flag, setFlag] = useState<CallFlag | null>(null);
  const progress = useCallCentre<{ day: string; worked: DeskWork[] }>('desk-progress/');
  const agent = overview.agents.find(item => item.id === agentId);
  if (!agent) {
    return (
      <div className="dd">
        <p className="dd-empty">This specialist is not active any more.</p>
        <button type="button" onClick={() => go('specialists')}>All specialists</button>
      </div>
    );
  }
  const order = ranked(overview.agents);
  const position = order.findIndex(item => item.id === agent.id) + 1;
  const totals = monthTotals([agent]);
  const mine = overview.cases.filter(c => c.allocated_agent_id === agent.id);
  const load = caseload(mine);
  const flags = (overview.call_reviews?.flags || []).filter(item => item.agent_id === agent.id);
  const name = firstName(agent.display_name);

  return (
    <div className="dd">
      <nav className="dd-crumbs" aria-label="Specialists">
        <button type="button" onClick={() => go('specialists')}>← All specialists</button>
        <span className="dd-crumbs-others">
          {order.filter(item => item.id !== agent.id).map(item => (
            <button key={item.id} type="button" onClick={() => go('specialist', { agent: String(item.id) })}>{item.display_name}</button>
          ))}
        </span>
      </nav>
      <header className="dd-person-title">
        <div>
          <p className="dd-eyebrow">Specialist{agent.zoom_phone_number ? ` · ${agent.zoom_phone_number}` : ''}</p>
          <h2>{agent.display_name}</h2>
          <p className="dd-muted">
            {order.length > 1 ? `Ranked ${position} of ${order.length} by talk time this month · ` : ''}
            {agent.sync.last_success_at ? `Zoom checked ${when(agent.sync.last_success_at)}` : 'Zoom not checked yet'}
          </p>
        </div>
        <div className="ec-buttons">
          <button type="button" className="primary" onClick={() => onPreview(agent.id)}>See {name}’s desk</button>
        </div>
      </header>
      {(agent.sync.error || agent.sync.recordings_error) && (
        <p className="ec-alert" role="alert">Zoom: {agent.sync.error || agent.sync.recordings_error}</p>
      )}

      <Switchboard agents={[agent]} live={live} now={now} title="Now" />
      <DeskProgress overview={overview} agentId={agent.id} name={name} worked={progress.data?.worked} error={progress.error} onOpenCase={onOpenCase} />

      <section className="dd-section" aria-labelledby="dd-their-month">
        <header className="dd-section-head">
          <div><p className="dd-eyebrow">The month so far</p><h2 id="dd-their-month">{name}’s calls</h2></div>
        </header>
        <div className="dd-figures">
          <Figure label="Calls made" value={totals.attempts} hint={`${totals.connected} answered`} />
          <Figure label="Answer rate" value={totals.answerRate === null ? '—' : `${totals.answerRate}%`} hint="Answered of calls made" />
          <Figure label="Talk time" value={duration(totals.seconds)} hint={`Target ${duration(agent.target_seconds)} a day`} />
          <Figure label="Learners reached" value={totals.learners} />
          <Figure label="Cases resolved" value={totals.resolved} hint={`${agent.month.pending} worked, still open`} />
        </div>
        <div className="dd-pair">
          <article className="dd-panel">
            <h3>Talk time per day</h3>
            <p className="dd-muted">The gold line is {name}’s daily target.</p>
            <TalkByDay agents={[agent]} />
          </article>
          <article className="dd-panel">
            <h3>Calls per day</h3>
            <p className="dd-muted">Answered, and not answered.</p>
            <CallsByDay agents={[agent]} />
          </article>
        </div>
      </section>

      <section className="dd-section" aria-labelledby="dd-their-cases">
        <header className="dd-section-head">
          <div><p className="dd-eyebrow">Learners allocated to {name}</p><h2 id="dd-their-cases">Caseload and quality</h2></div>
        </header>
        <div className="dd-trio">
          <article className="dd-panel">
            <h3>Why they are on the list</h3>
            <Bars label={`${name}'s open cases by reason`} rows={byReason(mine).slice(0, 8)} />
            <p className="dd-total"><b>{load.open}</b> open cases</p>
          </article>
          <article className="dd-panel">
            <h3>Where the cases stand</h3>
            <Bars label={`${name}'s open cases by stage`} tone="teal" rows={[
              { key: 'due', label: 'Due to call now', value: load.due },
              { key: 'late', label: 'Past their call date', value: load.late },
              { key: 'waiting', label: 'Waiting for the learner', value: load.waiting },
              { key: 'missed', label: 'Last call not answered', value: load.missed },
              { key: 'promises', label: 'Promise broken', value: load.promises },
            ]} />
          </article>
          <article className="dd-panel">
            <h3>Call quality this month</h3>
            <div className="dd-team-quality"><QualityStrip counts={overview.call_reviews?.agents[agent.id]} /></div>
            {flags.length > 0 ? (
              <ul className="dd-flags">
                {flags.slice(0, 4).map(item => (
                  <li key={item.recording_id}>
                    <button type="button" onClick={() => setFlag(item)}>
                      <span>{when(item.started_at)}</span>{item.went_wrong[0] || item.summary || 'Rated bad'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="dd-muted">No calls rated bad this month.</p>}
          </article>
        </div>
      </section>

      <Scorecard manager revision={overview.generated_at} agentId={agent.id} />
      <MissedCalls session={session} revision={overview.generated_at} onOpenCase={onOpenCase} agentId={agent.id} />
      <div className="dd-log"><CallLog agentId={agent.id} manager revision={overview.generated_at} onOpen={onOpenCase} /></div>
      <CallReviewDialog call={flag} onClose={() => setFlag(null)} />
    </div>
  );
}
