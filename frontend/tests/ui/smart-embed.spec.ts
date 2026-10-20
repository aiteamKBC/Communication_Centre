import { expect, test, type Page } from '@playwright/test';

const zoomOrigin = 'https://applications.zoom.us';
const destination = '+441632960001';
const callerId = '+441632960002';

async function setup(page: Page) {
  const calls: unknown[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**', socket => {
    if (new URL(socket.url()).hostname === '127.0.0.1') socket.connectToServer();
    else socket.close();
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    // Mock Zoom completely: no actual provider traffic, call, or shared database writes.
    if (url.origin === zoomOrigin) return route.fulfill({ contentType: 'text/html', body: `
      <script>
        window.commands = [];
        window.addEventListener('message', event => window.commands.push(event.data));
      </script>` });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/__phone_test') return route.fulfill({ contentType: 'text/html', body: `
      <div id="root"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { default: Phone } = await import('/src/pages/call-centre/engagement/SmartEmbedPhone.tsx');
        const { caseAction } = await import('/src/pages/call-centre/engagement/actions.ts');
        window.notifications = [];
        window.root = ReactDOM.createRoot(document.getElementById('root'));
        window.root.render(React.createElement(Phone, {
          csrf: 'test', notify: text => window.notifications.push(text), onCallLogged: () => {},
        }));
        window.call = () => caseAction({ csrf: 'test', agentId: 1 }, 42, 'call');
      </script>` });
    if (url.pathname === '/api/callcentre/tickets/42/call/') {
      calls.push(route.request().postDataJSON());
      return route.fulfill({ json: { number: destination, caller_id: callerId,
        zoom_url: `zoomphonecall://${destination}?callerid=${encodeURIComponent(callerId)}` } });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });
  await page.goto('/__phone_test');
  await expect.poll(async () => {
    if (errors.length) return errors.join('\n');
    return page.locator('iframe').count();
  }).toBe(1);
  await expect.poll(() => page.frames().length).toBe(2);
  await page.clock.install();
  return calls;
}

async function emit(page: Page, type: string, data: unknown = {}) {
  const frame = page.frames().find(f => f.url().startsWith(zoomOrigin))!;
  await frame.evaluate(({ type, data }) => parent.postMessage({ type, data }, 'http://127.0.0.1:3000'), { type, data });
  // Wait for the parent to process the queued message.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
}

async function commands(page: Page) {
  const frame = page.frames().find(f => f.url().startsWith(zoomOrigin))!;
  return frame.evaluate(() => (window as unknown as { commands: { type: string; data: unknown }[] }).commands);
}

async function call(page: Page) {
  return page.evaluate(async () => {
    try { await (window as unknown as { call: () => Promise<unknown> }).call(); return ''; }
    catch (error) { return (error as Error).message; }
  });
}

test('iframe load alone cannot create a call intent; forged ready messages are ignored', async ({ page }) => {
  const calls = await setup(page);
  expect(await call(page)).toContain('still loading');
  expect(calls).toHaveLength(0);
  await page.evaluate(origin => window.dispatchEvent(new MessageEvent('message', {
    origin, source: window, data: { type: 'zp-ready' },
  })), zoomOrigin);
  expect(await call(page)).toContain('still loading');
  expect(calls).toHaveLength(0);
  expect(await commands(page)).toEqual([]);
});

test('ready initializes the widget; call preserves case intent and shows manual fallback without redial', async ({ page }) => {
  const calls = await setup(page);
  await emit(page, 'zp-ready');
  expect(await call(page)).toBe('');
  expect(calls).toEqual([{ agent_id: 1 }]);
  await expect.poll(async () => (await commands(page)).length).toBe(2);
  expect((await commands(page))[0].type).toBe('zp-init-config');
  expect((await commands(page))[1]).toEqual({
    type: 'zp-make-call', data: { number: destination, callerId, autoDial: true },
  });
  await page.clock.fastForward(13000);
  await expect(page.getByRole('alert')).toContainText('Call start not confirmed');
  await expect(page.getByRole('link', { name: 'open this call in Zoom desktop' }))
    .toHaveAttribute('href', `zoomphonecall://${destination}?callerid=${encodeURIComponent(callerId)}`);
  await page.clock.fastForward(60000);
  expect((await commands(page)).filter(c => c.type === 'zp-make-call')).toHaveLength(1);
  expect(calls).toHaveLength(1);
});

test('unrelated calls do not confirm this request; matching outbound ring clears the warning', async ({ page }) => {
  await setup(page);
  await emit(page, 'zp-ready');
  await call(page);
  await emit(page, 'zp-call-ringing-event', { direction: 'inbound', callee: { phoneNumber: destination } });
  await emit(page, 'zp-call-ringing-event', { direction: 'outbound', callee: { phoneNumber: '+441632960003' } });
  await page.clock.fastForward(13000);
  await expect(page.getByRole('alert')).toBeVisible();
  await emit(page, 'zp-call-ringing-event', { direction: 'outbound', callee: { phoneNumber: '+44 1632 960001' } });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a timely connected event cancels the warning and unmount clears timers', async ({ page }) => {
  await setup(page);
  await emit(page, 'zp-ready');
  await call(page);
  await emit(page, 'zp-call-connected-event', { direction: 'outbound', callee: { phoneNumber: destination } });
  await page.clock.fastForward(13000);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await call(page);
  await page.evaluate(() => (window as unknown as { root: { unmount: () => void } }).root.unmount());
  await page.clock.fastForward(13000);
  const notices = await page.evaluate(() => (window as unknown as { notifications: string[] }).notifications);
  expect(notices.filter(n => n.includes('not confirmed'))).toEqual([]);
});
