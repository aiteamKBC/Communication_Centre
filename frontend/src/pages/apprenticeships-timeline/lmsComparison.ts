import { getModuleMeta, MS } from './data';
import { buildHolidayAdjustedSessionPlan } from './utils';
import type { LmsReferenceRow } from './lmsReference';
import type { CustomModule, Holiday, ProgrammeGroup } from './types';

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
}

export function presentLmsRows(records: LmsReferenceRow[], currentProgrammes: ProgrammeGroup[]): PresentedLmsRow[] {
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
  return presentation.flatMap(programme => records
    .filter(row => normalize(row.programme) === programme.sourceName)
    .map(row => ({ ...row, programme: programme.name, planProgrammeId: programme.planProgrammeId })));
}

export const differenceLabels = {
  dates: 'Dates differ',
  incomplete: 'Missing or invalid dates',
  currentOnly: 'Current plan only',
  lmsOnly: 'LMS only',
  ambiguous: 'Multiple LMS matches',
} as const;
export type DifferenceKind = keyof typeof differenceLabels;
export interface PlanDifference {
  id: string;
  programmeId: string;
  programme: string;
  module: string;
  cohort: string;
  group: string;
  current: { startDate: string | null; endDate: string | null; baselineEndDate: string | null } | null;
  lms: LmsReferenceRow | null;
  matchCount: number;
  kind: DifferenceKind;
}

export function isComparisonDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const validRange = (row: { startDate: string | null; endDate: string | null }) => (
  isComparisonDate(row.startDate) && isComparisonDate(row.endDate) && row.startDate! <= row.endDate!
);

export function compareLmsPlans(groups: ProgrammeGroup[], records: PresentedLmsRow[], customModules: CustomModule[], holidays: Holiday[] = []) {
  const byName = new Map<string, PresentedLmsRow[]>();
  const keyFor = (programmeId: string, module: string | null) => JSON.stringify([programmeId, normalize(module)]);
  for (const record of records) {
    // A missing module name cannot identify a match.
    if (!normalize(record.module)) continue;
    const key = keyFor(record.planProgrammeId, record.module);
    byName.set(key, [...(byName.get(key) ?? []), record]);
  }
  const used = new Set<string>();
  const differences: PlanDifference[] = [];
  let matching = 0;
  for (const programme of groups) for (const cohort of programme.rows) for (const block of cohort.blks) {
    const module = block.mod in MS ? getModuleMeta(block.mod).lbl
      : customModules.find(item => item.id === block.mod || item.name === block.mod)?.name ?? getModuleMeta(block.mod).lbl;
    // The LMS and local catalogue use independent IDs; match only within the programme by name.
    const candidates = byName.get(keyFor(programme.id, module)) ?? [];
    candidates.forEach(record => used.add(record.sourceModuleId));
    const lms = candidates.length === 1 ? candidates[0] : null;
    const rowHolidays = holidays.filter(holiday => cohort.holidayIds?.includes(holiday.id));
    const endDate = validRange(block)
      ? buildHolidayAdjustedSessionPlan(block, rowHolidays).effectiveEndDate || block.endDate : block.endDate;
    const current = { startDate: block.startDate || null, endDate: endDate || null, baselineEndDate: block.endDate || null };
    let kind: DifferenceKind;
    if (!candidates.length) kind = 'currentOnly';
    else if (candidates.length > 1) kind = 'ambiguous';
    else if (!validRange(current) || !validRange(lms!)) kind = 'incomplete';
    else if (current.startDate !== lms!.startDate || current.endDate !== lms!.endDate) kind = 'dates';
    else { matching++; continue; }
    differences.push({
      id: JSON.stringify(['current', programme.id, cohort.id, block.id]),
      programmeId: programme.id, programme: programme.name, module,
      cohort: cohort.label, group: block.groupName ?? '', current, lms,
      matchCount: candidates.length, kind,
    });
  }
  for (const record of records) if (!used.has(record.sourceModuleId)) differences.push({
    id: JSON.stringify(['lms', record.sourceModuleId]),
    programmeId: record.planProgrammeId, programme: record.programme ?? 'Programme not provided',
    module: record.module?.trim() || 'Module not provided', cohort: '', group: '',
    current: null, lms: record, matchCount: 0, kind: 'lmsOnly',
  });
  return { differences, matching };
}
