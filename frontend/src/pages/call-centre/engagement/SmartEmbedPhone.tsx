import { useEffect, useRef, useState } from 'react';
import { post } from '../api';
import { ZOOM_EMBED_URL, ZOOM_ORIGIN, attachPhone, markPhoneReady } from './smartEmbed';

type Props = { csrf: string; notify: (message: string, error?: boolean) => void; onCallLogged: () => void };

// Zoom's call record usually reaches the case within a minute of the call ending; refresh twice to pick it up.
const REFRESH_AFTER_MS = [45000, 90000];

/** The specialist's Zoom phone, docked in the corner of the Engagement Centre (Zoom Phone Smart Embed).
 * The iframe stays mounted so the specialist stays signed in while moving between screens. */
export default function SmartEmbedPhone({ csrf, notify, onCallLogged }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [open, setOpen] = useState(false);
  const timers = useRef<number[]>([]);
  const dialTimer = useRef<number | undefined>(undefined);
  const pendingDial = useRef<{ number: string; desktopUrl?: string } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<{ desktopUrl?: string } | null>(null);
  // The latest callbacks, without re-adding the message listener on every render.
  const latest = useRef({ csrf, notify, onCallLogged });
  latest.current = { csrf, notify, onCallLogged };

  useEffect(() => {
    if (frame.current) attachPhone({
      frame: frame.current, show: () => setOpen(true),
      onDial: (number, desktopUrl) => {
        window.clearTimeout(dialTimer.current);
        setUnconfirmed(null);
        pendingDial.current = { number, desktopUrl };
        // Lack of an event does not prove failure. Offer a manual route, never auto-redial.
        dialTimer.current = window.setTimeout(() => {
          setUnconfirmed({ desktopUrl });
          setOpen(true);
          latest.current.notify('Zoom has not confirmed that the call started. Check the Phone panel.', true);
        }, 12000);
      },
    });
    return () => {
      attachPhone(null);
      window.clearTimeout(dialTimer.current);
    };
  }, []);

  useEffect(() => {
    const pending = timers.current;
    function ended() {
      const { csrf: token, notify: say, onCallLogged: logged } = latest.current;
      // Only a nudge for the worker: the result and the case evidence come from Zoom's own call history.
      void post('call-sync/', token, {}).catch(() => undefined);
      say('Call ended. Zoom’s record of it usually reaches the case within a minute.');
      REFRESH_AFTER_MS.forEach(delay => pending.push(window.setTimeout(logged, delay)));
    }
    function receive(event: MessageEvent) {
      if (event.origin !== ZOOM_ORIGIN || event.source !== frame.current?.contentWindow) return;
      const type = (event.data as { type?: string } | null)?.type;
      if (type === 'zp-ready') {
        configure();
        markPhoneReady();
        return;
      }
      const direction = (event.data as { data?: { direction?: string } } | null)?.data?.direction;
      if (direction && direction !== 'outbound') return;
      const callee = (event.data as { data?: { callee?: { phoneNumber?: string } } } | null)?.data?.callee?.phoneNumber;
      const digits = (value: string) => value.replace(/\D/g, '');
      if (direction === 'outbound' && typeof callee === 'string' && pendingDial.current
        && digits(callee) === digits(pendingDial.current.number)
        && ['zp-call-ringing-event', 'zp-call-connected-event', 'zp-call-ended-event'].includes(type || '')) {
        window.clearTimeout(dialTimer.current);
        pendingDial.current = null;
        setUnconfirmed(null);
      }
      if (type === 'zp-call-connected-event') latest.current.notify('Connected. Record what was agreed when the call ends.');
      else if (type === 'zp-call-ended-event') ended();
    }
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      pending.forEach(timer => window.clearTimeout(timer));
    };
  }, []);

  function configure() {
    // Nothing is logged in Zoom from here and no contacts or AI summaries are shared with the page.
    frame.current?.contentWindow?.postMessage({
      type: 'zp-init-config',
      data: {
        enableSavingLog: false, enableAutoLog: false, enableContactSearching: false, enableContactMatching: false,
        enableAISummary: false, disableInactiveTabCallEvent: true,
      },
    }, ZOOM_ORIGIN);
  }

  return (
    <div className={`ec-phone-dock${open ? ' is-open' : ''}`}>
      {open && unconfirmed && (
        <div role="alert" style={{ width: 360, maxWidth: '100%', padding: 12, background: '#fff8e8', border: '1px solid #d8b36a', borderRadius: 8 }}>
          <strong>Call start not confirmed</strong>
          <p>Check that Zoom desktop and this Phone panel use the same account, allow call control, and that the selected caller ID is available.</p>
          {unconfirmed.desktopUrl?.startsWith('zoomphonecall://') && (
            <p>If no call is ringing or connected, <a href={unconfirmed.desktopUrl}>open this call in Zoom desktop</a>.</p>
          )}
          <button type="button" onClick={() => setUnconfirmed(null)}>Dismiss</button>
        </div>
      )}
      <div className="ec-phone-panel" aria-hidden={!open}>
        <iframe
          ref={frame} id="zoom-embeddable-phone-iframe" title="Zoom Phone" src={ZOOM_EMBED_URL}
          allow={`clipboard-read; clipboard-write ${ZOOM_ORIGIN}`}
        />
      </div>
      <button type="button" className="ec-phone-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? 'Hide phone' : '📞 Phone'}
      </button>
    </div>
  );
}
