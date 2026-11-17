import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Building2, Check, Headphones, Info, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { adminRequest, AdministrationError, displayDate, errorMessage, type AdministrationRole, type AdministrationSession, type AdministrationUser, type UserMutationResponse } from './api';

type FormValues = { username: string; email: string; firstName: string; lastName: string; isActive: boolean; isStaff: boolean; isSuperuser: boolean; roles: string[]; password: string; confirmPassword: string };
type Props = { user: AdministrationUser | null; roles: AdministrationRole[]; session: AdministrationSession; onClose: () => void; onSaved: (message: string, warnings?: string[]) => void; onDirty: (dirty: boolean) => void; onUnauthorized: (status?: number) => void };

function initialValues(user: AdministrationUser | null): FormValues {
  return { username: user?.username || '', email: user?.email || '', firstName: user?.firstName || '', lastName: user?.lastName || '', isActive: user?.isActive ?? true, isStaff: user?.isStaff ?? false, isSuperuser: user?.isSuperuser ?? false, roles: [...(user?.roles || [])], password: '', confirmPassword: '' };
}

function fingerprint(value: FormValues) { return JSON.stringify({ ...value, roles: [...value.roles].sort() }); }

function Dialog({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: ReactNode }) {
  const element = useRef<HTMLDialogElement>(null);
  useEffect(() => { element.current?.showModal(); return () => element.current?.close(); }, []);
  return <dialog ref={element} className="administration-dialog" aria-labelledby="administration-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="adm-dialog-heading"><h2 id="administration-dialog-title">{title}</h2><button type="button" className="adm-icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={20} /></button></div>
    {children}
  </dialog>;
}

export default function AccountEditor({ user: originalUser, roles, session, onClose, onSaved, onDirty, onUnauthorized }: Props) {
  const [user, setUser] = useState(originalUser);
  const [form, setForm] = useState(() => initialValues(originalUser));
  const [baseline, setBaseline] = useState(() => fingerprint(initialValues(originalUser)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AdministrationError | null>(null);
  const [dialog, setDialog] = useState<'password' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [localNotice, setLocalNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const ownAccount = user?.id === session.currentUserId;
  const readOnly = Boolean(user && !user.canEdit);
  const dirty = fingerprint(form) !== baseline;
  const adminSelected = form.roles.includes('access_admin');
  const unmappedGroups = (user?.otherGroups || []).filter(name => !roles.some(role => role.groupName === name));

  useEffect(() => { onDirty(dirty || Boolean(password || passwordConfirm || deleteConfirm)); return () => onDirty(false); }, [dirty, password, passwordConfirm, deleteConfirm, onDirty]);

  const changeSummary = useMemo(() => {
    if (!user) return 'A new account will be created with the roles you select.';
    const added = roles.filter(role => form.roles.includes(role.id) && !user.roles.includes(role.id)).map(role => role.name);
    const removed = roles.filter(role => !form.roles.includes(role.id) && user.roles.includes(role.id)).map(role => role.name);
    const parts = [...(added.length ? [`Add ${added.join(', ')}`] : []), ...(removed.length ? [`Remove ${removed.join(', ')}`] : [])];
    if (form.isActive !== user.isActive) parts.push(form.isActive ? 'Activate account' : 'Deactivate account');
    if (form.isStaff !== user.isStaff || form.isSuperuser !== user.isSuperuser) parts.push('Update advanced access');
    if (['username', 'email', 'firstName', 'lastName'].some(key => form[key] !== user[key])) parts.push('Update account details');
    return parts.join(' · ') || 'No unsaved changes';
  }, [form, user, roles]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) { setForm(current => ({ ...current, [key]: value })); setError(null); }
  function reportFailure(caught: unknown) {
    const next = caught instanceof AdministrationError ? caught : new AdministrationError(errorMessage(caught), 0);
    if (next.status === 401 || next.status === 403) { onUnauthorized(next.status); return; }
    setError(next);
  }
  function close() {
    if (saving || loading) return;
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onDirty(false);
    onClose();
  }
  async function reload() {
    if (!user || (dirty && !window.confirm('Reload this account and discard your unsaved changes?'))) return;
    setLoading(true); setError(null);
    try {
      const result = await adminRequest<{ user: AdministrationUser }>(`users/${user.id}/`);
      setUser(result.user); const next = initialValues(result.user); setForm(next); setBaseline(fingerprint(next));
    } catch (caught) { reportFailure(caught); } finally { setLoading(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || readOnly || (user && !dirty)) return;
    setError(null); setLocalNotice('');
    if (!user && form.password !== form.confirmPassword) { setError(new AdministrationError('The passwords do not match.', 400, { confirmPassword: 'Enter the same password in both fields.' })); return; }
    setSaving(true);
    const values = { username: form.username.trim(), email: form.email.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(), isActive: form.isActive, roles: form.roles, ...(session.canManagePrivilegedAccounts ? { isStaff: form.isStaff, isSuperuser: form.isSuperuser } : {}) };
    // Send only intentional edits. Existing accounts can carry legacy values
    // that should not block an unrelated role change or be overwritten.
    const body = user
      ? { ...Object.fromEntries(Object.entries(values).filter(([key]) => key === 'roles'
        ? JSON.stringify([...form.roles].sort()) !== JSON.stringify([...user.roles].sort())
        : form[key] !== user[key])), revision: user.revision }
      : { ...values, password: form.password };
    try {
      const result = await adminRequest<UserMutationResponse>(user ? `users/${user.id}/` : 'users/', { method: user ? 'PATCH' : 'POST', body });
      onDirty(false);
      if (result.user.id === session.currentUserId) window.dispatchEvent(new Event('kbc-auth-changed'));
      onSaved(user ? `Access and account details updated for ${result.user.displayName || result.user.username}.` : `Account created for ${result.user.displayName || result.user.username}.`, result.warnings);
    } catch (caught) { reportFailure(caught); } finally { setSaving(false); }
  }
  function openDialog(kind: 'password' | 'delete') {
    if (dirty) { setError(new AdministrationError('Save or discard your account changes before continuing.', 400)); return; }
    setDialogError(''); setPassword(''); setPasswordConfirm(''); setDeleteConfirm(''); setDialog(kind);
  }
  function closeDialog() {
    if (saving) return;
    if ((password || passwordConfirm) && !window.confirm('Discard the password you entered?')) return;
    setPassword(''); setPasswordConfirm(''); setDeleteConfirm(''); setDialog(null);
  }
  async function submitDialog(event: FormEvent) {
    event.preventDefault();
    if (!user || saving) return;
    if (dialog === 'password' && password !== passwordConfirm) { setDialogError('The passwords do not match.'); return; }
    setDialogError(''); setSaving(true);
    try {
      if (dialog === 'delete') {
        await adminRequest(`users/${user.id}/`, { method: 'DELETE', body: { revision: user.revision, confirmUsername: deleteConfirm } });
        onDirty(false); onSaved(`Account ${user.username} deleted.`);
      } else {
        const result = await adminRequest<UserMutationResponse>(`users/${user.id}/password/`, { method: 'POST', body: { password, revision: user.revision } });
        setUser(result.user); setPassword(''); setPasswordConfirm(''); setDialog(null); setLocalNotice('Password changed successfully.');
        if (ownAccount) window.dispatchEvent(new Event('kbc-auth-changed'));
      }
    } catch (caught) {
      if (caught instanceof AdministrationError && (caught.status === 401 || caught.status === 403)) { onUnauthorized(caught.status); return; }
      const details = caught instanceof AdministrationError ? Object.values(caught.errors).flat().join(' ') : '';
      setDialogError([errorMessage(caught), details].filter(Boolean).join(' '));
      if (caught instanceof AdministrationError && caught.status === 409) setError(caught);
    } finally { setSaving(false); }
  }
  function fieldError(key: string) { return error?.errors[key]?.length ? <span className="adm-field-error" id={`adm-error-${key}`}>{error.errors[key].join(' ')}</span> : null; }

  return <section className="adm-editor" aria-labelledby="adm-editor-title">
    <button className="adm-back" type="button" onClick={close} disabled={saving || loading}><ArrowLeft size={16} /> All users</button>
    <div className="adm-page-heading"><div><span className="adm-eyebrow">PEOPLE & PERMISSIONS</span><h1 id="adm-editor-title">{user ? 'Manage user' : 'Add a user'}</h1><p>{user ? 'Keep account details and access up to date.' : 'Create an account and choose the access this person needs.'}</p></div>{user && <span className={`adm-status ${user.isActive ? 'is-active' : 'is-inactive'}`}>{user.isActive ? 'Active' : 'Inactive'}</span>}</div>
    {error && <div className="adm-alert adm-alert-error" role="alert"><div>{error.message}</div>{error.status === 409 && user && <button type="button" className="adm-button adm-button-secondary" onClick={reload} disabled={loading || saving}><RefreshCw size={15} /> Reload account</button>}</div>}
    {localNotice && <div className="adm-alert adm-alert-success" role="status">{localNotice}</div>}
    {readOnly && <div className="adm-alert adm-alert-info"><ShieldCheck size={18} /><span>This is a protected administration account. A Django super administrator can change its details and access.</span></div>}
    <form onSubmit={save}>
      <fieldset disabled={saving || loading || readOnly} className="adm-fieldset">
        <section className="adm-panel"><div className="adm-panel-heading"><h2>Account details</h2>{ownAccount && <span className="adm-badge">Your account</span>}</div>
          <div className="adm-field-grid">
            <label className="adm-field"><span>First name</span><input autoComplete="given-name" maxLength={150} value={form.firstName} onChange={event => update('firstName', event.target.value)} aria-invalid={Boolean(error?.errors.firstName)} />{fieldError('firstName')}</label>
            <label className="adm-field"><span>Last name</span><input autoComplete="family-name" maxLength={150} value={form.lastName} onChange={event => update('lastName', event.target.value)} aria-invalid={Boolean(error?.errors.lastName)} />{fieldError('lastName')}</label>
            <label className="adm-field"><span>Username <span className="adm-required">*</span></span><input autoComplete="off" required maxLength={150} value={form.username} onChange={event => update('username', event.target.value)} aria-invalid={Boolean(error?.errors.username)} />{fieldError('username')}</label>
            <label className="adm-field"><span>Email address {!user && <span className="adm-required">*</span>}</span><input type="email" autoComplete="off" required={!user} maxLength={254} value={form.email} onChange={event => update('email', event.target.value)} aria-invalid={Boolean(error?.errors.email)} />{fieldError('email')}</label>
            {!user && <><label className="adm-field"><span>Password <span className="adm-required">*</span></span><input type="password" autoComplete="new-password" required value={form.password} onChange={event => update('password', event.target.value)} aria-invalid={Boolean(error?.errors.password)} /><small>Use a strong, unique password. Django password rules apply.</small>{fieldError('password')}</label><label className="adm-field"><span>Confirm password <span className="adm-required">*</span></span><input type="password" autoComplete="new-password" required value={form.confirmPassword} onChange={event => update('confirmPassword', event.target.value)} aria-invalid={Boolean(error?.errors.confirmPassword)} />{fieldError('confirmPassword')}</label></>}
          </div>
          <label className="adm-check-line"><input type="checkbox" checked={form.isActive} onChange={event => update('isActive', event.target.checked)} disabled={ownAccount} /><span><strong>Account active</strong><small>{ownAccount ? 'You cannot deactivate your own account.' : 'Allow this person to sign in. Turn off to suspend access while keeping their history.'}</small></span></label>
        </section>
        <div className="adm-access-columns">{(['communication', 'engagement', 'custom'] as const).filter(section => section !== 'custom' || roles.some(role => role.section === 'custom')).map(section => <section className={`adm-panel adm-role-panel ${section === 'custom' ? 'adm-custom-role-panel' : ''}`} key={section}>
          <div className="adm-panel-heading">{section === 'communication' ? <Building2 size={19} /> : section === 'engagement' ? <Headphones size={19} /> : <ShieldCheck size={19} />}<h2>{section === 'communication' ? 'Communication Centre' : section === 'engagement' ? 'Engagement Centre' : 'Custom roles'}</h2></div>
          <div className="adm-role-options">{roles.filter(role => role.section === section).map(role => {
            const inherited = section === 'communication' && role.id !== 'access_admin' && adminSelected;
            const ownAdmin = ownAccount && role.id === 'access_admin' && user?.roles.includes('access_admin');
            const superDirector = form.isSuperuser && !form.roles.includes('access_call_centre_agent') && role.id === 'access_call_centre_director';
            const assignmentProtected = role.canAssign === false || (Boolean(role.unmanagedPermissions?.length) && !session.canManagePrivilegedAccounts);
            return <label className={`adm-role-choice ${inherited || superDirector || assignmentProtected ? 'is-inherited' : ''}`} key={role.id}><input type="checkbox" checked={form.roles.includes(role.id) || inherited || superDirector} disabled={inherited || ownAdmin || superDirector || assignmentProtected} onChange={event => update('roles', event.target.checked ? [...form.roles, role.id] : form.roles.filter(id => id !== role.id))} /><span><strong>{role.name}</strong><small>{role.description}</small>{inherited && <em>Included with Admin</em>}{superDirector && <em>Included with super administrator access</em>}{ownAdmin && <em>Your own administrator access is protected</em>}{assignmentProtected && <em>A super administrator manages this role</em>}</span></label>;
          })}</div>{section === 'engagement' && <p className="adm-inline-note"><Info size={16} /><span>These job roles are separate from Communication Centre admin.</span></p>}
        </section>)}</div>
        {fieldError('roles')}
        {Boolean(unmappedGroups.length) && <div className="adm-inline-note"><Info size={16} /><span>Other groups: {unmappedGroups.join(', ')}. These memberships stay unchanged.</span></div>}
        {session.canManagePrivilegedAccounts && <details className="adm-panel adm-advanced">
          <summary><ShieldCheck size={18} /> Advanced administration access</summary>
          <p className="adm-help">These settings control the original Django administration panel.</p>
          <label className="adm-check-line">
            <input type="checkbox" checked={form.isStaff} onChange={event => update('isStaff', event.target.checked)} disabled={Boolean((form.isSuperuser && form.isStaff) || (ownAccount && user?.isStaff))} />
            <span><strong>Django administration access</strong><small>Allow access to the original administration panel, subject to assigned permissions.</small></span>
          </label>
          <label className="adm-check-line">
            <input type="checkbox" checked={form.isSuperuser} onChange={event => { const checked = event.target.checked; setForm(current => ({ ...current, isSuperuser: checked, isStaff: checked ? true : current.isStaff })); setError(null); }} disabled={ownAccount && user?.isSuperuser} />
            <span><strong>Django super administrator</strong><small>Grant full Django permissions, including management of protected accounts. This also enables Django administration access.</small></span>
          </label>
          {fieldError('isStaff')}{fieldError('isSuperuser')}
        </details>}
      </fieldset>
      {!readOnly && <div className="adm-save-bar"><p aria-live="polite">{changeSummary}</p><div className="adm-button-row"><button type="button" className="adm-button adm-button-secondary" onClick={close} disabled={saving || loading}>Cancel</button><button type="submit" className="adm-button adm-button-primary" disabled={saving || loading || Boolean(user && !dirty)}>{saving ? <LoaderCircle size={17} className="adm-spin" /> : <Check size={17} />}{saving ? 'Saving…' : user ? 'Save changes' : 'Create user'}</button></div></div>}
    </form>
    {user && <section className="adm-account-actions"><div><h2>Account security</h2><p>Joined {displayDate(user.dateJoined)} · Last login {displayDate(user.lastLogin)}</p></div><div className="adm-button-row"><button type="button" className="adm-button adm-button-secondary" onClick={() => openDialog('password')} disabled={readOnly || saving || loading}><KeyRound size={16} /> Change password</button>{!ownAccount && user.canDelete && <button type="button" className="adm-button adm-button-danger-quiet" onClick={() => openDialog('delete')} disabled={readOnly || saving || loading}><Trash2 size={16} /> Delete account</button>}</div></section>}
    {dialog && user && <Dialog title={dialog === 'password' ? 'Change password' : 'Delete account'} onClose={closeDialog} busy={saving}>
      <form onSubmit={submitDialog}>
        <p className="adm-dialog-description">{dialog === 'password' ? `Set a new password for ${user.displayName || user.username}.` : `Permanently delete ${user.displayName || user.username}? Deactivate the account instead if you need to preserve access history and linked records.`}</p>
        {dialogError && <div className="adm-alert adm-alert-error" role="alert">{dialogError}</div>}
        {dialog === 'password' ? <><label className="adm-field"><span>New password</span><input type="password" autoComplete="new-password" autoFocus required value={password} onChange={event => setPassword(event.target.value)} disabled={saving} /></label><label className="adm-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" required value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} disabled={saving} /></label></> : <label className="adm-field"><span>Type <strong>{user.username}</strong> to confirm</span><input autoComplete="off" autoFocus required value={deleteConfirm} onChange={event => setDeleteConfirm(event.target.value)} disabled={saving} /></label>}
        <div className="adm-dialog-actions"><button type="button" className="adm-button adm-button-secondary" onClick={closeDialog} disabled={saving}>Cancel</button><button type="submit" className={`adm-button ${dialog === 'delete' ? 'adm-button-danger' : 'adm-button-primary'}`} disabled={saving || (dialog === 'delete' ? deleteConfirm !== user.username : !password || !passwordConfirm)}>{saving && <LoaderCircle size={16} className="adm-spin" />}{saving ? 'Saving…' : dialog === 'delete' ? 'Delete account' : 'Change password'}</button></div>
      </form>
    </Dialog>}
  </section>;
}
