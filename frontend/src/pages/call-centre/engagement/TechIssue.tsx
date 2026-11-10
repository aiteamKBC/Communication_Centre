import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { post } from '../api';
import type { Session } from './actions';
import Dialog from './Dialog';

const SUBCATEGORIES: [string, string][] = [['LMS', 'LMS'], ['Aptem', 'Aptem'], ['Teams', 'Microsoft Teams'], ['Others', 'Something else']];
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Try again.');

/** "Report technical issue": raises the learner's issue in the technical support system and opens a case to follow it. */
export default function TechIssue({ caseId, learner, session, notify, onRaised, className }: {
  caseId: number; learner: string; session: Session; notify: (message: string, error?: boolean) => void; onRaised: () => void; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const blocked = session.preview ? 'Read-only preview'
    : !session.helpdesk ? 'Technical support is not connected on this server (CALLCENTRE_HELPDESK_URL)'
      : !session.canAct ? 'Your account cannot act on this desk' : '';
  return (
    <>
      <button type="button" className={className} disabled={!!blocked} title={blocked || undefined} onClick={() => setOpen(true)}>
        Report technical issue
      </button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        {open && <TechIssueForm caseId={caseId} learner={learner} session={session}
          onDone={ticket => { setOpen(false); notify(`Ticket ${ticket} raised in technical support. Follow it in Technical issues.`); onRaised(); }} />}
      </Dialog>
    </>
  );
}

function TechIssueForm({ caseId, learner, session, onDone }: { caseId: number; learner: string; session: Session; onDone: (ticket: string) => void }) {
  // One id per opened form: a double click or retry can never raise two tickets.
  const requestKey = useMemo(() => crypto.randomUUID(), []);
  const [subcategory, setSubcategory] = useState('LMS');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const valid = description.trim().length >= 10;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !valid) return;
    setSaving(true); setError('');
    try {
      const result = await post<{ ticket: string }>(`tickets/${caseId}/tech-issue/`, session.csrf, {
        agent_id: session.agentId, subcategory, description: description.trim(), request_key: requestKey,
      });
      onDone(result.ticket);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ec-form" onSubmit={submit}>
      <h2 className="wide">Report a technical issue for {learner}</h2>
      <p className="wide ec-muted">This raises a ticket in the KBC technical support system for the learner’s email. A Technical issues case follows it: when support closes the ticket, call the learner to confirm it is fixed.</p>
      <label>The issue is with
        <select value={subcategory} disabled={saving} onChange={event => setSubcategory(event.target.value)}>
          {SUBCATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="wide">What is wrong?
        <textarea rows={5} maxLength={3000} required disabled={saving} value={description} placeholder="What the learner was trying to do, what happened, any error message, and since when."
          onChange={event => setDescription(event.target.value)} />
      </label>
      {error && <p className="wide ec-alert" role="alert">{error}</p>}
      <div className="wide ec-buttons">
        <button type="submit" className="primary" disabled={saving || !valid}>{saving ? 'Raising ticket…' : 'Raise ticket'}</button>
      </div>
    </form>
  );
}
