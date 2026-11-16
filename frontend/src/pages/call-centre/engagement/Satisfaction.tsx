import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { post, useCallCentre } from '../api';
import Dialog from './Dialog';
import { csvText, downloadBlob, when } from './model';
import '../styles/satisfaction.css';

type Point = { theme: string; point: string; severity?: 'low' | 'medium' | 'high' };
type Sentiment = 'positive' | 'mixed' | 'neutral' | 'negative';
type Review = {
  id: number; case_id: number; learner_name: string; learner_email: string; programme: string; coach: string; organisation: string;
  score: number; feedback: string; issue: string; action: string; completed_at: string;
  issue_raised: boolean; action_agreed: boolean; without_call: boolean; call_flagged: boolean;
  ai: { sentiment: Sentiment; summary: string; follow_up: boolean; praise: Point[]; concerns: Point[] } | null;
};
type Figures = {
  reviews: number; learners: number; average: number | null; median: number | null; margin: number | null;
  distribution: Record<string, number>; satisfied: number; neutral: number; dissatisfied: number;
  satisfied_pct: number | null; dissatisfied_pct: number | null; issues_raised: number; issues_pct: number | null; actions_agreed: number;
};
type Group = { name: string; reviews: number; average: number; dissatisfied: number; issues_raised: number; enough: boolean };
type Theme = { theme: string; label: string; praise: number; concerns: number; serious: number };
type Evidence = { review_id: number; case_id: number; learner_name: string; score: number; quote: string };
type Finding = { title: string; detail: string; review_ids: number[]; count: number; evidence: Evidence[]; priority?: 'high' | 'medium' | 'low' };
type Insight = {
  id: number; state: 'ready' | 'error'; created_at: string; model: string; review_count: number; requested_by: string; error: string;
  up_to_date: boolean; headline?: string; verdict?: string; confidence?: number; dropped?: number;
  common_issues?: Finding[]; strengths?: Finding[]; weaknesses?: Finding[]; recommendations?: Finding[];
  watch_list?: { review_id: number; reason: string; case_id: number; learner_name: string; score: number }[];
};
type Dashboard = {
  period: string; generated_at: string; first_review_at: string | null;
  figures: Figures; all_time: Figures;
  months: { month: string; reviews: number; average: number; satisfied_pct: number; dissatisfied: number; issues_raised: number }[];
  programmes: Group[]; coaches: Group[];
  coverage: {
    done_this_quarter: number; closed_this_quarter: number; remaining: number; overdue: number; first_review: number;
    not_eligible: number; coverage_pct: number | null; closed_reasons: { reason: string; label: string; count: number }[];
  };
  sentiments: Record<Sentiment, number>; themes: Theme[]; concern_themes: Theme[];
  quality: { without_call: number; call_flagged: number };
  themes_known: Record<string, string>;
  ai: { enabled: boolean; set_up: boolean; read?: number; failed?: number; total?: number; running?: boolean; requested?: boolean;
    insight?: Insight | null; failure?: Insight | null };
  reviews: Review[];
};
type Filters = { query: string; score: string; sentiment: string; theme: string; only: string };

const TABS: [string, string][] = [['overview', 'Overview'], ['ai', 'AI analysis'], ['reviews', 'Reviews'], ['groups', 'Programmes & coaches'], ['coverage', 'Coverage']];
const PERIODS: [string, string][] = [['all', 'All time'], ['365', '12 months'], ['90', '3 months'], ['30', '30 days']];
const DAYS: Record<string, number | null> = { all: null, 365: 365, 90: 90, 30: 30 };
// A diverging scale (validated): dissatisfied red, a grey midpoint at 3, satisfied teal.
const SCORE_COLOUR = ['', '#8f3341', '#c4707a', '#aaa3b5', '#5aa29c', '#1b6869'];
const SENTIMENTS: [Sentiment, string, string][] = [['positive', 'Positive', '#1b6869'], ['mixed', 'Mixed', '#c4707a'],
  ['neutral', 'Neutral', '#aaa3b5'], ['negative', 'Negative', '#8f3341']];
const SENTIMENT_LABEL = Object.fromEntries(SENTIMENTS.map(([key, label]) => [key, label])) as Record<Sentiment, string>;
const NO_FILTERS: Filters = { query: '', score: '', sentiment: '', theme: '', only: '' };
const ONLY: [string, string][] = [['low', 'Scored 3 or lower'], ['issue', 'Issue raised'], ['action', 'Action agreed'],
  ['follow', 'AI says follow up'], ['check', 'Call to check']];
const INK = '#66677b';
const GRID = '#ece9f2';
const axis = { stroke: INK, fontSize: 12, tickLine: false, axisLine: { stroke: GRID } };
const tooltip = {
  contentStyle: { borderRadius: 8, border: '1px solid #e4e3ec', boxShadow: '0 6px 18px rgba(41,22,61,.12)', fontSize: 13 },
  labelStyle: { fontWeight: 600, color: '#202139' }, cursor: { fill: 'rgba(96,53,154,.06)' },
};

const monthLabel = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
const fixed = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? '—' : value.toFixed(digits));
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value}%`);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function inPeriod(review: Review, data: Dashboard, period: string) {
  const days = DAYS[period];
  return !days || Date.parse(review.completed_at) >= Date.parse(data.generated_at) - days * 864e5;
}

function matches(review: Review, filters: Filters) {
  const q = filters.query.trim().toLowerCase();
  const { ai } = review;
  return (!q || [review.learner_name, review.learner_email, review.programme, review.coach, review.organisation, review.feedback,
    review.issue, review.action].join(' ').toLowerCase().includes(q))
    && (!filters.score || review.score === Number(filters.score))
    && (!filters.sentiment || ai?.sentiment === filters.sentiment)
    && (!filters.theme || !!ai?.concerns.some(c => c.theme === filters.theme) || !!ai?.praise.some(p => p.theme === filters.theme))
    && (!filters.only || (filters.only === 'low' ? review.score <= 3 : filters.only === 'issue' ? review.issue_raised
      : filters.only === 'action' ? review.action_agreed : filters.only === 'follow' ? !!ai?.follow_up
        : review.without_call || review.call_flagged));
}

function Score({ score }: { score: number }) {
  return <span className="sat-score" style={{ background: SCORE_COLOUR[score] }} aria-label={`${score} out of 5`}>{score}</span>;
}

function Sentiment({ value }: { value: Sentiment }) {
  const colour = SENTIMENTS.find(([key]) => key === value)?.[2];
  return <span className="sat-sentiment-tag"><i style={{ background: colour }} aria-hidden="true" />{SENTIMENT_LABEL[value]}</span>;
}

function Panel({ title, note, action, children, className = '' }: {
  title: string; note?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <article className={`sat-panel ${className}`}>
      <header>
        <div><h3>{title}</h3>{note && <p>{note}</p>}</div>
        {action}
      </header>
      {children}
    </article>
  );
}

/** Part of a whole as one tall bar, each segment labelled when it is wide enough; the legend always names every part. */
function Segmented({ parts, label }: { parts: { key: string; label: string; value: number; colour: string }[]; label: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (!total) return <p className="sat-empty">Nothing in this period.</p>;
  return (
    <div className="sat-segmented">
      <div className="sat-segmented-bar" role="img" aria-label={`${label}: ${parts.map(p => `${p.label} ${p.value}`).join(', ')}`}>
        {parts.filter(part => part.value > 0).map(part => {
          const share = (part.value / total) * 100;
          return (
            <span key={part.key} style={{ flexGrow: part.value, background: part.colour }} title={`${part.label}: ${part.value} (${share.toFixed(1)}%)`}>
              {share >= 9 && <><b>{part.value}</b><small>{Math.round(share)}%</small></>}
            </span>
          );
        })}
      </div>
      <ul className="sat-legend">
        {parts.map(part => (
          <li key={part.key}><i style={{ background: part.colour }} aria-hidden="true" />{part.label}
            <b>{part.value}</b><small>{total ? `${((part.value / total) * 100).toFixed(1)}%` : ''}</small></li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ label, value, note, tone, onClick }: { label: string; value: ReactNode; note?: string; tone?: 'good' | 'bad'; onClick?: () => void }) {
  const body = <><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</>;
  return onClick
    ? <button type="button" className={`sat-tile ${tone || ''}`} onClick={onClick}>{body}</button>
    : <div className={`sat-tile ${tone || ''}`}>{body}</div>;
}

function MonthCharts({ months }: { months: Dashboard['months'] }) {
  const [table, setTable] = useState(false);
  const rows = months.map(row => ({ ...row, label: monthLabel(row.month) }));
  const toggle = <button type="button" className="sat-link" onClick={() => setTable(!table)}>{table ? 'Show charts' : 'Show as table'}</button>;
  if (!rows.length) return <Panel title="Month by month"><p className="sat-empty">No reviews in this period.</p></Panel>;
  if (table) {
    return (
      <Panel title="Month by month" action={toggle} className="sat-span-2">
        <table className="sat-table">
          <thead><tr><th>Month</th><th className="num">Reviews</th><th className="num">Average</th><th className="num">Satisfied</th><th className="num">Scored 1–2</th><th className="num">Issues</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.month}><td>{row.label}</td><td className="num">{row.reviews}</td><td className="num">{fixed(row.average)}</td>
              <td className="num">{pct(row.satisfied_pct)}</td><td className="num">{row.dissatisfied}</td><td className="num">{row.issues_raised}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
    );
  }
  return (
    <>
      <Panel title="Average score by month" note="On the 1 to 5 scale." action={toggle}>
        <div className="sat-chart" role="img" aria-label={`Average score by month: ${rows.map(r => `${r.label} ${fixed(r.average)}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows} margin={{ top: 18, right: 18, left: 0, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" {...axis} padding={{ left: 24, right: 24 }} />
              <YAxis {...axis} domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={40} />
              <Tooltip {...tooltip} formatter={value => [Number(value).toFixed(2), 'Average score']} />
              <Line dataKey="average" stroke="#60359a" strokeWidth={2} isAnimationActive={false}
                dot={{ r: 5, fill: '#60359a', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 7 }}
                label={{ position: 'top', fontSize: 12, fill: INK, formatter: (value: unknown) => Number(value).toFixed(2) }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Reviews completed by month">
        <div className="sat-chart" role="img" aria-label={`Reviews by month: ${rows.map(r => `${r.label} ${r.reviews}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows} margin={{ top: 18, right: 8, left: 0, bottom: 4 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} allowDecimals={false} width={40} />
              <Tooltip {...tooltip} formatter={value => [value, 'Reviews']} />
              <Bar dataKey="reviews" fill="#60359a" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}
                label={{ position: 'top', fontSize: 12, fill: INK }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </>
  );
}

function LowList({ reviews, onOpen, limit }: { reviews: Review[]; onOpen: (id: number) => void; limit: number }) {
  const lowest = reviews.filter(r => r.score <= 3).sort((a, b) => a.score - b.score || Date.parse(b.completed_at) - Date.parse(a.completed_at));
  if (!lowest.length) return <p className="sat-empty">No review scored 3 or lower in this period.</p>;
  return (
    <ul className="sat-list">
      {lowest.slice(0, limit).map(r => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r.id)}>
            <Score score={r.score} />
            <span className="sat-list-text"><strong>{r.learner_name}</strong><small>{r.issue_raised ? r.issue : r.feedback}</small></span>
            <time>{day(r.completed_at)}</time>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Overview({ data, period, onTab, onOpen, onFilter }: {
  data: Dashboard; period: string; onTab: (tab: string) => void; onOpen: (id: number) => void; onFilter: (filters: Partial<Filters>) => void;
}) {
  const f = data.figures;
  const c = data.coverage;
  const insight = data.ai.insight;
  const shown = data.reviews.filter(r => inPeriod(r, data, period));
  const current = c.done_this_quarter + c.closed_this_quarter + c.remaining;
  return (
    <div className="sat-grid">
      <section className="sat-hero sat-span-2" aria-label="Average rating">
        <div className="sat-hero-number">
          <strong>{fixed(f.average)}</strong><span>out of 5</span>
        </div>
        <p className="sat-hero-note">
          {f.reviews ? <>Average of {plural(f.reviews, 'review')} from {plural(f.learners, 'learner')}.
            {f.margin !== null && <> With this many reviews the true average is within ±{fixed(f.margin)} (95% confidence).</>}
            {f.median !== null && <> Median {f.median}.</>}</> : 'No reviews in this period.'}
        </p>
        <Segmented label="Reviews per score" parts={[5, 4, 3, 2, 1].map(score => ({
          key: String(score), label: `Scored ${score}`, value: f.distribution[String(score)] || 0, colour: SCORE_COLOUR[score],
        }))} />
        {insight?.headline && (
          <button type="button" className="sat-headline" onClick={() => onTab('ai')}>
            <span>The AI’s reading of all {insight.review_count} reviews</span>
            {insight.headline}
          </button>
        )}
      </section>
      <section className="sat-tiles" aria-label="Key figures">
        <Tile label="Satisfied" value={pct(f.satisfied_pct)} note={`${f.satisfied} scored 4 or 5`} tone={f.satisfied_pct !== null && f.satisfied_pct >= 80 ? 'good' : undefined} />
        <Tile label="Dissatisfied" value={f.dissatisfied} note={`Scored 1 or 2 (${pct(f.dissatisfied_pct)})`} tone={f.dissatisfied ? 'bad' : undefined}
          onClick={f.dissatisfied ? () => onFilter({ only: 'low' }) : undefined} />
        <Tile label="Issues raised" value={f.issues_raised} note={`${pct(f.issues_pct)} of reviews, ${f.actions_agreed} actions agreed`}
          tone={f.issues_raised ? 'bad' : undefined} onClick={f.issues_raised ? () => onFilter({ only: 'issue' }) : undefined} />
        <Tile label="Reviewed this quarter" value={pct(c.coverage_pct)} note={`${c.done_this_quarter} of ${current} current learners`} onClick={() => onTab('coverage')} />
        <Tile label="Still to review" value={c.remaining} note={`${c.overdue} past their call date`} tone={c.overdue ? 'bad' : undefined} onClick={() => onTab('coverage')} />
        <Tile label="Learners reviewed" value={data.all_time.learners} note={`${data.all_time.reviews} reviews since ${data.first_review_at ? day(data.first_review_at) : 'the start'}`} />
      </section>
      <MonthCharts months={data.months} />
      <Panel title="Lowest scores" note="3 or lower, the lowest first." action={shown.some(r => r.score <= 3)
        ? <button type="button" className="sat-link" onClick={() => onFilter({ only: 'low' })}>See all</button> : undefined}>
        <LowList reviews={shown} onOpen={onOpen} limit={5} />
      </Panel>
      <Panel title="Most common issues" note="From the AI analysis of every review." className="sat-span-3"
        action={<button type="button" className="sat-link" onClick={() => onTab('ai')}>Full analysis</button>}>
        {!insight?.common_issues?.length ? <p className="sat-empty">{insight ? 'No common issue stands out.' : 'The AI analysis is not ready yet.'}</p> : (
          <ul className="sat-ranked">
            {insight.common_issues.slice(0, 4).map(item => {
              const most = Math.max(...(insight.common_issues || []).map(i => i.count));
              return (
                <li key={item.title}>
                  <span className="sat-ranked-title">{item.title}</span>
                  <span className="sat-ranked-track"><i style={{ width: `${(item.count / most) * 100}%` }} /></span>
                  <b>{plural(item.count, 'review')}</b>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Finding({ item, onOpen }: { item: Finding; onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <div className="sat-finding-head">
        <strong>{item.title}</strong>
        <span className="sat-pill">{plural(item.count, 'review')}</span>
      </div>
      {item.priority && <span className={`sat-priority ${item.priority}`}>{item.priority} priority</span>}
      {open && <p>{item.detail}</p>}
      <button type="button" className="sat-link sat-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Less' : item.evidence.length ? `Details and what ${plural(item.evidence.length, 'learner')} said` : 'Details'}
      </button>
      {item.evidence.length > 0 && (
        <>
          {open && (
            <ul className="sat-quotes">
              {item.evidence.map(quote => (
                <li key={quote.review_id}>
                  <button type="button" onClick={() => onOpen(quote.review_id)}>
                    <Score score={quote.score} /><span className="sat-list-text"><q>{quote.quote}</q><small>{quote.learner_name}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function Findings({ title, items, empty, tone, onOpen, className = '' }: {
  title: string; items: Finding[] | undefined; empty: string; tone: string; onOpen: (id: number) => void; className?: string;
}) {
  return (
    <Panel title={title} className={`sat-findings ${tone} ${className}`}>
      {!items?.length ? <p className="sat-empty">{empty}</p> : <ul>{items.map(item => <Finding key={item.title} item={item} onOpen={onOpen} />)}</ul>}
    </Panel>
  );
}

/** Each theme: reviews that praise it (left, teal) against reviews with a concern (right; dark red for medium or high). */
function ThemeBalance({ themes }: { themes: Theme[] }) {
  if (!themes.length) return <p className="sat-empty">The AI has not read any reviews in this period yet.</p>;
  const rows = [...themes].sort((a, b) => (b.praise + b.concerns) - (a.praise + a.concerns));
  const most = Math.max(1, ...rows.map(row => Math.max(row.praise, row.concerns)));
  return (
    <>
      <ul className="sat-legend">
        <li><i style={{ background: '#1b6869' }} aria-hidden="true" />Praised</li>
        <li><i style={{ background: '#8f3341' }} aria-hidden="true" />Serious concern (medium or high)</li>
        <li><i style={{ background: '#c4707a' }} aria-hidden="true" />Minor concern</li>
      </ul>
      <table className="sat-balance">
        <thead><tr><th className="num">Praised in</th><th>Theme</th><th>Concern in</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.theme}>
              <td><span className="sat-balance-side pro"><b>{row.praise || ''}</b>
                <i style={{ width: `${(row.praise / most) * 100}%` }} title={`${row.praise} reviews praise ${row.label}`} /></span></td>
              <th scope="row">{row.label}</th>
              <td><span className="sat-balance-side con">
                <i className="serious" style={{ width: `${(row.serious / most) * 100}%` }} title={`${row.serious} serious concerns`} />
                <i className="minor" style={{ width: `${((row.concerns - row.serious) / most) * 100}%` }} title={`${row.concerns - row.serious} minor concerns`} />
                <b>{row.concerns || ''}</b></span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Analysis({ data, csrf, onAsked, onOpen }: { data: Dashboard; csrf: string; onAsked: () => void; onOpen: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { ai } = data;
  const insight = ai.insight;

  async function analyse() {
    setBusy(true);
    setMessage('');
    try {
      const result = await post<{ asked: boolean }>('satisfaction-dashboard/', csrf, { action: 'analyse' });
      setMessage(result.asked ? 'The AI is reading every review again. This page updates when it is done.' : 'Already asked in the last minute.');
      onAsked();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not ask for a new analysis.');
    } finally {
      setBusy(false);
    }
  }

  if (!ai.set_up) {
    return <p className="ec-alert" role="alert">The AI analysis is not set up: run <code>docs/callcentre-port/satisfaction_insights.sql</code> on the call-centre database.</p>;
  }
  const read = ai.read || 0;
  const total = ai.total || 0;
  return (
    <div className="sat-grid">
      <section className="sat-ai-strip sat-span-3" aria-label="AI analysis status">
        <div>
          <span>Reviews read</span>
          <strong>{read} of {total}</strong>
          <span className="sat-progress" aria-hidden="true"><i style={{ width: `${total ? (read / total) * 100 : 0}%` }} /></span>
          {(ai.failed || 0) > 0 && <small className="bad">{ai.failed} could not be read. Analyse again to retry them.</small>}
        </div>
        <div>
          <span>Last analysed</span>
          <strong>{insight ? when(insight.created_at) : 'Not yet'}</strong>
          {insight && <small className={insight.up_to_date ? 'good' : 'bad'}>{insight.up_to_date
            ? `Includes all ${insight.review_count} reviews` : 'New reviews since then. They are included within the hour.'}</small>}
        </div>
        <div>
          <span>AI confidence</span>
          <strong>{insight?.confidence !== undefined ? `${Math.round(insight.confidence * 100)}%` : '—'}</strong>
          <small>How well the reviews support the conclusions</small>
        </div>
        <div className="sat-ai-action">
          <button type="button" className="primary" disabled={!ai.enabled || busy || ai.running || ai.requested} onClick={analyse}>
            {ai.running ? 'Analysing…' : ai.requested ? 'Starting…' : 'Analyse all reviews again'}
          </button>
          {message && <small role="status">{message}</small>}
          {!ai.enabled && <small className="bad">AI analysis is switched off on the server.</small>}
        </div>
      </section>
      {ai.failure && <p className="ec-alert sat-span-3">{ai.failure.error} ({when(ai.failure.created_at)})</p>}
      {!insight ? (
        <p className="sat-empty sat-span-3">The first analysis runs in the next worker cycle, or ask for it now.</p>
      ) : (
        <>
          <section className="sat-verdict sat-span-3" aria-label="Verdict">
            <h2>{insight.headline}</h2>
            <p>{insight.verdict}</p>
          </section>
          <Findings title="Most common issues" tone="issue" items={insight.common_issues} empty="No common issue stands out." onOpen={onOpen} />
          <Findings title="Biggest pros" tone="pro" items={insight.strengths} empty="No strength stands out." onOpen={onOpen} />
          <Findings title="Biggest cons" tone="con" items={insight.weaknesses} empty="No weakness stands out." onOpen={onOpen} />
          <Findings title="Recommended actions" tone="action" items={insight.recommendations} empty="No action recommended." onOpen={onOpen} className="sat-span-2" />
          <Panel title="Learners to follow up" note="Picked by the AI from their reviews.">
            {!insight.watch_list?.length ? <p className="sat-empty">Nobody needs a follow-up.</p> : (
              <ul className="sat-list">
                {insight.watch_list.map(item => (
                  <li key={item.review_id}>
                    <button type="button" onClick={() => onOpen(item.review_id)}>
                      <Score score={item.score} /><span className="sat-list-text"><strong>{item.learner_name}</strong><small>{item.reason}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Pros and cons by theme" note="How many reviews praise each theme, and how many raise a concern about it. Counted from the AI’s reading of each review in the chosen period."
            className="sat-span-3">
            <ThemeBalance themes={data.themes} />
          </Panel>
          {(insight.dropped || 0) > 0 && <p className="sat-note sat-span-3">{insight.dropped} AI point(s) were left out because they cited no real review.</p>}
        </>
      )}
    </div>
  );
}

function Pages({ page, pages, size, total, onPage, onSize }: {
  page: number; pages: number; size: number; total: number; onPage: (page: number) => void; onSize: (size: number) => void;
}) {
  const numbers = Array.from({ length: pages }, (_, index) => index + 1)
    .filter(n => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const first = (page - 1) * size + 1;
  return (
    <nav className="sat-pages" aria-label="Pages">
      <span>{total ? `${first}–${Math.min(total, page * size)} of ${total}` : 'None'}</span>
      <div>
        <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {numbers.map((n, index) => (
          <span key={n}>
            {index > 0 && n - numbers[index - 1] > 1 && <em>…</em>}
            <button type="button" aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
          </span>
        ))}
        <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
      </div>
      <label>Rows
        <select value={size} onChange={event => onSize(Number(event.target.value))}>
          {[15, 25, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </nav>
  );
}

type SortKey = 'date' | 'learner' | 'score' | 'programme';

function Reviews({ data, period, filters, onFilters, onOpen }: {
  data: Dashboard; period: string; filters: Filters; onFilters: (filters: Filters) => void; onOpen: (id: number) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; up: boolean }>({ key: 'date', up: false });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(15);
  const base = useMemo(() => data.reviews.filter(r => inPeriod(r, data, period)), [data, period]);
  const shown = useMemo(() => {
    const list = base.filter(r => matches(r, filters));
    const value = (r: Review) => (sort.key === 'date' ? r.completed_at : sort.key === 'score' ? r.score
      : sort.key === 'learner' ? r.learner_name.toLowerCase() : r.programme.toLowerCase());
    return list.sort((a, b) => {
      const order = value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0;
      return (sort.up ? order : -order) || b.id - a.id;
    });
  }, [base, filters, sort]);
  useEffect(() => setPage(1), [period, filters, sort, size]);
  const pages = Math.max(1, Math.ceil(shown.length / size));
  const current = Math.min(page, pages);
  const visible = shown.slice((current - 1) * size, current * size);
  const set = (change: Partial<Filters>) => onFilters({ ...filters, ...change });
  const active = Object.values(filters).some(Boolean);

  function header(key: SortKey, label: string, className = '') {
    const on = sort.key === key;
    return (
      <th className={className} aria-sort={on ? (sort.up ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="sat-sort" onClick={() => setSort({ key, up: on ? !sort.up : key === 'learner' || key === 'programme' })}>
          {label}<span aria-hidden="true">{on ? (sort.up ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  }

  function download() {
    const rows = shown.map(r => ({
      date: day(r.completed_at), learner: r.learner_name, email: r.learner_email, programme: r.programme, coach: r.coach,
      organisation: r.organisation, score: r.score, feedback: r.feedback, issue: r.issue, agreed_action: r.action,
      ai_sentiment: r.ai?.sentiment || '', ai_summary: r.ai?.summary || '', ai_follow_up: r.ai ? (r.ai.follow_up ? 'yes' : 'no') : '',
      ai_praise: r.ai?.praise.map(p => p.point).join('; ') || '', ai_concerns: r.ai?.concerns.map(c => `${c.point} (${c.severity})`).join('; ') || '',
      no_call_attached: r.without_call ? 'yes' : '', call_not_answered: r.call_flagged ? 'yes' : '',
    }));
    downloadBlob(new Blob([csvText(Object.keys(rows[0] || { date: '' }), rows)], { type: 'text/csv' }),
      `KBC-Learner-Satisfaction-${data.generated_at.slice(0, 10)}.csv`);
  }

  return (
    <article className="sat-panel sat-reviews-panel">
      <div className="sat-filters">
        <input type="search" aria-label="Search reviews" placeholder="Search learner, programme, coach or words" value={filters.query}
          onChange={event => set({ query: event.target.value })} />
        <select aria-label="Score" value={filters.score} onChange={event => set({ score: event.target.value })}>
          <option value="">Any score</option>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>Scored {value}</option>)}
        </select>
        <select aria-label="Sentiment" value={filters.sentiment} onChange={event => set({ sentiment: event.target.value })}>
          <option value="">Any sentiment</option>{SENTIMENTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select aria-label="Theme" value={filters.theme} onChange={event => set({ theme: event.target.value })}>
          <option value="">Any theme</option>{Object.entries(data.themes_known).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button type="button" onClick={download} disabled={!shown.length}>Download CSV</button>
      </div>
      <div className="sat-chips" role="group" aria-label="Show only">
        {ONLY.map(([key, label]) => {
          const count = base.filter(r => matches(r, { ...NO_FILTERS, only: key })).length;
          return (
            <button key={key} type="button" aria-pressed={filters.only === key} onClick={() => set({ only: filters.only === key ? '' : key })}>
              {label}<b>{count}</b>
            </button>
          );
        })}
        {active && <button type="button" className="sat-link" onClick={() => onFilters(NO_FILTERS)}>Clear filters</button>}
      </div>
      <div className="sat-table-wrap">
        <table className="sat-table sat-review-table">
          <thead>
            <tr>
              {header('date', 'Date')}{header('learner', 'Learner')}{header('programme', 'Programme')}{header('score', 'Score', 'num')}
              <th>Feedback</th><th>Issue raised</th><th>AI</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="sat-row">
                <td className="nowrap">{day(r.completed_at)}</td>
                <td><button type="button" className="sat-name" onClick={event => { event.stopPropagation(); onOpen(r.id); }}>{r.learner_name}</button>
                  <small>{r.coach ? `Coach: ${r.coach}` : ''}</small></td>
                <td className="sat-clip">{r.programme || '—'}</td>
                <td className="num"><Score score={r.score} /></td>
                <td><span className="sat-clamp">{r.feedback}</span></td>
                <td>{r.issue_raised ? <span className="sat-clamp bad">{r.issue}</span> : <span className="sat-muted">None</span>}</td>
                <td className="nowrap">{r.ai ? <Sentiment value={r.ai.sentiment} /> : <span className="sat-muted">Not read</span>}
                  {r.ai?.follow_up && <small className="bad">Follow up</small>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="sat-empty">No reviews match. Clear a filter to see more.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pages page={current} pages={pages} size={size} total={shown.length} onPage={setPage} onSize={setSize} />
    </article>
  );
}

type GroupSort = 'name' | 'reviews' | 'average' | 'dissatisfied' | 'issues_raised';

function GroupTable({ title, label, rows }: { title: string; label: string; rows: Group[] }) {
  const [sort, setSort] = useState<{ key: GroupSort; up: boolean }>({ key: 'average', up: true });
  const [few, setFew] = useState(false);
  const shown = rows.filter(row => few || row.enough).sort((a, b) => {
    const order = a[sort.key] < b[sort.key] ? -1 : a[sort.key] > b[sort.key] ? 1 : 0;
    return (sort.up ? order : -order) || a.name.localeCompare(b.name);
  });
  const hidden = rows.length - rows.filter(row => row.enough).length;
  function header(key: GroupSort, text: string, className = '') {
    const on = sort.key === key;
    return (
      <th className={className} aria-sort={on ? (sort.up ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="sat-sort" onClick={() => setSort({ key, up: on ? !sort.up : key === 'name' || key === 'average' })}>
          {text}<span aria-hidden="true">{on ? (sort.up ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  }
  return (
    <Panel title={title} note="Weakest average first. Click a column to sort."
      action={hidden > 0 ? <label className="sat-check"><input type="checkbox" checked={few} onChange={event => setFew(event.target.checked)} />
        Show {hidden} with fewer than 3 reviews</label> : undefined}>
      <div className="sat-table-wrap">
        <table className="sat-table">
          <thead><tr>{header('name', label)}{header('reviews', 'Reviews', 'num')}{header('average', 'Average')}
            {header('dissatisfied', 'Scored 1–2', 'num')}{header('issues_raised', 'Issues', 'num')}</tr></thead>
          <tbody>
            {shown.map(row => (
              <tr key={row.name}>
                <td>{row.name}{!row.enough && <small>Too few reviews to judge</small>}</td>
                <td className="num">{row.reviews}</td>
                <td><span className="sat-avg"><b className={row.enough && row.average < 3.5 ? 'bad' : undefined}>{fixed(row.average)}</b>
                  <span className="sat-avg-track" aria-hidden="true"><i style={{ width: `${((row.average - 1) / 4) * 100}%` }} /></span></span></td>
                <td className={`num ${row.dissatisfied ? 'bad' : ''}`}>{row.dissatisfied}</td>
                <td className="num">{row.issues_raised}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="sat-empty">No group has 3 or more reviews in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Coverage({ data, onFilter }: { data: Dashboard; onFilter: (filters: Partial<Filters>) => void }) {
  const c = data.coverage;
  const q = data.quality;
  const reasons = c.closed_reasons.filter(r => r.count);
  return (
    <div className="sat-grid">
      <Panel title="This quarter" note="Every current learner gets one satisfaction call every three months. Learners on a break or who have left are not counted."
        className="sat-span-3">
        <Segmented label="This quarter's reviews" parts={[
          { key: 'done', label: 'Reviewed', value: c.done_this_quarter, colour: '#1b6869' },
          { key: 'closed', label: 'Closed without feedback', value: c.closed_this_quarter, colour: '#aaa3b5' },
          { key: 'left', label: 'Still to review', value: c.remaining, colour: '#c4707a' },
        ]} />
      </Panel>
      <section className="sat-tiles sat-span-3 wide" aria-label="Coverage figures">
        <Tile label="Reviewed this quarter" value={pct(c.coverage_pct)} note={`${c.done_this_quarter} learners`} />
        <Tile label="Still to review" value={c.remaining} note={`${c.first_review} have never been reviewed`} />
        <Tile label="Past their call date" value={c.overdue} tone={c.overdue ? 'bad' : undefined} note="Due and not yet called" />
        <Tile label="Closed without feedback" value={c.closed_this_quarter}
          note={reasons.length ? reasons.map(r => `${r.count} ${r.label.toLowerCase()}`).join(', ') : 'None this quarter'} />
        <Tile label="Not current" value={c.not_eligible} note="On a break or left" />
      </section>
      <Panel title="Data checks" note="Reviews whose call needs checking before the feedback is relied on." className="sat-span-3">
        <ul className="sat-checks">
          <li>
            <strong className={q.without_call ? 'bad' : undefined}>{q.without_call}</strong>
            <span>Feedback saved with no call attached: Zoom has not reported the call it was given on.</span>
            {q.without_call > 0 && <button type="button" onClick={() => onFilter({ only: 'check' })}>Show these reviews</button>}
          </li>
          <li>
            <strong className={q.call_flagged ? 'bad' : undefined}>{q.call_flagged}</strong>
            <span>Feedback saved on a call that Zoom reports as not answered.</span>
            {q.call_flagged > 0 && <button type="button" onClick={() => onFilter({ only: 'check' })}>Show these reviews</button>}
          </li>
        </ul>
      </Panel>
    </div>
  );
}

/** Every review of one learner, across the quarters. */
function LearnerReviews({ review, all, onOpenCase }: { review: Review; all: Review[]; onOpenCase: (id: number) => void }) {
  const history = all.filter(item => item.learner_email === review.learner_email);
  return (
    <>
      <p className="sat-muted">{[review.learner_email, review.programme, review.coach && `Coach: ${review.coach}`, review.organisation].filter(Boolean).join(', ')}</p>
      <ol className="sat-history">
        {history.map(item => (
          <li key={item.id} className={item.id === review.id ? 'current' : undefined}>
            <header>
              <Score score={item.score} />
              <strong>{day(item.completed_at)}</strong>
              {item.ai && <Sentiment value={item.ai.sentiment} />}
              {item.ai?.follow_up && <span className="ec-tag red">Follow up</span>}
              {item.without_call && <span className="ec-tag amber">No call attached</span>}
              {item.call_flagged && <span className="ec-tag red">Call not answered in Zoom</span>}
              <button type="button" onClick={() => onOpenCase(item.case_id)}>Open case</button>
            </header>
            <dl>
              <dt>Feedback</dt><dd>{item.feedback || '—'}</dd>
              <dt>Issue raised</dt><dd>{item.issue || '—'}</dd>
              <dt>Agreed action</dt><dd>{item.action || '—'}</dd>
              {item.ai && (
                <>
                  <dt>AI reading</dt>
                  <dd>
                    {item.ai.summary}
                    {item.ai.praise.length > 0 && <ul className="sat-points pro">{item.ai.praise.map((p, i) => <li key={i}>{p.point}</li>)}</ul>}
                    {item.ai.concerns.length > 0 && <ul className="sat-points con">{item.ai.concerns.map((c, i) => <li key={i}>{c.point} ({c.severity})</li>)}</ul>}
                  </dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ol>
    </>
  );
}

/** The director's satisfaction dashboard: every learner satisfaction review, in figures and read by the AI. */
export default function Satisfaction({ csrf, onOpenCase }: { csrf: string; onOpenCase: (id: number) => void }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') as string : 'overview';
  const period = PERIODS.some(([key]) => key === params.get('period')) ? params.get('period') as string : 'all';
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, error, loading, refresh } = useCallCentre<Dashboard>(`satisfaction-dashboard/?period=${period}`);
  const working = !!(data?.ai.running || data?.ai.requested);
  useEffect(() => {
    if (!working) return undefined;
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [working, refresh]);
  const byId = useMemo(() => new Map((data?.reviews || []).map(r => [r.id, r])), [data]);
  const opened = openId !== null ? byId.get(openId) : undefined;

  const go = (changes: Record<string, string>) => setParams(current => {
    const next = new URLSearchParams(current);
    Object.entries(changes).forEach(([key, value]) => next.set(key, value));
    return next;
  });
  const filterReviews = (change: Partial<Filters>) => {
    setFilters({ ...NO_FILTERS, ...change });
    go({ tab: 'reviews' });
  };

  const count = data ? data.reviews.filter(r => inPeriod(r, data, period)).length : 0;
  return (
    <div className="sat">
      <div className="sat-bar">
        <div className="sat-bar-top">
          <div className="sat-periods" role="radiogroup" aria-label="Period">
            {PERIODS.map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={period === key} onClick={() => go({ period: key })}>{label}</button>
            ))}
          </div>
          <span className="sat-muted">{data ? `Updated ${when(data.generated_at)}` : ''}</span>
          <button type="button" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        <nav className="sat-tabs" role="tablist" aria-label="Satisfaction views">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => go({ tab: key })}>
              {label}{key === 'reviews' && data && <b>{count}</b>}
              {key === 'ai' && working && <b className="sat-working">working</b>}
            </button>
          ))}
        </nav>
      </div>
      {error && <p className="ec-alert" role="alert">{data ? `Could not refresh: ${error} Showing the last loaded figures.` : error}</p>}
      {!data ? <p className="sat-empty" role="status">{loading ? 'Loading the satisfaction reviews…' : ''}</p> : (
        <div className={`sat-body${loading ? ' sat-stale' : ''}`} role="tabpanel">
          {tab === 'overview' && <Overview data={data} period={period} onTab={key => go({ tab: key })} onOpen={setOpenId} onFilter={filterReviews} />}
          {tab === 'ai' && <Analysis data={data} csrf={csrf} onAsked={refresh} onOpen={setOpenId} />}
          {tab === 'reviews' && <Reviews data={data} period={period} filters={filters} onFilters={setFilters} onOpen={setOpenId} />}
          {tab === 'groups' && (
            <div className="sat-grid sat-halves">
              <GroupTable title="By programme" label="Programme" rows={data.programmes} />
              <GroupTable title="By coach" label="Coach" rows={data.coaches} />
            </div>
          )}
          {tab === 'coverage' && <Coverage data={data} onFilter={filterReviews} />}
        </div>
      )}
      <Dialog open={!!opened} onClose={() => setOpenId(null)} title={opened ? `${opened.learner_name}: satisfaction reviews` : 'Reviews'} className="sat-dialog">
        {opened && data && <LearnerReviews review={opened} all={data.reviews} onOpenCase={id => { setOpenId(null); onOpenCase(id); }} />}
      </Dialog>
    </div>
  );
}
