// Phone numbers: the director changes a learner's or line manager's number for the call centre, and puts it back.
import { expect, test } from '@playwright/test';

const PEOPLE = [
  { role: 'learner', email: 'amy@example.org', name: 'Amy Learner', phone: '447700900001', detail: 'L3 · Acme' },
  { role: 'employer', email: 'boss@acme.example', name: 'Bo Boss', phone: '447700900099', detail: 'Acme' },
];
const ROLES = { learner: 'Learner', employer: 'Line manager' };
const CHANGE = { id: 3, role: 'employer', role_label: 'Line manager', email: 'boss@acme.example', name: 'Bo Boss', phone: '447700900555',
  previous_phone: '447700900099', note: 'Gave a new mobile', changed_by: 'boss', changed_at: '2026-11-11T10:00:00Z' };

test('the director changes a line manager’s number and puts the LMS/Aptem one back', async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('kbc-auth-user', JSON.stringify({ id: 1, email: 'boss@example.org', username: 'boss', displayName: 'Boss', groups: [], access: {}, loggedInAt: new Date().toISOString() }));
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
    if (url.pathname === '/api/callcentre/phone-numbers/') {
      if (route.request().method() === 'POST') {
        const sent = route.request().postDataJSON() as { phone: string };
        posted.push(sent);
        const people = PEOPLE.map(p => (p.role === 'employer' && sent.phone ? { ...p, phone: CHANGE.phone } : p));
        return json({ set_up: true, not_set_up: '', roles: ROLES, people, current: sent.phone ? [CHANGE] : [],
          history: [CHANGE], saved: { ...CHANGE, phone: sent.phone ? CHANGE.phone : '', cases: 2 } });
      }
      return json({ set_up: true, not_set_up: '', roles: ROLES, people: PEOPLE, current: [], history: [] });
    }
    if (url.pathname === '/api/callcentre/allocations/') return json({ learners: [], operators: [], inactive: [], history: [] });
    if (url.pathname === '/api/callcentre/employer-specialists/') {
      return json({ values: { enabled: false, agent_ids: [] }, revision: 0, set_up: true, not_set_up: '', open_employer_cases: 0, agents: [], history: [] });
    }
    if (url.pathname === '/api/callcentre/do-not-call/') return json({ set_up: true, not_set_up: '', reasons: {}, current: [], history: [] });
    if (url.pathname === '/api/callcentre/config/') return json({ csrf_token: 't', agent_id: null, agents: [], sources: [], cycle: null });
    if (url.pathname === '/api/callcentre/overview/') {
      return json({ today: '2026-11-11', next_workday: '2026-11-12', holidays: [], month: '2026-11', generated_at: new Date().toISOString(),
        access: { role: 'director', agent_id: null, is_superuser: true, display_name: 'Boss', email: 'boss@example.org' }, agents: [], cases: [],
        employer_specialists: [], cases_truncated: false, resolutions: { agent: 0, ai: 0, system: 0 }, unclaimed_breaches: 0, sources: [],
        cycle: { last_success_at: new Date().toISOString(), details: {} }, connections: { calling: true, email_mode: 'dry_run', ai: false }, call_reviews: null });
    }
    return json({});
  });
  await page.goto('/dashboard/call-centre?view=allocations');
  const card = page.getByRole('region', { name: 'Phone numbers' });
  await card.getByLabel('Line manager').check();
  await card.getByRole('combobox').selectOption('boss@acme.example');
  await expect(card).toContainText('Now: +447700900099 · from the LMS/Aptem');
  await card.getByLabel('New number').fill('07700 900555');
  await card.getByLabel('Note (optional)').fill('Gave a new mobile');
  await card.getByRole('button', { name: 'Use this number' }).click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toEqual({ role: 'employer', email: 'boss@acme.example', name: 'Bo Boss', phone: '07700 900555', note: 'Gave a new mobile' });
  await expect(card.getByRole('listitem').first()).toContainText('Bo Boss · Line manager · +447700900555');
  await expect(card).toContainText('LMS/Aptem had +447700900099');
  await card.getByRole('listitem').first().getByRole('button', { name: 'Put the LMS/Aptem number back' }).click();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1]).toMatchObject({ role: 'employer', email: 'boss@acme.example', phone: '' });
  await card.screenshot({ path: test.info().outputPath('phone-numbers.png') });
  expect(errors).toEqual([]);
});
