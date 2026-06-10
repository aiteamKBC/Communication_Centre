import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import type { CatalogModule, CoachProfile, Holiday, KsbProfile, ModuleBlock, ProgrammeGroup, SessionCoverage, SessionKsbMapping, TutorProfile, WeekDayKey } from '../types';
import { getModuleMeta } from '../data';
import { kbcSwal } from '@/components/feature/sweetAlert';
import SelectField from './SelectField';
import { normalizeTutorName, profileIdForTutorName, resolveTutorProfile, tutorDisplayName } from '../tutorProfiles';
import { buildHolidayAdjustedSessionPlan } from '../utils';

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
  coverage?: SessionCoverage;
  ksbMapping: SessionKsbMapping;
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

interface CoverageConflict {
  role: 'Assigned tutor' | 'Coverage tutor';
  date: string;
  time: string;
  module: string;
  programme: string;
  cohort: string;
  groupName?: string;
}

interface CoachCandidate {
  key: string;
  name: string;
  normalizedName: string;
  profile?: CoachProfile;
  email?: string;
  sessionCount: number;
  source: 'profile' | 'training-plan' | 'both';
}

interface CoachCoverageSuggestion {
  candidate: CoachCandidate;
  score: number;
  sameModuleSessions: number;
  sameProgrammeSessions: number;
  totalAssignedSessions: number;
  reasons: string[];
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
  programme: string;
  cohort: string;
  groupName?: string;
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
  trainingPlanId?: string;
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
  assignedTutorProfileId: string;
  assignedTutorName: string;
  currentCoverage?: SessionCoverage;
  currentKsbMapping: SessionKsbMapping;
  notes?: string;
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
  rawEndDate: string;
  sessionWeekDay: string;
  sessionStartTime: string;
  sessionEndTime: string;
  coachName: string;
  isCurrent?: boolean;
}

interface ProgrammeSection {
  programme: string;
  programmeColor: string;
  rows: DerivedScheduleRow[];
}

interface Props {
  groups: ProgrammeGroup[];
  tutorProfiles?: TutorProfile[];
  coachProfiles?: CoachProfile[];
  catalogModules?: CatalogModule[];
  holidays?: Holiday[];
  ksbProfiles?: KsbProfile[];
  canEdit?: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
  onUpdateSessionCoverage?: (groupIdx: number, rowIdx: number, blockId: string, coverage: SessionCoverage) => Promise<boolean>;
  onUpdateSessionSchedule?: (groupIdx: number, rowIdx: number, blockId: string, payload: SessionScheduleUpdatePayload) => Promise<boolean>;
  onUpdateSessionKsb?: (groupIdx: number, rowIdx: number, blockId: string, sessionNumber: number, mapping: SessionKsbMapping) => Promise<boolean>;
  onUpdateSessionNotes?: (groupIdx: number, rowIdx: number, blockId: string, notes: string) => Promise<boolean>;
  onCreateTutorProfile?: (payload: { name: string; email?: string; notes?: string; confirmCreateNew?: boolean }) => Promise<TutorProfile | { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number }>;
  onCreateCoachProfile?: (payload: { name: string; email?: string; notes?: string; confirmCreateNew?: boolean }) => Promise<CoachProfile | { existingProfile?: CoachProfile; possibleExistingProfile?: CoachProfile; detail?: string; score?: number }>;
}

export interface SessionScheduleUpdatePayload {
  startDate?: string;
  endDate?: string;
  sessionStartTime?: string;
  sessionEndTime?: string;
  sessionWeekDay?: string;
  tutorProfileId?: string;
  tutorName?: string;
  coachName?: string;
}

type DayKey = WeekDayKey;
type KsbCodePrefix = 'K' | 'S' | 'B';
type KsbProfileCodeOption = { code: string; description: string; profileName: string };

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

function getActiveRowHolidays(row: ProgrammeGroup['rows'][number], holidays: Holiday[]): Holiday[] {
  const selectedHolidayIds = new Set(row.holidayIds || []);
  return selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
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

function getSessionDates(blk: ModuleBlock, holidays: Holiday[] = []): string[] {
  const plan = buildHolidayAdjustedSessionPlan(blk, holidays);
  const dates = plan.sessions.map(session => session.date);
  return dates.length ? dates : [blk.startDate].filter(Boolean);
}

function buildTutorSessionOccurrences(groups: ProgrammeGroup[], holidays: Holiday[]): TutorSessionOccurrence[] {
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
        const activeHolidays = getActiveRowHolidays(row, holidays);

        return getSessionDates(block, activeHolidays).map(date => ({
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
  activeHolidays: Holiday[] = [],
): TutorSessionOccurrence[] {
  const normalizedTutor = normalizePersonName(nextTutor);
  const nextStartTime = nextBlock.sessionStartTime || '09:00';
  const nextEndTime = nextBlock.sessionEndTime || '11:00';
  const nextTime = formatTimeRange(nextStartTime, nextEndTime);
  const nextSessionDates = new Set(getSessionDates(nextBlock, activeHolidays));

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
  holidays: Holiday[],
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

        const activeHolidays = getActiveRowHolidays(row, holidays);
        const effectiveEndDate = buildHolidayAdjustedSessionPlan(block, activeHolidays).effectiveEndDate || block.endDate;
        const startTs = parseLocalIsoDate(block.startDate).getTime();
        const endTs = parseLocalDateTime(effectiveEndDate, block.sessionEndTime || '11:00').getTime();
        if (Number.isNaN(startTs) || Number.isNaN(endTs) || now.getTime() < startTs || now.getTime() > endTs) {
          return [];
        }

        const module = getModuleMeta(block.mod).lbl;
        const progress = getSessionProgress(block, module, catalogModules, '', getActiveRowHolidays(row, holidays));

        return [{
          blockId: block.id,
          module,
          programme: programmeLabelFromGroupName(group.name),
          cohort: row.label,
          groupName: (block.groupName || row.label || '').trim() || undefined,
          coach: block.coachName?.trim() || 'TBD',
          startDate: block.startDate,
          endDate: effectiveEndDate,
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

function getCoverageForSession(block: ModuleBlock, sessionNumber: number, assignedTutorProfileId = ''): SessionCoverage | undefined {
  const existing = (block.sessionCoverage || []).find(item => item.sessionNumber === sessionNumber);
  if (!existing) return undefined;
  const coverageTutorProfileId = existing.coverageTutorProfileId || '';
  const tutorUnavailable = Boolean(existing.tutorUnavailable) || Boolean(coverageTutorProfileId);
  return {
    ...existing,
    assignedTutorProfileId: existing.assignedTutorProfileId || assignedTutorProfileId,
    tutorUnavailable,
    coverageStatus: coverageTutorProfileId ? 'covered' : tutorUnavailable ? 'required' : 'none',
  };
}

function emptyKsbMapping(): SessionKsbMapping {
  return { knowledgeCodes: [], skillCodes: [], behaviourCodes: [] };
}

function normalizeKsbCodes(value: unknown, prefix: 'K' | 'S' | 'B'): string[] {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,\s;|]+/);
  const seen = new Set<string>();
  const codes: string[] = [];
  raw.forEach(item => {
    const code = String(item || '').trim().toUpperCase();
    if (!code || seen.has(code) || !new RegExp(`^${prefix}\\d+(?:\\.\\d+)*$`).test(code)) {
      return;
    }
    seen.add(code);
    codes.push(code);
  });
  return codes;
}

function normalizeKsbMapping(value: unknown): SessionKsbMapping {
  const record = value && typeof value === 'object' ? value as Partial<SessionKsbMapping> : {};
  return {
    knowledgeCodes: normalizeKsbCodes(record.knowledgeCodes, 'K'),
    skillCodes: normalizeKsbCodes(record.skillCodes, 'S'),
    behaviourCodes: normalizeKsbCodes(record.behaviourCodes, 'B'),
  };
}

function buildKsbDescriptionLookup(profile: KsbProfile | undefined): Record<string, string> {
  const lookup: Record<string, string> = {};
  (profile?.ksbItems || []).forEach(item => {
    const code = (item.code || `${item.type}${item.number}`).trim().toUpperCase();
    if (code) lookup[code] = item.description || code;
  });
  return lookup;
}

function buildKsbProfileCodeOptions(profile: KsbProfile | undefined): Record<KsbCodePrefix, KsbProfileCodeOption[]> {
  const buckets: Record<KsbCodePrefix, KsbProfileCodeOption[]> = { K: [], S: [], B: [] };
  const seen: Record<KsbCodePrefix, Set<string>> = { K: new Set(), S: new Set(), B: new Set() };
  (profile?.ksbItems || []).forEach(item => {
    const prefix = item.type;
    if (prefix !== 'K' && prefix !== 'S' && prefix !== 'B') return;
    const code = (item.code || `${item.type}${item.number}`).trim().toUpperCase();
    if (!code || seen[prefix].has(code)) return;
    seen[prefix].add(code);
    buckets[prefix].push({ code, description: item.description || code, profileName: profile.name });
  });
  return buckets;
}

function ksbCodesFromText(value: string, prefix: KsbCodePrefix): string[] {
  return normalizeKsbCodes(value.split(/[,\s;|]+/), prefix);
}

function replaceActiveKsbToken(value: string, code: string): string {
  const trimmed = value.trim();
  if (!trimmed) return code;
  const parts = trimmed.split(/([,\s;|]+)/);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].trim()) {
      parts[i] = code;
      return parts.join('').replace(/[,\s;|]+$/g, '').trim();
    }
  }
  return code;
}

function KsbDraftInput({
  label,
  placeholder,
  prefix,
  value,
  disabled,
  descriptions,
  suggestions,
  onChange,
}: {
  label: string;
  placeholder: string;
  prefix: KsbCodePrefix;
  value: string;
  disabled: boolean;
  descriptions: Record<string, string>;
  suggestions: KsbProfileCodeOption[];
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const tokens = value.split(/[,\s;|]+/).map(item => item.trim().toUpperCase()).filter(Boolean);
  const lastToken = tokens[tokens.length - 1] || '';
  const usedCodes = new Set(ksbCodesFromText(value, prefix));
  const matches = focused && !disabled && lastToken
    ? suggestions
      .filter(option => !usedCodes.has(option.code) && option.code.startsWith(lastToken))
      .slice(0, 6)
    : [];

  const tone = prefix === 'K'
    ? { label: 'text-sky-700', row: 'hover:bg-sky-50', chip: 'border-sky-200 bg-sky-50 text-sky-800' }
    : prefix === 'S'
      ? { label: 'text-emerald-700', row: 'hover:bg-emerald-50', chip: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
      : { label: 'text-amber-700', row: 'hover:bg-amber-50', chip: 'border-amber-200 bg-amber-50 text-amber-800' };

  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
      <input
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={event => onChange(event.target.value)}
        placeholder={disabled ? 'Select a KSB profile first' : placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
      />
      {matches.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[90] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          {matches.map(option => (
            <button
              key={option.code}
              type="button"
              title={`${option.code} - ${descriptions[option.code] || option.description}`}
              onMouseDown={event => {
                event.preventDefault();
                onChange(replaceActiveKsbToken(value, option.code));
              }}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${tone.row}`}
            >
              <span className={`mt-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${tone.chip}`}>{option.code}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[11px] font-extrabold ${tone.label}`} title={descriptions[option.code] || option.description}>
                  {descriptions[option.code] || option.description}
                </span>
                <span className="block truncate text-[10px] font-semibold text-gray-400">{option.profileName}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getKsbMappingForSession(block: ModuleBlock, sessionNumber: number): SessionKsbMapping {
  return normalizeKsbMapping(block.sessionKsbMappings?.[sessionNumber - 1] || emptyKsbMapping());
}

function ksbCodeText(codes: string[]): string {
  return codes.join(', ');
}

function getSessionProgress(blk: ModuleBlock, moduleName: string, catalogModules: CatalogModule[], assignedTutorProfileId = '', holidays: Holiday[] = []) {
  const now = new Date();
  const endTime = blk.sessionEndTime || '11:00';
  const totalSessions = Math.max(1, blk.sessions || 1);
  const sessionDates = getSessionDates(blk, holidays);
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
      coverage: getCoverageForSession(blk, number, assignedTutorProfileId),
      ksbMapping: getKsbMappingForSession(blk, number),
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
    currentCoverage: getCoverageForSession(blk, currentSessionNumber, assignedTutorProfileId),
    currentKsbMapping: getKsbMappingForSession(blk, currentSessionNumber),
    completedSessions,
    totalSessions,
    sessionInstances,
  };
}

function toDerivedRows(groups: ProgrammeGroup[], catalogModules: CatalogModule[], tutorProfiles: TutorProfile[], holidays: Holiday[]): DerivedScheduleRow[] {
  const now = new Date();
  const tutorSessions = buildTutorSessionOccurrences(groups, holidays);

  return groups
    .flatMap((group, groupIdx) =>
      group.rows.flatMap((row, rowIdx) =>
        row.blks.map((blk, idx) => {
          const moduleName = getModuleMeta(blk.mod).lbl;
          const assignedTutorProfile = resolveTutorProfile(blk, tutorProfiles);
          const assignedTutorProfileId = assignedTutorProfile?.id || blk.tutorProfileId || profileIdForTutorName(blk.tutor || '', tutorProfiles);
          const assignedTutorName = assignedTutorProfile?.name || tutorDisplayName(blk, tutorProfiles) || blk.tutor?.trim() || 'TBD';
          const activeHolidays = getActiveRowHolidays(row, holidays);
          const sessionProgress = getSessionProgress(blk, moduleName, catalogModules, assignedTutorProfileId, activeHolidays);
          const effectiveEndDate = buildHolidayAdjustedSessionPlan(blk, activeHolidays).effectiveEndDate || blk.endDate;
          const groupName = (blk.groupName || row.label || '').trim();
          const nextBlock = row.blks[idx + 1];
          const nextEffectiveEndDate = nextBlock
            ? buildHolidayAdjustedSessionPlan(nextBlock, activeHolidays).effectiveEndDate || nextBlock.endDate
            : '';
          const nextModule = nextBlock ? getModuleMeta(nextBlock.mod).lbl : '';
          const nextTutor = nextBlock?.tutor?.trim() || '';
          const nextGroupName = nextBlock ? (nextBlock.groupName || row.label || '').trim() : '';
          const nextModuleInfo: NextModuleInfo = nextBlock
            ? {
              name: nextModule,
              isScheduledBlock: true,
              tutor: nextTutor,
              coach: nextBlock.coachName?.trim() || 'TBD',
              programme: programmeLabelFromGroupName(group.name),
              cohort: row.label,
              groupName: nextGroupName || undefined,
              startDate: nextBlock.startDate,
              endDate: nextEffectiveEndDate,
              sessions: nextBlock.sessions,
              currentTutorModules: nextTutor
                ? getCurrentTutorModules(groups, nextTutor, catalogModules, now, holidays, nextBlock.id)
                : [],
              otherTutorSessions: nextTutor
                ? getTutorTimeConflicts(nextBlock, nextTutor, tutorSessions, activeHolidays)
                : [],
            }
            : {
              name: '',
              isScheduledBlock: false,
              tutor: '',
              coach: '',
              programme: '',
              cohort: '',
              groupName: undefined,
              startDate: '',
              endDate: '',
              sessions: 0,
              currentTutorModules: [],
              otherTutorSessions: [],
            };
          const weekdays = blk.days?.length ? blk.days : [inferDayFromIsoDate(blk.startDate)];
          const trainer = assignedTutorName;
          const coach = blk.coachName?.trim() || 'TBD';
          const startTime = blk.sessionStartTime || '09:00';
          const endTime = blk.sessionEndTime || '11:00';
          const cell: SessionCell = { trainer, coach, time: formatTimeRange(startTime, endTime) };

          const startTs = parseLocalIsoDate(blk.startDate).getTime();
          const endTs = parseLocalDateTime(effectiveEndDate, endTime).getTime();
          const isCurrent = !Number.isNaN(startTs) && !Number.isNaN(endTs) && now.getTime() >= startTs && now.getTime() <= endTs;

          const base: DerivedScheduleRow = {
            groupIdx,
            rowIdx,
            blockId: blk.id,
            trainingPlanId: blk.trainingPlanId,
            cohort: `${formatCompactIsoDate(blk.startDate)} → ${formatCompactIsoDate(effectiveEndDate)}`,
            cohortColor: row.color || group.color,
            programme: programmeLabelFromGroupName(group.name),
            programmeColor: group.color,
            module: moduleName,
            groupName: groupName || undefined,
            ...sessionProgress,
            assignedTutorProfileId,
            assignedTutorName,
            nextModule,
            nextModuleInfo,
            rowHighlight: isCurrent ? '#FFFBEB' : `${(row.color || group.color)}0D`,
            startDate: blk.startDate,
            endDate: effectiveEndDate,
            rawEndDate: blk.endDate,
            sessionWeekDay: weekdays.join(', '),
            sessionStartTime: startTime,
            sessionEndTime: endTime,
            coachName: coach,
            notes: blk.notes || '',
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

export default function ScheduleTable({ groups, tutorProfiles = [], coachProfiles = [], catalogModules = [], holidays = [], ksbProfiles = [], canEdit = false, onEditTrainingPlan, onUpdateSessionCoverage, onUpdateSessionSchedule, onUpdateSessionKsb, onUpdateSessionNotes, onCreateTutorProfile, onCreateCoachProfile }: Props) {
  const rows = toDerivedRows(groups, catalogModules, tutorProfiles, holidays);
  const sections = toProgrammeSections(rows);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [headerScrollLeft, setHeaderScrollLeft] = useState(0);
  const [selectedRow, setSelectedRow] = useState<DerivedScheduleRow | null>(null);
  const [coverageEditor, setCoverageEditor] = useState<{ row: DerivedScheduleRow; session: SessionInstance } | null>(null);
  const [coverageDraft, setCoverageDraft] = useState<SessionCoverage | null>(null);
  const [coverageError, setCoverageError] = useState('');
  const [coverageSaving, setCoverageSaving] = useState(false);
  const [scheduleEditor, setScheduleEditor] = useState<DerivedScheduleRow | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<Required<Pick<SessionScheduleUpdatePayload, 'startDate' | 'endDate' | 'sessionStartTime' | 'sessionEndTime' | 'sessionWeekDay' | 'tutorProfileId' | 'tutorName' | 'coachName'>>>({
    startDate: '',
    endDate: '',
    sessionStartTime: '',
    sessionEndTime: '',
    sessionWeekDay: '',
    tutorProfileId: '',
    tutorName: '',
    coachName: '',
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [ksbEditor, setKsbEditor] = useState<DerivedScheduleRow | null>(null);
  const [ksbDraftText, setKsbDraftText] = useState({ knowledgeCodes: '', skillCodes: '', behaviourCodes: '' });
  const [ksbProfileId, setKsbProfileId] = useState('');
  const [ksbSaving, setKsbSaving] = useState(false);
  const [ksbError, setKsbError] = useState('');
  const [notesEditor, setNotesEditor] = useState<DerivedScheduleRow | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [createTutorName, setCreateTutorName] = useState('');
  const [createCoachName, setCreateCoachName] = useState('');

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

  const tutorOptions = useMemo(() => tutorProfiles.filter(profile => profile.isActive).map(profile => ({
    value: profile.id,
    label: profile.name,
    description: [profile.email, `${profile.sessionCount || 0} sessions`].filter(Boolean).join(' - '),
    color: '#1B2A4A',
  })), [tutorProfiles]);

  const coachCandidates = useMemo<CoachCandidate[]>(() => {
    const byName = new Map<string, CoachCandidate>();

    coachProfiles
      .filter(profile => profile.isActive)
      .forEach(profile => {
        const normalizedName = normalizeTutorName(profile.name);
        if (!normalizedName) return;
        byName.set(normalizedName, {
          key: `profile:${profile.id}`,
          name: profile.name,
          normalizedName,
          profile,
          email: profile.email,
          sessionCount: profile.sessionCount || 0,
          source: 'profile',
        });
      });

    groups.forEach(group => group.rows.forEach(row => row.blks.forEach(block => {
      const name = (block.coachName || '').trim();
      const normalizedName = normalizeTutorName(name);
      if (!normalizedName) return;
      const sessions = Math.max(1, Number(block.sessions || 1));
      const existing = byName.get(normalizedName);
      if (existing) {
        if (existing.source === 'training-plan') {
          existing.sessionCount += sessions;
          return;
        }
        existing.source = existing.source === 'profile' ? 'both' : existing.source;
        existing.sessionCount = Math.max(existing.sessionCount, sessions);
        return;
      }
      byName.set(normalizedName, {
        key: `training-plan:${normalizedName}`,
        name,
        normalizedName,
        sessionCount: sessions,
        source: 'training-plan',
      });
    })));

    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [coachProfiles, groups]);
  const activeKsbProfiles = useMemo(() => ksbProfiles.filter(profile => profile.isActive || profile.id === ksbProfileId), [ksbProfileId, ksbProfiles]);
  const selectedKsbProfile = useMemo(() => ksbProfiles.find(profile => profile.id === ksbProfileId), [ksbProfileId, ksbProfiles]);
  const ksbCodeDescriptions = useMemo(() => buildKsbDescriptionLookup(selectedKsbProfile), [selectedKsbProfile]);
  const ksbProfileCodes = useMemo(() => buildKsbProfileCodeOptions(selectedKsbProfile), [selectedKsbProfile]);

  const coachOptions = useMemo(() => coachCandidates.map(candidate => ({
    value: candidate.key,
    label: candidate.name,
    description: [
      candidate.source === 'both' ? 'Training Plan + Coach Profile' : candidate.source === 'profile' ? 'Coach Profile' : 'Training Plan',
      candidate.email,
      `${candidate.sessionCount || 0} sessions`,
    ].filter(Boolean).join(' - '),
    color: '#1B2A4A',
  })), [coachCandidates]);

  const openCoverageEditor = (row: DerivedScheduleRow, session: SessionInstance) => {
    if (!row.trainingPlanId) {
      showMissingTrainingPlanId('coverage');
      return;
    }
    const existing = session.coverage || row.currentCoverage;
    const hasCoverageTutor = Boolean(existing?.coverageTutorProfileId);
    const hasCoverageCoach = Boolean(existing?.coverageCoachProfileId);
    const tutorUnavailable = Boolean(existing?.tutorUnavailable) || hasCoverageTutor || hasCoverageCoach;
    setCoverageDraft({
      sessionNumber: session.number,
      assignedTutorProfileId: row.assignedTutorProfileId,
      coverageTutorProfileId: existing?.coverageTutorProfileId || '',
      coverageCoachProfileId: existing?.coverageCoachProfileId || '',
      coverageStatus: hasCoverageTutor || hasCoverageCoach ? 'covered' : tutorUnavailable ? 'required' : 'none',
      tutorUnavailable,
      tutorUnavailableReason: tutorUnavailable ? existing?.tutorUnavailableReason || '' : '',
      tutorUnavailableNotes: tutorUnavailable ? existing?.tutorUnavailableNotes || '' : '',
      coverageReason: hasCoverageTutor || hasCoverageCoach ? existing?.coverageReason || '' : '',
      coverageNotes: hasCoverageTutor || hasCoverageCoach ? existing?.coverageNotes || '' : '',
    });
    setCoverageError('');
    setCreateTutorName('');
    setCreateCoachName('');
    setCoverageEditor({ row, session });
  };

  const showMissingTrainingPlanId = (kind: 'schedule' | 'coverage' | 'ksb' | 'notes') => {
    console.warn(
      kind === 'schedule'
        ? 'SESSION_SCHEDULE_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID'
        : kind === 'coverage'
        ? 'TUTOR_COVERAGE_PARTIAL_SAVE_BLOCKED_MISSING_TRAINING_PLAN_ID'
        : kind === 'ksb'
        ? 'KSB_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID'
        : 'NOTES_PARTIAL_SAVE_UNAVAILABLE_MISSING_TRAINING_PLAN_ID',
      {
        reason: 'missing trainingPlanId',
        message: 'Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID.',
      },
    );
    void kbcSwal.fire({
      title: 'Partial Save Unavailable',
      html: 'Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID.',
      icon: 'info',
      confirmButtonText: 'OK',
    });
  };

  const openScheduleEditor = (row: DerivedScheduleRow) => {
    if (!row.trainingPlanId) {
      showMissingTrainingPlanId('schedule');
      return;
    }
    setScheduleDraft({
      startDate: row.startDate || '',
      endDate: row.rawEndDate || row.endDate || '',
      sessionStartTime: row.sessionStartTime || '09:00',
      sessionEndTime: row.sessionEndTime || '11:00',
      sessionWeekDay: row.sessionWeekDay || inferDayFromIsoDate(row.startDate),
      tutorProfileId: row.assignedTutorProfileId || '',
      tutorName: row.assignedTutorName || '',
      coachName: row.coachName || '',
    });
    setScheduleError('');
    setScheduleEditor(row);
  };

  const openKsbEditor = (row: DerivedScheduleRow) => {
    if (!row.trainingPlanId) {
      showMissingTrainingPlanId('ksb');
      return;
    }
    const normalized = normalizeKsbMapping(row.currentKsbMapping);
    setKsbProfileId('');
    setKsbDraftText({
      knowledgeCodes: ksbCodeText(normalized.knowledgeCodes),
      skillCodes: ksbCodeText(normalized.skillCodes),
      behaviourCodes: ksbCodeText(normalized.behaviourCodes),
    });
    setKsbError('');
    setKsbEditor(row);
  };

  const openNotesEditor = (row: DerivedScheduleRow) => {
    if (!row.trainingPlanId) {
      showMissingTrainingPlanId('notes');
      return;
    }
    setNotesDraft(row.notes || '');
    setNotesError('');
    setNotesEditor(row);
  };

  const saveKsbDraft = async () => {
    if (!ksbEditor || !onUpdateSessionKsb) return;
    const normalized = normalizeKsbMapping({
      knowledgeCodes: ksbDraftText.knowledgeCodes,
      skillCodes: ksbDraftText.skillCodes,
      behaviourCodes: ksbDraftText.behaviourCodes,
    });
    setKsbSaving(true);
    setKsbError('');
    try {
      const saved = await onUpdateSessionKsb(ksbEditor.groupIdx, ksbEditor.rowIdx, ksbEditor.blockId, ksbEditor.currentSessionNumber, normalized);
      if (saved) {
        setKsbEditor(null);
        setKsbDraftText({ knowledgeCodes: '', skillCodes: '', behaviourCodes: '' });
      }
    } catch (error) {
      setKsbError(error instanceof Error ? error.message : 'KSB Mapping could not be saved.');
    } finally {
      setKsbSaving(false);
    }
  };

  const saveNotesDraft = async () => {
    if (!notesEditor || !onUpdateSessionNotes) return;
    setNotesSaving(true);
    setNotesError('');
    try {
      const saved = await onUpdateSessionNotes(notesEditor.groupIdx, notesEditor.rowIdx, notesEditor.blockId, notesDraft);
      if (saved) {
        setNotesEditor(null);
        setNotesDraft('');
      }
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : 'Session notes could not be saved.');
    } finally {
      setNotesSaving(false);
    }
  };

  const saveScheduleDraft = async () => {
    if (!scheduleEditor || !onUpdateSessionSchedule) return;
    if (!scheduleDraft.startDate || !scheduleDraft.endDate) {
      setScheduleError('Start date and end date are required.');
      return;
    }
    if (scheduleDraft.endDate < scheduleDraft.startDate) {
      setScheduleError('End date cannot be before start date.');
      return;
    }
    setScheduleSaving(true);
    setScheduleError('');
    try {
      const selectedTutor = tutorProfiles.find(profile => profile.id === scheduleDraft.tutorProfileId);
      const saved = await onUpdateSessionSchedule(scheduleEditor.groupIdx, scheduleEditor.rowIdx, scheduleEditor.blockId, {
        startDate: scheduleDraft.startDate,
        endDate: scheduleDraft.endDate,
        sessionStartTime: scheduleDraft.sessionStartTime,
        sessionEndTime: scheduleDraft.sessionEndTime,
        sessionWeekDay: scheduleDraft.sessionWeekDay,
        tutorProfileId: scheduleDraft.tutorProfileId,
        tutorName: selectedTutor?.name || scheduleDraft.tutorName,
        coachName: scheduleDraft.coachName,
      });
      if (saved) {
        setScheduleEditor(null);
      }
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : 'Session schedule could not be saved.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const coverageTutorName = (profileId?: string) => tutorProfiles.find(profile => profile.id === profileId)?.name || '';
  const coverageCoachName = (profileId?: string) => coachProfiles.find(profile => profile.id === profileId)?.name || '';
  const coverageCoachSelectValue = coverageDraft?.coverageCoachProfileId
    ? coachCandidates.find(candidate => candidate.profile?.id === coverageDraft.coverageCoachProfileId)?.key || coverageDraft.coverageCoachProfileId
    : '';

  const getCoverageConflict = (profileId: string, row: DerivedScheduleRow, session: SessionInstance): CoverageConflict | null => {
    if (!profileId) return null;

    for (const group of groups) {
      for (const cohort of group.rows) {
        for (const block of cohort.blks) {
          const sessionDates = getSessionDates(block, getActiveRowHolidays(cohort, holidays));
          const startTime = block.sessionStartTime || '09:00';
          const endTime = block.sessionEndTime || '11:00';
          if (!timeRangesOverlap(startTime, endTime, row.sessionStartTime, row.sessionEndTime)) {
            continue;
          }

          const assignedProfile = resolveTutorProfile(block, tutorProfiles);
          const assignedId = assignedProfile?.id || block.tutorProfileId || profileIdForTutorName(block.tutor || '', tutorProfiles);
          if (block.id !== row.blockId && assignedId === profileId && sessionDates.includes(session.date)) {
            return {
              role: 'Assigned tutor',
              date: session.date,
              time: formatTimeRange(startTime, endTime),
              module: getModuleMeta(block.mod).lbl,
              programme: programmeLabelFromGroupName(group.name),
              cohort: cohort.label,
              groupName: (block.groupName || cohort.label || '').trim() || undefined,
            };
          }

          const conflictingCoverage = (block.sessionCoverage || []).find(item => {
            if (block.id === row.blockId && item.sessionNumber === session.number) return false;
            const coverageDate = sessionDates[item.sessionNumber - 1];
            return item.coverageTutorProfileId === profileId && coverageDate === session.date;
          });

          if (conflictingCoverage) {
            return {
              role: 'Coverage tutor',
              date: session.date,
              time: formatTimeRange(startTime, endTime),
              module: getModuleMeta(block.mod).lbl,
              programme: programmeLabelFromGroupName(group.name),
              cohort: cohort.label,
              groupName: (block.groupName || cohort.label || '').trim() || undefined,
            };
          }
        }
      }
    }

    return null;
  };

  const coverageConflictMessage = (conflict: CoverageConflict) => (
    `This tutor already has ${conflict.role.toLowerCase()} work on ${formatDisplayDate(conflict.date)} (${conflict.time}) for ${conflict.module} - ${conflict.programme}${conflict.groupName ? ` - ${conflict.groupName}` : ''}.`
  );

  const getCoverageSuggestions = (row: DerivedScheduleRow, session: SessionInstance) => {
    const activeProfiles = tutorProfiles.filter(profile => profile.isActive && profile.id !== row.assignedTutorProfileId);
    return activeProfiles.map(profile => {
      let sameModuleSessions = 0;
      let sameProgrammeSessions = 0;
      let totalAssignedSessions = 0;

      groups.forEach(group => group.rows.forEach(cohort => cohort.blks.forEach(block => {
        const assignedProfile = resolveTutorProfile(block, tutorProfiles);
        const assignedId = assignedProfile?.id || block.tutorProfileId || profileIdForTutorName(block.tutor || '', tutorProfiles);
        if (assignedId !== profile.id) return;
        const sessions = Math.max(1, Number(block.sessions) || 1);
        totalAssignedSessions += sessions;
        if (getModuleMeta(block.mod).lbl === row.module) {
          sameModuleSessions += sessions;
        }
        if (programmeLabelFromGroupName(group.name) === row.programme) {
          sameProgrammeSessions += sessions;
        }
      })));

      const conflict = getCoverageConflict(profile.id, row, session);
      const hasConflict = Boolean(conflict);
      const score = (hasConflict ? -1000 : 0) + (sameModuleSessions * 6) + (sameProgrammeSessions * 3) + Math.min(totalAssignedSessions, 80) / 10;
      const reasons = [
        sameModuleSessions ? `${sameModuleSessions} session${sameModuleSessions === 1 ? '' : 's'} in this module` : '',
        sameProgrammeSessions ? `${sameProgrammeSessions} session${sameProgrammeSessions === 1 ? '' : 's'} in this programme` : '',
        totalAssignedSessions ? `${totalAssignedSessions} total assigned sessions` : 'No assigned sessions yet',
      ].filter(Boolean);

      return { profile, hasConflict, conflict, score, sameModuleSessions, sameProgrammeSessions, totalAssignedSessions, reasons };
    }).sort((a, b) => b.score - a.score || a.profile.name.localeCompare(b.profile.name));
  };

  const coverageSuggestions = coverageEditor ? getCoverageSuggestions(coverageEditor.row, coverageEditor.session).slice(0, 8) : [];
  const coverageTutorOptions = coverageEditor
    ? tutorOptions
      .filter(option => option.value !== coverageEditor.row.assignedTutorProfileId)
      .map(option => {
        const conflict = getCoverageConflict(option.value, coverageEditor.row, coverageEditor.session);
        return {
          ...option,
          description: conflict ? `Conflict: ${conflict.module} - ${conflict.time}` : option.description,
          color: conflict ? '#DC2626' : option.color,
        };
      })
    : [];

  const getCoachCoverageSuggestions = (row: DerivedScheduleRow): CoachCoverageSuggestion[] => {
    return coachCandidates.map(candidate => {
      let sameModuleSessions = 0;
      let sameProgrammeSessions = 0;
      let trainingPlanSessions = 0;

      groups.forEach(group => group.rows.forEach(cohort => cohort.blks.forEach(block => {
        if (normalizeTutorName(block.coachName || '') !== candidate.normalizedName) return;
        const sessions = Math.max(1, Number(block.sessions) || 1);
        trainingPlanSessions += sessions;
        if (getModuleMeta(block.mod).lbl === row.module) {
          sameModuleSessions += sessions;
        }
        if (programmeLabelFromGroupName(group.name) === row.programme) {
          sameProgrammeSessions += sessions;
        }
      })));

      const totalAssignedSessions = trainingPlanSessions || candidate.sessionCount || 0;
      const score = (sameModuleSessions * 6) + (sameProgrammeSessions * 3) + Math.min(totalAssignedSessions, 80) / 10;
      const reasons = [
        sameModuleSessions ? `${sameModuleSessions} session${sameModuleSessions === 1 ? '' : 's'} in this module` : '',
        sameProgrammeSessions ? `${sameProgrammeSessions} session${sameProgrammeSessions === 1 ? '' : 's'} in this programme` : '',
        totalAssignedSessions ? `${totalAssignedSessions} total assigned sessions` : 'No assigned sessions yet',
      ].filter(Boolean);

      return { candidate, score, sameModuleSessions, sameProgrammeSessions, totalAssignedSessions, reasons };
    }).sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name));
  };

  const coachCoverageSuggestions = coverageEditor ? getCoachCoverageSuggestions(coverageEditor.row).slice(0, 8) : [];

  const saveCoverageDraft = async () => {
    if (!coverageEditor || !coverageDraft || !onUpdateSessionCoverage) return;
    const tutorUnavailable = Boolean(coverageDraft.tutorUnavailable);
    const coverageTutorProfileId = tutorUnavailable ? coverageDraft.coverageTutorProfileId || '' : '';
    const coverageCoachProfileId = tutorUnavailable ? coverageDraft.coverageCoachProfileId || '' : '';
    if (coverageTutorProfileId && coverageTutorProfileId === coverageDraft.assignedTutorProfileId) {
      setCoverageError('Coverage tutor cannot be the same as assigned tutor.');
      return;
    }
    if (coverageTutorProfileId) {
      const conflict = getCoverageConflict(coverageTutorProfileId, coverageEditor.row, coverageEditor.session);
      if (conflict) {
        setCoverageError(coverageConflictMessage(conflict));
        return;
      }
    }
    if ((coverageTutorProfileId || coverageCoachProfileId) && !coverageDraft.coverageReason?.trim()) {
      setCoverageError('Coverage reason is required when coverage is selected.');
      return;
    }
    const normalized: SessionCoverage = {
      ...coverageDraft,
      coverageTutorProfileId,
      coverageCoachProfileId,
      coverageStatus: coverageTutorProfileId || coverageCoachProfileId ? 'covered' : tutorUnavailable ? 'required' : 'none',
      tutorUnavailable,
      tutorUnavailableReason: tutorUnavailable ? coverageDraft.tutorUnavailableReason?.trim() || '' : '',
      tutorUnavailableNotes: tutorUnavailable ? coverageDraft.tutorUnavailableNotes?.trim() || '' : '',
      coverageReason: coverageTutorProfileId || coverageCoachProfileId ? coverageDraft.coverageReason?.trim() || '' : '',
      coverageNotes: coverageTutorProfileId || coverageCoachProfileId ? coverageDraft.coverageNotes?.trim() || '' : '',
    };
    setCoverageSaving(true);
    try {
      const saved = await onUpdateSessionCoverage(coverageEditor.row.groupIdx, coverageEditor.row.rowIdx, coverageEditor.row.blockId, normalized);
      if (saved) {
        setCoverageEditor(null);
        setCoverageDraft(null);
      }
    } finally {
      setCoverageSaving(false);
    }
  };

  const createCoverageTutor = async () => {
    if (!onCreateTutorProfile || !createTutorName.trim()) return;
    if (!coverageDraft?.tutorUnavailable) {
      setCoverageError('Mark the assigned tutor as unavailable before assigning coverage.');
      return;
    }
    const result = await onCreateTutorProfile({ name: createTutorName.trim() });
    const profile = 'id' in result ? result : result.possibleExistingProfile || result.existingProfile;
    if (profile) {
      if (coverageEditor) {
        const conflict = getCoverageConflict(profile.id, coverageEditor.row, coverageEditor.session);
        if (conflict) {
          setCoverageError(coverageConflictMessage(conflict));
          return;
        }
      }
      setCoverageDraft(prev => prev ? { ...prev, coverageTutorProfileId: profile.id } : prev);
      setCreateTutorName('');
    }
  };

  const createCoverageCoach = async () => {
    if (!onCreateCoachProfile || !createCoachName.trim()) return;
    if (!coverageDraft?.tutorUnavailable) {
      setCoverageError('Mark the assigned tutor as unavailable before assigning coverage.');
      return;
    }
    const result = await onCreateCoachProfile({ name: createCoachName.trim() });
    const profile = 'id' in result ? result : result.possibleExistingProfile || result.existingProfile;
    if (profile) {
      setCoverageDraft(prev => prev ? { ...prev, coverageCoachProfileId: profile.id } : prev);
      setCreateCoachName('');
    }
  };

  const selectCoverageCoach = async (candidateKey: string, reasons?: string[]) => {
    if (!coverageDraft?.tutorUnavailable) {
      setCoverageError('Mark the assigned tutor as unavailable before assigning coverage.');
      return;
    }

    const candidate = coachCandidates.find(item => item.key === candidateKey);
    if (!candidate) {
      setCoverageDraft(prev => prev ? { ...prev, coverageCoachProfileId: candidateKey } : prev);
      setCoverageError('');
      return;
    }

    let profile = candidate.profile;
    if (!profile) {
      if (!onCreateCoachProfile) {
        setCoverageError('Create a Coach Profile before assigning this coach for coverage.');
        return;
      }
      const result = await onCreateCoachProfile({ name: candidate.name });
      const savedProfile = 'id' in result ? result : result.possibleExistingProfile || result.existingProfile;
      if (!savedProfile) {
        setCoverageError('Coach Profile could not be created.');
        return;
      }
      profile = savedProfile;
    }

    setCoverageDraft(prev => prev ? {
      ...prev,
      coverageCoachProfileId: profile.id,
      coverageReason: prev.coverageReason || (
        reasons?.length
          ? `Suggested from Training Plan coach experience: ${reasons.join(', ')}`
          : `Suggested coverage coach: ${profile.name}`
      ),
    } : prev);
    setCoverageError('');
  };

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
          ? `<strong>${escapeHtml(info.name)}</strong>${info.groupName ? ` in <strong>${escapeHtml(info.groupName)}</strong>` : ''} is a saved next module, but it does not have a tutor assigned yet.`
          : 'No scheduled next module block yet',
        icon: 'info',
        confirmButtonText: 'OK',
      });
      return;
    }

    if (info.otherTutorSessions.length === 0) {
      void kbcSwal.fire({
        title: 'No time conflicts found',
        html: `<strong>${escapeHtml(info.tutor)}</strong> has no saved sessions at the same time as <strong>${escapeHtml(info.name)}</strong>${info.groupName ? ` in <strong>${escapeHtml(info.groupName)}</strong>` : ''} sessions (${escapeHtml(formatDisplayDate(info.startDate))} - ${escapeHtml(formatDisplayDate(info.endDate))}).`,
        icon: 'success',
        confirmButtonText: 'OK',
      });
      return;
    }

    const visible = info.otherTutorSessions.slice(0, 40);
    const nextGroupLabel = info.groupName || info.cohort || '';
    const rowsHtml = visible.map(item => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#1B2A4A;">${escapeHtml(formatDisplayDate(item.date))}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(item.conflictTime || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(nextGroupLabel)}</td>
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
            <strong>${escapeHtml(info.tutor)}</strong> has <strong>${info.otherTutorSessions.length}</strong> saved session${info.otherTutorSessions.length === 1 ? '' : 's'} at the same time as the next module <strong>${escapeHtml(info.name)}</strong>${nextGroupLabel ? ` in <strong>${escapeHtml(nextGroupLabel)}</strong>` : ''}.
          </p>
          <div style="margin:0 0 14px;border:1px solid #E5E7EB;border-radius:12px;background:#FFFFFF;padding:12px;">
            <div style="font-size:11px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:.04em;">Next module being checked</div>
            <div style="margin-top:4px;font-weight:800;color:#1F2937;font-size:14px;">${escapeHtml(info.name || 'Next module')}</div>
            <div style="margin-top:4px;color:#64748B;font-size:12px;">${escapeHtml(info.programme || '')}${nextGroupLabel ? ` - ${escapeHtml(nextGroupLabel)}` : ''}</div>
            <div style="margin-top:4px;color:#334155;font-size:12px;">${escapeHtml(formatDisplayDate(info.startDate))} - ${escapeHtml(formatDisplayDate(info.endDate))}</div>
            <div style="margin-top:4px;color:#64748B;font-size:12px;">Tutor: ${escapeHtml(info.tutor)} - Coach: ${escapeHtml(info.coach)}</div>
          </div>
          ${currentModulesHtml}
          <div style="max-height:58vh;overflow:auto;border:1px solid #E5E7EB;border-radius:12px;">
            <table style="width:100%;min-width:1080px;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#F9FAFB;color:#4B5563;">
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Date</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Next module time</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Next group</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Conflicting time</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Module</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Programme</th>
                  <th style="padding:10px;text-align:left;position:sticky;top:0;background:#F9FAFB;">Conflicting group</th>
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
    <div className="bg-white rounded-xl overflow-hidden border border-gray-300">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 sm:px-5" style={{ background: '#F9FAFB' }}>
        <div>
          <h3 className="font-extrabold text-kbc-navy text-sm tracking-wide">Session Schedule Table</h3>
          <p className="text-xs text-gray-400 mt-0.5">{rows.length} current module{rows.length !== 1 ? 's' : ''} running today</p>
        </div>
      </div>

      {/* Today's sessions container */}
      <div className="px-3 py-4 border-b bg-white sm:px-5">
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
                className={`flex flex-col gap-2 px-3 py-2 rounded cursor-pointer transition-colors sm:flex-row sm:items-center sm:justify-between ${isFinishedRow(s) ? 'bg-emerald-50 ring-1 ring-emerald-100 hover:bg-emerald-100' : 'bg-gray-50 hover:bg-amber-50'}`}
              >
                <div className="min-w-0">
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
                <div className="text-left sm:text-right">
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

      <div ref={scrollRef} className="max-h-[calc(100vh-210px)] overflow-auto" onScroll={handleTableScroll}>
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
                        {(row.currentKsbMapping.knowledgeCodes.length > 0 || row.currentKsbMapping.skillCodes.length > 0 || row.currentKsbMapping.behaviourCodes.length > 0) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.currentKsbMapping.knowledgeCodes.map(code => <span key={`k-${code}`} className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-700">{code}</span>)}
                            {row.currentKsbMapping.skillCodes.map(code => <span key={`s-${code}`} className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-extrabold text-violet-700">{code}</span>)}
                            {row.currentKsbMapping.behaviourCodes.map(code => <span key={`b-${code}`} className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-700">{code}</span>)}
                          </div>
                        )}
                        {row.notes && <p className="mt-1 line-clamp-2 text-[11px] font-medium text-gray-500">{row.notes}</p>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(!isFinishedRow(row) || row.currentCoverage?.tutorUnavailable || row.currentCoverage?.coverageStatus === 'required' || row.currentCoverage?.coverageTutorProfileId) && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">Primary Tutor</span>
                          )}
                          {row.currentCoverage?.tutorUnavailable && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700">Unavailable</span>}
                          {row.currentCoverage?.coverageStatus === 'required' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">Coverage Required</span>}
                          {row.currentCoverage?.coverageTutorProfileId && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Covered By Tutor {coverageTutorName(row.currentCoverage.coverageTutorProfileId)}</span>}
                          {row.currentCoverage?.coverageCoachProfileId && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-extrabold text-cyan-700">Covered By Coach {coverageCoachName(row.currentCoverage.coverageCoachProfileId)}</span>}
                        </div>
                        {canEdit && onUpdateSessionCoverage && !isFinishedRow(row) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {onUpdateSessionSchedule && (
                              <button
                                type="button"
                                aria-disabled={!row.trainingPlanId}
                                title={row.trainingPlanId ? 'Edit schedule for this saved session row' : 'Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID.'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openScheduleEditor(row);
                                }}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${row.trainingPlanId ? 'bg-white text-kbc-navy ring-1 ring-kbc-navy/20 hover:bg-kbc-navy/5' : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'}`}
                              >
                                Edit Schedule
                              </button>
                            )}
                            <button
                              type="button"
                              aria-disabled={!row.trainingPlanId}
                              title={row.trainingPlanId ? 'Manage tutor coverage for this saved session row' : 'Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID.'}
                              onClick={(event) => {
                                event.stopPropagation();
                                openCoverageEditor(row, row.sessionInstances.find(session => session.number === row.currentSessionNumber) || row.sessionInstances[0]);
                              }}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${row.trainingPlanId ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'}`}
                            >
                              Manage Coverage
                            </button>
                            {onUpdateSessionKsb && (
                              <button
                                type="button"
                                aria-disabled={!row.trainingPlanId}
                                title={row.trainingPlanId ? 'Edit KSB Mapping for this session' : 'Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID.'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openKsbEditor(row);
                                }}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${row.trainingPlanId ? 'bg-white text-kbc-navy ring-1 ring-kbc-navy/20 hover:bg-kbc-navy/5' : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'}`}
                              >
                                Edit KSB
                              </button>
                            )}
                            {onUpdateSessionNotes && (
                              <button
                                type="button"
                                aria-disabled={!row.trainingPlanId}
                                title={row.trainingPlanId ? 'Edit notes for this session' : 'Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID.'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openNotesEditor(row);
                                }}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${row.trainingPlanId ? 'bg-white text-kbc-navy ring-1 ring-kbc-navy/20 hover:bg-kbc-navy/5' : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'}`}
                              >
                                Edit Notes
                              </button>
                            )}
                          </div>
                        )}
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
                          {row.nextModuleInfo?.isScheduledBlock ? (
                            <>
                              <span className="block text-xs font-bold text-gray-600 leading-snug break-words">{row.nextModuleInfo.name || row.nextModule}</span>
                              {row.nextModuleInfo.tutor ? (
                                <span className="mt-1 block text-[11px] text-gray-400">Tutor: {row.nextModuleInfo.tutor}</span>
                              ) : (
                                <span className="mt-1 block text-[11px] font-semibold text-amber-700">Tutor not assigned</span>
                              )}
                            </>
                          ) : (
                            <span className="block text-[11px] font-semibold text-gray-400">No scheduled next module block yet</span>
                          )}
                        </div>
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
                      <p className="mt-1 text-sm font-extrabold text-gray-800">
                        {selectedRow.nextModuleInfo.isScheduledBlock ? selectedRow.nextModuleInfo.name : 'No scheduled next module block yet'}
                      </p>
                    </div>
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
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(session.status !== 'completed' || session.coverage?.tutorUnavailable || session.coverage?.coverageStatus === 'required' || session.coverage?.coverageTutorProfileId) && (
                                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-extrabold">Primary Tutor</span>
                                )}
                                {session.coverage?.tutorUnavailable && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700">Unavailable</span>}
                                {session.coverage?.coverageStatus === 'required' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">Coverage Required</span>}
                                {session.coverage?.coverageTutorProfileId && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Covered By Tutor {coverageTutorName(session.coverage.coverageTutorProfileId)}</span>}
                                {session.coverage?.coverageCoachProfileId && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-extrabold text-cyan-700">Covered By Coach {coverageCoachName(session.coverage.coverageCoachProfileId)}</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold capitalize">
                                {session.status}
                              </span>
                              {canEdit && onUpdateSessionCoverage && session.status !== 'completed' && (
                                <button
                                  type="button"
                                  aria-disabled={!selectedRow.trainingPlanId}
                                  title={selectedRow.trainingPlanId ? 'Manage tutor coverage for this saved session row' : 'Partial save unavailable for this session. Use the full editor until this row has a stable Training Plan ID.'}
                                  onClick={() => openCoverageEditor(selectedRow, session)}
                                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${selectedRow.trainingPlanId ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'}`}
                                >
                                  Coverage
                                </button>
                              )}
                            </div>
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

      {coverageEditor && coverageDraft && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[4px]" onClick={() => setCoverageEditor(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div>
                <p className="text-xs font-semibold text-white/60">{coverageEditor.row.module} - Session {coverageEditor.session.number}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">Tutor Coverage</h3>
                <p className="mt-1 text-xs text-white/70">{formatDisplayDate(coverageEditor.session.date)} - Assigned to {coverageEditor.row.assignedTutorName}</p>
              </div>
              <button onClick={() => setCoverageEditor(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50 p-5">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={coverageDraft.tutorUnavailable}
                  onChange={event => {
                    const checked = event.target.checked;
                    setCoverageDraft(prev => prev ? {
                      ...prev,
                      tutorUnavailable: checked,
                      tutorUnavailableReason: checked ? prev.tutorUnavailableReason : '',
                      coverageTutorProfileId: checked ? prev.coverageTutorProfileId : '',
                      coverageCoachProfileId: checked ? prev.coverageCoachProfileId : '',
                      coverageReason: checked ? prev.coverageReason : '',
                      coverageNotes: checked ? prev.coverageNotes : '',
                    } : prev);
                    setCoverageError('');
                  }}
                />
                Assigned tutor unavailable
              </label>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Unavailable Reason</label>
                <input
                  value={coverageDraft.tutorUnavailableReason || ''}
                  onChange={event => setCoverageDraft(prev => prev ? { ...prev, tutorUnavailableReason: event.target.value } : prev)}
                  disabled={!coverageDraft.tutorUnavailable}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                  placeholder="e.g. sickness, annual leave"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Coverage Tutor</label>
                {!coverageDraft.tutorUnavailable && (
                  <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                    Mark the assigned tutor as unavailable before assigning coverage.
                  </div>
                )}
                <div className="mb-3 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500">Suggested Coverage Doctors</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                      {coverageSuggestions.filter(item => !item.hasConflict).length} available
                    </span>
                  </div>
                  <div className="grid max-h-64 gap-2 overflow-y-auto p-2">
                    {coverageSuggestions.map(suggestion => {
                      const selected = coverageDraft.coverageTutorProfileId === suggestion.profile.id;
                      return (
                        <button
                          key={suggestion.profile.id}
                          type="button"
                          disabled={!coverageDraft.tutorUnavailable || suggestion.hasConflict}
                          onClick={() => {
                            if (!coverageDraft.tutorUnavailable) {
                              setCoverageError('Mark the assigned tutor as unavailable before assigning coverage.');
                              return;
                            }
                            if (suggestion.conflict) {
                              setCoverageError(coverageConflictMessage(suggestion.conflict));
                              return;
                            }
                            setCoverageDraft(prev => prev ? {
                              ...prev,
                              coverageTutorProfileId: suggestion.profile.id,
                              coverageReason: prev.coverageReason || `Suggested from Training Plan experience: ${suggestion.reasons.join(', ')}`,
                            } : prev);
                            setCoverageError('');
                          }}
                          className="rounded-lg border px-3 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                          style={{
                            borderColor: selected ? '#1B2A4A' : suggestion.hasConflict ? '#FCA5A5' : '#E5E7EB',
                            background: selected ? '#F8FAFC' : '#FFFFFF',
                          }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-gray-800">{suggestion.profile.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${suggestion.hasConflict ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {suggestion.hasConflict ? 'Conflict' : 'Available'}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {suggestion.sameModuleSessions > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Same module</span>}
                            {suggestion.sameProgrammeSessions > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Same programme</span>}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{suggestion.totalAssignedSessions} sessions</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">{suggestion.reasons.join(' - ')}</p>
                          {suggestion.conflict && (
                            <p className="mt-1 text-xs font-bold text-red-600">{coverageConflictMessage(suggestion.conflict)}</p>
                          )}
                        </button>
                      );
                    })}
                    {coverageSuggestions.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs font-semibold text-gray-400">
                        No Tutor Profiles available for coverage suggestions.
                      </div>
                    )}
                  </div>
                </div>
                <SelectField
                  value={coverageDraft.coverageTutorProfileId || ''}
                  options={coverageDraft.tutorUnavailable ? coverageTutorOptions : []}
                  onChange={value => {
                    if (!coverageDraft.tutorUnavailable) {
                      setCoverageError('Mark the assigned tutor as unavailable before assigning coverage.');
                      return;
                    }
                    const conflict = getCoverageConflict(value, coverageEditor.row, coverageEditor.session);
                    if (conflict) {
                      setCoverageError(coverageConflictMessage(conflict));
                      return;
                    }
                    setCoverageDraft(prev => prev ? { ...prev, coverageTutorProfileId: value } : prev);
                    setCoverageError('');
                  }}
                  placeholder="Select coverage tutor"
                  label="Tutor Profiles"
                  searchPlaceholder="Search tutors..."
                  emptyTitle="No tutors found"
                  emptyText="Create a Tutor Profile first."
                />
                {onCreateTutorProfile && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={createTutorName}
                      onChange={event => setCreateTutorName(event.target.value)}
                      placeholder="New tutor name"
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                    />
                    <button type="button" onClick={() => void createCoverageTutor()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-kbc-navy">
                      Create
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Coverage Coach</label>
                <div className="mb-3 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500">Suggested Coverage Coaches</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                      {coachCoverageSuggestions.length} coaches
                    </span>
                  </div>
                  <div className="grid max-h-48 gap-2 overflow-y-auto p-2">
                    {coachCoverageSuggestions.map(suggestion => {
                      const candidate = suggestion.candidate;
                      const selected = coverageDraft.coverageCoachProfileId === candidate.profile?.id || coverageDraft.coverageCoachProfileId === candidate.key;
                      const sourceLabel = candidate.source === 'both' ? 'Training Plan + Profile' : candidate.source === 'profile' ? 'Coach Profile' : 'Training Plan';
                      const sourceClassName = candidate.source === 'both'
                        ? 'bg-cyan-100 text-cyan-700'
                        : candidate.source === 'profile'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-amber-100 text-amber-700';
                      return (
                        <button
                          key={candidate.key}
                          type="button"
                          disabled={!coverageDraft.tutorUnavailable}
                          onClick={() => void selectCoverageCoach(candidate.key, suggestion.reasons)}
                          className="rounded-lg border px-3 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                          style={{ borderColor: selected ? '#1B2A4A' : '#E5E7EB', background: selected ? '#F8FAFC' : '#FFFFFF' }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-gray-800">{candidate.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${sourceClassName}`}>
                              {sourceLabel}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {suggestion.sameModuleSessions > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Same module</span>}
                            {suggestion.sameProgrammeSessions > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Same programme</span>}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{suggestion.totalAssignedSessions} sessions</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {suggestion.reasons.join(' - ')}{candidate.email ? ` - ${candidate.email}` : ''}
                          </p>
                        </button>
                      );
                    })}
                    {coachCoverageSuggestions.length === 0 && (
                      <div className="px-3 py-4 text-center text-xs font-semibold text-gray-400">
                        No Training Plan coaches or Coach Profiles available for coverage suggestions.
                      </div>
                    )}
                  </div>
                </div>
                <SelectField
                  value={coverageCoachSelectValue}
                  options={coverageDraft.tutorUnavailable ? coachOptions : []}
                  onChange={value => void selectCoverageCoach(value)}
                  placeholder="Select coverage coach"
                  label="Coach Profiles"
                  searchPlaceholder="Search coaches..."
                  emptyTitle="No coaches found"
                  emptyText="Add coach names in the Training Plan or create Coach Profiles first."
                />
                {onCreateCoachProfile && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={createCoachName}
                      onChange={event => setCreateCoachName(event.target.value)}
                      placeholder="New coach name"
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                    />
                    <button type="button" onClick={() => void createCoverageCoach()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-kbc-navy">
                      Create
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Coverage Reason</label>
                <input
                  value={coverageDraft.coverageReason || ''}
                  onChange={event => setCoverageDraft(prev => prev ? { ...prev, coverageReason: event.target.value } : prev)}
                  disabled={!coverageDraft.tutorUnavailable || (!coverageDraft.coverageTutorProfileId && !coverageDraft.coverageCoachProfileId)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                  placeholder="Required when coverage tutor or coach is selected"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Notes</label>
                <textarea
                  rows={3}
                  value={coverageDraft.coverageNotes || ''}
                  onChange={event => setCoverageDraft(prev => prev ? { ...prev, coverageNotes: event.target.value } : prev)}
                  disabled={!coverageDraft.tutorUnavailable || (!coverageDraft.coverageTutorProfileId && !coverageDraft.coverageCoachProfileId)}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              {coverageDraft.tutorUnavailable && !coverageDraft.coverageTutorProfileId && !coverageDraft.coverageCoachProfileId && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Coverage Required</div>
              )}
              {coverageError && <p className="text-xs font-bold text-red-600">{coverageError}</p>}
            </div>
            <div className="shrink-0 flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button onClick={() => setCoverageEditor(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button disabled={coverageSaving} onClick={() => void saveCoverageDraft()} className="rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                Save Coverage
              </button>
            </div>
          </div>
        </div>
      )}
      {ksbEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[3px]" onClick={() => setKsbEditor(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div>
                <p className="text-xs font-semibold text-white/60">{ksbEditor.module} - Session {ksbEditor.currentSessionNumber}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">Edit KSB Mapping</h3>
                <p className="mt-1 text-xs text-white/70">{formatDisplayDate(ksbEditor.sessionDate)}</p>
              </div>
              <button onClick={() => setKsbEditor(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="space-y-4 bg-gray-50 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">KSB Profile</label>
                <select
                  value={ksbProfileId}
                  onChange={event => {
                    setKsbProfileId(event.target.value);
                    setKsbError('');
                  }}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-extrabold text-gray-700 focus:outline-none"
                >
                  <option value="">Select profile first</option>
                  {activeKsbProfiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}{profile.programmeName ? ` - ${profile.programmeName}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {([
                ['Knowledge', 'knowledgeCodes', 'K1, K3', 'K'],
                ['Skills', 'skillCodes', 'S2, S5', 'S'],
                ['Behaviours', 'behaviourCodes', 'B1, B4', 'B'],
              ] as const).map(([label, field, placeholder, prefix]) => (
                <KsbDraftInput
                  key={field}
                  label={label}
                  placeholder={placeholder}
                  prefix={prefix}
                  value={ksbDraftText[field]}
                  disabled={!selectedKsbProfile}
                  descriptions={ksbCodeDescriptions}
                  suggestions={ksbProfileCodes[prefix]}
                  onChange={value => {
                    setKsbDraftText(prev => ({ ...prev, [field]: value }));
                    setKsbError('');
                  }}
                />
              ))}
              {ksbError && <p className="text-xs font-bold text-red-600">{ksbError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button onClick={() => setKsbEditor(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button disabled={ksbSaving} onClick={() => void saveKsbDraft()} className="rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {ksbSaving ? 'Saving...' : 'Save KSB'}
              </button>
            </div>
          </div>
        </div>
      )}
      {notesEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[3px]" onClick={() => setNotesEditor(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div>
                <p className="text-xs font-semibold text-white/60">{notesEditor.module} - Session {notesEditor.currentSessionNumber}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">Edit Notes</h3>
                <p className="mt-1 text-xs text-white/70">{formatDisplayDate(notesEditor.sessionDate)}</p>
              </div>
              <button onClick={() => setNotesEditor(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="space-y-4 bg-gray-50 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Notes</label>
                <textarea
                  rows={7}
                  value={notesDraft}
                  onChange={event => {
                    setNotesDraft(event.target.value);
                    setNotesError('');
                  }}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none"
                />
              </div>
              {notesError && <p className="text-xs font-bold text-red-600">{notesError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button onClick={() => setNotesEditor(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button disabled={notesSaving} onClick={() => void saveNotesDraft()} className="rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {notesSaving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {scheduleEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[3px]" onClick={() => setScheduleEditor(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div>
                <p className="text-xs font-semibold text-white/60">{scheduleEditor.module} - Session {scheduleEditor.currentSessionNumber}</p>
                <h3 className="mt-1 text-base font-extrabold text-white">Edit Schedule</h3>
                <p className="mt-1 text-xs text-white/70">{formatDisplayDate(scheduleEditor.sessionDate)}</p>
              </div>
              <button onClick={() => setScheduleEditor(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="space-y-4 bg-gray-50 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Start date</label>
                  <input
                    type="date"
                    value={scheduleDraft.startDate}
                    onChange={event => setScheduleDraft(prev => ({ ...prev, startDate: event.target.value, sessionWeekDay: inferDayFromIsoDate(event.target.value) }))}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">End date</label>
                  <input
                    type="date"
                    value={scheduleDraft.endDate}
                    onChange={event => setScheduleDraft(prev => ({ ...prev, endDate: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Start time</label>
                  <input
                    type="time"
                    value={scheduleDraft.sessionStartTime}
                    onChange={event => setScheduleDraft(prev => ({ ...prev, sessionStartTime: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">End time</label>
                  <input
                    type="time"
                    value={scheduleDraft.sessionEndTime}
                    onChange={event => setScheduleDraft(prev => ({ ...prev, sessionEndTime: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Weekday</label>
                  <select
                    value={scheduleDraft.sessionWeekDay}
                    onChange={event => setScheduleDraft(prev => ({ ...prev, sessionWeekDay: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 focus:outline-none"
                  >
                    {DAY_COLS.map(day => <option key={day.key} value={day.key}>{day.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Coach</label>
                  <input
                    type="text"
                    value={scheduleDraft.coachName}
                    onChange={event => setScheduleDraft(prev => ({ ...prev, coachName: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Tutor</label>
                <SelectField
                  value={scheduleDraft.tutorProfileId}
                  options={tutorOptions}
                  placeholder="Select tutor"
                  accentColor="#1B2A4A"
                  label="Tutor Profiles"
                  searchPlaceholder="Search tutors..."
                  emptyTitle="No matching tutors"
                  emptyText="Create or activate a tutor profile first."
                  onChange={value => {
                    const selected = tutorProfiles.find(profile => profile.id === value);
                    setScheduleDraft(prev => ({ ...prev, tutorProfileId: value, tutorName: selected?.name || prev.tutorName }));
                  }}
                />
              </div>
              {scheduleError && <p className="text-xs font-bold text-red-600">{scheduleError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button onClick={() => setScheduleEditor(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button disabled={scheduleSaving} onClick={() => void saveScheduleDraft()} className="rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {scheduleSaving ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
