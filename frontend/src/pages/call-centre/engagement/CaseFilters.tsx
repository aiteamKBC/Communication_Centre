import type { OverviewCase } from '../api';
import '../styles/case-filters.css';

export type CaseFilterValues = { coach: string; cohort: string; module: string };
export const EMPTY_CASE_FILTERS: CaseFilterValues = { coach: '', cohort: '', module: '' };
const FIELDS = ['coach', 'cohort', 'module'] as const;
const LABELS = { coach: 'Coach', cohort: 'Cohort', module: 'Module' };
const MISSING = '__not_recorded__';
const normal = (value: string) => value.trim().toLocaleLowerCase('en-GB');

function contexts(ticket: OverviewCase) {
  return ticket.filter_contexts?.length ? ticket.filter_contexts : [{
    coach: ticket.coach || '', cohort: '', module: ticket.module || ticket.missed_lecture?.module || '',
  }];
}

export function matchesCaseFilters(ticket: OverviewCase, filters: CaseFilterValues) {
  return contexts(ticket).some(context => FIELDS.every(field =>
    !filters[field] || (normal(context[field]) || MISSING) === filters[field]));
}

export default function CaseFilters({ cases, value, onChange }: {
  cases: OverviewCase[]; value: CaseFilterValues; onChange: (value: CaseFilterValues) => void;
}) {
  return (
    <div className="ed-case-filters" role="group" aria-label="Coach, cohort and module filters">
      {FIELDS.map(field => {
        const options = new Map<string, string>();
        for (const ticket of cases) for (const context of contexts(ticket)) {
          const label = context[field].trim();
          const key = normal(label) || MISSING;
          if (!options.has(key)) options.set(key, label || 'Not recorded');
        }
        // A refresh may remove the last matching case. Retain the active filter
        // until the user clears it rather than silently expanding the list.
        if (value[field] && !options.has(value[field])) {
          options.set(value[field], value[field] === MISSING ? 'Not recorded' : value[field]);
        }
        return <label key={field}>{LABELS[field]}
          <select aria-label={`Filter by ${field}`} value={value[field]}
            onChange={event => onChange({ ...value, [field]: event.target.value })}>
            <option value="">All {field === 'coach' ? 'coaches' : field === 'cohort' ? 'cohorts' : 'modules'}</option>
            {[...options].sort(([a, left], [b, right]) =>
              a === MISSING ? 1 : b === MISSING ? -1 : left.localeCompare(right, 'en-GB', { numeric: true }))
              .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>;
      })}
      {FIELDS.some(field => value[field]) && <button type="button" onClick={() => onChange({ ...EMPTY_CASE_FILTERS })}>
        Clear coach / cohort / module
      </button>}
    </div>
  );
}
