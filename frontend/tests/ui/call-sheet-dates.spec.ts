import { expect, test, type Page } from '@playwright/test';
import type { Overview, OverviewCase } from '../../src/pages/call-centre/api';
import { matchesTicketDate, orderTickets } from '../../src/pages/call-centre/engagement/ticketOrder';

function ticket(id: number, fields: Partial<OverviewCase> = {}): OverviewCase {
  return {
    id, source_type: 'attendance', source_id: null, learner_name: `Learner ${id}`,
    learner_email: `learner${id}@example.org`, learner_phone: '', coach: 'Test Coach',
    organisation: 'Test Company', programme: 'Test Programme', manager_name: '', manager_email: '',
    issue_name: 'Test lecture', issue_date: '2026-09-15', status: 'new', risk: 'amber',
    claimed_by: null, claimed_agent_id: null, last_actor: 'System', last_action_at: '2026-10-01T12:00:00Z',
    attempts: 0, next_followup_at: null, due_at: '2026-09-20T12:00:00Z',
    sla_breached: false, sla_days_overdue: 0, learner_days_overdue: 0, misses: 1,
    booking_at: null, ai_summary: '', ai_confidence: null, resolution_option: '', resolved_at: null,
    resolved_by: '', archived: false, escalated: false, created_at: '2026-10-01T12:00:00Z',
    purpose: '', requested_by: '', helpdesk: null, promised_at: null, promise_missed: false,
    promises: { catch_up_session: 7 }, specialist_closes: false, missed_call: false,
    bookable: [], booking_email: false, booking_links: {}, allocated_agent_id: null, ...fields,
  };
}

async function openSheet(page: Page, cases: OverviewCase[], section = 'missed', lastSync: string | null = null) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1, email: 'operator@example.org', username: 'operator', displayName: 'Operator',
      groups: [], access: {}, loggedInAt: new Date().toISOString(),
    }));
  });
  // No test traffic may reach the live API, external services or call providers.
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  const writes: string[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body: unknown) => route.fulfill({ json: body });
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(url.pathname);
    if (url.pathname === '/api/callcentre/config/') {
      return json({ csrf_token: 'test', agent_id: 1, is_manager: false, is_superuser: false,
        email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      const overview: Overview = {
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10',
        generated_at: new Date().toISOString(),
        access: { role: 'operator', agent_id: 1, is_superuser: false, display_name: 'Operator', email: 'operator@example.org' },
        agents: [{ id: 1, display_name: 'Operator', zoom_account: 'student', zoom_phone_number: '',
          target_seconds: 10800, today: { attempts: 0, connected: 0, seconds: 0 },
          month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0,
            sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases, cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: lastSync ? { last_success_at: lastSync, details: {} } : null,
        connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null,
      };
      return json(overview);
    }
    const detail = url.pathname.match(/^\/api\/callcentre\/tickets\/(\d+)\/$/);
    if (detail) {
      const selected = cases.find(c => c.id === Number(detail[1]));
      return json({ ticket: { ...selected, source_data: {}, priority_why: '' },
        issues: [], calls: [], events: [], emails: [], has_more_events: false });
    }
    if (url.pathname === '/api/auth/access/') return json({ id: 1, email: 'operator@example.org', access: {}, groups: [] });
    return json({});
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/dashboard/call-centre?view=operator&section=${section}`);
  await expect(page.getByLabel('Ticket order', { exact: true }), `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return writes;
}

const rowIds = (page: Page) => page.locator('[data-sheet-row]').evaluateAll(rows => rows.map(row => Number(row.getAttribute('data-sheet-row'))));

test.describe('London times on a Cairo computer', () => {
  test.use({ timezoneId: 'Africa/Cairo' });

  for (const [instant, expected] of [
    ['2026-10-20T12:00:00Z', '20/10/2026, 13:00:00'],
    ['2026-12-20T12:00:00Z', '20/12/2026, 12:00:00'],
  ]) {
    test(`sync display follows London daylight saving for ${instant}`, async ({ page }) => {
      await openSheet(page, [ticket(1)], 'missed', instant);
      await expect(page.getByText('All times: London', { exact: true })).toBeVisible();
      await expect(page.getByText(/Last successful cycle:/)).toContainText(`Last successful cycle: ${expected} (London)`);
      const displayed = await page.evaluate(async () => {
        const path = '/src/pages/call-centre/engagement/model.ts';
        const { longDate, shortDate, when, londonInput } = await import(path);
        return {
          day: longDate('2026-10-20T00:30'),
          short: shortDate('2026-10-20T00:30'),
          time: when('2026-10-20T00:30'),
          saved: londonInput('2026-10-20T00:30').toISOString(),
        };
      });
      expect(displayed).toEqual({
        day: '20 Oct 2026', short: '20 Oct', time: '20/10/2026, 00:30:00',
        saved: '2026-10-19T23:30:00.000Z',
      });
    });
  }
});

test('oldest/newest uses issue dates, chooses the matching ticket per contact, and preserves priority', async ({ page }) => {
  const writes = await openSheet(page, [
    ticket(1, { issue_date: '2026-09-20' }),
    ticket(2, { issue_date: '2026-09-10', source_type: 'mcm_missed', issue_name: 'Monthly review' }),
    ticket(3, { issue_date: '2026-09-30', source_type: 'pr_missed', issue_name: 'Progress review' }),
    ticket(4, { learner_email: 'learner1@example.org', learner_name: 'Learner 1', issue_date: '2026-09-01' }),
  ]);
  expect(await rowIds(page)).toEqual([1, 2, 3]);
  await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  expect(await rowIds(page)).toEqual([4, 2, 3]);
  await expect(page.locator('.ed-sheet-count')).toContainText('Oldest first');
  await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  expect(await rowIds(page)).toEqual([3, 1, 2]);
  await page.getByLabel('Ticket order', { exact: true }).selectOption('priority');
  expect(await rowIds(page)).toEqual([1, 2, 3]);
  expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
});

test('every missed-ticket type and other tickets display source and opened dates', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openSheet(page, [
    ticket(1),
    ticket(2, { source_type: 'mcm_missed', issue_date: '2026-09-12' }),
    ticket(3, { source_type: 'pr_missed', issue_date: '2026-09-13' }),
    ticket(4, { source_type: 'signature', issue_date: '2026-09-14' }),
    ticket(5, { learner_email: 'learner1@example.org', issue_date: '2026-09-02' }),
  ]);
  for (const [id, day] of [[1, 15], [2, 12], [3, 13], [4, 14]]) {
    const row = page.locator(`[data-sheet-row="${id}"]`);
    await expect(row.getByText(`${id === 1 ? 'Missed lecture date' : 'Issue date'}: ${day} Sept 2026`, { exact: true })).toBeVisible();
    await expect(row.getByText('Ticket opened: 1 Oct 2026', { exact: true }).first()).toBeVisible();
  }
  await page.getByText('Other matching tickets (1)', { exact: true }).click();
  await expect(page.locator('[data-related-ticket="5"]')).toContainText('Missed lecture date: 2 Sept 2026');
  await page.screenshot({ path: test.info().outputPath('ticket-dates.png'), fullPage: true });
  await page.locator('[data-sheet-row="2"]').getByRole('button', { name: 'Full case', exact: true }).click();
  await expect(page.locator('.ed-learner').getByText('Issue date: 12 Sept 2026', { exact: true })).toBeVisible();
  await expect(page.locator('.ed-learner').getByText('Ticket opened: 1 Oct 2026', { exact: true })).toBeVisible();
});

test('missed lecture shows London schedule separately from ticket dates, including missing and ambiguous times', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { issue_date: '2026-10-16', missed_lecture: {
      module: 'Commercial Intelligence', title: 'Commercial Intelligence lecture', date: '2026-10-16',
      starts_at: '2026-10-16T11:00:00Z', ends_at: '2026-10-16T13:00:00Z', time_status: 'matched',
    } }),
    ticket(2),
    ticket(3, { missed_lecture: {
      module: 'Test lecture', title: 'Test lecture', date: '2026-09-15',
      starts_at: null, ends_at: null, time_status: 'ambiguous',
    } }),
  ]);
  const first = page.locator('[data-sheet-row="1"]');
  await expect(first).toContainText('Missed lecture date: 16 Oct 2026');
  await expect(first).toContainText('Lecture time: 12:00–14:00 (London)');
  await expect(first).toContainText('Ticket opened: 1 Oct 2026');
  await expect(page.locator('[data-sheet-row="2"]')).toContainText('Lecture time: Not recorded in source');
  await expect(page.locator('[data-sheet-row="3"]')).toContainText('Multiple sessions — confirm in timetable');
  await first.getByRole('button', { name: 'Full case', exact: true }).click();
  await expect(page.locator('.ed-learner')).toContainText('Lecture time: 12:00–14:00 (London)');
});

test('changing order retains unsaved notes on their original ticket', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { issue_date: '2026-09-20' }),
    ticket(2, { learner_email: 'learner1@example.org', learner_name: 'Learner 1', issue_date: '2026-09-01' }),
    ticket(3, { issue_date: '2026-09-10' }),
  ]);
  await page.getByLabel('Notes and action for Learner 1').fill('Keep this agreed action on the original ticket.');
  await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  expect(await rowIds(page)).toEqual([3, 1]);
  await expect(page.locator('[data-sheet-row="1"] textarea')).toHaveValue('Keep this agreed action on the original ticket.');
  await expect(page.locator('[data-sheet-row="2"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  expect(await rowIds(page)).toEqual([2, 3]);
});

test('missing source dates are labelled and use opened date; undated tickets stay last', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { source_type: 'mcm', issue_date: null, created_at: '2026-09-03T12:00:00Z' }),
    ticket(2, { source_type: 'pr', issue_date: '2026-09-10' }),
    ticket(3, { source_type: 'epa', issue_date: null, created_at: '' }),
  ], 'due');
  const first = page.locator('[data-sheet-row="1"]');
  await expect(first).toContainText('Review due: Not recorded in source');
  await expect(first).toContainText('Ticket opened: 3 Sept 2026');
  await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  expect(await rowIds(page)).toEqual([1, 2, 3]);
  await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  expect(await rowIds(page)).toEqual([2, 1, 3]);
  await page.getByLabel('Filter call reason', { exact: true }).selectOption('mcm');
  expect(await rowIds(page)).toEqual([1]);
  await page.getByLabel('Search the call sheet').fill('no such learner');
  await expect(page.getByText('No calls in this view', { exact: true })).toBeVisible();
});

test('appointment tickets retain their actual dates without inventing issue dates', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { source_type: 'reminder', issue_date: null, booking_at: '2026-10-21T09:30:00Z' }),
  ], 'nextday');
  await expect(page.locator('[data-sheet-row="1"]')).toContainText('Appointment: 21/10/2026, 10:30:00 (London)');
  await expect(page.locator('[data-sheet-row="1"]')).toContainText('Ticket opened: 1 Oct 2026');
  await expect(page.locator('[data-sheet-row="1"]')).not.toContainText('Issue date:');
});

test('date ordering handles invalid legacy dates, appointment fallback, timestamps and stable ties', () => {
  const cases = [
    ticket(1, { issue_date: 'invalid', booking_at: '2026-09-02T09:00:00Z' }),
    ticket(2, { issue_date: null, created_at: '2026-09-02T08:00:00Z' }),
    ticket(3, { issue_date: '2026-09-01' }),
    ticket(4, { issue_date: '2026-09-01' }),
    ticket(5, { issue_date: null, booking_at: null, created_at: '' }),
  ];
  expect(orderTickets(cases, 'oldest').map(c => c.id)).toEqual([3, 4, 2, 1, 5]);
  expect(orderTickets(cases, 'newest').map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
  expect(cases.map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
});

for (const section of ['missed', 'due']) {
  test(`${section} paginates twenty contacts and retains notes across pages and filters`, async ({ page }) => {
    const cases = Array.from({ length: 45 }, (_, index) => ticket(index + 1, {
      source_type: section === 'due' ? 'pr' : 'attendance',
      issue_date: `2026-09-${String(index % 28 + 1).padStart(2, '0')}`,
    }));
    await openSheet(page, cases, section);
    await expect(page.locator('[data-sheet-row]')).toHaveCount(20);
    await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
    await page.getByLabel('Notes and action for Learner 1', { exact: true }).fill('Keep the agreed follow-up while moving between pages.');
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    expect((await rowIds(page))[0]).toBe(21);
    await expect(page.locator('[data-sheet-row]')).toHaveCount(20);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.locator('[data-sheet-row]')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    await page.getByLabel('Ticket page', { exact: true }).selectOption('1');
    await expect(page.getByLabel('Notes and action for Learner 1', { exact: true })).toHaveValue('Keep the agreed follow-up while moving between pages.');
    await page.getByLabel('Ticket page', { exact: true }).selectOption('3');
    await page.getByLabel('Search the call sheet').fill('Learner 45');
    await expect(page.getByLabel('Ticket page', { exact: true })).toHaveValue('1');
    expect(await rowIds(page)).toEqual([45]);
    await page.getByLabel('Search the call sheet').fill('');
    await page.getByLabel('Ticket page', { exact: true }).selectOption('3');
    await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
    await expect(page.getByLabel('Ticket page', { exact: true })).toHaveValue('1');
    await expect(page.locator('[data-sheet-row]')).toHaveCount(20);
    expect((await rowIds(page))[0]).toBe(28);
  });
}

test('Due shows review deadlines, EPA programme and gateway dates, and call dates', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { source_type: 'pr', issue_date: '2026-09-15' }),
    ticket(2, { source_type: 'mcm', issue_date: '2026-09-16' }),
    ticket(3, { source_type: 'epa', issue_date: '2026-09-07', programme_end_date: '2026-08-31',
      gateway_review_date: null, next_followup_at: '2026-10-22T09:00:00Z' }),
  ], 'due');
  await expect(page.locator('[data-sheet-row="1"]')).toContainText('Review due: 15 Sept 2026');
  await expect(page.locator('[data-sheet-row="2"]')).toContainText('Review due: 16 Sept 2026');
  const epa = page.locator('[data-sheet-row="3"]');
  await expect(epa).toContainText('Programme end: 31 Aug 2026');
  await expect(epa).toContainText('Gateway review: Not recorded');
  await expect(epa).toContainText('EPA follow-up from: 7 Sept 2026');
  await expect(epa).toContainText('Call due by: 20 Sept 2026');
  await expect(epa).toContainText('Next follow-up: 22/10/2026, 10:00:00 (London)');
  await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  expect(await rowIds(page)).toEqual([3, 1, 2]);
  await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  expect(await rowIds(page)).toEqual([2, 1, 3]);
});

test('dashboard link stays available and the one-step back button is removed', async ({ page }) => {
  await openSheet(page, [ticket(1), ticket(2, { source_type: 'pr' })]);
  await expect(page.getByRole('button', { name: 'Go back one step', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Due (1)', exact: true }).click();
  await expect(page).toHaveURL(/section=due/);
  await page.getByRole('link', { name: 'Back to dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('catch-up booking opens outside the email preview and keeps the draft without sending', async ({ page, context }) => {
  const writes = await openSheet(page, [ticket(1, { booking_email: true })]);
  const bookingUrl = 'https://booking.example.test/catch-up';
  await context.route('https://booking.example.test/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<html><body><h1 id="calendar">Loading</h1><script>document.getElementById("calendar").textContent="Booking calendar ready";</script></body></html>',
  }));
  await page.route('**/api/callcentre/tickets/1/booking-email/', route => route.fulfill({ json: {
    recipient: 'learner1@example.org', subject: 'Catch-up booking', message: 'Choose a time with your coach.',
    text: 'Booking link', html: `<html><body><a href="${bookingUrl}" target="_blank" rel="noopener noreferrer">Book your catch-up session</a></body></html>`,
    link: { label: 'Book your catch-up session', url: bookingUrl }, mode: 'dry_run', checks: [],
  } }));
  await page.getByRole('button', { name: 'Booking email', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Subject', { exact: true })).toHaveValue('Catch-up booking');
  const popupPromise = page.waitForEvent('popup');
  await page.frameLocator('iframe[title="Email preview"]').getByRole('link', { name: 'Book your catch-up session', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Booking calendar ready' })).toBeVisible();
  await popup.close();
  await page.bringToFront();
  await expect(dialog.getByLabel('Message')).toHaveValue('Choose a time with your coach.');
  await expect(page.frameLocator('iframe[title="Email preview"]').getByRole('link')).toBeVisible();
  const directPromise = page.waitForEvent('popup');
  await dialog.getByRole('link', { name: 'Book your catch-up session ↗', exact: true }).click();
  const direct = await directPromise;
  await expect(direct.getByRole('heading', { name: 'Booking calendar ready' })).toBeVisible();
  await direct.close();
  expect(writes.filter(path => path.endsWith('/send/') || path.endsWith('/booking/'))).toEqual([]);
});

for (const section of ['missed', 'due']) {
  test(`${section} filters a day or inclusive date range and combines with sorting, search and pagination`, async ({ page }) => {
    const cases = Array.from({ length: 25 }, (_, index) => ticket(index + 1, {
      source_type: section === 'due' ? 'pr' : 'attendance',
      issue_date: index === 0 ? '2026-09-10' : index >= 20 && index <= 22 ? `2026-09-${index - 9}` : '2026-09-01',
    }));
    const writes = await openSheet(page, cases, section);
    await page.getByLabel('Notes and action for Learner 1', { exact: true }).fill('Keep this note when filtering by date.');
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByLabel('Date filter', { exact: true }).selectOption('day');
    await page.getByLabel('Ticket date', { exact: true }).fill('2026-09-11');
    await expect(page.getByLabel('Ticket page', { exact: true })).toHaveValue('1');
    expect(await rowIds(page)).toEqual([21]);
    await page.getByLabel('Date filter', { exact: true }).selectOption('range');
    await page.getByLabel('From date', { exact: true }).fill('2026-09-10');
    await page.getByLabel('To date', { exact: true }).fill('2026-09-12');
    expect(await rowIds(page)).toEqual([1, 21, 22]);
    await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
    expect(await rowIds(page)).toEqual([22, 21, 1]);
    await page.getByLabel('Search the call sheet').fill('Learner 21');
    expect(await rowIds(page)).toEqual([21]);
    await page.getByLabel('Search the call sheet').fill('');
    await page.getByLabel('To date', { exact: true }).fill('2026-09-09');
    await expect(page.getByText('The end date must be on or after the start date.', { exact: true })).toBeVisible();
    await expect(page.locator('[data-sheet-row]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
    await expect(page.getByLabel('Date filter', { exact: true })).toHaveValue('all');
    await expect(page.locator('[data-sheet-row]')).toHaveCount(20);
    await expect(page.getByLabel('Notes and action for Learner 1', { exact: true })).toHaveValue('Keep this note when filtering by date.');
    expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
  });
}

test('day filtering selects a matching secondary ticket and uses UK dates for the opened-date fallback', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { issue_date: '2026-09-01' }),
    ticket(2, { learner_email: 'learner1@example.org', learner_name: 'Learner 1', issue_date: '2026-09-11' }),
    ticket(3, { issue_date: null, created_at: '2026-09-10T23:30:00Z' }),
    ticket(4, { issue_date: null, created_at: '' }),
  ]);
  await page.getByLabel('Date filter', { exact: true }).selectOption('day');
  await page.getByLabel('Ticket date', { exact: true }).fill('2026-09-11');
  expect(await rowIds(page)).toEqual([2, 3]);
  await page.getByLabel('Ticket date', { exact: true }).fill('2026-12-01');
  await expect(page.getByText('No tickets match these filters. Try another date, call reason or search.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  expect(await rowIds(page)).toEqual([1, 3, 4]);
});

test('date boundaries include the whole UK day, support one-sided ranges and exclude unknown dates', () => {
  const start = ticket(1, { issue_date: null, booking_at: '2026-09-10T23:00:00Z' });
  const end = ticket(2, { issue_date: null, created_at: '2026-09-11T22:59:59Z' });
  const next = ticket(3, { issue_date: null, created_at: '2026-09-11T23:00:00Z' });
  expect(matchesTicketDate(start, '2026-09-11', '2026-09-11')).toBe(true);
  expect(matchesTicketDate(end, '2026-09-11', '2026-09-11')).toBe(true);
  expect(matchesTicketDate(next, '2026-09-11', '2026-09-11')).toBe(false);
  expect(matchesTicketDate(next, '2026-09-11', '')).toBe(true);
  expect(matchesTicketDate(start, '', '2026-09-11')).toBe(true);
  expect(matchesTicketDate(start, '2026-09-12', '2026-09-11')).toBe(false);
  const unknown = ticket(4, { issue_date: null, created_at: 'invalid' });
  expect(matchesTicketDate(unknown)).toBe(true);
  expect(matchesTicketDate(unknown, '2026-09-11', '')).toBe(false);
});

test('full case closes to the same thirteenth row, page, filters and unsaved notes', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const writes = await openSheet(page, Array.from({ length: 45 }, (_, index) => ticket(index + 1)));
  await page.getByLabel('Search the call sheet').fill('Learner');
  await page.getByLabel('Filter call reason', { exact: true }).selectOption('attendance');
  await page.getByLabel('Ticket order', { exact: true }).selectOption('newest');
  await page.getByLabel('Date filter', { exact: true }).selectOption('day');
  await page.getByLabel('Ticket date', { exact: true }).fill('2026-09-15');
  await page.getByLabel('Ticket page', { exact: true }).selectOption('2');
  const row = page.locator('[data-sheet-row="33"]');
  await row.getByLabel('Notes and action for Learner 33', { exact: true }).fill('Keep this note at row thirteen on page two.');
  const trigger = row.getByRole('button', { name: 'Full case', exact: true });
  await trigger.scrollIntoViewIfNeeded();
  const position = await page.locator('.ed-sheet-scroll').evaluate(element => ({ list: element.scrollTop, window: window.scrollY }));
  expect(position.list).toBeGreaterThan(0);
  const originalUrl = page.url();

  const verifyPosition = async () => {
    await expect(page.locator('dialog.ed-case-dialog')).not.toBeVisible();
    await expect(page).toHaveURL(originalUrl);
    await expect(page.getByLabel('Ticket page', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('Ticket order', { exact: true })).toHaveValue('newest');
    await expect(page.getByLabel('Search the call sheet')).toHaveValue('Learner');
    await expect(page.getByLabel('Filter call reason', { exact: true })).toHaveValue('attendance');
    await expect(page.getByLabel('Ticket date', { exact: true })).toHaveValue('2026-09-15');
    await expect(row.getByLabel('Notes and action for Learner 33', { exact: true })).toHaveValue('Keep this note at row thirteen on page two.');
    await expect.poll(() => page.locator('.ed-sheet-scroll').evaluate(element => element.scrollTop)).toBeCloseTo(position.list, 0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(position.window, 0);
    await expect(trigger).toBeFocused();
  };

  await trigger.click();
  const modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  await expect(modal.getByRole('heading', { name: 'Learner 33', exact: true })).toBeVisible();
  await expect(page.locator('[data-sheet-row="33"]')).toHaveCount(1);
  await modal.getByRole('heading', { name: 'Learner 33', exact: true }).click();
  await expect(modal).toBeVisible(); // A click inside the frame must not dismiss it.
  const closeButton = modal.getByRole('button', { name: 'Close full case', exact: true });
  expect(await closeButton.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(28);
  await page.screenshot({ path: test.info().outputPath('full-case-popup.png') });
  await closeButton.click();
  await verifyPosition();

  await trigger.click();
  await expect(modal).toBeVisible();
  await page.mouse.click(2, 2);
  await verifyPosition();

  await trigger.click();
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await verifyPosition();
  expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
});

test('closing a nested booking window keeps the full case open', async ({ page }) => {
  await openSheet(page, [ticket(1, { bookable: ['catch-up'] })]);
  await page.route('**/api/callcentre/tickets/1/booking/**', route => route.fulfill({ json: {
    coach: { name: 'Test Coach', email: 'coach@example.org' },
    learner: { name: 'Learner 1', email: 'learner1@example.org' },
    types: [{ key: 'catch-up', label: 'Catch-up session' }], lecture: null, reasons: [], slots: [],
  } }));
  await page.locator('[data-sheet-row="1"]').getByRole('button', { name: 'Full case', exact: true }).click();
  const modal = page.locator('dialog.ed-case-dialog');
  await modal.getByRole('button', { name: 'Book with coach', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await page.locator('dialog[open]').last().getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Learner 1', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Close full case', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
