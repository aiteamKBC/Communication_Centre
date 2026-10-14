import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearAuthStorage, readStoredAuthUser } from '../../utils/authStorage';
import { useCallCentre } from './api';
import type { Config, Overview } from './api';
import type { Session } from './engagement/actions';
import Allocation from './engagement/Allocation';
import BookingLinksView from './engagement/BookingLinksView';
import CoachPages from './engagement/CoachPages';
import CaseWorkspace from './engagement/CaseWorkspace';
import Connections from './engagement/Connections';
import Desk from './engagement/Desk';
import Director from './engagement/Director';
import Imports from './engagement/Imports';
import { DESK_MENUS, deskLabel, failingSources, human, longDate, setHolidays } from './engagement/model';
import RequestCall from './engagement/RequestCall';
import Settings from './engagement/Settings';
import Shell from './engagement/Shell';
import SmartEmbedPhone from './engagement/SmartEmbedPhone';
import type { NavGroup } from './engagement/Shell';
import ZoomPhone from './engagement/ZoomPhone';
import './styles/engagement.css';

const DIRECTOR_NAV: [string, string, string][] = [
  ['director', 'Director overview', 'chart'], ['operator', 'Calling workspace', 'phone'], ['bookings', 'Coach booking links', 'calendar'],
  ['allocations', 'Learner allocation', 'people'], ['imports', 'Import & export', 'upload'], ['phone', 'Zoom Phone', 'settings'],
  ['connections', 'Connections & rules', 'check'], ['settings', 'Settings', 'settings'],
];
const TITLES: Record<string, string> = {
  director: 'Director overview', bookings: 'Coach booking links', allocations: 'Learner allocation',
  imports: 'Import & export', phone: 'Zoom Phone', connections: 'Make every conversation count',
  settings: 'Settings',
};

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
  const view = director ? params.get('view') || 'director' : params.get('view') === 'phone' ? 'phone' : 'operator';
  const inDesk = view === 'operator';
  const section = DESK_MENUS.some(item => item[0] === params.get('section')) ? params.get('section')! : 'next';
  const caseId = director && params.get('case') ? Number(params.get('case')) : null;

  const ownAgent = overview?.access.agent_id ?? null;
  const deskAgentId = director ? Number(params.get('operator')) || ownAgent || overview?.agents[0]?.id || null : ownAgent;
  const deskAgent = overview?.agents.find(agent => agent.id === deskAgentId);
  const session: Session = useMemo(() => {
    const isManager = !!overview && (overview.access.role === 'director');
    const superuser = !!overview?.access.is_superuser;
    const csrf = config.data?.csrf_token || '';
    const self = overview?.access.display_name || '';
    const helpdesk = !!config.data?.helpdesk;
    if (!inDesk) return { csrf, agentId: ownAgent, canAct: !!ownAgent || isManager, isManager, preview: false, name: self, helpdesk };
    const own = deskAgentId !== null && deskAgentId === ownAgent;
    const preview = role === 'viewer' || (!own && !superuser);
    return { csrf, agentId: preview ? null : deskAgentId, canAct: !preview, isManager, preview, name: deskAgent?.display_name || self, ownDesk: own, helpdesk };
  }, [config.data, overview, inDesk, deskAgentId, deskAgent, ownAgent, role]);

  const email = overview?.access.email || String(readStoredAuthUser()?.email || '');
  // A specialist's desk holds their allocated learners plus the shared queue.
  const deskOverview = useMemo(() => (overview && deskAgentId
    ? { ...overview, cases: overview.cases.filter(c => !c.allocated_agent_id || c.allocated_agent_id === deskAgentId) }
    : overview), [overview, deskAgentId]);

  const groups: NavGroup[] = !overview || !deskOverview ? [] : inDesk
    ? [
      { title: 'My calling day', items: DESK_MENUS.map(([key, , icon]) => ({ key: `desk:${key}`, label: deskLabel(deskOverview, key), icon })) },
      ...(director ? [{ title: 'Director', items: [{ key: 'exit', label: 'Return to director', icon: 'back' }] }]
        : [{ title: 'Engagement', items: [{ key: 'view:phone', label: 'Zoom Phone', icon: 'settings' }] }]),
    ]
    : director ? [{ title: 'Director', items: DIRECTOR_NAV.map(([key, label, icon]) => ({ key: `view:${key}`, label, icon })) }]
      : [
        { title: 'My calling day', items: DESK_MENUS.map(([key, , icon]) => ({ key: `desk:${key}`, label: deskLabel(deskOverview, key), icon })) },
        { title: 'Engagement', items: [{ key: 'view:phone', label: 'Zoom Phone', icon: 'settings' }] },
      ];
  const activeKey = inDesk ? `desk:${section}` : `view:${view}`;

  function navigateTo(key: string) {
    if (key === 'exit') setParam({ view: null, operator: null, section: null, case: null });
    else if (key.startsWith('desk:')) setParam(director ? { section: key.slice(5) } : { view: null, section: key.slice(5) });
    else if (key.startsWith('view:')) setParam({ view: key.slice(5) === 'director' ? null : key.slice(5), case: null, section: null });
  }

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
        <p className="ec-alert">
          Workspace: {deskAgent?.display_name || overview.access.display_name}. Showing this specialist's allocated contacts plus the shared queue.
          {' '}Last successful cycle: {overview.cycle?.last_success_at ? new Date(overview.cycle.last_success_at).toLocaleString() : 'Not recorded'}.
        </p>
        {failingSources(overview).length > 0 && <p className="ec-alert" role="alert">
          Some data sources are unavailable ({failingSources(overview).map(source => human(source.name.replace(/^source:/, ''))).join(', ')}).
          {' '}Lists may be incomplete; existing cases have been retained. Ask a manager to check Connections.
        </p>}
        {(!overview.cycle?.last_success_at || Date.now() - Date.parse(overview.cycle.last_success_at) > 30 * 60 * 1000) &&
          <p className="ec-alert" role="alert">Synchronization is overdue or has not completed. Refresh only reloads saved cases; it does not run synchronization.</p>}
        {overview.cases_truncated && <p className="ec-alert" role="alert">The case list is truncated. These counters do not include every case.</p>}
        {role === 'viewer' && <p className="ec-alert">Ask a manager to set up your agent profile to call learners and record outcomes. This calling workspace is read-only until then.</p>}
        <Desk
          overview={deskOverview} agent={deskAgent} session={session} section={section}
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
            <div className="ec-eyebrow">Kent Business College · Engagement</div>
            <h1>{caseId ? 'Learner call workspace' : TITLES[view] || 'Make every conversation count'}</h1>
            <div className="ec-muted">{longDate(overview.today)} · {overview.access.display_name}</div>
          </div>
          <div className="ec-buttons">
            {caseId && <button type="button" onClick={() => setParam({ case: null })}>← Calling register</button>}
            {!director && <button type="button" onClick={() => setParam({ view: null })}>← Calling workspace</button>}
            {director && <button type="button" className="primary" onClick={() => setRequesting(true)}>+ Request a call</button>}
            <button type="button" onClick={refresh}>Refresh</button>
          </div>
        </div>
        {status}
        <div id="ec-body">
          {caseId ? (
            <CaseWorkspace key={caseId} id={caseId} overview={overview} session={session} onOpen={id => setParam({ case: String(id) })} notify={notify} onChanged={refresh} />
          ) : view === 'allocations' ? <Allocation csrf={config.data?.csrf_token || ''} onWorkspace={id => setParam({ view: 'operator', operator: String(id) })} />
            : view === 'imports' ? <Imports overview={overview} onAllocate={() => setParam({ view: 'allocations' })} />
              : view === 'phone' ? <ZoomPhone overview={overview} csrf={config.data?.csrf_token || ''} isManager={director} smartEmbed={!!config.data?.smart_embed} />
                : view === 'bookings' ? <><BookingLinksView overview={overview} /><CoachPages csrf={config.data?.csrf_token || ''} onSaved={refresh} /></>
                  : view === 'connections' ? <Connections overview={overview} />
                        : view === 'settings' ? <Settings csrf={config.data?.csrf_token || ''} />
                        : (
                          <Director
                            overview={overview} month={overview.month} session={session} onChanged={refresh} notify={notify}
                            onMonth={value => setParam({ month: value })}
                            onPreview={id => setParam({ view: 'operator', operator: String(id), section: null })} onOpenCase={id => setParam({ case: String(id) })}
                          />
                        )}
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
      {/* Anyone who can call: a specialist, or a super admin working a specialist's desk. */}
      {config.data?.smart_embed && (ownAgent !== null || !!overview?.access.is_superuser) && (
        <SmartEmbedPhone csrf={config.data.csrf_token} notify={notify} onCallLogged={refresh} />
      )}
    </div>
  );
}
