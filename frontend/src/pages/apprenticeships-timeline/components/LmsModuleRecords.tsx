import { useMemo, useState } from 'react';
import type { PresentedLmsRow } from '../lmsComparison';
import { hasLmsDateRange, lmsRecordGroup } from '../lmsTimelineLayout';
import type { CustomModule, ProgrammeGroup } from '../types';

// Keep modules with missing dates available even though they cannot be drawn.
export default function LmsModuleRecords({ rows, currentProgrammes, currentModules }: {
  rows: PresentedLmsRow[]; currentProgrammes: ProgrammeGroup[]; currentModules: CustomModule[];
}) {
  const [search, setSearch] = useState('');
  const [programme, setProgramme] = useState('all');
  const [dates, setDates] = useState('all');
  const records = useMemo(() => rows.map(row => ({ ...row, group: lmsRecordGroup(row, currentProgrammes, currentModules) })), [rows, currentProgrammes, currentModules]);
  const filtered = records.filter(row => (programme === 'all' || row.planProgrammeId === programme)
    && (dates === 'all' || !hasLmsDateRange(row))
    && [row.programme, row.cohortName, row.group, row.module, row.tutorName, row.sourceModuleId].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const programmes = [...new Map(records.map(row => [row.planProgrammeId, row.programme || 'Programme not provided'])).entries()];
  return <details className="border-t border-gray-200" open>
    <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-kbc-navy">LMS modules ({rows.length})</summary>
    <div className="flex flex-wrap gap-2 border-y border-gray-100 bg-slate-50 px-4 py-3">
      <input type="search" aria-label="Search LMS modules" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search module, group, tutor..." className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
      <select aria-label="LMS modules programme" value={programme} onChange={event => setProgramme(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
        <option value="all">All programmes</option>{programmes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <select aria-label="LMS modules dates" value={dates} onChange={event => setDates(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
        <option value="all">All dates</option><option value="missing">Missing or invalid dates</option>
      </select>
      <button type="button" onClick={() => { setSearch(''); setProgramme('all'); setDates('all'); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Reset modules filters</button>
    </div>
    <div role="region" aria-label="LMS modules table" className="max-h-96 overflow-auto">
      <table className="w-full min-w-[850px] text-left text-xs">
        <caption className="sr-only">All captured LMS modules, including missing or invalid dates</caption>
        <thead className="sticky top-0 bg-slate-100 text-kbc-navy"><tr>{['Programme', 'Cohort', 'Group', 'Module', 'Tutor', 'Start Date', 'End Date'].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead>
        <tbody>{filtered.map(row => <tr key={row.sourceModuleId} className="border-t border-slate-100">
          <td className="px-4 py-3">{row.programme || 'Programme not provided'}</td>
          <td className="px-4 py-3">{row.cohortName || 'Cohort not provided'}</td>
          <td className="px-4 py-3">{row.group}</td>
          <th scope="row" className="px-4 py-3 font-semibold">{row.module || 'Module not provided'}<span className="mt-1 block font-normal text-gray-400">ID: {row.sourceModuleId}</span></th>
          <td className="px-4 py-3">{row.tutorName || 'Not assigned'}</td>
          <td className="whitespace-nowrap px-4 py-3">{row.startDate || 'Not provided'}{row.startDateSource === 'created_at' && <span className="block text-amber-800">From created_at</span>}{!hasLmsDateRange(row) && <span className="block text-amber-800">Missing or invalid date range</span>}</td>
          <td className="whitespace-nowrap px-4 py-3">{row.endDate || 'Not provided'}</td>
        </tr>)}{!filtered.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No modules match these filters.</td></tr>}</tbody>
      </table>
    </div>
  </details>;
}
