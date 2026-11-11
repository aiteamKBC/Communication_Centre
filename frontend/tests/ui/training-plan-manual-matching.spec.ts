import { expect, test, type Page } from '@playwright/test';
import type { LmsReferenceRow } from '../../src/pages/apprenticeships-timeline/lmsReference';

test.use({ channel: 'chrome' });

async function setup(page: Page, automatic = false, additionalModules: (Partial<LmsReferenceRow> & Pick<LmsReferenceRow, 'sourceModuleId' | 'module'>)[] = []) {
  // Functional checks and screenshots must not depend on external font hosts.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  const user = { id: 1, username: 'matcher', displayName: 'Matcher', groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  let version = 'v1';
  let rejectSave = false;
  const writes: string[] = [];
  const items = [101, 102, 103].map((id, index) => ({
    id, programmeId: 'me-lvl4', cohortId: 'c1', cohortName: 'January cohort', program: 'ME L4', startingDateLabel: '2026-01-01',
    moduleName: index === 2 ? 'Other workshop' : 'Marketing', groupName: `Group ${index + 1}`, coachName: '', tutorName: 'Plan Tutor', tutorProfileId: '',
    startDate: automatic && index === 1 ? '2026-01-12' : '2026-01-05', endDate: '2026-01-19', sessionsNumber: '3', sessionWeekDay: 'monday', sessionStartTime: '09:00', sessionEndTime: '10:00',
    sessionKsbMappings: [], sessionCoverage: [], ksbProfileId: '', programmeDisplayOrder: 0, cohortDisplayOrder: 0,
    notes: `__program_id:me-lvl4\n__cohort_id:c1\n__group_id:g${index + 1}\n__block_id:b${id}\n__module_catalogue_id:${index === 2 ? 99 : 42}\n__module_color:#20869B\nOriginal notes`,
  }));
  const catalog = [{ id: 42, name: 'Marketing', colour: '#20869B', sessions: '3', notes: '', sessionNames: [], sessionDescriptions: [], sessionKsbMappings: [] }];
  const programmes = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (method !== 'GET' && path.startsWith('/api/training-plan')) writes.push(path);
    const savedItem = items.find(item => path === `/api/training-plan/modules/${item.id}/`);
    if (savedItem && method === 'PATCH') {
      if (rejectSave) return json({ detail: 'The match could not be saved.' }, 400);
      const payload = route.request().postDataJSON();
      expect(payload.version).toBe(version);
      expect(Object.keys(payload).sort()).toEqual(['lmsSourceModuleId', 'notes', 'version']);
      expect(payload.lmsSourceModuleId).toBe(payload.notes.match(/^__lms_source_module_id:(.*)$/m)?.[1] || '');
      savedItem.notes = payload.notes;
      version = 'v2';
      return json({ item: savedItem, items, version, count: items.length });
    }
    if (path === '/api/auth/access/') return json(user);
    if (path === '/api/health/') return json({ status: 'ok' });
    if (path === '/api/training-plan/') return json({ items, version, count: items.length });
    if (path === '/api/training-plan-bootstrap/') return json({
      trainingPlan: { items, version, count: items.length }, programConfigs: programmes, catalogModules: catalog,
      moduleDefinitions: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [], holidays: { items: [], version: 'h1' },
      versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
    });
    if (path === '/api/training-plan-program-configs/') return json(programmes);
    if (path === '/api/modules/') return json(catalog);
    if (path === '/api/training-plan-holidays/') return json({ items: [], version: 'h1' });
    if (path === '/api/training-plan/lms-reference/') return json({ reference: {
      id: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: 1, contentSha256: 'test',
      records: [{ sourceModuleId: 'chosen', sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4', module: automatic ? 'Marketing' : 'LMS Marketing Workshop', startDate: automatic ? '2026-01-05' : '2026-02-02', endDate: '2026-02-16' },
        ...additionalModules.map(module => ({ sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4', startDate: '2026-02-02', endDate: '2026-02-16', ...module }))],
    } });
    if (path === '/api/training-plan/lms-reference/cohorts/') return json({ cohorts: { chosen: { cohortId: null, cohortName: '', groupName: '' } } });
    if (path === '/api/training-plan/lms-reference/tutors/') return json({ tutorNames: { chosen: 'LMS Tutor' } });
    if (path === '/api/training-plan/lms-reference/holidays/') return json({ holidays: [] });
    return json([]);
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return { items, writes, errors, failSave: () => { rejectSave = true; }, allowSave: () => { rejectSave = false; } };
}

async function openMatcher(page: Page) {
  await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  await page.getByRole('button', { name: /Edit$/ }).first().click();
  await page.getByText('Compare with LMS modules', { exact: true }).click();
  await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  await expect(page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
}

async function chooseLmsModule(page: Page) {
  await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  await page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true }).click();
}

test('LMS recommendations include a single shared word and keep unrelated modules available without selecting or saving', async ({ page }) => {
  const api = await setup(page, false, [
    { sourceModuleId: 'unrelated', module: 'AAA Finance' },
    { sourceModuleId: 'punctuation', module: 'MARKETING-strategy' },
    { sourceModuleId: 'substring', module: 'Remarketing overview' },
    { sourceModuleId: 'other-programme', module: 'Marketing elsewhere', programme: 'Marketing Manager Level 6' },
  ]);
  await page.goto('/training-plan');
  await openMatcher(page);
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('Choose an LMS module');
  await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  const options = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  await expect(options).toHaveCount(4);
  await expect(options.nth(0)).toContainText('LMS Marketing Workshop');
  await expect(options.nth(1)).toContainText('MARKETING-strategy');
  await expect(options.nth(2)).toContainText('AAA Finance');
  await expect(options.nth(3)).toContainText('Remarketing overview');
  await expect(options.nth(0)).toContainText('Recommended');
  await expect(options.nth(1)).toContainText('Recommended');
  await expect(options.nth(2)).not.toContainText('Recommended');
  await expect(options.nth(3)).not.toContainText('Recommended');
  await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).fill('Finance');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('AAA Finance');
  expect(api.writes).toEqual([]);
  expect(api.errors).toEqual([]);
});

test('Compare filters current modules by group and resets from the search icon while keeping the selected module', async ({ page }) => {
  const api = await setup(page);
  await page.goto('/training-plan');
  await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
  await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  const options = page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option');
  await expect(page.getByLabel('Current modules Cohort filter', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Current modules Group filter', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Current modules Tutor filter', { exact: true })).toBeDisabled();
  await page.getByLabel('Current modules Programme filter', { exact: true }).selectOption({ label: 'ME L4' });
  await expect(page.getByLabel('Current modules Cohort filter', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Current modules Group filter', { exact: true })).toBeDisabled();
  await page.getByLabel('Current modules Cohort filter', { exact: true }).selectOption({ label: 'January cohort' });
  await page.getByLabel('Current modules Group filter', { exact: true }).selectOption({ label: 'Group 2' });
  await expect(page.getByLabel('Current modules From', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current modules To', { exact: true })).toBeVisible();
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Group 2');
  await options.first().click();
  const trigger = page.getByRole('button', { name: 'Current module to compare', exact: true });
  await expect(trigger).toContainText('Marketing');
  await trigger.click();
  await page.getByLabel('Current modules Group filter', { exact: true }).selectOption({ label: 'Group 3' });
  await page.getByRole('combobox', { name: 'Search current comparison modules', exact: true }).press('Escape');
  await expect(trigger).toContainText('Marketing');
  await trigger.click();
  await page.getByRole('button', { name: 'Reset search and filters', exact: true }).click();
  await expect(options).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: 'Search current comparison modules', exact: true })).toBeFocused();
  expect(api.writes).toEqual([]);
  expect(api.errors).toEqual([]);
});

test('filter dates display day month year from left to right and still support the calendar', async ({ page }, testInfo) => {
  const api = await setup(page);
  api.items[1].startDate = '2026-02-02'; api.items[1].endDate = '2026-02-16';
  api.items[2].startDate = '2026-03-01'; api.items[2].endDate = '2026-03-20';
  await page.goto('/training-plan');
  await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
  await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  const from = page.getByLabel('Current modules From', { exact: true });
  const to = page.getByLabel('Current modules To', { exact: true });
  const options = page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option');
  await expect(from).toHaveAttribute('placeholder', 'DD/MM/YYYY');
  await from.fill('05/01/2026');
  await to.fill('19/01/2026');
  await expect(from).toHaveValue('05/01/2026');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Group 1');
  await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  expect(await from.evaluate(node => getComputedStyle(node).direction)).toBe('ltr');
  expect(await from.evaluate(node => getComputedStyle(node).textAlign)).toBe('left');
  await page.evaluate(() => { document.documentElement.dir = 'ltr'; });
  await from.fill('02022026');
  await to.fill('16022026');
  await expect(from).toHaveValue('02/02/2026');
  await expect(to).toHaveValue('16/02/2026');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Group 2');
  await from.locator('..').locator('input[type="date"]').fill('2026-03-01');
  await to.locator('..').locator('input[type="date"]').fill('2026-03-20');
  await expect(from).toHaveValue('01/03/2026');
  await expect(to).toHaveValue('20/03/2026');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Group 3');
  await from.fill('31/02/2026');
  await from.press('Tab');
  await expect(page.getByRole('alert')).toHaveText('Enter a valid date as DD/MM/YYYY.');
  await page.getByRole('button', { name: 'Clear Current modules dates', exact: true }).click();
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
  await expect(options).toHaveCount(3);
  await from.fill('10/11/2026');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(from).toHaveValue('10/11/2026');
  await expect(from).toBeInViewport();
  for (const field of [from, to]) {
    expect(await field.evaluate((node: HTMLInputElement) => {
      const style = getComputedStyle(node);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = style.font;
      return context.measureText(node.value || node.placeholder).width
        + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) <= node.clientWidth;
    })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('day-month-year-mobile.png') });
  expect(api.writes).toEqual([]);
  expect(api.errors).toEqual([]);
});

for (const side of ['Current', 'LMS'] as const) {
  test(`${side} comparison dates exclude modules extending outside the selected period`, async ({ page }, testInfo) => {
    const api = await setup(page, false, [
      { sourceModuleId: 'impact', module: 'Marketing Impact', startDate: '2026-10-06', endDate: '2027-02-09' },
      { sourceModuleId: 'social', module: 'Social', startDate: '2026-10-07', endDate: '2027-01-06' },
      { sourceModuleId: 'inside', module: 'Inside period', startDate: '2026-11-10', endDate: '2026-11-11' },
      { sourceModuleId: 'early', module: 'Starts too early', startDate: '2026-11-09', endDate: '2026-11-10' },
      { sourceModuleId: 'late', module: 'Ends too late', startDate: '2026-11-11', endDate: '2026-11-12' },
    ]);
    api.items[0].startDate = '2026-10-06'; api.items[0].endDate = '2027-02-09';
    api.items[1].startDate = '2026-10-07'; api.items[1].endDate = '2027-01-06';
    api.items[1].notes += '\n__lms_source_module_id:social';
    api.items[2].startDate = '2026-11-10'; api.items[2].endDate = '2026-11-11';
    await page.goto('/training-plan');
    await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
    await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
    if (side === 'LMS') {
      await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').first().click();
      await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
    }
    const label = `${side} modules`;
    const options = page.getByRole('listbox', { name: label, exact: true }).getByRole('option');
    await page.getByLabel(`${label} From`, { exact: true }).fill('10/11/2026');
    await page.getByLabel(`${label} To`, { exact: true }).fill('11/11/2026');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(side === 'Current' ? 'Group 3' : 'Inside period');
    await expect(page.getByRole('status', { name: `${label} date filter results` })).toContainText('within the selected dates');
    await page.getByLabel(`${label} From`, { exact: true }).fill('');
    await expect(options).toHaveCount(side === 'Current' ? 1 : 3);
    await page.getByLabel(`${label} From`, { exact: true }).fill('10/11/2026');
    await page.getByLabel(`${label} To`, { exact: true }).fill('');
    await expect(options).toHaveCount(side === 'Current' ? 1 : 2);
    await page.getByLabel(`${label} To`, { exact: true }).fill('11/11/2026');
    await expect(options).toHaveCount(1);
    await page.getByLabel(`${label} To`, { exact: true }).fill('10/11/2026');
    await expect(options).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('comparison-dates-within-period.png') });
    await page.getByRole('button', { name: `Clear ${label} dates`, exact: true }).click();
    await expect(options).toHaveCount(side === 'Current' ? 3 : 6);
    expect(api.writes).toEqual([]);
    expect(api.errors).toEqual([]);
  });
}

test('manual compare filters both sides by inclusive and open date ranges without changing the saved selection', async ({ page }, testInfo) => {
  const api = await setup(page, false, [
    { sourceModuleId: 'march', module: 'March module', startDate: '2026-03-01', endDate: '2026-03-20' },
    { sourceModuleId: 'undated', module: 'Undated module', startDate: null, endDate: null },
  ]);
  api.items[1].startDate = '2026-02-02'; api.items[1].endDate = '2026-02-16';
  api.items[2].startDate = '2026-03-01'; api.items[2].endDate = '2026-03-20';
  await page.goto('/training-plan');
  await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
  const current = page.getByRole('button', { name: 'Current module to compare', exact: true });
  await current.click();
  const currentOptions = page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option');
  await page.getByLabel('Current modules From', { exact: true }).fill('2026-01-05');
  await page.getByLabel('Current modules To', { exact: true }).fill('2026-01-19');
  await expect(currentOptions).toHaveCount(1);
  await expect(currentOptions.first()).toContainText('Group 1');
  await currentOptions.first().click();
  await current.click();
  await page.getByLabel('Current modules From', { exact: true }).fill('2026-03-21');
  await expect(page.getByRole('alert')).toHaveText('From must be on or before To.');
  await expect(currentOptions).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset search and filters', exact: true }).click();
  await expect(currentOptions).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Search current comparison modules', exact: true }).press('Escape');
  await expect(current).toContainText('Marketing');
  const lms = page.getByRole('button', { name: 'LMS module to match', exact: true });
  await lms.click();
  const lmsOptions = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  await page.getByLabel('LMS modules From', { exact: true }).fill('2026-02-02');
  await page.getByLabel('LMS modules To', { exact: true }).fill('2026-02-16');
  await expect(lmsOptions).toHaveCount(1);
  await expect(lmsOptions.first()).toContainText('LMS Marketing Workshop');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('LMS modules To', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('manual-compare-date-range-mobile.png') });
  await page.getByLabel('LMS modules To', { exact: true }).fill('');
  await page.getByLabel('LMS modules From', { exact: true }).fill('2026-03-01');
  await expect(lmsOptions).toHaveCount(1);
  await expect(lmsOptions.first()).toContainText('March module');
  await page.getByRole('button', { name: 'Reset search and filters', exact: true }).click();
  await expect(lmsOptions).toHaveCount(3);
  expect(api.writes).toEqual([]);
  expect(api.errors).toEqual([]);
});

test('date and search filters narrow the programme cohort group and tutor choices on both sides', async ({ page }) => {
  const api = await setup(page, false, [
    { sourceModuleId: 'march', module: 'Marketing March', cohortName: 'March LMS cohort', groupName: 'March group', tutorName: 'March tutor', startDate: '2026-03-02', endDate: '2026-03-16' },
    { sourceModuleId: 'may', module: 'Marketing May', cohortName: 'May LMS cohort', groupName: 'May group', tutorName: 'May tutor', startDate: '2026-05-04', endDate: '2026-05-18' },
  ]);
  for (const [index, month] of [[1, 'February'], [2, 'March']] as const) {
    const item = api.items[index];
    item.cohortName = `${month} cohort`; item.cohortId = month.toLowerCase();
    item.notes = item.notes.replace('__cohort_id:c1', `__cohort_id:${item.cohortId}`);
    item.startDate = index === 1 ? '2026-02-02' : '2026-03-02';
    item.endDate = index === 1 ? '2026-02-16' : '2026-03-16';
  }
  await page.goto('/training-plan');
  await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
  await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  await page.getByLabel('Current modules From', { exact: true }).fill('2026-03-01');
  await page.getByLabel('Current modules To', { exact: true }).fill('2026-03-31');
  await page.getByLabel('Current modules Programme filter', { exact: true }).selectOption({ label: 'ME L4' });
  await expect(page.getByLabel('Current modules Cohort filter').locator('option')).toHaveText(['All', 'March cohort']);
  await page.getByLabel('Current modules Cohort filter').selectOption({ label: 'March cohort' });
  await expect(page.getByLabel('Current modules Group filter').locator('option')).toHaveText(['All', 'Group 3']);
  await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').first().click();
  await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  await page.getByLabel('LMS modules From', { exact: true }).fill('2026-03-01');
  await page.getByLabel('LMS modules To', { exact: true }).fill('2026-03-31');
  await page.getByLabel('LMS modules Programme filter').selectOption({ label: 'ME L4' });
  await expect(page.getByLabel('LMS modules Cohort filter').locator('option')).toHaveText(['All', 'March LMS cohort']);
  await page.getByLabel('LMS modules Cohort filter').selectOption({ label: 'March LMS cohort' });
  await expect(page.getByLabel('LMS modules Group filter').locator('option')).toHaveText(['All', 'March group']);
  await expect(page.getByLabel('LMS modules Tutor filter').locator('option')).toHaveText(['All', 'March tutor']);
  await expect(page.getByLabel('LMS modules From', { exact: true })).not.toHaveAttribute('max');
  await expect(page.getByLabel('LMS modules To', { exact: true })).not.toHaveAttribute('min');
  await page.getByLabel('LMS modules From', { exact: true }).fill('2026-05-01');
  await expect(page.getByRole('alert')).toHaveText('From must be on or before To.');
  await page.getByLabel('LMS modules To', { exact: true }).fill('2026-05-31');
  await expect(page.getByLabel('LMS modules Programme filter')).toHaveValue(JSON.stringify('me l4'));
  await expect(page.getByLabel('LMS modules Cohort filter')).toHaveValue(JSON.stringify('march lms cohort'));
  await expect(page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option')).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'LMS modules date filter results' })).toContainText('Showing 0 of 3 options');
  await page.getByLabel('LMS modules Cohort filter').selectOption('');
  await expect(page.getByLabel('LMS modules Cohort filter').locator('option')).toHaveText(['All', 'May LMS cohort']);
  await expect(page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('status', { name: 'LMS modules date filter results' })).toContainText('Showing 1 of 3 options');
  await page.getByRole('button', { name: 'Reset search and filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).fill('May');
  await page.getByLabel('LMS modules Programme filter').selectOption({ label: 'ME L4' });
  await expect(page.getByLabel('LMS modules Cohort filter').locator('option')).toHaveText(['All', 'May LMS cohort']);
  expect(api.writes).toEqual([]);
});

for (const side of ['Current', 'LMS'] as const) {
  test(`${side} date changes keep every selected filter when only unrelated modules match the dates`, async ({ page }) => {
    const api = await setup(page, false, [
      { sourceModuleId: 'winter', module: 'Winter workshop', cohortName: 'Winter cohort', groupName: 'Winter group', tutorName: 'Winter tutor' },
      { sourceModuleId: 'spring', module: 'Spring workshop', programme: 'Marketing Manager Level 6', cohortName: 'Spring cohort', groupName: 'Spring group', tutorName: 'Spring tutor', startDate: '2026-03-02', endDate: '2026-03-16' },
    ]);
    api.items[1].startDate = '2026-03-02'; api.items[1].endDate = '2026-03-16';
    await page.goto('/training-plan');
    await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
    await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
    if (side === 'LMS') {
      await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').first().click();
      await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
    }
    const label = `${side} modules`;
    const selected = {
      Programme: 'ME L4', Cohort: side === 'Current' ? 'January cohort' : 'Winter cohort',
      Group: side === 'Current' ? 'Group 1' : 'Winter group', Tutor: side === 'Current' ? 'Plan Tutor' : 'Winter tutor',
    };
    for (const [field, value] of Object.entries(selected)) {
      await page.getByLabel(`${label} ${field} filter`, { exact: true }).selectOption({ label: value });
    }
    const options = page.getByRole('listbox', { name: label, exact: true }).getByRole('option');
    await expect(options).toHaveCount(1);
    await page.getByLabel(`${label} From`, { exact: true }).fill('2026-03-01');
    await page.getByLabel(`${label} To`, { exact: true }).fill('2026-03-31');
    await expect(options).toHaveCount(0);
    for (const [field, value] of Object.entries(selected)) {
      await expect(page.getByLabel(`${label} ${field} filter`, { exact: true })).toHaveValue(JSON.stringify(value.toLowerCase()));
    }
    await page.getByRole('button', { name: `Clear ${label} dates`, exact: true }).click();
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(side === 'Current' ? 'Group 1' : 'Winter workshop');
    expect(api.writes).toEqual([]);
    expect(api.errors).toEqual([]);
  });
}

test('LMS and Merge date filters hide out-of-range modules and retain matched pairs on boundary dates', async ({ page }) => {
  const api = await setup(page);
  api.items[0].notes = `__lms_source_module_id:chosen\n${api.items[0].notes}`;
  await page.goto('/training-plan');
  await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
  const lms = page.getByRole('tabpanel', { name: 'LMS Training Plan', exact: true });
  await lms.getByTitle('Expand programme', { exact: true }).first().click();
  await expect(lms.locator('[data-source="LMS"][data-timeline-block-id]')).toHaveCount(1);
  await lms.getByLabel('LMS timeline From', { exact: true }).fill('2026-03-01');
  await expect(lms.locator('[data-source="LMS"][data-timeline-block-id]')).toHaveCount(0);
  await lms.getByRole('button', { name: 'Clear LMS timeline dates', exact: true }).click();
  await expect(lms.locator('[data-source="LMS"][data-timeline-block-id]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
  const pair = merged.locator('[data-merged-module-card]');
  await expect(pair).toHaveCount(1);
  await merged.getByLabel('Merged timeline From', { exact: true }).fill('2026-03-01');
  await expect(pair).toHaveCount(0);
  await merged.getByLabel('Merged timeline From', { exact: true }).fill('2026-02-16');
  await merged.getByLabel('Merged timeline To', { exact: true }).fill('2026-02-16');
  await expect(pair).toHaveCount(1);
  await expect(pair).toContainText('LMS Marketing Workshop');
  expect(api.writes).toEqual([]);
});

test('LMS search combines programme, cohort, group and tutor and resets from the search icon on mobile', async ({ page }, testInfo) => {
  const api = await setup(page, false, [
    { sourceModuleId: 'target', module: 'Marketing February', groupName: 'Group 2', cohortName: 'Spring cohort', tutorName: 'Second Tutor', startDate: '2026-02-05', endDate: '2026-02-20' },
    { sourceModuleId: 'other', module: 'Marketing March', programme: 'Marketing Manager Level 6', groupName: 'Group 3', cohortName: 'Later cohort', tutorName: 'Other Tutor', startDate: '2026-03-01', endDate: '2026-03-20' },
    { sourceModuleId: 'same-cohort', module: 'Marketing alternative', groupName: 'Group 5', cohortName: 'Spring cohort', tutorName: 'Third Tutor' },
    { sourceModuleId: 'other-cohort', module: 'Marketing autumn', groupName: 'Group 4', cohortName: 'Autumn cohort', tutorName: 'Autumn Tutor' },
    { sourceModuleId: 'undated', module: 'Undated module', startDate: null, endDate: null },
    { sourceModuleId: 'invalid', module: 'Invalid date module', startDate: '2026-02-30', endDate: '2026-03-10' },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/training-plan');
  await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
  await page.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').first().click();
  await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  const options = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  const search = page.getByRole('combobox', { name: 'Search LMS match modules', exact: true });
  await expect(options).toHaveCount(7);
  await search.press('Tab');
  await expect(page.getByLabel('LMS modules Programme filter', { exact: true })).toBeFocused();
  await page.getByLabel('LMS modules Programme filter', { exact: true }).selectOption({ label: 'ME L4' });
  await expect(options).toHaveCount(6);
  const cohort = page.getByLabel('LMS modules Cohort filter', { exact: true });
  const group = page.getByLabel('LMS modules Group filter', { exact: true });
  const tutor = page.getByLabel('LMS modules Tutor filter', { exact: true });
  await expect(cohort.locator('option').filter({ hasText: 'Later cohort' })).toHaveCount(0);
  await expect(group).toBeDisabled();
  await expect(tutor).toBeDisabled();
  await page.getByLabel('LMS modules Cohort filter', { exact: true }).selectOption({ label: 'Spring cohort' });
  await expect(options).toHaveCount(2);
  await expect(group.locator('option')).toHaveText(['All', 'Group 2', 'Group 5']);
  await expect(tutor.locator('option')).toHaveText(['All', 'Second Tutor', 'Third Tutor']);
  await page.getByLabel('LMS modules Group filter', { exact: true }).selectOption({ label: 'Group 2' });
  await expect(tutor.locator('option')).toHaveText(['All', 'Second Tutor']);
  await page.getByLabel('LMS modules Tutor filter', { exact: true }).selectOption({ label: 'Second Tutor' });
  await expect(page.getByLabel('LMS modules From', { exact: true })).toBeVisible();
  await expect(page.getByLabel('LMS modules To', { exact: true })).toBeVisible();
  await expect(page.getByText('Clear filters and search', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Modules overlapping this period/)).toHaveCount(0);
  await search.fill('February');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('Marketing February');
  await expect(options.first()).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('module-search-filters-mobile.png') });
  await search.fill('no match');
  await expect(options).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset search and filters', exact: true }).click();
  await expect(options).toHaveCount(7);
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(cohort).toBeDisabled();
  await page.getByLabel('LMS modules Programme filter', { exact: true }).selectOption({ label: 'ME L4' });
  await cohort.selectOption({ label: 'Spring cohort' });
  await tutor.selectOption({ label: 'Third Tutor' });
  await expect(group.locator('option')).toHaveText(['All', 'Group 5']);
  await group.selectOption({ label: 'Group 5' });
  await cohort.selectOption({ label: 'Autumn cohort' });
  await expect(group).toHaveValue('');
  await expect(tutor).toHaveValue('');
  await expect(group.locator('option')).toHaveText(['All', 'Group 4']);
  await expect(options).toHaveCount(1);
  await page.getByLabel('LMS modules Programme filter', { exact: true }).selectOption({ label: 'MM LVL6' });
  await expect(cohort).toHaveValue('');
  await expect(group).toBeDisabled();
  await expect(tutor).toBeDisabled();
  await expect(cohort.locator('option')).toHaveText(['All', 'Later cohort']);
  await expect(options).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset search and filters', exact: true }).click();
  await expect(options).toHaveCount(7);
  expect(api.writes).toEqual([]);
  expect(api.errors).toEqual([]);
});

test('timeline Manual Merge browses all assignments and LMS programmes without saving on desktop and mobile', async ({ page }, testInfo) => {
  const api = await setup(page, false, [{ sourceModuleId: 'cross', module: 'Cross programme module', programme: 'Marketing Manager Level 6' }]);
  api.items[1].notes += '\n__lms_source_module_id:chosen';
  const originalItems = JSON.stringify(api.items);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/training-plan');
  const trigger = page.getByRole('button', { name: 'Manual Merge', exact: true });
  await expect(trigger).toBeVisible();
  for (const name of ['Session Schedule', 'Tutor Profiles', 'Coach Profiles']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(trigger).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Training Plan', exact: true }).click();
  await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
  await expect(trigger).toBeVisible();
  await page.getByRole('tab', { name: 'Current Training Plan', exact: true }).click();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Compare modules', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  const currentOptions = page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option');
  await expect(currentOptions).toHaveCount(3);
  await expect(currentOptions.filter({ hasText: 'Group 2' })).toContainText('January cohort');
  await page.getByRole('combobox', { name: 'Search current comparison modules', exact: true }).fill('Other workshop');
  await currentOptions.first().click();
  await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  const lmsOptions = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  const claimed = lmsOptions.filter({ hasText: 'LMS Marketing Workshop' });
  await expect(claimed).toBeEnabled();
  await claimed.click();
  const table = dialog.getByRole('table', { name: 'Selected module comparison', exact: true });
  await expect(table).toContainText('Other workshop');
  await expect(table).toContainText('LMS Marketing Workshop');
  await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  await lmsOptions.filter({ hasText: 'Cross programme module' }).click();
  await expect(table).toContainText('MM LVL6');
  await expect(table).toContainText('ME L4');
  await expect(table).toContainText('2026-02-02');
  await expect(dialog.getByText('Dates and tutor differ', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save manual match', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('standalone-module-comparison.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scroll = dialog.getByRole('region', { name: 'Module comparison details' });
  expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('standalone-module-comparison-mobile.png') });
  await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(api.writes).toEqual([]);
  expect(JSON.stringify(api.items)).toBe(originalItems);
  expect(api.errors).toEqual([]);
});

test('Merge separates manual matching from display filters and preserves saved manual choices', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const api = await setup(page, true, [{ sourceModuleId: 'second', module: 'Marketing', startDate: '2026-01-12' }]);
  await page.goto('/training-plan');
  await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
  const manual = merged.getByRole('button', { name: 'Manual Merge', exact: true });
  const addMatch = merged.getByRole('button', { name: 'Add manual match', exact: true });
  const filter = merged.getByRole('button', { name: 'Show merges', exact: true });
  await expect(manual).toHaveCount(0);
  await expect(filter).toHaveText('All merges');
  const pairs = merged.locator('[data-merge-match-method="automatic"]');
  await expect(pairs).toHaveCount(4);
  await expect(pairs.nth(0)).toHaveAttribute('data-plan-source', 'Current');
  await expect(pairs.nth(1)).toHaveAttribute('data-plan-source', 'LMS');
  await expect(pairs.nth(0).getByRole('button', { name: 'View Current module details: Marketing', exact: true })).toBeVisible();
  expect(await pairs.nth(0).evaluate(node => node.nextElementSibling?.getAttribute('data-merge-match-id')))
    .toBe(await pairs.nth(0).getAttribute('data-merge-match-id'));
  await filter.click();
  await page.getByRole('option', { name: 'Manual only', exact: true }).click();
  await expect(filter).toHaveText('Manual only');
  await expect(merged.getByText('No manual matches to display. Use Add manual match to choose a pair.', { exact: true })).toBeVisible();
  await expect(merged.locator('[data-merge-match-id]')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Compare modules', exact: true })).toHaveCount(0);
  await filter.click();
  await page.getByRole('option', { name: 'Automatic only', exact: true }).click();
  await expect(pairs).toHaveCount(4);
  await expect(merged.locator('[data-plan-source]')).toHaveCount(4);
  expect(api.writes).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(manual).toHaveCount(0);
  await expect(filter).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('merge-display-filter-mobile.png'), fullPage: true });
  await filter.click();
  await page.getByRole('option', { name: 'Manual only', exact: true }).click();
  await expect(pairs).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Compare modules', exact: true })).toHaveCount(0);
  await addMatch.click();
  const dialog = page.getByRole('dialog', { name: 'Compare modules', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Current module to compare', exact: true }).click();
  await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').filter({ hasText: 'Group 1' }).click();
  await expect(dialog.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('Marketing');
  await dialog.getByRole('button', { name: 'Save manual match', exact: true }).click();
  await expect(dialog.getByText('Manual match saved.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'View in Merge', exact: true }).click();
  await expect(filter).toHaveText('Manual only');
  await expect(pairs).toHaveCount(0);
  await expect(merged.locator('[data-merge-match-method="manual"]')).toHaveCount(2);
  const savedItems = JSON.stringify(api.items);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await filter.click();
    await page.getByRole('option', { name: 'Automatic only', exact: true }).click();
    await expect(merged.locator('[data-merge-match-method="manual"]')).toHaveCount(0);
    await expect(pairs).toHaveCount(2);
    await expect(merged.locator('[data-plan-source]')).toHaveCount(2);
    await filter.click();
    await page.getByRole('option', { name: 'Manual only', exact: true }).click();
    await expect(merged.locator('[data-merge-match-method="manual"]')).toHaveCount(2);
    await expect(pairs).toHaveCount(0);
    await expect(merged.locator('[data-plan-source]')).toHaveCount(2);
    await filter.click();
    await page.getByRole('option', { name: 'All merges', exact: true }).click();
    await expect(merged.locator('[data-merge-match-method="manual"]')).toHaveCount(2);
    await expect(pairs).toHaveCount(2);
    await expect(merged.locator('[data-plan-source]')).toHaveCount(5);
    await expect(page.getByRole('dialog', { name: 'Compare modules', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(JSON.stringify(api.items)).toBe(savedItems);
  expect(api.writes).toEqual(['/api/training-plan/modules/101/']);
  expect(api.errors).toEqual([]);
});

for (const crossProgramme of [false, true]) {
  test(`Compare saves a manual pair ${crossProgramme ? 'across programmes' : 'within a programme'} and stacks it on the Merge timeline`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const api = await setup(page, false, crossProgramme ? [{ sourceModuleId: 'cross', module: 'Independent source title',
      programme: 'Marketing Manager Level 6', cohortName: 'Different intake', groupName: 'Source group',
      startDate: '2024-01-01', endDate: '2024-02-01' }] : []);
    await page.goto('/training-plan');
    await page.getByRole('tab', { name: 'Merge', exact: true }).click();
    await page.getByRole('button', { name: 'Add manual match', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Compare modules', exact: true });
    await dialog.getByRole('button', { name: 'Current module to compare', exact: true }).click();
    await page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option').filter({ hasText: 'Group 1' }).click();
    await dialog.getByRole('button', { name: 'LMS module to match', exact: true }).click();
    await page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option')
      .filter({ hasText: crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop' }).click();
    expect(api.writes).toEqual([]);
    await dialog.getByRole('button', { name: 'Save manual match', exact: true }).click();
    await expect(dialog.getByText('Manual match saved.', { exact: true })).toBeVisible();
    expect(api.items[0].notes).toContain(`__lms_source_module_id:${crossProgramme ? 'cross' : 'chosen'}`);
    await dialog.getByRole('button', { name: 'View in Merge', exact: true }).click();
    const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
    const savedMerges = merged.getByRole('region', { name: 'Saved manual merges', exact: true });
    await expect(savedMerges.getByRole('listitem')).toHaveCount(1);
    await expect(savedMerges).toContainText(crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop');
    await expect(savedMerges).toContainText('January cohort');
    const pairs = merged.locator('[data-manual-match-id]');
    await expect(merged).toBeVisible();
    await expect(merged.locator('.training-plan-gantt-scroll')).toHaveCount(1);
    await expect(pairs).toHaveCount(2);
    await expect(pairs.nth(0)).toHaveAttribute('data-plan-source', 'Current');
    await expect(pairs.nth(1)).toHaveAttribute('data-plan-source', 'LMS');
    expect(await pairs.nth(0).getAttribute('data-manual-match-id')).toBe(await pairs.nth(1).getAttribute('data-manual-match-id'));
    expect(await pairs.nth(0).evaluate(node => node.nextElementSibling?.getAttribute('data-plan-source'))).toBe('LMS');
    await expect(pairs.nth(0)).toContainText('Marketing');
    await expect(pairs.nth(1)).toContainText(crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop');
    const currentBar = pairs.nth(0).locator('[data-source="Current"]');
    const lmsBar = pairs.nth(1).locator('[data-source="LMS"]');
    await expect(currentBar).toHaveCount(1);
    await expect(lmsBar).toHaveCount(1);
    const card = merged.locator('[data-merged-module-card]');
    await expect(card).toHaveCount(1);
    await expect(card.locator('[data-plan-source]')).toHaveCount(2);
    expect(await currentBar.getAttribute('data-start-date')).not.toBe(await lmsBar.getAttribute('data-start-date'));
    // Both halves fill one card while retaining their independent source dates.
    const currentBounds = await currentBar.boundingBox();
    const lmsBounds = await lmsBar.boundingBox();
    expect(currentBounds!.width).toBe(lmsBounds!.width);
    expect(currentBounds!.height).toBeCloseTo(lmsBounds!.height, 0);
    expect(await currentBar.evaluate(node => node.parentElement!.getBoundingClientRect().left))
      .toBe(await lmsBar.evaluate(node => node.parentElement!.getBoundingClientRect().left));
    await page.screenshot({ path: testInfo.outputPath('manual-pair-in-merge.png'), fullPage: true });
    await currentBar.click();
    await expect(page.getByRole('button', { name: 'Close module overview dialog', exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true })).toHaveCount(0);
    await expect(page.getByText('Plan Tutor', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
    await lmsBar.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true })).toBeVisible();
    await expect(page.getByText(crossProgramme ? 'Independent source title' : 'LMS Marketing Workshop', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
    await page.reload();
    await page.getByRole('tab', { name: 'Merge', exact: true }).click();
    await expect(pairs).toHaveCount(2);
    await expect(savedMerges.getByRole('listitem')).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(pairs).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await lmsBar.click();
    await expect(page.getByRole('table', { name: 'LMS monthly delivery dates', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close module overview dialog', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('manual-pair-in-merge-mobile.png') });
    if (!crossProgramme) await page.setViewportSize({ width: 1440, height: 900 });
    await savedMerges.getByRole('button', { name: /^Remove manual merge:/ }).click();
    await expect(savedMerges.getByRole('status')).toContainText('Manual merge removed.');
    await expect(savedMerges.getByRole('listitem')).toHaveCount(0);
    await expect(pairs).toHaveCount(0);
    expect(api.items[0].startDate).toBe('2026-01-05');
    expect(api.items[0].notes).toContain('Original notes');
    expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
    await page.reload();
    await page.getByRole('tab', { name: 'Merge', exact: true }).click();
    await expect(savedMerges).toContainText('No saved manual merges yet.');
    await expect(pairs).toHaveCount(0);
    expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/']);
    expect(api.errors).toEqual([]);
  });
}

test('manual merge list retains failed removals, lists unavailable LMS links and restores automatic matching after removal', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const api = await setup(page, true);
  api.items[0].notes = `__lms_source_module_id:chosen\n${api.items[0].notes}`;
  api.items[1].notes = `__lms_source_module_id:unavailable\n${api.items[1].notes}`;
  const originalItems = JSON.stringify(api.items);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/training-plan');
  await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
  const savedMerges = merged.getByRole('region', { name: 'Saved manual merges', exact: true });
  await expect(savedMerges.getByRole('listitem')).toHaveCount(2);
  await expect(savedMerges).toContainText('LMS module unavailable');
  await expect(savedMerges).toContainText('Source ID: unavailable');
  await expect(savedMerges).toContainText('Group 1');
  await expect(savedMerges).toContainText('Group 2');
  await page.screenshot({ path: testInfo.outputPath('manual-merges-list-mobile.png'), fullPage: true });
  await merged.getByRole('button', { name: 'Show merges', exact: true }).click();
  await page.getByRole('option', { name: 'Automatic only', exact: true }).click();
  await expect(savedMerges.getByRole('listitem')).toHaveCount(2);
  api.failSave();
  const firstRemove = savedMerges.getByRole('button', { name: 'Remove manual merge: Marketing, January cohort, Group 1', exact: true });
  await firstRemove.click();
  await expect(page.getByText('Module Not Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(savedMerges.getByRole('alert')).toContainText('The manual merge could not be removed.');
  await expect(savedMerges.getByRole('listitem')).toHaveCount(2);
  expect(JSON.stringify(api.items)).toBe(originalItems);
  api.allowSave();
  await firstRemove.click();
  await expect(savedMerges.getByRole('listitem')).toHaveCount(1);
  await expect(savedMerges.getByRole('alert')).toHaveCount(0);
  await expect(merged.locator('[data-merge-match-method="automatic"]')).toHaveCount(2);
  expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  expect(api.items[1].notes).toContain('__lms_source_module_id:unavailable');
  await savedMerges.getByRole('button', { name: 'Remove manual merge: Marketing, January cohort, Group 2', exact: true }).click();
  await expect(savedMerges).toContainText('No saved manual merges yet.');
  expect(api.items[1].notes).not.toContain('__lms_source_module_id:');
  for (const item of api.items) {
    expect(item.notes).toContain('Original notes');
    expect(item.notes).toContain('__module_catalogue_id:');
    expect(item.startDate).toBe(item.id === 102 ? '2026-01-12' : '2026-01-05');
    expect(item.endDate).toBe('2026-01-19');
  }
  await page.reload();
  await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  await expect(savedMerges).toContainText('No saved manual merges yet.');
  expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/', '/api/training-plan/modules/102/']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(api.errors).toEqual([]);
});

test('saved manual matches stay green in both pickers after reload and clear after removal', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(15_000);
  const api = await setup(page);
  api.items[0].notes = `__lms_source_module_id:chosen\n${api.items[0].notes}`;
  await page.goto('/training-plan');
  await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare modules', exact: true });
  const currentPicker = dialog.getByRole('button', { name: 'Current module to compare', exact: true });
  const lmsPicker = dialog.getByRole('button', { name: 'LMS module to match', exact: true });
  await currentPicker.click();
  const currentOptions = page.getByRole('listbox', { name: 'Current modules', exact: true }).getByRole('option');
  const matchedCurrent = currentOptions.filter({ hasText: 'Group 1' });
  await expect(matchedCurrent).toHaveAttribute('data-option-status', 'Manually matched');
  await expect(matchedCurrent).toHaveCSS('background-color', 'rgb(236, 253, 245)');
  await expect(currentOptions.filter({ hasText: 'Group 2' })).not.toHaveAttribute('data-option-status', 'Manually matched');
  await page.screenshot({ path: testInfo.outputPath('matched-current-options.png') });
  await matchedCurrent.click();
  await expect(currentPicker).toHaveAttribute('data-selected-status', 'Manually matched');
  await expect(lmsPicker).toHaveAttribute('data-selected-status', 'Manually matched');
  await expect(dialog.getByRole('button', { name: 'Save manual match', exact: true })).toBeDisabled();
  expect(api.writes).toEqual([]);
  await dialog.getByRole('button', { name: 'Close module comparison', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Manual Merge', exact: true }).click();
  await currentPicker.click();
  await expect(matchedCurrent).toHaveAttribute('data-option-status', 'Manually matched');
  await currentOptions.filter({ hasText: 'Group 2' }).click();
  await lmsPicker.click();
  const lmsOptions = page.getByRole('listbox', { name: 'LMS modules', exact: true }).getByRole('option');
  const matchedLms = lmsOptions.filter({ hasText: 'LMS Marketing Workshop' });
  await expect(matchedLms).toHaveAttribute('data-option-status', 'Manually matched');
  await expect(matchedLms).toContainText('Linked to Marketing');
  await expect(matchedLms).toContainText('Group 1');
  await expect(matchedLms).toHaveCSS('background-color', 'rgb(236, 253, 245)');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(matchedLms).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('matched-lms-options-mobile.png') });
  await matchedLms.click();
  await expect(dialog.getByRole('button', { name: 'Save manual match', exact: true })).toBeDisabled();
  expect(api.writes).toEqual([]);
  await currentPicker.click();
  await matchedCurrent.click();
  await dialog.getByRole('button', { name: 'Remove manual match', exact: true }).click();
  await expect(dialog.getByText('Manual match removed. Automatic matching applies again.', { exact: true })).toBeVisible();
  await expect(currentPicker).not.toHaveAttribute('data-selected-status', 'Manually matched');
  await lmsPicker.click();
  await expect(matchedLms).not.toHaveAttribute('data-option-status', 'Manually matched');
  await expect(matchedLms).not.toContainText('Linked to');
  expect(api.writes).toEqual(['/api/training-plan/modules/101/']);
  expect(api.errors).toEqual([]);
});

test('manual matching persists, reserves the LMS module, compares dates and can be removed after reload', async ({ page }) => {
  test.setTimeout(90_000);
  const api = await setup(page);
  await page.goto('/training-plan');
  await openMatcher(page);
  await expect(page.getByLabel('Current module to match').locator('option')).toHaveCount(3);
  await expect(page.getByLabel('Current module to match')).not.toContainText('Other workshop');
  await chooseLmsModule(page);
  const preview = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  await expect(preview).toContainText('2026-01-05');
  await expect(preview).toContainText('2026-02-02');
  await expect(preview).toContainText('LMS Tutor');
  await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toHaveAttribute('data-selected-status', 'Manually matched');
  await expect(page.getByRole('button', { name: 'Save manual match', exact: true })).toBeDisabled();
  expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  expect(api.items[0].notes).toContain('__module_catalogue_id:42');
  expect(api.items[0].notes).toContain('Original notes');
  await page.getByLabel('Current module to match', { exact: true }).selectOption(JSON.stringify(['me-lvl4', 'c1', 'b102']));
  await page.getByRole('button', { name: 'LMS module to match', exact: true }).click();
  await expect(page.getByRole('option', { name: 'LMS Marketing Workshop', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Search LMS match modules', exact: true }).press('Escape');
  await page.reload();
  await openMatcher(page);
  const differences = page.getByRole('table', { name: 'Selected module comparison', exact: true });
  await expect(page.getByText('Saved manual match', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toHaveAttribute('data-selected-status', 'Manually matched');
  await expect(differences).toContainText('LMS Marketing Workshop');
  await expect(page.getByText('Dates and tutor differ', { exact: true })).toBeVisible();
  await expect(differences).toContainText('2026-02-02');
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('LMS Marketing Workshop');
  await page.getByRole('button', { name: 'Remove manual match', exact: true }).click();
  await expect(page.getByText('Manual match removed. Automatic matching applies again.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).not.toHaveAttribute('data-selected-status', 'Manually matched');
  expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  expect(api.writes).toEqual(['/api/training-plan/modules/101/', '/api/training-plan/modules/101/']);
  expect(api.errors).toEqual([]);
});

test('a failed manual match save leaves the saved assignment unchanged', async ({ page }) => {
  const api = await setup(page);
  api.failSave();
  await page.goto('/training-plan');
  await openMatcher(page);
  await chooseLmsModule(page);
  await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  await expect(page.getByText('Module Not Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The match was not saved. Check the save message and retry.');
  expect(api.items[0].notes).not.toContain('__lms_source_module_id:');
  await expect(page.getByRole('button', { name: 'Remove manual match', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).not.toHaveAttribute('data-selected-status', 'Manually matched');
  expect(api.errors).toEqual([]);
});

test('schedule assignment editor compares its own module and saves a manual pair without changing its schedule', async ({ page }) => {
  const api = await setup(page);
  await page.goto('/training-plan');
  await page.getByTitle('Expand programme', { exact: true }).click();
  await page.locator('[data-timeline-block-id="b101"]').click();
  await page.getByRole('button', { name: /Edit schedule assignment/ }).click();
  await expect(page.getByRole('heading', { name: 'Edit Module', exact: true })).toBeVisible();
  await page.getByText('Compare with LMS modules', { exact: true }).click();
  await expect(page.getByLabel('Current module to match', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Current module to match', { exact: true })).toHaveValue(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  await chooseLmsModule(page);
  await page.getByRole('button', { name: 'Save manual match', exact: true }).click();
  await expect(page.getByText('Manual match saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close module editor', exact: true }).click({ position: { x: 8, y: 8 } });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compare plans', exact: true })).toHaveCount(0);
  expect(api.items[0].startDate).toBe('2026-01-05');
  expect(api.items[0].endDate).toBe('2026-01-19');
  expect(api.items[0].notes).toContain('__lms_source_module_id:chosen');
  expect(api.writes).toEqual(['/api/training-plan/modules/101/']);
  expect(api.errors).toEqual([]);
});

test('module editor selects automatic matches and compares sources side by side on desktop and mobile without writing', async ({ page }, testInfo) => {
  const api = await setup(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/training-plan');
  await page.getByRole('button', { name: /View Added Modules/i }).last().click();
  await page.getByRole('button', { name: /Edit$/ }).first().click();
  await page.getByText('Compare with LMS modules', { exact: true }).click();
  await page.getByLabel('Current module to match').selectOption(JSON.stringify(['me-lvl4', 'c1', 'b101']));
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('Marketing');
  await expect(page.getByText('Automatic match: same module name and start date.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).not.toHaveAttribute('data-selected-status', 'Manually matched');
  const current = page.getByLabel('Current module to match');
  const lms = page.getByLabel('LMS module to match');
  const left = (await current.boundingBox())!;
  const right = (await lms.boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x + left.width);
  expect(Math.abs(left.y - right.y)).toBeLessThan(3);
  const table = page.getByRole('table', { name: 'Selected module comparison' });
  await expect(table).toContainText('Plan Tutor');
  await expect(table).toContainText('LMS Tutor');
  await page.screenshot({ path: testInfo.outputPath('edit-module-lms-comparison.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLeft = (await current.boundingBox())!;
  const mobileRight = (await lms.boundingBox())!;
  expect(mobileRight.x).toBeGreaterThan(mobileLeft.x + mobileLeft.width);
  expect(Math.abs(mobileLeft.y - mobileRight.y)).toBeLessThan(3);
  const scroll = page.getByRole('region', { name: 'Module comparison details' });
  expect(await scroll.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(api.writes).toEqual([]);
  expect(api.errors).toEqual([]);
});
