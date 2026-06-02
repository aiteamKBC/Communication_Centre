import { useMemo, useState } from 'react';
import type { KsbProfile } from '../types';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface Props {
  profiles: KsbProfile[];
  onCreate: (profile: Omit<KsbProfile, 'id'>) => Promise<KsbProfile | null>;
  onUpdate: (id: string, profile: Omit<KsbProfile, 'id'>) => Promise<KsbProfile | null>;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
}

const emptyProfile = (): Omit<KsbProfile, 'id'> => ({
  name: '',
  programmeName: '',
  description: '',
  knowledgeCodes: [],
  skillCodes: [],
  behaviourCodes: [],
  isActive: true,
});

function normalizeCodes(value: unknown, prefix: 'K' | 'S' | 'B'): string[] {
  const raw = Array.isArray(value) ? value : [];
  const pattern = new RegExp(`^${prefix}\\d+$`, 'i');
  const seen = new Set<string>();
  return raw.reduce<string[]>((codes, item) => {
    const code = String(item || '').trim().toUpperCase();
    if (!code || seen.has(code) || !pattern.test(code)) return codes;
    seen.add(code);
    codes.push(code);
    return codes;
  }, []);
}

function CodeChips({
  label,
  prefix,
  value,
  onChange,
}: {
  label: string;
  prefix: 'K' | 'S' | 'B';
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const tone = prefix === 'K'
    ? 'border-sky-200 bg-sky-50 text-sky-800'
    : prefix === 'S'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  const addDraft = () => {
    const parts = draft.split(/[,\s]+/).map(item => item.trim()).filter(Boolean);
    const invalid = parts.some(item => !new RegExp(`^${prefix}\\d+$`, 'i').test(item));
    onChange(normalizeCodes([...value, ...parts], prefix));
    setDraft('');
    setError(invalid ? `${prefix} codes need ${prefix} followed by a number.` : '');
  };

  return (
    <div>
      <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{label}</label>
      <div className="min-h-10 rounded-lg border border-gray-200 bg-white px-2 py-1.5 focus-within:border-kbc-navy">
        <div className="flex flex-wrap items-center gap-1">
          {value.map(code => (
            <span key={code} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-extrabold ${tone}`}>
              {code}
              <button type="button" aria-label={`Remove ${code}`} onClick={() => onChange(value.filter(item => item !== code))} className="opacity-50 hover:opacity-100">
                <i className="ri-close-line text-[10px]" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={event => {
              setDraft(event.target.value.toUpperCase());
              if (error) setError('');
            }}
            onBlur={addDraft}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addDraft();
              }
            }}
            placeholder={value.length ? `Add ${prefix}...` : `${prefix}1, ${prefix}2...`}
            className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-xs font-semibold text-gray-700 placeholder:text-gray-300 focus:outline-none"
          />
        </div>
      </div>
      {error && <p className="mt-1 text-[10px] font-bold text-red-500">{error}</p>}
    </div>
  );
}

export default function KsbProfilesManager({ profiles, onCreate, onUpdate, onDelete, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id || null);
  const [draft, setDraft] = useState<Omit<KsbProfile, 'id'>>(profiles[0] ? { ...profiles[0] } : emptyProfile());
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(profile => (
      profile.name.toLowerCase().includes(q) ||
      profile.programmeName.toLowerCase().includes(q) ||
      [...profile.knowledgeCodes, ...profile.skillCodes, ...profile.behaviourCodes].some(code => code.toLowerCase().includes(q))
    ));
  }, [profiles, query]);

  const selectProfile = (profile: KsbProfile) => {
    setSelectedId(profile.id);
    setDraft({ ...profile });
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(emptyProfile());
  };

  const updateDraft = <K extends keyof Omit<KsbProfile, 'id'>>(key: K, value: Omit<KsbProfile, 'id'>[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      await kbcSwal.fire({ title: 'Profile Name Required', icon: 'warning', confirmButtonText: 'OK' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        name: draft.name.trim(),
        programmeName: draft.programmeName.trim(),
        description: draft.description.trim(),
        knowledgeCodes: normalizeCodes(draft.knowledgeCodes, 'K'),
        skillCodes: normalizeCodes(draft.skillCodes, 'S'),
        behaviourCodes: normalizeCodes(draft.behaviourCodes, 'B'),
      };
      const saved = selectedId ? await onUpdate(selectedId, payload) : await onCreate(payload);
      if (saved) {
        setSelectedId(saved.id);
        setDraft({ ...saved });
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedId) return;
    const result = await kbcSwal.fire({
      title: 'Delete KSB Profile?',
      html: 'Profiles already used by cohorts will be deactivated instead.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    const ok = await onDelete(selectedId);
    if (ok) startNew();
  };

  const counts = draft.knowledgeCodes.length + draft.skillCodes.length + draft.behaviourCodes.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[3px]">
      <button type="button" aria-label="Close KSB profiles" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="w-72 shrink-0 border-r border-gray-200 bg-gray-50">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-kbc-navy">KSB Profiles</h2>
                <p className="mt-0.5 text-xs font-medium text-gray-400">{profiles.length} profile{profiles.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={startNew} className="flex h-8 w-8 items-center justify-center rounded-lg bg-kbc-navy text-white">
                <i className="ri-add-line" />
              </button>
            </div>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search profiles" className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
          </div>
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-2">
            {filtered.map(profile => (
              <button key={profile.id} type="button" onClick={() => selectProfile(profile)} className="mb-1 w-full rounded-lg border px-3 py-2 text-left transition-all" style={{ borderColor: selectedId === profile.id ? '#1B2A4A' : '#E5E7EB', background: selectedId === profile.id ? '#F8FAFC' : '#fff' }}>
                <span className="block truncate text-xs font-extrabold text-gray-800">{profile.name}</span>
                <span className="mt-0.5 block truncate text-[11px] font-semibold text-gray-400">{profile.programmeName || 'No programme linked'}</span>
              </button>
            ))}
            {!filtered.length && <p className="p-4 text-center text-xs font-semibold text-gray-400">No profiles found.</p>}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-kbc-navy px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white/60">{selectedId ? 'Edit profile' : 'New profile'}</p>
              <h3 className="truncate text-base font-extrabold text-white">{draft.name || 'KSB Profile'}</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white">
              <i className="ri-close-line text-lg" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50 p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Profile name</label>
                <input value={draft.name} onChange={event => updateDraft('name', event.target.value)} placeholder="Marketing Executive Level 4 KSB" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Programme / standard</label>
                <input value={draft.programmeName} onChange={event => updateDraft('programmeName', event.target.value)} placeholder="Optional" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Notes</label>
              <textarea value={draft.description} onChange={event => updateDraft('description', event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <CodeChips label="Knowledge" prefix="K" value={draft.knowledgeCodes} onChange={codes => updateDraft('knowledgeCodes', codes)} />
              <CodeChips label="Skills" prefix="S" value={draft.skillCodes} onChange={codes => updateDraft('skillCodes', codes)} />
              <CodeChips label="Behaviours" prefix="B" value={draft.behaviourCodes} onChange={codes => updateDraft('behaviourCodes', codes)} />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-5 py-3">
            <span className="text-xs font-bold text-gray-400">{counts} required KSB code{counts === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              {selectedId && <button type="button" onClick={deleteSelected} className="rounded-lg px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Delete</button>}
              <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-kbc-navy px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
