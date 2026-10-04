import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearAuthStorage, readStoredAuthUser } from '../../utils/authStorage';
import { useCallCentre } from './api';
import type { Config, Overview } from './api';
import type { Session } from './engagement/actions';
import Allocation from './engagement/Allocation';
import BookingLinksView from './engagement/BookingLinksView';
import CaseWorkspace from './engagement/CaseWorkspace';
import Connections from './engagement/Connections';
import Desk from './engagement/Desk';
import Director from './engagement/Director';
import Imports from './engagement/Imports';
import { DESK_MENUS, deskLabel, longDate } from './engagement/model';
import { Calendar, Eventbrite } from './engagement/NotConnected';
import RequestCall from './engagement/RequestCall';
import Settings from './engagement/Settings';
import Shell from './engagement/Shell';
import type { NavGroup } from './engagement/Shell';
import ZoomPhone from './engagement/ZoomPhone';
import './styles/engagement.css';

const DIRECTOR_NAV: [string, string, string][] = [
  ['director', 'Director overview', 'chart'], ['calendar', 'Coach calendars', 'calendar'], ['bookings', 'Coach booking links', 'calendar'],
  ['allocations', 'Learner allocation', 'people'], ['imports', 'Import & export', 'upload'], ['phone', 'Zoom Phone', 'settings'],
  ['eventbrite', 'Eventbrite', 'calendar'], ['connections', 'Connections & rules', 'check'], ['settings', 'Settings', 'settings'],
];
const DIRECTOR_TABS: [string, string][] = [
  ['director', 'Director'], ['allocations', 'Learner allocation'], ['imports', 'Import & export'], ['phone', 'Zoom Phone'],
  ['bookings', 'Coach booking links'], ['operator', 'Calling workspace'], ['connections', 'Connections & call rules'],
  ['settings', 'Settings'],
];
const TITLES: Record<string, string> = {
  director: 'Director overview', calendar: 'Coach calendars', bookings: 'Coach booking links', allocations: 'Learner allocation',
  imports: 'Import & export', phone: 'Zoom Phone', eventbrite: 'Eventbrite', connections: 'Make every conversation count',
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
  const config = useCallCentre<Config>('config/');
  const overviewState = useCallCentre<Overview>(`overview/${month ? `?month=${month}` : ''}`);
  const overview = overviewState.data;

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
    if (overviewState.error && overview) setMessage({ text: overviewState.error, error: true });
  }, [overviewState.error, overview]);

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
    if (!inDesk) return { csrf, agentId: ownAgent, canAct: !!ownAgent || isManager, isManager, preview: false, name: self };
    const own = deskAgentId !== null && deskAgentId === ownAgent;
    const preview = role === 'viewer' || (!own && !superuser);
    return { csrf, agentId: preview ? null : deskAgentId, canAct: !preview, isManager, preview, name: deskAgent?.display_name || self };
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
    content = overviewState.error ? <p role="alert">{overviewState.error}</p> : <p>Loading your Engagement Centre…</p>;
  } else if (inDesk && deskOverview) {
    content = (
      <div id="engagement-centre" className="ec ed">
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
        {!caseId && director && (
          <div className="ec-tabs" role="tablist" aria-label="Engagement screens">
            {DIRECTOR_TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => setParam({ view: key === 'director' ? null : key, section: null })}>{label}</button>
            ))}
          </div>
        )}
        <div id="ec-body">
          {caseId ? (
            <CaseWorkspace key={caseId} id={caseId} overview={overview} session={session} onOpen={id => setParam({ case: String(id) })} notify={notify} onChanged={refresh} />
          ) : view === 'allocations' ? <Allocation csrf={config.data?.csrf_token || ''} onWorkspace={id => setParam({ view: 'operator', operator: String(id) })} />
            : view === 'imports' ? <Imports overview={overview} onAllocate={() => setParam({ view: 'allocations' })} />
              : view === 'phone' ? <ZoomPhone overview={overview} csrf={config.data?.csrf_token || ''} isManager={director} />
                : view === 'bookings' ? <BookingLinksView overview={overview} />
                  : view === 'connections' ? <Connections overview={overview} onView={key => setParam({ view: key })} />
                    : view === 'calendar' ? <Calendar />
                      : view === 'eventbrite' ? <Eventbrite />
                        : view === 'settings' ? <Settings csrf={config.data?.csrf_token || ''} />
                        : (
                          <Director
                            overview={overview} month={overview.month} onMonth={value => setParam({ month: value })} onView={key => setParam({ view: key })}
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
    </div>
  );
}
