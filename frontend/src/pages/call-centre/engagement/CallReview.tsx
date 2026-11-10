import { useEffect, useState } from 'react';
import { RATING_LABELS, RATING_RULES, api, request } from '../api';
import type { CallFlag, CallRating, CallReview } from '../api';
import Dialog from './Dialog';
import { ratedCalls, when } from './model';

const RATING_TONES: Record<CallRating, string> = { excellent: 'green', good: 'amber', bad: 'red', not_rated: '' };

export function RatingTag({ rating }: { rating: CallRating | null | undefined }) {
  if (!rating) return <span className="ec-tag">Awaiting AI review</span>;
  return <span className={`ec-tag ${RATING_TONES[rating]}`}>{RATING_LABELS[rating]}</span>;
}

export function RatingRules() {
  return (
    <details>
      <summary>How the AI rates calls</summary>
      <ul className="ec-script">
        {RATING_RULES.map(([rating, rule]) => <li key={rating}><RatingTag rating={rating} /> {rule}</li>)}
      </ul>
    </details>
  );
}

/** The AI's rating for one call and, for weaker calls, what went wrong and what to change. */
export default function CallReviewPanel({ review }: { review: CallReview | null }) {
  if (!review) return <p className="ec-muted">AI review: <RatingTag rating={null} /></p>;
  return (
    <div className={review.rating === 'bad' ? 'ec-alert' : 'ec-alert ec-success'}>
      <p><strong>AI call review</strong> <RatingTag rating={review.rating} /></p>
      {review.summary && <p>{review.summary}</p>}
      {!!review.went_wrong.length && <><strong>What went wrong</strong><ul>{review.went_wrong.map(item => <li key={item}>{item}</li>)}</ul></>}
      {!!review.needs_change.length && <><strong>What needs to change</strong><ul>{review.needs_change.map(item => <li key={item}>{item}</li>)}</ul></>}
      <p className="ec-muted">AI findings are a guide for coaching; a manager reviews them before any action.</p>
    </div>
  );
}

/** One rated call: the AI's notes and the transcript they came from. */
export function CallReviewDialog({ call, onClose }: { call: CallFlag | null; onClose: () => void }) {
  const [transcript, setTranscript] = useState<{ text: string; review: CallReview | null } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setTranscript(null);
    setError('');
    if (!call) return undefined;
    const controller = new AbortController();
    request<{ text: string; review: CallReview | null }>(`/api/zoom/recordings/${call.recording_id}/transcript/`, { signal: controller.signal })
      .then(setTranscript)
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [call]);

  return (
    <Dialog open={call !== null} onClose={onClose}>
      <h2>Call review · {call?.agent_name}</h2>
      <p className="ec-muted">{call && when(call.started_at)}</p>
      <CallReviewPanel review={transcript?.review ?? call} />
      {error && <p className="ec-status danger" role="alert">{error}</p>}
      {transcript && <><h3>Call transcript</h3><pre style={{ whiteSpace: 'pre-wrap' }}>{transcript.text || 'The transcript is empty.'}</pre></>}
    </Dialog>
  );
}

type MyReviews = { counts: Record<CallRating, number>; calls: CallFlag[] };

/** A specialist's own AI call reviews for the month (a director sees the previewed specialist's). */
export function MyCallReviews({ agentId, month, today, onMonth }: { agentId: number | undefined; month: string; today: string; onMonth: (month: string) => void }) {
  const [data, setData] = useState<MyReviews | null>(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState('all');
  const [selected, setSelected] = useState<CallFlag | null>(null);

  useEffect(() => {
    setData(null);
    setError('');
    if (!agentId) return undefined;
    const controller = new AbortController();
    api<MyReviews>(`call-reviews/?${new URLSearchParams({ month, agent_id: String(agentId) })}`, { signal: controller.signal })
      .then(setData)
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [agentId, month]);

  const calls = (data?.calls || []).filter(call => rating === 'all' || call.rating === rating);
  return (
    <section className="ec-card">
      <div className="ec-head">
        <div><h2>My call reviews</h2><p className="ec-muted">The AI rates each of your call transcripts excellent, good or bad. Use the notes to improve your next calls.</p></div>
        <div className="ec-buttons">
          <label>Month<input type="month" value={month} max={today.slice(0, 7)} onChange={event => event.target.value && onMonth(event.target.value)} /></label>
          <select aria-label="AI call rating" value={rating} onChange={event => setRating(event.target.value)}>
            <option value="all">All AI ratings</option>
            {Object.entries(RATING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      {!agentId ? <p className="ec-muted">No agent profile is linked, so there are no call reviews to show.</p> : <>
        {error && <p className="ec-status danger" role="alert">{error}</p>}
        {data && (
          <div className="ed-report-totals">
            <span>Excellent<strong>{data.counts.excellent}</strong></span>
            <span>Good<strong>{data.counts.good}</strong></span>
            <span>Bad<strong>{data.counts.bad}</strong></span>
          </div>
        )}
        <RatingRules />
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Call</th><th>AI rating</th><th>What went wrong</th><th>What needs to change</th><th /></tr></thead>
            <tbody>
              {!data && !error && <tr><td colSpan={5}>Loading call reviews…</td></tr>}
              {calls.map(call => (
                <tr key={call.recording_id}>
                  <td>{when(call.started_at)}{call.summary && <small>{call.summary}</small>}</td>
                  <td><RatingTag rating={call.rating} /></td>
                  <td>{call.went_wrong.join(' ') || '—'}</td>
                  <td>{call.needs_change.join(' ') || '—'}</td>
                  <td><button type="button" onClick={() => setSelected(call)}>Review call</button></td>
                </tr>
              ))}
              {data && !calls.length && <tr><td colSpan={5}>No rated calls in {month}{rating === 'all' ? '' : ' with this rating'}.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <p className="ec-muted">{ratedCalls(data.counts)} calls rated this month. AI findings are a guide; talk to your manager if a rating looks wrong.</p>}
      </>}
      <CallReviewDialog call={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
