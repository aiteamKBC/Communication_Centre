import { useEffect, useRef, useState } from 'react';
import { post } from '../api';
import type { Session } from './actions';

type Check = { key: string; label: string; state: 'ok' | 'warning' | 'missing'; detail: string };
type Draft = {
  recipient: string; subject: string; message: string; text: string; html: string;
  link: { label: string; url: string }; checks: Check[]; mode: 'dry_run' | 'live';
};
type Delivery = { id: number; status: string; mode: string; recipient: string; error: string };

const EMAIL_CHECKS = new Set(['recipient', 'link']);
const STATE_TEXT = { ok: 'Ready', warning: 'Check', missing: 'Missing' };
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Try again.');

/** The booking email for one case: the college template with only this case's link, a live preview and what sending still needs. */
export default function BookingEmail({ caseId, session }: { caseId: number; session: Session }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Delivery | null>(null);
  const [sendError, setSendError] = useState('');
  // One id per email: a retry after a lost answer returns the same delivery instead of sending twice.
  const requestId = useRef(crypto.randomUUID());
  const latest = useRef(0);

  // The server owns the template: render the default, then re-render the reworded draft shortly after typing stops.
  const wording = edited ? JSON.stringify({ subject, message }) : '';
  useEffect(() => {
    const request = ++latest.current;
    const timer = window.setTimeout(() => {
      post<Draft>(`tickets/${caseId}/booking-email/`, session.csrf, { agent_id: session.agentId, ...(wording ? JSON.parse(wording) : {}) })
        .then(value => {
          if (request !== latest.current) return;
          setDraft(value);
          setError('');
          if (!wording) { setSubject(value.subject); setMessage(value.message); }
        })
        .catch(reason => { if (request === latest.current) setError(errorText(reason)); });
    }, wording ? 400 : 0);
    return () => window.clearTimeout(timer);
  }, [caseId, session.csrf, session.agentId, wording]);

  async function copy() {
    if (!draft) return;
    try {
      if (typeof ClipboardItem === 'undefined') await navigator.clipboard.writeText(draft.text);
      else await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([draft.html], { type: 'text/html' }), 'text/plain': new Blob([draft.text], { type: 'text/plain' }),
      })]);
      setCopied('Email copied. Open a new email, then paste it in. Nothing has been sent.');
    } catch {
      setCopied('The browser blocked copying. Select the preview and copy it instead.');
    }
  }

  async function send() {
    if (sending || sent) return;
    setSending(true);
    setSendError('');
    try {
      const delivery = await post<Delivery>(`tickets/${caseId}/booking-email/send/`, session.csrf, {
        agent_id: session.agentId, request_id: requestId.current, subject, message,
      });
      if (delivery.status === 'failed' || delivery.status === 'unknown') setSendError(delivery.error);
      else setSent(delivery);
    } catch (reason) {
      setSendError(`${errorText(reason)} Pressing Send again checks this same email; it is never sent twice.`);
    } finally {
      setSending(false);
    }
  }

  if (!draft) return <><h2>Booking email</h2>{error ? <p className="ec-alert" role="alert">{error}</p> : <p className="ec-muted" role="status">Preparing the email…</p>}</>;

  const groups: [string, Check[]][] = [
    ['This email', draft.checks.filter(c => EMAIL_CHECKS.has(c.key))],
    ['Sending it from the call centre', draft.checks.filter(c => !EMAIL_CHECKS.has(c.key))],
  ];
  const mailto = `mailto:${encodeURIComponent(draft.recipient)}?subject=${encodeURIComponent(draft.subject)}`;
  const blocked = draft.checks.find(c => c.state === 'missing' && (c.key === 'recipient' || c.key === 'quota'
    || (c.key === 'gateway' && draft.mode === 'live')));
  const dryRun = draft.mode !== 'live';
  const sentText = sent && (sent.status === 'dry_run'
    ? `Recorded on the case (dry run): nothing was sent to ${sent.recipient}.`
    : `Accepted by Microsoft 365 for ${sent.recipient} and recorded on the case.`);

  return (
    <div id="ed-booking-email">
      <h2>Booking email</h2>
      <p className="ec-muted">College template with only this case’s booking link. Nothing is sent automatically.</p>
      <div className="ed-email-grid">
        <div className="ed-email-edit">
          <label>To<input value={draft.recipient} readOnly /></label>
          <label>Subject<input value={subject} maxLength={180} disabled={!!sent} onChange={event => { setEdited(true); setSubject(event.target.value); }} /></label>
          <label>Message<textarea rows={9} maxLength={5000} value={message} disabled={!!sent} onChange={event => { setEdited(true); setMessage(event.target.value); }} /></label>
          <p className="ec-muted">The greeting, the “{draft.link.label}” button and the sign-off are added for you.</p>
          {edited && !sent && <button type="button" className="ed-sheet-link" onClick={() => setEdited(false)}>Reset to the standard wording</button>}
          {error && <p className="ec-alert" role="alert">{error}</p>}
          <div className="ec-buttons">
            <button type="button" className="primary" onClick={() => void send()}
              disabled={sending || !!sent || !!blocked || !session.canAct || session.preview || !subject.trim() || !message.trim()}>
              {sending ? 'Sending…' : sent ? (sent.status === 'dry_run' ? 'Recorded' : 'Sent') : dryRun ? 'Send (dry run: record only)' : 'Send email'}
            </button>
            <button type="button" onClick={() => void copy()}>Copy email</button>
            <a className="ec-button" href={mailto}>Open in my mail app</a>
          </div>
          {blocked && !sent && <p className="ec-muted">Send needs: {blocked.label.toLowerCase()}. {blocked.detail}</p>}
          {sendError && <p className="ec-alert" role="alert">{sendError}</p>}
          <p role="status">{sentText || copied}</p>
        </div>
        <iframe className="ed-email-preview" title="Email preview" sandbox="" srcDoc={draft.html} />
      </div>
      <section className="ed-email-checks" aria-label="What this email needs before it can be sent">
        {groups.map(([title, checks]) => (
          <div key={title}>
            <h3>{title}</h3>
            <ul>
              {checks.map(check => (
                <li key={check.key} className={`is-${check.state}`}>
                  <strong>{STATE_TEXT[check.state]}</strong> <span>{check.label}</span>
                  {check.detail && <small>{check.detail}</small>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
