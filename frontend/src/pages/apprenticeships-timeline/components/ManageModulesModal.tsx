import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogModule, KsbProfile, SessionKsbMapping } from '../types';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface Props {
  modules: CatalogModule[];
  ksbProfiles?: KsbProfile[];
  onAdd: (mod: Omit<CatalogModule, 'id'>) => Promise<void>;
  onUpdate: (mod: CatalogModule) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
  initialEditModuleId?: number | null;
}

function contrastColor(hex: string): string {
  const h = (hex || '#4A6DB0').replace('#', '');
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1F2937' : '#ffffff';
}

interface EditState {
  id: number | null;
  name: string;
  colour: string;
  sessions: string;
  notes: string;
  sessionNames: string[];
  sessionDescriptions: string[];
  sessionKsbMappings: SessionKsbMapping[];
}

function emptyEdit(): EditState {
  return { id: null, name: '', colour: '#4A6DB0', sessions: '12', notes: '', sessionNames: [], sessionDescriptions: [], sessionKsbMappings: [] };
}

function editStateFromModule(m: CatalogModule): EditState {
  return {
    id: m.id,
    name: m.name,
    colour: m.colour || '#4A6DB0',
    sessions: m.sessions || '',
    notes: m.notes || '',
    sessionNames: m.sessionNames ? [...m.sessionNames] : [],
    sessionDescriptions: m.sessionDescriptions ? [...m.sessionDescriptions] : [],
    sessionKsbMappings: normalizeSessionKsbMappings(m.sessionKsbMappings, parseSessionCount(m.sessions)),
  };
}

function parseSessionCount(value: string | number | undefined): number {
  const count = parseInt(String(value || ''), 10);
  return Number.isNaN(count) || count < 1 ? 0 : count;
}

function emptySessionKsbMapping(): SessionKsbMapping {
  return { knowledgeCodes: [], skillCodes: [], behaviourCodes: [] };
}

function normalizeKsbCodes(value: unknown, prefix: 'K' | 'S' | 'B'): string[] {
  if (!Array.isArray(value)) return [];
  const pattern = new RegExp(`^${prefix}\\d+$`, 'i');
  const seen = new Set<string>();
  return value.reduce<string[]>((codes, item) => {
    const code = String(item || '').trim().toUpperCase();
    if (!code || seen.has(code) || !pattern.test(code)) return codes;
    seen.add(code);
    codes.push(code);
    return codes;
  }, []);
}

function normalizeSessionKsbMappings(value: unknown, count = 0): SessionKsbMapping[] {
  const raw = Array.isArray(value) ? value : [];
  const length = Math.max(count, raw.length);
  return Array.from({ length }, (_, index) => {
    const item = raw[index];
    const record = item && typeof item === 'object' ? item as Partial<SessionKsbMapping> : {};
    return {
      knowledgeCodes: normalizeKsbCodes(record.knowledgeCodes, 'K'),
      skillCodes: normalizeKsbCodes(record.skillCodes, 'S'),
      behaviourCodes: normalizeKsbCodes(record.behaviourCodes, 'B'),
    };
  });
}

function countNamedSessions(names: string[] | undefined, count: number): number {
  return Array.from({ length: count }, (_, i) => names?.[i]?.trim() || '').filter(Boolean).length;
}

function sessionPreviewItems(names: string[] | undefined, count: number): string[] {
  return Array.from({ length: Math.min(count, 4) }, (_, i) => names?.[i]?.trim() || `Session ${i + 1} not named`);
}

type KsbCodeField = 'knowledgeCodes' | 'skillCodes' | 'behaviourCodes';
type KsbProfileCodeOption = { code: string; profileName: string };

function buildKsbDescriptionLookup(profiles: KsbProfile[] = []): Record<string, string> {
  const lookup: Record<string, string> = {};
  profiles.forEach(profile => {
    (profile.ksbItems || []).forEach(item => {
      const code = item.code || `${item.type}${item.number}`;
      if (code && item.description && !lookup[code.toUpperCase()]) {
        lookup[code.toUpperCase()] = item.description;
      }
    });
  });
  return lookup;
}

function buildKsbProfileCodeOptions(profiles: KsbProfile[] = []): Record<'K' | 'S' | 'B', KsbProfileCodeOption[]> {
  const buckets: Record<'K' | 'S' | 'B', KsbProfileCodeOption[]> = { K: [], S: [], B: [] };
  const seen: Record<'K' | 'S' | 'B', Set<string>> = { K: new Set(), S: new Set(), B: new Set() };

  profiles.forEach(profile => {
    (['K', 'S', 'B'] as const).forEach(prefix => {
      const codes = prefix === 'K' ? profile.knowledgeCodes : prefix === 'S' ? profile.skillCodes : profile.behaviourCodes;
      (codes || []).forEach(rawCode => {
        const code = String(rawCode || '').trim().toUpperCase();
        const key = `${code}|${profile.name}`;
        if (!code || seen[prefix].has(key)) return;
        seen[prefix].add(key);
        buckets[prefix].push({ code, profileName: profile.name || 'KSB Profile' });
      });
    });
  });

  return buckets;
}

function KsbCodeInput({
  label,
  placeholder,
  prefix,
  value,
  codeDescriptions = {},
  onChange,
}: {
  label: string;
  placeholder: string;
  prefix: 'K' | 'S' | 'B';
  value: string[];
  codeDescriptions?: Record<string, string>;
  onChange: (codes: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const tone = prefix === 'K'
    ? { label: 'bg-sky-600 text-white', border: 'border-sky-200 focus-within:border-sky-400', chip: 'border-sky-200 bg-sky-50 text-sky-800' }
    : prefix === 'S'
      ? { label: 'bg-emerald-600 text-white', border: 'border-emerald-200 focus-within:border-emerald-400', chip: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
      : { label: 'bg-amber-500 text-white', border: 'border-amber-200 focus-within:border-amber-400', chip: 'border-amber-200 bg-amber-50 text-amber-800' };

  const addDraftCodes = () => {
    const parts = draft.split(/[,\s]+/).map(item => item.trim()).filter(Boolean);
    if (!parts.length) {
      setDraft('');
      setError('');
      return;
    }
    const valid = normalizeKsbCodes(parts, prefix);
    const invalid = parts.some(part => !new RegExp(`^${prefix}\\d+$`, 'i').test(part));
    onChange(normalizeKsbCodes([...value, ...valid], prefix));
    setDraft('');
    setError(invalid ? `${prefix} codes need ${prefix} followed by a number.` : '');
  };

  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        <span className={`flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-extrabold leading-none ${tone.label}`}>
          {prefix}
        </span>
        <span>{label}</span>
      </label>
      <div className={`min-h-10 rounded-lg border bg-white px-2 py-1.5 transition-colors ${tone.border}`}>
        <div className="flex flex-wrap items-center gap-1">
          {value.map(code => (
            <span key={code} title={codeDescriptions[code] || code} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-extrabold leading-none ${tone.chip}`}>
              {code}
              <button type="button" aria-label={`Remove ${code}`} onClick={() => onChange(value.filter(item => item !== code))} className="text-current opacity-45 hover:opacity-100">
                <i className="ri-close-line text-[10px]" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={draft}
            onChange={event => {
              setDraft(event.target.value.toUpperCase());
              if (error) setError('');
            }}
            onBlur={addDraftCodes}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addDraftCodes();
              }
            }}
            placeholder={value.length ? `Add ${prefix}...` : placeholder}
            className="min-w-20 flex-1 bg-transparent px-1 py-0.5 text-xs font-semibold text-gray-700 placeholder:text-gray-300 focus:outline-none"
          />
        </div>
      </div>
      {value.some(code => codeDescriptions[code]) && (
        <div className="mt-1 space-y-0.5">
          {value.filter(code => codeDescriptions[code]).map(code => (
            <p key={code} className="line-clamp-2 text-[10px] font-medium text-gray-400">
              <span className="font-extrabold text-gray-500">{code}</span> {codeDescriptions[code]}
            </p>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-[10px] font-semibold text-red-500">{error}</p>}
    </div>
  );
}

function KsbProfilePicker({
  mapping,
  codeDescriptions = {},
  profileCodes,
  onAddCode,
}: {
  mapping: SessionKsbMapping;
  codeDescriptions?: Record<string, string>;
  profileCodes?: Record<'K' | 'S' | 'B', KsbProfileCodeOption[]>;
  onAddCode: (field: KsbCodeField, code: string) => void;
}) {
  const sections = [
    { title: 'Knowledge', prefix: 'K' as const, field: 'knowledgeCodes' as const, selected: mapping.knowledgeCodes, codes: profileCodes?.K || [], tone: 'border-sky-200 bg-sky-50 text-sky-800' },
    { title: 'Skills', prefix: 'S' as const, field: 'skillCodes' as const, selected: mapping.skillCodes, codes: profileCodes?.S || [], tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { title: 'Behaviours', prefix: 'B' as const, field: 'behaviourCodes' as const, selected: mapping.behaviourCodes, codes: profileCodes?.B || [], tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  ];

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        {sections.map(section => {
          const available = section.codes.filter(option => !section.selected.includes(option.code));
          return (
            <div key={section.prefix} className="rounded-lg bg-white p-2">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{section.title}</p>
              {available.length ? (
                <div className="flex flex-wrap gap-1">
                  {available.map(option => (
                    <button
                      key={`${option.profileName}-${option.code}`}
                      type="button"
                      title={`${option.profileName}${codeDescriptions[option.code] ? ` - ${codeDescriptions[option.code]}` : ''}`}
                      onClick={() => onAddCode(section.field, option.code)}
                      className={`flex max-w-full flex-col items-start rounded-md border px-2 py-1 text-left transition-all hover:shadow-sm ${section.tone}`}
                    >
                      <span className="text-[10px] font-extrabold leading-none">+ {option.code}</span>
                      <span className="mt-0.5 max-w-[8rem] truncate text-[9px] font-bold opacity-65">{option.profileName}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] font-semibold text-gray-300">All added</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KsbSessionMappingRows({
  sessionCount,
  mappings,
  sessionNames,
  sessionDescriptions,
  accentColor,
  codeDescriptions,
  profileCodes,
  onChange,
  onSessionNameChange,
  onSessionDescriptionChange,
}: {
  sessionCount: number;
  mappings: SessionKsbMapping[];
  sessionNames?: string[];
  sessionDescriptions?: string[];
  accentColor: string;
  codeDescriptions?: Record<string, string>;
  profileCodes?: Record<'K' | 'S' | 'B', KsbProfileCodeOption[]>;
  onChange: (sessionIndex: number, field: KsbCodeField, codes: string[]) => void;
  onSessionNameChange: (sessionIndex: number, value: string) => void;
  onSessionDescriptionChange: (sessionIndex: number, value: string) => void;
}) {
  const normalizedMappings = normalizeSessionKsbMappings(mappings, sessionCount);
  const [openPickerIndex, setOpenPickerIndex] = useState<number | null>(null);
  const sourceProfileNames = Array.from(new Set(
    (['K', 'S', 'B'] as const).flatMap(prefix => (profileCodes?.[prefix] || []).map(option => option.profileName)),
  ));
  const sourceLabel = sourceProfileNames.length === 1
    ? sourceProfileNames[0]
    : sourceProfileNames.length > 1
      ? `${sourceProfileNames.length} profiles`
      : '';

  return (
    <div className="space-y-3">
      {Array.from({ length: sessionCount }, (_, i) => {
        const mapping = normalizedMappings[i] || emptySessionKsbMapping();
        return (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.3fr)]">
              <div className="flex items-start gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: `${accentColor}16`, color: accentColor }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Session {i + 1}</span>
                  <span className={`text-[11px] font-semibold ${sessionNames?.[i]?.trim() ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {sessionNames?.[i]?.trim() ? 'Named' : 'Not named yet'}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder={`Session ${i + 1} name`}
                  value={sessionNames?.[i] ?? ''}
                  onChange={event => onSessionNameChange(i, event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={sessionDescriptions?.[i] ?? ''}
                  onChange={event => onSessionDescriptionChange(i, event.target.value)}
                  className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenPickerIndex(openPickerIndex === i ? null : i)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-gray-500 transition-all hover:border-gray-300 hover:bg-gray-50"
                  >
                    <i className="ri-add-circle-line" />
                    Add from profile
                  </button>
                  {sourceLabel && (
                    <span className="max-w-full truncate rounded-full bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-500">
                      Source: {sourceLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <KsbCodeInput label="Knowledge" placeholder="K1, K3" prefix="K" value={mapping.knowledgeCodes} codeDescriptions={codeDescriptions} onChange={codes => onChange(i, 'knowledgeCodes', codes)} />
                <KsbCodeInput label="Skills" placeholder="S2, S5" prefix="S" value={mapping.skillCodes} codeDescriptions={codeDescriptions} onChange={codes => onChange(i, 'skillCodes', codes)} />
                <KsbCodeInput label="Behaviours" placeholder="B1, B4" prefix="B" value={mapping.behaviourCodes} codeDescriptions={codeDescriptions} onChange={codes => onChange(i, 'behaviourCodes', codes)} />
              </div>
            </div>
            {openPickerIndex === i && (
              <KsbProfilePicker
                mapping={mapping}
                codeDescriptions={codeDescriptions}
                profileCodes={profileCodes}
                onAddCode={(field, code) => onChange(i, field, normalizeKsbCodes([...(mapping[field] || []), code], field === 'knowledgeCodes' ? 'K' : field === 'skillCodes' ? 'S' : 'B'))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ManageModulesModal({ modules, ksbProfiles = [], onAdd, onUpdate, onDelete, onClose, initialEditModuleId = null }: Props) {
  const [editing, setEditing] = useState<EditState | null>(() => {
    const target = initialEditModuleId === null ? undefined : modules.find(module => module.id === initialEditModuleId);
    return target ? editStateFromModule(target) : null;
  });
  const [editingSnapshot, setEditingSnapshot] = useState(() => {
    const target = initialEditModuleId === null ? undefined : modules.find(module => module.id === initialEditModuleId);
    return target ? JSON.stringify(editStateFromModule(target)) : '';
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [ksbEditorOpen, setKsbEditorOpen] = useState(false);
  const codeDescriptions = useMemo(() => buildKsbDescriptionLookup(ksbProfiles), [ksbProfiles]);
  const profileCodes = useMemo(() => buildKsbProfileCodeOptions(ksbProfiles), [ksbProfiles]);

  const openEdit = (m: CatalogModule) => {
    const next = editStateFromModule(m);
    setEditing(next);
    setEditingSnapshot(JSON.stringify(next));
    setError('');
  };

  const closeEditing = async () => {
    if (editing && JSON.stringify(editing) !== editingSnapshot) {
      const result = await kbcSwal.fire({
        title: 'Discard Module Changes?',
        html: 'If you close now, the module catalogue changes you entered will be lost.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Discard Changes',
        cancelButtonText: 'Keep Editing',
        reverseButtons: true,
        focusCancel: true,
      });
      if (!result.isConfirmed) return;
    }
    setEditing(null);
    setEditingSnapshot('');
    setKsbEditorOpen(false);
  };

  const sessionCount = useMemo(() => {
    if (!editing) return 0;
    return parseSessionCount(editing.sessions);
  }, [editing]);

  const namedSessionCount = editing ? countNamedSessions(editing.sessionNames, sessionCount) : 0;
  const mappedKsbCount = editing
    ? normalizeSessionKsbMappings(editing.sessionKsbMappings, sessionCount).reduce(
        (total, mapping) => total + mapping.knowledgeCodes.length + mapping.skillCodes.length + mapping.behaviourCodes.length,
        0,
      )
    : 0;

  const changeSessionCount = (delta: number) => {
    setEditing(prev => {
      if (!prev) return prev;
      const nextCount = Math.max(1, parseSessionCount(prev.sessions) + delta);
      return { ...prev, sessions: String(nextCount), sessionKsbMappings: normalizeSessionKsbMappings(prev.sessionKsbMappings, nextCount) };
    });
  };

  const updateSessionCountValue = (value: string) => {
    setEditing(prev => {
      if (!prev) return prev;
      const nextCount = Math.max(1, parseSessionCount(value) || 1);
      return { ...prev, sessions: value, sessionKsbMappings: normalizeSessionKsbMappings(prev.sessionKsbMappings, nextCount) };
    });
  };

  const updateSessionName = (idx: number, value: string) => {
    setEditing(prev => {
      if (!prev) return prev;
      const next = [...prev.sessionNames];
      next[idx] = value;
      return { ...prev, sessionNames: next };
    });
  };

  const updateSessionDescription = (idx: number, value: string) => {
    setEditing(prev => {
      if (!prev) return prev;
      const next = [...prev.sessionDescriptions];
      next[idx] = value;
      return { ...prev, sessionDescriptions: next };
    });
  };

  const updateSessionKsbMapping = (sessionIndex: number, field: KsbCodeField, value: string[]) => {
    setEditing(prev => {
      if (!prev) return prev;
      const count = Math.max(1, parseSessionCount(prev.sessions) || 1);
      const nextMappings = normalizeSessionKsbMappings(prev.sessionKsbMappings, count);
      const prefix = field === 'knowledgeCodes' ? 'K' : field === 'skillCodes' ? 'S' : 'B';
      nextMappings[sessionIndex] = {
        ...(nextMappings[sessionIndex] || emptySessionKsbMapping()),
        [field]: normalizeKsbCodes(value, prefix),
      };
      return { ...prev, sessionKsbMappings: nextMappings };
    });
  };

  const handleDelete = async (m: CatalogModule) => {
    const result = await kbcSwal.fire({
      title: 'Delete Module?',
      html: `<strong>${m.name}</strong> will be permanently removed from the catalogue.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });
    if (!result.isConfirmed) return;
    setDeletingId(m.id);
    try {
      await onDelete(m.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setError('Module name is required'); return; }
    setSaving(true);
    const count = Math.max(0, parseInt(editing.sessions, 10) || 0);
    const names = Array.from({ length: count }, (_, i) => editing.sessionNames[i] ?? '');
    const descs = Array.from({ length: count }, (_, i) => editing.sessionDescriptions[i] ?? '');
    const ksbMappings = normalizeSessionKsbMappings(editing.sessionKsbMappings, count);
    try {
      if (editing.id === null) {
        await onAdd({ name: editing.name.trim(), colour: editing.colour, sessions: editing.sessions, notes: editing.notes.trim(), sessionNames: names, sessionDescriptions: descs, sessionKsbMappings: ksbMappings });
      } else {
        await onUpdate({ id: editing.id, name: editing.name.trim(), colour: editing.colour, sessions: editing.sessions, notes: editing.notes.trim(), sessionNames: names, sessionDescriptions: descs, sessionKsbMappings: ksbMappings });
      }
      setEditing(null);
      setKsbEditorOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/28 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxWidth: 680, maxHeight: '88vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-sm tracking-wide">View Added Modules</h2>
            <p className="text-white/60 text-xs mt-0.5">{modules.length} module{modules.length !== 1 ? 's' : ''} in the catalogue</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-base" />
          </button>
        </div>

        {/* Module list */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {modules.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
              No modules yet. Click <strong>Add Module</strong> below to create the first one.
            </div>
          )}
          {modules.map(m => {
            const isDeleting = deletingId === m.id;
            const totalSessions = parseSessionCount(m.sessions);
            const namedSessions = countNamedSessions(m.sessionNames, totalSessions);
            const previewSessions = sessionPreviewItems(m.sessionNames, totalSessions);
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-opacity"
                style={{ opacity: isDeleting ? 0.4 : 1 }}
              >
                <span className="w-3 h-9 rounded-sm shrink-0" style={{ background: m.colour || '#4A6DB0' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-800 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {m.sessions ? `${m.sessions} sessions` : 'No sessions set'}
                    {totalSessions ? ` - ${namedSessions}/${totalSessions} named` : ''}
                    {m.notes ? ` · ${m.notes}` : ''}
                  </p>
                </div>
                <span
                  className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: `${m.colour || '#4A6DB0'}18`, color: m.colour || '#4A6DB0' }}
                >
                  {m.sessions || '—'}
                </span>
                <button
                  onClick={() => openEdit(m)}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: '#1B2A4A' }}
                >
                  <i className="ri-edit-line" /> Edit
                </button>
                <button
                  onClick={() => void handleDelete(m)}
                  disabled={isDeleting}
                  className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer transition-all disabled:opacity-40"
                  style={isDeleting ? { color: '#EF4444', background: '#FEF2F2' } : { color: '#D1D5DB' }}
                  onMouseEnter={e => { if (!isDeleting) { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; } }}
                  onMouseLeave={e => { if (!isDeleting) { (e.currentTarget as HTMLButtonElement).style.color = '#D1D5DB'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; } }}
                >
                  {isDeleting
                    ? <i className="ri-loader-4-line text-sm animate-spin" />
                    : <i className="ri-delete-bin-line text-sm" />
                  }
                </button>
                {totalSessions > 0 && (
                  <div className="w-full pl-6 flex flex-wrap gap-1.5">
                    {previewSessions.map((item, idx) => (
                      <span
                        key={`${m.id}-session-preview-${idx}`}
                        className="max-w-full truncate rounded-md px-2 py-1 text-[11px] font-semibold"
                        style={{ background: `${m.colour || '#4A6DB0'}10`, color: item.endsWith('not named') ? '#9CA3AF' : (m.colour || '#4A6DB0') }}
                      >
                        {idx + 1}. {item}
                      </span>
                    ))}
                    {totalSessions > previewSessions.length && (
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-400">
                        +{totalSessions - previewSessions.length} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <span className="text-xs text-gray-400">{modules.length} module{modules.length !== 1 ? 's' : ''} total</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors">
              Close
            </button>
            <button
              onClick={() => { const next = emptyEdit(); setEditing(next); setEditingSnapshot(JSON.stringify(next)); setError(''); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90"
              style={{ background: '#1B2A4A' }}
            >
              <i className="ri-add-line" /> Add Module
            </button>
          </div>
        </div>
      </div>

      {/* Edit / Add panel */}
      {editing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/20" onClick={() => { void closeEditing(); }} />
          <div className="relative bg-white rounded-xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxWidth: 560, maxHeight: '92vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ background: '#1B2A4A' }}>
              <div>
                <h3 className="text-white font-extrabold text-sm tracking-wide">{editing.id === null ? 'Add Module' : 'Edit Module'}</h3>
                <p className="text-white/60 text-xs mt-0.5">Changes apply to the module catalogue</p>
              </div>
              <button onClick={() => { void closeEditing(); }} className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                <i className="ri-close-line text-base" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4 bg-gray-50">
              {/* Preview */}
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                <span className="w-3 h-8 rounded-sm shrink-0" style={{ background: editing.colour }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-800">{editing.name.trim() || 'Untitled Module'}</p>
                  <p className="text-xs text-gray-400">{editing.sessions ? `${editing.sessions} sessions` : 'No sessions'}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: editing.colour, color: contrastColor(editing.colour) }}>
                  {editing.sessions || '—'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Module Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={e => { setEditing(prev => prev ? { ...prev, name: e.target.value } : prev); setError(''); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: error ? '#EF4444' : '#D1D5DB' }}
                  autoFocus
                />
                {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Number of Sessions</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => changeSessionCount(-1)} className="h-10 w-10 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer">
                      <i className="ri-subtract-line" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={editing.sessions}
                      onChange={e => updateSessionCountValue(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                    />
                    <button type="button" onClick={() => changeSessionCount(1)} className="h-10 w-10 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer">
                      <i className="ri-add-line" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Colour</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white h-10">
                    <input
                      type="color"
                      value={editing.colour}
                      onChange={e => setEditing(prev => prev ? { ...prev, colour: e.target.value } : prev)}
                      className="h-6 w-8 rounded cursor-pointer border-0 p-0"
                    />
                    <span className="text-xs text-gray-500 font-mono">{editing.colour}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <textarea
                  value={editing.notes}
                  onChange={e => setEditing(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none bg-white"
                  placeholder="Any notes about this module..."
                />
              </div>

              <button
                type="button"
                onClick={() => setKsbEditorOpen(true)}
                className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${editing.colour}14`, color: editing.colour }}>
                  <i className="ri-links-line text-base" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-800">Session KSB Mapping</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: `${editing.colour}12`, color: editing.colour }}>
                      Optional
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[11px] font-medium text-gray-400">
                    {mappedKsbCount > 0 ? `${mappedKsbCount} KSB code${mappedKsbCount === 1 ? '' : 's'} mapped` : 'Map the KSBs covered by each session.'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold transition-colors group-hover:bg-gray-50" style={{ color: editing.colour }}>
                  Open
                  <i className="ri-arrow-right-s-line text-base" />
                </span>
              </button>

            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-white shrink-0">
              <button onClick={() => { void closeEditing(); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: '#1B2A4A' }}
              >
                <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>

          </div>
        </div>
      )}
      {editing && ksbEditorOpen && createPortal(
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[3px]">
          <button type="button" aria-label="Close KSB editor" className="absolute inset-0 cursor-default" onClick={() => setKsbEditorOpen(false)} />
          <div className="relative flex h-[min(88vh,900px)] w-[min(1180px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-4" style={{ background: '#1B2A4A' }}>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white/60">{editing.name.trim() || 'Untitled Module'}</p>
                <h3 className="text-lg font-extrabold tracking-wide text-white">Session KSB Mapping</h3>
              </div>
              <button onClick={() => setKsbEditorOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 bg-white px-6 py-4">
              <span className="rounded-full px-3 py-1.5 text-xs font-extrabold" style={{ background: `${editing.colour}12`, color: editing.colour }}>
                {sessionCount} session{sessionCount === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-500">
                {mappedKsbCount > 0 ? `${mappedKsbCount} code${mappedKsbCount === 1 ? '' : 's'} mapped` : 'No KSBs mapped yet'}
              </span>
              <p className="w-full text-xs font-medium text-gray-400 sm:w-auto">
                Map the KSBs covered by each session, for example K1, K3, S2, B1.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-5">
              <KsbSessionMappingRows
                sessionCount={sessionCount}
                mappings={normalizeSessionKsbMappings(editing.sessionKsbMappings, sessionCount)}
                sessionNames={editing.sessionNames}
                sessionDescriptions={editing.sessionDescriptions}
                accentColor={editing.colour}
                codeDescriptions={codeDescriptions}
                profileCodes={profileCodes}
                onChange={updateSessionKsbMapping}
                onSessionNameChange={updateSessionName}
                onSessionDescriptionChange={updateSessionDescription}
              />
            </div>

            <div className="flex shrink-0 items-center justify-end border-t border-gray-200 bg-white px-6 py-4">
              <button type="button" onClick={() => setKsbEditorOpen(false)} className="rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90" style={{ background: '#1B2A4A' }}>
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
