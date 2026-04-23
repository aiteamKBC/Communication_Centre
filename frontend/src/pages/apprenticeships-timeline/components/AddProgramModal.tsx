import { useState } from 'react';
import type { CustomProgram } from '../types';

interface Props {
  onSave: (program: CustomProgram) => void;
  onClose: () => void;
  initialProgram?: CustomProgram;
}

function contrastColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1F2937' : '#ffffff';
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `prog-${Date.now()}`;
}

export default function AddProgramModal({ onSave, onClose, initialProgram }: Props) {
  const mode = initialProgram ? 'edit' : 'add';
  const [name, setName] = useState(initialProgram?.name || '');
  const [color, setColor] = useState(initialProgram?.color || '#1B2A4A');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Programme name is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const prog: CustomProgram = {
      id: initialProgram?.id || slugify(name.trim()),
      name: name.trim(),
      sub: initialProgram?.sub || '',
      color,
    };
    onSave(prog);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/28 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxWidth: 560 }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-sm tracking-wide">{mode === 'edit' ? 'Manage Programme' : 'Add Programme'}</h2>
            <p className="text-white/60 text-xs mt-0.5">{mode === 'edit' ? 'Edit programme details' : 'Create a new training programme group'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-base" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Programme Name</label>
            <input
              type="text"
              placeholder="e.g. Project Control Professional"
              value={name}
              onChange={e => { setName(e.target.value); setErrors({}); }}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: errors.name ? '#EF4444' : '#D1D5DB' }}
              autoFocus
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Programme Colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
              />
              <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: color }}>
                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <i className="ri-book-open-line text-xs" style={{ color: contrastColor(color) }} />
                </div>
                <p className="font-extrabold leading-tight" style={{ fontSize: '10px', color: contrastColor(color) }}>
                  {name || 'Programme Name'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
            {mode === 'edit' ? 'Close' : 'Cancel'}
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90"
            style={{ background: '#1B2A4A' }}>
            <i className={mode === 'edit' ? 'ri-save-line' : 'ri-add-line'} />
            {mode === 'edit' ? 'Save Programme' : 'Add Programme'}
          </button>
        </div>
      </div>
    </div>
  );
}
