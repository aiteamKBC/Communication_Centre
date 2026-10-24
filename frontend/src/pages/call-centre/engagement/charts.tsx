import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AgentStats, DayStats } from '../api';
import { seriesColour, workingDays } from './dashboard';
import { duration } from './model';

const INK = '#66677b';
const GRID = '#ece9f2';
const hours = (seconds: number) => Math.round((seconds / 3600) * 10) / 10;
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const find = (agent: AgentStats, day: string): DayStats | undefined => agent.month.daily.find(row => row.day === day);

const axis = { stroke: INK, fontSize: 12, tickLine: false, axisLine: { stroke: GRID } };
const tooltip = {
  contentStyle: { borderRadius: 8, border: '1px solid #e4e3ec', boxShadow: '0 6px 18px rgba(41,22,61,.12)', fontSize: 13 },
  labelStyle: { fontWeight: 600, color: '#202139' },
  cursor: { fill: 'rgba(96,53,154,.06)' },
};

/** Talk time each working day, one stacked colour per specialist, against the team's (or one specialist's) daily target. */
export function TalkByDay({ agents, height = 260 }: { agents: AgentStats[]; height?: number }) {
  const days = workingDays(agents);
  const target = agents.reduce((total, agent) => total + agent.target_seconds, 0);
  const rows = days.map(day => Object.fromEntries([['day', dayLabel(day)], ...agents.map(agent => [String(agent.id), hours(find(agent, day)?.seconds || 0)])]));
  if (!rows.some(row => agents.some(agent => Number(row[String(agent.id)]) > 0))) {
    return <p className="dd-empty">Talk time appears here as Zoom confirms the month’s calls.</p>;
  }
  return (
    <div className="dd-chart" role="img" aria-label={`Talk time per working day against a daily target of ${duration(target)}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 12, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={value => `${value}h`}
            domain={[0, (most: number) => Math.ceil(Math.max(most, hours(target)))]} />
          <Tooltip {...tooltip} formatter={(value, name) => [`${value} h`, agents.find(agent => String(agent.id) === name)?.display_name || name]} />
          {target > 0 && <ReferenceLine y={hours(target)} stroke="#bb8a32" strokeDasharray="5 4" strokeWidth={1.5}
            label={{ value: `Target ${duration(target)}`, position: 'insideTopRight', fill: '#8a6420', fontSize: 12 }} />}
          {agents.map((agent, index) => (
            <Bar key={agent.id} dataKey={String(agent.id)} stackId="talk" fill={agents.length === 1 ? '#60359a' : seriesColour(index)}
              radius={index === agents.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />
          ))}
          {agents.length > 1 && <Legend formatter={name => agents.find(agent => String(agent.id) === name)?.display_name || name}
            iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 6 }} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Calls made each working day: answered, and not answered. */
export function CallsByDay({ agents, height = 260 }: { agents: AgentStats[]; height?: number }) {
  const days = workingDays(agents);
  const rows = days.map(day => {
    const attempts = agents.reduce((total, agent) => total + (find(agent, day)?.attempts || 0), 0);
    const answered = agents.reduce((total, agent) => total + (find(agent, day)?.connected || 0), 0);
    return { day: dayLabel(day), answered, missed: Math.max(0, attempts - answered) };
  });
  if (!rows.some(row => row.answered || row.missed)) return <p className="dd-empty">Calls appear here as Zoom confirms them.</p>;
  return (
    <div className="dd-chart" role="img" aria-label="Calls made per working day, answered and not answered">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 12, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...axis} allowDecimals={false} width={44} />
          <Tooltip {...tooltip} formatter={(value, name) => [value, name === 'answered' ? 'Answered' : 'Not answered']} />
          <Bar dataKey="answered" stackId="calls" fill="#268a8b" isAnimationActive={false} />
          <Bar dataKey="missed" stackId="calls" fill="#d9cfe8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Legend formatter={name => (name === 'answered' ? 'Answered' : 'Not answered')} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 6 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A labelled list of horizontal bars (cases by reason, by stage...): readable at any width, no axis to decode. */
export function Bars({ rows, tone = 'purple', onPick, label }: {
  rows: { key: string; label: string; value: number; hint?: string }[]; tone?: 'purple' | 'teal' | 'red'; label: string;
  onPick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map(row => row.value));
  const shown = rows.filter(row => row.value > 0);
  if (!shown.length) return <p className="dd-empty">Nothing to show.</p>;
  return (
    <ul className={`dd-bars ${tone}`} aria-label={label}>
      {shown.map(row => {
        const body = (
          <>
            <span className="dd-bar-label">{row.label}{row.hint && <small>{row.hint}</small>}</span>
            <span className="dd-bar-track"><span style={{ width: `${(row.value / max) * 100}%` }} /></span>
            <b>{row.value}</b>
          </>
        );
        return <li key={row.key}>{onPick ? <button type="button" onClick={() => onPick(row.key)}>{body}</button> : <div>{body}</div>}</li>;
      })}
    </ul>
  );
}

/** Excellent / good / bad as one proportional strip. */
export function QualityStrip({ counts }: { counts: { excellent: number; good: number; bad: number } | undefined }) {
  const total = counts ? counts.excellent + counts.good + counts.bad : 0;
  if (!counts || !total) return <span className="dd-muted">No rated calls</span>;
  return (
    <span className="dd-quality" title={`${counts.excellent} excellent, ${counts.good} good, ${counts.bad} bad`}>
      <span className="dd-quality-strip" aria-hidden="true">
        {(['excellent', 'good', 'bad'] as const).map(key => counts[key] > 0 && <i key={key} className={key} style={{ flexGrow: counts[key] }} />)}
      </span>
      <small>{counts.excellent} excellent · {counts.good} good · <span className={counts.bad ? 'dd-bad' : undefined}>{counts.bad} bad</span></small>
    </span>
  );
}
