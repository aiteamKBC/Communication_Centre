import type { Issue } from '../api';
import { human, issueLabel, longDate } from './model';

/** All the contact's open cases, regardless of the call-sheet category or date filter. */
export default function LearnerCases({ cases, selected, onOpen }: {
  cases: Issue[]; selected: number; onOpen: (id: number) => void;
}) {
  const groups = new Map<string, Issue[]>();
  for (const c of cases) {
    const label = c.source_type === 'attendance' ? `Lectures · ${c.issue_name || 'Module not recorded'}`
      : ['mcm', 'mcm_missed'].includes(c.source_type) ? 'Monthly coaching (MCM)'
        : ['pr', 'pr_missed'].includes(c.source_type) ? 'Progress reviews (PR)' : issueLabel(c);
    groups.set(label, [...(groups.get(label) || []), c]);
  }
  return <section className="ed-learner-cases" aria-label="All cases for this contact">
    <h3>All cases ({cases.length})</h3>
    <p>Review the learner’s cases in one conversation. One call covers them all: record what happened for every case in one form.</p>
    {[...groups].map(([label, items]) => <section key={label} className="ed-case-group">
      <h4>{label} <span>{items.length}</span></h4>
      <ul>{[...items].sort((a, b) => {
        const left = a.issue_date || a.booking_at || a.created_at || '';
        const right = b.issue_date || b.booking_at || b.created_at || '';
        return (left ? right ? left.localeCompare(right) : -1 : right ? 1 : 0) || a.id - b.id;
      }).map(c => <li key={c.id}>
        <button type="button" aria-pressed={selected === c.id} onClick={() => onOpen(c.id)}
          aria-label={`Open case ${c.id}: ${issueLabel(c)}`} data-contact-case={c.id}>
          <span className="ed-case-list-title">{issueLabel(c)}</span>
          <span>{c.issue_date ? `Issue: ${longDate(c.issue_date)}`
            : c.booking_at ? `Appointment: ${longDate(c.booking_at)}`
              : 'Issue date not recorded'}</span>
          {c.created_at && <small>Opened: {longDate(c.created_at)}</small>}
          {c.next_followup_at && <small>Follow-up: {longDate(c.next_followup_at)}</small>}
          <small>#{c.id} · {human(c.status)}</small>
        </button>
      </li>)}</ul>
    </section>)}
  </section>;
}
