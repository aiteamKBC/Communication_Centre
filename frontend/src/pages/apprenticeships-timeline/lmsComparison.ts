import { getModuleMeta, MS } from './data';
import { buildHolidayAdjustedSessionPlan } from './utils';
import { tutorDisplayName } from './tutorProfiles';
import type { LmsReferenceRow } from './lmsReference';
import type { CohortRow, CustomModule, Holiday, ModuleBlock, ProgrammeGroup, TutorProfile } from './types';

const displayedLmsProgrammes = [
  { sourceName: 'marketing executive level 4', planId: 'me-lvl4', shortName: 'ME L4' },
  { sourceName: 'marketing manager level 6', planId: 'mm-lvl6', shortName: 'MM LVL6' },
  { sourceName: 'associate project manager level 4', planId: 'apm', shortName: 'APM lv4' },
  { sourceName: 'project controls professional level 6', planId: 'pcp', shortName: 'PCP' },
  { sourceName: 'mba', planId: 'mba', shortName: 'MBA' },
];
const normalize = (value: string | null) => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export interface PresentedLmsRow extends LmsReferenceRow {
  planProgrammeId: string;
  matchedPlanCohort?: { id: string; name: string };
  matchedPlanGroup?: { id?: string; name: string };
}

export const lmsCohortDisplayName = (record: PresentedLmsRow) => (
  record.cohortName?.trim() || record.matchedPlanCohort?.name || ''
);

export const lmsGroupDisplayName = (record: PresentedLmsRow) => (
  record.groupName?.trim() || record.matchedPlanGroup?.name || ''
);

export function comparisonModuleName(block: ProgrammeGroup['rows'][number]['blks'][number], customModules: CustomModule[]): string {
  return block.mod in MS ? getModuleMeta(block.mod).lbl
    : customModules.find(item => item.id === block.mod || item.name === block.mod)?.name ?? getModuleMeta(block.mod).lbl;
}

export function presentLmsRows(records: LmsReferenceRow[], currentProgrammes: ProgrammeGroup[], customModules: CustomModule[] = []): PresentedLmsRow[] {
  const presentation = displayedLmsProgrammes.map((programme, fallbackOrder) => {
    const currentOrder = currentProgrammes.findIndex(group => (
      group.id === programme.planId
      || normalize(group.name) === normalize(programme.shortName)
      || normalize(group.name) === programme.sourceName
    ));
    return {
      ...programme,
      planProgrammeId: currentProgrammes[currentOrder]?.id ?? programme.planId,
      name: currentProgrammes[currentOrder]?.name ?? programme.shortName,
      order: currentOrder < 0 ? currentProgrammes.length + fallbackOrder : currentOrder,
    };
  }).sort((left, right) => left.order - right.order);
  // Presentation copies preserve the captured source names and identifiers.
  const presented = presentation.flatMap(programme => records
    .filter(row => normalize(row.programme) === programme.sourceName)
    .sort((left, right) => (
      (isComparisonDate(right.startDate) ? right.startDate! : '')
        .localeCompare(isComparisonDate(left.startDate) ? left.startDate! : '')
      || left.sourceModuleId.localeCompare(right.sourceModuleId)
    ))
    .map(row => ({ ...row, programme: programme.name, planProgrammeId: programme.planProgrammeId })));
  // Display labels use the same confirmed pairs as comparison. Keep the source
  // names and IDs intact rather than inventing candidate source identities.
  const confirmed = new Map(matchLmsPlans(currentProgrammes, presented, customModules).matched
    .map(({ current, lms }) => [lms.sourceModuleId, current]));
  return presented.map(record => {
    const current = confirmed.get(record.sourceModuleId);
    if (!current) return record;
    return { ...record,
      ...(!normalize(record.cohortName ?? null)
        ? { matchedPlanCohort: { id: current.cohort.id, name: current.cohort.label } } : {}),
      ...(!normalize(record.groupName ?? null) && current.block.groupName?.trim()
        ? { matchedPlanGroup: { id: current.block.groupId, name: current.block.groupName.trim() } } : {}),
    };
  });
}

export const differenceLabels = {
  dates: 'Dates differ',
  tutor: 'Tutor differs',
  datesAndTutor: 'Dates and tutor differ',
  incomplete: 'Missing or invalid dates',
} as const;
export type DifferenceKind = keyof typeof differenceLabels;
export interface PlanDifference {
  id: string;
  programmeId: string;
  programme: string;
  module: string;
  cohort: string;
  group: string;
  current: { startDate: string | null; endDate: string | null; baselineEndDate: string | null; tutorName: string };
  lms: PresentedLmsRow;
  tutorDiffers: boolean;
  kind: DifferenceKind | 'same';
  matchMethod: 'automatic' | 'manual';
}

export interface CurrentPlanRecord {
  programme: ProgrammeGroup;
  cohort: CohortRow;
  block: ModuleBlock;
  module: string;
}

export interface MatchReview {
  current: CurrentPlanRecord;
  candidates: PresentedLmsRow[];
  reason: string;
}

export function isComparisonDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const validRange = (row: { startDate: string | null; endDate: string | null }) => (
  isComparisonDate(row.startDate) && isComparisonDate(row.endDate) && row.startDate! <= row.endDate!
);

export function matchLmsPlans(groups: ProgrammeGroup[], records: PresentedLmsRow[], customModules: CustomModule[]) {
  // Only explicit group suffixes are removed from module names. A valid start
  // date is required for identity; end dates and tutors are compared afterwards.
  const groupSuffix = /\s*[-–—:(]*\s*\b(?:g|group)\s*[-:]?\s*(\d+)\s*\)?\s*$/i;
  const groupKey = (value: string | null | undefined) => {
    const name = normalize(value ?? null);
    const number = name.match(/^(?:g|group)\s*[-:]?\s*(\d+)\b/i)?.[1];
    return number ? `group:${number.replace(/^0+(?=\d)/, '')}` : name;
  };
  const moduleKey = (value: string | null) => normalize(value?.replace(groupSuffix, '') ?? null);
  const localGroupKey = (block: ProgrammeGroup['rows'][number]['blks'][number]) => (
    groupKey(block.groupName) || (block.groupId ? `local:${block.groupId}` : '')
  );
  const matchesGroup = (record: PresentedLmsRow, block: ModuleBlock) => {
    const titleGroup = record.module?.match(groupSuffix)?.[1];
    if (groupKey(record.groupName) && titleGroup && groupKey(record.groupName) !== groupKey(`G${titleGroup}`)) return false;
    const explicitGroup = groupKey(record.groupName) || (titleGroup ? groupKey(`G${titleGroup}`) : '');
    // Missing source groups are resolved only by one-to-one candidate counts.
    return !explicitGroup || explicitGroup === localGroupKey(block);
  };
  const byName = new Map<string, PresentedLmsRow[]>();
  const byModuleStart = new Map<string, PresentedLmsRow[]>();
  const manualIds = new Set(groups.flatMap(programme => programme.rows.flatMap(cohort =>
    cohort.blks.map(block => block.lmsSourceModuleId?.trim()).filter(Boolean))));
  const keyFor = (programmeId: string, cohort: string | null, module: string | null, startDate: string | null) => (
    JSON.stringify([programmeId, normalize(cohort), moduleKey(module), startDate])
  );
  for (const record of records) {
    if (manualIds.has(record.sourceModuleId) || !moduleKey(record.module) || !isComparisonDate(record.startDate)) continue;
    const moduleStartKey = keyFor(record.planProgrammeId, null, record.module, record.startDate);
    byModuleStart.set(moduleStartKey, [...(byModuleStart.get(moduleStartKey) ?? []), record]);
    if (!normalize(record.cohortName ?? null)) continue;
    const key = keyFor(record.planProgrammeId, record.cohortName ?? null, record.module, record.startDate);
    byName.set(key, [...(byName.get(key) ?? []), record]);
  }
  const entries = groups.flatMap(programme => programme.rows.flatMap(cohort => {
    return cohort.blks.map(block => {
      const module = comparisonModuleName(block, customModules);
      const manualId = block.lmsSourceModuleId?.trim();
      const validIdentity = moduleKey(module) && isComparisonDate(block.startDate);
      const strictCandidates = validIdentity && normalize(cohort.label)
        ? (byName.get(keyFor(programme.id, cohort.label, module, block.startDate)) ?? [])
          .filter(record => matchesGroup(record, block)) : [];
      const candidates = manualId
        ? records.filter(record => record.sourceModuleId === manualId && record.planProgrammeId === programme.id)
        : strictCandidates;
      const fallbackCandidates = !manualId && validIdentity
        ? (byModuleStart.get(keyFor(programme.id, null, module, block.startDate)) ?? [])
          .filter(record => matchesGroup(record, block)) : [];
      const unmatchedReason = () => {
        if (manualId) return 'The saved LMS match is unavailable or belongs to a different programme. Remove it or choose another LMS module.';
        if (!isComparisonDate(block.startDate)) return 'Current start date is missing or invalid.';
        if (!moduleKey(module)) return 'Current module name is missing.';
        const programmeRecords = records.filter(record => record.planProgrammeId === programme.id);
        if (!programmeRecords.length) return 'No LMS records for this programme.';
        const moduleRecords = programmeRecords.filter(record => moduleKey(record.module) === moduleKey(module));
        if (!moduleRecords.length) return 'No LMS record has the same module name in this programme.';
        const groupRecords = moduleRecords.filter(record => matchesGroup(record, block));
        if (!groupRecords.length) return 'LMS group differs or conflicts with the module title.';
        if (groupRecords.some(record => isComparisonDate(record.startDate) && record.startDate === block.startDate)) {
          return 'LMS records with this module name and start date are reserved by another current record. Review its cohort or manual match.';
        }
        const starts = [...new Set(groupRecords.map(record => record.startDate || 'Not provided'))].sort();
        return `Start date does not match a valid LMS start date. LMS: ${starts.join(', ')}.`;
      };
      return { programme, cohort, block, module, candidates, fallbackCandidates, unmatchedReason, manualId };
    });
  }));
  // Honour explicit cohort placements first. A fallback must not take a source
  // record already identified by a cohort or a saved manual assignment.
  const identified = new Set(entries.flatMap(entry => entry.candidates.map(record => record.sourceModuleId)));
  for (const entry of entries) {
    if (!entry.manualId && !entry.candidates.length) {
      entry.candidates = entry.fallbackCandidates.filter(record => !identified.has(record.sourceModuleId));
    }
  }
  const currentCounts = new Map<string, number>();
  for (const entry of entries) for (const record of entry.candidates) {
    currentCounts.set(record.sourceModuleId, (currentCounts.get(record.sourceModuleId) ?? 0) + 1);
  }
  const used = new Set<string>();
  const matched: { current: CurrentPlanRecord; lms: PresentedLmsRow; method: 'automatic' | 'manual' }[] = [];
  const unmatchedCurrent: (CurrentPlanRecord & { reason: string })[] = [];
  const review: MatchReview[] = [];
  for (const { programme, cohort, block, module, candidates, unmatchedReason, manualId } of entries) {
    candidates.forEach(record => used.add(record.sourceModuleId));
    const currentMatchCount = Math.max(0, ...candidates.map(record => currentCounts.get(record.sourceModuleId) ?? 0));
    const sameNameCohorts = programme.rows.filter(row => normalize(row.label) === normalize(cohort.label)).length;
    const sourceCohorts = new Set(records.filter(record => record.planProgrammeId === programme.id
      && normalize(record.cohortName ?? null) === normalize(cohort.label)).map(record => record.cohortId?.trim() || 'unknown'));
    const ambiguousCohort = !manualId && (sameNameCohorts > 1 || sourceCohorts.size > 1);
    const ambiguous = candidates.length > 1 || currentMatchCount > 1 || (candidates.length > 0 && ambiguousCohort);
    const current = { programme, cohort, block, module };
    if (!candidates.length) unmatchedCurrent.push({ ...current, reason: unmatchedReason() });
    else if (ambiguous) review.push({ current, candidates,
      reason: ambiguousCohort ? 'Cohort name identifies more than one cohort'
        : currentMatchCount > 1 ? 'LMS record has more than one possible current record' : 'More than one possible LMS record',
    });
    else matched.push({ current, lms: candidates[0], method: manualId ? 'manual' : 'automatic' });
  }
  return { matched, unmatchedCurrent, unmatchedLms: records.filter(record => !used.has(record.sourceModuleId)), review };
}

export function compareLmsPlans(groups: ProgrammeGroup[], records: PresentedLmsRow[], customModules: CustomModule[], holidays: Holiday[] = [], tutorProfiles: TutorProfile[] = []) {
  const matching = matchLmsPlans(groups, records, customModules);
  // Only confirmed one-to-one matches reach date and tutor comparison.
  const matches: PlanDifference[] = matching.matched.map(({ current: { programme, cohort, block, module }, lms, method }) => {
    const rowHolidays = holidays.filter(holiday => cohort.holidayIds?.includes(holiday.id));
    const endDate = validRange(block)
      ? buildHolidayAdjustedSessionPlan(block, rowHolidays).effectiveEndDate || block.endDate : block.endDate;
    const current = { startDate: block.startDate || null, endDate: endDate || null, baselineEndDate: block.endDate || null, tutorName: tutorDisplayName(block, tutorProfiles).trim() };
    const tutorDiffers = normalize(current.tutorName) !== normalize(lms.tutorName ?? null);
    const datesDiffer = current.startDate !== lms.startDate || current.endDate !== lms.endDate;
    let kind: PlanDifference['kind'];
    if (!validRange(current) || !validRange(lms)) kind = 'incomplete';
    else if (datesDiffer && tutorDiffers) kind = 'datesAndTutor';
    else if (datesDiffer) kind = 'dates';
    else if (tutorDiffers) kind = 'tutor';
    else kind = 'same';
    return {
      id: JSON.stringify(['current', programme.id, cohort.id, block.id]),
      programmeId: programme.id, programme: programme.name, module,
      cohort: cohort.label, group: block.groupName ?? '', current, lms,
      tutorDiffers, kind, matchMethod: method,
    };
  });
  return {
    ...matching, matches,
    differences: matches.filter(row => row.kind !== 'same' && row.kind !== 'incomplete'),
    incomplete: matches.filter(row => row.kind === 'incomplete'),
    unchanged: matches.filter(row => row.kind === 'same').length,
  };
}
