import { useEffect, useRef, useState } from 'react';
import { api, post } from '../api';
import type { Session } from './actions';

type Draft = { recipient: string; name: string; sender: string; subject: string; message: string; can_send: boolean; reason: string };
type Delivery = { id: number; status: string; recipient: string; error: string };

/** Credentials and recipient selection stay on the server. Only an explicit click sends. */
export default function SatisfactionEmail({ caseId, session, employer }: {
  caseId: number; session: Session; employer: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finished, setFinished] = useState(false);
  const sending = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const path = `tickets/${caseId}/satisfaction-email/`;

  useEffect(() => {
    let active = true;
    api<Draft>(`${path}?agent_id=${session.agentId || ''}`).then(value => {
      if (!active) return;
      setDraft(value); setSubject(value.subject); setMessage(value.message);
    }).catch(error => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, [path, session.agentId]);

  async function send() {
    if (sending.current || finished || !draft?.can_send || !session.canAct || session.preview) return;
    sending.current = true;
    setBusy(true); setSubmitted(true); setStatus('Sending to Microsoft 365…');
    try {
      const delivery = await post<Delivery>(path, session.csrf, {
        request_id: requestId.current, agent_id: session.agentId, subject, message,
      });
      if (delivery.status === 'accepted') {
        setStatus(`Accepted by Microsoft 365 for ${delivery.recipient}. Delivery is not yet confirmed. The review remains open.`);
        setFinished(true);
      } else if (delivery.status === 'sending') {
        setStatus('The email is still processing. Check status before sending another message.');
      } else {
        setStatus(delivery.error || 'The email was not accepted.');
        setFinished(true);
      }
    } catch (error) {
      setStatus(`${(error as Error).message} Use “Check / retry request” to check this same request without duplicating it.`);
    } finally {
      sending.current = false; setBusy(false);
    }
  }

  return <>
    <h2>{employer ? 'Employer' : 'Learner'} satisfaction email</h2>
    {!draft && !status && <p>Loading email settings…</p>}
    {draft && <div className="ec-form">
      <p className="ec-muted wide">From: {draft.sender}. The greeting and college sign-off are added automatically.</p>
      {!draft.can_send && <p className="ec-alert wide">{draft.reason}</p>}
      <label className="wide">To<input value={draft.recipient} readOnly /></label>
      <label className="wide">Subject<input maxLength={180} value={subject} disabled={submitted} onChange={event => setSubject(event.target.value)} /></label>
      <label className="wide">Message<textarea rows={10} maxLength={5000} value={message} disabled={submitted} onChange={event => setMessage(event.target.value)} /></label>
      <div className="ec-buttons wide">
        <button type="button" className="primary" onClick={() => void send()}
          disabled={busy || finished || !draft.can_send || !session.canAct || session.preview || !subject.trim() || !message.trim()}>
          {busy ? 'Sending…' : finished ? 'Request recorded' : submitted ? 'Check / retry request' : 'Send via Azure'}
        </button>
      </div>
      <p className="ec-muted wide">Only sends when you click. Sending an email does not complete a satisfaction review.</p>
    </div>}
    <p role="status">{status}</p>
  </>;
}
