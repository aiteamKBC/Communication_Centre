import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AgentStats, Overview } from '../api';
import type { Session } from './actions';
import BookingLinksView from './BookingLinksView';
import { CallsByDay, TalkByDay } from './charts';
import { monthTotals } from './dashboard';
import { Figure } from './DirectorHome';
import DeskToday from './DeskToday';
import type { InboundListing } from './inbound';
import CallLearner from './CallLearner';
import CallLog from './CallLog';
import { MyCallReviews } from './CallReview';
import CallSheet from './CallSheet';
import CaseFilters, { EMPTY_CASE_FILTERS, matchesCaseFilters } from './CaseFilters';
import Dialog from './Dialog';
import LearnerPanel from './LearnerPanel';
import LearnerWorkspace from './LearnerWorkspace';
import { IncomingBanner } from './LiveCalls';
import { liveSeconds, useLive } from './live';
import MissedCalls from './MissedCalls';
import MonthlyHistory from './MonthlyHistory';
import { MissingRecordings, Scorecard, TranscriptSearch } from './Scorecard';
import {
  CALL_TABS, DESK_PAGES, DOING_TABS, ISSUE_LABELS, casePurpose, activeCase, badges, contactKey, downloadBlob, dueForCall,
  duration, human, issueLabel, listCount, listLabel, longDate, matchesSearch, points, ratedCalls, shortDate, uniqueLearners, when,
} from './model';

type Props = {
  overview: Overview; agent: AgentStats | undefined; session: Session; section: string; page: string; lists: string[];
  rang: InboundListing | null; name: string; status: ReactNode; onSection: (key: string) => void; onExit?: () => void; onRefresh: () => void; onMonth: (month: string) => void;
  notify: (message: string, error?: boolean) => void;
};

function ProgressStrip({ agent, overview, onCall = 0 }: { agent: AgentStats | undefined; overview: Overview; onCall?: number }) {
  // Zoom-confirmed calls, plus the call in progress (Zoom's webhook) so the bar moves while the specialist talks.
  const confirmed = agent?.today || { attempts: 0, connected: 0, seconds: 0 };
  const today = { ...confirmed, seconds: confirmed.seconds + onCall };
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

/** The specialist's desk: Today (their line, who rang, the next call, their lists), the call lists as tabs, missed calls,
 * their calls, and How I'm doing (the week, the month, call reviews and achievements) as tabs. */
export default function Desk({ overview, agent, session, section, page, lists, rang, name, status, onSection, onExit, onRefresh, onMonth, notify }: Props) {
  const [tabs, setTabs] = useState<number[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { live, now } = useLive();
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
  if (section === 'today') {
    body = <DeskToday overview={overview} agent={agent} session={session} live={live} now={now} rang={rang} lists={lists}
      onSection={onSection} onOpen={setDetailId} onRefresh={onRefresh} notify={notify} />;
  } else if (tab) {
    body = <CallSheet key={tab.key} overview={overview} tab={tab} session={session} onOpen={setDetailId} onSaved={onRefresh} notify={notify} />;
  } else if (section === 'learners') {
    body = <CallLearner overview={overview} session={session} notify={notify} onRefresh={onRefresh} />;
  } else if (section === 'calls') {
    body = (
      <div className="dk-stack">
        <CallLog agentId={session.agentId} revision={overview.generated_at} onOpen={setDetailId} />
        <TranscriptSearch manager={false} />
        <MissingRecordings revision={overview.generated_at} />
      </div>
    );
  } else if (section === 'rang') {
    body = <MissedCalls session={session} revision={overview.generated_at} onOpenCase={setDetailId} agentId={session.isManager ? agent?.id : undefined} />;
  } else if (section === 'week') {
    body = <Scorecard manager={false} revision={overview.generated_at} />;
  } else if (section === 'bookings') {
    body = <BookingLinksView overview={overview} />;
  } else if (section === 'achievements') {
    const today = agent?.today || { attempts: 0, connected: 0, seconds: 0 };
    const earned = badges(today, agent?.target_seconds || 0);
    body = (
      <div className="dk-stack">
        <section className="ec-card">
          <h2>Today’s badges</h2>
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
        <MonthlyHistory key={session.agentId} agentId={session.agentId} today={overview.today} revision={overview.generated_at} onOpen={setDetailId} />
      </div>
    );
  } else if (section === 'reviews') {
    body = <MyCallReviews agentId={agent?.id} month={overview.month} today={overview.today} onMonth={onMonth} />;
  } else if (section === 'month') {
    const month = agent?.month;
    const totals = monthTotals(agent ? [agent] : []);
    const download = () => {
      const rows = (month?.daily || []).map(d => `<tr><td>${d.day}</td><td>${d.attempts}</td><td>${d.connected}</td><td>${duration(d.seconds)}</td></tr>`).join('') || '<tr><td colspan="4">No verified call records for this month.</td></tr>';
      downloadBlob(new Blob([`<!doctype html><html lang="en-GB"><meta charset="utf-8"><title>My engagement report</title><style>body{font:16px/1.6 Arial,sans-serif;color:#29233c;max-width:1000px;margin:40px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}h1,h2{color:#563189}</style><h1>Kent Business College</h1><h2>${name.replace(/[<>&]/g, '')} · ${overview.month}</h2><p>Calls: ${month?.attempts || 0} · Answered: ${month?.connected || 0} · Connected time: ${duration(month?.seconds)}</p><table><thead><tr><th>Day</th><th>Calls</th><th>Answered</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table><p>Only Zoom-verified calls are included. Incomplete telephone coverage is not evidence of inactivity.</p><p>Prepared ${overview.generated_at}</p></html>`], { type: 'text/html' }), `KBC-My-Call-Report-${overview.month}.html`);
    };
    body = (
      <div className="dd">
        <header className="dd-section-head">
          <div><p className="dd-eyebrow">{name} · {new Date(`${overview.month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p><h2>Your month in calls</h2></div>
          <div className="ec-buttons">
            <label>Month<input type="month" value={overview.month} max={overview.today.slice(0, 7)} onChange={event => event.target.value && onMonth(event.target.value)} /></label>
            <button type="button" onClick={download}>Download my report</button>
          </div>
        </header>
        <div className="dd-figures">
          <Figure label="Calls made" value={totals.attempts} hint={`${totals.connected} answered`} />
          <Figure label="Answer rate" value={totals.answerRate === null ? '—' : `${totals.answerRate}%`} hint="Answered of calls made" />
          <Figure label="Talk time" value={duration(totals.seconds)} hint={`Target ${duration(agent?.target_seconds)} a day`} />
          <Figure label="Learners reached" value={totals.learners} />
          <Figure label="Cases resolved" value={totals.resolved} hint={`${month?.pending || 0} worked, still open`} />
        </div>
        {agent && (
          <div className="dd-pair">
            <article className="dd-panel">
              <h3>Talk time per day</h3>
              <p className="dd-muted">The gold line is your daily target.</p>
              <TalkByDay agents={[agent]} />
            </article>
            <article className="dd-panel">
              <h3>Calls per day</h3>
              <p className="dd-muted">Answered, and not answered.</p>
              <CallsByDay agents={[agent]} />
            </article>
          </div>
        )}
        <p className="dd-muted">Covers your own Zoom-verified calls started from this system only. Missing telephone coverage must not be treated as poor performance.</p>
      </div>
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

  // My lists: one tab per list with its people; How I'm doing: the week, the month, call reviews and achievements.
  const pageTabs: [string, string][] | null = page === 'lists'
    ? lists.map(key => [key, `${listLabel(key)} (${listCount(overview, key, session.agentId)})`])
    : page === 'doing' ? DOING_TABS : null;

  return (
    <>
      {onExit && (
        <div className="ed-preview">
          <span><strong>Director preview · {name}</strong> · Calls and edits are disabled. {name} signs in with their own account to use this calling workspace.</span>
          <button type="button" onClick={onExit}>Return to director</button>
        </div>
      )}
      <header className="ed-head">
        <div><p className="ec-eyebrow">{longDate(overview.today)} · {name}</p><h1>{DESK_PAGES.find(item => item[0] === page)?.[1] || 'Today'}</h1></div>
        <div className="ec-buttons">
          {section === 'followups' && (focus
            ? <button type="button" onClick={() => { setFocus(false); setTouched(new Set()); }}>End focus session</button>
            : <button type="button" disabled={!queue.length} onClick={() => { setFocus(true); setTouched(new Set()); if (current === null) next(); }}>Start focus session</button>)}
          <span className="ec-muted dk-synced">Lists last updated {overview.cycle?.last_success_at ? `${when(overview.cycle.last_success_at)} (London)` : 'not recorded yet'}</span>
          <button type="button" onClick={onRefresh}>Refresh</button>
        </div>
      </header>
      {pageTabs && (
        <div className="dk-tabs" role="tablist" aria-label={page === 'lists' ? 'Your call lists' : 'How you are doing'}>
          {pageTabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={key === section} onClick={() => onSection(key)}>{label}</button>
          ))}
        </div>
      )}
      {(page === 'lists' || page === 'learners') && <ProgressStrip agent={agent} overview={overview} onCall={liveSeconds(live?.calls, session.agentId, now)} />}
      {status}
      {/* Opens the case over the page (the list and any form underneath stay as they are); never while one is open. */}
      <IncomingBanner live={live} now={now} agentId={session.agentId} busy={detailId !== null} onOpen={setDetailId} />
      {body}
      <Dialog open={detailId !== null} onClose={() => setDetailId(null)} title="Full case"
        className="ed-case-dialog" preservePosition>
        {detailId !== null && <LearnerWorkspace key={detailId} id={detailId} overview={overview} session={session}
          onSaved={message => { notify(message); onRefresh(); }} notify={notify} onRefresh={onRefresh} />}
      </Dialog>
    </>
  );
}
