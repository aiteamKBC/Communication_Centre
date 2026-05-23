import { useState, useRef, useCallback, useMemo } from 'react';
import type { ProgrammeGroup, Holiday, ZoomLevel, ModuleBlock, CustomModule, CatalogModule } from '../types';
import { MS, getModuleMeta } from '../data';
import { kbcSwal } from '@/components/feature/sweetAlert';
import {
  generateColumns, getBlockPosition, getTotalWidth,
  formatDate, formatDateShort, durationWeeksByDay, getHolidayOverlaps, startOfWeek,
  ZOOM_LEVELS, zoomIn, zoomOut, getZoomLabel, toLocalIsoDate,
} from '../utils';

const LEFT_W    = 220;
const TOP_NAV_H = 56;
const ZOOM_BAR_H = 46;
const COHORT_H  = 32;  // thin cohort header strip
const MODULE_H  = 56;  // full-height module row (no overlap)
const LANE_H    = 28;  // half-height lane when two modules overlap

// ── Lane / row types ──────────────────────────────────────────────────────
interface LanedBlock {
  blk: ModuleBlock;
  lane: number; // 0 = top lane, 1 = bottom lane
}

interface GanttRow {
  groupName: string;
  lanes: LanedBlock[]; // all blocks with their assigned lane
  laneCount: number;   // 1 = single full-height row, 2 = two half-height lanes
}

function datesOverlap(a: ModuleBlock, b: ModuleBlock): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

// One row per distinct groupName.
// Within a group, sequential modules share lane 0. If a module overlaps with
// an existing lane-0 block it is placed in lane 1 (bottom). This way non-
// overlapping modules sit side-by-side on one row, and overlapping pairs stack.
function buildGanttRows(blks: ModuleBlock[]): GanttRow[] {
  const rowMap = new Map<string, GanttRow>();
  const order: string[] = [];

  const sorted = [...blks].sort((a, b) => {
    const ga = (a.groupName || '').toLowerCase();
    const gb = (b.groupName || '').toLowerCase();
    if (ga !== gb) return ga.localeCompare(gb);
    return a.startDate.localeCompare(b.startDate);
  });

  for (const blk of sorted) {
    const key = (blk.groupName || '').trim();
    if (!rowMap.has(key)) {
      rowMap.set(key, { groupName: key, lanes: [], laneCount: 1 });
      order.push(key);
    }
    const row = rowMap.get(key)!;

    // Try to fit in lane 0 first, then lane 1
    const overlapsLane0 = row.lanes
      .filter(lb => lb.lane === 0)
      .some(lb => datesOverlap(lb.blk, blk));

    if (overlapsLane0) {
      row.lanes.push({ blk, lane: 1 });
      row.laneCount = 2;
    } else {
      row.lanes.push({ blk, lane: 0 });
    }
  }

  return order.map(k => rowMap.get(k)!);
}

function rowHeight(row: GanttRow): number {
  return row.laneCount === 2 ? LANE_H * 2 : MODULE_H;
}

// Extract group label from cohort label, e.g. "Cohort 1 - G1" → "G1"
function extractGroup(label: string): string {
  const m = label.match(/[-–]\s*([A-Za-z0-9]+)\s*$/);
  return m ? m[1] : '';
}

function getBlockDisplayName(blk: ModuleBlock, customModules: CustomModule[]) {
  return resolveModuleMeta(blk.mod as string, customModules).lbl;
}

function parseLocalIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDateTime(isoDate: string, time24: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hourRaw = '0', minuteRaw = '0'] = time24.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return new Date(year || 1970, (month || 1) - 1, day || 1, Number.isNaN(hour) ? 0 : hour, Number.isNaN(minute) ? 0 : minute, 0, 0);
}

function hasSessionEnded(date: string, endTime: string, now: Date): boolean {
  return parseLocalDateTime(date, endTime) <= now;
}

function normalizeModuleLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveCatalogModuleForBlock(blk: ModuleBlock, customModules: CustomModule[], catalogModules: CatalogModule[]): CatalogModule | undefined {
  const rawValue = String(blk.mod || '');
  const displayValue = getBlockDisplayName(blk, customModules);
  const normalizedRaw = normalizeModuleLookup(rawValue);
  const normalizedDisplay = normalizeModuleLookup(displayValue);
  return catalogModules.find(module => {
    const normalizedName = normalizeModuleLookup(module.name);
    return String(module.id) === rawValue || normalizedName === normalizedRaw || normalizedName === normalizedDisplay;
  });
}

function getCurrentSessionSummary(blk: ModuleBlock, customModules: CustomModule[], catalogModules: CatalogModule[]) {
  const total = Math.max(1, blk.sessions || 1);
  const weekdays = blk.days?.length ? blk.days : [];
  const start = parseLocalIsoDate(blk.startDate);
  const end = parseLocalIsoDate(blk.endDate || blk.startDate);
  const now = new Date();
  const endTime = blk.sessionEndTime || '11:00';
  const dates: string[] = [];

  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const cursor = new Date(start);
    while (cursor <= end && dates.length < total) {
      const key = (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const)[cursor.getDay()];
      if (!weekdays.length || weekdays.includes(key as any)) {
        dates.push(localIsoDate(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const sessionDates = dates.length ? dates : [blk.startDate];
  const completed = Math.min(total, sessionDates.filter(date => hasSessionEnded(date, endTime, now)).length);
  const isFinished = total > 0 && completed >= total;
  const nextIndex = sessionDates.findIndex(date => !hasSessionEnded(date, endTime, now));
  const index = nextIndex >= 0 ? nextIndex : Math.min(completed, total - 1);
  const number = Math.min(total, Math.max(1, index + 1));
  const catalogModule = resolveCatalogModuleForBlock(blk, customModules, catalogModules);
  const savedName = catalogModule?.sessionNames?.[number - 1]?.trim() || '';

  return {
    number,
    total,
    completed,
    isFinished,
    date: sessionDates[index] || blk.startDate,
    name: savedName,
    hasRealName: Boolean(savedName),
  };
}

interface LeftLabelEntry {
  key: string;
  label: string;
  meta: string;
  color: string;
  top: number;
  height: number;
}

function buildLeftLabelEntries(ganttRows: GanttRow[], customModules: CustomModule[]): LeftLabelEntry[] {
  const entries: LeftLabelEntry[] = [];
  let offsetY = 0;

  ganttRows.forEach((row, idx) => {
    const rh = rowHeight(row);
    const firstBlk = row.lanes[0]?.blk;
    const label = row.groupName || (firstBlk ? getBlockDisplayName(firstBlk, customModules) : '');
    const color = firstBlk ? resolveBlockMeta(firstBlk, customModules).bg : '#4A6DB0';
    entries.push({ key: `row-${idx}`, label, meta: '', color, top: offsetY, height: rh });
    offsetY += rh;
  });

  return entries;
}

function resolveModuleMeta(mod: string, customModules: CustomModule[]) {
  if (mod in MS) return getModuleMeta(mod);
  const cm = customModules.find(c => c.id === mod || c.name === mod);
  if (cm) return { lbl: cm.name, bg: cm.bg, tx: cm.tx };
  return getModuleMeta(mod);
}

function contrastColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1F2937' : '#ffffff';
}

function resolveBlockMeta(blk: ModuleBlock, customModules: CustomModule[]) {
  const baseMeta = resolveModuleMeta(blk.mod as string, customModules);
  if (!blk.color) {
    return baseMeta;
  }
  return {
    ...baseMeta,
    bg: blk.color,
    tx: contrastColor(blk.color),
  };
}

interface TooltipData {
  blk: ModuleBlock;
  cohortLabel: string;
  cohortColor: string;
  programmeName: string;
  programmeColor: string;
  holidays: Holiday[];
  x: number;
  y: number;
  customModules: CustomModule[];
}

interface Props {
  groups: ProgrammeGroup[];
  holidays: Holiday[];
  customModules?: CustomModule[];
  catalogModules?: CatalogModule[];
  zoom: ZoomLevel;
  onZoomChange: (z: ZoomLevel) => void;
  onManageHolidays?: () => void;
  onAddRow: (groupIdx: number) => void;
  onEditRow: (groupIdx: number, rowIdx: number, blockId?: string, returnToChoice?: boolean) => void;
  onEditCatalogModule?: (moduleId: number) => void;
  onDeleteRow: (groupIdx: number, rowIdx: number) => void;
  onEditProgram?: (groupId: string) => void;
  onDeleteProgram?: (groupId: string) => void;
  onReorderRow?: (fromGroupIdx: number, fromRowIdx: number, toGroupIdx: number, toRowIdx: number) => void;
  onReorderGroup?: (fromGroupIdx: number, toGroupIdx: number) => void;
  canManageCohorts?: boolean;
}

// ── View window per zoom level ────────────────────────────────────────────
function getMaxModuleEndDate(groups: ProgrammeGroup[]): Date | null {
  let max: Date | null = null;
  for (const grp of groups) {
    for (const row of grp.rows) {
      for (const blk of row.blks) {
        if (!blk.endDate) continue;
        const d = new Date(blk.endDate);
        if (!Number.isNaN(d.getTime()) && (max === null || d > max)) max = d;
      }
    }
  }
  return max;
}

function getDefaultViewWindow(zoom: ZoomLevel, groups?: ProgrammeGroup[]): { start: Date; end: Date } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Compute end from last module end date, padded to end of that year
  const maxEnd = groups ? getMaxModuleEndDate(groups) : null;
  const dynamicEnd = maxEnd
    ? new Date(maxEnd.getFullYear(), 11, 31)   // Dec 31 of last module's year
    : null;

  if (zoom === 'year') {
    const end = dynamicEnd ?? new Date('2027-12-31');
    return { start: new Date('2025-01-01'), end };
  }
  if (zoom === 'intake' || zoom === 'month') {
    const end = dynamicEnd ?? new Date('2027-07-31');
    return { start: new Date('2025-01-01'), end };
  }
  if (zoom === 'week') return getNormalizedWeekWindow(now);
  const s = new Date(now); s.setDate(s.getDate() - 14);
  const e = new Date(now); e.setDate(e.getDate() + 28);
  return { start: s, end: e };
}

function getNormalizedWeekWindow(anchor: Date): { start: Date; end: Date } {
  const start = startOfWeek(anchor);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

function shiftDateByDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// ── Tooltip ───────────────────────────────────────────────────────────────
function ModuleTooltip({ data, onClose }: { data: TooltipData; onClose: () => void }) {
  const mod = resolveBlockMeta(data.blk, data.customModules);
  const displayName = getBlockDisplayName(data.blk, data.customModules);
  const weeks = durationWeeksByDay(data.blk.startDate, data.blk.endDate, data.blk.days);
  const hasHolidays = data.holidays.length > 0;

  return (
    <div className="fixed z-50 pointer-events-none"
      style={{ left: Math.min(data.x + 12, window.innerWidth - 300), top: Math.max(data.y - 10, 8) }}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg w-72 overflow-hidden pointer-events-auto">
        <div className="px-4 py-3 flex items-center gap-2" style={{ background: mod.bg }}>
          <span className="font-extrabold text-sm flex-1 truncate" style={{ color: mod.tx }}>{displayName}</span>
          <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity" style={{ color: mod.tx }}>
            <i className="ri-close-line text-xs" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: data.programmeColor }} />
            <span className="text-xs font-semibold text-gray-700">{data.programmeName.replace('\n', ' ')}</span>
            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${data.cohortColor}18`, color: data.cohortColor }}>
              {data.cohortLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <i className="ri-user-line text-gray-400 text-xs" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none">Tutor / Lecturer</p>
              <p className="text-xs font-bold text-gray-800 mt-0.5">{data.blk.tutor || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <i className="ri-user-star-line text-gray-400 text-xs" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none">Coach Name</p>
              <p className="text-xs font-bold text-gray-800 mt-0.5">{data.blk.coachName || 'â€”'}</p>
            </div>
          </div>
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
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <i className="ri-stack-line text-gray-400 text-xs" />
            </div>
            <div>
              <p className="text-xs text-gray-400 leading-none">Sessions</p>
              <p className="text-xs font-bold text-gray-800 mt-0.5">{data.blk.sessions} sessions total</p>
            </div>
          </div>
          {(data.blk.days?.length || data.blk.sessionStartTime) && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <i className="ri-time-line text-gray-400 text-xs" />
              </div>
              <div>
                <p className="text-xs text-gray-400 leading-none">Schedule</p>
                {data.blk.days?.length ? (
                  <p className="text-xs font-bold text-gray-800 mt-0.5 capitalize">
                    {data.blk.days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                  </p>
                ) : null}
                {data.blk.sessionStartTime && (
                  <p className="text-xs text-gray-500">
                    {data.blk.sessionStartTime}{data.blk.sessionEndTime ? ` – ${data.blk.sessionEndTime}` : ''}
                  </p>
                )}
              </div>
            </div>
          )}
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
export default function GanttTimeline({
  groups, holidays, customModules = [], catalogModules = [], zoom, onZoomChange,
  onManageHolidays, onAddRow, onEditRow, onDeleteRow, onEditProgram, onDeleteProgram,
  onEditCatalogModule, onReorderRow, onReorderGroup, canManageCohorts = true,
}: Props) {
  const [tooltip, setTooltip]             = useState<TooltipData | null>(null);
  const [holidayTip, setHolidayTip]       = useState<{ h: Holiday; x: number; y: number } | null>(null);
  const [editChoice, setEditChoice] = useState<{
    blk: ModuleBlock;
    moduleLabel: string;
    programmeName: string;
    cohortLabel: string;
    groupIdx: number;
    rowIdx: number;
    catalogModule?: CatalogModule;
  } | null>(null);
  const [viewWindow, setViewWindow] = useState(() => getDefaultViewWindow(zoom, groups));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [headerScrollLeft, setHeaderScrollLeft] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop state
  type DragItem = { type: 'cohort'; groupIdx: number; rowIdx: number } | { type: 'group'; groupIdx: number };
  type DragOverTarget = { type: 'cohort'; groupIdx: number; rowIdx: number } | { type: 'group'; groupIdx: number };
  const dragItem    = useRef<DragItem | null>(null);
  const [dragOver, setDragOver] = useState<DragOverTarget | null>(null);

  const handleCohortDragStart = useCallback((e: React.DragEvent, groupIdx: number, rowIdx: number) => {
    e.stopPropagation();
    dragItem.current = { type: 'cohort', groupIdx, rowIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `cohort:${groupIdx}:${rowIdx}`);
  }, []);

  const handleGroupDragStart = useCallback((e: React.DragEvent, groupIdx: number) => {
    dragItem.current = { type: 'group', groupIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `group:${groupIdx}`);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, target: typeof dragOver) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(target);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleTimelineScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setHeaderScrollLeft(el.scrollLeft);
  }, []);

  const handleCohortDrop = useCallback((e: React.DragEvent, toGroupIdx: number, toRowIdx: number) => {
    e.preventDefault();
    setDragOver(null);
    const item = dragItem.current;
    if (!item || item.type !== 'cohort') return;
    if (item.groupIdx === toGroupIdx && item.rowIdx === toRowIdx) return;
    onReorderRow?.(item.groupIdx, item.rowIdx, toGroupIdx, toRowIdx);
    dragItem.current = null;
  }, [onReorderRow]);

  const handleGroupDrop = useCallback((e: React.DragEvent, toGroupIdx: number) => {
    e.preventDefault();
    setDragOver(null);
    const item = dragItem.current;
    if (!item || item.type !== 'group') return;
    if (item.groupIdx === toGroupIdx) return;
    onReorderGroup?.(item.groupIdx, toGroupIdx);
    dragItem.current = null;
  }, [onReorderGroup]);

  const handleDragEnd = useCallback(() => {
    dragItem.current = null;
    setDragOver(null);
  }, []);

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Stretch the view end whenever module data extends beyond current window
  const dataEnd = useMemo(() => getMaxModuleEndDate(groups), [groups]);
  const effectiveEnd = useMemo(() => {
    if (!dataEnd) return viewWindow.end;
    const dec31 = new Date(dataEnd.getFullYear(), 11, 31);
    return dec31 > viewWindow.end ? dec31 : viewWindow.end;
  }, [dataEnd, viewWindow.end]);

  const handleZoomChange = useCallback((z: ZoomLevel) => {
    onZoomChange(z);
    setViewWindow(getDefaultViewWindow(z, groups));
    setTooltip(null);
  }, [onZoomChange, groups]);

  const effectiveViewWindow = useMemo(() => {
    const base = zoom === 'week' ? getNormalizedWeekWindow(viewWindow.start) : viewWindow;
    return { start: base.start, end: effectiveEnd > base.end ? effectiveEnd : base.end };
  }, [viewWindow, zoom, effectiveEnd]);

  const cols       = useMemo(() => generateColumns(zoom, effectiveViewWindow.start, effectiveViewWindow.end), [zoom, effectiveViewWindow]);
  const totalWidth = useMemo(() => getTotalWidth(cols), [cols]);
  const dayGridSize = useMemo(() => (
    zoom === 'day' ? Math.max(Math.round(cols[0]?.widthPx || 32), 16) : 14
  ), [cols, zoom]);

  const nowDate = toLocalIsoDate(new Date());
  const nowPos  = getBlockPosition(nowDate, nowDate, cols);
  const isZoomedGrid = zoom === 'day';
  const emphasizeCohortBounds = zoom === 'year' || zoom === 'intake' || zoom === 'month' || zoom === 'week';

  const isCurrentColumn = useCallback((startDate: string, endDate: string) => (
    startDate <= nowDate && endDate >= nowDate
  ), [nowDate]);

  const getIsoWeekNumber = useCallback((date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }, []);

  const isSpecialWeekDay = useCallback((date: Date) => {
    const isSunday = date.getDay() === 0;
    const isNewYearDay = date.getMonth() === 0 && date.getDate() === 1;
    return isSunday || isNewYearDay;
  }, []);

  const getGridColumnStyle = useCallback((c: typeof cols[number], idx: number) => {
    const isCurrent = isCurrentColumn(c.startDate, c.endDate);
    if (zoom === 'day') {
      if (isCurrent) {
        return {
          background: '#FFFFFF',
          borderColor: 'rgba(247,168,0,0.55)',
          cellOutline: 'inset 0 0 0 1px rgba(247,168,0,0.65)',
        };
      }
      if (c.isHighlighted) {
        return {
          background: '#FFFFFF',
          borderColor: 'rgba(203,213,225,0.36)',
          cellOutline: 'inset 0 0 0 1px rgba(203,213,225,0.52)',
        };
      }
      return {
        background: '#FFFFFF',
        borderColor: 'rgba(148,163,184,0.22)',
        cellOutline: 'inset 0 0 0 1px rgba(203,213,225,0.52)',
      };
    }

    if (zoom === 'week') {
      return {
        background: '#FFFFFF',
        borderColor: 'rgba(148,163,184,0.24)',
        cellOutline: undefined,
      };
    }

    return {
      background: c.isHighlighted ? 'rgba(247,168,0,0.04)' : 'transparent',
      borderColor: idx % 3 === 2 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)',
      cellOutline: undefined,
    };
  }, [isCurrentColumn, zoom]);

  const getTimelineSurfaceStyle = useCallback((baseBg: string) => {
    if (!isZoomedGrid) {
      return { background: baseBg };
    }

    const gridOffset = zoom === 'day' ? '-1px -1px, -1px -1px' : '0 0, 0 0';

    return {
      backgroundColor: '#FFFFFF',
      backgroundImage: [
        `repeating-linear-gradient(to right, rgba(148,163,184,0.16) 0 1px, transparent 1px ${dayGridSize}px)`,
      ].join(', '),
      backgroundSize: `${dayGridSize}px ${dayGridSize}px`,
      backgroundPosition: zoom === 'day' ? '-1px 0' : '0 0',
    };
  }, [dayGridSize, isZoomedGrid, zoom]);

  const handleDeleteRequest = useCallback(async (groupIdx: number, rowIdx: number, cohortLabel: string) => {
    const result = await kbcSwal.fire({
      title: 'Delete Cohort?',
      html: `The cohort <strong>${cohortLabel}</strong> will be removed from the training plan and database.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Cohort',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });
    if (result.isConfirmed) onDeleteRow(groupIdx, rowIdx);
  }, [onDeleteRow]);

  const holidayPositions = useMemo(() =>
    holidays.map(h => ({ h, pos: getBlockPosition(h.startDate, h.endDate, cols) }))
      .filter(x => x.pos !== null),
  [holidays, cols]);

  // ── Header rows ───────────────────────────────────────────────────────
  const renderHeaders = () => {
    if (zoom === 'month') {
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
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
      const monthGroups: { label: string; cols: typeof cols }[] = [];
      cols.forEach(c => {
        const d = new Date(c.startDate);
        const label = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
        const last = monthGroups[monthGroups.length - 1];
        if (last && last.label === label) last.cols.push(c);
        else monthGroups.push({ label, cols: [c] });
      });

      return (
        <>
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
            <div className="flex">
              {monthGroups.map((mg, i) => {
                const w = mg.cols.reduce((s, c) => s + c.widthPx, 0);
                const navyShades = ['#1B2A4A','#243560','#2E4482','#3D5A99'];
                return (
                  <div
                    key={mg.label}
                    className="text-center font-bold py-2 border-r border-white/20 shrink-0"
                    style={{ width: w, background: navyShades[i % navyShades.length], color: '#fff', fontSize: '12px' }}
                  >
                    {mg.label}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex" style={{ borderBottom: '1px solid #D1D5DB' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
            <div className="flex">
              {cols.map((c, i) => {
                const start = new Date(c.startDate);
                const isSpecial = isSpecialWeekDay(start);
                const isToday = isCurrentColumn(c.startDate, c.endDate);
                const weekNumber = i === 0 ? getIsoWeekNumber(start) : null;
                return (
                  <div
                    key={c.key}
                    className="text-center py-2 border-r shrink-0 flex flex-col items-center justify-center bg-white"
                    style={{ width: c.widthPx, minHeight: 56, borderColor: '#D1D5DB' }}
                  >
                    <span style={{ fontSize: '7px', color: isSpecial ? '#D00000' : '#6B7280', fontWeight: 700 }}>
                      {start.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>
                    <span style={{ fontSize: '11px', lineHeight: 1.05, fontWeight: 800, color: isSpecial ? '#D00000' : '#1F2937' }}>
                      {start.getDate()}
                    </span>
                    <span style={{ fontSize: '6px', fontWeight: 700, color: isSpecial ? '#D00000' : '#9CA3AF' }}>
                      {start.toLocaleDateString('en-GB', { month: 'short' })}
                    </span>
                    {start.getMonth() === 0 && start.getDate() === 1 && (
                      <span className="mt-0.5" style={{ fontSize: '5px', color: '#D00000', fontWeight: 800 }}>
                        New Year
                      </span>
                    )}
                    {weekNumber && (
                      <span className="mt-0.5" style={{ fontSize: '5px', color: '#2563EB', fontWeight: 800 }}>
                        {`WEEK ${weekNumber}`}
                      </span>
                    )}
                    {isToday && (
                      <span className="mt-0.5 rounded-full px-1 py-px" style={{ fontSize: '5px', background: '#F7A800', color: '#1B2A4A', fontWeight: 800 }}>
                        TODAY
                      </span>
                    )}
                  </div>
                );
              })}
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
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
          <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
          <div className="flex">
            {cols.map((c, i) => (
              <div key={c.key} className="text-center py-1.5 border-r shrink-0 flex flex-col items-center"
                style={{ width: c.widthPx, ...getGridColumnStyle(c, i), boxShadow: getGridColumnStyle(c, i).cellOutline }}>
                <span style={{ fontSize: '8px', color: isCurrentColumn(c.startDate, c.endDate) ? '#C2410C' : '#9CA3AF', fontWeight: isCurrentColumn(c.startDate, c.endDate) ? 800 : 600 }}>
                  {c.subLabel}
                </span>
                <span style={{ fontSize: '10px', color: isCurrentColumn(c.startDate, c.endDate) ? '#1B2A4A' : '#374151', fontWeight: 800 }}>
                  {c.label}
                </span>
                {isCurrentColumn(c.startDate, c.endDate) && (
                  <span className="mt-0.5 rounded-full px-1.5 py-px" style={{ fontSize: '7px', background: '#F7A800', color: '#1B2A4A', fontWeight: 800 }}>
                    TODAY
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  // ── Render a single module block bar ─────────────────────────────────
  const renderBar = (
    blk: ModuleBlock,
    cohortLabel: string,
    cohortColor: string,
    grp: ProgrammeGroup,
    groupIdx: number,
    rowIdx: number,
    activeHolidays: Holiday[],
    topPx: number,
    heightPx: number,
  ) => {
    const pos = getBlockPosition(blk.startDate, blk.endDate, cols);
    if (!pos) return null;
    const mod = resolveBlockMeta(blk, customModules);
    const overlaps = getHolidayOverlaps(blk, activeHolidays);
    const hasOverlap = overlaps.length > 0;
    const tutorLabel = blk.tutor.trim();
    const showTutor = pos.width > 72 && Boolean(tutorLabel);
    const coachLabel = (blk.coachName || '').trim();
    const sessionSummary = getCurrentSessionSummary(blk, customModules, catalogModules);
    const sessionLabel = sessionSummary.isFinished
      ? 'Finished'
      : sessionSummary.hasRealName
      ? `S${sessionSummary.number}: ${sessionSummary.name}`
      : `S${sessionSummary.number}: no saved name`;
    const stackLabel = false;

    return (
      <div
        key={blk.id}
        className="absolute overflow-hidden z-10 cursor-pointer transition-all hover:brightness-110"
        style={{
          left: pos.left,
          width: pos.width,
          top: topPx,
          height: heightPx,
          background: mod.bg,
          borderRadius: 3,
          outline: hasOverlap ? '2px solid #F7A800' : 'none',
          outlineOffset: hasOverlap ? '1px' : '0',
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={e => setTooltip({ blk, cohortLabel, cohortColor, programmeName: grp.name, programmeColor: grp.color, holidays: overlaps, x: e.clientX, y: e.clientY, customModules })}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => { if (tooltip) setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null); }}
        onClick={() => {
          if (!canManageCohorts) {
            return;
          }
          setTooltip(null);
          if (onEditCatalogModule) {
            setEditChoice({
              blk,
              moduleLabel: mod.lbl,
              programmeName: grp.name.replace('\n', ' '),
              cohortLabel,
              groupIdx,
              rowIdx,
              catalogModule: resolveCatalogModuleForBlock(blk, customModules, catalogModules),
            });
            return;
          }
          onEditRow(groupIdx, rowIdx, blk.id);
        }}
      >
        {pos.width > 30 && (
          <div
            className="min-w-0 w-full select-none"
            style={{ padding: '0 8px', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}
          >
            {/* Module name */}
            <span style={{ color: mod.tx, fontSize: '11px', fontWeight: 800, letterSpacing: '-0.01em', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {mod.lbl}
            </span>

            {/* Tutor */}
            {showTutor && (
              <span style={{ color: mod.tx, fontSize: '9px', fontWeight: 600, opacity: 0.75, whiteSpace: 'nowrap', flexShrink: 0 }}>
                · {tutorLabel}
              </span>
            )}

            {/* Dates */}
            {pos.width > 120 && blk.startDate && blk.endDate && (
              <span
                style={{
                  color: mod.tx,
                  fontSize: '9px',
                  fontWeight: 700,
                  opacity: 0.85,
                  whiteSpace: 'nowrap',
                  flexShrink: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  background: 'rgba(0,0,0,0.15)',
                  borderRadius: 3,
                  padding: '1px 5px',
                  marginLeft: 2,
                }}
              >
                {formatDateShort(blk.startDate)} → {formatDateShort(blk.endDate)}
              </span>
            )}

            {pos.width > 180 && (
              <span
                title={`${sessionSummary.isFinished ? 'Finished module' : `Current session ${sessionSummary.number}/${sessionSummary.total}`} - ${sessionSummary.completed}/${sessionSummary.total} completed - ${sessionSummary.date}${coachLabel ? ` - Coach: ${coachLabel}` : ''}${tutorLabel ? ` - Tutor: ${tutorLabel}` : ''}`}
                style={{
                  color: mod.tx,
                  fontSize: '9px',
                  fontWeight: 800,
                  opacity: 0.95,
                  whiteSpace: 'nowrap',
                  flexShrink: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  background: sessionSummary.isFinished ? 'rgba(16,185,129,0.32)' : sessionSummary.hasRealName ? 'rgba(255,255,255,0.20)' : 'rgba(247,168,0,0.28)',
                  borderRadius: 3,
                  padding: '1px 5px',
                  marginLeft: 2,
                  maxWidth: Math.max(70, pos.width * 0.42),
                }}
              >
                {sessionSummary.isFinished && <i className="ri-check-line" style={{ marginRight: 3 }} />}
                {sessionLabel}
              </span>
            )}

            {pos.width > 260 && (
              <span style={{ color: mod.tx, fontSize: '9px', fontWeight: 700, opacity: 0.8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {sessionSummary.isFinished ? 'Finished' : `${sessionSummary.completed}/${sessionSummary.total} done`}
              </span>
            )}
          </div>
        )}
        {hasOverlap && (
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 flex items-center justify-center rounded-full"
            style={{ background: '#F7A800' }}>
            <i className="ri-alert-line" style={{ fontSize: '8px', color: '#1B2A4A' }} />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div
        className="sticky flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-wrap"
        style={{
          top: TOP_NAV_H,
          zIndex: 36,
          minHeight: ZOOM_BAR_H,
          boxShadow: '0 10px 18px -18px rgba(15,23,42,0.45)',
        }}
      >
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Zoom:</span>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {ZOOM_LEVELS.map(z => (
            <button key={z} onClick={() => handleZoomChange(z)}
              className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all whitespace-nowrap"
              style={{ background: zoom === z ? '#1B2A4A' : 'transparent', color: zoom === z ? '#fff' : '#6B7280' }}>
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

        {(zoom === 'week' || zoom === 'day') && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => {
                setViewWindow(getDefaultViewWindow(zoom));
              }}
              className="px-2.5 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer transition-all text-xs font-semibold"
            >
              {zoom === 'week' ? 'This Week' : 'Today'}
            </button>
            <button
              onClick={() => {
                const days = zoom === 'week' ? 7 : 14;
                setViewWindow(prev => (
                  zoom === 'week'
                    ? getNormalizedWeekWindow(shiftDateByDays(prev.start, -7))
                    : { start: shiftDateByDays(prev.start, -days), end: shiftDateByDays(prev.end, -days) }
                ));
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer transition-all">
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <span className="text-xs text-gray-500 font-semibold px-2">
              {effectiveViewWindow.start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              {' – '}
              {effectiveViewWindow.end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </span>
            <button
              onClick={() => {
                const days = zoom === 'week' ? 7 : 14;
                setViewWindow(prev => (
                  zoom === 'week'
                    ? getNormalizedWeekWindow(shiftDateByDays(prev.start, 7))
                    : { start: shiftDateByDays(prev.start, days), end: shiftDateByDays(prev.end, days) }
                ));
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 cursor-pointer transition-all">
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 ml-auto text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="inline-block shrink-0" style={{ width: 14, borderTop: '2px dashed #F7A800' }} />Now</span>
          {holidays.length > 0 && (
            <>
              <span className="text-gray-300">|</span>
              {Array.from(new Map(holidays.map(h => [h.type, h])).values()).map(h => (
                <span key={h.type} className="flex items-center gap-1">
                  <span className="inline-block shrink-0 rounded-sm" style={{ width: 12, height: 10, background: h.color }} />
                  <span className="text-gray-500">{h.type}</span>
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      <div
        className="sticky overflow-hidden"
        style={{
          top: TOP_NAV_H + ZOOM_BAR_H,
          zIndex: 35,
          background: '#FFFFFF',
          boxShadow: '0 10px 18px -16px rgba(15,23,42,0.55)',
        }}
      >
        <div
          style={{
            width: totalWidth + LEFT_W,
            transform: `translateX(-${headerScrollLeft}px)`,
          }}
        >
          {renderHeaders()}
        </div>
      </div>

      {/* Scrollable gantt */}
      <div ref={scrollRef} className="overflow-x-auto" onScroll={handleTimelineScroll}>
        <div className="relative" style={{ width: totalWidth + LEFT_W }}>
          {/* Full-height holiday bands — start below headers, span all rows */}
          {holidayPositions.map(({ h, pos }) => pos && (
            <div
              key={`band-${h.id}`}
              className="absolute bottom-0"
              style={{ top: 0, left: LEFT_W + pos.left, width: Math.max(pos.width, 4), background: h.color, opacity: 1.50, zIndex: 2, cursor: 'default' }}
              onMouseEnter={e => setHolidayTip({ h, x: e.clientX, y: e.clientY })}
              onMouseMove={e => setHolidayTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={() => setHolidayTip(null)}
            />
          ))}

          {isZoomedGrid && (
            <div
              className="absolute bottom-0 pointer-events-none"
              style={{
                left: LEFT_W,
                right: 0,
                top: 0,
                ...getTimelineSurfaceStyle('#FFFFFF'),
              }}
            />
          )}

          {groups.map((grp, gi) => {
            const isCollapsed = collapsedGroups.has(grp.id);
            const isGroupDragOver = dragOver?.type === 'group' && dragOver.groupIdx === gi;
            return (
            <div key={grp.id} className="relative"
              onDragOver={canManageCohorts ? (e) => { if (dragItem.current?.type === 'group') handleDragOver(e, { type: 'group', groupIdx: gi }); } : undefined}
              onDragLeave={canManageCohorts ? handleDragLeave : undefined}
              onDrop={canManageCohorts ? (e) => handleGroupDrop(e, gi) : undefined}
              style={isGroupDragOver ? { outline: `2px dashed ${grp.color}`, outlineOffset: '-2px' } : undefined}
            >
              {/* ── Programme group header row ────────────────────────── */}
              <div className="flex" style={{ borderBottom: 'none', borderTop: 'none' }}>
                <div
                  className="shrink-0 px-3 py-2"
                  style={{ width: LEFT_W, background: grp.color, position: 'sticky', left: 0, zIndex: 20, cursor: canManageCohorts ? 'grab' : undefined }}
                  draggable={canManageCohorts}
                  onDragStart={canManageCohorts ? (e) => handleGroupDragStart(e, gi) : undefined}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className="leading-tight text-white font-extrabold whitespace-nowrap overflow-hidden text-ellipsis flex-1"
                      style={{ fontSize: '11px' }}
                      title={grp.name.replace('\n', ' ')}
                    >
                      {grp.name.replace('\n', ' ')}
                    </p>
                    <button
                      onClick={() => toggleGroupCollapse(grp.id)}
                      title={isCollapsed ? 'Expand programme' : 'Collapse programme'}
                      className="w-5 h-5 flex items-center justify-center rounded shrink-0 cursor-pointer transition-all hover:scale-110"
                      style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
                    >
                      <i className={isCollapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} style={{ fontSize: '11px' }} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>
                        <i className="ri-book-open-line text-white" style={{ fontSize: '11px' }} />
                      </div>
                      <p className="text-white/50 min-w-0" style={{ fontSize: '8.5px' }}>
                        {grp.rows.length} cohort{grp.rows.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {canManageCohorts && (
                      <div className="flex items-center gap-1 shrink-0">
                        {onEditProgram && onDeleteProgram && (
                          <>
                            <button onClick={() => onEditProgram?.(grp.id)} title={`Edit ${grp.name.replace('\n', ' ')}`}
                              className="w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110"
                              style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                              <i className="ri-edit-line" style={{ fontSize: '9px' }} />
                            </button>
                            <button onClick={() => void onDeleteProgram?.(grp.id)} title={`Delete ${grp.name.replace('\n', ' ')}`}
                              className="w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110"
                              style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                              <i className="ri-delete-bin-line" style={{ fontSize: '9px' }} />
                            </button>
                          </>
                        )}
                        <button onClick={() => onAddRow(gi)} title={`Add cohort to ${grp.name.replace('\n', ' ')}`}
                          className="w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110"
                          style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }}>
                          <i className="ri-add-line" style={{ fontSize: '9px' }} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 relative" style={{ background: 'transparent' }}>
                  {nowPos && (
                    <div className="absolute inset-y-0 pointer-events-none"
                      style={{ left: nowPos.left, borderLeft: '2px dashed #F7A800', zIndex: 10 }} />
                  )}
                </div>
              </div>

              {/* ── Cohort rows ──────────────────────────────────────── */}
              {!isCollapsed && grp.rows.map((row, ri) => {
                const ganttRows = buildGanttRows(row.blks);
                const group = extractGroup(row.label);
                const totalModuleH = ganttRows.reduce((s, r) => s + rowHeight(r), 0);
                const rowColor = row.color || grp.color;
                const tunnelBg = `${grp.color}0D`;
                const selectedHolidayIds = new Set(row.holidayIds || []);
                const rowHolidays = holidays.filter(holiday => selectedHolidayIds.has(holiday.id));

                const isCohortDragOver = dragOver?.type === 'cohort' && dragOver.groupIdx === gi && dragOver.rowIdx === ri;

                return (
                  <div
                    key={row.id}
                    style={{
                      borderTop: `1px solid ${rowColor}${emphasizeCohortBounds ? '2A' : '14'}`,
                      ...(isCohortDragOver ? { boxShadow: `inset 0 2px 0 ${rowColor}` } : {}),
                    }}
                    onDragOver={canManageCohorts ? (e) => handleDragOver(e, { type: 'cohort', groupIdx: gi, rowIdx: ri }) : undefined}
                    onDragLeave={canManageCohorts ? handleDragLeave : undefined}
                    onDrop={canManageCohorts ? (e) => handleCohortDrop(e, gi, ri) : undefined}
                  >
                    {/* Cohort header strip */}
                    <div className="flex relative" style={{ height: COHORT_H, background: 'transparent' }}>
                      <div className="shrink-0 flex items-center px-3 border-r bg-white relative" style={{ width: LEFT_W, borderColor: '#E5E7EB', position: 'sticky', left: 0, zIndex: 20 }}>
                        {/* Coloured left accent */}
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: rowColor }} />
                        {/* Drag handle */}
                        {canManageCohorts && (
                          <div
                            className="absolute right-full mr-0 w-4 h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                            draggable
                            onDragStart={(e) => handleCohortDragStart(e, gi, ri)}
                            onDragEnd={handleDragEnd}
                            style={{ cursor: 'grab', left: 0, right: 'auto', width: 14 }}
                            title="Drag to reorder"
                          >
                            <i className="ri-draggable text-gray-300" style={{ fontSize: '10px' }} />
                          </div>
                        )}
                        <div className="pl-2.5 flex items-center gap-2 min-w-0 flex-1"
                          draggable={canManageCohorts}
                          onDragStart={canManageCohorts ? (e) => handleCohortDragStart(e, gi, ri) : undefined}
                          onDragEnd={handleDragEnd}
                          style={{ cursor: canManageCohorts ? 'grab' : undefined }}
                        >
                          <p className="font-extrabold text-gray-800 truncate leading-tight" style={{ fontSize: '10px' }}>
                            {row.label}
                          </p>
                          <span className="text-gray-400 whitespace-nowrap shrink-0" style={{ fontSize: '7.5px' }}>
                            {row.dateLbl}
                          </span>
                        </div>
                        {canManageCohorts && (
                          <div className="flex items-center gap-1 ml-1 shrink-0">
                            <button onClick={() => onEditRow(gi, ri)} title="Edit cohort"
                              className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110"
                              style={{ background: rowColor, color: '#fff' }}>
                              <i className="ri-edit-line" style={{ fontSize: '8px' }} />
                            </button>
                            <button onClick={() => { void handleDeleteRequest(gi, ri, row.label); }} title="Delete cohort"
                              className="w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-all hover:scale-110 bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              >
                              <i className="ri-delete-bin-line" style={{ fontSize: '8px' }} />
                            </button>
                          </div>
                        )}
                      </div>
                      {/* Timeline: cohort span indicator */}
                      <div className="flex-1 relative overflow-hidden" style={{ background: tunnelBg }}>
                        {/* Now line */}
                        {nowPos && (
                          <div className="absolute inset-y-0 pointer-events-none"
                            style={{ left: nowPos.left, borderLeft: '2px dashed #F7A800', zIndex: 10 }} />
                        )}
                      </div>
                    </div>

                    {/* Module rows */}
                    <div className="flex relative" style={{ height: totalModuleH || MODULE_H, borderBottom: `1px solid ${rowColor}${emphasizeCohortBounds ? '2A' : '14'}` }}>
                      {/* Left panel: stacked module entries */}
                      <div className="shrink-0 border-r bg-white relative" style={{ width: LEFT_W, borderColor: '#E5E7EB', position: 'sticky', left: 0, zIndex: 20 }}>
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: rowColor }} />
                        {ganttRows.length === 0 ? (
                          <div className="pl-6 flex items-center h-full">
                            <span className="text-xs text-gray-300 italic">No modules</span>
                          </div>
                        ) : buildLeftLabelEntries(ganttRows, customModules).map(entry => (
                          <div key={entry.key} className="absolute left-0 right-0 px-2" style={{ top: entry.top, height: entry.height }}>
                            <div
                              className="h-full rounded-lg border bg-white/96 shadow-[0_1px_2px_rgba(15,23,42,0.05)] flex items-center gap-1.5 pl-4 pr-2"
                              style={{ borderColor: `${entry.color}24` }}
                            >
                              <span className="shrink-0 rounded-sm" style={{ width: 8, height: 8, background: entry.color }} />
                              <div className="min-w-0">
                                <p className="font-bold text-gray-800 truncate leading-tight" style={{ fontSize: '9px' }}>
                                  {entry.label}
                                </p>
                                {entry.meta && (
                                  <p className="text-gray-400 leading-none" style={{ fontSize: '7.5px' }}>{entry.meta}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Timeline area */}
                      <div className="flex-1 relative overflow-hidden" style={{ background: tunnelBg }}>

                        {/* Column gridlines */}
                        {zoom !== 'day' && (
                          <div className="absolute inset-0 flex pointer-events-none">
                            {cols.map((c, ci) => (
                              <div key={c.key} className="shrink-0 border-r"
                                style={{
                                  width: c.widthPx,
                                  borderColor: getGridColumnStyle(c, ci).borderColor,
                                  background: getGridColumnStyle(c, ci).background,
                                  boxShadow: isZoomedGrid && isCurrentColumn(c.startDate, c.endDate)
                                    ? 'inset 0 0 0 1px rgba(247,168,0,0.22)'
                                    : undefined,
                                }} />
                            ))}
                          </div>
                        )}

                        {/* Module bars */}
                        {(() => {
                          const bars: React.ReactNode[] = [];
                          let offsetY = 0;
                          const barPad = 5;
                          for (const ganttRow of ganttRows) {
                            const h = rowHeight(ganttRow);
                            for (const { blk, lane } of ganttRow.lanes) {
                              const laneH = ganttRow.laneCount === 2 ? LANE_H : MODULE_H;
                              const laneTop = offsetY + lane * LANE_H;
                              bars.push(renderBar(blk, row.label, rowColor, grp, gi, ri, rowHolidays, laneTop + barPad, laneH - barPad * 2));
                            }
                            offsetY += h;
                          }
                          return bars;
                        })()}

                        {/* Now line — rendered last so it appears above module bars */}
                        {nowPos && (
                          <div className="absolute top-0 bottom-0 pointer-events-none"
                            style={{ left: nowPos.left, borderLeft: '2px dashed #F7A800', zIndex: 10 }}>
                            {gi === 0 && ri === 0 && (
                              <div className="absolute -top-px left-0" style={{ transform: 'translateX(-50%)' }}>
                                <span className="font-bold px-1.5 py-px rounded whitespace-nowrap"
                                  style={{ fontSize: '7px', background: '#F7A800', color: '#1B2A4A', display: 'block' }}>Now</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {grp.rows.length === 0 && (
                <div className="flex items-center" style={{ height: MODULE_H, background: 'transparent' }}>
                  <div className="shrink-0 flex items-center justify-center border-r border-gray-200 bg-white" style={{ width: LEFT_W, height: MODULE_H, position: 'sticky', left: 0, zIndex: 20 }}>
                    <span className="text-xs text-gray-300 italic pl-4">No cohorts yet</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    {canManageCohorts ? (
                      <button onClick={() => onAddRow(gi)}
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
          );
          })}

        </div>
      </div>

      {tooltip && <ModuleTooltip data={tooltip} onClose={() => setTooltip(null)} />}

      {editChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[5px]" onClick={() => setEditChoice(null)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/60">{editChoice.programmeName} - {editChoice.cohortLabel}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">Choose What To Edit</h3>
                <p className="mt-1 text-xs text-white/70">{editChoice.moduleLabel}</p>
              </div>
              <button onClick={() => setEditChoice(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="grid gap-3 bg-gray-50 p-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  const target = editChoice;
                  setEditChoice(null);
                  onEditRow(target.groupIdx, target.rowIdx, target.blk.id, true);
                }}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-kbc-navy hover:shadow-md"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-kbc-navy text-white">
                  <i className="ri-calendar-schedule-line" />
                </span>
                <span className="mt-3 block text-sm font-extrabold text-kbc-navy">Edit schedule assignment</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500">
                  Change this specific cohort module: dates, tutor, coach, time, notes, and placement.
                </span>
                <span className="mt-3 block text-xs font-semibold text-gray-400">
                  {editChoice.blk.groupName || 'Selected group'} - {formatDateShort(editChoice.blk.startDate)} to {formatDateShort(editChoice.blk.endDate)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = editChoice.catalogModule;
                  if (!target || !onEditCatalogModule) return;
                  onEditCatalogModule(target.id);
                }}
                disabled={!editChoice.catalogModule || !onEditCatalogModule}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-kbc-navy hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:shadow-none"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <i className="ri-puzzle-line" />
                </span>
                <span className="mt-3 block text-sm font-extrabold text-kbc-navy">Edit module catalogue</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500">
                  Change the shared module definition: session count, colour, notes, and session names.
                </span>
                <span className="mt-3 block text-xs font-semibold text-gray-400">
                  {editChoice.catalogModule ? `${editChoice.catalogModule.name} - ${editChoice.catalogModule.sessions || 0} sessions` : 'No matching catalogue module found'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {holidayTip && (
        <div
          className="fixed pointer-events-none z-50"
          style={{ left: Math.min(holidayTip.x + 14, window.innerWidth - 220), top: Math.max(holidayTip.y - 8, 8) }}
        >
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden" style={{ minWidth: 180 }}>
            <div className="px-3 py-2 flex items-center gap-2" style={{ background: holidayTip.h.color }}>
              <i className="ri-calendar-close-line text-sm" style={{ color: '#000' }} />
              <span className="font-extrabold text-sm truncate" style={{ color: '#000' }}>{holidayTip.h.label}</span>
            </div>
            <div className="px-3 py-2 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: holidayTip.h.color }} />
                <span className="text-xs" style={{ color: '#000' }}>{holidayTip.h.type}</span>
              </div>
              <p className="text-xs font-semibold" style={{ color: '#000' }}>
                {new Date(holidayTip.h.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' → '}
                {new Date(holidayTip.h.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
