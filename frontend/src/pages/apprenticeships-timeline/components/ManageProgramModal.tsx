import { useState } from 'react';
import type { CustomProgram, ProgrammeGroup } from '../types';
import { formatDate } from '../utils';
import DateField from './DateField';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface Props {
  program: CustomProgram;
  group: ProgrammeGroup;
  onSave: (program: CustomProgram) => void;
  onClose: () => void;
  onAddCohort: () => void;
  onEditCohort: (rowIdx: number) => void;
  onDeleteCohort: (rowIdx: number) => void;
  onDeleteProgram: () => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function contrastColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1F2937' : '#ffffff';
}

function isIsoDate(value: string): boolean {
  if (!value) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return false;
  }

  const parsed = new Date(year, month - 1, day);
  return (
    !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
  );
}

function parseProgrammeDates(sub: string): { startDate: string; endDate: string } {
  const [startDate = '', endDate = ''] = (sub || '').split('|');
  return {
    startDate: isIsoDate(startDate) ? startDate : '',
    endDate: isIsoDate(endDate) ? endDate : '',
  };
}

function serializeProgrammeDates(startDate: string, endDate: string): string {
  return startDate && endDate ? `${startDate}|${endDate}` : '';
}

function addYearsToIsoDate(value: string, years: number): string {
  if (!isIsoDate(value)) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year + years, month - 1, day);
  if (result.getMonth() !== month - 1) {
    result.setDate(0);
  }
  const nextYear = result.getFullYear();
  const nextMonth = `${result.getMonth() + 1}`.padStart(2, '0');
  const nextDay = `${result.getDate()}`.padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getProgrammeRange(group: ProgrammeGroup): { start: string; end: string } | null {
  const blocks = group.rows.flatMap(row => row.blks);
  if (!blocks.length) {
    return null;
  }

  const start = blocks.reduce((min, block) => block.startDate < min ? block.startDate : min, blocks[0].startDate);
  const end = blocks.reduce((max, block) => block.endDate > max ? block.endDate : max, blocks[0].endDate);
  return { start, end };
}

function getCohortRange(group: ProgrammeGroup, rowIdx: number): { start: string; end: string } | null {
  const blocks = group.rows[rowIdx]?.blks || [];
  if (!blocks.length) {
    return null;
  }

  const start = blocks.reduce((min, block) => block.startDate < min ? block.startDate : min, blocks[0].startDate);
  const end = blocks.reduce((max, block) => block.endDate > max ? block.endDate : max, blocks[0].endDate);
  return { start, end };
}

export default function ManageProgramModal({
  program,
  group,
  onSave,
  onClose,
  onAddCohort,
  onEditCohort,
  onDeleteCohort,
  onDeleteProgram,
}: Props) {
  const storedDates = parseProgrammeDates(program.sub || '');
  const programmeRange = getProgrammeRange(group);
  const [name, setName] = useState(program.name || '');
  const [startDate, setStartDate] = useState(storedDates.startDate || programmeRange?.start || '');
  const [endDate, setEndDate] = useState(storedDates.endDate || programmeRange?.end || '');
  const [color, setColor] = useState(program.color || '#1B2A4A');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleDeleteCohortRequest = async (rowIdx: number) => {
    const row = group.rows[rowIdx];
    const result = await kbcSwal.fire({
      title: 'Delete Cohort?',
      html: `You are about to permanently delete <strong>${row?.label || 'this cohort'}</strong>. This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Cohort',
      cancelButtonText: 'Cancel',
    });

    if (result.isConfirmed) {
      onDeleteCohort(rowIdx);
    }
  };

  const handleSave = () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) {
      nextErrors.name = 'Programme name is required';
    }
    if (!startDate) {
      nextErrors.startDate = 'Start date is required';
    }
    if (!endDate) {
      nextErrors.endDate = 'End date is required';
    }
    if (startDate && endDate && endDate < startDate) {
      nextErrors.endDate = 'End date must be after start date';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

    const { r, g, b } = hexToRgb(color);
    onSave({
      id: program.id,
      name: name.trim(),
      sub: serializeProgrammeDates(startDate, endDate),
      color,
      rowBg: `rgba(${r},${g},${b},0.04)`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/28 backdrop-blur-[6px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl w-full shadow-2xl overflow-hidden flex flex-col" style={{ maxWidth: 760, maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-sm tracking-wide">Manage Programme</h2>
            <p className="text-white/60 text-xs mt-0.5">Edit programme details and manage the cohorts inside it</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
            <i className="ri-close-line text-base" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 space-y-5">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Programme Name</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors({}); }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: errors.name ? '#EF4444' : '#D1D5DB' }}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Start Date</label>
                <DateField
                  value={startDate}
                  onChange={value => {
                    setStartDate(value);
                    setEndDate(value ? addYearsToIsoDate(value, 2) : '');
                    setErrors(prev => ({ ...prev, startDate: '', endDate: '' }));
                  }}
                  placeholder="Choose start date"
                  error={errors.startDate}
                  accentColor={color}
                />
                {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">End Date</label>
                <DateField
                  value={endDate}
                  onChange={value => {
                    setEndDate(value);
                    setErrors(prev => ({ ...prev, startDate: '', endDate: '' }));
                  }}
                  placeholder="Choose end date"
                  error={errors.endDate}
                  accentColor={color}
                />
                {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Programme Color</label>
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
                  <div>
                    <p className="font-extrabold leading-tight whitespace-normal break-words" style={{ fontSize: '10px', color: contrastColor(color) }}>
                      {name || 'Programme Name'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Programme Schedule</p>
                {startDate && endDate ? (
                  <p className="text-sm font-semibold text-gray-800 mt-1">
                    {formatDate(startDate)} - {formatDate(endDate)}
                  </p>
                ) : programmeRange ? (
                  <p className="text-sm font-semibold text-gray-800 mt-1">
                    {formatDate(programmeRange.start)} - {formatDate(programmeRange.end)}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">No dates yet. Add a cohort to define the programme schedule.</p>
                )}
              </div>
              <button
                onClick={onAddCohort}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer transition-all hover:opacity-90"
                style={{ background: '#1B2A4A' }}
              >
                <i className="ri-add-line" />
                Add Cohort
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Cohorts in this Programme</label>
              <span className="text-xs text-gray-400">{group.rows.length} total</span>
            </div>

            <div className="space-y-2">
              {group.rows.map((row, rowIdx) => {
                const range = getCohortRange(group, rowIdx);
                const sessions = row.blks.reduce((sum, block) => sum + block.sessions, 0);

                return (
                  <div key={row.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-bold text-gray-800">{row.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {row.dateLbl}
                        {row.endDateLbl ? ` - ${row.endDateLbl}` : ''}
                        {row.intake ? ` · ${row.intake}` : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {range ? `${formatDate(range.start)} - ${formatDate(range.end)}` : 'No dates yet'}
                        {` · ${sessions} sessions`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEditCohort(rowIdx)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer transition-all hover:opacity-90"
                        style={{ background: group.color }}
                      >
                        <i className="ri-edit-line" />
                        Edit Cohort
                      </button>
                      <button
                        onClick={() => { void handleDeleteCohortRequest(rowIdx); }}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border bg-white text-gray-400 border-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      >
                        <i className="ri-delete-bin-line" />
                        Delete Cohort
                      </button>
                    </div>
                  </div>
                );
              })}

              {group.rows.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white px-4 py-6 text-center">
                  <p className="text-sm text-gray-400">No cohorts in this programme yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onDeleteProgram}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
          >
            <i className="ri-delete-bin-line" />
            Delete Programme
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
              Close
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all hover:opacity-90"
              style={{ background: '#1B2A4A' }}
            >
              <i className="ri-save-line" />
              Save Programme
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
