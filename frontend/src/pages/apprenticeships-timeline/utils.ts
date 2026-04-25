import type { Holiday, ModuleBlock, ZoomLevel } from './types';

// ── Date helpers ──────────────────────────────────────────────────────────
export const TIMELINE_START = new Date('2025-01-01');
export const TIMELINE_END   = new Date('2027-07-31');
export const TOTAL_DAYS     = Math.ceil((TIMELINE_END.getTime() - TIMELINE_START.getTime()) / 86400000);

export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateToOffset(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.max(0, Math.ceil((d.getTime() - TIMELINE_START.getTime()) / 86400000));
}

export function offsetToDate(offset: number): Date {
  return new Date(TIMELINE_START.getTime() + offset * 86400000);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function isoToDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function durationDays(startDate: string, endDate: string): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return Math.ceil((e.getTime() - s.getTime()) / 86400000);
}

export function durationWeeks(startDate: string, endDate: string): number {
  return Math.floor((durationDays(startDate, endDate) + 1) / 7);
}

const WEEKDAY_JS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

// Count how many times any of the given weekdays falls within [startDate, endDate].
// When days is empty/undefined falls back to plain durationWeeks.
export function durationWeeksByDay(
  startDate: string,
  endDate: string,
  days?: string[],
): number {
  if (!days?.length) return durationWeeks(startDate, endDate);
  const targets = new Set(days.map(d => WEEKDAY_JS[d.toLowerCase()]).filter(n => n !== undefined));
  if (!targets.size) return durationWeeks(startDate, endDate);

  const start = new Date(startDate);
  const end   = new Date(endDate);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (targets.has(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ── Overlap detection ─────────────────────────────────────────────────────
export function rangesOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as <= be && ae >= bs;
}

export function getHolidayOverlaps(blk: ModuleBlock, holidays: Holiday[]): Holiday[] {
  return holidays.filter(h => rangesOverlap(blk.startDate, blk.endDate, h.startDate, h.endDate));
}

// ── Zoom level helpers ────────────────────────────────────────────────────
export function getZoomLabel(zoom: ZoomLevel): string {
  const map: Record<ZoomLevel, string> = {
    year: 'Year', intake: 'Intake', month: 'Month', week: 'Week', day: 'Day',
  };
  return map[zoom];
}

export const ZOOM_LEVELS: ZoomLevel[] = ['year', 'intake', 'month', 'week', 'day'];

export function zoomIn(current: ZoomLevel): ZoomLevel {
  const idx = ZOOM_LEVELS.indexOf(current);
  return idx < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[idx + 1] : current;
}

export function zoomOut(current: ZoomLevel): ZoomLevel {
  const idx = ZOOM_LEVELS.indexOf(current);
  return idx > 0 ? ZOOM_LEVELS[idx - 1] : current;
}

// ── Timeline column generation ────────────────────────────────────────────
export interface TimelineColumn {
  key: string;
  label: string;
  subLabel?: string;
  startDate: string;
  endDate: string;
  widthPx: number;
  isHighlighted?: boolean;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

export function generateColumns(zoom: ZoomLevel, viewStart: Date, viewEnd: Date): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  const viewEndIso = toLocalIsoDate(viewEnd);

  if (zoom === 'year') {
    const startYear = viewStart.getFullYear();
    const endYear   = viewEnd.getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      const s = new Date(y, 0, 1);
      const e = new Date(y, 11, 31);
      const clampS = s < viewStart ? viewStart : s;
      const clampE = e > viewEnd   ? viewEnd   : e;
      const days = Math.ceil((clampE.getTime() - clampS.getTime()) / 86400000) + 1;
      cols.push({ key: `y${y}`, label: String(y), startDate: toLocalIsoDate(clampS), endDate: toLocalIsoDate(clampE), widthPx: days * 1.15 });
    }
  } else if (zoom === 'intake') {
    // Intake = ~4 months, 3 intakes per year
    const intakeDefs = [
      { label: 'Intake 1', months: [0,1,2,3] },
      { label: 'Intake 2', months: [4,5,6,7] },
      { label: 'Intake 3', months: [8,9,10,11] },
    ];
    const startYear = viewStart.getFullYear();
    const endYear   = viewEnd.getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      intakeDefs.forEach((intake, ii) => {
        const s = new Date(y, intake.months[0], 1);
        const lastM = intake.months[intake.months.length - 1];
        const e = new Date(y, lastM + 1, 0);
        if (e < viewStart || s > viewEnd) return;
        const clampS = s < viewStart ? viewStart : s;
        const clampE = e > viewEnd   ? viewEnd   : e;
        const days = Math.ceil((clampE.getTime() - clampS.getTime()) / 86400000) + 1;
        cols.push({ key: `i${y}-${ii}`, label: `${y} ${intake.label}`, subLabel: `${MONTH_NAMES[intake.months[0]]}–${MONTH_NAMES[lastM]}`, startDate: clampS.toISOString().slice(0,10), endDate: clampE.toISOString().slice(0,10), widthPx: days * 1.2 });
      });
    }
  } else if (zoom === 'month') {
    let cur = new Date(viewStart.getFullYear(), viewStart.getMonth(), 1);
    while (cur <= viewEnd) {
      const s = cur;
      const e = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const clampS = s < viewStart ? viewStart : s;
      const clampE = e > viewEnd   ? viewEnd   : e;
      const days = Math.ceil((clampE.getTime() - clampS.getTime()) / 86400000) + 1;
      cols.push({ key: `m${cur.getFullYear()}-${cur.getMonth()}`, label: MONTH_NAMES[cur.getMonth()], subLabel: String(cur.getFullYear()), startDate: clampS.toISOString().slice(0,10), endDate: clampE.toISOString().slice(0,10), widthPx: Math.max(days * 2.8, 28) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  } else if (zoom === 'week') {
    let cur = new Date(viewStart);
    while (toLocalIsoDate(cur) <= viewEndIso) {
      const iso = toLocalIsoDate(cur);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      cols.push({
        key: `wday${iso}`,
        label: String(cur.getDate()),
        subLabel: dayNames[cur.getDay()],
        startDate: iso,
        endDate: iso,
        widthPx: 160,
        isHighlighted: cur.getDay() === 0,
      });
      cur = addDays(cur, 1);
    }
  } else {
    // day
    let cur = new Date(viewStart);
    while (toLocalIsoDate(cur) <= viewEndIso) {
      const iso = toLocalIsoDate(cur);
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
      cols.push({ key: `d${iso}`, label: String(cur.getDate()), subLabel: dayNames[cur.getDay()], startDate: iso, endDate: iso, widthPx: 32, isHighlighted: isWeekend });
      cur = addDays(cur, 1);
    }
  }

  return cols;
}

// ── Position helpers ──────────────────────────────────────────────────────
export function getBlockPosition(
  startDate: string,
  endDate: string,
  cols: TimelineColumn[],
): { left: number; width: number } | null {
  if (!cols.length) return null;
  const totalWidth = cols.reduce((s, c) => s + c.widthPx, 0);
  const viewStart  = new Date(cols[0].startDate);
  const viewEnd    = new Date(cols[cols.length - 1].endDate);
  const blockStart = new Date(startDate);
  const blockEnd   = new Date(endDate);

  if (blockEnd < viewStart || blockStart > viewEnd) return null;

  const clampStart = blockStart < viewStart ? viewStart : blockStart;
  const clampEnd   = blockEnd   > viewEnd   ? viewEnd   : blockEnd;

  const viewDays  = Math.ceil((viewEnd.getTime()   - viewStart.getTime())  / 86400000) + 1;
  const startOff  = Math.ceil((clampStart.getTime() - viewStart.getTime()) / 86400000);
  const endOff    = Math.ceil((clampEnd.getTime()   - viewStart.getTime()) / 86400000);

  const left  = (startOff / viewDays) * totalWidth;
  const width = Math.max(((endOff - startOff + 1) / viewDays) * totalWidth, 4);

  return { left, width };
}

export function getTotalWidth(cols: TimelineColumn[]): number {
  return cols.reduce((s, c) => s + c.widthPx, 0);
}
