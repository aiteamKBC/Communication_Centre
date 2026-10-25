import { expect, test, type Page } from '@playwright/test';
import type { Overview, OverviewCase } from '../../src/pages/call-centre/api';
import { matchesTicketDate, orderTickets } from '../../src/pages/call-centre/engagement/ticketOrder';
import { contactKey } from '../../src/pages/call-centre/engagement/model';

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
    bookable: [], booking_email: false, booking_links: {}, allocated_agent_id: null, followup_agent_id: null, ...fields,
  };
}

async function openSheet(page: Page, cases: OverviewCase[], section = 'missed', lastSync: string | null = null, extra: Partial<Overview> = {}) {
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
        connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null, ...extra,
      };
      return json(overview);
    }
    const detail = url.pathname.match(/^\/api\/callcentre\/tickets\/(\d+)\/$/);
    if (detail) {
      const selected = cases.find(c => c.id === Number(detail[1]));
      return json({ ticket: { ...selected, source_data: {}, priority_why: '' },
        issues: cases.filter(c => selected && c.status !== 'resolved' && contactKey(c) === contactKey(selected)),
        calls: [], events: [], emails: [], has_more_events: false,
        held_feedback: (selected as { held_feedback?: unknown } | undefined)?.held_feedback ?? null });
    }
    if (url.pathname === '/api/auth/access/') return json({ id: 1, email: 'operator@example.org', access: {}, groups: [] });
    return json({});
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/dashboard/call-centre?view=operator&section=${section}`);
  // Today shows the next call; a list shows its sheet.
  await expect(['next', 'today'].includes(section) ? page.locator('.ed-next') : page.getByLabel('Ticket order', { exact: true }),
    `Browser errors: ${errors.join('; ')}`).toBeVisible();
  return writes;
}

const rowIds = (page: Page) => page.locator('[data-sheet-row]').evaluateAll(rows => rows.map(row => Number(row.getAttribute('data-sheet-row'))));

test('coach, cohort and module combine before contact grouping and preserve hidden drafts', async ({ page }) => {
  const fields = (coach: string, cohort: string, module: string): Partial<OverviewCase> => ({
    coach, module, filter_contexts: [{ coach, cohort, module }],
  });
  const cases = Array.from({ length: 25 }, (_, index) =>
    ticket(index + 1, fields('Coach A', 'Cohort 1', 'Marketing')));
  cases.push(ticket(30, { ...fields('Coach B', 'Cohort 2', 'Finance'),
    learner_email: 'learner1@example.org', learner_name: 'Learner 1' }));
  cases.push(ticket(31, fields('Coach B', 'Cohort 1', 'Finance')));
  cases.push(ticket(32, fields('', '', '')));
  const writes = await openSheet(page, cases);
  await page.getByLabel('Notes and action for Learner 1', { exact: true }).fill('Keep these notes on the Marketing ticket.');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach B' });
  expect(await rowIds(page)).toEqual([30, 31]);
  await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
  await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Finance' });
  expect(await rowIds(page)).toEqual([30]);
  await page.getByLabel('Search the call sheet').fill('nobody');
  expect(await rowIds(page)).toEqual([]);
  await page.getByLabel('Search the call sheet').fill('');
  await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Marketing' });
  expect(await rowIds(page)).toEqual([]);
  await page.getByRole('button', { name: 'Clear coach / cohort / module', exact: true }).click();
  await expect(page.locator('[data-sheet-row="1"] textarea')).toHaveValue('Keep these notes on the Marketing ticket.');
  await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Not recorded' });
  expect(await rowIds(page)).toEqual([32]);
  expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
});

for (const [section, source] of [
  ['due', 'pr'], ['nextday', 'reminder'], ['learner_satisfaction', 'learner_satisfaction'],
  ['employer_satisfaction', 'employer_feedback'], ['manager', 'manual'], ['tech', 'tech_support'],
]) {
  test(`${section} supports coach, cohort and module filters`, async ({ page }) => {
    await openSheet(page, [
      ticket(1, { source_type: source, booking_at: '2026-10-21T10:00:00Z',
        filter_contexts: [{ coach: 'Coach A', cohort: 'Cohort 1', module: 'Module A' }] }),
      ticket(2, { source_type: source, booking_at: '2026-10-21T10:00:00Z',
        filter_contexts: [{ coach: 'Coach B', cohort: 'Cohort 2', module: 'Module B' }] }),
    ], section);
    await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach B' });
    await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
    await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Module B' });
    expect(await rowIds(page)).toEqual([2]);
  });
}

test('employer filters must match the same learner', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { source_type: 'employer_feedback', filter_contexts: [
      { coach: 'Coach A', cohort: 'Cohort 1', module: '' },
      { coach: 'Coach B', cohort: 'Cohort 2', module: '' },
    ] }),
  ], 'employer_satisfaction');
  await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach A' });
  await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
  expect(await rowIds(page)).toEqual([]);
  await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 1' });
  expect(await rowIds(page)).toEqual([1]);
});

test('Next call and Follow-ups use the same filters and can recover from an empty result', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { learner_phone: '+447700900001', followup_agent_id: 1,
      filter_contexts: [{ coach: 'Coach A', cohort: 'Cohort 1', module: 'Marketing' }] }),
    ticket(2, { learner_phone: '+447700900002', followup_agent_id: 1,
      filter_contexts: [{ coach: 'Coach B', cohort: 'Cohort 2', module: 'Finance' }] }),
  ]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByText('Filter and order', { exact: true }).click();
  await expect(page.locator('.ed-next-name')).toBeVisible();
  await page.getByLabel('Filter by coach', { exact: true }).selectOption({ label: 'Coach B' });
  await expect(page.locator('.ed-next-name')).toHaveText('Learner 2');
  await page.getByLabel('Filter by module', { exact: true }).selectOption({ label: 'Marketing' });
  await expect(page.getByRole('heading', { name: 'Nobody else to call right now', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear coach / cohort / module', exact: true }).click();
  await expect(page.locator('.ed-next-name')).toHaveText('Learner 1');
  await page.getByRole('button', { name: /^Follow-ups: / }).click();
  await expect(page.locator('.ed-person').first()).toBeVisible();
  await page.getByLabel('Filter by cohort', { exact: true }).selectOption({ label: 'Cohort 2' });
  await expect(page.locator('.ed-person')).toHaveCount(1);
  await expect(page.locator('.ed-person')).toContainText('Learner 2');
});

test('Follow-ups lists only the follow-ups set by this specialist’s own calls', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { followup_agent_id: 1, next_followup_at: '2026-10-21T08:00:00Z' }),
    ticket(2, { followup_agent_id: 2, next_followup_at: '2026-10-21T08:00:00Z' }),
    ticket(3),
  ]);
  await page.getByRole('tab', { name: /^Follow-ups \(/ }).click();
  await expect(page.locator('.ed-person')).toHaveCount(1);
  await expect(page.locator('.ed-person')).toContainText('Learner 1');
  await expect(page.getByText('1 people with your follow-ups', { exact: true })).toBeVisible();
});

test('one learner opens lectures, MCM, PR and other cases across filters without losing drafts', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const person = { learner_email: 'same@example.org', learner_name: 'Same Learner', learner_phone: '+447700900123' };
  const cases = [
    ticket(1, { ...person, issue_name: 'Risk management' }),
    ticket(2, { ...person, issue_name: 'Risk management', issue_date: '2026-09-01' }),
    ticket(3, { ...person, source_type: 'mcm', issue_name: 'Monthly coaching', issue_date: '2026-10-01' }),
    ticket(4, { ...person, source_type: 'pr', issue_name: 'Progress review', issue_date: '2026-10-05' }),
    ticket(5, { ...person, source_type: 'epa', issue_name: 'EPA preparation' }),
    ticket(6, { ...person, source_type: 'employer_feedback', learner_name: 'Same person as employer' }),
    ticket(7, { learner_name: 'Another learner' }),
  ];
  const writes = await openSheet(page, cases);
  await page.getByLabel('Date filter', { exact: true }).selectOption('day');
  await page.getByLabel('Ticket date', { exact: true }).fill('2026-09-15');
  const row = page.locator('[data-sheet-row="1"]');
  await row.getByRole('button', { name: 'All cases (5)', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  const list = modal.getByRole('region', { name: 'All cases for this contact' });
  await expect(list.getByRole('heading', { name: 'All cases (5)', exact: true })).toBeVisible();
  await expect(list.locator('[data-contact-case]')).toHaveCount(5);
  await expect(list).toContainText('Lectures · Risk management');
  await expect(list).toContainText('Monthly coaching (MCM)');
  await expect(list).toContainText('Progress reviews (PR)');
  await expect(list.locator('[data-contact-case="2"]')).toContainText('1 Sept 2026');
  await expect(list.locator('[data-contact-case="6"]')).toHaveCount(0);
  await expect(list.locator('[data-contact-case="7"]')).toHaveCount(0);
  // Every case is on the same page, one under another, with no form of its own: the call is recorded once, at the top.
  await expect(modal.locator('.ed-case-section')).toHaveCount(5);
  await expect(modal.getByRole('button', { name: 'Save next step', exact: true })).toHaveCount(0);
  await list.locator('[data-contact-case="4"]').click();
  await expect(modal.getByText('Review due: 5 Oct 2026', { exact: true })).toBeInViewport();
  await expect(list.locator('[data-contact-case="4"]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('all-learner-cases.png') });
  // One dial request covers the learner; switching cases must not place another call.
  await modal.getByRole('button', { name: '📞 Call', exact: true }).click();
  await expect(modal.getByRole('heading', { name: /^Record this call/ })).toBeVisible();
  await list.locator('[data-contact-case="4"]').click();
  expect(writes.filter(path => path.endsWith('/call/'))).toEqual(['/api/callcentre/tickets/1/call/']);
  await modal.getByRole('button', { name: 'Close full case', exact: true }).click();
  await expect(page.getByLabel('Ticket date', { exact: true })).toHaveValue('2026-09-15');
  await page.getByRole('tab', { name: 'Due (1)', exact: true }).click();
  await expect(page.locator('[data-sheet-row]')).toHaveCount(1);
  await page.getByRole('button', { name: 'All cases (5)', exact: true }).click();
  await expect(page.locator('[data-contact-case]')).toHaveCount(5);
});

test('all cases includes server-only issues and fits a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  const first = ticket(1);
  const extra = ticket(2, { learner_email: first.learner_email, source_type: 'mcm', issue_name: 'Monthly coaching' });
  await openSheet(page, [first]);
  await page.route(/\/api\/callcentre\/tickets\/[12]\/(\?.*)?$/, route => route.fulfill({ json: {
    ticket: { ...(route.request().url().includes('/tickets/2/') ? extra : first), source_data: {}, priority_why: '' }, issues: [first, extra],
    calls: [], events: [], emails: [], has_more_events: false,
  } }));
  await page.getByRole('button', { name: 'All cases (1)', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  await expect(modal.locator('[data-contact-case]')).toHaveCount(2);
  await expect(modal.locator('[data-contact-case="2"]')).toContainText('Monthly coaching');
  expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(modal.getByRole('button', { name: 'Close full case', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('all-cases-mobile.png') });
});

test.describe('London times on a Cairo computer', () => {
  test.use({ timezoneId: 'Africa/Cairo' });

  for (const [instant, expected] of [
    ['2026-10-20T12:00:00Z', '20/10/2026, 13:00:00'],
    ['2026-12-20T12:00:00Z', '20/12/2026, 12:00:00'],
  ]) {
    test(`sync display follows London daylight saving for ${instant}`, async ({ page }) => {
      await openSheet(page, [ticket(1)], 'missed', instant);
      await expect(page.getByText('All times: London', { exact: true })).toBeVisible();
      await expect(page.getByText(/Lists last updated/)).toContainText(`Lists last updated ${expected} (London)`);
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
  await expect(page.getByLabel('Ticket order', { exact: true })).toHaveValue('newest');
  expect(await rowIds(page)).toEqual([3, 1, 2]);
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
    await page.getByLabel('Ticket order', { exact: true }).selectOption('priority');
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
  await page.getByRole('tab', { name: 'Due (1)', exact: true }).click();
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

test('a due review opens the coach’s booking page for that review, and only when the coach has one', async ({ page, context }) => {
  const links = { pr: 'https://booking.example.test/pr', mcm: 'https://booking.example.test/mcm', support: 'https://booking.example.test/support' };
  const writes = await openSheet(page, [
    ticket(1, { source_type: 'pr', booking_email: true, booking_links: links }),
    ticket(2, { source_type: 'mcm', booking_email: true, booking_links: links }),
    ticket(3, { source_type: 'pr', booking_email: true, booking_links: { support: links.support } }),
  ], 'due');
  await context.route('https://booking.example.test/**', route => route.fulfill({
    contentType: 'text/html', body: `<html><body><h1>${new URL(route.request().url()).pathname}</h1></body></html>`,
  }));
  const button = (id: number) => page.locator(`[data-sheet-row="${id}"]`).getByRole('button', { name: 'Book on coach’s page', exact: true });
  for (const [id, path] of [[1, '/pr'], [2, '/mcm']] as const) {
    const popupPromise = page.waitForEvent('popup');
    await button(id).click();
    const popup = await popupPromise;
    await expect(popup.getByRole('heading', { name: path, exact: true })).toBeVisible();
    await popup.close();
  }
  await expect(button(3)).toHaveCount(0);
  expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
});

for (const section of ['missed', 'due']) {
  test(`${section} filters a day or inclusive date range and combines with sorting, search and pagination`, async ({ page }) => {
    const cases = Array.from({ length: 25 }, (_, index) => ticket(index + 1, {
      source_type: section === 'due' ? 'pr' : 'attendance',
      issue_date: index === 0 ? '2026-09-10' : index >= 20 && index <= 22 ? `2026-09-${index - 9}` : '2026-09-01',
    }));
    const writes = await openSheet(page, cases, section);
    await page.getByLabel('Ticket order', { exact: true }).selectOption('priority');
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
  await page.getByLabel('Ticket order', { exact: true }).selectOption('priority');
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

/** The JSON body of every write the page sent, by path. */
function capturePosts(page: Page) {
  const posts: [string, Record<string, unknown>][] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.startsWith('/api/callcentre/tickets/')) posts.push([path, request.postDataJSON() || {}]);
  });
  return posts;
}

test('Next call starts with the newest ticket by default', async ({ page }) => {
  await openSheet(page, [
    ticket(1, { learner_phone: '+447700900001', issue_date: '2026-09-01' }),
    ticket(2, { learner_phone: '+447700900002', issue_date: '2026-10-10' }),
  ]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByText('Filter and order', { exact: true }).click();
  await expect(page.getByLabel('Ticket order', { exact: true })).toHaveValue('newest');
  await expect(page.locator('.ed-next-name')).toHaveText('Learner 2');
  await page.getByLabel('Ticket order', { exact: true }).selectOption('oldest');
  await expect(page.locator('.ed-next-name')).toHaveText('Learner 1');
});

test('Next call: Call becomes End call, and only Save records the outcome', async ({ page }) => {
  await openSheet(page, [ticket(1, { learner_phone: '+447700900001' })]);
  const posts = capturePosts(page);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: '📞 Call', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End call', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'No answer', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'End call', exact: true }).click();
  await page.getByRole('button', { name: 'No answer', exact: true }).click();
  await page.getByLabel('Note (optional)').fill('No answer, voicemail left.');
  await page.getByRole('button', { name: 'Save and next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nobody else to call right now', exact: true })).toBeVisible();
  expect(posts.map(([path]) => path)).toEqual(['/api/callcentre/tickets/1/call/', '/api/callcentre/tickets/1/save_call/']);
  expect(posts[1][1]).toMatchObject({ items: [{ id: 1, outcome: 'no_answer' }], note: 'No answer, voicemail left.', agent_id: 1 });
});

test('call sheet: Call becomes End call and the outcome is held for the call just made', async ({ page }) => {
  await openSheet(page, [ticket(1, { learner_phone: '+447700900001' })]);
  const posts = capturePosts(page);
  // Zoom has not reported the call yet, so the server holds the outcome.
  await page.route('**/api/callcentre/tickets/1/plan/', route => route.fulfill({ json: { ok: true, applied: false } }));
  await page.getByRole('button', { name: 'Call Learner 1', exact: true }).click();
  await page.getByRole('button', { name: 'End call with Learner 1', exact: true }).click();
  await expect(page.getByLabel('Outcome for Learner 1', { exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Call Learner 1', exact: true })).toBeVisible();
  await page.getByLabel('Outcome for Learner 1', { exact: true }).selectOption('no_answer');
  await page.getByLabel('Notes and action for Learner 1', { exact: true }).fill('No answer, try tomorrow.');
  await page.locator('[data-sheet-row="1"]').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-sheet-row="1"] .ed-row-status')).toHaveText('Saved: applied when Zoom reports the call');
  expect(posts.map(([path]) => path)).toEqual(['/api/callcentre/tickets/1/call/', '/api/callcentre/tickets/1/plan/']);
  expect(posts[1][1]).toMatchObject({ outcome: 'no_answer', note: 'No answer, try tomorrow.' });
});

/** Ann: three missed lectures and an overdue progress review, all on one call. */
async function callAnn(page: Page) {
  const ann = { learner_email: 'ann@example.org', learner_name: 'Ann', learner_phone: '+447700900001' };
  await openSheet(page, [
    ticket(1, { ...ann, issue_date: '2026-09-15' }), ticket(2, { ...ann, issue_date: '2026-09-22' }), ticket(3, { ...ann, issue_date: '2026-09-29' }),
    ticket(4, { ...ann, source_type: 'pr', issue_name: 'Progress review', promises: { book_pr: null } }),
  ]);
  const saves: unknown[] = [];
  await page.route('**/api/callcentre/tickets/*/call/', route => route.fulfill({ json: { intent_id: 1, ticket_ids: [1, 2, 3, 4] } }));
  await page.route('**/api/callcentre/tickets/*/save_call/', route => {
    const data = route.request().postDataJSON();
    // Sent from the case the call started on, in ticket order; compared by case.
    saves.push({ ...data, items: [...data.items].sort((a: { id: number }, b: { id: number }) => a.id - b.id) });
    return route.fulfill({ json: { ok: true, applied: false } });
  });
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.ed-next-name')).toHaveText('Ann');
  await page.getByRole('button', { name: '📞 Call', exact: true }).click();
  await page.getByRole('button', { name: 'End call', exact: true }).click();
  return saves;
}

test('an unanswered call is saved for every case with one click', async ({ page }) => {
  const saves = await callAnn(page);
  await page.getByRole('button', { name: 'No answer', exact: true }).click();
  await expect(page.getByText('This is saved for all 4 cases.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /^Outcome for/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save and next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nobody else to call right now', exact: true })).toBeVisible();
  expect(saves).toEqual([{
    note: '', callback_at: null, agent_id: 1,
    items: [1, 2, 3, 4].map(id => ({ id, outcome: 'no_answer', option: '', note: '' })),
  }]);
});

test('an answered call groups the same kind of case into one row and saves every case together', async ({ page }) => {
  const saves = await callAnn(page);
  await page.getByRole('button', { name: 'Answered', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save and next', exact: true });
  await expect(page.getByText('0 of 4 recorded')).toBeVisible();
  // Three lectures, one row.
  await page.getByLabel('Outcome for all 3 Missed lecture cases', { exact: true })
    .selectOption({ label: 'Agreed: Book a catch-up session (within 7 days)' });
  await expect(page.getByText('1 case still needs an outcome.')).toBeVisible();
  await page.getByRole('combobox', { name: /^Outcome for Progress review/ }).selectOption({ label: 'Not discussed: keep it open' });
  await expect(page.getByText('4 of 4 recorded')).toBeVisible();
  // One lecture answered differently.
  await page.getByRole('button', { name: 'Answer each one', exact: true }).click();
  await page.getByRole('combobox', { name: /^Outcome for Missed lecture 29/ }).selectOption({ label: 'Refused or problem' });
  await save.click();
  expect(saves).toEqual([]);   // the shared note is required for an answered call
  await page.getByLabel('Notes / agreed action', { exact: true }).fill('Agreed two catch-ups; will not do the third.');
  await save.click();
  await expect(page.getByRole('heading', { name: 'Nobody else to call right now', exact: true })).toBeVisible();
  expect(saves).toEqual([{
    note: 'Agreed two catch-ups; will not do the third.', callback_at: null, agent_id: 1,
    items: [
      { id: 1, outcome: 'reached', option: 'catch_up_session', note: '' },
      { id: 2, outcome: 'reached', option: 'catch_up_session', note: '' },
      { id: 3, outcome: 'refused', option: '', note: '' },
      { id: 4, outcome: 'not_discussed', option: '', note: '' },
    ],
  }]);
});

test('Back and Next move through the learners to call', async ({ page }) => {
  await openSheet(page, [ticket(1, { learner_phone: '+447700900001' }), ticket(2, { learner_phone: '+447700900002' })]);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const back = page.getByRole('button', { name: 'Back', exact: true });
  const next = page.getByRole('button', { name: 'Next', exact: true });
  const first = await page.locator('.ed-next-name').textContent();
  await expect(page.getByText(/learner 1 of 2/)).toBeVisible();
  await expect(back).toBeDisabled();
  await next.click();
  await expect(page.getByText(/learner 2 of 2/)).toBeVisible();
  await expect(page.locator('.ed-next-name')).not.toHaveText(first || '');
  await expect(next).toBeDisabled();
  await back.click();
  await expect(page.locator('.ed-next-name')).toHaveText(first || '');
});

test('Full case calls the learner and records the call for every case at once, without waiting for Zoom', async ({ page }) => {
  const ann = { learner_email: 'ann@example.org', learner_name: 'Ann', learner_phone: '+447700900001' };
  const cases = [ticket(1, { ...ann }), ticket(2, { ...ann, source_type: 'reminder', issue_name: 'Progress review', promises: {}, specialist_closes: true })];
  await openSheet(page, cases);
  const saves: Record<string, unknown>[] = [];
  let open = false;
  // After Call the server reports the call as not saved yet, until it is.
  await page.route(/\/api\/callcentre\/tickets\/\d+\/(\?.*)?$/, route => {
    const selected = cases.find(c => c.id === Number(new URL(route.request().url()).pathname.split('/')[4]))!;
    return route.fulfill({ json: { ticket: { ...selected, source_data: {}, priority_why: '' }, issues: cases, calls: [], events: [],
      emails: [], has_more_events: false, open_call: open ? { ticket_ids: [1, 2] } : null } });
  });
  await page.route('**/api/callcentre/tickets/*/save_call/', route => {
    saves.push({ path: new URL(route.request().url()).pathname, ...route.request().postDataJSON() });
    open = false;
    return route.fulfill({ json: { ok: true, applied: false } });
  });
  await page.route('**/api/callcentre/tickets/*/call/', route => {
    open = true;
    return route.fulfill({ json: { intent_id: 1, ticket_ids: [1, 2] } });
  });
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Full case', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  // One call box for the learner; each case's own form is folded away under its other actions.
  await expect(modal.getByRole('heading', { name: 'Call · 2 cases', exact: true })).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Agree the next step', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Save next step', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Call learner', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: '📞 Call', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Record this call · 2 cases', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Answered', exact: true }).click();
  await modal.getByRole('combobox', { name: /^Outcome for Missed lecture/ }).selectOption({ label: 'Agreed: Book a catch-up session (within 7 days)' });
  await modal.getByRole('combobox', { name: /^Outcome for Tomorrow/ }).selectOption({ label: 'Done: resolve the case' });
  await modal.getByLabel('Notes / agreed action', { exact: true }).fill('Catch-up agreed; attending tomorrow.');
  await modal.getByRole('button', { name: 'Save the call', exact: true }).click();
  await expect(modal.getByRole('heading', { name: /^Record this call/ })).toHaveCount(0);
  expect(saves).toEqual([{ path: '/api/callcentre/tickets/1/save_call/', note: 'Catch-up agreed; attending tomorrow.', callback_at: null, agent_id: 1,
    items: [{ id: 1, outcome: 'reached', option: 'catch_up_session', note: '' }, { id: 2, outcome: 'resolve', option: '', note: '' }] }]);
});

test('an employer specialist calls employers only, and everyone else no employers', async ({ page }) => {
  const cases = [
    ticket(1, { learner_phone: '+447700900001' }),
    ticket(2, { source_type: 'employer_feedback', learner_name: 'Max Manager', learner_email: 'max@example.org',
      learner_phone: '+447700900002', promises: {} }),
  ];
  // The operator (agent 1) is the employer specialist: only the employer calls and their own records.
  await openSheet(page, cases, 'next', null, { employer_specialists: [1] });
  await expect(page.locator('.ed-next-name')).toHaveText('Max Manager');
  await expect(page.getByRole('button', { name: /^Employer Satisfaction: / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Missed: / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Due: / })).toHaveCount(0);
});

test('with someone else as the employer specialist, the employer calls leave this desk', async ({ page }) => {
  const cases = [
    ticket(1, { learner_phone: '+447700900001' }),
    ticket(2, { source_type: 'employer_feedback', learner_name: 'Max Manager', learner_email: 'max@example.org',
      learner_phone: '+447700900002', promises: {} }),
  ];
  await openSheet(page, cases, 'next', null, { employer_specialists: [2] });
  await expect(page.locator('.ed-next-name')).toHaveText('Learner 1');
  await expect(page.getByRole('button', { name: /^Employer Satisfaction: / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Call a learner', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Missed: / })).toBeVisible();
});

test('an employer specialist calls any learner, saves the call and gives their satisfaction feedback', async ({ page }) => {
  const optionalCall = ticket(5, { source_type: 'manual', learner_name: 'Ann Lee', learner_email: 'ann@example.org', learner_phone: '+447700900005',
    issue_name: 'Optional call', promises: {}, specialist_closes: true, optional: true, allocated_agent_id: 1 });
  await openSheet(page, [optionalCall], 'next', null, { employer_specialists: [1] });
  const posts: [string, Record<string, unknown>][] = [];
  await page.route(/\/api\/callcentre\/optional-calls\/(\?.*)?$/, route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { learners: [
        { email: 'ann@example.org', name: 'Ann Lee', phone: '+447700900005', programme: 'Marketing L3', organisation: 'Acme', coach: 'Coach A',
          manager: 'Max Manager', open_cases: 2, satisfaction: { due: true, last_completed_at: null, score: null, next_due_at: null } },
        { email: 'bob@example.org', name: 'Bob Jones', phone: '', programme: 'Finance', organisation: 'Beta', coach: 'Coach B',
          manager: '', open_cases: 0, satisfaction: null },
      ] } });
    }
    posts.push([new URL(route.request().url()).pathname, route.request().postDataJSON()]);
    return route.fulfill({ json: { intent_id: 1, ticket_ids: [5, 6], case_id: 5, satisfaction_case_id: 6 } });
  });
  await page.route('**/api/callcentre/tickets/*/save_call/', route => {
    posts.push([new URL(route.request().url()).pathname, route.request().postDataJSON()]);
    return route.fulfill({ json: { ok: true, applied: false } });
  });
  await page.route('**/api/callcentre/tickets/6/complete_feedback/', route => {
    posts.push([new URL(route.request().url()).pathname, route.request().postDataJSON()]);
    return route.fulfill({ json: { ok: true, held: true } });
  });
  await page.getByRole('button', { name: 'Call a learner', exact: true }).click();
  await page.getByLabel('Search learners', { exact: true }).fill('acme');
  await page.getByRole('button', { name: /^Ann Lee/ }).click();
  await expect(page.getByText('Satisfaction review due now.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '📞 Call', exact: true }).click();
  await page.getByRole('button', { name: 'No answer', exact: true }).click();
  await page.getByRole('button', { name: 'Save the call', exact: true }).click();
  await expect(page.getByText('Call saved.', { exact: true })).toBeVisible();
  // The learner's due review can be completed on the call; it counts once Zoom confirms the call was answered.
  await page.getByRole('combobox', { name: /^Satisfaction score/ }).selectOption('5');
  await page.getByLabel('Learner feedback', { exact: true }).fill('Very happy with the course so far.');
  await page.getByLabel(/^Issue raised/).fill('None');
  await page.getByLabel(/^Agreed action/).fill('No action needed');
  await page.getByRole('button', { name: 'Complete review', exact: true }).click();
  await expect(page.getByText('Satisfaction feedback saved.', { exact: true })).toBeVisible();
  expect(posts.map(([path]) => path)).toEqual(['/api/callcentre/optional-calls/', '/api/callcentre/tickets/5/save_call/',
    '/api/callcentre/tickets/6/complete_feedback/']);
  expect(posts[0][1]).toMatchObject({ learner_email: 'ann@example.org', agent_id: 1 });
  expect(posts[1][1]).toMatchObject({ items: [{ id: 5, outcome: 'no_answer' }] });
  expect(posts[2][1]).toMatchObject({ score: 5, problem: 'None' });
});

test('Full case shows satisfaction feedback already saved and waiting for Zoom, not an empty form', async ({ page }) => {
  const review = (id: number, state: 'held' | 'dropped') => ({
    ...ticket(id, { source_type: 'learner_satisfaction', learner_phone: `+44770090000${id}`, promises: {} }),
    held_feedback: { state, at: '2026-10-20T10:05:00Z', by: 'Operator',
      reason: state === 'dropped' ? 'Zoom did not report an answered call.' : '' },
  });
  await openSheet(page, [review(1, 'held'), review(2, 'dropped')], 'learner_satisfaction');
  await page.locator('[data-sheet-row="1"]').getByRole('button', { name: 'All cases (1)', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  await modal.getByText('Complete the satisfaction feedback', { exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Learner feedback saved', exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Complete review', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Change the feedback', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Complete review', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-sheet-row="2"]').getByRole('button', { name: 'All cases (1)', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Full case', exact: true });
  await modal.getByText('Complete the satisfaction feedback', { exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Zoom reported the call as not answered');
  await expect(modal.getByRole('button', { name: 'Complete review', exact: true })).toBeVisible();
});

test('End call asks the worker to fetch the call from Zoom straight away', async ({ page }) => {
  const writes = await openSheet(page, [ticket(1, { learner_phone: '+447700900001' })]);
  await page.locator('[data-sheet-row="1"]').getByRole('button', { name: 'Call Learner 1', exact: true }).click();
  expect(writes).not.toContain('/api/callcentre/call-sync/');
  await page.getByRole('button', { name: 'End call with Learner 1', exact: true }).click();
  await expect.poll(() => writes.filter(path => path === '/api/callcentre/call-sync/').length).toBe(1);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: '📞 Call', exact: true }).click();
  await page.getByRole('button', { name: 'End call', exact: true }).click();
  await expect.poll(() => writes.filter(path => path === '/api/callcentre/call-sync/').length).toBe(2);
});
