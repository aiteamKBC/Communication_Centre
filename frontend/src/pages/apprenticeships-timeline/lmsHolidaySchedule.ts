import { isComparisonDate } from './lmsComparison';
import type { Holiday, HolidayDateRange, ModuleBlock, ProgrammeGroup } from './types';

export const LMS_HOLIDAY_COLOR = '#8B5CF6';
const DAY = 86400000;
const dayNumber = (iso: string) => Date.parse(iso) / DAY;
const isoDate = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const monday = (day: number) => day - ((new Date(day * DAY).getUTCDay() + 6) % 7);

// A weekday holiday closes its whole Monday–Friday week. Weekend-only holidays
// do not close a teaching week; several holidays in one week form one closure.
export function buildLmsHolidayWeeks(holidays: Holiday[]): Holiday[] {
  const weeks = new Map<number, Map<string, HolidayDateRange>>();
  for (const holiday of holidays) {
    if (!isComparisonDate(holiday.startDate) || !isComparisonDate(holiday.endDate)
      || holiday.startDate > holiday.endDate) continue;
    const start = dayNumber(holiday.startDate);
    const end = dayNumber(holiday.endDate);
    for (let week = monday(start); week <= end; week += 7) {
      if (start > week + 4) continue;
      const dates = weeks.get(week) ?? new Map<string, HolidayDateRange>();
      dates.set(holiday.id, { id: holiday.id, label: holiday.label, startDate: holiday.startDate, endDate: holiday.endDate });
      weeks.set(week, dates);
    }
  }
  return [...weeks].sort(([left], [right]) => left - right).map(([week, dates]) => ({
    id: `lms-holiday-week:${isoDate(week)}`, label: [...new Set([...dates.values()].map(holiday => holiday.label))].sort().join(' / '),
    startDate: isoDate(week), endDate: isoDate(week + 4),
    type: 'Holiday week (Monday–Friday)', color: LMS_HOLIDAY_COLOR,
    sourceHolidays: [...dates.values()].sort((left, right) => left.startDate.localeCompare(right.startDate) || left.label.localeCompare(right.label)),
  }));
}

// Map the original teaching weeks to available calendar weeks, independently for
// each cohort/group. Pauses carry forward, preserving existing gaps, weekdays,
// overlaps and teaching duration. Holidays during idle gaps add no extra delay.
export function adjustLmsTimelineForHolidays(groups: ProgrammeGroup[], holidayWeeks: Holiday[]): ProgrammeGroup[] {
  const closedWeeks = new Set(holidayWeeks.map(holiday => dayNumber(holiday.startDate)));
  return groups.map(group => ({ ...group, rows: group.rows.map(row => {
    const lanes = new Map<string, ModuleBlock[]>();
    for (const block of row.blks) {
      if (block.source !== 'LMS' || !isComparisonDate(block.startDate) || !isComparisonDate(block.endDate) || block.startDate > block.endDate) continue;
      const lane = block.groupId || block.groupName?.trim().toLowerCase() || '';
      lanes.set(lane, [...(lanes.get(lane) ?? []), block]);
    }
    const adjusted = new Map<ModuleBlock, ModuleBlock>();
    for (const blocks of lanes.values()) {
      const ranges = blocks.map(block => ({ block, start: dayNumber(block.startDate), end: dayNumber(block.endDate) }));
      const firstWeek = monday(Math.min(...ranges.map(range => range.start)));
      const lastWeek = monday(Math.max(...ranges.map(range => range.end)));
      const offsets = new Map<number, number>();
      let actualWeek = firstWeek;
      for (let sourceWeek = firstWeek; sourceWeek <= lastWeek; sourceWeek += 7) {
        const teaching = ranges.some(range => range.start <= sourceWeek + 4 && range.end >= sourceWeek);
        if (teaching) while (closedWeeks.has(actualWeek)) actualWeek += 7;
        offsets.set(sourceWeek, actualWeek - sourceWeek);
        actualWeek += 7;
      }
      for (const { block, start, end } of ranges) {
        const startDelay = offsets.get(monday(start)) ?? 0;
        const endDelay = offsets.get(monday(end)) ?? 0;
        adjusted.set(block, { ...block,
          startDate: isoDate(start + startDelay), endDate: isoDate(end + endDelay),
          lmsOriginalStartDate: block.startDate, lmsOriginalEndDate: block.endDate,
          lmsHolidayDelayWeeks: endDelay / 7,
        });
      }
    }
    return { ...row, blks: row.blks.map(block => adjusted.get(block) ?? block) };
  }) }));
}
