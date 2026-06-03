import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '@/components/feature/TopNav';
import Footer from '@/components/feature/Footer';
import type { ProgrammeGroup, CohortRow, Holiday, ZoomLevel, MKey, WeekDayKey, CustomModule, CustomProgram, CatalogModule, SessionKsbMapping, KsbProfile } from './types';
import { MS, getModuleMeta } from './data';
import GanttTimeline from './components/GanttTimeline';
import CohortModal from './components/CohortModal';
import HolidayManager from './components/HolidayManager';
import AddModuleModal from './components/AddModuleModal';
import AddModuleCatalogModal from './components/AddModuleCatalogModal';
import ManageModulesModal from './components/ManageModulesModal';
import AddProgramModal from './components/AddProgramModal';
import ManageProgramModal from './components/ManageProgramModal';
import KsbProfilesManager from './components/KsbProfilesManager';
import ScheduleTable from '@/pages/apprenticeships-timeline/components/ScheduleTable';
import TutorProfiles from './components/TutorProfiles';
import useAccessControl from '@/hooks/useAccessControl';
import { kbcSuccessSwal, kbcSwal } from '@/components/feature/sweetAlert';
import { buildHolidayAdjustedSessionPlan } from './utils';
import { useRealtimeResource } from '@/hooks/useRealtimeUpdates';

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
  sessionKsbMappings?: SessionKsbMapping[];
  ksbProfileId?: string;
  notes: string;
}

interface MonthlySessionDetail {
  date: string;
  sessionName: string;
  ksbMappings: SessionKsbMapping;
  tutor: string;
  coach: string;
  time: string;
  holidays: MonthlyHolidayDetail[];
  isClash: boolean;
  isReplacement: boolean;
  countedNumber: number | null;
  shiftedFrom?: {
    date: string;
    holidays: MonthlyHolidayDetail[];
  };
  shiftedTo?: string;
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
  scheduledSessions: number;
  countedSessions: number;
  totalWeeks: number;
  baselineEndDate: string;
  effectiveEndDate: string;
  extensionDays: number;
  sessionDayLabel: string;
  color: string;
  textColor: string;
  affectedSessions: number;
  extensionAffectedSessions: number;
  months: ModuleMonthSummary[];
}

const HOLIDAY_MARKER_PREFIX = '__holiday_ids:';
const COHORT_COLOR_MARKER_PREFIX = '__cohort_color:';
const MODULE_COLOR_MARKER_PREFIX = '__module_color:';
const COHORT_END_DATE_MARKER_PREFIX = '__cohort_end_date:';
const GROUP_NAME_MARKER_PREFIX = '__group_name:';
const COACH_NAME_MARKER_PREFIX = '__coach_name:';
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function emptySessionKsbMapping(): SessionKsbMapping {
  return { knowledgeCodes: [], skillCodes: [], behaviourCodes: [] };
}

function normalizeKsbCodes(value: unknown, prefix: 'K' | 'S' | 'B'): string[] {
  if (!Array.isArray(value)) return [];
  const pattern = new RegExp(`^${prefix}\\d+$`, 'i');
  const seen = new Set<string>();
  return value.reduce<string[]>((codes, item) => {
    const code = String(item || '').trim().toUpperCase();
    if (!code || seen.has(code) || !pattern.test(code)) return codes;
    seen.add(code);
    codes.push(code);
    return codes;
  }, []);
}

function normalizeSessionKsbMappings(value: unknown, count = 0): SessionKsbMapping[] {
  const raw = Array.isArray(value) ? value : [];
  const length = Math.max(count, raw.length);
  return Array.from({ length }, (_, index) => {
    const item = raw[index];
    const record = item && typeof item === 'object' ? item as Partial<SessionKsbMapping> : {};
    return {
      knowledgeCodes: normalizeKsbCodes(record.knowledgeCodes, 'K'),
      skillCodes: normalizeKsbCodes(record.skillCodes, 'S'),
      behaviourCodes: normalizeKsbCodes(record.behaviourCodes, 'B'),
    };
  });
}

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
        ksbProfileId: item.ksbProfileId || undefined,
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
    if (item.ksbProfileId && !cohort.ksbProfileId) {
      cohort.ksbProfileId = item.ksbProfileId;
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
      sessionKsbMappings: normalizeSessionKsbMappings(item.sessionKsbMappings, sessions),
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
        sessionKsbMappings: normalizeSessionKsbMappings(block.sessionKsbMappings, block.sessions),
        ksbProfileId: row.ksbProfileId || '',
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

function sessionDayLabel(days?: string[]): string {
  const cleanDays = (days || []).map(day => day.trim()).filter(Boolean);
  if (!cleanDays.length) return 'weekly';
  return cleanDays.map(day => day.charAt(0).toUpperCase() + day.slice(1)).join('/');
}

function getSessionStatusLabel(session: MonthlySessionDetail): string {
  if (session.isReplacement && session.isClash) return 'Replacement clash, not counted';
  if (session.isClash) return 'Shifted, not counted';
  if (session.isReplacement) return 'Replacement session';
  return 'Normal session';
}

function getSessionStatusClass(session: MonthlySessionDetail): string {
  if (session.isReplacement && session.isClash) return 'border-red-200 border-l-red-500 bg-red-50 text-red-800';
  if (session.isClash) return 'border-red-200 border-l-red-500 bg-red-50 text-red-800';
  if (session.isReplacement) return 'border-emerald-200 border-l-emerald-500 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 border-l-slate-300 bg-white text-gray-700';
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

function normalizeModuleLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveCatalogModuleForBlock(block: { mod: MKey | string }, moduleName: string, catalogModules: CatalogModule[]): CatalogModule | undefined {
  const rawValue = String(block.mod || '');
  const normalizedRaw = normalizeModuleLookup(rawValue);
  const normalizedModuleName = normalizeModuleLookup(moduleName);
  return catalogModules.find(module => {
    const normalizedName = normalizeModuleLookup(module.name);
    return String(module.id) === rawValue || normalizedName === normalizedRaw || normalizedName === normalizedModuleName;
  });
}

function escapeAlertHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getTrainingModuleLabel(block: { mod: MKey | string; color?: string }, customModules: CustomModule[]): string {
  return resolveTrainingModuleMeta(block, customModules).lbl;
}

interface TimelineSessionRisk {
  blockId: string;
  moduleName: string;
  programmeName: string;
  cohortName: string;
  groupName: string;
  tutor: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface SaveRiskSummary {
  holidayClashes: {
    moduleName: string;
    date: string;
    holidays: string;
  }[];
  tutorConflicts: {
    date: string;
    time: string;
    tutor: string;
    moduleName: string;
    groupName: string;
    conflictWith: string;
  }[];
}

function getRowActiveHolidays(row: CohortRow, holidays: Holiday[]): Holiday[] {
  const selectedHolidayIds = new Set(row.holidayIds || []);
  return selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
}

function collectTimelineSessions(groups: ProgrammeGroup[], holidays: Holiday[], customModules: CustomModule[]): TimelineSessionRisk[] {
  return groups.flatMap(group =>
    group.rows.flatMap(row => {
      const rowHolidays = getRowActiveHolidays(row, holidays);
      return row.blks.flatMap(block => {
        const tutor = (block.tutor || '').trim();
        const startTime = block.sessionStartTime || '';
        const endTime = block.sessionEndTime || '';
        if (!tutor || !startTime || !endTime) {
          return [];
        }

        const plan = buildHolidayAdjustedSessionPlan(block, rowHolidays);
        return plan.sessions.map(session => ({
          blockId: block.id,
          moduleName: getTrainingModuleLabel(block, customModules),
          programmeName: group.name.replace('\n', ' '),
          cohortName: row.label,
          groupName: block.groupName || row.label,
          tutor,
          date: session.date,
          startTime,
          endTime,
        }));
      });
    }),
  );
}

function analyzeSavedRowRisks(
  nextGroups: ProgrammeGroup[],
  savedRow: CohortRow,
  holidays: Holiday[],
  customModules: CustomModule[],
): SaveRiskSummary {
  const rowHolidays = getRowActiveHolidays(savedRow, holidays);
  const holidayClashes = savedRow.blks.flatMap(block => {
    const plan = buildHolidayAdjustedSessionPlan(block, rowHolidays);
    return plan.skippedSessions.map(session => ({
      moduleName: getTrainingModuleLabel(block, customModules),
      date: session.date,
      holidays: session.holidays.map(holiday => holiday.label).join(', ') || 'linked holiday',
    }));
  });

  const allSessions = collectTimelineSessions(nextGroups, holidays, customModules);
  const sessionsByKey = new Map<string, TimelineSessionRisk[]>();
  allSessions.forEach(session => {
    const key = `${session.date}|${session.startTime}|${session.endTime}|${session.tutor.trim().toLowerCase()}`;
    const list = sessionsByKey.get(key) || [];
    list.push(session);
    sessionsByKey.set(key, list);
  });

  const savedBlockIds = new Set(savedRow.blks.map(block => block.id));
  const seenConflicts = new Set<string>();
  const tutorConflicts: SaveRiskSummary['tutorConflicts'] = [];
  allSessions
    .filter(session => savedBlockIds.has(session.blockId))
    .forEach(session => {
      const key = `${session.date}|${session.startTime}|${session.endTime}|${session.tutor.trim().toLowerCase()}`;
      const conflicts = (sessionsByKey.get(key) || []).filter(other => other.blockId !== session.blockId);
      conflicts.forEach(other => {
        const conflictKey = [session.blockId, other.blockId].sort().join('|') + `|${key}`;
        if (seenConflicts.has(conflictKey)) {
          return;
        }
        seenConflicts.add(conflictKey);
        tutorConflicts.push({
          date: session.date,
          time: `${session.startTime} - ${session.endTime}`,
          tutor: session.tutor,
          moduleName: session.moduleName,
          groupName: session.groupName,
          conflictWith: `${other.moduleName} / ${other.programmeName} / ${other.groupName || other.cohortName}`,
        });
      });
    });

  return { holidayClashes, tutorConflicts };
}

function buildSaveRiskAlertHtml(risks: SaveRiskSummary): string {
  const holidayRows = risks.holidayClashes.slice(0, 5).map(item => `
    <li style="margin:4px 0;">
      <strong>${escapeAlertHtml(item.moduleName)}</strong> on ${escapeAlertHtml(formatPlanDate(item.date))}
      clashes with ${escapeAlertHtml(item.holidays)}.
    </li>
  `).join('');
  const tutorRows = risks.tutorConflicts.slice(0, 5).map(item => `
    <li style="margin:4px 0;">
      <strong>${escapeAlertHtml(item.tutor)}</strong> has ${escapeAlertHtml(item.moduleName)}
      at ${escapeAlertHtml(item.time)} on ${escapeAlertHtml(formatPlanDate(item.date))}
      conflicting with ${escapeAlertHtml(item.conflictWith)}.
    </li>
  `).join('');
  const hiddenHolidayCount = Math.max(0, risks.holidayClashes.length - 5);
  const hiddenTutorCount = Math.max(0, risks.tutorConflicts.length - 5);

  return `
    <div style="text-align:left;color:#334155;font-size:13px;line-height:1.45;">
      <p style="margin:0 0 10px;">
        This module/cohort can be saved, but it will create timeline warnings.
        You can continue now and fix them later, or go back and edit the dates/tutor.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px;">
        <span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:#FEF2F2;color:#B91C1C;padding:5px 9px;font-weight:800;">
          ${risks.holidayClashes.length} holiday clash${risks.holidayClashes.length === 1 ? '' : 'es'}
        </span>
        <span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:#FFFBEB;color:#92400E;padding:5px 9px;font-weight:800;">
          ${risks.tutorConflicts.length} tutor conflict${risks.tutorConflicts.length === 1 ? '' : 's'}
        </span>
      </div>
      ${holidayRows ? `<p style="margin:10px 0 4px;font-weight:800;color:#B91C1C;">Holiday clashes</p><ul style="margin:0 0 8px 18px;padding:0;">${holidayRows}</ul>` : ''}
      ${hiddenHolidayCount ? `<p style="margin:0 0 8px;color:#64748B;">+${hiddenHolidayCount} more holiday clash${hiddenHolidayCount === 1 ? '' : 'es'}.</p>` : ''}
      ${tutorRows ? `<p style="margin:10px 0 4px;font-weight:800;color:#92400E;">Tutor conflicts</p><ul style="margin:0 0 8px 18px;padding:0;">${tutorRows}</ul>` : ''}
      ${hiddenTutorCount ? `<p style="margin:0;color:#64748B;">+${hiddenTutorCount} more tutor conflict${hiddenTutorCount === 1 ? '' : 's'}.</p>` : ''}
    </div>
  `;
}

function buildMonthlyModuleSummaries(groups: ProgrammeGroup[], holidays: Holiday[], customModules: CustomModule[], catalogModules: CatalogModule[]): ModuleMonthlySummary[] {
  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.map(block => {
        const meta = resolveTrainingModuleMeta(block, customModules);
        const catalogModule = resolveCatalogModuleForBlock(block, meta.lbl, catalogModules);
        const months = new Map<string, ModuleMonthSummary>();
        const selectedHolidayIds = new Set(row.holidayIds || []);
        const scopedHolidays = selectedHolidayIds.size
          ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id))
          : holidays;
        const sessionPlan = buildHolidayAdjustedSessionPlan(block, scopedHolidays);
        const affectedSessions = sessionPlan.originalClashedSessions;
        const extensionAffectedSessions = sessionPlan.extensionClashedSessions;
        const toMonthlyHoliday = (holiday: Holiday): MonthlyHolidayDetail => ({
          id: holiday.id,
          label: holiday.label,
          type: holiday.type,
          dateRange: `${formatPlanDate(holiday.startDate)} - ${formatPlanDate(holiday.endDate)}`,
          color: holiday.color,
        });
        const shiftedToByDate = new Map<string, string>();
        sessionPlan.sessions.forEach(sessionDate => {
          if (sessionDate.shiftedFrom) {
            shiftedToByDate.set(sessionDate.shiftedFrom.date, sessionDate.date);
          }
        });

        sessionPlan.sessions.forEach(sessionDate => {
          const date = sessionDate.date;
          const monthKey = monthKeyFromDate(date);
          if (!months.has(monthKey)) {
            months.set(monthKey, { key: monthKey, label: formatPlanMonth(monthKey), sessions: [], holidays: [] });
          }
          const mappingIndex = Math.max(0, (sessionDate.countedNumber || sessionDate.originalNumber) - 1);
          const shiftedFrom = sessionDate.shiftedFrom
            ? {
              date: sessionDate.shiftedFrom.date,
              holidays: sessionDate.shiftedFrom.holidays.map(toMonthlyHoliday),
            }
            : undefined;
          months.get(monthKey)!.sessions.push({
            date,
            sessionName: catalogModule?.sessionNames?.[(sessionDate.countedNumber || sessionDate.originalNumber) - 1]?.trim() || `Session ${sessionDate.countedNumber || sessionDate.originalNumber}`,
            ksbMappings: block.sessionKsbMappings?.[mappingIndex] || emptySessionKsbMapping(),
            tutor: block.tutor || 'TBD',
            coach: block.coachName || 'TBD',
            time: `${block.sessionStartTime || '09:00'}${block.sessionEndTime ? ` - ${block.sessionEndTime}` : ''}`,
            holidays: [],
            isClash: sessionDate.isClash,
            isReplacement: sessionDate.isExtension,
            countedNumber: sessionDate.countedNumber,
            shiftedFrom,
          });
        });

        sessionPlan.skippedSessions.forEach(skippedSession => {
          const date = skippedSession.date;
          const monthKey = monthKeyFromDate(date);
          if (!months.has(monthKey)) {
            months.set(monthKey, { key: monthKey, label: formatPlanMonth(monthKey), sessions: [], holidays: [] });
          }
          const mappingIndex = Math.max(0, skippedSession.originalNumber - 1);
          months.get(monthKey)!.sessions.push({
            date,
            sessionName: catalogModule?.sessionNames?.[skippedSession.originalNumber - 1]?.trim() || `Session ${skippedSession.originalNumber}`,
            ksbMappings: block.sessionKsbMappings?.[mappingIndex] || emptySessionKsbMapping(),
            tutor: block.tutor || 'TBD',
            coach: block.coachName || 'TBD',
            time: `${block.sessionStartTime || '09:00'}${block.sessionEndTime ? ` - ${block.sessionEndTime}` : ''}`,
            holidays: skippedSession.holidays.map(toMonthlyHoliday),
            isClash: true,
            isReplacement: false,
            countedNumber: null,
            shiftedTo: shiftedToByDate.get(date),
          });
        });

        scopedHolidays
          .filter(holiday => dateRangesOverlap(block.startDate, sessionPlan.effectiveEndDate, holiday.startDate, holiday.endDate))
          .forEach(holiday => {
            const startMonth = parseLocalDate(holiday.startDate);
            const endMonth = parseLocalDate(holiday.endDate);
            const cursor = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
            const last = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);

            while (cursor <= last) {
              const monthKey = `${cursor.getFullYear()}-${`${cursor.getMonth() + 1}`.padStart(2, '0')}`;
              const bounds = monthBounds(monthKey);
              if (dateRangesOverlap(block.startDate, sessionPlan.effectiveEndDate, bounds.start, bounds.end) && dateRangesOverlap(holiday.startDate, holiday.endDate, bounds.start, bounds.end)) {
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
        sortedMonths.forEach(month => {
          month.sessions.sort((a, b) => (
            a.date.localeCompare(b.date) ||
            Number(a.isReplacement) - Number(b.isReplacement) ||
            Number(b.isClash) - Number(a.isClash) ||
            a.sessionName.localeCompare(b.sessionName)
          ));
        });

        return {
          key: `${group.id}-${row.id}-${block.id}`,
          programme: group.name.replace('\n', ' '),
          programmeColor: group.color,
          cohort: row.label,
          moduleName: meta.lbl,
          groupName: block.groupName || 'No group name',
          tutor: block.tutor || 'TBD',
          coach: block.coachName || 'TBD',
          dateRange: `${formatPlanDate(block.startDate)} - ${formatPlanDate(sessionPlan.effectiveEndDate)}`,
          totalSessions: block.sessions || 0,
          scheduledSessions: sortedMonths.reduce((count, month) => count + month.sessions.filter(session => !session.isClash).length, 0),
          countedSessions: sortedMonths.reduce(
            (count, month) => count + month.sessions.filter(session => !session.isClash).length,
            0,
          ),
          totalWeeks: sessionPlan.sessions.length + sessionPlan.clashedSessions,
          baselineEndDate: sessionPlan.baselineEndDate,
          effectiveEndDate: sessionPlan.effectiveEndDate,
          extensionDays: sessionPlan.extensionDays,
          sessionDayLabel: sessionDayLabel(block.days),
          color: meta.bg,
          textColor: meta.tx,
          affectedSessions,
          extensionAffectedSessions,
          months: sortedMonths,
        };
      }),
    ),
  ).filter(summary => summary.months.length > 0);
}

function MonthlyModuleSummaryModal({ summary, onClose }: { summary: ModuleMonthlySummary; onClose: () => void }) {
  const selectedMonths = summary.months;
  const totalClashedSessions = summary.affectedSessions + summary.extensionAffectedSessions;
  const totalWeeks = summary.totalWeeks || summary.scheduledSessions || summary.totalSessions + totalClashedSessions;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close monthly breakdown"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[88vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4" style={{ borderTop: `5px solid ${summary.color}` }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: summary.color }} />
              <h3 className="truncate text-base font-extrabold text-kbc-navy">{summary.moduleName}</h3>
            </div>
            <p className="mt-1 text-xs text-gray-500">{summary.programme} - {summary.cohort}</p>
            <p className="mt-0.5 text-xs text-gray-400">{summary.dateRange}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-slate-100 hover:text-kbc-navy"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="grid gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs text-gray-500 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Group', summary.groupName],
            ['Tutor', summary.tutor],
            ['Coach', summary.coach],
            ['Module sessions', summary.totalSessions],
            ['Holiday weeks', totalClashedSessions],
            ['Total weeks', totalWeeks],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="block text-[10px] font-extrabold uppercase text-slate-400">{label}</span>
              <span className={`mt-0.5 block font-extrabold ${label === 'Holiday weeks' && totalClashedSessions ? 'text-amber-700' : 'text-gray-800'}`}>{value}</span>
            </div>
          ))}
        </div>
        {totalClashedSessions > 0 && (
          <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs font-semibold text-amber-900">
            <i className="ri-alert-line mt-0.5 text-sm text-amber-700" />
            <span>
              {totalClashedSessions} session{totalClashedSessions !== 1 ? 's' : ''} clashed with holiday week{totalClashedSessions !== 1 ? 's' : ''}. Each affected session is shifted to the next available training week, so the timeline extends to {formatPlanDate(summary.effectiveEndDate)}.
            </span>
          </div>
        )}

        <div className="overflow-auto p-5">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="w-44 px-3 py-2 font-bold">Month</th>
                  <th className="w-24 px-3 py-2 font-bold">Sessions</th>
                  <th className="min-w-[740px] px-3 py-2 font-bold">Session Dates</th>
                  <th className="min-w-48 px-3 py-2 font-bold">Holidays</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedMonths.map(month => {
                  const clashedCount = month.sessions.filter(session => session.holidays.length > 0).length;
                  const validCount = month.sessions.filter(session => !session.isClash).length;

                  return (
                  <tr key={month.key} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 font-extrabold text-kbc-navy">{month.label}</td>
                    <td className="px-3 py-3">
                      <span className="block font-bold text-gray-700">{validCount}</span>
                      {clashedCount > 0 && (
                        <span className="mt-1 block text-[11px] font-bold text-red-600">
                          {clashedCount} clash{clashedCount !== 1 ? 'es' : ''} not counted
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {month.sessions.length ? (
                        <div className="min-w-[700px]">
                          <div className="mb-1 grid grid-cols-[128px_minmax(180px,1fr)_150px] gap-3 px-3 text-[10px] font-extrabold uppercase text-slate-400">
                            <span>Date</span>
                            <span>Session</span>
                            <span aria-hidden="true" />
                          </div>
                          <div className="space-y-1.5">
                          {month.sessions.map(session => (
                            <div
                              key={`${month.key}-${session.date}-${session.time}-${session.sessionName}-${session.isClash ? 'clash' : 'session'}`}
                              className={`rounded-md border border-l-4 px-3 py-2 shadow-sm transition-colors hover:bg-slate-50/80 ${getSessionStatusClass(session)}`}
                              title={session.holidays.length ? `Holiday clash: ${session.holidays.map(holiday => holiday.label).join(', ')}` : undefined}
                            >
                              <div className="grid grid-cols-[128px_minmax(180px,1fr)_150px] items-center gap-3">
                                <strong className={`flex items-center gap-1 whitespace-nowrap ${session.holidays.length ? 'text-red-900' : session.isReplacement ? 'text-emerald-900' : 'text-gray-800'}`}>
                                  {session.isClash && <i className="ri-close-circle-line text-red-600" />}
                                  {formatPlanDate(session.date)}
                                </strong>
                                <span className="min-w-0 truncate font-semibold text-gray-700" title={session.sessionName}>{session.sessionName}</span>
                                {(session.isClash || session.isReplacement) ? (
                                  <span className={`justify-self-end rounded-md border px-2 py-1 text-[10px] font-extrabold whitespace-nowrap ${session.isClash ? 'border-red-200 bg-red-100 text-red-800' : 'border-emerald-200 bg-emerald-100 text-emerald-800'}`}>
                                    {getSessionStatusLabel(session)}
                                  </span>
                                ) : (
                                  <span aria-hidden="true" />
                                )}
                              </div>
                              <KsbBadges mapping={session.ksbMappings} />
                              {session.holidays.length > 0 && (
                                <div className="mt-1 rounded border border-red-200 bg-white/80 px-2 py-1 text-[11px] font-semibold text-red-800">
                                  Not delivered this week: clashed with {session.holidays.map(holiday => holiday.label).join(', ')}
                                  {session.shiftedTo ? `, shifted to ${formatPlanDate(session.shiftedTo)}.` : '.'}
                                </div>
                              )}
                            </div>
                          ))}
                          </div>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function KsbBadges({ mapping }: { mapping: SessionKsbMapping }) {
  const groups = [
    { label: 'K', codes: mapping.knowledgeCodes, labelClassName: 'bg-sky-600 text-white', codeClassName: 'border-sky-200 bg-sky-50 text-sky-800' },
    { label: 'S', codes: mapping.skillCodes, labelClassName: 'bg-emerald-600 text-white', codeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { label: 'B', codes: mapping.behaviourCodes, labelClassName: 'bg-amber-500 text-white', codeClassName: 'border-amber-200 bg-amber-50 text-amber-800' },
  ].filter(group => group.codes.length > 0);
  if (!groups.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {groups.map(group => (
        <span key={group.label} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-1">
          <span className={`flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-extrabold leading-none ${group.labelClassName}`}>
            {group.label}
          </span>
          {group.codes.map(code => (
            <span key={code} className={`rounded border px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${group.codeClassName}`}>
              {code}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

function MonthlyModuleBreakdown({ summaries }: { summaries: ModuleMonthlySummary[] }) {
  type ProgrammeSummaryGroup = { programme: string; color: string; summaries: ModuleMonthlySummary[]; countedSessions: number; affectedSessions: number };
  const totalSummaryClashes = (summary: ModuleMonthlySummary) => summary.affectedSessions + summary.extensionAffectedSessions;
  const [selectedSummary, setSelectedSummary] = useState<ModuleMonthlySummary | null>(null);
  const [selectedProgrammeGroup, setSelectedProgrammeGroup] = useState<ProgrammeSummaryGroup | null>(null);
  const [isBreakdownCollapsed, setIsBreakdownCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [programmeFilter, setProgrammeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'affected' | 'clear'>('all');
  const [programmeModalSearch, setProgrammeModalSearch] = useState('');
  const [programmeModalRiskFilter, setProgrammeModalRiskFilter] = useState<'all' | 'affected' | 'clear'>('all');
  const programmeOptions = useMemo(
    () => Array.from(new Set(summaries.map(summary => summary.programme))).sort((a, b) => a.localeCompare(b)),
    [summaries],
  );
  const filteredSummaries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return summaries.filter(summary => {
      const clashes = totalSummaryClashes(summary);
      if (programmeFilter !== 'all' && summary.programme !== programmeFilter) return false;
      if (riskFilter === 'affected' && clashes === 0) return false;
      if (riskFilter === 'clear' && clashes > 0) return false;
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
  const programmeGroups = useMemo(() => {
    const grouped = new Map<string, ProgrammeSummaryGroup>();
    filteredSummaries.forEach(summary => {
      const existing = grouped.get(summary.programme);
      const clashes = totalSummaryClashes(summary);
      if (existing) {
        existing.summaries.push(summary);
        existing.countedSessions += summary.countedSessions;
        existing.affectedSessions += clashes;
        return;
      }

      grouped.set(summary.programme, {
        programme: summary.programme,
        color: summary.programmeColor,
        summaries: [summary],
        countedSessions: summary.countedSessions,
        affectedSessions: clashes,
      });
    });
    return Array.from(grouped.values()).sort((a, b) => a.programme.localeCompare(b.programme));
  }, [filteredSummaries]);
  const hasActiveFilters = searchQuery.trim() || programmeFilter !== 'all' || riskFilter !== 'all';
  const visibleProgrammeSummaries = useMemo(() => {
    if (!selectedProgrammeGroup) return [];
    const query = programmeModalSearch.trim().toLowerCase();
    return selectedProgrammeGroup.summaries.filter(summary => {
      const clashes = totalSummaryClashes(summary);
      if (programmeModalRiskFilter === 'affected' && clashes === 0) return false;
      if (programmeModalRiskFilter === 'clear' && clashes > 0) return false;
      if (!query) return true;

      const searchable = [
        summary.moduleName,
        summary.cohort,
        summary.groupName,
        summary.tutor,
        summary.coach,
        summary.dateRange,
      ].join(' ').toLowerCase();
      return searchable.includes(query);
    });
  }, [programmeModalRiskFilter, programmeModalSearch, selectedProgrammeGroup]);
  const hasProgrammeModalFilters = programmeModalSearch.trim() || programmeModalRiskFilter !== 'all';

  if (!summaries.length) {
    return null;
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setIsBreakdownCollapsed(value => !value)}
          className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${isBreakdownCollapsed ? '' : 'border-b border-gray-100'}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-kbc-navy text-white">
              <i className={`ri-arrow-down-s-line text-lg transition-transform ${isBreakdownCollapsed ? '-rotate-90' : 'rotate-0'}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-kbc-navy">Monthly Module Breakdown</span>
              <span className="mt-0.5 block text-xs text-gray-400">Click any module to view monthly sessions, holidays, tutors, and coaches.</span>
            </span>
          </span>
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {filteredSummaries.length}/{summaries.length} module{summaries.length !== 1 ? 's' : ''}
          </span>
        </button>

        {!isBreakdownCollapsed && (
          <>
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
              ) : programmeGroups.map(group => (
                <button
                  key={group.programme}
                  type="button"
                  onClick={() => {
                    setProgrammeModalSearch('');
                    setProgrammeModalRiskFilter('all');
                    setSelectedProgrammeGroup(group);
                  }}
                  className="grid w-full grid-cols-[42px_minmax(0,1fr)_88px_88px_32px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs transition-colors last:border-b-0 hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2">
                    <i className="ri-external-link-line text-sm text-gray-400" />
                    <span className="h-3 w-3 rounded-sm" style={{ background: group.color }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-kbc-navy">{group.programme}</span>
                    <span className="mt-0.5 block text-gray-400">{group.summaries.length} module{group.summaries.length !== 1 ? 's' : ''}</span>
                  </span>
                  <span className="rounded-md bg-white px-2 py-1 text-center font-bold text-kbc-navy">
                    {group.countedSessions}
                  </span>
                  <span
                    className={`rounded-md px-2 py-1 text-center font-bold ${group.affectedSessions ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                    title="Holiday clashes"
                  >
                    {group.affectedSessions ? (
                      <span className="inline-flex items-center justify-center gap-1">
                        <i className="ri-alert-line" />
                        {group.affectedSessions}
                      </span>
                    ) : '0'}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white hover:text-kbc-navy">
                    <i className="ri-arrow-right-s-line text-base" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {selectedProgrammeGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close programme modules"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setSelectedProgrammeGroup(null)}
          />
          <div className="relative flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderTop: `5px solid ${selectedProgrammeGroup.color}` }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: selectedProgrammeGroup.color }} />
                  <h3 className="truncate text-base font-extrabold text-kbc-navy">{selectedProgrammeGroup.programme}</h3>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedProgrammeGroup.summaries.length} module{selectedProgrammeGroup.summaries.length !== 1 ? 's' : ''} - {selectedProgrammeGroup.countedSessions} valid counted sessions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProgrammeGroup(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-slate-100 hover:text-kbc-navy"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            <div className="grid gap-2 border-y border-slate-100 bg-slate-50 px-5 py-3 text-xs text-gray-500 sm:grid-cols-3">
              <span><strong className="text-gray-700">Modules:</strong> {selectedProgrammeGroup.summaries.length}</span>
              <span><strong className="text-gray-700">Valid counted sessions:</strong> {selectedProgrammeGroup.countedSessions}</span>
              <span className={selectedProgrammeGroup.affectedSessions ? 'font-bold text-amber-700' : 'text-emerald-700'}>
                <strong>Holiday clashes:</strong> {selectedProgrammeGroup.affectedSessions}
              </span>
            </div>

            <div className="grid gap-2 border-b border-slate-100 bg-white px-5 py-3 md:grid-cols-[minmax(180px,1fr)_minmax(160px,0.65fr)_auto]">
              <label className="relative min-w-0">
                <span className="sr-only">Search programme modules</span>
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
                <input
                  value={programmeModalSearch}
                  onChange={event => setProgrammeModalSearch(event.target.value)}
                  placeholder="Search module, group, tutor..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs font-medium text-kbc-navy outline-none transition-colors focus:border-kbc-navy"
                />
              </label>

              <div className="flex h-9 rounded-lg border border-slate-200 bg-white p-1">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'affected', label: 'Clashes' },
                  { key: 'clear', label: 'Clear' },
                ] as const).map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setProgrammeModalRiskFilter(option.key)}
                    className={`flex-1 rounded-md px-2 text-xs font-bold transition-colors ${programmeModalRiskFilter === option.key ? 'bg-kbc-navy text-white' : 'text-gray-500 hover:bg-slate-50 hover:text-kbc-navy'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setProgrammeModalSearch('');
                  setProgrammeModalRiskFilter('all');
                }}
                disabled={!hasProgrammeModalFilters}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-gray-500 transition-colors hover:bg-slate-50 hover:text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset
              </button>
            </div>

            <div className="overflow-auto">
              {visibleProgrammeSummaries.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-400">
                  No modules match the current filters.
                </div>
              ) : visibleProgrammeSummaries.map(summary => {
                const clashes = totalSummaryClashes(summary);
                return (
                  <button
                    key={summary.key}
                    type="button"
                    onClick={() => {
                      setSelectedSummary(summary);
                    }}
                    className="grid w-full grid-cols-[18px_minmax(0,1.5fr)_minmax(0,1fr)_72px_72px_30px] items-center gap-3 border-b border-slate-100 px-5 py-3 text-left text-xs transition-colors last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: summary.color }} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-kbc-navy">{summary.moduleName}</span>
                      <span className="mt-0.5 block truncate text-gray-400">{summary.cohort} - {summary.dateRange}</span>
                    </span>
                    <span className="min-w-0 text-gray-500">
                      <span className="block truncate"><strong className="text-gray-700">Group:</strong> {summary.groupName}</span>
                      <span className="block truncate"><strong className="text-gray-700">Tutor:</strong> {summary.tutor}</span>
                    </span>
                    <span className="rounded-md px-2 py-1 text-center font-bold" style={{ background: summary.color, color: summary.textColor }}>
                      {summary.countedSessions}
                    </span>
                    <span
                      className={`rounded-md px-2 py-1 text-center font-bold ${clashes ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                      title="Holiday clashes"
                    >
                      {clashes ? (
                        <span className="inline-flex items-center justify-center gap-1">
                          <i className="ri-alert-line" />
                          {clashes}
                        </span>
                      ) : '0'}
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white hover:text-kbc-navy">
                      <i className="ri-external-link-line text-sm" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedSummary && (
        <MonthlyModuleSummaryModal summary={selectedSummary} onClose={() => setSelectedSummary(null)} />
      )}
    </>
  );
}

type TrainingPlanProgramConfigPayload = CustomProgram;
type TrainingPlanHolidayPayload = { items: Holiday[]; version?: string };

function parseHolidayPayload(payload: unknown): TrainingPlanHolidayPayload | null {
  if (Array.isArray(payload)) {
    return { items: payload as Holiday[], version: undefined };
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
    const typedPayload = payload as { items: Holiday[]; version?: unknown };
    return {
      items: typedPayload.items,
      version: typeof typedPayload.version === 'string' ? typedPayload.version : undefined,
    };
  }
  return null;
}

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
  const [ksbProfiles, setKsbProfiles] = useState<KsbProfile[]>([]);
  const [trainingPlanItems, setTrainingPlanItems] = useState<TrainingPlanItem[]>([]);
  const [groups,   setGroups]   = useState<ProgrammeGroup[]>(() => buildAllGroups());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayVersion, setHolidayVersion] = useState<string | undefined>(undefined);
  const [modal,    setModal]    = useState<ModalState>({ open: false });
  const [showHolidayMgr, setShowHolidayMgr] = useState(false);
  const [showAddModule,  setShowAddModule]  = useState(false);
  const [showAddCatalogModule, setShowAddCatalogModule] = useState(false);
  const [showManageModules, setShowManageModules] = useState(false);
  const [showKsbProfiles, setShowKsbProfiles] = useState(false);
  const [initialManageModuleId, setInitialManageModuleId] = useState<number | null>(null);
  const [returnEditChoice, setReturnEditChoice] = useState<EditChoiceState | null>(null);
  const [visibleEditChoice, setVisibleEditChoice] = useState<EditChoiceState | null>(null);
  const [selectedMonthlySummary, setSelectedMonthlySummary] = useState<ModuleMonthlySummary | null>(null);
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

  const reloadTrainingPlan = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/training-plan/');
      if (!response.ok) {
        return false;
      }

      const items = (await response.json()) as TrainingPlanItem[];
      if (!Array.isArray(items)) {
        return false;
      }

      setTrainingPlanItems(items);
      setHasLoadedTrainingPlan(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const reloadTrainingPlanHolidays = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/training-plan-holidays/');
      if (!response.ok) {
        return false;
      }

      const payload = parseHolidayPayload(await response.json());
      if (!payload) {
        return false;
      }

      setHolidays(payload.items);
      setHolidayVersion(payload.version);
      return true;
    } catch {
      return false;
    }
  }, []);

  const reloadTrainingPlanSupportData = useCallback(async (): Promise<void> => {
    const [
      moduleDefinitionsResult,
      programConfigsResult,
      holidaysResult,
      catalogModulesResult,
      ksbProfilesResult,
    ] = await Promise.allSettled([
      fetch('/api/training-plan-modules/'),
      fetch('/api/training-plan-program-configs/'),
      reloadTrainingPlanHolidays(),
      fetch('/api/modules/'),
      fetch('/api/ksb-profiles/?includeInactive=1'),
    ]);

    if (moduleDefinitionsResult.status === 'fulfilled' && moduleDefinitionsResult.value.ok) {
      const items = (await moduleDefinitionsResult.value.json()) as Array<{ id: string; name: string; defaultSessions: number; bg: string; tx: string }>;
      if (Array.isArray(items)) {
        setCustomModules(items.map(item => ({
          id: item.id,
          name: item.name,
          defaultSessions: item.defaultSessions,
          bg: item.bg,
          tx: item.tx,
        })));
      }
    }

    if (programConfigsResult.status === 'fulfilled' && programConfigsResult.value.ok) {
      const items = (await programConfigsResult.value.json()) as TrainingPlanProgramConfigPayload[];
      if (Array.isArray(items)) {
        setCustomPrograms(items);
      }
      setHasLoadedProgramConfigs(true);
    }

    if (holidaysResult.status === 'rejected') {
      // Keep current holidays if the reload fails.
    }

    if (catalogModulesResult.status === 'fulfilled' && catalogModulesResult.value.ok) {
      const raw = (await catalogModulesResult.value.json()) as (CatalogModule & { sessionNames?: string[]; sessionDescriptions?: string[] })[];
      if (Array.isArray(raw)) {
        setCatalogModules(raw.map(m => ({ ...m, sessionNames: m.sessionNames ?? [], sessionDescriptions: m.sessionDescriptions ?? [] })));
      }
    }

    if (ksbProfilesResult.status === 'fulfilled' && ksbProfilesResult.value.ok) {
      const items = (await ksbProfilesResult.value.json()) as KsbProfile[];
      if (Array.isArray(items)) {
        setKsbProfiles(items);
      }
    }
  }, [reloadTrainingPlanHolidays]);

  useEffect(() => {
    void reloadTrainingPlan();
  }, [reloadTrainingPlan]);

  useEffect(() => {
    setGroups(
      trainingPlanItems.length
        ? buildGroupsFromTrainingRows(trainingPlanItems, customPrograms)
        : buildAllGroups(customPrograms),
    );
  }, [trainingPlanItems, customPrograms]);

  useEffect(() => {
    void reloadTrainingPlanSupportData();
  }, [reloadTrainingPlanSupportData]);

  useRealtimeResource('trainingPlan', () => {
    void reloadTrainingPlan();
    void reloadTrainingPlanSupportData();
  });

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
    if (!holidayVersion) {
      const reloaded = await reloadTrainingPlanHolidays();
      await kbcSwal.fire({
        title: reloaded ? 'Latest Holidays Loaded' : 'Reload Failed',
        html: reloaded
          ? 'The current holiday list has been loaded. Please review your changes before saving again.'
          : 'The latest holiday list could not be loaded. Please refresh the page and try again.',
        icon: reloaded ? 'warning' : 'error',
        confirmButtonText: 'OK',
      });
      return false;
    }

    const payload = { items: nextHolidays, version: holidayVersion };

    try {
      const response = await fetch('/api/training-plan-holidays/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 409) {
          let detail = 'The holiday list was updated by someone else while you were editing. Please reload the latest version before saving to avoid overwriting their changes.';
          try {
            const conflict = await response.json() as { detail?: string; currentVersion?: string };
            if (conflict.detail) {
              detail = conflict.detail;
            }
          } catch {
            // Use the default conflict message.
          }

          const result = await kbcSwal.fire({
            title: 'Holiday List Changed',
            html: `${detail}<br /><br />Reload the latest holidays before saving again.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Reload latest holidays',
            cancelButtonText: 'Keep editing',
          });

          if (result.isConfirmed) {
            const reloaded = await reloadTrainingPlanHolidays();
            await kbcSwal.fire({
              title: reloaded ? 'Latest Holidays Loaded' : 'Reload Failed',
              html: reloaded
                ? 'The current holiday list has been loaded. Please review your changes before saving again.'
                : 'The latest holiday list could not be loaded. Please refresh the page and try again.',
              icon: reloaded ? 'success' : 'error',
              confirmButtonText: 'OK',
            });
          }

          return false;
        }
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      const result = await response.json() as { saved?: number; items?: Holiday[]; version?: string };
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
      setHolidayVersion(result.version);
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

  const createKsbProfile = async (profile: Omit<KsbProfile, 'id'>): Promise<KsbProfile | null> => {
    try {
      const response = await fetch('/api/ksb-profiles/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || `Request failed with status ${response.status}`);
      const saved = await response.json() as KsbProfile;
      setKsbProfiles(prev => [...prev.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      return saved;
    } catch (error) {
      await kbcSwal.fire({ title: 'KSB Profile Not Saved', html: error instanceof Error ? error.message : 'Unknown save error', icon: 'error', confirmButtonText: 'OK' });
      return null;
    }
  };

  const updateKsbProfile = async (id: string, profile: Omit<KsbProfile, 'id'>): Promise<KsbProfile | null> => {
    try {
      const response = await fetch(`/api/ksb-profiles/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error((await response.text()).trim() || `Request failed with status ${response.status}`);
      const saved = await response.json() as KsbProfile;
      setKsbProfiles(prev => prev.map(item => item.id === saved.id ? saved : item).sort((a, b) => a.name.localeCompare(b.name)));
      return saved;
    } catch (error) {
      await kbcSwal.fire({ title: 'KSB Profile Not Updated', html: error instanceof Error ? error.message : 'Unknown update error', icon: 'error', confirmButtonText: 'OK' });
      return null;
    }
  };

  const deleteKsbProfile = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/ksb-profiles/${id}/`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.text()).trim() || `Request failed with status ${response.status}`);
      const result = await response.json() as { deleted?: boolean; deactivated?: boolean; item?: KsbProfile };
      setKsbProfiles(prev => result.item
        ? prev.map(item => item.id === result.item!.id ? result.item! : item)
        : prev.filter(item => item.id !== id));
      await kbcSwal.fire({
        icon: 'success',
        title: result.deactivated ? 'KSB Profile Deactivated' : 'KSB Profile Deleted',
        confirmButtonText: 'OK',
      });
      return true;
    } catch (error) {
      await kbcSwal.fire({ title: 'KSB Profile Not Deleted', html: error instanceof Error ? error.message : 'Unknown delete error', icon: 'error', confirmButtonText: 'OK' });
      return false;
    }
  };

  const handleSave = async (groupIdx: number, row: CohortRow, prevGroupIdx?: number) => {
    if (!canManageCohorts) {
      return false;
    }

    // Build next state synchronously so we can persist immediately and ensure UI updates.
    const next = groups.map(g => ({ ...g, rows: [...g.rows] }));
    let savedRow = row;
    if (modal.open && modal.mode === 'edit') {
      const pgi = prevGroupIdx ?? groupIdx;
      next[pgi].rows.splice(modal.rowIdx, 1);
      const insertAt = groupIdx === pgi ? modal.rowIdx : next[groupIdx].rows.length;
      next[groupIdx].rows.splice(insertAt, 0, row);
      savedRow = next[groupIdx].rows[insertAt];
    } else {
      next[groupIdx].rows.push(row);
      savedRow = next[groupIdx].rows[next[groupIdx].rows.length - 1];
    }

    const saveRisks = analyzeSavedRowRisks(next, savedRow, holidays, customModules);
    if (saveRisks.holidayClashes.length > 0 || saveRisks.tutorConflicts.length > 0) {
      const result = await kbcSwal.fire({
        title: 'Timeline warnings found',
        html: buildSaveRiskAlertHtml(saveRisks),
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Continue Anyway',
        cancelButtonText: 'Back to Edit',
        reverseButtons: true,
        focusCancel: true,
        width: 620,
      });

      if (!result.isConfirmed) {
        return false;
      }
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
    () => buildMonthlyModuleSummaries(groups, holidays, customModules, catalogModules),
    [catalogModules, customModules, groups, holidays],
  );
  const openMonthlySummary = (groupId: string, rowId: string, blockId: string) => {
    const targetKey = `${groupId}-${rowId}-${blockId}`;
    const summary = monthlyModuleSummaries.find(item => item.key === targetKey);
    if (summary) {
      setSelectedMonthlySummary(summary);
    }
  };

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
              <button
                onClick={() => setShowKsbProfiles(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-90 border"
                style={{ background: '#F8FAFC', color: '#7C3AED', borderColor: '#DDD6FE' }}>
                <i className="ri-links-line" />
                KSB Profiles
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
                  onViewMonthlyBreakdown={(groupIdx, rowIdx, blockId) => {
                    const group = groups[groupIdx];
                    const row = group?.rows[rowIdx];
                    if (!group || !row) return;
                    openMonthlySummary(group.id, row.id, blockId);
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
            <div className="grid gap-3 bg-gray-50 p-4 md:grid-cols-3">
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

              <button
                type="button"
                onClick={() => {
                  openMonthlySummary(
                    visibleEditChoiceDetails.group.id,
                    visibleEditChoiceDetails.row.id,
                    visibleEditChoiceDetails.block.id,
                  );
                }}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-kbc-navy hover:shadow-md"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <i className="ri-calendar-check-line" />
                </span>
                <span className="mt-3 block text-sm font-extrabold text-kbc-navy">Monthly Module Breakdown</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500">
                  View monthly sessions, holiday clashes, tutors, coaches, and session totals.
                </span>
                <span className="mt-3 block text-xs font-semibold text-gray-400">
                  {visibleEditChoiceDetails.block.startDate} to {visibleEditChoiceDetails.block.endDate}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMonthlySummary && (
        <MonthlyModuleSummaryModal summary={selectedMonthlySummary} onClose={() => setSelectedMonthlySummary(null)} />
      )}

      {canManageCohorts && modal.open && (
        <CohortModal
          mode={modal.mode}
          groups={groups}
          holidays={holidays}
          customModules={customModules}
          catalogModules={catalogModules}
          ksbProfiles={ksbProfiles}
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

      {canManageCohorts && showKsbProfiles && (
        <KsbProfilesManager
          profiles={ksbProfiles}
          onCreate={createKsbProfile}
          onUpdate={updateKsbProfile}
          onDelete={deleteKsbProfile}
          onClose={() => setShowKsbProfiles(false)}
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
