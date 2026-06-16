import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import TopNav from '@/components/feature/TopNav';
import Footer from '@/components/feature/Footer';
import type { ProgrammeGroup, CohortRow, Holiday, ZoomLevel, MKey, ModuleValue, WeekDayKey, CustomModule, CustomProgram, CatalogModule, SessionCoverage, SessionKsbMapping, KsbProfile, KsbProfileItem, TutorProfile, CoachProfile, ModuleBlock } from './types';
import { MS, getModuleMeta } from './data';
import GanttTimeline from './components/GanttTimeline';
import CohortModal, { type ModulePartialUpdatePayload } from './components/CohortModal';
import HolidayManager from './components/HolidayManager';
import AddModuleModal from './components/AddModuleModal';
import AddModuleCatalogModal from './components/AddModuleCatalogModal';
import ManageModulesModal from './components/ManageModulesModal';
import AddProgramModal from './components/AddProgramModal';
import ManageProgramModal from './components/ManageProgramModal';
import KsbProfilesManager from './components/KsbProfilesManager';
import ScheduleTable, { type SessionScheduleUpdatePayload } from '@/pages/apprenticeships-timeline/components/ScheduleTable';
import TutorProfiles from './components/TutorProfiles';
import CoachProfiles from './components/CoachProfiles';
import DateField from './components/DateField';
import SelectField from './components/SelectField';
import useAccessControl from '@/hooks/useAccessControl';
import { kbcSuccessSwal, kbcSwal } from '@/components/feature/sweetAlert';
import { buildHolidayAdjustedSessionPlan, formatDate } from './utils';
import { useRealtimeResource } from '@/hooks/useRealtimeUpdates';
import { buildTutorProfilesFromGroups, profileIdForTutorName, tutorDisplayName } from './tutorProfiles';
import { buildCoachProfilesFromGroups } from './coachProfiles';
import { rankAptemSubprogrammeOptions, loadAptemSubprogrammesForModule, readApiErrorMessage } from './aptemLearnerMapping';

type ModalState =
  | { open: false }
  | { open: true; mode: 'add'; defaultGroupIdx: number }
  | { open: true; mode: 'add'; defaultGroupIdx: number; lockGroupSelection: true }
  | { open: true; mode: 'add'; defaultGroupIdx: number; prefillTutorProfileId: string; prefillModule: ModuleValue; lockGroupSelection?: true }
  | { open: true; mode: 'edit'; groupIdx: number; rowIdx: number; row: CohortRow; expandedBlockId?: string; prefillTutorProfileId?: string; prefillModule?: ModuleValue };

type ProgramModalState =
  | { open: false }
  | { open: true; mode: 'add' }
  | { open: true; mode: 'edit'; programId: string };

interface EditChoiceState {
  groupIdx: number;
  rowIdx: number;
  blockId: string;
}

interface TutorModuleAddChoice {
  tutorProfileId: string;
  moduleValue: ModuleValue;
}

interface TutorModuleGroupDraft {
  name: string;
  coach: string;
  days: WeekDayKey[];
  startTime: string;
  endTime: string;
}

interface TrainingPlanItem {
  id?: string | number;
  programmeId?: string;
  cohortId?: string;
  cohortName: string;
  program: string;
  startingDateLabel: string;
  moduleName: string;
  groupName?: string;
  coachName?: string;
  tutorName: string;
  tutorProfileId?: string;
  startDate: string;
  endDate: string;
  sessionsNumber: string;
  sessionWeekDay: string;
  sessionStartTime: string;
  sessionEndTime: string;
  sessionKsbMappings?: SessionKsbMapping[];
  sessionCoverage?: SessionCoverage[];
  ksbProfileId?: string;
  programmeDisplayOrder?: number | null;
  cohortDisplayOrder?: number | null;
  notes: string;
}

interface TrainingPlanMutationResult {
  item?: TrainingPlanItem;
  items?: TrainingPlanItem[];
  version?: string;
  rowVersion?: string;
  count?: number;
  updated_count?: number;
  updatedRows?: unknown[];
  skippedAmbiguousRows?: unknown[];
  created_count?: number;
  skipped_count?: number;
  archived?: number;
  programmeId?: string;
  cohortId?: string;
}

type LinkedModuleRow = {
  trainingPlanId: string;
  programmeId: string;
  cohortId: string;
  groupId?: string;
  blockId: string;
};

const TEMPORARY_SERVER_STATUSES = new Set([502, 503, 504]);

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
  programmeId: string;
  cohortId: string;
  moduleBlockId: string;
  programme: string;
  programmeColor: string;
  cohort: string;
  moduleName: string;
  moduleCatalogueId?: string;
  groupName: string;
  moduleStartDate: string;
  moduleEndDate: string;
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

type ModuleOverviewMode = 'monthly' | 'students';

interface ModuleOverviewChoiceDetails {
  group: ProgrammeGroup;
  row: CohortRow;
  block: ModuleBlock;
  displayName: string;
  catalogModule?: CatalogModule;
}

interface ModuleOverviewLearner {
  learnerIdentity?: string;
  learnerId?: string | null;
  learnerName?: string;
  learnerEmail?: string | null;
  name?: string;
  email?: string | null;
  programmeName?: string | null;
  group?: string | null;
  managerName?: string | null;
  managerEmail?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  programmeStatus?: string | null;
  status?: string | null;
  subprogramme?: string | null;
  sortOrder?: number;
  selected?: boolean;
  isSelected?: boolean;
  missingFromAptem?: boolean;
}

interface ModuleOverviewLearnerPayload {
  moduleCatalogueId?: string | number;
  moduleName?: string;
  subprogramme?: string | null;
  selectedCount?: number;
  learners?: ModuleOverviewLearner[];
}

type KsbCodeSets = {
  knowledgeCodes: Set<string>;
  skillCodes: Set<string>;
  behaviourCodes: Set<string>;
};

const HOLIDAY_MARKER_PREFIX = '__holiday_ids:';
const COHORT_COLOR_MARKER_PREFIX = '__cohort_color:';
const MODULE_COLOR_MARKER_PREFIX = '__module_color:';
const MODULE_CATALOGUE_ID_MARKER_PREFIX = '__module_catalogue_id:';
const COHORT_END_DATE_MARKER_PREFIX = '__cohort_end_date:';
const GROUP_NAME_MARKER_PREFIX = '__group_name:';
const COACH_NAME_MARKER_PREFIX = '__coach_name:';
const PROGRAM_ID_MARKER_PREFIX = '__program_id:';
const COHORT_ID_MARKER_PREFIX = '__cohort_id:';
const GROUP_ID_MARKER_PREFIX = '__group_id:';
const BLOCK_ID_MARKER_PREFIX = '__block_id:';
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function tutorModuleGroupKey(block: Pick<ModuleBlock, 'groupId' | 'groupName' | 'coachName' | 'days' | 'sessionStartTime' | 'sessionEndTime'>): string {
  if (block.groupId) {
    return block.groupId;
  }
  return [
    block.groupName || '',
    block.coachName || '',
    (block.days || []).join(','),
    block.sessionStartTime || '',
    block.sessionEndTime || '',
  ].join('|');
}

function emptySessionKsbMapping(): SessionKsbMapping {
  return { knowledgeCodes: [], skillCodes: [], behaviourCodes: [] };
}

function normalizeKsbCodes(value: unknown, prefix: 'K' | 'S' | 'B'): string[] {
  if (!Array.isArray(value)) return [];
  const pattern = new RegExp(`^${prefix}\\d+(?:\\.\\d+)*$`, 'i');
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

function normalizeSessionCoverage(value: unknown, count = 0, assignedTutorProfileId = ''): SessionCoverage[] {
  const raw = Array.isArray(value) ? value : [];
  return raw.reduce<SessionCoverage[]>((items, item) => {
    const record = item && typeof item === 'object' ? item as Partial<SessionCoverage> : {};
    const sessionNumber = Math.max(0, Number(record.sessionNumber) || 0);
    if (!sessionNumber || (count > 0 && sessionNumber > count)) return items;
    const coverageTutorProfileId = String(record.coverageTutorProfileId || '').trim();
    const coverageCoachProfileId = String(record.coverageCoachProfileId || '').trim();
    const tutorUnavailable = Boolean(record.tutorUnavailable) || Boolean(coverageTutorProfileId) || Boolean(coverageCoachProfileId);
    const coverageReason = String(record.coverageReason || '').trim();
    const coverageStatus = coverageTutorProfileId || coverageCoachProfileId ? 'covered' : tutorUnavailable ? 'required' : 'none';
    if (coverageTutorProfileId && (!coverageReason || coverageTutorProfileId === assignedTutorProfileId)) return items;
    if (coverageCoachProfileId && !coverageReason) return items;
    items.push({
      sessionNumber,
      assignedTutorProfileId: String(record.assignedTutorProfileId || assignedTutorProfileId || '').trim(),
      coverageTutorProfileId,
      coverageCoachProfileId,
      coverageStatus,
      tutorUnavailable,
      tutorUnavailableReason: String(record.tutorUnavailableReason || '').trim(),
      tutorUnavailableNotes: String(record.tutorUnavailableNotes || '').trim(),
      coverageReason,
      coverageNotes: String(record.coverageNotes || '').trim(),
    });
    return items;
  }, []);
}

function normalizeKsbProfileItems(profile: KsbProfile): KsbProfileItem[] {
  if (profile.ksbItems?.length) {
    return profile.ksbItems;
  }
  return [
    ...(profile.knowledgeCodes || []).map(code => ({ type: 'K' as const, number: code.replace(/^K/i, ''), code: code.toUpperCase(), description: '' })),
    ...(profile.skillCodes || []).map(code => ({ type: 'S' as const, number: code.replace(/^S/i, ''), code: code.toUpperCase(), description: '' })),
    ...(profile.behaviourCodes || []).map(code => ({ type: 'B' as const, number: code.replace(/^B/i, ''), code: code.toUpperCase(), description: '' })),
  ];
}

function buildKsbCodeSets(profile: KsbProfile): KsbCodeSets {
  const items = normalizeKsbProfileItems(profile);
  return {
    knowledgeCodes: new Set(normalizeKsbCodes(items.filter(item => item.type === 'K').map(item => item.code), 'K')),
    skillCodes: new Set(normalizeKsbCodes(items.filter(item => item.type === 'S').map(item => item.code), 'S')),
    behaviourCodes: new Set(normalizeKsbCodes(items.filter(item => item.type === 'B').map(item => item.code), 'B')),
  };
}

function filterSessionKsbMappingForProfile(mapping: SessionKsbMapping | undefined, codeSets: KsbCodeSets | undefined): SessionKsbMapping {
  if (!mapping || !codeSets) return emptySessionKsbMapping();
  return {
    knowledgeCodes: normalizeKsbCodes(mapping.knowledgeCodes, 'K').filter(code => codeSets.knowledgeCodes.has(code)),
    skillCodes: normalizeKsbCodes(mapping.skillCodes, 'S').filter(code => codeSets.skillCodes.has(code)),
    behaviourCodes: normalizeKsbCodes(mapping.behaviourCodes, 'B').filter(code => codeSets.behaviourCodes.has(code)),
  };
}

function splitPersistedNotes(raw: string): { holidayIds: string[]; cohortColor?: string; moduleColor?: string; moduleCatalogueId?: string; cohortEndDate?: string; groupName?: string; coachName?: string; programId?: string; cohortId?: string; groupId?: string; blockId?: string; notes: string } {
  const value = (raw || '').trim();
  if (!value.startsWith(HOLIDAY_MARKER_PREFIX) && !value.startsWith(COHORT_COLOR_MARKER_PREFIX) && !value.startsWith(MODULE_COLOR_MARKER_PREFIX) && !value.startsWith(MODULE_CATALOGUE_ID_MARKER_PREFIX) && !value.startsWith(COHORT_END_DATE_MARKER_PREFIX) && !value.startsWith(GROUP_NAME_MARKER_PREFIX) && !value.startsWith(COACH_NAME_MARKER_PREFIX) && !value.startsWith(PROGRAM_ID_MARKER_PREFIX) && !value.startsWith(COHORT_ID_MARKER_PREFIX) && !value.startsWith(GROUP_ID_MARKER_PREFIX) && !value.startsWith(BLOCK_ID_MARKER_PREFIX)) {
    return { holidayIds: [], cohortColor: undefined, moduleColor: undefined, moduleCatalogueId: undefined, cohortEndDate: undefined, groupName: undefined, coachName: undefined, programId: undefined, cohortId: undefined, groupId: undefined, blockId: undefined, notes: raw || '' };
  }

  const lines = value.split('\n');
  const noteLines: string[] = [];
  const holidayIds = new Set<string>();
  let cohortColor: string | undefined;
  let moduleColor: string | undefined;
  let moduleCatalogueId: string | undefined;
  let cohortEndDate: string | undefined;
  let groupName: string | undefined;
  let coachName: string | undefined;
  let programId: string | undefined;
  let cohortId: string | undefined;
  let groupId: string | undefined;
  let blockId: string | undefined;
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

    if (readingMarkers && line.startsWith(MODULE_CATALOGUE_ID_MARKER_PREFIX)) {
      const nextModuleCatalogueId = line.slice(MODULE_CATALOGUE_ID_MARKER_PREFIX.length).trim();
      moduleCatalogueId = nextModuleCatalogueId || undefined;
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

    if (readingMarkers && line.startsWith(PROGRAM_ID_MARKER_PREFIX)) {
      const nextProgramId = line.slice(PROGRAM_ID_MARKER_PREFIX.length).trim();
      programId = nextProgramId || undefined;
      return;
    }

    if (readingMarkers && line.startsWith(COHORT_ID_MARKER_PREFIX)) {
      const nextCohortId = line.slice(COHORT_ID_MARKER_PREFIX.length).trim();
      cohortId = nextCohortId || undefined;
      return;
    }

    if (readingMarkers && line.startsWith(GROUP_ID_MARKER_PREFIX)) {
      const nextGroupId = line.slice(GROUP_ID_MARKER_PREFIX.length).trim();
      groupId = nextGroupId || undefined;
      return;
    }

    if (readingMarkers && line.startsWith(BLOCK_ID_MARKER_PREFIX)) {
      const nextBlockId = line.slice(BLOCK_ID_MARKER_PREFIX.length).trim();
      blockId = nextBlockId || undefined;
      return;
    }

    readingMarkers = false;
    noteLines.push(line);
  });

  return { holidayIds: Array.from(holidayIds), cohortColor, moduleColor, moduleCatalogueId, cohortEndDate, groupName, coachName, programId, cohortId, groupId, blockId, notes: noteLines.join('\n') };
}

function joinPersistedNotes(notes: string, holidayIds: string[], cohortColor?: string, moduleColor?: string, cohortEndDate?: string, groupName?: string, coachName?: string, programId?: string, cohortId?: string, groupId?: string, blockId?: string, moduleCatalogueId?: string): string {
  const markers: string[] = [];
  if (programId) {
    markers.push(`${PROGRAM_ID_MARKER_PREFIX}${programId}`);
  }
  if (cohortId) {
    markers.push(`${COHORT_ID_MARKER_PREFIX}${cohortId}`);
  }
  if (groupId) {
    markers.push(`${GROUP_ID_MARKER_PREFIX}${groupId}`);
  }
  if (blockId) {
    markers.push(`${BLOCK_ID_MARKER_PREFIX}${blockId}`);
  }
  if (holidayIds.length) {
    markers.push(`${HOLIDAY_MARKER_PREFIX}${holidayIds.join('|')}`);
  }
  if (cohortColor) {
    markers.push(`${COHORT_COLOR_MARKER_PREFIX}${cohortColor}`);
  }
  if (moduleColor) {
    markers.push(`${MODULE_COLOR_MARKER_PREFIX}${moduleColor}`);
  }
  if (moduleCatalogueId) {
    markers.push(`${MODULE_CATALOGUE_ID_MARKER_PREFIX}${moduleCatalogueId}`);
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
  const exactIdMatch = groups.find(group => normalizeProgramLabel(group.id) === normalizedProgram);
  if (exactIdMatch) {
    return exactIdMatch.id;
  }
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
  tutorProfiles: TutorProfile[] = [],
): ProgrammeGroup[] {
  const allGroups = buildAllGroups(customPrograms);
  const templatesById = new Map(allGroups.map(group => [group.id, group]));
  const cohortIndex = new Map<string, CohortRow>();
  const programmeOrderById = new Map<string, number>();
  const cohortOrderByKey = new Map<string, number>();

  items.forEach((item, index) => {
    const parsedNotes = splitPersistedNotes(item.notes || '');
    const persistedProgrammeId = parsedNotes.programId || item.programmeId;
    const groupId = persistedProgrammeId && templatesById.has(persistedProgrammeId)
      ? persistedProgrammeId
      : inferGroupId(item.program || '', allGroups);
    const group = templatesById.get(groupId);
    if (!group) {
      return;
    }
    if (typeof item.programmeDisplayOrder === 'number') {
      const currentOrder = programmeOrderById.get(groupId);
      programmeOrderById.set(groupId, currentOrder === undefined ? item.programmeDisplayOrder : Math.min(currentOrder, item.programmeDisplayOrder));
    }

    const persistedCohortId = parsedNotes.cohortId || item.cohortId;
    const cohortKey = persistedCohortId || `${groupId}::${item.cohortName}::${item.startingDateLabel}`;
    let cohort = cohortIndex.get(cohortKey);
    if (!cohort) {
      cohort = {
        id: persistedCohortId || `db-row-${groupId}-${cohortIndex.size + 1}`,
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
    if (typeof item.cohortDisplayOrder === 'number') {
      const orderKey = `${groupId}::${cohort.id}`;
      const currentOrder = cohortOrderByKey.get(orderKey);
      cohortOrderByKey.set(orderKey, currentOrder === undefined ? item.cohortDisplayOrder : Math.min(currentOrder, item.cohortDisplayOrder));
    }

    const modKey = moduleKeyByLabel[(item.moduleName || '').toLowerCase()] || item.moduleName || 'Untitled Module';
    const sessions = Math.max(1, Number.parseInt(item.sessionsNumber || '1', 10) || 1);
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
    if (!item.id) {
      console.warn('TRAINING_PLAN_ITEM_MISSING_ID', { index, cohortId: cohort.id, moduleName: item.moduleName, rawId: item.id, notes: item.notes?.slice(0, 120) });
    }
    cohort.blks.push({
      id: parsedNotes.blockId || `db-blk-${index + 1}`,
      trainingPlanId: item.id ? String(item.id) : undefined,
      groupId: parsedNotes.groupId,
      moduleCatalogueId: parsedNotes.moduleCatalogueId,
      mod: modKey,
      groupName: item.groupName || parsedNotes.groupName,
      coachName: item.coachName || parsedNotes.coachName,
      color: parsedNotes.moduleColor,
      tutor: item.tutorName || '',
      tutorProfileId: item.tutorProfileId || profileIdForTutorName(item.tutorName || '', tutorProfiles),
      startDate: item.startDate || '2026-01-01',
      endDate: item.endDate || item.startDate || '2026-01-01',
      sessions,
      days: parseDays(item.sessionWeekDay || ''),
      sessionStartTime: item.sessionStartTime || '09:00',
      sessionEndTime: item.sessionEndTime || '11:00',
      sessionKsbMappings: normalizeSessionKsbMappings(item.sessionKsbMappings, sessions),
      sessionCoverage: normalizeSessionCoverage(item.sessionCoverage, sessions, item.tutorProfileId || profileIdForTutorName(item.tutorName || '', tutorProfiles)),
      notes: parsedNotes.notes || '',
    });
  });

  return allGroups
    .map(group => templatesById.get(group.id) || { ...group, rows: [] })
    .map(group => ({
      ...group,
      rows: [...group.rows].sort((left, right) => {
        const leftOrder = cohortOrderByKey.get(`${group.id}::${left.id}`) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = cohortOrderByKey.get(`${group.id}::${right.id}`) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      }),
    }))
    .sort((left, right) => {
      const leftOrder = programmeOrderById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = programmeOrderById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function flattenGroupsForApi(groups: ProgrammeGroup[], tutorProfiles: TutorProfile[] = []): TrainingPlanItem[] {
  return groups.flatMap((group, groupIndex) =>
    group.rows.flatMap((row, rowIndex) =>
      row.blks.map(block => ({
        id: block.trainingPlanId ? Number(block.trainingPlanId) : undefined,
        programmeId: group.id,
        cohortId: row.id,
        cohortName: row.label,
        program: toProgrammeLabel(group),
        startingDateLabel: row.dateLbl,
        moduleName: getModuleMeta(block.mod).lbl,
        groupName: block.groupName,
        coachName: block.coachName,
        tutorName: tutorDisplayName(block, tutorProfiles) || block.tutor,
        tutorProfileId: block.tutorProfileId || profileIdForTutorName(block.tutor || '', tutorProfiles),
        startDate: block.startDate,
        endDate: block.endDate,
        sessionsNumber: String(block.sessions),
        sessionWeekDay: (block.days || []).join(', '),
        sessionStartTime: block.sessionStartTime || '09:00',
        sessionEndTime: block.sessionEndTime || '11:00',
        sessionKsbMappings: normalizeSessionKsbMappings(block.sessionKsbMappings, block.sessions),
        sessionCoverage: normalizeSessionCoverage(block.sessionCoverage, block.sessions, block.tutorProfileId || profileIdForTutorName(block.tutor || '', tutorProfiles)),
        ksbProfileId: row.ksbProfileId || '',
        programmeDisplayOrder: groupIndex,
        cohortDisplayOrder: rowIndex,
        notes: joinPersistedNotes(block.notes || '', row.holidayIds || [], row.color, block.color, row.endDateLbl, block.groupName, block.coachName, group.id, row.id, block.groupId, block.id, block.moduleCatalogueId),
      })),
    ),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function sameStringArray(left: string[] | undefined, right: string[] | undefined): boolean {
  return stableJson(left || []) === stableJson(right || []);
}

function hasOnlyCohortMetadataChanges(before: CohortRow, after: CohortRow): boolean {
  if (before.blks.length !== after.blks.length) return false;
  const beforeBlocksById = new Map(before.blks.map(block => [block.id, block]));
  return after.blks.every(block => {
    const previous = beforeBlocksById.get(block.id);
    if (!previous) return false;
    return (
      previous.trainingPlanId === block.trainingPlanId &&
      previous.groupId === block.groupId &&
      previous.mod === block.mod &&
      previous.color === block.color &&
      previous.tutor === block.tutor &&
      previous.tutorProfileId === block.tutorProfileId &&
      previous.startDate === block.startDate &&
      previous.endDate === block.endDate &&
      previous.sessions === block.sessions &&
      previous.sessionStartTime === block.sessionStartTime &&
      previous.sessionEndTime === block.sessionEndTime &&
      previous.notes === block.notes &&
      sameStringArray(previous.days, block.days) &&
      stableJson(normalizeSessionKsbMappings(previous.sessionKsbMappings, previous.sessions)) === stableJson(normalizeSessionKsbMappings(block.sessionKsbMappings, block.sessions)) &&
      stableJson(normalizeSessionCoverage(previous.sessionCoverage, previous.sessions, previous.tutorProfileId)) === stableJson(normalizeSessionCoverage(block.sessionCoverage, block.sessions, block.tutorProfileId))
    );
  });
}

function hydrateCohortRowTrainingPlanIds(row: CohortRow, latestItems: TrainingPlanItem[]): CohortRow {
  if (row.blks.every(block => block.trainingPlanId)) return row;

  const itemsByBlockId = new Map<string, TrainingPlanItem>();
  latestItems
    .filter(item => item.cohortId === row.id)
    .forEach(item => {
      const parsedNotes = splitPersistedNotes(item.notes || '');
      if (parsedNotes.blockId && item.id) {
        itemsByBlockId.set(parsedNotes.blockId, item);
      }
    });

  if (!itemsByBlockId.size) return row;

  return {
    ...row,
    blks: row.blks.map(block => {
      if (block.trainingPlanId) return block;
      const item = itemsByBlockId.get(block.id);
      return item?.id ? { ...block, trainingPlanId: String(item.id) } : block;
    }),
  };
}

function trainingPlanItemProgrammeId(item: TrainingPlanItem): string {
  const parsedNotes = splitPersistedNotes(item.notes || '');
  return parsedNotes.programId || item.programmeId || '';
}

function trainingPlanItemCohortId(item: TrainingPlanItem): string {
  const parsedNotes = splitPersistedNotes(item.notes || '');
  return parsedNotes.cohortId || item.cohortId || '';
}

function missingSiblingCohortIds(items: TrainingPlanItem[], programmeId: string, siblingCohortIds: string[]): string[] {
  if (!siblingCohortIds.length) return [];
  const activeCohorts = new Set(
    items
      .filter(item => trainingPlanItemProgrammeId(item) === programmeId)
      .map(trainingPlanItemCohortId)
      .filter(Boolean),
  );
  return siblingCohortIds.filter(cohortId => !activeCohorts.has(cohortId));
}

function buildTrainingPlanExportRows(groups: ProgrammeGroup[], customModules: CustomModule[], ksbProfiles: KsbProfile[]): Array<Record<string, string | number>> {
  const profileNameById = new Map(ksbProfiles.map(profile => [profile.id, profile.name]));
  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.map(block => {
        const ksbMappings = normalizeSessionKsbMappings(block.sessionKsbMappings, block.sessions);
        const knowledgeCodes = Array.from(new Set(ksbMappings.flatMap(mapping => mapping.knowledgeCodes))).join(' | ');
        const skillCodes = Array.from(new Set(ksbMappings.flatMap(mapping => mapping.skillCodes))).join(' | ');
        const behaviourCodes = Array.from(new Set(ksbMappings.flatMap(mapping => mapping.behaviourCodes))).join(' | ');

        return {
          Programme: toProgrammeLabel(group),
          Cohort: row.label,
          'Cohort Start': row.dateLbl,
          'Cohort End': row.endDateLbl || '',
          Group: block.groupName || '',
          Coach: block.coachName || '',
          Module: getTrainingModuleLabel(block, customModules),
          Tutor: block.tutor,
          'Module Start': block.startDate,
          'Module End': block.endDate,
          Sessions: block.sessions,
          'Session Days': (block.days || []).join(', '),
          'Session Start Time': block.sessionStartTime || '',
          'Session End Time': block.sessionEndTime || '',
          'KSB Profile': row.ksbProfileId ? profileNameById.get(row.ksbProfileId) || row.ksbProfileId : '',
          'Knowledge Codes': knowledgeCodes,
          'Skill Codes': skillCodes,
          'Behaviour Codes': behaviourCodes,
          Notes: block.notes || '',
        };
      }),
    ),
  );
}

function downloadTrainingPlanWorkbook(filename: string, groups: ProgrammeGroup[], customModules: CustomModule[], ksbProfiles: KsbProfile[]) {
  const rows = buildTrainingPlanExportRows(groups, customModules, ksbProfiles);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 36 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Training Plan');
  XLSX.writeFile(workbook, filename, { compression: true });
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

const TUTOR_MODULE_WEEKDAY_TO_JS: Record<WeekDayKey, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function addDaysToLocalDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateHasHoliday(dateKey: string, holidays: Holiday[]): boolean {
  return holidays.some(holiday => holiday.startDate <= dateKey && holiday.endDate >= dateKey);
}

function buildWeeklyTutorModulePlan(startDate: string, sessions: number, days: WeekDayKey[], holidays: Holiday[] = []): { actualStartDate: string; effectiveEndDate: string; shiftedSessions: number } {
  if (!startDate || sessions <= 0 || days.length === 0) {
    return { actualStartDate: startDate, effectiveEndDate: startDate, shiftedSessions: 0 };
  }

  const selectedDays = Array.from(new Set(days)).sort((a, b) => TUTOR_MODULE_WEEKDAY_TO_JS[a] - TUTOR_MODULE_WEEKDAY_TO_JS[b]);
  let cursor = parseLocalDate(startDate);
  let delivered = 0;
  let shiftedSessions = 0;
  let actualStartDate = '';
  let effectiveEndDate = startDate;
  let guard = 0;

  while (delivered < sessions && guard < sessions * 21 + 365) {
    const dateKey = toLocalDateKey(cursor);
    const jsDay = cursor.getDay();
    const isSelectedDay = selectedDays.some(day => TUTOR_MODULE_WEEKDAY_TO_JS[day] === jsDay);
    if (isSelectedDay) {
      if (dateHasHoliday(dateKey, holidays)) {
        shiftedSessions += 1;
      } else {
        delivered += 1;
        actualStartDate ||= dateKey;
        effectiveEndDate = dateKey;
        cursor = addDaysToLocalDate(cursor, 7);
        guard += 7;
        continue;
      }
    }
    cursor = addDaysToLocalDate(cursor, 1);
    guard += 1;
  }

  return { actualStartDate: actualStartDate || startDate, effectiveEndDate, shiftedSessions };
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
  if (session.isClash && session.shiftedTo) return 'Shifted to replacement';
  if (session.isClash) return 'Needs replacement';
  if (session.isReplacement) return 'Replacement delivered';
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

function moduleLookupVariants(value: string): string[] {
  const raw = String(value || '').trim();
  const withoutSessionSuffix = raw.replace(/\b\d+\s*s(?:essions?)?\b/gi, '').trim();
  const normalized = [raw, withoutSessionSuffix].map(normalizeModuleLookup).filter(Boolean);
  if (normalized.includes('social') || normalized.includes('socialmedia')) {
    normalized.push('social', 'socialmedia');
  }
  return Array.from(new Set(normalized));
}

function resolveCatalogModuleForBlock(block: { mod: MKey | string }, moduleName: string, catalogModules: CatalogModule[]): CatalogModule | undefined {
  const rawValue = String(block.mod || '');
  const lookupVariants = new Set([...moduleLookupVariants(rawValue), ...moduleLookupVariants(moduleName)]);
  return catalogModules.find(module => {
    const normalizedName = normalizeModuleLookup(module.name);
    return String(module.id) === rawValue || lookupVariants.has(normalizedName);
  });
}

function resolveCatalogModuleByValue(value: ModuleValue, catalogModules: CatalogModule[]): CatalogModule | undefined {
  const rawValue = String(value || '').trim();
  if (!rawValue) return undefined;
  const normalizedValue = normalizeModuleLookup(rawValue);
  return catalogModules.find(module => String(module.id) === rawValue || normalizeModuleLookup(module.name) === normalizedValue);
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

function getRowActiveHolidays(row: CohortRow, holidays: Holiday[]): Holiday[] {
  const selectedHolidayIds = new Set(row.holidayIds || []);
  return selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
}

function buildMonthlySummaryPrintHtml(summary: ModuleMonthlySummary): string {
  const totalClashedSessions = summary.affectedSessions + summary.extensionAffectedSessions;
  const totalWeeks = summary.totalWeeks || summary.scheduledSessions || summary.totalSessions + totalClashedSessions;
  const originalClashCount = summary.affectedSessions;
  const replacementAttemptClashCount = summary.extensionAffectedSessions;
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const metricRows = [
    ['Group', summary.groupName],
    ['Tutor', summary.tutor],
    ['Coach', summary.coach],
    ['Planned sessions', String(summary.totalSessions)],
    ['Skipped weeks', String(totalClashedSessions)],
    ['Delivery weeks', String(totalWeeks)],
  ];
  const renderKsbBadges = (mapping: SessionKsbMapping) => {
    const rows = [
      ['K', mapping.knowledgeCodes],
      ['S', mapping.skillCodes],
      ['B', mapping.behaviourCodes],
    ].filter(([, codes]) => Array.isArray(codes) && codes.length > 0) as [string, string[]][];
    if (!rows.length) return '';
    return `
      <div class="ksb-row">
        ${rows.map(([label, codes]) => `
          <span class="ksb-group">
            <span class="ksb-label">${escapeAlertHtml(label)}</span>
            ${codes.map(code => `<span class="ksb-code">${escapeAlertHtml(code)}</span>`).join('')}
          </span>
        `).join('')}
      </div>
    `;
  };
  const monthRows = summary.months.map(month => {
    const clashedCount = month.sessions.filter(session => session.holidays.length > 0).length;
    const validCount = month.sessions.filter(session => !session.isClash).length;
    const sessionsHtml = month.sessions.length
      ? month.sessions.map(session => {
        const status = session.isClash || session.isReplacement
          ? `<span class="status-pill ${session.isClash ? 'status-clash' : 'status-replacement'}">${escapeAlertHtml(getSessionStatusLabel(session))}</span>`
          : '';
        const holidayNote = session.holidays.length
          ? `<div class="session-note">${
            session.isReplacement
              ? `Replacement attempt blocked this week: clashed with ${escapeAlertHtml(session.holidays.map(holiday => holiday.label).join(', '))}${session.shiftedTo ? `, delivery remains shifted to ${escapeAlertHtml(formatPlanDate(session.shiftedTo))}.` : '.'}`
              : `Not delivered this week: clashed with ${escapeAlertHtml(session.holidays.map(holiday => holiday.label).join(', '))}${session.shiftedTo ? `, shifted to ${escapeAlertHtml(formatPlanDate(session.shiftedTo))}.` : '.'}`
          }</div>`
          : '';
        return `
          <div class="session-card ${session.isClash ? 'session-clash' : session.isReplacement ? 'session-replacement' : ''}">
            <div class="session-grid">
              <strong>${escapeAlertHtml(formatPlanDate(session.date))}</strong>
              <span>${escapeAlertHtml(session.sessionName)}</span>
              ${status}
            </div>
            ${renderKsbBadges(session.ksbMappings)}
            ${holidayNote}
          </div>
        `;
      }).join('')
      : '<span class="muted">No sessions</span>';
    const holidaysHtml = month.holidays.length
      ? month.holidays.map(holiday => `
        <div class="holiday-item">
          <span class="holiday-dot" style="background:${escapeAlertHtml(holiday.color)}"></span>
          <span><strong>${escapeAlertHtml(holiday.label)}</strong> <span class="muted">(${escapeAlertHtml(holiday.type)})</span> ${escapeAlertHtml(holiday.dateRange)}</span>
        </div>
      `).join('')
      : '<span class="muted">No holidays</span>';

    return `
      <tr>
        <td class="month-cell">
          <strong>${escapeAlertHtml(month.label)}</strong>
        </td>
        <td class="sessions-count">
          <strong>${validCount}</strong>
          ${clashedCount > 0 ? `<span>${clashedCount} clash${clashedCount !== 1 ? 'es' : ''} not counted</span>` : ''}
        </td>
        <td>${sessionsHtml}</td>
        <td>${holidaysHtml}</td>
      </tr>
    `;
  }).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeAlertHtml(summary.moduleName)} - Training Plan Report</title>
  <style>
    @page { size: A4 landscape; margin: 7mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17233d; font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-shell { width: 100%; }
    .top-rule { height: 4px; border-radius: 999px; background: ${escapeAlertHtml(summary.color)}; margin-bottom: 8px; }
    .header { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 8px; }
    h1 { margin: 0 0 3px; font-size: 17px; line-height: 1.1; }
    .subtitle { color: #64748b; font-size: 10px; line-height: 1.35; }
    .generated { text-align: right; color: #64748b; white-space: nowrap; font-size: 8.5px; line-height: 1.3; }
    .metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin: 8px 0; }
    .metric { border: 1px solid #dbe3ee; border-radius: 6px; padding: 6px 7px; background: #f8fafc; min-height: 36px; }
    .metric-label { display: block; color: #71829a; font-size: 7.5px; font-weight: 800; text-transform: uppercase; margin-bottom: 3px; }
    .metric-value { display: block; color: #17233d; font-size: 10px; font-weight: 800; }
    .metric-warning .metric-value { color: #b45309; }
    .warning { display: flex; gap: 6px; border: 1px solid #fde68a; background: #fffbeb; color: #7c2d12; padding: 6px 8px; border-radius: 6px; font-weight: 700; margin: 7px 0 8px; font-size: 8.8px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #dbe3ee; border-radius: 8px; overflow: visible; page-break-inside: auto; }
    thead { display: table-header-group; }
    thead th { background: #eaf0f7; color: #536882; font-size: 8px; text-transform: uppercase; text-align: left; padding: 5px 6px; }
    tbody td { vertical-align: top; border-top: 1px solid #e7edf5; padding: 5px 6px; page-break-inside: auto; }
    tbody tr { break-inside: auto; page-break-inside: auto; }
    .month-cell { width: 108px; color: #17233d; }
    .sessions-count { width: 76px; }
    .sessions-count span { display: block; margin-top: 3px; color: #dc2626; font-weight: 800; font-size: 8px; }
    .session-card { border: 1px solid #dbe3ee; border-left: 3px solid #cbd5e1; border-radius: 5px; padding: 4px 6px; margin-bottom: 3px; background: #fff; break-inside: avoid; page-break-inside: avoid; }
    .session-clash { border-color: #fecaca; border-left-color: #ef4444; background: #fff5f5; color: #991b1b; }
    .session-replacement { border-color: #a7f3d0; border-left-color: #10b981; background: #ecfdf5; color: #065f46; }
    .session-grid { display: grid; grid-template-columns: 90px minmax(160px, 1fr) 125px; gap: 7px; align-items: center; }
    .status-pill { justify-self: end; border-radius: 5px; padding: 3px 5px; font-size: 7.8px; font-weight: 800; }
    .status-clash { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .status-replacement { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .session-note { margin-top: 4px; border: 1px solid #fecaca; background: rgba(255,255,255,.75); color: #991b1b; border-radius: 4px; padding: 3px 5px; font-weight: 700; font-size: 8px; }
    .ksb-row { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
    .ksb-group { display: inline-flex; align-items: center; gap: 2px; border: 1px solid #dbe3ee; border-radius: 5px; background: #fff; padding: 2px; }
    .ksb-label { display: inline-flex; align-items: center; justify-content: center; min-width: 14px; height: 14px; border-radius: 3px; background: #0ea5e9; color: #fff; font-size: 7.5px; font-weight: 800; }
    .ksb-code { border: 1px solid #dbe3ee; border-radius: 3px; padding: 1px 3px; color: #17233d; font-size: 7.5px; font-weight: 800; }
    .holiday-item { display: flex; gap: 5px; align-items: flex-start; margin-bottom: 3px; font-size: 8.4px; }
    .holiday-dot { width: 7px; height: 7px; border-radius: 99px; margin-top: 3px; flex: 0 0 auto; }
    .muted { color: #8a98aa; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="report-shell">
    <div class="top-rule"></div>
    <div class="header">
      <div>
        <h1>${escapeAlertHtml(summary.moduleName)}</h1>
        <div class="subtitle">
          ${escapeAlertHtml(summary.programme)} - ${escapeAlertHtml(summary.cohort)}<br />
          ${escapeAlertHtml(summary.dateRange)}
        </div>
      </div>
      <div class="generated">
        Training Plan PDF<br />
        Generated ${escapeAlertHtml(generatedAt)}
      </div>
    </div>
    <div class="metrics">
      ${metricRows.map(([label, value]) => `
        <div class="metric ${label === 'Skipped weeks' && totalClashedSessions ? 'metric-warning' : ''}">
          <span class="metric-label">${escapeAlertHtml(label)}</span>
          <span class="metric-value">${escapeAlertHtml(value)}</span>
        </div>
      `).join('')}
    </div>
    ${totalClashedSessions > 0 ? `
      <div class="warning">
        <span>Warning</span>
        <span>
          ${originalClashCount} planned session${originalClashCount !== 1 ? 's were' : ' was'} skipped on holiday week${originalClashCount !== 1 ? 's' : ''}.
          ${replacementAttemptClashCount > 0 ? `${replacementAttemptClashCount} shifted session${replacementAttemptClashCount !== 1 ? 's were' : ' was'} also blocked by another holiday week.` : ''}
          Counted sessions stay at ${escapeAlertHtml(String(summary.totalSessions))}; delivery now ends on ${escapeAlertHtml(formatPlanDate(summary.effectiveEndDate))}.
        </span>
      </div>
    ` : ''}
    <table>
      <thead>
        <tr>
          <th>Month</th>
          <th>Sessions</th>
          <th>Session Dates</th>
          <th>Holidays</th>
        </tr>
      </thead>
      <tbody>${monthRows}</tbody>
    </table>
  </div>
  <script>
    window.addEventListener('load', function () {
      window.focus();
      window.print();
    });
  </script>
</body>
</html>`;
}

function exportMonthlySummaryToPdf(summary: ModuleMonthlySummary) {
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!printWindow) {
    void kbcSwal.fire({
      title: 'Export Window Blocked',
      html: 'Please allow popups for this site, then try exporting the PDF again.',
      icon: 'warning',
      confirmButtonText: 'OK',
    });
    return;
  }

  const safeFileName = `${summary.moduleName}-${summary.cohort}-${summary.dateRange}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'training-plan-report';
  printWindow.document.open();
  printWindow.document.write(buildMonthlySummaryPrintHtml(summary));
  printWindow.document.close();
  printWindow.document.title = `${safeFileName}.pdf`;
}

function buildMonthlyModuleSummaries(groups: ProgrammeGroup[], holidays: Holiday[], customModules: CustomModule[], catalogModules: CatalogModule[], ksbProfiles: KsbProfile[]): ModuleMonthlySummary[] {
  const activeProfileCodeSets = new Map(
    ksbProfiles
      .filter(profile => profile.isActive)
      .map(profile => [profile.id, buildKsbCodeSets(profile)]),
  );
  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.map(block => {
        const rowKsbCodeSets = row.ksbProfileId ? activeProfileCodeSets.get(row.ksbProfileId) : undefined;
        const meta = resolveTrainingModuleMeta(block, customModules);
        const catalogModule = resolveCatalogModuleForBlock(block, meta.lbl, catalogModules);
        const months = new Map<string, ModuleMonthSummary>();
        const scopedHolidays = getRowActiveHolidays(row, holidays);
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
        const shiftedToByOriginalNumber = new Map<number, string>();
        sessionPlan.sessions.forEach(sessionDate => {
          if (sessionDate.shiftedFrom) {
            shiftedToByDate.set(sessionDate.shiftedFrom.date, sessionDate.date);
            shiftedToByOriginalNumber.set(sessionDate.shiftedFrom.originalNumber, sessionDate.date);
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
            ksbMappings: filterSessionKsbMappingForProfile(block.sessionKsbMappings?.[mappingIndex], rowKsbCodeSets),
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
          const isReplacementAttempt = skippedSession.isExtension;
          months.get(monthKey)!.sessions.push({
            date,
            sessionName: catalogModule?.sessionNames?.[skippedSession.originalNumber - 1]?.trim() || `Session ${skippedSession.originalNumber}`,
            ksbMappings: filterSessionKsbMappingForProfile(block.sessionKsbMappings?.[mappingIndex], rowKsbCodeSets),
            tutor: block.tutor || 'TBD',
            coach: block.coachName || 'TBD',
            time: `${block.sessionStartTime || '09:00'}${block.sessionEndTime ? ` - ${block.sessionEndTime}` : ''}`,
            holidays: skippedSession.holidays.map(toMonthlyHoliday),
            isClash: true,
            isReplacement: isReplacementAttempt,
            countedNumber: null,
            shiftedTo: shiftedToByDate.get(date) || (isReplacementAttempt ? shiftedToByOriginalNumber.get(skippedSession.originalNumber) : undefined),
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
          programmeId: group.id,
          cohortId: row.id,
          moduleBlockId: block.id,
          programme: group.name.replace('\n', ' '),
          programmeColor: group.color,
          cohort: row.label,
          moduleName: meta.lbl,
          moduleCatalogueId: block.moduleCatalogueId,
          groupName: block.groupName || 'No group name',
          moduleStartDate: block.startDate,
          moduleEndDate: sessionPlan.effectiveEndDate,
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

function MonthlyModuleSummaryModal({ summary, mode = 'monthly', onClose, onBack }: { summary: ModuleMonthlySummary; mode?: ModuleOverviewMode; onClose: () => void; onBack?: () => void }) {
  const selectedMonths = summary.months;
  const totalClashedSessions = summary.affectedSessions + summary.extensionAffectedSessions;
  const totalWeeks = summary.totalWeeks || summary.scheduledSessions || summary.totalSessions + totalClashedSessions;
  const originalClashCount = summary.affectedSessions;
  const replacementAttemptClashCount = summary.extensionAffectedSessions;
  const isMonthly = mode === 'monthly';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={onBack ? 'Back to module overview options' : 'Close module overview'}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
        onClick={onBack || onClose}
      />
      <div className="relative flex h-[calc(100vh-2rem)] max-h-[960px] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-white/80 bg-slate-50 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-3 w-3 rounded-sm shadow-sm" style={{ background: summary.color }} />
              <h3 className="truncate text-base font-extrabold text-kbc-navy">Module Overview</h3>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                {isMonthly ? 'Monthly Module Breakdown' : 'Subprogramme Students'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
              <p className="truncate text-2xl font-black text-gray-900">{summary.moduleName}</p>
              <p className="pb-1 text-sm font-bold text-slate-500">{summary.dateRange}</p>
            </div>
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
              <span className="truncate">{summary.programme}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="truncate">{summary.cohort}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="truncate">{summary.groupName}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isMonthly && (
              <button
                type="button"
                onClick={() => exportMonthlySummaryToPdf(summary)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-kbc-navy shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
                title="Export this module breakdown as a PDF"
              >
                <i className="ri-download-2-line text-base" />
                <span>Export PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-slate-100 hover:text-kbc-navy"
            >
              <i className="ri-close-line text-lg" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs text-gray-500 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['ri-group-line', 'Group', summary.groupName],
            ['ri-user-3-line', 'Tutor', summary.tutor],
            ['ri-user-star-line', 'Coach', summary.coach],
            ['ri-calendar-check-line', 'Planned sessions', summary.totalSessions],
            ['ri-alert-line', 'Skipped weeks', totalClashedSessions],
            ['ri-route-line', 'Delivery weeks', totalWeeks],
          ].map(([icon, label, value]) => (
            <div key={label} className="flex min-h-[58px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${label === 'Skipped weeks' && totalClashedSessions ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-kbc-navy'}`}>
                <i className={`${icon} text-base`} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{label}</span>
                <span className={`mt-0.5 block truncate font-extrabold ${label === 'Skipped weeks' && totalClashedSessions ? 'text-amber-700' : 'text-gray-800'}`} title={String(value)}>{value}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-kbc-navy px-3 text-xs font-extrabold text-white shadow-sm">
            <i className={`${isMonthly ? 'ri-calendar-event-line' : 'ri-team-line'} text-sm`} aria-hidden="true" />
            {isMonthly ? 'Monthly Module Breakdown' : 'Subprogramme Students'}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            {summary.scheduledSessions} scheduled / {summary.totalSessions} planned
          </span>
        </div>
        {isMonthly && totalClashedSessions > 0 && (
          <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs font-semibold text-amber-900">
            <i className="ri-alert-line mt-0.5 text-sm text-amber-700" />
            <span>
              {originalClashCount} planned session{originalClashCount !== 1 ? 's were' : ' was'} skipped on holiday week{originalClashCount !== 1 ? 's' : ''}.
              {replacementAttemptClashCount > 0 ? ` ${replacementAttemptClashCount} shifted session${replacementAttemptClashCount !== 1 ? 's were' : ' was'} also blocked by another holiday week.` : ''}
              {' '}Counted sessions stay at {summary.totalSessions}; delivery now ends on {formatPlanDate(summary.effectiveEndDate)}.
            </span>
          </div>
        )}

        {isMonthly && (
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="w-44 px-3 py-2 font-bold">Month</th>
                  <th className="w-28 px-3 py-2 font-bold">Counted</th>
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
                      <span className="mt-0.5 block text-[10px] font-bold uppercase text-slate-400">delivered</span>
                      {clashedCount > 0 && (
                        <span className="mt-1 block text-[11px] font-bold text-red-600">
                          {clashedCount} skipped
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
                                  Blocked by {session.holidays.map(holiday => holiday.label).join(', ')}
                                  {session.shiftedTo ? `; replacement scheduled on ${formatPlanDate(session.shiftedTo)}.` : '.'}
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
        )}
        {!isMonthly && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ModuleOverviewStudentsTab summary={summary} isActive />
        </div>
        )}
      </div>
    </div>
  );
}

function ModuleOverviewStudentsTab({ summary, isActive }: { summary: ModuleMonthlySummary; isActive: boolean }) {
  const [payload, setPayload] = useState<ModuleOverviewLearnerPayload | null>(null);
  const [subprogrammeOptions, setSubprogrammeOptions] = useState<string[]>([]);
  const [selectedSubprogramme, setSelectedSubprogramme] = useState('');
  const [liveLearners, setLiveLearners] = useState<ModuleOverviewLearner[]>([]);
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<Set<string>>(new Set());
  const [mappingLoading, setMappingLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [learnersLoading, setLearnersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [subprogrammeOpen, setSubprogrammeOpen] = useState(false);
  const [subprogrammeSearch, setSubprogrammeSearch] = useState('');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'selected' | 'name-asc' | 'name-desc' | 'email-asc' | 'status'>('selected');

  const moduleCatalogueId = String(summary.moduleCatalogueId || '').trim();
  const scopedMappingEndpoint = summary.cohortId && summary.moduleBlockId
    ? `/api/training-plan/cohorts/${encodeURIComponent(summary.cohortId)}/modules/${encodeURIComponent(summary.moduleBlockId)}/learners/`
    : '';
  const mappingEndpoint = scopedMappingEndpoint || (moduleCatalogueId ? `/api/training-plan/modules/${encodeURIComponent(moduleCatalogueId)}/learners/` : '');

  const learnerIdentity = (learner: ModuleOverviewLearner) => (
    learner.learnerIdentity
    || (learner.learnerId ? `id:${learner.learnerId}` : '')
    || (learner.learnerEmail || learner.email ? `email:${String(learner.learnerEmail || learner.email).toLowerCase()}` : '')
    || `name:${String(learner.learnerName || learner.name || '').trim().toLowerCase()}`
  );
  const isLearnerSelected = (learner: ModuleOverviewLearner) => learner.isSelected !== false && learner.selected !== false;

  const mergeLearners = useCallback((live: ModuleOverviewLearner[], saved: ModuleOverviewLearner[]) => {
    const byIdentity = new Map<string, ModuleOverviewLearner>();
    live.forEach((learner, index) => {
      const identity = learnerIdentity(learner);
      if (!identity || identity === 'name:') return;
      byIdentity.set(identity, {
        ...learner,
        learnerIdentity: identity,
        sortOrder: learner.sortOrder ?? index,
        missingFromAptem: false,
      });
    });
    saved.forEach((learner, index) => {
      const identity = learnerIdentity(learner);
      if (!identity || identity === 'name:') return;
      if (byIdentity.has(identity)) {
        byIdentity.set(identity, {
          ...byIdentity.get(identity)!,
          ...learner,
          learnerIdentity: identity,
          missingFromAptem: false,
        });
      } else {
        byIdentity.set(identity, {
          ...learner,
          learnerIdentity: identity,
          sortOrder: learner.sortOrder ?? live.length + index,
          missingFromAptem: true,
        });
      }
    });
    return Array.from(byIdentity.values());
  }, []);

  const loadLearnersForSubprogramme = useCallback(async (subprogramme: string, savedLearners: ModuleOverviewLearner[] = []) => {
    const cleanSubprogramme = subprogramme.trim();
    if (!cleanSubprogramme) {
      setLiveLearners(savedLearners);
      return;
    }
    setLearnersLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/aptem/learners/?subprogramme=${encodeURIComponent(cleanSubprogramme)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, `Learner load failed with status ${response.status}`));
      const data = await response.json() as { items?: ModuleOverviewLearner[] };
      setLiveLearners(mergeLearners(Array.isArray(data.items) ? data.items : [], savedLearners));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Aptem learners.');
      setLiveLearners(savedLearners);
    } finally {
      setLearnersLoading(false);
    }
  }, [mergeLearners]);

  useEffect(() => {
    if (!isActive || hasLoaded) return;
    let cancelled = false;
    const loadMapping = async () => {
      setMappingLoading(true);
      setOptionsLoading(true);
      setError('');
      try {
        const [mappingResult, nextOptions] = await Promise.all([
          mappingEndpoint
            ? fetch(mappingEndpoint, { cache: 'no-store' })
            : Promise.resolve(null),
          loadAptemSubprogrammesForModule({}, { cache: 'no-store' }),
        ]);
        if (mappingResult && !mappingResult.ok) throw new Error((await mappingResult.text()).trim() || `Learner mapping load failed with status ${mappingResult.status}`);
        const nextPayload = mappingResult
          ? await mappingResult.json() as ModuleOverviewLearnerPayload
          : { moduleName: summary.moduleName, subprogramme: '', selectedCount: 0, learners: [] };
        if (!cancelled) {
          const savedLearners = Array.isArray(nextPayload.learners) ? nextPayload.learners : [];
          const savedSubprogramme = String(nextPayload.subprogramme || '').trim();
          setPayload(nextPayload);
          setSubprogrammeOptions(nextOptions);
          setSelectedSubprogramme(savedSubprogramme);
          setSelectedLearnerIds(new Set(savedLearners.filter(isLearnerSelected).map(learnerIdentity)));
          setMappingDirty(false);
          if (savedSubprogramme) {
            await loadLearnersForSubprogramme(savedSubprogramme, savedLearners);
          } else {
            setLiveLearners([]);
          }
          if (!cancelled) setHasLoaded(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load mapped learners.');
          setHasLoaded(true);
        }
      } finally {
        if (!cancelled) {
          setMappingLoading(false);
          setOptionsLoading(false);
        }
      }
    };
    void loadMapping();
    return () => { cancelled = true; };
  }, [hasLoaded, isActive, loadLearnersForSubprogramme, mappingEndpoint, summary.moduleName]);

  const handleSubprogrammeChange = (value: string) => {
    setSelectedSubprogramme(value);
    setSubprogrammeOpen(false);
    setSubprogrammeSearch('');
    setSelectedLearnerIds(new Set());
    setMappingDirty(true);
    setPayload(prev => ({ ...(prev || {}), moduleName: prev?.moduleName || summary.moduleName, subprogramme: value, selectedCount: 0, learners: [] }));
    void loadLearnersForSubprogramme(value, []);
  };

  const learners = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = liveLearners.filter(learner => {
      if (!query) return true;
      const rowText = [
        learner.learnerName || learner.name || '',
        learner.learnerEmail || learner.email || '',
        learner.group || '',
        learner.managerName || '',
        learner.managerEmail || '',
        learner.programmeName || '',
        learner.programmeStatus || learner.status || '',
      ].join(' ').toLowerCase();
      return rowText.includes(query);
    });
    return [...filtered].sort((left, right) => {
      const leftSelected = selectedLearnerIds.has(learnerIdentity(left));
      const rightSelected = selectedLearnerIds.has(learnerIdentity(right));
      if (sortMode === 'selected') {
        const selectedDelta = Number(rightSelected) - Number(leftSelected);
        if (selectedDelta) return selectedDelta;
      }
      const leftName = left.learnerName || left.name || '';
      const rightName = right.learnerName || right.name || '';
      const leftEmail = left.learnerEmail || left.email || '';
      const rightEmail = right.learnerEmail || right.email || '';
      const leftStatus = left.programmeStatus || left.status || '';
      const rightStatus = right.programmeStatus || right.status || '';
      if (sortMode === 'name-asc') return leftName.localeCompare(rightName) || leftEmail.localeCompare(rightEmail);
      if (sortMode === 'name-desc') return rightName.localeCompare(leftName) || leftEmail.localeCompare(rightEmail);
      if (sortMode === 'email-asc') return leftEmail.localeCompare(rightEmail) || leftName.localeCompare(rightName);
      if (sortMode === 'status') return leftStatus.localeCompare(rightStatus) || leftName.localeCompare(rightName);
      return (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || leftName.localeCompare(rightName);
    });
  }, [liveLearners, search, selectedLearnerIds, sortMode]);

  const selectedCount = selectedLearnerIds.size;
  const selectedVisibleCount = learners.filter(learner => selectedLearnerIds.has(learnerIdentity(learner))).length;
  const isLoading = mappingLoading || optionsLoading || learnersLoading;
  const filteredSubprogrammeOptions = useMemo(() => {
    const query = subprogrammeSearch.trim().toLowerCase();
    const ranked = rankAptemSubprogrammeOptions(subprogrammeOptions, {
      programmeName: summary.programme,
      cohortName: summary.cohort,
      moduleName: summary.moduleName,
      moduleStartDate: summary.moduleStartDate,
      moduleEndDate: summary.moduleEndDate,
      groupName: summary.groupName,
    });
    if (!query) return ranked;
    return ranked.filter(item => item.value.toLowerCase().includes(query));
  }, [subprogrammeOptions, subprogrammeSearch, summary.cohort, summary.groupName, summary.moduleEndDate, summary.moduleName, summary.moduleStartDate, summary.programme]);
  const suggestedSubprogrammeOptions = useMemo(() => filteredSubprogrammeOptions.filter(item => item.isSuggested), [filteredSubprogrammeOptions]);
  const normalSubprogrammeOptions = useMemo(() => filteredSubprogrammeOptions.filter(item => !item.isSuggested), [filteredSubprogrammeOptions]);

  const toggleLearner = (identity: string) => {
    setMappingDirty(true);
    setSelectedLearnerIds(prev => {
      const next = new Set(prev);
      if (next.has(identity)) next.delete(identity);
      else next.add(identity);
      return next;
    });
  };

  const selectAllVisible = () => {
    setMappingDirty(true);
    setSelectedLearnerIds(prev => {
      const next = new Set(prev);
      learners.forEach(learner => next.add(learnerIdentity(learner)));
      return next;
    });
  };

  const clearVisible = () => {
    setMappingDirty(true);
    setSelectedLearnerIds(prev => {
      const next = new Set(prev);
      learners.forEach(learner => next.delete(learnerIdentity(learner)));
      return next;
    });
  };

  const saveLearnerMapping = async () => {
    if (!mappingEndpoint) {
      setError('This module does not have a stable learner mapping scope.');
      return;
    }
    const cleanSubprogramme = selectedSubprogramme.trim();
    if (!cleanSubprogramme) {
      setError('Select a subprogramme before saving learner mapping.');
      return;
    }
    const selectedLearners = liveLearners
      .filter(learner => selectedLearnerIds.has(learnerIdentity(learner)))
      .map((learner, index) => ({
        learnerIdentity: learnerIdentity(learner),
        learnerId: learner.learnerId || '',
        name: learner.learnerName || learner.name || '',
        email: learner.learnerEmail || learner.email || '',
        programmeStatus: learner.programmeStatus || learner.status || '',
        subprogramme: cleanSubprogramme,
        sortOrder: learner.sortOrder ?? index,
        isSelected: true,
      }));
    setSaving(true);
    setError('');
    try {
      const response = await fetch(mappingEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subprogramme: cleanSubprogramme, learners: selectedLearners }),
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, `Learner mapping save failed with status ${response.status}`));
      const nextPayload = await response.json() as ModuleOverviewLearnerPayload;
      const savedLearners = Array.isArray(nextPayload.learners) ? nextPayload.learners : selectedLearners;
      setPayload({ ...nextPayload, moduleName: nextPayload.moduleName || payload?.moduleName || summary.moduleName, selectedCount: selectedLearners.length });
      setSelectedLearnerIds(new Set(savedLearners.filter(isLearnerSelected).map(learnerIdentity)));
      setLiveLearners(prev => mergeLearners(prev, savedLearners));
      setMappingDirty(false);
      await kbcSuccessSwal.fire({
        title: 'Learner Mapping Saved',
        html: `<strong>${selectedLearners.length}</strong> learner${selectedLearners.length === 1 ? '' : 's'} mapped to this cohort module.`,
        icon: 'success',
        confirmButtonText: 'OK',
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save learner mapping.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 p-5">
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3">
        <div className="relative min-w-0">
          <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Subprogramme</span>
          <button
            type="button"
            onClick={() => {
              setSubprogrammeOpen(prev => !prev);
              setSubprogrammeSearch('');
            }}
            disabled={optionsLoading}
            className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 text-left text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-slate-300 focus:border-kbc-navy focus:outline-none disabled:opacity-60"
            aria-label="Subprogramme"
          >
            <span className={`min-w-0 flex-1 truncate ${selectedSubprogramme ? '' : 'text-gray-400'}`}>
              {selectedSubprogramme || 'Choose an Aptem subprogramme'}
            </span>
            <i className={`ri-arrow-down-s-line shrink-0 text-base text-gray-400 transition-transform ${subprogrammeOpen ? 'rotate-180' : ''}`} />
          </button>
          {subprogrammeOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              <div className="border-b border-gray-100 bg-slate-50 p-2">
                <input
                  type="text"
                  value={subprogrammeSearch}
                  onChange={event => setSubprogrammeSearch(event.target.value)}
                  placeholder="Search subprogrammes"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm focus:border-kbc-navy focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                <span>Aptem subprogrammes</span>
                <span>{filteredSubprogrammeOptions.length} shown</span>
              </div>
              <div className="max-h-72 overflow-y-auto p-1.5">
                <button
                  type="button"
                  onClick={() => handleSubprogrammeChange('')}
                  className="mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-gray-500 hover:bg-slate-50"
                >
                  <span className="h-2 w-2 rounded-full border border-slate-300" />
                  <span>Choose an Aptem subprogramme</span>
                </button>
                {filteredSubprogrammeOptions.length ? (
                  <>
                    {suggestedSubprogrammeOptions.length > 0 && (
                      <div className="px-3 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                        Suggested matches
                      </div>
                    )}
                    {suggestedSubprogrammeOptions.map(item => (
                      <button
                        key={item.value}
                        type="button"
                        title={item.value}
                        onClick={() => handleSubprogrammeChange(item.value)}
                        className={`group flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left text-xs font-semibold transition-colors hover:bg-slate-50 ${item.value === selectedSubprogramme ? 'bg-kbc-navy/5 text-kbc-navy' : 'text-gray-700'}`}
                        data-subprogramme-option={item.value}
                        data-suggested="true"
                      >
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.value === selectedSubprogramme ? 'bg-kbc-navy' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
                        <span className="block min-w-0 flex-1 truncate leading-5">
                          {item.value}
                        </span>
                        <span className="ml-auto flex max-w-[45%] shrink-0 flex-wrap justify-end gap-1">
                          {item.badges.map(badge => (
                            <span key={badge} className="rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-blue-700">
                              {badge}
                            </span>
                          ))}
                        </span>
                      </button>
                    ))}
                    {normalSubprogrammeOptions.length > 0 && (
                      <div className="px-3 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                        All subprogrammes
                      </div>
                    )}
                    {normalSubprogrammeOptions.map(item => (
                    <button
                      key={item.value}
                      type="button"
                      title={item.value}
                      onClick={() => handleSubprogrammeChange(item.value)}
                      className={`group flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left text-xs font-semibold transition-colors hover:bg-slate-50 ${item.value === selectedSubprogramme ? 'bg-kbc-navy/5 text-kbc-navy' : 'text-gray-700'}`}
                      data-subprogramme-option={item.value}
                      data-suggested="false"
                    >
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.value === selectedSubprogramme ? 'bg-kbc-navy' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
                      <span className="block min-w-0 flex-1 whitespace-normal break-words leading-5">
                        {item.value}
                      </span>
                    </button>
                    ))}
                  </>
                ) : (
                  <div className="px-3 py-4 text-center text-xs font-semibold text-gray-400">
                    No matching subprogrammes.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {subprogrammeOptions.length === 0 && !optionsLoading && !subprogrammeOpen && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          No subprogrammes found.
        </div>
      )}

      <div className="mt-4 shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search learners by name, email, group, manager, programme, or status..."
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-gray-700 outline-none transition-colors focus:border-kbc-navy"
            />
          </div>
          <select
            value={sortMode}
            onChange={event => setSortMode(event.target.value as typeof sortMode)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-extrabold text-gray-700 outline-none transition-colors focus:border-kbc-navy"
            aria-label="Sort mapped learners"
          >
            <option value="selected">Selected first</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="email-asc">Email A-Z</option>
            <option value="status">Programme Status</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-extrabold text-kbc-navy">Selected {selectedCount} / {liveLearners.length}</span>
            {learners.length !== liveLearners.length && <span>{selectedVisibleCount} visible</span>}
          </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={selectAllVisible} disabled={!learners.length} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-extrabold text-kbc-navy transition-colors hover:bg-slate-50 disabled:opacity-50">
            Select all visible
          </button>
          <button type="button" onClick={clearVisible} disabled={!learners.length} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-extrabold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50">
            Clear visible
          </button>
        </div>
        </div>
      </div>

      {isLoading && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
          Loading learner mapping...
        </div>
      )}
      {!isLoading && error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      {!isLoading && !error && !selectedSubprogramme && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-kbc-navy">
            <i className="ri-team-line text-xl" />
          </span>
          <p className="mt-3 text-sm font-extrabold text-kbc-navy">Select a subprogramme to view and map learners to this module.</p>
        </div>
      )}
      {!isLoading && !error && selectedSubprogramme && liveLearners.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center shadow-sm">
          <p className="text-sm font-extrabold text-kbc-navy">No learners found for this subprogramme.</p>
        </div>
      )}
      {!isLoading && !error && selectedSubprogramme && liveLearners.length > 0 && learners.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center shadow-sm">
          <p className="text-sm font-extrabold text-kbc-navy">No learners match your search.</p>
        </div>
      )}
      {!isLoading && !error && learners.length > 0 && (
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Learners</p>
              <p className="mt-0.5 text-sm font-extrabold text-kbc-navy">
                {learners.length} shown
                {learners.length !== liveLearners.length ? ` from ${liveLearners.length}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px] font-extrabold">
              <span className="rounded-full bg-kbc-navy px-2.5 py-1 text-white">{selectedCount} selected</span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{liveLearners.length} total</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70 p-3">
            <div className="space-y-2" role="table" aria-label="Subprogramme learners">
              {learners.map((learner, index) => {
                const name = learner.learnerName || learner.name || 'Unnamed learner';
                const email = learner.learnerEmail || learner.email || '';
                const group = learner.group || '';
                const managerName = learner.managerName || '';
                const managerEmail = learner.managerEmail || '';
                const programmeName = learner.programmeName || '';
                const status = learner.programmeStatus || learner.status || '';
                const identity = learnerIdentity(learner);
                const checked = selectedLearnerIds.has(identity);
                const statusClassName = status.toLowerCase().includes('active')
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  : status
                    ? 'border-amber-100 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500';
                const detailGroups = [
                  { icon: 'ri-group-line', label: 'Group', value: group },
                  { icon: 'ri-graduation-cap-line', label: 'Programme', value: programmeName },
                  { icon: 'ri-user-settings-line', label: 'Manager', value: managerName, subValue: managerEmail },
                ];

                return (
                  <div
                    key={learner.learnerIdentity || `${name}-${email}-${index}`}
                    role="row"
                    className={`rounded-xl border bg-white p-3 shadow-sm transition-colors ${checked ? 'border-kbc-navy/40 ring-1 ring-kbc-navy/10' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLearner(identity)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                        aria-label={`Select ${name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p role="cell" className="truncate text-sm font-black text-gray-900" title={name}>{name}</p>
                            <p role="cell" className="mt-0.5 truncate text-xs font-semibold text-slate-500" title={email || undefined}>{email || 'No learner email'}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClassName}`}>
                              {status || 'No status'}
                            </span>
                            {checked && (
                              <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-blue-700">
                                Selected
                              </span>
                            )}
                          </div>
                        </div>

                        {learner.missingFromAptem && (
                          <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                            Previously selected, not found in Aptem
                          </span>
                        )}

                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                          {detailGroups.map(item => (
                            <div key={item.label} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                                <i className={`${item.icon} text-sm text-slate-500`} aria-hidden="true" />
                                <span>{item.label}</span>
                              </div>
                              <p className="mt-1 truncate text-xs font-extrabold text-gray-800" title={item.value || undefined}>{item.value || '-'}</p>
                              {item.subValue && (
                                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500" title={item.subValue}>{item.subValue}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            Showing {learners.length} learner{learners.length === 1 ? '' : 's'}{learners.length !== liveLearners.length ? ` from ${liveLearners.length}` : ''}
          </div>
        </div>
      )}
      <div className="mt-3 flex shrink-0 justify-end border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={() => void saveLearnerMapping()}
          disabled={saving || !mappingDirty || !selectedSubprogramme.trim() || !mappingEndpoint}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-kbc-navy px-4 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80 disabled:shadow-none"
        >
          <i className={saving ? 'ri-loader-4-line animate-spin' : mappingDirty ? 'ri-save-3-line' : 'ri-check-line'} />
          {saving ? 'Saving...' : mappingDirty ? 'Save Learner Mapping' : 'Saved'}
        </button>
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
                  className="grid w-full grid-cols-[22px_minmax(86px,1fr)_54px_54px_18px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs transition-colors last:border-b-0 hover:bg-slate-100 sm:grid-cols-[42px_minmax(0,1fr)_88px_88px_32px] sm:gap-3 sm:px-4"
                >
                  <span className="flex items-center gap-2">
                    <i className="hidden text-sm text-gray-400 sm:inline-block ri-external-link-line" />
                    <span className="h-3 w-3 rounded-sm" style={{ background: group.color }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-extrabold text-kbc-navy sm:text-sm">{group.programme}</span>
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
        <MonthlyModuleSummaryModal summary={selectedSummary} mode="monthly" onClose={() => setSelectedSummary(null)} />
      )}
    </>
  );
}

type TrainingPlanProgramConfigPayload = CustomProgram;
type TrainingPlanPayload = { items: TrainingPlanItem[]; version?: string; count?: number };
type TrainingPlanHolidayPayload = { items: Holiday[]; version?: string };

function parseTrainingPlanPayload(payload: unknown): TrainingPlanPayload | null {
  if (Array.isArray(payload)) {
    return { items: payload as TrainingPlanItem[], version: undefined, count: payload.length };
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
    const typedPayload = payload as { items: TrainingPlanItem[]; version?: unknown; count?: unknown };
    return {
      items: typedPayload.items,
      version: typeof typedPayload.version === 'string' ? typedPayload.version : undefined,
      count: typeof typedPayload.count === 'number' ? typedPayload.count : typedPayload.items.length,
    };
  }
  return null;
}

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
  const [tutorProfiles, setTutorProfiles] = useState<TutorProfile[]>([]);
  const [coachProfiles, setCoachProfiles] = useState<CoachProfile[]>([]);
  const [trainingPlanItems, setTrainingPlanItems] = useState<TrainingPlanItem[]>([]);
  const [trainingPlanVersion, setTrainingPlanVersion] = useState<string | undefined>(undefined);
  const [groups,   setGroups]   = useState<ProgrammeGroup[]>(() => buildAllGroups());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayVersion, setHolidayVersion] = useState<string | undefined>(undefined);
  const [moduleDefinitionsVersion, setModuleDefinitionsVersion] = useState<string | undefined>(undefined);
  const [programConfigsVersion, setProgramConfigsVersion] = useState<string | undefined>(undefined);
  const [modal,    setModal]    = useState<ModalState>({ open: false });
  const [showHolidayMgr, setShowHolidayMgr] = useState(false);
  const [showAddModule,  setShowAddModule]  = useState(false);
  const [showAddCatalogModule, setShowAddCatalogModule] = useState(false);
  const [showManageModules, setShowManageModules] = useState(false);
  const [showKsbProfiles, setShowKsbProfiles] = useState(false);
  const [initialManageModuleId, setInitialManageModuleId] = useState<number | null>(null);
  const [returnEditChoice, setReturnEditChoice] = useState<EditChoiceState | null>(null);
  const [visibleEditChoice, setVisibleEditChoice] = useState<EditChoiceState | null>(null);
  const [pendingOverviewChoiceDetails, setPendingOverviewChoiceDetails] = useState<ModuleOverviewChoiceDetails | null>(null);
  const [pendingOverviewReturnChoice, setPendingOverviewReturnChoice] = useState<EditChoiceState | null>(null);
  const [pendingTutorModuleAdd, setPendingTutorModuleAdd] = useState<TutorModuleAddChoice | null>(null);
  const [pendingTutorModuleCohort, setPendingTutorModuleCohort] = useState('');
  const [pendingTutorModuleGroup, setPendingTutorModuleGroup] = useState('');
  const [pendingTutorModuleCreateGroup, setPendingTutorModuleCreateGroup] = useState(false);
  const [pendingTutorModuleGroupDraft, setPendingTutorModuleGroupDraft] = useState<TutorModuleGroupDraft>({
    name: '',
    coach: '',
    days: ['monday'],
    startTime: '09:00',
    endTime: '11:00',
  });
  const [pendingTutorModuleStartDate, setPendingTutorModuleStartDate] = useState('');
  const [pendingTutorModuleSaving, setPendingTutorModuleSaving] = useState(false);
  const [pendingTutorModuleError, setPendingTutorModuleError] = useState('');
  const [selectedMonthlySummary, setSelectedMonthlySummary] = useState<{ summary: ModuleMonthlySummary; mode: ModuleOverviewMode; overviewChoiceDetails?: ModuleOverviewChoiceDetails } | null>(null);
  const [programModal, setProgramModal] = useState<ProgramModalState>({ open: false });
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [activeTab, setActiveTab] = useState<'gantt' | 'schedule' | 'tutors' | 'coaches'>('gantt');
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const showHiddenCohortActions = addDropdownOpen && !addDropdownOpen;
  const addDropdownRef = useRef<HTMLDivElement>(null);
  const [trainingPlanSaveState, setTrainingPlanSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [trainingPlanSaveMessage, setTrainingPlanSaveMessage] = useState('Waiting for changes');
  const [trainingPlanServerUnavailable, setTrainingPlanServerUnavailable] = useState(false);
  const [trainingPlanServerRecovered, setTrainingPlanServerRecovered] = useState(false);
  const [hasLoadedTrainingPlan, setHasLoadedTrainingPlan] = useState(false);
  const [hasLoadedProgramConfigs, setHasLoadedProgramConfigs] = useState(false);
  const skipPersistRef = useRef(true);

  const markTrainingPlanServerUnavailable = useCallback((message = 'Server temporarily unavailable. Training Plan data has not been deleted.'): void => {
    setTrainingPlanServerUnavailable(true);
    setTrainingPlanServerRecovered(false);
    setTrainingPlanSaveState('error');
    setTrainingPlanSaveMessage(message);
  }, []);

  const checkTrainingPlanHealth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/health/', { cache: 'no-store' });
      const healthy = response.ok;
      if (healthy) {
        setTrainingPlanServerUnavailable(false);
        setTrainingPlanServerRecovered(true);
        setTrainingPlanSaveMessage('Server recovered. Reload latest data before saving.');
      }
      return healthy;
    } catch {
      return false;
    }
  }, []);

  const isTemporaryTrainingPlanOutage = (error: unknown): boolean => {
    if (error instanceof TypeError) return true;
    const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status?: number }).status) : 0;
    return TEMPORARY_SERVER_STATUSES.has(status);
  };

  const handleTrainingPlanRequestFailure = useCallback(async (error: unknown, title = 'Training Plan Server Unavailable'): Promise<void> => {
    if (isTemporaryTrainingPlanOutage(error)) {
      markTrainingPlanServerUnavailable();
      await kbcSwal.fire({
        title,
        html: 'The backend is temporarily unavailable. Training Plan data has not been deleted.<br /><br />Save is disabled until the server is healthy again. Reload latest data after recovery.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      void checkTrainingPlanHealth();
      return;
    }
    throw error;
  }, [checkTrainingPlanHealth, markTrainingPlanServerUnavailable]);

  useEffect(() => {
    if (!trainingPlanServerUnavailable) return;
    const timer = window.setInterval(() => {
      void checkTrainingPlanHealth();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [checkTrainingPlanHealth, trainingPlanServerUnavailable]);

  const reloadTrainingPlan = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/training-plan/');
      if (!response.ok) {
        return false;
      }

      const payload = parseTrainingPlanPayload(await response.json());
      if (!payload || !Array.isArray(payload.items)) {
        return false;
      }

      setTrainingPlanItems(payload.items);
      setTrainingPlanVersion(payload.version);
      setHasLoadedTrainingPlan(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchLatestTrainingPlanItems = useCallback(async (): Promise<TrainingPlanItem[] | null> => {
    try {
      const response = await fetch('/api/training-plan/', { cache: 'no-store' });
      if (!response.ok) return null;
      const payload = parseTrainingPlanPayload(await response.json());
      if (!payload || !Array.isArray(payload.items)) return null;
      setTrainingPlanItems(payload.items);
      setTrainingPlanVersion(payload.version);
      setHasLoadedTrainingPlan(true);
      return payload.items;
    } catch {
      return null;
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

  const reloadTutorProfiles = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/tutor-profiles/?includeInactive=1');
      if (!response.ok) {
        return false;
      }

      const items = (await response.json()) as TutorProfile[];
      if (!Array.isArray(items)) {
        return false;
      }

      setTutorProfiles(items);
      return true;
    } catch {
      return false;
    }
  }, []);

  const reloadCoachProfiles = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/coach-profiles/?includeInactive=1');
      if (!response.ok) {
        return false;
      }

      const items = (await response.json()) as CoachProfile[];
      if (!Array.isArray(items)) {
        return false;
      }

      setCoachProfiles(items);
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
      tutorProfilesResult,
      coachProfilesResult,
    ] = await Promise.allSettled([
      fetch('/api/training-plan-modules/'),
      fetch('/api/training-plan-program-configs/'),
      reloadTrainingPlanHolidays(),
      fetch('/api/modules/'),
      fetch('/api/ksb-profiles/?includeInactive=1'),
      reloadTutorProfiles(),
      reloadCoachProfiles(),
    ]);

    if (moduleDefinitionsResult.status === 'fulfilled' && moduleDefinitionsResult.value.ok) {
      const moduleVersion = moduleDefinitionsResult.value.headers.get('X-KBC-Training-Plan-Modules-Version') || undefined;
      const items = (await moduleDefinitionsResult.value.json()) as Array<{ id: string; name: string; defaultSessions: number; bg: string; tx: string }>;
      if (Array.isArray(items)) {
        setCustomModules(items.map(item => ({
          id: item.id,
          name: item.name,
          defaultSessions: item.defaultSessions,
          bg: item.bg,
          tx: item.tx,
        })));
        setModuleDefinitionsVersion(moduleVersion);
      }
    }

    if (programConfigsResult.status === 'fulfilled' && programConfigsResult.value.ok) {
      const programVersion = programConfigsResult.value.headers.get('X-KBC-Training-Plan-Program-Configs-Version') || undefined;
      const items = (await programConfigsResult.value.json()) as TrainingPlanProgramConfigPayload[];
      if (Array.isArray(items)) {
        setCustomPrograms(items);
        setProgramConfigsVersion(programVersion);
      }
      setHasLoadedProgramConfigs(true);
    }

    if (holidaysResult.status === 'rejected') {
      // Keep current holidays if the reload fails.
    }

    if (catalogModulesResult.status === 'fulfilled' && catalogModulesResult.value.ok) {
      const raw = (await catalogModulesResult.value.json()) as (CatalogModule & { sessionNames?: string[]; sessionDescriptions?: string[]; sessionKsbMappings?: SessionKsbMapping[] })[];
      if (Array.isArray(raw)) {
        setCatalogModules(raw.map(m => ({ ...m, sessionNames: m.sessionNames ?? [], sessionDescriptions: m.sessionDescriptions ?? [], sessionKsbMappings: m.sessionKsbMappings ?? [] })));
      }
    }

    if (ksbProfilesResult.status === 'fulfilled' && ksbProfilesResult.value.ok) {
      const items = (await ksbProfilesResult.value.json()) as KsbProfile[];
      if (Array.isArray(items)) {
        setKsbProfiles(items.map(profile => ({ ...profile, ksbItems: normalizeKsbProfileItems(profile) })));
      }
    }

    if (tutorProfilesResult.status === 'rejected') {
      // Keep current tutor profiles if the reload fails.
    }

    if (coachProfilesResult.status === 'rejected') {
      // Keep current coach profiles if the reload fails.
    }
  }, [reloadCoachProfiles, reloadTrainingPlanHolidays, reloadTutorProfiles]);

  useEffect(() => {
    void reloadTrainingPlan();
  }, [reloadTrainingPlan]);

  useEffect(() => {
    setGroups(
      trainingPlanItems.length
        ? buildGroupsFromTrainingRows(trainingPlanItems, customPrograms, tutorProfiles)
        : buildAllGroups(customPrograms),
    );
  }, [trainingPlanItems, customPrograms, tutorProfiles]);

  useEffect(() => {
    void reloadTrainingPlanSupportData();
  }, [reloadTrainingPlanSupportData]);

  useRealtimeResource('trainingPlan', () => {
    void reloadTrainingPlan();
    void reloadTrainingPlanSupportData();
  });


  const isInitialProgrammesLoading = !hasLoadedTrainingPlan || !hasLoadedProgramConfigs;
  const canEditTrainingPlan = canManageCohorts && !trainingPlanServerUnavailable;

  const migratedTrainingPlanFullSaveSources = new Set([
    'cohort_add',
    'cohort_edit',
    'cohort_delete',
    'module_add_for_tutor',
    'module_edit_linked_timeline_rows',
    'module_delete_linked_timeline_rows',
    'programme_edit_linked_timeline_rows',
    'reorder_programmes',
    'reorder_cohorts',
  ]);
  const legacyTrainingPlanFullSaveFlagValue = 'internal-admin-debug';

  // Protected legacy/admin/debug escape hatch only. Normal Training Plan UI flows must use scoped endpoints.
  const persistTrainingPlan = async (
    nextGroups: ProgrammeGroup[],
    silent = false,
    source = 'unknown_legacy_save',
    options: { allowLegacyReplaceAll?: boolean } = {},
  ) => {
    if (migratedTrainingPlanFullSaveSources.has(source) || !options.allowLegacyReplaceAll) {
      console.error('LEGACY_TRAINING_PLAN_FULL_SAVE_BLOCKED', {
        source,
        migratedSource: migratedTrainingPlanFullSaveSources.has(source),
        allowLegacyReplaceAll: options.allowLegacyReplaceAll === true,
        reminder: 'Normal Training Plan UI flows must not call POST /api/training-plan/.',
      });
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Save blocked. Reload the Training Plan and try the scoped action again.');
      return false;
    }

    const items = flattenGroupsForApi(nextGroups, tutorProfiles);

    if (trainingPlanServerUnavailable) {
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Server temporarily unavailable. Training Plan data has not been deleted.');
      await kbcSwal.fire({
        title: 'Training Plan Server Unavailable',
        html: 'The backend is temporarily unavailable. Training Plan data has not been deleted.<br /><br />Save is disabled until the server is healthy again. Use Reload latest data after recovery.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      void checkTrainingPlanHealth();
      return false;
    }

    if (!hasLoadedTrainingPlan || !trainingPlanVersion) {
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Reload the Training Plan before saving.');
      await kbcSwal.fire({
        title: 'Training Plan Not Ready',
        html: 'The latest Training Plan version has not loaded yet. Please reload and review before saving.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return false;
    }

    if (!Array.isArray(items) || items.length === 0) {
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Save blocked because the local Training Plan is empty.');
      await kbcSwal.fire({
        title: 'Training Plan Not Saved',
        html: 'The local Training Plan data is empty, so the save was blocked to protect the database.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return false;
    }

    const payload = { items, version: trainingPlanVersion, confirmLegacyReplaceAll: true };
    console.warn('LEGACY_TRAINING_PLAN_FULL_SAVE_USED', {
      callerLabel: 'LEGACY_TRAINING_PLAN_FULL_SAVE_CALLER',
      userActionLabel: 'LEGACY_TRAINING_PLAN_FULL_SAVE_USER_ACTION',
      source,
      userAction: source,
      itemCount: items.length,
      reason: source,
      reminder: 'POST /api/training-plan/ deletes and recreates TrainingPlan rows after safeguards pass.',
    });

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving cohorts...');
    if (!silent) {
      void kbcSwal.fire({
        title: 'Saving cohort...',
        html: 'Please wait while the Training Plan is being updated.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          kbcSwal.showLoading();
        },
      });
    }

    try {
      const response = await fetch('/api/training-plan/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KBC-Training-Plan-Save-Source': source,
          'X-KBC-Legacy-Training-Plan-Full-Save': legacyTrainingPlanFullSaveFlagValue,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 409) {
          let detail = 'The Training Plan was updated by someone else. Please reload and review before saving.';
          try {
            const conflict = await response.json() as { detail?: string; currentVersion?: string; items?: TrainingPlanItem[] };
            if (conflict.detail) {
              detail = conflict.detail;
            }
            if (conflict.currentVersion) {
              setTrainingPlanVersion(conflict.currentVersion);
            }
            if (Array.isArray(conflict.items)) {
              setTrainingPlanItems(conflict.items);
            }
          } catch {
            // Use the default conflict message.
          }

          setTrainingPlanSaveState('error');
          setTrainingPlanSaveMessage('Save blocked because the Training Plan changed elsewhere.');
          await kbcSwal.fire({
            title: 'Training Plan Changed',
            html: `${detail}<br /><br />Please reload and review before saving.`,
            icon: 'warning',
            confirmButtonText: 'OK',
          });
          return false;
        }
        if (TEMPORARY_SERVER_STATUSES.has(response.status)) {
          throw { status: response.status };
        }
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      const result = await response.json() as { saved?: number; items?: TrainingPlanItem[]; version?: string };
      if (!result.version) {
        throw new Error('The server did not return a new Training Plan version.');
      }
      if (typeof result.saved !== 'number' || result.saved !== items.length) {
        throw new Error(`Saved ${typeof result.saved === 'number' ? result.saved : 0} of ${items.length} Training Plan rows.`);
      }

      setTrainingPlanVersion(result.version);
      setTrainingPlanItems(Array.isArray(result.items) ? result.items : items);
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
      try {
        await handleTrainingPlanRequestFailure(error, 'Cohort Not Saved');
        return false;
      } catch {
        // Continue with the normal non-outage save error below.
      }
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

  const parseHolidayMutation = async (response: Response): Promise<{ item?: Holiday; items?: Holiday[]; version?: string; deleted?: boolean }> => {
    if (!response.ok) {
      if (response.status === 409) {
        let detail = 'The holiday list was updated by someone else while you were editing. Please refresh before saving again.';
        try {
          const conflict = await response.json() as { detail?: string; currentVersion?: string; items?: Holiday[] };
          if (conflict.currentVersion) {
            setHolidayVersion(conflict.currentVersion);
          }
          if (Array.isArray(conflict.items)) {
            setHolidays(conflict.items);
          }
          if (conflict.detail) {
            detail = `${conflict.detail} Please refresh before saving again.`;
          }
        } catch {
          // Use the default conflict message.
        }
        throw new Error(detail);
      }
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    const result = await response.json() as { item?: Holiday; items?: Holiday[]; version?: string; deleted?: boolean };
    const responseVersion = response.headers.get('X-KBC-Training-Plan-Holidays-Version') || result.version;
    if (responseVersion) {
      setHolidayVersion(responseVersion);
      result.version = responseVersion;
    }
    return result;
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

    try {
      let workingVersion = holidayVersion;
      let persistedItems: Holiday[] | undefined;
      const originalById = new Map(holidays.map(holiday => [holiday.id, holiday]));
      const nextById = new Map(nextHolidays.map(holiday => [holiday.id, holiday]));
      const changed = (left: Holiday, right: Holiday) => (
        left.label !== right.label ||
        left.startDate !== right.startDate ||
        left.endDate !== right.endDate ||
        left.type !== right.type ||
        left.color !== right.color
      );

      const applyMutation = async (request: () => Promise<Response>) => {
        const result = await parseHolidayMutation(await request());
        if (result.version) {
          workingVersion = result.version;
        }
        if (Array.isArray(result.items)) {
          persistedItems = result.items;
        }
        return result;
      };

      for (const holiday of holidays) {
        if (!nextById.has(holiday.id)) {
          await applyMutation(() => fetch(`/api/training-plan-holidays/${encodeURIComponent(holiday.id)}/`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: workingVersion }),
          }));
        }
      }

      for (const holiday of nextHolidays) {
        const original = originalById.get(holiday.id);
        if (!original) {
          await applyMutation(() => fetch('/api/training-plan-holidays/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: workingVersion,
              label: holiday.label,
              startDate: holiday.startDate,
              endDate: holiday.endDate,
              type: holiday.type,
              color: holiday.color,
            }),
          }));
        } else if (changed(original, holiday)) {
          await applyMutation(() => fetch(`/api/training-plan-holidays/${encodeURIComponent(holiday.id)}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: workingVersion,
              label: holiday.label,
              startDate: holiday.startDate,
              endDate: holiday.endDate,
              type: holiday.type,
              color: holiday.color,
            }),
          }));
        }
      }

      if (persistedItems) {
        setHolidays(persistedItems);
      } else {
        setHolidays(nextHolidays);
      }
      setHolidayVersion(workingVersion);
      await kbcSuccessSwal.fire({
        icon: 'success',
        title: 'Holiday periods saved successfully',
        confirmButtonText: 'OK',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      if (message.toLowerCase().includes('refresh before saving') || message.toLowerCase().includes('reload the latest holidays')) {
        const result = await kbcSwal.fire({
          title: 'Holiday List Changed',
          html: `${message}<br /><br />Reload the latest holidays before saving again.`,
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
      await kbcSwal.fire({
        title: 'Holiday Periods Not Saved',
        html: `The latest holiday changes were not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
      return false;
    }
  };

  const parseModuleDefinitionMutation = async (response: Response): Promise<CustomModule> => {
    if (!response.ok) {
      if (response.status === 409) {
        let detail = 'The module definitions were updated by another user. Reload latest data before saving again.';
        try {
          const conflict = await response.json() as { detail?: string; currentVersion?: string };
          if (conflict.currentVersion) {
            setModuleDefinitionsVersion(conflict.currentVersion);
          }
          if (conflict.detail) {
            detail = `${conflict.detail} Reload latest data before saving again.`;
          }
        } catch {
          // Use the default conflict message.
        }
        throw new Error(detail);
      }
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    const result = await response.json() as { item?: CustomModule; version?: string };
    const responseVersion = response.headers.get('X-KBC-Training-Plan-Modules-Version') || result.version;
    if (responseVersion) {
      setModuleDefinitionsVersion(responseVersion);
    }
    if (!result.item) {
      throw new Error('The server did not return the saved module definition.');
    }
    return result.item;
  };

  const createCustomModuleDefinition = async (module: CustomModule): Promise<CustomModule> => {
    if (!moduleDefinitionsVersion) {
      throw new Error('Reload latest data before saving module definitions.');
    }
    const response = await fetch('/api/training-plan-modules/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...module, version: moduleDefinitionsVersion }),
    });
    return parseModuleDefinitionMutation(response);
  };

  const updateCustomModuleDefinition = async (module: CustomModule): Promise<CustomModule> => {
    if (!moduleDefinitionsVersion) {
      throw new Error('Reload latest data before saving module definitions.');
    }
    const response = await fetch(`/api/training-plan-modules/${encodeURIComponent(module.id)}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: moduleDefinitionsVersion,
        name: module.name,
        defaultSessions: module.defaultSessions,
        bg: module.bg,
        tx: module.tx,
      }),
    });
    return parseModuleDefinitionMutation(response);
  };

  const deleteCustomModuleDefinition = async (id: string): Promise<boolean> => {
    if (!moduleDefinitionsVersion) {
      throw new Error('Reload latest data before deleting module definitions.');
    }
    const response = await fetch(`/api/training-plan-modules/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: moduleDefinitionsVersion }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('The module definitions were updated by another user. Reload latest data before deleting.');
      }
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    const result = await response.json() as { deleted?: boolean; version?: string };
    const responseVersion = response.headers.get('X-KBC-Training-Plan-Modules-Version') || result.version;
    if (responseVersion) {
      setModuleDefinitionsVersion(responseVersion);
    }
    return result.deleted === true;
  };

  const parseProgramConfigMutation = async (response: Response): Promise<CustomProgram> => {
    if (!response.ok) {
      if (response.status === 409) {
        let detail = 'The programme configs were updated by another user. Reload latest data before saving again.';
        try {
          const conflict = await response.json() as { detail?: string; currentVersion?: string };
          if (conflict.currentVersion) {
            setProgramConfigsVersion(conflict.currentVersion);
          }
          if (conflict.detail) {
            detail = `${conflict.detail} Reload latest data before saving again.`;
          }
        } catch {
          // Use the default conflict message.
        }
        throw new Error(detail);
      }
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    const result = await response.json() as { item?: CustomProgram; version?: string };
    const responseVersion = response.headers.get('X-KBC-Training-Plan-Program-Configs-Version') || result.version;
    if (responseVersion) {
      setProgramConfigsVersion(responseVersion);
    }
    if (!result.item) {
      throw new Error('The server did not return the saved programme config.');
    }
    return result.item;
  };

  const createProgramConfig = async (program: CustomProgram): Promise<CustomProgram> => {
    if (!programConfigsVersion) {
      throw new Error('Reload latest data before saving programme configs.');
    }
    const response = await fetch('/api/training-plan-program-configs/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...program, version: programConfigsVersion }),
    });
    return parseProgramConfigMutation(response);
  };

  const updateProgramConfig = async (program: CustomProgram): Promise<CustomProgram> => {
    if (!programConfigsVersion) {
      throw new Error('Reload latest data before saving programme configs.');
    }
    const response = await fetch(`/api/training-plan-program-configs/${encodeURIComponent(program.id)}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: programConfigsVersion,
        name: program.name,
        sub: program.sub,
        color: program.color,
      }),
    });
    return parseProgramConfigMutation(response);
  };

  const deleteProgramConfig = async (id: string): Promise<boolean> => {
    if (!programConfigsVersion) {
      throw new Error('Reload latest data before deleting programme configs.');
    }
    const response = await fetch(`/api/training-plan-program-configs/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: programConfigsVersion }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('The programme configs were updated by another user. Reload latest data before deleting.');
      }
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    const result = await response.json() as { deleted?: boolean; version?: string };
    const responseVersion = response.headers.get('X-KBC-Training-Plan-Program-Configs-Version') || result.version;
    if (responseVersion) {
      setProgramConfigsVersion(responseVersion);
    }
    return result.deleted === true;
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
      setKsbProfiles(prev => [...prev.filter(item => item.id !== saved.id), saved]);
      return saved;
    } catch (error) {
      await kbcSwal.fire({ title: 'KSB Profile Not Saved', html: error instanceof Error ? error.message : 'Unknown save error', icon: 'error', confirmButtonText: 'OK' });
      return null;
    }
  };

  const createTutorProfile = async (profile: { name: string; email?: string; phone?: string; notes?: string; availabilityNotes?: string; isActive?: boolean; confirmCreateNew?: boolean }): Promise<TutorProfile | { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number }> => {
    const response = await fetch('/api/tutor-profiles/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (response.status === 409) {
      return await response.json() as { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number };
    }
    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    const saved = await response.json() as TutorProfile;
    setTutorProfiles(prev => [...prev.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    void reloadTutorProfiles();
    return saved;
  };

  const updateTutorProfile = async (id: string, profile: Partial<TutorProfile> & { confirmSave?: boolean }): Promise<TutorProfile | { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number }> => {
    const response = await fetch(`/api/tutor-profiles/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (response.status === 409) {
      return await response.json() as { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number };
    }
    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    const saved = await response.json() as TutorProfile;
    setTutorProfiles(prev => prev.map(item => item.id === saved.id ? saved : item).sort((a, b) => a.name.localeCompare(b.name)));
    return saved;
  };

  const deleteTutorProfile = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/tutor-profiles/${id}/`, { method: 'DELETE' });
      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }
      const result = await response.json() as { deleted?: boolean; deactivated?: boolean; item?: TutorProfile };
      if (result.item) {
        setTutorProfiles(prev => prev.map(item => item.id === id ? result.item! : item));
      } else {
        setTutorProfiles(prev => prev.filter(item => item.id !== id));
      }
      void reloadTutorProfiles();
      await kbcSwal.fire({
        title: result.deactivated ? 'Tutor Deactivated' : 'Tutor Deleted',
        html: result.deactivated
          ? 'The tutor profile was deactivated and hidden from normal selection. Existing Training Plan references remain unchanged.'
          : 'The tutor profile was deleted.',
        icon: 'success',
        confirmButtonText: 'OK',
      });
      return true;
    } catch (error) {
      await kbcSwal.fire({
        title: 'Tutor Not Deleted',
        html: error instanceof Error ? error.message : 'Unknown delete error',
        icon: 'error',
        confirmButtonText: 'OK',
      });
      return false;
    }
  };

  const createCoachProfile = async (profile: { name: string; email?: string; phone?: string; notes?: string; availabilityNotes?: string; isActive?: boolean; confirmCreateNew?: boolean }): Promise<CoachProfile | { existingProfile?: CoachProfile; possibleExistingProfile?: CoachProfile; detail?: string; score?: number }> => {
    const response = await fetch('/api/coach-profiles/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (response.status === 409) {
      return await response.json() as { existingProfile?: CoachProfile; possibleExistingProfile?: CoachProfile; detail?: string; score?: number };
    }
    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    const saved = await response.json() as CoachProfile;
    setCoachProfiles(prev => [...prev.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    void reloadCoachProfiles();
    return saved;
  };

  const updateCoachProfile = async (id: string, profile: Partial<CoachProfile> & { confirmSave?: boolean }): Promise<CoachProfile | { existingProfile?: CoachProfile; possibleExistingProfile?: CoachProfile; detail?: string; score?: number }> => {
    const response = await fetch(`/api/coach-profiles/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (response.status === 409) {
      return await response.json() as { existingProfile?: CoachProfile; possibleExistingProfile?: CoachProfile; detail?: string; score?: number };
    }
    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    const saved = await response.json() as CoachProfile;
    setCoachProfiles(prev => prev.map(item => item.id === saved.id ? saved : item).sort((a, b) => a.name.localeCompare(b.name)));
    return saved;
  };

  const deleteCoachProfile = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/coach-profiles/${id}/`, { method: 'DELETE' });
      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }
      const result = await response.json() as { deleted?: boolean; deactivated?: boolean; item?: CoachProfile };
      if (result.item) {
        setCoachProfiles(prev => prev.map(item => item.id === id ? result.item! : item));
      } else {
        setCoachProfiles(prev => prev.filter(item => item.id !== id));
      }
      void reloadCoachProfiles();
      await kbcSwal.fire({
        title: result.deactivated ? 'Coach Deactivated' : 'Coach Deleted',
        html: result.deactivated
          ? 'The coach profile was deactivated and hidden from normal selection. Existing Training Plan and coverage references remain unchanged.'
          : 'The coach profile was deleted.',
        icon: 'success',
        confirmButtonText: 'OK',
      });
      return true;
    } catch (error) {
      await kbcSwal.fire({
        title: 'Coach Not Deleted',
        html: error instanceof Error ? error.message : 'Unknown delete error',
        icon: 'error',
        confirmButtonText: 'OK',
      });
      return false;
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
      setKsbProfiles(prev => prev.map(item => item.id === saved.id ? saved : item));
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
    let savedRow = modal.open && modal.mode === 'edit'
      ? hydrateCohortRowTrainingPlanIds(row, trainingPlanItems)
      : row;
    if (modal.open && modal.mode === 'edit') {
      const pgi = prevGroupIdx ?? groupIdx;
      next[pgi].rows.splice(modal.rowIdx, 1);
      const insertAt = groupIdx === pgi ? modal.rowIdx : next[groupIdx].rows.length;
      next[groupIdx].rows.splice(insertAt, 0, savedRow);
      savedRow = next[groupIdx].rows[insertAt];
    } else {
      next[groupIdx].rows.push(row);
      savedRow = next[groupIdx].rows[next[groupIdx].rows.length - 1];
    }

    if (modal.open && modal.mode === 'edit') {
      const previousGroupIdx = prevGroupIdx ?? groupIdx;
      const previousGroup = groups[previousGroupIdx];
      let latestItems = trainingPlanItems;
      let blockTrainingPlanIds = savedRow.blks.map(block => block.trainingPlanId).filter(Boolean);
      if (savedRow.id && savedRow.blks.some(block => !block.trainingPlanId && !block.id.startsWith('mod-'))) {
        const reloadedItems = await fetchLatestTrainingPlanItems();
        if (reloadedItems) {
          latestItems = reloadedItems;
          savedRow = hydrateCohortRowTrainingPlanIds(savedRow, latestItems);
          next[groupIdx].rows = next[groupIdx].rows.map(item => item.id === savedRow.id ? savedRow : item);
          blockTrainingPlanIds = savedRow.blks.map(block => block.trainingPlanId).filter(Boolean);
        }
      }
      if (!previousGroup?.id || !savedRow.id) {
        console.warn('COHORT_EDIT_PARTIAL_BLOCKED_MISSING_ID', {
          reason: 'missing stable programme, cohort, or Training Plan row id',
          programmeId: previousGroup?.id,
          cohortId: savedRow.id,
          rowCount: savedRow.blks.length,
          trainingPlanIdCount: blockTrainingPlanIds.length,
          reminder: 'Cohort edit partial save was blocked. No legacy POST /api/training-plan/ fallback was used.',
        });
        setTrainingPlanSaveState('error');
        setTrainingPlanSaveMessage('Cohort was not saved because it has no stable Training Plan ID.');
        await kbcSwal.fire({
          title: 'Cohort Not Saved',
          html: 'This cohort could not be saved safely because it does not have stable Training Plan IDs. Reload latest data before trying again.',
          icon: 'warning',
          confirmButtonText: 'OK',
        });
        return false;
      }
      if (groupIdx !== previousGroupIdx) {
        setTrainingPlanSaveState('error');
        setTrainingPlanSaveMessage('Cohort was not saved because moving cohorts between programmes is not supported here.');
        await kbcSwal.fire({
          title: 'Cohort Not Saved',
          html: 'Moving a cohort between programmes changes programme membership. Keep the cohort in the same programme, then save again.',
          icon: 'warning',
          confirmButtonText: 'OK',
        });
        return false;
      }

      setTrainingPlanSaveState('saving');
      setTrainingPlanSaveMessage('Saving cohort...');
      void kbcSwal.fire({
        title: 'Saving cohort...',
        html: 'Please wait while the Training Plan is being updated.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          kbcSwal.showLoading();
        },
      });
      try {
        const nextItemsForSave = flattenGroupsForApi(next, tutorProfiles);
        const itemsByTrainingPlanId = new Map(
          nextItemsForSave
            .filter(item => item.id)
            .map(item => [String(item.id), item]),
        );
        const result = await updateTrainingPlanCohort(savedRow.id, {
          programmeId: previousGroup.id,
          cohortName: savedRow.label,
          startingDateLabel: savedRow.dateLbl,
          cohortColor: savedRow.color || '',
          cohortEndDate: savedRow.endDateLbl || '',
          holidayIds: savedRow.holidayIds || [],
          ksbProfileId: savedRow.ksbProfileId || '',
          blocks: savedRow.blks.map(block => ({
            trainingPlanId: block.trainingPlanId,
            moduleCatalogueId: block.moduleCatalogueId,
            blockId: block.id,
            groupId: block.groupId || '',
            groupName: block.groupName || '',
            coachName: block.coachName || '',
            moduleName: itemsByTrainingPlanId.get(String(block.trainingPlanId))?.moduleName || getModuleMeta(block.mod).lbl,
            tutorName: itemsByTrainingPlanId.get(String(block.trainingPlanId))?.tutorName || block.tutor || '',
            tutorProfileId: itemsByTrainingPlanId.get(String(block.trainingPlanId))?.tutorProfileId || block.tutorProfileId || '',
            startDate: block.startDate,
            endDate: block.endDate,
            sessionsNumber: String(block.sessions),
            sessionWeekDay: (block.days || []).join(', '),
            sessionStartTime: block.sessionStartTime || '09:00',
            sessionEndTime: block.sessionEndTime || '11:00',
            sessionKsbMappings: normalizeSessionKsbMappings(block.sessionKsbMappings, block.sessions),
            sessionCoverage: normalizeSessionCoverage(block.sessionCoverage, block.sessions, block.tutorProfileId || profileIdForTutorName(block.tutor || '', tutorProfiles)),
            moduleColor: block.color || '',
            notes: itemsByTrainingPlanId.get(String(block.trainingPlanId))?.notes || block.notes || '',
          })),
          allowBlockMembershipChanges: true,
        });
        if (result.version) setTrainingPlanVersion(result.version);
        if (Array.isArray(result.items)) {
          setTrainingPlanItems(result.items);
          setGroups(buildGroupsFromTrainingRows(result.items, customPrograms, tutorProfiles));
        } else {
          setTrainingPlanItems(flattenGroupsForApi(next, tutorProfiles));
          setGroups(next);
        }
        setModal({ open: false });
        setTrainingPlanSaveState('saved');
        setTrainingPlanSaveMessage(`Saved to database at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
        await kbcSuccessSwal.fire({
          icon: 'success',
          title: 'Cohort saved successfully',
          confirmButtonText: 'OK',
        });
        return true;
      } catch (error) {
        if (error instanceof Error && (error.message === 'Training Plan version conflict.' || error.message === 'Training Plan session not found.')) {
          return false;
        }
        try {
          await handleTrainingPlanRequestFailure(error, 'Cohort Not Saved');
          return false;
        } catch {
          // Continue with normal validation/server error handling.
        }
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
    }

    const nextItems = flattenGroupsForApi(next, tutorProfiles);
    const cohortRows = nextItems.filter(item => item.programmeId === next[groupIdx]?.id && item.cohortId === savedRow.id);
    const hasUnsafeCohortRows = (
      !trainingPlanVersion ||
      !next[groupIdx]?.id ||
      !savedRow.id ||
      !cohortRows.length ||
      cohortRows.length !== savedRow.blks.length ||
      cohortRows.some(item => {
        const notes = item.notes || '';
        return (
          Boolean(item.id) ||
          !item.programmeId ||
          !item.cohortId ||
          !notes.includes(`${PROGRAM_ID_MARKER_PREFIX}${next[groupIdx]?.id}`) ||
          !notes.includes(`${COHORT_ID_MARKER_PREFIX}${savedRow.id}`) ||
          !notes.includes(GROUP_ID_MARKER_PREFIX) ||
          !notes.includes(BLOCK_ID_MARKER_PREFIX)
        );
      })
    );
    if (hasUnsafeCohortRows) {
      console.warn('COHORT_ADD_SCOPED_CREATE_BLOCKED', {
        reason: 'missing stable identifiers or generated cohort rows',
        programmeId: next[groupIdx]?.id,
        cohortId: savedRow.id,
        blockCount: savedRow.blks.length,
        generatedRowCount: cohortRows.length,
        hasTrainingPlanVersion: Boolean(trainingPlanVersion),
      });
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Cohort was not saved because it is missing stable Training Plan identifiers.');
      await kbcSwal.fire({
        title: 'Cohort Not Saved',
        html: 'This cohort could not be saved safely because the latest Training Plan identifiers have not loaded. Reload latest data before trying again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return false;
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving cohort...');
    void kbcSwal.fire({
      title: 'Saving cohort...',
      html: 'Please wait while the Training Plan is being updated.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });
    try {
      const result = await createTrainingPlanCohort(next[groupIdx].id, savedRow.id, cohortRows);
      if (result.version) setTrainingPlanVersion(result.version);
      if (Array.isArray(result.items)) {
        setTrainingPlanItems(result.items);
        setGroups(buildGroupsFromTrainingRows(result.items, customPrograms, tutorProfiles));
      } else {
        setTrainingPlanItems(nextItems);
        setGroups(next);
      }
      setModal({ open: false });
      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Saved to database at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      await kbcSuccessSwal.fire({
        icon: 'success',
        title: 'Cohort saved successfully',
        confirmButtonText: 'OK',
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'Training Plan version conflict.') {
        return false;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Cohort Not Saved');
        return false;
      } catch {
        // Continue with normal validation/server error handling.
      }
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

  const handleTrainingPlanPartialResponse = async (response: Response): Promise<TrainingPlanMutationResult> => {
    if (response.status === 409) {
      let detail = 'The Training Plan was updated by someone else. Please reload and review before saving.';
      try {
        const conflict = await response.json() as { detail?: string; currentVersion?: string; items?: TrainingPlanItem[] };
        if (conflict.detail) detail = conflict.detail;
        if (conflict.currentVersion) setTrainingPlanVersion(conflict.currentVersion);
        if (Array.isArray(conflict.items)) setTrainingPlanItems(conflict.items);
      } catch {
        // Use the default conflict message.
      }
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Save blocked because the Training Plan changed elsewhere.');
      await kbcSwal.fire({
        title: 'Training Plan Changed',
        html: `${detail}<br /><br />Please reload and review before saving.`,
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      throw new Error('Training Plan version conflict.');
    }
    if (response.status === 404) {
      let detail = 'This Training Plan session no longer exists. Reload latest data before saving again.';
      try {
        const missing = await response.json() as { detail?: string };
        if (missing.detail) detail = missing.detail;
      } catch {
        // Use the default not-found message.
      }
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Save blocked because the session no longer exists.');
      await kbcSwal.fire({
        title: 'Training Plan Session Missing',
        html: `${detail}<br /><br />Please reload latest data.`,
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      throw new Error('Training Plan session not found.');
    }
    if (TEMPORARY_SERVER_STATUSES.has(response.status)) {
      throw { status: response.status };
    }
    if (!response.ok) {
      let errorText = '';
      try {
        const errorPayload = await response.clone().json() as { detail?: string };
        errorText = errorPayload.detail || '';
      } catch {
        errorText = (await response.text()).trim();
      }
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }
    const result = await response.json() as TrainingPlanMutationResult;
    if (!result.version) {
      throw new Error('The server did not return a new Training Plan version.');
    }
    console.info('PARTIAL_TRAINING_PLAN_SAVE_CONFIRMED', {
      status: response.status,
      itemId: result.item?.id,
      itemCount: result.count,
      hasVersion: Boolean(result.version),
    });
    return result;
  };

  const updateTrainingPlanSession = async (id: string, payload: Record<string, unknown>): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/sessions/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateTrainingPlanSessionCoverage = async (id: string, coverage: SessionCoverage): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/sessions/${id}/coverage/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...coverage, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateTrainingPlanSessionKSB = async (id: string, sessionNumber: number, mapping: SessionKsbMapping): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/sessions/${id}/ksb/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mapping, sessionNumber, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateTrainingPlanModule = async (id: string, payload: Record<string, unknown>): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/modules/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateTrainingPlanLinkedModuleRows = async (
    moduleCatalogueId: number,
    previousModuleName: string,
    moduleName: string,
    linkedRows: LinkedModuleRow[],
    versionOverride?: string,
  ): Promise<TrainingPlanMutationResult> => {
    const response = await fetch('/api/training-plan/modules/linked-rows/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'module_edit_linked_timeline_rows',
      },
      body: JSON.stringify({
        moduleCatalogueId: String(moduleCatalogueId),
        previousModuleName,
        moduleName,
        linkedRows,
        version: versionOverride || trainingPlanVersion,
      }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const stableLinkedModuleBlockId = (block: ModuleBlock): string => {
    if (block.id && !block.id.startsWith('db-blk-')) return block.id;
    const trainingPlanId = String(block.trainingPlanId || '').trim();
    return trainingPlanId ? `tp-${trainingPlanId}` : block.id;
  };

  const updateTrainingPlanLinkedProgrammeRows = async (
    programmeId: string,
    program: string,
    trainingPlanIds: string[],
  ): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/programmes/${encodeURIComponent(programmeId)}/linked-rows/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'programme_edit_linked_timeline_rows',
      },
      body: JSON.stringify({
        programmeId,
        program,
        trainingPlanIds,
        version: trainingPlanVersion,
      }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const addTrainingPlanModuleForTutor = async (
    identifiers: {
      programmeId: string;
      cohortId: string;
      groupId: string;
      blockId: string;
      moduleCatalogueId?: string;
      moduleStableId?: string;
      tutorProfileId: string;
    },
    row: TrainingPlanItem,
  ): Promise<TrainingPlanMutationResult> => {
    const response = await fetch('/api/training-plan/modules/add-for-tutor/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'module_add_for_tutor',
      },
      body: JSON.stringify({
        ...identifiers,
        row,
        version: trainingPlanVersion,
      }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateTrainingPlanProgrammeOrder = async (programmeIds: string[]): Promise<TrainingPlanMutationResult> => {
    const response = await fetch('/api/training-plan/reorder/programmes/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'reorder_programmes',
      },
      body: JSON.stringify({ programmeIds, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateTrainingPlanCohortOrder = async (programmeId: string, cohortIds: string[]): Promise<TrainingPlanMutationResult> => {
    const response = await fetch('/api/training-plan/reorder/cohorts/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'reorder_cohorts',
      },
      body: JSON.stringify({ programmeId, cohortIds, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const moveTrainingPlanCohort = async (
    cohortId: string,
    payload: { fromProgrammeId: string; toProgrammeId: string; toProgrammeName: string; sourceCohortIds: string[]; targetCohortIds: string[] },
  ): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/cohorts/${encodeURIComponent(cohortId)}/move/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'move_cohort',
      },
      body: JSON.stringify({ ...payload, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const archiveTrainingPlanCohort = async (programmeId: string, cohortId: string, trainingPlanIds: string[]): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/cohorts/${encodeURIComponent(cohortId)}/archive/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'cohort_delete',
      },
      body: JSON.stringify({
        programmeId,
        cohortId,
        trainingPlanIds,
        archiveReason: 'Cohort archived from Training Plan UI',
        version: trainingPlanVersion,
      }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const archiveTrainingPlanModule = async (moduleName: string, trainingPlanIds: string[], moduleCatalogueId?: string): Promise<TrainingPlanMutationResult> => {
    const response = await fetch('/api/training-plan/modules/archive/', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'module_delete_linked_timeline_rows',
      },
      body: JSON.stringify({
        moduleName,
        moduleCatalogueId,
        trainingPlanIds,
        archiveReason: 'Linked module archived from Training Plan UI',
        version: trainingPlanVersion,
      }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateTrainingPlanCohort = async (id: string, payload: Record<string, unknown>): Promise<TrainingPlanMutationResult> => {
    const response = await fetch(`/api/training-plan/cohorts/${encodeURIComponent(id)}/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'cohort_edit',
      },
      body: JSON.stringify({ ...payload, version: trainingPlanVersion }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const createTrainingPlanCohort = async (
    programmeId: string,
    cohortId: string,
    rows: TrainingPlanItem[],
  ): Promise<TrainingPlanMutationResult> => {
    const response = await fetch('/api/training-plan/cohorts/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KBC-Training-Plan-Save-Source': 'cohort_add',
      },
      body: JSON.stringify({
        programmeId,
        cohortId,
        rows,
        version: trainingPlanVersion,
      }),
    });
    return handleTrainingPlanPartialResponse(response);
  };

  const updateSessionCoverage = async (groupIdx: number, rowIdx: number, blockId: string, coverage: SessionCoverage): Promise<boolean> => {
    if (!canManageCohorts) return false;
    if (trainingPlanServerUnavailable) {
      await kbcSwal.fire({
        title: 'Training Plan Server Unavailable',
        html: 'The backend is temporarily unavailable. Training Plan data has not been deleted.<br /><br />Save is disabled until the server is healthy again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      void checkTrainingPlanHealth();
      return false;
    }
    const targetBlock = groups[groupIdx]?.rows[rowIdx]?.blks.find(block => block.id === blockId);
    const next = groups.map((group, gi) => gi !== groupIdx ? { ...group, rows: [...group.rows] } : {
      ...group,
      rows: group.rows.map((row, ri) => ri !== rowIdx ? row : {
        ...row,
        blks: row.blks.map(block => {
          if (block.id !== blockId) return block;
          const nextCoverage = [
            ...(block.sessionCoverage || []).filter(item => item.sessionNumber !== coverage.sessionNumber),
            coverage,
          ].filter(item => item.coverageStatus !== 'none' || item.tutorUnavailable || item.coverageTutorProfileId || item.coverageCoachProfileId);
          return { ...block, sessionCoverage: nextCoverage };
        }),
      }),
    });

    if (!targetBlock?.trainingPlanId) {
      console.warn('TUTOR_COVERAGE_PARTIAL_SAVE_BLOCKED_MISSING_TRAINING_PLAN_ID', {
        reason: 'missing trainingPlanId',
        blockId,
        source: 'tutor_coverage_missing_trainingPlanId',
        reminder: 'Tutor coverage partial save was blocked. No legacy POST /api/training-plan/ fallback was used.',
      });
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Tutor Coverage was not saved because this session has no stable Training Plan ID.');
      await kbcSwal.fire({
        title: 'Tutor Coverage Not Saved',
        html: 'Partial save is unavailable for this session because it does not have a stable Training Plan ID. Reload latest data before trying again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return false;
    }

    if (!trainingPlanVersion) {
      console.warn('TUTOR_COVERAGE_PARTIAL_SAVE_BLOCKED_MISSING_TRAINING_PLAN_VERSION', {
        reason: 'missing trainingPlanVersion',
        blockId,
        trainingPlanId: targetBlock.trainingPlanId,
        reminder: 'Tutor coverage partial save was blocked. No legacy POST /api/training-plan/ fallback was used.',
      });
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Reload the Training Plan before saving Tutor Coverage.');
      await kbcSwal.fire({
        title: 'Tutor Coverage Not Saved',
        html: 'Partial save is unavailable until the latest Training Plan version is loaded. Reload latest data before trying again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return false;
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving Tutor Coverage...');
    try {
      const result = await updateTrainingPlanSessionCoverage(targetBlock.trainingPlanId, coverage);
      if (result.version) setTrainingPlanVersion(result.version);
      if (Array.isArray(result.items)) setTrainingPlanItems(result.items);
      setGroups(next);
      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Tutor Coverage saved at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'Training Plan version conflict.') {
        return false;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Tutor Coverage Not Saved');
        return false;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Tutor Coverage was not saved.');
      await kbcSwal.fire({
        title: 'Tutor Coverage Not Saved',
        html: message,
        icon: 'error',
        confirmButtonText: 'OK',
      });
      return false;
    }
  };

  const updateSessionSchedule = async (groupIdx: number, rowIdx: number, blockId: string, payload: SessionScheduleUpdatePayload): Promise<boolean> => {
    if (!canManageCohorts) return false;
    if (trainingPlanServerUnavailable) {
      await kbcSwal.fire({
        title: 'Training Plan Server Unavailable',
        html: 'The backend is temporarily unavailable. Training Plan data has not been deleted.<br /><br />Save is disabled until the server is healthy again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      void checkTrainingPlanHealth();
      return false;
    }

    const targetBlock = groups[groupIdx]?.rows[rowIdx]?.blks.find(block => block.id === blockId);
    if (!targetBlock?.trainingPlanId) {
      console.warn('SESSION_SCHEDULE_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID', { reason: 'missing trainingPlanId', blockId });
      await kbcSwal.fire({
        title: 'Session Schedule Partial Save Unavailable',
        html: 'Partial save is unavailable for this session. Use the full editor until this row has a stable Training Plan ID.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return false;
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving session schedule...');
    try {
      const result = await updateTrainingPlanSession(targetBlock.trainingPlanId, { ...payload });
      const updatedItem = result.item;
      const next = groups.map((group, gi) => gi !== groupIdx ? { ...group, rows: [...group.rows] } : {
        ...group,
        rows: group.rows.map((row, ri) => ri !== rowIdx ? row : {
          ...row,
          blks: row.blks.map(block => {
            if (block.id !== blockId) return block;
            return {
              ...block,
              startDate: updatedItem?.startDate || payload.startDate || block.startDate,
              endDate: updatedItem?.endDate || payload.endDate || block.endDate,
              sessionStartTime: updatedItem?.sessionStartTime || payload.sessionStartTime || block.sessionStartTime,
              sessionEndTime: updatedItem?.sessionEndTime || payload.sessionEndTime || block.sessionEndTime,
              days: parseDays(updatedItem?.sessionWeekDay || payload.sessionWeekDay || (block.days || []).join(', ')),
              tutor: updatedItem?.tutorName || payload.tutorName || block.tutor,
              tutorProfileId: updatedItem?.tutorProfileId || payload.tutorProfileId || block.tutorProfileId,
              coachName: updatedItem?.coachName || payload.coachName || block.coachName,
            };
          }),
        }),
      });
      if (result.version) setTrainingPlanVersion(result.version);
      if (Array.isArray(result.items)) setTrainingPlanItems(result.items);
      setGroups(next);
      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Session schedule saved at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      if (error instanceof Error && (error.message === 'Training Plan version conflict.' || error.message === 'Training Plan session not found.')) {
        return false;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Session Schedule Not Saved');
        return false;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Session schedule was not saved.');
      await kbcSwal.fire({ title: 'Session Schedule Not Saved', html: message, icon: 'error', confirmButtonText: 'OK' });
      return false;
    }
  };

  const updateSessionKsb = async (groupIdx: number, rowIdx: number, blockId: string, sessionNumber: number, mapping: SessionKsbMapping): Promise<boolean> => {
    if (!canManageCohorts) return false;
    if (trainingPlanServerUnavailable) {
      await kbcSwal.fire({
        title: 'Training Plan Server Unavailable',
        html: 'The backend is temporarily unavailable. Training Plan data has not been deleted.<br /><br />Save is disabled until the server is healthy again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      void checkTrainingPlanHealth();
      return false;
    }

    const targetBlock = groups[groupIdx]?.rows[rowIdx]?.blks.find(block => block.id === blockId);
    if (!targetBlock?.trainingPlanId) {
      console.warn('KSB_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID', { reason: 'missing trainingPlanId', blockId });
      return false;
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving KSB Mapping...');
    try {
      const result = await updateTrainingPlanSessionKSB(targetBlock.trainingPlanId, sessionNumber, mapping);
      const next = groups.map((group, gi) => gi !== groupIdx ? { ...group, rows: [...group.rows] } : {
        ...group,
        rows: group.rows.map((row, ri) => ri !== rowIdx ? row : {
          ...row,
          blks: row.blks.map(block => {
            if (block.id !== blockId) return block;
            const sessionCount = Math.max(1, block.sessions || 1);
            const nextMappings = Array.from({ length: sessionCount }, (_, index) => block.sessionKsbMappings?.[index] || { knowledgeCodes: [], skillCodes: [], behaviourCodes: [] });
            nextMappings[sessionNumber - 1] = mapping;
            return { ...block, sessionKsbMappings: nextMappings };
          }),
        }),
      });
      if (result.version) setTrainingPlanVersion(result.version);
      if (Array.isArray(result.items)) setTrainingPlanItems(result.items);
      setGroups(next);
      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`KSB Mapping saved at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      if (error instanceof Error && (error.message === 'Training Plan version conflict.' || error.message === 'Training Plan session not found.')) {
        return false;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'KSB Mapping Not Saved');
        return false;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('KSB Mapping was not saved.');
      await kbcSwal.fire({ title: 'KSB Mapping Not Saved', html: message, icon: 'error', confirmButtonText: 'OK' });
      return false;
    }
  };

  const updateSessionNotes = async (groupIdx: number, rowIdx: number, blockId: string, notes: string): Promise<boolean> => {
    if (!canManageCohorts) return false;
    if (trainingPlanServerUnavailable) {
      await kbcSwal.fire({
        title: 'Training Plan Server Unavailable',
        html: 'The backend is temporarily unavailable. Training Plan data has not been deleted.<br /><br />Save is disabled until the server is healthy again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      void checkTrainingPlanHealth();
      return false;
    }

    const targetBlock = groups[groupIdx]?.rows[rowIdx]?.blks.find(block => block.id === blockId);
    if (!targetBlock?.trainingPlanId) {
      console.warn('NOTES_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID', { reason: 'missing trainingPlanId', blockId });
      return false;
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving session notes...');
    try {
      const result = await updateTrainingPlanSession(targetBlock.trainingPlanId, { notes });
      const next = groups.map((group, gi) => gi !== groupIdx ? { ...group, rows: [...group.rows] } : {
        ...group,
        rows: group.rows.map((row, ri) => ri !== rowIdx ? row : {
          ...row,
          blks: row.blks.map(block => block.id === blockId ? { ...block, notes } : block),
        }),
      });
      if (result.version) setTrainingPlanVersion(result.version);
      if (Array.isArray(result.items)) setTrainingPlanItems(result.items);
      setGroups(next);
      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Session notes saved at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      if (error instanceof Error && (error.message === 'Training Plan version conflict.' || error.message === 'Training Plan session not found.')) {
        return false;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Session Notes Not Saved');
        return false;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Session notes were not saved.');
      await kbcSwal.fire({ title: 'Session Notes Not Saved', html: message, icon: 'error', confirmButtonText: 'OK' });
      return false;
    }
  };

  const updateModulePartial = async (groupIdx: number, rowIdx: number, blockId: string, payload: ModulePartialUpdatePayload): Promise<boolean> => {
    if (!canManageCohorts) return false;
    if (trainingPlanServerUnavailable) {
      await kbcSwal.fire({
        title: 'Training Plan Server Unavailable',
        html: 'The backend is temporarily unavailable. Training Plan data has not been deleted.<br /><br />Save is disabled until the server is healthy again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      void checkTrainingPlanHealth();
      return false;
    }

    const targetRow = groups[groupIdx]?.rows[rowIdx];
    const targetBlock = targetRow?.blks.find(block => block.id === blockId);
    if (!targetBlock?.trainingPlanId) {
      console.warn(payload.color ? 'MODULE_COLOR_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID' : 'MODULE_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID', { reason: 'missing trainingPlanId', blockId });
      await kbcSwal.fire({
        title: 'Module Partial Save Unavailable',
        html: 'Partial save is unavailable for this module. Use the full cohort editor until this row has a stable Training Plan ID.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return false;
    }

    const requestPayload: Record<string, unknown> = { ...payload };
    if ('notes' in payload) {
      requestPayload.notes = joinPersistedNotes(
        payload.notes || '',
        targetRow?.holidayIds || [],
        targetRow?.color,
        typeof payload.color === 'string' ? payload.color : targetBlock.color,
        targetRow?.endDateLbl,
        targetBlock.groupName,
        targetBlock.coachName,
        groups[groupIdx]?.id,
        targetRow?.id,
        targetBlock.groupId,
        targetBlock.id,
      );
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving module...');
    try {
      const result = await updateTrainingPlanModule(targetBlock.trainingPlanId, requestPayload);
      const updatedItem = result.item;
      const next = groups.map((group, gi) => gi !== groupIdx ? { ...group, rows: [...group.rows] } : {
        ...group,
        rows: group.rows.map((row, ri) => ri !== rowIdx ? row : {
          ...row,
          blks: row.blks.map(block => {
            if (block.id !== blockId) return block;
            return {
              ...block,
              mod: updatedItem?.moduleName || payload.moduleName || block.mod,
              tutor: updatedItem?.tutorName || payload.tutorName || block.tutor,
              tutorProfileId: updatedItem?.tutorProfileId || payload.tutorProfileId || block.tutorProfileId,
              notes: 'notes' in payload ? payload.notes : block.notes,
              color: typeof payload.color === 'string' ? payload.color : block.color,
            };
          }),
        }),
      });
      if (result.version) setTrainingPlanVersion(result.version);
      if (Array.isArray(result.items)) setTrainingPlanItems(result.items);
      setGroups(next);
      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Module saved at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      if (error instanceof Error && (error.message === 'Training Plan version conflict.' || error.message === 'Training Plan session not found.')) {
        return false;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Module Not Saved');
        return false;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Module was not saved.');
      await kbcSwal.fire({ title: 'Module Not Saved', html: message, icon: 'error', confirmButtonText: 'OK' });
      return false;
    }
  };

  const handleDeleteRow = async (groupIdx: number, rowIdx: number) => {
    if (!canManageCohorts) {
      return;
    }

    const target = groups[groupIdx]?.rows[rowIdx];
    if (!target) {
      throw new Error('The selected cohort could not be found.');
    }

    const targetGroup = groups[groupIdx];
    const trainingPlanIds = target.blks.map(block => block.trainingPlanId).filter((id): id is string => Boolean(id));
    const siblingCohortIds = targetGroup?.rows
      .filter((_, index) => index !== rowIdx)
      .map(row => row.id)
      .filter((id): id is string => Boolean(id)) || [];
    if (!targetGroup?.id || !target.id || trainingPlanIds.length !== target.blks.length) {
      console.warn('COHORT_ARCHIVE_BLOCKED_MISSING_ID', {
        reason: 'missing stable cohort or Training Plan row ids',
        programmeId: targetGroup?.id,
        cohortId: target.id,
        trainingPlanIds,
      });
      throw new Error('This cohort cannot be archived safely until all Training Plan row IDs have loaded. Reload latest data and try again.');
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Archiving cohort...');
    try {
      const next = groups.map((g, gi) =>
        gi === groupIdx ? { ...g, rows: g.rows.filter((_, ri) => ri !== rowIdx) } : { ...g, rows: [...g.rows] }
      );
      const result = await archiveTrainingPlanCohort(targetGroup.id, target.id, trainingPlanIds);
      if (result.programmeId && result.programmeId !== targetGroup.id) {
        throw new Error('Cohort archive response programme did not match the selected programme. Reload latest data and check the cohort before trying again.');
      }
      if (result.cohortId && result.cohortId !== target.id) {
        throw new Error('Cohort archive response cohort did not match the selected cohort. Reload latest data and check the cohort before trying again.');
      }
      if (typeof result.archived === 'number' && result.archived !== trainingPlanIds.length) {
        throw new Error('Cohort archive response did not confirm the expected archived row count. Reload latest data and check the cohort before trying again.');
      }
      if (result.version) setTrainingPlanVersion(result.version);
      if (result.items) {
        const missingSiblings = missingSiblingCohortIds(result.items, targetGroup.id, siblingCohortIds);
        if (missingSiblings.length) {
          const latestItems = await fetchLatestTrainingPlanItems();
          const stillMissing = latestItems ? missingSiblingCohortIds(latestItems, targetGroup.id, siblingCohortIds) : missingSiblings;
          if (latestItems && !stillMissing.length) {
            setGroups(next);
            setTrainingPlanSaveState('saved');
            setTrainingPlanSaveMessage(`Cohort archived at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
            return;
          }
          throw new Error(`Cohort archive returned an unsafe result because sibling cohort(s) disappeared: ${stillMissing.join(', ')}. Reload latest data before making more changes.`);
        }
        setTrainingPlanItems(result.items);
        setGroups(next);
      } else {
        setTrainingPlanItems(flattenGroupsForApi(next, tutorProfiles));
        setGroups(next);
      }
      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Cohort archived at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Training Plan version conflict.') {
        return;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Cohort Not Archived');
        return;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown archive error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Cohort was not archived.');
      throw new Error(message);
    }
  };

  const handleReorderRow = async (fromGroupIdx: number, fromRowIdx: number, toGroupIdx: number, toRowIdx: number, position: 'before' | 'after' = 'before') => {
    if (!canManageCohorts) return;
    const next = groups.map(g => ({ ...g, rows: [...g.rows] }));
    const [moved] = next[fromGroupIdx].rows.splice(fromRowIdx, 1);
    const rawInsertAt = position === 'after' ? toRowIdx + 1 : toRowIdx;
    const insertAt = fromGroupIdx === toGroupIdx && fromRowIdx < rawInsertAt ? rawInsertAt - 1 : rawInsertAt;
    next[toGroupIdx].rows.splice(insertAt, 0, moved);
    setGroups(next);
  };

  const handleReorderGroup = async (fromGroupIdx: number, toGroupIdx: number) => {
    if (!canManageCohorts) return;
    const next = [...groups];
    const [moved] = next.splice(fromGroupIdx, 1);
    const insertAt = fromGroupIdx < toGroupIdx ? toGroupIdx - 1 : toGroupIdx;
    next.splice(insertAt, 0, moved);
    const programmeIds = next.filter(group => group.rows.length > 0).map(group => group.id).filter(Boolean);
    if (programmeIds.length !== next.filter(group => group.rows.length > 0).length) {
      console.warn('PROGRAMME_REORDER_PARTIAL_SAVE_BLOCKED_MISSING_IDS', {
        reason: 'missing stable programme ids',
        programmeIds,
      });
      await kbcSwal.fire({
        title: 'Programme Not Reordered',
        html: 'This programme order cannot be saved safely until stable programme IDs have loaded. Reload latest data and try again.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }
    setGroups(next);
    try {
      const result = await updateTrainingPlanProgrammeOrder(programmeIds);
      if (result.version) setTrainingPlanVersion(result.version);
      if (result.items) {
        setTrainingPlanItems(result.items);
        setGroups(buildGroupsFromTrainingRows(result.items, customPrograms, tutorProfiles));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Training Plan version conflict.') {
        return;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Programme Not Reordered');
        return;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown save error';
      await kbcSwal.fire({ title: 'Programme Not Reordered', html: message, icon: 'error', confirmButtonText: 'OK' });
    }
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

  const handleAddModuleForTutor = (tutorProfileId: string, moduleValue: ModuleValue) => {
    if (!canManageCohorts) {
      return;
    }
    const firstGroupIdx = groups.findIndex(group => group.rows.length > 0);
    setPendingTutorModuleAdd({ tutorProfileId, moduleValue });
    setPendingTutorModuleCohort(firstGroupIdx >= 0 ? `${firstGroupIdx}:0` : '');
    setPendingTutorModuleGroup('');
    setPendingTutorModuleCreateGroup(false);
    setPendingTutorModuleGroupDraft({ name: '', coach: '', days: ['monday'], startTime: '09:00', endTime: '11:00' });
    setPendingTutorModuleStartDate('');
    setPendingTutorModuleError('');
    setPendingTutorModuleSaving(false);
  };

  const handleAddTutorModuleToNewCohort = () => {
    if (!pendingTutorModuleAdd) return;
    setModal({
      open: true,
      mode: 'add',
      defaultGroupIdx: 0,
      prefillTutorProfileId: pendingTutorModuleAdd.tutorProfileId,
      prefillModule: pendingTutorModuleAdd.moduleValue,
    });
    setPendingTutorModuleAdd(null);
  };

  const savePendingTutorModule = async () => {
    if (!pendingTutorModuleAdd || pendingTutorModuleSaving) return;
    const [groupIdx, rowIdx] = pendingTutorModuleCohort.split(':').map(item => Number(item));
    const targetGroup = groups[groupIdx];
    const targetRow = targetGroup?.rows[rowIdx];
    if (!targetGroup || !targetRow) {
      setPendingTutorModuleError('Please select a cohort first.');
      return;
    }
    const groupBlocks = targetRow.blks.reduce<ModuleBlock[]>((items, block) => {
      const key = tutorModuleGroupKey(block);
      if (!items.some(item => tutorModuleGroupKey(item) === key)) {
        items.push(block);
      }
      return items;
    }, []);
    const selectedGroupBlock = groupBlocks.find(block => tutorModuleGroupKey(block) === pendingTutorModuleGroup);
    const shouldCreateGroup = pendingTutorModuleCreateGroup || groupBlocks.length === 0;
    if (!shouldCreateGroup && !selectedGroupBlock) {
      setPendingTutorModuleError('Please select a group before adding the module.');
      return;
    }
    if (shouldCreateGroup && !pendingTutorModuleGroupDraft.name.trim()) {
      setPendingTutorModuleError('Please enter the group name before adding the module.');
      return;
    }
    if (shouldCreateGroup && pendingTutorModuleGroupDraft.days.length === 0) {
      setPendingTutorModuleError('Please choose at least one session day.');
      return;
    }
    if (!pendingTutorModuleStartDate) {
      setPendingTutorModuleError('Please choose the module start date.');
      return;
    }

    const tutorProfile = tutorProfiles.find(profile => profile.id === pendingTutorModuleAdd.tutorProfileId);
    if (!tutorProfile) {
      setPendingTutorModuleError('The selected tutor profile could not be found.');
      return;
    }

    const catalogModule = resolveCatalogModuleByValue(pendingTutorModuleAdd.moduleValue, catalogModules);
    const customModule = customModules.find(item => item.name === pendingTutorModuleAdd.moduleValue || item.id === pendingTutorModuleAdd.moduleValue);
    const moduleMeta = getModuleMeta(pendingTutorModuleAdd.moduleValue);
    const sessionCount = Math.max(1, parseInt(catalogModule?.sessions || String(customModule?.defaultSessions || 1), 10) || 1);
    const days = shouldCreateGroup
      ? pendingTutorModuleGroupDraft.days
      : selectedGroupBlock?.days?.length ? selectedGroupBlock.days : (['monday'] as WeekDayKey[]);
    const activeHolidays = holidays.filter(holiday => (targetRow.holidayIds || []).includes(holiday.id));
    const plan = buildWeeklyTutorModulePlan(pendingTutorModuleStartDate, sessionCount, days, activeHolidays);
    const nextGroupId = shouldCreateGroup ? `grp-${Date.now()}-${Math.random()}` : selectedGroupBlock?.groupId;
    const nextBlockId = `blk-${Date.now()}`;
    const nextBlock: ModuleBlock = {
      id: nextBlockId,
      groupId: nextGroupId,
      moduleCatalogueId: catalogModule?.id ? String(catalogModule.id) : undefined,
      mod: catalogModule?.name || pendingTutorModuleAdd.moduleValue,
      groupName: shouldCreateGroup ? pendingTutorModuleGroupDraft.name.trim() : selectedGroupBlock?.groupName,
      coachName: shouldCreateGroup ? pendingTutorModuleGroupDraft.coach.trim() || undefined : selectedGroupBlock?.coachName,
      color: catalogModule?.colour || customModule?.bg || moduleMeta.bg,
      tutor: tutorProfile.name,
      tutorProfileId: tutorProfile.id,
      startDate: plan.actualStartDate || pendingTutorModuleStartDate,
      endDate: plan.effectiveEndDate || plan.actualStartDate || pendingTutorModuleStartDate,
      sessions: sessionCount,
      days,
      sessionStartTime: shouldCreateGroup ? pendingTutorModuleGroupDraft.startTime : selectedGroupBlock?.sessionStartTime || '09:00',
      sessionEndTime: shouldCreateGroup ? pendingTutorModuleGroupDraft.endTime : selectedGroupBlock?.sessionEndTime || '11:00',
      sessionKsbMappings: normalizeSessionKsbMappings(catalogModule?.sessionKsbMappings || [], sessionCount),
      sessionCoverage: [],
      notes: catalogModule?.notes || undefined,
    };
    const nextGroups = groups.map((group, gi) => gi !== groupIdx ? { ...group, rows: [...group.rows] } : {
      ...group,
      rows: group.rows.map((row, ri) => {
        if (ri !== rowIdx) return row;
        const endDateLbl = !row.endDateLbl || row.endDateLbl < nextBlock.endDate ? nextBlock.endDate : row.endDateLbl;
        return { ...row, endDateLbl, blks: [...row.blks, nextBlock] };
      }),
    });

    setPendingTutorModuleSaving(true);
    setPendingTutorModuleError('');
    try {
      const nextItems = flattenGroupsForApi(nextGroups, tutorProfiles);
      const newRow = nextItems.find(item => (item.notes || '').includes(`${BLOCK_ID_MARKER_PREFIX}${nextBlock.id}`));
      const moduleStableId = String(catalogModule?.id || customModule?.id || pendingTutorModuleAdd.moduleValue || '').trim();
      if (
        !trainingPlanVersion ||
        !targetGroup.id ||
        !targetRow.id ||
        targetRow.id.startsWith('db-row-') ||
        !nextBlock.groupId ||
        !nextBlock.id ||
        !moduleStableId ||
        !newRow
      ) {
        console.warn('MODULE_ADD_FOR_TUTOR_SCOPED_CREATE_BLOCKED', {
          reason: 'missing stable identifiers or generated row for module add',
          programmeId: targetGroup.id,
          cohortId: targetRow.id,
          groupId: nextBlock.groupId,
          blockId: nextBlock.id,
          moduleStableId,
          tutorProfileId: tutorProfile.id,
          hasTrainingPlanVersion: Boolean(trainingPlanVersion),
          hasGeneratedRow: Boolean(newRow),
        });
        throw new Error('This module cannot be added safely until the latest Training Plan IDs have loaded. Reload latest data and try again.');
      }
      const result = await addTrainingPlanModuleForTutor({
        programmeId: targetGroup.id,
        cohortId: targetRow.id,
        groupId: nextBlock.groupId,
        blockId: nextBlock.id,
        moduleCatalogueId: catalogModule?.id ? String(catalogModule.id) : undefined,
        moduleStableId,
        tutorProfileId: tutorProfile.id,
      }, newRow);
      if (result.version) {
        setTrainingPlanVersion(result.version);
      }
      if (result.items) {
        setTrainingPlanItems(result.items);
        setGroups(buildGroupsFromTrainingRows(result.items, customPrograms, tutorProfiles));
      } else {
        setTrainingPlanItems(nextItems);
        setGroups(nextGroups);
      }
      setPendingTutorModuleAdd(null);
      setPendingTutorModuleCohort('');
      setPendingTutorModuleGroup('');
      setPendingTutorModuleCreateGroup(false);
      setPendingTutorModuleStartDate('');
      await kbcSuccessSwal.fire({
        icon: 'success',
        title: 'Module added',
        html: `<strong>${catalogModule?.name || moduleMeta.lbl}</strong> was added to <strong>${targetRow.label || 'the selected cohort'}</strong>.`,
        confirmButtonText: 'OK',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Training Plan version conflict.') {
        return;
      }
      try {
        await handleTrainingPlanRequestFailure(error, 'Module Not Added');
        return;
      } catch {
        // Continue with normal validation/server error handling.
      }
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setPendingTutorModuleError(message);
      await kbcSwal.fire({
        title: 'Module Not Added',
        html: `The module was not added to the Training Plan.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
    } finally {
      setPendingTutorModuleSaving(false);
    }
  };

  const handleAddModule = async (mod: CustomModule) => {
    try {
      const saved = customModules.some(item => item.id === mod.id)
        ? await updateCustomModuleDefinition(mod)
        : await createCustomModuleDefinition(mod);
      setCustomModules(prev => [...prev.filter(item => item.id !== saved.id), saved]);
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
    const previousModule = catalogModules.find(item => item.id === mod.id);
    const previousName = previousModule?.name?.trim();
    const requestedName = mod.name.trim();
    const previousColour = (previousModule?.colour || '').trim().toLowerCase();
    let renameLinkedRows: LinkedModuleRow[] = [];
    let renameSourceGroups: ProgrammeGroup[] = groups;
    let renameVersion = trainingPlanVersion;

    const linkedRowMissingStableIdentity = (row: LinkedModuleRow): boolean => (
      !row.trainingPlanId ||
      !row.programmeId ||
      !row.cohortId ||
      row.cohortId.startsWith('db-row-') ||
      !row.blockId
    );

    const buildRenameLinkedRows = (sourceGroups: ProgrammeGroup[], moduleCatalogueId: string, targetPreviousName: string): LinkedModuleRow[] => {
      const hasStableLinkedBlocks = sourceGroups.some(group =>
        group.rows.some(row =>
          row.blks.some(block => block.moduleCatalogueId === moduleCatalogueId)
        )
      );
      const duplicateNameCount = catalogModules.filter(item => item.name.trim() === targetPreviousName).length;
      const isTargetBlock = (block: ModuleBlock) => (
        hasStableLinkedBlocks
          ? block.moduleCatalogueId === moduleCatalogueId
          : duplicateNameCount > 1
            ? !block.moduleCatalogueId && String(block.mod).trim() === targetPreviousName && previousColour && (block.color || '').trim().toLowerCase() === previousColour
            : !block.moduleCatalogueId && String(block.mod).trim() === targetPreviousName
      );
      return sourceGroups.flatMap(group =>
        group.rows.flatMap(row =>
          row.blks
            .filter(isTargetBlock)
            .map(block => ({
              trainingPlanId: block.trainingPlanId || '',
              programmeId: group.id,
              cohortId: row.id,
              groupId: block.groupId,
              blockId: stableLinkedModuleBlockId(block),
            })),
        ),
      );
    };

    if (previousName && requestedName && previousName !== requestedName) {
      const moduleCatalogueId = String(mod.id);
      renameLinkedRows = buildRenameLinkedRows(groups, moduleCatalogueId, previousName);
      if (renameLinkedRows.length && renameLinkedRows.some(linkedRowMissingStableIdentity)) {
        const response = await fetch('/api/training-plan/', { cache: 'no-store' });
        const payload = response.ok ? parseTrainingPlanPayload(await response.json()) : null;
        if (payload?.items) {
          const latestGroups = buildGroupsFromTrainingRows(payload.items, customPrograms, tutorProfiles);
          const latestLinkedRows = buildRenameLinkedRows(latestGroups, moduleCatalogueId, previousName);
          if (latestLinkedRows.length && !latestLinkedRows.some(linkedRowMissingStableIdentity)) {
            setTrainingPlanItems(payload.items);
            setTrainingPlanVersion(payload.version);
            setHasLoadedTrainingPlan(true);
            renameSourceGroups = latestGroups;
            renameVersion = payload.version;
            renameLinkedRows = latestLinkedRows;
          }
        }
      }
      if (renameLinkedRows.length && renameLinkedRows.some(linkedRowMissingStableIdentity)) {
        console.warn('MODULE_EDIT_LINKED_ROWS_PARTIAL_BLOCKED_MISSING_ID', {
          reason: 'missing stable identifiers for linked module timeline rows before catalogue update; server-side scope resolution will be used',
          moduleCatalogueId: mod.id,
          previousModuleName: previousName,
          moduleName: requestedName,
          linkedRows: renameLinkedRows,
        });
        renameLinkedRows = [];
      }
    }
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

    const nextName = updated.name.trim();
    if (previousName && nextName && previousName !== nextName) {
      const moduleCatalogueId = String(mod.id);
      const sourceGroups = renameSourceGroups;
      const hasStableLinkedBlocks = sourceGroups.some(group =>
        group.rows.some(row =>
          row.blks.some(block => block.moduleCatalogueId === moduleCatalogueId)
        )
      );
      const duplicateNameCount = catalogModules.filter(item => item.name.trim() === previousName).length;
      const isTargetBlock = (block: ModuleBlock) => (
        hasStableLinkedBlocks
          ? block.moduleCatalogueId === moduleCatalogueId
          : duplicateNameCount > 1
            ? !block.moduleCatalogueId && String(block.mod).trim() === previousName && previousColour && (block.color || '').trim().toLowerCase() === previousColour
            : !block.moduleCatalogueId && String(block.mod).trim() === previousName
      );
      const nextGroups = sourceGroups.map(group => ({
        ...group,
        rows: group.rows.map(row => ({
          ...row,
          blks: row.blks.map(block => (
            isTargetBlock(block)
              ? { ...block, mod: nextName, moduleCatalogueId }
              : block
          )),
        })),
      }));
      const hasLocalLinkedBlocks = nextGroups.some((group, groupIndex) =>
        group.rows.some((row, rowIndex) =>
          row.blks.some((block, blockIndex) => block.mod !== sourceGroups[groupIndex]?.rows[rowIndex]?.blks[blockIndex]?.mod)
        )
      );
      const linkedRows = renameLinkedRows.length
          ? renameLinkedRows
          : buildRenameLinkedRows(sourceGroups, moduleCatalogueId, previousName);
      const missingLinkedRowId = linkedRows.some(linkedRowMissingStableIdentity);
      if (missingLinkedRowId) {
        console.warn('MODULE_EDIT_LINKED_ROWS_PARTIAL_BLOCKED_MISSING_ID', {
          reason: 'missing stable identifiers for linked module timeline rows; server-side scope resolution will be used',
          moduleCatalogueId: mod.id,
          previousModuleName: previousName,
          moduleName: nextName,
          linkedRows,
        });
      }
      const result = await updateTrainingPlanLinkedModuleRows(mod.id, previousName, nextName, missingLinkedRowId ? [] : linkedRows, renameVersion);
      if (result.version) {
        setTrainingPlanVersion(result.version);
      }
      if (result.items) {
        setTrainingPlanItems(result.items);
        setGroups(buildGroupsFromTrainingRows(result.items, customPrograms, tutorProfiles));
      } else if (hasLocalLinkedBlocks) {
        setTrainingPlanItems(flattenGroupsForApi(nextGroups, tutorProfiles));
        setGroups(nextGroups);
      }
      if (Array.isArray(result.skippedAmbiguousRows) && result.skippedAmbiguousRows.length > 0) {
        setTrainingPlanSaveState('saved');
        setTrainingPlanSaveMessage('Module saved, but some old timeline rows could not be safely linked.');
        await kbcSwal.fire({
          title: 'Module Saved',
          html: 'Module saved, but some old timeline rows could not be safely linked. Open the affected timeline rows and save once to attach their stable ID.',
          icon: 'warning',
          confirmButtonText: 'OK',
        });
      }
    }

    setCatalogModules(prev => prev.map(m => m.id === updated.id ? updated : m));
  };

  const handleDeleteCatalogModule = async (id: number) => {
    const moduleName = catalogModules.find(m => m.id === id)?.name;
    let archiveReturnedItems = false;
    let isTargetBlockForDelete: ((block: ModuleBlock) => boolean) | null = null;

    if (moduleName) {
      const moduleCatalogueId = String(id);
      const hasStableLinkedBlocks = groups.some(group =>
        group.rows.some(row =>
          row.blks.some(block => block.moduleCatalogueId === moduleCatalogueId)
        )
      );
      const isTargetBlock = (block: ModuleBlock) => (
        hasStableLinkedBlocks
          ? block.moduleCatalogueId === moduleCatalogueId
          : String(block.mod).trim() === moduleName
      );
      isTargetBlockForDelete = isTargetBlock;
      const hasLegacyNameLinkedBlocks = groups.some(group =>
        group.rows.some(row =>
          row.blks.some(block => !block.moduleCatalogueId && String(block.mod).trim() === moduleName)
        )
      );
      const duplicateNameCount = catalogModules.filter(item => item.name.trim() === moduleName.trim()).length;
      if (!hasStableLinkedBlocks && hasLegacyNameLinkedBlocks && duplicateNameCount > 1) {
        throw new Error(`Cannot safely delete "${moduleName}" because multiple catalogue modules share this name and linked timeline rows do not yet have stable module IDs.`);
      }
      const linkedBlocks = groups.flatMap(group =>
        group.rows.flatMap(row =>
          row.blks
            .filter(isTargetBlock)
            .map(blk => ({ blockId: blk.id, trainingPlanId: blk.trainingPlanId })),
        ),
      );
      if (linkedBlocks.length) {
        const trainingPlanIds = linkedBlocks.map(item => item.trainingPlanId).filter((item): item is string => Boolean(item));
        if (trainingPlanIds.length !== linkedBlocks.length) {
          console.warn('MODULE_ARCHIVE_BLOCKED_MISSING_ID', {
            reason: 'missing stable Training Plan row ids for linked module archive',
            moduleName,
            linkedBlocks,
          });
          throw new Error('Linked Training Plan rows for this module cannot be archived safely until all row IDs have loaded. Reload latest data and try again.');
        }
        const archiveResult = await archiveTrainingPlanModule(moduleName, trainingPlanIds, moduleCatalogueId);
        if (archiveResult.version) setTrainingPlanVersion(archiveResult.version);
        if (archiveResult.items) {
          archiveReturnedItems = true;
          setTrainingPlanItems(archiveResult.items);
          setGroups(buildGroupsFromTrainingRows(archiveResult.items, customPrograms, tutorProfiles));
        }
      }
    }

    const response = await fetch(`/api/modules/${id}/`, { method: 'DELETE' });
    if (!response.ok) {
      const text = (await response.text()).trim();
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    setCatalogModules(prev => prev.filter(m => m.id !== id));

    // Keep local state consistent with the archive response when one was not returned.
    if (moduleName && !archiveReturnedItems && isTargetBlockForDelete) {
      const nextGroups = groups.map(g => ({
        ...g,
        rows: g.rows.map(row => ({
          ...row,
          blks: row.blks.filter(blk => !isTargetBlockForDelete?.(blk)),
        })).filter(row => row.blks.length > 0),
      }));
      const hasChanges = nextGroups.some((g, gi) =>
        g.rows.length !== groups[gi].rows.length ||
        g.rows.some((row, ri) => row.blks.length !== groups[gi].rows[ri]?.blks.length)
      );
      if (hasChanges) {
        setTrainingPlanItems(flattenGroupsForApi(nextGroups, tutorProfiles));
        setGroups(nextGroups);
      }
    }
  };

  const handleAddProgram = async (prog: CustomProgram) => {
    const existingCustom = customPrograms.some(program => program.id === prog.id);
    const nextGroups = existingCustom
      ? groups.map(group => group.id === prog.id ? { ...group, name: prog.name, sub: prog.sub, color: prog.color } : group)
      : groups;
    const shouldPersistTimeline = existingCustom && nextGroups.some(group => group.id === prog.id && group.rows.length > 0);
    const linkedBlocks = shouldPersistTimeline
      ? (nextGroups.find(group => group.id === prog.id)?.rows || []).flatMap(row => row.blks.map(block => ({ trainingPlanId: block.trainingPlanId })))
      : [];
    const linkedTrainingPlanIds = linkedBlocks.map(block => block.trainingPlanId).filter((item): item is string => Boolean(item));

    try {
      if (shouldPersistTimeline) {
        if (!prog.id || linkedTrainingPlanIds.length !== linkedBlocks.length || !linkedTrainingPlanIds.length) {
          console.warn('PROGRAMME_EDIT_LINKED_ROWS_PARTIAL_BLOCKED', {
            reason: 'missing stable programme id or Training Plan row ids for linked programme update',
            programmeId: prog.id,
            linkedBlocks,
          });
          throw new Error('Linked Training Plan rows for this programme cannot be updated safely until all row IDs have loaded. Reload latest data and try again.');
        }
      }
      const savedProgram = existingCustom
        ? await updateProgramConfig(prog)
        : await createProgramConfig(prog);
      if (shouldPersistTimeline) {
        const targetGroup = nextGroups.find(group => group.id === prog.id);
        const timelineResult = await updateTrainingPlanLinkedProgrammeRows(prog.id, targetGroup ? toProgrammeLabel(targetGroup) : prog.name.replace('\n', ' '), linkedTrainingPlanIds);
        if (timelineResult.version) {
          setTrainingPlanVersion(timelineResult.version);
        }
        if (timelineResult.items) {
          setTrainingPlanItems(timelineResult.items);
        }
      }
      setCustomPrograms(prev => [...prev.filter(program => program.id !== savedProgram.id), savedProgram]);
      if (shouldPersistTimeline) {
        setGroups(nextGroups);
      }
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
      await deleteProgramConfig(programId);
      setCustomPrograms(prev => prev.filter(program => program.id !== programId));
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
  const exportRowCount = groups.reduce((sum, group) => (
    sum + group.rows.reduce((rowSum, row) => rowSum + row.blks.length, 0)
  ), 0);
  const exportTrainingPlanExcel = async () => {
    if (!exportRowCount) {
      void kbcSwal.fire({
        title: 'No Training Plan Data',
        text: 'There are no module rows to export yet.',
        icon: 'info',
        confirmButtonText: 'OK',
      });
      return;
    }

    let exportGroups = groups;
    let exportCustomModules = customModules;
    let exportKsbProfiles = ksbProfiles;

    try {
      const [planResult, programConfigsResult, moduleDefinitionsResult, ksbProfilesResult] = await Promise.allSettled([
        fetch('/api/training-plan/', { cache: 'no-store' }),
        fetch('/api/training-plan-program-configs/', { cache: 'no-store' }),
        fetch('/api/training-plan-modules/', { cache: 'no-store' }),
        fetch('/api/ksb-profiles/?includeInactive=1', { cache: 'no-store' }),
      ]);

      let latestPrograms = customPrograms;
      if (programConfigsResult.status === 'fulfilled' && programConfigsResult.value.ok) {
        const programVersion = programConfigsResult.value.headers.get('X-KBC-Training-Plan-Program-Configs-Version') || undefined;
        const items = (await programConfigsResult.value.json()) as TrainingPlanProgramConfigPayload[];
        if (Array.isArray(items)) {
          latestPrograms = items;
          setCustomPrograms(items);
          setProgramConfigsVersion(programVersion);
        }
      }

      if (moduleDefinitionsResult.status === 'fulfilled' && moduleDefinitionsResult.value.ok) {
        const moduleVersion = moduleDefinitionsResult.value.headers.get('X-KBC-Training-Plan-Modules-Version') || undefined;
        const items = (await moduleDefinitionsResult.value.json()) as Array<{ id: string; name: string; defaultSessions: number; bg: string; tx: string }>;
        if (Array.isArray(items)) {
          exportCustomModules = items.map(item => ({
            id: item.id,
            name: item.name,
            defaultSessions: item.defaultSessions,
            bg: item.bg,
            tx: item.tx,
          }));
          setCustomModules(exportCustomModules);
          setModuleDefinitionsVersion(moduleVersion);
        }
      }

      if (ksbProfilesResult.status === 'fulfilled' && ksbProfilesResult.value.ok) {
        const items = (await ksbProfilesResult.value.json()) as KsbProfile[];
        if (Array.isArray(items)) {
          exportKsbProfiles = items.map(profile => ({ ...profile, ksbItems: normalizeKsbProfileItems(profile) }));
          setKsbProfiles(exportKsbProfiles);
        }
      }

      if (planResult.status === 'fulfilled' && planResult.value.ok) {
        const payload = parseTrainingPlanPayload(await planResult.value.json());
        if (payload && Array.isArray(payload.items)) {
          exportGroups = payload.items.length
            ? buildGroupsFromTrainingRows(payload.items, latestPrograms)
            : buildAllGroups(latestPrograms);
          setTrainingPlanItems(payload.items);
          setTrainingPlanVersion(payload.version);
          setHasLoadedTrainingPlan(true);
        }
      }
    } catch {
      // Fall back to the currently rendered timeline data.
    }

    const today = new Date();
    const stamp = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
    downloadTrainingPlanWorkbook(`training-plan-${stamp}.xlsx`, exportGroups, exportCustomModules, exportKsbProfiles);
  };
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
  const resolveEditChoiceDetails = useCallback((choice: EditChoiceState | null): ModuleOverviewChoiceDetails | null => {
    if (!choice) {
      return null;
    }
    const group = groups[choice.groupIdx];
    const row = group?.rows[choice.rowIdx];
    const block = row?.blks.find(item => item.id === choice.blockId);
    if (!group || !row || !block) {
      return null;
    }
    const rawValue = String(block.mod || '');
    const displayName = rawValue in MS ? getModuleMeta(block.mod as MKey).lbl : rawValue;
    const lookupVariants = new Set([...moduleLookupVariants(rawValue), ...moduleLookupVariants(displayName)]);
    const catalogModuleById = block.moduleCatalogueId
      ? catalogModules.find(module => String(module.id) === String(block.moduleCatalogueId))
      : undefined;
    const catalogModule = catalogModuleById || catalogModules.find(module => {
      const normalizedName = normalizeModuleLookup(module.name);
      return String(module.id) === rawValue || lookupVariants.has(normalizedName);
    });
    return { group, row, block, displayName, catalogModule };
  }, [catalogModules, groups]);
  const visibleEditChoiceDetails = useMemo(
    () => resolveEditChoiceDetails(visibleEditChoice),
    [resolveEditChoiceDetails, visibleEditChoice],
  );

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
    () => buildMonthlyModuleSummaries(groups, holidays, customModules, catalogModules, ksbProfiles),
    [catalogModules, customModules, groups, holidays, ksbProfiles],
  );
  const openMonthlySummary = (groupId: string, rowId: string, blockId: string, mode: ModuleOverviewMode = 'monthly', overviewChoiceDetails?: ModuleOverviewChoiceDetails) => {
    const targetKey = `${groupId}-${rowId}-${blockId}`;
    const summary = monthlyModuleSummaries.find(item => item.key === targetKey);
    if (summary) {
      setSelectedMonthlySummary({ summary, mode, overviewChoiceDetails });
    }
  };
  const openOverviewChoice = (choice: EditChoiceState | null) => {
    const details = resolveEditChoiceDetails(choice);
    if (details) {
      setPendingOverviewChoiceDetails({ ...details });
      setPendingOverviewReturnChoice(choice ? { ...choice } : null);
    }
  };

  return (
    <div className="min-h-screen bg-kbc-bg font-sans">
      <TopNav />

      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-400">
            <Link to="/" className="hover:text-kbc-navy transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line" />
            <Link to="/events" className="hover:text-kbc-navy transition-colors cursor-pointer">Events</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-kbc-navy font-semibold">Training Plan</span>
          </div>

          <div className="flex items-start justify-between gap-3 sm:gap-4 flex-wrap xl:flex-nowrap">
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

            <div className="training-plan-action-row w-full md:w-auto md:flex md:flex-wrap md:overflow-visible md:pb-0 md:ml-3">
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
          <div className="training-plan-action-row mt-3 xl:hidden">
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

      <main className="max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-5 space-y-4">
        {(trainingPlanServerUnavailable || trainingPlanServerRecovered) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${trainingPlanServerUnavailable ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-extrabold">
                  {trainingPlanServerUnavailable ? 'Training Plan server temporarily unavailable' : 'Training Plan server recovered'}
                </p>
                <p className="mt-1 text-xs font-semibold">
                  Training Plan data has not been deleted. Save is disabled during outages, and failed saves are not retried automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const loaded = await reloadTrainingPlan();
                  if (loaded) {
                    setTrainingPlanServerRecovered(false);
                    setTrainingPlanSaveMessage('Latest Training Plan data loaded.');
                  }
                }}
                disabled={trainingPlanServerUnavailable}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-kbc-navy px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-refresh-line" />
                Reload latest data
              </button>
            </div>
          </div>
        )}
        {/* Today's Sessions */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
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
                <li key={i} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{s.groupName}</p>
                    <p className="text-xs text-gray-500">{s.cohortName} · {s.program}</p>
                    <p className="text-xs text-gray-400">Tutor: {s.tutor || 'TBD'}</p>
                    <p className="text-xs text-gray-400">Coach: {s.coach || 'TBD'}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-semibold">{s.startTime}{s.endTime ? ` - ${s.endTime}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-lg p-1 lg:flex-row lg:items-center lg:justify-between">
          <div className="training-plan-action-row min-w-0 lg:overflow-visible lg:pb-0">
            {([
              { key: 'gantt',    label: 'Training Plan', icon: 'ri-bar-chart-horizontal-line' },
              { key: 'schedule', label: 'Session Schedule', icon: 'ri-table-line' },
              { key: 'tutors',   label: 'Tutor Profiles', icon: 'ri-user-star-line' },
              { key: 'coaches',  label: 'Coach Profiles', icon: 'ri-user-follow-line' },
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
            <div className="training-plan-action-row lg:overflow-visible lg:pb-0">
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
              <div className="training-plan-gantt-shell bg-white rounded-xl overflow-visible border border-gray-200">
                <GanttTimeline
                  groups={groups}
                  holidays={holidays}
                  customModules={customModules}
                  catalogModules={catalogModules}
                  tutorProfiles={buildTutorProfilesFromGroups(groups, tutorProfiles)}
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
                    openOverviewChoice({ groupIdx, rowIdx, blockId });
                  }}
                  onDeleteRow={handleDeleteRow}
                  onEditProgram={handleEditProgram}
                  onDeleteProgram={handleDeleteProgram}
                  onReorderRow={handleReorderRow}
                  onReorderGroup={handleReorderGroup}
                  onExportExcel={exportTrainingPlanExcel}
                  exportExcelDisabled={isInitialProgrammesLoading || exportRowCount === 0}
                  canManageCohorts={canEditTrainingPlan}
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
              tutorProfiles={buildTutorProfilesFromGroups(groups, tutorProfiles)}
              coachProfiles={buildCoachProfilesFromGroups(groups, coachProfiles)}
              catalogModules={catalogModules}
              holidays={holidays}
              ksbProfiles={ksbProfiles}
              canEdit={canEditTrainingPlan}
              onEditTrainingPlan={handleEditScheduleRow}
              onUpdateSessionCoverage={updateSessionCoverage}
              onUpdateSessionSchedule={updateSessionSchedule}
              onUpdateSessionKsb={updateSessionKsb}
              onUpdateSessionNotes={updateSessionNotes}
              onCreateTutorProfile={createTutorProfile}
              onCreateCoachProfile={createCoachProfile}
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
              tutorProfiles={buildTutorProfilesFromGroups(groups, tutorProfiles)}
              catalogModules={catalogModules}
              holidays={holidays}
              canEdit={canEditTrainingPlan}
              onEditTrainingPlan={handleEditScheduleRow}
              onAddModuleForTutor={handleAddModuleForTutor}
              onCreateTutorProfile={createTutorProfile}
              onUpdateTutorProfile={updateTutorProfile}
              onDeleteTutorProfile={deleteTutorProfile}
            />
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
              No tutor profiles yet because there are no saved programmes in the database.
            </div>
          )
        )}

        {/* COACH PROFILES */}
        {activeTab === 'coaches' && (
          isInitialProgrammesLoading ? (
            <SessionScheduleSkeleton />
          ) : groups.length ? (
            <CoachProfiles
              groups={groups}
              coachProfiles={buildCoachProfilesFromGroups(groups, coachProfiles)}
              holidays={holidays}
              canEdit={canEditTrainingPlan}
              onEditTrainingPlan={handleEditScheduleRow}
              onCreateCoachProfile={createCoachProfile}
              onUpdateCoachProfile={updateCoachProfile}
              onDeleteCoachProfile={deleteCoachProfile}
            />
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
              No coach profiles yet because there are no saved programmes in the database.
            </div>
          )
        )}

      </main>
      <Footer />

      {/* Modals */}
      {canEditTrainingPlan && visibleEditChoice && visibleEditChoiceDetails && !pendingOverviewChoiceDetails && (
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
                  openOverviewChoice(visibleEditChoice);
                  setVisibleEditChoice(null);
                }}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-kbc-navy hover:shadow-md"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <i className="ri-calendar-check-line" />
                </span>
                <span className="mt-3 block text-sm font-extrabold text-kbc-navy">Module Overview</span>
                <span className="mt-1 block text-xs leading-5 text-gray-500">
                  View monthly breakdown, mapped subprogramme students, sessions, holidays, and delivery details.
                </span>
                <span className="mt-3 block text-xs font-semibold text-gray-400">
                  {visibleEditChoiceDetails.block.startDate} to {visibleEditChoiceDetails.block.endDate}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingOverviewChoiceDetails && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[5px]"
            onClick={() => {
              setPendingOverviewChoiceDetails(null);
              if (pendingOverviewReturnChoice) {
                setVisibleEditChoice({ ...pendingOverviewReturnChoice });
              }
            }}
          />
          <div className="relative w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/60">{pendingOverviewChoiceDetails.group.name.replace('\n', ' ')} - {pendingOverviewChoiceDetails.row.label}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">Choose Module Overview View</h3>
                <p className="mt-1 text-xs text-white/70">{pendingOverviewChoiceDetails.displayName}</p>
              </div>
              <button
                onClick={() => {
                  setPendingOverviewChoiceDetails(null);
                  setPendingOverviewReturnChoice(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white"
              >
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="grid gap-3 bg-gray-50 p-4 md:grid-cols-2">
              {[
                {
                  mode: 'monthly' as ModuleOverviewMode,
                  icon: 'ri-calendar-event-line',
                  title: 'Monthly Module Breakdown',
                  body: 'View session dates, counted sessions, holiday clashes, and delivery weeks.',
                  meta: `${pendingOverviewChoiceDetails.block.startDate} to ${pendingOverviewChoiceDetails.block.endDate}`,
                },
                {
                  mode: 'students' as ModuleOverviewMode,
                  icon: 'ri-team-line',
                  title: 'Subprogramme Students',
                  body: 'View mapped subprogramme learners with group, programme, and manager details.',
                  meta: pendingOverviewChoiceDetails.block.groupName || 'Selected group',
                },
              ].map(item => (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => {
                    openMonthlySummary(
                      pendingOverviewChoiceDetails.group.id,
                      pendingOverviewChoiceDetails.row.id,
                      pendingOverviewChoiceDetails.block.id,
                      item.mode,
                      pendingOverviewChoiceDetails,
                    );
                    setPendingOverviewChoiceDetails(null);
                  }}
                  className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-kbc-navy hover:shadow-md"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-kbc-navy text-white">
                    <i className={item.icon} />
                  </span>
                  <span className="mt-3 block text-sm font-extrabold text-kbc-navy">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500">{item.body}</span>
                  <span className="mt-3 block text-xs font-semibold text-gray-400">{item.meta}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedMonthlySummary && (
        <MonthlyModuleSummaryModal
          summary={selectedMonthlySummary.summary}
          mode={selectedMonthlySummary.mode}
          onClose={() => setSelectedMonthlySummary(null)}
          onBack={selectedMonthlySummary.overviewChoiceDetails ? () => {
            setPendingOverviewChoiceDetails(selectedMonthlySummary.overviewChoiceDetails || null);
            setSelectedMonthlySummary(null);
          } : undefined}
        />
      )}

      {canEditTrainingPlan && pendingTutorModuleAdd && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[4px]" />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-kbc-navy px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold">Add Module To Tutor</h3>
                  <p className="mt-1 text-xs font-semibold text-white/70">
                    Choose an existing cohort or create a new cohort for this module.
                  </p>
                </div>
                <button type="button" onClick={() => setPendingTutorModuleAdd(null)} className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {(() => {
                const catalogModule = resolveCatalogModuleByValue(pendingTutorModuleAdd.moduleValue, catalogModules);
                const customModule = customModules.find(item => item.name === pendingTutorModuleAdd.moduleValue || item.id === pendingTutorModuleAdd.moduleValue);
                const moduleName = catalogModule?.name
                  || (pendingTutorModuleAdd.moduleValue in MS ? getModuleMeta(pendingTutorModuleAdd.moduleValue as MKey).lbl : String(pendingTutorModuleAdd.moduleValue));
                const tutorName = tutorProfiles.find(profile => profile.id === pendingTutorModuleAdd.tutorProfileId)?.name || 'Selected tutor';
                const cohortRows = groups.flatMap((group, groupIdx) => group.rows.map((row, rowIdx) => ({
                  group,
                  groupIdx,
                  row,
                  rowIdx,
                  label: `${group.name} - ${row.label || 'Untitled cohort'}`,
                  meta: [
                    row.dateLbl ? formatDate(row.dateLbl) : '',
                    row.endDateLbl ? formatDate(row.endDateLbl) : '',
                    `${row.blks.length} module${row.blks.length === 1 ? '' : 's'}`,
                  ].filter(Boolean).join(' - '),
                  groupsText: Array.from(new Set(row.blks.map(block => block.groupName).filter(Boolean))).join(', '),
                })));
                const cohortOptions = cohortRows.map(item => ({
                  value: `${item.groupIdx}:${item.rowIdx}`,
                  label: item.label,
                  description: item.meta || 'No dates yet',
                  color: item.row.color || item.group.color,
                }));
                const [selectedGroupIdx, selectedRowIdx] = pendingTutorModuleCohort.split(':').map(item => Number(item));
                const selectedCohort = cohortRows.find(item => item.groupIdx === selectedGroupIdx && item.rowIdx === selectedRowIdx);
                const selectedGroupBlocks = selectedCohort?.row.blks.reduce<ModuleBlock[]>((items, block) => {
                  const key = tutorModuleGroupKey(block);
                  if (!items.some(item => tutorModuleGroupKey(item) === key)) {
                    items.push(block);
                  }
                  return items;
                }, []) || [];
                const groupOptions = selectedGroupBlocks.map(block => ({
                  value: tutorModuleGroupKey(block),
                  label: block.groupName || 'No group name',
                  description: [
                    block.coachName ? `Coach: ${block.coachName}` : 'Coach: TBD',
                    block.days?.length ? block.days.join(', ') : 'monday',
                    `${block.sessionStartTime || '09:00'} - ${block.sessionEndTime || '11:00'}`,
                  ].join(' - '),
                  color: block.color || selectedCohort?.row.color || selectedCohort?.group.color || '#1B2A4A',
                }));
                const selectedSourceBlock = selectedGroupBlocks.find(block => tutorModuleGroupKey(block) === pendingTutorModuleGroup);
                const shouldCreateGroup = pendingTutorModuleCreateGroup || groupOptions.length === 0;
                const selectedDays = shouldCreateGroup
                  ? pendingTutorModuleGroupDraft.days
                  : selectedSourceBlock?.days?.length ? selectedSourceBlock.days : (['monday'] as WeekDayKey[]);
                const sessionCount = Math.max(1, parseInt(catalogModule?.sessions || String(customModule?.defaultSessions || 1), 10) || 1);
                const activeHolidays = selectedCohort ? holidays.filter(holiday => (selectedCohort.row.holidayIds || []).includes(holiday.id)) : [];
                const previewPlan = pendingTutorModuleStartDate
                  ? buildWeeklyTutorModulePlan(pendingTutorModuleStartDate, sessionCount, selectedDays, activeHolidays)
                  : null;
                return (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected</p>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Module</p>
                          <p className="mt-1 text-sm font-extrabold text-kbc-navy">{moduleName}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{sessionCount} sessions</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tutor</p>
                          <p className="mt-1 text-sm font-extrabold text-kbc-navy">{tutorName}</p>
                        </div>
                      </div>
                    </div>

                    {cohortOptions.length ? (
                      <div className="mt-5 grid gap-4">
                        <div>
                          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Cohort</label>
                          <SelectField
                            value={pendingTutorModuleCohort}
                            options={cohortOptions}
                            placeholder="Select cohort"
                            label="Existing cohorts"
                            searchPlaceholder="Search cohorts..."
                            accentColor="#1B2A4A"
                            onChange={value => {
                              setPendingTutorModuleCohort(value);
                              setPendingTutorModuleGroup('');
                              setPendingTutorModuleCreateGroup(false);
                              setPendingTutorModuleError('');
                            }}
                          />
                        </div>

                        {selectedCohort && (
                          <div>
                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Group</label>
                            <div className="mb-3 grid grid-cols-2 rounded-xl border border-gray-200 bg-gray-50 p-1">
                              <button
                                type="button"
                                disabled={groupOptions.length === 0}
                                onClick={() => {
                                  setPendingTutorModuleCreateGroup(false);
                                  setPendingTutorModuleGroup('');
                                  setPendingTutorModuleError('');
                                }}
                                className={`rounded-lg px-3 py-2 text-xs font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${!shouldCreateGroup ? 'bg-kbc-navy text-white shadow-sm' : 'text-gray-500 hover:bg-white'}`}
                              >
                                Use existing group
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingTutorModuleCreateGroup(true);
                                  setPendingTutorModuleGroup('');
                                  setPendingTutorModuleError('');
                                }}
                                className={`rounded-lg px-3 py-2 text-xs font-extrabold transition-colors ${shouldCreateGroup ? 'bg-kbc-navy text-white shadow-sm' : 'text-gray-500 hover:bg-white'}`}
                              >
                                Create new group
                              </button>
                            </div>
                            {!shouldCreateGroup && groupOptions.length > 0 ? (
                              <SelectField
                                value={pendingTutorModuleGroup}
                                options={groupOptions}
                                placeholder="Select group first"
                                label="Existing groups"
                                searchPlaceholder="Search groups..."
                                accentColor="#1B2A4A"
                                onChange={value => {
                                  setPendingTutorModuleGroup(value);
                                  setPendingTutorModuleError('');
                                }}
                              />
                            ) : (
                              <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-2">
                                <div>
                                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Group Name</label>
                                  <input
                                    value={pendingTutorModuleGroupDraft.name}
                                    onChange={event => {
                                      setPendingTutorModuleGroupDraft(prev => ({ ...prev, name: event.target.value }));
                                      setPendingTutorModuleError('');
                                    }}
                                    placeholder="e.g. G1 - Friday"
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-kbc-navy outline-none focus:border-kbc-navy"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Coach</label>
                                  <input
                                    value={pendingTutorModuleGroupDraft.coach}
                                    onChange={event => setPendingTutorModuleGroupDraft(prev => ({ ...prev, coach: event.target.value }))}
                                    placeholder="Coach name"
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-kbc-navy outline-none focus:border-kbc-navy"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Days</label>
                                  <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2">
                                    {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as WeekDayKey[]).map(day => {
                                      const checked = pendingTutorModuleGroupDraft.days.includes(day);
                                      return (
                                        <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold capitalize ${checked ? 'bg-kbc-navy text-white' : 'bg-white text-gray-600'}`}>
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                              setPendingTutorModuleGroupDraft(prev => {
                                                const nextDays = prev.days.includes(day)
                                                  ? prev.days.filter(item => item !== day)
                                                  : [...prev.days, day];
                                                return { ...prev, days: nextDays };
                                              });
                                              setPendingTutorModuleError('');
                                            }}
                                            className="h-3.5 w-3.5 accent-kbc-navy"
                                          />
                                          {day}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Start</label>
                                    <input
                                      type="time"
                                      value={pendingTutorModuleGroupDraft.startTime}
                                      onChange={event => setPendingTutorModuleGroupDraft(prev => ({ ...prev, startTime: event.target.value }))}
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-kbc-navy outline-none focus:border-kbc-navy"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">End</label>
                                    <input
                                      type="time"
                                      value={pendingTutorModuleGroupDraft.endTime}
                                      onChange={event => setPendingTutorModuleGroupDraft(prev => ({ ...prev, endTime: event.target.value }))}
                                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-kbc-navy outline-none focus:border-kbc-navy"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Module Start Date</label>
                            <DateField
                              value={pendingTutorModuleStartDate}
                              onChange={value => {
                                setPendingTutorModuleStartDate(value);
                                setPendingTutorModuleError('');
                              }}
                              placeholder="Choose start date"
                              error={pendingTutorModuleError && !pendingTutorModuleStartDate ? pendingTutorModuleError : undefined}
                              accentColor="#1B2A4A"
                            />
                          </div>
                          <div>
                            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600">Module End Date</p>
                            <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-kbc-navy">
                              {previewPlan?.effectiveEndDate ? formatDate(previewPlan.effectiveEndDate) : 'Auto after start date'}
                            </div>
                            <p className="mt-1 text-xs font-semibold text-gray-400">
                              {selectedDays.join(', ')} weekly schedule
                              {previewPlan?.actualStartDate && previewPlan.actualStartDate !== pendingTutorModuleStartDate ? ` - first actual session ${formatDate(previewPlan.actualStartDate)}` : ''}
                              {previewPlan?.shiftedSessions ? ` - ${previewPlan.shiftedSessions} holiday shift${previewPlan.shiftedSessions === 1 ? '' : 's'}` : ''}
                            </p>
                          </div>
                        </div>

                        {selectedCohort && (
                          <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Will be added to</p>
                            <p className="mt-1 text-sm font-extrabold text-kbc-navy">{selectedCohort.label}</p>
                            <p className="mt-1 text-xs font-semibold text-gray-500">{selectedCohort.meta || 'No dates yet'}</p>
                            {selectedCohort.groupsText && <p className="mt-1 text-xs text-gray-400">Groups: {selectedCohort.groupsText}</p>}
                          </div>
                        )}

                        {pendingTutorModuleError && pendingTutorModuleStartDate && (
                          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{pendingTutorModuleError}</p>
                        )}
                        {pendingTutorModuleError && !pendingTutorModuleStartDate && (
                          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{pendingTutorModuleError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
                        <p className="text-sm font-bold text-kbc-navy">No cohorts available yet</p>
                        <p className="mt-1 text-xs text-gray-500">Create a cohort first, then add this module to the tutor.</p>
                        <button
                          type="button"
                          onClick={handleAddTutorModuleToNewCohort}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white"
                        >
                          <i className="ri-add-line" />
                          Create New Cohort
                        </button>
                      </div>
                    )}

                    <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                      <button
                        type="button"
                        onClick={() => setPendingTutorModuleAdd(null)}
                        disabled={pendingTutorModuleSaving}
                        className="rounded-lg px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void savePendingTutorModule()}
                        disabled={pendingTutorModuleSaving || !cohortOptions.length}
                        className="inline-flex items-center gap-2 rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {pendingTutorModuleSaving && <i className="ri-loader-4-line animate-spin" />}
                        {pendingTutorModuleSaving ? 'Saving...' : 'Save Module'}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {canEditTrainingPlan && modal.open && (
        <CohortModal
          mode={modal.mode}
          groups={groups}
          holidays={holidays}
          customModules={customModules}
          catalogModules={catalogModules}
          ksbProfiles={ksbProfiles}
          tutorProfiles={buildTutorProfilesFromGroups(groups, tutorProfiles)}
          initialGroupIdx={modal.mode === 'add' ? modal.defaultGroupIdx : modal.groupIdx}
          initialRow={modal.mode === 'edit' ? modal.row : undefined}
          initialExpandedBlockId={modal.mode === 'edit' ? modal.expandedBlockId : undefined}
          prefillTutorProfileId={'prefillTutorProfileId' in modal ? modal.prefillTutorProfileId : undefined}
          prefillModule={'prefillModule' in modal ? modal.prefillModule : undefined}
          lockGroupSelection={modal.open && modal.mode === 'add' && 'lockGroupSelection' in modal ? modal.lockGroupSelection : false}
          onSave={handleSave}
          onUpdateModulePartial={modal.open && modal.mode === 'edit' ? (blockId, payload) => updateModulePartial(modal.groupIdx, modal.rowIdx, blockId, payload) : undefined}
          onCreateTutorProfile={createTutorProfile}
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

      {canEditTrainingPlan && showHolidayMgr && (
        <HolidayManager
          holidays={holidays}
          onSave={persistHolidays}
          onClose={() => setShowHolidayMgr(false)}
        />
      )}

      {canEditTrainingPlan && showKsbProfiles && (
        <KsbProfilesManager
          profiles={ksbProfiles}
          programmeOptions={groups.map(group => group.name.replace(/\s+/g, ' ').trim()).filter(Boolean)}
          onCreate={createKsbProfile}
          onUpdate={updateKsbProfile}
          onDelete={deleteKsbProfile}
          onClose={() => setShowKsbProfiles(false)}
        />
      )}

      {canEditTrainingPlan && showAddModule && (
        <AddModuleModal
          onSave={handleAddModule}
          onClose={() => setShowAddModule(false)}
        />
      )}

      {canEditTrainingPlan && showAddCatalogModule && (
        <AddModuleCatalogModal
          onSave={handleAddCatalogModule}
          onClose={() => setShowAddCatalogModule(false)}
        />
      )}

      {canEditTrainingPlan && programModal.open && (
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

      {canEditTrainingPlan && showManageModules && (
        <ManageModulesModal
          modules={catalogModules}
          ksbProfiles={ksbProfiles}
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
