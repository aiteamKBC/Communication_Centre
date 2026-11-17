import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { NativeDjangoPermission } from './api';

type Props = {
  permissions: NativeDjangoPermission[];
  selected: string[];
  onChange: (permissions: string[]) => void;
  disabled?: boolean;
  label: string;
  help: string;
};

export default function DjangoPermissionsPicker({ permissions, selected, onChange, disabled, label, help }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return permissions.filter(permission => !value || `${permission.name} ${permission.appLabel} ${permission.model} ${permission.id}`.toLocaleLowerCase().includes(value));
  }, [permissions, query]);
  const groups = useMemo(() => {
    const byApp = new Map<string, NativeDjangoPermission[]>();
    for (const permission of filtered) byApp.set(permission.appLabel, [...(byApp.get(permission.appLabel) || []), permission]);
    return [...byApp.entries()];
  }, [filtered]);

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...new Set([...selected, id])] : selected.filter(permission => permission !== id));
  }

  return <section className="adm-native-permissions" aria-label={label}>
    <div className="adm-native-permissions-heading"><div><strong>{label}</strong><p>{help}</p></div><span>{selected.length} selected</span></div>
    <label className="adm-native-permissions-search"><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search permissions or models" aria-label={`Search ${label}`} /></label>
    <div className="adm-native-permissions-list" role="group" aria-label={label}>
      {groups.map(([app, items]) => <section className="adm-native-permissions-app" key={app}>
        <h4>{app}</h4>
        {items.map(permission => <label key={permission.id} className="adm-native-permission">
          <input type="checkbox" checked={selected.includes(permission.id)} disabled={disabled} onChange={event => toggle(permission.id, event.target.checked)} />
          <span><strong>{permission.name}</strong><small>{permission.model} · {permission.id}</small></span>
        </label>)}
      </section>)}
      {filtered.length === 0 && <p className="adm-native-permissions-empty">No permissions match your search.</p>}
    </div>
  </section>;
}
