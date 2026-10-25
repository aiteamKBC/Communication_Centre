// Next-day reminders of Outlook review meetings (the learner's reply, Cancel meeting) and the director's meeting audit.
import { expect, test, type Page } from '@playwright/test';
import type { Overview, OverviewCase, ReviewMeetingSummary } from '../../src/pages/call-centre/api';

function reminder(id: number, name: string, meeting: Partial<ReviewMeetingSummary>): OverviewCase {
  return {
    id, source_type: 'reminder', source_id: null, learner_name: name, learner_email: `${name.split(' ')[0].toLowerCase()}@example.org`,
    learner_phone: `+4477009001${id}`, coach: 'Med Maher', organisation: 'Test Company', programme: 'Marketing L3',
    manager_name: '', manager_email: '', issue_name: 'Monthly coaching', issue_date: null, status: 'new', risk: 'amber',
    claimed_by: null, claimed_agent_id: null, last_actor: 'System', last_action_at: '2026-10-20T08:00:00Z',
    attempts: 0, next_followup_at: null, due_at: '2026-10-21T10:00:00Z', sla_breached: false, sla_days_overdue: 0,
    learner_days_overdue: 0, misses: 0, booking_at: '2026-10-21T10:00:00Z', ai_summary: '', ai_confidence: null,
    resolution_option: '', resolved_at: null, resolved_by: '', archived: false, escalated: false, created_at: '2026-10-20T08:00:00Z',
    purpose: '', requested_by: '', helpdesk: null, promised_at: null, promise_missed: false, promises: {}, specialist_closes: true,
    missed_call: false, bookable: [], booking_email: false, booking_links: {}, allocated_agent_id: null, followup_agent_id: null,
    meeting: { id, status: 'scheduled', cancelled_how: '', learner_response: 'accepted', confirmed: false, organizer: 'med@kbc.test',
      cancellable: true, ...meeting },
  };
}

const MEETINGS = [
  { id: 1, review_type: 'mcm', subject: 'Monthly Coaching Review with Med Maher - Jade Seamer', organizer_email: 'med@kbc.test',
    coach_email: 'med@kbc.test', learner_email: 'jade@example.org', learner_name: 'Jade Seamer', matched_by: 'email',
    learner_response: 'accepted', learner_response_at: null, status: 'scheduled', cancelled_how: '', cancelled_by: '', cancel_reason: '',
    cancelled_at: null, confirmed_at: '2026-10-20T09:00:00Z', confirmed_by: 'Alice', start_at: '2026-10-21T10:00:00Z', end_at: null,
    first_seen_at: '2026-10-01T09:00:00Z', last_seen_at: '2026-10-20T09:00:00Z' },
  { id: 2, review_type: 'pr', subject: 'Progress Review Meeting with Radwa - Warren Mortimer', organizer_email: 'radwa@kbc.test',
    coach_email: 'radwa@kbc.test', learner_email: 'warren@example.org', learner_name: 'Warren Mortimer', matched_by: 'name',
    learner_response: 'declined', learner_response_at: null, status: 'cancelled', cancelled_how: 'engagement_centre', cancelled_by: 'Alice',
    cancel_reason: 'The learner cannot attend: shift moved', cancelled_at: '2026-10-20T10:00:00Z', confirmed_at: null, confirmed_by: '',
    start_at: '2026-10-22T13:00:00Z', end_at: null, first_seen_at: '2026-10-01T09:00:00Z', last_seen_at: '2026-10-20T10:00:00Z' },
];

async function open(page: Page, path: string, cases: OverviewCase[], role: 'operator' | 'director' = 'operator') {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const asked: URL[] = [];
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
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      posts.push({ path: url.pathname, body });
      if (url.pathname.endsWith('/employer_call/')) return json({ number: '+447700900555' });
      if (url.pathname.endsWith('/employer_check/')) return json({ ok: true });
      return json({ ok: true, start: body.start || '2026-10-21T10:00:00Z',
        meeting: { ...cases[0].meeting, ...(body.action === 'cancel' ? { status: 'cancelled', cancelled_how: 'engagement_centre', cancellable: false } : {}) } });
    }
    if (/^\/api\/callcentre\/tickets\/\d+\/meeting\/$/.test(url.pathname)) {
      asked.push(url);
      return json({ start: '2026-10-21T10:00:00Z', coach: 'med@kbc.test', timezone: 'Europe/London', times: [
        { start: '2026-10-22T09:00:00+01:00', date: '2026-10-22', time: '09:00' }, { start: '2026-10-22T14:00:00+01:00', date: '2026-10-22', time: '14:00' },
        { start: '2026-10-23T10:00:00+01:00', date: '2026-10-23', time: '10:00' }] });
    }
    asked.push(url);
    if (url.pathname === '/api/callcentre/config/') return json({ csrf_token: 't', agent_id: 1, agents: [], sources: [], cycle: null });
    if (url.pathname === '/api/callcentre/live/') return json({ enabled: true, calls: [] });
    if (url.pathname === '/api/callcentre/inbound/') return json({ summary: { open: 0, received: 0, done: 0, median_minutes: null, within_hour: 0, days: 90 }, items: [] });
    if (url.pathname === '/api/callcentre/review-meetings/') {
      if (url.searchParams.get('id')) {
        return json({ case_ids: [7], meeting: { ...MEETINGS[1], events: [
          { at: '2026-10-01T09:00:00Z', kind: 'found', detail: { subject: MEETINGS[1].subject, organizer: 'radwa@kbc.test' }, actor: 'System' },
          { at: '2026-10-19T09:00:00Z', kind: 'learner_replied', detail: { response: 'declined' }, actor: 'System' },
          { at: '2026-10-20T10:00:00Z', kind: 'cancelled_by_specialist', detail: { reason: 'cannot_attend', note: 'shift moved' }, actor: 'Alice' },
          { at: '2026-10-20T10:00:01Z', kind: 'coach_note', detail: { to: 'radwa@kbc.test', sent: true }, actor: 'Alice' },
        ] } });
      }
      const status = url.searchParams.get('status');
      return json({ from: url.searchParams.get('from'), to: url.searchParams.get('to'),
        items: status === 'cancelled' ? [MEETINGS[1]] : MEETINGS,
        counts: { total: 2, scheduled: 1, confirmed: 1, declined: 0, cancelled_here: 1, cancelled_outlook: 0, removed: 0, unmatched: 0 },
        sync: { last_success_at: '2026-10-20T10:05:00Z', error: '' } });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      return json({
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10', generated_at: new Date().toISOString(),
        access: { role, agent_id: role === 'director' ? null : 1, is_superuser: role === 'director', display_name: 'Alice', email: 'alice@example.org' },
        agents: [{ id: 1, display_name: 'Alice', zoom_account: 'student', zoom_phone_number: '', target_seconds: 10800,
          today: { attempts: 0, connected: 0, seconds: 0 },
          month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0, sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases, cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0, sources: [],
        cycle: { last_success_at: new Date().toISOString(), details: {} }, connections: { calling: true, email_mode: 'dry_run', ai: false },
        call_reviews: null,
      } as unknown as Overview);
    }
    return json({});
  });
  await page.goto(path);
  await expect(page.locator('h1').first(), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return { posts, asked, errors };
}

test('a next-day reminder shows the learner’s Outlook reply and cancels the meeting with a reason', async ({ page }) => {
  const cases = [reminder(7, 'Jade Seamer', {}), reminder(8, 'Mo Patel', { learner_response: 'declined' }),
    reminder(9, 'Ann Lee', { status: 'cancelled', cancelled_how: 'outlook', cancellable: false })];
  const { posts, errors } = await open(page, '/dashboard/call-centre?view=operator&section=nextday', cases);
  const row = (id: number) => page.locator(`[data-sheet-row="${id}"]`);
  await expect(row(7).locator('.ed-meeting')).toContainText('Accepted in Outlook');
  await expect(row(8).locator('.ec-tag.red')).toHaveText('Declined in Outlook');
  await expect(row(9).locator('.ed-meeting')).toContainText('Cancelled in Outlook');
  await expect(row(9).getByRole('button', { name: 'Cancel or reschedule' })).toHaveCount(0);

  await row(7).getByRole('button', { name: 'Cancel or reschedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel or reschedule' });
  await expect(dialog).toContainText('Outlook tells Jade Seamer straight away');
  await dialog.getByLabel('The learner asked to cancel').check();
  await dialog.getByLabel('Note for the coach (optional)').fill('Moving house that week');
  await dialog.getByRole('button', { name: 'Cancel the meeting', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(posts).toEqual([{ path: '/api/callcentre/tickets/7/meeting/', body: { action: 'cancel', reason: 'learner_asked', note: 'Moving house that week', agent_id: 1 } }]);
  await expect(page.locator('.ec-status')).toContainText('Jade Seamer’s meeting is cancelled');
  expect(errors).toEqual([]);
});

test('a next-day reminder moves the meeting to a time the coach is free', async ({ page }) => {
  const { posts, asked } = await open(page, '/dashboard/call-centre?view=operator&section=nextday', [reminder(7, 'Jade Seamer', {})]);
  await page.locator('[data-sheet-row="7"]').getByRole('button', { name: 'Cancel or reschedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel or reschedule' });
  await dialog.getByRole('radio', { name: /Cancel & reschedule/ }).check();
  await expect(dialog.getByRole('button', { name: 'Move the meeting' })).toBeDisabled();
  // "Rebooked for another time" is a reason to cancel, not to move.
  await expect(dialog.getByLabel('Rebooked for another time')).toHaveCount(0);
  await expect.poll(() => asked.some(url => url.pathname === '/api/callcentre/tickets/7/meeting/' && url.searchParams.get('agent_id') === '1')).toBe(true);
  const [dayPicker, timePicker] = [dialog.getByRole('combobox').nth(0), dialog.getByRole('combobox').nth(1)];
  await dayPicker.selectOption('2026-10-22');
  await expect(timePicker.locator('option')).toHaveText(['Choose a time…', '09:00', '14:00']);
  await timePicker.selectOption('2026-10-22T14:00:00+01:00');
  await dialog.getByLabel('The learner asked to cancel').check();
  await dialog.getByRole('button', { name: 'Move the meeting' }).click();
  await expect(dialog).toBeHidden();
  expect(posts).toEqual([{ path: '/api/callcentre/tickets/7/meeting/', body: { action: 'reschedule', reason: 'learner_asked', note: '',
    agent_id: 1, start: '2026-10-22T14:00:00+01:00' } }]);
  await expect(page.locator('.ec-status')).toContainText('Jade Seamer’s meeting is moved to Thu 22 Oct, 14:00');
});

test('the director audits review meetings: counts, filters, the history of one and a CSV', async ({ page }) => {
  const { asked, posts } = await open(page, '/dashboard/call-centre?view=meetings', [], 'director');
  await expect(page.getByRole('heading', { name: 'Review meetings', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '20 Oct – 3 Nov 2026', level: 2 })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Review meetings' })).toHaveAttribute('aria-current', 'page');
  const table = page.locator('.rm-table');
  await expect(table.getByRole('row').filter({ hasText: 'Jade Seamer' })).toContainText('Confirmed on a call');
  const warren = table.getByRole('row').filter({ hasText: 'Warren Mortimer' });
  await expect(warren).toContainText('Cancelled from the Engagement Centre');
  await expect(warren).toContainText('The learner cannot attend: shift moved');
  await page.locator('.rm-filters [role=tab]').filter({ hasText: /^Cancelled\s*1$/ }).click();
  await expect.poll(() => asked.at(-1)?.searchParams.get('status')).toBe('cancelled');
  await expect(table.getByRole('row')).toHaveCount(2);   // the header and Warren
  await page.getByLabel('Find a meeting').fill('nobody here');
  await expect(table).toContainText('No meetings match.');
  await page.getByLabel('Find a meeting').fill('');

  await warren.getByRole('button', { name: 'History of Warren Mortimer' }).click();
  const history = page.getByRole('dialog', { name: 'Meeting history' });
  await expect(history.locator('.rm-history li')).toHaveCount(4);
  await expect(history).toContainText('Declined in Outlook');
  await expect(history).toContainText('Cancelled from the Engagement Centre');
  await expect(history).toContainText('Sent to radwa@kbc.test');
  await expect(history).toContainText('Reminder case 7');
  await history.getByRole('button', { name: 'Close meeting history' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^KBC-Review-Meetings-2026-10-20-to-2026-11-03\.csv$/);
  expect(posts).toEqual([]);
});

test('a next-day progress review is confirmed with the employer too, in the row and on the call', async ({ page }) => {
  const employer = { manager_name: 'Max Manager', manager_email: 'max@employer.test', manager_phone: '+447700900555', result: '' as const,
    label: '', done: false, note: '', by: '', at: null, tries: 0 };
  const review = { ...reminder(7, 'Ann Lee', {}), issue_name: 'Progress review', employer_check: employer };
  const { posts, errors } = await open(page, '/dashboard/call-centre?view=operator&section=nextday', [review]);
  const step = page.locator('[data-sheet-row="7"]').getByRole('region', { name: 'Employer confirmation for Ann Lee' });
  await expect(step).toContainText('Not confirmed yet');
  await expect(step).toContainText('Max Manager');
  await expect(step.getByRole('link', { name: 'max@employer.test' })).toHaveAttribute('href', 'mailto:max@employer.test');
  await step.getByRole('button', { name: '📞 Call employer' }).click();
  await expect.poll(() => posts.map(p => p.path)).toEqual(['/api/callcentre/tickets/7/employer_call/']);
  // "Could not reach" needs to say what happened before it can be saved.
  await step.getByLabel('What the employer said about Ann Lee’s review').selectOption('not_reachable');
  await expect(step.getByRole('button', { name: 'Save employer step' })).toBeDisabled();
  await step.getByLabel('What the employer said about Ann Lee’s review').selectOption('confirmed');
  await step.getByLabel('Employer note for Ann Lee').fill('Max will release Ann at 2pm');
  await step.getByRole('button', { name: 'Save employer step' }).click();
  await expect.poll(() => posts.at(-1)).toEqual({ path: '/api/callcentre/tickets/7/employer_check/',
    body: { result: 'confirmed', note: 'Max will release Ann at 2pm', agent_id: 1 } });

  // On Today's call view the same step sits with the review.
  await page.getByRole('navigation').getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Employer confirmation for Ann Lee' })).toBeVisible();
  expect(errors).toEqual([]);
});
