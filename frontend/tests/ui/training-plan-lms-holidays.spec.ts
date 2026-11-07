import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

const XLSX = createRequire(import.meta.url)('xlsx') as typeof import('xlsx');

test.use({ channel: 'chrome' });

for (const failFirst of [false, true]) {
  test(`LMS holiday weeks shift dates only in the LMS timeline${failFirst ? ' after retry' : ''}`, async ({ page }) => {
    const user = { id: 1, username: 'preview', displayName: 'Preview', groups: ['Admin Access'],
      access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
    await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
    const items = [{ id: 1, programmeId: 'me-lvl4', cohortId: 'c1', cohortName: 'November cohort', program: 'ME L4',
      startingDateLabel: '2026-11-02', moduleName: 'Marketing', groupName: 'G1 - Monday', tutorName: '', coachName: '',
      startDate: '2026-11-02', endDate: '2027-01-25', sessionsNumber: '13', sessionWeekDay: 'monday',
      sessionStartTime: '09:00', sessionEndTime: '10:00',
      notes: '__program_id:me-lvl4\n__cohort_id:c1\n__group_id:g1\n__block_id:b1' }];
    const programmes = [{ id: 'me-lvl4', name: 'ME L4', sub: '', color: '#115E59' }];
    const currentHoliday = { id: 'plan-holiday', label: 'College closure', startDate: '2026-12-24', endDate: '2026-12-24', type: 'Closure', color: '#FF0000' };
    const lmsHoliday = { id: 'lms-holiday:england-and-wales:2026-12-25', label: 'Christmas Day',
      startDate: '2026-12-25', endDate: '2026-12-25', type: 'Bank holiday', color: '#8B5CF6' };
    const mondayHoliday = { ...lmsHoliday, id: 'another-holiday', label: 'Winter bank holiday',
      startDate: '2026-12-21', endDate: '2026-12-21' };
    const weekId = 'lms-holiday-week:2026-12-21';
    let holidayRequests = 0;
    const writes: string[] = [];
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/training-plan') && route.request().method() !== 'GET') writes.push(path);
      let body: unknown = [];
      if (path === '/api/auth/access/') body = user;
      if (path === '/api/health/') body = { status: 'ok' };
      if (path === '/api/training-plan/') body = { items, version: 'v1', count: 1 };
      if (path === '/api/training-plan-bootstrap/') body = {
        trainingPlan: { items, version: 'v1', count: 1 }, programConfigs: programmes,
        moduleDefinitions: [], catalogModules: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [],
        holidays: { items: [currentHoliday], version: 'h1' }, versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
      };
      if (path === '/api/training-plan-program-configs/') body = programmes;
      if (path === '/api/training-plan-holidays/') body = { items: [currentHoliday], version: 'h1' };
      if (path === '/api/training-plan/lms-reference/') body = { reference: {
        id: 1, createdAt: '2026-11-01T00:00:00Z', createdBy: { id: '1', name: 'Test' }, count: 2, contentSha256: 'test',
        records: [{ sourceModuleId: 'm1', sourceProgrammeId: 'p1', programme: 'Marketing Executive Level 4',
          module: 'Marketing', cohortId: 'c1', cohortName: 'November cohort', groupName: 'G1 - Monday',
          startDate: '2026-11-02', endDate: '2027-01-25' },
        { sourceModuleId: 'm2', sourceProgrammeId: 'p1', programme: 'Marketing Executive Level 4',
          module: 'Following module', cohortId: 'c1', cohortName: 'November cohort', groupName: 'G1 - Monday',
          startDate: '2027-02-01', endDate: '2027-02-15' }],
      } };
      if (path === '/api/training-plan/lms-reference/tutors/') body = { tutorNames: {} };
      if (path === '/api/training-plan/lms-reference/cohorts/') body = { cohorts: {} };
      if (path === '/api/training-plan/lms-reference/session-counts/') body = { sessionCounts: {} };
      if (path === '/api/training-plan/lms-reference/holidays/') {
        holidayRequests++;
        if (failFirst && holidayRequests === 1) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Unavailable' }) });
          return;
        }
        body = { holidays: [lmsHoliday, mondayHoliday] };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/training-plan');
    const current = page.locator('#current-training-plan-panel');
    await expect(current.locator('[data-holiday-id="plan-holiday"]')).toHaveCount(1);
    expect(holidayRequests).toBe(0);
    await page.getByRole('tab', { name: 'Merge', exact: true }).click();
    const merged = page.getByRole('tabpanel', { name: 'Merge', exact: true });
    await expect(merged.locator('[data-holiday-id="plan-holiday"]')).toHaveCount(1);
    expect(holidayRequests).toBe(0);
    await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
    const lms = page.getByRole('tabpanel', { name: 'LMS Training Plan', exact: true });
    if (failFirst) {
      await expect(lms.getByRole('alert')).toContainText('LMS holidays could not be loaded');
      await expect(lms.getByRole('region', { name: 'LMS reference timeline', exact: true })).toBeVisible();
      await lms.getByRole('button', { name: 'Retry loading holidays', exact: true }).click();
    }
    const band = lms.locator(`[data-holiday-id="${weekId}"]`);
    await expect(band).toHaveCount(1);
    await expect(band).toHaveCSS('background-color', 'rgb(139, 92, 246)');
    await expect(band).toHaveAttribute('data-holiday-start', '2026-12-21');
    await expect(band).toHaveAttribute('data-holiday-end', '2026-12-25');
    const dayMarker = lms.getByRole('button', { name: /^Holiday: Christmas Day\. Friday, 25 Dec 2026\./ });
    await expect(dayMarker).toHaveCSS('background-color', 'rgb(109, 40, 217)');
    await expect(lms.locator('[data-holiday-day]')).toHaveCount(2);
    await dayMarker.focus();
    const holidayDetails = lms.getByRole('tooltip');
    await expect(holidayDetails).toContainText('Actual holidays');
    await expect(holidayDetails).toContainText('Christmas Day');
    await expect(holidayDetails).toContainText('Friday, 25 Dec 2026');
    await expect(holidayDetails).toContainText('Winter bank holiday');
    await expect(holidayDetails).toContainText('Monday, 21 Dec 2026');
    await expect(holidayDetails).toContainText('Week off (Monday–Friday)');
    await dayMarker.press('Escape');
    await expect(holidayDetails).toHaveCount(0);
    await dayMarker.click({ position: { x: 2, y: 8 } });
    await expect(holidayDetails).toBeVisible();
    await expect(holidayDetails).toContainText('Friday, 25 Dec 2026');
    await dayMarker.press('Escape');
    await expect(lms.locator('[data-holiday-id="plan-holiday"]')).toHaveCount(0);
    await expect(lms.getByRole('alert')).toHaveCount(0);
    await lms.getByTitle('Expand programme', { exact: true }).click();
    await expect(lms.locator('[data-source="LMS"]').first()).toHaveAttribute('title', /Start: 2026-11-02\. End: 2027-02-01\./);
    await expect(lms.locator('[data-source="LMS"]').first()).toHaveAttribute('title', /Original LMS dates: 2026-11-02 to 2027-01-25\. Holiday delay: 1 week\./);
    await expect(lms.locator('[data-source="LMS"]').nth(1)).toHaveAttribute('title', /Start: 2027-02-08\. End: 2027-02-22\./);
    const downloadEvent = page.waitForEvent('download');
    await lms.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadEvent;
    const workbook = XLSX.readFile((await download.path())!);
    const exported = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets['LMS Training Plan']);
    expect(exported.find(row => row['Source Module ID'] === 'm1')).toMatchObject({
      'Start Date': '2026-11-02', 'End Date': '2027-02-01', 'Original LMS End Date': '2027-01-25', 'Holiday Delay (Weeks)': 1,
    });
    expect(exported.find(row => row['Source Module ID'] === 'm2')).toMatchObject({
      'Start Date': '2027-02-08', 'End Date': '2027-02-22', 'Original LMS Start Date': '2027-02-01',
    });
    await lms.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(lms.getByText('Mon', { exact: true }).first()).toBeAttached();
    await expect(lms.getByText('Fri', { exact: true }).first()).toBeAttached();
    await expect(lms.getByText('Sat', { exact: true })).toHaveCount(0);
    await expect(lms.getByText('Sun', { exact: true })).toHaveCount(0);
    await lms.getByRole('button', { name: 'Month', exact: true }).click();
    const expectedRequests = failFirst ? 2 : 1;
    expect(holidayRequests).toBe(expectedRequests);
    await page.getByRole('tab', { name: 'Merge', exact: true }).click();
    await expect(merged.locator('[data-holiday-id="plan-holiday"]')).toHaveCount(1);
    await expect(merged.locator(`[data-holiday-id="${weekId}"]`)).toHaveCount(0);
    await page.getByRole('tab', { name: 'Current Training Plan', exact: true }).click();
    await expect(current.locator('[data-holiday-id="plan-holiday"]')).toHaveCount(1);
    await expect(current.locator(`[data-holiday-id="${weekId}"]`)).toHaveCount(0);
    await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
    await expect(lms.locator(`[data-holiday-id="${weekId}"]`)).toHaveCount(1);
    expect(holidayRequests).toBe(expectedRequests);
    expect(writes).toEqual([]);
  });
}
