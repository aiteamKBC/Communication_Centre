import { useEffect, useState } from 'react';
import { useCallCentre } from '../api';
import { FAILED_RESULTS, callResult, human, ISSUE_LABELS, longDate, promiseLabel } from './model';
import '../styles/monthly-history.css';

type Totals = { attempts: number; connected: number; not_answered: number; other: number; seconds: number };
export type MonthlyHistoryData = {
  month: string; current_month: string; timezone: string;
  agent: { id: number; name: string; email: string };
  summary: Totals & { active_days: number; missing_duration: number; resolved: number };
  daily: (Totals & { day: string })[];
  calls: {
    id: number; started_at: string; result: string; duration_seconds: number | null;
    contact_name: string; contact_email: string; number: string;
    cases: { id: number; source_type: string; outcome: string }[];
  }[];
  page: number; page_size: number; total: number; has_next: boolean;
};

function callTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return [hours && `${hours} hr`, minutes && `${minutes} min`, (remainder || !seconds) && `${remainder} sec`].filter(Boolean).join(' ');
}

export function PageNumbers({ page, total, disabled, onPage }: {
  page: number; total: number; disabled: boolean; onPage: (page: number) => void;
}) {
  const pages = Array.from({ length: total }, (_, i) => i + 1)
    .filter(number => total <= 7 || number === 1 || number === total || Math.abs(number - page) <= 1);
  return (
    <nav className="ed-history-pagination" aria-label="Call history pages">
      <button type="button" aria-label="Previous page" disabled={page <= 1 || disabled} onClick={() => onPage(page - 1)}>←</button>
      {pages.map((number, index) => <span key={number}>
        {index > 0 && number > pages[index - 1] + 1 && <span className="ed-history-page-gap">…</span>}
        <button type="button" aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined}
          className={number === page ? 'primary' : undefined}
          disabled={disabled} onClick={() => { if (number !== page) onPage(number); }}>{number}</button>
      </span>)}
      <button type="button" aria-label="Next page" disabled={page >= total || disabled} onClick={() => onPage(page + 1)}>→</button>
    </nav>
  );
}

function monthName(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export default function MonthlyHistory({ agentId, today, revision, onOpen }: {
  agentId: number | null; today: string; revision: string; onOpen: (id: number) => void;
}) {
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const selectMonth = (value: string) => { setMonth(value); setPage(1); };
  return (
    <section className="ed-history" aria-label="Monthly achievements">
      <HistoryPage key={`${agentId}-${month}-${page}`} agentId={agentId} month={month} page={page}
        today={today} revision={revision} onMonth={selectMonth} onPage={setPage} onOpen={onOpen} />
    </section>
  );
}

function HistoryPage({ agentId, month, page, today, revision, onMonth, onPage, onOpen }: {
  agentId: number | null; month: string; page: number; today: string; revision: string;
  onMonth: (month: string) => void; onPage: (page: number) => void; onOpen: (id: number) => void;
}) {
  const params = new URLSearchParams({ page: String(page) });
  if (month) params.set('month', month);
  if (agentId !== null) params.set('agent_id', String(agentId));
  const { data, error, loading, refresh } = useCallCentre<MonthlyHistoryData>(`my-history/?${params}`);
  useEffect(() => { refresh(); }, [revision, refresh]);
  const selected = month || data?.month || today.slice(0, 7);
  const current = data?.current_month || today.slice(0, 7);
  const summary = data?.summary;
  return (
    <>
      <section className="ec-card">
        <div className="ec-head">
          <div>
            <p className="ec-eyebrow">{selected === current ? 'This month so far' : 'Previous month'}</p>
            <h2>{monthName(selected)}</h2>
            {data && <p className="ec-muted">{data.agent.name} · {data.agent.email}</p>}
          </div>
          <div className="ec-buttons">
            <button type="button" aria-label="Previous month" disabled={selected <= '2020-01'} onClick={() => onMonth(shiftMonth(selected, -1))}>←</button>
            <label>Achievement month<input type="month" min="2020-01" max={current} value={selected}
              onChange={event => { if (event.target.value && event.target.value <= current && event.target.value >= '2020-01') onMonth(event.target.value); }} /></label>
            <button type="button" aria-label="Next month" disabled={selected >= current} onClick={() => onMonth(shiftMonth(selected, 1))}>→</button>
            <button type="button" onClick={() => onMonth('')} disabled={!month}>Current month</button>
          </div>
        </div>
        <p className="ec-muted">Your verified calls started from this system. Choose an earlier month to see its achievements.</p>
        {error && <div role="alert"><p>{error}</p><button type="button" onClick={refresh}>Retry</button></div>}
        {loading && !data && <p role="status">Loading monthly achievements…</p>}
        {summary && (
          <>
            <div className="ed-history-totals">
              <article><span>Calls made</span><strong>{summary.attempts}</strong><small>All recorded attempts</small></article>
              <article><span>Answered</span><strong>{summary.connected}</strong><small>{summary.not_answered} not answered{summary.other > 0 ? ` · ${summary.other} other results` : ''}</small></article>
              <article><span>Connected time</span><strong>{callTime(summary.seconds)}</strong><small>Answered calls only</small></article>
              <article><span>Cases resolved</span><strong>{summary.resolved}</strong><small>{summary.active_days} days with calls</small></article>
            </div>
            {summary.missing_duration > 0 && <p role="status">Duration is unavailable for {summary.missing_duration} answered call(s). Their time is not included in the total.</p>}
          </>
        )}
      </section>
      {data && (
        <>
          <details className="ec-card ed-history-daily">
            <summary>Daily breakdown</summary>
            {data.daily.length ? <div className="ec-table-wrap"><table>
              <thead><tr><th>Day</th><th>Calls made</th><th>Answered</th><th>Connected time</th></tr></thead>
              <tbody>{data.daily.map(day => <tr key={day.day}>
                <th scope="row">{longDate(day.day)}</th><td>{day.attempts}</td><td>{day.connected}</td><td>{callTime(day.seconds)}</td>
              </tr>)}</tbody>
            </table></div> : <p>No daily activity to show.</p>}
          </details>
          <section className="ec-card">
            <div className="ec-head"><h2>Calls made in {monthName(data.month)}</h2><span>{data.total} calls</span></div>
            <p className="ec-muted">Times in Europe/London. Connected durations are recorded by Zoom.</p>
            <div className="ed-history-call-list">
              {data.calls.map(call => {
                const answered = call.result === 'answered';
                const outcomes = [...new Set(call.cases.filter(item => item.outcome).map(item => promiseLabel(item.outcome)))];
                return <article key={call.id} className="ed-history-call" aria-label={`Call to ${call.contact_name || call.number || 'unknown contact'}`}>
                  <div className="ed-history-call-main">
                    <div className="ed-history-contact">
                      <time dateTime={call.started_at}>{new Date(call.started_at).toLocaleString('en-GB', {
                        timeZone: data.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}</time>
                      <h3>{call.contact_name || call.number || 'Contact not recorded'}</h3>
                      <div>{call.contact_email && <span>{call.contact_email}</span>}{call.number && <span>{call.number}</span>}</div>
                    </div>
                    <div className="ed-history-call-result">
                      <span className={`ed-history-result ${answered ? 'ed-history-answered' : ''}`}>{callResult(call.result)}</span>
                      {answered ? <><strong>{call.duration_seconds === null ? 'Unavailable' : callTime(call.duration_seconds)}</strong><small>Connected time · Zoom</small></>
                        : <small>{FAILED_RESULTS.has(call.result) ? 'No connected conversation' : 'No connected duration recorded'}</small>}
                    </div>
                  </div>
                  {outcomes.length > 0 && <p className="ed-history-outcome">{outcomes.join(' · ')}</p>}
                  {call.cases.length > 0 && <details className="ed-history-case-details">
                    <summary>View linked cases ({call.cases.length})</summary>
                    <p className="ec-muted">Cases linked to this one call.</p>
                    <div className="ed-history-case-grid">{call.cases.map(item => <div key={item.id} className="ed-history-case">
                      <button type="button" onClick={() => onOpen(item.id)}>{ISSUE_LABELS[item.source_type] || human(item.source_type)} · #{item.id}</button>
                      {item.outcome && <small>{promiseLabel(item.outcome)}</small>}
                    </div>)}</div>
                  </details>}
                </article>;
              })}
              {!data.calls.length && <p>No recorded calls in {monthName(data.month)}.</p>}
            </div>
            <PageNumbers page={page} total={Math.max(1, Math.ceil(data.total / data.page_size))} disabled={loading} onPage={onPage} />
          </section>
        </>
      )}
    </>
  );
}
