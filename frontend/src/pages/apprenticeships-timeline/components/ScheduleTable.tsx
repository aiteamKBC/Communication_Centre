import { useRef, useState } from 'react';
import ModernSelect from '../../../components/feature/ModernSelect';

interface SessionCell {
  trainer: string;
  time: string;
  highlight?: boolean;
}

interface ScheduleRow {
  cohort: string;
  programme: string;
  programmeColor: string;
  module: string;
  saturday?: SessionCell;
  monday?: SessionCell;
  tuesday?: SessionCell;
  wednesday?: SessionCell;
  thursday?: SessionCell;
  friday?: SessionCell;
  nextModule: string;
  rowHighlight?: string;
}

// Programme colours use KBC navy family
const ME_COLOR  = '#B9871F';
const MM_COLOR  = '#2F6CB6';
const PCP_COLOR = '#1B2A4A';
const MBA_COLOR = '#5278C0';

const INITIAL_ROWS: ScheduleRow[] = [
  {
    cohort: 'Jan 2025', programme: 'ME L4', programmeColor: ME_COLOR, module: 'Martech',
    friday: { trainer: 'Nathan/Elshafeay', time: '9-11 AM' },
    nextModule: 'EPA',
  },
  {
    cohort: 'May 2025', programme: 'ME L4', programmeColor: ME_COLOR, module: 'Martech',
    wednesday: { trainer: 'Nathan/Haneen', time: '9-11 AM' },
    friday: { trainer: 'Crispin/Nour · Femi/Afaan · Nathan/Badr', time: '9-11 AM' },
    nextModule: 'EPA',
  },
  {
    cohort: 'Jul 2025', programme: 'ME L4', programmeColor: ME_COLOR, module: 'Social Media',
    friday: { trainer: 'Samar/Elshafeay', time: '1-3 PM' },
    nextModule: 'Martech',
  },
  {
    cohort: 'Oct 2025', programme: 'ME L4', programmeColor: ME_COLOR, module: 'Impact & Planning',
    wednesday: { trainer: 'Charl/Badr', time: '9-11 AM' },
    nextModule: 'Social Media',
  },
  {
    cohort: 'Feb 2026', programme: 'ME L4', programmeColor: ME_COLOR, module: 'Impact & Planning',
    wednesday: { trainer: 'Charl/Hamod', time: '12-2 PM' },
    friday: { trainer: 'Fredah/Radwa', time: '9-11 AM' },
    nextModule: 'Social Media',
  },
  {
    cohort: 'May 2025', programme: 'MM L6', programmeColor: MM_COLOR, module: 'Commercial',
    friday: { trainer: 'Charl/Adey', time: '9-11 AM' },
    nextModule: 'AI Marketing',
  },
  {
    cohort: 'Oct 2025', programme: 'MM L6', programmeColor: MM_COLOR, module: 'Strategy & Planning',
    monday: { trainer: 'Charl/Nour', time: '9-11 AM' },
    tuesday: { trainer: 'Nathan/Elshafeay', time: '9-11 AM' },
    thursday: { trainer: 'Juliane/Adey', time: '9-11 AM' },
    nextModule: 'Customer Journey',
  },
  {
    cohort: 'Feb 2026', programme: 'MM L6', programmeColor: MM_COLOR, module: 'Strategy & Planning',
    tuesday: { trainer: 'Fredah/Noreen', time: '9-11 AM' },
    thursday: { trainer: 'Femi/Haneen', time: '9-11 AM' },
    friday: { trainer: 'Charl/Femi', time: '12-2 PM' },
    nextModule: 'Customer Journey',
  },
  {
    cohort: 'Aug 2024', programme: 'PCP L6', programmeColor: PCP_COLOR, module: 'PMI SP/MSP',
    friday: { trainer: 'Andrew/Adey', time: '9-11 AM' },
    nextModule: 'EPA',
  },
  {
    cohort: 'May 2025', programme: 'PCP L6', programmeColor: PCP_COLOR, module: 'PMI SP/MSP',
    friday: { trainer: 'Andrew/Adey · Ray/Olivia', time: '9-11 AM' },
    nextModule: 'EPA',
  },
  {
    cohort: 'Jul 2025', programme: 'PCP L6', programmeColor: PCP_COLOR, module: 'PMP',
    wednesday: { trainer: 'Ray/Afaan', time: '9-11 AM' },
    nextModule: 'PMP',
  },
  {
    cohort: 'Oct 2025', programme: 'PCP L6', programmeColor: PCP_COLOR, module: 'PMP',
    thursday: { trainer: 'Amgad/Olivia', time: '9-11 AM' },
    nextModule: 'PMP',
  },
  {
    cohort: 'Feb 2026', programme: 'PCP L6', programmeColor: PCP_COLOR, module: 'PMP',
    wednesday: { trainer: 'Ray/Patryk', time: '12-2 PM' },
    friday: { trainer: 'Ray/Aryan', time: '12-2 PM' },
    nextModule: 'PMP',
  },
  {
    cohort: 'Alfanar', programme: 'PCP L6', programmeColor: PCP_COLOR, module: 'PMP',
    monday: { trainer: 'Break/Adey', time: '9-11 AM' },
    wednesday: { trainer: 'Break/Adey', time: '9-11 AM' },
    nextModule: 'PMP',
    rowHighlight: '#FFFDE7',
  },
  {
    cohort: '—', programme: 'MBA L7', programmeColor: MBA_COLOR, module: 'HR',
    monday: { trainer: 'Charl/Elaf', time: '9-11 AM' },
    nextModule: 'EPA',
  },
];

type DayKey = 'saturday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

// Day columns — navy shades + amber accents, all from the KBC family
const DAY_COLS: { key: DayKey; label: string; cellBg: string; headerBg: string; headerTx: string }[] = [
  { key: 'saturday',  label: 'SATURDAY',  cellBg: '#EEF2FB', headerBg: '#1B2A4A', headerTx: '#fff' },
  { key: 'monday',    label: 'MONDAY',    cellBg: '#EDF1FA', headerBg: '#243560', headerTx: '#fff' },
  { key: 'tuesday',   label: 'TUESDAY',   cellBg: '#EBF0F8', headerBg: '#2E4482', headerTx: '#fff' },
  { key: 'wednesday', label: 'WEDNESDAY', cellBg: '#E9EFF7', headerBg: '#3D5A99', headerTx: '#fff' },
  { key: 'thursday',  label: 'THURSDAY',  cellBg: '#FFF8E0', headerBg: '#F7A800', headerTx: '#1B2A4A' },
  { key: 'friday',    label: 'FRIDAY',    cellBg: '#FFF3CC', headerBg: '#C49A00', headerTx: '#fff' },
];

interface AddRowModalProps {
  mode: 'add' | 'edit';
  initialRow?: ScheduleRow;
  existingRows: ScheduleRow[];
  onSave: (row: ScheduleRow) => void;
  onClose: () => void;
}

function AddRowModal({ mode, initialRow, existingRows, onSave, onClose }: AddRowModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<ScheduleRow>({
    cohort: initialRow?.cohort ?? '',
    programme: initialRow?.programme ?? 'ME L4',
    programmeColor: initialRow?.programmeColor ?? ME_COLOR,
    module: initialRow?.module ?? '',
    saturday: initialRow?.saturday,
    monday: initialRow?.monday,
    tuesday: initialRow?.tuesday,
    wednesday: initialRow?.wednesday,
    thursday: initialRow?.thursday,
    friday: initialRow?.friday,
    rowHighlight: initialRow?.rowHighlight,
    nextModule: initialRow?.nextModule ?? '',
  });

  const PROGRAMMES = [
    { label: 'ME L4',  color: ME_COLOR  },
    { label: 'MM L6',  color: MM_COLOR  },
    { label: 'PCP L6', color: PCP_COLOR },
    { label: 'MBA L7', color: MBA_COLOR },
  ];
  const rowOptionsSource = initialRow ? [...existingRows, initialRow] : existingRows;
  const cohortOptions = Array.from(new Set(rowOptionsSource.map(row => row.cohort)))
    .map(cohort => ({ label: cohort, value: cohort }));
  const moduleOptions = Array.from(new Set(rowOptionsSource.map(row => row.module)))
    .map(module => ({ label: module, value: module }));
  const nextModuleOptions = Array.from(new Set(rowOptionsSource.map(row => row.nextModule)))
    .map(nextModule => ({ label: nextModule, value: nextModule }));
  const programmeOptions = PROGRAMMES.map(programme => ({ label: programme.label, value: programme.label }));

  const setCell = (day: DayKey, field: 'trainer' | 'time', value: string) => {
    setForm(prev => ({
      ...prev,
      [day]: { ...(prev[day] || { trainer: '', time: '' }), [field]: value },
    }));
  };

  const clearCell = (day: DayKey) => {
    setForm(prev => { const n = { ...prev }; delete n[day]; return n; });
  };

  const handleSave = () => {
    if (!form.cohort.trim() || !form.module.trim()) return;
    // clean empty cells
    const cleaned = { ...form };
    DAY_COLS.forEach(d => {
      const cell = cleaned[d.key] as SessionCell | undefined;
      if (cell && !cell.trainer.trim()) delete cleaned[d.key];
    });
    onSave(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="modal-backdrop" />
      <div
        ref={modalRef}
        className="relative bg-white rounded-xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 700, maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <h2 className="text-white font-extrabold text-base">{mode === 'edit' ? 'Edit Schedule Row' : 'Add Schedule Row'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Top fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Cohort</label>
              <ModernSelect
                value={form.cohort}
                options={cohortOptions}
                onChange={value => setForm(prev => ({ ...prev, cohort: value }))}
                placeholder="Select cohort"
                boundaryRef={modalRef}
                menuMinWidth={220}
                buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module</label>
              <ModernSelect
                value={form.module}
                options={moduleOptions}
                onChange={value => setForm(prev => ({ ...prev, module: value }))}
                placeholder="Select module"
                boundaryRef={modalRef}
                menuMinWidth={240}
                buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Programme</label>
              <ModernSelect
                value={form.programme}
                options={programmeOptions}
                onChange={value => {
                  const selectedProgramme = PROGRAMMES.find(programme => programme.label === value);
                  setForm(prev => ({
                    ...prev,
                    programme: value,
                    programmeColor: selectedProgramme?.color ?? prev.programmeColor,
                  }));
                }}
                placeholder="Select programme"
                boundaryRef={modalRef}
                menuMinWidth={220}
                buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Next Module</label>
              <ModernSelect
                value={form.nextModule}
                options={nextModuleOptions}
                onChange={value => setForm(prev => ({ ...prev, nextModule: value }))}
                placeholder="Select next module"
                boundaryRef={modalRef}
                menuMinWidth={240}
                buttonClassName="min-h-[44px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.35)]"
              />
            </div>
          </div>

          {/* Day sessions */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sessions by Day</label>
            <div className="space-y-2">
              {DAY_COLS.map(day => {
                const cell = form[day.key] as SessionCell | undefined;
                return (
                  <div key={day.key} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 bg-gray-50">
                    <span className="w-24 text-xs font-bold shrink-0" style={{ color: day.headerBg }}>{day.label}</span>
                    <input
                      placeholder="Trainer names"
                      value={cell?.trainer || ''}
                      onChange={e => setCell(day.key, 'trainer', e.target.value)}
                      className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none"
                    />
                    <input
                      placeholder="Time (e.g. 9-11 AM)"
                      value={cell?.time || ''}
                      onChange={e => setCell(day.key, 'time', e.target.value)}
                      className="w-32 border border-gray-200 rounded-md px-2 py-1.5 text-xs focus:outline-none"
                    />
                    {cell?.trainer && (
                      <button onClick={() => clearCell(day.key)} className="text-gray-300 hover:text-red-400 cursor-pointer transition-colors">
                        <i className="ri-close-line text-sm" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={!form.cohort.trim() || !form.module.trim()}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white cursor-pointer disabled:opacity-50 transition-all"
            style={{ background: '#1B2A4A' }}>
            {mode === 'edit' ? 'Save Changes' : 'Add Row'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleTable() {
  const [rows, setRows] = useState<ScheduleRow[]>(INITIAL_ROWS);
  const [modalState, setModalState] = useState<{ mode: 'add' | 'edit'; index?: number } | null>(null);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  const handleAdd = (row: ScheduleRow) => {
    setRows(prev => [...prev, row]);
    setModalState(null);
  };

  const handleEdit = (index: number, row: ScheduleRow) => {
    setRows(prev => prev.map((currentRow, currentIndex) => (currentIndex === index ? row : currentRow)));
    setModalState(null);
  };

  const handleDelete = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setDeleteIdx(null);
  };

  const renderCell = (cell: SessionCell | undefined, bg: string) => {
    if (!cell) return <td className="border border-gray-200 px-2 py-1.5" style={{ minWidth: 140 }} />;
    return (
      <td className="border border-gray-200 px-2 py-1.5 text-center" style={{ background: bg, minWidth: 140 }}>
        <p className="font-semibold leading-tight" style={{ fontSize: '11px', color: '#1F2937' }}>{cell.trainer}</p>
        <p style={{ fontSize: '10px', color: '#6B7280' }}>({cell.time})</p>
      </td>
    );
  };

  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_36px_-28px_rgba(15,23,42,0.24)]">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3" style={{ background: '#F8FAFC' }}>
        <div>
          <h3 className="text-sm font-extrabold tracking-wide text-kbc-navy">Session Schedule Table</h3>
          <p className="mt-0.5 text-xs text-slate-400">{rows.length} active sessions across all programmes</p>
        </div>
        <button
          onClick={() => setModalState({ mode: 'add' })}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold text-white cursor-pointer transition-all hover:opacity-90"
          style={{ background: '#1B2A4A' }}
        >
          <i className="ri-add-line" /> Add Session Row
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 1100 }}>
          <thead>
            {/* Super header */}
            <tr>
              <th colSpan={3} className="border border-slate-300 py-3 text-center text-sm font-extrabold tracking-wide text-white" style={{ background: '#1B2A4A' }}>
                Apprenticeship
              </th>
              <th colSpan={6} className="border border-slate-300 py-3 text-center text-sm font-extrabold tracking-widest text-[#1B2A4A]" style={{ background: '#DDF5E7' }}>
                2026
              </th>
              <th className="border border-slate-300 py-3 text-center text-xs font-extrabold text-white" style={{ background: '#1B2A4A' }}>
                Next Module
              </th>
              <th className="w-16 border border-slate-200 bg-slate-50 py-3 text-center text-xs font-bold text-slate-400">
                Actions
              </th>
            </tr>
            {/* Column labels */}
            <tr style={{ background: '#F1F5F9' }}>
              <th className="border border-slate-200 px-3 py-2 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600" style={{ minWidth: 80 }}>Cohort</th>
              <th className="border border-slate-200 px-3 py-2 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600" style={{ minWidth: 80 }}>Programme</th>
              <th className="border border-slate-200 px-3 py-2 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600" style={{ minWidth: 130 }}>Module</th>
              {DAY_COLS.map(d => (
                <th key={d.key} className="border border-gray-200 px-2 py-2 text-center text-xs font-extrabold uppercase tracking-wide" style={{ background: d.headerBg, color: d.headerTx, minWidth: 140 }}>
                  {d.label}
                </th>
              ))}
              <th className="border border-slate-200 px-3 py-2 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600" style={{ minWidth: 90 }}>Next Module</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-xs font-bold text-gray-400 bg-gray-50 w-16">—</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className="group/srow hover:brightness-95 transition-all"
                style={{ background: row.rowHighlight || (idx % 2 === 0 ? '#FFFFFF' : '#FAFBFC') }}
              >
                {/* Cohort */}
                <td className="border border-gray-200 px-3 py-1.5">
                  <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-gray-700">{row.cohort}</span>
                </td>
                {/* Programme */}
                <td className="border border-gray-200 px-3 py-1.5">
                  <span className="font-bold text-xs whitespace-nowrap" style={{ color: row.programmeColor }}>{row.programme}</span>
                </td>
                {/* Module */}
                <td className="border border-gray-200 px-3 py-1.5">
                  <span className="text-xs text-gray-700 font-semibold">{row.module}</span>
                </td>
                {/* Day cells */}
                {DAY_COLS.map(d => renderCell(row[d.key] as SessionCell | undefined, d.cellBg))}
                {/* Next Module */}
                <td className="border border-gray-200 px-3 py-1.5">
                  <span className="text-xs font-bold text-gray-600 whitespace-nowrap">{row.nextModule}</span>
                </td>
                {/* Actions */}
                <td className="border border-gray-200 px-2 py-1.5 text-center bg-gray-50">
                  {deleteIdx === idx ? (
                    <div className="flex items-center gap-1 justify-center">
                      <button onClick={() => handleDelete(idx)} className="px-2 py-0.5 rounded text-xs font-bold text-white bg-red-500 hover:bg-red-600 cursor-pointer whitespace-nowrap transition-colors">
                        Yes
                      </button>
                      <button onClick={() => setDeleteIdx(null)} className="px-2 py-0.5 rounded text-xs font-bold text-gray-500 bg-gray-200 hover:bg-gray-300 cursor-pointer transition-colors">
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover/srow:opacity-100">
                      <button
                        onClick={() => setModalState({ mode: 'edit', index: idx })}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-kbc-navy shadow-[0_10px_24px_-18px_rgba(15,23,42,0.32)] transition-all hover:-translate-y-0.5 hover:border-kbc-navy/20 hover:bg-kbc-navy hover:text-white"
                        title="Edit row"
                      >
                        <i className="ri-edit-line text-[13px]" />
                      </button>
                      <button
                        onClick={() => setDeleteIdx(idx)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-400 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.32)] transition-all hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-500 hover:text-white"
                        title="Delete row"
                      >
                        <i className="ri-delete-bin-line text-[13px]" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-8 text-sm text-gray-400 italic border border-gray-200">
                  No sessions yet — click "Add Session Row" to get started
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalState && (
        <AddRowModal
          mode={modalState.mode}
          initialRow={modalState.mode === 'edit' && modalState.index !== undefined ? rows[modalState.index] : undefined}
          existingRows={rows}
          onSave={row => {
            if (modalState.mode === 'edit' && modalState.index !== undefined) {
              handleEdit(modalState.index, row);
              return;
            }
            handleAdd(row);
          }}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}
