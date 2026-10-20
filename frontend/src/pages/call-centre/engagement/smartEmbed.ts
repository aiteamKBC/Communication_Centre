/** Zoom Phone Smart Embed: the specialist's Zoom phone inside the page.
 * https://developers.zoom.us/docs/phone/smart-embed-guide/ */
export const ZOOM_ORIGIN = 'https://applications.zoom.us';
export const ZOOM_EMBED_URL = `${ZOOM_ORIGIN}/integration/phone/embeddablephone/home`;

let phone: {
  frame: HTMLIFrameElement;
  show: () => void;
  onDial?: (number: string, desktopUrl?: string) => void;
} | null = null;
let ready = false;

/** The mounted phone registers itself; null when it unmounts. */
export function attachPhone(value: typeof phone) {
  phone = value;
  ready = false;
}

/** Zoom's SDK invokes onZoomPhoneIframeApiReady on the iframe's zp-ready message.
 * This confirms API readiness, not authentication or desktop calling permission. */
export function markPhoneReady() {
  if (phone) ready = true;
}

/** Run before creating a case call intent. Never queue a call to dial later on sign-in. */
export function preparePhoneCall() {
  if (!phone) return;
  phone.show();
  if (!ready || !phone.frame.contentWindow) {
    throw new Error('Zoom Phone is still loading. Open Phone, finish signing in, then press Call again.');
  }
}

/** True means the command was sent, not that Zoom started a call.
 * False only when no in-page phone is mounted, allowing the desktop route. */
export function dialInPage(number: string, callerId?: string | null, desktopUrl?: string) {
  preparePhoneCall();
  const target = phone?.frame.contentWindow;
  if (!phone || !target) return false;
  target.postMessage({ type: 'zp-make-call', data: { number, ...(callerId ? { callerId } : {}), autoDial: true } }, ZOOM_ORIGIN);
  phone.onDial?.(number, desktopUrl);
  return true;
}
