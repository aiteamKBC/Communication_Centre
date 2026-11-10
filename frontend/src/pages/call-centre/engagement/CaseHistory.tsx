import { useState } from 'react';
import type { CaseDetail, ContactHistory, HistoryCall } from '../api';
import { RatingTag } from './CallReview';
import { eventName, eventText } from './caseWords';
import { RESULTS, ROLES, waited } from './inbound';
import { callResult, duration, human, outcomeLabel, when } from './model';
import TranscriptPanel from './TranscriptPanel';

type Tab = 'calls' | 'missed' | 'timeline' | 'emails';
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One call in the learner's history. Closed: when, who, how it went, what it recorded, and the recording to play.
 * Open: each case's outcome, any further recordings, and the transcript with the AI review in its own small accordion. */
function CallItem({ call, onOpenCase }: { call: HistoryCall; onOpenCase?: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const rating = call.recordings.map(item => item.rating).find(Boolean) || null;
  const outcomes = [...new Set(call.cases.map(item => (item.outcome ? outcomeLabel(item.outcome) : '')).filter(Boolean))].join(' · ');
  return (
    <article className={`cl-call${open ? ' open' : ''}`} aria-label={`Call ${when(call.started_at)}`}>
      <div className="cl-head">
        <button type="button" className="cl-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <span className="cl-chevron" aria-hidden="true">›</span>
          <span className="cl-who">
            <time dateTime={call.started_at}>{when(call.started_at)} · {call.agent}{call.direction === 'inbound' ? ' · the learner rang' : ''}</time>
            <strong>{sentence(callResult(call.result))}{call.duration_seconds ? ` · ${duration(call.duration_seconds)}` : ''}</strong>
            <small>{outcomes || 'No outcome saved'} · {call.cases.map(item => item.label).join(', ')}</small>
          </span>
          <span className="cl-result">{call.recordings.length > 0 && <RatingTag rating={rating} />}</span>
        </button>
        <div className="cl-player">
          {call.recordings.length
            ? <audio controls preload="none" src={`/api/zoom/recordings/${call.recordings[0].id}/audio/`} aria-label={`Recording of the call on ${when(call.started_at)}`} />
            : <small>No recording</small>}
        </div>
      </div>
      {open && (
        <div className="cl-body">
          <ul className="lf-outcomes">
            {call.cases.map(item => (
              <li key={item.id}>
                {onOpenCase ? <button type="button" className="ed-sheet-link" onClick={() => onOpenCase(item.id)}>{item.label} #{item.id}</button>
                  : <span>{item.label} #{item.id}</span>}
                <span>{item.outcome ? outcomeLabel(item.outcome) : 'No outcome saved'}</span>
              </li>
            ))}
          </ul>
          {call.recordings.slice(1).map((item, index) => (
            <div key={item.id} className="cl-player cl-more">
              <small>Recording {index + 2}</small>
              <audio controls preload="none" src={`/api/zoom/recordings/${item.id}/audio/`} aria-label={`Recording ${index + 2}`} />
            </div>
          ))}
          {call.recordings.map((item, index) => (
            <TranscriptPanel key={item.id} recordingId={item.id} state={item.transcript}
              label={call.recordings.length > 1 ? `Transcript and AI review · recording ${index + 1}` : 'Transcript and AI review'} />
          ))}
          {!call.recordings.length && <p className="ec-muted">No recording, so no transcript or AI review for this call.</p>}
        </div>
      )}
    </article>
  );
}

function MissedItem({ item }: { item: ContactHistory['missed_calls'][number] }) {
  const [playing, setPlaying] = useState(false);
  return (
    <li className="lf-missed">
      <div>
        <strong>{when(item.received_at)}</strong>
        <span>{RESULTS[item.result] || human(item.result)} · {ROLES[item.caller_role] || 'Caller'} · rang {item.line || 'the team'}</span>
      </div>
      <span className={`ec-tag ${item.status === 'open' ? 'amber' : 'green'}`}>
        {item.status === 'open' ? `Waiting ${waited(item.waited_minutes)}` : `${human(item.done_how)} · ${item.done_by}`}</span>
      {item.voicemail && item.voicemail_id && (
        <div className="lf-voicemail">
          {item.voicemail.transcript ? <blockquote><q>{item.voicemail.transcript}</q></blockquote>
            : <small>{item.voicemail.transcript_status === 'pending' ? 'Transcript on its way' : 'No transcript'}</small>}
          {playing
            ? <audio controls autoPlay src={`/api/callcentre/voicemails/${item.voicemail_id}/audio/`} aria-label="Voicemail" />
            : <button type="button" className="dk-play" onClick={() => setPlaying(true)}>▶ Play voicemail{item.voicemail.duration_seconds ? ` (${item.voicemail.duration_seconds} s)` : ''}</button>}
        </div>
      )}
      {item.note && <small>“{item.note}”</small>}
    </li>
  );
}

/** Everything done with the person, across all their cases: calls (to play and read), missed calls and voicemails,
 * the cases' history, and emails. */
export default function CaseHistory({ detail, onOpenCase }: { detail: CaseDetail | null; onOpenCase?: (id: number) => void }) {
  const [tab, setTab] = useState<Tab>('calls');
  const history = detail?.history;
  if (!detail || !history) return <section className="lf-history"><p role="status">Loading the history…</p></section>;
  const tabs: [Tab, string, number][] = [
    ['calls', 'Calls', history.calls.length], ['missed', 'Missed calls & voicemails', history.missed_calls.length],
    ['timeline', 'Timeline', history.events.length], ['emails', 'Emails', detail.emails.length],
  ];
  return (
    <section className="lf-history" aria-labelledby="lf-history-title">
      <header>
        <h3 id="lf-history-title">History</h3>
        <small>All {history.cases} {history.cases === 1 ? 'case' : 'cases'}, open and closed</small>
      </header>
      <div className="dk-tabs" role="tablist" aria-label="History">
        {tabs.map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label} ({count})</button>
        ))}
      </div>
      {tab === 'calls' && (
        <div className="cl-list">
          {history.calls.map(call => <CallItem key={call.call_id} call={call} onOpenCase={onOpenCase} />)}
          {!history.calls.length && <p className="ec-muted">No calls yet. Calls made with the Call button appear here with their recordings.</p>}
        </div>
      )}
      {tab === 'missed' && (
        <ul className="lf-missed-list">
          {history.missed_calls.map(item => <MissedItem key={item.id} item={item} />)}
          {!history.missed_calls.length && <li className="ec-muted">No missed calls from this person.</li>}
        </ul>
      )}
      {tab === 'timeline' && (
        <ol className="lf-timeline">
          {history.events.map(item => (
            <li key={item.id}>
              <time dateTime={item.created_at}>{when(item.created_at)}</time>
              <strong>{eventName(item.kind)}</strong>
              <span className="lf-timeline-case">{item.case_label} #{item.case_id}</span>
              {eventText(item.kind, item.data) && <p>{eventText(item.kind, item.data)}</p>}
              <small>{item.actor}</small>
            </li>
          ))}
          {!history.events.length && <li className="ec-muted">Nothing recorded yet.</li>}
        </ol>
      )}
      {tab === 'emails' && (
        <div className="lf-emails">
          {detail.emails.map(email => (
            <details key={email.id} className="cl-transcript">
              <summary>{email.subject} <small>{human(email.status)} · {when(email.created_at)}</small></summary>
              <pre>{email.text}</pre>
              {email.error && <p className="danger">{email.error}</p>}
            </details>
          ))}
          {!detail.emails.length && <p className="ec-muted">No emails sent about this case.</p>}
        </div>
      )}
    </section>
  );
}
