import { useState } from 'react';
import type { CustomModule } from '../types';

interface Props {
  onSave: (mod: CustomModule) => void;
  onClose: () => void;
}

function contrastColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1F2937' : '#ffffff';
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `mod-${Date.now()}`;
}

export default function AddModuleModal({ onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [sessions, setSessions] = useState(12);
  const [bg, setBg] = useState('#4A6DB0');
  const [error, setError] = useState('');
  const previewName = name.trim() || 'Untitled Module';

  const handleReset = () => {
    setName('');
    setSessions(12);
    setBg('#4A6DB0');
    setError('');
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError('Module name is required');
      return;
    }
    const mod: CustomModule = {
      id: slugify(name.trim()),
      name: name.trim(),
      defaultSessions: Math.max(1, sessions),
      bg,
      tx: contrastColor(bg),
    };
    onSave(mod);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/28 backdrop-blur-[6px]" />
      <div className="relative bg-white rounded-xl w-full shadow-2xl overflow-hidden" style={{ maxWidth: 720 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-sm tracking-wide">Add General Module</h2>
            <p className="text-white/60 text-xs mt-0.5">Create a reusable module with the same structure used inside cohorts</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-base" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 bg-gray-50">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-4 h-7 rounded-sm shrink-0" style={{ background: bg }} />
                <div className="min-w-0">
                  <p className="text-lg font-bold text-gray-800 leading-tight break-words">{previewName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Reusable general module</p>
                </div>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: `${bg}15`, color: bg }}>
                {sessions} session{sessions === 1 ? '' : 's'}
              </span>
            </div>

            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Module</label>
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
                  <div className="flex h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={sessions}
                      onChange={e => setSessions(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 bg-transparent text-sm font-semibold text-gray-800 text-center focus:outline-none"
                    />
                    <span className="text-xs text-gray-400">sessions total</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Module Color</label>
                  <div className="flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <input
                      type="color"
                      value={bg}
                      onChange={e => setBg(e.target.value)}
                      className="h-8 w-10 rounded-md border border-gray-200 cursor-pointer p-0.5"
                    />
                    <div
                      className="flex h-8 flex-1 items-center rounded-md px-3"
                      style={{ background: `${bg}12` }}
                    >
                      <div
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-bold"
                        style={{ background: bg, color: contrastColor(bg) }}
                      >
                        {previewName}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={handleReset}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
            Reset
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90"
            style={{ background: '#1B2A4A' }}>
            <i className="ri-add-line" />
            Add Module
          </button>
        </div>
      </div>
    </div>
  );
}
