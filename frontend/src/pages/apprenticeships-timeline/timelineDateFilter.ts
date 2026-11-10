import { matchesDateRange, type DateRangeValue } from './components/selectFilters';
import type { CohortRow, Holiday, ProgrammeGroup } from './types';
import { buildHolidayAdjustedSessionPlan } from './utils';

export function filterTimelineGroups(groups: ProgrammeGroup[], holidays: Holiday[], dates: DateRangeValue, referenceSource?: 'LMS'): ProgrammeGroup[] {
  if (!dates.from && !dates.to) return groups;
  return groups.flatMap(group => {
    const matches = group.rows.map(row => {
      const activeHolidays = holidays.filter(holiday => row.holidayIds?.includes(holiday.id));
      return row.blks.filter(block => {
        const endDate = referenceSource || row.planSource === 'LMS' || block.source === 'LMS'
          ? block.endDate : buildHolidayAdjustedSessionPlan(block, activeHolidays).effectiveEndDate || block.endDate;
        return matchesDateRange(block.startDate, endDate, dates.from, dates.to);
      });
    });
    // Keep a comparison pair together if either source overlaps the period.
    const matchedPairs = new Set(group.rows.flatMap((row, index) => row.mergeMatch && matches[index].length ? [row.mergeMatch.id] : []));
    const rows: CohortRow[] = [];
    group.rows.forEach((row, index) => {
      if (row.mergeMatch) {
        if (matchedPairs.has(row.mergeMatch.id)) rows.push(row);
      } else if (matches[index].length) {
        rows.push({ ...row, blks: matches[index], referenceGroupNames: undefined });
      }
    });
    return rows.length ? [{ ...group, rows }] : [];
  });
}
