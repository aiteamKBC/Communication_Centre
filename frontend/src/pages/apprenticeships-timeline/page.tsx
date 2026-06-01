import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '@/components/feature/TopNav';
import Footer from '@/components/feature/Footer';
import type { ProgrammeGroup, CohortRow, Holiday, ZoomLevel, MKey, WeekDayKey, CustomModule, CustomProgram, CatalogModule } from './types';
import { MS, getModuleMeta } from './data';
import GanttTimeline from './components/GanttTimeline';
import CohortModal from './components/CohortModal';
import HolidayManager from './components/HolidayManager';
import AddModuleModal from './components/AddModuleModal';
import AddModuleCatalogModal from './components/AddModuleCatalogModal';
import ManageModulesModal from './components/ManageModulesModal';
import AddProgramModal from './components/AddProgramModal';
import ManageProgramModal from './components/ManageProgramModal';
import ScheduleTable from '@/pages/apprenticeships-timeline/components/ScheduleTable';
import TutorProfiles from './components/TutorProfiles';
import useAccessControl from '@/hooks/useAccessControl';
import { kbcSuccessSwal, kbcSwal } from '@/components/feature/sweetAlert';

type ModalState =
  | { open: false }
  | { open: true; mode: 'add'; defaultGroupIdx: number }
  | { open: true; mode: 'add'; defaultGroupIdx: number; lockGroupSelection: true }
  | { open: true; mode: 'edit'; groupIdx: number; rowIdx: number; row: CohortRow; expandedBlockId?: string };

type ProgramModalState =
  | { open: false }
  | { open: true; mode: 'add' }
  | { open: true; mode: 'edit'; programId: string };

interface EditChoiceState {
  groupIdx: number;
  rowIdx: number;
  blockId: string;
}

interface TrainingPlanItem {
  cohortName: string;
  program: string;
  startingDateLabel: string;
  moduleName: string;
  groupName?: string;
  coachName?: string;
  tutorName: string;
  startDate: string;
  endDate: string;
  sessionsNumber: string;
  sessionWeekDay: string;
  sessionStartTime: string;
  sessionEndTime: string;
  notes: string;
}

interface MonthlySessionDetail {
  date: string;
  tutor: string;
  coach: string;
  time: string;
  holidays: MonthlyHolidayDetail[];
}

interface MonthlyHolidayDetail {
  id: string;
  label: string;
  type: string;
  dateRange: string;
  color: string;
}

interface ModuleMonthSummary {
  key: string;
  label: string;
  sessions: MonthlySessionDetail[];
  holidays: MonthlyHolidayDetail[];
}

interface ModuleMonthlySummary {
  key: string;
  programme: string;
  programmeColor: string;
  cohort: string;
  moduleName: string;
  groupName: string;
  tutor: string;
  coach: string;
  dateRange: string;
  totalSessions: number;
  countedSessions: number;
  color: string;
  textColor: string;
  affectedSessions: number;
  months: ModuleMonthSummary[];
}

const HOLIDAY_MARKER_PREFIX = '__holiday_ids:';
const COHORT_COLOR_MARKER_PREFIX = '__cohort_color:';
const MODULE_COLOR_MARKER_PREFIX = '__module_color:';
const COHORT_END_DATE_MARKER_PREFIX = '__cohort_end_date:';
const GROUP_NAME_MARKER_PREFIX = '__group_name:';
const COACH_NAME_MARKER_PREFIX = '__coach_name:';
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function splitPersistedNotes(raw: string): { holidayIds: string[]; cohortColor?: string; moduleColor?: string; cohortEndDate?: string; groupName?: string; coachName?: string; notes: string } {
  const value = (raw || '').trim();
  if (!value.startsWith(HOLIDAY_MARKER_PREFIX) && !value.startsWith(COHORT_COLOR_MARKER_PREFIX) && !value.startsWith(MODULE_COLOR_MARKER_PREFIX) && !value.startsWith(COHORT_END_DATE_MARKER_PREFIX) && !value.startsWith(GROUP_NAME_MARKER_PREFIX) && !value.startsWith(COACH_NAME_MARKER_PREFIX)) {
    return { holidayIds: [], cohortColor: undefined, moduleColor: undefined, cohortEndDate: undefined, groupName: undefined, coachName: undefined, notes: raw || '' };
  }

  const lines = value.split('\n');
  const noteLines: string[] = [];
  const holidayIds = new Set<string>();
  let cohortColor: string | undefined;
  let moduleColor: string | undefined;
  let cohortEndDate: string | undefined;
  let groupName: string | undefined;
  let coachName: string | undefined;
  let readingMarkers = true;

  lines.forEach(line => {
    if (readingMarkers && line.startsWith(HOLIDAY_MARKER_PREFIX)) {
      line
        .slice(HOLIDAY_MARKER_PREFIX.length)
        .split('|')
        .map(item => item.trim())
        .filter(Boolean)
        .forEach(item => holidayIds.add(item));
      return;
    }

    if (readingMarkers && line.startsWith(COHORT_COLOR_MARKER_PREFIX)) {
      const nextColor = line.slice(COHORT_COLOR_MARKER_PREFIX.length).trim();
      cohortColor = nextColor || undefined;
      return;
    }

    if (readingMarkers && line.startsWith(MODULE_COLOR_MARKER_PREFIX)) {
      const nextColor = line.slice(MODULE_COLOR_MARKER_PREFIX.length).trim();
      moduleColor = nextColor || undefined;
      return;
    }

    if (readingMarkers && line.startsWith(COHORT_END_DATE_MARKER_PREFIX)) {
      const nextEndDate = line.slice(COHORT_END_DATE_MARKER_PREFIX.length).trim();
      cohortEndDate = nextEndDate || undefined;
      return;
    }

    if (readingMarkers && line.startsWith(GROUP_NAME_MARKER_PREFIX)) {
      const nextGroupName = line.slice(GROUP_NAME_MARKER_PREFIX.length).trim();
      groupName = nextGroupName || undefined;
      return;
    }

    if (readingMarkers && line.startsWith(COACH_NAME_MARKER_PREFIX)) {
      const nextCoachName = line.slice(COACH_NAME_MARKER_PREFIX.length).trim();
      coachName = nextCoachName || undefined;
      return;
    }

    readingMarkers = false;
    noteLines.push(line);
  });

  return { holidayIds: Array.from(holidayIds), cohortColor, moduleColor, cohortEndDate, groupName, coachName, notes: noteLines.join('\n') };
}

function joinPersistedNotes(notes: string, holidayIds: string[], cohortColor?: string, moduleColor?: string, cohortEndDate?: string, groupName?: string, coachName?: string): string {
  const markers: string[] = [];
  if (holidayIds.length) {
    markers.push(`${HOLIDAY_MARKER_PREFIX}${holidayIds.join('|')}`);
  }
  if (cohortColor) {
    markers.push(`${COHORT_COLOR_MARKER_PREFIX}${cohortColor}`);
  }
  if (moduleColor) {
    markers.push(`${MODULE_COLOR_MARKER_PREFIX}${moduleColor}`);
  }
  if (cohortEndDate) {
    markers.push(`${COHORT_END_DATE_MARKER_PREFIX}${cohortEndDate}`);
  }
  if (groupName) {
    markers.push(`${GROUP_NAME_MARKER_PREFIX}${groupName}`);
  }
  if (coachName) {
    markers.push(`${COACH_NAME_MARKER_PREFIX}${coachName}`);
  }
  if (!markers.length) {
    return notes;
  }
  return notes ? `${markers.join('\n')}\n${notes}` : markers.join('\n');
}

const DAY_ALIASES: Record<string, WeekDayKey> = {
  saturday: 'saturday',
  sat: 'saturday',
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
};

const moduleKeyByLabel: Record<string, MKey> = Object.entries(MS).reduce((acc, [key, value]) => {
  acc[value.lbl.toLowerCase()] = key as MKey;
  return acc;
}, {} as Record<string, MKey>);

function normalizeProgramLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function inferGroupId(program: string, groups: ProgrammeGroup[]): string {
  const normalizedProgram = normalizeProgramLabel(program);
  const matchedGroup = groups.find(group => {
    const programmeLabel = normalizeProgramLabel(toProgrammeLabel(group));
    const displayLabel = normalizeProgramLabel(group.name.replace('\n', ' '));
    return normalizedProgram === programmeLabel || normalizedProgram === displayLabel;
  });

  if (matchedGroup) {
    return matchedGroup.id;
  }

  const p = normalizedProgram;
  if (p.includes('pcp') || p.includes('project control')) return 'pcp';
  if (p.includes('mm') || p.includes('marketing manager')) return 'mm';
  if (p.includes('me') || p.includes('marketing executive')) return 'me';
  return groups[0]?.id || 'pcp';
}

function parseDays(value: string): WeekDayKey[] {
  const tokens = value
    .split(/[|,;/]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const mapped = tokens
    .map(token => DAY_ALIASES[token])
    .filter((item): item is WeekDayKey => Boolean(item));
  return Array.from(new Set(mapped));
}

function toProgrammeLabel(group: ProgrammeGroup): string {
  const first = group.name.split('\n')[0].trim();
  const code = group.name.match(/\(([^)]+)\)/)?.[1] || first;
  const level = group.name.match(/L\d+/)?.[0] || '';
  return `${code} ${level}`.trim();
}

function buildAllGroups(
  customPrograms: CustomProgram[] = [],
): ProgrammeGroup[] {
  return customPrograms.map(program => ({
    id: program.id,
    name: program.name,
    sub: program.sub,
    color: program.color,
    rows: [] as CohortRow[],
  }));
}

function buildGroupsFromTrainingRows(
  items: TrainingPlanItem[],
  customPrograms: CustomProgram[] = [],
): ProgrammeGroup[] {
  const allGroups = buildAllGroups(customPrograms);
  const templatesById = new Map(allGroups.map(group => [group.id, group]));
  const cohortIndex = new Map<string, CohortRow>();

  items.forEach((item, index) => {
    const groupId = inferGroupId(item.program || '', allGroups);
    const group = templatesById.get(groupId);
    if (!group) {
      return;
    }

    const cohortKey = `${groupId}::${item.cohortName}::${item.startingDateLabel}`;
    let cohort = cohortIndex.get(cohortKey);
    if (!cohort) {
      cohort = {
        id: `db-row-${groupId}-${cohortIndex.size + 1}`,
        label: item.cohortName || 'Cohort',
        dateLbl: item.startingDateLabel || '',
        endDateLbl: undefined,
        intake: 'Intake 1',
        quarter: 'Q1 2026',
        color: undefined,
        blks: [],
      };
      cohortIndex.set(cohortKey, cohort);
      group.rows.push(cohort);
    }

    const modKey = moduleKeyByLabel[(item.moduleName || '').toLowerCase()] || item.moduleName || 'Untitled Module';
    const sessions = Math.max(1, Number.parseInt(item.sessionsNumber || '1', 10) || 1);
    const parsedNotes = splitPersistedNotes(item.notes || '');
    if (parsedNotes.holidayIds.length && (!cohort.holidayIds || cohort.holidayIds.length === 0)) {
      cohort.holidayIds = parsedNotes.holidayIds;
    }
    if (parsedNotes.cohortColor && !cohort.color) {
      cohort.color = parsedNotes.cohortColor;
    }
    if (parsedNotes.cohortEndDate && !cohort.endDateLbl) {
      cohort.endDateLbl = parsedNotes.cohortEndDate;
    }
    cohort.blks.push({
      id: `db-blk-${index + 1}`,
      mod: modKey,
      groupName: item.groupName || parsedNotes.groupName,
      coachName: item.coachName || parsedNotes.coachName,
      color: parsedNotes.moduleColor,
      tutor: item.tutorName || '',
      startDate: item.startDate || '2026-01-01',
      endDate: item.endDate || item.startDate || '2026-01-01',
      sessions,
      days: parseDays(item.sessionWeekDay || ''),
      sessionStartTime: item.sessionStartTime || '09:00',
      sessionEndTime: item.sessionEndTime || '11:00',
      notes: parsedNotes.notes || '',
    });
  });

  return allGroups.map(group => templatesById.get(group.id) || { ...group, rows: [] });
}

function flattenGroupsForApi(groups: ProgrammeGroup[]): TrainingPlanItem[] {
  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.map(block => ({
        cohortName: row.label,
        program: toProgrammeLabel(group),
        startingDateLabel: row.dateLbl,
        moduleName: getModuleMeta(block.mod).lbl,
        groupName: block.groupName,
        coachName: block.coachName,
        tutorName: block.tutor,
        startDate: block.startDate,
        endDate: block.endDate,
        sessionsNumber: String(block.sessions),
        sessionWeekDay: (block.days || []).join(', '),
        sessionStartTime: block.sessionStartTime || '09:00',
        sessionEndTime: block.sessionEndTime || '11:00',
        notes: joinPersistedNotes(block.notes || '', row.holidayIds || [], row.color, block.color, row.endDateLbl),
      })),
    ),
  );
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatPlanDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPlanMonth(value: string): string {
  return parseLocalDate(`${value}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function monthKeyFromDate(value: string): string {
  return value.slice(0, 7);
}

function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start: toLocalDateKey(start), end: toLocalDateKey(end) };
}

function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return parseLocalDate(aStart) <= parseLocalDate(bEnd) && parseLocalDate(bStart) <= parseLocalDate(aEnd);
}

function resolveTrainingModuleMeta(block: { mod: MKey | string; color?: string }, customModules: CustomModule[]) {
  const base = block.mod in MS
    ? getModuleMeta(block.mod as MKey)
    : customModules.find(module => module.id === block.mod || module.name === block.mod)
      ? {
        lbl: customModules.find(module => module.id === block.mod || module.name === block.mod)!.name,
        bg: customModules.find(module => module.id === block.mod || module.name === block.mod)!.bg,
        tx: customModules.find(module => module.id === block.mod || module.name === block.mod)!.tx,
      }
      : getModuleMeta(block.mod);

  if (!block.color) {
    return base;
  }

  return { ...base, bg: block.color };
}

function buildSessionDates(block: { startDate: string; endDate: string; sessions: number; days?: WeekDayKey[] }): string[] {
  const total = Math.max(1, block.sessions || 1);
  const start = parseLocalDate(block.startDate);
  const end = parseLocalDate(block.endDate || block.startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  if (block.days?.length) {
    const targets = new Set(block.days);
    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end && dates.length < total) {
      if (targets.has(DAY_NAMES[cursor.getDay()] as WeekDayKey)) {
        dates.push(toLocalDateKey(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (total === 1) {
    return [toLocalDateKey(start)];
  }

  const spanDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  const dates = new Set<string>();
  for (let i = 0; i < total; i += 1) {
    const offset = Math.round((spanDays * i) / Math.max(1, total - 1));
    const next = new Date(start);
    next.setDate(start.getDate() + offset);
    dates.add(toLocalDateKey(next));
  }
  return Array.from(dates);
}

function buildMonthlyModuleSummaries(groups: ProgrammeGroup[], holidays: Holiday[], customModules: CustomModule[]): ModuleMonthlySummary[] {
  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.map(block => {
        const meta = resolveTrainingModuleMeta(block, customModules);
        const months = new Map<string, ModuleMonthSummary>();
        const selectedHolidayIds = new Set(row.holidayIds || []);
        const scopedHolidays = selectedHolidayIds.size
          ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id))
          : holidays;
        let affectedSessions = 0;

        buildSessionDates(block).forEach(date => {
          const monthKey = monthKeyFromDate(date);
          if (!months.has(monthKey)) {
            months.set(monthKey, { key: monthKey, label: formatPlanMonth(monthKey), sessions: [], holidays: [] });
          }
          const sessionHolidays = scopedHolidays
            .filter(holiday => dateRangesOverlap(date, date, holiday.startDate, holiday.endDate))
            .map(holiday => ({
              id: holiday.id,
              label: holiday.label,
              type: holiday.type,
              dateRange: `${formatPlanDate(holiday.startDate)} - ${formatPlanDate(holiday.endDate)}`,
              color: holiday.color,
            }));
          if (sessionHolidays.length) {
            affectedSessions += 1;
          }
          months.get(monthKey)!.sessions.push({
            date,
            tutor: block.tutor || 'TBD',
            coach: block.coachName || 'TBD',
            time: `${block.sessionStartTime || '09:00'}${block.sessionEndTime ? ` - ${block.sessionEndTime}` : ''}`,
            holidays: sessionHolidays,
          });
        });

        scopedHolidays
          .filter(holiday => dateRangesOverlap(block.startDate, block.endDate, holiday.startDate, holiday.endDate))
          .forEach(holiday => {
            const startMonth = parseLocalDate(holiday.startDate);
            const endMonth = parseLocalDate(holiday.endDate);
            const cursor = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
            const last = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);

            while (cursor <= last) {
              const monthKey = `${cursor.getFullYear()}-${`${cursor.getMonth() + 1}`.padStart(2, '0')}`;
              const bounds = monthBounds(monthKey);
              if (dateRangesOverlap(block.startDate, block.endDate, bounds.start, bounds.end) && dateRangesOverlap(holiday.startDate, holiday.endDate, bounds.start, bounds.end)) {
                if (!months.has(monthKey)) {
                  months.set(monthKey, { key: monthKey, label: formatPlanMonth(monthKey), sessions: [], holidays: [] });
                }
                const month = months.get(monthKey)!;
                if (!month.holidays.some(item => item.id === holiday.id)) {
                  month.holidays.push({
                    id: holiday.id,
                    label: holiday.label,
                    type: holiday.type,
                    dateRange: `${formatPlanDate(holiday.startDate)} - ${formatPlanDate(holiday.endDate)}`,
                    color: holiday.color,
                  });
                }
              }
              cursor.setMonth(cursor.getMonth() + 1);
            }
          });

        const sortedMonths = Array.from(months.values()).sort((a, b) => a.key.localeCompare(b.key));

        return {
          key: `${group.id}-${row.id}-${block.id}`,
          programme: group.name.replace('\n', ' '),
          programmeColor: group.color,
          cohort: row.label,
          moduleName: meta.lbl,
          groupName: block.groupName || 'No group name',
          tutor: block.tutor || 'TBD',
          coach: block.coachName || 'TBD',
          dateRange: `${formatPlanDate(block.startDate)} - ${formatPlanDate(block.endDate)}`,
          totalSessions: block.sessions || 0,
          countedSessions: sortedMonths.reduce(
            (count, month) => count + month.sessions.filter(session => session.holidays.length === 0).length,
            0,
          ),
          color: meta.bg,
          textColor: meta.tx,
          affectedSessions,
          months: sortedMonths,
        };
      }),
    ),
  ).filter(summary => summary.months.length > 0);
}

function MonthlyModuleBreakdown({ summaries }: { summaries: ModuleMonthlySummary[] }) {
  const [selectedSummary, setSelectedSummary] = useState<ModuleMonthlySummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [programmeFilter, setProgrammeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'affected' | 'clear'>('all');
  const programmeOptions = useMemo(
    () => Array.from(new Set(summaries.map(summary => summary.programme))).sort((a, b) => a.localeCompare(b)),
    [summaries],
  );
  const filteredSummaries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return summaries.filter(summary => {
      if (programmeFilter !== 'all' && summary.programme !== programmeFilter) return false;
      if (riskFilter === 'affected' && summary.affectedSessions === 0) return false;
      if (riskFilter === 'clear' && summary.affectedSessions > 0) return false;
      if (!query) return true;

      const searchable = [
        summary.moduleName,
        summary.programme,
        summary.cohort,
        summary.groupName,
        summary.tutor,
        summary.coach,
        summary.dateRange,
      ].join(' ').toLowerCase();
      return searchable.includes(query);
    });
  }, [programmeFilter, riskFilter, searchQuery, summaries]);
  const selectedMonths = selectedSummary ? selectedSummary.months : [];
  const hasActiveFilters = searchQuery.trim() || programmeFilter !== 'all' || riskFilter !== 'all';

  if (!summaries.length) {
    return null;
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-kbc-navy">Monthly Module Breakdown</h2>
            <p className="mt-0.5 text-xs text-gray-400">Click any module to view monthly sessions, holidays, tutors, and coaches.</p>
          </div>
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {filteredSummaries.length}/{summaries.length} module{summaries.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="grid gap-2 border-b border-gray-100 bg-slate-50/70 px-4 py-3 md:grid-cols-[minmax(180px,1.4fr)_minmax(150px,1fr)_minmax(160px,0.9fr)_auto]">
          <label className="relative min-w-0">
            <span className="sr-only">Search modules</span>
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search module, group, tutor..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs font-medium text-kbc-navy outline-none transition-colors focus:border-kbc-navy"
            />
          </label>

          <select
            value={programmeFilter}
            onChange={event => setProgrammeFilter(event.target.value)}
            className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-kbc-navy outline-none transition-colors focus:border-kbc-navy"
          >
            <option value="all">All programmes</option>
            {programmeOptions.map(programme => (
              <option key={programme} value={programme}>{programme}</option>
            ))}
          </select>

          <div className="flex h-9 rounded-lg border border-slate-200 bg-white p-1">
            {([
              { key: 'all', label: 'All' },
              { key: 'affected', label: 'Clashes' },
              { key: 'clear', label: 'Clear' },
            ] as const).map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRiskFilter(option.key)}
                className={`flex-1 rounded-md px-2 text-xs font-bold transition-colors ${riskFilter === option.key ? 'bg-kbc-navy text-white' : 'text-gray-500 hover:bg-slate-50 hover:text-kbc-navy'}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setProgrammeFilter('all');
              setRiskFilter('all');
            }}
            disabled={!hasActiveFilters}
            className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-gray-500 transition-colors hover:bg-white hover:text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
        </div>

        <div className="max-h-[360px] overflow-auto">
          {filteredSummaries.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              No modules match the current filters.
            </div>
          ) : filteredSummaries.map(summary => (
            <button
              key={summary.key}
              type="button"
              onClick={() => setSelectedSummary(summary)}
              className="grid w-full grid-cols-[18px_minmax(0,1.5fr)_minmax(0,1fr)_72px_72px_30px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-xs transition-colors last:border-b-0 hover:bg-slate-50"
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: summary.color }} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold text-kbc-navy">{summary.moduleName}</span>
                <span className="mt-0.5 block truncate text-gray-400">{summary.programme} - {summary.cohort}</span>
              </span>
              <span className="min-w-0 text-gray-500">
                <span className="block truncate"><strong className="text-gray-700">Group:</strong> {summary.groupName}</span>
                <span className="block truncate"><strong className="text-gray-700">Tutor:</strong> {summary.tutor}</span>
              </span>
              <span className="rounded-md px-2 py-1 text-center font-bold" style={{ background: summary.color, color: summary.textColor }}>
                {summary.countedSessions}
              </span>
              <span
                className={`rounded-md px-2 py-1 text-center font-bold ${summary.affectedSessions ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
                title="Sessions inside holiday ranges"
              >
                {summary.affectedSessions ? (
                  <span className="inline-flex items-center justify-center gap-1">
                    <i className="ri-alert-line" />
                    {summary.affectedSessions}
                  </span>
                ) : '0'}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white hover:text-kbc-navy">
                <i className="ri-external-link-line text-sm" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {selectedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close monthly breakdown"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setSelectedSummary(null)}
          />
          <div className="relative flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderTop: `5px solid ${selectedSummary.color}` }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: selectedSummary.color }} />
                  <h3 className="truncate text-base font-extrabold text-kbc-navy">{selectedSummary.moduleName}</h3>
                </div>
                <p className="mt-1 text-xs text-gray-500">{selectedSummary.programme} - {selectedSummary.cohort}</p>
                <p className="mt-0.5 text-xs text-gray-400">{selectedSummary.dateRange}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSummary(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-slate-100 hover:text-kbc-navy"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            <div className="grid gap-2 border-y border-slate-100 bg-slate-50 px-5 py-3 text-xs text-gray-500 sm:grid-cols-5">
              <span><strong className="text-gray-700">Group:</strong> {selectedSummary.groupName}</span>
              <span><strong className="text-gray-700">Tutor:</strong> {selectedSummary.tutor}</span>
              <span><strong className="text-gray-700">Coach:</strong> {selectedSummary.coach}</span>
              <span><strong className="text-gray-700">Sessions:</strong> {selectedSummary.countedSessions} counted</span>
              <span className={selectedSummary.affectedSessions ? 'font-bold text-red-700' : 'text-emerald-700'}>
                <strong>Affected:</strong> {selectedSummary.affectedSessions}
              </span>
            </div>

            <div className="overflow-auto p-5">
              {selectedSummary.affectedSessions > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <i className="ri-alert-line mt-0.5" />
                  <span>
                    {selectedSummary.affectedSessions} session{selectedSummary.affectedSessions !== 1 ? 's are' : ' is'} inside a holiday range and may need rescheduling.
                  </span>
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="w-44 px-3 py-2 font-bold">Month</th>
                      <th className="w-24 px-3 py-2 font-bold">Sessions</th>
                      <th className="px-3 py-2 font-bold">Session Dates</th>
                      <th className="px-3 py-2 font-bold">Holidays</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedMonths.map(month => (
                      <tr key={month.key} className="align-top">
                        <td className="whitespace-nowrap px-3 py-3 font-extrabold text-kbc-navy">{month.label}</td>
                        <td className="px-3 py-3 font-bold text-gray-700">
                          {month.sessions.filter(session => session.holidays.length === 0).length}
                        </td>
                        <td className="px-3 py-3 text-gray-600">
                          {month.sessions.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {month.sessions.map(session => (
                                <span
                                  key={`${month.key}-${session.date}-${session.time}`}
                                  className={`rounded-md border px-2 py-1 ${session.holidays.length ? 'border-red-200 bg-red-50 text-red-800 shadow-sm' : 'border-transparent bg-slate-100'}`}
                                  title={session.holidays.length ? `Holiday clash: ${session.holidays.map(holiday => holiday.label).join(', ')}` : undefined}
                                >
                                  {session.holidays.length > 0 && <i className="ri-alert-line mr-1 align-[-1px] text-red-600" />}
                                  <strong className={session.holidays.length ? 'text-red-900' : 'text-gray-800'}>{formatPlanDate(session.date)}</strong>
                                  {' '}({session.time}) - Tutor: {session.tutor} - Coach: {session.coach}
                                  {session.holidays.length > 0 && (
                                    <span className="ml-1 font-bold text-red-700">
                                      - Clash: {session.holidays.map(holiday => holiday.label).join(', ')}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">No sessions</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-600">
                          {month.holidays.length ? (
                            <div className="space-y-1">
                              {month.holidays.map(holiday => (
                                <div key={holiday.id} className="flex items-start gap-2">
                                  <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: holiday.color }} />
                                  <span>
                                    <strong className="text-gray-800">{holiday.label}</strong>
                                    <span className="text-gray-400"> ({holiday.type}) </span>
                                    {holiday.dateRange}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">No holidays</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type TrainingPlanProgramConfigPayload = CustomProgram;

function TrainingPlanPanelSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <span className="sr-only">Loading programmes</span>
      <div className="space-y-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="h-5 w-40 rounded-full bg-slate-200" />
                <div className="mt-2 h-3 w-28 rounded-full bg-slate-200" />
              </div>
              <div className="h-8 w-28 rounded-lg bg-slate-200" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((block) => (
                <div key={block} className="rounded-xl border border-white/80 bg-white p-3 shadow-sm shadow-slate-200/60">
                  <div className="h-4 w-24 rounded-full bg-slate-200" />
                  <div className="mt-3 h-3 w-full rounded-full bg-slate-200" />
                  <div className="mt-2 h-3 w-5/6 rounded-full bg-slate-200" />
                  <div className="mt-4 flex gap-2">
                    <div className="h-7 w-20 rounded-lg bg-slate-200" />
                    <div className="h-7 w-16 rounded-lg bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionScheduleSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <span className="sr-only">Loading schedule</span>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-9 rounded-lg bg-slate-200" />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-12 rounded-xl bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ApprenticeshipTimeline() {
  const { canManageCohorts } = useAccessControl();
  const [customModules, setCustomModules] = useState<CustomModule[]>([]);
  const [customPrograms, setCustomPrograms] = useState<CustomProgram[]>([]);
  const [catalogModules, setCatalogModules] = useState<CatalogModule[]>([]);
  const [trainingPlanItems, setTrainingPlanItems] = useState<TrainingPlanItem[]>([]);
  const [groups,   setGroups]   = useState<ProgrammeGroup[]>(() => buildAllGroups());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [modal,    setModal]    = useState<ModalState>({ open: false });
  const [showHolidayMgr, setShowHolidayMgr] = useState(false);
  const [showAddModule,  setShowAddModule]  = useState(false);
  const [showAddCatalogModule, setShowAddCatalogModule] = useState(false);
  const [showManageModules, setShowManageModules] = useState(false);
  const [initialManageModuleId, setInitialManageModuleId] = useState<number | null>(null);
  const [returnEditChoice, setReturnEditChoice] = useState<EditChoiceState | null>(null);
  const [visibleEditChoice, setVisibleEditChoice] = useState<EditChoiceState | null>(null);
  const [programModal, setProgramModal] = useState<ProgramModalState>({ open: false });
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [activeTab, setActiveTab] = useState<'gantt' | 'schedule' | 'tutors'>('gantt');
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const showHiddenCohortActions = addDropdownOpen && !addDropdownOpen;
  const addDropdownRef = useRef<HTMLDivElement>(null);
  const [trainingPlanSaveState, setTrainingPlanSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [trainingPlanSaveMessage, setTrainingPlanSaveMessage] = useState('Waiting for changes');
  const [hasLoadedTrainingPlan, setHasLoadedTrainingPlan] = useState(false);
  const [hasLoadedProgramConfigs, setHasLoadedProgramConfigs] = useState(false);
  const skipPersistRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingPlan() {
      try {
        const response = await fetch('/api/training-plan/');
        if (!response.ok) {
          return;
        }

        const items = (await response.json()) as TrainingPlanItem[];
        if (!Array.isArray(items) || cancelled) {
          return;
        }

        setTrainingPlanItems(items);
      } catch {
        // Keep initial in-memory data if loading fails.
      } finally {
        if (!cancelled) {
          setHasLoadedTrainingPlan(true);
        }
      }
    }

    void loadTrainingPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setGroups(
      trainingPlanItems.length
        ? buildGroupsFromTrainingRows(trainingPlanItems, customPrograms)
        : buildAllGroups(customPrograms),
    );
  }, [trainingPlanItems, customPrograms]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingPlanModules() {
      try {
        const response = await fetch('/api/training-plan-modules/');
        if (!response.ok) {
          return;
        }

        const items = (await response.json()) as Array<{ id: string; name: string; defaultSessions: number; bg: string; tx: string }>;
        if (!Array.isArray(items) || cancelled) {
          return;
        }

        setCustomModules(items.map(item => ({
          id: item.id,
          name: item.name,
          defaultSessions: item.defaultSessions,
          bg: item.bg,
          tx: item.tx,
        })));
      } catch {
        // Keep current in-memory modules if loading fails.
      }
    }

    async function loadTrainingPlanProgramConfigs() {
      try {
        const response = await fetch('/api/training-plan-program-configs/');
        if (!response.ok) {
          return;
        }

        const items = (await response.json()) as TrainingPlanProgramConfigPayload[];
        if (!Array.isArray(items) || cancelled) {
          return;
        }

        setCustomPrograms(items);
      } catch {
        // Keep current in-memory programme configs if loading fails.
      } finally {
        if (!cancelled) {
          setHasLoadedProgramConfigs(true);
        }
      }
    }

    async function loadTrainingPlanHolidays() {
      try {
        const response = await fetch('/api/training-plan-holidays/');
        if (!response.ok) {
          return;
        }

        const items = (await response.json()) as Holiday[];
        if (!Array.isArray(items) || cancelled) {
          return;
        }

        setHolidays(items);
      } catch {
        // Keep the current in-memory holidays if loading fails.
      }
    }

    async function loadCatalogModules() {
      try {
        const response = await fetch('/api/modules/');
        if (!response.ok) {
          return;
        }

        const raw = (await response.json()) as (CatalogModule & { sessionNames?: string[]; sessionDescriptions?: string[] })[];
        if (!Array.isArray(raw) || cancelled) {
          return;
        }

        const items: CatalogModule[] = raw.map(m => ({ ...m, sessionNames: m.sessionNames ?? [], sessionDescriptions: m.sessionDescriptions ?? [] }));
        setCatalogModules(items);
      } catch {
        // Keep current catalog modules if loading fails.
      }
    }

    void loadTrainingPlanModules();
    void loadTrainingPlanProgramConfigs();
    void loadTrainingPlanHolidays();
    void loadCatalogModules();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return;

    const controller = new AbortController();
    const payload = { items: flattenGroupsForApi(groups) };

    // Do not POST an empty items array — that would wipe the database on the server.
    if (!Array.isArray(payload.items)) {
      return () => controller.abort();
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving cohorts...');

    void (async () => {
      try {
        const response = await fetch('/api/training-plan/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = (await response.text()).trim();
          throw new Error(errorText || `Request failed with status ${response.status}`);
        }

        setTrainingPlanSaveState('saved');
        setTrainingPlanSaveMessage(`Saved to database at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown save error';
        setTrainingPlanSaveState('error');
        setTrainingPlanSaveMessage('Save failed. Refresh would lose the latest cohort changes.');

        void kbcSwal.fire({
          title: 'Cohort Not Saved',
          html: `The latest cohort change is visible on screen, but it did not reach the database.<br /><br /><strong>Details:</strong> ${message}`,
          icon: 'error',
          confirmButtonText: 'OK',
        });
      }
    })();

    return () => controller.abort();
  }, [groups]);

  const isInitialProgrammesLoading = !hasLoadedTrainingPlan || !hasLoadedProgramConfigs;

  const persistTrainingPlan = async (nextGroups: ProgrammeGroup[], silent = false) => {
    const payload = { items: flattenGroupsForApi(nextGroups) };

    if (!Array.isArray(payload.items)) {
      return false;
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving cohorts...');

    try {
      const response = await fetch('/api/training-plan/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Saved to database at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      if (!silent) {
        await kbcSuccessSwal.fire({
          icon: 'success',
          title: 'Cohort saved successfully',
          confirmButtonText: 'OK',
        });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Save failed. Refresh would lose the latest cohort changes.');

      await kbcSwal.fire({
        title: 'Cohort Not Saved',
        html: `The latest cohort change was not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });

      return false;
    }
  };

  const persistHolidays = async (nextHolidays: Holiday[]) => {
    const payload = { items: nextHolidays };

    try {
      const response = await fetch('/api/training-plan-holidays/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      const result = await response.json() as { saved?: number; items?: Holiday[] };
      const persistedItems = Array.isArray(result.items) ? result.items : [];

      if (typeof result.saved !== 'number') {
        throw new Error('The server did not confirm how many holiday periods were saved.');
      }

      if (result.saved !== nextHolidays.length) {
        throw new Error(`Saved ${result.saved} of ${nextHolidays.length} holiday periods.`);
      }

      if (persistedItems.length !== nextHolidays.length) {
        throw new Error(`The database returned ${persistedItems.length} of ${nextHolidays.length} holiday periods.`);
      }

      const expectedSnapshot = JSON.stringify(
        nextHolidays
          .map(item => ({
            label: item.label,
            startDate: item.startDate,
            endDate: item.endDate,
            type: item.type,
            color: item.color,
          }))
          .sort((a, b) => `${a.startDate}-${a.endDate}-${a.label}`.localeCompare(`${b.startDate}-${b.endDate}-${b.label}`)),
      );
      const persistedSnapshot = JSON.stringify(
        persistedItems
          .map(item => ({
            label: item.label,
            startDate: item.startDate,
            endDate: item.endDate,
            type: item.type,
            color: item.color,
          }))
          .sort((a, b) => `${a.startDate}-${a.endDate}-${a.label}`.localeCompare(`${b.startDate}-${b.endDate}-${b.label}`)),
      );

      if (persistedSnapshot !== expectedSnapshot) {
        throw new Error('The saved holiday periods returned from the database did not match the submitted values.');
      }

      setHolidays(persistedItems);
      await kbcSuccessSwal.fire({
        icon: 'success',
        title: 'Holiday periods saved successfully',
        confirmButtonText: 'OK',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      await kbcSwal.fire({
        title: 'Holiday Periods Not Saved',
        html: `The latest holiday changes were not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
      return false;
    }
  };

  const persistCustomModules = async (nextModules: CustomModule[]) => {
    const payload = {
      items: nextModules.map(module => ({
        id: module.id,
        name: module.name,
        defaultSessions: module.defaultSessions,
        bg: module.bg,
        tx: module.tx,
      })),
    };

    const response = await fetch('/api/training-plan-modules/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    const result = await response.json() as { items?: Array<{ id: string; name: string; defaultSessions: number; bg: string; tx: string }> };
    return Array.isArray(result.items)
      ? result.items.map(item => ({
          id: item.id,
          name: item.name,
          defaultSessions: item.defaultSessions,
          bg: item.bg,
          tx: item.tx,
        }))
      : nextModules;
  };

  const persistProgramConfigs = async (
    nextCustomPrograms: CustomProgram[],
  ) => {
    const payload = {
      items: nextCustomPrograms,
    };
    const response = await fetch('/api/training-plan-program-configs/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    const result = await response.json() as { items?: TrainingPlanProgramConfigPayload[] };
    return Array.isArray(result.items) ? result.items : payload.items;
  };

  const handleSave = async (groupIdx: number, row: CohortRow, prevGroupIdx?: number) => {
    if (!canManageCohorts) {
      return false;
    }

    // Build next state synchronously so we can persist immediately and ensure UI updates.
    const next = groups.map(g => ({ ...g, rows: [...g.rows] }));
    if (modal.open && modal.mode === 'edit') {
      const pgi = prevGroupIdx ?? groupIdx;
      next[pgi].rows.splice(modal.rowIdx, 1);
      const insertAt = groupIdx === pgi ? modal.rowIdx : next[groupIdx].rows.length;
      next[groupIdx].rows.splice(insertAt, 0, row);
    } else {
      next[groupIdx].rows.push(row);
    }

    const saved = await persistTrainingPlan(next);
    if (!saved) {
      return false;
    }

    setTrainingPlanItems(flattenGroupsForApi(next));
    setGroups(next);
    setModal({ open: false });

    return true;
  };

  const handleDeleteRow = async (groupIdx: number, rowIdx: number) => {
    if (!canManageCohorts) {
      return;
    }

    const target = groups[groupIdx]?.rows[rowIdx];
    if (!target) {
      throw new Error('The selected cohort could not be found.');
    }

    const next = groups.map((g, gi) =>
      gi === groupIdx ? { ...g, rows: g.rows.filter((_, ri) => ri !== rowIdx) } : { ...g, rows: [...g.rows] }
    );

    const saved = await persistTrainingPlan(next, true);
    if (!saved) {
      throw new Error('The training plan save was not completed.');
    }

    setTrainingPlanItems(flattenGroupsForApi(next));
    setGroups(next);
  };

  const handleReorderRow = async (fromGroupIdx: number, fromRowIdx: number, toGroupIdx: number, toRowIdx: number) => {
    if (!canManageCohorts) return;
    const next = groups.map(g => ({ ...g, rows: [...g.rows] }));
    const [moved] = next[fromGroupIdx].rows.splice(fromRowIdx, 1);
    const insertAt = fromGroupIdx === toGroupIdx && fromRowIdx < toRowIdx ? toRowIdx - 1 : toRowIdx;
    next[toGroupIdx].rows.splice(insertAt, 0, moved);
    setGroups(next);
    await persistTrainingPlan(next, true);
  };

  const handleReorderGroup = async (fromGroupIdx: number, toGroupIdx: number) => {
    if (!canManageCohorts) return;
    const next = [...groups];
    const [moved] = next.splice(fromGroupIdx, 1);
    const insertAt = fromGroupIdx < toGroupIdx ? toGroupIdx - 1 : toGroupIdx;
    next.splice(insertAt, 0, moved);
    setGroups(next);
    await persistTrainingPlan(next, true);
  };

  const handleEditRow = (groupIdx: number, rowIdx: number, expandedBlockId?: string, returnToChoice = false) => {
    if (!canManageCohorts) {
      return;
    }

    const row = groups[groupIdx].rows[rowIdx];
    setReturnEditChoice(returnToChoice && expandedBlockId ? { groupIdx, rowIdx, blockId: expandedBlockId } : null);
    setModal({ open: true, mode: 'edit', groupIdx, rowIdx, row, expandedBlockId });
  };

  const handleEditScheduleRow = (groupIdx: number, rowIdx: number, blockId: string) => {
    if (!canManageCohorts) {
      return;
    }
    handleEditRow(groupIdx, rowIdx, blockId);
  };

  const handleAddModule = async (mod: CustomModule) => {
    try {
      const next = [...customModules.filter(m => m.id !== mod.id), mod];
      const persistedModules = await persistCustomModules(next);
      setCustomModules(persistedModules);
      setShowAddModule(false);
      void kbcSuccessSwal.fire({
        icon: 'success',
        title: `Module "${mod.name}" added`,
        confirmButtonText: 'OK',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      void kbcSwal.fire({
        title: 'Module Not Saved',
        html: `The module was not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  const handleAddCatalogModule = async (mod: Omit<CatalogModule, 'id'>) => {
    try {
      const response = await fetch('/api/modules/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mod),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      const saved = (await response.json()) as CatalogModule;
      setCatalogModules(prev => [...prev, saved]);
      setShowAddCatalogModule(false);
      void kbcSuccessSwal.fire({
        icon: 'success',
        title: `Module "${mod.name}" added`,
        confirmButtonText: 'OK',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      void kbcSwal.fire({
        title: 'Module Not Saved',
        html: `The module was not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  const handleUpdateCatalogModule = async (mod: CatalogModule) => {
    const response = await fetch(`/api/modules/${mod.id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mod),
    });
    if (!response.ok) {
      const text = (await response.text()).trim();
      throw new Error(text || `Request failed with status ${response.status}`);
    }
    const updated = (await response.json()) as CatalogModule;
    setCatalogModules(prev => prev.map(m => m.id === updated.id ? updated : m));
  };

  const handleDeleteCatalogModule = async (id: number) => {
    const moduleName = catalogModules.find(m => m.id === id)?.name;

    const response = await fetch(`/api/modules/${id}/`, { method: 'DELETE' });
    if (!response.ok) {
      const text = (await response.text()).trim();
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    setCatalogModules(prev => prev.filter(m => m.id !== id));

    // Remove all blocks referencing this catalogue module from every group
    if (moduleName) {
      const nextGroups = groups.map(g => ({
        ...g,
        rows: g.rows.map(row => ({
          ...row,
          blks: row.blks.filter(blk => blk.mod !== moduleName),
        })).filter(row => row.blks.length > 0),
      }));
      const hasChanges = nextGroups.some((g, gi) =>
        g.rows.length !== groups[gi].rows.length ||
        g.rows.some((row, ri) => row.blks.length !== groups[gi].rows[ri]?.blks.length)
      );
      if (hasChanges) {
        const flattened = flattenGroupsForApi(nextGroups);
        setTrainingPlanItems(flattened);
        setGroups(nextGroups);
        // Silently persist — no success toast needed since the delete confirmation covers it
        void fetch('/api/training-plan/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: flattened }),
        });
      }
    }
  };

  const handleAddProgram = async (prog: CustomProgram) => {
    const existingCustom = customPrograms.some(program => program.id === prog.id);
    const nextCustomPrograms = [...customPrograms.filter(program => program.id !== prog.id), prog];

    try {
      const persistedItems = await persistProgramConfigs(nextCustomPrograms);
      setCustomPrograms(persistedItems);
      setProgramModal({ open: false });
      void kbcSuccessSwal.fire({
        icon: 'success',
        title: `Programme "${prog.name.replace('\n', ' ')}" ${existingCustom ? 'updated' : 'added'}`,
        confirmButtonText: 'OK',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      void kbcSwal.fire({
        title: 'Programme Not Saved',
        html: `The programme configuration was not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  const handleEditProgram = (programId: string) => {
    if (!canManageCohorts) {
      return;
    }

    setProgramModal({ open: true, mode: 'edit', programId });
  };

  const handleDeleteProgram = async (programId: string) => {
    if (!canManageCohorts) {
      return;
    }

    const group = groups.find(item => item.id === programId);
    if (!group) {
      return;
    }

    if (group.rows.length > 0) {
      await kbcSwal.fire({
        title: 'Programme Not Deleted',
        html: `The programme <strong>${group.name.replace('\n', ' ')}</strong> still has ${group.rows.length} cohort${group.rows.length === 1 ? '' : 's'}. Remove or move those cohorts first.`,
        icon: 'info',
        confirmButtonText: 'OK',
      });
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Delete Programme?',
      html: `The custom programme <strong>${group.name.replace('\n', ' ')}</strong> will be removed.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Programme',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const nextPrograms = customPrograms.filter(program => program.id !== programId);
      const persistedItems = await persistProgramConfigs(nextPrograms);
      setCustomPrograms(persistedItems);
      void kbcSuccessSwal.fire({
        icon: 'success',
        title: `Programme "${group.name.replace('\n', ' ')}" deleted`,
        confirmButtonText: 'OK',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      void kbcSwal.fire({
        title: 'Programme Not Deleted',
        html: `The programme configuration was not deleted from the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };

  const totalCohorts  = groups.reduce((s, g) => s + g.rows.length, 0);
  const totalGroups = groups.reduce((sum, group) => (
    sum + group.rows.reduce((rowSum, row) => {
      const groupKeys = new Set(
        row.blks.map(block => [
          (block.groupName || '').trim(),
          (block.coachName || '').trim(),
          (block.tutor || '').trim(),
          block.sessionStartTime || '',
          block.sessionEndTime || '',
          (block.days || []).join('|'),
        ].join('::')),
      );
      return rowSum + groupKeys.size;
    }, 0)
  ), 0);
  const totalModules = groups.reduce((sum, group) => (
    sum + group.rows.reduce((rowSum, row) => {
      const moduleKeys = new Set(
        row.blks.map(block => `${String(block.mod)}::${block.color || ''}::${block.startDate}::${block.endDate}::${block.sessions}`),
      );
      return rowSum + moduleKeys.size;
    }, 0)
  ), 0);
  const totalSessions = groups.reduce((s, g) =>
    s + g.rows.reduce((rs, r) => rs + r.blks.reduce((bs, b) => bs + b.sessions, 0), 0), 0);
  const holidayCount  = holidays.length;
  const selectedProgram = programModal.open && programModal.mode === 'edit'
    ? (() => {
      const customProgram = customPrograms.find(program => program.id === programModal.programId);
      if (customProgram) {
        return customProgram;
      }

      const group = groups.find(item => item.id === programModal.programId);
      return group
        ? { id: group.id, name: group.name, sub: group.sub, color: group.color }
        : undefined;
    })()
    : undefined;
  const selectedProgramGroup = programModal.open && programModal.mode === 'edit'
    ? groups.find(item => item.id === programModal.programId)
    : undefined;
  const visibleEditChoiceDetails = useMemo(() => {
    if (!visibleEditChoice) {
      return null;
    }
    const group = groups[visibleEditChoice.groupIdx];
    const row = group?.rows[visibleEditChoice.rowIdx];
    const block = row?.blks.find(item => item.id === visibleEditChoice.blockId);
    if (!group || !row || !block) {
      return null;
    }
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const rawValue = String(block.mod || '');
    const normalizedRaw = normalize(rawValue);
    const displayName = rawValue in MS ? getModuleMeta(block.mod as MKey).lbl : rawValue;
    const normalizedDisplay = normalize(displayName);
    const catalogModule = catalogModules.find(module => {
      const normalizedName = normalize(module.name);
      return String(module.id) === rawValue || normalizedName === normalizedRaw || normalizedName === normalizedDisplay;
    });
    return { group, row, block, displayName, catalogModule };
  }, [catalogModules, groups, visibleEditChoice]);

  const todaySessions = useMemo(() => {
    const today = new Date();
    const todayKey = DAY_NAMES[today.getDay()];
    const tStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const sessions: Array<{ cohortName: string; program: string; groupName: string; coach: string; tutor: string; startTime?: string; endTime?: string }> = [];

    groups.forEach(g => {
      g.rows.forEach(r => {
        r.blks.forEach(b => {
          if (!b.days || !b.days.length) return;
          if (!b.days.includes(todayKey as any)) return;
          const start = new Date(b.startDate + 'T00:00:00').getTime();
          const end = new Date(b.endDate + 'T23:59:59').getTime();
          if (tStart < start || tStart > end) return;
          sessions.push({
            cohortName: r.label,
            program: toProgrammeLabel(g),
            groupName: b.groupName || getModuleMeta(b.mod).lbl,
            coach: b.coachName || '',
            tutor: b.tutor || '',
            startTime: b.sessionStartTime,
            endTime: b.sessionEndTime,
          });
        });
      });
    });

    return sessions;
  }, [groups]);
  const monthlyModuleSummaries = useMemo(
    () => buildMonthlyModuleSummaries(groups, holidays, customModules),
    [customModules, groups, holidays],
  );

  return (
    <div className="min-h-screen bg-kbc-bg font-sans">
      <TopNav />

      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-400">
            <Link to="/" className="hover:text-kbc-navy transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line" />
            <Link to="/events" className="hover:text-kbc-navy transition-colors cursor-pointer">Events</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-kbc-navy font-semibold">Training Plan</span>
          </div>

          <div className="flex items-start justify-between gap-4 flex-wrap xl:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1B2A4A' }}>
                <i className="ri-time-line text-white text-base" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-kbc-navy leading-tight">
                  Apprenticeships Training Plan
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">Programme Structure 2025 – 2027</p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 ml-3 flex-wrap">
              {[
                { icon: 'ri-book-open-line',  label: `${groups.length} Programmes` },
                { icon: 'ri-group-line',       label: `${totalCohorts} Cohorts` },
                { icon: 'ri-team-line',        label: `${totalGroups} Groups` },
                { icon: 'ri-puzzle-line',      label: `${totalModules} Modules` },
                { icon: 'ri-stack-line',       label: `${totalSessions} Sessions` },
                { icon: 'ri-calendar-event-line', label: `${holidayCount} Holidays` },
                { icon: 'ri-live-line',        label: 'Apr 2026 Live' },
              ].map((s, i) => (
                <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
                  style={{ background: '#F0F4FF', color: '#2E4482', borderColor: '#D5DFF7' }}>
                  <i className={`${s.icon} text-xs`} />
                  {s.label}
                </span>
              ))}
            </div>

            <div className="hidden xl:flex items-center gap-2 ml-auto">
              {showHiddenCohortActions && canManageCohorts && (
                <button
                  onClick={() => setShowHolidayMgr(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-85 border"
                  style={{ background: '#FFF8E0', color: '#C49A00', borderColor: '#F7A800' }}>
                  <i className="ri-calendar-event-line" />
                  Holidays
                </button>
              )}

              {showHiddenCohortActions && canManageCohorts && (
                <div className="relative" ref={addDropdownRef}>
                  <button
                    onClick={() => setAddDropdownOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-all hover:opacity-85"
                    style={{ background: '#1B2A4A' }}>
                    <i className="ri-add-line" />
                    Add Cohort
                    {addDropdownOpen ? (
                      <i className="ri-arrow-up-s-line ml-0.5" />
                    ) : (
                      <i className="ri-arrow-down-s-line ml-0.5" />
                    )}
                  </button>
                  {addDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 overflow-hidden z-50 min-w-[200px]">
                      <p className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        Select Programme
                      </p>
                      {groups.map((g, gi) => (
                        <button
                          key={gi}
                          onClick={() => {
                            setModal({ open: true, mode: 'add', defaultGroupIdx: gi, lockGroupSelection: true });
                            setAddDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors text-left">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                          <div>
                            <p className="text-xs font-bold text-gray-800 leading-tight">
                              {g.name.split('\n')[0]}
                            </p>
                            <p className="text-xs text-gray-400 leading-tight">
                              {g.name.split('\n')[1] || ''} Â· {g.rows.length} cohort{g.rows.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 items-center xl:hidden">
            {canManageCohorts && (
              <button
                onClick={() => setShowHolidayMgr(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-85 border"
                style={{ background: '#FFF8E0', color: '#C49A00', borderColor: '#F7A800' }}>
                <i className="ri-calendar-event-line" />
                Holidays
              </button>
            )}
            {canManageCohorts && (
              <button
                onClick={() => setShowAddCatalogModule(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-85 border"
                style={{ background: '#F0F7FF', color: '#1D6FA4', borderColor: '#93C5FD' }}>
                <i className="ri-puzzle-line" />
                Add Module
              </button>
            )}
            {canManageCohorts && (
              <button
                onClick={() => {
                  setInitialManageModuleId(null);
                  setShowManageModules(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-85 border"
                style={{ background: '#F0FFF4', color: '#15803D', borderColor: '#86EFAC' }}>
                <i className="ri-list-check-2" />
                View Added Modules
              </button>
            )}
            {canManageCohorts && (
              <button
                onClick={() => setProgramModal({ open: true, mode: 'add' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-all hover:opacity-85"
                style={{ background: '#1B2A4A' }}>
                <i className="ri-add-circle-line" />
                Add Programme
              </button>
            )}

            {showHiddenCohortActions && canManageCohorts && (
              <div className="relative" ref={addDropdownRef}>
                <button
                  onClick={() => setAddDropdownOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-all hover:opacity-85"
                  style={{ background: '#1B2A4A' }}>
                  <i className="ri-add-line" />
                  Add Cohort
                  {addDropdownOpen ? (
                    <i className="ri-arrow-up-s-line ml-0.5" />
                  ) : (
                    <i className="ri-arrow-down-s-line ml-0.5" />
                  )}
                </button>
                {addDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 overflow-hidden z-50 min-w-[200px]">
                    <p className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      Select Programme
                    </p>
                    {groups.map((g, gi) => (
                      <button
                        key={gi}
                        onClick={() => {
                          setModal({ open: true, mode: 'add', defaultGroupIdx: gi, lockGroupSelection: true });
                          setAddDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors text-left">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                        <div>
                          <p className="text-xs font-bold text-gray-800 leading-tight">
                            {g.name.split('\n')[0]}
                          </p>
                          <p className="text-xs text-gray-400 leading-tight">
                            {g.name.split('\n')[1] || ''} · {g.rows.length} cohort{g.rows.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 md:px-6 py-5 space-y-4">
        {/* Today's Sessions */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold text-kbc-navy">Today's Sessions</h2>
          {isInitialProgrammesLoading ? (
            <div className="mt-3 space-y-3 animate-pulse">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-32 rounded-full bg-slate-200" />
                    <div className="mt-2 h-3 w-48 rounded-full bg-slate-200" />
                  </div>
                  <div className="h-4 w-20 rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          ) : todaySessions.length === 0 ? (
            <p className="text-xs text-gray-400 mt-2">No sessions yet. Add cohorts and module blocks to populate this schedule.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {todaySessions.map((s, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-semibold">{s.groupName}</p>
                    <p className="text-xs text-gray-500">{s.cohortName} · {s.program}</p>
                    <p className="text-xs text-gray-400">Tutor: {s.tutor || 'TBD'}</p>
                    <p className="text-xs text-gray-400">Coach: {s.coach || 'TBD'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{s.startTime}{s.endTime ? ` - ${s.endTime}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg p-1">
          <div className="flex items-center gap-1 min-w-0">
            {([
              { key: 'gantt',    label: 'Training Plan', icon: 'ri-bar-chart-horizontal-line' },
              { key: 'schedule', label: 'Session Schedule', icon: 'ri-table-line' },
              { key: 'tutors',   label: 'Tutor Profiles', icon: 'ri-user-star-line' },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all whitespace-nowrap"
                style={{
                  background: activeTab === tab.key ? '#1B2A4A' : 'transparent',
                  color:      activeTab === tab.key ? '#fff'    : '#6B7280',
                }}>
                <i className={tab.icon} />
                {tab.label}
              </button>
            ))}
          </div>
          {canManageCohorts && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowHolidayMgr(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-90 border"
                style={{ background: '#FFF8E0', color: '#C49A00', borderColor: '#F7A800' }}>
                <i className="ri-calendar-event-line" />
                Holidays
              </button>
              <button
                onClick={() => setShowAddCatalogModule(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-90 border"
                style={{ background: '#F0F7FF', color: '#1D6FA4', borderColor: '#93C5FD' }}>
                <i className="ri-puzzle-line" />
                Add Module
              </button>
              <button
                onClick={() => {
                  setInitialManageModuleId(null);
                  setShowManageModules(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-90 border"
                style={{ background: '#F0FFF4', color: '#15803D', borderColor: '#86EFAC' }}>
                <i className="ri-list-check-2" />
                View Added Modules
              </button>
              <button
                onClick={() => setProgramModal({ open: true, mode: 'add' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-all hover:opacity-90"
                style={{ background: '#1B2A4A' }}>
                <i className="ri-add-circle-line" />
                Add Programme
              </button>
            </div>
          )}
        </div>

        {/* GANTT CARD */}
        {activeTab === 'gantt' && (
          isInitialProgrammesLoading ? (
            <TrainingPlanPanelSkeleton />
          ) : groups.length ? (
            <>
              <MonthlyModuleBreakdown summaries={monthlyModuleSummaries} />
              <div className="bg-white rounded-xl overflow-visible border border-gray-200">
                <GanttTimeline
                  groups={groups}
                  holidays={holidays}
                  customModules={customModules}
                  catalogModules={catalogModules}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  onManageHolidays={() => setShowHolidayMgr(true)}
                  onAddRow={(gi) => {
                    if (!canManageCohorts) {
                      return;
                    }
                    setModal({ open: true, mode: 'add', defaultGroupIdx: gi, lockGroupSelection: true });
                  }}
                  onEditRow={handleEditRow}
                  onEditCatalogModule={(moduleId) => {
                    setInitialManageModuleId(moduleId);
                    setShowManageModules(true);
                  }}
                  onDeleteRow={handleDeleteRow}
                  onEditProgram={handleEditProgram}
                  onDeleteProgram={handleDeleteProgram}
                  onReorderRow={handleReorderRow}
                  onReorderGroup={handleReorderGroup}
                  canManageCohorts={canManageCohorts}
                />
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-kbc-navy/5 text-kbc-navy">
                <i className="ri-book-open-line text-xl" />
              </div>
              <h2 className="mt-4 text-base font-bold text-kbc-navy">No programmes saved yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                This view now loads programmes from the database only. Add a programme to create the first training plan group.
              </p>
              {canManageCohorts && (
                <button
                  onClick={() => setProgramModal({ open: true, mode: 'add' })}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: '#1B2A4A' }}>
                  <i className="ri-add-circle-line" />
                  Add Programme
                </button>
              )}
            </div>
          )
        )}

        {/* SESSION SCHEDULE */}
        {activeTab === 'schedule' && (
          isInitialProgrammesLoading ? (
            <SessionScheduleSkeleton />
          ) : groups.length ? (
            <ScheduleTable
              groups={groups}
              catalogModules={catalogModules}
              canEdit={canManageCohorts}
              onEditTrainingPlan={handleEditScheduleRow}
            />
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
              No session schedule yet because there are no saved programmes in the database.
            </div>
          )
        )}

        {/* TUTOR PROFILES */}
        {activeTab === 'tutors' && (
          isInitialProgrammesLoading ? (
            <SessionScheduleSkeleton />
          ) : groups.length ? (
            <TutorProfiles
              groups={groups}
              catalogModules={catalogModules}
              canEdit={canManageCohorts}
              onEditTrainingPlan={handleEditScheduleRow}
            />
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
              No tutor profiles yet because there are no saved programmes in the database.
            </div>
          )
        )}

      </main>
      <Footer />

      {/* Modals */}
      {canManageCohorts && visibleEditChoice && visibleEditChoiceDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[5px]" onClick={() => setVisibleEditChoice(null)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/60">{visibleEditChoiceDetails.group.name.replace('\n', ' ')} - {visibleEditChoiceDetails.row.label}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">Choose What To Edit</h3>
                <p className="mt-1 text-xs text-white/70">{visibleEditChoiceDetails.displayName}</p>
              </div>
              <button onClick={() => setVisibleEditChoice(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="grid gap-3 bg-gray-50 p-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  const target = visibleEditChoice;
                  setVisibleEditChoice(null);
                  handleEditRow(target.groupIdx, target.rowIdx, target.blockId, true);
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
                  {visibleEditChoiceDetails.block.groupName || 'Selected group'} - {visibleEditChoiceDetails.block.startDate} to {visibleEditChoiceDetails.block.endDate}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = visibleEditChoiceDetails.catalogModule;
                  if (!target) return;
                  setInitialManageModuleId(target.id);
                  setShowManageModules(true);
                }}
                disabled={!visibleEditChoiceDetails.catalogModule}
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
                  {visibleEditChoiceDetails.catalogModule
                    ? `${visibleEditChoiceDetails.catalogModule.name} - ${visibleEditChoiceDetails.catalogModule.sessions || 0} sessions`
                    : 'No matching catalogue module found'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {canManageCohorts && modal.open && (
        <CohortModal
          mode={modal.mode}
          groups={groups}
          holidays={holidays}
          customModules={customModules}
          catalogModules={catalogModules}
          initialGroupIdx={modal.mode === 'add' ? modal.defaultGroupIdx : modal.groupIdx}
          initialRow={modal.mode === 'edit' ? modal.row : undefined}
          initialExpandedBlockId={modal.mode === 'edit' ? modal.expandedBlockId : undefined}
          lockGroupSelection={modal.open && modal.mode === 'add' && 'lockGroupSelection' in modal ? modal.lockGroupSelection : false}
          onSave={handleSave}
          onManageHolidays={() => setShowHolidayMgr(true)}
          onBackToPreviousStep={() => {
            setModal({ open: false });
            if (returnEditChoice) {
              setVisibleEditChoice(returnEditChoice);
              setReturnEditChoice(null);
            }
          }}
          onClose={() => {
            setModal({ open: false });
            setReturnEditChoice(null);
          }}
        />
      )}

      {canManageCohorts && showHolidayMgr && (
        <HolidayManager
          holidays={holidays}
          onSave={persistHolidays}
          onClose={() => setShowHolidayMgr(false)}
        />
      )}

      {canManageCohorts && showAddModule && (
        <AddModuleModal
          onSave={handleAddModule}
          onClose={() => setShowAddModule(false)}
        />
      )}

      {canManageCohorts && showAddCatalogModule && (
        <AddModuleCatalogModal
          onSave={handleAddCatalogModule}
          onClose={() => setShowAddCatalogModule(false)}
        />
      )}

      {canManageCohorts && programModal.open && (
        programModal.mode === 'add' ? (
          <AddProgramModal
            onSave={handleAddProgram}
            onClose={() => setProgramModal({ open: false })}
          />
        ) : (
          selectedProgram && selectedProgramGroup && (
            <ManageProgramModal
              program={selectedProgram}
              group={selectedProgramGroup}
              onSave={handleAddProgram}
              onClose={() => setProgramModal({ open: false })}
              onAddCohort={() => {
                const groupIdx = groups.findIndex(item => item.id === selectedProgramGroup.id);
                setProgramModal({ open: false });
                if (groupIdx >= 0) {
                  setModal({ open: true, mode: 'add', defaultGroupIdx: groupIdx, lockGroupSelection: true });
                }
              }}
              onEditCohort={(rowIdx) => {
                const groupIdx = groups.findIndex(item => item.id === selectedProgramGroup.id);
                const row = groups[groupIdx]?.rows[rowIdx];
                setProgramModal({ open: false });
                if (groupIdx >= 0 && row) {
                  setModal({ open: true, mode: 'edit', groupIdx, rowIdx, row });
                }
              }}
              onDeleteCohort={(rowIdx) => {
                const groupIdx = groups.findIndex(item => item.id === selectedProgramGroup.id);
                if (groupIdx >= 0) {
                  void handleDeleteRow(groupIdx, rowIdx);
                }
              }}
              onDeleteProgram={() => {
                setProgramModal({ open: false });
                void handleDeleteProgram(selectedProgramGroup.id);
              }}
            />
          )
        )
      )}

      {canManageCohorts && showManageModules && (
        <ManageModulesModal
          modules={catalogModules}
          onAdd={handleAddCatalogModule}
          onUpdate={handleUpdateCatalogModule}
          onDelete={handleDeleteCatalogModule}
          initialEditModuleId={initialManageModuleId}
          onClose={() => {
            setShowManageModules(false);
            setInitialManageModuleId(null);
          }}
        />
      )}
    </div>
  );
}
