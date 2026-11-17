import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronDown, LockKeyhole, Search, X } from 'lucide-react';
import ModalPortal from '../../components/feature/ModalPortal';

export type RoleOption = {
  id: string;
  name: string;
  groupName: string;
  description: string;
  included?: boolean;
  locked?: boolean;
  note?: string;
};

type Props = {
  options: RoleOption[];
  selected: string[];
  disabled?: boolean;
  invalid?: boolean;
  onChange: (roles: string[]) => void;
};

export default function RolesPicker({ options, selected, disabled, invalid, onChange }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const picked = options.filter(option => selected.includes(option.id));
  const filtered = options.filter(option => `${option.name} ${option.groupName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function close(restoreFocus = false) {
    setOpen(false);
    setQuery('');
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  useEffect(() => {
    if (!open || !menu) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !menu.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, menu]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const height = viewport?.height || window.innerHeight;
      const width = viewport?.width || window.innerWidth;
      const below = top + height - rect.bottom - 14;
      const above = rect.top - top - 14;
      const upwards = below < 280 && above > below;
      setPosition({
        left: Math.max(8, Math.min(rect.left, width - Math.min(rect.width, width - 16) - 8)),
        width: Math.min(rect.width, width - 16),
        maxHeight: Math.max(100, Math.min(410, upwards ? above : below)),
        ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open]);

  function toggle(option: RoleOption) {
    if (disabled || option.locked || option.included) return;
    onChange(selected.includes(option.id) ? selected.filter(value => value !== option.id) : [...selected, option.id]);
  }

  return <div className="adm-roles-picker" ref={root}>
    <button ref={trigger} type="button" className={`adm-roles-trigger ${open ? 'is-open' : ''}`} aria-label="Select roles" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} aria-describedby={`${id}-help`} aria-invalid={invalid || undefined} disabled={disabled}
      onClick={() => { if (open) close(); else { setQuery(''); setOpen(true); } }}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      <span>{picked.length === 1 ? picked[0].name : picked.length ? `${picked.length} roles selected` : 'Select roles'}</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    <p className="adm-role-picker-help" id={`${id}-help`}>Choose one or more roles for this person.</p>
    {picked.length > 0 && <div className="adm-selected-roles" role="group" aria-label="Selected roles">{picked.map(option => <span key={option.id} className="adm-selected-role">
      <span title={`Django Group: ${option.groupName}`}>{option.name}</span>{option.locked || option.included ? <LockKeyhole size={12} aria-label={option.note || 'Protected role'} /> : <button type="button" aria-label={`Remove ${option.name}`} disabled={disabled} onClick={() => toggle(option)}><X size={13} aria-hidden="true" /></button>}
    </span>)}</div>}
    {open && position && !disabled && <ModalPortal><div ref={setMenu} id={`${id}-menu`} role="dialog" aria-label="Choose roles" className="adm-role-menu" style={position}>
      <label className="adm-role-menu-search"><Search size={16} aria-hidden="true" /><input type="search" autoFocus aria-label="Search roles" placeholder="Search roles…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter') event.preventDefault();
        if (event.key === 'ArrowDown') { event.preventDefault(); menu?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)')?.focus(); }
      }} /></label>
      <div className="adm-role-menu-options" role="group" aria-label="Available roles">
        {filtered.map(option => <label className={`adm-role-menu-option ${selected.includes(option.id) || option.included ? 'is-selected' : ''} ${option.locked || option.included ? 'is-locked' : ''}`} key={option.id}>
          <input type="checkbox" checked={selected.includes(option.id) || Boolean(option.included)} disabled={disabled || option.locked || option.included} onChange={() => toggle(option)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); toggle(option); } }} />
          <span><strong>{option.name}</strong>{option.name !== option.groupName && <small className="adm-role-group-name">Django Group: {option.groupName}</small>}{option.note && <small>{option.note}</small>}</span>
        </label>)}
        {filtered.length === 0 && <p className="adm-role-menu-empty" role="status">No roles match your search.</p>}
      </div>
      <div className="adm-role-menu-footer"><span aria-live="polite">{picked.length} selected</span><button type="button" onClick={() => close(true)}><Check size={14} aria-hidden="true" /> Done</button></div>
    </div></ModalPortal>}
  </div>;
}
