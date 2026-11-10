import { expect, test, type Locator, type Page } from '@playwright/test';
import { verifyTimelineUndo, type TimelineUndoEntry } from '../../src/pages/apprenticeships-timeline/timelineUndo';
import { matchesDateRange } from '../../src/pages/apprenticeships-timeline/components/selectFilters';
import type { ProgrammeGroup } from '../../src/pages/apprenticeships-timeline/types';

test.use({ channel: 'chrome', timezoneId: 'Africa/Cairo' });

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-01-10T10:00:00Z'));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  const user = { id: 1, username: 'editor', groups: ['Admin Access'], access: { adminAccess: true, operationsAccess: true, canManageCohorts: true } };
  await page.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  const programmes = [{ id: 'p1', name: 'Programme One', sub: '', color: '#20869B' }, { id: 'p2', name: 'Programme Two', sub: '', color: '#4A6DB0' }];
  const items = [101, 102, 201].map((id, index) => ({
    id, programmeId: index < 2 ? 'p1' : 'p2', cohortId: `c${index + 1}`, cohortName: `Cohort ${index + 1}`,
    program: index < 2 ? 'Programme One' : 'Programme Two', startingDateLabel: '2026-01-01',
    moduleName: `Module ${id}`, groupName: 'Group 1', tutorName: '', coachName: '', tutorProfileId: '',
    startDate: '2026-01-05', endDate: '2026-01-19', sessionsNumber: '3', sessionWeekDay: 'monday', sessionStartTime: '09:00', sessionEndTime: '11:00',
    sessionKsbMappings: [], sessionCoverage: [], ksbProfileId: '', programmeDisplayOrder: index < 2 ? 0 : 1, cohortDisplayOrder: index < 2 ? index : 0,
    notes: `__program_id:${index < 2 ? 'p1' : 'p2'}\n__cohort_id:c${index + 1}\n__group_id:g${index + 1}\n__block_id:b${id}\n__lms_source_module_id:lms-${id}\nKeep manual link and notes`,
  }));
  let version = 1;
  let rejectNext = false;
  const writes: { path: string; payload: Record<string, unknown> }[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const snapshot = () => ({ items, version: `v${version}`, count: items.length });
    if (route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON();
      writes.push({ path, payload });
      expect(payload.version).toBe(`v${version}`);
      if (rejectNext) { rejectNext = false; return json({ detail: 'Save rejected for test.' }, 400); }
      const session = items.find(item => path === `/api/training-plan/sessions/${item.id}/`);
      if (session) { session.startDate = payload.startDate; session.endDate = payload.endDate; }
      else if (path === '/api/training-plan/reorder/programmes/') {
        for (const item of items) item.programmeDisplayOrder = payload.programmeIds.indexOf(item.programmeId);
      } else if (path === '/api/training-plan/reorder/cohorts/') {
        for (const item of items.filter(row => row.programmeId === payload.programmeId)) item.cohortDisplayOrder = payload.cohortIds.indexOf(item.cohortId);
      } else if (path.endsWith('/move/')) {
        const cohortId = path.split('/')[4];
        for (const item of items.filter(row => row.cohortId === cohortId && row.programmeId === payload.fromProgrammeId)) {
          item.programmeId = payload.toProgrammeId; item.program = payload.toProgrammeName;
          item.notes = item.notes.replace(/^__program_id:.*$/m, `__program_id:${payload.toProgrammeId}`);
        }
        for (const item of items) {
          if (item.programmeId === payload.fromProgrammeId) item.cohortDisplayOrder = payload.sourceCohortIds.indexOf(item.cohortId);
          if (item.programmeId === payload.toProgrammeId) item.cohortDisplayOrder = payload.targetCohortIds.indexOf(item.cohortId);
        }
      } else return json({ detail: `Unexpected write ${path}` }, 400);
      version += 1;
      return json({ ...snapshot(), ...(session ? { item: session } : {}) });
    }
    if (path === '/api/auth/access/') return json(user);
    if (path === '/api/health/') return json({ status: 'ok' });
    if (path === '/api/training-plan/') return json(snapshot());
    if (path === '/api/training-plan-bootstrap/') return json({
      trainingPlan: snapshot(), programConfigs: programmes, catalogModules: [], moduleDefinitions: [], ksbProfiles: [], tutorProfiles: [], coachProfiles: [],
      holidays: { items: [], version: 'h1' }, versions: { programConfigs: 'p1', moduleDefinitions: 'm1' },
    });
    if (path === '/api/training-plan-program-configs/') return json(programmes);
    if (path === '/api/training-plan-holidays/') return json({ items: [], version: 'h1' });
    if (path === '/api/training-plan/lms-reference/') return json({ reference: null });
    if (path.endsWith('/holidays/')) return json({ holidays: [] });
    return json([]);
  });
  await page.goto('/training-plan');
  await expect(page.getByRole('button', { name: 'Undo timeline move', exact: true })).toBeDisabled();
  return { items, writes, failNext: () => { rejectNext = true; }, changedElsewhere: () => { items[0].startDate = '2026-02-02'; items[0].endDate = '2026-02-16'; version += 1; } };
}

async function expand(page: Page) {
  const buttons = page.getByTitle('Expand programme', { exact: true });
  while (await buttons.count()) await buttons.first().click();
}

async function moveModule(page: Page) {
  const bar = page.locator('[data-timeline-block-id="b101"]');
  await bar.scrollIntoViewIfNeeded();
  // Month zoom is 2.8 pixels per calendar day. Dispatch pointer events to the
  // real drag handlers, including React's rerender between move and release.
  await bar.dispatchEvent('pointerdown', { button: 0, clientX: 500, pointerId: 1 });
  await page.dispatchEvent('body', 'pointermove', { clientX: 519.6, pointerId: 1 });
  await expect(bar).toHaveCSS('opacity', '0.9');
  await page.dispatchEvent('body', 'pointerup', { clientX: 519.6, pointerId: 1 });
}

async function drag(page: Page, source: Locator, target: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const bounds = (await target.boundingBox())!;
  await source.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer, clientY: bounds.y + 1 });
  await target.dispatchEvent('drop', { dataTransfer, clientY: bounds.y + 1 });
}

test('Undo restores module dates on the server, preserves manual matches and survives reload', async ({ page }, testInfo) => {
  const api = await setup(page);
  await expand(page);
  const notes = api.items[0].notes;
  await moveModule(page);
  const undo = page.getByRole('button', { name: 'Undo timeline move', exact: true });
  await expect(undo).toBeEnabled();
  expect(api.items[0].startDate).toBe('2026-01-12');
  expect(api.items[0].endDate).toBe('2026-01-26');
  await undo.click();
  await expect(undo).toBeDisabled();
  expect(api.items[0].startDate).toBe('2026-01-05');
  expect(api.items[0].endDate).toBe('2026-01-19');
  expect(api.items[0].notes).toBe(notes);
  expect(api.writes).toHaveLength(2);
  expect(Object.keys(api.writes[1].payload).sort()).toEqual(['endDate', 'startDate', 'version']);
  await page.screenshot({ path: testInfo.outputPath('timeline-undo-saved.png') });
  await page.reload();
  expect(api.items[0].startDate).toBe('2026-01-05');
  await expect(undo).toBeDisabled();
});

test('Undo supports successive cohort and programme reorders and cross-programme moves', async ({ page }) => {
  const api = await setup(page);
  await expand(page);
  const undo = page.getByRole('button', { name: 'Undo timeline move', exact: true });
  await drag(page, page.locator('[data-row-target="0-1"] [draggable="true"]').first(), page.locator('[data-row-target="0-0"]'));
  await expect(undo).toBeEnabled();
  expect(api.items[1].cohortDisplayOrder).toBe(0);
  await drag(page, page.locator('[data-programme-target="1"] [draggable="true"]').first(), page.locator('[data-programme-target="0"]'));
  await expect.poll(() => api.items[2].programmeDisplayOrder).toBe(0);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => api.items[0].programmeDisplayOrder).toBe(0);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
  expect(api.items[0].cohortDisplayOrder).toBe(0);
  await drag(page, page.locator('[data-row-target="0-0"] [draggable="true"]').first(), page.locator('[data-row-target="1-0"]'));
  await expect.poll(() => api.items[0].programmeId).toBe('p2');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
  expect(api.items[0].programmeId).toBe('p1');
  expect(api.items[0].notes).toContain('__lms_source_module_id:lms-101');
});

test('failed Undo can be retried and external date changes are never overwritten', async ({ page }) => {
  const api = await setup(page);
  await expand(page);
  await moveModule(page);
  const undo = page.getByRole('button', { name: 'Undo timeline move', exact: true });
  await expect(undo).toBeEnabled();
  api.failNext();
  await undo.click();
  await expect(page.getByText('Undo Not Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(undo).toBeEnabled();
  expect(api.items[0].startDate).toBe('2026-01-12');
  await undo.click();
  await expect(undo).toBeDisabled();
  await moveModule(page);
  await expect(undo).toBeEnabled();
  api.changedElsewhere();
  const writeCount = api.writes.length;
  await undo.click();
  await expect(page.getByText(/This item changed after your move/)).toBeVisible();
  expect(api.writes).toHaveLength(writeCount);
  expect(api.items[0].startDate).toBe('2026-02-02');
});

test('date ranges include boundary overlap, support either bound and reject invalid or undated ranges', () => {
  expect(matchesDateRange('2026-01-05', '2026-01-19', '2026-01-19', '2026-01-19')).toBe(true);
  expect(matchesDateRange('2026-01-05', '2026-01-19', '2026-01-20', '')).toBe(false);
  expect(matchesDateRange('2026-01-05', '2026-01-19', '', '2026-01-05')).toBe(true);
  expect(matchesDateRange('2026-01-05', '2026-01-19', '2026-02-01', '2026-01-01')).toBe(false);
  expect(matchesDateRange('2026-02-30', '2026-03-01', '2026-01-01', '')).toBe(false);
  expect(matchesDateRange(null, null, '2026-01-01', '')).toBe(false);
  expect(matchesDateRange(null, null, '', '')).toBe(true);
});

test('timeline, monthly breakdown and schedule share date filtering and reset without writes', async ({ page }) => {
  const api = await setup(page);
  await expand(page);
  const bars = page.locator('[data-timeline-block-id]');
  await expect(bars).toHaveCount(3);
  await page.getByLabel('Programme timeline From', { exact: true }).fill('2026-02-01');
  await expect(bars).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear Programme timeline dates', exact: true }).click();
  await expect(bars).toHaveCount(3);
  const monthly = page.getByRole('button', { name: /Monthly Module Breakdown/ });
  await monthly.click();
  await page.getByLabel('Monthly modules To', { exact: true }).fill('2026-01-04');
  await expect(monthly).toContainText('0/3 modules');
  await page.getByRole('button', { name: 'Clear Monthly modules dates', exact: true }).click();
  await expect(monthly).toContainText('3/3 modules');
  await page.getByRole('button', { name: 'Session Schedule', exact: true }).click();
  await page.getByLabel('Schedule module dates From', { exact: true }).fill('2026-02-01');
  await expect(page.getByText('0 modules overlapping the selected dates', { exact: true })).toBeVisible();
  await page.getByLabel('Schedule module dates From', { exact: true }).fill('2026-01-19');
  await page.getByLabel('Schedule module dates To', { exact: true }).fill('2026-01-19');
  await expect(page.getByText('3 modules overlapping the selected dates', { exact: true })).toBeVisible();
  expect(api.writes).toEqual([]);
});

test('Undo verifies affected fields while allowing unrelated notes and blocks to change', () => {
  const groups = [{ id: 'p1', rows: [{ id: 'c1', blks: [{ trainingPlanId: '1', startDate: '2026-01-12', endDate: '2026-01-26', notes: 'Changed notes', lmsSourceModuleId: 'saved-match' }] }] }] as ProgrammeGroup[];
  const entry: TimelineUndoEntry = { label: 'Move', path: '', payload: {}, expected: [{ kind: 'dates', trainingPlanId: '1', startDate: '2026-01-12', endDate: '2026-01-26' }] };
  expect(() => verifyTimelineUndo(entry, groups)).not.toThrow();
  expect(() => verifyTimelineUndo({ ...entry, expected: [{ kind: 'dates', trainingPlanId: 'missing', startDate: '2026-01-12', endDate: '2026-01-26' }] }, groups)).toThrow(/changed after your move/);
  expect(() => verifyTimelineUndo({ ...entry, expected: [{ kind: 'cohorts', programmeId: 'p1', ids: ['c2', 'c1'] }] }, groups)).toThrow(/changed after your move/);
  expect(() => verifyTimelineUndo({ ...entry, expected: [{ kind: 'membership', programmeId: 'p1', cohortId: 'c1', trainingPlanIds: ['1'] }] }, groups)).not.toThrow();
  expect(() => verifyTimelineUndo({ ...entry, expected: [{ kind: 'membership', programmeId: 'p1', cohortId: 'c1', trainingPlanIds: ['1', 'new-module'] }] }, groups)).toThrow(/changed after your move/);
});
