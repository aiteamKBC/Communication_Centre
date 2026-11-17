import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, Info, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { adminRequest, AdministrationError, errorMessage, type AdministrationRole, type NativeDjangoPermission, type PermissionSection, type RoleMutationResponse } from './api';
import DjangoPermissionsPicker from './DjangoPermissionsPicker';

type Props = {
  role: AdministrationRole | null;
  sections: PermissionSection[];
  djangoPermissionCatalog: NativeDjangoPermission[];
  canManageNativePermissions: boolean;
  onClose: () => void;
  onSaved: (message: string, warnings?: string[]) => void;
  onDirty: (dirty: boolean) => void;
  onUnauthorized: (status?: number) => void;
};

const ACTIONS = [{ id: 'view', label: 'View' }, { id: 'add', label: 'Add' }, { id: 'change', label: 'Edit' }, { id: 'delete', label: 'Delete' }];
const signature = (name: string, permissions: string[], nativePermissions: string[]) => JSON.stringify([name, [...permissions].sort(), [...nativePermissions].sort()]);

export default function RoleEditor({ role: initialRole, sections, djangoPermissionCatalog, canManageNativePermissions, onClose, onSaved, onDirty, onUnauthorized }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const available = useMemo(() => new Set(sections.flatMap(section => section.permissions.filter(permission => !permission.baseline).map(permission => permission.id))), [sections]);
  const initialPermissions = (role: AdministrationRole | null) => (role?.permissions || []).filter(permission => available.has(permission));
  const initialDjangoPermissions = (role: AdministrationRole | null) => role?.djangoPermissions || [];
  const nativePermissions = useMemo(() => djangoPermissionCatalog.filter(permission => !(permission.appLabel === 'login' && permission.model === 'communicationaccess' && available.has(`${permission.appLabel}.${permission.id.split('.').pop()}`))), [djangoPermissionCatalog, available]);
  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState(initialRole?.groupName || '');
  const [selected, setSelected] = useState(() => initialPermissions(initialRole));
  const [nativeSelected, setNativeSelected] = useState(() => initialDjangoPermissions(initialRole));
  const [baseline, setBaseline] = useState(() => signature(initialRole?.groupName || '', initialPermissions(initialRole), initialDjangoPermissions(initialRole)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdministrationError | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const dirty = signature(name, selected, nativeSelected) !== baseline;
  const readOnly = Boolean(role && !role.canEdit);
  const permissionCount = selected.length;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => { onDirty(dirty || Boolean(confirmation)); return () => onDirty(false); }, [dirty, confirmation, onDirty]);

  function close() {
    if (busy || (dirty && !window.confirm('Discard your unsaved role changes?'))) return;
    onDirty(false); onClose();
  }
  function failure(caught: unknown) {
    const next = caught instanceof AdministrationError ? caught : new AdministrationError(errorMessage(caught), 0);
    if (next.status === 401 || next.status === 403) { onUnauthorized(next.status); return; }
    setError(next);
  }
  function toggle(id: string, checked: boolean) {
    setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
    setError(null);
  }
  async function reload() {
    if (!role?.groupId || (dirty && !window.confirm('Reload this role and discard your unsaved changes?'))) return;
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<RoleMutationResponse>(`roles/${role.groupId}/`);
      const permissions = initialPermissions(result.role);
      const djangoPermissions = initialDjangoPermissions(result.role);
      setRole(result.role); setName(result.role.groupName); setSelected(permissions);
      setNativeSelected(djangoPermissions); setBaseline(signature(result.role.groupName, permissions, djangoPermissions)); setDeleting(false); setConfirmation('');
    } catch (caught) { failure(caught); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || readOnly || (role && !dirty)) return;
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<RoleMutationResponse>(role ? `roles/${role.groupId}/` : 'roles/', {
        method: role ? 'PATCH' : 'POST',
        body: role?.isSystem
          ? { djangoPermissions: nativeSelected, revision: role.revision }
          : { name: name.trim(), permissions: selected, ...(canManageNativePermissions ? { djangoPermissions: nativeSelected } : {}), ...(role ? { revision: role.revision } : {}) },
      });
      onDirty(false); window.dispatchEvent(new Event('kbc-auth-changed'));
      onSaved(role ? `Role ${result.role.name} updated. Access has been updated for everyone assigned this role.` : `Role ${result.role.name} created. Assign it to people from Users & access.`, result.warnings);
    } catch (caught) { failure(caught); } finally { setBusy(false); }
  }
  function beginDelete() {
    if (dirty) { setError(new AdministrationError('Save or discard your changes before deleting this role.', 400)); return; }
    setError(null); setDeleting(true); setConfirmation('');
  }
  async function deleteRole(event: FormEvent) {
    event.preventDefault();
    if (!role?.canDelete || busy || confirmation !== role.groupName) return;
    setBusy(true); setError(null);
    try {
      await adminRequest(`roles/${role.groupId}/`, { method: 'DELETE', body: { revision: role.revision, confirmName: confirmation } });
      onDirty(false); window.dispatchEvent(new Event('kbc-auth-changed'));
      onSaved(`Role ${role.name} deleted. User accounts and their other roles have been kept.`);
    } catch (caught) { failure(caught); } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="administration-dialog adm-role-dialog" aria-labelledby="adm-role-dialog-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="adm-dialog-heading"><div><span className="adm-eyebrow">ROLES & PERMISSIONS</span><h2 id="adm-role-dialog-title">{deleting ? 'Delete role' : role ? readOnly ? 'Role access' : 'Edit role' : 'Add a role'}</h2></div><button type="button" className="adm-icon-button" aria-label="Close role editor" onClick={close} disabled={busy}><X size={20} /></button></div>
    {error && <div className="adm-alert adm-alert-error" role="alert"><div>{error.message}{Object.entries(error.errors).filter(([field]) => field !== 'name').map(([field, details]) => <p key={field}>{details.join(' ')}</p>)}</div>{error.status === 409 && role && <button type="button" className="adm-button adm-button-secondary" disabled={busy} onClick={reload}><RefreshCw size={15} /> Reload role</button>}</div>}
    {deleting && role ? <form onSubmit={deleteRole}>
      <p className="adm-dialog-description">Delete <strong>{role.name}</strong>? {role.assignedCount ? `${role.assignedCount} ${role.assignedCount === 1 ? 'person will lose the access this role provides' : 'people will lose the access this role provides'}. Their accounts and other roles will stay unchanged.` : 'No people are currently assigned this role.'}</p>
      <label className="adm-field"><span>Type <strong>{role.groupName}</strong> to confirm</span><input autoFocus autoComplete="off" required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
      <div className="adm-dialog-actions"><button type="button" className="adm-button adm-button-secondary" onClick={() => { setDeleting(false); setConfirmation(''); setError(null); }} disabled={busy}>Cancel deletion</button><button type="submit" className="adm-button adm-button-danger" disabled={busy || confirmation !== role.groupName}>{busy ? <LoaderCircle size={17} className="adm-spin" /> : <Trash2 size={17} />} Delete role</button></div>
    </form> : <form onSubmit={submit}>
      <p className="adm-dialog-description">{role?.isSystem ? 'This ready-made role is part of the system. Its main access is set for you.' : 'Choose what people with this role can do. Changes apply to everyone assigned this role.'}</p>
      {readOnly && <div className="adm-alert adm-alert-info"><LockKeyhole size={18} /><span>{role?.isSystem ? 'Only a system administrator can change advanced access for this role.' : 'This role includes protected system permissions. A system administrator can manage it.'}</span></div>}
      {role?.isSystem && <p className="adm-inline-note"><ShieldCheck size={17} /><span><strong>{role.name}:</strong> {role.description}{role.section === 'engagement' && ' This Engagement Centre job access is separate from the permissions shown below.'}</span></p>}
      <fieldset disabled={busy || readOnly || Boolean(role?.isSystem)} className="adm-fieldset">
        <label className="adm-field"><span>Name for this role <span className="adm-required">*</span></span><input autoFocus={!readOnly} required autoComplete="off" placeholder="e.g. News editor" maxLength={150} value={name} onChange={event => { setName(event.target.value); setError(null); }} aria-invalid={Boolean(error?.errors.name)} aria-describedby={error?.errors.name ? 'adm-role-name-error' : undefined} />{error?.errors.name && <span id="adm-role-name-error" className="adm-field-error">{error.errors.name.join(' ')}</span>}</label>
        <div className="adm-permissions-heading"><h3>Choose access by area</h3><span>{permissionCount} selected</span></div>
        <p className="adm-permissions-help">Select what people with this role can do in each area. Viewing the main pages is already included.</p>
        <div className="adm-permissions-table-wrap"><table className="adm-permissions-table"><thead><tr><th scope="col">Area</th>{ACTIONS.map(action => <th key={action.id} scope="col">{action.label}</th>)}</tr></thead><tbody>{sections.map(section => <tr key={section.id}><th scope="row"><strong>{section.name}</strong><small>{section.description}</small></th>{ACTIONS.map(action => {
          const permission = section.permissions.find(item => item.action === action.id);
          return <td key={action.id} data-label={action.label}>{permission ? <label className="adm-permission-check"><input type="checkbox" aria-label={`${action.label} ${section.name}`} checked={permission.baseline || selected.includes(permission.id)} disabled={permission.baseline} onChange={event => toggle(permission.id, event.target.checked)} />{permission.baseline && <span>Included</span>}</label> : <span className="adm-permission-unavailable" aria-label={`${action.label} is not available for ${section.name}`}>—</span>}</td>;
        })}</tr>)}</tbody></table></div>
      </fieldset>
      {canManageNativePermissions && <details className="adm-panel adm-advanced adm-role-advanced">
        <summary><LockKeyhole size={17} /> Advanced permissions</summary>
        <p className="adm-help">Optional permissions for managing system records. Most roles do not need these.</p>
        <DjangoPermissionsPicker permissions={nativePermissions} selected={nativeSelected} onChange={setNativeSelected} disabled={busy || readOnly} label="Extra system permissions" help="These permissions are separate from the access areas above." />
      </details>}
      <p className="adm-inline-note"><Info size={17} /><span>Some actions need more than one permission. Publishing a leadership message needs Add and Edit; replacing a whole training plan needs Add, Edit and Delete.</span></p>
      {Boolean(role?.unmanagedPermissions?.length && !canManageNativePermissions) && <div className="adm-inline-note"><LockKeyhole size={17} /><span><strong>Additional permissions are kept unchanged.</strong> {role!.unmanagedPermissions.map(permission => permission.name).join(', ')}.</span></div>}
      {role && !readOnly && <p className="adm-inline-note"><Info size={17} /><span>Saving updates access for {role.assignedCount} assigned {role.assignedCount === 1 ? 'person' : 'people'}.</span></p>}
      <p className="adm-data-note"><ShieldCheck size={15} /> Changes apply to everyone assigned this role.</p>
      <div className="adm-role-dialog-footer">{role?.canDelete && <button type="button" className="adm-button adm-button-danger-quiet" disabled={busy} onClick={beginDelete}><Trash2 size={16} /> Delete role</button>}<div className="adm-button-row"><button type="button" className="adm-button adm-button-secondary" onClick={close} disabled={busy}>{readOnly ? 'Close' : 'Cancel'}</button>{!readOnly && <button type="submit" className="adm-button adm-button-primary" disabled={busy || !name.trim() || Boolean(role && !dirty)}>{busy ? <LoaderCircle size={17} className="adm-spin" /> : <Check size={17} />}{busy ? 'Saving…' : role ? 'Save role' : 'Create role'}</button>}</div></div>
    </form>}
  </dialog>;
}
