import { expect, test } from '@playwright/test';
import { compareLmsPlans, presentLmsRows } from '../../src/pages/apprenticeships-timeline/lmsComparison';
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

test('comparison stays within programmes, resolves display names and does not equate independent catalogue IDs', () => {
  const groups = [group([block('one', 'social'), block('two', 'custom-1', { moduleCatalogueId: '2' })]), group([block('three', 'Social Media')], 'mm-lvl6')];
  const records = presentLmsRows([source('1', ' social   media '), source('2', 'Unrelated module'), source('3', 'Custom module')], groups);
  const result = compareLmsPlans(groups, records, [{ id: 'custom-1', name: 'Custom module', defaultSessions: 1, bg: '', tx: '' }]);
  expect(result.matching).toBe(2);
  expect(result.differences.map(row => [row.module, row.kind])).toEqual([
    ['Social Media', 'currentOnly'], ['Unrelated module', 'lmsOnly'],
  ]);
  // Presentation must never mutate the source snapshot.
  expect(records[0].programme).toBe('ME L4');
});

test('comparison retains separate cohort dates and flags ambiguous and invalid source ranges', () => {
  const programme = group([block('a', 'Repeated'), block('b', 'Impossible'), block('c', 'Reversed'), block('d', 'Missing'), block('e', 'Same')]);
  programme.rows.push({ ...programme.rows[0], id: 'c2', label: 'February cohort', blks: [block('f', 'Same', { startDate: '2026-02-02', endDate: '2026-02-16' })] });
  const records = presentLmsRows([
    source('1', 'Repeated'), source('2', 'Repeated'), source('3', 'Impossible', { startDate: '2026-02-30' }),
    source('4', 'Reversed', { startDate: '2026-01-20' }), source('5', 'Missing', { startDate: null }), source('6', 'Same'),
  ], [programme]);
  const result = compareLmsPlans([programme], records, []);
  expect(result.matching).toBe(1);
  expect(result.differences.map(row => row.kind)).toEqual(['ambiguous', 'incomplete', 'incomplete', 'incomplete', 'dates']);
  expect(result.differences[0]).toMatchObject({ lms: null, matchCount: 2 });
  expect(result.differences.at(-1)).toMatchObject({ cohort: 'February cohort', current: { startDate: '2026-02-02' } });
});

test('comparison follows the timeline schedule and applies only the cohort selected holidays', () => {
  const programme = group([block('a', 'Scheduled module', { days: ['monday'] })]);
  const records = presentLmsRows([source('1', 'Scheduled module')], [programme]);
  const holidays = [{ id: 'h1', label: 'Break', startDate: '2026-01-12', endDate: '2026-01-12', type: 'holiday', color: '#fff' }];
  expect(compareLmsPlans([programme], records, [], holidays).matching).toBe(1);
  programme.rows[0].holidayIds = ['h1'];
  expect(compareLmsPlans([programme], records, [], holidays).differences[0]).toMatchObject({
    kind: 'dates', current: { startDate: '2026-01-05', endDate: '2026-01-26', baselineEndDate: '2026-01-19' },
  });
});

test('comparison shows both timelines above differences, keeps programme filtering and scrolls on mobile without writing', async ({ page }) => {
  test.setTimeout(90_000);
  const user = { id: 1, email: 'comparison@example.com', username: 'comparison', displayName: 'Comparison',
    groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  const names = ['Same module', 'Changed module', 'Partial module', 'Current module', 'Repeated module'];
  const items = names.map((moduleName, index) => ({
    id: index + 1, programmeId: 'me-lvl4', cohortId: 'c1', cohortName: 'January cohort', program: 'ME L4',
    startingDateLabel: '2026-01-01', moduleName, groupName: 'Group 1', coachName: '', tutorName: '', tutorProfileId: '',
    startDate: '2026-01-05', endDate: '2026-01-19', sessionsNumber: '3', sessionWeekDay: 'monday',
    sessionStartTime: '09:00', sessionEndTime: '10:00', sessionKsbMappings: [], sessionCoverage: [], ksbProfileId: '',
    programmeDisplayOrder: 0, cohortDisplayOrder: 0,
    notes: `__program_id:me-lvl4\n__cohort_id:c1\n__group_id:g1\n__block_id:b${index}`,
  }));
  const records = [source('1', names[0]), source('2', names[1], { startDate: '2026-01-12' }),
    source('3', names[2], { startDate: null }), source('4', names[4]), source('5', names[4]), source('6', 'LMS module')];
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
      id: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: records.length, contentSha256: 'test', records,
    } };
    await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/training-plan');
  await expect(page.getByRole('button', { name: /Monthly Module Breakdown/ })).toBeVisible();
  const table = page.getByRole('table', { name: 'Plan differences', exact: true });
  await expect(table).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare plans', exact: true }).click();
  await expect(table).toBeVisible();
  await expect(page.locator('#current-training-plan-panel')).toBeVisible();
  await expect(page.locator('#training-plan-lms-reference')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Comparison zoom filter', exact: true })).toBeVisible();
  const grid = await page.locator('#training-plan-comparison').boundingBox();
  const section = await page.getByRole('region', { name: 'Plan differences', exact: true }).boundingBox();
  expect(section!.y).toBeGreaterThanOrEqual(grid!.y + grid!.height);
  await expect(table.getByRole('columnheader', { name: 'Programme', exact: true })).toHaveCount(0);
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByText('5 differences · 1 matching', { exact: true })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: /Same module/ })).toHaveCount(0);
  const changed = table.getByRole('row', { name: /Changed module/ });
  await expect(changed).toContainText('2026-01-05');
  await expect(changed).toContainText('2026-01-12');
  await expect(table.getByRole('row', { name: /Partial module/ })).toContainText('Not provided');
  await page.getByLabel('Difference programme', { exact: true }).selectOption('me-lvl4');
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await page.getByLabel('Difference type', { exact: true }).selectOption('dates');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset differences filters', exact: true }).click();
  await page.getByLabel('Search differences', { exact: true }).fill('no such module');
  await expect(table).toContainText('No differences match these filters.');
  await page.getByRole('button', { name: 'Reset differences filters', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const scroll = page.getByRole('region', { name: 'Plan differences table', exact: true });
  expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Exit comparison', exact: true }).click();
  await expect(table).toHaveCount(0);
  await expect(page.locator('#current-training-plan-panel')).toBeVisible();
  await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
  await expect(page.getByRole('region', { name: 'LMS reference timeline', exact: true })).toBeVisible();
  await expect(table).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare plans', exact: true }).click();
  await expect(table).toBeVisible();
  await expect(page.getByRole('region', { name: 'LMS reference timeline', exact: true })).toBeVisible();
  await expect(page.locator('#current-training-plan-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Exit comparison', exact: true }).click();
  await expect(page.getByRole('region', { name: 'LMS reference timeline', exact: true })).toBeVisible();
  await expect(page.locator('#current-training-plan-panel')).toBeHidden();
  await expect(page.getByRole('table', { name: 'LMS reference', exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
