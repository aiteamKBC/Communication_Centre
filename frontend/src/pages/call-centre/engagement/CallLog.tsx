import { useEffect, useState } from 'react';
import { useCallCentre } from '../api';
import type { CallRating } from '../api';
import { RatingTag } from './CallReview';
import TranscriptPanel from './TranscriptPanel';
import { PageNumbers } from './MonthlyHistory';
import { FAILED_RESULTS, ISSUE_LABELS, callResult, human, outcomeLabel, promiseLabel, shortDate, when } from './model';
import '../styles/monthly-history.css';

type Feedback = {
  state: 'completed' | 'waiting' | 'dropped' | 'extra'; score: number | null; problem: string | null; agreed_action: string | null;
  note: string | null; next_due_at: string | null; reason?: string;
  /** Zoom's result for the call, when it was not answered (e.g. cut off): the feedback stands, for a manager to check. */
  mismatch?: string;
};
type LoggedCase = {
  id: number; source_type: string; organisation: string; status: string; resolution_option: string; next_followup_at: string | null;
  outcome: { state: 'applied' | 'waiting' | 'dropped' | 'not_discussed'; outcome: string; option: string; note: string;
    callback_at: string | null; promised_at: string | null; reason?: string;
    /** Zoom's result for the call, when it contradicts the outcome saved (e.g. Reached on a voicemail). */
    mismatch?: string } | null;
  closed: { at: string; note: string } | null;
  bookings: { session_type: string; start: string; coach: string; join_url: string; link_warning: string }[];
  feedback: Feedback | null;
};
type LoggedCall = {
  id: number; pressed_at: string; agent: { id: number; name: string }; learner_name: string; learner_email: string; number: string;
  zoom: { state: string; id: number | null; started_at: string | null; duration_seconds: number | null; transcript: string; short?: boolean };
  /** The call's recordings, oldest first: played and read here. */
  recordings?: { id: number; transcript: string; duration_seconds: number | null; rating: CallRating | null }[];
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

const minutes = (seconds: number | null) => (seconds === null ? '' : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);

function ZoomResult({ zoom }: { zoom: LoggedCall['zoom'] }) {
  if (zoom.state === 'waiting') return <span className="ed-history-result" title="Zoom reports a call about 10 minutes after it ends.">Waiting for Zoom</span>;
  if (zoom.state === 'not_matched') {
    return <span className="ed-history-result ed-log-bad" title="Zoom never reported a call for this Call press: dialled from the Zoom app, another number, or not made.">Zoom has no call</span>;
  }
  return <span className={`ed-history-result ${zoom.state === 'answered' ? 'ed-history-answered' : FAILED_RESULTS.has(zoom.state) ? 'ed-log-bad' : ''}`}>
    {callResult(zoom.state)}{zoom.state === 'answered' && zoom.duration_seconds !== null ? ` · ${minutes(zoom.duration_seconds)}` : ''}</span>;
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
      {outcome.mismatch && <span className="ec-tag red">Zoom says {callResult(outcome.mismatch)}: check this outcome</span>}
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
      {feedback.mismatch && <span className="ec-tag red">Zoom says {callResult(feedback.mismatch)}: check this feedback</span>}
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

/** One call as an accordion. Closed: when, who, what Zoom reported, the AI rating and the recording to play straight away.
 * Open: what the call did to each case (with the learner's case to open) and, per recording, the transcript and AI review. */
function CallRow({ call, manager, onOpen }: { call: LoggedCall; manager: boolean; onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const recordings = call.recordings || [];
  const rating = recordings.map(item => item.rating).find(Boolean) || null;
  const closed = call.cases.filter(item => item.closed).length;
  const booked = call.cases.reduce((sum, item) => sum + item.bookings.length, 0);
  const summary = [`${call.cases.length} ${call.cases.length === 1 ? 'case' : 'cases'}`, closed ? `${closed} closed` : '', booked ? `${booked} booked` : '']
    .filter(Boolean).join(' · ');
  const id = `call-${call.id}`;
  const who = call.learner_name || call.number;
  return (
    <article className={`cl-call${open ? ' open' : ''}`} aria-label={`Call to ${who}`}>
      <div className="cl-head">
        <button type="button" className="cl-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
          <span className="cl-chevron" aria-hidden="true">›</span>
          <span className="cl-who">
            <time dateTime={call.pressed_at}>{when(call.pressed_at)}{manager ? ` · ${call.agent.name}` : ''}</time>
            <strong>{who}</strong>
            <small>{summary}{call.incoming ? ' · the learner rang' : ''}</small>
          </span>
          <span className="cl-result">
            <ZoomResult zoom={call.zoom} />
            {recordings.length > 0 && <RatingTag rating={rating} />}
            {!call.saved && <small className="danger">Form not saved</small>}
          </span>
        </button>
        <div className="cl-player">
          {recordings.length
            ? <audio controls preload="none" src={`/api/zoom/recordings/${recordings[0].id}/audio/`} aria-label={`Recording of the call to ${who}`} />
            : <small>{call.zoom.state === 'answered' ? 'No recording yet' : 'No recording'}</small>}
        </div>
      </div>
      {open && (
        <div className="cl-body" id={id}>
          <div className="cl-facts">
            <span>{call.learner_email}</span><span>{call.number}</span>
            {call.zoom.short && <span className="danger">Answered under 10 s: voicemail?</span>}
            {call.wrap_up_seconds != null && <span>Form saved {minutes(call.wrap_up_seconds)} after the call</span>}
            {call.cases[0] && <button type="button" className="primary" onClick={() => onOpen(call.cases[0].id)}>Open the learner’s case</button>}
          </div>
          <div className="ed-log-cases">
            {call.cases.map(item => <CaseImpact key={item.id} item={item} onOpen={onOpen} />)}
          </div>
          {recordings.slice(1).map((item, index) => (
            <div key={item.id} className="cl-player cl-more">
              <small>Recording {index + 2}</small>
              <audio controls preload="none" src={`/api/zoom/recordings/${item.id}/audio/`} aria-label={`Recording ${index + 2} of the call to ${who}`} />
            </div>
          ))}
          {recordings.map((item, index) => (
            <TranscriptPanel key={item.id} recordingId={item.id} state={item.transcript}
              label={recordings.length > 1 ? `Transcript and AI review · recording ${index + 1}` : 'Transcript and AI review'} />
          ))}
          {!recordings.length && <p className="ec-muted">No recording, so no transcript or AI review for this call.</p>}
        </div>
      )}
    </article>
  );
}

/** Calls started from the system and everything each one did: outcomes, closed cases, bookings, satisfaction feedback.
 * A specialist sees their own; a manager sees everyone's, or one specialist's. Each call is an accordion. */
export default function CallLog({ agentId, manager = false, revision, onOpen }: {
  agentId: number | null; manager?: boolean; revision: string; onOpen: (id: number) => void;
}) {
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const [who, setWho] = useState('');
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
          <div className="cl-list">
            {data.calls.map(call => <CallRow key={call.id} call={call} manager={manager} onOpen={onOpen} />)}
            {!data.calls.length && <p>No calls in this period.</p>}
          </div>
          <PageNumbers page={page} total={Math.max(1, Math.ceil(data.total / data.page_size))} disabled={loading} onPage={setPage} />
        </section>
      )}
    </section>
  );
}
