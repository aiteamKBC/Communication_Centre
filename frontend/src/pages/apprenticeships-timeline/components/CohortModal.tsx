import { useState, useEffect } from 'react';
import type { ProgrammeGroup, CohortRow, ModuleBlock, MKey, WeekDayKey, Holiday } from '../types';
import { MS } from '../data';
import { formatDate } from '../utils';
import DateField from './DateField';

interface Props {
  mode: 'add' | 'edit';
  groups: ProgrammeGroup[];
  holidays: Holiday[];
  initialGroupIdx?: number;
  initialRow?: CohortRow;
  onSave: (groupIdx: number, row: CohortRow, prevGroupIdx?: number) => void;
  onClose: () => void;
}

interface FormBlk {
  id: string;
  mod: MKey;
  tutor: string;
  startDate: string;
  endDate: string;
  sessions: number;
  days: WeekDayKey[];
  sessionStartTime: string;
  sessionEndTime: string;
  notes: string;
}

interface FormData {
  groupIdx: number;
  label: string;
  dateLbl: string;
  intake: string;
  quarter: string;
  holidayIds: string[];
  blks: FormBlk[];
}

const WEEK_DAYS: { key: WeekDayKey; label: string }[] = [
  { key: 'saturday', label: 'Saturday' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
];

const JS_DAY_TO_KEY: Record<number, WeekDayKey> = {
  0: 'monday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const inferWeekDayFromIsoDate = (isoDate: string): WeekDayKey => {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return 'monday';
  }
  return JS_DAY_TO_KEY[d.getDay()] || 'monday';
};

function isIsoDate(value: string): boolean {
  if (!value) {
    return false;
  }
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function overlapsRange(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && endA >= startB;
}

const newBlk = (): FormBlk => ({
  id: `blk-${Date.now()}-${Math.random()}`,
  mod: 'pmp',
  tutor: '',
  startDate: '2025-01-06',
  endDate: '2025-05-30',
  sessions: 12,
  days: ['monday'],
  sessionStartTime: '09:00',
  sessionEndTime: '11:00',
  notes: '',
});

export default function CohortModal({ mode, groups, holidays, initialGroupIdx = 0, initialRow, onSave, onClose }: Props) {
  const [data, setData] = useState<FormData>(() => {
    if (mode === 'edit' && initialRow) {
      return {
        groupIdx: initialGroupIdx,
        label:    initialRow.label,
        dateLbl:  initialRow.dateLbl,
        intake:   initialRow.intake,
        quarter:  initialRow.quarter,
        holidayIds: initialRow.holidayIds || [],
        blks: initialRow.blks.map(b => ({
          id: b.id,
          mod: b.mod,
          tutor: b.tutor,
          startDate: b.startDate,
          endDate: b.endDate,
          sessions: b.sessions,
          days: b.days?.length ? b.days : [inferWeekDayFromIsoDate(b.startDate)],
          sessionStartTime: b.sessionStartTime || '09:00',
          sessionEndTime: b.sessionEndTime || '11:00',
          notes: b.notes || '',
        })),
      };
    }
    return {
      groupIdx: initialGroupIdx,
      label: '',
      dateLbl: '',
      intake: 'Intake 1',
      quarter: 'Q1 2025',
      holidayIds: [],
      blks: [newBlk()],
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedBlk, setExpandedBlk] = useState<string | null>(data.blks[0]?.id || null);

  const rangedBlocks = data.blks.filter(b => isIsoDate(b.startDate) && isIsoDate(b.endDate) && b.startDate <= b.endDate);
  const hasDateRange = rangedBlocks.length > 0;
  const rangeStart = hasDateRange
    ? rangedBlocks.reduce((min, b) => (b.startDate < min ? b.startDate : min), rangedBlocks[0].startDate)
    : '';
  const rangeEnd = hasDateRange
    ? rangedBlocks.reduce((max, b) => (b.endDate > max ? b.endDate : max), rangedBlocks[0].endDate)
    : '';

  const holidaysInRange = hasDateRange
    ? holidays.filter(h => isIsoDate(h.startDate) && isIsoDate(h.endDate) && overlapsRange(rangeStart, rangeEnd, h.startDate, h.endDate))
    : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!hasDateRange) {
      if (data.holidayIds.length) {
        setData(prev => ({ ...prev, holidayIds: [] }));
      }
      return;
    }

    const allowed = new Set(holidaysInRange.map(h => h.id));
    const filtered = data.holidayIds.filter(id => allowed.has(id));
    if (filtered.length !== data.holidayIds.length) {
      setData(prev => ({ ...prev, holidayIds: filtered }));
    }
  }, [hasDateRange, holidaysInRange, data.holidayIds]);

  const setField = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setData(prev => ({ ...prev, [k]: v }));

  const updateBlk = (id: string, k: keyof FormBlk, v: string | number) =>
    setData(prev => ({
      ...prev,
      blks: prev.blks.map(b => b.id === id ? { ...b, [k]: v } : b),
    }));

  const toggleBlkDay = (id: string, day: WeekDayKey) => {
    setData(prev => ({
      ...prev,
      blks: prev.blks.map(b => {
        if (b.id !== id) {
          return b;
        }

        const exists = b.days.includes(day);
        if (exists) {
          if (b.days.length === 1) {
            return b;
          }
          return { ...b, days: b.days.filter(d => d !== day) };
        }
        return { ...b, days: [...b.days, day] };
      }),
    }));
  };

  const addBlk = () => {
    const b = newBlk();
    setData(prev => ({ ...prev, blks: [...prev.blks, b] }));
    setExpandedBlk(b.id);
  };

  const toggleHoliday = (holidayId: string) => {
    setData(prev => {
      const exists = prev.holidayIds.includes(holidayId);
      return {
        ...prev,
        holidayIds: exists ? prev.holidayIds.filter(id => id !== holidayId) : [...prev.holidayIds, holidayId],
      };
    });
  };

  const removeBlk = (id: string) => {
    setData(prev => ({ ...prev, blks: prev.blks.filter(b => b.id !== id) }));
    if (expandedBlk === id) setExpandedBlk(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!data.label.trim())   errs.label   = 'Cohort label is required';
    if (!data.dateLbl.trim()) errs.dateLbl = 'Start date label is required';
    if (data.blks.length === 0) errs.blks  = 'Add at least one module block';
    data.blks.forEach((b, i) => {
      if (!b.startDate) errs[`blk_start_${i}`] = 'Start date required';
      if (!b.endDate)   errs[`blk_end_${i}`]   = 'End date required';
      if (!b.days.length) errs[`blk_days_${i}`] = 'Select at least one weekday';
      if (!b.sessionStartTime) errs[`blk_time_start_${i}`] = 'Start time required';
      if (!b.sessionEndTime) errs[`blk_time_end_${i}`] = 'End time required';
      if (b.sessionStartTime && b.sessionEndTime && b.sessionEndTime <= b.sessionStartTime)
        errs[`blk_time_end_${i}`] = 'End time must be after start time';
      if (b.startDate && b.endDate && b.endDate < b.startDate)
        errs[`blk_end_${i}`] = 'End must be after start';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const row: CohortRow = {
      id: initialRow?.id || `row-${Date.now()}`,
      label:   data.label.trim(),
      dateLbl: data.dateLbl.trim(),
      intake:  data.intake,
      quarter: data.quarter,
      holidayIds: data.holidayIds,
      blks: data.blks.map(b => ({
        id: b.id,
        mod: b.mod,
        tutor: b.tutor.trim(),
        startDate: b.startDate,
        endDate: b.endDate,
        sessions: b.sessions,
        days: b.days,
        sessionStartTime: b.sessionStartTime,
        sessionEndTime: b.sessionEndTime,
        notes: b.notes.trim() || undefined,
      } as ModuleBlock)),
    };
    onSave(data.groupIdx, row, mode === 'edit' ? initialGroupIdx : undefined);
  };

  const selectedGroup = groups[data.groupIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="relative bg-white rounded-xl w-full flex flex-col overflow-hidden shadow-2xl" style={{ maxWidth: 720, maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-base tracking-wide">
              {mode === 'add' ? 'Add New Cohort' : 'Edit Cohort'}
            </h2>
            <p className="text-white/60 text-xs mt-0.5">
              {mode === 'add' ? 'Define cohort details, tutor assignments, and module schedule' : 'Update cohort details, tutors, dates, and modules'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Programme Group */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Programme Group</label>
            <div className="flex gap-2 flex-wrap">
              {groups.map((g, gi) => (
                <button key={gi} onClick={() => setField('groupIdx', gi)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-bold cursor-pointer transition-all whitespace-nowrap"
                  style={{
                    borderColor: data.groupIdx === gi ? g.color : '#E5E7EB',
                    background:  data.groupIdx === gi ? `${g.color}15` : 'white',
                    color:       data.groupIdx === gi ? g.color : '#6B7280',
                  }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                  {g.name.replace('\n', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Cohort info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Cohort Label</label>
              <input type="text" placeholder="e.g. Cohort 3 - G1"
                value={data.label} onChange={e => setField('label', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: errors.label ? '#EF4444' : '#D1D5DB' }} />
              {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Start Date Label</label>
              <input type="text" placeholder="e.g. Aug 2024"
                value={data.dateLbl} onChange={e => setField('dateLbl', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: errors.dateLbl ? '#EF4444' : '#D1D5DB' }} />
              {errors.dateLbl && <p className="text-red-500 text-xs mt-1">{errors.dateLbl}</p>}
            </div>
          </div>

          {/* Holiday selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Linked Holidays (optional)</label>
              <span className="text-xs text-gray-400">{data.holidayIds.length} selected</span>
            </div>
            <div className="max-h-28 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              {!hasDateRange ? (
                <p className="text-xs text-gray-400">Select valid module start and end dates first to load holidays in range.</p>
              ) : holidaysInRange.length === 0 ? (
                <p className="text-xs text-gray-400">No holidays found within {formatDate(rangeStart)} - {formatDate(rangeEnd)}.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {holidaysInRange.map(holiday => {
                    const selected = data.holidayIds.includes(holiday.id);
                    return (
                      <button
                        key={holiday.id}
                        type="button"
                        onClick={() => toggleHoliday(holiday.id)}
                        className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all"
                        style={{
                          borderColor: selected ? '#1B2A4A' : '#D1D5DB',
                          background: selected ? '#E8EEF9' : '#fff',
                          color: selected ? '#1B2A4A' : '#6B7280',
                        }}
                        title={`${holiday.label} (${formatDate(holiday.startDate)} - ${formatDate(holiday.endDate)})`}
                      >
                        {holiday.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Module Blocks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">
                Module Blocks ({data.blks.length})
              </label>
              <button onClick={addBlk}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                style={{ background: '#1B2A4A', color: '#fff' }}>
                <i className="ri-add-line" /> Add Module
              </button>
            </div>
            {errors.blks && <p className="text-red-500 text-xs mb-2">{errors.blks}</p>}

            <div className="space-y-2">
              {data.blks.map((blk, bi) => {
                const modInfo = MS[blk.mod];
                const isExpanded = expandedBlk === blk.id;
                const hasError = errors[`blk_start_${bi}`] || errors[`blk_end_${bi}`];

                return (
                  <div key={blk.id} className="rounded-lg border overflow-hidden"
                    style={{ borderColor: hasError ? '#EF4444' : '#E5E7EB' }}>
                    {/* Block header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedBlk(isExpanded ? null : blk.id)}
                    >
                      <span className="shrink-0 w-3 h-6 rounded-sm" style={{ background: modInfo.bg }} />
                      <span className="font-bold text-sm text-gray-800 flex-1">{modInfo.lbl}</span>
                      {blk.tutor && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <i className="ri-user-line" />
                          {blk.tutor}
                        </span>
                      )}
                      {blk.days.length > 0 && (
                        <span className="text-xs text-gray-500 hidden md:block">
                          {blk.days.map(d => WEEK_DAYS.find(w => w.key === d)?.label.slice(0, 3)).join(' / ')}
                        </span>
                      )}
                      {blk.startDate && blk.endDate && (
                        <span className="text-xs text-gray-400 hidden sm:block">
                          {formatDate(blk.startDate)} → {formatDate(blk.endDate)}
                        </span>
                      )}
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${modInfo.bg}18`, color: modInfo.bg }}>
                        {blk.sessions} sessions
                      </span>
                      <button onClick={e => { e.stopPropagation(); removeBlk(blk.id); }}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-all">
                        <i className="ri-delete-bin-line text-xs" />
                      </button>
                      {isExpanded ? <i className="ri-arrow-up-s-line text-gray-400 text-sm" /> : <i className="ri-arrow-down-s-line text-gray-400 text-sm" />}
                    </div>

                    {/* Expanded fields */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50 space-y-3">
                        {/* Module select */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module</label>
                          <select value={blk.mod} onChange={e => updateBlk(blk.id, 'mod', e.target.value as MKey)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white cursor-pointer focus:outline-none">
                            {(Object.keys(MS) as MKey[]).map(k => (
                              <option key={k} value={k}>{MS[k].lbl}</option>
                            ))}
                          </select>
                        </div>

                        {/* Tutor */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tutor / Lecturer</label>
                          <input type="text" placeholder="e.g. Dr. Andrew Marsh"
                            value={blk.tutor} onChange={e => updateBlk(blk.id, 'tutor', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Start Date</label>
                            <DateField
                              value={blk.startDate}
                              onChange={value => updateBlk(blk.id, 'startDate', value)}
                              placeholder="Choose start date"
                              error={errors[`blk_start_${bi}`]}
                              accentColor={modInfo.bg}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">End Date</label>
                            <DateField
                              value={blk.endDate}
                              onChange={value => updateBlk(blk.id, 'endDate', value)}
                              placeholder="Choose end date"
                              error={errors[`blk_end_${bi}`]}
                              accentColor={modInfo.bg}
                            />
                          </div>
                        </div>

                        {/* Sessions */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Number of Sessions</label>
                          <div className="flex items-center gap-2">
                            <input type="number" min={1} max={100} value={blk.sessions}
                              onChange={e => updateBlk(blk.id, 'sessions', Math.max(1, Number(e.target.value)))}
                              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none" />
                            <span className="text-xs text-gray-400">sessions total</span>
                          </div>
                        </div>

                        {/* Week days */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Week Days</label>
                          <div className="flex flex-wrap gap-2">
                            {WEEK_DAYS.map(day => {
                              const selected = blk.days.includes(day.key);
                              return (
                                <button
                                  key={day.key}
                                  type="button"
                                  onClick={() => toggleBlkDay(blk.id, day.key)}
                                  className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all"
                                  style={{
                                    borderColor: selected ? modInfo.bg : '#D1D5DB',
                                    background: selected ? `${modInfo.bg}18` : '#fff',
                                    color: selected ? modInfo.bg : '#6B7280',
                                  }}
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                          {errors[`blk_days_${bi}`] && <p className="text-red-500 text-xs mt-1">{errors[`blk_days_${bi}`]}</p>}
                        </div>

                        {/* Session time */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session Start Time</label>
                            <input
                              type="time"
                              value={blk.sessionStartTime}
                              onChange={e => updateBlk(blk.id, 'sessionStartTime', e.target.value)}
                              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                              style={{ borderColor: errors[`blk_time_start_${bi}`] ? '#EF4444' : '#E5E7EB' }}
                            />
                            {errors[`blk_time_start_${bi}`] && <p className="text-red-500 text-xs mt-1">{errors[`blk_time_start_${bi}`]}</p>}
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session End Time</label>
                            <input
                              type="time"
                              value={blk.sessionEndTime}
                              onChange={e => updateBlk(blk.id, 'sessionEndTime', e.target.value)}
                              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                              style={{ borderColor: errors[`blk_time_end_${bi}`] ? '#EF4444' : '#E5E7EB' }}
                            />
                            {errors[`blk_time_end_${bi}`] && <p className="text-red-500 text-xs mt-1">{errors[`blk_time_end_${bi}`]}</p>}
                          </div>
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes (optional)</label>
                          <textarea value={blk.notes} onChange={e => updateBlk(blk.id, 'notes', e.target.value)}
                            placeholder="Any additional notes..."
                            rows={2}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {data.blks.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
                  No module blocks yet — click "Add Module" above
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer transition-all">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all"
            style={{ background: selectedGroup?.color || '#1B2A4A' }}>
            {mode === 'add' ? 'Add Cohort' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
