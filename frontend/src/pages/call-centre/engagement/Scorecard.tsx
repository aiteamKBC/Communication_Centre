import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useCallCentre } from '../api';
import RecordingDialog from './Recordings';
import { duration, when } from './model';

type Card = {
  agent: { id: number; name: string };
  calls: number; answered: number; not_answered: number; reach_rate: number | null; learners_reached: number;
  talk_seconds: number; talk_out_seconds: number; incoming_answered: number; talk_in_seconds: number; target_seconds: number; working_days: number;
  short_answered: number; wrap_up_median_seconds: number | null; forms_saved: number; forms_missing: number; closed: number;
  callbacks: { received: number; done: number; open: number; median_minutes: number | null } | null;
  recordings_missing: number; reviews: { excellent: number; good: number; bad: number; not_rated?: number };
};
type Week = { week: string; cards: Card[] };
type MissingCall = { call_id: number; started_at: string; duration_seconds: number; direction: string; agent: string; line: string; learner_email: string };
type Found = { recording_id: number; call_id: number; started_at: string; agent: string; learner_email: string; direction: string; hits: number;
  snippets: { before: string; match: string; after: string }[] };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
const monday = (day: Date) => {
  const copy = new Date(day);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy.toLocaleDateString('en-CA');
};
const shift = (iso: string, days: number) => {
  const day = new Date(`${iso}T12:00:00`);
  day.setDate(day.getDate() + days);
  return day.toLocaleDateString('en-CA');
};

/** One week per specialist: calls, talk time against target (with learners who rang them), reach rate, call-backs, the
 * after-call form, short "answered" calls and recordings Zoom did not keep. Shown here only; nobody is emailed. */
export function Scorecard({ manager, revision, agentId }: { manager: boolean; revision: string; agentId?: number }) {
  const thisWeek = monday(new Date());
  const [week, setWeek] = useState(thisWeek);
  const { data, error, loading, refresh } = useCallCentre<Week>(`scorecard/?week=${week}`);
  useEffect(() => { refresh(); }, [revision, refresh]);
  return (
    <section className="ec-card" aria-label="Weekly scorecard">
      <div className="ec-head">
        <div>
          <h2>{agentId !== undefined ? 'Week by week' : manager ? 'Weekly scorecards' : 'My scorecard'}</h2>
          <p className="ec-muted">Monday to Sunday, from calls Zoom confirmed. The target counts the working days so far.</p>
        </div>
        <div className="ec-buttons">
          <button type="button" onClick={() => setWeek(shift(week, -7))}>Previous week</button>
          <strong>Week of {new Date(`${week}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          <button type="button" disabled={week >= thisWeek} onClick={() => setWeek(shift(week, 7))}>Next week</button>
        </div>
      </div>
      {error && <p className="ec-alert" role="alert">{error}</p>}
      {loading && !data && <p role="status">Loading the scorecards…</p>}
      {data && (
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Specialist</th><th>Calls</th><th>Talk time</th><th>Learners reached</th><th>Call-backs</th><th>After-call form</th><th>Call quality</th><th>To look at</th></tr></thead>
            <tbody>
              {data.cards.filter(card => agentId === undefined || card.agent.id === agentId).map(card => {
                const watch = [
                  card.short_answered && `${card.short_answered} answered under 10 s (voicemail?)`,
                  card.forms_missing && `${card.forms_missing} calls without a saved form`,
                  card.recordings_missing && `${card.recordings_missing} answered calls not recorded`,
                  card.callbacks?.open && `${card.callbacks.open} still waiting for a call back`,
                ].filter(Boolean) as string[];
                return (
                  <tr key={card.agent.id}>
                    <td><strong>{card.agent.name}</strong><small>{card.working_days} working days</small></td>
                    <td>{card.calls}<small>{card.answered} answered{card.reach_rate !== null ? ` · ${card.reach_rate}%` : ''}</small></td>
                    <td>{duration(card.talk_seconds)}<small>Target {duration(card.target_seconds)}</small>
                      {card.incoming_answered > 0 && <small>incl. {duration(card.talk_in_seconds)} with {card.incoming_answered} who rang</small>}</td>
                    <td>{card.learners_reached}<small>{card.closed} cases closed</small></td>
                    <td>{card.callbacks ? <>{card.callbacks.done} of {card.callbacks.received}<small>{card.callbacks.median_minutes !== null ? `typically ${card.callbacks.median_minutes} min` : 'none yet'}</small></> : '—'}</td>
                    <td>{card.wrap_up_median_seconds !== null ? clock(card.wrap_up_median_seconds) : '—'}<small>typical time to save</small></td>
                    <td>{card.reviews.excellent} excellent · {card.reviews.good} good<small className={card.reviews.bad ? 'danger' : undefined}>{card.reviews.bad} bad</small></td>
                    <td>{watch.length ? watch.map(item => <small key={item} className="danger">{item}</small>) : <span className="ec-tag green">Nothing</span>}</td>
                  </tr>
                );
              })}
              {!data.cards.length && <tr><td colSpan={8}>No active specialists.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Answered calls Zoom kept no recording of, so no transcript and no AI review: usually automatic recording is off for
 * that number (Zoom accounts → Numbers shows it). */
export function MissingRecordings({ revision }: { revision: string }) {
  const [days, setDays] = useState(7);
  const { data, error, refresh } = useCallCentre<{ calls: MissingCall[] }>(`missing-recordings/?days=${days}`);
  useEffect(() => { refresh(); }, [revision, refresh]);
  const calls = data?.calls || [];
  return (
    <section className="ec-card" aria-label="Calls without a recording">
      <div className="ec-head">
        <div>
          <h2>Calls without a recording ({calls.length})</h2>
          <p className="ec-muted">Answered calls of 30 seconds or more with no recording in Zoom three hours later: no transcript and no AI
            review. Usually automatic recording is off for that number: check it under Zoom Phone → Zoom accounts → Numbers.</p>
        </div>
        <label>Period
          <select value={days} onChange={event => setDays(Number(event.target.value))}>
            <option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option>
          </select>
        </label>
      </div>
      {error && <p className="ec-alert" role="alert">{error}</p>}
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Call</th><th>Specialist</th><th>Number</th><th>Learner</th></tr></thead>
          <tbody>
            {calls.map(call => (
              <tr key={call.call_id}>
                <td>{when(call.started_at)}<small>{clock(call.duration_seconds)} · {call.direction === 'inbound' ? 'they rang' : 'called'}</small></td>
                <td>{call.agent}</td><td>{call.line}</td><td>{call.learner_email}</td>
              </tr>
            ))}
            {data && !calls.length && <tr><td colSpan={4}>Every answered call in this period was recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Which calls mentioned a phrase, with the words around it: a director searches everyone's, a specialist their own. */
export function TranscriptSearch({ manager }: { manager: boolean }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(30);
  const [recording, setRecording] = useState<number | null>(null);
  const { data, error, loading } = useCallCentre<{ results: Found[]; limited: boolean }>(
    query ? `transcript-search/?q=${encodeURIComponent(query)}&days=${days}` : null, false);
  const search = (event: FormEvent) => { event.preventDefault(); setQuery(text.trim()); };
  return (
    <section className="ec-card" aria-label="Search call transcripts">
      <div className="ec-head">
        <div>
          <h2>Search call transcripts</h2>
          <p className="ec-muted">Find {manager ? 'every call' : 'your calls'} where a phrase was said, e.g. “gateway”, “withdraw” or a coach’s name.</p>
        </div>
      </div>
      <form className="ec-buttons" onSubmit={search} role="search">
        <input aria-label="Phrase" placeholder="Words said on the call" minLength={3} maxLength={100} value={text} onChange={event => setText(event.target.value)}
          style={{ maxWidth: '24rem' }} />
        <select aria-label="Period" value={days} onChange={event => setDays(Number(event.target.value))} style={{ width: 'auto' }}>
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
        <button type="submit" className="primary" disabled={text.trim().length < 3}>Search</button>
      </form>
      {error && <p className="ec-alert" role="alert">{error}</p>}
      {loading && <p role="status">Searching…</p>}
      {data && (
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Call</th><th>What was said</th><th /></tr></thead>
            <tbody>
              {data.results.map(item => (
                <tr key={item.recording_id}>
                  <td><strong>{item.learner_email}</strong><small>{when(item.started_at)}{manager ? ` · ${item.agent}` : ''}</small>
                    <small>{item.hits} mention{item.hits === 1 ? '' : 's'}</small></td>
                  <td>{item.snippets.map((part, index) => (
                    <small key={index}>{part.before}<mark>{part.match}</mark>{part.after}</small>
                  ))}</td>
                  <td><button type="button" onClick={() => setRecording(item.call_id)}>Recording & transcript</button></td>
                </tr>
              ))}
              {!data.results.length && <tr><td colSpan={3}>No call in this period mentions “{query}”.</td></tr>}
            </tbody>
          </table>
          {data.limited && <p className="ec-muted">Showing the 50 newest calls: narrow the phrase or the period.</p>}
        </div>
      )}
      <RecordingDialog callId={recording} onClose={() => setRecording(null)} />
    </section>
  );
}
