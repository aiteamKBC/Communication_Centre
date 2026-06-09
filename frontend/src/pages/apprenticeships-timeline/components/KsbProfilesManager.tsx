import { useMemo, useState } from 'react';
import type { KsbProfile, KsbProfileItem } from '../types';
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
  ksbItems: [],
  knowledgeCodes: [],
  skillCodes: [],
  behaviourCodes: [],
  isActive: true,
});

function itemsFromProfile(profile: Pick<KsbProfile, 'ksbItems' | 'knowledgeCodes' | 'skillCodes' | 'behaviourCodes'>): KsbProfileItem[] {
  if (Array.isArray(profile.ksbItems)) {
    return profile.ksbItems.map(item => {
      const type = item.type === 'S' || item.type === 'B' ? item.type : 'K';
      const number = String(item.number || item.code?.replace(/^[KSB]/i, '') || '').replace(/\D+/g, '');
      return {
        type,
        number,
        code: number ? `${type}${parseInt(number, 10)}` : '',
        description: String(item.description || ''),
      };
    });
  }
  return [
    ...(profile.knowledgeCodes || []).map(code => ({ type: 'K' as const, number: code.replace(/^K/i, ''), code: code.toUpperCase(), description: '' })),
    ...(profile.skillCodes || []).map(code => ({ type: 'S' as const, number: code.replace(/^S/i, ''), code: code.toUpperCase(), description: '' })),
    ...(profile.behaviourCodes || []).map(code => ({ type: 'B' as const, number: code.replace(/^B/i, ''), code: code.toUpperCase(), description: '' })),
  ];
}

function normalizeItems(value: unknown): KsbProfileItem[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return raw.reduce<KsbProfileItem[]>((items, item) => {
    const record = item && typeof item === 'object' ? item as Partial<KsbProfileItem> : {};
    const type = String(record.type || '').toUpperCase();
    if (type !== 'K' && type !== 'S' && type !== 'B') return items;
    const number = String(record.number || record.code?.replace(/^[KSB]/i, '') || '').trim();
    if (!/^\d+$/.test(number)) return items;
    const code = `${type}${parseInt(number, 10)}`;
    if (seen.has(code)) return items;
    seen.add(code);
    items.push({ type, number: String(parseInt(number, 10)), code, description: String(record.description || '').trim() });
    return items;
  }, []);
}

function codesFromItems(items: KsbProfileItem[], type: 'K' | 'S' | 'B'): string[] {
  return normalizeItems(items).filter(item => item.type === type).map(item => item.code);
}

export default function KsbProfilesManager({ profiles, onCreate, onUpdate, onDelete, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id || null);
  const [draft, setDraft] = useState<Omit<KsbProfile, 'id'>>(profiles[0] ? { ...profiles[0], ksbItems: itemsFromProfile(profiles[0]) } : emptyProfile());
  const [draftSnapshot, setDraftSnapshot] = useState(() => JSON.stringify(profiles[0] ? { ...profiles[0], ksbItems: itemsFromProfile(profiles[0]) } : emptyProfile()));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(profile => (
      profile.name.toLowerCase().includes(q) ||
      profile.programmeName.toLowerCase().includes(q) ||
      [...profile.knowledgeCodes, ...profile.skillCodes, ...profile.behaviourCodes].some(code => code.toLowerCase().includes(q)) ||
      itemsFromProfile(profile).some(item => item.description.toLowerCase().includes(q))
    ));
  }, [profiles, query]);

  const profileReady = Boolean(draft.name.trim() && draft.programmeName.trim());
  const draftDirty = JSON.stringify(draft) !== draftSnapshot;

  const confirmDiscardDraft = async () => {
    if (!draftDirty) return true;
    const result = await kbcSwal.fire({
      title: 'Discard unsaved profile changes?',
      html: 'You have unsaved KSB Profile changes. Save them first, or discard them to continue.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Discard',
      cancelButtonText: 'Keep editing',
      reverseButtons: true,
    });
    return result.isConfirmed;
  };

  const selectProfile = async (profile: KsbProfile) => {
    if (!(await confirmDiscardDraft())) return;
    const next = { ...profile, ksbItems: itemsFromProfile(profile) };
    setSelectedId(profile.id);
    setDraft(next);
    setDraftSnapshot(JSON.stringify(next));
  };

  const startNew = async () => {
    if (!(await confirmDiscardDraft())) return;
    const next = emptyProfile();
    setSelectedId(null);
    setDraft(next);
    setDraftSnapshot(JSON.stringify(next));
  };

  const updateDraft = <K extends keyof Omit<KsbProfile, 'id'>>(key: K, value: Omit<KsbProfile, 'id'>[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const updateItem = (index: number, patch: Partial<KsbProfileItem>) => {
    setDraft(prev => {
      const items = [...itemsFromProfile(prev)];
      const current = items[index] || { type: 'K', number: '', code: '', description: '' };
      const next = { ...current, ...patch };
      const type = next.type === 'S' || next.type === 'B' ? next.type : 'K';
      const number = String(next.number || '').replace(/\D+/g, '');
      items[index] = { type, number, code: number ? `${type}${parseInt(number, 10)}` : '', description: next.description || '' };
      return { ...prev, ksbItems: items };
    });
  };

  const addItem = () => {
    if (!profileReady) {
      void kbcSwal.fire({ title: 'Complete profile details first', html: 'Please enter the Profile name and Programme / standard before adding KSB definitions.', icon: 'info', confirmButtonText: 'OK' });
      return;
    }
    setDraft(prev => ({ ...prev, ksbItems: [...itemsFromProfile(prev), { type: 'K', number: '', code: '', description: '' }] }));
  };

  const removeItem = (index: number) => {
    setDraft(prev => ({ ...prev, ksbItems: itemsFromProfile(prev).filter((_, itemIndex) => itemIndex !== index) }));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      await kbcSwal.fire({ title: 'Profile Name Required', icon: 'warning', confirmButtonText: 'OK' });
      return;
    }
    if (!draft.programmeName.trim()) {
      await kbcSwal.fire({ title: 'Programme Required', html: 'Please enter the Programme / standard before saving this KSB Profile.', icon: 'warning', confirmButtonText: 'OK' });
      return;
    }
    setSaving(true);
    let shouldClose = false;
    try {
      const ksbItems = normalizeItems(draft.ksbItems);
      const payload = {
        ...draft,
        name: draft.name.trim(),
        programmeName: draft.programmeName.trim(),
        description: draft.description.trim(),
        ksbItems,
        knowledgeCodes: codesFromItems(ksbItems, 'K'),
        skillCodes: codesFromItems(ksbItems, 'S'),
        behaviourCodes: codesFromItems(ksbItems, 'B'),
      };
      const saved = selectedId ? await onUpdate(selectedId, payload) : await onCreate(payload);
      if (saved) {
        const next = { ...saved, ksbItems: itemsFromProfile(saved) };
        setSelectedId(saved.id);
        setDraft(next);
        setDraftSnapshot(JSON.stringify(next));
        shouldClose = true;
      }
    } finally {
      setSaving(false);
    }
    if (shouldClose) {
      onClose();
    }
  };

  const deleteSelected = async () => {
    if (!selectedId) return;
    await deleteProfile(selectedId);
  };

  const deleteProfile = async (profileId: string) => {
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
    setDeleting(true);
    void kbcSwal.fire({
      title: 'Deleting profile...',
      html: 'Please wait while the KSB profile is being removed.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });
    try {
      const ok = await onDelete(profileId);
      if (ok && selectedId === profileId) {
        const next = emptyProfile();
        setSelectedId(null);
        setDraft(next);
        setDraftSnapshot(JSON.stringify(next));
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = async () => {
    if (!(await confirmDiscardDraft())) return;
    onClose();
  };

  const profileItems = itemsFromProfile(draft);
  const counts = normalizeItems(profileItems).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[3px]">
      <button type="button" aria-label="Close KSB profiles" className="absolute inset-0 cursor-default" onClick={() => { if (!deleting) void handleClose(); }} />
      <div className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="w-72 shrink-0 border-r border-gray-200 bg-gray-50">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-kbc-navy">KSB Profiles</h2>
                <p className="mt-0.5 text-xs font-medium text-gray-400">{profiles.length} profile{profiles.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={() => void startNew()} disabled={deleting} className="flex h-8 w-8 items-center justify-center rounded-lg bg-kbc-navy text-white disabled:opacity-50">
                <i className="ri-add-line" />
              </button>
            </div>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search profiles" className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
          </div>
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-2">
            {filtered.map(profile => (
              <div key={profile.id} className="mb-1 rounded-lg border px-3 py-2 transition-all" style={{ borderColor: selectedId === profile.id ? '#1B2A4A' : '#E5E7EB', background: selectedId === profile.id ? '#F8FAFC' : '#fff' }}>
                <button type="button" onClick={() => void selectProfile(profile)} disabled={deleting} className="w-full text-left disabled:cursor-not-allowed">
                  <span className="block truncate text-xs font-extrabold text-gray-800">{profile.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-gray-400">{profile.programmeName || 'No programme linked'}</span>
                </button>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void selectProfile(profile)}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-extrabold text-kbc-navy hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-pencil-line text-xs" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteProfile(profile.id)}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-delete-bin-line text-xs" />
                    Delete
                  </button>
                </div>
              </div>
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
            <button type="button" onClick={() => void handleClose()} disabled={deleting} className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-50">
              <i className="ri-close-line text-lg" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50 p-5">
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kbc-navy text-xs font-extrabold text-white">1</span>
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-700">Profile details</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-gray-400">Complete these fields before adding KSB definitions.</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Profile name <span className="text-red-500">*</span></label>
                    <input value={draft.name} onChange={event => updateDraft('name', event.target.value)} placeholder="Marketing Executive Level 4 KSB" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Programme / standard <span className="text-red-500">*</span></label>
                    <input value={draft.programmeName} onChange={event => updateDraft('programmeName', event.target.value)} placeholder="ME L4" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Notes</label>
                  <textarea value={draft.description} onChange={event => updateDraft('description', event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
            </div>
            <div className={`rounded-xl border bg-white ${profileReady ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-75'}`}>
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${profileReady ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-400'}`}>2</span>
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-700">KSB definitions</h4>
                    <p className="mt-0.5 text-[11px] font-medium text-gray-400">
                      {profileReady ? 'Choose K, S, or B, add the number, then write the description.' : 'Locked until Profile name and Programme / standard are complete.'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={addItem} disabled={!profileReady} className="inline-flex items-center gap-1.5 rounded-lg bg-kbc-navy px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300">
                  <i className="ri-add-line" />
                  Add KSB
                </button>
              </div>
              <div className="space-y-2 p-4">
                {profileItems.map((item, index) => {
                  const type = item.type === 'S' || item.type === 'B' ? item.type : 'K';
                  const tone = type === 'K'
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : type === 'S'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800';
                  return (
                    <div key={`${item.code || 'new'}-${index}`} className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 md:grid-cols-[92px_110px_minmax(0,1fr)_32px]">
                      <select
                        value={type}
                        onChange={event => updateItem(index, { type: event.target.value as 'K' | 'S' | 'B' })}
                        className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm font-extrabold focus:outline-none"
                      >
                        <option value="K">K</option>
                        <option value="S">S</option>
                        <option value="B">B</option>
                      </select>
                      <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-white px-2">
                        <span className={`mr-2 rounded-md border px-1.5 py-1 text-[10px] font-extrabold ${tone}`}>{type}</span>
                        <input
                          value={item.number}
                          onChange={event => updateItem(index, { number: event.target.value })}
                          placeholder="1"
                          inputMode="numeric"
                          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-800 focus:outline-none"
                        />
                      </div>
                      <input
                        value={item.description}
                        onChange={event => updateItem(index, { description: event.target.value })}
                        placeholder={`${item.code || `${type} number`} description`}
                        className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none"
                      />
                      <button type="button" onClick={() => removeItem(index)} className="flex h-10 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500">
                        <i className="ri-delete-bin-line" />
                      </button>
                    </div>
                  );
                })}
                {!profileItems.length && (
                  <button type="button" onClick={addItem} disabled={!profileReady} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm font-bold text-gray-400 hover:border-kbc-navy hover:text-kbc-navy disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-gray-400">
                    <i className="ri-add-line" />
                    {profileReady ? 'Add the first KSB definition' : 'Complete profile details first'}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-5 py-3">
            <span className="text-xs font-bold text-gray-400">{counts} required KSB code{counts === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              {selectedId && <button type="button" onClick={deleteSelected} disabled={deleting} className="rounded-lg px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">Delete</button>}
              <button type="button" onClick={save} disabled={saving || deleting || !profileReady} className="rounded-lg bg-kbc-navy px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
