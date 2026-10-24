import { expect, test, type Page } from '@playwright/test';

const ITEMS = {
  callback: [{
    id: 1, kind: 'callback', caller_number: '+447700900001', caller_name: 'Ann Smith', caller_email: 'ann@example.org', caller_role: 'learner',
    line: '+441622958955', received_at: '2026-10-20T09:00:00Z', result: 'no_answer', agent: 'Operator', assigned_agent_id: null, assigned_agent: '',
    status: 'open', done_how: '', done_by: '', done_at: null, note: '', waited_minutes: 95, case_id: 7, voicemail_id: null,
  }],
  enquiry: [{
    id: 2, kind: 'enquiry', caller_number: '+447911000111', caller_name: '', caller_email: '', caller_role: '',
    line: '+441622958955', received_at: '2026-10-20T10:00:00Z', result: 'other', agent: 'Operator', assigned_agent_id: null, assigned_agent: '',
    status: 'open', done_how: '', done_by: '', done_at: null, note: '', waited_minutes: 20, case_id: null, voicemail_id: null,
  }],
};
const CARD = {
  agent: { id: 1, name: 'Operator' }, calls: 40, answered: 22, not_answered: 18, reach_rate: 55, learners_reached: 19,
  talk_seconds: 9000, talk_out_seconds: 8400, incoming_answered: 2, talk_in_seconds: 600, target_seconds: 54000, working_days: 5,
  short_answered: 3, wrap_up_median_seconds: 95, forms_saved: 20, forms_missing: 2, closed: 6,
  callbacks: { received: 4, done: 3, open: 1, median_minutes: 35 }, recordings_missing: 1, reviews: { excellent: 4, good: 10, bad: 1 },
};

async function open(page: Page, manager: boolean, section = '') {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1, email: 'operator@example.org', username: 'operator', displayName: 'Operator', groups: [], access: {}, loggedInAt: new Date().toISOString(),
    }));
  });
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  const posts: Record<string, unknown>[] = [];
  const asked: URL[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body: unknown) => route.fulfill({ json: body });
    if (request.method() === 'POST') {
      posts.push({ path: url.pathname, ...(request.postDataJSON() as Record<string, unknown>) });
      return json({ ok: true });
    }
    if (url.pathname === '/api/callcentre/config/') {
      return json({ csrf_token: 'test', agent_id: 1, is_manager: manager, is_superuser: false, email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      return json({
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: '2026-10-20T12:00:00Z',
        access: { role: manager ? 'director' : 'operator', agent_id: 1, is_superuser: false, display_name: 'Operator', email: 'operator@example.org' },
        agents: [{ id: 1, display_name: 'Operator', zoom_account: 'student', zoom_phone_number: '', target_seconds: 10800, today: { attempts: 0, connected: 0, seconds: 0 },
          month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0, sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases: [], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: null, connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null,
      });
    }
    if (url.pathname === '/api/callcentre/inbound/') {
      asked.push(url);
      const kind = url.searchParams.get('kind') as 'callback' | 'enquiry';
      return json({ items: ITEMS[kind], agents: manager ? [{ id: 1, display_name: 'Operator' }, { id: 2, display_name: 'Sales Sam' }] : undefined,
        summary: { open: ITEMS[kind].length, received: 5, done: 4, median_minutes: 35, within_hour: 3, days: 7 } });
    }
    if (url.pathname === '/api/callcentre/scorecard/') {
      asked.push(url);
      return json({ week: url.searchParams.get('week'), cards: [CARD] });
    }
    if (url.pathname === '/api/callcentre/missing-recordings/') {
      return json({ calls: [{ call_id: 9, started_at: '2026-10-19T14:00:00Z', duration_seconds: 125, direction: 'outbound', agent: 'Operator',
        line: '+441622958955', learner_email: 'ann@example.org' }] });
    }
    if (url.pathname === '/api/callcentre/transcript-search/') {
      asked.push(url);
      return json({ phrase: 'gateway', limited: false, results: [{ recording_id: 3, call_id: 9, started_at: '2026-10-19T14:00:00Z', agent: 'Operator',
        learner_email: 'ann@example.org', direction: 'outbound', hits: 2, snippets: [{ before: 'We talked about the EPA ', match: 'gateway', after: ' next month.' }] }] });
    }
    if (url.pathname === '/api/callcentre/call-log/') {
      return json({ calls: [], total: 0, page: 1, page_size: 25, has_next: false,
        summary: { calls: 0, answered: 0, not_matched: 0, closed: 0, booked: 0, feedback: 0 } });
    }
    if (url.pathname === '/api/callcentre/employer-specialists/') {
      return json({ values: { enabled: false, agent_ids: [] }, revision: 0, set_up: true, not_set_up: '', open_employer_cases: 0, agents: [], history: [] });
    }
    if (url.pathname === '/api/callcentre/live/') {
      return json({ enabled: true, calls: [{ call_id: 'c1', agent_id: 1, agent: 'Operator', direction: 'inbound', state: 'ringing', line: '+441622958955',
        number: '+447700900001', name: 'Ann Smith', role: 'learner', email: 'ann@example.org', case_id: 7, started_at: new Date().toISOString() }],
        presence: { error: '', agents: { 1: { status: 'Do_Not_Disturb', label: 'Do not disturb', at: '2026-10-20T11:50:00Z', source: 'webhook' } } } });
    }
    if (url.pathname === '/api/callcentre/zoom-changes/') {
      return json({ checked_at: '2026-10-20T11:00:00Z', changes: [{ number: '+441622958955', account: 'Accountant', what: 'automatic recording turned off',
        serious: true, specialists: ['Operator'], at: '2026-10-20T10:00:00Z' }] });
    }
    if (url.pathname === '/api/auth/access/') return json({ id: 1, email: 'operator@example.org', access: {}, groups: [] });
    return json({});
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // A director opens a dashboard page (section: its view); a specialist a section of their desk.
  await page.goto(manager ? `/dashboard/call-centre${section ? `?view=${section}` : ''}` : `/dashboard/call-centre?view=operator&section=${section}`);
  const heading = manager ? { calls: 'Missed calls to call back', scorecards: 'Weekly scorecards' }[section] || 'The board today'
    : section === 'rang' ? 'Missed calls to call back' : 'My scorecard';
  await expect(page.getByRole('heading', { name: heading, exact: true }), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return { posts, asked };
}

test('a specialist sees who rang and was missed, opens the case to call back, or marks it done', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { posts } = await open(page, false, 'rang');
  const missed = page.getByRole('region', { name: 'Missed calls' });
  await expect(missed).toContainText('Ann Smith');
  await expect(missed).toContainText('Learner');
  await expect(missed).toContainText('2 h');   // 95 minutes waiting
  await expect(missed.getByRole('button', { name: 'Open case to call back' })).toBeVisible();
  await expect(missed.getByRole('tab')).toHaveCount(0);            // call-backs only: no Enquiries tab
  await expect(missed).not.toContainText('+447911000111');
  await expect(missed.getByRole('button', { name: 'Mark done' })).toBeDisabled();   // needs what happened
  await missed.getByLabel('What happened with Ann Smith').fill('Called her mobile instead');
  await missed.getByRole('button', { name: 'Mark done' }).click();
  await expect.poll(() => posts.at(-1)).toMatchObject({ path: '/api/callcentre/inbound/', id: 1, action: 'done', note: 'Called her mobile instead' });
  await missed.screenshot({ path: test.info().outputPath('missed-calls.png') });
});

test('a specialist’s week: scorecard, transcript search and calls without a recording', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { asked } = await open(page, false, 'week');
  const card = page.getByRole('region', { name: 'Weekly scorecard' });
  await expect(card).toContainText('22 answered · 55%');
  await expect(card).toContainText('3 answered under 10 s (voicemail?)');
  await expect(card).toContainText('1m 35s');
  await card.getByRole('button', { name: 'Previous week' }).click();
  await expect.poll(() => asked.filter(url => url.pathname.endsWith('/scorecard/')).length).toBeGreaterThan(1);
  const search = page.getByRole('region', { name: 'Search call transcripts' });
  await search.getByLabel('Phrase').fill('gateway');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(search.locator('mark')).toHaveText('gateway');
  await expect(page.getByRole('region', { name: 'Calls without a recording' })).toContainText('2m 5s');
  await page.screenshot({ path: test.info().outputPath('my-week.png'), fullPage: true });
});

test('a director sees the call-backs, with no enquiries, and every scorecard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await open(page, true, 'calls');
  const missed = page.getByRole('region', { name: 'Missed calls' });
  await expect(missed).toContainText('Ann Smith');
  await expect(missed.getByRole('tab')).toHaveCount(0);
  await page.getByRole('navigation').first().getByRole('button', { name: 'Scorecards', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly scorecard' })).toContainText('Operator');
});

test('a learner ringing in shows a banner on their specialist’s desk that opens the case or hides', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await open(page, false, 'rang');
  const banner = page.getByRole('status').filter({ hasText: 'Ann Smith is calling you' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Open their case' })).toBeVisible();
  await banner.getByRole('button', { name: 'Hide' }).click();
  await expect(banner).toHaveCount(0);
});

test('the director sees who is ringing now and the changes in Zoom that stop matching or recording', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await open(page, true);
  const board = page.getByRole('region', { name: 'The board today' });
  await expect(board).toContainText('Being rung · Ann Smith');
  await expect(page.getByRole('region', { name: 'Needs you' }).getByRole('button', { name: /1 Zoom changes that stop matching or recording/ })).toBeVisible();
  await board.screenshot({ path: test.info().outputPath('live-now.png') });
});
