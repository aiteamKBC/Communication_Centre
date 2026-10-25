import { expect, test, type Page } from '@playwright/test';
import type { CallLogData } from '../../src/pages/call-centre/engagement/CallLog';

const LOG: CallLogData = {
  total: 2, page: 1, page_size: 25, has_next: false,
  summary: { calls: 2, answered: 1, not_matched: 0, closed: 2, booked: 1, feedback: 1 },
  agents: [{ id: 1, display_name: 'Operator' }, { id: 2, display_name: 'Tina' }],
  calls: [
    {
      id: 11, pressed_at: '2026-10-20T10:30:00Z', agent: { id: 1, name: 'Operator' }, learner_name: 'Akmal Learner',
      learner_email: 'akmal@example.org', number: '+447700900123', saved: true,
      zoom: { state: 'answered', id: 501, started_at: '2026-10-20T10:30:20Z', duration_seconds: 245, transcript: 'ready' },
      cases: [
        { id: 1, source_type: 'attendance', organisation: '', status: 'resolved', resolution_option: 'catch_up_session', next_followup_at: null,
          outcome: { state: 'applied', outcome: 'reached', option: 'catch_up_session', note: 'Was ill, booked a catch-up.', callback_at: null, promised_at: null },
          closed: { at: '2026-10-20T10:36:00Z', note: 'Catch-up booked in the LMS.' },
          bookings: [{ session_type: 'catch-up', start: '2026-10-22T09:00:00Z', coach: 'Coach Carter', join_url: 'https://zoom.example/j/1', link_warning: '' }],
          feedback: null },
        { id: 2, source_type: 'learner_satisfaction', organisation: '', status: 'resolved', resolution_option: 'learner_feedback_completed', next_followup_at: null,
          outcome: null, closed: { at: '2026-10-20T10:41:00Z', note: 'Enjoying the course.' }, bookings: [],
          feedback: { state: 'completed', score: 4, problem: 'Lecture times clash with work', agreed_action: 'Coach to share recordings',
            note: 'Enjoying the course.', next_due_at: '2027-01-20T10:41:00Z' } },
      ],
    },
    {
      id: 12, pressed_at: '2026-10-20T11:00:00Z', agent: { id: 2, name: 'Tina' }, learner_name: 'Bea Learner',
      learner_email: 'bea@example.org', number: '+447700900124', saved: true,
      zoom: { state: 'waiting', id: null, started_at: null, duration_seconds: null, transcript: 'none' },
      cases: [
        { id: 3, source_type: 'pr', organisation: '', status: 'in_progress', resolution_option: '', next_followup_at: null,
          outcome: { state: 'waiting', outcome: 'no_answer', option: '', note: '', callback_at: null, promised_at: null },
          closed: null, bookings: [], feedback: null },
      ],
    },
  ],
};

async function open(page: Page, manager: boolean) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1, email: 'operator@example.org', username: 'operator', displayName: 'Operator',
      groups: [], access: {}, loggedInAt: new Date().toISOString(),
    }));
  });
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  const requests: URL[] = [];
  const writes: string[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(url.pathname);
    const json = (body: unknown) => route.fulfill({ json: body });
    if (url.pathname === '/api/callcentre/config/') {
      return json({ csrf_token: 'test', agent_id: 1, is_manager: manager, is_superuser: false,
        email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      return json({
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: '2026-10-20T12:00:00Z',
        access: { role: manager ? 'director' : 'operator', agent_id: 1, is_superuser: false, display_name: 'Operator', email: 'operator@example.org' },
        agents: [{ id: 1, display_name: 'Operator', zoom_account: 'student', zoom_phone_number: '',
          target_seconds: 10800, today: { attempts: 0, connected: 0, seconds: 0 },
          month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0, sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases: [], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: null, connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null,
      });
    }
    if (url.pathname === '/api/callcentre/call-log/') {
      requests.push(url);
      const who = url.searchParams.get('agent_id');
      const calls = manager && who ? LOG.calls.filter(call => String(call.agent.id) === who) : manager ? LOG.calls : LOG.calls.slice(0, 1);
      return json({ ...LOG, calls, total: calls.length, agents: manager ? LOG.agents : undefined });
    }
    if (url.pathname === '/api/callcentre/employer-specialists/') {
      return json({ values: { enabled: false, agent_ids: [] }, revision: 0, set_up: true, not_set_up: '', open_employer_cases: 0,
        agents: [], history: [] });
    }
    if (url.pathname === '/api/callcentre/inbound/') {
      return json({ items: [], summary: { open: 0, received: 0, done: 0, median_minutes: null, within_hour: 0, days: 7 } });
    }
    if (url.pathname === '/api/callcentre/scorecard/') return json({ week: '2026-10-19', cards: [] });
    if (url.pathname === '/api/callcentre/missing-recordings/') return json({ calls: [] });
    if (/^\/api\/zoom\/calls\/\d+\/recordings\/$/.test(url.pathname)) {
      return json({ recordings: [{ id: 31, recording_type: 'Automatic', owner_name: 'Operator', duration_seconds: 245, transcript_status: 'ready', transcript_error: '' }] });
    }
    if (url.pathname === '/api/zoom/recordings/31/transcript/') return json({ status: 'ready', text: 'Hello Akmal, it is about your catch-up.', error: '', review: null });
    if (url.pathname === '/api/zoom/recordings/31/audio/') {
      requests.push(url);
      return route.fulfill({ status: 502, json: { detail: 'Zoom has no audio for this recording any more.' } });
    }
    if (url.pathname === '/api/auth/access/') return json({ id: 1, email: 'operator@example.org', access: {}, groups: [] });
    return json({});
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(manager ? '/dashboard/call-centre?view=calls' : '/dashboard/call-centre?view=operator&section=calls');
  await expect(page.getByRole('heading', { name: manager ? 'Call monitor' : 'Calls and what they did', exact: true }),
    `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return { requests, writes };
}

test('a specialist sees their last calls with every outcome, booking and satisfaction feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { requests, writes } = await open(page, false);
  expect(requests[0].searchParams.get('agent_id')).toBe('1');
  const call = page.getByRole('article', { name: 'Call to Akmal Learner' });
  await expect(call).toContainText('answered · 4m 5s');
  await expect(call).toContainText('Reached: Book a catch-up session');
  await expect(call).toContainText('Booked · Catch-up session');
  await expect(call).toContainText('Coach Carter');
  await expect(call.getByRole('link', { name: 'https://zoom.example/j/1' })).toBeVisible();
  await expect(call).toContainText('Satisfaction feedback · Review completed');
  await expect(call).toContainText('Coach to share recordings');
  await expect(call.getByRole('button', { name: 'Recording & transcript' })).toBeVisible();
  await expect(page.locator('.ed-log-totals')).toContainText('Sessions booked1');
  await page.getByRole('region', { name: 'My last calls' }).getByLabel('Period').selectOption('30');
  await expect.poll(() => requests.at(-1)?.searchParams.get('days')).toBe('30');
  await page.screenshot({ path: test.info().outputPath('last-calls.png'), fullPage: true });
  expect(writes).toEqual([]);
});

test('the director monitors every specialist’s calls on the Call monitor page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { requests } = await open(page, true);
  await expect(page.getByRole('heading', { name: 'Contact and support patterns' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Red flags & development' })).toHaveCount(0);
  expect(requests[0].searchParams.get('agent_id')).toBeNull();
  const monitor = page.getByRole('region', { name: 'Call monitor' });
  await expect(monitor.getByRole('article', { name: /^Call to/ })).toHaveCount(2);
  await expect(monitor.getByRole('article', { name: 'Call to Bea Learner' })).toContainText('Waiting for Zoom');
  await expect(monitor.getByRole('article', { name: 'Call to Bea Learner' })).toContainText('Applies when Zoom reports the call');
  await monitor.getByLabel('Specialist').selectOption('2');
  await expect.poll(() => requests.at(-1)?.searchParams.get('agent_id')).toBe('2');
  await expect(monitor.getByRole('article', { name: /^Call to/ })).toHaveCount(1);
  await monitor.screenshot({ path: test.info().outputPath('call-monitor.png') });
});

test('a call recording plays from Zoom next to its transcript', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { requests } = await open(page, false);
  await page.getByRole('article', { name: 'Call to Akmal Learner' }).getByRole('button', { name: 'Recording & transcript' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Hello Akmal, it is about your catch-up.');
  await dialog.getByRole('button', { name: '▶ Play' }).click();
  // Streamed from Zoom only when Play is pressed; a recording Zoom no longer has says so.
  await expect.poll(() => requests.some(url => url.pathname === '/api/zoom/recordings/31/audio/')).toBe(true);
  await expect(dialog.getByRole('alert')).toContainText('Zoom could not play this recording');
});
