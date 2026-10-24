import type { AgentStats, OverviewCase } from '../api';
import { ISSUE_LABELS, dueForCall, human } from './model';

/** One colour per specialist, from the Engagement Centre palette (same order everywhere). */
export const SERIES = ['#60359a', '#268a8b', '#c0632b', '#2f6db5', '#a3326e', '#5b8a2a', '#8a6bc0', '#1f5f63'];
export const seriesColour = (index: number) => SERIES[index % SERIES.length];

const weekday = (iso: string) => ![0, 6].includes(new Date(`${iso}T12:00:00`).getDay());

/** The month's working days (weekends dropped: nobody calls then). */
export function workingDays(agents: AgentStats[]): string[] {
  const days = new Set<string>();
  agents.forEach(agent => agent.month.daily.forEach(day => days.add(day.day)));
  return [...days].sort().filter(weekday);
}

export const rate = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : null);

/** The month's figures for a group of specialists (the team, or one). */
export function monthTotals(agents: AgentStats[]) {
  const sum = (pick: (agent: AgentStats) => number) => agents.reduce((total, agent) => total + pick(agent), 0);
  const attempts = sum(agent => agent.month.attempts);
  const connected = sum(agent => agent.month.connected);
  return {
    attempts, connected, answerRate: rate(connected, attempts), seconds: sum(agent => agent.month.seconds),
    resolved: sum(agent => agent.month.resolved), breaches: sum(agent => agent.month.sla_breaches),
    learners: sum(agent => agent.month.unique_learners), emails: sum(agent => agent.month.emails),
  };
}

/** Where a set of open cases stands: what can be called now, and what is stuck. */
export function caseload(cases: OverviewCase[]) {
  return {
    open: cases.length,
    due: cases.filter(c => dueForCall(c)).length,
    late: cases.filter(c => c.sla_breached).length,
    waiting: cases.filter(c => ['pending_learner', 'pending_verification'].includes(c.status)).length,
    missed: cases.filter(c => c.missed_call).length,
    promises: cases.filter(c => c.promise_missed).length,
    ai: cases.filter(c => c.status === 'ai_suggested_close').length,
    unallocated: cases.filter(c => !c.allocated_agent_id).length,
  };
}

/** Open cases by reason for the call, largest first. */
export function byReason(cases: OverviewCase[]) {
  const counts = new Map<string, number>();
  cases.forEach(c => counts.set(c.source_type, (counts.get(c.source_type) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, value, label: ISSUE_LABELS[key] || human(key).replace(/^./, first => first.toUpperCase()) }));
}

/** Specialists ranked by talk time this month (the measure their target is set in). */
export const ranked = (agents: AgentStats[]) => [...agents].sort((a, b) => b.month.seconds - a.month.seconds);

export const firstName = (name: string) => name.split(' ')[0];
