// Full case: one person and everything about them, from Today (pop-up) and the director's case page.
import { expect, test, type Page } from '@playwright/test';
import type { CaseDetail, Overview, OverviewCase } from '../../src/pages/call-centre/api';

const SHOTS = process.env.FULL_CASE_SHOTS || '';

function ticket(id: number, fields: Partial<OverviewCase> = {}): OverviewCase {
  return {
    id, source_type: 'attendance', source_id: null, learner_name: 'Ann Lee', learner_email: 'ann@example.org', learner_phone: '+447700900111',
    coach: 'Coach Carter', organisation: 'Acme Ltd', programme: 'Business Administrator L3', manager_name: 'Max Manager',
    manager_email: 'max@acme.example', issue_name: 'Marketing', issue_date: '2026-10-15', status: 'new', risk: 'amber',
    claimed_by: null, claimed_agent_id: null, last_actor: 'System', last_action_at: '2026-10-19T09:00:00Z', attempts: 1,
    next_followup_at: null, due_at: '2026-10-19T12:00:00Z', sla_breached: true, sla_days_overdue: 1, learner_days_overdue: 0, misses: 1,
    booking_at: null, ai_summary: '', ai_confidence: null, resolution_option: '', resolved_at: null, resolved_by: '', archived: false,
    escalated: false, created_at: '2026-10-16T08:00:00Z', purpose: '', requested_by: '', helpdesk: null, promised_at: null,
    promise_missed: false, promises: { catch_up_session: 7 }, specialist_closes: false, missed_call: false, called_back_at: '2026-10-20T08:10:00Z',
    bookable: ['catch-up'], booking_email: true, booking_links: {}, allocated_agent_id: 1, followup_agent_id: null,
    missed_lecture: { module: 'Marketing', title: 'Marketing: Customer Journeys', date: '2026-10-15', starts_at: null, ends_at: null, time_status: 'missing' },
    ...fields,
  };
}

const LECTURE = ticket(7);
const REVIEW = ticket(8, {
  source_type: 'reminder', issue_name: 'Progress review', issue_date: null, booking_at: '2026-10-21T13:00:00Z', due_at: '2026-10-21T13:00:00Z',
  sla_breached: false, sla_days_overdue: 0, promises: {}, specialist_closes: true, bookable: [], booking_email: false, missed_lecture: null,
  meeting: { id: 3, status: 'scheduled', cancelled_how: '', learner_response: 'declined', confirmed: false, organizer: 'carter@kbc.test', cancellable: true },
  employer_check: { manager_name: 'Max Manager', manager_email: 'max@acme.example', manager_phone: '+447700900555', result: '', label: '',
    done: false, note: '', by: '', at: null, tries: 0 },
});

const HISTORY: CaseDetail['history'] = {
  cases: 4,
  calls: [
    { call_id: 51, started_at: '2026-10-19T10:00:00Z', result: 'answered', direction: 'outbound', duration_seconds: 312, agent: 'Alice', manual: false,
      cases: [{ id: 7, label: 'Missed lecture', outcome: 'callback' }, { id: 5, label: 'Monthly coaching', outcome: 'reached' }],
      recordings: [{ id: 91, transcript: 'ready', duration_seconds: 312, rating: 'good' }] },
    { call_id: 50, started_at: '2026-10-16T15:00:00Z', result: 'no_answer', direction: 'outbound', duration_seconds: null, agent: 'Alice', manual: false,
      cases: [{ id: 7, label: 'Missed lecture', outcome: 'no_answer' }], recordings: [] },
  ],
  events: [
    { id: 3, kind: 'outcome', actor: 'Alice', data: { outcome: 'callback', note: 'At work, call back after 4pm' }, created_at: '2026-10-19T10:06:00Z', case_id: 7, case_label: 'Missed lecture' },
    { id: 2, kind: 'resolved', actor: 'Alice', data: { note: 'MCM booked' }, created_at: '2026-10-19T10:06:00Z', case_id: 5, case_label: 'Monthly coaching' },
    { id: 1, kind: 'created', actor: 'System', data: {}, created_at: '2026-10-16T08:00:00Z', case_id: 7, case_label: 'Missed lecture' },
  ],
  missed_calls: [{
    id: 4, caller_number: '+447700900111', caller_name: 'Ann Lee', caller_email: 'ann@example.org', caller_role: 'learner', line: '+441622958955',
    received_at: '2026-10-20T08:10:00Z', result: 'voicemail', agent: 'Alice', status: 'open', done_how: '', done_by: '', done_at: null, note: '',
    waited_minutes: 75, case_id: 7, voicemail_id: 12,
    voicemail: { duration_seconds: 21, transcript_status: 'ready', transcript: 'Hi, it’s Ann about Thursday’s lecture, please call me back.' },
  }],
};

function detail(c: OverviewCase, history = false): CaseDetail {
  return {
    ticket: { ...c, source_data: {}, priority_why: '', manager_phone: '+447700900555' } as CaseDetail['ticket'],
    issues: [LECTURE, REVIEW].map(({ id, source_type, status, issue_name, issue_date }) => ({ id, source_type, status, issue_name, issue_date })),
    calls: [], events: [], emails: [], has_more_events: false, held_feedback: null, open_call: null, ...(history ? { history: HISTORY } : {}),
  };
}

async function open(page: Page, path: string, role: 'operator' | 'director' = 'operator') {
  const posts: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
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
    const json = (body: unknown) => route.fulfill({ json: body });
    if (route.request().method() === 'POST') { posts.push(url.pathname); bodies.push(route.request().postDataJSON()); return json({ ok: true }); }
    if (url.pathname === '/api/callcentre/config/') return json({ csrf_token: 't', agent_id: 1, agents: [], sources: [], cycle: null });
    if (url.pathname === '/api/callcentre/live/') return json({ enabled: true, calls: [] });
    if (url.pathname === '/api/callcentre/inbound/') return json({ summary: { open: 1, received: 1, done: 0, median_minutes: null, within_hour: 0, days: 90 }, items: [] });
    const found = url.pathname.match(/^\/api\/callcentre\/tickets\/(\d+)\/$/);
    if (found) return json(detail(Number(found[1]) === 8 ? REVIEW : LECTURE, url.searchParams.get('history') === '1'));
    if (url.pathname === '/api/zoom/recordings/91/transcript/') {
      return json({ status: 'ready', text: 'Alice: Hello Ann, it is about Thursday’s lecture…', error: '',
        review: { rating: 'good', went_wrong: [], needs_change: [], summary: 'Friendly and clear; agreed a callback.', analysed_at: '2026-10-19T10:20:00Z' } });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      return json({
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: new Date().toISOString(),
        access: { role, agent_id: role === 'director' ? null : 1, is_superuser: role === 'director', display_name: 'Alice', email: 'alice@example.org' },
        agents: [{ id: 1, display_name: 'Alice', zoom_account: 'student', zoom_phone_number: '', target_seconds: 10800,
          today: { attempts: 0, connected: 0, seconds: 0 },
          month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0, sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases: [LECTURE, REVIEW], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0, sources: [],
        cycle: { last_success_at: new Date().toISOString(), details: {} }, connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null,
      } as unknown as Overview);
    }
    return json({});
  });
  await page.goto(path);
  await expect(page.locator('h1').first(), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return { posts, bodies, errors };
}

test('Full case from Today: who, one Call for every case, each case’s steps, and the whole history', async ({ page }) => {
  const { errors } = await open(page, '/dashboard/call-centre?view=operator&section=missed');
  await page.locator('[data-sheet-row="7"]').getByRole('button', { name: 'Full case', exact: true }).click();
  const full = page.locator('dialog.ed-case-dialog');
  const band = full.locator('.lf-band');
  await expect(band.getByRole('heading', { name: 'Ann Lee' })).toBeVisible();
  await expect(band).toContainText('+447700900111');
  await expect(band.getByRole('button', { name: '📞 Call · 2 cases' })).toBeVisible();
  if (SHOTS) await full.screenshot({ path: `${SHOTS}full-case-top.png` });
  await expect(band.locator('.lf-flags')).toContainText('Ann rang');
  await expect(band.locator('.lf-flags')).toContainText('Declined tomorrow’s meeting in Outlook');
  await expect(band.locator('.lf-flags')).toContainText('Employer to confirm tomorrow’s review');
  // Why we are calling, and how to reach them (the line manager's number too).
  const rail = full.getByRole('navigation', { name: 'Why you are calling' });
  await expect(rail.getByRole('button')).toHaveCount(2);
  await expect(full.getByRole('region', { name: 'How to reach them' })).toContainText('+447700900555');
  // Each case with its own steps: tomorrow's review has the meeting and the employer.
  const review = full.getByRole('article', { name: /^Tomorrow’s appointment/ });
  await expect(review.getByRole('button', { name: 'Cancel or reschedule' })).toBeVisible();
  await expect(review.getByRole('region', { name: 'Employer confirmation for Ann Lee' })).toBeVisible();
  const lecture = full.getByRole('article', { name: /^Missed lecture/ });
  await expect(lecture).toContainText('1 day late');
  await expect(lecture.getByRole('button', { name: 'Book with coach' })).toBeVisible();
  // History across every case: calls to play and read, the voicemail, the timeline.
  const history = full.getByRole('region', { name: 'History' });
  await expect(history).toContainText('All 4 cases, open and closed');
  const call = history.getByRole('article').first();
  await expect(call.locator('audio')).toHaveAttribute('src', '/api/zoom/recordings/91/audio/');
  await call.locator('.cl-toggle').click();
  await call.locator('details.cl-transcript summary').click();
  await expect(call).toContainText('Friendly and clear; agreed a callback.');
  await history.getByRole('tab', { name: 'Missed calls & voicemails (1)' }).click();
  await expect(history).toContainText('please call me back');
  await history.getByRole('tab', { name: 'Timeline (3)' }).click();
  await expect(history).toContainText('At work, call back after 4pm');
  if (SHOTS) await full.screenshot({ path: `${SHOTS}full-case.png` });
  // The rail moves to a case.
  await rail.getByRole('button', { name: /Tomorrow’s appointment/ }).click();
  await expect(review).toHaveClass(/selected/);
  expect(errors).toEqual([]);
});

test('the director’s case page is the same Full case', async ({ page }) => {
  const { errors } = await open(page, '/dashboard/call-centre?case=7', 'director');
  await expect(page.locator('.lf-band').getByRole('heading', { name: 'Ann Lee' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'History' })).toContainText('All 4 cases, open and closed');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}full-case-director.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('an outcome recorded by hand needs no call picked: it goes with the last call by itself', async ({ page }) => {
  const { posts, bodies, errors } = await open(page, '/dashboard/call-centre?view=operator&section=missed');
  await page.locator('[data-sheet-row="7"]').getByRole('button', { name: 'Full case', exact: true }).click();
  const lecture = page.locator('dialog.ed-case-dialog').getByRole('article', { name: /^Missed lecture/ });
  await lecture.getByText('Record an outcome by hand or add a note', { exact: true }).click();
  const form = lecture.locator('form.ed-outcome');
  await expect(form.getByText('Zoom call', { exact: true })).toHaveCount(0);
  await expect(form.locator('select')).toHaveCount(1);   // the outcome only
  await form.locator('textarea').fill('Rang back as agreed; will book the catch-up today.');
  await form.getByRole('button', { name: 'Save next step', exact: true }).click();
  await expect.poll(() => posts).toContain('/api/callcentre/tickets/7/plan/');
  const saved = bodies[posts.indexOf('/api/callcentre/tickets/7/plan/')];
  expect(saved).toMatchObject({ note: 'Rang back as agreed; will book the catch-up today.' });
  expect(saved).not.toHaveProperty('call_id');
  expect(errors).toEqual([]);
});
