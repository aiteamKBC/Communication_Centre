// The specialist's desk: Today (their line, who rang, the next call, their lists), lists and How I'm doing as tabs.
import { expect, test, type Page } from '@playwright/test';
import type { Overview, OverviewCase } from '../../src/pages/call-centre/api';

function ticket(id: number, fields: Partial<OverviewCase> = {}): OverviewCase {
  return {
    id, source_type: 'attendance', source_id: null, learner_name: ['Ann Smith', 'Mo Patel', 'Jo Reid', 'Sam Lee', 'Priya Shah', 'Tom Hart'][id % 6] + ` ${id}`,
    learner_email: `learner${id}@example.org`, learner_phone: '+447700900' + String(100 + id), coach: 'Coach Carter',
    organisation: 'Test Company', programme: 'Business Administrator L3', manager_name: '', manager_email: '',
    issue_name: 'Marketing lecture', issue_date: '2026-10-15', status: 'new', risk: 'amber',
    claimed_by: null, claimed_agent_id: null, last_actor: 'System', last_action_at: '2026-10-01T12:00:00Z',
    attempts: 2, next_followup_at: null, due_at: '2026-10-20T12:00:00Z',
    sla_breached: false, sla_days_overdue: 0, learner_days_overdue: 0, misses: 1,
    booking_at: null, ai_summary: '', ai_confidence: null, resolution_option: '', resolved_at: null,
    resolved_by: '', archived: false, escalated: false, created_at: '2026-10-01T12:00:00Z',
    purpose: '', requested_by: '', helpdesk: null, promised_at: null, promise_missed: false,
    promises: { catch_up_session: 7 }, specialist_closes: false, missed_call: false,
    bookable: [], booking_email: false, booking_links: {}, allocated_agent_id: null, followup_agent_id: null, ...fields,
  };
}
const cases = [
  ...Array.from({ length: 7 }, (_, i) => ticket(i + 1)),
  ...Array.from({ length: 5 }, (_, i) => ticket(i + 20, { source_type: 'pr', issue_name: 'Progress review', promises: { book_pr: null } })),
  ...Array.from({ length: 3 }, (_, i) => ticket(i + 40, { source_type: 'learner_satisfaction', issue_name: 'Satisfaction', promises: {} })),
  ticket(50, { source_type: 'manual', purpose: 'Check in about the new job', promises: {} }),
  ticket(51, { followup_agent_id: 1, next_followup_at: '2026-10-19T08:00:00Z' }),
];
const daily = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, attempts: i % 7 > 4 ? 0 : 10 + i, connected: i % 7 > 4 ? 0 : 6 + (i % 4), seconds: i % 7 > 4 ? 0 : 6000 + i * 400 }));

async function open(page: Page, section: string, width = 1440) {
  const asked: URL[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1100 });
  await page.addInitScript(() => {
    localStorage.setItem('kbc-auth-user', JSON.stringify({ id: 1, email: 'alice@example.org', username: 'alice', displayName: 'Alice', groups: [], access: {}, loggedInAt: new Date().toISOString() }));
  });
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    asked.push(url);
    const json = (body: unknown) => route.fulfill({ json: body });
    if (route.request().method() !== 'GET') return route.abort();
    if (url.pathname === '/api/callcentre/config/') return json({ csrf_token: 't', agent_id: 1, agents: [], sources: [], cycle: null });
    const detail = url.pathname.match(/^\/api\/callcentre\/tickets\/(\d+)\/$/);
    if (detail) {
      const selected = cases.find(c => c.id === Number(detail[1]))!;
      return json({ ticket: { ...selected, source_data: {}, priority_why: '' }, issues: [selected], calls: [], events: [], emails: [],
        has_more_events: false, held_feedback: null });
    }
    if (url.pathname === '/api/callcentre/scorecard/') return json({ week: '2026-10-19', cards: [] });
    if (url.pathname === '/api/callcentre/my-history/') return route.fulfill({ status: 404, json: { error: 'Not in this test.' } });
    if (url.pathname === '/api/callcentre/live/') return json({ enabled: true, calls: [], presence: { agents: { 1: { status: 'available', label: 'Available', at: '', source: 'webhook' } }, error: '' } });
    if (url.pathname === '/api/callcentre/inbound/') return json({ summary: { open: 2, received: 3, done: 1, median_minutes: 40, within_hour: 1, days: 90 }, items: [
      { id: 1, caller_number: '+447700900101', caller_name: 'Ann Smith', caller_email: 'ann@example.org', caller_role: 'learner', line: '+441234', received_at: new Date(Date.now() - 3600e3).toISOString(), result: 'voicemail', agent: 'Alice', status: 'open', done_how: '', done_by: '', done_at: null, note: '', waited_minutes: 62, case_id: 1, voicemail_id: 9, voicemail: { duration_seconds: 24, transcript_status: 'done', transcript: 'Hi, it’s Ann, I missed Tuesday’s lecture because of a work deadline, could someone call me back about a catch-up session? Thanks.' } },
      { id: 2, caller_number: '+447700900102', caller_name: 'Mo Patel', caller_email: '', caller_role: 'learner', line: '+441234', received_at: new Date(Date.now() - 26 * 3600e3).toISOString(), result: 'no_answer', agent: 'Alice', status: 'open', done_how: '', done_by: '', done_at: null, note: '', waited_minutes: 1560, case_id: 2, voicemail_id: null, voicemail: null },
    ] });
    if (url.pathname === '/api/callcentre/overview/') {
      const overview: Overview = {
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: new Date().toISOString(),
        access: { role: 'operator', agent_id: 1, is_superuser: false, display_name: 'Alice Morgan', email: 'alice@example.org' },
        agents: [{ id: 1, display_name: 'Alice Morgan', zoom_account: 'student', zoom_phone_number: '', target_seconds: 10800,
          today: { attempts: 14, connected: 8, seconds: 9240 },
          month: { attempts: 150, connected: 90, seconds: 80000, resolved: 31, pending: 12, sla_breaches: 0, unique_learners: 70, emails: 4, daily },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases, cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: { last_success_at: new Date().toISOString(), details: {} },
        connections: { calling: true, email_mode: 'dry_run', ai: false },
        call_reviews: { agents: { 1: { excellent: 5, good: 9, bad: 1, not_rated: 0 } }, flags: [] },
      } as unknown as Overview;
      return json(overview);
    }
    return json({});
  });
  await page.goto(`/dashboard/call-centre?view=operator${section ? `&section=${section}` : ''}`);
  await expect(page.locator('.ed-head h1'), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return { asked, errors };
}


test('Today shows your line, who rang with their voicemail, the next call and your lists', async ({ page }) => {
  const { asked, errors } = await open(page, '');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByText('Workspace:')).toHaveCount(0);
  const nav = page.getByRole('navigation');
  for (const item of ['Today', 'My lists (17)', 'Missed calls (2)', 'My calls', 'How I’m doing', 'Booking links', 'Zoom Phone']) {
    await expect(nav.getByRole('button', { name: item, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('button')).toHaveCount(7);
  const line = page.getByRole('region', { name: 'Your line' });
  await expect(line).toContainText('Available');
  await expect(line).toContainText('2h 34m');
  await expect(line).toContainText('Points today 126 of 300');
  // Callbacks: the specialist's own (no agent_id from a specialist), both waiting, the voicemail readable and playable.
  const inbound = asked.find(url => url.pathname === '/api/callcentre/inbound/')!;
  expect(Object.fromEntries(inbound.searchParams)).toEqual({ kind: 'callback', status: 'open', days: '90' });
  const ann = page.locator('.dk-rang-card').filter({ hasText: 'Ann Smith' });
  await expect(ann).toContainText('rang 1 h ago');
  await expect(ann.locator('q')).toContainText('missed Tuesday’s lecture');
  await ann.getByRole('button', { name: /^▶ Play/ }).click();
  await expect(ann.locator('audio')).toHaveAttribute('src', '/api/callcentre/voicemails/9/audio/');
  await expect(page.locator('.dk-rang-card.long')).toContainText('Mo Patel');
  await ann.getByRole('button', { name: 'Open case to call back' }).click();
  await expect.poll(() => asked.some(url => url.pathname === '/api/callcentre/tickets/1/')).toBe(true);
  const full = page.locator('dialog.ed-case-dialog');
  await expect(full.getByRole('heading', { name: 'Mo Patel 1', exact: true })).toBeVisible();
  await full.getByRole('button', { name: 'Close full case', exact: true }).click();
  await expect(full).toBeHidden();
  // Call next: the person first, the order and filters behind one line.
  await expect(page.locator('.ed-next-name')).toBeVisible();
  await expect(page.getByLabel('Ticket order', { exact: true })).toBeHidden();
  await page.getByText('Filter and order', { exact: true }).click();
  await expect(page.getByLabel('Ticket order', { exact: true })).toBeVisible();
  // A list tile opens My lists on that list.
  await expect(page.getByRole('button', { name: 'Next Day: 0 people', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Due: 5 people', exact: true }).click();
  await expect(page).toHaveURL(/section=due/);
  await expect(page.getByRole('heading', { name: 'My lists', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Due (5)', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(nav.getByRole('button', { name: 'My lists (17)', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('tab', { name: 'Follow-ups (1)', exact: true }).click();
  await expect(page.locator('.ed-person')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('How I’m doing holds the week, the month, call reviews and achievements as tabs', async ({ page }) => {
  await open(page, 'doing');
  await expect(page.getByRole('heading', { name: 'How I’m doing', level: 1 })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'How you are doing' }).getByRole('tab');
  await expect(tabs).toHaveText(['This week', 'This month', 'Call reviews', 'Achievements']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'This month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your month in calls' })).toBeVisible();
  await expect(page.locator('.dd-figure').first()).toContainText('150');
  await expect(page.getByRole('button', { name: 'Download my report', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Achievements', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today’s badges' })).toBeVisible();
});

for (const [old, tab, page_] of [['next', '', 'Today'], ['reports', 'This month', 'How I’m doing'], ['progress', 'Achievements', 'How I’m doing'],
  ['week', 'This week', 'How I’m doing'], ['missed', 'Missed (8)', 'My lists']] as const) {
  test(`an old desk link (${old}) opens its new place`, async ({ page }) => {
    await open(page, old);
    await expect(page.getByRole('heading', { name: page_, level: 1 })).toBeVisible();
    if (tab) await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
  });
}

test('on a phone the desk keeps to the screen width', async ({ page }) => {
  await open(page, '', 390);
  await expect(page.locator('.dk-rang-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
