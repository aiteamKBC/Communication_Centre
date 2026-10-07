/** Zoom Phone Smart Embed: the specialist's Zoom phone inside the page.
 * https://developers.zoom.us/docs/phone/smart-embed-guide/ */
export const ZOOM_ORIGIN = 'https://applications.zoom.us';
export const ZOOM_EMBED_URL = `${ZOOM_ORIGIN}/integration/phone/embeddablephone/home`;

let phone: { frame: HTMLIFrameElement; show: () => void } | null = null;

/** The mounted phone registers itself; null when it unmounts. */
export function attachPhone(value: typeof phone) {
  phone = value;
}

/** Dial in the page. False when the in-page phone is not there, so the caller opens the desktop app instead. */
export function dialInPage(number: string, callerId?: string | null) {
  const target = phone?.frame.contentWindow;
  if (!phone || !target) return false;
  phone.show();
  target.postMessage({ type: 'zp-make-call', data: { number, ...(callerId ? { callerId } : {}), autoDial: true } }, ZOOM_ORIGIN);
  return true;
}
