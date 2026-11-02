import { useMemo, useState } from 'react';
import { compareLmsPlans, differenceLabels, isComparisonDate, type DifferenceKind, type PresentedLmsRow } from '../lmsComparison';
import type { CustomModule, Holiday, ProgrammeGroup } from '../types';

const badgeColours: Record<DifferenceKind, string> = {
  dates: 'border-amber-200 bg-amber-50 text-amber-900',
  incomplete: 'border-orange-200 bg-orange-50 text-orange-900',
  currentOnly: 'border-blue-200 bg-blue-50 text-blue-900',
  lmsOnly: 'border-teal-200 bg-teal-50 text-teal-900',
  ambiguous: 'border-purple-200 bg-purple-50 text-purple-900',
};

function SourceDate({ value, present, ambiguous, changed }: {
  value?: string | null; present: boolean; ambiguous?: boolean; changed: boolean;
}) {
  if (ambiguous) return <span className="text-gray-500">Multiple matches</span>;
  if (!present) return <span className="text-gray-400" aria-label="Module absent from this plan">—</span>;
  if (!value) return <span className="font-medium text-amber-800">Not provided</span>;
  return <span className={changed || !isComparisonDate(value) ? 'rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900' : ''}>
    {value}{!isComparisonDate(value) && <span className="ml-1">(invalid)</span>}
  </span>;
}

export default function PlanDifferences({ currentProgrammes, records, customModules, holidays }: {
  currentProgrammes: ProgrammeGroup[]; records: PresentedLmsRow[]; customModules: CustomModule[]; holidays: Holiday[];
}) {
  const [search, setSearch] = useState('');
  const [programme, setProgramme] = useState('all');
  const [kind, setKind] = useState('all');
  const { differences, matching } = useMemo(
    () => compareLmsPlans(currentProgrammes, records, customModules, holidays), [currentProgrammes, records, customModules, holidays],
  );
  const programmes = useMemo(() => [...new Map(differences.map(row => [row.programmeId, row.programme])).entries()], [differences]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return differences.filter(row => (programme === 'all' || programme === row.programmeId)
      && (kind === 'all' || kind === row.kind)
      && (!query || [row.programme, row.module, row.cohort, row.group, differenceLabels[row.kind]].some(value => value.toLowerCase().includes(query))));
  }, [differences, search, programme, kind]);

  return <section aria-labelledby="plan-differences-heading" className="min-w-0 w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
      <div>
        <h2 id="plan-differences-heading" className="text-sm font-extrabold text-kbc-navy">Plan differences</h2>
        <p className="mt-1 text-xs text-gray-500">Matched by programme and module name, for each current cohort. Repeated LMS names are marked for review.</p>
        <p className="mt-1 text-xs text-gray-500">Current end dates follow the timeline session schedule, including holiday extensions.</p>
      </div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-kbc-navy">{differences.length} differences · {matching} matching</span>
    </div>
    <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-slate-50 px-4 py-3">
      <label className="min-w-48 flex-1 text-xs font-semibold text-gray-600">Search differences
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Programme, module or cohort..."
          className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-kbc-navy" />
      </label>
      <label className="text-xs font-semibold text-gray-600">Difference programme
        <select aria-label="Difference programme" value={programme} onChange={event => setProgramme(event.target.value)} className="mt-1 block h-9 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-kbc-navy">
          <option value="all">All programmes</option>
          {programmes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-gray-600">Difference type
        <select aria-label="Difference type" value={kind} onChange={event => setKind(event.target.value)} className="mt-1 block h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-kbc-navy">
          <option value="all">All differences</option>
          {Object.entries(differenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => { setSearch(''); setProgramme('all'); setKind('all'); }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-kbc-navy">Reset differences filters</button>
      <span className="py-2 text-xs text-gray-500" aria-live="polite">{rows.length} / {differences.length} differences</span>
    </div>
    <div className="max-h-[560px] overflow-auto" tabIndex={0} role="region" aria-label="Plan differences table">
      <table className="w-full min-w-[900px] border-collapse text-left text-xs" aria-label="Plan differences">
        <caption className="sr-only">Only differences between the current Training Plan and the saved LMS capture. Current end dates include scheduled holiday extensions; LMS dates are shown exactly as stored.</caption>
        <thead className="sticky top-0 z-10 text-white">
          <tr>
            <th rowSpan={2} scope="col" className="bg-kbc-navy px-4 py-3">Module / Cohort</th>
            <th colSpan={2} scope="colgroup" className="border-l border-white/20 bg-kbc-navy px-4 py-2 text-center">Current Training Plan</th>
            <th colSpan={2} scope="colgroup" className="border-l border-white/20 bg-teal-800 px-4 py-2 text-center">LMS Training Plan</th>
            <th rowSpan={2} scope="col" className="bg-kbc-navy px-4 py-3">Difference</th>
          </tr>
          <tr>
            <th scope="col" className="border-l border-white/20 bg-kbc-navy px-4 py-2">Start date</th>
            <th scope="col" className="bg-kbc-navy px-4 py-2">End date</th>
            <th scope="col" className="border-l border-white/20 bg-teal-800 px-4 py-2">Start date</th>
            <th scope="col" className="bg-teal-800 px-4 py-2">End date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => <tr key={row.id} className="odd:bg-slate-50/70 hover:bg-slate-100/70">
            <th scope="row" className="max-w-xs px-4 py-3 font-semibold text-kbc-navy">
              {row.module}
              {row.cohort && <span className="mt-1 block font-normal text-gray-500">{row.cohort}{row.group ? ` · ${row.group}` : ''}</span>}
            </th>
            {(['current', 'lms'] as const).map(source => (['startDate', 'endDate'] as const).map(field => <td key={`${source}-${field}`} className={`whitespace-nowrap px-4 py-3 text-gray-700 ${field === 'startDate' ? 'border-l border-gray-100' : ''}`}>
              <SourceDate value={row[source]?.[field]} present={Boolean(row[source])} ambiguous={source === 'lms' && row.kind === 'ambiguous'}
                changed={Boolean(row.current && row.lms && row.current[field] !== row.lms[field])} />
              {source === 'current' && field === 'endDate' && row.current && row.current.baselineEndDate !== row.current.endDate
                && <span className="mt-2 block text-[10px] text-gray-500">Saved: {row.current.baselineEndDate}</span>}
            </td>))}
            <td className="px-4 py-3">
              <span className={`inline-flex whitespace-nowrap rounded border px-2 py-1 font-semibold ${badgeColours[row.kind]}`}>{differenceLabels[row.kind]}</span>
              {row.kind === 'ambiguous' && <span className="mt-1 block text-gray-500">{row.matchCount} LMS records share this name</span>}
            </td>
          </tr>)}
          {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">
            {differences.length ? 'No differences match these filters.' : 'No differences found between the two plans.'}
          </td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
