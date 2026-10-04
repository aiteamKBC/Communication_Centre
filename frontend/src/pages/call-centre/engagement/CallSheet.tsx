import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Overview, OverviewCase } from '../api';
import { callDisabledReason, caseAction, saveOutcome } from './actions';
import type { Session } from './actions';
import BookSession from './BookSession';
import BookingEmail from './BookingEmail';
import Dialog from './Dialog';
import SatisfactionFeedback from './SatisfactionFeedback';
import SatisfactionEmail from './SatisfactionEmail';
import type { CallTab } from './model';
import { callGroups, outcomeChoices, outcomeHelp, splitOutcome, categoryCases, contactKey, dueForCall, issueLabel, matchesSearch, shortDate, uniqueLearners } from './model';

type Draft = { outcome: string; notes: string; next_contact: string; dirty: boolean; status?: string; error?: string };
type Props = {
  overview: Overview; tab: CallTab; session: Session;
  onOpen: (id: number) => void; onSaved: () => void; notify: (message: string, error?: boolean) => void;
};

/** The quick call register: one row per contact, call, record the outcome and save the row. */
export default function CallSheet({ overview, tab, session, onOpen, onSaved, notify }: Props) {
  const [drafts, setDrafts] = useState<Map<number, Draft>>(new Map());
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('all');
  const [scope, setScope] = useState(tab.key === 'learner_satisfaction' ? 'due' : 'all');
  const [mode, setMode] = useState('coach');
  const [selected, setSelected] = useState('');
  const [emailCase, setEmailCase] = useState<number | null>(null);
  const [feedbackCase, setFeedbackCase] = useState<OverviewCase | null>(null);
  const [satisfactionEmail, setSatisfactionEmail] = useState<OverviewCase | null>(null);

  const eligible = useMemo(() => categoryCases(overview.cases, tab.key, overview.today), [overview, tab.key]);
  const groups = useMemo(() => callGroups(eligible, mode), [eligible, mode]);
  const group = groups.find(g => g.key === selected);
  const rows = useMemo(() => {
    const chosen = new Map<string, OverviewCase>();
    for (const c of eligible) {
      if ((reason !== 'all' && c.source_type !== reason) || (scope === 'due' && !dueForCall(c))
        || (group && !group.cases.some(x => x.id === c.id)) || !matchesSearch(c, search)) continue;
      const key = contactKey(c);
      const old = chosen.get(key);
      if (!old || (drafts.has(c.id) && !drafts.has(old.id))) chosen.set(key, c);
    }
    return [...chosen.values()];
  }, [eligible, reason, scope, group, search, drafts]);

  const update = (c: OverviewCase, field: 'outcome' | 'notes' | 'next_contact', value: string) => setDrafts(current => {
    const next = new Map(current);
    const draft = next.get(c.id) || { outcome: '', notes: '', next_contact: c.next_followup_at?.slice(0, 10) || '', dirty: false };
    next.set(c.id, { ...draft, [field]: value, dirty: true, status: undefined, error: undefined });
    return next;
  });

  async function save(c: OverviewCase) {
    const draft = drafts.get(c.id);
    if (!draft?.dirty || saving.has(c.id) || session.preview) return;
    setSaving(current => new Set(current).add(c.id));
    try {
      if (!draft.outcome) throw new Error('Choose an outcome first.');
      if (draft.notes.trim().length < 10) throw new Error('Add a short note: what was agreed and the next action (at least 10 characters).');
      if (draft.outcome === 'callback' && !draft.next_contact) throw new Error('Choose the follow-up date for the callback.');
      await saveOutcome(session, c.id, {
        ...splitOutcome(draft.outcome), note: draft.notes.trim(),
        callback_at: draft.next_contact && (draft.outcome === 'callback' || (c.source_type === 'learner_satisfaction' && draft.outcome === 'no_answer'))
          ? new Date(`${draft.next_contact}T09:00`).toISOString() : null,
      });
      setDrafts(current => new Map(current).set(c.id, { ...draft, dirty: false, status: 'Saved' }));
      onSaved();
    } catch (reason) {
      setDrafts(current => new Map(current).set(c.id, { ...draft, error: reason instanceof Error ? reason.message : 'Save failed.' }));
    } finally {
      setSaving(current => {
        const next = new Set(current);
        next.delete(c.id);
        return next;
      });
    }
  }

  async function call(c: OverviewCase) {
    try {
      await caseAction(session, c.id, 'call');
      notify(`Zoom Phone opened for ${c.learner_name}. Update the row during the call, then save once Zoom reports it.`);
      onSaved();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The call could not start.', true);
    }
  }

  const onKey = (event: KeyboardEvent, c: OverviewCase) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void save(c);
    }
  };

  return (
    <section className="ec-card ed-sheet">
      <p className="ec-muted">{tab.hint}</p>
      {!!tab.reasons.length && (
        <nav className="ec-tabs ed-reasons" aria-label="Call types">
          <button type="button" aria-pressed={reason === 'all'} onClick={() => setReason('all')}>All ({uniqueLearners(eligible).length})</button>
          {tab.reasons.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={reason === key} onClick={() => setReason(key)}>{label} ({uniqueLearners(eligible.filter(c => c.source_type === key)).length})</button>
          ))}
        </nav>
      )}
      <div className="ed-sheet-toolbar">
        <input type="search" aria-label="Search the call sheet" placeholder="Find a name, number or coach…" value={search} onChange={event => setSearch(event.target.value)} />
        <select aria-label="Filter call reason" value={reason} onChange={event => setReason(event.target.value)}>
          <option value="all">All call reasons</option>
          {[...new Set(eligible.map(c => c.source_type))].map(key => <option key={key} value={key}>{issueLabel({ source_type: key, issue_name: key })}</option>)}
        </select>
        <select aria-label="Follow-up timing" value={scope} onChange={event => setScope(event.target.value)}>
          <option value="all">All active</option><option value="due">Due now</option>
        </select>
        <select aria-label="Group calls by" value={mode} onChange={event => { setMode(event.target.value); setSelected(''); }}>
          {[['coach', 'Group by coach'], ['class', 'Group by class'], ['programme', 'Group by programme']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Choose a call group" value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="">All groups</option>
          {groups.map(g => <option key={g.key} value={g.key}>{g.label} · {g.purpose} ({g.cases.length})</option>)}
        </select>
      </div>
      <p className="ed-sheet-hint">
        Call, update the row, then Save. {session.preview
          ? `Calls are disabled in the director preview. ${session.name} must sign in to call. `
          : !session.agentId ? 'Ask a manager to set up your agent profile before calling. '
            : 'Zoom Phone opens with your caller ID; keep the Zoom desktop app signed in. '}
        An outcome is saved against the call Zoom reports, so save once the call has synced.
      </p>
      <div id="ed-sheet-body">
        <div className="ed-sheet-count">{rows.length} {rows.length === 1 ? 'contact' : 'contacts'} · Priority order · One row per contact <span>Tab between fields · Ctrl/⌘ + Enter to save a row</span></div>
        <div className="ed-sheet-scroll" tabIndex={0} role="region" aria-label="Quick call register">
          <table className="ed-sheet-table">
            <caption className="ed-sr-only">Learner calls. Edit the outcome, notes and follow-up date, then save that row.</caption>
            <thead><tr>{['Learner / phone', 'Call reason / coach', 'Call', 'Coach appointment', 'Outcome', 'Notes / agreed action', 'Follow-up', 'Save'].map(head => <th key={head} scope="col">{head}</th>)}</tr></thead>
            <tbody>
              {rows.map(c => {
                const d = drafts.get(c.id);
                const callReason = callDisabledReason(c, session);
                const disabled = session.preview || !session.canAct;
                return (
                  <tr key={c.id} data-sheet-row={c.id} className={d?.dirty ? 'is-dirty' : ''} onKeyDown={event => onKey(event, c)}>
                    <th scope="row">
                      <strong>{c.source_type === 'satisfaction' ? c.manager_name || c.learner_name : c.learner_name}</strong>
                      <span>{c.learner_phone || 'No phone recorded'}</span>
                      {c.source_type === 'learner_satisfaction' && <span>{c.programme_status}</span>}
                      <details>
                        <summary>Contact details</summary>
                        <span>{c.learner_email || 'Email not recorded'}</span>
                        <span>{c.programme || 'Programme not recorded'}</span>
                        <span>{c.organisation || 'Employer not recorded'}</span>
                        {c.manager_email && <span>Line manager: {c.manager_name || c.manager_email}</span>}
                      </details>
                    </th>
                    <td>
                      <strong>{issueLabel(c)}</strong>
                      <span>{c.coach || 'Coach not recorded'}</span>
                      {c.source_type === 'attendance' && c.issue_date && <span>{c.issue_date} · {c.issue_name}</span>}
                      {c.booking_at && <span>{shortDate(c.booking_at)} · {c.issue_name}</span>}
                      <small>{c.claimed_by ? `In progress: ${c.claimed_by}` : c.promise_missed ? 'Promise missed: call again' : c.missed_call ? `Missed call · ${c.attempts} of 3` : dueForCall(c) ? 'Due now' : `Follow-up ${shortDate(c.next_followup_at || c.due_at)}`}</small>
                      <button type="button" className="ed-sheet-link" onClick={() => onOpen(c.id)}>Full case</button>
                    </td>
                    <td>
                      <button type="button" className="primary" aria-label={`${session.preview ? 'Preview only: ' : 'Call '}${c.learner_name}`} disabled={!!callReason} title={callReason || undefined} onClick={() => void call(c)}>
                        {session.preview ? 'Preview' : 'Call'}
                      </button>
                      {callReason && <span className="ed-call-reason">{callReason}</span>}
                      {['learner_satisfaction', 'satisfaction'].includes(c.source_type) && <button type="button"
                        className="ed-sheet-link" disabled={disabled || !(c.source_type === 'satisfaction' ? c.manager_email : c.learner_email)}
                        title="Prepare an email; Azure sending is not connected yet" onClick={() => setSatisfactionEmail(c)}>Email</button>}
                    </td>
                    <td className="ed-booking-cell">
                      <strong>{c.coach || 'Coach not recorded'}</strong>
                      <BookSession caseId={c.id} session={session} notify={notify} onBooked={onSaved} />
                      {!['satisfaction', 'signature'].includes(c.source_type) && <button type="button" className="ed-sheet-link" disabled={session.preview} onClick={() => setEmailCase(c.id)}>Booking email</button>}
                      <small>{session.preview ? 'Read-only preview' : c.bookable.includes('catch-up') ? 'Catch-up or support, in the LMS calendar' : 'Support session, in the LMS calendar'}</small>
                    </td>
                    <td>
                      <select aria-label={`Outcome for ${c.learner_name}`} disabled={disabled} value={d?.outcome || ''} onChange={event => update(c, 'outcome', event.target.value)}>
                        <option value="">Choose outcome…</option>
                        {outcomeChoices(c).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {d?.outcome && <small>{outcomeHelp(d.outcome, c)}</small>}
                      {c.source_type === 'learner_satisfaction' && <button type="button" className="ed-sheet-link"
                        disabled={disabled} onClick={() => setFeedbackCase(c)}>Complete feedback</button>}
                    </td>
                    <td>
                      <textarea rows={2} maxLength={3500} aria-label={`Notes and action for ${c.learner_name}`} placeholder="What was agreed? Who will do what, by when?" disabled={disabled} value={d?.notes || ''} onChange={event => update(c, 'notes', event.target.value)} />
                    </td>
                    <td>
                      <input type="date" aria-label={`Follow-up date for ${c.learner_name}`} disabled={disabled} value={d?.next_contact ?? c.next_followup_at?.slice(0, 10) ?? ''} onChange={event => update(c, 'next_contact', event.target.value)} />
                    </td>
                    <td>
                      <button type="button" disabled={disabled || !d?.dirty || saving.has(c.id)} onClick={() => void save(c)}>{saving.has(c.id) ? 'Saving…' : 'Save'}</button>
                      <span className={`ed-row-status ${d?.error ? 'danger' : ''}`} role="status">{d?.error || d?.status || (d?.dirty ? 'Unsaved' : '')}</span>
                      {d?.dirty && (
                        <button type="button" className="ed-sheet-link" disabled={saving.has(c.id)} onClick={() => setDrafts(current => { const next = new Map(current); next.delete(c.id); return next; })}>Discard edits</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={8}><div className="ec-empty"><h3>No calls in this view</h3><p>Calls appear when matching records are available. Check Connections & call rules for source coverage.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={emailCase !== null} onClose={() => setEmailCase(null)}>
        {emailCase !== null && <BookingEmail caseId={emailCase} session={session} />}
      </Dialog>
      <Dialog open={feedbackCase !== null} onClose={() => setFeedbackCase(null)}>
        {feedbackCase && <SatisfactionFeedback key={feedbackCase.id} caseId={feedbackCase.id} name={feedbackCase.learner_name}
          session={session} onSaved={() => { setFeedbackCase(null); onSaved(); notify('Feedback completed. Next review is due in three calendar months.'); }} />}
      </Dialog>
      <Dialog open={satisfactionEmail !== null} onClose={() => setSatisfactionEmail(null)}>
        {satisfactionEmail && <SatisfactionEmail key={satisfactionEmail.id} employer={satisfactionEmail.source_type === 'satisfaction'}
          recipient={satisfactionEmail.source_type === 'satisfaction' ? satisfactionEmail.manager_email : satisfactionEmail.learner_email}
          name={satisfactionEmail.source_type === 'satisfaction' ? satisfactionEmail.manager_name || satisfactionEmail.learner_name : satisfactionEmail.learner_name} />}
      </Dialog>
    </section>
  );
}
