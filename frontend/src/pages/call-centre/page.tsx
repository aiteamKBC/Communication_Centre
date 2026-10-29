import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearAuthStorage, readStoredAuthUser } from '../../utils/authStorage';
import { useCallCentre } from './api';
import type { Config, Overview, OverviewCase } from './api';
import type { Session } from './engagement/actions';
import Allocation from './engagement/Allocation';
import BookingLinksView from './engagement/BookingLinksView';
import CoachPages from './engagement/CoachPages';
import LearnerWorkspace from './engagement/LearnerWorkspace';
import Connections from './engagement/Connections';
import Desk from './engagement/Desk';
import { CallsPage, ScorecardsPage } from './engagement/Director';
import DirectorHome from './engagement/DirectorHome';
import DoNotCall from './engagement/DoNotCall';
import EmployerSpecialists from './engagement/EmployerSpecialists';
import Imports from './engagement/Imports';
import { useLive } from './engagement/live';
import type { InboundListing } from './engagement/inbound';
import { deskLayout, deskSection, deskTopics, failingSources, human, listsTotal, longDate, setHolidays } from './engagement/model';
import MissedCalls from './engagement/MissedCalls';
import RequestCall from './engagement/RequestCall';
import ReviewMeetings from './engagement/ReviewMeetings';
import Settings from './engagement/Settings';
import TaskDelegation from './engagement/TaskDelegation';
import Shell from './engagement/Shell';
import type { NavGroup } from './engagement/Shell';
import { MissingRecordings } from './engagement/Scorecard';
import { SpecialistIndex, SpecialistPage } from './engagement/Specialists';
import ZoomPhone from './engagement/ZoomPhone';
import './styles/engagement.css';
import './styles/director.css';
import './styles/desk.css';
import './styles/full-case.css';

// The director's dashboard: watching the team, the calls and cases themselves, and setting things up.
const DIRECTOR_NAV: [string, [string, string, string][]][] = [
  ['Monitor', [['director', 'Overview', 'grid'], ['specialists', 'Specialists', 'people'], ['scorecards', 'Scorecards', 'chart'],
    ['meetings', 'Review meetings', 'calendar']]],
  ['Calls', [['calls', 'Calls', 'clock'], ['missed', 'Missed calls & voicemails', 'message'], ['delegation', 'Task delegation', 'people'],
    ['operator', 'Calling desk', 'phone']]],
  ['Setup', [['phone', 'Zoom Phone', 'settings'], ['allocations', 'Learner allocation', 'book'], ['bookings', 'Coach booking links', 'calendar'],
    ['settings', 'Settings', 'check']]],
];
const TITLES: Record<string, string> = {
  director: 'Overview', specialists: 'Specialists', specialist: 'Specialists', scorecards: 'Scorecards', calls: 'Calls',
  bookings: 'Coach booking links', allocations: 'Learner allocation',
  phone: 'Zoom Phone', settings: 'Settings', meetings: 'Review meetings', missed: 'Missed calls & voicemails',
  delegation: 'Task delegation',
};
// Pages folded into another: Import & export and Connections & rules sit in Settings, call quality in Calls.
const MOVED: Record<string, string> = { imports: 'settings', connections: 'settings', quality: 'calls', cases: 'director' };
const LIVE_VIEWS = new Set(['director', 'specialists', 'specialist']);

function signOut(navigate: ReturnType<typeof useNavigate>) {
  const user = readStoredAuthUser();
  const body = JSON.stringify({
    trackingSessionId: String(user?.trackingSessionId || ''), userId: String(user?.id || ''),
    email: String(user?.email || ''), username: String(user?.username || ''), reason: 'logout_button',
  });
  void fetch('/api/auth/logout/', { method: 'POST', keepalive: true, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body }).catch(() => undefined);
  clearAuthStorage();
  navigate('/login', { replace: true });
}

/** The Engagement Centre: the director workspace and each specialist's calling desk. */
export default function CallCentrePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const month = params.get('month') || '';
  const config = useCallCentre<Config>('config/', false);
  const overviewState = useCallCentre<Overview>(`overview/${month ? `?month=${month}` : ''}`);
  const overview = overviewState.data;
  // The quick follow-up dates skip the bank holidays the server knows.
  setHolidays(overview?.holidays);

  const setParam = useCallback((changes: Record<string, string | null>) => {
    setParams(current => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)));
      return next;
    });
    setMessage(null);
  }, [setParams]);

  const notify = useCallback((text: string, error = false) => setMessage({ text, error }), []);
  const refresh = overviewState.refresh;

  useEffect(() => {
    if (overviewState.error && overview) setMessage({ text: `Could not refresh: ${overviewState.error} Showing the last loaded list.`, error: true });
  }, [overviewState.error, overview]);
  useEffect(() => {
    if (config.error && config.status !== 401) setMessage({ text: `The Engagement Centre settings could not load (${config.error}). Saving will fail until you reload the page.`, error: true });
  }, [config.error, config.status]);

  const role = overview?.access.role;
  const director = role === 'director';
  const asked = params.get('view') || 'director';
  const view = director ? MOVED[asked] || asked : params.get('view') === 'phone' ? 'phone' : 'operator';
  const inDesk = view === 'operator';
  const caseId = director && params.get('case') ? Number(params.get('case')) : null;
  const specialistId = Number(params.get('agent')) || null;
  // The board's live state (who is on a call, ringing, free), asked only while a page that shows it is open.
  const { live, now } = useLive(5000, director && !caseId && LIVE_VIEWS.has(view));

  const ownAgent = overview?.access.agent_id ?? null;
  const deskAgentId = director ? Number(params.get('operator')) || ownAgent || overview?.agents[0]?.id || null : ownAgent;
  // With employer specialists chosen, they make the employer calls only, and everyone else none of them.
  const team = useMemo(() => overview?.employer_specialists || [], [overview]);
  const employerDesk = deskAgentId !== null && team.includes(deskAgentId);
  const layout = useMemo(() => deskLayout({ employer_specialists: team }, deskAgentId), [team, deskAgentId]);
  const { section, page: deskPage } = deskSection(params.get('section'), layout);
  const deskAgent = overview?.agents.find(agent => agent.id === deskAgentId);
  const session: Session = useMemo(() => {
    const isManager = !!overview && (overview.access.role === 'director');
    const csrf = config.data?.csrf_token || '';
    const self = overview?.access.display_name || '';
    const helpdesk = !!config.data?.helpdesk;
    if (!inDesk) return { csrf, agentId: ownAgent, canAct: !!ownAgent || isManager, isManager, preview: false, name: self, helpdesk };
    const own = deskAgentId !== null && deskAgentId === ownAgent;
    const preview = role === 'viewer' || (!own && !isManager);
    return { csrf, agentId: preview ? null : deskAgentId, canAct: !preview, isManager, preview, name: deskAgent?.display_name || self, ownDesk: own, helpdesk, employerDesk };
  }, [config.data, overview, inDesk, deskAgentId, deskAgent, ownAgent, role, employerDesk]);

  const email = overview?.access.email || String(readStoredAuthUser()?.email || '');
  // A specialist's desk holds their allocated learners plus the shared queue; with employer specialists chosen, theirs
  // holds the employer calls only and everyone else's none. A director's task adds the learners it gives them, whoever
  // owns them (`task`, and their other cases that come along on the call); a case covered by someone else stays on its
  // owner's lists read-only (`covered`).
  const deskOverview = useMemo(() => {
    if (!overview || !deskAgentId) return overview;
    // A missing employer signature is an employer call: on the employer specialists' desk, off the others'.
    const onDesk = (c: OverviewCase) => (!c.allocated_agent_id || c.allocated_agent_id === deskAgentId)
      && (!team.length || (employerDesk
        ? c.source_type === 'employer_feedback' || !!c.optional || (c.source_type === 'signature' && !!c.employer_signature_missing)
        : c.source_type !== 'employer_feedback' && !c.optional
          && (c.source_type !== 'signature' || !!c.learner_signature_missing)));
    const cases = overview.cases.flatMap((c): OverviewCase[] => {
      if (c.cover && c.cover.to_agent_id === deskAgentId) return [{ ...c, desk: c.cover.direct ? 'task' : onDesk(c) ? 'own' : 'call' }];
      return onDesk(c) ? [{ ...c, desk: c.cover?.direct ? 'covered' : 'own' }] : [];
    });
    return { ...overview, cases };
  }, [overview, deskAgentId, team, employerDesk]);
  // The desk's lists in calling order, with the tasks given to it where the director placed them.
  const topics = useMemo(() => deskTopics(layout.lists, overview?.tasks, deskAgentId), [layout.lists, overview?.tasks, deskAgentId]);

  // Who rang the desk's specialist and is still waiting: the Missed calls count and the Today page's call-backs.
  const rangState = useCallCentre<InboundListing>(overview && (inDesk || !director) && (session.canAct || director)
    ? `inbound/?kind=callback&status=open&days=90${director && deskAgentId ? `&agent_id=${deskAgentId}` : ''}` : null);
  const refreshRang = rangState.refresh;
  useEffect(() => { refreshRang(); }, [overview?.generated_at, refreshRang]);
  const rangOpen = rangState.data?.summary?.open || 0;

  const deskItems = !deskOverview ? [] : layout.pages.map(([key, label, icon]) => ({
    key: `desk:${key}`, icon,
    label: key === 'lists' ? `${label} (${listsTotal(deskOverview, layout, topics)})` : key === 'rang' && rangOpen ? `${label} (${rangOpen})` : label,
  }));
  const groups: NavGroup[] = !overview || !deskOverview ? [] : inDesk
    ? [
      { title: 'My calling day', items: deskItems },
      ...(director ? [{ title: 'Director', items: [{ key: 'exit', label: 'Return to director', icon: 'back' }] }]
        : [{ title: 'Engagement', items: [{ key: 'view:phone', label: 'Zoom Phone', icon: 'settings' }] }]),
    ]
    : director ? DIRECTOR_NAV.map(([title, items]) => ({ title, items: items.map(([key, label, icon]) => ({ key: `view:${key}`, label, icon })) }))
      : [
        { title: 'My calling day', items: deskItems },
        { title: 'Engagement', items: [{ key: 'view:phone', label: 'Zoom Phone', icon: 'settings' }] },
      ];
  const activeKey = inDesk ? `desk:${deskPage}` : `view:${view === 'specialist' ? 'specialists' : view}`;

  function navigateTo(key: string) {
    if (key === 'exit') setParam({ view: null, operator: null, section: null, case: null });
    else if (key.startsWith('desk:')) setParam(director ? { section: key.slice(5) } : { view: null, section: key.slice(5) });
    else if (key.startsWith('view:')) go(key.slice(5));
  }

  function go(next: string, extra: Record<string, string> = {}) {
    setParam({ view: next === 'director' ? null : next, case: null, section: null, agent: extra.agent ?? null });
    window.scrollTo({ top: 0 });
  }

  const openCase = (id: number) => setParam({ case: String(id) });

  const status = <div className="ec-status" role="status" aria-live="polite" style={message?.error ? { color: '#963e48' } : undefined}>{message?.text || ''}</div>;

  let content;
  if (overviewState.status === 401 || config.status === 401) {
    content = (
      <div className="staff-empty">
        <h2>Please sign in again</h2>
        <p>The Engagement Centre needs a fresh sign-in to confirm who you are.</p>
        <button type="button" className="staff-button" onClick={() => signOut(navigate)}>Sign in</button>
      </div>
    );
  } else if (!overview) {
    content = overviewState.error
      ? <div role="alert"><p>{overviewState.error}</p><button type="button" onClick={refresh}>Try again</button></div>
      : <p>Loading your Engagement Centre…</p>;
  } else if (inDesk && deskOverview) {
    content = (
      <div id="engagement-centre" className="ec ed">
        {failingSources(overview).length > 0 && <p className="ec-alert" role="alert">
          Some data sources are unavailable ({failingSources(overview).map(source => human(source.name.replace(/^source:/, ''))).join(', ')}).
          {' '}Lists may be incomplete; existing cases have been retained. Ask a manager to check Connections.
        </p>}
        {(!overview.cycle?.last_success_at || Date.now() - Date.parse(overview.cycle.last_success_at) > 30 * 60 * 1000) &&
          <p className="ec-alert" role="alert">Synchronization is overdue or has not completed. Refresh only reloads saved cases; it does not run synchronization.</p>}
        {overview.cases_truncated && <p className="ec-alert" role="alert">The case list is truncated. These counters do not include every case.</p>}
        {role === 'viewer' && <p className="ec-alert">Ask a manager to set up your agent profile to call learners and record outcomes. This calling workspace is read-only until then.</p>}
        <Desk
          overview={deskOverview} agent={deskAgent} session={session} section={section} page={deskPage} lists={topics}
          rang={rangState.data}
          name={deskAgent?.display_name || overview.access.display_name} status={status}
          onSection={key => setParam({ section: key })} onExit={director && session.preview ? () => navigateTo('exit') : undefined}
          onRefresh={refresh} onMonth={value => setParam({ month: value })} notify={notify}
        />
      </div>
    );
  } else {
    content = (
      <div id="engagement-centre" className="ec">
        <div className="ec-head">
          <div>
            <div className="ec-eyebrow">Kent Business College · Engagement{director ? ' · Director' : ''}</div>
            <h1>{caseId ? 'Learner call workspace' : TITLES[view] || 'Make every conversation count'}</h1>
            <div className="ec-muted">{longDate(overview.today)} · {overview.access.display_name}</div>
          </div>
          <div className="ec-buttons">
            {caseId && <button type="button" onClick={() => setParam({ case: null })}>← Back</button>}
            {!director && <button type="button" onClick={() => setParam({ view: null })}>← Calling workspace</button>}
            {director && <button type="button" className="primary" onClick={() => setRequesting(true)}>+ Request a call</button>}
            <button type="button" onClick={refresh}>Refresh</button>
          </div>
        </div>
        {status}
        <div id="ec-body">
          {caseId ? (
            <LearnerWorkspace key={caseId} id={caseId} overview={overview} session={session}
              onSaved={text => { notify(text); refresh(); }} notify={notify} onRefresh={refresh} />
          ) : view === 'allocations' ? (
            <>
              <EmployerSpecialists session={session} onChanged={refresh} notify={notify} />
              <DoNotCall session={session} onChanged={refresh} notify={notify} />
              <Allocation csrf={config.data?.csrf_token || ''} employerSpecialists={team} onWorkspace={id => setParam({ view: 'operator', operator: String(id) })} />
            </>
          ) : view === 'phone' ? (
            <>
              <ZoomPhone overview={overview} csrf={config.data?.csrf_token || ''} isManager={director} />
              {director && <MissingRecordings revision={overview.generated_at} />}
            </>
          )
            : view === 'bookings' ? <><BookingLinksView overview={overview} /><CoachPages csrf={config.data?.csrf_token || ''} onSaved={refresh} /></>
              : view === 'settings' ? (
                <>
                  <Settings csrf={config.data?.csrf_token || ''} />
                  <Connections overview={overview} />
                  <Imports overview={overview} onAllocate={() => go('allocations')} />
                </>
              ) : view === 'specialists' ? <SpecialistIndex overview={overview} live={live} now={now} go={go} />
                : view === 'specialist' && specialistId ? (
                  <SpecialistPage overview={overview} agentId={specialistId} live={live} now={now} go={go} session={session}
                    onOpenCase={openCase} onPreview={id => setParam({ view: 'operator', operator: String(id), section: null, agent: null })} />
                ) : view === 'scorecards' ? <ScorecardsPage overview={overview} />
                  : view === 'meetings' ? <ReviewMeetings today={overview.today} />
                  : view === 'delegation' ? <TaskDelegation overview={overview} csrf={config.data?.csrf_token || ''} onChanged={refresh} notify={notify} />
                  : view === 'missed' ? <MissedCalls session={session} revision={overview.generated_at} onOpenCase={openCase} />
                  : view === 'calls' ? <CallsPage overview={overview} session={session} onOpenCase={openCase} onChanged={refresh} notify={notify} />
                    : <DirectorHome overview={overview} live={live} now={now} go={go} onMonth={value => setParam({ month: value })} />}
        </div>
        {director && (
          <RequestCall
            open={requesting} csrf={config.data?.csrf_token || ''} today={overview.today} onClose={() => setRequesting(false)}
            onCreated={text => { notify(text); refresh(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="kbc-portals">
      <Shell
        title="Engagement Centre" email={email} groups={groups}
        active={activeKey}
        onNavigate={navigateTo}
        onSignOut={() => signOut(navigate)}
      >
        {content}
      </Shell>
    </div>
  );
}
