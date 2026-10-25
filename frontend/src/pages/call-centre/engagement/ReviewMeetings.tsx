import { useMemo, useState } from 'react';
import { useCallCentre } from '../api';
import Dialog from './Dialog';
import { csvText, downloadBlob, human, when } from './model';
import { CANCEL_REASONS, CANCELLED_HOW, EVENT_LABELS, MATCHED_BY, REPLIES } from './meetingWords';

type Meeting = {
  id: number; review_type: 'pr' | 'mcm'; subject: string; organizer_email: string; coach_email: string;
  learner_email: string; learner_name: string; matched_by: string; learner_response: string; learner_response_at: string | null;
  status: 'scheduled' | 'cancelled'; cancelled_how: string; cancelled_by: string; cancel_reason: string; cancelled_at: string | null;
  confirmed_at: string | null; confirmed_by: string; start_at: string; end_at: string | null; first_seen_at: string; last_seen_at: string;
  events?: { at: string; kind: string; detail: Record<string, unknown>; actor: string }[];
};
type Listing = {
  items: Meeting[]; from: string; to: string;
  counts: Record<'total' | 'scheduled' | 'confirmed' | 'declined' | 'cancelled_here' | 'cancelled_outlook' | 'removed' | 'unmatched', number>;
  sync: { last_success_at: string | null; error: string };
};

const FILTERS: [string, string, (counts: Listing['counts']) => number][] = [
  ['all', 'All', c => c.total], ['scheduled', 'Going ahead', c => c.scheduled], ['confirmed', 'Confirmed on a call', c => c.confirmed],
  ['declined', 'Declined in Outlook', c => c.declined], ['cancelled', 'Cancelled', c => c.cancelled_here + c.cancelled_outlook + c.removed],
  ['cancelled_here', 'Cancelled by us', c => c.cancelled_here], ['unmatched', 'No learner matched', c => c.unmatched],
];
const TYPES = { pr: 'Progress review', mcm: 'Monthly coaching' };
const EMPLOYER: Record<string, string> = {
  confirmed: 'Employer confirmed', cannot_attend: 'Employer says the learner cannot attend', no_answer: 'No answer from the employer',
  not_reachable: 'Employer could not be reached', no_manager: 'No line manager on record',
};
const london = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const day = (iso: string, year = false) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })
  .format(new Date(`${iso}T12:00:00Z`));
const range = (from: string, to: string) => (from === to ? day(from, true) : `${day(from)} – ${day(to, true)}`);
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

function state(m: Meeting): [string, string, string] {
  if (m.status === 'cancelled') return [CANCELLED_HOW[m.cancelled_how] || 'Cancelled', 'red',
    [m.cancelled_by, m.cancelled_at && when(m.cancelled_at), m.cancel_reason].filter(Boolean).join(' · ')];
  if (m.confirmed_at) return ['Confirmed on a call', 'green', `${m.confirmed_by} · ${when(m.confirmed_at)}`];
  return ['Going ahead', '', ''];
}

/** One line of a meeting's history, in words. */
function describe(kind: string, detail: Record<string, unknown>) {
  const text = (key: string) => String(detail[key] ?? '');
  switch (kind) {
    case 'moved': return `${london(text('from'))} ${clock(text('from'))} → ${london(text('to'))} ${clock(text('to'))}`;
    case 'learner_replied': return REPLIES[text('response')] || human(text('response'));
    case 'learner_matched': return `${text('to')} (${MATCHED_BY[text('matched_by')] || text('matched_by')})`;
    case 'found': return [text('subject'), text('organizer') && `organised by ${text('organizer')}`].filter(Boolean).join(' · ');
    case 'cancelled_by_specialist': return [CANCEL_REASONS.find(([key]) => key === text('reason'))?.[1] || human(text('reason')), text('note')].filter(Boolean).join(': ');
    case 'coach_note': return `${detail.sent ? 'Sent' : 'Not sent'} to ${text('to')}${detail.sent ? '' : ` (${text('why')})`}`;
    case 'rescheduled_by_specialist': return `${london(text('from'))} ${clock(text('from'))} → ${london(text('to'))} ${clock(text('to'))}`
      + ` · ${[CANCEL_REASONS.find(([key]) => key === text('reason'))?.[1] || human(text('reason')), text('note')].filter(Boolean).join(': ')}`;
    case 'cancel_failed': case 'reschedule_failed': case 'lms_change_failed': return text('error');
    case 'lms_cancelled': case 'lms_moved': return `${text('entries')} entry`;
    case 'employer_checked': return [EMPLOYER[text('result')] || human(text('result')), text('manager'), text('note')].filter(Boolean).join(' · ');
    default: return '';
  }
}

/** The audit of the coaches' review meetings, read from Outlook: who each is for, the learner's reply, whether it was
 * confirmed on the next-day call or cancelled (in Outlook, or from here, by whom and why), and each meeting's history. */
export default function ReviewMeetings({ today }: { today: string }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 14));
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, error, loading, refresh } = useCallCentre<Listing>(`review-meetings/?from=${from}&to=${to}&status=${status}`);
  const history = useCallCentre<{ meeting: Meeting; case_ids: number[] }>(openId ? `review-meetings/?id=${openId}` : null, false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || []).filter(m => !q || [m.learner_name, m.learner_email, m.coach_email, m.subject].join(' ').toLowerCase().includes(q));
  }, [data, query]);

  function download() {
    const rows = shown.map(m => ({
      date: london(m.start_at), time: clock(m.start_at), type: TYPES[m.review_type], learner: m.learner_name, learner_email: m.learner_email,
      matched_by: m.matched_by, coach: m.coach_email, outlook_reply: REPLIES[m.learner_response] || '', status: state(m)[0],
      by: m.cancelled_by || m.confirmed_by, reason: m.cancel_reason, subject: m.subject,
    }));
    downloadBlob(new Blob([csvText(Object.keys(rows[0] || { date: '' }), rows)], { type: 'text/csv' }), `KBC-Review-Meetings-${from}-to-${to}.csv`);
  }

  const meeting = history.data?.meeting;
  return (
    <div className="dd">
      <section className="dd-section" aria-labelledby="rm-title">
        <header className="dd-section-head">
          <div>
            <p className="dd-eyebrow">From the coaches’ Outlook calendars</p>
            <h2 id="rm-title">{range(from, to)}</h2>
            <p className="dd-muted">
              {data?.sync.last_success_at ? `Outlook read ${when(data.sync.last_success_at)}. ` : 'Outlook not read yet. '}
              Every progress review and monthly coaching meeting, kept in step with Outlook every few minutes.
            </p>
          </div>
          <div className="ec-buttons">
            <label className="dd-month">From<input type="date" value={from} onChange={event => event.target.value && setFrom(event.target.value)} /></label>
            <label className="dd-month">To<input type="date" value={to} min={from} onChange={event => event.target.value && setTo(event.target.value)} /></label>
            <button type="button" onClick={refresh}>Refresh</button>
            <button type="button" disabled={!shown.length} onClick={download}>Download CSV</button>
          </div>
        </header>
        {data?.sync.error && <p className="ec-alert" role="alert">{data.sync.error}</p>}
        {error && <p className="ec-alert" role="alert">{error}</p>}
        {data && (
          <div className="rm-filters" role="tablist" aria-label="Which meetings">
            {FILTERS.map(([key, label, count]) => (
              <button key={key} type="button" role="tab" aria-selected={status === key} onClick={() => setStatus(key)}>
                {label}<b>{count(data.counts)}</b>
              </button>
            ))}
          </div>
        )}
        <input type="search" className="rm-search" aria-label="Find a meeting" placeholder="Find a learner, coach or title…"
          value={query} onChange={event => setQuery(event.target.value)} />
        {loading && !data && <p role="status">Loading the meetings…</p>}
        {data && (
          <div className="ec-table-wrap dd-panel dd-flush">
            <table className="rm-table">
              <thead><tr><th>When</th><th>Meeting</th><th>Learner</th><th>Coach</th><th>Outlook reply</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.map(m => {
                  const [label, tone, by] = state(m);
                  return (
                    <tr key={m.id}>
                      <td className="rm-when"><strong>{london(m.start_at)}</strong><small>{clock(m.start_at)}</small></td>
                      <td>{TYPES[m.review_type]}<small className="rm-subject" title={m.subject}>{m.subject}</small></td>
                      <td>{m.learner_email ? <>{m.learner_name || m.learner_email}<small>{MATCHED_BY[m.matched_by] || ''}</small></>
                        : <span className="ec-tag amber">No learner matched</span>}</td>
                      <td>{m.coach_email}</td>
                      <td>{m.learner_response ? <span className={`ec-tag ${m.learner_response === 'declined' ? 'red' : m.learner_response === 'accepted' ? 'green' : ''}`}>
                        {REPLIES[m.learner_response] || human(m.learner_response)}</span> : <small>Not known</small>}</td>
                      <td><span className={`ec-tag ${tone}`}>{label}</span>{by && <small>{by}</small>}</td>
                      <td><button type="button" className="ed-sheet-link" onClick={() => setOpenId(m.id)}
                        aria-label={`History of ${m.learner_name || m.subject}`}>History</button></td>
                    </tr>
                  );
                })}
                {!shown.length && <tr><td colSpan={7}>No meetings match.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Dialog open={openId !== null} onClose={() => setOpenId(null)} title="Meeting history">
        {!meeting ? <p role="status">{history.error || 'Loading…'}</p> : (
          <>
            <p><strong>{TYPES[meeting.review_type]}</strong> · {london(meeting.start_at)} {clock(meeting.start_at)}
              {' '}· {meeting.learner_name || 'No learner matched'} · {meeting.coach_email}</p>
            <p className="ec-muted">{meeting.subject}{history.data?.case_ids.length ? ` · Reminder case ${history.data.case_ids.join(', ')}` : ''}</p>
            <ol className="rm-history">
              {(meeting.events || []).map((e, index) => (
                <li key={index}>
                  <span>{when(e.at)}</span>
                  <strong>{EVENT_LABELS[e.kind] || human(e.kind)}</strong>
                  {describe(e.kind, e.detail) && <small>{describe(e.kind, e.detail)}</small>}
                  <small>{e.actor}</small>
                </li>
              ))}
            </ol>
          </>
        )}
      </Dialog>
    </div>
  );
}
