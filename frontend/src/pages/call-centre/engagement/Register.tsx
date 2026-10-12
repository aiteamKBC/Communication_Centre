import { useMemo, useState } from 'react';
import type { Overview } from '../api';
import { ISSUE_LABELS, caseTone, human, issueLabel, longDate, matchesSearch } from './model';

const stages: [string, string][] = [
  ['open', 'Active cases'], ['pending_learner', 'Awaiting reply'], ['pending_verification', 'Awaiting verification'],
  ['all', 'All active stages'],
];

/** The director's calling register: call priorities by reason, filters and the case table. */
export default function Register({ overview, onOpenCase }: { overview: Overview; onOpenCase: (id: number) => void }) {
  const [issue, setIssue] = useState('all');
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState('all');
  const [stage, setStage] = useState('open');

  const forAgent = useMemo(() => overview.cases.filter(c => agent === 'all' || (agent === 'none' ? !c.claimed_agent_id : String(c.claimed_agent_id) === agent)), [overview.cases, agent]);
  const rows = forAgent.filter(c => (issue === 'all' || c.source_type === issue)
    && (stage === 'all' || (stage === 'open' ? !['pending_verification', 'ai_suggested_close'].includes(c.status) : c.status === stage))
    && matchesSearch(c, search));
  const issues: [string, string][] = [['all', 'All issues'], ...Object.entries(ISSUE_LABELS)];

  return (
    <div className="ec-layout">
      <aside className="ec-card">
        <h3>Call priorities</h3>
        <div className="ec-issues">
          {issues.map(([key, label]) => (
            <button key={key} type="button" className={issue === key ? 'active' : ''} onClick={() => setIssue(key)}>
              <span>{label}</span><b>{forAgent.filter(c => key === 'all' || c.source_type === key).length}</b>
            </button>
          ))}
        </div>
      </aside>
      <section className="ec-card">
        <div className="ec-tools">
          <input type="search" aria-label="Search learner, employer or programme" placeholder="Search learner, employer, programme" value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Specialist" value={agent} onChange={event => setAgent(event.target.value)}>
            <option value="all">All specialists</option>
            <option value="none">Not in progress</option>
            {overview.agents.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
          </select>
          <select aria-label="Case stage" value={stage} onChange={event => setStage(event.target.value)}>
            {stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {rows.length ? (
          <>
            <div className="ec-table-wrap">
              <table>
                <thead><tr><th>Learner</th><th>Purpose</th><th>Next step</th><th /></tr></thead>
                <tbody>
                  {rows.slice(0, 300).map(c => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.learner_name}</strong>
                        <small>{c.programme || 'Programme not recorded'}</small>
                        <small>{c.organisation || 'Employer not recorded'}</small>
                        <small>Specialist: {c.claimed_by || 'Not in progress'}</small>
                      </td>
                      <td>{issueLabel(c)}<small>{c.coach || 'Coach not recorded'}</small></td>
                      <td>
                        <span className={`ec-tag ${caseTone(c)}`}>{human(c.status)}</span>
                        <small>{longDate(c.next_followup_at || c.due_at)}</small>
                      </td>
                      <td><button type="button" onClick={() => onOpenCase(c.id)}>Open call</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ec-muted">{rows.length} cases{rows.length > 300 ? ' · showing the first 300' : ''} · Ordered by priority: risk, overdue, missed sessions and attempts.</p>
          </>
        ) : (
          <div className="ec-empty">
            <h3>No cases in this queue</h3>
            <p>Source gaps remain visible under Connections & call rules. A missing feed does not mean that every learner is on track.</p>
          </div>
        )}
      </section>
    </div>
  );
}
