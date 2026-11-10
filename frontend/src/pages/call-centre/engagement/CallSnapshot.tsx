import { useCallCentre } from '../api';
import { Bookings, FeedbackBox, Outcome, ZoomResult } from './CallLog';
import type { LoggedCall, LoggedCase } from './CallLog';
import { STATUS_NAMES, eventName, eventText } from './caseWords';
import Dialog from './Dialog';
import TranscriptPanel from './TranscriptPanel';
import { appointmentTime, human, issueLabel, outcomeLabel, promiseLabel, shortDate, when } from './model';

type Event = { id: number; kind: string; actor: string; data: Record<string, unknown>; created_at: string };
type SnapshotCase = {
  id: number; source_type: string; issue_name: string; issue_date: string | null; module: string; booking_at: string | null;
  created_at: string; learner_email: string;
  contact: { learner_name: string; learner_phone: string; coach: string; organisation: string; programme: string;
    manager_name: string; manager_email: string };
  at_call: { closed: boolean; next_followup_at: string | null; promised_at: string | null; calls_before: number;
    last_outcome: { outcome: string; option: string; note: string; at: string } | null };
  before: Event[]; during: Event[]; after: Event[];
  impact: Pick<LoggedCase, 'outcome' | 'closed' | 'bookings' | 'feedback'>;
  now: { status: string; resolution_option: string; resolved_at: string | null; resolved_by: string;
    next_followup_at: string | null; archived: boolean };
};
type Snapshot = Pick<LoggedCall, 'id' | 'pressed_at' | 'incoming' | 'agent' | 'number' | 'learner_email' | 'zoom' | 'recordings'>
  & { cases: SnapshotCase[] };

/** What the case was about, in one line: the lecture and its day, the meeting and its time, or the review. */
function about(c: SnapshotCase) {
  if (c.source_type === 'reminder' && c.booking_at) return `${c.issue_name} · ${appointmentTime(c.booking_at)}`;
  if (c.source_type === 'attendance') return [c.issue_date ? `Lecture ${shortDate(c.issue_date)}` : 'Lecture', c.module].filter(Boolean).join(' · ');
  return [c.issue_name, c.issue_date ? shortDate(c.issue_date) : ''].filter(Boolean).join(' · ');
}

function Timeline({ events, empty }: { events: Event[]; empty: string }) {
  if (!events.length) return <p className="ec-muted">{empty}</p>;
  return (
    <ol className="lf-timeline">
      {events.map(item => (
        <li key={item.id}>
          <time dateTime={item.created_at}>{when(item.created_at)}</time>
          <strong>{eventName(item.kind)}</strong>
          {eventText(item.kind, item.data) && <p>{eventText(item.kind, item.data)}</p>}
          <small>{item.actor}</small>
        </li>
      ))}
    </ol>
  );
}

function CaseAtCall({ item, agent }: { item: SnapshotCase; agent: string }) {
  const { contact, at_call: then, now, impact } = item;
  const last = then.last_outcome;
  const closedNow = now.status === 'resolved';
  return (
    <section className="cs-case" aria-labelledby={`cs-case-${item.id}`}>
      <header className="cs-case-head">
        <div>
          <h3 id={`cs-case-${item.id}`}>{issueLabel(item)} · #{item.id}</h3>
          <p>{about(item)}</p>
        </div>
        <span className={`ec-tag ${closedNow ? 'green' : ''}`}>Now: {STATUS_NAMES[now.status] || human(now.status)}{now.archived ? ' · archived' : ''}</span>
      </header>

      <div className="cs-grid">
        <article className="cs-panel">
          <h4>When {agent} called</h4>
          <dl className="cs-facts">
            <div><dt>Case</dt><dd>{then.closed ? 'Already closed' : 'Open'} · opened {shortDate(item.created_at)}</dd></div>
            <div><dt>Calls before this one</dt><dd>{then.calls_before}</dd></div>
            <div><dt>Last outcome</dt><dd>{last
              ? <>{outcomeLabel(last.outcome)}{last.option && last.option !== 'other' ? `: ${promiseLabel(last.option)}` : ''} · {when(last.at)}
                {last.note && <small>“{last.note}”</small>}</>
              : 'None yet'}</dd></div>
            {then.next_followup_at && <div><dt>Follow-up set for</dt><dd>{when(then.next_followup_at)}</dd></div>}
            {then.promised_at && <div><dt>Promise due</dt><dd>{shortDate(then.promised_at)}</dd></div>}
          </dl>
        </article>
        <article className="cs-panel">
          <h4>Contact details then</h4>
          <dl className="cs-facts">
            <div><dt>Learner</dt><dd>{contact.learner_name || 'Not recorded'}</dd></div>
            <div><dt>Phone</dt><dd>{contact.learner_phone || 'Not recorded'}</dd></div>
            <div><dt>Email</dt><dd>{item.learner_email || 'Not recorded'}</dd></div>
            <div><dt>Programme</dt><dd>{contact.programme || 'Not recorded'}</dd></div>
            <div><dt>Coach</dt><dd>{contact.coach || 'Not recorded'}</dd></div>
            <div><dt>Employer</dt><dd>{contact.organisation || 'Not recorded'}</dd></div>
            <div><dt>Line manager</dt><dd>{contact.manager_name || 'Not recorded'}{contact.manager_email && <small>{contact.manager_email}</small>}</dd></div>
          </dl>
        </article>
      </div>

      <details className="cs-section">
        <summary>History {agent} could see · {item.before.length} {item.before.length === 1 ? 'entry' : 'entries'}</summary>
        <Timeline events={item.before} empty="Nothing had been done with this case before this call." />
      </details>

      <div className="cs-section open">
        <h4>What this call did</h4>
        <Outcome item={impact} />
        {impact.closed && <p className="ed-log-closed">Closed by this call{impact.closed.note && !impact.feedback ? `: ${impact.closed.note}` : ''}</p>}
        <Bookings bookings={impact.bookings} />
        {impact.feedback && <FeedbackBox feedback={impact.feedback} />}
        <details>
          <summary>Every step of the call · {item.during.length}</summary>
          <Timeline events={item.during} empty="No steps recorded for this call." />
        </details>
      </div>

      <div className="cs-section">
        <h4>Since then</h4>
        {closedNow && (
          <p className="ed-log-closed">Closed {when(now.resolved_at)}{now.resolved_by ? ` by ${human(now.resolved_by)}` : ''}
            {now.resolution_option ? ` · ${promiseLabel(now.resolution_option)}` : ''}</p>
        )}
        {!closedNow && now.next_followup_at && <p>Back on the list {when(now.next_followup_at)}</p>}
        <Timeline events={item.after} empty="Nothing has happened to this case since this call." />
      </div>
    </section>
  );
}

/** A manager's review of one call: each of its cases as the specialist found it when they pressed Call, what the call
 * did, and what happened since. Read only: nothing on it changes the case. */
export default function CallSnapshot({ callId, onClose }: { callId: number | null; onClose: () => void }) {
  const { data, error, loading, refresh } = useCallCentre<Snapshot>(callId === null ? null : `call-log/${callId}/`, false);
  const call = data && data.id === callId ? data : null;
  const who = call?.cases[0]?.contact.learner_name || call?.number || '';
  return (
    <Dialog open={callId !== null} onClose={onClose} title="Call review" className="ed-case-dialog" preservePosition>
      <div className="lf cs">
        {error && <div role="alert"><p>{error}</p><button type="button" onClick={refresh}>Try again</button></div>}
        {loading && !call && <p role="status">Loading the call…</p>}
        {call && (
          <>
            <header className="lf-band">
              <div className="lf-who">
                <p className="lf-eyebrow">Review only · {call.cases.length} {call.cases.length === 1 ? 'case' : 'cases'} on this call</p>
                <h2>{who}</h2>
                <p>{call.incoming ? 'Rang the team' : 'Called'} {when(call.pressed_at)} by {call.agent.name} · {call.number}</p>
              </div>
              <div className="lf-call">
                <ZoomResult zoom={call.zoom} />
                <p>Nothing on this page changes the case.</p>
              </div>
            </header>
            {call.recordings.map((item, index) => (
              <div key={item.id} className="cs-recording">
                <div className="cl-player">
                  <audio controls preload="none" src={`/api/zoom/recordings/${item.id}/audio/`} aria-label={`Recording ${index + 1} of the call`} />
                </div>
                <TranscriptPanel recordingId={item.id} state={item.transcript}
                  label={call.recordings.length > 1 ? `Transcript and AI review · recording ${index + 1}` : 'Transcript and AI review'} />
              </div>
            ))}
            {!call.recordings.length && <p className="ec-muted">No recording for this call.</p>}
            {call.cases.map(item => <CaseAtCall key={item.id} item={item} agent={call.agent.name} />)}
          </>
        )}
      </div>
    </Dialog>
  );
}
