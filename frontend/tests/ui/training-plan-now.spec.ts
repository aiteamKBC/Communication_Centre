import { expect, test, type Locator } from '@playwright/test';

test.use({ channel: 'chrome', timezoneId: 'Africa/Cairo' });

async function expectNowInView(panel: Locator) {
  const line = panel.locator('[data-timeline-now="2026-11-07"]').first();
  await expect(line).toBeAttached();
  await expect.poll(() => line.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const scroll = element.closest('.training-plan-gantt-scroll')!;
    const viewport = scroll.getBoundingClientRect();
    const labelWidth = element.parentElement!.previousElementSibling!.getBoundingClientRect().width;
    return bounds.left >= viewport.left + labelWidth - 1 && bounds.left < viewport.right;
  })).toBe(true);
}

test('all timeline sources open at Now across zooms and screen sizes, including historical plans', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
  const user = { id: 1, username: 'preview', groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true } };
  await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  const items = [{ id: 1, programmeId: 'me-lvl4', cohortId: 'c1', cohortName: 'Historical cohort', program: 'ME L4',
    startingDateLabel: '2024-01-01', moduleName: 'Historical module', groupName: 'Group 1', tutorName: '', coachName: '',
    startDate: '2024-01-01', endDate: '2024-01-29', sessionsNumber: '5', sessionWeekDay: 'monday',
    notes: '__program_id:me-lvl4\n__cohort_id:c1\n__group_id:g1\n__block_id:b1' }];
  const programmes = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#20869B' }];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === '/api/auth/access/') body = user;
    if (path === '/api/health/') body = { status: 'ok' };
    if (path === '/api/training-plan/') body = { items, version: 'v1', count: 1 };
    if (path === '/api/training-plan-bootstrap/') body = {
      trainingPlan: { items, version: 'v1', count: 1 }, programConfigs: programmes,
      moduleDefinitions: [], catalogModules: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [],
      holidays: { items: [], version: 'h1' }, versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
    };
    if (path === '/api/training-plan-program-configs/') body = programmes;
    if (path === '/api/training-plan-holidays/') body = { items: [], version: 'h1' };
    if (path === '/api/training-plan/lms-reference/') body = { reference: {
      id: 1, createdAt: '2026-11-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: 1, contentSha256: 'test',
      records: [{ sourceModuleId: 'lms1', sourceProgrammeId: 'lms-me', programme: 'Marketing Executive Level 4',
        module: 'Historical module', startDate: '2024-01-01', endDate: '2024-01-29' }],
    } };
    if (path.endsWith('/tutors/')) body = { tutorNames: {} };
    if (path.endsWith('/cohorts/')) body = { cohorts: {} };
    if (path.endsWith('/session-counts/')) body = { sessionCounts: { lms1: 5 } };
    if (path === '/api/training-plan/lms-reference/holidays/') body = { holidays: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/training-plan');
    for (const name of ['Current Training Plan', 'Merge', 'LMS Training Plan']) {
      await page.getByRole('tab', { name, exact: true }).click();
      const panel = page.getByRole('tabpanel', { name, exact: true });
      await expectNowInView(panel);
      for (const zoom of ['Year', 'Intake', 'Month', 'Week', 'Day']) {
        await panel.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: zoom, exact: true }).click();
        await expectNowInView(panel);
      }
      // Ordinary rerenders must preserve the user's horizontal scroll position.
      const scroll = panel.locator('.training-plan-gantt-scroll');
      await scroll.evaluate(element => { element.scrollLeft = 0; });
      await panel.getByTitle(/Expand programme|Collapse programme/).first().click();
      expect(await scroll.evaluate(element => element.scrollLeft)).toBe(0);
      // The location button remains available after browsing away from Now.
      await panel.getByRole('button', { name: "Go to today's line", exact: true }).click();
      await expectNowInView(panel);
    }
  }
});
