import { expect, test } from '@playwright/test';

test.use({ channel: 'chrome' });

test('large merged timelines keep distant modules reachable across zooms and viewport sizes without writing', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const user = { id: 1, username: 'preview', displayName: 'Preview', groups: ['Admin Access'],
    access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  const items = Array.from({ length: 150 }, (_, index) => ({
    id: index + 1, programmeId: 'me-lvl4', cohortId: `c${index}`, cohortName: `Cohort ${index + 1}`, program: 'ME L4',
    startingDateLabel: '2026-11-02', moduleName: `Marketing module ${index + 1}`, groupName: 'G1 - Monday', tutorName: '',
    coachName: '', startDate: '2026-11-02', endDate: '2027-01-25', sessionsNumber: '13', sessionWeekDay: 'monday',
    sessionStartTime: '09:00', sessionEndTime: '10:00', cohortDisplayOrder: index,
    notes: `__program_id:me-lvl4\n__cohort_id:c${index}\n__group_id:g${index}\n__block_id:b${index}\n__module_color:#20869B`,
  }));
  const records = items.map((item, index) => ({ sourceModuleId: `lms${index}`, sourceProgrammeId: 'lms-me',
    programme: 'Marketing Executive Level 4', module: item.moduleName, startDate: item.startDate, endDate: item.endDate }));
  const programmes = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#E8D000' }];
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' && path.startsWith('/api/training-plan')) writes.push(path);
    let body: unknown = [];
    if (path === '/api/auth/access/') body = user;
    if (path === '/api/health/') body = { status: 'ok' };
    if (path === '/api/training-plan/') body = { items, version: 'v1', count: items.length };
    if (path === '/api/training-plan-bootstrap/') body = {
      trainingPlan: { items, version: 'v1', count: items.length }, programConfigs: programmes,
      moduleDefinitions: [], catalogModules: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [],
      holidays: { items: [], version: 'h1' }, versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
    };
    if (path === '/api/training-plan-program-configs/') body = programmes;
    if (path === '/api/training-plan-holidays/') body = { items: [], version: 'h1' };
    if (path === '/api/training-plan/lms-reference/') body = { reference: {
      id: 1, createdAt: '2026-11-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: 152, contentSha256: 'test',
      records: [...records,
        { ...records[0], sourceModuleId: 'historic', module: 'Historic workshop', startDate: '2024-03-01', endDate: '2024-03-15' },
        { ...records[0], sourceModuleId: 'undated', module: 'Undated workshop', startDate: null }],
    } };
    if (path === '/api/training-plan/lms-reference/tutors/') body = { tutorNames: {} };
    if (path === '/api/training-plan/lms-reference/cohorts/') body = { cohorts: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/training-plan');
  await page.getByRole('tab', { name: 'Merge', exact: true }).click();
  const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
  await expect(merged.getByRole('heading', { name: 'Merged Training Plans', exact: true })).toBeVisible();
  await expect(merged.locator('.tp-merged-stats > div').nth(1)).toContainText('150');
  await expect(merged.getByRole('status')).toContainText('1 LMS module has missing or invalid dates');
  const firstModule = merged.getByRole('button', { name: 'View Current module details: Marketing module 1', exact: true });
  await expect(firstModule).toBeAttached();
  // Historical records must not place the first displayed card off screen.
  const placement = await firstModule.evaluate(element => {
    const card = element.getBoundingClientRect();
    const viewport = element.closest('.training-plan-gantt-scroll')!.getBoundingClientRect();
    return { left: card.left, right: viewport.right };
  });
  expect(placement.left).toBeLessThan(placement.right);
  expect(await merged.locator('[data-timeline-block-id]').count()).toBeLessThan(100);
  await expect(merged.locator('[data-virtual-placeholder]').first()).toBeAttached();
  await merged.locator('.tp-merged-overview').screenshot({ path: testInfo.outputPath('merged-overview-desktop.png') });
  await merged.locator('.tp-timeline-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('merged-timeline-desktop.png') });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const scroll = merged.locator('.training-plan-gantt-scroll');
    const heightBefore = await scroll.evaluate(element => element.scrollHeight);
    // A distant placeholder retains its position and loads both source halves.
    await merged.locator('[data-row-target="0-298"]').scrollIntoViewIfNeeded();
    await expect(merged.getByRole('button', { name: 'View Current module details: Marketing module 150', exact: true })).toBeAttached();
    await expect(merged.getByRole('button', { name: 'View LMS module details: Marketing module 150', exact: true })).toBeAttached();
    expect(await scroll.evaluate(element => element.scrollHeight)).toBe(heightBefore);
    expect(await merged.locator('[data-timeline-block-id]').count()).toBeLessThan(100);
    for (const zoom of ['Year', 'Intake', 'Month', 'Week', 'Day']) {
      await merged.getByRole('group', { name: 'Timeline zoom' }).getByRole('button', { name: zoom, exact: true }).click();
      await expect(merged.getByRole('button', { name: zoom, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await merged.locator('[data-row-target="0-298"]').scrollIntoViewIfNeeded();
      await expect(merged.getByRole('button', { name: 'View Current module details: Marketing module 150', exact: true })).toBeAttached();
    }
    await merged.getByRole('group', { name: 'Timeline zoom' }).getByRole('button', { name: 'Month', exact: true }).click();
    await scroll.evaluate(element => { element.scrollTop = 0; });
    await merged.locator('.tp-merged-overview').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 390) await merged.locator('.tp-merged-overview').screenshot({ path: testInfo.outputPath('merged-overview-mobile.png') });
  }
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
