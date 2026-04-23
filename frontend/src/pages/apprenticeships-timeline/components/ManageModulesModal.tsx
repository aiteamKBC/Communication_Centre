import { useState, useMemo } from 'react';
import type { CatalogModule } from '../types';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface Props {
  modules: CatalogModule[];
  onAdd: (mod: Omit<CatalogModule, 'id'>) => Promise<void>;
  onUpdate: (mod: CatalogModule) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
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
}

function emptyEdit(): EditState {
  return { id: null, name: '', colour: '#4A6DB0', sessions: '12', notes: '', sessionNames: [], sessionDescriptions: [] };
}

export default function ManageModulesModal({ modules, onAdd, onUpdate, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const openEdit = (m: CatalogModule) => {
    setEditing({
      id: m.id,
      name: m.name,
      colour: m.colour || '#4A6DB0',
      sessions: m.sessions || '',
      notes: m.notes || '',
      sessionNames: m.sessionNames ? [...m.sessionNames] : [],
      sessionDescriptions: m.sessionDescriptions ? [...m.sessionDescriptions] : [],
    });
    setError('');
  };

  const sessionCount = useMemo(() => {
    if (!editing) return 0;
    const n = parseInt(editing.sessions, 10);
    return isNaN(n) || n < 1 ? 0 : Math.min(n, 13);
  }, [editing?.sessions]);

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
    const names = Array.from({ length: 13 }, (_, i) => editing.sessionNames[i] ?? '');
    const descs = Array.from({ length: 13 }, (_, i) => editing.sessionDescriptions[i] ?? '');
    try {
      if (editing.id === null) {
        await onAdd({ name: editing.name.trim(), colour: editing.colour, sessions: editing.sessions, notes: editing.notes.trim(), sessionNames: names, sessionDescriptions: descs });
      } else {
        await onUpdate({ id: editing.id, name: editing.name.trim(), colour: editing.colour, sessions: editing.sessions, notes: editing.notes.trim(), sessionNames: names, sessionDescriptions: descs });
      }
      setEditing(null);
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
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-opacity"
                style={{ opacity: isDeleting ? 0.4 : 1 }}
              >
                <span className="w-3 h-9 rounded-sm shrink-0" style={{ background: m.colour || '#4A6DB0' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-800 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {m.sessions ? `${m.sessions} sessions` : 'No sessions set'}
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
              onClick={() => { setEditing(emptyEdit()); setError(''); }}
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
          <div className="absolute inset-0 bg-slate-950/20" onClick={() => setEditing(null)} />
          <div className="relative bg-white rounded-xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxWidth: 560, maxHeight: '92vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ background: '#1B2A4A' }}>
              <div>
                <h3 className="text-white font-extrabold text-sm tracking-wide">{editing.id === null ? 'Add Module' : 'Edit Module'}</h3>
                <p className="text-white/60 text-xs mt-0.5">Changes apply to the module catalogue</p>
              </div>
              <button onClick={() => setEditing(null)} className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
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
                  <input
                    type="text"
                    value={editing.sessions}
                    onChange={e => setEditing(prev => prev ? { ...prev, sessions: e.target.value } : prev)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                  />
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

              {/* Session names + descriptions */}
              {sessionCount > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <i className="ri-list-ordered text-sm" style={{ color: editing.colour }} />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Sessions</span>
                    <span className="ml-auto text-xs text-gray-400">{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="px-4 py-4 space-y-4">
                    {Array.from({ length: sessionCount }, (_, i) => (
                      <div key={i} className="flex gap-3">
                        <span
                          className="shrink-0 w-6 h-6 mt-2 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: `${editing.colour}18`, color: editing.colour }}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1 space-y-1.5">
                          <input
                            type="text"
                            placeholder={`Session ${i + 1} name`}
                            value={editing.sessionNames[i] ?? ''}
                            onChange={e => updateSessionName(i, e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white font-medium"
                          />
                          <input
                            type="text"
                            placeholder="Description (optional)"
                            value={editing.sessionDescriptions[i] ?? ''}
                            onChange={e => updateSessionDescription(i, e.target.value)}
                            className="w-full border border-gray-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none bg-gray-50 text-gray-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-white shrink-0">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
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
    </div>
  );
}
