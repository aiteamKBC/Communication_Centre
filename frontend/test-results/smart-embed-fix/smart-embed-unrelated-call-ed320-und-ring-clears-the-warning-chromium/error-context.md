# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smart-embed.spec.ts >> unrelated calls do not confirm this request; matching outbound ring clears the warning
- Location: tests\ui\smart-embed.spec.ts:106:1

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
  9   |   await page.routeWebSocket('**', socket => {
  10  |     if (new URL(socket.url()).hostname === '127.0.0.1') socket.connectToServer();
  11  |     else socket.close();
  12  |   });
  13  |   await page.route('**/*', route => {
  14  |     const url = new URL(route.request().url());
  15  |     // Mock Zoom completely: no actual provider traffic, call, or shared database writes.
  16  |     if (url.origin === zoomOrigin) return route.fulfill({ contentType: 'text/html', body: `
  17  |       <script>
  18  |         window.commands = [];
  19  |         window.addEventListener('message', event => window.commands.push(event.data));
  20  |       </script>` });
  21  |     if (url.hostname !== '127.0.0.1') return route.abort();
  22  |     if (url.pathname === '/__phone_test') return route.fulfill({ contentType: 'text/html', body: `
  23  |       <div id="root"></div>
  24  |       <script type="module">
  25  |         import RefreshRuntime from '/@react-refresh';
  26  |         RefreshRuntime.injectIntoGlobalHook(window);
  27  |         window.$RefreshReg$ = () => {};
  28  |         window.$RefreshSig$ = () => type => type;
  29  |         window.__vite_plugin_react_preamble_installed__ = true;
  30  |         const React = await import('/node_modules/.vite/deps/react.js');
  31  |         const { createRoot } = await import('/node_modules/.vite/deps/react-dom_client.js');
  32  |         const { default: Phone } = await import('/src/pages/call-centre/engagement/SmartEmbedPhone.tsx');
  33  |         const { caseAction } = await import('/src/pages/call-centre/engagement/actions.ts');
  34  |         window.notifications = [];
  35  |         window.root = createRoot(document.getElementById('root'));
  36  |         window.root.render(React.createElement(Phone, {
  37  |           csrf: 'test', notify: text => window.notifications.push(text), onCallLogged: () => {},
  38  |         }));
  39  |         window.call = () => caseAction({ csrf: 'test', agentId: 1 }, 42, 'call');
  40  |       </script>` });
  41  |     if (url.pathname === '/api/callcentre/tickets/42/call/') {
  42  |       calls.push(route.request().postDataJSON());
  43  |       return route.fulfill({ json: { number: destination, caller_id: callerId,
  44  |         zoom_url: `zoomphonecall://${destination}?callerid=${encodeURIComponent(callerId)}` } });
  45  |     }
  46  |     if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
  47  |     return route.continue();
  48  |   });
  49  |   await page.goto('/__phone_test');
> 50  |   await expect(page.locator('iframe')).toHaveCount(1);
      |                                        ^ Error: expect(locator).toHaveCount(expected) failed
  51  |   await expect.poll(() => page.frames().length).toBe(2);
  52  |   await page.clock.install();
  53  |   return calls;
  54  | }
  55  | 
  56  | async function emit(page: Page, type: string, data: unknown = {}) {
  57  |   const frame = page.frames().find(f => f.url().startsWith(zoomOrigin))!;
  58  |   await frame.evaluate(({ type, data }) => parent.postMessage({ type, data }, 'http://127.0.0.1:3000'), { type, data });
  59  |   // Wait for the parent to process the queued message.
  60  |   await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  61  | }
  62  | 
  63  | async function commands(page: Page) {
  64  |   const frame = page.frames().find(f => f.url().startsWith(zoomOrigin))!;
  65  |   return frame.evaluate(() => (window as unknown as { commands: { type: string; data: unknown }[] }).commands);
  66  | }
  67  | 
  68  | async function call(page: Page) {
  69  |   return page.evaluate(async () => {
  70  |     try { await (window as unknown as { call: () => Promise<unknown> }).call(); return ''; }
  71  |     catch (error) { return (error as Error).message; }
  72  |   });
  73  | }
  74  | 
  75  | test('iframe load alone cannot create a call intent; forged ready messages are ignored', async ({ page }) => {
  76  |   const calls = await setup(page);
  77  |   expect(await call(page)).toContain('still loading');
  78  |   expect(calls).toHaveLength(0);
  79  |   await page.evaluate(origin => window.dispatchEvent(new MessageEvent('message', {
  80  |     origin, source: window, data: { type: 'zp-ready' },
  81  |   })), zoomOrigin);
  82  |   expect(await call(page)).toContain('still loading');
  83  |   expect(calls).toHaveLength(0);
  84  |   expect(await commands(page)).toEqual([]);
  85  | });
  86  | 
  87  | test('ready initializes the widget; call preserves case intent and shows manual fallback without redial', async ({ page }) => {
  88  |   const calls = await setup(page);
  89  |   await emit(page, 'zp-ready');
  90  |   expect(await call(page)).toBe('');
  91  |   expect(calls).toEqual([{ agent_id: 1 }]);
  92  |   await expect.poll(async () => (await commands(page)).length).toBe(2);
  93  |   expect((await commands(page))[0].type).toBe('zp-init-config');
  94  |   expect((await commands(page))[1]).toEqual({
  95  |     type: 'zp-make-call', data: { number: destination, callerId, autoDial: true },
  96  |   });
  97  |   await page.clock.fastForward(13000);
  98  |   await expect(page.getByRole('alert')).toContainText('Call start not confirmed');
  99  |   await expect(page.getByRole('link', { name: 'open this call in Zoom desktop' }))
  100 |     .toHaveAttribute('href', `zoomphonecall://${destination}?callerid=${encodeURIComponent(callerId)}`);
  101 |   await page.clock.fastForward(60000);
  102 |   expect((await commands(page)).filter(c => c.type === 'zp-make-call')).toHaveLength(1);
  103 |   expect(calls).toHaveLength(1);
  104 | });
  105 | 
  106 | test('unrelated calls do not confirm this request; matching outbound ring clears the warning', async ({ page }) => {
  107 |   await setup(page);
  108 |   await emit(page, 'zp-ready');
  109 |   await call(page);
  110 |   await emit(page, 'zp-call-ringing-event', { direction: 'inbound', callee: { phoneNumber: destination } });
  111 |   await emit(page, 'zp-call-ringing-event', { direction: 'outbound', callee: { phoneNumber: '+441632960003' } });
  112 |   await page.clock.fastForward(13000);
  113 |   await expect(page.getByRole('alert')).toBeVisible();
  114 |   await emit(page, 'zp-call-ringing-event', { direction: 'outbound', callee: { phoneNumber: '+44 1632 960001' } });
  115 |   await expect(page.getByRole('alert')).toHaveCount(0);
  116 | });
  117 | 
  118 | test('a timely connected event cancels the warning and unmount clears timers', async ({ page }) => {
  119 |   await setup(page);
  120 |   await emit(page, 'zp-ready');
  121 |   await call(page);
  122 |   await emit(page, 'zp-call-connected-event', { direction: 'outbound', callee: { phoneNumber: destination } });
  123 |   await page.clock.fastForward(13000);
  124 |   await expect(page.getByRole('alert')).toHaveCount(0);
  125 |   await call(page);
  126 |   await page.evaluate(() => (window as unknown as { root: { unmount: () => void } }).root.unmount());
  127 |   await page.clock.fastForward(13000);
  128 |   const notices = await page.evaluate(() => (window as unknown as { notifications: string[] }).notifications);
  129 |   expect(notices.filter(n => n.includes('not confirmed'))).toEqual([]);
  130 | });
  131 | 
```