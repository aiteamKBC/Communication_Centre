import { expect, test, type Page } from '@playwright/test';
import type { MonthlyHistoryData } from '../../src/pages/call-centre/engagement/MonthlyHistory';

async function openHistory(page: Page, failSeptember = false) {
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
  const writes: string[] = [];
  const requests: URL[] = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(url.pathname);
    const json = (body: unknown) => route.fulfill({ json: body });
    if (url.pathname === '/api/callcentre/config/') {
      return json({ csrf_token: 'test', agent_id: 1, is_manager: false, is_superuser: false,
        email_mode: 'dry_run', ai_enabled: false, agents: [], sources: [], cycle: null });
    }
    if (url.pathname === '/api/callcentre/overview/') {
      return json({
        today: '2026-10-20', next_workday: '2026-10-21', holidays: [], month: '2026-10',
        generated_at: '2026-10-20T12:00:00Z',
        access: { role: 'operator', agent_id: 1, is_superuser: false, display_name: 'Operator', email: 'operator@example.org' },
        agents: [{ id: 1, display_name: 'Operator', zoom_account: 'student', zoom_phone_number: '',
          target_seconds: 10800, today: { attempts: 0, connected: 0, seconds: 0 },
          month: { attempts: 0, connected: 0, seconds: 0, resolved: 0, pending: 0,
            sla_breaches: 0, unique_learners: 0, emails: 0, daily: [] },
          sync: { last_success_at: null, error: '', recordings_error: '' } }],
        cases: [], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0,
        sources: [], cycle: null, connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null,
      });
    }
    if (url.pathname === '/api/callcentre/my-history/') {
      requests.push(url);
      const month = url.searchParams.get('month') || '2026-10';
      const currentPage = Number(url.searchParams.get('page') || 1);
      if (failSeptember && month === '2026-09') return route.fulfill({ status: 503, json: { detail: 'History temporarily unavailable.' } });
      const empty = month === '2026-08';
      const summary = { attempts: empty ? 0 : 121, connected: empty ? 0 : 111, not_answered: empty ? 0 : 10,
        other: 0, seconds: empty ? 0 : 3661, resolved: empty ? 0 : 3, active_days: empty ? 0 : 1,
        missing_duration: empty ? 0 : 1 };
      const data: MonthlyHistoryData = {
        month, current_month: '2026-10', timezone: 'Europe/London',
        agent: { id: 1, name: 'Operator', email: 'operator@example.org' }, summary,
        daily: empty ? [] : [{ day: `${month}-15`, ...summary }],
        calls: empty ? [] : [{ id: currentPage, started_at: `${month}-15T10:30:00Z`,
          result: currentPage === 1 ? 'answered' : 'no_answer', duration_seconds: currentPage === 1 ? 4 : 0,
          contact_name: `${month === '2026-10' ? 'October' : 'September'} learner ${currentPage}`,
          contact_email: 'learner@example.org', number: '+447700900123',
          cases: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, source_type: 'attendance', outcome: '' })) }],
        total: summary.attempts, page: currentPage, page_size: 30, has_next: !empty && currentPage < 5,
      };
      return json(data);
    }
    if (url.pathname === '/api/auth/access/') return json({ id: 1, email: 'operator@example.org', access: {}, groups: [] });
    return json({});
  });
  await page.goto('/dashboard/call-centre?view=operator&section=history');
  await expect(page.getByRole('heading', { name: 'How I’m doing', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Achievements', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('October learner 1')).toBeVisible();
  return { writes, requests };
}

test('shows own monthly activity, pages through actual calls and opens previous months', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { writes, requests } = await openHistory(page);
  await expect(page.locator('.ed-score')).toHaveCount(0);
  await expect(page.locator('.ed-history-totals')).toContainText('1 hr 1 min 1 sec');
  await expect(page.getByText('Duration is unavailable for 1 answered call(s).')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled();
  const pagination = page.getByRole('navigation', { name: 'Call history pages' });
  await expect(pagination.getByRole('button', { name: 'Page 5', exact: true })).toBeVisible();
  await pagination.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(page.getByText('October learner 2')).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(pagination.getByRole('button', { name: 'Page 2', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.ed-history-call')).toContainText('No connected conversation');
  await expect(page.locator('.ed-history-call')).not.toContainText('0 sec');
  await expect(page.locator('.ed-history-totals')).toContainText('121');
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.getByText('September learner 1')).toBeVisible();
  await expect(page.getByText('October learner 2')).toHaveCount(0);
  await expect(page.getByLabel('Achievement month')).toHaveValue('2026-09');
  await page.getByRole('button', { name: 'Current month', exact: true }).click();
  await expect(page.getByText('October learner 1')).toBeVisible();
  const card = page.getByRole('article', { name: 'Call to October learner 1' });
  await expect(card.getByText('4 sec', { exact: true })).toBeVisible();
  await expect(card.getByText('Connected time · Zoom')).toBeVisible();
  await expect(card.locator('.ed-history-case button').first()).not.toBeVisible();
  expect((await card.boundingBox())!.height).toBeLessThan(300);
  await card.getByText('View linked cases (12)').click();
  await expect(card.locator('.ed-history-case button').last()).toBeVisible();
  await card.getByText('View linked cases (12)').click();
  expect(requests.every(url => url.searchParams.get('agent_id') === '1')).toBe(true);
  expect(writes.filter(path => path.startsWith('/api/callcentre/'))).toEqual([]);
  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector('.workspace-sidebar')!;
    const body = document.querySelector('.workspace-body')!;
    const css = getComputedStyle(sidebar);
    return { sidebarRight: sidebar.getBoundingClientRect().right, bodyLeft: body.getBoundingClientRect().left,
      width: css.width, padding: css.padding, minWidth: css.minWidth, boxSizing: css.boxSizing };
  });
  expect(layout.sidebarRight, JSON.stringify(layout)).toBeLessThanOrEqual(layout.bodyLeft);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath('monthly-achievements.png'), fullPage: true, animations: 'disabled' });
});

test('empty month has honest zero totals and errors never show another month as current data', async ({ page }) => {
  await openHistory(page, true);
  await page.getByLabel('Achievement month').fill('2026-08');
  await expect(page.getByText('No recorded calls in August 2026.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByLabel('Achievement month').fill('2026-09');
  await expect(page.locator('.ed-history').getByRole('alert')).toContainText('History temporarily unavailable.');
  await expect(page.locator('.ed-history-totals')).toHaveCount(0);
  await expect(page.getByText('No recorded calls in August 2026.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Current month', exact: true }).click();
  await expect(page.getByText('October learner 1')).toBeVisible();
});

test('wide call cards stack on a narrow screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHistory(page);
  await expect(page.getByLabel('Achievement month')).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits).toBe(true);
});
