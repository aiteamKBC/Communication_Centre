import { useState, useMemo } from 'react';
import type { CatalogModule } from '../types';

interface Props {
  onSave: (mod: Omit<CatalogModule, 'id'>) => void;
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

export default function AddModuleCatalogModal({ onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [colour, setColour] = useState('#4A6DB0');
  const [sessions, setSessions] = useState('12');
  const [notes, setNotes] = useState('');
  const [sessionNames, setSessionNames] = useState<string[]>([]);
  const [sessionDescriptions, setSessionDescriptions] = useState<string[]>([]);
  const [error, setError] = useState('');

  const previewName = name.trim() || 'Untitled Module';

  const sessionCount = useMemo(() => {
    const n = parseInt(sessions, 10);
    return isNaN(n) || n < 1 ? 0 : Math.min(n, 13);
  }, [sessions]);

  const updateName = (idx: number, value: string) => {
    setSessionNames(prev => { const next = [...prev]; next[idx] = value; return next; });
  };

  const updateDescription = (idx: number, value: string) => {
    setSessionDescriptions(prev => { const next = [...prev]; next[idx] = value; return next; });
  };

  const handleReset = () => {
    setName(''); setColour('#4A6DB0'); setSessions('12'); setNotes('');
    setSessionNames([]); setSessionDescriptions([]); setError('');
  };

  const handleSave = () => {
    if (!name.trim()) { setError('Module name is required'); return; }
    const names = Array.from({ length: 13 }, (_, i) => sessionNames[i] ?? '');
    const descs = Array.from({ length: 13 }, (_, i) => sessionDescriptions[i] ?? '');
    onSave({ name: name.trim(), colour, sessions, notes: notes.trim(), sessionNames: names, sessionDescriptions: descs });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/28 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxWidth: 680, maxHeight: '90vh' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-sm tracking-wide">Add Module</h2>
            <p className="text-white/60 text-xs mt-0.5">Save a module to the catalogue — select it when creating a group</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-base" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4 bg-gray-50">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4 h-7 rounded-sm shrink-0" style={{ background: colour }} />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-gray-800 leading-tight break-words">{previewName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Module catalogue entry</p>
                </div>
              </div>
              {sessions && (
                <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: `${colour}15`, color: colour }}>
                  {sessions} session{sessions === '1' ? '' : 's'}
                </span>
              )}
            </div>

            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Module Name</label>
                <input
                  type="text"
                  placeholder="e.g. Risk Management"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: error ? '#EF4444' : '#D1D5DB' }}
                  autoFocus
                />
                {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Number of Sessions</label>
                  <input
                    type="text"
                    placeholder="e.g. 12"
                    value={sessions}
                    onChange={e => setSessions(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Module Colour</label>
                  <div className="flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <input
                      type="color"
                      value={colour}
                      onChange={e => setColour(e.target.value)}
                      className="h-8 w-10 rounded-md border border-gray-200 cursor-pointer p-0.5"
                    />
                    <div className="flex h-8 flex-1 items-center rounded-md px-3" style={{ background: `${colour}12` }}>
                      <div className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-bold" style={{ background: colour, color: contrastColor(colour) }}>
                        {previewName}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any notes about this module..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* Session names + descriptions */}
          {sessionCount > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <i className="ri-list-ordered text-sm" style={{ color: colour }} />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Sessions</span>
                <span className="ml-auto text-xs text-gray-400">{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="px-4 py-4 space-y-4">
                {Array.from({ length: sessionCount }, (_, i) => (
                  <div key={i} className="flex gap-3">
                    <span
                      className="shrink-0 w-6 h-6 mt-2 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: `${colour}18`, color: colour }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-1.5">
                      <input
                        type="text"
                        placeholder={`Session ${i + 1} name`}
                        value={sessionNames[i] ?? ''}
                        onChange={e => updateName(i, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white font-medium"
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={sessionDescriptions[i] ?? ''}
                        onChange={e => updateDescription(i, e.target.value)}
                        className="w-full border border-gray-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none bg-gray-50 text-gray-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <button onClick={handleReset} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
            Reset
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: '#1B2A4A' }}>
            <i className="ri-add-line" />
            Add Module
          </button>
        </div>
      </div>
    </div>
  );
}
