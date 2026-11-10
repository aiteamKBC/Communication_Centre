// Real browser/API verification uses only the isolated frontend and test copies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const backend = fileURLToPath(new URL('../', import.meta.url));
const frontend = resolve(backend, '../frontend');
const require = createRequire(resolve(frontend, 'package.json'));
const { chromium, expect: playwrightExpect } = require('@playwright/test');
const expect = playwrightExpect.configure({ timeout: 30000 });
const base = 'http://127.0.0.1:3100';
const privateDir = resolve(backend, 'training_plan_lms_reference_dev/private');
const credentials = name => JSON.parse(readFileSync(resolve(privateDir, name), 'utf8'));
const fixture = action => {
  const result = spawnSync(resolve(backend, 'venv/Scripts/python.exe'), ['-m', 'training_plan_lms_reference_dev.ui_fixtures', action], { cwd: backend, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'Isolated fixture operation failed.');
};
fixture('--viewer');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const problems = [];
const contexts = [];
let debugPage;

async function openReference(page) {
  await page.getByRole('tab', { name: 'LMS Training Plan', exact: true }).click();
  const panel = page.locator('#training-plan-lms-reference');
  await expect(panel.getByText('Please wait…', { exact: true })).toHaveCount(0);
  const summary = panel.locator('summary');
  if (await summary.count() && !await summary.evaluate(node => node.closest('details').open)) await summary.click();
}

async function signedIn(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles' });
  contexts.push(context);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  const creds = credentials(name);
  const login = await context.request.post(base + '/api/auth/login/', { data: { identifier: creds.email, password: creds.password } });
  assert.equal(login.status(), 200, 'Test account could not sign in to the isolated backend.');
  const user = await login.json();
  await context.addInitScript(value => localStorage.setItem('kbc-auth-user', JSON.stringify(value)), user);
  const page = await context.newPage();
  page.on('pageerror', error => problems.push(error.message));
  await page.goto(base + '/training-plan');
  await expect(page.getByRole('tab', { name: 'LMS Training Plan', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: /Monthly Module Breakdown/ })).toBeVisible({ timeout: 60000 });
  return { context, page };
}

try {
  const viewer = await signedIn('viewer-access.json');
  debugPage = viewer.page;
  const initial = (await (await viewer.context.request.get(base + '/api/training-plan/lms-reference/')).json()).reference;
  await openReference(viewer.page);
  const viewerPanel = viewer.page.getByRole('tabpanel', { name: 'LMS Training Plan', exact: true });
  if (!initial) await expect(viewerPanel.getByText('No LMS reference has been captured yet.', { exact: true })).toBeVisible();
  else await expect(viewerPanel.getByText(`${initial.count} / ${initial.count} modules`, { exact: true })).toBeVisible();
  await expect(viewerPanel.getByRole('button', { name: 'Capture LMS Reference', exact: true })).toHaveCount(0);
  const token = (await viewer.context.cookies()).find(cookie => cookie.name === 'csrftoken')?.value;
  const forbidden = await viewer.context.request.post(base + '/api/training-plan/lms-reference/', { data: {}, headers: { 'X-CSRFToken': token || '' } });
  assert.equal(forbidden.status(), 403);
  assert.match((await forbidden.json()).detail, /management permission/);

  const manager = await signedIn('preview-access.json');
  debugPage = manager.page;
  let writes = 0;
  manager.page.on('request', request => { if (request.url().includes('/api/training-plan/lms-reference/') && request.method() !== 'GET') writes++; });
  await expect(manager.page.getByRole('tabpanel', { name: 'LMS Training Plan', exact: true })).toHaveCount(0);
  await openReference(manager.page);
  const panel = manager.page.getByRole('tabpanel', { name: 'LMS Training Plan', exact: true });
  if (!initial) await expect(panel.getByRole('button', { name: 'Capture LMS Reference', exact: true })).toBeVisible();
  assert.equal(writes, 0, 'Showing the reference must not write.');
  if (!initial) {
    await panel.getByRole('button', { name: 'Capture LMS Reference', exact: true }).click();
    await expect(panel.locator('summary')).toBeVisible();
    await panel.locator('summary').click();
  }
  await expect(panel.getByText('332 / 332 modules', { exact: true })).toBeVisible({ timeout: 30000 });
  const expectedWrites = initial ? 0 : 1;
  assert.equal(writes, expectedWrites);
  console.log('Browser permissions and complete persisted capture verified.');
  const captured = (await (await manager.context.request.get(base + '/api/training-plan/lms-reference/')).json()).reference;
  const timeline = panel.getByRole('region', { name: 'LMS reference timeline', exact: true });
  const datedRecords = captured.records.filter(row => row.startDate && row.endDate && row.startDate <= row.endDate);
  await expect(timeline.locator('[data-source="LMS"]')).toHaveCount(datedRecords.length);
  for (const row of datedRecords) {
    const bar = timeline.locator(`[data-timeline-block-id="lms-module:${row.sourceModuleId}"]`);
    await expect(bar).toHaveAttribute('title', new RegExp(`Start: ${row.startDate}\\. End: ${row.endDate}\\.`));
  }
  await expect(timeline.getByRole('button', { name: /^Classes/ })).toHaveCount(0);
  await expect(timeline.getByText(/sessions complete|No sessions|Finished/)).toHaveCount(0);
  const table = panel.getByRole('table', { name: 'LMS reference', exact: true });
  await expect(table.getByRole('columnheader')).toHaveCount(4);
  await expect(table.locator('tbody tr')).toHaveCount(captured.records.length);
  assert.equal(await table.locator('tbody td:nth-child(3)').filter({ hasText: /^Not provided$/ }).count(), captured.records.filter(row => row.startDate === null).length);
  const dated = captured.records.find(row => row.startDate);
  await expect(table.getByRole('cell', { name: dated.startDate, exact: true }).first()).toBeVisible();

  await panel.getByLabel('Search reference', { exact: true }).fill('__no_such_reference_module__');
  await expect(table.getByText('No captured modules match these filters.', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Reset reference filters', exact: true }).click();
  const programme = captured.records[0].programme;
  await panel.getByLabel('Reference programme', { exact: true }).selectOption('value:' + programme);
  await expect(table.locator('tbody tr')).toHaveCount(captured.records.filter(row => row.programme === programme).length);
  await panel.getByRole('button', { name: 'Reset reference filters', exact: true }).click();
  await panel.getByRole('button', { name: 'Sort by Module', exact: true }).click();
  const modules = await table.locator('tbody td:nth-child(2)').allTextContents();
  assert.deepEqual(modules, [...modules].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })));
  await manager.page.setViewportSize({ width: 390, height: 844 });
  const region = panel.getByRole('region', { name: 'Captured LMS modules', exact: true });
  assert.ok(await region.evaluate(node => node.scrollWidth > node.clientWidth && node.scrollHeight > node.clientHeight), 'Reference must support horizontal/vertical scrolling.');
  await manager.page.setViewportSize({ width: 1440, height: 1000 });
  await manager.page.getByRole('tab', { name: 'Current Training Plan', exact: true }).click();
  await openReference(manager.page);
  assert.equal(writes, expectedWrites, 'Hide/show must not capture again.');
  await expect(panel.getByRole('button', { name: /capture|edit|delete|assign|coverage|replace|restore|refresh/i })).toHaveCount(0);
  await manager.page.getByRole('button', { name: 'Session Schedule', exact: true }).click();
  await expect(manager.page.getByRole('columnheader', { name: 'Session Status', exact: true })).toBeVisible();
  await manager.page.getByRole('button', { name: 'Training Plan', exact: true }).click();
  await expect(manager.page.getByRole('tab', { name: 'LMS Training Plan', exact: true })).toBeVisible();

  fixture('--change');
  await manager.page.reload();
  await openReference(manager.page);
  await expect(manager.page.getByText('332 / 332 modules', { exact: true })).toBeVisible();
  const after = (await (await manager.context.request.get(base + '/api/training-plan/lms-reference/')).json()).reference;
  assert.deepEqual(after, captured, 'Committed LMS/live changes must not alter the persisted reference after reload.');
  await viewer.page.reload();
  await openReference(viewer.page);
  await expect(viewer.page.getByText('332 / 332 modules', { exact: true })).toBeVisible();
  const viewerAfter = (await (await viewer.context.request.get(base + '/api/training-plan/lms-reference/')).json()).reference;
  assert.deepEqual(viewerAfter, captured, 'Separate viewer session must see the same capture.');
  assert.equal(writes, expectedWrites);
  assert.deepEqual(problems, [], 'Training Plan browser errors were reported.');
  await panel.locator('.training-plan-gantt-toolbar').scrollIntoViewIfNeeded();
  await manager.page.screenshot({ path: resolve(privateDir, 'lms-reference-preview.png') });
  console.log('Real browser checks passed: hidden default; manager-only capture; LMS timeline with exact source dates; no inferred sessions; four-column table; missing dates; timezone; search/filter/sort/scroll; zero-write toggles; reload/session persistence; committed source/live changes; no mutation controls.');
} catch (error) {
  if (debugPage) console.error('Reference panel at failure:', (await debugPage.locator('#training-plan-lms-reference').innerText({ timeout: 2000 }).catch(() => 'Not rendered')).slice(0,700));
  console.error('Browser page errors:', problems);
  throw new Error(error.message.slice(-1800));
} finally {
  fixture('--restore');
  for (const context of contexts) await context.close();
  await browser.close();
}
