import { useEffect, useState } from 'react';
import { useCallCentre } from '../api';
import { PageNumbers } from './MonthlyHistory';
import RecordingDialog from './Recordings';
import { ISSUE_LABELS, human, outcomeLabel, promiseLabel, shortDate, when } from './model';
import '../styles/monthly-history.css';

type Feedback = {
  state: 'completed' | 'waiting' | 'dropped' | 'extra'; score: number | null; problem: string | null; agreed_action: string | null;
  note: string | null; next_due_at: string | null; reason?: string;
};
type LoggedCase = {
  id: number; source_type: string; organisation: string; status: string; resolution_option: string; next_followup_at: string | null;
  outcome: { state: 'applied' | 'waiting' | 'dropped' | 'not_discussed'; outcome: string; option: string; note: string;
    callback_at: string | null; promised_at: string | null; reason?: string } | null;
  closed: { at: string; note: string } | null;
  bookings: { session_type: string; start: string; coach: string; join_url: string; link_warning: string }[];
  feedback: Feedback | null;
};
type LoggedCall = {
  id: number; pressed_at: string; agent: { id: number; name: string }; learner_name: string; learner_email: string; number: string;
  zoom: { state: string; id: number | null; started_at: string | null; duration_seconds: number | null; transcript: string; short?: boolean };
  saved: boolean; cases: LoggedCase[];
  /** The learner rang the specialist's number (no Call press); the after-call form works the same. */
  incoming?: boolean;
  /** From the end of the call to the after-call form being saved. */
  wrap_up_seconds?: number | null;
};
export type CallLogData = {
  calls: LoggedCall[]; total: number; page: number; page_size: number; has_next: boolean;
  summary: { calls: number; answered: number; not_matched: number; closed: number; booked: number; feedback: number };
  agents?: { id: number; display_name: string }[];
};

const PERIODS: [number, string][] = [[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];
const SESSION_NAMES: Record<string, string> = { 'catch-up': 'Catch-up session', 'student-support': 'Student support session' };
const STATUS_NAMES: Record<string, string> = {
  new: 'Back on the list', in_progress: 'Being worked', pending_learner: 'Callback booked', pending_verification: 'Waiting for proof',
  ai_suggested_close: 'AI suggests closing', resolved: 'Closed', unreachable: 'Unreachable', escalated: 'Escalated',
};
const FAILED = new Set(['no_answer', 'missed', 'busy', 'voicemail', 'rejected']);

const minutes = (seconds: number | null) => (seconds === null ? '' : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);

function ZoomResult({ zoom }: { zoom: LoggedCall['zoom'] }) {
  if (zoom.state === 'waiting') return <span className="ed-history-result" title="Zoom reports a call about 10 minutes after it ends.">Waiting for Zoom</span>;
  if (zoom.state === 'not_matched') {
    return <span className="ed-history-result ed-log-bad" title="Zoom never reported a call for this Call press: dialled from the Zoom app, another number, or not made.">Zoom has no call</span>;
  }
  return <span className={`ed-history-result ${zoom.state === 'answered' ? 'ed-history-answered' : FAILED.has(zoom.state) ? 'ed-log-bad' : ''}`}>
    {human(zoom.state)}{zoom.state === 'answered' && zoom.duration_seconds !== null ? ` · ${minutes(zoom.duration_seconds)}` : ''}</span>;
}

function Outcome({ item }: { item: LoggedCase }) {
  const outcome = item.outcome;
  if (!outcome) return <p className="ec-muted">No outcome saved for this case.</p>;
  const what = outcome.state === 'not_discussed' ? 'Not discussed'
    : `${outcomeLabel(outcome.outcome)}${outcome.option && outcome.option !== 'other' ? `: ${promiseLabel(outcome.option)}` : ''}`;
  return (
    <p>
      <strong>{what}</strong>
      {outcome.state === 'waiting' && <span className="ec-tag amber">Applies when Zoom reports the call</span>}
      {outcome.state === 'dropped' && <span className="ec-tag red">Not applied: {outcome.reason}</span>}
      {outcome.callback_at && <small>Follow-up {when(outcome.callback_at)}</small>}
      {outcome.promised_at && <small>Promise due {shortDate(outcome.promised_at)}</small>}
      {outcome.note && <small className="ed-log-note">“{outcome.note}”</small>}
    </p>
  );
}

function FeedbackBox({ feedback }: { feedback: Feedback }) {
  const state = {
    completed: `Review completed${feedback.next_due_at ? ` · next due ${shortDate(feedback.next_due_at)}` : ''}`,
    waiting: 'Saved, completes the review when Zoom reports the call answered',
    dropped: `Not counted: ${feedback.reason || 'Zoom did not report an answered call'}`,
    extra: 'Extra feedback (the review was not due)',
  }[feedback.state];
  return (
    <div className={`ed-log-box ${feedback.state === 'dropped' ? 'bad' : ''}`}>
      <span>Satisfaction feedback · {state}</span>
      <strong>{feedback.score ?? '–'} / 5</strong>
      <dl>
        {feedback.problem && <><dt>Problem</dt><dd>{feedback.problem}</dd></>}
        {feedback.agreed_action && <><dt>Agreed action</dt><dd>{feedback.agreed_action}</dd></>}
        {feedback.note && <><dt>Note</dt><dd>{feedback.note}</dd></>}
      </dl>
    </div>
  );
}

function CaseImpact({ item, onOpen }: { item: LoggedCase; onOpen: (id: number) => void }) {
  return (
    <div className="ed-log-case">
      <div className="ed-log-case-head">
        <button type="button" className="ed-log-link" onClick={() => onOpen(item.id)}>
          {ISSUE_LABELS[item.source_type] || human(item.source_type)} · #{item.id}</button>
        <span className={`ec-tag ${item.status === 'resolved' ? 'green' : ''}`}>
          Now: {STATUS_NAMES[item.status] || human(item.status)}
          {item.status !== 'resolved' && item.next_followup_at ? ` · back ${shortDate(item.next_followup_at)}` : ''}</span>
      </div>
      <Outcome item={item} />
      {item.closed && <p className="ed-log-closed">Closed by this call{item.closed.note && !item.feedback ? `: ${item.closed.note}` : ''}</p>}
      {item.bookings.map(booking => (
        <div key={`${booking.start}-${booking.session_type}`} className="ed-log-box good">
          <span>Booked · {SESSION_NAMES[booking.session_type] || human(booking.session_type)}</span>
          <strong>{when(booking.start)}</strong>
          <dl>
            <dt>Coach</dt><dd>{booking.coach || 'Not recorded'}</dd>
            {booking.join_url && <><dt>Join link</dt><dd><a href={booking.join_url} target="_blank" rel="noreferrer">{booking.join_url}</a></dd></>}
            {booking.link_warning && <><dt>Link</dt><dd>{booking.link_warning}</dd></>}
          </dl>
        </div>
      ))}
      {item.feedback && <FeedbackBox feedback={item.feedback} />}
    </div>
  );
}

/** Calls started from the system and everything each one did: outcomes, closed cases, bookings, satisfaction feedback.
 * A specialist sees their own; a manager sees everyone's, or one specialist's. */
export default function CallLog({ agentId, manager = false, revision, onOpen }: {
  agentId: number | null; manager?: boolean; revision: string; onOpen: (id: number) => void;
}) {
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const [who, setWho] = useState('');
  const [recording, setRecording] = useState<number | null>(null);
  const params = new URLSearchParams({ days: String(days), page: String(page) });
  // A manager picks a specialist, unless the page is about one already.
  const chosen = manager && agentId === null ? who : agentId === null ? '' : String(agentId);
  if (chosen) params.set('agent_id', chosen);
  const { data, error, loading, refresh } = useCallCentre<CallLogData>(`call-log/?${params}`);
  useEffect(() => { refresh(); }, [revision, refresh]);
  const summary = data?.summary;
  return (
    <section className="ed-history" aria-label={manager ? 'Call monitor' : 'My last calls'}>
      <section className="ec-card">
        <div className="ec-head">
          <div>
            <h2>{manager ? 'Call monitor' : 'Calls and what they did'}</h2>
            <p className="ec-muted">Every call started with Call, and what it did to each case: the outcome, cases closed, sessions booked and
              satisfaction feedback. A call made from the Zoom app directly is not here.</p>
          </div>
          <div className="ec-buttons">
            {manager && agentId === null && (
              <label>Specialist
                <select value={who} onChange={event => { setWho(event.target.value); setPage(1); }}>
                  <option value="">Everyone</option>
                  {(data?.agents || []).map(agent => <option key={agent.id} value={agent.id}>{agent.display_name}</option>)}
                </select>
              </label>
            )}
            <label>Period
              <select value={days} onChange={event => { setDays(Number(event.target.value)); setPage(1); }}>
                {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="button" onClick={refresh}>Refresh</button>
          </div>
        </div>
        {error && <div role="alert"><p>{error}</p><button type="button" onClick={refresh}>Retry</button></div>}
        {loading && !data && <p role="status">Loading calls…</p>}
        {summary && (
          <div className="ed-log-totals">
            <article><span>Calls</span><strong>{summary.calls}</strong><small>{summary.answered} answered</small></article>
            <article><span>Zoom has no call</span><strong>{summary.not_matched}</strong><small>Not counted</small></article>
            <article><span>Cases closed</span><strong>{summary.closed}</strong><small>{manager ? 'By specialists' : 'By you'}</small></article>
            <article><span>Sessions booked</span><strong>{summary.booked}</strong><small>With coaches</small></article>
            <article><span>Satisfaction feedback</span><strong>{summary.feedback}</strong><small>Reviews completed</small></article>
          </div>
        )}
      </section>
      {data && (
        <section className="ec-card">
          <div className="ed-history-call-list">
            {data.calls.map(call => (
              <article key={call.id} className="ed-history-call" aria-label={`Call to ${call.learner_name || call.number}`}>
                <div className="ed-history-call-main">
                  <div className="ed-history-contact">
                    <time dateTime={call.pressed_at}>{when(call.pressed_at)}{manager ? ` · ${call.agent.name}` : ''}</time>
                    {call.incoming && <span className="ec-tag">The learner rang</span>}
                    <h3>{call.learner_name || call.number}</h3>
                    <div><span>{call.learner_email}</span><span>{call.number}</span></div>
                  </div>
                  <div className="ed-history-call-result">
                    <ZoomResult zoom={call.zoom} />
                    {call.zoom.short && <small className="danger" title="Zoom reports it answered, but for only a few seconds: usually the learner’s voicemail.">Answered under 10 s: voicemail?</small>}
                    {!call.saved && <small className="danger">After-call form not saved</small>}
                    {call.wrap_up_seconds != null && <small>Form saved {minutes(call.wrap_up_seconds)} after the call</small>}
                    {call.zoom.id !== null && call.zoom.transcript !== 'none' && (
                      <button type="button" onClick={() => setRecording(call.zoom.id)}>
                        {call.zoom.transcript === 'ready' ? 'Recording & transcript' : 'Recording (transcript pending)'}</button>
                    )}
                  </div>
                </div>
                <div className="ed-log-cases">
                  {call.cases.map(item => <CaseImpact key={item.id} item={item} onOpen={onOpen} />)}
                </div>
              </article>
            ))}
            {!data.calls.length && <p>No calls in this period.</p>}
          </div>
          <PageNumbers page={page} total={Math.max(1, Math.ceil(data.total / data.page_size))} disabled={loading} onPage={setPage} />
        </section>
      )}
      <RecordingDialog callId={recording} onClose={() => setRecording(null)} />
    </section>
  );
}
