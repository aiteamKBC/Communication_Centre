import { useEffect, useMemo, useState } from 'react';
import type { Holiday } from '../types';
import { formatDate } from '../utils';
import DateField from './DateField';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface Props {
  holidays: Holiday[];
  onSave: (holidays: Holiday[]) => Promise<boolean>;
  onClose: () => void;
}

interface HolidayTypeOption {
  value: string;
  label: string;
  color: string;
  bg: string;
}

const DEFAULT_TYPE_OPTIONS: HolidayTypeOption[] = [
  { value: 'bank-holiday', label: 'Bank Holiday', color: '#16A34A', bg: '#F0FFF4' },
  { value: 'term-break', label: 'Term Break', color: '#2563EB', bg: '#EFF6FF' },
  { value: 'non-teaching', label: 'Non-Teaching Period', color: '#DC2626', bg: '#FFF0F0' },
  { value: 'holiday', label: 'Holiday', color: '#D97706', bg: '#FFFBEB' },
];

const TYPE_COLOR_PALETTE = [
  { color: '#7C3AED', bg: '#F3E8FF' },
  { color: '#0F766E', bg: '#CCFBF1' },
  { color: '#C2410C', bg: '#FFEDD5' },
  { color: '#BE185D', bg: '#FCE7F3' },
  { color: '#1D4ED8', bg: '#DBEAFE' },
  { color: '#15803D', bg: '#DCFCE7' },
];

const EMPTY_FORM = { label: '', startDate: '', endDate: '', type: 'term-break' };

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

function slugifyType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildHolidayTypeOptions(holidays: Holiday[]): HolidayTypeOption[] {
  const byValue = new Map(DEFAULT_TYPE_OPTIONS.map(option => [option.value, option]));
  let paletteIndex = 0;

  holidays.forEach(holiday => {
    if (byValue.has(holiday.type)) {
      return;
    }

    const palette = TYPE_COLOR_PALETTE[paletteIndex % TYPE_COLOR_PALETTE.length];
    paletteIndex += 1;
    byValue.set(holiday.type, {
      value: holiday.type,
      label: toTitleCase(holiday.type.replace(/-/g, ' ')),
      color: palette.color,
      bg: holiday.color || palette.bg,
    });
  });

  return Array.from(byValue.values());
}

export default function HolidayManager({ holidays, onSave, onClose }: Props) {
  const [list, setList] = useState<Holiday[]>(holidays);
  const [customTypeOptions, setCustomTypeOptions] = useState<HolidayTypeOption[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNewTypeForm, setShowNewTypeForm] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeError, setNewTypeError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadCustomTypes() {
      try {
        const response = await fetch('/api/training-plan-holiday-types/');
        if (!response.ok) {
          return;
        }

        const items = await response.json() as Array<{ value: string; label: string; color?: string }>;
        if (!Array.isArray(items) || cancelled) {
          return;
        }

        setCustomTypeOptions(items.map((item, index) => {
          const palette = TYPE_COLOR_PALETTE[index % TYPE_COLOR_PALETTE.length];
          return {
            value: item.value,
            label: item.label,
            color: palette.color,
            bg: item.color || palette.bg,
          };
        }));
      } catch {
        // Keep default local types if loading custom types fails.
      }
    }

    void loadCustomTypes();
    return () => {
      cancelled = true;
    };
  }, []);

  const typeOptions = useMemo(() => {
    const derived = buildHolidayTypeOptions(list);
    const byValue = new Map(derived.map(option => [option.value, option]));
    customTypeOptions.forEach(option => {
      if (!byValue.has(option.value)) {
        byValue.set(option.value, option);
      }
    });
    return Array.from(byValue.values());
  }, [customTypeOptions, list]);
  const typeOptionMap = useMemo(() => new Map(typeOptions.map(option => [option.value, option])), [typeOptions]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.label.trim()) nextErrors.label = 'Name is required';
    if (!form.startDate) nextErrors.startDate = 'Start date required';
    if (!form.endDate) nextErrors.endDate = 'End date required';
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = 'End must be after start';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleAddType = async () => {
    const normalizedLabel = toTitleCase(newTypeLabel);
    const normalizedValue = slugifyType(newTypeLabel);

    if (!normalizedLabel || !normalizedValue) {
      setNewTypeError('Type name is required');
      return;
    }

    if (typeOptions.some(option => option.value === normalizedValue)) {
      setNewTypeError('This holiday type already exists');
      return;
    }

    const palette = TYPE_COLOR_PALETTE[typeOptions.length % TYPE_COLOR_PALETTE.length];

    try {
      const response = await fetch('/api/training-plan-holiday-types/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: normalizedValue,
          label: normalizedLabel,
          color: palette.bg,
        }),
      });

      if (!response.ok) {
        setNewTypeError('Could not save this type right now');
        return;
      }

      setCustomTypeOptions(prev => [...prev, {
        value: normalizedValue,
        label: normalizedLabel,
        color: palette.color,
        bg: palette.bg,
      }]);
      setForm(prev => ({ ...prev, type: normalizedValue }));
      setNewTypeLabel('');
      setNewTypeError('');
      setShowNewTypeForm(false);
    } catch {
      setNewTypeError('Could not save this type right now');
    }
  };

  const handleAdd = () => {
    if (!validate()) {
      return;
    }

    const typeInfo = typeOptionMap.get(form.type) || DEFAULT_TYPE_OPTIONS[0];
    if (editId) {
      setList(prev => prev.map(holiday => (
        holiday.id === editId ? { ...holiday, ...form, color: typeInfo.bg } : holiday
      )));
      setEditId(null);
    } else {
      const nextHoliday: Holiday = { id: `h${Date.now()}`, ...form, color: typeInfo.bg };
      setList(prev => [...prev, nextHoliday]);
    }

    setForm({ ...EMPTY_FORM, type: form.type });
    setErrors({});
  };

  const handleEdit = (holiday: Holiday) => {
    setEditId(holiday.id);
    setForm({
      label: holiday.label,
      startDate: holiday.startDate,
      endDate: holiday.endDate,
      type: holiday.type,
    });
    setErrors({});
  };

  const handleDelete = (id: string) => {
    setList(prev => prev.filter(holiday => holiday.id !== id));
    if (editId === id) {
      setEditId(null);
      setForm(EMPTY_FORM);
    }
  };

  const selectedType = typeOptionMap.get(form.type) || DEFAULT_TYPE_OPTIONS[0];
  const isSaveFormComplete = Boolean(form.label.trim()) && Boolean(form.startDate) && Boolean(form.endDate);

  const handleSave = async () => {
    if (!isSaveFormComplete && !validate()) {
      await kbcSwal.fire({
        title: 'Complete Required Fields',
        html: 'Fill in the <strong>Name</strong>, <strong>Start Date</strong>, and <strong>End Date</strong> before saving changes.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }

    const saved = await onSave(list);
    if (saved) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />
      <div className="relative bg-white rounded-xl w-full flex flex-col overflow-hidden shadow-2xl" style={{ maxWidth: 760, maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-base">Holidays &amp; Non-Teaching Periods</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-xs font-extrabold text-gray-600 uppercase tracking-wider">
                {editId ? 'Edit Period' : 'Add New Period'}
              </h3>
            </div>

            <div className="scrollbar-hidden flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Name</label>
                <input
                  value={form.label}
                  onChange={event => setForm(prev => ({ ...prev, label: event.target.value }))}
                  placeholder="e.g. Christmas Break"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ borderColor: errors.label ? '#EF4444' : '#D1D5DB' }}
                />
                {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Type</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewTypeForm(current => !current);
                      setNewTypeError('');
                    }}
                    className="text-xs font-bold text-kbc-navy hover:text-kbc-navy-light cursor-pointer transition-colors"
                  >
                    + Add Type
                  </button>
                </div>

                {showNewTypeForm && (
                  <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
                    <input
                      value={newTypeLabel}
                      onChange={event => setNewTypeLabel(event.target.value)}
                      placeholder="e.g. Exam Week"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { void handleAddType(); }}
                        className="flex-1 rounded-lg bg-kbc-navy px-3 py-2 text-xs font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
                      >
                        Save Type
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewTypeForm(false);
                          setNewTypeLabel('');
                          setNewTypeError('');
                        }}
                        className="rounded-lg bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer transition-colors hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                    {newTypeError && <p className="text-red-500 text-xs">{newTypeError}</p>}
                  </div>
                )}

                <div className="space-y-1.5">
                  {typeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setForm(prev => ({ ...prev, type: option.value }))}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-semibold cursor-pointer transition-all text-left"
                      style={{
                        borderColor: form.type === option.value ? option.color : '#E5E7EB',
                        background: form.type === option.value ? option.bg : 'white',
                        color: form.type === option.value ? option.color : '#6B7280',
                      }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: option.color }} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Start Date</label>
                <DateField
                  value={form.startDate}
                  onChange={value => setForm(prev => ({ ...prev, startDate: value }))}
                  placeholder="Choose start date"
                  error={errors.startDate}
                  accentColor={selectedType.color}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">End Date</label>
                <DateField
                  value={form.endDate}
                  onChange={value => setForm(prev => ({ ...prev, endDate: value }))}
                  placeholder="Choose end date"
                  error={errors.endDate}
                  accentColor={selectedType.color}
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
              {editId && (
                <button
                  onClick={() => {
                    setEditId(null);
                    setForm(EMPTY_FORM);
                    setErrors({});
                  }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleAdd}
                className="flex-1 py-2 rounded-lg text-xs font-bold text-white cursor-pointer transition-all"
                style={{ background: '#1B2A4A' }}
              >
                {editId ? 'Update' : 'Add Period'}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {list.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm italic">No periods configured</div>
              )}
              {list.map(holiday => {
                const badge = typeOptionMap.get(holiday.type) || selectedType;
                const isEditing = editId === holiday.id;
                return (
                  <button
                    key={holiday.id}
                    type="button"
                    onClick={() => handleEdit(holiday)}
                    className="group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all"
                    style={{
                      borderColor: isEditing ? badge.color : '#E5E7EB',
                      background: isEditing ? `${badge.bg}` : '#FFFFFF',
                      boxShadow: isEditing ? `0 0 0 1px ${badge.color}20` : undefined,
                    }}
                  >
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: badge.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-800 truncate">{holiday.label}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0" style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                        {isEditing && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0" style={{ background: '#1B2A4A', color: '#fff' }}>
                            Editing
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(holiday.startDate)}
                        {holiday.startDate !== holiday.endDate && <> &rarr; {formatDate(holiday.endDate)}</>}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          handleEdit(holiday);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-kbc-navy hover:bg-gray-100 cursor-pointer transition-colors"
                      >
                        <i className="ri-edit-line text-sm" />
                      </button>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          handleDelete(holiday.id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <i className="ri-delete-bin-line text-sm" />
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center justify-end gap-3">
              <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors">
                Discard
              </button>
              <button
                onClick={() => { void handleSave(); }}
                disabled={!isSaveFormComplete}
                className="px-6 py-2 rounded-lg text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: '#1B2A4A' }}
              >
                Save Changes
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
