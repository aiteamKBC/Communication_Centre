import { useState, useRef, useCallback, useMemo } from 'react';
import type { ProgrammeGroup, Holiday, ZoomLevel, ModuleBlock } from '../types';
import { MS } from '../data';
import {
  generateColumns, getBlockPosition, getTotalWidth,
  formatDate, formatDateShort, durationWeeks, getHolidayOverlaps,
  ZOOM_LEVELS, zoomIn, zoomOut, getZoomLabel,
} from '../utils';

const LEFT_W = 220;
const ROW_H  = 58;

interface TooltipData {
  blk: ModuleBlock;
  cohortLabel: string;
  programmeName: string;
  programmeColor: string;
  holidays: Holiday[];
  x: number;
  y: number;
}

interface Props {
  groups: ProgrammeGroup[];
  holidays: Holiday[];
  zoom: ZoomLevel;
  onZoomChange: (z: ZoomLevel) => void;
  onAddRow: (groupIdx: number) => void;
  onEditRow: (groupIdx: number, rowIdx: number) => void;
  onDeleteRow: (groupIdx: number, rowIdx: number) => void;
  canManageCohorts?: boolean;
}

// ── View window per zoom level ────────────────────────────────────────────
function getDefaultViewWindow(zoom: ZoomLevel): { start: Date; end: Date } {
  const now = new Date('2026-04-02');
  if (zoom === 'year')   return { start: new Date('2024-01-01'), end: new Date('2027-12-31') };
  if (zoom === 'intake') return { start: new Date('2024-08-01'), end: new Date('2027-07-31') };
  if (zoom === 'month')  return { start: new Date('2024-08-01'), end: new Date('2027-07-31') };
  if (zoom === 'week') {
    const s = new Date(now); s.setDate(s.getDate() - 60);
    const e = new Date(now); e.setDate(e.getDate() + 120);
    return { start: s, end: e };
  }
  // day
  const s = new Date(now); s.setDate(s.getDate() - 14);
  const e = new Date(now); e.setDate(e.getDate() + 28);
  return { start: s, end: e };
}

// ── Tooltip ───────────────────────────────────────────────────────────────
function ModuleTooltip({ data, onClose }: { data: TooltipData; onClose: () => void }) {
  const mod = MS[data.blk.mod];
  const weeks = durationWeeks(data.blk.startDate, data.blk.endDate);
  const hasHolidays = data.holidays.length > 0;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: Math.min(data.x + 12, window.innerWidth - 300), top: Math.max(data.y - 10, 8) }}
    >
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg w-72 overflow-hidden pointer-events-auto">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-2" style={{ background: mod.bg }}>
          <span className="font-extrabold text-sm flex-1 truncate" style={{ color: mod.tx }}>{mod.lbl}</span>
          <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity" style={{ color: mod.tx }}>
            <i className="ri-close-line text-xs" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          {/* Programme + Cohort */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: data.programmeColor }} />
            <span className="text-xs font-semibold text-gray-700">{data.programmeName.replace('\n', ' ')}</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${data.programmeColor}18`, color: data.programmeColor }}>
              {data.cohortLabel}
            </span>
          </div>

          {/* Tutor */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <i className="ri-user-line text-gray-400 text-xs" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none">Tutor / Lecturer</p>
              <p className="text-xs font-bold text-gray-800 mt-0.5">{data.blk.tutor || '—'}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <i className="ri-calendar-line text-gray-400 text-xs" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none">Dates</p>
              <p className="text-xs font-bold text-gray-800 mt-0.5">
                {formatDate(data.blk.startDate)} &rarr; {formatDate(data.blk.endDate)}
              </p>
              <p className="text-xs text-gray-400">{weeks} weeks</p>
            </div>
          </div>

          {/* Sessions */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <i className="ri-stack-line text-gray-400 text-xs" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none">Sessions</p>
              <p className="text-xs font-bold text-gray-800 mt-0.5">{data.blk.sessions} sessions total</p>
            </div>
          </div>

          {/* Holiday overlaps */}
          {hasHolidays && (
            <div className="rounded-lg p-2.5 border" style={{ background: '#FFF8E0', borderColor: '#F7A800' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <i className="ri-alert-line text-xs" style={{ color: '#C49A00' }} />
                <span className="text-xs font-bold" style={{ color: '#C49A00' }}>Holiday Overlap</span>
              </div>
              {data.holidays.map(h => (
                <p key={h.id} className="text-xs text-gray-600">
                  {h.label} ({formatDateShort(h.startDate)}–{formatDateShort(h.endDate)})
                </p>
              ))}
            </div>
          )}

          {data.blk.notes && (
            <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-2">{data.blk.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function GanttTimeline({ groups, holidays, zoom, onZoomChange, onAddRow, onEditRow, onDeleteRow, canManageCohorts = true }: Props) {
  const [tooltip, setTooltip]           = useState<TooltipData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ gi: number; ri: number } | null>(null);
  const [viewWindow, setViewWindow]     = useState(() => getDefaultViewWindow(zoom));
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleZoomChange = useCallback((z: ZoomLevel) => {
    onZoomChange(z);
    setViewWindow(getDefaultViewWindow(z));
    setTooltip(null);
  }, [onZoomChange]);

  const cols = useMemo(() => generateColumns(zoom, viewWindow.start, viewWindow.end), [zoom, viewWindow]);
  const totalWidth = useMemo(() => getTotalWidth(cols), [cols]);

  const nowDate = '2026-04-02';
  const nowPos  = getBlockPosition(nowDate, nowDate, cols);

  // ── Holiday overlay positions ─────────────────────────────────────────
  const holidayPositions = useMemo(() =>
    holidays.map(h => ({ h, pos: getBlockPosition(h.startDate, h.endDate, cols) }))
      .filter(x => x.pos !== null),
  [holidays, cols]);

  // ── Header rows ───────────────────────────────────────────────────────
  const renderHeaders = () => {
    if (zoom === 'month') {
      // Group by year
      const yearGroups: { year: string; cols: typeof cols }[] = [];
      cols.forEach(c => {
        const yr = c.subLabel || '';
        const last = yearGroups[yearGroups.length - 1];
        if (last && last.year === yr) last.cols.push(c);
        else yearGroups.push({ year: yr, cols: [c] });
      });
      return (
        <>
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
            <div className="flex">
              {yearGroups.map((yg, i) => {
                const w = yg.cols.reduce((s, c) => s + c.widthPx, 0);
                const navyShades = ['#1B2A4A','#243560','#2E4482','#3D5A99'];
                return (
                  <div key={i} className="text-center font-bold py-2 border-r border-white/20 tracking-widest shrink-0"
                    style={{ width: w, background: navyShades[i % navyShades.length], color: '#fff', fontSize: '11px', letterSpacing: '0.12em' }}>
                    {yg.year}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex" style={{ borderBottom: '1px solid #D1D5DB' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
            <div className="flex">
              {cols.map((c, i) => (
                <div key={c.key} className="text-center py-1 border-r border-gray-100 shrink-0"
                  style={{ width: c.widthPx, background: i % 2 === 0 ? '#fff' : 'rgba(0,0,0,0.015)' }}>
                  <span className="font-semibold" style={{ fontSize: '8px', color: '#9CA3AF' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }

    if (zoom === 'intake') {
      // Group by year
      const yearGroups: { year: string; cols: typeof cols }[] = [];
      cols.forEach(c => {
        const yr = c.label.split(' ')[0];
        const last = yearGroups[yearGroups.length - 1];
        if (last && last.year === yr) last.cols.push(c);
        else yearGroups.push({ year: yr, cols: [c] });
      });
      return (
        <>
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
            <div className="flex">
              {yearGroups.map((yg, i) => {
                const w = yg.cols.reduce((s, c) => s + c.widthPx, 0);
                const navyShades = ['#1B2A4A','#243560','#2E4482','#3D5A99'];
                return (
                  <div key={i} className="text-center font-bold py-2 border-r border-white/20 tracking-widest shrink-0"
                    style={{ width: w, background: navyShades[i % navyShades.length], color: '#fff', fontSize: '11px', letterSpacing: '0.12em' }}>
                    {yg.year}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex" style={{ borderBottom: '1px solid #D1D5DB' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
            <div className="flex">
              {cols.map((c, i) => (
                <div key={c.key} className="text-center py-1.5 border-r border-gray-200 shrink-0"
                  style={{ width: c.widthPx, background: i % 2 === 0 ? '#F8FAFC' : '#fff' }}>
                  <span className="font-bold block" style={{ fontSize: '9px', color: '#374151' }}>{c.label.split(' ').slice(1).join(' ')}</span>
                  {c.subLabel && <span style={{ fontSize: '8px', color: '#9CA3AF' }}>{c.subLabel}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }

    if (zoom === 'year') {
      return (
        <div className="flex" style={{ borderBottom: '1px solid #D1D5DB' }}>
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
          <div className="flex">
            {cols.map((c, i) => {
              const navyShades = ['#1B2A4A','#243560','#2E4482','#3D5A99'];
              return (
                <div key={c.key} className="text-center font-bold py-3 border-r border-white/20 tracking-widest shrink-0"
                  style={{ width: c.widthPx, background: navyShades[i % navyShades.length], color: '#fff', fontSize: '13px', letterSpacing: '0.12em' }}>
                  {c.label}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (zoom === 'week') {
      // Group by month
      const monthGroups: { label: string; cols: typeof cols }[] = [];
      cols.forEach(c => {
        const monthLabel = c.label.split(' ').slice(1).join(' ');
        const last = monthGroups[monthGroups.length - 1];
        if (last && last.label === monthLabel) last.cols.push(c);
        else monthGroups.push({ label: monthLabel, cols: [c] });
      });
      return (
        <>
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
            <div className="flex">
              {monthGroups.map((mg, i) => {
                const w = mg.cols.reduce((s, c) => s + c.widthPx, 0);
                const navyShades = ['#1B2A4A','#243560','#2E4482','#3D5A99'];
                return (
                  <div key={i} className="text-center font-bold py-2 border-r border-white/20 shrink-0"
                    style={{ width: w, background: navyShades[i % navyShades.length], color: '#fff', fontSize: '10px', letterSpacing: '0.08em' }}>
                    {mg.label}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex" style={{ borderBottom: '1px solid #D1D5DB' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
            <div className="flex">
              {cols.map((c, i) => (
                <div key={c.key} className="text-center py-1 border-r border-gray-200 shrink-0"
                  style={{ width: c.widthPx, background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                  <span style={{ fontSize: '8px', color: '#6B7280', fontWeight: 600 }}>{c.label.split(' ').slice(0,2).join(' ')}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }

    // day
    const monthGroups: { label: string; cols: typeof cols }[] = [];
    cols.forEach(c => {
      const d = new Date(c.startDate);
      const ml = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
      const last = monthGroups[monthGroups.length - 1];
      if (last && last.label === ml) last.cols.push(c);
      else monthGroups.push({ label: ml, cols: [c] });
    });
    return (
      <>
        <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
          <div className="flex">
            {monthGroups.map((mg, i) => {
              const w = mg.cols.reduce((s, c) => s + c.widthPx, 0);
              const navyShades = ['#1B2A4A','#243560','#2E4482','#3D5A99'];
              return (
                <div key={i} className="text-center font-bold py-2 border-r border-white/20 shrink-0"
                  style={{ width: w, background: navyShades[i % navyShades.length], color: '#fff', fontSize: '10px' }}>
                  {mg.label}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex" style={{ borderBottom: '1px solid #D1D5DB' }}>
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC' }} />
          <div className="flex">
            {cols.map(c => (
              <div key={c.key} className="text-center py-1 border-r border-gray-100 shrink-0 flex flex-col items-center"
                style={{ width: c.widthPx, background: c.isHighlighted ? '#FFF8E0' : '#fff' }}>
                <span style={{ fontSize: '8px', color: '#9CA3AF' }}>{c.subLabel}</span>
                <span style={{ fontSize: '9px', color: '#374151', fontWeight: 700 }}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-wrap">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Zoom:</span>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {ZOOM_LEVELS.map(z => (
            <button
              key={z}
              onClick={() => handleZoomChange(z)}
              className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all whitespace-nowrap"
              style={{
                background: zoom === z ? '#1B2A4A' : 'transparent',
                color:      zoom === z ? '#fff'    : '#6B7280',
              }}
            >
              {getZoomLabel(z)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-1">
          <button onClick={() => handleZoomChange(zoomOut(zoom))} disabled={zoom === 'year'}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer disabled:opacity-30 transition-all">
            <i className="ri-zoom-out-line text-sm" />
          </button>
          <button onClick={() => handleZoomChange(zoomIn(zoom))} disabled={zoom === 'day'}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer disabled:opacity-30 transition-all">
            <i className="ri-zoom-in-line text-sm" />
          </button>
        </div>

        {/* View window nav for week/day */}
        {(zoom === 'week' || zoom === 'day') && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => {
                const days = zoom === 'week' ? 56 : 14;
                setViewWindow(prev => ({
                  start: new Date(prev.start.getTime() - days * 86400000),
                  end:   new Date(prev.end.getTime()   - days * 86400000),
                }));
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer transition-all">
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <span className="text-xs text-gray-500 font-semibold px-2">
              {viewWindow.start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              {' – '}
              {viewWindow.end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </span>
            <button
              onClick={() => {
                const days = zoom === 'week' ? 56 : 14;
                setViewWindow(prev => ({
                  start: new Date(prev.start.getTime() + days * 86400000),
                  end:   new Date(prev.end.getTime()   + days * 86400000),
                }));
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer transition-all">
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          </div>
        )}

        {/* Holiday legend */}
        <div className="flex items-center gap-3 ml-auto text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#DBEAFE', border: '1px solid #93C5FD' }} />
            Term Break
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#DCFCE7', border: '1px solid #86EFAC' }} />
            Bank Holiday
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }} />
            Non-Teaching
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block shrink-0" style={{ width: 14, borderTop: '2px dashed #F7A800' }} />
            Now
          </span>
        </div>
      </div>

      {/* Scrollable gantt */}
      <div ref={scrollRef} className="overflow-x-auto">
        <div style={{ minWidth: totalWidth + LEFT_W }}>
          {renderHeaders()}

          {groups.map((grp, gi) => (
            <div key={grp.id}>
              {/* ── Programme group header row ─────────────────────────── */}
              <div className="flex" style={{ borderBottom: `2px solid ${grp.color}40`, borderTop: gi > 0 ? `2px solid ${grp.color}30` : 'none' }}>
                {/* Left: programme label + add button */}
                <div
                  className="shrink-0 flex items-center justify-between px-3 py-2"
                  style={{ width: LEFT_W, background: grp.color }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>
                      <i className="ri-book-open-line text-white" style={{ fontSize: '11px' }} />
                    </div>
                    <div className="min-w-0">
                      {grp.name.split('\n').map((line, li) => (
                        <p key={li} className={`leading-tight text-white truncate ${li === 0 ? 'font-extrabold' : 'font-normal opacity-80'}`}
                          style={{ fontSize: li === 0 ? '11px' : '9.5px' }}>
                          {line}
                        </p>
                      ))}
                      <p className="text-white/50 mt-0.5" style={{ fontSize: '8.5px' }}>
                        {grp.rows.length} cohort{grp.rows.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {canManageCohorts && (
                    <button
                      onClick={() => onAddRow(gi)}
                      title={`Add cohort to ${grp.name.replace('\n', ' ')}`}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110"
                      style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }}>
                      <i className="ri-add-line" style={{ fontSize: '9px' }} />
                    </button>
                  )}
                </div>
                {/* Right: coloured band across timeline */}
                <div className="flex-1" style={{ background: `${grp.color}10`, borderLeft: `3px solid ${grp.color}50` }} />
              </div>

              {/* ── Cohort rows ────────────────────────────────────────── */}
              {grp.rows.map((row, ri) => {
                const isDeleting = deleteConfirm?.gi === gi && deleteConfirm?.ri === ri;

                return (
                  <div key={row.id} className="flex relative"
                    style={{ height: ROW_H, borderBottom: `1px solid ${grp.color}18`, background: grp.rowBg }}>

                    {/* Left label panel */}
                    <div className="shrink-0 flex flex-col justify-center px-3 border-r bg-white relative"
                      style={{ width: LEFT_W, borderColor: '#E5E7EB' }}>
                      {/* Coloured left accent bar */}
                      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: grp.color }} />

                      <div className="pl-2.5 flex flex-col gap-0.5">
                        {/* Cohort label */}
                        <p className="font-extrabold text-gray-800 truncate leading-tight" style={{ fontSize: '11px' }}>
                          {row.label}
                        </p>
                        {/* Intake + date row */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold px-1.5 py-px rounded-full whitespace-nowrap" style={{ fontSize: '8.5px', background: `${grp.color}15`, color: grp.color }}>
                            {row.intake}
                          </span>
                          <span className="text-gray-400 whitespace-nowrap" style={{ fontSize: '8.5px' }}>
                            {row.dateLbl}
                          </span>
                          <span className="text-gray-300" style={{ fontSize: '8px' }}>·</span>
                          <span className="text-gray-400 whitespace-nowrap" style={{ fontSize: '8px' }}>
                            {row.quarter}
                          </span>
                        </div>
                        {/* Module count */}
                        <p className="text-gray-400 leading-none" style={{ fontSize: '8px' }}>
                          {row.blks.length} module{row.blks.length !== 1 ? 's' : ''} · {row.blks.reduce((s, b) => s + b.sessions, 0)} sessions
                        </p>
                      </div>

                      {/* Edit / Delete buttons */}
                      {canManageCohorts && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                          <button
                            onClick={() => onEditRow(gi, ri)}
                            title="Edit cohort"
                            className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110"
                            style={{ background: grp.color, color: '#fff' }}>
                            <i className="ri-edit-line" style={{ fontSize: '9px' }} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ gi, ri })}
                            title="Delete cohort"
                            className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110"
                            style={{ background: '#F3F4F6', color: '#9CA3AF' }}>
                            <i className="ri-delete-bin-line" style={{ fontSize: '9px' }} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Timeline area */}
                    <div className="flex-1 relative overflow-hidden">
                      {/* Now line */}
                      {nowPos && (
                        <div className="absolute top-0 bottom-0 z-30 pointer-events-none"
                          style={{ left: nowPos.left, borderLeft: '2px dashed #F7A800' }}>
                          {gi === 0 && ri === 0 && (
                            <div className="absolute -top-px left-0" style={{ transform: 'translateX(-50%)' }}>
                              <span className="font-bold px-1.5 py-px rounded whitespace-nowrap"
                                style={{ fontSize: '7px', background: '#F7A800', color: '#1B2A4A', display: 'block' }}>
                                Now
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Holiday overlays */}
                      {holidayPositions.map(({ h, pos }) => pos && (
                        <div key={h.id} className="absolute top-0 bottom-0 z-5 pointer-events-none"
                          style={{ left: pos.left, width: pos.width, background: h.color, opacity: 0.55, borderLeft: '1px solid rgba(0,0,0,0.06)', borderRight: '1px solid rgba(0,0,0,0.06)' }} />
                      ))}

                      {/* Column gridlines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {cols.map((c, ci) => (
                          <div key={c.key} className="shrink-0 border-r"
                            style={{ width: c.widthPx, borderColor: ci % 3 === 2 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)', background: c.isHighlighted ? 'rgba(247,168,0,0.04)' : 'transparent' }} />
                        ))}
                      </div>

                      {/* Module blocks */}
                      {row.blks.map(blk => {
                        const pos = getBlockPosition(blk.startDate, blk.endDate, cols);
                        if (!pos) return null;
                        const mod = MS[blk.mod];
                        const overlaps = getHolidayOverlaps(blk, holidays);
                        const hasOverlap = overlaps.length > 0;

                        return (
                          <div
                            key={blk.id}
                            className="absolute flex items-center overflow-hidden z-10 cursor-pointer transition-all hover:brightness-110"
                            style={{
                              left: pos.left,
                              width: pos.width,
                              top: 10,
                              bottom: 8,
                              background: mod.bg,
                              borderRadius: 3,
                              outline: hasOverlap ? '2px solid #F7A800' : 'none',
                              outlineOffset: hasOverlap ? '1px' : '0',
                            }}
                            onMouseEnter={e => {
                              setTooltip({
                                blk, cohortLabel: row.label,
                                programmeName: grp.name, programmeColor: grp.color,
                                holidays: overlaps,
                                x: e.clientX, y: e.clientY,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                            onMouseMove={e => {
                              if (tooltip) setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                            }}
                          >
                            {pos.width > 30 && (
                              <span className="font-semibold truncate select-none px-1.5"
                                style={{ color: mod.tx, fontSize: '8px', lineHeight: 1.1 }}>
                                {pos.width > 60 ? mod.lbl : mod.lbl.split(' ')[0]}
                              </span>
                            )}
                            {pos.width > 80 && blk.tutor && (
                              <span className="truncate select-none px-1 opacity-70"
                                style={{ color: mod.tx, fontSize: '7px' }}>
                                · {blk.tutor.split(' ')[0]}
                              </span>
                            )}
                            {hasOverlap && (
                              <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 flex items-center justify-center rounded-full"
                                style={{ background: '#F7A800' }}>
                                <i className="ri-alert-line" style={{ fontSize: '6px', color: '#1B2A4A' }} />
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Delete confirm overlay */}
                      {isDeleting && (
                        <div className="absolute inset-0 z-40 flex items-center justify-end pr-4"
                          style={{ background: 'rgba(249,250,251,0.97)' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium text-xs">
                              Remove <strong className="text-kbc-navy">{row.label}</strong>?
                            </span>
                            <button onClick={() => { onDeleteRow(gi, ri); setDeleteConfirm(null); }}
                              className="px-3 py-1 rounded text-xs font-bold text-white cursor-pointer"
                              style={{ background: '#EF4444' }}>
                              Remove
                            </button>
                            <button onClick={() => setDeleteConfirm(null)}
                              className="px-3 py-1 rounded text-xs font-semibold text-gray-500 bg-gray-200 hover:bg-gray-300 cursor-pointer">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {grp.rows.length === 0 && (
                <div className="flex items-center" style={{ height: ROW_H, background: grp.rowBg }}>
                  <div className="shrink-0 flex items-center justify-center border-r border-gray-200 bg-white" style={{ width: LEFT_W, height: ROW_H }}>
                    <span className="text-xs text-gray-300 italic pl-4">No cohorts yet</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    {canManageCohorts ? (
                      <button
                        onClick={() => onAddRow(gi)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all border-2 border-dashed"
                        style={{ color: grp.color, borderColor: `${grp.color}50` }}>
                        <i className="ri-add-line" />
                        Add first cohort
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Read-only access</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">Modules</span>
            {(Object.entries(MS) as [string, { lbl: string; bg: string; tx: string }][]).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: '10px', color: '#6B7280' }}>
                <span className="inline-block rounded shrink-0" style={{ width: 18, height: 9, background: v.bg }} />
                {v.lbl}
              </span>
            ))}
            <span className="flex items-center gap-1.5 whitespace-nowrap ml-auto" style={{ fontSize: '10px', color: '#F7A800' }}>
              <i className="ri-alert-line text-xs" />
              Holiday overlap
            </span>
          </div>
        </div>
      </div>

      {tooltip && <ModuleTooltip data={tooltip} onClose={() => setTooltip(null)} />}
    </div>
  );
}
