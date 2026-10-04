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
    bookable: [], booking_links: {}, allocated_agent_id: null, ...fields,
  };
}

async function mockDesk(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kbc-auth-user', JSON.stringify({
      id: 1, email: 'operator@example.org', username: 'operator', displayName: 'Operator',
      groups: [], access: {}, loggedInAt: new Date().toISOString(),
    }));
  });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let cases = [sample(1), sample(2, { next_followup_at: future }), sample(3, {
    source_type: 'satisfaction', learner_name: 'Manager One', learner_email: 'wrong-fallback@example.org',
  })];
  const posts: { path: string; data: Record<string, unknown> }[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue(); // Vite also serves /src/api/*.ts modules.
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (request.method() === 'POST') posts.push({ path, data: request.postDataJSON() });
    if (path === '/api/callcentre/config/') return json({ csrf_token: 'test-token', agent_id: 1, is_manager: false,
      is_superuser: false, email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
    if (path === '/api/callcentre/overview/') {
      const overview: Overview = {
        today, month: today.slice(0, 7), generated_at: new Date().toISOString(),
        access: { role: 'operator', agent_id: 1, is_superuser: false, display_name: 'Operator', email: 'operator@example.org' },
        agents: [{ id: 1, display_name: 'Operator', zoom_account: 'student', zoom_phone_number: '', target_seconds: 10800,
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

test('email drafts use the right contact and never send or queue', async ({ page }) => {
  const posts = await mockDesk(page);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('To', { exact: true })).toHaveValue('learner1@example.org');
  await expect(dialog.getByRole('button', { name: 'Send via Azure — not connected' })).toBeDisabled();
  await dialog.getByLabel('Message').fill('Draft feedback request');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Employer Satisfaction (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(dialog.getByLabel('To', { exact: true })).toHaveValue('manager@example.org');
  expect(posts.filter(post => post.path.startsWith('/api/callcentre/'))).toEqual([]);
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
