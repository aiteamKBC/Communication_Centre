# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smart-embed.spec.ts >> a timely connected event cancels the warning and unmount clears timers
- Location: tests\ui\smart-embed.spec.ts:118:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('iframe')
Expected: 1
Received: 0
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for locator('iframe')
    23 × locator resolved to 0 elements
       - unexpected value "0"

```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | 
  3   | const zoomOrigin = 'https://applications.zoom.us';
  4   | const destination = '+441632960001';
  5   | const callerId = '+441632960002';
  6   | 
  7   | async function setup(page: Page) {
  8   |   const calls: unknown[] = [];
  9   |   const errors: string[] = [];
  10  |   page.on('pageerror', error => errors.push(error.message));
  11  |   page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  12  |   await page.routeWebSocket('**', socket => {
  13  |     if (new URL(socket.url()).hostname === '127.0.0.1') socket.connectToServer();
  14  |     else socket.close();
  15  |   });
  16  |   await page.route('**/*', route => {
  17  |     const url = new URL(route.request().url());
  18  |     // Mock Zoom completely: no actual provider traffic, call, or shared database writes.
  19  |     if (url.origin === zoomOrigin) return route.fulfill({ contentType: 'text/html', body: `
  20  |       <script>
  21  |         window.commands = [];
  22  |         window.addEventListener('message', event => window.commands.push(event.data));
  23  |       </script>` });
  24  |     if (url.hostname !== '127.0.0.1') return route.abort();
  25  |     if (url.pathname === '/__phone_test') return route.fulfill({ contentType: 'text/html', body: `
  26  |       <div id="root"></div>
  27  |       <script type="module">
  28  |         import RefreshRuntime from '/@react-refresh';
  29  |         RefreshRuntime.injectIntoGlobalHook(window);
  30  |         window.$RefreshReg$ = () => {};
  31  |         window.$RefreshSig$ = () => type => type;
  32  |         window.__vite_plugin_react_preamble_installed__ = true;
  33  |         const React = await import('/node_modules/.vite/deps/react.js');
  34  |         const { createRoot } = await import('/node_modules/.vite/deps/react-dom_client.js');
  35  |         const { default: Phone } = await import('/src/pages/call-centre/engagement/SmartEmbedPhone.tsx');
  36  |         const { caseAction } = await import('/src/pages/call-centre/engagement/actions.ts');
  37  |         window.notifications = [];
  38  |         window.root = createRoot(document.getElementById('root'));
  39  |         window.root.render(React.createElement(Phone, {
  40  |           csrf: 'test', notify: text => window.notifications.push(text), onCallLogged: () => {},
  41  |         }));
  42  |         window.call = () => caseAction({ csrf: 'test', agentId: 1 }, 42, 'call');
  43  |       </script>` });
  44  |     if (url.pathname === '/api/callcentre/tickets/42/call/') {
  45  |       calls.push(route.request().postDataJSON());
  46  |       return route.fulfill({ json: { number: destination, caller_id: callerId,
  47  |         zoom_url: `zoomphonecall://${destination}?callerid=${encodeURIComponent(callerId)}` } });
  48  |     }
  49  |     if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
> 50  |     return route.continue();
      |                                        ^ Error: expect(locator).toHaveCount(expected) failed
  51  |   });
  52  |   await page.goto('/__phone_test');
  53  |   await expect.poll(async () => {
  54  |     if (errors.length) return errors.join('\n');
  55  |     return page.locator('iframe').count();
  56  |   }).toBe(1);
  57  |   await expect.poll(() => page.frames().length).toBe(2);
  58  |   await page.clock.install();
  59  |   return calls;
  60  | }
  61  | 
  62  | async function emit(page: Page, type: string, data: unknown = {}) {
  63  |   const frame = page.frames().find(f => f.url().startsWith(zoomOrigin))!;
  64  |   await frame.evaluate(({ type, data }) => parent.postMessage({ type, data }, 'http://127.0.0.1:3000'), { type, data });
  65  |   // Wait for the parent to process the queued message.
  66  |   await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  67  | }
  68  | 
  69  | async function commands(page: Page) {
  70  |   const frame = page.frames().find(f => f.url().startsWith(zoomOrigin))!;
  71  |   return frame.evaluate(() => (window as unknown as { commands: { type: string; data: unknown }[] }).commands);
  72  | }
  73  | 
  74  | async function call(page: Page) {
  75  |   return page.evaluate(async () => {
  76  |     try { await (window as unknown as { call: () => Promise<unknown> }).call(); return ''; }
  77  |     catch (error) { return (error as Error).message; }
  78  |   });
  79  | }
  80  | 
  81  | test('iframe load alone cannot create a call intent; forged ready messages are ignored', async ({ page }) => {
  82  |   const calls = await setup(page);
  83  |   expect(await call(page)).toContain('still loading');
  84  |   expect(calls).toHaveLength(0);
  85  |   await page.evaluate(origin => window.dispatchEvent(new MessageEvent('message', {
  86  |     origin, source: window, data: { type: 'zp-ready' },
  87  |   })), zoomOrigin);
  88  |   expect(await call(page)).toContain('still loading');
  89  |   expect(calls).toHaveLength(0);
  90  |   expect(await commands(page)).toEqual([]);
  91  | });
  92  | 
  93  | test('ready initializes the widget; call preserves case intent and shows manual fallback without redial', async ({ page }) => {
  94  |   const calls = await setup(page);
  95  |   await emit(page, 'zp-ready');
  96  |   expect(await call(page)).toBe('');
  97  |   expect(calls).toEqual([{ agent_id: 1 }]);
  98  |   await expect.poll(async () => (await commands(page)).length).toBe(2);
  99  |   expect((await commands(page))[0].type).toBe('zp-init-config');
  100 |   expect((await commands(page))[1]).toEqual({
  101 |     type: 'zp-make-call', data: { number: destination, callerId, autoDial: true },
  102 |   });
  103 |   await page.clock.fastForward(13000);
  104 |   await expect(page.getByRole('alert')).toContainText('Call start not confirmed');
  105 |   await expect(page.getByRole('link', { name: 'open this call in Zoom desktop' }))
  106 |     .toHaveAttribute('href', `zoomphonecall://${destination}?callerid=${encodeURIComponent(callerId)}`);
  107 |   await page.clock.fastForward(60000);
  108 |   expect((await commands(page)).filter(c => c.type === 'zp-make-call')).toHaveLength(1);
  109 |   expect(calls).toHaveLength(1);
  110 | });
  111 | 
  112 | test('unrelated calls do not confirm this request; matching outbound ring clears the warning', async ({ page }) => {
  113 |   await setup(page);
  114 |   await emit(page, 'zp-ready');
  115 |   await call(page);
  116 |   await emit(page, 'zp-call-ringing-event', { direction: 'inbound', callee: { phoneNumber: destination } });
  117 |   await emit(page, 'zp-call-ringing-event', { direction: 'outbound', callee: { phoneNumber: '+441632960003' } });
  118 |   await page.clock.fastForward(13000);
  119 |   await expect(page.getByRole('alert')).toBeVisible();
  120 |   await emit(page, 'zp-call-ringing-event', { direction: 'outbound', callee: { phoneNumber: '+44 1632 960001' } });
  121 |   await expect(page.getByRole('alert')).toHaveCount(0);
  122 | });
  123 | 
  124 | test('a timely connected event cancels the warning and unmount clears timers', async ({ page }) => {
  125 |   await setup(page);
  126 |   await emit(page, 'zp-ready');
  127 |   await call(page);
  128 |   await emit(page, 'zp-call-connected-event', { direction: 'outbound', callee: { phoneNumber: destination } });
  129 |   await page.clock.fastForward(13000);
  130 |   await expect(page.getByRole('alert')).toHaveCount(0);
  131 |   await call(page);
  132 |   await page.evaluate(() => (window as unknown as { root: { unmount: () => void } }).root.unmount());
  133 |   await page.clock.fastForward(13000);
  134 |   const notices = await page.evaluate(() => (window as unknown as { notifications: string[] }).notifications);
  135 |   expect(notices.filter(n => n.includes('not confirmed'))).toEqual([]);
  136 | });
  137 | 
```