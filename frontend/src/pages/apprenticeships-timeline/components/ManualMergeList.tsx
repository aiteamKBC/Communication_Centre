import { useMemo, useRef, useState } from 'react';
import { Unlink } from 'lucide-react';
import { comparisonModuleName, lmsCohortDisplayName, type CurrentPlanRecord, type PresentedLmsRow } from '../lmsComparison';
import type { CustomModule, ProgrammeGroup } from '../types';
import { currentMatchKey, type SaveLmsModuleMatch } from './LmsModuleMatcher';

export default function ManualMergeList({ groups, records, customModules, onSave }: {
  groups: ProgrammeGroup[];
  records: PresentedLmsRow[];
  customModules: CustomModule[];
  onSave?: SaveLmsModuleMatch;
}) {
  // Include saved links whose LMS record is unavailable so they can still be removed.
  const saved = useMemo(() => groups.flatMap(programme => programme.rows.flatMap(cohort => cohort.blks
    .filter(block => block.lmsSourceModuleId?.trim())
    .map(block => ({ programme, cohort, block, module: comparisonModuleName(block, customModules) })))), [groups, customModules]);
  const sources = useMemo(() => new Map(records.map(record => [record.sourceModuleId, record])), [records]);
  const [removing, setRemoving] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const remove = async (current: CurrentPlanRecord) => {
    if (!onSave || savingRef.current) return;
    savingRef.current = true;
    setRemoving(currentMatchKey(current));
    setError('');
    setNotice('');
    try {
      if (await onSave(current, '')) setNotice('Manual merge removed. Automatic matching applies again.');
      else setError('The manual merge could not be removed. Please retry.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The manual merge could not be removed. Please retry.');
    } finally {
      savingRef.current = false;
      setRemoving(null);
    }
  };

  return <section aria-label="Saved manual merges" className="border-b border-gray-200 px-4 py-4">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-extrabold text-kbc-navy">Manual merges</h3>
      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-900">{saved.length}</span>
    </div>
    <p className="mb-3 text-xs text-gray-500">All saved manual links, across every programme and timeline filter. Removing a link keeps both modules and their schedules; automatic matching applies again.</p>
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
    {notice && <p role="status" className="mb-3 rounded-lg bg-teal-50 p-3 text-xs font-semibold text-teal-900">{notice}</p>}
    {saved.length ? <ul aria-label="Manual merges" className="max-h-96 space-y-2 overflow-y-auto">
      {saved.map(current => {
        const key = currentMatchKey(current);
        const sourceId = current.block.lmsSourceModuleId!.trim();
        const lms = sources.get(sourceId);
        return <li key={key} className="grid min-w-0 gap-3 rounded-xl border border-gray-200 bg-slate-50/50 p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-kbc-navy">Current Training Plan</p>
            <p className="mt-1 break-words text-xs font-bold text-gray-900">{current.module}</p>
            <p className="mt-1 break-words text-xs text-gray-500">{current.programme.name.replace(/\n/g, ' ')} · {current.cohort.label} · {current.block.groupName || 'Group not provided'}</p>
            <p className="mt-1 text-[11px] text-gray-500">{current.block.startDate || 'Not provided'} → {current.block.endDate || 'Not provided'}</p>
          </div>
          <div className="min-w-0 border-l-2 border-teal-200 pl-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-teal-900">LMS Training Plan</p>
            <p className="mt-1 break-words text-xs font-bold text-gray-900">{lms?.module || 'LMS module unavailable'}</p>
            {lms && <p className="mt-1 break-words text-xs text-gray-500">{lms.programme} · {lmsCohortDisplayName(lms) || 'Cohort not provided'}</p>}
            <p className="mt-1 break-words text-[11px] text-gray-500">Source ID: {sourceId}</p>
            {lms && <p className="mt-1 text-[11px] text-gray-500">{lms.startDate || 'Not provided'} → {lms.endDate || 'Not provided'}</p>}
          </div>
          {onSave && <button type="button" disabled={removing !== null} onClick={() => void remove(current)}
            aria-label={`Remove manual merge: ${current.module}, ${current.cohort.label}, ${current.block.groupName || 'Group not provided'}`}
            className="inline-flex items-center justify-center gap-2 justify-self-start rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50">
            <Unlink size={14} aria-hidden="true" />{removing === key ? 'Removing…' : 'Remove merge'}
          </button>}
        </li>;
      })}
    </ul> : <p className="rounded-lg bg-slate-50 px-3 py-4 text-xs text-gray-500">No saved manual merges yet.</p>}
  </section>;
}
