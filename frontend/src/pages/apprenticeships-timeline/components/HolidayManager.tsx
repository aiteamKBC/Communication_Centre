import { useState } from 'react';
import type { Holiday } from '../types';
import { formatDate } from '../utils';

interface Props {
  holidays: Holiday[];
  onUpdate: (holidays: Holiday[]) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: Holiday['type']; label: string; color: string; bg: string }[] = [
  { value: 'bank-holiday',  label: 'Bank Holiday',       color: '#16A34A', bg: '#F0FFF4' },
  { value: 'term-break',    label: 'Term Break',          color: '#2563EB', bg: '#EFF6FF' },
  { value: 'non-teaching',  label: 'Non-Teaching Period', color: '#DC2626', bg: '#FFF0F0' },
  { value: 'holiday',       label: 'Holiday',             color: '#D97706', bg: '#FFFBEB' },
];

const TYPE_BADGE: Record<Holiday['type'], { label: string; color: string; bg: string }> = {
  'bank-holiday':  { label: 'Bank Holiday',       color: '#16A34A', bg: '#DCFCE7' },
  'term-break':    { label: 'Term Break',          color: '#1D4ED8', bg: '#DBEAFE' },
  'non-teaching':  { label: 'Non-Teaching',        color: '#DC2626', bg: '#FEE2E2' },
  'holiday':       { label: 'Holiday',             color: '#D97706', bg: '#FEF3C7' },
};

const EMPTY_FORM = { label: '', startDate: '', endDate: '', type: 'term-break' as Holiday['type'] };

export default function HolidayManager({ holidays, onUpdate, onClose }: Props) {
  const [list, setList]       = useState<Holiday[]>(holidays);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [editId, setEditId]   = useState<string | null>(null);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [filter, setFilter]   = useState<Holiday['type'] | 'all'>('all');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.label.trim())     e.label     = 'Name is required';
    if (!form.startDate)        e.startDate = 'Start date required';
    if (!form.endDate)          e.endDate   = 'End date required';
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = 'End must be after start';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdd = () => {
    if (!validate()) return;
    const typeInfo = TYPE_OPTIONS.find(t => t.value === form.type)!;
    if (editId) {
      setList(prev => prev.map(h => h.id === editId ? { ...h, ...form, color: typeInfo.bg } : h));
      setEditId(null);
    } else {
      const newH: Holiday = { id: `h${Date.now()}`, ...form, color: typeInfo.bg };
      setList(prev => [...prev, newH]);
    }
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const handleEdit = (h: Holiday) => {
    setEditId(h.id);
    setForm({ label: h.label, startDate: h.startDate, endDate: h.endDate, type: h.type });
    setErrors({});
  };

  const handleDelete = (id: string) => {
    setList(prev => prev.filter(h => h.id !== id));
    if (editId === id) { setEditId(null); setForm(EMPTY_FORM); }
  };

  const handleSave = () => {
    onUpdate(list);
    onClose();
  };

  const filtered = filter === 'all' ? list : list.filter(h => h.type === filter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl w-full mx-4 flex flex-col overflow-hidden" style={{ maxWidth: 760, maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-base">Holidays &amp; Non-Teaching Periods</h2>
            <p className="text-white/60 text-xs mt-0.5">Configure holidays, term breaks, and non-teaching periods shown on the timeline</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: form */}
          <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-xs font-extrabold text-gray-600 uppercase tracking-wider">
                {editId ? 'Edit Period' : 'Add New Period'}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Name</label>
                <input
                  value={form.label}
                  onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. Christmas Break"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: errors.label ? '#EF4444' : '#D1D5DB' }}
                />
                {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Type</label>
                <div className="space-y-1.5">
                  {TYPE_OPTIONS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setForm(p => ({ ...p, type: t.value }))}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-semibold cursor-pointer transition-all text-left"
                      style={{
                        borderColor: form.type === t.value ? t.color : '#E5E7EB',
                        background:  form.type === t.value ? t.bg : 'white',
                        color:       form.type === t.value ? t.color : '#6B7280',
                      }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: errors.startDate ? '#EF4444' : '#D1D5DB' }}
                />
                {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: errors.endDate ? '#EF4444' : '#D1D5DB' }}
                />
                {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
              {editId && (
                <button onClick={() => { setEditId(null); setForm(EMPTY_FORM); setErrors({}); }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors">
                  Cancel
                </button>
              )}
              <button onClick={handleAdd}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-white cursor-pointer transition-all"
                style={{ background: '#1B2A4A' }}>
                {editId ? 'Update' : 'Add Period'}
              </button>
            </div>
          </div>

          {/* Right: list */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filter tabs */}
            <div className="flex items-center gap-1 px-4 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
              {(['all', 'bank-holiday', 'term-break', 'non-teaching', 'holiday'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all whitespace-nowrap"
                  style={{
                    background: filter === f ? '#1B2A4A' : '#F3F4F6',
                    color:      filter === f ? '#fff'    : '#6B7280',
                  }}
                >
                  {f === 'all' ? `All (${list.length})` : TYPE_BADGE[f].label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {filtered.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm italic">No periods configured</div>
              )}
              {filtered.map(h => {
                const badge = TYPE_BADGE[h.type];
                return (
                  <div key={h.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors group">
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: badge.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-800 truncate">{h.label}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
                          style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(h.startDate)}
                        {h.startDate !== h.endDate && <> &rarr; {formatDate(h.endDate)}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(h)}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-kbc-navy hover:bg-gray-100 cursor-pointer transition-colors">
                        <i className="ri-edit-line text-sm" />
                      </button>
                      <button onClick={() => handleDelete(h.id)}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors">
                        <i className="ri-delete-bin-line text-sm" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors">
                Discard
              </button>
              <button onClick={handleSave}
                className="px-6 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all"
                style={{ background: '#1B2A4A' }}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
