import { expect, test, type Page } from '@playwright/test';
import type { Overview, OverviewCase } from '../../src/pages/call-centre/api';

const today = new Date().toISOString().slice(0, 10);
const past = new Date(Date.now() - 86400000).toISOString();
const future = new Date(Date.now() + 86400000).toISOString();

function sample(id: number, fields: Partial<OverviewCase> = {}): OverviewCase {
  return {
    id, source_type: 'learner_satisfaction', source_id: null, learner_email: `learner${id}@example.org`,
    learner_name: `Learner ${id}`, learner_phone: '', coach: 'Coach One', organisation: 'Company', programme: 'Programme',
    manager_name: 'Manager One', manager_email: 'manager@example.org', programme_status: 'Active',
    issue_name: 'Learner satisfaction', issue_date: null, status: 'new', risk: 'amber',
    claimed_by: null, claimed_agent_id: null, last_actor: 'System', last_action_at: past, attempts: 0,
    next_followup_at: null, due_at: past, sla_breached: false, sla_days_overdue: 0, learner_days_overdue: 0, misses: 0,
    booking_at: null, ai_summary: '', ai_confidence: null, resolution_option: '', resolved_at: null, resolved_by: '',
    archived: false, escalated: false, created_at: past, purpose: '', requested_by: '', promised_at: null,
    promise_missed: false, promises: {}, specialist_closes: false, missed_call: false,
    bookable: [], booking_links: {}, allocated_agent_id: null, followup_agent_id: null, ...fields,
  };
}

async function mockDesk(page: Page, agentId = 1, suppliedCases?: OverviewCase[]) {
  await page.addInitScript(() => {
    localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1, email: 'operator@example.org', username: 'operator', displayName: 'Operator',
      groups: [], access: {}, loggedInAt: new Date().toISOString(),
    }));
  });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let cases = suppliedCases || [sample(1), sample(2, { next_followup_at: future }), sample(3, {
    source_type: 'employer_feedback', learner_name: 'Manager One', learner_email: 'wrong-fallback@example.org',
    learner_phone: '+447700900123', employer_learners: [
      { name: 'Student Alpha', email: 'alpha@example.org', programme: 'Marketing' },
      { name: 'Student Beta', email: 'beta@example.org', programme: 'Management' },
    ],
  })];
  const posts: { path: string; data: Record<string, unknown> }[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue(); // Vite also serves /src/api/*.ts modules.
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (request.method() === 'POST') posts.push({ path, data: request.postDataJSON() });
    if (path === '/api/callcentre/config/') return json({ csrf_token: 'test-token', agent_id: agentId, is_manager: false,
      is_superuser: false, email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
    if (path === '/api/callcentre/overview/') {
      const overview: Overview = {
        today, next_workday: future.slice(0, 10), month: today.slice(0, 7), generated_at: new Date().toISOString(),
        access: { role: 'operator', agent_id: agentId, is_superuser: false, display_name: 'Operator', email: 'operator@example.org' },
        agents: [{ id: agentId, display_name: agentId === 1 ? 'Alice' : 'Liza', zoom_account: 'student', zoom_phone_number: '', target_seconds: 10800,
          today: { attempts: 0, connected: 0, seconds: 0 }, month: { attempts: 0, connected: 0, seconds: 0,
            resolved: 0, pending: 0, sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases, cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: null, connections: { calling: true, email_mode: 'dry_run', ai: false },
      };
      return json(overview);
    }
    if (path === '/api/callcentre/tickets/1/complete_feedback/') {
      cases = cases.filter(c => c.id !== 1);
      return json({ ok: true });
    }
    if (path.endsWith('/satisfaction-email/')) {
      const employer = path.includes('/3/');
      const recipient = employer ? 'manager@example.org' : 'learner1@example.org';
      if (request.method() === 'POST') return json({ id: 1, status: 'accepted', recipient, error: '' });
      return json({ recipient, sender: 'no-reply@example.org', name: 'Test Contact', subject: 'Feedback request',
        message: 'Please contact your coach with feedback.', can_send: true, reason: '' });
    }
    if (path === '/api/auth/access/') return json({ id: 1, email: 'operator@example.org', access: {}, groups: [] });
    return json({}); // No request in these UI tests reaches a real backend or mail provider.
  });
  await page.goto('/dashboard/call-centre?view=operator&section=learner_satisfaction');
  await expect(page.getByRole('heading', { name: 'Learner Satisfaction', exact: true }),
    `Browser errors: ${pageErrors.join('; ')}`).toBeVisible();
  return posts;
}

test('counts only due open reviews and keeps contacts with no phone', async ({ page }) => {
  await mockDesk(page);
  await expect(page.getByRole('button', { name: 'Learner Satisfaction (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Call Learner 1', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeEnabled();
  await expect(page.locator('[data-sheet-row="2"]')).toHaveCount(0);
  await page.getByLabel('Follow-up timing').selectOption('all');
  await expect(page.locator('[data-sheet-row="2"]')).toBeVisible();
});

for (const agentId of [1, 2]) {
  test(`specialist ${agentId} sees only their allocated contacts and shared queue`, async ({ page }) => {
    await mockDesk(page, agentId, [sample(1, { allocated_agent_id: 1 }),
      sample(2, { allocated_agent_id: 2 }), sample(4)]);
    await expect(page.getByRole('button', { name: 'Learner Satisfaction (2)', exact: true })).toBeVisible();
    await expect(page.locator(`[data-sheet-row="${agentId}"]`)).toBeVisible();
    await expect(page.locator('[data-sheet-row="4"]')).toBeVisible();
    await expect(page.locator(`[data-sheet-row="${agentId === 1 ? 2 : 1}"]`)).toHaveCount(0);
    await expect(page.getByText('Synchronization is overdue or has not completed.', { exact: false })).toBeVisible();
  });
}

test('learner email drafts use the right contact and only send on explicit click', async ({ page }) => {
  const posts = await mockDesk(page);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('To', { exact: true })).toHaveValue('learner1@example.org');
  await expect(dialog.getByRole('button', { name: 'Send via Azure', exact: true })).toBeEnabled();
  expect(posts.filter(post => post.path.startsWith('/api/callcentre/'))).toEqual([]);
  await dialog.getByRole('button', { name: 'Send via Azure', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Accepted by Microsoft 365 for learner1@example.org');
  await expect(dialog.getByRole('button', { name: 'Request recorded', exact: true })).toBeDisabled();
  expect(posts.filter(post => post.path.endsWith('/satisfaction-email/'))).toHaveLength(1);
  expect(posts.at(-1)?.data).toMatchObject({ agent_id: 1, subject: 'Feedback request' });
  expect(posts.at(-1)?.data.request_id).toBeTruthy();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  // Employer feedback uses the manager email from the employer case.
  await page.getByRole('button', { name: 'Employer Satisfaction (1)', exact: true }).click();
  const employerRow = page.locator('[data-sheet-row="3"]');
  await expect(employerRow).toBeVisible();
  await employerRow.getByRole('button', { name: 'Email', exact: true }).click();
  const employerDialog = page.getByRole('dialog');
  await expect(employerDialog).toHaveRole('dialog');
  await expect(employerDialog.getByRole('heading', { name: 'Employer satisfaction email', exact: true })).toBeVisible();
  await expect(employerDialog.getByLabel('To', { exact: true })).toHaveValue('manager@example.org');
  await employerDialog.getByRole('button', { name: 'Send via Azure', exact: true }).click();
  await expect(employerDialog.getByRole('status')).toContainText('Accepted by Microsoft 365 for manager@example.org');
  expect(posts.filter(post => post.path.endsWith('/satisfaction-email/'))).toHaveLength(2);
  expect(posts.at(-1)?.data).toMatchObject({ agent_id: 1 });
});

test('a network retry reuses the same request ID and does not complete feedback', async ({ page }) => {
  await mockDesk(page);
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/callcentre/tickets/1/satisfaction-email/', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) return route.abort('failed');
    return route.fulfill({ json: { id: 9, status: 'accepted', recipient: 'learner1@example.org', error: '' } });
  });
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Send via Azure', exact: true }).click();
  await dialog.getByRole('button', { name: 'Check / retry request', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Accepted by Microsoft 365');
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  await expect(page.getByRole('button', { name: 'Learner Satisfaction (1)', exact: true })).toBeVisible();
});

test('completion records rating, issue and agreed action then refreshes the count', async ({ page }) => {
  const posts = await mockDesk(page);
  await page.getByRole('button', { name: 'Complete feedback', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Satisfaction score').selectOption('4');
  await dialog.getByLabel('Learner feedback', { exact: true }).fill('Happy with the teaching and support.');
  await dialog.getByLabel('Issue raised', { exact: false }).fill('None');
  await dialog.getByLabel('Agreed action', { exact: false }).fill('No action needed');
  await dialog.getByRole('button', { name: 'Complete review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Learner Satisfaction (0)', exact: true })).toBeVisible();
  expect(posts.find(post => post.path.endsWith('/complete_feedback/'))?.data).toMatchObject({
    score: 4, problem: 'None', agreed_action: 'No action needed', agent_id: 1,
  });
});

test('employer row lists each learner and permits calling a recorded number', async ({ page }) => {
  const posts = await mockDesk(page);
  await page.getByRole('button', { name: 'Employer Satisfaction (1)', exact: true }).click();
  const row = page.locator('[data-sheet-row="3"]');
  await row.getByText('2 learners · Company', { exact: true }).click();
  await expect(row.getByText('Student Alpha · Marketing', { exact: true })).toBeVisible();
  await expect(row.getByText('Student Beta · Management', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Call Manager One', exact: true })).toBeEnabled();
  expect(posts.filter(post => post.path.startsWith('/api/callcentre/'))).toEqual([]);
});
