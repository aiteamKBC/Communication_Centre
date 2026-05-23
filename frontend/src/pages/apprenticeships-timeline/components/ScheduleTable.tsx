import { Fragment, useCallback, useRef, useState } from 'react';
import type { CatalogModule, ModuleBlock, ProgrammeGroup, WeekDayKey } from '../types';
import { getModuleMeta } from '../data';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface SessionCell {
  trainer: string;
  coach: string;
  time: string;
}

interface SessionInstance {
  number: number;
  date: string;
  title: string;
  description?: string;
  hasRealName: boolean;
  status: 'completed' | 'current' | 'upcoming';
}

interface TutorSessionOccurrence {
  blockId: string;
  date: string;
  module: string;
  programme: string;
  cohort: string;
  groupName?: string;
  tutor: string;
  coach: string;
  time: string;
  startTime: string;
  endTime: string;
  conflictTime?: string;
}

interface CurrentTutorModule {
  blockId: string;
  module: string;
  programme: string;
  cohort: string;
  groupName?: string;
  coach: string;
  startDate: string;
  endDate: string;
  time: string;
  completedSessions: number;
  totalSessions: number;
}

interface NextModuleInfo {
  name: string;
  isScheduledBlock: boolean;
  tutor: string;
  coach: string;
  startDate: string;
  endDate: string;
  sessions: number;
  currentTutorModules: CurrentTutorModule[];
  otherTutorSessions: TutorSessionOccurrence[];
}

interface DerivedScheduleRow {
  groupIdx: number;
  rowIdx: number;
  blockId: string;
  cohort: string;
  cohortColor: string;
  programme: string;
  programmeColor: string;
  module: string;
  groupName?: string;
  sessionTitle: string;
  sessionDescription?: string;
  hasRealSessionName: boolean;
  missingSessionNameReason?: string;
  sessionDate: string;
  currentSessionNumber: number;
  completedSessions: number;
  totalSessions: number;
  sessionInstances: SessionInstance[];
  saturday?: SessionCell;
  monday?: SessionCell;
  tuesday?: SessionCell;
  wednesday?: SessionCell;
  thursday?: SessionCell;
  friday?: SessionCell;
  nextModule: string;
  nextModuleInfo?: NextModuleInfo;
  rowHighlight?: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

interface ProgrammeSection {
  programme: string;
  programmeColor: string;
  rows: DerivedScheduleRow[];
}

interface Props {
  groups: ProgrammeGroup[];
  catalogModules?: CatalogModule[];
  canEdit?: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
}

type DayKey = WeekDayKey;

const TOP_NAV_H = 56;
const TABLE_COLUMNS = [
  110, // Programme
  120, // Cohort
  160, // Module
  190, // Module dates
  220, // Current session
  130, // Progress
  140, // Saturday
  140, // Monday
  140, // Tuesday
  140, // Wednesday
  140, // Thursday
  140, // Friday
  180, // Next module
] as const;
const TABLE_MIN_WIDTH = TABLE_COLUMNS.reduce((sum, width) => sum + width, 0);

const isFinishedRow = (row: Pick<DerivedScheduleRow, 'completedSessions' | 'totalSessions'>) =>
  row.totalSessions > 0 && row.completedSessions >= row.totalSessions;

const JS_DAY_TO_KEY: Record<number, DayKey> = {
  0: 'monday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const DAY_COLS: { key: DayKey; label: string; cellBg: string; headerBg: string; headerTx: string }[] = [
  { key: 'saturday', label: 'SATURDAY', cellBg: '#EEF2FB', headerBg: '#1B2A4A', headerTx: '#fff' },
  { key: 'monday', label: 'MONDAY', cellBg: '#EDF1FA', headerBg: '#243560', headerTx: '#fff' },
  { key: 'tuesday', label: 'TUESDAY', cellBg: '#EBF0F8', headerBg: '#2E4482', headerTx: '#fff' },
  { key: 'wednesday', label: 'WEDNESDAY', cellBg: '#E9EFF7', headerBg: '#3D5A99', headerTx: '#fff' },
  { key: 'thursday', label: 'THURSDAY', cellBg: '#FFF8E0', headerBg: '#F7A800', headerTx: '#1B2A4A' },
  { key: 'friday', label: 'FRIDAY', cellBg: '#FFF3CC', headerBg: '#C49A00', headerTx: '#fff' },
];

function parseLocalIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferDayFromIsoDate(isoDate: string): DayKey {
  const d = parseLocalIsoDate(isoDate);
  if (Number.isNaN(d.getTime())) {
    return 'monday';
  }
  return JS_DAY_TO_KEY[d.getDay()] || 'monday';
}

function formatDisplayDate(isoDate: string): string {
  const d = parseLocalIsoDate(isoDate);
  if (Number.isNaN(d.getTime())) {
    return isoDate;
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function programmeLabelFromGroupName(groupName: string): string {
  const levelMatch = groupName.match(/L\d+/);
  const codeMatch = groupName.match(/\(([^)]+)\)/);

  const level = levelMatch?.[0] || '';
  const code = codeMatch?.[1] || groupName.split('\n')[0];

  return `${code} ${level}`.trim();
}

function formatMeridiemTime(time24: string): string {
  const [hRaw, mRaw] = time24.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return time24;
  }

  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minute = m.toString().padStart(2, '0');
  return `${hour12}:${minute} ${suffix}`;
}

function formatTimeRange(start: string, end: string): string {
  return `${formatMeridiemTime(start)} - ${formatMeridiemTime(end)}`;
}

function timeToMinutes(time24: string): number | null {
  const [hRaw, mRaw] = time24.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return null;
  }
  return h * 60 + m;
}

function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) {
    return false;
  }
  return as < be && ae > bs;
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

function formatCompactIsoDate(isoDate: string): string {
  const d = parseLocalIsoDate(isoDate);
  if (Number.isNaN(d.getTime())) {
    return isoDate;
  }

  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSessionDates(blk: ModuleBlock): string[] {
  const total = Math.max(1, blk.sessions || 1);
  const start = parseLocalIsoDate(blk.startDate);
  const end = parseLocalIsoDate(blk.endDate || blk.startDate);
  const weekdays = blk.days?.length ? blk.days : [inferDayFromIsoDate(blk.startDate)];
  const dates: string[] = [];

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [blk.startDate].filter(Boolean);
  }

  const cursor = new Date(start);
  while (cursor <= end && dates.length < total) {
    const dayKey = JS_DAY_TO_KEY[cursor.getDay()];
    if (weekdays.includes(dayKey)) {
      dates.push(toIsoDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates.length ? dates : [blk.startDate];
}

function buildTutorSessionOccurrences(groups: ProgrammeGroup[]): TutorSessionOccurrence[] {
  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.flatMap(block => {
        const tutor = block.tutor?.trim();
        if (!tutor) return [];

        const module = getModuleMeta(block.mod).lbl;
        const programme = programmeLabelFromGroupName(group.name);
        const startTime = block.sessionStartTime || '09:00';
        const endTime = block.sessionEndTime || '11:00';
        const time = formatTimeRange(startTime, endTime);
        const coach = block.coachName?.trim() || 'TBD';
        const groupName = (block.groupName || row.label || '').trim();

        return getSessionDates(block).map(date => ({
          blockId: block.id,
          date,
          module,
          programme,
          cohort: row.label,
          groupName: groupName || undefined,
          tutor,
          coach,
          time,
          startTime,
          endTime,
        }));
      }),
    ),
  );
}

function getTutorTimeConflicts(
  nextBlock: ModuleBlock,
  nextTutor: string,
  tutorSessions: TutorSessionOccurrence[],
): TutorSessionOccurrence[] {
  const normalizedTutor = normalizePersonName(nextTutor);
  const nextStartTime = nextBlock.sessionStartTime || '09:00';
  const nextEndTime = nextBlock.sessionEndTime || '11:00';
  const nextTime = formatTimeRange(nextStartTime, nextEndTime);
  const nextSessionDates = new Set(getSessionDates(nextBlock));

  return tutorSessions
    .filter(item =>
      normalizePersonName(item.tutor) === normalizedTutor &&
      item.blockId !== nextBlock.id &&
      nextSessionDates.has(item.date) &&
      timeRangesOverlap(nextStartTime, nextEndTime, item.startTime, item.endTime),
    )
    .map(item => ({
      ...item,
      conflictTime: nextTime,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function getCurrentTutorModules(
  groups: ProgrammeGroup[],
  tutor: string,
  catalogModules: CatalogModule[],
  now: Date,
  excludeBlockId?: string,
): CurrentTutorModule[] {
  const normalizedTutor = normalizePersonName(tutor);
  if (!normalizedTutor) {
    return [];
  }

  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.flatMap(block => {
        if (block.id === excludeBlockId || normalizePersonName(block.tutor || '') !== normalizedTutor) {
          return [];
        }

        const startTs = parseLocalIsoDate(block.startDate).getTime();
        const endTs = parseLocalDateTime(block.endDate, block.sessionEndTime || '11:00').getTime();
        if (Number.isNaN(startTs) || Number.isNaN(endTs) || now.getTime() < startTs || now.getTime() > endTs) {
          return [];
        }

        const module = getModuleMeta(block.mod).lbl;
        const progress = getSessionProgress(block, module, catalogModules);

        return [{
          blockId: block.id,
          module,
          programme: programmeLabelFromGroupName(group.name),
          cohort: row.label,
          groupName: (block.groupName || row.label || '').trim() || undefined,
          coach: block.coachName?.trim() || 'TBD',
          startDate: block.startDate,
          endDate: block.endDate,
          time: formatTimeRange(block.sessionStartTime || '09:00', block.sessionEndTime || '11:00'),
          completedSessions: progress.completedSessions,
          totalSessions: progress.totalSessions,
        }];
      }),
    ),
  ).sort((a, b) => a.endDate.localeCompare(b.endDate) || a.module.localeCompare(b.module));
}

function resolveCatalogModule(moduleName: string, moduleValue: unknown, catalogModules: CatalogModule[]): CatalogModule | undefined {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizedName = normalize(moduleName);
  const normalizedValue = normalize(String(moduleValue || ''));
  return catalogModules.find(module => {
    const catalogName = normalize(module.name);
    return catalogName === normalizedName || catalogName === normalizedValue || String(module.id) === String(moduleValue || '').trim();
  });
}

function getSessionProgress(blk: ModuleBlock, moduleName: string, catalogModules: CatalogModule[]) {
  const now = new Date();
  const endTime = blk.sessionEndTime || '11:00';
  const totalSessions = Math.max(1, blk.sessions || 1);
  const sessionDates = getSessionDates(blk);
  const completedSessions = Math.min(totalSessions, sessionDates.filter(date => hasSessionEnded(date, endTime, now)).length);
  const isFinished = totalSessions > 0 && completedSessions >= totalSessions;
  const nextIndex = sessionDates.findIndex(date => !hasSessionEnded(date, endTime, now));
  const sessionIndex = nextIndex >= 0 ? nextIndex : Math.min(completedSessions, totalSessions - 1);
  const currentSessionNumber = Math.min(totalSessions, Math.max(1, sessionIndex + 1));
  const catalogModule = resolveCatalogModule(moduleName, blk.mod, catalogModules);
  const savedSessionName = catalogModule?.sessionNames?.[currentSessionNumber - 1]?.trim() || '';
  const hasRealSessionName = Boolean(savedSessionName);
  const sessionInstances = Array.from({ length: totalSessions }, (_, i): SessionInstance => {
    const number = i + 1;
    const date = sessionDates[i] || sessionDates[sessionDates.length - 1] || blk.startDate;
    const title = catalogModule?.sessionNames?.[i]?.trim() || `Session ${number}`;
    const ended = hasSessionEnded(date, endTime, now);
    return {
      number,
      date,
      title,
      description: catalogModule?.sessionDescriptions?.[i]?.trim() || undefined,
      hasRealName: Boolean(catalogModule?.sessionNames?.[i]?.trim()),
      status: ended ? 'completed' : number === currentSessionNumber ? 'current' : 'upcoming',
    };
  });

  return {
    sessionTitle: savedSessionName || `Session ${currentSessionNumber}`,
    sessionDescription: catalogModule?.sessionDescriptions?.[currentSessionNumber - 1]?.trim() || undefined,
    hasRealSessionName,
    missingSessionNameReason: hasRealSessionName
      ? undefined
      : catalogModule
        ? `No saved name for session ${currentSessionNumber} in the module catalogue.`
        : `No matching catalogue module found for "${moduleName}".`,
    sessionDate: sessionDates[sessionIndex] || blk.startDate,
    currentSessionNumber,
    completedSessions,
    totalSessions,
    sessionInstances,
  };
}

function toDerivedRows(groups: ProgrammeGroup[], catalogModules: CatalogModule[]): DerivedScheduleRow[] {
  const now = new Date();
  const tutorSessions = buildTutorSessionOccurrences(groups);

  return groups
    .flatMap((group, groupIdx) =>
      group.rows.flatMap((row, rowIdx) =>
        row.blks.map((blk, idx) => {
          const moduleName = getModuleMeta(blk.mod).lbl;
          const sessionProgress = getSessionProgress(blk, moduleName, catalogModules);
          const groupName = (blk.groupName || row.label || '').trim();
          const nextBlock = row.blks[idx + 1];
          const nextModule = nextBlock ? getModuleMeta(nextBlock.mod).lbl : 'EPA';
          const nextTutor = nextBlock?.tutor?.trim() || '';
          const nextModuleInfo: NextModuleInfo = nextBlock
            ? {
              name: nextModule,
              isScheduledBlock: true,
              tutor: nextTutor,
              coach: nextBlock.coachName?.trim() || 'TBD',
              startDate: nextBlock.startDate,
              endDate: nextBlock.endDate,
              sessions: nextBlock.sessions,
              currentTutorModules: nextTutor
                ? getCurrentTutorModules(groups, nextTutor, catalogModules, now, nextBlock.id)
                : [],
              otherTutorSessions: nextTutor
                ? getTutorTimeConflicts(nextBlock, nextTutor, tutorSessions)
                : [],
            }
            : {
              name: 'EPA',
              isScheduledBlock: false,
              tutor: '',
              coach: '',
              startDate: '',
              endDate: '',
              sessions: 0,
              currentTutorModules: [],
              otherTutorSessions: [],
            };
          const weekdays = blk.days?.length ? blk.days : [inferDayFromIsoDate(blk.startDate)];
          const trainer = blk.tutor?.trim() || 'TBD';
          const coach = blk.coachName?.trim() || 'TBD';
          const startTime = blk.sessionStartTime || '09:00';
          const endTime = blk.sessionEndTime || '11:00';
          const cell: SessionCell = { trainer, coach, time: formatTimeRange(startTime, endTime) };

          const startTs = parseLocalIsoDate(blk.startDate).getTime();
          const endTs = parseLocalDateTime(blk.endDate, endTime).getTime();
          const isCurrent = !Number.isNaN(startTs) && !Number.isNaN(endTs) && now.getTime() >= startTs && now.getTime() <= endTs;

          const base: DerivedScheduleRow = {
            groupIdx,
            rowIdx,
            blockId: blk.id,
            cohort: `${formatCompactIsoDate(blk.startDate)} → ${formatCompactIsoDate(blk.endDate)}`,
            cohortColor: row.color || group.color,
            programme: programmeLabelFromGroupName(group.name),
            programmeColor: group.color,
            module: moduleName,
            groupName: groupName || undefined,
            ...sessionProgress,
            nextModule,
            nextModuleInfo,
            rowHighlight: isCurrent ? '#FFFBEB' : `${(row.color || group.color)}0D`,
            startDate: blk.startDate,
            endDate: blk.endDate,
            isCurrent,
          };

          weekdays.forEach(day => {
            base[day] = cell;
          });

          return base;
        }),
      ),
    )
    .filter(r => r.isCurrent)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function toProgrammeSections(rows: DerivedScheduleRow[]): ProgrammeSection[] {
  const sectionsMap = new Map<string, ProgrammeSection>();

  rows.forEach(row => {
    const existing = sectionsMap.get(row.programme);
    if (existing) {
      existing.rows.push(row);
      return;
    }

    sectionsMap.set(row.programme, {
      programme: row.programme,
      programmeColor: row.programmeColor,
      rows: [row],
    });
  });

  const sections = Array.from(sectionsMap.values());
  sections.forEach(section => {
    section.rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
  });

  return sections.sort((a, b) => a.programme.localeCompare(b.programme));
}

export default function ScheduleTable({ groups, catalogModules = [], canEdit = false, onEditTrainingPlan }: Props) {
  const rows = toDerivedRows(groups, catalogModules);
  const sections = toProgrammeSections(rows);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [headerScrollLeft, setHeaderScrollLeft] = useState(0);
  const [selectedRow, setSelectedRow] = useState<DerivedScheduleRow | null>(null);

  // Today's sessions
  const todayIndex = new Date().getDay();
  const todayKey: DayKey = JS_DAY_TO_KEY[todayIndex];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const todays = rows.filter(r => {
    const cell = r[todayKey];
    if (!cell) return false;
    const start = parseLocalIsoDate(r.startDate).getTime();
    const end = parseLocalIsoDate(r.endDate).getTime();
    return !Number.isNaN(start) && !Number.isNaN(end) && todayTs >= start && todayTs <= end;
  });

  const weekStart = new Date(todayStart);
  const dayOffset = todayStart.getDay() === 0 ? 6 : todayStart.getDay() - 1;
  weekStart.setDate(todayStart.getDate() - dayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartIso = toIsoDate(weekStart);
  const weekEndIso = toIsoDate(weekEnd);
  const thisWeekSessions = rows
    .filter(row => row.sessionDate >= weekStartIso && row.sessionDate <= weekEndIso)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  const renderCell = (cell: SessionCell | undefined, bg: string) => {
    if (!cell) return <td className="border border-gray-200 px-2 py-1.5" />;
    return (
      <td className="border border-gray-200 px-2 py-1.5 text-center align-middle" style={{ background: bg }}>
        <p className="font-semibold leading-tight" style={{ fontSize: '11px', color: '#1F2937' }}>{cell.trainer}</p>
        <p style={{ fontSize: '10px', color: '#4B5563' }}>Coach: {cell.coach}</p>
        <p style={{ fontSize: '10px', color: '#6B7280' }}>({cell.time})</p>
      </td>
    );
  };

  const getRowSessionCell = (row: DerivedScheduleRow): SessionCell | undefined => {
    const todayCell = row[todayKey] as SessionCell | undefined;
    if (todayCell) return todayCell;
    for (const day of DAY_COLS) {
      const cell = row[day.key] as SessionCell | undefined;
      if (cell) return cell;
    }
    return undefined;
  };

  const selectedCell = selectedRow ? getRowSessionCell(selectedRow) : undefined;

  const showNextModuleTutorWarning = (row: DerivedScheduleRow, event: React.MouseEvent) => {
    event.stopPropagation();
    const info = row.nextModuleInfo;
    if (!info) return;

    if (!info.tutor) {
      void kbcSwal.fire({
        title: info.isScheduledBlock ? 'No tutor set' : 'No scheduled next module',
        html: info.isScheduledBlock
          ? `<strong>${escapeHtml(info.name)}</strong> is a saved next module, but it does not have a tutor assigned yet.`
          : `<strong>EPA</strong> is shown as the end-stage fallback because there is no saved next module block after this module in the Training Plan timeline.`,
        icon: 'info',
        confirmButtonText: 'OK',
      });
      return;
    }

    if (info.otherTutorSessions.length === 0) {
      void kbcSwal.fire({
        title: 'No time conflicts found',
        html: `<strong>${escapeHtml(info.tutor)}</strong> has no saved sessions at the same time as <strong>${escapeHtml(info.name)}</strong> sessions (${escapeHtml(formatDisplayDate(info.startDate))} - ${escapeHtml(formatDisplayDate(info.endDate))}).`,
        icon: 'success',
        confirmButtonText: 'OK',
      });
      return;
    }

    const visible = info.otherTutorSessions.slice(0, 40);
    const rowsHtml = visible.map(item => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#1B2A4A;">${escapeHtml(formatDisplayDate(item.date))}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.conflictTime || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.time)}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.module)}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.programme)}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.groupName || item.cohort)}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.coach)}</td>
      </tr>
    `).join('');
    const moreText = info.otherTutorSessions.length > visible.length
      ? `<p style="margin:10px 0 0;color:#6B7280;font-size:12px;">+${info.otherTutorSessions.length - visible.length} more conflicting sessions.</p>`
      : '';
    const currentModulesHtml = info.currentTutorModules.length
      ? `
        <div style="margin:0 0 14px;border:1px solid #DBEAFE;border-radius:12px;background:#F8FBFF;overflow:hidden;">
          <div style="padding:10px 12px;border-bottom:1px solid #DBEAFE;background:#EFF6FF;color:#1E3A8A;font-size:13px;font-weight:800;">
            Current modules for ${escapeHtml(info.tutor)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;padding:12px;">
            ${info.currentTutorModules.map(moduleItem => `
              <div style="border:1px solid #E5E7EB;border-radius:10px;background:#FFFFFF;padding:10px;">
                <div style="font-weight:800;color:#1F2937;font-size:13px;">${escapeHtml(moduleItem.module)}</div>
                <div style="margin-top:4px;color:#64748B;font-size:12px;">${escapeHtml(moduleItem.programme)} - ${escapeHtml(moduleItem.groupName || moduleItem.cohort)}</div>
                <div style="margin-top:6px;color:#334155;font-size:12px;">
                  ${escapeHtml(formatDisplayDate(moduleItem.startDate))} - ${escapeHtml(formatDisplayDate(moduleItem.endDate))}
                </div>
                <div style="margin-top:4px;color:#334155;font-size:12px;">${escapeHtml(moduleItem.time)}</div>
                <div style="margin-top:4px;color:#64748B;font-size:12px;">Coach: ${escapeHtml(moduleItem.coach)} · ${moduleItem.completedSessions}/${moduleItem.totalSessions} done</div>
              </div>
            `).join('')}
          </div>
        </div>
      `
      : `
        <div style="margin:0 0 14px;border:1px solid #E5E7EB;border-radius:12px;background:#F9FAFB;padding:12px;color:#64748B;font-size:13px;">
          No current in-progress modules were found for ${escapeHtml(info.tutor)}.
        </div>
      `;

    void kbcSwal.fire({
      title: 'Tutor time conflict',
      html: `
        <div style="text-align:left">
          <p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:1.5;">
            <strong>${escapeHtml(info.tutor)}</strong> has <strong>${info.otherTutorSessions.length}</strong> saved session${info.otherTutorSessions.length === 1 ? '' : 's'} at the same time as the next module <strong>${escapeHtml(info.name)}</strong>.
          </p>
          ${currentModulesHtml}
          <div style="max-height:58vh;overflow:auto;border:1px solid #E5E7EB;border-radius:12px;">
            <table style="width:100%;min-width:940px;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#F9FAFB;color:#4B5563;">
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Date</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Next module time</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Conflicting time</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Module</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Programme</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Group</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Coach</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          ${moreText}
        </div>
      `,
      icon: 'warning',
      width: 'min(1120px, 94vw)',
      confirmButtonText: 'OK',
    });
  };

  const handleTableScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setHeaderScrollLeft(el.scrollLeft);
  }, []);

  const renderColumnGroup = () => (
    <colgroup>
      {TABLE_COLUMNS.map((width, index) => (
        <col key={index} style={{ width: `${width}px` }} />
      ))}
    </colgroup>
  );

  const renderHeader = () => (
    <table className="table-fixed border-collapse" style={{ width: TABLE_MIN_WIDTH }}>
      {renderColumnGroup()}
      <thead>
        <tr>
          <th colSpan={6} className="border border-gray-300 text-center py-2.5 font-extrabold tracking-wide text-white text-sm" style={{ background: '#1B2A4A' }}>
            Apprenticeship
          </th>
          <th colSpan={6} className="border border-gray-300 text-center py-2.5 font-extrabold tracking-widest text-sm" style={{ background: '#F7A800', color: '#1B2A4A' }}>
            {new Date().getFullYear()}
          </th>
          <th className="border border-gray-300 text-center py-2.5 font-extrabold text-white text-xs" style={{ background: '#1B2A4A' }}>
            Next Module
          </th>
        </tr>
        <tr style={{ background: '#F1F5F9' }}>
          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide">Programme</th>
          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide">Cohort</th>
          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide">Module</th>
          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide">Module Dates</th>
          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide">Session Status</th>
          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide">Progress</th>
          {DAY_COLS.map(d => (
            <th key={d.key} className="border border-gray-200 px-2 py-2 text-center text-xs font-extrabold uppercase tracking-wide" style={{ background: d.headerBg, color: d.headerTx }}>
              {d.label}
            </th>
          ))}
          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide">Next Module</th>
        </tr>
      </thead>
    </table>
  );

  return (
    <div className="bg-white rounded-xl overflow-visible border border-gray-300">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200" style={{ background: '#F9FAFB' }}>
        <div>
          <h3 className="font-extrabold text-kbc-navy text-sm tracking-wide">Session Schedule Table</h3>
          <p className="text-xs text-gray-400 mt-0.5">{rows.length} current module{rows.length !== 1 ? 's' : ''} running today</p>
        </div>
      </div>

      {/* Today's sessions container */}
      <div className="px-5 py-4 border-b bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-kbc-navy">This Week / Session Status</h4>
            <p className="text-xs text-gray-400 mt-0.5">{formatDisplayDate(weekStartIso)} - {formatDisplayDate(weekEndIso)} · {todays.length} today</p>
          </div>
        </div>
        {thisWeekSessions.length === 0 ? (
          <p className="text-xs text-gray-400 mt-2">No current module sessions scheduled for this week.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {thisWeekSessions.map((s, i) => (
              <li
                key={`${s.cohort}-${s.module}-${i}`}
                onClick={() => setSelectedRow(s)}
                className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${isFinishedRow(s) ? 'bg-emerald-50 ring-1 ring-emerald-100 hover:bg-emerald-100' : 'bg-gray-50 hover:bg-amber-50'}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800">{s.module}</p>
                    {isFinishedRow(s) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 ring-1 ring-emerald-200">
                        <i className="ri-check-line" />
                        Finished
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-700 mt-0.5">
                    {s.hasRealSessionName ? s.sessionTitle : `Session ${s.currentSessionNumber} - no real name saved`} - {formatDisplayDate(s.sessionDate)}
                  </p>
                  {!s.hasRealSessionName && <p className="text-[11px] text-amber-700 mt-0.5">{s.missingSessionNameReason}</p>}
                  <p className="text-xs text-gray-500">{s.cohort} · {s.programme}</p>
                </div>
                <div className="text-right">
                  {(() => {
                    const cell = getRowSessionCell(s);
                    return (
                      <>
                        <p className="text-sm font-bold text-gray-700">{cell?.time || formatDisplayDate(s.sessionDate)}</p>
                        <p className={`text-xs font-semibold ${isFinishedRow(s) ? 'text-emerald-700' : 'text-gray-400'}`}>
                          {isFinishedRow(s) ? 'Finished' : `${s.completedSessions}/${s.totalSessions} completed`}
                        </p>
                        <p className="text-xs text-gray-500">Tutor: {cell?.trainer || 'TBD'}</p>
                        <p className="text-xs text-gray-500">Coach: {cell?.coach || 'TBD'}</p>
                      </>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="sticky overflow-hidden bg-white"
        style={{
          top: TOP_NAV_H,
          zIndex: 35,
          marginBottom: 8,
          borderBottom: '1px solid #E5E7EB',
          boxShadow: '0 12px 22px -18px rgba(15,23,42,0.65)',
        }}
      >
        <div
          style={{
            width: TABLE_MIN_WIDTH,
            transform: `translateX(-${headerScrollLeft}px)`,
            willChange: 'transform',
          }}
        >
          {renderHeader()}
        </div>
      </div>

      <div ref={scrollRef} className="overflow-x-auto" onScroll={handleTableScroll}>
        <table className="table-fixed border-collapse" style={{ width: TABLE_MIN_WIDTH }}>
          {renderColumnGroup()}
          <tbody>
            {sections.map(section => (
              <Fragment key={`section-${section.programme}`}>
                {section.rows.map((row, idx) => (
                  <tr
                    key={`${section.programme}-${row.cohort}-${row.module}-${idx}`}
                    onClick={() => setSelectedRow(row)}
                    className="group/srow hover:brightness-95 transition-all cursor-pointer"
                    style={{ background: isFinishedRow(row) ? '#ECFDF5' : row.isCurrent ? '#FFFBEB' : (row.rowHighlight || (idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB')) }}
                  >
                    {idx === 0 && (
                      <td rowSpan={section.rows.length} className="border border-gray-200 px-3 py-1.5 align-middle text-center bg-white/70">
                        <span className="inline-flex items-center justify-center font-bold text-xs whitespace-nowrap" style={{ color: row.programmeColor }}>{row.programme}</span>
                      </td>
                    )}
                    {/* Cohort name */}
                    <td className="border border-gray-200 px-3 py-1.5 align-middle">
                      {row.groupName ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap" style={{ background: `${row.cohortColor}18`, color: row.cohortColor }}>
                          {row.groupName}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    {/* Module + current badge */}
                    <td className="border border-gray-200 px-3 py-1.5 align-middle">
                      <div className="leading-tight flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm text-gray-700 font-bold">{row.module}</p>
                        {isFinishedRow(row) ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                            <i className="ri-check-line" />
                            Finished
                          </span>
                        ) : row.isCurrent && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide" style={{ background: '#F7A800', color: '#1B2A4A' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Dates */}
                    <td className="border border-gray-200 px-3 py-1.5 align-middle">
                      <span className="inline-flex items-center font-extrabold text-xs whitespace-nowrap" style={{ color: row.cohortColor }}>
                        {row.cohort}
                      </span>
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 align-middle">
                      <div className="leading-tight">
                        <p className="text-xs font-extrabold text-gray-800">
                          #{row.currentSessionNumber} {row.hasRealSessionName ? row.sessionTitle : 'No real session name saved'}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{formatDisplayDate(row.sessionDate)}</p>
                        {!row.hasRealSessionName && <p className="text-[11px] text-amber-700 mt-0.5">{row.missingSessionNameReason}</p>}
                        {row.sessionDescription && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{row.sessionDescription}</p>}
                      </div>
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 align-middle">
                      {isFinishedRow(row) ? (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-200">
                            <i className="ri-check-line" />
                            Finished
                          </span>
                          <span className="block text-[11px] text-emerald-600 mt-1">{row.totalSessions} / {row.totalSessions} done</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-xs font-bold text-gray-700">{row.completedSessions} / {row.totalSessions} done</span>
                          <span className="block text-[11px] text-gray-400">Reached session {row.currentSessionNumber}</span>
                        </>
                      )}
                    </td>
                    {DAY_COLS.map(d => renderCell(row[d.key] as SessionCell | undefined, d.cellBg))}
                    <td className="border border-gray-200 px-3 py-1.5 align-middle">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-gray-600 leading-snug break-words">{row.nextModuleInfo?.name || row.nextModule}</span>
                          {row.nextModuleInfo?.isScheduledBlock ? (
                            row.nextModuleInfo.tutor ? (
                              <span className="mt-1 block text-[11px] text-gray-400">Tutor: {row.nextModuleInfo.tutor}</span>
                            ) : (
                              <span className="mt-1 block text-[11px] font-semibold text-amber-700">Tutor not assigned</span>
                            )
                          ) : (
                            <span className="mt-1 block text-[11px] text-gray-400">No scheduled next module block yet</span>
                          )}
                        </div>
                        {row.nextModuleInfo?.isScheduledBlock && row.nextModuleInfo.otherTutorSessions.length > 0 && (
                          <button
                            type="button"
                            onClick={event => showNextModuleTutorWarning(row, event)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-200"
                            title={`${row.nextModuleInfo.tutor} has ${row.nextModuleInfo.otherTutorSessions.length} time conflict${row.nextModuleInfo.otherTutorSessions.length === 1 ? '' : 's'} during this next module`}
                          >
                            <i className="ri-alert-line" />
                            {row.nextModuleInfo.otherTutorSessions.length}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center py-8 text-sm text-gray-400 italic border border-gray-200">
                  No modules are currently running today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[4px]" onClick={() => setSelectedRow(null)} />
          <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/60">{selectedRow.programme} · {selectedRow.groupName || 'No group'}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">{selectedRow.module}</h3>
                <p className="mt-1 text-xs text-white/70">{selectedRow.cohort}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit && onEditTrainingPlan && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedRow;
                      setSelectedRow(null);
                      onEditTrainingPlan(target.groupIdx, target.rowIdx, target.blockId);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-kbc-navy transition-colors hover:bg-amber-50"
                  >
                    <i className="ri-edit-line" />
                    Edit in Training Plan
                  </button>
                )}
                <button onClick={() => setSelectedRow(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto bg-gray-50 px-5 py-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{isFinishedRow(selectedRow) ? 'Final Session' : 'Current Session'}</p>
                  <p className="mt-1 text-sm font-extrabold text-gray-800">#{selectedRow.currentSessionNumber}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{selectedRow.hasRealSessionName ? selectedRow.sessionTitle : 'No real name saved'}</p>
                  {isFinishedRow(selectedRow) && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 ring-1 ring-emerald-200">
                      <i className="ri-check-line" />
                      Finished
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Date</p>
                  <p className="mt-1 text-sm font-extrabold text-gray-800">{formatDisplayDate(selectedRow.sessionDate)}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{selectedCell?.time || 'No time set'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Tutor</p>
                  <p className="mt-1 text-sm font-extrabold text-gray-800">{selectedCell?.trainer || 'TBD'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Coach</p>
                  <p className="mt-1 text-sm font-extrabold text-gray-800">{selectedCell?.coach || 'TBD'}</p>
                </div>
              </div>

              {!selectedRow.hasRealSessionName && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  {selectedRow.missingSessionNameReason}
                </div>
              )}

              {selectedRow.nextModuleInfo && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Next Module</p>
                      <p className="mt-1 text-sm font-extrabold text-gray-800">{selectedRow.nextModuleInfo.name}</p>
                      {!selectedRow.nextModuleInfo.isScheduledBlock && (
                        <p className="mt-1 text-xs font-semibold text-gray-400">No scheduled next module block yet. EPA is shown as the end-stage fallback.</p>
                      )}
                    </div>
                    {selectedRow.nextModuleInfo.isScheduledBlock && selectedRow.nextModuleInfo.otherTutorSessions.length > 0 && (
                      <button
                        type="button"
                        onClick={event => showNextModuleTutorWarning(selectedRow, event)}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-200"
                      >
                        <i className="ri-alert-line" />
                        {selectedRow.nextModuleInfo.otherTutorSessions.length} time conflict{selectedRow.nextModuleInfo.otherTutorSessions.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </div>

                  {selectedRow.nextModuleInfo.isScheduledBlock ? (
                    <div className="grid gap-3 px-4 py-3 md:grid-cols-4">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Tutor</p>
                        <p className={`mt-1 text-sm font-extrabold ${selectedRow.nextModuleInfo.tutor ? 'text-gray-800' : 'text-amber-700'}`}>
                          {selectedRow.nextModuleInfo.tutor || 'Tutor not assigned'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Coach</p>
                        <p className="mt-1 text-sm font-extrabold text-gray-800">{selectedRow.nextModuleInfo.coach || 'TBD'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Dates</p>
                        <p className="mt-1 text-sm font-extrabold text-gray-800">
                          {formatDisplayDate(selectedRow.nextModuleInfo.startDate)} - {formatDisplayDate(selectedRow.nextModuleInfo.endDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Sessions</p>
                        <p className="mt-1 text-sm font-extrabold text-gray-800">{selectedRow.nextModuleInfo.sessions || 'Not set'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-xs text-gray-500">
                      There is no real next module block saved after <strong>{selectedRow.module}</strong> in this cohort timeline, so there is no tutor, coach, date range, or conflict check to show.
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-700">All Sessions</p>
                    <p className={`mt-0.5 text-[11px] font-semibold ${isFinishedRow(selectedRow) ? 'text-emerald-700' : 'text-gray-400'}`}>
                      {isFinishedRow(selectedRow) ? `Finished - ${selectedRow.totalSessions}/${selectedRow.totalSessions} completed` : `${selectedRow.completedSessions}/${selectedRow.totalSessions} completed`}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isFinishedRow(selectedRow) ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-100 text-amber-800'}`}>
                    {isFinishedRow(selectedRow) ? 'Module finished' : `Reached session ${selectedRow.currentSessionNumber}`}
                  </span>
                </div>
                <div className="max-h-[42vh] overflow-y-auto px-4 py-3">
                  <div className="space-y-2">
                    {selectedRow.sessionInstances.map(session => {
                      const statusStyle =
                        session.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : session.status === 'current'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-gray-50 text-gray-500 border-gray-100';
                      return (
                        <div key={session.number} className={`rounded-lg border px-3 py-2 ${statusStyle}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold">
                                {session.number}. {session.hasRealName ? session.title : 'No real session name saved'}
                              </p>
                              <p className="mt-0.5 text-xs opacity-80">{formatDisplayDate(session.date)}</p>
                              {session.description && <p className="mt-1 text-xs opacity-80">{session.description}</p>}
                            </div>
                            <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold capitalize">
                              {session.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
