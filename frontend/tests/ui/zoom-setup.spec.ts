import { expect, test, type Page } from '@playwright/test';

type Accounts = { accounts: unknown[]; secrets_problem: string; secret_setting: string };

async function openZoomPhone(page: Page, accounts: Accounts, answers: Record<string, (body: Record<string, string>) => { status: number; json: unknown }>,
  lines: unknown[] = []) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1, email: 'director@example.org', username: 'director', displayName: 'Director',
      groups: [], access: {}, loggedInAt: new Date().toISOString(),
    }));
  });
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  const posts: Record<string, string>[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, string>;
      posts.push({ path: url.pathname, ...body });
      const answer = answers[`${url.pathname}:${body.action}`];
      if (answer) {
        const { status, json: payload } = answer(body);
        return json(payload, status);
      }
      return json({ ok: true });
    }
    if (url.pathname === '/api/callcentre/config/') {
      return json({ csrf_token: 'test', agent_id: null, is_manager: true, is_superuser: true,
        email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      return json({
        today: '2026-10-24', next_workday: '2026-10-26', holidays: [], month: '2026-10', generated_at: '2026-10-24T12:00:00Z',
        access: { role: 'director', agent_id: null, is_superuser: true, display_name: 'Director', email: 'director@example.org' },
        agents: [], cases: [], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: null, connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null,
      });
    }
    if (url.pathname === '/api/callcentre/zoom-accounts/') return json(accounts);
    if (url.pathname === '/api/callcentre/phone-lines/') {
      return json({ lines, scope: 'phone:read:list_numbers:admin',
        unlisted: [{ number: '+441622958955', agents: [{ id: 3, name: 'Alice', active: true, account: 'student' }] }] });
    }
    if (url.pathname === '/api/callcentre/activity-log/') return json({ month: '2026-10', months: ['2026-10'], daily: [], total_calls: 0, recent_calls: [] });
    if (url.pathname === '/api/callcentre/agents/') return json({ agents: [], accounts: [] });
    if (url.pathname === '/api/zoom/calls/') {
      const metrics = { calls: 0, answered: 0, not_answered: 0, other: 0, duration_seconds: 0, answered_duration_seconds: 0, missing_duration: 0 };
      return json({ timezone: 'Europe/London', accounts: [], totals: metrics, calls: [], daily: [], page: 1, total_records: 0, has_next: false });
    }
    if (url.pathname === '/api/auth/access/') return json({ id: 1, email: 'director@example.org', access: {}, groups: [] });
    return json({});
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dashboard/call-centre?view=phone');
  await expect(page.getByRole('heading', { name: 'Zoom accounts', exact: true }), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return posts;
}

test('with no Zoom accounts yet, Add on a profile’s number fills the form and says what is missing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const posts = await openZoomPhone(page, { accounts: [], secrets_problem: '', secret_setting: 'ZOOM_SECRETS_KEY' }, {});
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const form = page.locator('form.ed-line-form');
  await expect(form.getByRole('status')).toContainText('+441622958955 is filled in below');
  await expect(form.getByRole('textbox', { name: /^Phone number/ })).toHaveValue('+441622958955');
  await expect(form.getByText('Add the Zoom account first (Zoom accounts, above).').first()).toBeVisible();
  await expect(form.getByRole('combobox', { name: /^Zoom account/ })).toBeFocused();
  await form.getByRole('button', { name: 'Add number' }).click();
  expect(posts).toEqual([]);   // nothing is sent while a field is missing
  await form.screenshot({ path: test.info().outputPath('phone-number-form.png') });
});

test('adding a Zoom account shows each problem at its field, and a server failure with its reference', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  let attempt = 0;
  const posts = await openZoomPhone(page, { accounts: [], secrets_problem: '', secret_setting: 'ZOOM_SECRETS_KEY' }, {
    '/api/callcentre/zoom-accounts/:add': () => (++attempt === 1
      ? { status: 400, json: { detail: 'Student already uses this Account ID.', field: 'account_id' } }
      : { status: 500, json: { detail: 'Something went wrong on the server (reference 9F3A1C2B).', reference: '9F3A1C2B',
        debug: { error: 'KeyError: secret', where: '/callcentre/zoom_accounts.py:150 in add' } } }),
  });
  const form = page.locator('form.ed-zoom-form');
  await form.getByRole('button', { name: 'Add account' }).click();
  await expect(form.getByText('Enter a name for the account.')).toBeVisible();
  await expect(form.getByRole('textbox', { name: /^Name/ })).toBeFocused();
  await expect(form.getByText('marketplace.zoom.us').first()).toBeAttached();
  await form.getByRole('textbox', { name: /^Name/ }).fill('Student');
  await form.getByRole('textbox', { name: /^Account ID/ }).fill('AbC123');
  await form.getByRole('textbox', { name: /^Client ID/ }).fill('client_1');
  await form.getByLabel(/^Client Secret/).fill('top-secret');
  await form.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Adding the Zoom account failed.' })).toContainText('already uses this Account ID');
  await expect(form.locator('.ed-field.has-error')).toContainText('Account ID');
  await expect(form.getByRole('textbox', { name: /^Account ID/ })).toBeFocused();
  await form.getByRole('button', { name: 'Add account' }).click();
  const notice = page.getByRole('alert').filter({ hasText: 'Adding the Zoom account failed.' });
  await expect(notice).toContainText('9F3A1C2B');
  await notice.getByText('Technical details').click();
  await expect(notice).toContainText('zoom_accounts.py:150 in add');
  expect(posts.filter(post => post.action === 'add')).toHaveLength(2);
  await page.locator('.ed-zoom-form').screenshot({ path: test.info().outputPath('account-form.png') });
});

test('the page says when the server cannot store secrets yet, and how to fix it', async ({ page }) => {
  await openZoomPhone(page, { accounts: [], secret_setting: 'ZOOM_SECRETS_KEY',
    secrets_problem: 'ZOOM_SECRETS_KEY is missing from the server .env.' }, {});
  const alert = page.getByRole('alert').filter({ hasText: 'cannot store Zoom secrets' });
  await expect(alert).toBeVisible();
  await alert.getByText('How to add ZOOM_SECRETS_KEY').click();
  await expect(alert).toContainText('Fernet.generate_key()');
});

test('an account’s numbers are listed from Zoom and added to our list with one click', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const account = { key: 'student', label: 'Student', account_id: 'AbC123', client_id: 'client_1', secret_saved: true, secret_end: '9f2a',
    secret_readable: true, added_by: 'director', added_at: '2026-10-24T10:00:00Z', test: null };
  const posts = await openZoomPhone(page, { accounts: [account], secrets_problem: '', secret_setting: 'ZOOM_SECRETS_KEY' }, {
    '/api/callcentre/zoom-accounts/:numbers': () => ({ status: 200, json: { ok: true, numbers: [
      { number: '+441622958955', display_name: 'Alice line', status: 'normal', assignee: 'Alice Smith', assignee_type: 'user', extension: '801',
        site: 'Main', capability: ['incoming', 'outgoing'], listed: false, listed_account: '', specialists: [],
        recording: { state: 'on', calls: 'all calls', transcription: true, reason: '' } },
      { number: '+441622958989', display_name: '', status: 'normal', assignee: '', assignee_type: '', extension: '', site: '',
        capability: [], listed: true, listed_account: 'student', specialists: ['Tina'],
        recording: { state: 'off', calls: '', transcription: null, reason: '' } },
    ] } }),
  });
  await page.getByRole('button', { name: 'Numbers', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Numbers on Student' });
  await expect(panel).toContainText('Alice Smith');
  await expect(panel).toContainText('User · ext. 801');
  await expect(panel.getByRole('row').filter({ hasText: '+441622958989' })).toContainText('No transcripts or AI reviews for Tina’s calls');
  await expect(panel.getByRole('row').filter({ hasText: '+441622958955' })).toContainText('On · all calls');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(panel.getByRole('row').filter({ hasText: '+441622958955' })).toContainText('Listed');
  expect(posts.find(post => post.path === '/api/callcentre/phone-lines/')).toMatchObject(
    { action: 'add', number: '+441622958955', account: 'student', label: 'Alice line' });
  await panel.screenshot({ path: test.info().outputPath('account-numbers.png') });
});

test('Refresh from Zoom re-reads every number and says what changed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const line = { number: '+441622958955', label: 'Engagement Team', account: 'office', zoom_email: '', zoom_user_id: '', agents: [],
    zoom_name: 'Engagement Team', zoom_owner: 'Team', refreshed_at: '2026-10-24T13:10:00Z', test: null };
  const posts = await openZoomPhone(page, { accounts: [], secrets_problem: '', secret_setting: 'ZOOM_SECRETS_KEY' }, {
    '/api/callcentre/phone-lines/:refresh': () => ({ status: 200, json: { ok: true, refresh: { numbers: 3,
      changes: ['+441622958772: name Alice Saunders → Engagement 2'], not_in_zoom: ['+441622958775'], problems: [] } } }),
  }, [line]);
  await expect(page.getByRole('row').filter({ hasText: '+441622958955' })).toContainText('In Zoom: Engagement Team · owner Team');
  await page.getByRole('button', { name: 'Refresh from Zoom' }).click();
  const result = page.getByRole('status').filter({ hasText: 'Refreshed 3 numbers' });
  await expect(result).toContainText('Alice Saunders → Engagement 2');
  await expect(result).toContainText('Not in Zoom any more: +441622958775');
  expect(posts.some(post => post.action === 'refresh')).toBe(true);
});
