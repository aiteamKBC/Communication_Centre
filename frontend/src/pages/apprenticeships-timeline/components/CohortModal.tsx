import { useState, useRef } from 'react';
import ModernSelect from '@/components/feature/ModernSelect';

// ── Shared types & utils ───────────────────────────────────────────────────
export type MKey = 'pmp' | 'pmiSP' | 'evm' | 'risk' | 'ppc' | 'impact' | 'social' | 'tech' | 'strat' | 'comm' | 'cust' | 'ai';

// All module colours from the KBC navy-amber family
export const MS: Record<MKey, { lbl: string; bg: string; tx: string }> = {
  pmp:    { lbl: 'PMP',                 bg: '#1B2A4A', tx: '#fff' },
  pmiSP:  { lbl: 'PMI SP / MSP',        bg: '#243560', tx: '#fff' },
  evm:    { lbl: 'EVM / Portfolio',     bg: '#F7A800', tx: '#1B2A4A' },
  risk:   { lbl: 'Risk Management',     bg: '#2E4482', tx: '#fff' },
  ppc:    { lbl: 'PPC / PMI PMO',       bg: '#3D5A99', tx: '#fff' },
  impact: { lbl: 'Impact & Planning',   bg: '#C49A00', tx: '#fff' },
  social: { lbl: 'Social Media',        bg: '#4A6DB0', tx: '#fff' },
  tech:   { lbl: 'Martech',             bg: '#B8860B', tx: '#fff' },
  strat:  { lbl: 'Strategy & Planning', bg: '#1B3A7A', tx: '#fff' },
  comm:   { lbl: 'Commercial Int',      bg: '#5278C0', tx: '#fff' },
  cust:   { lbl: 'Customer Journey',    bg: '#A07800', tx: '#fff' },
  ai:     { lbl: 'AI Marketing',        bg: '#D4A900', tx: '#1B2A4A' },
};

export const mi = (y: number, m: number): number => (y - 2024) * 12 + (m - 1) - 7;

const fromIndex = (s: number): { year: number; month: number } => ({
  year:  2024 + Math.floor((s + 7) / 12),
  month: ((s + 7) % 12) + 1,
});

export interface Blk  { mod: MKey; s: number; d: number; }
export interface CRow { label: string; dateLbl: string; blks: Blk[]; }
export interface Group {
  name: string; sub: string; color: string; rowBg: string; rows: CRow[];
}

interface ModalBlk { mod: MKey; startYear: number; startMonth: number; duration: number; }

interface ModalData {
  groupIdx: number;
  label: string;
  dateLbl: string;
  blks: ModalBlk[];
}

interface Props {
  mode: 'add' | 'edit';
  groups: Group[];
  initialGroupIdx?: number;
  initialRow?: CRow;
  onSave: (groupIdx: number, row: CRow, prevGroupIdx?: number) => void;
  onClose: () => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEARS  = [2024, 2025, 2026, 2027];

const DEFAULT_BLK: ModalBlk = { mod: 'pmp', startYear: 2025, startMonth: 1, duration: 4 };
const MODULE_OPTIONS = (Object.keys(MS) as MKey[]).map((key) => ({
  value: key,
  label: MS[key].lbl,
}));
const YEAR_OPTIONS = YEARS.map((year) => ({
  value: String(year),
  label: String(year),
}));
const MONTH_OPTIONS = MONTHS.map((month, index) => ({
  value: String(index + 1),
  label: month,
}));

export default function CohortModal({ mode, groups, initialGroupIdx = 0, initialRow, onSave, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<ModalData>(() => {
    if (mode === 'edit' && initialRow) {
      return {
        groupIdx: initialGroupIdx,
        label:    initialRow.label,
        dateLbl:  initialRow.dateLbl,
        blks: initialRow.blks.map(b => {
          const { year, month } = fromIndex(b.s);
          return { mod: b.mod, startYear: year, startMonth: month, duration: b.d };
        }),
      };
    }
    return { groupIdx: initialGroupIdx, label: '', dateLbl: '', blks: [{ ...DEFAULT_BLK }] };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = <K extends keyof ModalData>(k: K, v: ModalData[K]) =>
    setData(prev => ({ ...prev, [k]: v }));

  const updateBlk = (i: number, k: keyof ModalBlk, v: string | number) =>
    setData(prev => ({
      ...prev,
      blks: prev.blks.map((b, idx) => idx === i ? { ...b, [k]: v } : b),
    }));

  const addBlk    = () => setData(prev => ({ ...prev, blks: [...prev.blks, { ...DEFAULT_BLK }] }));
  const removeBlk = (i: number) => setData(prev => ({ ...prev, blks: prev.blks.filter((_, idx) => idx !== i) }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!data.label.trim())   errs.label   = 'Cohort label is required';
    if (!data.dateLbl.trim()) errs.dateLbl = 'Start date label is required';
    if (data.blks.length === 0) errs.blks  = 'Add at least one module block';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const row: CRow = {
      label:    data.label.trim(),
      dateLbl:  data.dateLbl.trim(),
      blks: data.blks.map(b => ({
        mod: b.mod,
        s:   mi(b.startYear, b.startMonth),
        d:   b.duration,
      })),
    };
    onSave(data.groupIdx, row, mode === 'edit' ? initialGroupIdx : undefined);
  };

  const selectedGroup = groups[data.groupIdx];
  const groupOptions = groups.map((group, index) => ({
    value: String(index),
    label: group.name.replace('\n', ' '),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="modal-backdrop" />
      <div
        ref={panelRef}
        className="relative mx-4 flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-base tracking-wide">
              {mode === 'add' ? 'Add New Cohort' : 'Edit Cohort'}
            </h2>
            <p className="text-white/60 text-xs mt-0.5">
              {mode === 'add' ? 'Define cohort details and module timeline blocks' : 'Update cohort label, dates, and modules'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 transition-colors cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">

          {/* Programme Group */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Programme Group</label>
            <div className="relative">
              <div
                className="pointer-events-none absolute left-4 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-xl"
                style={{ background: `${selectedGroup?.color || '#1B2A4A'}15`, color: selectedGroup?.color || '#1B2A4A' }}
              >
                <i className="ri-folder-open-line text-sm" />
              </div>
              <ModernSelect
                value={String(data.groupIdx)}
                onChange={(value) => setField('groupIdx', Number(value))}
                options={groupOptions}
                placeholder="Select programme group"
                menuMinWidth={320}
                boundaryRef={panelRef}
                buttonClassName="min-h-[48px] rounded-2xl border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] py-3 pl-12 pr-4 shadow-[0_12px_28px_-20px_rgba(27,42,74,0.42)] hover:border-kbc-navy/20 hover:shadow-[0_18px_34px_-22px_rgba(27,42,74,0.48)]"
                menuClassName="rounded-[20px] border-slate-200/90 p-2 shadow-[0_22px_44px_-24px_rgba(27,42,74,0.45)]"
              />
            </div>
            {selectedGroup && (
              <p className="mt-1 text-xs text-gray-400">Period: <span className="font-semibold text-gray-600">{selectedGroup.sub}</span></p>
            )}
          </div>

          {/* Labels row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Cohort Label</label>
              <input
                type="text"
                placeholder="e.g. Cohort 3 - G1"
                value={data.label}
                onChange={e => setField('label', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: errors.label ? '#EF4444' : '#D1D5DB',
                  '--tw-ring-color': selectedGroup?.color || '#1B2A4A',
                } as React.CSSProperties}
              />
              {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Start Date Label</label>
              <input
                type="text"
                placeholder="e.g. Aug 2024"
                value={data.dateLbl}
                onChange={e => setField('dateLbl', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-all"
                style={{ borderColor: errors.dateLbl ? '#EF4444' : '#D1D5DB' }}
              />
              {errors.dateLbl && <p className="text-red-500 text-xs mt-1">{errors.dateLbl}</p>}
            </div>
          </div>

          {/* Module Blocks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Module Timeline Blocks</label>
              <button
                onClick={addBlk}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                style={{ background: '#1B2A4A', color: '#fff' }}
              >
                <i className="ri-add-line" /> Add Block
              </button>
            </div>
            {errors.blks && <p className="text-red-500 text-xs mb-2">{errors.blks}</p>}

            <div className="space-y-2">
              {data.blks.map((blk, bi) => {
                const modInfo = MS[blk.mod];
                return (
                  <div key={bi} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                    {/* colour pill */}
                    <span className="shrink-0 w-3 h-8 rounded-sm" style={{ background: modInfo.bg }} />

                    {/* Module */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 font-semibold mb-0.5">Module</p>
                      <ModernSelect
                        value={blk.mod}
                        onChange={(value) => updateBlk(bi, 'mod', value as MKey)}
                        options={MODULE_OPTIONS}
                        menuMinWidth={280}
                        boundaryRef={panelRef}
                        buttonClassName="min-h-[40px] rounded-xl border-gray-200 bg-white px-3 py-2 text-xs shadow-none hover:border-kbc-navy/20"
                        menuClassName="rounded-2xl border-slate-200/90 p-2 shadow-[0_20px_40px_-24px_rgba(27,42,74,0.45)]"
                      />
                    </div>

                    {/* Start Year */}
                    <div className="shrink-0 w-24">
                      <p className="text-xs text-gray-400 font-semibold mb-0.5">Year</p>
                      <ModernSelect
                        value={String(blk.startYear)}
                        onChange={(value) => updateBlk(bi, 'startYear', Number(value))}
                        options={YEAR_OPTIONS}
                        menuMinWidth={120}
                        boundaryRef={panelRef}
                        buttonClassName="min-h-[40px] rounded-xl border-gray-200 bg-white px-3 py-2 text-xs shadow-none hover:border-kbc-navy/20"
                        menuClassName="rounded-2xl border-slate-200/90 p-2 shadow-[0_20px_40px_-24px_rgba(27,42,74,0.45)]"
                      />
                    </div>

                    {/* Start Month */}
                    <div className="shrink-0 w-24">
                      <p className="text-xs text-gray-400 font-semibold mb-0.5">Month</p>
                      <ModernSelect
                        value={String(blk.startMonth)}
                        onChange={(value) => updateBlk(bi, 'startMonth', Number(value))}
                        options={MONTH_OPTIONS}
                        menuMinWidth={120}
                        boundaryRef={panelRef}
                        buttonClassName="min-h-[40px] rounded-xl border-gray-200 bg-white px-3 py-2 text-xs shadow-none hover:border-kbc-navy/20"
                        menuClassName="rounded-2xl border-slate-200/90 p-2 shadow-[0_20px_40px_-24px_rgba(27,42,74,0.45)]"
                      />
                    </div>

                    {/* Duration */}
                    <div className="shrink-0 w-20">
                      <p className="text-xs text-gray-400 font-semibold mb-0.5">Duration</p>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={blk.duration}
                          onChange={e => updateBlk(bi, 'duration', Math.max(1, Number(e.target.value)))}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs font-semibold text-center bg-white focus:outline-none"
                        />
                        <span className="text-xs text-gray-400 shrink-0">mo</span>
                      </div>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeBlk(bi)}
                      className="shrink-0 mt-5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                      aria-label="Delete block"
                      title="Delete block"
                    >
                      <i className="ri-delete-bin-line text-sm" />
                    </button>
                  </div>
                );
              })}
              {data.blks.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
                  No module blocks yet — click "Add Block" above
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white transition-all cursor-pointer"
            style={{ background: selectedGroup?.color || '#1B2A4A' }}
          >
            {mode === 'add' ? 'Add Cohort' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
