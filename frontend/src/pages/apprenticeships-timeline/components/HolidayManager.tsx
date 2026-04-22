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

const TYPE_COLOR_PALETTE = [
  { color: '#7C3AED', bg: '#F3E8FF' },
  { color: '#0F766E', bg: '#CCFBF1' },
  { color: '#C2410C', bg: '#FFEDD5' },
  { color: '#BE185D', bg: '#FCE7F3' },
  { color: '#1D4ED8', bg: '#DBEAFE' },
  { color: '#15803D', bg: '#DCFCE7' },
];

const EMPTY_FORM = { label: '', startDate: '', endDate: '', type: '' };
const FALLBACK_TYPE_OPTION: HolidayTypeOption = { value: 'holiday', label: 'Holiday', color: '#D97706', bg: '#FFFBEB' };

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

function hexToSoftBackground(hex: string): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) {
    return '#F9FAFB';
  }

  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

function buildHolidayTypeOptions(holidays: Holiday[]): HolidayTypeOption[] {
  const byValue = new Map<string, HolidayTypeOption>();
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
  const [newTypeColor, setNewTypeColor] = useState('#2563EB');
  const [newTypeError, setNewTypeError] = useState('');
  const [editTypeValue, setEditTypeValue] = useState<string | null>(null);
  const [editTypeLabel, setEditTypeLabel] = useState('');
  const [editTypeColor, setEditTypeColor] = useState('#2563EB');
  const [editTypeError, setEditTypeError] = useState('');
  const initialSnapshot = JSON.stringify(holidays);

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
          const accentColor = item.color || palette.color;
          return {
            value: item.value,
            label: item.label,
            color: accentColor,
            bg: hexToSoftBackground(accentColor),
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
  const customTypeValueSet = useMemo(() => new Set(customTypeOptions.map(option => option.value)), [customTypeOptions]);

  useEffect(() => {
    if (!form.type && typeOptions.length > 0) {
      setForm(prev => ({ ...prev, type: typeOptions[0].value }));
      return;
    }
    if (form.type && !typeOptionMap.has(form.type) && typeOptions.length > 0) {
      setForm(prev => ({ ...prev, type: typeOptions[0].value }));
    }
  }, [form.type, typeOptionMap, typeOptions]);

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

  const buildPendingHoliday = (): Holiday | null => {
    if (!validate()) {
      return null;
    }

    const typeInfo = typeOptionMap.get(form.type) || typeOptions[0] || FALLBACK_TYPE_OPTION;
    return {
      id: editId || `h${Date.now()}`,
      label: form.label.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      type: form.type,
      color: typeInfo.bg,
    };
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

    try {
      const response = await fetch('/api/training-plan-holiday-types/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: normalizedValue,
          label: normalizedLabel,
          color: newTypeColor,
        }),
      });

      if (!response.ok) {
        setNewTypeError('Could not save this type right now');
        return;
      }

      setCustomTypeOptions(prev => [...prev, {
        value: normalizedValue,
        label: normalizedLabel,
        color: newTypeColor,
        bg: hexToSoftBackground(newTypeColor),
      }]);
      setForm(prev => ({ ...prev, type: normalizedValue }));
      setNewTypeLabel('');
      setNewTypeColor('#2563EB');
      setNewTypeError('');
      setShowNewTypeForm(false);
    } catch {
      setNewTypeError('Could not save this type right now');
    }
  };

  const handleStartEditType = (option: HolidayTypeOption) => {
    setEditTypeValue(option.value);
    setEditTypeLabel(option.label);
    setEditTypeColor(option.color);
    setEditTypeError('');
    setShowNewTypeForm(false);
    setNewTypeError('');
  };

  const handleCancelEditType = () => {
    setEditTypeValue(null);
    setEditTypeLabel('');
    setEditTypeColor('#2563EB');
    setEditTypeError('');
  };

  const handleUpdateType = async () => {
    if (!editTypeValue) {
      return;
    }

    const normalizedLabel = toTitleCase(editTypeLabel);
    if (!normalizedLabel) {
      setEditTypeError('Type name is required');
      return;
    }

    try {
      const response = await fetch('/api/training-plan-holiday-types/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: editTypeValue,
          label: normalizedLabel,
          color: editTypeColor,
        }),
      });

      if (!response.ok) {
        setEditTypeError('Could not update this type right now');
        return;
      }

      const nextBg = hexToSoftBackground(editTypeColor);
      setCustomTypeOptions(prev => prev.map(option => (
        option.value === editTypeValue
          ? { ...option, label: normalizedLabel, color: editTypeColor, bg: nextBg }
          : option
      )));
      setList(prev => prev.map(holiday => (
        holiday.type === editTypeValue ? { ...holiday, color: nextBg } : holiday
      )));
      handleCancelEditType();
    } catch {
      setEditTypeError('Could not update this type right now');
    }
  };

  const handleDeleteType = async (option: HolidayTypeOption) => {
    const fallbackType = typeOptions.find(item => item.value !== option.value) || FALLBACK_TYPE_OPTION;
    const affectedCount = list.filter(holiday => holiday.type === option.value).length;
    const html = affectedCount > 0
      ? `Delete <strong>${option.label}</strong>?<br/><br/>${affectedCount} holiday period(s) using this type will be reassigned to <strong>${fallbackType.label}</strong>.`
      : `Delete <strong>${option.label}</strong>?`;

    const result = await kbcSwal.fire({
      title: 'Delete Holiday Type',
      html,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await fetch('/api/training-plan-holiday-types/', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: option.value }),
      });

      if (!response.ok) {
        await kbcSwal.fire({
          title: 'Could Not Delete Type',
          html: 'Try again in a moment.',
          icon: 'error',
          confirmButtonText: 'OK',
        });
        return;
      }

      setCustomTypeOptions(prev => prev.filter(item => item.value !== option.value));
      setList(prev => prev.map(holiday => (
        holiday.type === option.value
          ? { ...holiday, type: fallbackType.value, color: fallbackType.bg }
          : holiday
      )));
      setForm(prev => (
        prev.type === option.value ? { ...prev, type: fallbackType.value } : prev
      ));
      if (editTypeValue === option.value) {
        handleCancelEditType();
      }
    } catch {
      await kbcSwal.fire({
        title: 'Could Not Delete Type',
        html: 'Try again in a moment.',
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  const handleAdd = () => {
    const pendingHoliday = buildPendingHoliday();
    if (!pendingHoliday) {
      return;
    }

    if (editId) {
      setList(prev => prev.map(holiday => (
        holiday.id === editId ? pendingHoliday : holiday
      )));
      setEditId(null);
    } else {
      setList(prev => [...prev, pendingHoliday]);
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

  const selectedType = typeOptionMap.get(form.type) || typeOptions[0] || FALLBACK_TYPE_OPTION;
  const isSaveFormComplete = Boolean(form.label.trim()) && Boolean(form.startDate) && Boolean(form.endDate);
  const hasPersistableDraft = isSaveFormComplete || Boolean(editId);
  const hasListChanges = JSON.stringify(list) !== initialSnapshot;
  const canSaveChanges = hasPersistableDraft || hasListChanges;

  const handleSave = async () => {
    if (!canSaveChanges) {
      await kbcSwal.fire({
        title: 'No Changes To Save',
        html: 'Add, update, or delete at least one holiday period before saving changes.',
        icon: 'info',
        confirmButtonText: 'OK',
      });
      return;
    }

    let nextList = list;

    if (isSaveFormComplete || editId) {
      const pendingHoliday = buildPendingHoliday();
      if (!pendingHoliday) {
        await kbcSwal.fire({
          title: 'Complete Required Fields',
          html: 'Fill in the <strong>Name</strong>, <strong>Start Date</strong>, and <strong>End Date</strong> before saving changes.',
          icon: 'warning',
          confirmButtonText: 'OK',
        });
        return;
      }

      nextList = editId
        ? list.map(holiday => (holiday.id === editId ? pendingHoliday : holiday))
        : [...list, pendingHoliday];
    } else if (nextList.length === 0 && !hasListChanges) {
      await kbcSwal.fire({
        title: 'No Holidays To Save',
        html: 'Add at least one holiday period before saving changes.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }

    const saved = await onSave(nextList);
    if (saved) {
      setList(nextList);
      setEditId(null);
      setForm({ ...EMPTY_FORM, type: form.type });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />
      <div className="relative bg-white rounded-xl w-full flex flex-col overflow-hidden shadow-2xl" style={{ maxWidth: 920, maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-base">Holidays &amp; Non-Teaching Periods</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[360px] shrink-0 border-r border-gray-200 flex flex-col">
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
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all shadow-sm"
                    style={{
                      borderColor: showNewTypeForm ? '#1B2A4A' : '#D7DEEA',
                      background: showNewTypeForm ? '#1B2A4A' : '#F8FAFC',
                      color: showNewTypeForm ? '#FFFFFF' : '#1B2A4A',
                    }}
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full"
                      style={{
                        background: showNewTypeForm ? 'rgba(255,255,255,0.18)' : '#E7EEF8',
                        color: showNewTypeForm ? '#FFFFFF' : '#1B2A4A',
                      }}
                    >
                      <i className={`${showNewTypeForm ? 'ri-close-line' : 'ri-add-line'}`} style={{ fontSize: '10px' }} />
                    </span>
                    {showNewTypeForm ? 'Close Type Form' : 'Add Type'}
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
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={newTypeColor}
                        onChange={event => setNewTypeColor(event.target.value)}
                        className="h-12 w-16 rounded-lg border border-gray-200 cursor-pointer p-1"
                      />
                      <div
                        className="flex-1 rounded-lg border px-3 py-2 text-xs font-bold"
                        style={{ borderColor: newTypeColor, background: hexToSoftBackground(newTypeColor), color: newTypeColor }}
                      >
                        {newTypeLabel.trim() || 'Type preview'}
                      </div>
                    </div>
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
                          setNewTypeColor('#2563EB');
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

                {editTypeValue && (
                  <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
                    <input
                      value={editTypeLabel}
                      onChange={event => setEditTypeLabel(event.target.value)}
                      placeholder="Type name"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                    />
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={editTypeColor}
                        onChange={event => setEditTypeColor(event.target.value)}
                        className="h-12 w-16 rounded-lg border border-gray-200 cursor-pointer p-1"
                      />
                      <div
                        className="flex-1 rounded-lg border px-3 py-2 text-xs font-bold"
                        style={{ borderColor: editTypeColor, background: hexToSoftBackground(editTypeColor), color: editTypeColor }}
                      >
                        {editTypeLabel.trim() || 'Type preview'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { void handleUpdateType(); }}
                        className="flex-1 rounded-lg bg-kbc-navy px-3 py-2 text-xs font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
                      >
                        Update Type
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditType}
                        className="rounded-lg bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer transition-colors hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                    {editTypeError && <p className="text-red-500 text-xs">{editTypeError}</p>}
                  </div>
                )}

                <div className="space-y-1.5">
                  {typeOptions.map(option => {
                    const isCustomType = customTypeValueSet.has(option.value);
                    return (
                      <div
                        key={option.value}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all"
                        style={{
                          borderColor: form.type === option.value ? option.color : '#E5E7EB',
                          background: form.type === option.value ? option.bg : 'white',
                          color: form.type === option.value ? option.color : '#6B7280',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, type: option.value }))}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: option.color }} />
                          <span className="truncate">{option.label}</span>
                        </button>
                        {isCustomType && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditType(option)}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-kbc-navy hover:bg-white/70 cursor-pointer transition-colors"
                              title={`Edit ${option.label}`}
                            >
                              <i className="ri-edit-line text-sm" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleDeleteType(option); }}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                              title={`Delete ${option.label}`}
                            >
                              <i className="ri-delete-bin-line text-sm" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                disabled={!canSaveChanges}
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
