import { expect, test, type Page } from '@playwright/test';
import type { AdministrationRole, AdministrationUser, PermissionSection } from '../../src/pages/administration/api';

const roles: AdministrationRole[] = [
  ['access_admin', 'Communication Centre admin', 'Admin Access', 'communication'],
  ['access_event_manager', 'Events', 'Event Manager Access', 'communication'],
  ['access_operations', 'Operations', 'Operations Access', 'communication'],
  ['access_it', 'IT', 'IT Access', 'communication'],
  ['access_marketing', 'Marketing', 'Marketing Access', 'communication'],
  ['access_support', 'Support', 'Support Access', 'communication'],
  ['access_coach', 'Coach', 'Coach Access', 'communication'],
  ['access_call_centre_agent', 'Specialist', 'Call Centre Agent Access', 'engagement'],
  ['access_call_centre_director', 'Director', 'Call Centre Director Access', 'engagement'],
  ['access_call_centre_coach', 'Engagement coach', 'Call Centre Coach Access', 'engagement'],
].map(([id, name, groupName, section], index) => ({ id, groupId: index + 1, name, groupName, section: section as AdministrationRole['section'], description: `Access for ${name.toLowerCase()}.`, assignedCount: 1, permissions: [], isSystem: true, canEdit: false, canDelete: false, canAssign: true, revision: 'role-v1', unmanagedPermissions: [] }));

const permissionSections: PermissionSection[] = [
  ['news', 'News', 'News, urgent notices and leadership messages.'],
  ['events', 'Events', 'Events and schedules.'],
  ['training_plan', 'Training plan', 'Training plans, cohorts and profiles.'],
  ['dashboard_cards', 'Internal dashboards', 'Dashboard links and cards.'],
  ['employees', 'Departments', 'Employee records.'],
  ['user_activity', 'User activity', 'Login sessions and change history.'],
].map(([id, name, description]) => ({ id, name, description, permissions: (id === 'user_activity' ? ['view'] : ['view', 'add', 'change', 'delete']).map(action => ({ id: `login.${action}_${id}`, name: `${action} ${name}`, action, baseline: action === 'view' && id !== 'user_activity' })) }));

function customRole(name = 'News editors', permissions = ['login.add_news', 'login.change_news']): AdministrationRole {
  return { id: 'group:11', groupId: 11, name, groupName: name, section: 'custom', description: 'Custom access for your team.', assignedCount: 0, permissions, isSystem: false, canEdit: true, canDelete: true, canAssign: true, revision: 'role-v1', unmanagedPermissions: [] };
}

function person(id: number, username: string, assigned: string[] = []): AdministrationUser {
  return { id, username, email: `${username}@example.com`, firstName: username === 'sarah' ? 'Sarah' : 'Alex', lastName: username === 'sarah' ? 'Mitchell' : 'Morgan', displayName: username === 'sarah' ? 'Sarah Mitchell' : 'Alex Morgan', isActive: true, isStaff: false, isSuperuser: false, roles: assigned, otherGroups: [], lastLogin: '2026-11-17T09:00:00Z', dateJoined: '2026-01-01T09:00:00Z', revision: 'v1', canEdit: true, canDelete: id !== 1 };
}

async function prepare(page: Page, options: { allowed?: boolean; superuser?: boolean; sessionStatus?: number; customRoles?: AdministrationRole[] } = {}) {
  const state = { allowed: options.allowed ?? true, sessionStatus: options.sessionStatus ?? 200, roles: [...roles, ...(options.customRoles || [])], users: [person(1, 'alex', ['access_admin']), person(2, 'sarah', ['access_marketing'])], history: [] as unknown[], writes: [] as { method: string; path: string; body: Record<string, unknown>; csrf: string | undefined }[], reads: [] as string[], stale: false };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Even a forged administrator cache must not expose administration without a server grant.
  await page.addInitScript(() => localStorage.setItem('kbc-auth-user', JSON.stringify({ id: 1, username: 'alex', email: 'alex@example.com', groups: ['Admin Access'], access: { adminAccess: true }, displayName: 'Alex Morgan' })));
  await page.context().addCookies([{ name: 'csrftoken', value: 'a'.repeat(32), domain: '127.0.0.1', path: '/' }]);
  await page.routeWebSocket('**', socket => {
    if (['127.0.0.1', 'localhost'].includes(new URL(socket.url()).hostname)) socket.connectToServer();
    else socket.close();
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (payload: unknown, status = 200) => route.fulfill({ status, json: payload });
    if (url.pathname === '/api/auth/access/') return json({ id: 1, username: 'alex', groups: ['Admin Access'], access: { adminAccess: true } });
    if (!url.pathname.startsWith('/api/administration/')) return json({});
    state.reads.push(url.pathname);
    if (url.pathname.endsWith('/session/')) {
      if (state.sessionStatus !== 200) return json({ detail: 'Unable to verify administration access.' }, state.sessionStatus);
      return state.allowed ? json({ canManageAdministration: true, canManagePrivilegedAccounts: options.superuser ?? false, currentUserId: 1, djangoAdminUrl: options.superuser ? '/admin/' : null }) : json({ detail: 'Administrator access is required.' }, 403);
    }
    if (!state.allowed) return json({ detail: 'Administrator access is required.' }, 403);
    const roleMatch = url.pathname.match(/\/roles\/(\d+)\/$/);
    if (url.pathname.includes('/roles/')) {
      if (request.method() === 'GET') return roleMatch ? json({ role: state.roles.find(role => role.groupId === Number(roleMatch[1])) }) : json({ roles: state.roles, permissionSections });
      const body = request.postDataJSON();
      state.writes.push({ method: request.method(), path: url.pathname, body, csrf: request.headers()['x-csrftoken'] });
      if (state.stale) return json({ detail: 'This role was changed by another administrator. Reload and try again.' }, 409);
      const existing = state.roles.find(role => role.groupId === Number(roleMatch?.[1]));
      if (request.method() === 'DELETE') {
        state.roles = state.roles.filter(role => role.id !== existing!.id);
        state.users = state.users.map(user => ({ ...user, roles: user.roles.filter(id => id !== existing!.id) }));
        return json({ deleted: true });
      }
      const role = { ...(existing || customRole()), name: body.name, groupName: body.name, permissions: body.permissions, revision: 'role-v2' };
      state.roles = existing ? state.roles.map(item => item.id === existing.id ? role : item) : [...state.roles, role];
      state.history.unshift({ id: state.history.length + 1, actor: 'Alex Morgan', action: existing ? 'updated' : 'created', createdAt: '2026-11-17T10:00:00Z', objectLabel: role.name, summary: 'Updated role permissions.' });
      return json({ role, warnings: [] }, existing ? 200 : 201);
    }
    if (url.pathname.endsWith('/history/')) return json({ entries: state.history, total: state.history.length, page: 1, pageSize: 20 });
    if (request.method() === 'GET') {
      const match = url.pathname.match(/\/users\/(\d+)\/$/);
      if (match) return json({ user: state.users.find(user => user.id === Number(match[1])) });
      const query = (url.searchParams.get('q') || '').toLowerCase();
      const role = url.searchParams.get('role');
      const status = url.searchParams.get('status');
      const filtered = state.users.filter(user => `${user.displayName} ${user.username} ${user.email}`.toLowerCase().includes(query) && (!role || user.roles.includes(role)) && (!status || user.isActive === (status === 'active')));
      return json({ users: filtered, total: filtered.length, page: 1, pageSize: 20 });
    }
    const body = request.postDataJSON();
    state.writes.push({ method: request.method(), path: url.pathname, body, csrf: request.headers()['x-csrftoken'] });
    if (state.stale) return json({ detail: 'This account was changed by another administrator. Reload and try again.' }, 409);
    const match = url.pathname.match(/\/users\/(\d+)\//);
    if (request.method() === 'DELETE') { state.users = state.users.filter(user => user.id !== Number(match![1])); return route.fulfill({ status: 204 }); }
    let user = match ? state.users.find(item => item.id === Number(match[1]))! : person(3, String(body.username));
    if (!url.pathname.endsWith('/password/')) {
      const { password: _password, revision: _revision, ...fields } = body;
      user = { ...user, ...fields, displayName: `${body.firstName ?? user.firstName} ${body.lastName ?? user.lastName}`.trim(), revision: 'v2' };
      if (match) state.users = state.users.map(item => item.id === user.id ? user : item); else state.users.push(user);
    } else user = { ...user, revision: 'password-v2' };
    state.history.unshift({ id: state.history.length + 1, actor: 'Alex Morgan', action: 'change', createdAt: '2026-11-17T10:00:00Z', objectLabel: user.username, summary: 'Updated account access.' });
    return json({ user, warnings: [] }, match ? 200 : 201);
  });
  await page.goto('/administration');
  return { state, errors };
}

test('only server-authorized administrators see the navigation button and user data', async ({ page }) => {
  const { state, errors } = await prepare(page, { allowed: false });
  await expect(page.getByText('Administrator access is required.').first()).toBeVisible();
  await expect(page.locator('a[href="/administration"]:visible')).toHaveCount(0);
  expect(state.reads.filter(path => !path.endsWith('/session/'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('server verification failures keep the administration navigation hidden', async ({ page }) => {
  await prepare(page, { sessionStatus: 503 });
  await expect(page.getByText('Unable to verify administration access.').first()).toBeVisible();
  await expect(page.locator('a[href="/administration"]:visible')).toHaveCount(0);
});

test('the admin button is available on desktop and mobile and disappears after access is revoked', async ({ page }) => {
  const { state } = await prepare(page);
  await expect(page.locator('a[href="/administration"]:visible').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('a[href="/administration"]:visible').first()).toBeVisible();
  state.allowed = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('a[href="/administration"]:visible')).toHaveCount(0);
});

test('editing roles sends only assigned roles, the current revision, and a CSRF header', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const { state, errors } = await prepare(page);
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('desktop-users.png'), fullPage: true });
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await page.getByRole('checkbox', { name: /^Communication Centre admin/ }).check();
  await expect(page.getByRole('checkbox', { name: /^Operations/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Operations/ })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /^Specialist/ })).not.toBeChecked();
  await page.screenshot({ path: test.info().outputPath('desktop-access.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/administration/users/2/', body: { revision: 'v1', roles: ['access_marketing', 'access_admin'] }, csrf: 'a'.repeat(32) });
  expect(state.writes[0].body).not.toHaveProperty('isSuperuser');
  expect(state.writes[0].body).not.toHaveProperty('isStaff');
  await page.getByRole('button', { name: 'Change history', exact: true }).click();
  await expect(page.getByText('Updated account access.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('search and role filters query the server, and cancelling a dirty edit writes nothing', async ({ page }) => {
  const { state } = await prepare(page);
  await page.getByRole('searchbox', { name: 'Search name or email' }).fill('Sarah Mitchell');
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage access for Alex Morgan' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await expect(page.getByText('Advanced administration access', { exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: /^Operations/ }).check();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.writes).toHaveLength(0);
  await page.getByRole('searchbox', { name: 'Search name or email' }).fill('');
  await page.getByRole('combobox', { name: 'Filter by role', exact: true }).selectOption('access_admin');
  await expect(page.getByRole('button', { name: 'Manage access for Alex Morgan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toHaveCount(0);
});

test('a legacy account without email can have its roles updated without changing its identity', async ({ page }) => {
  const { state } = await prepare(page);
  state.users[1].email = '';
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await page.getByRole('checkbox', { name: /^Operations/ }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toBeVisible();
  expect(state.writes[0].body).toEqual({ revision: 'v1', roles: ['access_marketing', 'access_operations'] });
});

test('creating a user and changing a password call the real API contract', async ({ page }) => {
  const { state } = await prepare(page);
  await page.getByRole('button', { name: 'Add user', exact: true }).click();
  await page.getByLabel('First name', { exact: true }).fill('New');
  await page.getByLabel('Last name', { exact: true }).fill('Colleague');
  await page.getByLabel(/^Username/).fill('new.colleague');
  await page.getByLabel(/^Email address/).fill('colleague@example.com');
  await page.getByLabel(/^Password \*/).fill('Test-only-password-928!');
  await page.getByLabel(/^Confirm password/).fill('Test-only-password-928!');
  await page.getByRole('checkbox', { name: /^Operations/ }).check();
  await page.getByRole('button', { name: 'Create user', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage access for New Colleague' })).toBeVisible();
  expect(state.writes[0]).toMatchObject({ method: 'POST', body: { username: 'new.colleague', roles: ['access_operations'] } });
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('New password', { exact: true }).fill('Second-test-only-735!');
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('Second-test-only-735!');
  await dialog.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes[1]).toMatchObject({ method: 'POST', path: '/api/administration/users/2/password/', body: { revision: 'v1', password: 'Second-test-only-735!' } });
});

test('deletion requires typing the exact username', async ({ page }) => {
  const { state } = await prepare(page);
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Delete account', exact: true })).toBeDisabled();
  await dialog.getByLabel('Type sarah to confirm').fill('wrong');
  await expect(dialog.getByRole('button', { name: 'Delete account', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
  await dialog.getByLabel('Type sarah to confirm').fill('sarah');
  await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toHaveCount(0);
  expect(state.writes[0]).toMatchObject({ method: 'DELETE', body: { revision: 'v1', confirmUsername: 'sarah' } });
});

test('a stale save is reported without overwriting user input', async ({ page }) => {
  const { state } = await prepare(page);
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await page.getByLabel('First name', { exact: true }).fill('Sara');
  state.stale = true;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed by another administrator');
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Sara');
  await expect(page.getByRole('button', { name: 'Reload account' })).toBeVisible();
});

test('account editing fits small screens and only super administrators see advanced controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 950 });
  const { errors } = await prepare(page, { superuser: true });
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await page.getByText('Advanced administration access', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /^Django super administrator/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('mobile-editor.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('creating a custom role saves selected permissions and makes it assignable to a user', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { state, errors } = await prepare(page);
  await page.getByRole('button', { name: 'Roles', exact: true }).click();
  await page.getByRole('button', { name: 'Add role', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a role' });
  await dialog.getByLabel(/^Role name/).fill('News editors');
  await expect(dialog.getByRole('checkbox', { name: 'View News', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'View News', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'View User activity', exact: true })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Add News', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Edit News', exact: true }).check();
  await page.screenshot({ path: test.info().outputPath('desktop-role-editor.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Create role', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit role News editors', exact: true })).toBeVisible();
  expect(state.writes[0]).toMatchObject({ method: 'POST', path: '/api/administration/roles/', body: { name: 'News editors', permissions: ['login.add_news', 'login.change_news'] }, csrf: 'a'.repeat(32) });
  await page.getByRole('button', { name: 'Users & access', exact: true }).click();
  await page.getByRole('button', { name: 'Manage access for Sarah Mitchell' }).click();
  await page.getByRole('checkbox', { name: /^News editors/ }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage access for Sarah Mitchell' })).toBeVisible();
  expect(state.writes[1].body).toMatchObject({ roles: ['access_marketing', 'group:11'], revision: 'v1' });
  expect(errors).toEqual([]);
});

test('role editing handles stale changes and confirms deletion with the exact role name', async ({ page }) => {
  const role = { ...customRole(), assignedCount: 2 };
  const { state } = await prepare(page, { customRoles: [role] });
  await page.getByRole('button', { name: 'Roles', exact: true }).click();
  await page.getByRole('button', { name: 'Edit role News editors' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: 'Delete News', exact: true }).check();
  state.stale = true;
  await dialog.getByRole('button', { name: 'Save role', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed by another administrator');
  await expect(dialog.getByRole('checkbox', { name: 'Delete News', exact: true })).toBeChecked();
  state.stale = false;
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Reload role', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Delete News', exact: true })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Delete News', exact: true }).check();
  await dialog.getByRole('button', { name: 'Save role', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit role News editors' })).toBeVisible();
  expect(state.writes[1]).toMatchObject({ method: 'PATCH', body: { revision: 'role-v1', permissions: ['login.add_news', 'login.change_news', 'login.delete_news'] } });
  await page.getByRole('button', { name: 'Edit role News editors' }).click();
  await dialog.getByRole('button', { name: 'Delete role', exact: true }).click();
  await expect(dialog).toContainText('2 people will lose the access this role provides');
  await expect(dialog.getByRole('button', { name: 'Delete role', exact: true })).toBeDisabled();
  await dialog.getByLabel('Type News editors to confirm').fill('News editors');
  await dialog.getByRole('button', { name: 'Delete role', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit role News editors' })).toHaveCount(0);
  expect(state.writes[2]).toMatchObject({ method: 'DELETE', body: { revision: 'role-v2', confirmName: 'News editors' } });
});

test('built-in and protected native roles are read-only and role forms fit a small screen', async ({ page }) => {
  const protectedRole = { ...customRole('Finance administrator'), canEdit: false, canDelete: false, canAssign: false, unmanagedPermissions: [{ id: 'auth.change_user', name: 'Can change user' }] };
  const { state, errors } = await prepare(page, { customRoles: [protectedRole] });
  await page.setViewportSize({ width: 320, height: 950 });
  await page.getByRole('button', { name: 'Roles', exact: true }).click();
  await page.getByRole('button', { name: 'View role Finance administrator' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/This role includes protected/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save role' })).toHaveCount(0);
  await expect(dialog.getByLabel(/^Role name/)).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View role Events', exact: true }).click();
  await expect(dialog.getByText(/This built-in role is protected/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Add role', exact: true }).click();
  await dialog.getByLabel(/^Role name/).fill('Small-screen editors');
  await dialog.getByRole('checkbox', { name: 'Edit News', exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && [...document.querySelectorAll('dialog[open]')].every(element => element.scrollWidth <= element.clientWidth))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('mobile-role-editor.png'), fullPage: true });
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.writes).toHaveLength(0);
  expect(errors).toEqual([]);
});
