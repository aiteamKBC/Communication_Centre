// Learner allocation: the director hands the whole shared queue to one specialist.
import { expect, test } from '@playwright/test';

const LEARNERS = [
  { email: 'a@example.org', name: 'Amy', agent_id: null, allocated_to: null, manager_email: '', manager_name: '' },
  { email: 'b@example.org', name: 'Ben', agent_id: null, allocated_to: null, manager_email: 'boss@acme.example', manager_name: 'Boss' },
  // Tina makes the employer calls, so her own learners wait in the shared queue meanwhile.
  { email: 'c@example.org', name: 'Cal', agent_id: 7, allocated_to: 7, manager_email: '', manager_name: '' },
  { email: 'd@example.org', name: 'Dee', agent_id: 1, allocated_to: 1, manager_email: '', manager_name: '' },
].map(l => ({ ...l, revision: 1, programme: 'L3', organisation: 'Acme', coach: 'Carter', active_cases: 1 }));

test('the director transfers the whole shared queue to one specialist', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('kbc-auth-user', JSON.stringify({ id: 1, email: 'boss@example.org', username: 'boss', displayName: 'Boss', groups: [], access: {}, loggedInAt: new Date().toISOString() }));
  });
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body: unknown) => route.fulfill({ json: body });
    if (url.pathname === '/api/callcentre/allocations/' && route.request().method() === 'POST') {
      saved.push(route.request().postDataJSON());
      return json({ changed: (route.request().postDataJSON() as { changes: unknown[] }).changes.length });
    }
    if (url.pathname === '/api/callcentre/allocations/') {
      return json({ learners: LEARNERS, operators: [{ id: 1, display_name: 'Alice' }, { id: 4, display_name: 'Safiyah Wellspring' }, { id: 7, display_name: 'Tina Wright' }],
        inactive: [], history: [] });
    }
    if (url.pathname === '/api/callcentre/employer-specialists/') {
      return json({ values: { enabled: true, agent_ids: [7] }, revision: 0, set_up: true, not_set_up: '', open_employer_cases: 0, agents: [], history: [] });
    }
    if (url.pathname === '/api/callcentre/do-not-call/') {
      return json({ set_up: true, not_set_up: '', reasons: { medical: 'Medical: cannot take phone calls' }, current: [], history: [] });
    }
    if (url.pathname === '/api/callcentre/config/') return json({ csrf_token: 't', agent_id: null, agents: [], sources: [], cycle: null });
    if (url.pathname === '/api/callcentre/overview/') {
      return json({ today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: new Date().toISOString(),
        access: { role: 'director', agent_id: null, is_superuser: true, display_name: 'Boss', email: 'boss@example.org' }, agents: [], cases: [],
        employer_specialists: [7], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0, sources: [],
        cycle: { last_success_at: new Date().toISOString(), details: {} }, connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null });
    }
    return json({});
  });
  await page.goto('/dashboard/call-centre?view=allocations');
  const shared = page.locator('.ec-stat', { has: page.getByRole('button', { name: 'Transfer to a specialist…' }) });
  await expect(shared.locator('strong')).toHaveText('3');
  await shared.getByRole('button', { name: 'Transfer to a specialist…' }).click();
  const [from, to] = [page.locator('[aria-label="Hand over learners"] select').nth(0), page.locator('[aria-label="Hand over learners"] select').nth(1)];
  await expect(from).toHaveValue('shared');
  await expect(from.locator('option[value="shared"]')).toHaveText('Shared queue (3 learners)');
  await expect(to.locator('option[value="none"]')).toHaveCount(0);   // not "to the shared queue" from the shared queue
  await to.selectOption({ label: 'Safiyah Wellspring' });
  await page.getByRole('button', { name: 'Hand over', exact: true }).click();
  await expect(page.locator('.ec-allocation-toolbar')).toContainText('3 learners handed over in the plan');
  await page.getByRole('button', { name: 'Save 3 changes' }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({ reason: 'Handover from the shared queue to Safiyah Wellspring',
    changes: [{ email: 'a@example.org', agent_id: 4 }, { email: 'b@example.org', agent_id: 4 }, { email: 'c@example.org', agent_id: 4 }] });
  expect(errors).toEqual([]);
});
