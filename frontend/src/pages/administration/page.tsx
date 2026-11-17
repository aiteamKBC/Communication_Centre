import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Building2, ChevronLeft, ChevronRight, ExternalLink, Headphones, History, Info, LoaderCircle, LockKeyhole, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import TopNav from '../../components/feature/TopNav';
import AccountEditor from './AccountEditor';
import RoleEditor from './RoleEditor';
import { adminRequest, AdministrationError, displayDate, errorMessage, type AdministrationRole, type AdministrationSession, type AdministrationUser, type HistoryResponse, type PermissionSection, type RoleMutationResponse, type RolesResponse, type UsersResponse } from './api';
import './administration.css';

type Section = 'users' | 'roles' | 'history';
type AccessState = 'loading' | 'ready' | 'denied' | 'unauthenticated' | 'error';
const PAGE_SIZE = 15;

function Initials({ user }: { user: AdministrationUser }) {
  const names = (user.displayName || user.username).trim().split(/\s+/);
  return <span className="adm-avatar" aria-hidden="true">{names.map(name => name.charAt(0)).slice(0, 2).join('').toUpperCase()}</span>;
}

function Pagination({ page, total, pageSize, busy, onPage }: { page: number; total: number; pageSize: number; busy: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="adm-pagination"><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 results'}</span><div className="adm-button-row"><span className="adm-page-count">Page {page} of {pages}</span><button type="button" className="adm-icon-button" aria-label="Previous page" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button><button type="button" className="adm-icon-button" aria-label="Next page" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button></div></div>;
}

export default function AdministrationPage() {
  const [accessState, setAccessState] = useState<AccessState>('loading');
  const [session, setSession] = useState<AdministrationSession | null>(null);
  const [authorizationError, setAuthorizationError] = useState('');
  const [retrySession, setRetrySession] = useState(0);
  const [section, setSection] = useState<Section>('users');
  const [roles, setRoles] = useState<AdministrationRole[]>([]);
  const [permissionSections, setPermissionSections] = useState<PermissionSection[]>([]);
  const [roleEditor, setRoleEditor] = useState<{ role: AdministrationRole | null } | null>(null);
  const [roleEditorLoading, setRoleEditorLoading] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');
  const [rolesLoading, setRolesLoading] = useState(true);
  const [users, setUsers] = useState<UsersResponse>({ users: [], page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [history, setHistory] = useState<HistoryResponse>({ entries: [], page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ user: AdministrationUser | null } | null>(null);
  const [editorLoading, setEditorLoading] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ message: string; warnings: string[] } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const deny = useCallback((state: 'denied' | 'unauthenticated' = 'unauthenticated') => {
    setAccessState(state); setSession(null); setEditor(null); setRoleEditor(null); setUsers({ users: [], total: 0, page: 1, pageSize: PAGE_SIZE }); setHistory({ entries: [], total: 0, page: 1, pageSize: PAGE_SIZE }); setRoles([]); setPermissionSections([]); setDirty(false);
  }, []);
  const handleReadError = useCallback((error: unknown, target: (message: string) => void) => {
    if (error instanceof AdministrationError && (error.status === 401 || error.status === 403)) deny(error.status === 401 ? 'unauthenticated' : 'denied');
    else target(errorMessage(error));
  }, [deny]);

  useEffect(() => {
    const controller = new AbortController();
    let attempt = 0;
    async function authorize(initial: boolean) {
      const currentAttempt = ++attempt;
      if (initial) { setAccessState('loading'); setAuthorizationError(''); }
      try {
        const result = await adminRequest<AdministrationSession>('session/', { signal: controller.signal });
        if (controller.signal.aborted || currentAttempt !== attempt) return;
        if (!result.canManageAdministration) { deny('denied'); return; }
        setSession(previous => previous && JSON.stringify(previous) === JSON.stringify(result) ? previous : result); setAccessState('ready');
      } catch (error) {
        if (controller.signal.aborted || currentAttempt !== attempt) return;
        if (error instanceof AdministrationError && [401, 403].includes(error.status)) { setAuthorizationError(error.message); deny(error.status === 401 ? 'unauthenticated' : 'denied'); }
        else if (initial) { setAuthorizationError(errorMessage(error)); setAccessState('error'); }
      }
    }
    void authorize(true);
    const refreshAccess = () => { void authorize(false); };
    window.addEventListener('focus', refreshAccess);
    window.addEventListener('kbc-auth-changed', refreshAccess);
    return () => { controller.abort(); window.removeEventListener('focus', refreshAccess); window.removeEventListener('kbc-auth-changed', refreshAccess); };
  }, [retrySession, deny]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (accessState !== 'ready' || !session) return;
    const controller = new AbortController();
    setRolesLoading(true); setRoleError('');
    adminRequest<RolesResponse>('roles/', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setRoles(result.roles); setPermissionSections(result.permissionSections || []); if (roleFilter && !result.roles.some(role => role.id === roleFilter)) setRoleFilter(''); } })
      .catch(error => { if (!controller.signal.aborted) handleReadError(error, setRoleError); })
      .finally(() => { if (!controller.signal.aborted) setRolesLoading(false); });
    return () => controller.abort();
  }, [accessState, session, revision, handleReadError]);

  useEffect(() => {
    if (accessState !== 'ready' || !session || section === 'roles') return;
    const controller = new AbortController();
    setLoading(true); setListError('');
    const params = new URLSearchParams({ page: String(section === 'history' ? historyPage : page), pageSize: String(PAGE_SIZE) });
    if (section === 'users') { if (query.trim()) params.set('q', query.trim()); if (roleFilter) params.set('role', roleFilter); if (statusFilter) params.set('status', statusFilter); }
    const request = section === 'users'
      ? adminRequest<UsersResponse>(`users/?${params}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { const nextPage = Math.min(result.page, Math.max(1, Math.ceil(result.total / result.pageSize))); setUsers(result); if (nextPage !== page) setPage(nextPage); } })
      : adminRequest<HistoryResponse>(`history/?${params}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { const nextPage = Math.min(result.page, Math.max(1, Math.ceil(result.total / result.pageSize))); setHistory(result); if (nextPage !== historyPage) setHistoryPage(nextPage); } });
    request.catch(error => { if (!controller.signal.aborted) handleReadError(error, setListError); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessState, session, section, query, roleFilter, statusFilter, page, historyPage, revision, handleReadError]);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    function beforeLink(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest('a[href]');
      if (!link || link.getAttribute('target') === '_blank' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.button !== 0) return;
      if (!window.confirm('Leave this page and discard your unsaved changes?')) { event.preventDefault(); event.stopPropagation(); }
    }
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('click', beforeLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeLink, true); };
  }, [dirty]);

  function switchSection(next: Section) {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    setDirty(false); setEditor(null); setRoleEditor(null); setSection(next); setNotice(null); setListError('');
  }
  async function editUser(user: AdministrationUser) {
    if (editorLoading !== null || rolesLoading || roleError) return;
    setEditorLoading(user.id); setListError(''); setNotice(null);
    try {
      const result = await adminRequest<{ user: AdministrationUser }>(`users/${user.id}/`);
      if (alive.current) setEditor({ user: result.user });
    } catch (error) { if (alive.current) handleReadError(error, setListError); }
    finally { if (alive.current) setEditorLoading(null); }
  }
  function saved(message: string, warnings: string[] = []) {
    setEditor(null); setRoleEditor(null); setDirty(false); setNotice({ message, warnings }); setRevision(value => value + 1);
  }
  async function editRole(role: AdministrationRole) {
    if (roleEditorLoading || rolesLoading || !permissionSections.length) return;
    setNotice(null); setListError('');
    if (!role.groupId) { setRoleEditor({ role }); return; }
    setRoleEditorLoading(role.id);
    try {
      const result = await adminRequest<RoleMutationResponse>(`roles/${role.groupId}/`);
      if (alive.current) setRoleEditor({ role: result.role });
    } catch (error) { if (alive.current) handleReadError(error, setListError); }
    finally { if (alive.current) setRoleEditorLoading(null); }
  }

  const navigation: { id: Section; label: string; icon: typeof Users }[] = [{ id: 'users', label: 'Users & access', icon: Users }, { id: 'roles', label: 'Roles', icon: ShieldCheck }, { id: 'history', label: 'Change history', icon: History }];
  const roleNames = Object.fromEntries(roles.map(role => [role.id, role.name]));

  return <><TopNav /><div className="administration-page">
    {accessState !== 'ready' || !session ? <main className="adm-access-state">
      {accessState === 'loading' ? <><LoaderCircle className="adm-spin" size={28} /><h1>Checking administration access</h1><p>Verifying your signed-in account…</p></> : <><LockKeyhole size={30} /><h1>{accessState === 'error' ? 'Unable to verify access' : accessState === 'unauthenticated' ? 'Sign in to continue' : 'Administrator access required'}</h1><p>{accessState === 'error' ? authorizationError : accessState === 'unauthenticated' ? 'Your session has ended. Sign in again to open administration.' : authorizationError || 'Administrator access is required.'}</p><div className="adm-button-row">{accessState === 'error' ? <button type="button" className="adm-button adm-button-primary" onClick={() => setRetrySession(value => value + 1)}><RefreshCw size={17} /> Try again</button> : <Link className="adm-button adm-button-primary" to={accessState === 'unauthenticated' ? '/login' : '/'}>{accessState === 'unauthenticated' ? 'Sign in' : 'Back to home'}</Link>}</div></>}
    </main> : <div className="adm-shell">
      <aside className="adm-sidebar"><div className="adm-workspace-brand"><span><ShieldCheck size={22} /></span><div><strong>Administration</strong><small>Communication Centre</small></div></div><div className="adm-nav-label">WORKSPACE</div><nav aria-label="Administration sections">{navigation.map(item => <button key={item.id} type="button" className={`adm-nav-item ${section === item.id ? 'is-current' : ''}`} aria-current={section === item.id ? 'page' : undefined} onClick={() => switchSection(item.id)}><item.icon size={18} /><span>{item.label}</span></button>)}</nav><div className="adm-sidebar-bottom"><LockKeyhole size={16} /><span>Administrator access</span></div></aside>
      <main className="adm-main"><div className="adm-breadcrumb"><Link to="/">Home</Link><span>/</span><span>Administration</span><span>/</span><strong>{editor ? editor.user ? 'Manage user' : 'Add user' : navigation.find(item => item.id === section)?.label}</strong></div>
        {notice && <div className="adm-notices"><div className="adm-alert adm-alert-success" role="status"><ShieldCheck size={18} /><span>{notice.message}</span></div>{notice.warnings.map((warning, index) => <div key={index} className="adm-alert adm-alert-warning" role="alert"><Info size={18} /><span>{warning}</span></div>)}</div>}
        {editor ? <AccountEditor key={editor.user?.id ?? 'new'} user={editor.user} roles={roles} session={session} onClose={() => { setEditor(null); setDirty(false); }} onSaved={saved} onDirty={setDirty} onUnauthorized={status => deny(status === 403 ? 'denied' : 'unauthenticated')} /> : <>
          <div className="adm-page-heading"><div><span className="adm-eyebrow">{section === 'history' ? 'ACCOUNTABILITY' : 'PEOPLE & PERMISSIONS'}</span><h1 ref={heading}>{section === 'users' ? 'Users & access' : section === 'roles' ? 'Roles' : 'Change history'}</h1><p>{section === 'users' ? 'Manage your team and what each person can access.' : section === 'roles' ? 'Create roles and choose what your team can do.' : 'See who changed an account or role, what changed and when.'}</p></div>{section === 'users' && <button type="button" className="adm-button adm-button-primary" onClick={() => { setNotice(null); setEditor({ user: null }); }} disabled={rolesLoading || Boolean(roleError)}><Plus size={18} /> Add user</button>}{section === 'roles' && <button type="button" className="adm-button adm-button-primary" onClick={() => { setNotice(null); setRoleEditor({ role: null }); }} disabled={rolesLoading || Boolean(roleError) || !permissionSections.length}><Plus size={18} /> Add role</button>}</div>
          {roleError && <div className="adm-alert adm-alert-error" role="alert"><AlertCircle size={18} /><span>{roleError}</span><button type="button" className="adm-button adm-button-secondary" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
          {listError && <div className="adm-alert adm-alert-error" role="alert"><AlertCircle size={18} /><span>{listError}</span><button type="button" className="adm-button adm-button-secondary" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
          {section === 'users' && <>
            <div className="adm-toolbar"><label className="adm-search"><Search size={18} /><input type="search" aria-label="Search name or email" placeholder="Search name, email or username" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="adm-filter"><span className="adm-sr-only">Filter by role</span><select value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(1); }}><option value="">All roles</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className="adm-filter"><span className="adm-sr-only">Filter by account status</span><select value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
            <div className="adm-table-surface" aria-busy={loading}>
              <div className="adm-list-heading"><h2>Team members <span>{users.total}</span></h2>{loading && <span className="adm-loading-label" role="status"><LoaderCircle size={15} className="adm-spin" /> Loading</span>}</div>
              {users.users.length ? <table className="adm-users-table"><thead><tr><th scope="col">Team member</th><th scope="col">Assigned roles</th><th scope="col">Status</th><th scope="col"><span className="adm-sr-only">Actions</span></th></tr></thead><tbody>{users.users.map(user => <tr key={user.id}><td className="adm-user-cell"><div className="adm-user-identity"><Initials user={user} /><div><strong>{user.displayName || user.username}{user.id === session.currentUserId && <span className="adm-you">You</span>}</strong><span>{user.email || user.username}</span></div></div></td><td className="adm-roles-cell"><div className="adm-role-badges">{user.isSuperuser && <span className="adm-badge adm-badge-amber">Super administrator</span>}{user.roles.map(id => <span key={id} className={`adm-badge ${id === 'access_admin' ? 'adm-badge-amber' : ''}`}>{roleNames[id] || id.replace(/^access_/, '').replaceAll('_', ' ')}</span>)}{!user.roles.length && !user.isSuperuser && <span className="adm-muted">No roles assigned</span>}</div></td><td className="adm-status-cell"><span className={`adm-status ${user.isActive ? 'is-active' : 'is-inactive'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td><td className="adm-action-cell"><button type="button" className="adm-manage-button" aria-label={`Manage access for ${user.displayName || user.username}`} onClick={() => void editUser(user)} disabled={editorLoading !== null || rolesLoading || Boolean(roleError)}>{editorLoading === user.id ? <LoaderCircle size={17} className="adm-spin" /> : <>{user.canEdit ? 'Manage' : 'View'}<ArrowRight size={15} /></>}</button></td></tr>)}</tbody></table> : <div className="adm-empty"><Users size={28} /><h3>{loading ? 'Loading users…' : listError ? 'Users could not be loaded' : query || roleFilter || statusFilter ? 'No matching users' : 'No users found'}</h3><p>{loading ? 'Getting the latest account information.' : listError ? 'Use Retry to load the account list.' : 'Try a different search or filter.'}</p></div>}
              <Pagination page={page} total={users.total} pageSize={users.pageSize} busy={loading} onPage={setPage} />
            </div><p className="adm-data-note"><ShieldCheck size={15} /> Changes are saved to the same user accounts and roles used by Django administration.</p>
          </>}
          {section === 'roles' && <div className="adm-role-directory">{rolesLoading && <div className="adm-loading-label" role="status"><LoaderCircle size={17} className="adm-spin" /> Loading roles</div>}{(['custom', 'communication', 'engagement'] as const).map(group => <section className="adm-panel" key={group}><div className="adm-panel-heading">{group === 'custom' ? <ShieldCheck size={20} /> : group === 'communication' ? <Building2 size={20} /> : <Headphones size={20} />}<h2>{group === 'custom' ? 'Custom roles' : group === 'communication' ? 'Communication Centre' : 'Engagement Centre'}</h2>{group !== 'custom' && <span className="adm-badge">Built-in</span>}</div>{group === 'custom' && !roles.some(role => role.section === 'custom') && !rolesLoading && <div className="adm-role-empty"><h3>Give each team the access they need</h3><p>Create a role such as News editor, choose its permissions, then assign it to people.</p></div>}{roles.filter(role => role.section === group).map(role => <div className="adm-directory-row" key={role.id}><div className="adm-directory-details"><h3>{role.name}{Boolean(role.unmanagedPermissions?.length) && <LockKeyhole size={13} aria-label="Includes protected permissions" />}</h3><p>{role.description}</p></div><div className="adm-directory-actions"><button type="button" className="adm-assigned-button" aria-label={`View people assigned ${role.name}`} onClick={() => { setRoleFilter(role.id); setStatusFilter(''); setSearch(''); setQuery(''); setPage(1); setSection('users'); }}>{role.assignedCount} assigned<ChevronRight size={15} /></button><button type="button" className="adm-role-edit-button" aria-label={`${role.canEdit ? 'Edit' : 'View'} role ${role.name}`} onClick={() => void editRole(role)} disabled={Boolean(roleEditorLoading) || rolesLoading || !permissionSections.length}>{roleEditorLoading === role.id ? <LoaderCircle size={16} className="adm-spin" /> : role.canEdit ? <Pencil size={15} /> : <ShieldCheck size={15} />}{role.canEdit ? 'Edit' : 'View access'}</button></div></div>)}</section>)}<p className="adm-inline-note"><Info size={17} /><span>Roles are shared with Django administration. Assign them from Users & access. Built-in roles keep their existing access.</span></p></div>}
          {section === 'history' && <div className="adm-table-surface"><div className="adm-list-heading"><h2>Account & role changes</h2>{loading && <span className="adm-loading-label" role="status"><LoaderCircle size={15} className="adm-spin" /> Loading</span>}</div>{history.entries.length ? <ol className="adm-history-list">{history.entries.map(entry => <li key={entry.id}><span className="adm-history-icon"><History size={18} /></span><div className="adm-history-content"><div className="adm-history-title"><strong>{entry.objectLabel}</strong><span className="adm-badge">{entry.action}</span></div><p>{entry.summary}</p><div className="adm-history-meta"><span>{entry.actor}</span><span>·</span><time dateTime={entry.createdAt}>{displayDate(entry.createdAt)}</time></div></div></li>)}</ol> : <div className="adm-empty"><History size={28} /><h3>{loading ? 'Loading changes…' : listError ? 'History could not be loaded' : 'No changes yet'}</h3><p>{listError ? 'Use Retry to load the history.' : 'Changes to accounts and roles will appear here.'}</p></div>}<Pagination page={historyPage} total={history.total} pageSize={history.pageSize} busy={loading} onPage={setHistoryPage} /></div>}
          {session.djangoAdminUrl && <div className="adm-advanced-link"><div><strong>More administration tools</strong><p>Open the original Django panel to manage other registered data and permissions.</p></div><a className="adm-button adm-button-secondary" href={session.djangoAdminUrl} target="_blank" rel="noreferrer">Django administration<ExternalLink size={15} /></a></div>}
        </>}
        {roleEditor && <RoleEditor key={roleEditor.role?.id || 'new-role'} role={roleEditor.role} sections={permissionSections} onClose={() => { setRoleEditor(null); setDirty(false); }} onSaved={saved} onDirty={setDirty} onUnauthorized={status => deny(status === 403 ? 'denied' : 'unauthenticated')} />}
      </main>
    </div>}
  </div></>;
}
