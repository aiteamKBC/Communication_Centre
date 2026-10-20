import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Overview, OverviewCase } from '../api';
import { callDisabledReason, caseAction, saveOutcome } from './actions';
import type { Session } from './actions';
import BookSession from './BookSession';
import BookingEmail from './BookingEmail';
import Dialog from './Dialog';
import SatisfactionFeedback from './SatisfactionFeedback';
import SatisfactionEmail from './SatisfactionEmail';
import TechIssue from './TechIssue';
import CaseDates from './CaseDates';
import { matchesTicketDate, orderTickets, TICKET_ORDERS, type TicketOrder } from './ticketOrder';
import type { CallTab } from './model';
import { ISSUE_LABELS, QUICK_FOLLOW_UPS, bookingHint, closesCase, longDate, workdayInput, helpdeskStatus, londonInput, outcomeChoices, outcomeHelp, splitOutcome, categoryCases, contactKey, dueForCall, isSatisfaction, issueLabel, matchesSearch, satisfactionRecipient, shortDate, uniqueLearners } from './model';

type Draft = { outcome: string; notes: string; next_contact: string; dirty: boolean; status?: string; error?: string };
const PAGE_SIZE = 20;
type Props = {
  overview: Overview; tab: CallTab; session: Session;
  onOpen: (id: number) => void; onSaved: () => void; notify: (message: string, error?: boolean) => void;
};

/** The quick call register: one row per contact, call, record the outcome and save the row. */
export default function CallSheet({ overview, tab, session, onOpen, onSaved, notify }: Props) {
  const [drafts, setDrafts] = useState<Map<number, Draft>>(new Map());
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [dialling, setDialling] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('all');
  const [order, setOrder] = useState<TicketOrder>('priority');
  const [dateMode, setDateMode] = useState<'all' | 'day' | 'range'>('all');
  const [selectedDay, setSelectedDay] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState(tab.key === 'learner_satisfaction' || tab.key === 'employer_satisfaction' ? 'due' : 'all');
  const [emailCase, setEmailCase] = useState<number | null>(null);
  const [feedbackCase, setFeedbackCase] = useState<OverviewCase | null>(null);
  const [satisfactionEmail, setSatisfactionEmail] = useState<OverviewCase | null>(null);
  const from = dateMode === 'day' ? selectedDay : dateMode === 'range' ? dateFrom : '';
  const to = dateMode === 'day' ? selectedDay : dateMode === 'range' ? dateTo : '';
  const invalidDateRange = !!from && !!to && from > to;

  const eligible = useMemo(() => categoryCases(overview.cases, tab.key, overview.today, overview.next_workday), [overview, tab.key]);
  const matching = useMemo(() => orderTickets(eligible.filter(c =>
    (reason === 'all' || c.source_type === reason) && (scope !== 'due' || dueForCall(c)) && matchesSearch(c, search)
    && matchesTicketDate(c, from, to),
  ), order), [eligible, reason, scope, search, order, from, to]);
  const ticketsByContact = useMemo(() => {
    const grouped = new Map<string, OverviewCase[]>();
    for (const c of matching) {
      const key = contactKey(c);
      const tickets = grouped.get(key) || [];
      tickets.push(c);
      grouped.set(key, tickets);
    }
    return grouped;
  }, [matching]);
  const rows = useMemo(() => {
    const chosen = new Map<string, OverviewCase>();
    for (const c of matching) {
      const key = contactKey(c);
      const old = chosen.get(key);
      // Changing the order must not replace a ticket whose outcome is being edited.
      if (!old || (drafts.get(c.id)?.dirty && !drafts.get(old.id)?.dirty)) chosen.set(key, c);
    }
    return orderTickets([...chosen.values()], order);
  }, [matching, order, drafts]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstRow = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = rows.slice(firstRow, firstRow + PAGE_SIZE);
  const unsavedCount = [...drafts.values()].filter(draft => draft.dirty).length;

  useEffect(() => { setPage(1); }, [reason, scope, search, order, from, to, tab.key]);
  useEffect(() => { setPage(value => Math.min(value, pageCount)); }, [pageCount]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [currentPage, reason, scope, search, order, from, to]);

  const update = (c: OverviewCase, field: 'outcome' | 'notes' | 'next_contact', value: string) => setDrafts(current => {
    const next = new Map(current);
    const draft = next.get(c.id) || { outcome: '', notes: '', next_contact: '', dirty: false };
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
      if (draft.outcome === 'callback' && !draft.next_contact) throw new Error('Choose the date and time for the callback.');
      const followUp = draft.next_contact ? londonInput(draft.next_contact) : null;
      if (followUp && followUp.getTime() <= Date.now()) throw new Error('Choose a follow-up time in the future.');
      await saveOutcome(session, c.id, {
        ...splitOutcome(draft.outcome), note: draft.notes.trim(),
        // The chosen follow-up applies to every outcome; an outcome that closes the case ignores it.
        callback_at: followUp ? followUp.toISOString() : null,
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
    if (dialling !== null) return;
    setDialling(c.id);
    try {
      await caseAction(session, c.id, 'call');
      notify(`Zoom Phone opened for ${c.learner_name}. Update the row during the call, then save once Zoom reports it.`);
      onSaved();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'The call could not start.', true);
    } finally {
      setDialling(null);
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
          {[...new Set(eligible.map(c => c.source_type))].map(key => <option key={key} value={key}>{ISSUE_LABELS[key] || key}</option>)}
        </select>
        <select aria-label="Follow-up timing" value={scope} onChange={event => setScope(event.target.value)}>
          <option value="all">All active</option><option value="due">Due now</option>
        </select>
        <select aria-label="Ticket order" aria-describedby="ed-ticket-order-help" value={order} onChange={event => setOrder(event.target.value as TicketOrder)}>
          {Object.entries(TICKET_ORDERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="ed-date-filter" role="group" aria-label="Ticket date filter">
          <select aria-label="Date filter" aria-describedby="ed-ticket-order-help" value={dateMode}
            onChange={event => setDateMode(event.target.value as 'all' | 'day' | 'range')}>
            <option value="all">All dates</option>
            <option value="day">Specific day</option>
            <option value="range">Date range</option>
          </select>
          {dateMode === 'day' && <label>Day
            <input type="date" aria-label="Ticket date" value={selectedDay} onChange={event => setSelectedDay(event.target.value)} />
          </label>}
          {dateMode === 'range' && <>
            <label>From
              <input type="date" aria-label="From date" value={dateFrom} max={dateTo || undefined}
                aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? 'ed-date-error' : undefined}
                onChange={event => setDateFrom(event.target.value)} />
            </label>
            <label>To
              <input type="date" aria-label="To date" value={dateTo} min={dateFrom || undefined}
                aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? 'ed-date-error' : undefined}
                onChange={event => setDateTo(event.target.value)} />
            </label>
          </>}
          {dateMode !== 'all' && <button type="button" onClick={() => {
            setDateMode('all'); setSelectedDay(''); setDateFrom(''); setDateTo('');
          }}>Clear dates</button>}
        </div>
      </div>
      {invalidDateRange && <p className="ed-sheet-hint" id="ed-date-error" role="alert">The end date must be on or after the start date.</p>}
      <p className="ed-sheet-hint" id="ed-ticket-order-help">
        Date filters and oldest / newest use the issue date, then the appointment date or ticket opened date if unavailable.
        Dates are UK calendar days; a range includes both days.
        Tickets with unsaved edits stay selected for their contact.
      </p>
      <p className="ed-sheet-hint">
        Call, update the row, then Save. {session.preview
          ? `Calls are disabled in the director preview. ${session.name} must sign in to call. `
          : !session.agentId ? 'Ask a manager to set up your agent profile before calling. '
            : 'Zoom Phone opens with your caller ID; keep the Zoom desktop app signed in. '}
        An outcome is saved against the call Zoom reports, so save once the call has synced.
      </p>
      <div id="ed-sheet-body">
        <p className="ed-sheet-hint">This section contains {eligible.length} open tickets across {uniqueLearners(eligible).length} contacts before the filters below. A contact can have multiple tickets.</p>
        <div className="ed-sheet-count">{rows.length ? `${firstRow + 1}–${firstRow + visibleRows.length} of ` : ''}{rows.length} {rows.length === 1 ? 'contact' : 'contacts'} · {TICKET_ORDERS[order]} · One row per contact <span>Tab between fields · Ctrl/⌘ + Enter to save a row</span></div>
        <div ref={scrollRef} className="ed-sheet-scroll" tabIndex={0} role="region" aria-label="Quick call register">
          <table className="ed-sheet-table">
            <caption className="ed-sr-only">Learner calls. Edit the outcome, notes and follow-up date, then save that row.</caption>
            <thead><tr>{['Learner / phone', 'Call reason / coach', 'Call', 'Booking', 'Outcome', 'Notes / agreed action', 'Follow-up', 'Save'].map(head => <th key={head} scope="col">{head}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map(c => {
                const d = drafts.get(c.id);
                const callReason = callDisabledReason(c, session);
                const disabled = session.preview || !session.canAct;
                const employer = c.source_type === 'employer_feedback';
                return (
                  <tr key={c.id} data-sheet-row={c.id} className={d?.dirty ? 'is-dirty' : ''} onKeyDown={event => onKey(event, c)}>
                    <th scope="row">
                      <strong>{c.learner_name}</strong>
                      <span>{c.learner_phone || 'No phone recorded'}</span>
                      {!employer && c.source_type !== 'tech_support' && <div style={{ marginTop: '.45rem' }}><TechIssue caseId={c.id} learner={c.learner_name} session={session} notify={notify} onRaised={onSaved} /></div>}
                      {c.source_type === 'learner_satisfaction' && <span>{c.programme_status}</span>}
                      {employer ? (
                        <>
                          <span className="ed-employer-email">Employer email: {satisfactionRecipient(c) || 'Email not recorded'}</span>
                          <details>
                            <summary>{c.employer_learners?.length || 0} learners · {c.organisation || 'Organisation not recorded'}</summary>
                            {c.employer_learners?.map(l => <span key={l.email}>{l.name}{l.programme ? ` · ${l.programme}` : ''}</span>)}
                            <span>Email: {satisfactionRecipient(c) || 'Email not recorded'}</span>
                          </details>
                        </>
                      ) : (
                        <details>
                          <summary>Contact details</summary>
                          <span>{c.learner_email || 'Email not recorded'}</span>
                          <small>Phone source: {c.contact_sources?.phone || 'Not recorded'} · Email source: {c.contact_sources?.email || 'Not recorded'}</small>
                          <span>{c.programme || 'Programme not recorded'}</span>
                          <span>{c.organisation || 'Employer not recorded'}</span>
                          {c.manager_email && <span>Line manager: {c.manager_name || c.manager_email}</span>}
                        </details>
                      )}
                    </th>
                    <td>
                      <strong>{issueLabel(c)}</strong>
                      <span>{employer ? c.organisation || 'Organisation not recorded' : c.coach || 'Coach not recorded'}</span>
                      {(c.source_type === 'attendance' || c.booking_at) && <span>{c.issue_name}</span>}
                      <CaseDates ticket={c} />
                      {c.helpdesk && <span>{c.helpdesk.ticket} · {helpdeskStatus(c.helpdesk)}</span>}
                      {c.helpdesk?.helpdesk_error && <small>Last status check failed: {c.helpdesk.helpdesk_error}</small>}
                      <small>{c.claimed_by ? `In progress: ${c.claimed_by}` : c.status === 'ai_suggested_close' ? 'AI suggests closing: waiting for a manager' : c.promise_missed ? 'Promise missed: call again' : c.missed_call ? `Missed call · ${c.attempts} unanswered` : dueForCall(c) ? 'Due now' : `Follow-up ${shortDate(c.next_followup_at || c.due_at)}`}</small>
                      <button type="button" className="ed-sheet-link" onClick={() => onOpen(c.id)}>Full case</button>
                      {(ticketsByContact.get(contactKey(c))?.length || 0) > 1 && (
                        <details>
                          <summary>Other matching tickets ({ticketsByContact.get(contactKey(c))!.length - 1})</summary>
                          {ticketsByContact.get(contactKey(c))!.filter(ticket => ticket.id !== c.id).map(ticket => (
                            <div key={ticket.id} className="ed-related-ticket" data-related-ticket={ticket.id}>
                              <strong>{issueLabel(ticket)}</strong>
                              {ticket.source_type === 'attendance' && <span>{ticket.issue_name}</span>}
                              <CaseDates ticket={ticket} />
                              <button type="button" className="ed-sheet-link" onClick={() => onOpen(ticket.id)}>Full case #{ticket.id}</button>
                            </div>
                          ))}
                        </details>
                      )}
                    </td>
                    <td>
                      <div className="ed-call-actions">
                        <button type="button" className="primary ed-call-action" aria-label={`${session.preview ? 'Preview only: ' : 'Call '}${c.learner_name}`} disabled={!!callReason || dialling !== null} title={callReason || undefined} onClick={() => void call(c)}>
                          {session.preview ? 'Preview' : 'Call'}
                        </button>
                        {isSatisfaction(c) && <button type="button" className="ed-call-action"
                          disabled={disabled || !satisfactionRecipient(c)}
                          title="Review and send an email via Microsoft 365" onClick={() => setSatisfactionEmail(c)}>Email</button>}
                      </div>
                      {callReason && <span className="ed-call-reason">{callReason}</span>}
                    </td>
                    <td className="ed-booking-cell">
                      {employer ? <small>No coach booking for employer calls</small> : <>
                        <strong>{c.coach || 'Coach not recorded'}</strong>
                        {!!c.bookable.length && <BookSession caseId={c.id} session={session} notify={notify} onBooked={onSaved} />}
                        {c.booking_email && <button type="button" className="ed-sheet-link" disabled={session.preview} onClick={() => setEmailCase(c.id)}>Booking email</button>}
                        <small>{bookingHint(c)}</small>
                      </>}
                    </td>
                    <td>
                      <select aria-label={`Outcome for ${c.learner_name}`} disabled={disabled} value={d?.outcome || ''} onChange={event => update(c, 'outcome', event.target.value)}>
                        <option value="">Choose outcome…</option>
                        {outcomeChoices(c).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {d?.outcome && <small>{outcomeHelp(d.outcome, c)}</small>}
                      {isSatisfaction(c) && <button type="button" className="ed-sheet-link"
                        disabled={disabled} onClick={() => setFeedbackCase(c)}>Complete feedback</button>}
                    </td>
                    <td>
                      <textarea rows={2} maxLength={3500} aria-label={`Notes and action for ${c.learner_name}`} placeholder="What was agreed? Who will do what, by when?" disabled={disabled} value={d?.notes || ''} onChange={event => update(c, 'notes', event.target.value)} />
                    </td>
                    <td>
                      <small>London time</small>
                      <input type="datetime-local" aria-label={`Follow-up date and time for ${c.learner_name}`} disabled={disabled} value={d?.next_contact ?? ''} onChange={event => update(c, 'next_contact', event.target.value)} />
                      <div className="ed-quick-dates" aria-label={`Quick follow-up dates for ${c.learner_name}`}>
                        {QUICK_FOLLOW_UPS.map(([days, label]) => (
                          <button key={days} type="button" className="ed-sheet-link" disabled={disabled} title={`${longDate(workdayInput(days))} at 10:00 London`}
                            onClick={() => update(c, 'next_contact', workdayInput(days))}>{label}</button>
                        ))}
                      </div>
                      {d?.next_contact ? <small>{closesCase(d.outcome, c) ? 'This outcome closes the case, so the date is not used.' : `Back in the list ${longDate(d.next_contact)}`}</small>
                        : c.next_followup_at && <small>Now: {shortDate(c.next_followup_at)}</small>}
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
                <tr><td colSpan={8}><div className="ec-empty"><h3>No calls in this view</h3><p>{invalidDateRange
                  ? 'Correct the date range to see matching tickets.'
                  : eligible.length ? 'No tickets match these filters. Try another date, call reason or search.'
                    : 'Calls appear when matching records are available. Check Connections & call rules for source coverage.'}</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <nav className="ed-pagination" aria-label="Ticket pages">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous page</button>
          <label>Page
            <select aria-label="Ticket page" value={currentPage} onChange={event => setPage(Number(event.target.value))}>
              {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
            of {pageCount}
          </label>
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next page</button>
          <span>20 contacts per page</span>
          {!!unsavedCount && <span role="status">{unsavedCount} unsaved {unsavedCount === 1 ? 'row' : 'rows'} across pages</span>}
        </nav>
      </div>

      <Dialog open={emailCase !== null} onClose={() => setEmailCase(null)}>
        {emailCase !== null && <BookingEmail caseId={emailCase} session={session} />}
      </Dialog>
      <Dialog open={feedbackCase !== null} onClose={() => setFeedbackCase(null)}>
        {feedbackCase && <SatisfactionFeedback key={feedbackCase.id} caseId={feedbackCase.id} name={feedbackCase.learner_name}
          employer={feedbackCase.source_type === 'employer_feedback'} session={session} onSaved={() => { setFeedbackCase(null); onSaved(); notify('Feedback completed. Next review is due in three calendar months.'); }} />}
      </Dialog>
      <Dialog open={satisfactionEmail !== null} onClose={() => setSatisfactionEmail(null)}>
        {satisfactionEmail && <SatisfactionEmail key={satisfactionEmail.id}
          caseId={satisfactionEmail.id} session={session} employer={satisfactionEmail.source_type === 'employer_feedback'} />}
      </Dialog>
    </section>
  );
}
