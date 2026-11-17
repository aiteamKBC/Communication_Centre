import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, rights: string[]) {
  const state = { rights };
  // A custom group must use the server's permission list rather than a fixed
  // role-name whitelist (or the stale administrator flags in this cache).
  await page.addInitScript(() => localStorage.setItem('kbc-auth-user', JSON.stringify({ id: 42, username: 'custom', groups: ['Custom editor'], access: { adminAccess: true, permissions: [] } })));
  await page.routeWebSocket('**', socket => {
    if (['localhost', '127.0.0.1'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/access/') return route.fulfill({ json: { id: 42, username: 'custom', groups: ['Custom editor'], access: { permissions: state.rights } } });
    if (url.pathname.startsWith('/api/administration/')) return route.fulfill({ status: 403, json: { detail: 'Administrator access is required.' } });
    if (url.pathname === '/api/events/') return route.fulfill({ json: [{ id: '1', title: 'Team workshop', date: '2026-12-05', type: 'offline', description: 'Planning together' }] });
    if (url.pathname === '/api/news/') return route.fulfill({ json: [{ id: '1', title: 'College update', summary: 'Latest update', content: 'Details', department: 'General', priority: 'critical', date: '2026-11-17' }] });
    return route.fulfill({ json: {} });
  });
  return state;
}

test('a custom event creator can add without edit, delete, or administration controls', async ({ page }) => {
  await prepare(page, ['login.view_events', 'login.add_events']);
  await page.goto('/events');
  await expect(page.getByRole('button', { name: /Add Event/i }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team workshop' })).toBeVisible();
  await expect(page.getByTitle('Edit event', { exact: true })).toHaveCount(0);
  await expect(page.getByTitle('Delete event', { exact: true })).toHaveCount(0);
  await expect(page.locator('a[href="/administration"]:visible')).toHaveCount(0);
});

test('custom edit and delete permissions are independent and refresh after revocation', async ({ page }) => {
  const state = await prepare(page, ['login.view_events', 'login.change_events']);
  await page.goto('/events');
  await expect(page.getByTitle('Edit event', { exact: true })).toBeVisible();
  await expect(page.getByTitle('Delete event', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add Event/i })).toHaveCount(0);
  state.rights = ['login.view_events', 'login.delete_events'];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTitle('Delete event', { exact: true })).toBeVisible();
  await expect(page.getByTitle('Edit event', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View Details' }).click();
  await expect(page.getByRole('button', { name: /Delete/i }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: /Edit/i })).toHaveCount(0);
});

test('a custom news editor gets edit controls without create or delete', async ({ page }) => {
  await prepare(page, ['login.view_news', 'login.change_news']);
  await page.goto('/news');
  await expect(page.getByText('College update', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add News Article' })).toHaveCount(0);
});
