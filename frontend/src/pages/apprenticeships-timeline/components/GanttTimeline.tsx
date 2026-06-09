import { MouseEvent as ReactMouseEvent, useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { ProgrammeGroup, Holiday, ZoomLevel, ModuleBlock, CustomModule, CatalogModule, TutorProfile } from '../types';
import { MS, getModuleMeta } from '../data';
import { kbcSwal } from '@/components/feature/sweetAlert';
import {
  generateColumns, getBlockPosition, getTotalWidth,
  formatDate, formatDateShort, startOfWeek,
  buildHolidayAdjustedSessionPlan, rangesOverlap, ZOOM_LEVELS, zoomIn, zoomOut, getZoomLabel, toLocalIsoDate,
} from '../utils';

const LEFT_W    = 220;
const TOP_NAV_H = 56;
const ZOOM_BAR_H = 52;
const COHORT_H  = 32;  // thin cohort header strip
const MODULE_H  = 64;  // full-height module row (no overlap)
const LANE_H    = MODULE_H;  // keep stacked modules visually consistent with single modules
const NOW_LINE_Z_INDEX = 16;
const NOW_LINE_STYLE = {
  width: 4,
  backgroundImage: 'repeating-linear-gradient(to bottom, #F7A800 0 18px, transparent 18px 27px)',
  borderRadius: 999,
} as const;

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

function effectiveBlockEndDate(blk: ModuleBlock, holidays: Holiday[] = []): string {
  return buildHolidayAdjustedSessionPlan(blk, holidays).effectiveEndDate || blk.endDate;
}

function nextIsoDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return toLocalIsoDate(date);
}

function datesOverlap(a: ModuleBlock, b: ModuleBlock, holidays: Holiday[] = []): boolean {
  const aEnd = effectiveBlockEndDate(a, holidays);
  const bEnd = effectiveBlockEndDate(b, holidays);
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

// One row per distinct groupName.
// Within a group, sequential modules share lane 0. If a module overlaps with
// an existing lane-0 block it is placed in lane 1 (bottom). This way non-
// overlapping modules sit side-by-side on one row, and overlapping pairs stack.
function buildGanttRows(blks: ModuleBlock[], holidays: Holiday[] = []): GanttRow[] {
  const rowMap = new Map<string, GanttRow>();
  const order: string[] = [];
  const blocksByGroup = new Map<string, ModuleBlock[]>();

  for (const blk of blks) {
    const key = (blk.groupName || '').trim();
    if (!rowMap.has(key)) {
      rowMap.set(key, { groupName: key, lanes: [], laneCount: 1 });
      order.push(key);
    }
    blocksByGroup.set(key, [...(blocksByGroup.get(key) || []), blk]);
  }

  for (const key of order) {
    const row = rowMap.get(key)!;
    const sortedGroupBlocks = [...(blocksByGroup.get(key) || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const blk of sortedGroupBlocks) {

      // Try to fit in lane 0 first, then lane 1
      const overlapsLane0 = row.lanes
        .filter(lb => lb.lane === 0)
        .some(lb => datesOverlap(lb.blk, blk, holidays));

      if (overlapsLane0) {
        row.lanes.push({ blk, lane: 1 });
        row.laneCount = 2;
      } else {
        row.lanes.push({ blk, lane: 0 });
      }
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

function timeToMinutes(time24: string): number | null {
  const [hRaw, mRaw] = time24.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && ae > bs;
}

function splitPeople(value: string): string[] {
  return value
    .split(/\s*(?:\+|&|,|;)\s*/g)
    .map(item => item.trim())
    .filter(Boolean);
}

const TUTOR_CONFLICT_COLORS = ['#00A6D6', '#D81B60', '#2E7D32', '#3949AB', '#B00020', '#6A1B9A'];

function tutorConflictColor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return TUTOR_CONFLICT_COLORS[hash % TUTOR_CONFLICT_COLORS.length];
}

function normalizeModuleLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function moduleLookupVariants(value: string): string[] {
  const raw = String(value || '').trim();
  const withoutSessionSuffix = raw.replace(/\b\d+\s*s(?:essions?)?\b/gi, '').trim();
  const normalized = [raw, withoutSessionSuffix].map(normalizeModuleLookup).filter(Boolean);
  if (normalized.includes('social') || normalized.includes('socialmedia')) {
    normalized.push('social', 'socialmedia');
  }
  return Array.from(new Set(normalized));
}

function resolveCatalogModuleForBlock(blk: ModuleBlock, customModules: CustomModule[], catalogModules: CatalogModule[]): CatalogModule | undefined {
  const rawValue = String(blk.mod || '');
  const displayValue = getBlockDisplayName(blk, customModules);
  const lookupVariants = new Set([...moduleLookupVariants(rawValue), ...moduleLookupVariants(displayValue)]);
  return catalogModules.find(module => {
    const normalizedName = normalizeModuleLookup(module.name);
    return String(module.id) === rawValue || lookupVariants.has(normalizedName);
  });
}

function getCurrentSessionSummary(blk: ModuleBlock, customModules: CustomModule[], catalogModules: CatalogModule[], activeHolidays: Holiday[] = []) {
  const plannedTotal = Math.max(1, blk.sessions || 1);
  const now = new Date();
  const endTime = blk.sessionEndTime || '11:00';
  const plan = buildHolidayAdjustedSessionPlan(blk, activeHolidays);
  const sessionDates = plan.sessions.length ? plan.sessions : [{ date: blk.startDate, originalNumber: 1, isClash: false, isExtension: false, holidays: [], countedNumber: 1 }];
  const affected = plan.originalClashedSessions;
  const total = plannedTotal;
  const completed = Math.min(total, sessionDates.filter(session => hasSessionEnded(session.date, endTime, now)).length);
  const isFinished = total > 0 && completed >= total;
  const nextIndex = sessionDates.findIndex(session => !hasSessionEnded(session.date, endTime, now));
  const index = total > 0 ? (nextIndex >= 0 ? nextIndex : Math.min(completed, total - 1)) : 0;
  const selectedSession = sessionDates[index] || sessionDates[0];
  const number = total > 0 ? Math.min(total, Math.max(1, index + 1)) : 0;
  const catalogModule = resolveCatalogModuleForBlock(blk, customModules, catalogModules);
  const savedName = selectedSession ? catalogModule?.sessionNames?.[selectedSession.originalNumber - 1]?.trim() || '' : '';

  return {
    number,
    total,
    plannedTotal,
    completed,
    isFinished,
    affected,
    extensionAffected: plan.extensionClashedSessions,
    allAffected: plan.clashedSessions,
    scheduledDates: plan.sessions.length,
    validCountedSessions: plan.countedSessions,
    effectiveEndDate: plan.effectiveEndDate,
    originalEndDate: plan.originalEndDate,
    baselineEndDate: plan.baselineEndDate,
    extensionDays: plan.extensionDays,
    date: selectedSession?.date || blk.startDate,
    name: savedName,
    hasRealName: Boolean(savedName),
  };
}

function coverageTutorName(profileId: string, tutorProfiles: TutorProfile[]): string {
  return tutorProfiles.find(profile => profile.id === profileId)?.name || 'Selected cover';
}

function getBlockCoverageItems(blk: ModuleBlock, tutorProfiles: TutorProfile[], activeHolidays: Holiday[] = []) {
  const plan = buildHolidayAdjustedSessionPlan(blk, activeHolidays);
  const sessionDateByNumber = new Map<number, string>();
  plan.sessions.forEach(session => {
    sessionDateByNumber.set(session.originalNumber, session.date);
  });

  return (blk.sessionCoverage || [])
    .filter(item => item.tutorUnavailable)
    .map(item => ({
      sessionNumber: item.sessionNumber,
      date: sessionDateByNumber.get(item.sessionNumber) || blk.startDate,
      assignedTutor: blk.tutor || 'Primary tutor',
      coverageTutor: item.coverageTutorProfileId ? coverageTutorName(item.coverageTutorProfileId, tutorProfiles) : '',
      reason: item.tutorUnavailableReason || item.coverageReason || '',
      isCovered: Boolean(item.coverageTutorProfileId),
    }))
    .sort((a, b) => a.sessionNumber - b.sessionNumber);
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
  tutorProfiles: TutorProfile[];
}

interface ClashMarker {
  date: string;
  type: 'Holiday clash' | 'Tutor conflict' | 'Replacement clash';
  modules: string[];
  cohorts: string[];
  groups: string[];
  explanation: string;
  count?: number;
  endDate?: string;
}

interface TimelineTutorConflictPair {
  key: string;
  date: string;
  tutor: string;
  blockIds: [string, string];
  labels: [string, string];
}

interface TimelineTutorConnector {
  key: string;
  x: number;
  top: number;
  bottom: number;
  labels: string[];
  date: string;
  tutor: string;
  color: string;
  points: { y: number; label: string }[];
}

type BadgeTooltipData = {
  type: 'tutor' | 'holiday' | 'coverage';
  title: string;
  tone: {
    header: string;
    border: string;
    text: string;
  };
  summary: string;
  rows: string[];
  x: number;
  y: number;
};

type ExtensionTooltipData = {
  moduleName: string;
  expectedEndDate: string;
  actualEndDate: string;
  extensionWeeks: number;
  affectedSessions: number;
  reasons: string[];
  x: number;
  y: number;
};

type TutorConflictTooltipData = {
  labels: string[];
  tutor: string;
  date: string;
  color: string;
  x: number;
  y: number;
};

interface ClassSummary {
  key: string;
  groupIdx: number;
  rowIdx: number;
  className: string;
  programmeName: string;
  cohortName: string;
  moduleCount: number;
  color: string;
  dateRange: string;
  targetDate: string;
  firstClashDate: string;
  clashCount: number;
  holidayClashCount: number;
  tutorConflictCount: number;
  replacementClashCount: number;
  moduleBreakdown: {
    label: string;
    blockId: string;
    dateRange: string;
    targetDate: string;
    clashCount: number;
    isFinished: boolean;
    holidayClashCount: number;
    tutorConflictCount: number;
    replacementClashCount: number;
  }[];
}

interface Props {
  groups: ProgrammeGroup[];
  holidays: Holiday[];
  customModules?: CustomModule[];
  catalogModules?: CatalogModule[];
  tutorProfiles?: TutorProfile[];
  zoom: ZoomLevel;
  onZoomChange: (z: ZoomLevel) => void;
  onManageHolidays?: () => void;
  onAddRow: (groupIdx: number) => void;
  onEditRow: (groupIdx: number, rowIdx: number, blockId?: string, returnToChoice?: boolean) => void;
  onEditCatalogModule?: (moduleId: number) => void;
  onViewMonthlyBreakdown?: (groupIdx: number, rowIdx: number, blockId: string) => void;
  onDeleteRow: (groupIdx: number, rowIdx: number) => void | Promise<void>;
  onEditProgram?: (groupId: string) => void;
  onDeleteProgram?: (groupId: string) => void;
  onReorderRow?: (fromGroupIdx: number, fromRowIdx: number, toGroupIdx: number, toRowIdx: number) => void;
  onReorderGroup?: (fromGroupIdx: number, toGroupIdx: number) => void;
  onExportExcel?: () => void;
  exportExcelDisabled?: boolean;
  canManageCohorts?: boolean;
}

// ── View window per zoom level ────────────────────────────────────────────
function getMaxModuleEndDate(groups: ProgrammeGroup[], holidays: Holiday[] = []): Date | null {
  let max: Date | null = null;
  for (const grp of groups) {
    for (const row of grp.rows) {
      const selectedHolidayIds = new Set(row.holidayIds || []);
      const rowHolidays = selectedHolidayIds.size
        ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id))
        : [];
      for (const blk of row.blks) {
        const endDate = effectiveBlockEndDate(blk, rowHolidays);
        if (!endDate) continue;
        const d = new Date(endDate);
        if (!Number.isNaN(d.getTime()) && (max === null || d > max)) max = d;
      }
    }
  }
  return max;
}

function getDefaultViewWindow(zoom: ZoomLevel, groups?: ProgrammeGroup[], holidays: Holiday[] = []): { start: Date; end: Date } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Compute end from last module end date, padded to end of that year
  const maxEnd = groups ? getMaxModuleEndDate(groups, holidays) : null;
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
function daysBetweenIsoDates(a: string, b: string): number {
  const start = new Date(a);
  const end = new Date(b);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function groupClashMarkers(markers: ClashMarker[], maxGapDays = 14): ClashMarker[] {
  const grouped: ClashMarker[] = [];
  [...markers].sort((a, b) => a.date.localeCompare(b.date)).forEach(marker => {
    const last = grouped[grouped.length - 1];
    if (!last || last.type !== marker.type || daysBetweenIsoDates(last.endDate || last.date, marker.date) > maxGapDays) {
      grouped.push({ ...marker, count: marker.count || 1, endDate: marker.endDate || marker.date });
      return;
    }
    last.endDate = marker.endDate || marker.date;
    last.count = (last.count || 1) + (marker.count || 1);
    last.modules = Array.from(new Set([...last.modules, ...marker.modules]));
    last.cohorts = Array.from(new Set([...last.cohorts, ...marker.cohorts]));
    last.groups = Array.from(new Set([...last.groups, ...marker.groups]));
    last.explanation = `${last.count} ${last.type.toLowerCase()} markers grouped from ${formatDateShort(last.date)} to ${formatDateShort(last.endDate)}.`;
  });
  return grouped;
}

function getClashTone(type: ClashMarker['type']) {
  if (type === 'Tutor conflict') {
    return {
      label: 'Tutor Conflict',
      line: '#7C3AED',
      bg: 'rgba(124,58,237,0.12)',
      shadow: 'rgba(124,58,237,0.28)',
      header: '#7C3AED',
      border: '#DDD6FE',
      text: '#6D28D9',
    };
  }
  if (type === 'Replacement clash') {
    return {
      label: 'Replacement Clash',
      line: '#EA580C',
      bg: 'rgba(234,88,12,0.12)',
      shadow: 'rgba(234,88,12,0.28)',
      header: '#EA580C',
      border: '#FED7AA',
      text: '#C2410C',
    };
  }
  return {
    label: 'Holiday Clash',
    line: '#DC2626',
    bg: 'rgba(220,38,38,0.10)',
    shadow: 'rgba(220,38,38,0.30)',
    header: '#DC2626',
    border: '#FECACA',
    text: '#B91C1C',
  };
}

function ModuleTooltip({ data, onClose }: { data: TooltipData; onClose: () => void }) {
  const mod = resolveBlockMeta(data.blk, data.customModules);
  const displayName = getBlockDisplayName(data.blk, data.customModules);
  const hasHolidays = data.holidays.length > 0;
  const sessionSummary = getCurrentSessionSummary(data.blk, data.customModules, [], data.holidays);
  const displayEndDate = sessionSummary.effectiveEndDate || data.blk.endDate;
  const hasHolidayClashes = sessionSummary.allAffected > 0;
  const holidayWeeksLabel = `${sessionSummary.allAffected} week${sessionSummary.allAffected !== 1 ? 's' : ''}`;
  const scheduleDayLabel = data.blk.days?.length ? data.blk.days.join('/') : 'scheduled';
  const extensionLabel = sessionSummary.extensionDays > 0
    ? `${Math.max(1, Math.round(sessionSummary.extensionDays / 7))} week${Math.max(1, Math.round(sessionSummary.extensionDays / 7)) !== 1 ? 's' : ''}`
    : '';
  const holidayPlan = buildHolidayAdjustedSessionPlan(data.blk, data.holidays);
  const deliveryWeeks = holidayPlan.sessions.length + holidayPlan.skippedSessions.length;
  const shiftedToByDate = new Map<string, string>();
  holidayPlan.sessions.forEach(session => {
    if (session.shiftedFrom) shiftedToByDate.set(session.shiftedFrom.date, session.date);
  });
  const holidayDetails = data.holidays.map(holiday => ({
    holiday,
    skippedSessions: holidayPlan.skippedSessions.filter(session =>
      session.holidays.some(item => item.id === holiday.id)
    ),
  }));

  return (
    <div className="fixed z-50 pointer-events-none"
      style={{ left: Math.max(12, Math.min(data.x + 12, window.innerWidth - 400)), top: Math.max(data.y - 10, 8) }}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg w-96 max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-hidden pointer-events-auto">
        <div className="px-4 py-3 flex items-center gap-2" style={{ background: mod.bg }}>
          <span className="font-extrabold text-sm flex-1 truncate" style={{ color: mod.tx }}>{displayName}</span>
          <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity" style={{ color: mod.tx }}>
            <i className="ri-close-line text-xs" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-78px)] overflow-y-auto px-4 py-3 space-y-2.5">
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
                {formatDate(data.blk.startDate)} &rarr; {formatDate(displayEndDate)}
              </p>
              <p className="text-xs text-gray-400">
                {deliveryWeeks} weeks{sessionSummary.extensionDays > 0 ? ' including holiday weeks' : ''}
              </p>
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
          {(hasHolidays || hasHolidayClashes) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-white/80 px-2 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Module sessions</p>
                  <p className="mt-0.5 text-sm font-extrabold text-amber-950">{sessionSummary.plannedTotal}</p>
                </div>
                <div className="rounded bg-white/80 px-2 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Holiday weeks</p>
                  <p className="mt-0.5 text-sm font-extrabold text-amber-950">{holidayWeeksLabel}</p>
                </div>
              </div>
              {data.holidays.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {holidayDetails.map(({ holiday, skippedSessions }) => (
                    <div key={holiday.id} className="overflow-hidden rounded-md border border-amber-100 bg-white/90">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 px-2 py-1.5">
                          <p className="truncate text-[11px] font-extrabold text-amber-950">{holiday.label}</p>
                          {holiday.type && (
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">{holiday.type}</p>
                          )}
                        </div>
                        <p className="shrink-0 rounded-bl-md bg-amber-100 px-2 py-1 text-right text-[10px] font-extrabold text-amber-800">
                          {formatDateShort(holiday.startDate)} - {formatDateShort(holiday.endDate)}
                        </p>
                      </div>
                      {skippedSessions.length > 0 && (
                        <div className="border-t border-amber-100 bg-amber-50/70 px-2 py-1.5">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
                            Affected sessions
                          </p>
                          <div className="mt-1 space-y-1">
                            {skippedSessions.map(session => {
                              const shiftedTo = shiftedToByDate.get(session.date);
                              return (
                                <div
                                  key={`${holiday.id}-${session.date}-${session.originalNumber}`}
                                  className="flex items-center justify-between gap-2 rounded border border-amber-100 bg-white px-2 py-1 text-[10.5px] font-bold text-amber-950"
                                >
                                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
                                    Session {session.originalNumber}
                                  </span>
                                  <span className="min-w-0 truncate text-right text-amber-900">
                                    {formatDateShort(session.date)}{shiftedTo ? ` -> ${formatDateShort(shiftedTo)}` : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {false && hasHolidays && (
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
              {sessionSummary.affected > 0 && (
                <p className="mt-1.5 border-t border-amber-200 pt-1.5 text-xs font-semibold text-red-600">
                  {sessionSummary.affected} session{sessionSummary.affected !== 1 ? 's' : ''} clashed with the holiday range{sessionSummary.affected !== 1 ? 's' : ''}.
                </p>
              )}
              {sessionSummary.extensionAffected > 0 && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  {sessionSummary.extensionAffected} replacement session{sessionSummary.extensionAffected !== 1 ? 's' : ''} also clashed during the extension.
                </p>
              )}
              {sessionSummary.extensionDays > 0 && (
                <p className="mt-1 text-xs font-semibold text-amber-800">
                  The no-holiday {sessionSummary.plannedTotal}-session schedule would have ended on {formatDate(sessionSummary.baselineEndDate)}. Because {sessionSummary.allAffected} {scheduleDayLabel} session{sessionSummary.allAffected !== 1 ? 's' : ''} clashed with holidays, the timeline was extended{extensionLabel ? ` by around ${extensionLabel}` : ''} to {formatDate(displayEndDate)} to preserve the required {sessionSummary.plannedTotal} counted session{sessionSummary.plannedTotal !== 1 ? 's' : ''}.
                </p>
              )}
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

function ClashTooltip({ marker, x, y }: { marker: ClashMarker; x: number; y: number }) {
  const isGrouped = (marker.count || 1) > 1 || Boolean(marker.endDate && marker.endDate !== marker.date);
  const tone = getClashTone(marker.type);
  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{ left: Math.min(x + 12, window.innerWidth - 320), top: Math.max(y - 8, 8), pointerEvents: 'none' }}
    >
      <div
        className="w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border bg-white shadow-lg"
        style={{ borderColor: tone.border, pointerEvents: 'none' }}
      >
        <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: tone.header }}>
          <i className="ri-alert-line text-sm" />
          <span className="truncate text-sm font-extrabold">
            {isGrouped ? `${marker.count || 1} ${tone.label}s` : tone.label} {isGrouped ? `${formatDateShort(marker.date)} to ${formatDateShort(marker.endDate || marker.date)}` : `on ${formatDateShort(marker.date)}`}
          </span>
        </div>
        <div className="space-y-2 px-3 py-2 text-xs">
          <p className="font-extrabold" style={{ color: tone.text }}>{tone.label}</p>
          <p className="font-semibold text-gray-700">{marker.explanation}</p>
          {marker.modules.length > 0 && <p className="text-gray-500"><strong>Modules:</strong> {marker.modules.join(', ')}</p>}
          {marker.cohorts.length > 0 && <p className="text-gray-500"><strong>Cohorts:</strong> {marker.cohorts.join(', ')}</p>}
          {marker.groups.length > 0 && <p className="text-gray-500"><strong>Groups:</strong> {marker.groups.join(', ')}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
function BadgeTooltip({ data }: { data: BadgeTooltipData }) {
  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{ left: Math.min(data.x + 12, window.innerWidth - 340), top: Math.max(data.y - 8, 8) }}
    >
      <div className="w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border bg-white shadow-lg" style={{ borderColor: data.tone.border }}>
        <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: data.tone.header }}>
          <i className={`${data.type === 'coverage' ? 'ri-shield-user-line' : 'ri-alert-line'} text-sm`} />
          <span className="truncate text-sm font-extrabold">{data.title}</span>
        </div>
        <div className="space-y-2 px-3 py-2 text-xs">
          <p className="font-semibold text-gray-700">{data.summary}</p>
          {data.rows.length > 0 && (
            <div className="space-y-1">
              {data.rows.map((row, index) => (
                <p key={`${data.type}-${index}`} className="rounded-md bg-slate-50 px-2 py-1 font-semibold text-gray-600">
                  {row}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExtensionTooltip({ data }: { data: ExtensionTooltipData }) {
  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{ left: Math.min(data.x + 12, window.innerWidth - 360), top: Math.max(data.y - 8, 8) }}
    >
      <div className="w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-amber-300 bg-white shadow-lg">
        <div className="flex items-center gap-2 bg-amber-500 px-3 py-2 text-white">
          <i className="ri-time-line text-sm" />
          <span className="truncate text-sm font-extrabold">Timeline extension</span>
        </div>
        <div className="space-y-2 px-3 py-2 text-xs">
          <p className="font-extrabold text-gray-900">{data.moduleName}</p>
          <p className="font-semibold text-gray-700">
            Expected end was <strong>{formatDate(data.expectedEndDate)}</strong>, but {data.affectedSessions} affected session{data.affectedSessions !== 1 ? 's' : ''} needed replacement, so the module was extended by {data.extensionWeeks} week{data.extensionWeeks !== 1 ? 's' : ''}.
          </p>
          {data.reasons.length > 0 && (
            <div className="space-y-1">
              {data.reasons.map(reason => (
                <p key={reason} className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-900">
                  {reason}
                </p>
              ))}
            </div>
          )}
          <p className="rounded-md bg-emerald-50 px-2 py-1 font-extrabold text-emerald-800">
            Actual end: {formatDate(data.actualEndDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TutorConflictTooltip({ data }: { data: TutorConflictTooltipData }) {
  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{ left: Math.min(data.x + 12, window.innerWidth - 330), top: Math.max(data.y - 8, 8) }}
    >
      <div className="w-[310px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border bg-white shadow-lg" style={{ borderColor: data.color }}>
        <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: data.color }}>
          <div className="flex min-w-0 items-center gap-2">
            <i className="ri-user-shared-line text-sm" />
            <span className="truncate text-sm font-extrabold">Tutor conflict</span>
          </div>
        </div>
        <div className="space-y-2 px-3 py-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <p className="rounded-md bg-slate-50 px-2 py-1 font-semibold text-gray-600">
              Tutor: <span className="font-extrabold text-gray-900">{data.tutor || 'Unassigned'}</span>
            </p>
            <p className="rounded-md bg-slate-50 px-2 py-1 font-semibold text-gray-600">
              Date: <span className="font-extrabold text-gray-900">{formatDateShort(data.date)}</span>
            </p>
          </div>
          <div className="space-y-1">
            {data.labels.map((label, index) => (
              <p key={`${label}-${index}`} className="flex items-center gap-2 rounded-md px-2 py-1 font-extrabold text-gray-800" style={{ background: `${data.color}14` }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: data.color }} />
                <span className="truncate">{label}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GanttTimeline({
  groups, holidays, customModules = [], catalogModules = [], tutorProfiles = [], zoom, onZoomChange,
  onManageHolidays, onAddRow, onEditRow, onDeleteRow, onEditProgram, onDeleteProgram,
  onEditCatalogModule, onViewMonthlyBreakdown, onReorderRow, onReorderGroup, onExportExcel, exportExcelDisabled = false, canManageCohorts = true,
}: Props) {
  const [tooltip, setTooltip]             = useState<TooltipData | null>(null);
  const [holidayTip, setHolidayTip]       = useState<{ h: Holiday; x: number; y: number } | null>(null);
  const [clashTip, setClashTip] = useState<{ marker: ClashMarker; x: number; y: number } | null>(null);
  const [badgeTip, setBadgeTip] = useState<BadgeTooltipData | null>(null);
  const [extensionTip, setExtensionTip] = useState<ExtensionTooltipData | null>(null);
  const [tutorConflictTip, setTutorConflictTip] = useState<TutorConflictTooltipData | null>(null);
  const [classesOpen, setClassesOpen] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [showCompletedClasses, setShowCompletedClasses] = useState(false);
  const [collapsedClassProgrammes, setCollapsedClassProgrammes] = useState<Set<string>>(new Set());
  const [lastClassSelection, setLastClassSelection] = useState<{ classKey: string; moduleKey?: string } | null>(null);
  const [focusedTimelineTarget, setFocusedTimelineTarget] = useState<{ groupIdx?: number; rowKey?: string; blockId?: string } | null>(null);
  const [pendingTimelineNavigation, setPendingTimelineNavigation] = useState<{ groupIdx?: number; rowKey?: string; targetDate: string } | null>(null);
  const [editChoice, setEditChoice] = useState<{
    blk: ModuleBlock;
    moduleLabel: string;
    programmeName: string;
    cohortLabel: string;
    groupIdx: number;
    rowIdx: number;
    catalogModule?: CatalogModule;
  } | null>(null);
  const [viewWindow, setViewWindow] = useState(() => getDefaultViewWindow(zoom, groups, holidays));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [crossRowTutorConnectors, setCrossRowTutorConnectors] = useState<TimelineTutorConnector[]>([]);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const headerScrollFrame = useRef<number | null>(null);
  const panState = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; windowY: number } | null>(null);
  const timelineSurfaceRef = useRef<HTMLDivElement>(null);
  const classesPopupRef = useRef<HTMLDivElement>(null);
  const leftW = viewportWidth < 640 ? 184 : viewportWidth < 1024 ? 210 : LEFT_W;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => {
    if (headerScrollFrame.current !== null) {
      window.cancelAnimationFrame(headerScrollFrame.current);
    }
  }, []);

  // Drag-and-drop state
  type DragItem = { type: 'cohort'; groupIdx: number; rowIdx: number } | { type: 'group'; groupIdx: number };
  type DragOverTarget = { type: 'cohort'; groupIdx: number; rowIdx: number } | { type: 'group'; groupIdx: number };
  const dragItem    = useRef<DragItem | null>(null);
  const [dragOver, setDragOver] = useState<DragOverTarget | null>(null);

  useEffect(() => {
    if (!classesOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && classesPopupRef.current?.contains(target)) {
        return;
      }
      setClassesOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [classesOpen]);

  useEffect(() => {
    if (!classesOpen || !lastClassSelection) return;
    const timeout = window.setTimeout(() => {
      const selected = classesPopupRef.current?.querySelector('[data-class-selection-active="true"]');
      selected?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [classesOpen, lastClassSelection]);

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
    const header = headerTrackRef.current;
    if (!el || !header) return;

    if (headerScrollFrame.current !== null) {
      window.cancelAnimationFrame(headerScrollFrame.current);
    }

    headerScrollFrame.current = window.requestAnimationFrame(() => {
      header.style.transform = `translate3d(-${el.scrollLeft}px, 0, 0)`;
      headerScrollFrame.current = null;
    });
  }, []);

  const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;

    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      el.scrollLeft += event.deltaY;
      handleTimelineScroll();
      return;
    }

    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
    }
  }, [handleTimelineScroll]);

  const endTimelinePan = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (event && panState.current) {
      try {
        event.currentTarget.releasePointerCapture(panState.current.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }
    panState.current = null;
    el?.classList.remove('is-panning');
    document.body.style.userSelect = '';
  }, []);

  const handleTimelinePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType !== 'mouse') return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('button,input,textarea,select,a,[draggable="true"]')) return;

    const el = scrollRef.current;
    if (!el) return;
    panState.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: el.scrollLeft,
      windowY: window.scrollY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    el.classList.add('is-panning');
    document.body.style.userSelect = 'none';
  }, []);

  const handleTimelinePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panState.current;
    const el = scrollRef.current;
    if (!pan || !el) return;

    event.preventDefault();
    el.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    window.scrollTo({ top: pan.windowY - (event.clientY - pan.y), left: window.scrollX, behavior: 'auto' });
    handleTimelineScroll();
  }, [handleTimelineScroll]);

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
  const dataEnd = useMemo(() => getMaxModuleEndDate(groups, holidays), [groups, holidays]);
  const effectiveEnd = useMemo(() => {
    if (!dataEnd) return viewWindow.end;
    const dec31 = new Date(dataEnd.getFullYear(), 11, 31);
    return dec31 > viewWindow.end ? dec31 : viewWindow.end;
  }, [dataEnd, viewWindow.end]);

  const handleZoomChange = useCallback((z: ZoomLevel) => {
    onZoomChange(z);
    setViewWindow(getDefaultViewWindow(z, groups, holidays));
    setTooltip(null);
  }, [onZoomChange, groups, holidays]);

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

  useEffect(() => {
    if (!pendingTimelineNavigation) return;

    const { groupIdx, rowKey, targetDate } = pendingTimelineNavigation;
    const scrollToTarget = () => {
      const targetEl = rowKey
        ? document.querySelector(`[data-row-target="${rowKey}"]`)
        : groupIdx !== undefined
          ? document.querySelector(`[data-programme-target="${groupIdx}"]`)
          : null;
      targetEl?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      window.setTimeout(() => {
        const pos = targetDate ? getBlockPosition(targetDate, targetDate, cols) : null;
        const el = scrollRef.current;
        if (pos && el) {
          el.scrollTo({ left: Math.max(0, pos.left - 160), behavior: 'smooth' });
        }
      }, 120);
    };

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToTarget);
    });
    const clear = window.setTimeout(() => {
      setPendingTimelineNavigation(current =>
        current?.rowKey === rowKey && current.groupIdx === groupIdx && current.targetDate === targetDate ? null : current
      );
    }, 700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
    };
  }, [cols, pendingTimelineNavigation]);

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
    if (!result.isConfirmed) return;

    void kbcSwal.fire({
      title: 'Deleting Cohort...',
      html: `Removing <strong>${cohortLabel}</strong> from the training plan. Please wait.`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });

    try {
      await onDeleteRow(groupIdx, rowIdx);
      await kbcSwal.fire({
        icon: 'success',
        title: 'Cohort Deleted',
        html: `<strong>${cohortLabel}</strong> was removed successfully.`,
        confirmButtonText: 'OK',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delete error';
      await kbcSwal.fire({
        icon: 'error',
        title: 'Cohort Not Deleted',
        html: `The cohort was not removed.<br /><br /><strong>Details:</strong> ${message}`,
        confirmButtonText: 'OK',
      });
    }
  }, [onDeleteRow]);

  const holidayPositions = useMemo(() =>
    holidays.map(h => ({ h, pos: getBlockPosition(h.startDate, h.endDate, cols) }))
      .filter(x => x.pos !== null),
  [holidays, cols]);

  const rowClashMarkers = useMemo(() => {
    const moduleName = (blk: ModuleBlock) => getBlockDisplayName(blk, customModules);
    return groups.map(grp => grp.rows.map(row => {
      void grp;
      const selectedHolidayIds = new Set(row.holidayIds || []);
      const activeHolidays = selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
      const markers = new Map<string, ClashMarker>();
      const addMarker = (date: string, marker: Omit<ClashMarker, 'date'>) => {
        const markerKey = `${date}|${marker.type}`;
        const existing = markers.get(markerKey);
        if (!existing) {
          markers.set(markerKey, { date, ...marker });
          return;
        }
        existing.modules = Array.from(new Set([...existing.modules, ...marker.modules]));
        existing.cohorts = Array.from(new Set([...existing.cohorts, ...marker.cohorts]));
        existing.groups = Array.from(new Set([...existing.groups, ...marker.groups]));
        if (existing.type !== marker.type && marker.type === 'Replacement clash') existing.type = marker.type;
      };

      row.blks.forEach(blk => {
        const plan = buildHolidayAdjustedSessionPlan(blk, activeHolidays);
        plan.skippedSessions.forEach(session => {
          const holidayLabels = session.holidays.map(holiday => holiday.label).join(', ');
          addMarker(session.date, {
            type: session.isExtension ? 'Replacement clash' : 'Holiday clash',
            modules: [moduleName(blk)],
            cohorts: [row.label],
            groups: [blk.groupName || row.label],
            explanation: `${moduleName(blk)} session falls within ${holidayLabels || 'a linked holiday range'}.`,
          });
        });
      });

      const tutorSessions: { blk: ModuleBlock; date: string; startTime: string; endTime: string; tutor: string }[] = [];
      row.blks.forEach(blk => {
        const sessionSummary = getCurrentSessionSummary(blk, customModules, catalogModules, activeHolidays);
        if (sessionSummary.isFinished) return;
        const tutors = splitPeople(blk.tutor || '').map(tutor => tutor.toLowerCase());
        if (!tutors.length) return;
        const plan = buildHolidayAdjustedSessionPlan(blk, activeHolidays);
        plan.sessions.filter(session => !session.isClash).forEach(session => {
          const startTime = blk.sessionStartTime || '09:00';
          const endTime = blk.sessionEndTime || '11:00';
          if (hasSessionEnded(session.date, endTime, new Date())) return;
          tutors.forEach(tutor => {
            tutorSessions.push({ blk, date: session.date, startTime, endTime, tutor });
          });
        });
      });
      for (let i = 0; i < tutorSessions.length; i += 1) {
        for (let j = i + 1; j < tutorSessions.length; j += 1) {
          const a = tutorSessions[i];
          const b = tutorSessions[j];
          if (a.blk.id === b.blk.id) continue;
          if (a.date !== b.date || a.tutor !== b.tutor) continue;
          if (!timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
          addMarker(a.date, {
            type: 'Tutor conflict',
            modules: [moduleName(a.blk), moduleName(b.blk)],
            cohorts: [row.label],
            groups: [a.blk.groupName || row.label, b.blk.groupName || row.label],
            explanation: 'The same tutor is scheduled for overlapping sessions.',
          });
        }
      }

      return Array.from(markers.values()).sort((a, b) => a.date.localeCompare(b.date));
    }));
  }, [catalogModules, customModules, groups, holidays]);

  const crossRowTutorConflictPairs = useMemo<TimelineTutorConflictPair[]>(() => {
    const moduleName = (blk: ModuleBlock) => getBlockDisplayName(blk, customModules);
    const tutorSessions: {
      blockId: string;
      rowKey: string;
      date: string;
      startTime: string;
      endTime: string;
      tutor: string;
      label: string;
    }[] = [];

    groups.forEach((grp, groupIdx) => {
      if (collapsedGroups.has(grp.id)) return;
      grp.rows.forEach((row, rowIdx) => {
        const rowKey = `${groupIdx}-${rowIdx}`;
        const selectedHolidayIds = new Set(row.holidayIds || []);
        const activeHolidays = selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
        row.blks.forEach(blk => {
          const sessionSummary = getCurrentSessionSummary(blk, customModules, catalogModules, activeHolidays);
          if (sessionSummary.isFinished) return;
          const tutors = splitPeople(blk.tutor || '').map(tutor => tutor.toLowerCase());
          if (!tutors.length) return;
          const startTime = blk.sessionStartTime || '09:00';
          const endTime = blk.sessionEndTime || '11:00';
          const plan = buildHolidayAdjustedSessionPlan(blk, activeHolidays);
          plan.sessions.filter(session => !session.isClash).forEach(session => {
            if (hasSessionEnded(session.date, endTime, new Date())) return;
            tutors.forEach(tutor => {
              tutorSessions.push({
                blockId: blk.id,
                rowKey,
                date: session.date,
                startTime,
                endTime,
                tutor,
                label: moduleName(blk),
              });
            });
          });
        });
      });
    });

    const pairs: TimelineTutorConflictPair[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < tutorSessions.length; i += 1) {
      for (let j = i + 1; j < tutorSessions.length; j += 1) {
        const a = tutorSessions[i];
        const b = tutorSessions[j];
        if (a.blockId === b.blockId) continue;
        if (a.rowKey === b.rowKey) continue;
        if (a.date !== b.date || a.tutor !== b.tutor) continue;
        if (!timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
        const [firstId, secondId] = [a.blockId, b.blockId].sort();
        const key = `${a.tutor}|${firstId}|${secondId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({
          key,
          date: a.date,
          tutor: a.tutor,
          blockIds: [a.blockId, b.blockId],
          labels: [a.label, b.label],
        });
      }
    }
    return pairs;
  }, [catalogModules, collapsedGroups, customModules, groups, holidays]);

  const tutorConflictColorMap = useMemo(() => {
    const keys = new Set<string>();
    crossRowTutorConflictPairs.forEach(pair => keys.add(pair.key));

    groups.forEach((grp, groupIdx) => {
      if (collapsedGroups.has(grp.id)) return;
      grp.rows.forEach((row, rowIdx) => {
        void groupIdx;
        void rowIdx;
        const selectedHolidayIds = new Set(row.holidayIds || []);
        const activeHolidays = selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
        const tutorSessions: { blockId: string; date: string; startTime: string; endTime: string; tutor: string }[] = [];
        row.blks.forEach(blk => {
          const sessionSummary = getCurrentSessionSummary(blk, customModules, catalogModules, activeHolidays);
          if (sessionSummary.isFinished) return;
          const tutors = splitPeople(blk.tutor || '').map(tutor => tutor.toLowerCase());
          if (!tutors.length) return;
          const startTime = blk.sessionStartTime || '09:00';
          const endTime = blk.sessionEndTime || '11:00';
          const plan = buildHolidayAdjustedSessionPlan(blk, activeHolidays);
          plan.sessions.filter(session => !session.isClash).forEach(session => {
            if (hasSessionEnded(session.date, endTime, new Date())) return;
            tutors.forEach(tutor => {
              tutorSessions.push({ blockId: blk.id, date: session.date, startTime, endTime, tutor });
            });
          });
        });

        for (let i = 0; i < tutorSessions.length; i += 1) {
          for (let j = i + 1; j < tutorSessions.length; j += 1) {
            const a = tutorSessions[i];
            const b = tutorSessions[j];
            if (a.blockId === b.blockId) continue;
            if (a.date !== b.date || a.tutor !== b.tutor) continue;
            if (!timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
            const [firstId, secondId] = [a.blockId, b.blockId].sort();
            keys.add(`${a.tutor}|${firstId}|${secondId}`);
          }
        }
      });
    });

    const colorMap = new Map<string, string>();
    Array.from(keys).sort().forEach((key, index) => {
      colorMap.set(key, TUTOR_CONFLICT_COLORS[index % TUTOR_CONFLICT_COLORS.length]);
    });
    return colorMap;
  }, [catalogModules, collapsedGroups, crossRowTutorConflictPairs, customModules, groups, holidays]);

  const timelineLayoutSignature = useMemo(() => (
    groups.map(grp => [
      grp.id,
      collapsedGroups.has(grp.id) ? 'collapsed' : 'open',
      ...grp.rows.map(row => [
        row.id,
        ...row.blks.map(blk => [
          blk.id,
          blk.groupName || '',
          blk.startDate,
          blk.endDate,
        ].join(':')),
      ].join('|')),
    ].join('~')).join('||')
  ), [collapsedGroups, groups]);

  useEffect(() => {
    const measureConnectors = () => {
      const surface = timelineSurfaceRef.current;
      if (!surface || crossRowTutorConflictPairs.length === 0) {
        setCrossRowTutorConnectors([]);
        return;
      }

      const surfaceRect = surface.getBoundingClientRect();
      const blockElements = new Map<string, HTMLElement>();
      surface.querySelectorAll<HTMLElement>('[data-timeline-block-id]').forEach(element => {
        if (element.dataset.timelineBlockId) {
          blockElements.set(element.dataset.timelineBlockId, element);
        }
      });

      const nextConnectors = crossRowTutorConflictPairs.flatMap((pair, index) => {
        const first = blockElements.get(pair.blockIds[0]);
        const second = blockElements.get(pair.blockIds[1]);
        const datePos = getBlockPosition(pair.date, pair.date, cols);
        if (!first || !second || !datePos) return [];

        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        const firstY = firstRect.top - surfaceRect.top + firstRect.height / 2;
        const secondY = secondRect.top - surfaceRect.top + secondRect.height / 2;
        const x = leftW + datePos.left + Math.max(2, datePos.width) / 2;
        const points = [
          { y: firstY, label: pair.labels[0] },
          { y: secondY, label: pair.labels[1] },
        ];

        return [{
          key: pair.key,
          x,
          top: Math.min(firstY, secondY),
          bottom: Math.max(firstY, secondY),
          labels: pair.labels,
          date: pair.date,
          tutor: pair.tutor,
          color: tutorConflictColorMap.get(pair.key) || tutorConflictColor(pair.key),
          points,
        }];
      });

      setCrossRowTutorConnectors(nextConnectors);
    };

    const frame = window.requestAnimationFrame(measureConnectors);
    window.addEventListener('resize', measureConnectors);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureConnectors);
    };
  }, [cols, crossRowTutorConflictPairs, leftW, timelineLayoutSignature, tutorConflictColorMap]);

  // ── Header rows ───────────────────────────────────────────────────────
  const classSummaries = useMemo<ClassSummary[]>(() => {
    const summaries = new Map<string, ClassSummary>();
    groups.forEach((grp, groupIdx) => {
      grp.rows.forEach((row, rowIdx) => {
        const rowClashes = rowClashMarkers[groupIdx]?.[rowIdx] || [];
        const selectedHolidayIds = new Set(row.holidayIds || []);
        const rowHolidays = selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
        row.blks.forEach(blk => {
          const className = (blk.groupName || row.label || 'Unnamed class').trim();
          const key = `${grp.id}|${row.id}|${className}`;
          const moduleLabel = getBlockDisplayName(blk, customModules);
          const modulePlan = buildHolidayAdjustedSessionPlan(blk, rowHolidays);
          const moduleSessionSummary = getCurrentSessionSummary(blk, customModules, catalogModules, rowHolidays);
          const moduleTutorConflicts = rowClashes.filter(marker => (
            marker.type === 'Tutor conflict' &&
            marker.groups.includes(className) &&
            marker.modules.includes(moduleLabel)
          ));
          const moduleFirstClashDate = modulePlan.skippedSessions[0]?.date || moduleTutorConflicts[0]?.date || '';
          const moduleBreakdown = {
            label: moduleLabel,
            blockId: blk.id,
            dateRange: blk.startDate && modulePlan.effectiveEndDate ? `${formatDateShort(blk.startDate)} to ${formatDateShort(modulePlan.effectiveEndDate)}` : '',
            targetDate: moduleFirstClashDate || blk.startDate || row.dateLbl || '',
            clashCount: modulePlan.originalClashedSessions + moduleTutorConflicts.length + modulePlan.extensionClashedSessions,
            isFinished: moduleSessionSummary.isFinished,
            holidayClashCount: modulePlan.originalClashedSessions,
            tutorConflictCount: moduleTutorConflicts.length,
            replacementClashCount: modulePlan.extensionClashedSessions,
          };
          const classClashes = rowClashes.filter(marker => (
            marker.groups.includes(className) ||
            (marker.groups.length === 0 && marker.cohorts.includes(row.label))
          ));
          const firstClashDate = moduleFirstClashDate || classClashes[0]?.date || '';
          const holidayClashCount = moduleBreakdown.holidayClashCount;
          const tutorConflictCount = moduleBreakdown.tutorConflictCount;
          const replacementClashCount = moduleBreakdown.replacementClashCount;
          const moduleClashCount = holidayClashCount + tutorConflictCount + replacementClashCount;
          const existing = summaries.get(key);
          if (existing) {
            existing.moduleCount += 1;
            if (blk.startDate && (!existing.targetDate || blk.startDate < existing.targetDate)) {
              existing.targetDate = blk.startDate;
            }
            if (firstClashDate && (!existing.firstClashDate || firstClashDate < existing.firstClashDate)) {
              existing.firstClashDate = firstClashDate;
            }
            existing.clashCount += moduleClashCount;
            existing.holidayClashCount += holidayClashCount;
            existing.tutorConflictCount += tutorConflictCount;
            existing.replacementClashCount += replacementClashCount;
            existing.moduleBreakdown.push(moduleBreakdown);
            return;
          }
          summaries.set(key, {
            key,
            groupIdx,
            rowIdx,
            className,
            programmeName: grp.name.replace('\n', ' '),
            cohortName: row.label,
            moduleCount: 1,
            color: row.color || blk.color || grp.color,
            dateRange: blk.startDate && modulePlan.effectiveEndDate ? `${formatDateShort(blk.startDate)} to ${formatDateShort(modulePlan.effectiveEndDate)}` : '',
            targetDate: blk.startDate || row.dateLbl || '',
            firstClashDate,
            clashCount: moduleClashCount,
            holidayClashCount,
            tutorConflictCount,
            replacementClashCount,
            moduleBreakdown: [moduleBreakdown],
          });
        });
      });
    });
    return Array.from(summaries.values()).sort((a, b) => (
      (b.clashCount > 0 ? 1 : 0) - (a.clashCount > 0 ? 1 : 0) ||
      a.className.localeCompare(b.className) ||
      a.programmeName.localeCompare(b.programmeName) ||
      a.cohortName.localeCompare(b.cohortName)
    ));
  }, [catalogModules, customModules, groups, holidays, rowClashMarkers]);

  const filteredClassSummaries = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return classSummaries;
    return classSummaries.filter(item => (
      item.className.toLowerCase().includes(q) ||
      item.programmeName.toLowerCase().includes(q) ||
      item.cohortName.toLowerCase().includes(q) ||
      item.moduleBreakdown.some(moduleItem => moduleItem.label.toLowerCase().includes(q))
    ));
  }, [classSearch, classSummaries]);

  const classNavigationGroups = useMemo(() => {
    const q = classSearch.trim();
    const grouped = new Map<string, { programmeName: string; items: ClassSummary[]; color: string; issueCount: number; moduleCount: number }>();
    const completed: ClassSummary[] = [];

    filteredClassSummaries.forEach(item => {
      const activeModules = item.moduleBreakdown.filter(moduleItem => !moduleItem.isFinished || moduleItem.clashCount > 0 || q);
      const isCompletedClass = item.moduleBreakdown.length > 0 && item.moduleBreakdown.every(moduleItem => moduleItem.isFinished) && item.clashCount === 0;
      if (isCompletedClass && !q) {
        completed.push(item);
        return;
      }
      const entry = grouped.get(item.programmeName) || {
        programmeName: item.programmeName,
        items: [],
        color: item.color,
        issueCount: 0,
        moduleCount: 0,
      };
      entry.items.push({ ...item, moduleBreakdown: activeModules });
      entry.issueCount += item.clashCount;
      entry.moduleCount += activeModules.length;
      grouped.set(item.programmeName, entry);
    });

    return {
      active: Array.from(grouped.values()).sort((a, b) => b.issueCount - a.issueCount || a.programmeName.localeCompare(b.programmeName)),
      completed,
    };
  }, [classSearch, filteredClassSummaries]);

  const navigateToClass = useCallback((item: ClassSummary, targetDateOverride?: string, moduleKey?: string, blockId?: string) => {
    setLastClassSelection({ classKey: item.key, moduleKey });
    setClassesOpen(false);
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      const groupId = groups[item.groupIdx]?.id;
      if (groupId) next.delete(groupId);
      return next;
    });
    const rowKey = `${item.groupIdx}-${item.rowIdx}`;
    setFocusedTimelineTarget({ rowKey, blockId });

    const targetDate = targetDateOverride || item.firstClashDate || item.targetDate;
    if (targetDate) {
      const [year, month, day] = targetDate.split('-').map(Number);
      const target = new Date(year || 1970, (month || 1) - 1, day || 1);
      let nextWindow: { start: Date; end: Date };
      if (zoom === 'week') {
        nextWindow = getNormalizedWeekWindow(target);
      } else if (zoom === 'day') {
        nextWindow = { start: shiftDateByDays(target, -14), end: shiftDateByDays(target, 28) };
      } else if (zoom === 'month') {
        nextWindow = { start: new Date(target.getFullYear(), 0, 1), end: new Date(target.getFullYear(), 11, 31) };
      } else if (zoom === 'intake') {
        const intakeStartMonth = Math.floor(target.getMonth() / 4) * 4;
        nextWindow = { start: new Date(target.getFullYear(), intakeStartMonth, 1), end: new Date(target.getFullYear(), intakeStartMonth + 4, 0) };
      } else {
        nextWindow = { start: new Date(target.getFullYear(), 0, 1), end: new Date(target.getFullYear(), 11, 31) };
      }
      setViewWindow(nextWindow);
    }
    setPendingTimelineNavigation({ rowKey, targetDate: targetDate || item.targetDate || '' });

    window.setTimeout(() => setFocusedTimelineTarget(prev => prev?.rowKey === rowKey && prev.blockId === blockId ? null : prev), 2200);
  }, [groups, zoom]);

  const navigateToProgramme = useCallback((items: ClassSummary[]) => {
    const target = [...items].sort((a, b) => b.clashCount - a.clashCount || a.targetDate.localeCompare(b.targetDate))[0];
    if (!target) return;
    setClassesOpen(false);
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      const groupId = groups[target.groupIdx]?.id;
      if (groupId) next.delete(groupId);
      return next;
    });
    setFocusedTimelineTarget({ groupIdx: target.groupIdx });
    const targetDate = target.firstClashDate || target.targetDate || '';
    if (targetDate) {
      const [year, month, day] = targetDate.split('-').map(Number);
      const targetDay = new Date(year || 1970, (month || 1) - 1, day || 1);
      let nextWindow: { start: Date; end: Date };
      if (zoom === 'week') {
        nextWindow = getNormalizedWeekWindow(targetDay);
      } else if (zoom === 'day') {
        nextWindow = { start: shiftDateByDays(targetDay, -14), end: shiftDateByDays(targetDay, 28) };
      } else if (zoom === 'month') {
        nextWindow = { start: new Date(targetDay.getFullYear(), 0, 1), end: new Date(targetDay.getFullYear(), 11, 31) };
      } else if (zoom === 'intake') {
        const intakeStartMonth = Math.floor(targetDay.getMonth() / 4) * 4;
        nextWindow = { start: new Date(targetDay.getFullYear(), intakeStartMonth, 1), end: new Date(targetDay.getFullYear(), intakeStartMonth + 4, 0) };
      } else {
        nextWindow = { start: new Date(targetDay.getFullYear(), 0, 1), end: new Date(targetDay.getFullYear(), 11, 31) };
      }
      setViewWindow(nextWindow);
    }
    setPendingTimelineNavigation({ groupIdx: target.groupIdx, targetDate });
    window.setTimeout(() => setFocusedTimelineTarget(prev => prev?.groupIdx === target.groupIdx && !prev.rowKey ? null : prev), 2200);
  }, [groups, zoom]);

  const toggleClassProgramme = useCallback((programmeName: string) => {
    setCollapsedClassProgrammes(prev => {
      const next = new Set(prev);
      if (next.has(programmeName)) next.delete(programmeName);
      else next.add(programmeName);
      return next;
    });
  }, []);

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
            <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
            <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
            <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
            <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
          <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
          <div className="flex" style={{ borderBottom: '1px solid #E5E7EB' }}>
            <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
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
            <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
            <div className="flex">
              {cols.map((c, i) => {
                const start = new Date(c.startDate);
                const isSpecial = isSpecialWeekDay(start);
                const isToday = isCurrentColumn(c.startDate, c.endDate);
                const weekNumber = i === 0 ? getIsoWeekNumber(start) : null;
                return (
                  <div
                    key={c.key}
                    className="text-center py-1.5 border-r shrink-0 flex flex-col items-center justify-center bg-white"
                    style={{ width: c.widthPx, minHeight: 44, borderColor: '#E2E8F0' }}
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
        <div className="flex" style={{ borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
          <div className="flex">
            {monthGroups.map((mg, i) => {
              const w = mg.cols.reduce((s, c) => s + c.widthPx, 0);
              const navyShades = ['#1B2A4A','#243560','#2E4482','#3D5A99'];
              return (
                <div key={i} className="text-center font-bold py-2 border-r border-white/20 shrink-0"
                  style={{ width: w, background: navyShades[i % navyShades.length], color: '#fff', fontSize: '12px' }}>
                  {mg.label}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex" style={{ borderBottom: '1px solid #D1D5DB' }}>
          <div style={{ width: leftW, flexShrink: 0, borderRight: '1px solid #E5E7EB', background: '#F8FAFC', position: 'sticky', left: 0, zIndex: 20 }} />
          <div className="flex">
            {cols.map((c, i) => (
              <div key={c.key} className="text-center py-1 border-r shrink-0 flex flex-col items-center justify-center"
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
    const rowTargetKey = `${groupIdx}-${rowIdx}`;
    const isFocusedModule = focusedTimelineTarget?.rowKey === rowTargetKey && focusedTimelineTarget.blockId === blk.id;
    const sessionSummary = getCurrentSessionSummary(blk, customModules, catalogModules, activeHolidays);
    const displayEndDate = sessionSummary.effectiveEndDate || blk.endDate;
    const pos = getBlockPosition(blk.startDate, displayEndDate, cols);
    if (!pos) return null;
    const extensionStartDate = sessionSummary.baselineEndDate && displayEndDate > sessionSummary.baselineEndDate
      ? nextIsoDate(sessionSummary.baselineEndDate)
      : '';
    const extensionPos = extensionStartDate && extensionStartDate <= displayEndDate
      ? getBlockPosition(extensionStartDate, displayEndDate, cols)
      : null;
    const extensionStyle = extensionPos
      ? {
          left: Math.max(0, extensionPos.left - pos.left),
          width: Math.max(0, Math.min(extensionPos.width, pos.left + pos.width - extensionPos.left)),
        }
      : null;
    const mod = resolveBlockMeta(blk, customModules);
    const extensionPlan = extensionStyle ? buildHolidayAdjustedSessionPlan(blk, activeHolidays) : null;
    const extensionWeeks = Math.max(1, Math.round((sessionSummary.extensionDays || 0) / 7));
    const extensionReasons = extensionPlan
      ? Array.from(new Set(extensionPlan.skippedSessions.flatMap(session =>
          session.holidays.map(holiday =>
            `${holiday.label}: Session ${session.originalNumber} shifted from ${formatDateShort(session.date)}`
          )
        )))
      : [];
    const overlaps = activeHolidays.filter(holiday => rangesOverlap(blk.startDate, displayEndDate, holiday.startDate, holiday.endDate));
    const tutorConflictMarkers = (rowClashMarkers[groupIdx]?.[rowIdx] || []).filter(marker => (
      marker.type === 'Tutor conflict'
      && marker.modules.includes(mod.lbl)
      && marker.groups.includes(blk.groupName || cohortLabel)
    ));
    const hasTutorConflict = !sessionSummary.isFinished && tutorConflictMarkers.length > 0;
    const coachLabel = (blk.coachName || '').trim();
    const tutorLabel = (blk.tutor || '').trim();
    const coverageItems = getBlockCoverageItems(blk, tutorProfiles, activeHolidays);
    const firstCoverage = coverageItems[0];
    const coverageMarkers = coverageItems.map(item => {
      const datePos = getBlockPosition(item.date, item.date, cols);
      const left = datePos ? datePos.left - pos.left + Math.max(6, datePos.width / 2) : 8;
      return {
        item,
        left: Math.max(0, Math.min(pos.width, left)),
      };
    });
    const personLabel = tutorLabel || coachLabel;
    const personRole = tutorLabel ? 'Tutor' : coachLabel ? 'Coach' : '';
    const showPerson = pos.width > 78 && Boolean(personLabel);
    const sessionLabel = sessionSummary.isFinished
      ? 'Finished'
      : sessionSummary.total === 0
      ? 'No sessions'
      : sessionSummary.hasRealName
      ? `S${sessionSummary.number}: ${sessionSummary.name}`
      : `S${sessionSummary.number}: no saved name`;
    const sessionProgressLabel = sessionSummary.total === 0
      ? 'No sessions'
      : sessionSummary.isFinished
      ? `${sessionSummary.total}/${sessionSummary.total} sessions complete`
      : `Session ${sessionSummary.number}/${sessionSummary.total} - ${sessionSummary.completed}/${sessionSummary.total} done`;
    const showStackedSessionProgress = pos.width > 72;
    const stackLabel = false;
    const showBadgeTip = (event: ReactMouseEvent, data: Omit<BadgeTooltipData, 'x' | 'y'>) => {
      setTooltip(null);
      setClashTip(null);
      setBadgeTip({ ...data, x: event.clientX, y: event.clientY });
    };
    const moveBadgeTip = (event: ReactMouseEvent) => {
      setBadgeTip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
    };
    const showCoverageTip = (event: ReactMouseEvent) => {
      event.stopPropagation();
      if (!coverageItems.length) return;
      setTooltip(null);
      setClashTip(null);
      setExtensionTip(null);
      const coveredCount = coverageItems.filter(item => item.coverageTutor).length;
      showBadgeTip(event, {
        type: 'coverage',
        title: coveredCount === coverageItems.length ? 'Coverage assigned' : 'Coverage required',
        tone: firstCoverage?.coverageTutor
          ? { header: '#059669', border: '#A7F3D0', text: '#047857' }
          : { header: '#D97706', border: '#FDE68A', text: '#92400E' },
        summary: `${coverageItems.length} coverage session${coverageItems.length === 1 ? '' : 's'} for ${mod.lbl}.`,
        rows: coverageItems.map(item => [
          `Session ${item.sessionNumber} (${formatDateShort(item.date)}): ${item.assignedTutor} unavailable`,
          item.coverageTutor ? `covered by ${item.coverageTutor}` : 'coverage required',
          item.reason ? `Reason: ${item.reason}` : '',
        ].filter(Boolean).join(' - ')),
      });
    };
    const openConflictFix = (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      if (!canManageCohorts) return;
      setTooltip(null);
      setBadgeTip(null);
      setClashTip(null);
      onEditRow(groupIdx, rowIdx, blk.id, true);
    };
    const showExtensionTip = (event: ReactMouseEvent) => {
      event.stopPropagation();
      if (!extensionStyle) return;
      setTooltip(null);
      setClashTip(null);
      setBadgeTip(null);
      setExtensionTip({
        moduleName: mod.lbl,
        expectedEndDate: sessionSummary.baselineEndDate,
        actualEndDate: displayEndDate,
        extensionWeeks,
        affectedSessions: sessionSummary.allAffected,
        reasons: extensionReasons,
        x: event.clientX,
        y: event.clientY,
      });
    };

    return (
      <div
        key={blk.id}
        data-timeline-block-id={blk.id}
        className={`absolute z-10 cursor-pointer transition-all ${coverageItems.length > 0 ? 'overflow-visible' : 'overflow-hidden'}`}
        style={{
          left: pos.left,
          width: pos.width,
          top: topPx,
          height: heightPx,
          background: mod.bg,
          borderRadius: 3,
          outline: isFocusedModule ? '3px solid #DC2626' : hasTutorConflict ? '2px solid #F7A800' : 'none',
          outlineOffset: isFocusedModule ? '2px' : hasTutorConflict ? '1px' : '0',
          boxShadow: isFocusedModule ? '0 0 0 4px rgba(220,38,38,0.16), 0 8px 18px rgba(15,23,42,0.22)' : undefined,
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={e => {
          setClashTip(null);
          setExtensionTip(null);
          setTooltip({ blk, cohortLabel, cohortColor, programmeName: grp.name, programmeColor: grp.color, holidays: overlaps, x: e.clientX, y: e.clientY, customModules, tutorProfiles });
        }}
        onMouseLeave={() => {
          setTooltip(null);
        }}
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
        {extensionStyle && extensionStyle.width > 3 && (
          <div
            className="absolute inset-y-0"
            onMouseEnter={showExtensionTip}
            onMouseMove={showExtensionTip}
            onMouseLeave={() => setExtensionTip(null)}
            onClick={event => event.stopPropagation()}
            style={{
              left: extensionStyle.left,
              width: extensionStyle.width,
              background:
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.24) 0 6px, rgba(255,255,255,0.08) 6px 12px)',
              borderLeft: '2px solid rgba(255,255,255,0.55)',
              boxShadow: 'inset 0 0 0 9999px rgba(15,23,42,0.08)',
              zIndex: 2,
            }}
          />
        )}
        {pos.width > 30 && (
          <div
            className="relative z-[1] min-w-0 w-full select-none"
            style={{ padding: `${0} ${hasTutorConflict ? 18 : 8}px 0 ${coverageItems.length > 0 ? 24 : 8}px`, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}
          >
            <div className="min-w-0 flex-1" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: showStackedSessionProgress ? 2 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
            {/* Module name */}
            <span style={{ color: mod.tx, fontSize: '11px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {mod.lbl}
            </span>

            {/* Tutor/coach */}
            {showPerson && (
              <span
                title={`${personRole}: ${personLabel}`}
                style={{ color: mod.tx, fontSize: '9px', fontWeight: 700, opacity: 0.82, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 28, maxWidth: '46%', flexShrink: 1 }}
              >
                - {personLabel}
              </span>
            )}

              </div>
              {showStackedSessionProgress && (
                <span
                  title={`${sessionSummary.isFinished ? 'Finished module' : sessionSummary.total === 0 ? 'No sessions' : `Current session ${sessionSummary.number}/${sessionSummary.total}`} - ${sessionSummary.completed}/${sessionSummary.total} completed${sessionSummary.allAffected ? ` - ${sessionSummary.allAffected} holiday clash${sessionSummary.allAffected !== 1 ? 'es' : ''}` : ''} - ${sessionSummary.date}${coachLabel ? ` - Coach: ${coachLabel}` : ''}${tutorLabel ? ` - Tutor: ${tutorLabel}` : ''}`}
                  style={{
                    color: mod.tx,
                    fontSize: '9px',
                    fontWeight: 800,
                    opacity: 0.9,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {sessionProgressLabel}
                </span>
              )}
            </div>

            {/* Dates */}
            {pos.width > 180 && blk.startDate && displayEndDate && (
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
                {formatDateShort(blk.startDate)} → {formatDateShort(displayEndDate)}
              </span>
            )}

          </div>
        )}
        {sessionSummary.isFinished && pos.width > 112 && (
          <span
            className="absolute bottom-1 right-1 rounded px-1.5 py-px"
            title="Finished module"
            style={{
              background: 'rgba(255,255,255,0.92)',
              color: '#14532D',
              fontSize: '8px',
              fontWeight: 900,
              lineHeight: 1.15,
              boxShadow: '0 1px 2px rgba(15,23,42,0.18)',
            }}
          >
            Finished
          </span>
        )}
        {coverageMarkers.map(({ item, left }) => (
          <span
            key={`coverage-marker-${blk.id}-${item.sessionNumber}`}
            className="absolute -top-1 flex h-4 min-w-4 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm"
            onMouseEnter={showCoverageTip}
            onMouseMove={showCoverageTip}
            onMouseLeave={() => setBadgeTip(null)}
            onClick={event => event.stopPropagation()}
            style={{
              left,
              background: item.coverageTutor ? '#DCFCE7' : '#FEF3C7',
              borderColor: item.coverageTutor ? '#34D399' : '#F59E0B',
              color: item.coverageTutor ? '#047857' : '#92400E',
              boxShadow: item.coverageTutor
                ? '0 1px 4px rgba(4,120,87,0.22), 0 0 0 2px rgba(220,252,231,0.85)'
                : '0 1px 4px rgba(146,64,14,0.24), 0 0 0 2px rgba(254,243,199,0.9)',
              zIndex: 8,
            }}
          >
            <i className={item.coverageTutor ? 'ri-shield-check-line' : 'ri-shield-user-line'} style={{ fontSize: '11px', lineHeight: 1 }} />
          </span>
        ))}
        {hasTutorConflict && (
          <span className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
            {hasTutorConflict && (
              <span
                role="button"
                tabIndex={0}
                title="Fix tutor conflict"
                className="flex h-3 w-3 items-center justify-center rounded-sm shadow-sm"
                style={{ background: '#F7A800', color: '#1B2A4A' }}
                onClick={openConflictFix}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    openConflictFix(event);
                  }
                }}
                onMouseEnter={event => {
                  event.stopPropagation();
                  showBadgeTip(event, {
                    type: 'tutor',
                    title: 'Tutor conflict',
                    tone: { header: '#F7A800', border: '#F7A800', text: '#92400E' },
                    summary: `${tutorLabel || 'This tutor'} has another session at the same time.`,
                    rows: tutorConflictMarkers.map(marker => `${formatDateShort(marker.date)} - ${marker.modules.join(', ')} - ${marker.groups.join(', ')}`),
                  });
                }}
                onMouseMove={event => {
                  event.stopPropagation();
                  moveBadgeTip(event);
                }}
                onMouseLeave={() => setBadgeTip(null)}
              >
                <i className="ri-alert-line" style={{ fontSize: '9px', lineHeight: 1 }} />
              </span>
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div
        className="training-plan-gantt-toolbar sticky flex items-center gap-2 border-b border-gray-200 bg-white"
        style={{
          position: 'sticky',
          top: TOP_NAV_H,
          zIndex: 40,
          height: ZOOM_BAR_H,
          minHeight: ZOOM_BAR_H,
          padding: '0 16px',
          boxShadow: '0 12px 24px -22px rgba(15,23,42,0.6)',
        }}
      >
        <span className="shrink-0 text-xs font-extrabold uppercase text-slate-500" style={{ letterSpacing: '0.05em' }}>Zoom:</span>
        <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          {ZOOM_LEVELS.map(z => (
            <button key={z} onClick={() => handleZoomChange(z)}
              className="flex h-7 min-w-14 items-center justify-center rounded-md px-3 text-xs font-bold cursor-pointer transition-all whitespace-nowrap"
              style={{ background: zoom === z ? '#1B2A4A' : 'transparent', color: zoom === z ? '#fff' : '#64748B', boxShadow: zoom === z ? '0 1px 2px rgba(15,23,42,0.16)' : 'none' }}>
              {getZoomLabel(z)}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 ml-1">
          <button onClick={() => handleZoomChange(zoomOut(zoom))} disabled={zoom === 'year'}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 transition-all">
            <i className="ri-zoom-out-line text-sm" />
          </button>
          <button onClick={() => handleZoomChange(zoomIn(zoom))} disabled={zoom === 'day'}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-30 transition-all">
            <i className="ri-zoom-in-line text-sm" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {(zoom === 'week' || zoom === 'day') && (
            <button
              onClick={() => {
                setViewWindow(getDefaultViewWindow(zoom, groups, holidays));
              }}
              className="px-3 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer transition-all text-xs font-bold"
            >
              {zoom === 'week' ? 'This Week' : 'Today'}
            </button>
          )}
            <div ref={classesPopupRef} className="relative">
              <button
                type="button"
                onClick={() => setClassesOpen(prev => !prev)}
                className="px-3 h-8 flex items-center gap-1.5 justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer transition-all text-xs font-bold"
              >
                <i className="ri-group-line text-sm" />
                Classes
                <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-extrabold text-slate-500">{classSummaries.length}</span>
              </button>
              {classesOpen && (
                <div className="absolute left-0 top-9 z-50 w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
                    <div>
                      <p className="text-xs font-extrabold text-kbc-navy">Classes</p>
                      <p className="text-[11px] font-semibold text-gray-400">
                        {filteredClassSummaries.length} of {classSummaries.length} class{classSummaries.length === 1 ? '' : 'es'}
                      </p>
                    </div>
                    <button type="button" onClick={() => setClassesOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <i className="ri-close-line" />
                    </button>
                  </div>
                  <div className="border-b border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 focus-within:border-kbc-navy">
                      <i className="ri-search-line text-sm text-gray-400" />
                      <input
                        value={classSearch}
                        onChange={event => setClassSearch(event.target.value)}
                        placeholder="Search class, cohort, programme, module..."
                        className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-gray-700 outline-none placeholder:text-gray-400"
                      />
                      {classSearch && (
                        <button type="button" onClick={() => setClassSearch('')} className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <i className="ri-close-line text-xs" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[440px] overflow-y-auto px-2 py-1.5">
                    {classNavigationGroups.active.length ? classNavigationGroups.active.map(programme => {
                      const isProgrammeCollapsed = collapsedClassProgrammes.has(programme.programmeName);
                      return (
                      <div key={programme.programmeName} className="border-b border-gray-100 py-1 last:border-b-0">
                        <div className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
                          <button
                            type="button"
                            onClick={() => navigateToProgramme(programme.items)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: programme.color }} />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-extrabold text-kbc-navy">{programme.programmeName}</p>
                              <p className="text-[10px] font-bold text-gray-400">{programme.items.length} cohort{programme.items.length === 1 ? '' : 's'} · {programme.moduleCount} active module{programme.moduleCount === 1 ? '' : 's'}</p>
                            </div>
                          </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            {programme.issueCount > 0 && <span className="rounded-full bg-amber-50 px-1.5 py-px text-[9px] font-extrabold text-amber-700">{programme.issueCount}</span>}
                            <button
                              type="button"
                              onClick={() => toggleClassProgramme(programme.programmeName)}
                              title={isProgrammeCollapsed ? 'Show programme cohorts' : 'Hide programme cohorts'}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-kbc-navy"
                            >
                              <i className={isProgrammeCollapsed ? 'ri-arrow-down-s-line text-sm' : 'ri-arrow-up-s-line text-sm'} />
                            </button>
                          </div>
                        </div>
                        {!isProgrammeCollapsed && (
                        <div className="ml-3 space-y-1 border-l border-slate-200 py-1 pl-3">
                          {programme.items.map(item => {
                            const sortedModules = [...item.moduleBreakdown].sort((a, b) => b.clashCount - a.clashCount || Number(a.isFinished) - Number(b.isFinished) || a.label.localeCompare(b.label));
                            const visibleModules = sortedModules.slice(0, 4);
                            const isSelectedClass = lastClassSelection?.classKey === item.key && !lastClassSelection.moduleKey;
                            return (
                              <div
                                key={item.key}
                                data-class-selection-active={isSelectedClass ? 'true' : undefined}
                                className={`rounded-lg px-2 py-1.5 transition-all ${isSelectedClass ? 'bg-blue-50 ring-1 ring-kbc-navy/20' : 'hover:bg-slate-50'}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <button type="button" onClick={() => navigateToClass(item)} className="min-w-0 flex-1 text-left">
                                    <p className="truncate text-xs font-extrabold text-gray-800 hover:text-kbc-navy">{item.className}</p>
                                    <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-400">{item.cohortName}</p>
                                    {item.dateRange && <p className="mt-0.5 text-[10px] font-semibold text-gray-400">{item.dateRange}</p>}
                                    {isSelectedClass && <p className="mt-1 text-[9px] font-extrabold uppercase tracking-wide text-kbc-navy">Last selected</p>}
                                  </button>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-0.5">
                                    {item.holidayClashCount > 0 && <span title="Holiday clashes: sessions blocked by holiday weeks" className="rounded-full bg-red-50 px-1.5 py-px text-[9px] font-extrabold text-red-700">{item.holidayClashCount} H</span>}
                                    {item.replacementClashCount > 0 && <span title="Replacement clashes: replacement sessions also hit a holiday week" className="rounded-full bg-orange-50 px-1.5 py-px text-[9px] font-extrabold text-orange-700">{item.replacementClashCount} R</span>}
                                    {item.tutorConflictCount > 0 && <span title="Tutor conflicts: same tutor booked at the same time" className="rounded-full bg-violet-50 px-1.5 py-px text-[9px] font-extrabold text-violet-700">{item.tutorConflictCount} T</span>}
                                    <span title="Modules in this class" className="rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-extrabold text-slate-600">{item.moduleCount} M</span>
                                  </div>
                                </div>
                                {visibleModules.length > 0 && (
                                  <div className="ml-2 mt-1 space-y-0.5 border-l border-dashed border-slate-200 pl-2">
                                    {visibleModules.map((moduleItem, index) => {
                                      const moduleKey = `${moduleItem.label}|${moduleItem.targetDate}|${index}`;
                                      const isSelectedModule = lastClassSelection?.classKey === item.key && lastClassSelection.moduleKey === moduleKey;
                                      return (
                                        <button
                                          key={`${item.key}-${moduleItem.label}-${index}`}
                                          data-class-selection-active={isSelectedModule ? 'true' : undefined}
                                          type="button"
                                          onClick={() => navigateToClass(item, moduleItem.targetDate, moduleKey, moduleItem.blockId)}
                                          className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-all hover:bg-slate-50 ${isSelectedModule ? 'bg-kbc-navy/10 ring-1 ring-kbc-navy/20' : ''}`}
                                        >
                                          <div className="min-w-0">
                                            <p className="truncate text-[11px] font-extrabold text-gray-700">{moduleItem.label}</p>
                                            {moduleItem.dateRange && <p className="truncate text-[10px] font-semibold text-gray-400">{moduleItem.dateRange}</p>}
                                            {isSelectedModule && <p className="text-[9px] font-extrabold uppercase tracking-wide text-kbc-navy">Last selected</p>}
                                          </div>
                                          <div className="flex shrink-0 items-center gap-1">
                                            {moduleItem.holidayClashCount > 0 && <span title="Holiday clashes: sessions blocked by holiday weeks" className="rounded-full bg-red-100 px-1.5 py-px text-[9px] font-extrabold text-red-700">{moduleItem.holidayClashCount}H</span>}
                                            {moduleItem.replacementClashCount > 0 && <span title="Replacement clashes: replacement sessions also hit a holiday week" className="rounded-full bg-orange-100 px-1.5 py-px text-[9px] font-extrabold text-orange-700">{moduleItem.replacementClashCount}R</span>}
                                            {moduleItem.tutorConflictCount > 0 && <span title="Tutor conflicts: same tutor booked at the same time" className="rounded-full bg-violet-100 px-1.5 py-px text-[9px] font-extrabold text-violet-700">{moduleItem.tutorConflictCount}T</span>}
                                            {moduleItem.isFinished && <span title="Finished module: all planned sessions have been delivered" className="rounded-full bg-emerald-50 px-1.5 py-px text-[9px] font-extrabold text-emerald-700">Finished</span>}
                                            <i className="ri-arrow-right-s-line text-sm text-gray-400" />
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                    );}) : (
                      <p className="px-3 py-6 text-center text-xs font-semibold text-gray-400">No active matching classes.</p>
                    )}

                    {classNavigationGroups.completed.length > 0 && !classSearch && (
                      <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50">
                        <button
                          type="button"
                          onClick={() => setShowCompletedClasses(prev => !prev)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-extrabold text-gray-500"
                        >
                          <span>Completed classes</span>
                          <span className="flex items-center gap-1">
                            {classNavigationGroups.completed.length}
                            <i className={showCompletedClasses ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
                          </span>
                        </button>
                        {showCompletedClasses && (
                          <div className="space-y-1 border-t border-gray-100 p-2">
                            {classNavigationGroups.completed.map(item => (
                              <button
                                key={`completed-${item.key}`}
                                type="button"
                                onClick={() => navigateToClass(item)}
                                className="flex w-full items-center justify-between rounded-lg bg-white px-2.5 py-2 text-left hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-extrabold text-gray-600">{item.className}</p>
                                  <p className="truncate text-[10px] font-semibold text-gray-400">{item.programmeName} - {item.cohortName}</p>
                                </div>
                                <span title="Finished class: all modules are complete and no active issues remain" className="rounded-full bg-emerald-50 px-2 py-px text-[9px] font-extrabold text-emerald-700">Finished</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              disabled={exportExcelDisabled}
              className="px-3 h-8 flex items-center gap-1.5 justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-all text-xs font-bold"
              title="Export the full training plan table as Excel"
            >
              <i className="ri-file-excel-2-line text-sm" />
              Export
            </button>
          )}
          {(zoom === 'week' || zoom === 'day') && (
            <>
            <button
              onClick={() => {
                const days = zoom === 'week' ? 7 : 14;
                setViewWindow(prev => (
                  zoom === 'week'
                    ? getNormalizedWeekWindow(shiftDateByDays(prev.start, -7))
                    : { start: shiftDateByDays(prev.start, -days), end: shiftDateByDays(prev.end, -days) }
                ));
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 cursor-pointer transition-all">
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <span className="text-xs text-slate-500 font-bold px-2 whitespace-nowrap">
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
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 cursor-pointer transition-all">
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1"><span className="inline-block h-5 shrink-0 rounded-full" style={{ width: 5, backgroundImage: 'repeating-linear-gradient(to bottom, #F7A800 0 8px, transparent 8px 12px)', boxShadow: '0 0 0 2px rgba(255,255,255,0.95), 0 0 0 3px rgba(247,168,0,0.35)' }} />Now</span>
          <span className="flex items-center gap-1"><span className="inline-block shrink-0 rounded-sm" style={{ width: 12, height: 10, background: '#DBEAFE' }} />Workshop</span>
        </div>
      </div>

      <div
        className="sticky overflow-hidden"
        style={{
          top: TOP_NAV_H + ZOOM_BAR_H,
          zIndex: 39,
          background: '#FFFFFF',
          boxShadow: '0 8px 14px -14px rgba(15,23,42,0.45)',
        }}
      >
        <div
          ref={headerTrackRef}
          style={{
            width: totalWidth + leftW,
            transform: 'translate3d(0, 0, 0)',
            willChange: 'transform',
          }}
        >
          {renderHeaders()}
        </div>
      </div>

      {/* Scrollable gantt */}
      <div
        ref={scrollRef}
        className="training-plan-gantt-scroll"
        onWheel={handleTimelineWheel}
        onScroll={handleTimelineScroll}
        onPointerDown={handleTimelinePointerDown}
        onPointerMove={handleTimelinePointerMove}
        onPointerUp={endTimelinePan}
        onPointerCancel={endTimelinePan}
      >
        <div style={{ width: totalWidth + leftW }}>
        <div ref={timelineSurfaceRef} className="relative" style={{ width: totalWidth + leftW }}>
          {/* Full-height holiday bands — start below headers, span all rows */}
          {holidayPositions.map(({ h, pos }) => pos && (
            <div
              key={`band-${h.id}`}
              className="absolute bottom-0"
              style={{
                top: 0,
                left: leftW + pos.left,
                width: Math.max(pos.width, 4),
                background: h.color,
                opacity: 0.5,
                zIndex: 2,
                cursor: 'default',
              }}
              onMouseEnter={e => setHolidayTip({ h, x: e.clientX, y: e.clientY })}
              onMouseMove={e => setHolidayTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={() => setHolidayTip(null)}
            />
          ))}

          {isZoomedGrid && (
            <div
              className="absolute bottom-0 pointer-events-none"
              style={{
                left: leftW,
                right: 0,
                top: 0,
                ...getTimelineSurfaceStyle('#FFFFFF'),
              }}
            />
          )}

          {crossRowTutorConnectors.map(connector => (
            <div
              key={connector.key}
              className="absolute pointer-events-none"
              style={{
                left: connector.x,
                top: connector.top,
                height: Math.max(1, connector.bottom - connector.top),
                transform: 'translateX(-50%)',
                zIndex: 19,
              }}
            >
              <div
                className="h-full"
                style={{
                  borderLeft: `1.5px dashed ${connector.color}`,
                  opacity: 0.5,
                  mixBlendMode: 'multiply',
                }}
              />
              {connector.points.map((point, pointIndex) => (
                <span
                  key={`${connector.key}-${point.label}-${pointIndex}`}
                  className="pointer-events-auto absolute left-1/2 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-[3px] border-white shadow"
                  style={{
                    top: point.y - connector.top,
                    transform: 'translate(-50%, -50%)',
                    background: connector.color,
                    boxShadow: `0 0 0 1px rgba(15,23,42,0.45), 0 0 0 4px ${connector.color}33`,
                  }}
                  onMouseEnter={event => {
                    event.stopPropagation();
                    setTooltip(null);
                    setClashTip(null);
                    setBadgeTip(null);
                    setExtensionTip(null);
                    setTutorConflictTip({
                      labels: connector.labels,
                      tutor: connector.tutor,
                      date: connector.date,
                      color: connector.color,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  onMouseMove={event => {
                    event.stopPropagation();
                    setTutorConflictTip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
                  }}
                  onMouseLeave={event => {
                    event.stopPropagation();
                    setTutorConflictTip(null);
                  }}
                />
              ))}
            </div>
          ))}

          {groups.map((grp, gi) => {
            const isCollapsed = collapsedGroups.has(grp.id);
            const isGroupDragOver = dragOver?.type === 'group' && dragOver.groupIdx === gi;
            const isFocusedProgramme = focusedTimelineTarget?.groupIdx === gi && !focusedTimelineTarget.rowKey;
            return (
            <div
              key={grp.id}
              data-programme-target={gi}
              className="relative"
              onDragOver={canManageCohorts ? (e) => { if (dragItem.current?.type === 'group') handleDragOver(e, { type: 'group', groupIdx: gi }); } : undefined}
              onDragLeave={canManageCohorts ? handleDragLeave : undefined}
              onDrop={canManageCohorts ? (e) => handleGroupDrop(e, gi) : undefined}
              style={{
                ...(isGroupDragOver ? { outline: `2px dashed ${grp.color}`, outlineOffset: '-2px' } : {}),
                ...(isFocusedProgramme ? { boxShadow: 'inset 0 0 0 3px #DC2626, 0 0 0 2px rgba(220,38,38,0.12)' } : {}),
              }}
            >
              {/* ── Programme group header row ────────────────────────── */}
              <div className="flex" style={{ borderBottom: 'none', borderTop: 'none' }}>
                <div
                  className="shrink-0 px-3.5 py-2.5"
                  style={{
                    width: leftW,
                    background: grp.color,
                    position: 'sticky',
                    left: 0,
                    zIndex: 20,
                    cursor: canManageCohorts ? 'grab' : undefined,
                    boxShadow: isFocusedProgramme ? 'inset 0 0 0 2px #fff, inset 0 0 0 4px #DC2626' : undefined,
                  }}
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
                  <div className="mt-2.5 flex items-center justify-between gap-2.5 min-w-0">
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
                      style={{ left: nowPos.left, zIndex: NOW_LINE_Z_INDEX, ...NOW_LINE_STYLE }} />
                  )}
                </div>
              </div>

              {/* ── Cohort rows ──────────────────────────────────────── */}
              {!isCollapsed && grp.rows.map((row, ri) => {
                const group = extractGroup(row.label);
                const rowColor = row.color || grp.color;
                const tunnelBg = `${grp.color}0D`;
                const selectedHolidayIds = new Set(row.holidayIds || []);
                const rowHolidays = holidays.filter(holiday => selectedHolidayIds.has(holiday.id));
                const ganttRows = buildGanttRows(row.blks, rowHolidays);
                const totalModuleH = ganttRows.reduce((s, r) => s + rowHeight(r), 0);
                const rowTargetKey = `${gi}-${ri}`;
                const barPad = 5;
                const moduleLayouts = (() => {
                  const layouts: { blk: ModuleBlock; top: number; height: number; centerY: number }[] = [];
                  let offsetY = 0;
                  for (const ganttRow of ganttRows) {
                    const h = rowHeight(ganttRow);
                    for (const { blk, lane } of ganttRow.lanes) {
                      const laneH = ganttRow.laneCount === 2 ? LANE_H : MODULE_H;
                      const laneTop = offsetY + lane * LANE_H;
                      const top = laneTop + barPad;
                      const height = laneH - barPad * 2;
                      layouts.push({ blk, top, height, centerY: top + height / 2 });
                    }
                    offsetY += h;
                  }
                  return layouts;
                })();
                const moduleLayoutById = new Map(moduleLayouts.map(layout => [layout.blk.id, layout]));
                const tutorConflictConnectors = (() => {
                  const tutorSessions: { blk: ModuleBlock; date: string; startTime: string; endTime: string; tutor: string }[] = [];
                  row.blks.forEach(blk => {
                    const sessionSummary = getCurrentSessionSummary(blk, customModules, catalogModules, rowHolidays);
                    if (sessionSummary.isFinished) return;
                    const tutors = splitPeople(blk.tutor || '').map(tutor => tutor.toLowerCase());
                    if (!tutors.length) return;
                    const plan = buildHolidayAdjustedSessionPlan(blk, rowHolidays);
                    plan.sessions.filter(session => !session.isClash).forEach(session => {
                      const startTime = blk.sessionStartTime || '09:00';
                      const endTime = blk.sessionEndTime || '11:00';
                      if (hasSessionEnded(session.date, endTime, new Date())) return;
                      tutors.forEach(tutor => {
                        tutorSessions.push({ blk, date: session.date, startTime, endTime, tutor });
                      });
                    });
                  });

                  const connectors: {
                    key: string;
                    x: number;
                    top: number;
                    bottom: number;
                    labels: string[];
                    date: string;
                    tutor: string;
                    color: string;
                    points: { y: number; label: string }[];
                  }[] = [];
                  const seenConnectors = new Set<string>();

                  for (let i = 0; i < tutorSessions.length; i += 1) {
                    for (let j = i + 1; j < tutorSessions.length; j += 1) {
                      const a = tutorSessions[i];
                      const b = tutorSessions[j];
                      if (a.blk.id === b.blk.id) continue;
                      if (a.date !== b.date || a.tutor !== b.tutor) continue;
                      if (!timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
                      const [firstId, secondId] = [a.blk.id, b.blk.id].sort();
                      const connectorKey = `${a.tutor}|${firstId}|${secondId}`;
                      if (seenConnectors.has(connectorKey)) continue;
                      seenConnectors.add(connectorKey);
                      const datePos = getBlockPosition(a.date, a.date, cols);
                      if (!datePos) continue;
                      const points = [a, b]
                        .map(entry => {
                          const layout = moduleLayoutById.get(entry.blk.id);
                          return layout ? { y: layout.centerY, label: getBlockDisplayName(entry.blk, customModules) } : null;
                        })
                        .filter((point): point is { y: number; label: string } => Boolean(point));
                      if (points.length < 2) continue;
                      const ys = points.map(point => point.y);
                      connectors.push({
                        key: `${rowTargetKey}-tutor-conflict-${connectorKey}`,
                        x: datePos.left + Math.max(2, datePos.width) / 2,
                        top: Math.min(...ys),
                        bottom: Math.max(...ys),
                        labels: points.map(point => point.label),
                        date: a.date,
                        tutor: a.tutor,
                        color: tutorConflictColorMap.get(connectorKey) || tutorConflictColor(connectorKey),
                        points,
                      });
                    }
                  }

                  return connectors;
                })();

                const isCohortDragOver = dragOver?.type === 'cohort' && dragOver.groupIdx === gi && dragOver.rowIdx === ri;
                const isFocusedCohort = focusedTimelineTarget?.rowKey === rowTargetKey && !focusedTimelineTarget.blockId;

                return (
                  <div
                    key={row.id}
                    data-row-target={rowTargetKey}
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
                      <div
                        className="shrink-0 flex items-center px-3 border-r bg-white relative"
                        style={{
                          width: leftW,
                          borderColor: isFocusedCohort ? '#DC2626' : '#E5E7EB',
                          position: 'sticky',
                          left: 0,
                          zIndex: 20,
                          boxShadow: isFocusedCohort ? 'inset 0 0 0 2px #DC2626, 0 0 0 2px rgba(220,38,38,0.10)' : undefined,
                        }}
                      >
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
                            style={{ left: nowPos.left, zIndex: NOW_LINE_Z_INDEX, ...NOW_LINE_STYLE }} />
                        )}
                      </div>
                    </div>

                    {/* Module rows */}
                    <div className="flex relative" style={{ height: totalModuleH || MODULE_H, borderBottom: `1px solid ${rowColor}${emphasizeCohortBounds ? '2A' : '14'}` }}>
                      {/* Left panel: stacked module entries */}
                      <div className="shrink-0 border-r bg-white relative" style={{ width: leftW, borderColor: '#E5E7EB', position: 'sticky', left: 0, zIndex: 20 }}>
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
                        {moduleLayouts.map(layout => renderBar(
                          layout.blk,
                          row.label,
                          rowColor,
                          grp,
                          gi,
                          ri,
                          rowHolidays,
                          layout.top,
                          layout.height,
                        ))}

                        {/* Tutor conflict connectors */}
                        {tutorConflictConnectors.map(connector => (
                          <div
                            key={connector.key}
                            className="absolute pointer-events-none"
                            style={{
                              left: connector.x,
                              top: connector.top,
                              height: Math.max(1, connector.bottom - connector.top),
                              transform: 'translateX(-50%)',
                              zIndex: 18,
                            }}
                          >
                            <div
                              className="h-full"
                              style={{
                                borderLeft: `1.5px dashed ${connector.color}`,
                                opacity: 0.5,
                                mixBlendMode: 'multiply',
                              }}
                            />
                            {connector.points.map((point, pointIndex) => (
                              <span
                                key={`${connector.key}-${point.label}-${pointIndex}`}
                                className="pointer-events-auto absolute left-1/2 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-[3px] border-white shadow"
                                style={{
                                  top: point.y - connector.top,
                                  transform: 'translate(-50%, -50%)',
                                  background: connector.color,
                                  boxShadow: `0 0 0 1px rgba(15,23,42,0.45), 0 0 0 4px ${connector.color}33`,
                                }}
                                onMouseEnter={event => {
                                  event.stopPropagation();
                                  setTooltip(null);
                                  setClashTip(null);
                                  setBadgeTip(null);
                                  setExtensionTip(null);
                                  setTutorConflictTip({
                                    labels: connector.labels,
                                    tutor: connector.tutor,
                                    date: connector.date,
                                    color: connector.color,
                                    x: event.clientX,
                                    y: event.clientY,
                                  });
                                }}
                                onMouseMove={event => {
                                  event.stopPropagation();
                                  setTutorConflictTip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
                                }}
                                onMouseLeave={event => {
                                  event.stopPropagation();
                                  setTutorConflictTip(null);
                                }}
                              />
                            ))}
                          </div>
                        ))}

                        {/* Now line — rendered last so it appears above module bars */}
                        {nowPos && (
                          <div className="absolute top-0 bottom-0 pointer-events-none"
                            style={{ left: nowPos.left, zIndex: NOW_LINE_Z_INDEX, ...NOW_LINE_STYLE }}>
                            {gi === 0 && ri === 0 && (
                              <div className="absolute -top-px left-0" style={{ transform: 'translateX(-50%)' }}>
                                <span className="font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm ring-2 ring-white"
                                  style={{ fontSize: '8px', background: '#F7A800', color: '#1B2A4A', display: 'block' }}>NOW</span>
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
                  <div className="shrink-0 flex items-center justify-center border-r border-gray-200 bg-white" style={{ width: leftW, height: MODULE_H, position: 'sticky', left: 0, zIndex: 20 }}>
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
      </div>

      {tooltip && <ModuleTooltip data={tooltip} onClose={() => setTooltip(null)} />}
      {clashTip && <ClashTooltip marker={clashTip.marker} x={clashTip.x} y={clashTip.y} />}
      {badgeTip && <BadgeTooltip data={badgeTip} />}
      {extensionTip && <ExtensionTooltip data={extensionTip} />}
      {tutorConflictTip && <TutorConflictTooltip data={tutorConflictTip} />}

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
            <div className="grid gap-3 bg-gray-50 p-4 md:grid-cols-3">
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

              <button
                type="button"
                onClick={() => {
                  const target = editChoice;
                  if (!onViewMonthlyBreakdown) return;
                  onViewMonthlyBreakdown(target.groupIdx, target.rowIdx, target.blk.id);
                }}
                disabled={!onViewMonthlyBreakdown}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-kbc-navy hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:shadow-none"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <i className="ri-calendar-check-line" />
                </span>
                <span className="mt-3 block text-sm font-extrabold text-kbc-navy">Monthly Module Breakdown</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500">
                  View monthly sessions, holiday clashes, tutors, coaches, and session totals.
                </span>
                <span className="mt-3 block text-xs font-semibold text-gray-400">
                  {formatDateShort(editChoice.blk.startDate)} to {formatDateShort(editChoice.blk.endDate)}
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
