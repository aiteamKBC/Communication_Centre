import { comparisonModuleName, isComparisonDate, type PresentedLmsRow } from './lmsComparison';
import { createLmsModuleColourResolver } from './lmsModuleColours';
import type { CohortRow, CustomModule, ModuleBlock, ProgrammeGroup } from './types';

export function hasLmsDateRange(row: PresentedLmsRow): boolean {
  return isComparisonDate(row.startDate) && isComparisonDate(row.endDate) && row.startDate! <= row.endDate!;
}

const normalize = (value?: string | null) => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const groupNumber = (value?: string | null) => value?.match(/\b(?:g|group)\s*[-:]?\s*(\d+)\b/i)?.[1];

// Only use current cohort groups when its identity is unambiguous. Dates and tutors
// always belong to the captured LMS module, even when its group comes from the plan.
export function lmsRecordGroup(record: PresentedLmsRow, currentProgrammes: ProgrammeGroup[], modules: CustomModule[] = []) {
  const programme = currentProgrammes.find(item => item.id === record.planProgrammeId);
  const matches = programme?.rows.filter(row => normalize(row.label) && normalize(row.label) === normalize(record.cohortName)) ?? [];
  const cohort = matches.length === 1 ? matches[0] : undefined;
  const names = [...new Set(cohort?.blks.map(block => block.groupName?.trim()).filter((name): name is string => Boolean(name)) ?? [])];
  if (record.groupName?.trim()) return record.groupName.trim();
  const number = groupNumber(record.module);
  if (number) {
    const matchingNames = names.filter(name => groupNumber(name) === number);
    return matchingNames.length === 1 ? matchingNames[0] : `G${number}`;
  }
  const moduleGroups = [...new Set(cohort?.blks
    .filter(block => normalize(comparisonModuleName(block, modules)) === normalize(record.module))
    .map(block => block.groupName?.trim()).filter((name): name is string => Boolean(name)) ?? [])];
  return moduleGroups.length === 1 ? moduleGroups[0] : names.length === 1 ? names[0] : 'Group not provided';
}

// Arrange captured dates within LMS cohorts, newest first, with a separate lane
// for each group just like the current Training Plan.
export function buildLmsTimelineLayout(records: PresentedLmsRow[], currentProgrammes: ProgrammeGroup[], currentModules: CustomModule[] = []) {
  const customModules: CustomModule[] = [];
  const moduleColour = createLmsModuleColourResolver(currentProgrammes, currentModules);
  const groups: ProgrammeGroup[] = [];
  const validRecords = records.filter(hasLmsDateRange);
  const blockFor = (record: PresentedLmsRow, placement: string, groupName: string): ModuleBlock => {
    const mod = `lms-module:${record.sourceModuleId}`;
    const module = customModules.find(item => item.id === mod)!;
    return {
      id: JSON.stringify(['lms', record.sourceModuleId, placement]), source: 'LMS',
      moduleCatalogueId: record.sourceModuleId, mod, groupName, color: module.bg,
      startDate: record.startDate!, endDate: record.endDate!, tutor: record.tutorName?.trim() || '', sessions: 0,
      startDateSource: record.startDateSource,
    };
  };
  validRecords.forEach(record => {
    customModules.push({ id: `lms-module:${record.sourceModuleId}`, name: record.module?.trim() || 'Module not provided',
      defaultSessions: 0, bg: moduleColour(record.module, record.planProgrammeId), tx: '#FFFFFF' });
  });

  for (const programmeId of new Set(records.map(record => record.planProgrammeId))) {
    const programmeRecords = records.filter(record => record.planProgrammeId === programmeId);
    const drawable = programmeRecords.filter(hasLmsDateRange);
    if (!drawable.length) continue;
    const current = currentProgrammes.find(programme => programme.id === programmeId);
    const byCohort = new Map<string, PresentedLmsRow[]>();
    for (const record of [...drawable].sort((left, right) => (
      left.startDate!.localeCompare(right.startDate!)
      || left.endDate!.localeCompare(right.endDate!)
      || left.sourceModuleId.localeCompare(right.sourceModuleId)
    ))) {
      const name = record.cohortName?.trim().replace(/\s+/g, ' ');
      const key = record.cohortId?.trim() ? `id:${record.cohortId.trim()}`
        : name ? `name:${name.toLowerCase()}` : `missing:${record.startDate!.slice(0, 7)}`;
      byCohort.set(key, [...(byCohort.get(key) ?? []), record]);
    }
    const rows: CohortRow[] = [];
    for (const [cohort, entries] of byCohort) {
      const cohortName = entries.find(record => record.cohortName?.trim())?.cohortName?.trim() || 'Cohort not provided';
      rows.push({
        id: `lms-cohort:${programmeId}:${cohort}`, label: cohortName,
        dateLbl: entries[0].startDate!, intake: '', quarter: '',
        blks: entries.map(record => blockFor(record, cohort, lmsRecordGroup(record, currentProgrammes, currentModules))),
      });
    }
    rows.sort((left, right) => right.dateLbl.localeCompare(left.dateLbl) || left.id.localeCompare(right.id));
    groups.push({ id: `lms-programme:${programmeId}`, name: current?.name || programmeRecords[0].programme || 'Programme not provided',
      sub: 'LMS reference', color: '#115E59', rows });
  }
  return { groups, customModules, undrawableCount: records.length - validRecords.length };
}
