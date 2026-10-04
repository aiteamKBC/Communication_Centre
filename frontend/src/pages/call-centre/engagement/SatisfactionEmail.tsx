import { useState } from 'react';

/** Draft-only composer. Future Azure delivery must use an authenticated server endpoint,
 * never client credentials, mailto, or the legacy n8n reminder pipeline. */
export default function SatisfactionEmail({ recipient, name, employer }: {
  recipient: string; name: string; employer: boolean;
}) {
  const [subject, setSubject] = useState(`KBC: ${employer ? 'employer' : 'learner'} satisfaction follow-up`);
  const [message, setMessage] = useState(`Hello ${name},\n\nWe would like to hear about your experience with Kent Business College. What is going well, what could we improve, and is there any support you need?\n\nPlease reply with your feedback or a convenient time to speak.\n\nKind regards,\nKBC Learner Support`);
  const [status, setStatus] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(`To: ${recipient}\nSubject: ${subject}\n\n${message}`);
      setStatus('Draft copied. Nothing has been sent or saved.');
    } catch {
      setStatus('Copy is unavailable. Select and copy the message manually.');
    }
  }

  return <>
    <h2>{employer ? 'Employer' : 'Learner'} satisfaction email</h2>
    <p className="ec-alert">Azure email sending is not connected yet. This is a draft only; closing this window discards it. No email will be sent or queued.</p>
    <div className="ec-form">
      <label className="wide">To<input value={recipient} readOnly /></label>
      <label className="wide">Subject<input maxLength={180} value={subject} onChange={event => setSubject(event.target.value)} /></label>
      <label className="wide">Message<textarea rows={10} maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} /></label>
      <div className="ec-buttons wide">
        <button type="button" onClick={() => void copy()}>Copy draft</button>
        <button type="button" className="primary" disabled title="Connect the Azure email application first">Send via Azure — not connected</button>
      </div>
      <p className="ec-muted wide">Sending an email does not complete a satisfaction review.</p>
      <p className="wide" role="status">{status}</p>
    </div>
  </>;
}
