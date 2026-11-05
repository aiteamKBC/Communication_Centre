import { expect, test, type Page } from '@playwright/test';

test.use({ channel: 'chrome' });

async function setup(page: Page, automatic = false, additionalModules: { sourceModuleId: string; module: string; programme?: string }[] = []) {
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
    if (path === '/api/training-plan/modules/101/' && method === 'PATCH') {
      if (rejectSave) return json({ detail: 'The match could not be saved.' }, 400);
      const payload = route.request().postDataJSON();
      expect(payload.version).toBe(version);
      expect(Object.keys(payload).sort()).toEqual(['notes', 'version']);
      items[0].notes = payload.notes;
      version = 'v2';
      return json({ item: items[0], items, version, count: items.length });
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
    return json([]);
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return { items, writes, errors, failSave: () => { rejectSave = true; } };
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
  await expect(differences).toContainText('LMS Marketing Workshop');
  await expect(page.getByText('Dates and tutor differ', { exact: true })).toBeVisible();
  await expect(differences).toContainText('2026-02-02');
  await expect(page.getByRole('button', { name: 'LMS module to match', exact: true })).toContainText('LMS Marketing Workshop');
  await page.getByRole('button', { name: 'Remove manual match', exact: true }).click();
  await expect(page.getByText('Manual match removed. Automatic matching applies again.', { exact: true })).toBeVisible();
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
