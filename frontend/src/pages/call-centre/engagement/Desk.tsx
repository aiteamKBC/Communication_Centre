import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AgentStats, Overview } from '../api';
import type { Session } from './actions';
import BookingLinksView from './BookingLinksView';
import CallLearner from './CallLearner';
import CallLog from './CallLog';
import { MyCallReviews } from './CallReview';
import CallSheet from './CallSheet';
import CaseFilters, { EMPTY_CASE_FILTERS, matchesCaseFilters } from './CaseFilters';
import Dialog from './Dialog';
import LearnerPanel from './LearnerPanel';
import LearnerWorkspace from './LearnerWorkspace';
import NextCall from './NextCall';
import MonthlyHistory from './MonthlyHistory';
import {
  CALL_TABS, DESK_MENUS, ISSUE_LABELS, casePurpose, activeCase, badges, contactKey, downloadBlob, dueForCall,
  duration, human, issueLabel, longDate, matchesSearch, points, ratedCalls, shortDate, uniqueLearners,
} from './model';

type Props = {
  overview: Overview; agent: AgentStats | undefined; session: Session; section: string; name: string; status: ReactNode;
  onSection: (key: string) => void; onExit?: () => void; onRefresh: () => void; onMonth: (month: string) => void;
  notify: (message: string, error?: boolean) => void;
};

function ProgressStrip({ agent, overview }: { agent: AgentStats | undefined; overview: Overview }) {
  const today = agent?.today || { attempts: 0, connected: 0, seconds: 0 };
  const target = agent?.target_seconds || 0;
  const reviews = agent ? overview.call_reviews?.agents[agent.id] : undefined;
  return (
    <div className="ed-score">
      <div className="ed-target">
        <span title="Only Zoom-verified calls started from this system count.">Connected call time</span>
        <strong>{duration(today.seconds)} <small>/ {duration(target)}</small></strong>
        <progress max={target || 1} value={Math.min(today.seconds, target || 1)} aria-label="Daily connected call time" />
      </div>
      <div><span>Connections</span><strong>{today.connected}</strong></div>
      <div><span>Points today</span><strong>{points(today, target)}<small> / 300</small></strong></div>
      <div><span>Call quality this month</span>{reviews && ratedCalls(reviews)
        ? <strong>{reviews.excellent} <small>excellent ·</small> {reviews.good} <small>good ·</small> {reviews.bad} <small>bad</small></strong>
        : <strong>Unscored<small>{today.attempts} calls today</small></strong>}</div>
    </div>
  );
}

/** The operator's calling day: category call sheets, learner workspaces, progress and reports. */
export default function Desk({ overview, agent, session, section, name, status, onSection, onExit, onRefresh, onMonth, notify }: Props) {
  const [tabs, setTabs] = useState<number[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [caseFilters, setCaseFilters] = useState({ ...EMPTY_CASE_FILTERS });
  const [issue, setIssue] = useState('all');
  const [focus, setFocus] = useState(false);
  const [advance, setAdvance] = useState(true);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDetailId(null);
    setFocus(false);
    setTouched(new Set());
  }, [section]);

  // Follow-ups: only the cases whose current follow-up was set by this specialist's own call.
  const active = useMemo(() => overview.cases.filter(c => activeCase(c)
    && (section !== 'followups' || (!!session.agentId && c.followup_agent_id === session.agentId))),
  [overview.cases, section, session.agentId]);
  const queue = useMemo(() => uniqueLearners(active.filter(c => (issue === 'all' || c.source_type === issue)
    && !touched.has(contactKey(c)) && matchesSearch(c, search) && matchesCaseFilters(c, caseFilters))),
  [active, issue, touched, search, caseFilters]);
  const currentCase = overview.cases.find(c => c.id === current);

  function open(id: number) {
    if (!tabs.includes(id) && tabs.length >= 6) {
      notify('Close a learner tab before opening another. Your unsaved notes stay in their current tabs.', true);
      return;
    }
    setTabs(list => (list.includes(id) ? list : [...list, id]));
    setCurrent(id);
  }

  function closeTab(id: number) {
    const rest = tabs.filter(item => item !== id);
    setTabs(rest);
    if (current === id) setCurrent(rest[rest.length - 1] ?? null);
  }

  function next() {
    const key = currentCase ? contactKey(currentCase) : null;
    const following = queue.find(c => contactKey(c) !== key);
    if (following) open(following.id);
    else {
      setCurrent(null);
      notify('You have reached the end of this list.');
    }
  }

  function saved(message: string) {
    notify(message);
    onRefresh();
    if (focus && advance && currentCase) {
      setTouched(set => new Set(set).add(contactKey(currentCase)));
      closeTab(currentCase.id);
      next();
    }
  }

  const tab = CALL_TABS.find(item => item.key === section);
  const panels = (
    <>
      {tabs.map(id => (
        <LearnerPanel key={id} id={id} hidden={id !== current} overview={overview} session={session} onOpen={open} onNext={next}
          hasNext={queue.some(c => c.id !== id)} onSaved={saved} notify={notify} onRefresh={onRefresh} />
      ))}
    </>
  );

  let body: ReactNode;
  if (section === 'next') {
    body = <NextCall overview={overview} session={session} onRefresh={onRefresh} notify={notify} onOpen={setDetailId} />;
  } else if (tab) {
    body = <CallSheet key={tab.key} overview={overview} tab={tab} session={session} onOpen={setDetailId} onSaved={onRefresh} notify={notify} />;
  } else if (section === 'learners') {
    body = <CallLearner overview={overview} session={session} notify={notify} onRefresh={onRefresh} />;
  } else if (section === 'calls') {
    body = <CallLog agentId={session.agentId} revision={overview.generated_at} onOpen={setDetailId} />;
  } else if (section === 'bookings') {
    body = <BookingLinksView overview={overview} />;
  } else if (section === 'history') {
    body = null;
  } else if (section === 'progress') {
    const today = agent?.today || { attempts: 0, connected: 0, seconds: 0 };
    const earned = badges(today, agent?.target_seconds || 0);
    body = (
      <>
        <section className="ec-card">
          <h2>Build a strong calling day</h2>
          <div className="ed-badges">
            {[['Call-time target', `${duration(agent?.target_seconds)} of verified connected calls`], ['Ten connections', '10 answered calls']].map(([badge, text]) => (
              <article key={badge} className={earned.includes(badge) ? 'earned' : ''}>
                <span>{earned.includes(badge) ? '★ Earned' : '☆ In progress'}</span><h3>{badge}</h3><p>{text}</p>
              </article>
            ))}
          </div>
          <details>
            <summary>How points are earned</summary>
            <p>Up to 100 points for reaching your call-time target, and 5 points per answered call up to 100.</p>
          </details>
          <p className="ec-muted">{agent ? 'Figures include only Zoom-verified calls started from this system.' : 'No agent profile is linked, so no telephone activity is shown. Zero recorded activity is not evidence that no work took place.'}</p>
        </section>
      </>
    );
  } else if (section === 'reviews') {
    body = <MyCallReviews agentId={agent?.id} month={overview.month} today={overview.today} onMonth={onMonth} />;
  } else if (section === 'reports') {
    const month = agent?.month;
    const download = () => {
      const rows = (month?.daily || []).map(d => `<tr><td>${d.day}</td><td>${d.attempts}</td><td>${d.connected}</td><td>${duration(d.seconds)}</td></tr>`).join('') || '<tr><td colspan="4">No verified call records for this month.</td></tr>';
      downloadBlob(new Blob([`<!doctype html><html lang="en-GB"><meta charset="utf-8"><title>My engagement report</title><style>body{font:16px/1.6 Arial,sans-serif;color:#29233c;max-width:1000px;margin:40px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}h1,h2{color:#563189}</style><h1>Kent Business College</h1><h2>${name.replace(/[<>&]/g, '')} · ${overview.month}</h2><p>Calls: ${month?.attempts || 0} · Answered: ${month?.connected || 0} · Connected time: ${duration(month?.seconds)}</p><table><thead><tr><th>Day</th><th>Calls</th><th>Answered</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table><p>Only Zoom-verified calls are included. Incomplete telephone coverage is not evidence of inactivity.</p><p>Prepared ${overview.generated_at}</p></html>`], { type: 'text/html' }), `KBC-My-Call-Report-${overview.month}.html`);
    };
    body = (
      <section className="ec-card">
        <div className="ec-head">
          <div><h2>My monthly activity</h2><p className="ec-muted">{name} · {overview.month}</p></div>
          <div className="ec-buttons">
            <label>Month<input type="month" value={overview.month} max={overview.today.slice(0, 7)} onChange={event => event.target.value && onMonth(event.target.value)} /></label>
            <button type="button" onClick={download}>Download my report</button>
          </div>
        </div>
        <div className="ed-report-totals">
          <span>Verified calls<strong>{month?.attempts || 0}</strong></span>
          <span>Connected time<strong>{duration(month?.seconds)}</strong></span>
          <span>Cases resolved<strong>{month?.resolved || 0}</strong></span>
        </div>
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Day</th><th>Calls</th><th>Answered</th><th>Time</th><th>Points</th></tr></thead>
            <tbody>
              {(month?.daily || []).filter(d => d.attempts).map(d => (
                <tr key={d.day}><td>{longDate(d.day)}</td><td>{d.attempts}</td><td>{d.connected}</td><td>{duration(d.seconds)}</td><td>{points(d, agent?.target_seconds || 0)}</td></tr>
              ))}
              {!month?.daily.some(d => d.attempts) && <tr><td colSpan={5}>No verified call activity in this month.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="ec-muted">Covers your own Zoom-verified calls started from this system only. Missing telephone coverage must not be treated as poor performance.</p>
      </section>
    );
  } else {
    body = (
      <>
        {focus && (
          <div className="ed-session">
            <div><strong>Focus session · Priority calls</strong><span>{touched.size} people worked through · {queue.length} remaining</span></div>
            <label><input type="checkbox" checked={advance} onChange={event => setAdvance(event.target.checked)} /> Open next learner after saving</label>
          </div>
        )}
        <div className="ed-desk">
          <aside className="ed-queue ec-card">
            <CaseFilters cases={active} value={caseFilters} onChange={setCaseFilters} />
            <div className="ed-filters">
              <input type="search" aria-label="Find a learner" placeholder="Find a learner…" value={search} onChange={event => setSearch(event.target.value)} />
              <select aria-label="Reason for calling" value={issue} onChange={event => setIssue(event.target.value)}>
                <option value="all">All call reasons</option>
                {Object.entries(ISSUE_LABELS).filter(([key]) => active.some(c => c.source_type === key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div id="ed-queue-list">
              <div className="ed-queue-heading"><strong>{queue.length} {section === 'followups' ? 'people with your follow-ups' : 'people with active cases'}</strong><span>Priority order</span></div>
              {queue.length ? queue.slice(0, 200).map(c => (
                <button key={c.id} className={`ed-person ${current === c.id ? 'selected' : ''}`} type="button" aria-pressed={current === c.id} onClick={() => open(c.id)}>
                  <span className="ed-person-name">{c.learner_name}</span>
                  <span>{issueLabel(c)}</span>
                  <small>{c.coach || 'Coach not recorded'} · {shortDate(c.next_followup_at || c.due_at)}</small>
                  <small>{human(c.status)}{dueForCall(c) ? ' · Due now' : ''}</small>
                </button>
              )) : <div className="ec-empty"><h3>No people in this list</h3><p>{section === 'followups' && !active.length
                ? 'Follow-ups you set when saving a call appear here.' : 'Try another reason or clear the search.'}</p></div>}
            </div>
          </aside>
          <section className="ed-work">
            <div className="ed-tabs" role="tablist" aria-label="Open learner workspaces">
              {tabs.map(id => {
                const c = overview.cases.find(item => item.id === id);
                return (
                  <div key={id} className={`ed-tab ${id === current ? 'active' : ''}`}>
                    <button type="button" role="tab" aria-selected={id === current} onClick={() => setCurrent(id)}>{c?.learner_name || `Case ${id}`}</button>
                    <button type="button" aria-label={`Close ${c?.learner_name || 'tab'}`} onClick={() => closeTab(id)}>×</button>
                  </div>
                );
              })}
            </div>
            {panels}
            {current === null && (
              <section className="ec-card ed-start">
                <p className="ec-eyebrow">One purposeful conversation at a time</p>
                <h2>{queue.length ? queue[0].learner_name : 'Your call desk is ready'}</h2>
                <p>{queue.length ? casePurpose(queue[0]) : 'Choose another list.'}</p>
                <button type="button" className="primary" disabled={!queue.length} onClick={next}>Open next learner</button>
                {!focus && <button type="button" disabled={!queue.length} onClick={() => { setFocus(true); setTouched(new Set()); if (current === null) next(); }}>Start focus session</button>}
                <p className="ec-muted">Each learner appears once in this list. Their other open issues stay together in the workspace.</p>
              </section>
            )}
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      {onExit && (
        <div className="ed-preview">
          <span><strong>Director preview · {name}</strong> · Calls and edits are disabled. {name} signs in with their own account to use this calling workspace.</span>
          <button type="button" onClick={onExit}>Return to director</button>
        </div>
      )}
      <header className="ed-head">
        <div><p className="ec-eyebrow">{longDate(overview.today)} · {name}</p><h1>{DESK_MENUS.find(item => item[0] === section)?.[1] || 'Call next'}</h1></div>
        <div className="ec-buttons">
          {section === 'followups' && (focus
            ? <button type="button" onClick={() => { setFocus(false); setTouched(new Set()); }}>End focus session</button>
            : <button type="button" disabled={!queue.length} onClick={() => { setFocus(true); setTouched(new Set()); if (current === null) next(); }}>Start focus session</button>)}
          <button type="button" onClick={onRefresh}>Refresh</button>
        </div>
      </header>
      {section !== 'history' && <ProgressStrip agent={agent} overview={overview} />}
      {status}
      {section === 'history' && <div>
        <MonthlyHistory key={session.agentId} agentId={session.agentId} today={overview.today}
          revision={overview.generated_at} onOpen={setDetailId} />
      </div>}
      {body}
      <Dialog open={detailId !== null} onClose={() => setDetailId(null)} title="Full case"
        className="ed-case-dialog" preservePosition>
        {detailId !== null && <LearnerWorkspace key={detailId} id={detailId} overview={overview} session={session}
          onSaved={message => { notify(message); onRefresh(); }} notify={notify} onRefresh={onRefresh} />}
      </Dialog>
    </>
  );
}
