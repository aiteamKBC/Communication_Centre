import { expect, test } from '@playwright/test';
import { adjustLmsTimelineForHolidays, buildLmsHolidayWeeks } from '../../src/pages/apprenticeships-timeline/lmsHolidaySchedule';
import type { Holiday, ModuleBlock, ProgrammeGroup } from '../../src/pages/apprenticeships-timeline/types';

const holiday = (startDate: string, label = 'Bank holiday', endDate = startDate): Holiday => ({
  id: `h:${startDate}:${label}`, label, startDate, endDate, type: 'Bank holiday', color: '#F59E0B',
});
const block = (id: string, startDate: string, endDate: string, groupName = 'G1'): ModuleBlock => ({
  id, source: 'LMS', mod: id, groupName, startDate, endDate, tutor: '', sessions: 0,
});
const programme = (blks: ModuleBlock[]): ProgrammeGroup => ({
  id: 'p1', name: 'Programme', sub: '', color: '#115E59',
  rows: [{ id: 'c1', label: 'Cohort', dateLbl: '', intake: '', quarter: '', blks }],
});
const adjust = (blocks: ModuleBlock[], holidays: Holiday[]) =>
  adjustLmsTimelineForHolidays([programme(blocks)], buildLmsHolidayWeeks(holidays))[0].rows[0].blks;

for (const date of ['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13']) {
  test(`a holiday on ${date} closes Monday–Friday and delays the whole group`, () => {
    const holidays = [holiday(date)];
    const weeks = buildLmsHolidayWeeks(holidays);
    expect(weeks).toEqual([{ id: 'lms-holiday-week:2026-03-09', label: 'Bank holiday',
      startDate: '2026-03-09', endDate: '2026-03-13', type: 'Holiday week (Monday–Friday)', color: '#8B5CF6',
      sourceHolidays: [{ id: holidays[0].id, label: 'Bank holiday', startDate: date, endDate: date }] }]);
    const [first, next] = adjust([block('a', '2026-03-02', '2026-03-20'), block('b', '2026-03-23', '2026-03-27')], holidays);
    expect([first.startDate, first.endDate]).toEqual(['2026-03-02', '2026-03-27']);
    expect([next.startDate, next.endDate]).toEqual(['2026-03-30', '2026-04-03']);
    expect(first.lmsOriginalEndDate).toBe('2026-03-20');
    expect(first.lmsHolidayDelayWeeks).toBe(1);
  });
}

test('weekend-only holidays cause no closure or delay; Friday–Monday closes two weeks', () => {
  const weekends = [holiday('2026-03-14'), holiday('2026-03-15')];
  expect(buildLmsHolidayWeeks(weekends)).toEqual([]);
  expect(adjust([block('a', '2026-03-09', '2026-03-20')], weekends)[0].endDate).toBe('2026-03-20');
  expect(buildLmsHolidayWeeks([holiday('2026-03-13', 'Long holiday', '2026-03-16')])
    .map(week => [week.startDate, week.endDate])).toEqual([['2026-03-09', '2026-03-13'], ['2026-03-16', '2026-03-20']]);
});

test('several holidays in one week count once and keep all holiday names', () => {
  const holidays = [holiday('2026-03-09', 'First'), holiday('2026-03-13', 'Second'), holiday('2026-03-13', 'Second')];
  const weeks = buildLmsHolidayWeeks(holidays);
  expect(weeks).toHaveLength(1);
  expect(weeks[0].label).toBe('First / Second');
  expect(weeks[0].sourceHolidays).toEqual([
    { id: holidays[0].id, label: 'First', startDate: '2026-03-09', endDate: '2026-03-09' },
    { id: holidays[1].id, label: 'Second', startDate: '2026-03-13', endDate: '2026-03-13' },
  ]);
  expect(adjust([block('a', '2026-03-02', '2026-03-20')], holidays)[0].endDate).toBe('2026-03-27');
});

test('a shifted module also skips newly encountered holiday weeks', () => {
  const [first, next] = adjust([block('a', '2026-03-02', '2026-03-13'), block('b', '2026-03-16', '2026-03-20')],
    [holiday('2026-03-06'), holiday('2026-03-17')]);
  expect([first.startDate, first.endDate]).toEqual(['2026-03-09', '2026-03-27']);
  expect([next.startDate, next.endDate]).toEqual(['2026-03-30', '2026-04-03']);
  expect(next.lmsHolidayDelayWeeks).toBe(2);
});

test('overlapping modules share one calendar shift rather than double-counting closures', () => {
  const [first, overlapping] = adjust([block('a', '2026-03-02', '2026-03-20'), block('b', '2026-03-09', '2026-03-27')],
    [holiday('2026-03-13')]);
  expect([first.startDate, first.endDate]).toEqual(['2026-03-02', '2026-03-27']);
  expect([overlapping.startDate, overlapping.endDate]).toEqual(['2026-03-16', '2026-04-03']);
  expect(overlapping.lmsHolidayDelayWeeks).toBe(1);
});

test('groups, cohorts and programmes have independent delay calculations', () => {
  const original = [programme([block('a', '2026-03-02', '2026-03-20'), block('b', '2026-03-16', '2026-03-27', 'G2')])];
  original[0].rows.push({ ...original[0].rows[0], id: 'c2', blks: [block('c', '2026-03-16', '2026-03-27')] });
  original.push({ ...programme([block('d', '2026-03-16', '2026-03-27')]), id: 'p2' });
  const result = adjustLmsTimelineForHolidays(original, buildLmsHolidayWeeks([holiday('2026-03-13')]));
  expect(result[0].rows[0].blks[0].endDate).toBe('2026-03-27');
  expect(result[0].rows[0].blks[1].lmsHolidayDelayWeeks).toBe(0);
  expect(result[0].rows[1].blks[0].lmsHolidayDelayWeeks).toBe(0);
  expect(result[1].rows[0].blks[0].lmsHolidayDelayWeeks).toBe(0);
});

test('holidays during idle gaps do not delay teaching, and existing gaps stay intact', () => {
  const blocks = [block('a', '2026-03-02', '2026-03-06'), block('b', '2026-03-16', '2026-03-20')];
  expect(adjust(blocks, [holiday('2026-03-13')]).map(item => item.lmsHolidayDelayWeeks)).toEqual([0, 0]);
  const [first, next] = adjust(blocks, [holiday('2026-03-06')]);
  expect([first.startDate, first.endDate, next.startDate, next.endDate])
    .toEqual(['2026-03-09', '2026-03-13', '2026-03-23', '2026-03-27']);
});

test('dates stay exact across year boundaries and daylight-saving changes', () => {
  const christmas = [holiday('2026-12-25'), holiday('2026-12-28'), holiday('2027-01-01')];
  const [winter] = adjust([block('winter', '2026-12-21', '2027-01-08')], christmas);
  expect([winter.startDate, winter.endDate]).toEqual(['2027-01-04', '2027-01-22']);
  const [spring] = adjust([block('spring', '2026-03-23', '2026-04-03')], [holiday('2026-04-03')]);
  expect([spring.startDate, spring.endDate]).toEqual(['2026-03-23', '2026-04-10']);
});

test('source data, invalid dates and Current blocks remain untouched', () => {
  const original = [programme([block('a', '2026-03-02', '2026-03-20'), block('bad', '2026-02-30', '2026-03-20'),
    { ...block('current', '2026-03-02', '2026-03-20'), source: undefined }])];
  const before = structuredClone(original);
  const result = adjustLmsTimelineForHolidays(original, buildLmsHolidayWeeks([holiday('2026-03-13')]));
  expect(original).toEqual(before);
  expect(result[0].rows[0].blks[1]).toEqual(before[0].rows[0].blks[1]);
  expect(result[0].rows[0].blks[2]).toEqual(before[0].rows[0].blks[2]);
  expect(result[0].rows[0].blks[0].lmsOriginalEndDate).toBe('2026-03-20');
  expect(buildLmsHolidayWeeks([holiday('2026-02-30'), holiday('2026-03-20', 'Invalid', '2026-03-01')])).toEqual([]);
});
