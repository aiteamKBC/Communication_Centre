import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { compareLmsPlans, lmsCohortDisplayName, lmsGroupDisplayName, matchLmsPlans, presentLmsRows } from '../../src/pages/apprenticeships-timeline/lmsComparison';
import { buildLmsTimelineLayout, buildMergedTimelineLayout, lmsRecordGroup } from '../../src/pages/apprenticeships-timeline/lmsTimelineLayout';
import type { LmsReferenceRow } from '../../src/pages/apprenticeships-timeline/lmsReference';
import type { ModuleBlock, ProgrammeGroup } from '../../src/pages/apprenticeships-timeline/types';

test.use({ channel: 'chrome' });

const block = (id: string, mod: string, overrides: Partial<ModuleBlock> = {}): ModuleBlock => ({
  id, mod, tutor: '', sessions: 3, startDate: '2026-01-05', endDate: '2026-01-19', ...overrides,
});
const group = (blks: ModuleBlock[], id = 'me-lvl4'): ProgrammeGroup => ({
  id, name: id === 'me-lvl4' ? 'ME L4' : 'MM LVL6', sub: '', color: '#115E59',
  rows: [{ id: 'c1', label: 'January cohort', dateLbl: '', intake: '', quarter: '', blks }],
});
const source = (id: string, module: string, overrides: Partial<LmsReferenceRow> = {}): LmsReferenceRow => ({
  sourceModuleId: id, sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4',
  module, startDate: '2026-01-05', endDate: '2026-01-19', ...overrides,
});
const matchingSource = (id: string, module: string, overrides: Partial<LmsReferenceRow> = {}) => (
  source(id, module, { cohortName: 'January cohort', ...overrides })
);

test('comparison stays within programmes, resolves display names and does not equate independent catalogue IDs', () => {
  const groups = [group([block('one', 'social'), block('two', 'custom-1', { moduleCatalogueId: '2' })]), group([block('three', 'Social Media')], 'mm-lvl6')];
  const records = presentLmsRows([matchingSource('1', ' social   media '), matchingSource('2', 'Unrelated module'), matchingSource('3', 'Custom module')], groups);
  const result = compareLmsPlans(groups, records, [{ id: 'custom-1', name: 'Custom module', defaultSessions: 1, bg: '', tx: '' }]);
  expect(result.unchanged).toBe(2);
  expect(result.matches).toHaveLength(2);
  expect(result.differences).toEqual([]);
  expect(result.unmatchedCurrent.map(row => row.module)).toEqual(['Social Media']);
  expect(result.unmatchedLms.map(row => row.module)).toEqual(['Unrelated module']);
  // Presentation must never mutate the source snapshot.
  expect(records[0].programme).toBe('ME L4');
});

test('comparison excludes invalid start dates and retains ambiguous and incomplete end dates', () => {
  const programme = group([block('a', 'Repeated'), block('b', 'Impossible'), block('c', 'Reversed'), block('d', 'Missing'), block('e', 'Same')]);
  programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February cohort', blks: [block('f', 'Same', { startDate: '2026-02-02', endDate: '2026-02-16' })] });
  const records = presentLmsRows([
    matchingSource('1', 'Repeated'), matchingSource('2', 'Repeated'), matchingSource('3', 'Impossible', { startDate: '2026-02-30' }),
    matchingSource('4', 'Reversed', { endDate: '2026-01-01' }), matchingSource('5', 'Missing', { endDate: null }), matchingSource('6', 'Same'),
    matchingSource('7', 'Same', { cohortName: 'February cohort', startDate: '2026-02-02', endDate: '2026-02-23' }),
  ], [programme]);
  const result = compareLmsPlans([programme], records, []);
  expect(result.unchanged).toBe(1);
  expect(result.differences.map(row => row.kind)).toEqual(['dates']);
  expect(result.incomplete.map(row => row.kind)).toEqual(['incomplete', 'incomplete']);
  expect(result.review[0].candidates).toHaveLength(2);
  expect(result.matches).toHaveLength(4);
  expect(result.unmatchedCurrent.map(row => row.block.id)).toEqual(['b']);
  expect(result.unmatchedLms.map(row => row.sourceModuleId)).toEqual(['3']);
  expect(result.differences.at(-1)).toMatchObject({ cohort: 'February cohort', current: { startDate: '2026-02-02' } });
});

test('comparison follows the timeline schedule and applies only the cohort selected holidays', () => {
  const programme = group([block('a', 'Scheduled module', { days: ['monday'] })]);
  const records = presentLmsRows([matchingSource('1', 'Scheduled module')], [programme]);
  const holidays = [{ id: 'h1', label: 'Break', startDate: '2026-01-12', endDate: '2026-01-12', type: 'holiday', color: '#fff' }];
  expect(compareLmsPlans([programme], records, [], holidays).unchanged).toBe(1);
  programme.rows[0].holidayIds = ['h1'];
  expect(compareLmsPlans([programme], records, [], holidays).differences[0]).toMatchObject({
    kind: 'dates', current: { startDate: '2026-01-05', endDate: '2026-01-26', baselineEndDate: '2026-01-19' },
  });
});

test('comparison links repeated modules by cohort, group and start date despite end date and tutor changes', () => {
  const programme = group([
    block('jan-1', 'Marketing', { groupName: 'G1 - Tuesday', tutor: 'Plan Tutor' }),
    block('jan-2', 'Marketing', { groupName: 'G2 - Friday' }),
  ]);
  programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February cohort',
    blks: [block('feb-1', 'Marketing', { groupName: 'Group 1' })] });
  const records = presentLmsRows([
    matchingSource('jan-1', 'Marketing Group 01', { cohortId: 'independent-jan', cohortName: ' January   COHORT ',
      tutorName: 'LMS Tutor', endDate: '2026-02-01' }),
    matchingSource('jan-2', 'Marketing', { cohortId: 'independent-jan', groupName: 'Group 2' }),
    matchingSource('feb-1', 'Marketing', { cohortId: 'independent-feb', cohortName: 'February cohort', groupName: 'G1' }),
  ], [programme]);
  const before = JSON.stringify({ programme, records });
  const result = compareLmsPlans([programme], records, []);
  expect(result.unchanged).toBe(2);
  expect(result.differences).toHaveLength(1);
  expect(result.differences[0]).toMatchObject({ cohort: 'January cohort', group: 'G1 - Tuesday', kind: 'datesAndTutor',
    lms: { sourceModuleId: 'jan-1', startDate: '2026-01-05' }, current: { tutorName: 'Plan Tutor' } });
  expect(compareLmsPlans([programme], [...records].reverse(), [])).toEqual(result);
  expect(JSON.stringify({ programme, records })).toBe(before);
});

test('comparison matches unique module names and start dates despite different or missing cohorts', () => {
  const programme = group([block('one', 'Marketing', { moduleCatalogueId: 'one', tutor: 'Same Tutor' })]);
  for (const cohortName of ['February cohort', null, '']) {
    const records = presentLmsRows([matchingSource('one', 'Marketing', { cohortId: 'c1', cohortName, tutorName: 'Same Tutor' })], [programme]);
    const result = compareLmsPlans([programme], records, []);
    expect(result.unchanged).toBe(1);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].matchMethod).toBe('automatic');
    expect(result.differences).toEqual([]);
    expect(result.unmatchedCurrent).toHaveLength(0);
    expect(result.unmatchedLms).toHaveLength(0);
  }
});

test('comparison accepts missing groups for unique name/start pairs but rejects explicit group conflicts', () => {
  const programme = group([
    block('one', 'Marketing', { groupName: 'Group 1', tutor: 'Same Tutor' }),
    block('two', 'Other module', { groupName: 'Group 2' }),
  ]);
  const missingGroup = presentLmsRows([matchingSource('one', 'Marketing', { tutorName: 'Same Tutor' })], [programme]);
  expect(compareLmsPlans([programme], missingGroup, []).unchanged).toBe(1);
  for (const overrides of [{ groupName: 'Group 2' }, { groupName: 'Group 9' }, { groupName: 'Group 1', module: 'Marketing G2' }]) {
    const records = presentLmsRows([matchingSource('one', 'Marketing', { tutorName: 'Same Tutor', ...overrides })], [programme]);
    const result = compareLmsPlans([programme], records, []);
    expect(result.unchanged).toBe(0);
    expect(result.differences).toEqual([]);
    expect(result.unmatchedCurrent).toHaveLength(2);
    expect(result.unmatchedLms).toHaveLength(1);
  }
  const records = presentLmsRows([matchingSource('one', 'Marketing', { groupName: 'G1', tutorName: 'Same Tutor' })], [programme]);
  expect(compareLmsPlans([programme], records, []).unchanged).toBe(1);
  // Unique module names can distinguish placements with independent group IDs.
  programme.rows[0].blks.forEach((item, index) => { item.groupName = ''; item.groupId = `local-${index}`; });
  expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing')], [programme]), []).matches).toHaveLength(1);
});

test('comparison infers a missing LMS group for a unique placement and respects explicit groups', () => {
  const programme = group([block('one', 'Marketing', { groupName: 'Tuesday group' })]);
  expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing')], [programme]), []).unchanged).toBe(1);
  expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing', { groupName: 'Friday group' })], [programme]), []).unchanged).toBe(0);
});

test('MBA modules with the same name and start date match automatically without LMS group labels', () => {
  const programme = group([
    block('strategic', 'mba-strategic', { startDate: '2026-10-31', endDate: '2027-02-18', groupName: 'G1-Saturday-9 am', tutor: 'Plan Tutor' }),
    block('other', 'Other module', { groupName: 'G2-Tuesday' }),
  ], 'mba');
  programme.name = 'MBA';
  programme.rows[0].label = 'MBA 2026';
  const modules = [{ id: 'mba-strategic', name: 'Chari-Strategic Management', defaultSessions: 1, bg: '', tx: '' }];
  const original = [source('lms-strategic', ' chari-strategic   MANAGEMENT ', {
    programme: 'MBA', cohortName: null, groupName: null, startDate: '2026-10-31', endDate: '2027-02-18', tutorName: 'LMS Tutor',
  })];
  const before = JSON.stringify({ programme, original });
  const records = presentLmsRows(original, [programme], modules);
  const result = compareLmsPlans([programme], records, modules);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0]).toMatchObject({ matchMethod: 'automatic', kind: 'datesAndTutor', lms: { sourceModuleId: 'lms-strategic', cohortName: null, groupName: null } });
  expect(records[0].matchedPlanCohort?.name).toBe('MBA 2026');
  expect(records[0].matchedPlanGroup?.name).toBe('G1-Saturday-9 am');
  expect(JSON.stringify({ programme, original })).toBe(before);
});

test('name/start fallback leaves duplicate source or current placements for review', () => {
  const programme = group([block('one', 'Marketing', { groupName: 'G1' })]);
  const original = [source('lms-one', 'Marketing', { cohortName: null, groupName: null })];
  programme.rows[0].blks.push(block('two', 'Marketing', { groupName: 'G2' }));
  let result = matchLmsPlans([programme], presentLmsRows(original, [programme]), []);
  expect(result.matched).toEqual([]);
  expect(result.review).toHaveLength(2);
  programme.rows[0].blks.pop();
  programme.rows.push({ ...programme.rows[0], id: 'other-cohort', label: 'Other cohort', blks: [block('three', 'Marketing', { groupName: 'G1' })] });
  result = matchLmsPlans([programme], presentLmsRows(original, [programme]), []);
  expect(result.matched).toEqual([]);
  expect(result.review).toHaveLength(2);
  programme.rows.pop();
  const repeated = [...original, { ...original[0], sourceModuleId: 'lms-two' }];
  result = matchLmsPlans([programme], presentLmsRows(repeated, [programme]), []);
  expect(result.matched).toEqual([]);
  expect(result.review[0].candidates).toHaveLength(2);
  expect(matchLmsPlans([programme], presentLmsRows([...repeated].reverse(), [programme]), []).matched).toEqual([]);
});

test('cohort matches take priority over fallback claims regardless of record ordering', () => {
  const programme = group([block('one', 'Marketing')]);
  programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February cohort', blks: [block('two', 'Marketing')] });
  const records = presentLmsRows([matchingSource('identified', 'Marketing')], [programme]);
  const result = matchLmsPlans([programme], records, []);
  expect(result.matched.map(pair => [pair.current.block.id, pair.lms.sourceModuleId])).toEqual([['one', 'identified']]);
  expect(result.review).toEqual([]);
  expect(result.unmatchedCurrent[0].reason).toContain('reserved by another current record');
  const reversed = { ...programme, rows: [...programme.rows].reverse() };
  expect(matchLmsPlans([reversed], records, []).matched.map(pair => pair.current.block.id)).toEqual(['one']);
});

test('comparison refuses to reuse a source record for duplicate current placements', () => {
  const programme = group([block('one', 'Marketing'), block('two', 'Marketing')]);
  const records = presentLmsRows([matchingSource('source', 'Marketing')], [programme]);
  const result = compareLmsPlans([programme], records, []);
  expect(result.unchanged).toBe(0);
  expect(result.differences).toEqual([]);
  expect(result.matches).toEqual([]);
  expect(result.review).toHaveLength(2);
  expect(result.review.every(row => row.candidates.length === 1)).toBe(true);
});

test('comparison marks duplicate cohort labels for review instead of equating independent cohort IDs', () => {
  const programme = group([block('one', 'Marketing')]);
  programme.rows.push({ ...programme.rows[0], id: 'c2', blks: [block('two', 'Other module')] });
  let records = presentLmsRows([matchingSource('source', 'Marketing', { cohortId: 'c1' })], [programme]);
  expect(compareLmsPlans([programme], records, []).review[0].reason).toBe('Cohort name identifies more than one cohort');
  programme.rows.pop();
  records = presentLmsRows([
    matchingSource('source', 'Marketing', { cohortId: 'c1' }),
    matchingSource('source-2', 'Other module', { cohortId: 'c2' }),
  ], [programme]);
  expect(compareLmsPlans([programme], records, []).review[0].reason).toBe('Cohort name identifies more than one cohort');
});

test('comparison reports tutor-only differences, normalizes names and keeps date and tutor changes together', () => {
  const programme = group([block('one', 'Marketing', { tutor: ' Plan   Tutor ' })]);
  const compare = (overrides: Partial<LmsReferenceRow>) => compareLmsPlans([programme],
    presentLmsRows([matchingSource('one', 'Marketing', overrides)], [programme]), []);
  expect(compare({ tutorName: 'plan tutor' }).unchanged).toBe(1);
  expect(compare({ tutorName: 'Other Tutor' }).differences[0]).toMatchObject({ kind: 'tutor', tutorDiffers: true });
  expect(compare({ tutorName: null }).differences[0]).toMatchObject({ kind: 'tutor', lms: { sourceModuleId: 'one' } });
  expect(compare({ tutorName: 'Other Tutor', endDate: null }).incomplete[0]).toMatchObject({ kind: 'incomplete', tutorDiffers: true });
  expect(compare({ tutorName: 'Other Tutor', endDate: '2026-01-26' }).differences[0]).toMatchObject({ kind: 'datesAndTutor' });
  programme.rows[0].blks[0].tutorProfileId = 'profile-1';
  const profiles = [{ id: 'profile-1', name: 'Profile Tutor', normalizedName: 'profile tutor', isActive: true }];
  expect(compareLmsPlans([programme], presentLmsRows([matchingSource('one', 'Marketing', { tutorName: 'Profile Tutor' })], [programme]), [], [], profiles).unchanged).toBe(1);
});

test('matching is independent of comparison, and unlinked records never increase difference counts', () => {
  const programme = group([block('one', 'Marketing'), block('two', 'Unlinked current')]);
  const records = presentLmsRows([
    matchingSource('source', 'Marketing', { endDate: '2026-02-01', tutorName: 'Other Tutor' }),
    matchingSource('unlinked', 'Unlinked LMS', { startDate: null, tutorName: 'Another Tutor' }),
  ], [programme]);
  const matching = matchLmsPlans([programme], records, []);
  expect(matching.matched.map(pair => [pair.current.block.id, pair.lms.sourceModuleId])).toEqual([['one', 'source']]);
  const result = compareLmsPlans([programme], records, []);
  expect(result.matches).toHaveLength(1);
  expect(result.differences).toHaveLength(1);
  expect(result.differences[0].kind).toBe('datesAndTutor');
  expect(result.incomplete).toHaveLength(0);
  expect(result.unmatchedCurrent).toHaveLength(1);
  expect(result.unmatchedLms).toHaveLength(1);
  expect(result.matches.length).toBe(result.differences.length + result.incomplete.length + result.unchanged);
  const changedDates = records.map(record => ({ ...record, endDate: null, tutorName: null }));
  expect(matchLmsPlans([programme], changedDates, []).matched.map(pair => [pair.current.block.id, pair.lms.sourceModuleId]))
    .toEqual([['one', 'source']]);
  const incomplete = compareLmsPlans([programme], changedDates, []);
  expect(incomplete.differences).toHaveLength(0);
  expect(incomplete.incomplete).toHaveLength(1);
});

test('matching requires identical valid start dates on both sides', () => {
  for (const currentStart of ['2026-01-05', '', '2026-02-30']) {
    for (const sourceStart of ['2026-01-05', '2026-01-12', null, '', '2026-02-30']) {
      const programme = group([block('one', 'Marketing', { startDate: currentStart })]);
      const records = presentLmsRows([matchingSource('source', 'Marketing', { startDate: sourceStart })], [programme]);
      const result = compareLmsPlans([programme], records, []);
      const expectedMatches = currentStart === '2026-01-05' && sourceStart === currentStart ? 1 : 0;
      expect(result.matches).toHaveLength(expectedMatches);
      expect(result.unmatchedCurrent).toHaveLength(1 - expectedMatches);
      expect(result.unmatchedLms).toHaveLength(1 - expectedMatches);
      expect(result.differences).toEqual([]);
      expect(result.incomplete).toEqual([]);
    }
  }
});

test('start dates distinguish repeated modules without reusing or arbitrarily choosing records', () => {
  const programme = group([
    block('early', 'Marketing'),
    block('late', 'Marketing', { startDate: '2026-02-02', endDate: '2026-02-16' }),
  ]);
  const records = presentLmsRows([
    matchingSource('early-source', 'Marketing'),
    matchingSource('late-source', 'Marketing', { startDate: '2026-02-02', endDate: '2026-02-16' }),
  ], [programme]);
  const before = JSON.stringify({ programme, records });
  const result = matchLmsPlans([programme], records, []);
  expect(result.matched.map(pair => [pair.current.block.id, pair.lms.sourceModuleId]))
    .toEqual([['early', 'early-source'], ['late', 'late-source']]);
  expect(result.review).toEqual([]);
  expect(result.unmatchedCurrent).toEqual([]);
  expect(result.unmatchedLms).toEqual([]);
  expect(matchLmsPlans([programme], [...records].reverse(), [])).toEqual(result);
  expect(JSON.stringify({ programme, records })).toBe(before);
});

test('unmatched records explain module names, group conflicts and different start dates', () => {
  const programme = group([block('one', 'Marketing', { groupName: 'G2-Thursday' })]);
  const compare = (overrides: Partial<LmsReferenceRow>) => compareLmsPlans([programme],
    presentLmsRows([matchingSource('source', 'Marketing', { groupName: 'G2-Marketing Thursday', ...overrides })], [programme]), []);
  expect(compare({}).unchanged).toBe(1);
  expect(compare({ startDate: '2026-01-12' }).unmatchedCurrent[0].reason)
    .toContain('Start date does not match a valid LMS start date. LMS: 2026-01-12');
  expect(compare({ cohortName: null }).unchanged).toBe(1);
  expect(compare({ cohortName: null, startDate: '2026-01-12' }).unmatchedCurrent[0].reason).toContain('Start date does not match');
  expect(compare({ module: 'Other module' }).unmatchedCurrent[0].reason).toContain('same module name');
  expect(compare({ groupName: 'G1-Marketing Wednesday' }).unmatchedCurrent[0].reason).toContain('LMS group');
  programme.rows[0].blks[0].startDate = '';
  expect(compare({}).unmatchedCurrent[0].reason).toBe('Current start date is missing or invalid.');
});

test('manual matches compare the selected pair despite different names, cohorts, groups and start dates', () => {
  const programme = group([block('one', 'Marketing', { groupName: 'G1', tutor: 'Plan Tutor', lmsSourceModuleId: 'chosen' })]);
  const original = [source('chosen', 'Different LMS title', { cohortName: null, groupName: null, startDate: '2026-02-02', endDate: '2026-02-16', tutorName: 'LMS Tutor' })];
  const before = JSON.stringify({ programme, original });
  const records = presentLmsRows(original, [programme]);
  const result = compareLmsPlans([programme], records, []);
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0]).toMatchObject({ matchMethod: 'manual', kind: 'datesAndTutor', lms: { sourceModuleId: 'chosen', cohortName: null, startDate: '2026-02-02' } });
  expect(records[0].matchedPlanCohort?.name).toBe('January cohort');
  expect(records[0].matchedPlanGroup?.name).toBe('G1');
  expect(JSON.stringify({ programme, original })).toBe(before);
});

test('manual matches reserve their LMS record and removal restores automatic matching', () => {
  const programme = group([block('automatic', 'Marketing'), block('manual', 'Other module', { lmsSourceModuleId: 'chosen' })]);
  const records = presentLmsRows([matchingSource('chosen', 'Marketing')], [programme]);
  let result = matchLmsPlans([programme], records, []);
  expect(result.matched.map(pair => [pair.current.block.id, pair.method])).toEqual([['manual', 'manual']]);
  expect(result.unmatchedCurrent.map(record => record.block.id)).toEqual(['automatic']);
  programme.rows[0].blks[1].lmsSourceModuleId = '';
  result = matchLmsPlans([programme], records, []);
  expect(result.matched.map(pair => [pair.current.block.id, pair.method])).toEqual([['automatic', 'automatic']]);
});

test('duplicate and missing manual targets never fall back automatically; explicit manual pairs can cross programmes', () => {
  const programme = group([block('one', 'Marketing', { lmsSourceModuleId: 'chosen' }), block('two', 'Marketing', { lmsSourceModuleId: 'chosen' })]);
  const records = presentLmsRows([matchingSource('chosen', 'Marketing')], [programme]);
  expect(matchLmsPlans([programme], records, []).matched).toEqual([]);
  expect(matchLmsPlans([programme], records, []).review).toHaveLength(2);
  programme.rows[0].blks.pop();
  programme.rows[0].blks[0].lmsSourceModuleId = 'missing';
  expect(matchLmsPlans([programme], records, []).unmatchedCurrent[0].reason).toContain('saved LMS match is unavailable');
  programme.rows[0].blks[0].lmsSourceModuleId = 'chosen';
  const otherProgramme = presentLmsRows([matchingSource('chosen', 'Marketing', { programme: 'Marketing Manager Level 6' })], [programme]);
  expect(matchLmsPlans([programme], otherProgramme, []).matched).toMatchObject([
    { method: 'manual', current: { block: { id: 'one' } }, lms: { sourceModuleId: 'chosen', planProgrammeId: 'mm-lvl6' } },
  ]);
});

test('merge keeps manual pairs adjacent despite different dates, names and programmes, without duplicating blocks', () => {
  const programme = group([
    block('paired', 'Local workshop', { lmsSourceModuleId: 'chosen', groupName: 'G1' }),
    block('other', 'Unpaired workshop', { startDate: '2025-06-01' }),
    block('automatic', 'Same title'),
  ]);
  const records = presentLmsRows([
    source('chosen', 'Entirely different title', { programme: 'Marketing Manager Level 6', cohortName: 'Different cohort',
      groupName: 'Other group', startDate: '2024-01-01', endDate: '2024-02-01' }),
    source('unpaired', 'Middle module', { startDate: '2025-01-01', endDate: '2025-02-01' }),
    source('automatic', 'Same title'),
  ], [programme]);
  const before = JSON.stringify({ programme, records });
  const layout = buildMergedTimelineLayout(records, [programme]);
  const rows = layout.groups[0].rows;
  const pair = rows.filter(row => row.manualMatch);
  expect(pair).toHaveLength(2);
  expect(pair.map(row => row.planSource)).toEqual(['Current', 'LMS']);
  expect(rows.indexOf(pair[1])).toBe(rows.indexOf(pair[0]) + 1);
  expect(pair[0].manualMatch?.id).toBe(pair[1].manualMatch?.id);
  expect(pair[0].manualMatch?.label).toBe('Local workshop ↔ Entirely different title');
  expect(pair[0].blks[0]).toMatchObject({ id: 'paired', startDate: '2026-01-05' });
  expect(pair[1].blks[0]).toMatchObject({ source: 'LMS', moduleCatalogueId: 'chosen', startDate: '2024-01-01', endDate: '2024-02-01' });
  const blocks = layout.groups.flatMap(group => group.rows.flatMap(row => row.blks));
  expect(blocks).toHaveLength(6);
  expect(blocks.filter(block => block.moduleCatalogueId === 'chosen')).toHaveLength(1);
  expect(blocks.filter(block => block.id === 'paired')).toHaveLength(1);
  expect(JSON.stringify({ programme, records })).toBe(before);
  programme.rows[0].blks[0].lmsSourceModuleId = '';
  expect(buildMergedTimelineLayout(records, [programme]).groups.flatMap(group => group.rows).some(row => row.manualMatch)).toBe(false);
});

test('merge retains a manually paired LMS module with invalid dates as a labelled empty lane', () => {
  const programme = group([block('paired', 'Local workshop', { lmsSourceModuleId: 'invalid' })]);
  const records = presentLmsRows([source('invalid', 'Undated LMS workshop', { startDate: null, endDate: '2026-02-30' })], [programme]);
  const layout = buildMergedTimelineLayout(records, [programme]);
  expect(layout.groups[0].rows.map(row => row.planSource)).toEqual(['Current', 'LMS']);
  expect(layout.groups[0].rows[1]).toMatchObject({ blks: [], manualMatch: {
    moduleName: 'Undated LMS workshop', dateWarning: 'Missing or invalid dates: Not provided to 2026-02-30',
  } });
  expect(layout.undrawableCount).toBe(1);
});

test('missing LMS cohort names use a uniquely confirmed Training Plan cohort for display', () => {
  const programme = group([block('one', 'custom-1', { groupName: 'G2-Thursday' })]);
  programme.rows[0].label = 'May 2026';
  const modules = [{ id: 'custom-1', name: 'Marketing', defaultSessions: 1, bg: '', tx: '' }];
  const original = [source('source', 'Marketing', { groupName: 'G2-Marketing Thursday', cohortName: '' })];
  const before = JSON.stringify({ programme, original });
  const records = presentLmsRows(original, [programme], modules);
  expect(lmsCohortDisplayName(records[0])).toBe('May 2026');
  expect(records[0].matchedPlanCohort).toEqual({ id: 'c1', name: 'May 2026' });
  expect(records[0].cohortName).toBe('');
  expect(records[0].cohortId).toBeUndefined();
  expect(buildLmsTimelineLayout(records, [programme], modules).groups[0].rows[0].label).toBe('May 2026');
  // Matching uses the original source fields, including a missing cohort name.
  expect(matchLmsPlans([programme], records, modules).matched).toHaveLength(1);
  expect(JSON.stringify({ programme, original })).toBe(before);
});

test('cohort display inference preserves source names and rejects ambiguous or incomplete identities', () => {
  const programme = group([block('one', 'Marketing', { groupName: 'G1-Wednesday' })]);
  const infer = (overrides: Partial<LmsReferenceRow> = {}) => presentLmsRows([
    source('source', 'Marketing', { groupName: 'G1-Marketing Wednesday', ...overrides }),
  ], [programme]);
  expect(lmsCohortDisplayName(infer({ cohortName: 'Actual LMS cohort' })[0])).toBe('Actual LMS cohort');
  for (const overrides of [
    { startDate: '2026-01-12' }, { startDate: null }, { startDate: '2026-02-30' },
    { module: 'Other module' }, { groupName: 'G2-Thursday' }, { programme: 'Marketing Manager Level 6' },
  ]) {
    expect(infer(overrides)[0].matchedPlanCohort).toBeUndefined();
  }
  programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'Another cohort', blks: [block('two', 'Marketing', { groupName: 'G1-Wednesday' })] });
  expect(infer()[0].matchedPlanCohort).toBeUndefined();
  programme.rows.pop();
  const repeated = presentLmsRows([
    source('source-1', 'Marketing', { groupName: 'G1-Wednesday' }),
    source('source-2', 'Marketing', { groupName: 'G1-Wednesday' }),
  ], [programme]);
  expect(repeated.every(record => !record.matchedPlanCohort)).toBe(true);
});

test('missing LMS group names show the full Training Plan name for confirmed display matches', () => {
  const programme = group([
    block('one', 'Marketing', { groupId: 'g1', groupName: 'G1-Wednesday' }),
    block('two', 'Marketing', { groupId: 'g2', groupName: 'G2-Thursday', startDate: '2026-01-08' }),
  ]);
  const original = [matchingSource('source', 'Marketing', { startDate: '2026-01-08' })];
  const before = JSON.stringify({ programme, original });
  const records = presentLmsRows(original, [programme]);
  expect(lmsGroupDisplayName(records[0])).toBe('G2-Thursday');
  expect(records[0].matchedPlanGroup).toEqual({ id: 'g2', name: 'G2-Thursday' });
  expect(records[0].groupName).toBeUndefined();
  expect(lmsRecordGroup(records[0])).toBe('G2-Thursday');
  expect(buildLmsTimelineLayout(records, [programme]).groups[0].rows[0].blks[0].groupName).toBe('G2-Thursday');
  expect(matchLmsPlans([programme], records, []).matched).toHaveLength(1);
  expect(JSON.stringify({ programme, original })).toBe(before);
});

test('group display inference preserves source names and refuses ambiguous or changed dates', () => {
  const programme = group([block('one', 'Marketing', { groupName: 'G1-Wednesday' })]);
  const infer = (overrides: Partial<LmsReferenceRow> = {}) => presentLmsRows([
    matchingSource('source', 'Marketing', overrides),
  ], [programme]);
  expect(lmsGroupDisplayName(infer({ groupName: 'Actual LMS group' })[0])).toBe('Actual LMS group');
  expect(infer({ groupName: 'Actual LMS group' })[0].matchedPlanGroup).toBeUndefined();
  for (const startDate of ['2026-01-12', null, '2026-02-30']) {
    expect(lmsRecordGroup(infer({ startDate })[0])).toBe('Group not provided');
  }
  expect(lmsRecordGroup(infer({ module: 'Marketing G9' })[0])).toBe('G9');
  const bothMissing = infer({ cohortName: null })[0];
  expect(lmsCohortDisplayName(bothMissing)).toBe('January cohort');
  expect(lmsGroupDisplayName(bothMissing)).toBe('G1-Wednesday');
  programme.rows[0].blks.push(block('two', 'Marketing', { groupName: 'G2-Thursday' }));
  expect(lmsRecordGroup(infer()[0])).toBe('Group not provided');
  programme.rows[0].blks.pop();
  const repeated = presentLmsRows([matchingSource('a', 'Marketing'), matchingSource('b', 'Marketing')], [programme]);
  expect(repeated.every(record => !record.matchedPlanGroup)).toBe(true);
});

test('LMS layout orders unknown cohorts newest first without copying current groups', () => {
  const programme = group([
    block('a', 'social', { groupName: 'G1 - Tues' }),
    block('b', 'custom', { groupName: 'G1 - Tues' }),
    block('c', 'Absent', { groupName: 'G2 - Fri - 9AM' }),
  ]);
  programme.color = '#E8D000';
  programme.rows[0].dateLbl = '2027-01-08';
  programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February 2026', dateLbl: '2026-02-01',
    blks: [block('d', 'social', { groupName: 'G1 - Wed - 9AM' })] });
  const modules = [{ id: 'custom', name: 'Custom module', defaultSessions: 1, bg: '', tx: '' }];
  const records = presentLmsRows([source('1', ' social MEDIA ', { startDate: '2024-06-03', endDate: '2024-08-12' }),
    source('2', 'Custom module')], [programme]);
  const before = JSON.stringify({ programme, records, modules });
  const result = buildLmsTimelineLayout(records, [programme]);
  expect(result.groups[0]).toMatchObject({ name: 'ME L4', color: '#115E59' });
  expect(result.groups[0].rows.map(row => [row.label, row.dateLbl])).toEqual([
    ['Cohort not provided', '2026-01-05'],
    ['Cohort not provided', '2024-06-03'],
  ]);
  const blocks = result.groups[0].rows.flatMap(row => row.blks);
  expect(blocks).toHaveLength(2);
  expect(blocks.find(item => item.moduleCatalogueId === '1')).toMatchObject({ source: 'LMS', groupName: 'Group not provided', startDate: '2024-06-03', endDate: '2024-08-12', sessions: 0, tutor: '' });
  expect(result.groups[0].rows.every(row => row.blks.length > 0)).toBe(true);
  expect(new Set(blocks.map(item => item.id)).size).toBe(blocks.length);
  expect(result.undrawableCount).toBe(0);
  expect(JSON.stringify({ programme, records, modules })).toBe(before);
});

test('LMS layout retains repeated names in their source months and never fills missing dates', () => {
  const programme = group([block('a', 'Repeated'), block('b', 'Missing')]);
  const records = presentLmsRows([
    source('1', 'Repeated'), source('2', 'Repeated', { startDate: '2025-01-01', endDate: '2025-01-10' }),
    source('3', 'Missing', { startDate: null }), source('4', 'Invalid', { startDate: '2026-02-30' }),
    source('5', 'Reversed', { endDate: '2025-01-01' }),
    source('6', 'Other programme', { programme: 'Marketing Manager Level 6' }),
  ], [programme]);
  const result = buildLmsTimelineLayout(records, [programme]);
  expect(result.undrawableCount).toBe(3);
  expect(result.groups[0].rows.map(row => row.dateLbl)).toEqual(['2026-01-05', '2025-01-01']);
  expect(result.groups[0].rows[0].blks[0].moduleCatalogueId).toBe('1');
  expect(result.groups[1].rows[0].blks[0].moduleCatalogueId).toBe('6');
  expect(result.groups.flatMap(item => item.rows.flatMap(row => row.blks)).map(item => item.moduleCatalogueId).sort()).toEqual(['1', '2', '6']);
});

test('LMS cohorts retain all modules across months, sort newest first and keep equal names with different IDs separate', () => {
  const programme = group([]);
  const records = presentLmsRows([
    source('a', 'First module', { cohortId: 'older', cohortName: 'Shared label', startDate: '2025-09-01', endDate: '2025-10-01' }),
    source('b', 'Later module', { cohortId: 'older', cohortName: 'Shared label', startDate: '2027-01-01', endDate: '2027-02-01' }),
    source('c', 'Newest cohort module', { cohortId: 'newer', cohortName: 'Shared label', startDate: '2026-09-01', endDate: '2026-10-01' }),
    source('d', 'Other programme module', { cohortId: 'newer', cohortName: 'Shared label', programme: 'Marketing Manager Level 6' }),
    source('e', 'Missing dates', { cohortId: 'older', cohortName: 'Shared label', startDate: null }),
  ], [programme]);
  const before = JSON.stringify(records);
  const result = buildLmsTimelineLayout(records, [programme]);
  expect(result.groups[0].rows.map(row => [row.dateLbl, row.blks.map(blk => blk.moduleCatalogueId)]))
    .toEqual([['2026-09-01', ['c']], ['2025-09-01', ['a', 'b']]]);
  expect(result.groups[0].rows.every(row => row.blks.every(blk => blk.groupName === 'Group not provided'))).toBe(true);
  expect(result.groups[1].rows[0].blks.map(blk => blk.moduleCatalogueId)).toEqual(['d']);
  expect(result.undrawableCount).toBe(1);
  expect(JSON.stringify(records)).toBe(before);
});

test('LMS groups follow matching cohort module assignments, retain title groups and leave ambiguous assignments unassigned', () => {
  const programme = group([
    block('social', 'social', { groupName: 'G1 - Tuesday' }),
    block('other', 'Workshop', { groupName: 'G2 - Friday' }),
    block('shared-1', 'Shared', { groupName: 'G1 - Tuesday' }),
    block('shared-2', 'Shared', { groupName: 'G2 - Friday' }),
  ]);
  const records = presentLmsRows([
    source('one', 'Social Media', { cohortName: ' January COHORT ', tutorName: 'LMS Tutor', startDate: '2025-09-01' }),
    source('two', 'Workshop', { cohortName: 'January cohort' }),
    source('three', 'Shared', { cohortName: 'January cohort' }),
    source('four', 'Marketing Technology G2', { cohortName: 'January cohort' }),
    source('five', 'Workshop', { cohortName: 'Other cohort' }),
    source('six', 'Marketing Technology Group 9', { cohortName: 'Other cohort' }),
  ], [programme]);
  const before = JSON.stringify({ programme, records });
  const result = buildLmsTimelineLayout(records, [programme]);
  const blocks = result.groups.flatMap(group => group.rows.flatMap(row => row.blks));
  expect(Object.fromEntries(blocks.map(block => [block.moduleCatalogueId, block.groupName]))).toEqual({
    one: 'Group not provided', two: 'G2 - Friday', three: 'Group not provided', four: 'G2', five: 'Group not provided', six: 'G9',
  });
  expect(blocks.find(block => block.moduleCatalogueId === 'one')).toMatchObject({ startDate: '2025-09-01', tutor: 'LMS Tutor', sessions: 0 });
  expect(JSON.stringify({ programme, records })).toBe(before);
});

test('LMS presentation shows only the five selected programmes and retains their undated modules', () => {
  const records = presentLmsRows([
    source('me', 'Executive module'),
    source('mm', 'Manager module', { programme: 'Marketing Manager Level 6' }),
    source('apm', 'Project manager module', { programme: 'Associate Project Manager Level 4' }),
    source('pcp', 'Controls module', { programme: 'Project Controls Professional Level 6' }),
    source('mba', 'MBA module', { programme: ' MBA ' }),
    source('undated', 'Selected undated module', { startDate: null }),
    source('custom', 'New programme module', { programme: 'New programme', sourceProgrammeId: 'new' }),
    source('missing', 'Undated module', { programme: null, sourceProgrammeId: null, startDate: null }),
  ], []);
  expect(records.map(row => row.sourceModuleId)).toEqual(['me', 'undated', 'mm', 'apm', 'pcp', 'mba']);
  const result = buildLmsTimelineLayout(records, []);
  expect(result.groups.map(programme => programme.name)).toEqual(['ME L4', 'MM LVL6', 'APM lv4', 'PCP', 'MBA']);
  expect(result.undrawableCount).toBe(1);
});

test('LMS tutor names stay with their source IDs across repeated module names and programmes', () => {
  const programmes = [group([])];
  const records = presentLmsRows([
    source('one', 'Repeated', { tutorName: ' Tutor One ' }),
    source('two', 'Repeated', { tutorName: 'Tutor Two' }),
    source('three', 'Repeated', { tutorName: 'Other Tutor', programme: 'Marketing Manager Level 6' }),
    source('none', 'Unassigned', { tutorName: null }),
  ], programmes);
  const result = buildLmsTimelineLayout(records, programmes);
  expect(Object.fromEntries(result.groups.flatMap(programme => programme.rows.flatMap(row => row.blks.map(blk => [blk.moduleCatalogueId, blk.tutor])))))
    .toEqual({ one: 'Tutor One', two: 'Tutor Two', three: 'Other Tutor', none: '' });
});

test('LMS layout omits undrawable programmes and shares Training Plan module-family colours', () => {
  const programme = group([block('a', 'social', { groupName: 'Tuesday group' })]);
  const missing = buildLmsTimelineLayout(presentLmsRows([source('1', 'Social Media', { startDate: null })], [programme]), [programme]);
  expect(missing.groups).toEqual([]);
  expect(missing.undrawableCount).toBe(1);
  const records = presentLmsRows([
    source('1', 'Social Media'), source('2', 'CIM Social Media Marketing'),
    source('3', 'Martech'), source('4', 'Nathan - Marketing Technology-(MarTech) G4'),
    source('5', 'MarTech Foundations — TEST', { startDate: '2025-03-01' }),
    source('6', ' social   MEDIA -June 2026', { programme: 'Marketing Manager Level 6' }),
    source('7', 'Other module'), source('8', 'OTHER MODULE copy'),
  ], [programme]);
  const matched = buildLmsTimelineLayout(records, [programme]);
  const colours = new Map(matched.groups.flatMap(item => item.rows.flatMap(row => row.blks.map(blk => [blk.moduleCatalogueId, blk.color] as const))));
  expect(colours.get('1')).toBe('#4A6DB0');
  expect(colours.get('2')).toBe(colours.get('1'));
  expect(colours.get('6')).toBe(colours.get('1'));
  expect(colours.get('3')).toBe('#B8860B');
  expect(colours.get('4')).toBe(colours.get('3'));
  expect(colours.get('5')).toBe(colours.get('3'));
  expect(colours.get('3')).not.toBe(colours.get('1'));
  expect(colours.get('7')).toBe(colours.get('8'));
  for (const module of matched.customModules) {
    expect(module.bg).toBe(colours.get(module.id.replace('lms-module:', '')));
  }
  programme.rows[0].blks[0].color = '#20869B';
  const reordered = buildLmsTimelineLayout([...records].reverse(), [programme]);
  for (const blk of reordered.groups.flatMap(item => item.rows.flatMap(row => row.blks))) {
    expect(blk.color).toBe(['1', '2', '6'].includes(blk.moduleCatalogueId!) ? '#20869B' : colours.get(blk.moduleCatalogueId));
  }
});

test('LMS colours follow programme-specific block overrides and custom module names without changing comparisons', () => {
  const programmes = [
    group([block('social-4', 'short-social', { color: '#839800' }), block('custom', 'custom-1')]),
    group([block('social-6', 'social', { color: '#20869B' })], 'mm-lvl6'),
  ];
  const customModules = [
    { id: 'custom-1', name: 'Special workshop', defaultSessions: 1, bg: '#B2686D', tx: '#fff' },
    { id: 'short-social', name: 'Social', defaultSessions: 1, bg: '#4A6DB0', tx: '#fff' },
  ];
  const records = presentLmsRows([
    source('social-4', 'CIM Social Media Marketing'),
    matchingSource('social-6', 'Social Media', { programme: 'Marketing Manager Level 6' }),
    matchingSource('custom', ' special   workshop '),
  ], programmes);
  const before = compareLmsPlans(programmes, records, customModules);
  const result = buildLmsTimelineLayout(records, programmes, customModules);
  const colours = new Map(result.groups.flatMap(programme => programme.rows.flatMap(row => row.blks.map(blk => [blk.moduleCatalogueId, blk.color]))));
  expect(colours.get('social-4')).toBe('#839800');
  expect(colours.get('social-6')).toBe('#20869B');
  expect(colours.get('custom')).toBe('#B2686D');
  expect(compareLmsPlans(programmes, records, customModules)).toEqual(before);
  expect(before.unchanged).toBe(2);
});

test('LMS layout sorts start and creation dates together, preserves provenance and keeps programme order', () => {
  const programmes = [group([]), group([], 'mm-lvl6')];
  const records = presentLmsRows([
    source('late', 'Later module', { startDate: '2026-01-15' }),
    source('other', 'Other programme', { programme: 'Marketing Manager Level 6' }),
    source('early', 'Earlier module', { startDate: '2026-01-01' }),
    source('created', 'Creation date module', { startDate: '2026-01-10', startDateSource: 'created_at' }),
    source('new', 'Newest module', { startDate: '2027-02-01', endDate: '2027-02-05' }),
    source('missing', 'Missing dates', { startDate: null }),
  ], programmes);
  expect(records.filter(row => row.planProgrammeId === 'me-lvl4').map(row => row.sourceModuleId))
    .toEqual(['new', 'late', 'created', 'early', 'missing']);
  const result = buildLmsTimelineLayout(records, programmes);
  expect(result.groups.map(programme => programme.name)).toEqual(['ME L4', 'MM LVL6']);
  expect(result.groups[0].rows.map(row => row.dateLbl)).toEqual(['2027-02-01', '2026-01-01']);
  expect(result.groups[0].rows[1].blks.map(item => item.moduleCatalogueId)).toEqual(['early', 'created', 'late']);
  expect(result.groups[0].rows[1].blks[1].startDateSource).toBe('created_at');
});

test('merged timeline groups both sources under one programme and preserves unpaired programmes and saved records', () => {
  const groups = [group([block('a', 'social')]), group([block('b', 'Current only')], 'mm-lvl6')];
  const modules = [{ id: 'current-custom', name: 'Current custom module', defaultSessions: 2, bg: '#123456', tx: '#fff' }];
  const records = presentLmsRows([
    source('a', 'Social Media', { startDate: '2024-01-01', endDate: '2024-02-01' }),
    source('missing', 'Undated module', { endDate: null }),
    source('mba', 'LMS only', { programme: 'MBA' }),
  ], groups, modules);
  const before = JSON.stringify({ groups, modules, records });
  const merged = buildMergedTimelineLayout(records, groups, modules);
  expect(merged.groups.map(group => [group.name, group.rows.map(row => row.planSource)])).toEqual([
    ['ME L4', ['Current', 'LMS']], ['MM LVL6', ['Current']], ['MBA', ['LMS']],
  ]);
  expect(new Set(merged.groups.map(group => group.id)).size).toBe(merged.groups.length);
  for (const programme of merged.groups) {
    expect(new Set(programme.rows.map(row => row.id)).size).toBe(programme.rows.length);
  }
  const blocks = merged.groups.flatMap(group => group.rows.flatMap(row => row.blks));
  expect(blocks).toHaveLength(4);
  expect(blocks.filter(block => block.source === 'LMS')).toHaveLength(2);
  expect(blocks.find(block => block.moduleCatalogueId === 'a')).toMatchObject({
    source: 'LMS', startDate: '2024-01-01', endDate: '2024-02-01', sessions: 0,
  });
  expect(merged.customModules).toContainEqual(modules[0]);
  expect(merged.undrawableCount).toBe(1);
  expect(JSON.stringify({ groups, modules, records })).toBe(before);
});

test('merged timeline interleaves sources by first module date, newest first, with undated rows last', () => {
  const programme = group([block('current-old', 'Old current', { startDate: '2025-01-05' })]);
  programme.rows[0].dateLbl = '2028-01-01'; // Display labels must not override module dates.
  programme.rows.push(
    { ...programme.rows[0], id: 'new', label: 'New current', dateLbl: '', blks: [
      block('current-later', 'Later module', { startDate: '2027-01-05' }),
      block('current-new', 'New current', { startDate: '2026-01-05' }),
    ] },
    { ...programme.rows[0], id: 'empty', label: 'Undated', dateLbl: '', blks: [] },
    { ...programme.rows[0], id: 'fallback', label: 'Date only', dateLbl: '2023-01-01', blks: [] },
    { ...programme.rows[0], id: 'invalid', label: 'Invalid dates', dateLbl: '2026-02-30',
      blks: [block('invalid', 'Invalid', { startDate: 'invalid' })] },
  );
  const records = presentLmsRows([
    source('newest', 'Newest LMS', { cohortName: 'Newest LMS', startDate: '2027-01-05', endDate: '2027-01-19' }),
    source('middle', 'Middle LMS', { cohortName: 'Middle LMS', startDate: '2025-07-05', endDate: '2025-07-19' }),
    source('oldest', 'Oldest LMS', { cohortName: 'Oldest LMS', startDate: '2024-01-05', endDate: '2024-01-19' }),
  ], [programme]);
  const before = JSON.stringify({ programme, records });
  const rows = buildMergedTimelineLayout(records, [programme]).groups[0].rows;
  expect(rows.map(row => [row.label, row.planSource])).toEqual([
    ['Newest LMS', 'LMS'], ['New current', 'Current'], ['Middle LMS', 'LMS'],
    ['January cohort', 'Current'], ['Oldest LMS', 'LMS'], ['Date only', 'Current'],
    ['Undated', 'Current'], ['Invalid dates', 'Current'],
  ]);
  expect(JSON.stringify({ programme, records })).toBe(before);
});

test('source tabs merge both timelines on one date axis and keep comparison inside module editing', async ({ page }) => {
  test.setTimeout(90_000);
  const user = { id: 1, email: 'comparison@example.com', username: 'comparison', displayName: 'Comparison',
    groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  const names = ['Same module', 'Changed module', 'Partial module', 'Current module', 'Repeated module', 'Third overlapping module'];
  const items = names.map((moduleName, index) => ({
    id: index + 1, programmeId: 'me-lvl4', cohortId: index === 4 ? 'c2' : 'c1', cohortName: index === 4 ? 'February cohort' : 'January cohort', program: 'ME L4',
    startingDateLabel: index === 4 ? '2026-02-01' : '2026-01-01', moduleName, groupName: index === 2 ? 'Group 2' : 'Group 1', coachName: '', tutorName: index === 0 ? 'LMS Tutor One' : index === 1 ? 'Plan Tutor Two' : '', tutorProfileId: '',
    startDate: index === 1 ? '2026-01-12' : '2026-01-05', endDate: '2026-01-19', sessionsNumber: '3', sessionWeekDay: 'monday',
    sessionStartTime: '09:00', sessionEndTime: '10:00', sessionKsbMappings: [], sessionCoverage: [], ksbProfileId: '',
    programmeDisplayOrder: 0, cohortDisplayOrder: index === 4 ? 1 : 0,
    notes: `__program_id:me-lvl4\n__cohort_id:${index === 4 ? 'c2' : 'c1'}\n__group_id:${index === 2 ? 'g2' : 'g1'}\n__block_id:b${index}\n__module_color:${index === 0 ? '#20869B' : '#B2686D'}`,
  }));
  const records = [source('1', names[0], { groupName: 'Group 1' }), source('2', names[1], { groupName: 'Group 1', startDate: '2026-01-12', endDate: '2026-02-02', startDateSource: 'created_at' }),
    source('3', names[2], { groupName: 'Group 2', endDate: null }),
    source('4', names[4], { startDate: '2026-02-05', endDate: '2026-02-19' }),
    source('5', names[4], { startDate: '2026-02-05', endDate: '2026-02-19' }),
    source('6', 'LMS module', { startDate: '2024-03-01', endDate: '2024-03-15' }), source('7', names[5], { groupName: 'Group 1' }),
    source('excluded', 'Excluded programme module', { programme: 'Other programme' })];
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/training-plan') && route.request().method() !== 'GET') writes.push(path);
    let body: unknown = [];
    let headers = {};
    if (path === '/api/auth/access/') body = user;
    if (path === '/api/health/') body = { status: 'ok' };
    if (path === '/api/training-plan/') body = { items, version: 'v1', count: items.length };
    if (path === '/api/training-plan-bootstrap/') body = {
      trainingPlan: { items, version: 'v1', count: items.length },
      programConfigs: [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }],
      moduleDefinitions: [], catalogModules: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [],
      holidays: { items: [], version: 'h1' }, versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
    };
    if (path === '/api/training-plan-program-configs/') {
      body = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }];
      headers = { 'X-KBC-Training-Plan-Program-Configs-Version': 'p1' };
    }
    if (path === '/api/training-plan-modules/') headers = { 'X-KBC-Training-Plan-Modules-Version': 'm1' };
    if (path === '/api/training-plan-holidays/') body = { items: [], version: 'h1' };
    if (path === '/api/training-plan/lms-reference/') body = { reference: {
      id: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: records.length, contentSha256: 'test',
      records: records.map(({ groupName: _groupName, ...row }) => row),
    } };
    if (path === '/api/training-plan/lms-reference/tutors/') body = { tutorNames: { '1': 'LMS Tutor One', '2': 'LMS Tutor Two' } };
    if (path === '/api/training-plan/lms-reference/cohorts/') body = { cohorts: Object.fromEntries(records.map(row => [row.sourceModuleId, {
      cohortId: row.sourceModuleId === '6' ? 'old-lms-cohort' : ['4', '5'].includes(row.sourceModuleId) ? 'feb-lms-cohort' : 'jan-lms-cohort',
      cohortName: row.sourceModuleId === '2' ? '' : row.sourceModuleId === '6' ? 'March 2024 LMS cohort' : ['4', '5'].includes(row.sourceModuleId) ? 'February cohort' : 'January cohort',
      groupName: row.sourceModuleId === '2' ? '' : row.groupName || '',
    }])) };
    await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/training-plan');
  const current = page.locator('#current-training-plan-panel');
  await expect(current).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare plans', exact: true })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Plan differences', exact: true })).toHaveCount(0);
  await expect(current.getByRole('button', { name: /Monthly Module Breakdown/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(current.getByTitle('Expand programme', { exact: true })).toHaveCount(1);
  await expect(current.locator('[data-timeline-block-id="b0"]')).toHaveCount(0);
  await current.getByTitle('Expand programme', { exact: true }).click();
  await expect(current.getByTitle('Collapse programme', { exact: true })).toHaveAttribute('aria-expanded', 'true');
  await current.getByTitle('Collapse programme', { exact: true }).click();
  await expect(current.locator('[data-timeline-block-id="b0"]')).toHaveCount(0);
  await current.getByTitle('Expand programme', { exact: true }).click();
  const sourceColour = await current.locator('[data-timeline-block-id="b0"]').evaluate(bar => getComputedStyle(bar).backgroundColor);
  // Merge must load the reference directly, without opening the LMS tab first.
  await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
  await expect(merged.getByRole('heading', { name: 'Merged Training Plans', exact: true })).toBeVisible();
  await expect(current).toBeHidden();
  await expect(page.locator('#training-plan-lms-reference')).toBeHidden();
  await expect(merged.locator('.training-plan-gantt-scroll')).toHaveCount(1);
  await expect(merged.locator('[data-programme-target]')).toHaveCount(1);
  await expect(merged.getByTitle('ME L4', { exact: true })).toHaveCount(1);
  await expect(merged.getByTitle('Collapse programme', { exact: true })).toHaveCount(1);
  await expect(merged.locator('[data-plan-source="Current"]')).toHaveCount(2);
  await expect(merged.locator('[data-plan-source="LMS"]')).toHaveCount(3);
  expect(await merged.locator('[data-plan-source]').evaluateAll(rows => rows.map(row => row.getAttribute('data-plan-source'))))
    .toEqual(['LMS', 'Current', 'Current', 'LMS', 'LMS']);
  const mergedCurrent = merged.locator('[data-source="Current"][data-timeline-block-id="b0"]');
  const mergedLms = merged.locator('[data-source="LMS"][title^="LMS: Same module."]');
  await expect(mergedCurrent).toHaveCount(1);
  await expect(mergedLms).toHaveCount(1);
  expect(await mergedCurrent.evaluate(element => element.style.left)).toBe(await mergedLms.evaluate(element => element.style.left));
  await expect(mergedLms).toHaveCSS('background-color', sourceColour);
  await expect(merged.locator('[data-source="LMS"][title*="2024-03-01"]')).toHaveCount(1);
  await expect(merged.getByRole('status')).toContainText('1 LMS module has missing or invalid dates');
  await expect(merged.getByTitle('Edit cohort', { exact: true })).toHaveCount(0);
  await merged.getByTitle('Collapse programme', { exact: true }).click();
  await expect(mergedCurrent).toHaveCount(0);
  await expect(mergedLms).toHaveCount(0);
  await expect(merged.locator('[data-plan-source]')).toHaveCount(0);
  await expect(merged.getByTitle('Expand programme', { exact: true })).toHaveCount(1);
  await merged.getByTitle('Expand programme', { exact: true }).click();
  await expect(mergedCurrent).toHaveCount(1);
  await expect(mergedLms).toHaveCount(1);
  await merged.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: 'Week', exact: true }).click();
  await expect(merged.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
  await expect(current).toBeHidden();
  const lms = page.getByRole('region', { name: 'LMS reference timeline', exact: true });
  await expect(lms).toBeVisible();
  await expect(lms.getByRole('button', { name: /Monthly Module Breakdown/ })).toBeVisible();
  await expect(lms.getByRole('button', { name: /Monthly Module Breakdown/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(lms.getByTitle('Expand programme', { exact: true })).toHaveCount(1);
  await lms.getByTitle('Expand programme', { exact: true }).click();
  await expect(lms.locator('details').filter({ hasText: 'LMS modules' })).not.toHaveAttribute('open');
  await lms.locator('summary').filter({ hasText: /^LMS modules/ }).click();
  const moduleList = lms.getByRole('table', { name: 'All captured LMS modules, including missing or invalid dates', exact: true });
  await expect(moduleList.locator('tbody tr')).toHaveCount(7);
  await lms.getByLabel('LMS modules dates', { exact: true }).selectOption('missing');
  await expect(moduleList.locator('tbody tr')).toHaveCount(1);
  await expect(moduleList).toContainText('Partial module');
  await lms.getByRole('button', { name: 'Reset modules filters', exact: true }).click();
  await lms.getByLabel('Search LMS modules', { exact: true }).fill('LMS Tutor One');
  await expect(moduleList.locator('tbody tr')).toHaveCount(1);
  await lms.getByRole('button', { name: 'Reset modules filters', exact: true }).click();
  await expect(lms.locator('[data-source="LMS"][title^="LMS: Same module."]')).toHaveCSS('background-color', sourceColour);
  await expect(lms.getByText(/1 LMS module uses its creation date/)).toBeVisible();
  const downloading = page.waitForEvent('download');
  await lms.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloading;
  const workbook = XLSX.read(readFileSync((await download.path())!), { type: 'buffer' });
  const exported = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['LMS Training Plan']);
  expect(exported).toHaveLength(7);
  expect(exported.find(row => row['Source Module ID'] === '1')?.['Tutor Name']).toBe('LMS Tutor One');
  await lms.locator('[data-source="LMS"][title^="LMS: Changed module."]').click();
  await expect(page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true })).toContainText('LMS Tutor Two');
  await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
  await expect(lms.getByTitle('Edit cohort', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(lms).toBeVisible();
  await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  await expect(merged).toBeVisible();
  await expect(merged.locator('.training-plan-gantt-scroll')).toHaveCount(1);
  await expect(merged.locator('[data-programme-target]')).toHaveCount(1);
  await expect(merged.getByTitle('Collapse programme', { exact: true })).toHaveCount(1);
  await expect(merged.locator('[data-plan-source="Current"]')).toHaveCount(2);
  await expect(merged.locator('[data-plan-source="LMS"]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Current Training Plan', exact: true }).click();
  await expect(current).toBeVisible();
  await expect(lms).toBeHidden();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
