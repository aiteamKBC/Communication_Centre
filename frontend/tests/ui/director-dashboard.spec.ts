import { expect, test, type Page } from '@playwright/test';

// A month of calls for four specialists, so the dashboard has something to draw.
const DAYS = Array.from({ length: 20 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
const people: [number, string, number][] = [[1, 'Alice Brown', 1], [2, 'Tina Shah', 0.75], [3, 'Omar Patel', 0.5], [4, 'Grace Lee', 0.3]];
const daily = (scale: number) => DAYS.map((day, index) => {
  const weekend = [0, 6].includes(new Date(`${day}T12:00:00`).getDay());
  const attempts = weekend ? 0 : Math.round((18 + (index % 5) * 3) * scale);
  return { day, attempts, connected: Math.round(attempts * 0.55), seconds: weekend ? 0 : Math.round((7200 + (index % 4) * 1800) * scale) };
});
const AGENTS = people.map(([id, name, scale]) => {
  const days = daily(scale);
  const sum = (key: 'attempts' | 'connected' | 'seconds') => days.reduce((total, day) => total + day[key], 0);
  return {
    id, display_name: name, zoom_account: 'office', zoom_phone_number: `+44162295890${id}`, target_seconds: 10800,
    today: { attempts: Math.round(20 * scale), connected: Math.round(11 * scale), seconds: Math.round(9000 * scale) },
    month: { attempts: sum('attempts'), connected: sum('connected'), seconds: sum('seconds'), resolved: Math.round(30 * scale), pending: 4,
      sla_breaches: id === 3 ? 2 : 0, unique_learners: Math.round(60 * scale), emails: 3, daily: days },
    sync: { last_success_at: '2026-10-20T11:55:00Z', error: '', recordings_error: '' },
  };
});
const kinds = ['attendance', 'pr', 'mcm', 'epa', 'learner_satisfaction', 'otj', 'evidence'];
const CASES = Array.from({ length: 46 }, (_, index) => ({
  id: index + 1, source_type: kinds[index % kinds.length], learner_name: `Learner ${index + 1}`, learner_email: `l${index + 1}@example.org`,
  issue_name: '', status: index % 9 === 0 ? 'ai_suggested_close' : index % 6 === 0 ? 'pending_learner' : 'open',
  sla_breached: index % 8 === 0, missed_call: index % 5 === 0, promise_missed: index % 13 === 0,
  allocated_agent_id: index % 10 === 0 ? null : (index % 4) + 1, next_followup_at: null, promised_at: null, booking_at: null,
  ai_summary: 'Learner confirmed attendance is back on track.', ai_confidence: 0.82, resolution_option: '',
  due_at: '2026-10-19T10:00:00Z', claimed_agent_id: null, attempts: 1,
}));
// With an employer specialist, unallocated employer calls are theirs, and a learner with two unallocated cases is one learner.
const extra = { status: 'open', sla_breached: false, missed_call: false, promise_missed: false, allocated_agent_id: null, next_followup_at: null,
  promised_at: null, booking_at: null, ai_summary: '', ai_confidence: null, resolution_option: '', due_at: '2026-10-21T10:00:00Z',
  claimed_agent_id: null, attempts: 0, issue_name: '' };
CASES.push({ ...extra, id: 90, source_type: 'employer_feedback', learner_name: 'Boss', learner_email: 'boss@acme.example' },
  { ...extra, id: 91, source_type: 'pr', learner_name: 'Learner 1', learner_email: 'l1@example.org' });
const OVERVIEW = {
  today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: '2026-10-20T12:00:00Z',
  access: { role: 'director', agent_id: null, is_superuser: true, display_name: 'Director', email: 'director@example.org' },
  agents: AGENTS, cases: CASES, employer_specialists: [2], cases_truncated: false, resolutions: { agent: 70, ai: 9, system: 14 }, unclaimed_breaches: 1,
  sources: [], cycle: { last_success_at: new Date().toISOString() }, connections: { calling: true, email_mode: 'dry_run', ai: true },
  call_reviews: {
    agents: { 1: { excellent: 9, good: 14, bad: 1, not_rated: 0 }, 2: { excellent: 4, good: 12, bad: 3, not_rated: 0 }, 3: { excellent: 2, good: 6, bad: 0, not_rated: 0 } },
    flags: [{ recording_id: 5, started_at: '2026-10-17T10:00:00Z', agent_id: 2, agent_name: 'Tina Shah', rating: 'bad',
      went_wrong: ['Did not confirm the catch-up date.'], needs_change: ['Agree a date before ending the call.'], summary: '', analysed_at: '2026-10-17T11:00:00Z' }],
  },
};

async function open(page: Page, path = '/dashboard/call-centre') {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1, email: 'director@example.org', username: 'director', displayName: 'Director', groups: [], access: {}, loggedInAt: new Date().toISOString(),
    }));
  });
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  const asked: URL[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    asked.push(url);
    const json = (body: unknown) => route.fulfill({ json: body });
    const at = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
    switch (url.pathname) {
      case '/api/callcentre/config/':
        return json({ csrf_token: 'test', agent_id: null, is_manager: true, is_superuser: true, email_mode: 'dry_run', ai_enabled: true, agents: [], sources: [], cycle: null });
      case '/api/callcentre/overview/': return json(OVERVIEW);
      case '/api/callcentre/live/':
        return json({ enabled: true, calls: [
          { call_id: 'a', agent_id: 1, agent: 'Alice Brown', direction: 'outbound', state: 'talking', line: '+441622958901', number: '+447700900001',
            name: 'Ann Smith', role: 'learner', email: 'ann@example.org', case_id: 7, started_at: at(260), connected_at: at(245) },
          { call_id: 'b', agent_id: 2, agent: 'Tina Shah', direction: 'inbound', state: 'ringing', line: '+441622958902', number: '+447700900002',
            name: 'Ben Ray', role: 'line_manager', email: 'ben@example.org', case_id: null, started_at: at(8) },
        ], presence: { error: '', agents: {
          1: { status: 'on_phone_call', label: 'On a call', at: at(245), source: 'webhook' }, 2: { status: 'available', label: 'Available', at: at(900), source: 'webhook' },
          3: { status: 'available', label: 'Available', at: at(300), source: 'zoom' }, 4: { status: 'away', label: 'Away', at: at(1200), source: 'zoom' } } } });
      case '/api/callcentre/inbound/':
        return json({ items: [], summary: { open: 3, received: 6, done: 3, median_minutes: 40, within_hour: 2, days: 7 } });
      case '/api/callcentre/zoom-changes/':
        return json({ checked_at: '2026-10-20T11:00:00Z', changes: [{ number: '+441622958903', account: 'Accountant', what: 'automatic recording turned off', serious: true, at: '2026-10-20T10:00:00Z' }] });
      case '/api/callcentre/missing-recordings/': return json({ calls: [] });
      case '/api/callcentre/scorecard/':
        return json({ week: '2026-10-19', cards: AGENTS.map(agent => ({
          agent: { id: agent.id, name: agent.display_name }, calls: 40, answered: 22, not_answered: 18, reach_rate: 55, learners_reached: 19,
          talk_seconds: 9000, talk_out_seconds: 8400, incoming_answered: 2, talk_in_seconds: 600, target_seconds: 54000, working_days: 2,
          short_answered: 0, wrap_up_median_seconds: 95, forms_saved: 20, forms_missing: 0, closed: 6,
          callbacks: { received: 4, done: 3, open: 1, median_minutes: 35 }, recordings_missing: 0, reviews: { excellent: 4, good: 10, bad: 1 } })) });
      case '/api/callcentre/call-log/':
        return json({ calls: [], total: 0, page: 1, page_size: 25, has_next: false, summary: { calls: 0, answered: 0, not_matched: 0, closed: 0, booked: 0, feedback: 0 } });
      case '/api/auth/access/': return json({ id: 1, email: 'director@example.org', access: {}, groups: [] });
      default: return json({});
    }
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(path);
  return { asked, errors };
}

test('the overview shows the board live, what needs the director, the month in graphs and the team ranked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { errors } = await open(page);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true }), errors.join('; ')).toBeVisible();
  const board = page.getByRole('region', { name: 'The board today' });
  await expect(board.getByRole('listitem').filter({ hasText: 'Alice Brown' })).toContainText(/On a call · 4:0\d · Ann Smith/);
  await expect(board.getByRole('listitem').filter({ hasText: 'Tina Shah' })).toContainText('Being rung · Ben Ray (line manager)');
  await expect(board.getByRole('meter', { name: 'Grace Lee: talk time today' })).toBeVisible();
  const needs = page.getByRole('region', { name: 'Needs you' });
  await expect(needs.getByRole('button', { name: /3 learners waiting for a call back/ })).toBeVisible();
  await expect(needs.getByRole('button', { name: /1 Zoom changes that stop matching or recording/ })).toBeVisible();
  await expect(needs.getByRole('button', { name: /^5 learners in the shared queue/ })).toBeVisible();
  await expect(page.locator('.dd-figure').filter({ has: page.getByText('Calls made', { exact: true }) }).locator('strong')).toHaveText('860');
  await expect(page.getByRole('img', { name: /Talk time per working day/ }).locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Calls made per working day/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('overview.png'), fullPage: true });

  // The sidebar: Monitor, Calls and cases, Setup; Zoom Phone stays.
  const nav = page.getByRole('navigation').first();
  for (const name of ['Overview', 'Specialists', 'Scorecards', 'Calls', 'Calling desk', 'Zoom Phone', 'Learner allocation', 'Settings']) {
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await needs.getByRole('button', { name: /learners waiting for a call back/ }).click();
  await expect(page.getByRole('heading', { name: 'Missed calls & voicemails', level: 1 })).toBeVisible();
});

test('each specialist has a page: live line, lists today, month, graphs, caseload, quality, week and calls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { asked } = await open(page);
  await page.getByRole('region', { name: 'The team' }).getByRole('button', { name: /Tina Shah/ }).click();
  await expect(page.getByRole('heading', { name: 'Tina Shah', level: 2 })).toBeVisible();
  await expect(page.getByText('Ranked 2 of 4 by talk time this month')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Now' })).toContainText('Being rung');
  await expect(page.getByRole('list', { name: "Tina's open cases by stage" })).toBeVisible();
  await expect(page.getByRole('button', { name: /Did not confirm the catch-up date/ })).toBeVisible();
  const week = page.getByRole('region', { name: 'Weekly scorecard' });
  await expect(week.getByRole('row')).toHaveCount(2);   // header + Tina only
  await expect(page.getByRole('region', { name: 'Tina’s lists' })).toBeVisible();
  await expect.poll(() => asked.some(url => url.pathname.endsWith('/call-log/') && url.searchParams.get('agent_id') === '2')).toBe(true);
  // Missed calls to call back have their own page; the specialist page no longer repeats them.
  expect(asked.some(url => url.pathname.endsWith('/inbound/') && url.searchParams.get('agent_id') === '2')).toBe(false);
  await page.screenshot({ path: test.info().outputPath('specialist.png'), fullPage: true });
  await page.getByRole('button', { name: 'Omar Patel' }).click();
  await expect(page.getByRole('heading', { name: 'Omar Patel', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: '← All specialists' }).click();
  await expect(page.getByRole('button', { name: /Grace Lee/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('specialists.png'), fullPage: true });
});

test('the old Import & export and Connections links land on Settings, which now holds both', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/dashboard/call-centre?view=connections');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation').first().getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('the overview works on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByRole('region', { name: 'The board today' })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('overview-phone.png'), fullPage: true });
});
