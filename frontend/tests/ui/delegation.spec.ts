// Task delegation: the director hands Safiyah's Next Day to Alice; Alice sees it where it was placed; Safiyah sees it covered.
import { expect, test, type Page } from '@playwright/test';
import type { DelegatedTask, Overview, OverviewCase } from '../../src/pages/call-centre/api';

const SHOTS = process.env.DELEGATION_SHOTS || '';
const SAFIYAH = 4, ALICE = 1, LIZA = 2;
const TOMORROW = '2026-10-21T09:00:00Z';

function ticket(id: number, name: string, fields: Partial<OverviewCase> = {}): OverviewCase {
  return {
    id, source_type: 'attendance', source_id: null, learner_name: name, learner_email: `${name.split(' ')[0].toLowerCase()}@example.org`,
    learner_phone: `+4477009001${id}`, coach: 'Coach Carter', organisation: 'Acme', programme: 'Business Administrator L3',
    manager_name: '', manager_email: '', issue_name: 'Marketing lecture', issue_date: '2026-10-15', status: 'new', risk: 'amber',
    claimed_by: null, claimed_agent_id: null, last_actor: 'System', last_action_at: '2026-10-19T09:00:00Z', attempts: 0,
    next_followup_at: null, due_at: '2026-10-22T12:00:00Z', sla_breached: false, sla_days_overdue: 0, learner_days_overdue: 0, misses: 1,
    booking_at: null, ai_summary: '', ai_confidence: null, resolution_option: '', resolved_at: null, resolved_by: '', archived: false,
    escalated: false, created_at: '2026-10-19T08:00:00Z', purpose: '', requested_by: '', helpdesk: null, promised_at: null,
    promise_missed: false, promises: {}, specialist_closes: false, missed_call: false, bookable: [], booking_email: false,
    booking_links: {}, allocated_agent_id: SAFIYAH, followup_agent_id: null, cover: null, ...fields,
  };
}
const reminder = { source_type: 'reminder', issue_name: 'Progress review', booking_at: TOMORROW, due_at: TOMORROW, specialist_closes: true };
const COVER = { task_id: 5, to_agent_id: ALICE, to_name: 'Alice', from_name: 'Safiyah', direct: true };
const CASES = [
  ticket(11, 'Ann Lee', { ...reminder, cover: COVER }),
  ticket(12, 'Ann Lee', { cover: { ...COVER, direct: false } }),           // Ann's missed lecture: comes along on Alice's call
  ticket(13, 'Ben Kay', reminder),
  ticket(14, 'Cat Moss', { allocated_agent_id: ALICE }),
  ticket(15, 'Dee Ford', { ...reminder, allocated_agent_id: ALICE }),
];
const TASK: DelegatedTask = {
  id: 5, group: 'g', source: 'agent', from_agent_id: SAFIYAH, from_name: 'Safiyah', category: 'nextday', category_label: 'Next Day',
  to_agent_id: ALICE, to_name: 'Alice', catch_new: false, after_topic: 'nextday', learners: ['ann@example.org'], absence_id: null,
  created_at: '2026-10-20T08:00:00Z', created_by: 'boss', recalled_at: null, recalled_by: '', seen_at: null,
};
const AGENTS = [[ALICE, 'Alice'], [LIZA, 'Liza'], [SAFIYAH, 'Safiyah']] as const;

async function open(page: Page, path: string, as: { role: 'operator' | 'director'; agent: number | null }) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(() => {
    localStorage.setItem('kbc-auth-user', JSON.stringify({ id: 1, email: 'me@example.org', username: 'me', displayName: 'Me', groups: [], access: {}, loggedInAt: new Date().toISOString() }));
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
    if (route.request().method() === 'POST') {
      posts.push({ path: url.pathname, body: route.request().postDataJSON() });
      return json({ ok: true, task_ids: [9], seen: 1, recalled: 1, absence_id: 3 });
    }
    if (url.pathname === '/api/callcentre/config/') return json({ csrf_token: 't', agent_id: as.agent, agents: [], sources: [], cycle: null });
    if (url.pathname === '/api/callcentre/live/') return json({ enabled: true, calls: [] });
    if (url.pathname === '/api/callcentre/inbound/') return json({ summary: { open: 0, received: 0, done: 0, median_minutes: null, within_hour: 0, days: 90 }, items: [] });
    if (url.pathname === '/api/callcentre/delegation/') {
      return json({ set_up: true, not_set_up: '', day: '2026-10-20', absences: [],
        agents: AGENTS.map(([id, display_name]) => ({ id, display_name })),
        tasks: [{ ...TASK, counts: { open: 1, called: 1, reached: 0, closed: 0 } }],
        history: [{ id: 1, task_id: 5, absence_id: null, action: 'delegated', actor: 'boss', created_at: '2026-10-20T08:00:00Z',
          data: { category: 'nextday', to_agent_id: ALICE, learners: 1, catch_new: false } }] });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      return json({
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: new Date().toISOString(),
        access: { role: as.role, agent_id: as.agent, is_superuser: false, display_name: 'Me', email: 'me@example.org' },
        agents: AGENTS.map(([id, display_name]) => ({ id, display_name, zoom_account: 'student', zoom_phone_number: '', target_seconds: 10800,
          today: { attempts: 0, connected: 0, seconds: 0 },
          month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0, sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } })),
        cases: CASES, tasks: [TASK], absences: [], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: { last_success_at: new Date().toISOString(), details: {} }, connections: { calling: true, email_mode: 'dry_run', ai: false },
        call_reviews: null,
      } as unknown as Overview);
    }
    return json({});
  });
  await page.goto(path);
  await expect(page.locator('h1').first(), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return { posts, errors };
}

test('the receiver sees the new task where the director placed it, works it on its own list and it counts as seen', async ({ page }) => {
  const { posts, errors } = await open(page, '/dashboard/call-centre?view=operator', { role: 'operator', agent: ALICE });
  await expect(page.getByRole('region', { name: 'New tasks from the director' }))
    .toContainText('New task from the director: 1 of Safiyah’s Next Day, after your Next Day.');
  // Their topics in order, with the task after their own Next Day; Ann is not on Alice's own lists.
  const tiles = await page.locator('.dk-tile').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  expect(tiles.slice(0, 4)).toEqual(['Due: 0 people', 'Next Day: 1 person', 'Safiyah’s Next Day: 1 person', 'Missed: 1 person']);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}delegation-today.png`, fullPage: true });
  // Call next goes topic by topic: Alice's own Next Day (Dee) before the task (Ann).
  await expect(page.locator('section[aria-labelledby="dk-next"]')).toContainText('Dee Ford');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/section=task%3A5|section=task:5/);
  await expect.poll(() => posts.map(post => post.path)).toContain('/api/callcentre/delegation/seen/');
  expect(posts.find(post => post.path.endsWith('/seen/'))!.body).toEqual({ task_ids: [5] });
  await expect(page.getByRole('tab', { name: 'Safiyah’s Next Day (1)' })).toHaveAttribute('aria-selected', 'true');
  const row = page.locator('[data-sheet-row="11"]');
  await expect(row).toContainText('For Safiyah');
  await expect(row.getByRole('button', { name: 'Call Ann Lee' })).toBeEnabled();
  await expect(page.locator('[data-sheet-row="13"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the owner sees a covered learner read-only, and the rest of the list as usual', async ({ page }) => {
  const { errors } = await open(page, `/dashboard/call-centre?view=operator&section=nextday`, { role: 'operator', agent: SAFIYAH });
  await expect(page.getByRole('tab', { name: 'Next Day (1)' })).toBeVisible();
  const ann = page.locator('[data-sheet-row="11"]');
  await expect(ann).toContainText('Covered by Alice');
  await expect(ann.getByRole('button', { name: 'Call Ann Lee' })).toBeDisabled();
  await expect(page.locator('[data-sheet-row="13"]').getByRole('button', { name: 'Call Ben Kay' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('the director hands over a list, recalls a task and marks someone absent', async ({ page }) => {
  const { posts, errors } = await open(page, '/dashboard/call-centre?view=delegation', { role: 'director', agent: null });
  await expect(page.locator('h1').first()).toHaveText('Task delegation');
  await page.locator('label:has-text("Whose list") select').selectOption(`agent:${SAFIYAH}`);
  const nextDay = page.getByRole('radio', { name: /Next Day/ });
  await expect(nextDay).toContainText('2');
  await expect(nextDay).toContainText('1 already covered');
  await nextDay.click();
  await page.locator('.td-builder label:has-text("Specialist") select').selectOption(String(LIZA));
  await expect(page.locator('.td-builder label:has-text("On their Today page") select')).toHaveValue('nextday');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}delegation-director.png`, fullPage: true });
  await page.getByRole('button', { name: 'Delegate the whole Next Day' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].body).toEqual({ action: 'delegate', source: 'agent', from_agent_id: SAFIYAH, category: 'nextday',
    parts: [{ to_agent_id: LIZA, learners: [], catch_new: true, after_topic: 'nextday' }] });

  // Chosen learners, split between two specialists: Ben (the only one not covered) goes to the first part.
  await nextDay.click();
  await page.getByLabel('Chosen learners').check();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.locator('.td-builder label:has-text("Specialist") select').selectOption(String(LIZA));
  await page.getByRole('button', { name: 'Delegate 1 learner' }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].body).toMatchObject({ parts: [{ to_agent_id: LIZA, learners: ['ben@example.org'], catch_new: false }] });

  const tasks = page.getByRole('region', { name: 'Tasks' });
  await expect(tasks.locator('tbody tr').first()).toContainText('Safiyah’s Next Day');
  await tasks.getByRole('button', { name: 'Recall' }).click();
  await expect.poll(() => posts.length).toBe(3);
  expect(posts[2].body).toEqual({ action: 'recall', task_ids: [5] });

  await page.getByRole('button', { name: 'Mark someone absent…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mark someone absent' });
  await dialog.locator('label:has-text("Who is absent") select').selectOption(String(SAFIYAH));
  await dialog.locator('label:has-text("Who covers their phone line") select').selectOption(String(LIZA));
  const list = dialog.getByRole('region', { name: 'Next Day' });
  await list.getByLabel('Hand it over').check();
  await list.locator('label:has-text("Specialist") select').selectOption(String(ALICE));
  if (SHOTS) await dialog.screenshot({ path: `${SHOTS}delegation-absent.png` });
  await dialog.getByRole('button', { name: 'Mark Safiyah absent' }).click();
  await expect.poll(() => posts.length).toBe(4);
  expect(posts[3].body).toEqual({ action: 'absent', agent_id: SAFIYAH, line_cover_id: LIZA,
    lists: [{ category: 'nextday', parts: [{ to_agent_id: ALICE, learners: [], catch_new: true, after_topic: 'nextday' }] }] });
  expect(errors).toEqual([]);
});
