import { lmsCohortDisplayName, lmsGroupDisplayName, type CurrentPlanRecord, type matchLmsPlans, type PresentedLmsRow } from '../lmsComparison';

const cellClass = 'px-4 py-3 align-top text-xs text-gray-700';
const tableClass = 'w-full min-w-[760px] border-collapse text-left';
const headClass = 'bg-slate-100 text-xs text-kbc-navy';
const summaryClass = 'cursor-pointer px-4 py-3 text-xs font-bold text-kbc-navy';
const currentId = (record: CurrentPlanRecord) => JSON.stringify([record.programme.id, record.cohort.id, record.block.id]);

function CurrentIdentity({ record }: { record: CurrentPlanRecord }) {
  return <>
    <strong>{record.programme.name} / {record.cohort.label} / {record.block.groupName || 'Group not provided'} / {record.module}</strong>
    <span className="mt-1 block text-gray-500">Current record: {record.block.trainingPlanId || record.block.id}</span>
    <span className="mt-1 block text-gray-500">Start date: {record.block.startDate || 'Not provided'}</span>
  </>;
}

function LmsIdentity({ record, inferredGroup }: { record: PresentedLmsRow; inferredGroup?: string }) {
  const titleGroup = record.module?.match(/\b(?:g|group)\s*[-:]?\s*(\d+)\s*\)?\s*$/i)?.[1];
  const group = lmsGroupDisplayName(record) || (titleGroup ? `Group ${titleGroup}` : inferredGroup ? `${inferredGroup} (from matched Training Plan module)` : 'Group not provided');
  return <>
    <strong>{record.programme} / {lmsCohortDisplayName(record) || 'Cohort not provided'} / {group} / {record.module || 'Module not provided'}</strong>
    {record.matchedPlanCohort && <span className="mt-1 block text-gray-500">Cohort name from Training Plan; LMS cohort name is missing.</span>}
    {record.matchedPlanGroup && <span className="mt-1 block text-gray-500">Group name from Training Plan; LMS group name is missing.</span>}
    <span className="mt-1 block text-gray-500">LMS record: {record.sourceModuleId}</span>
    <span className="mt-1 block text-gray-500">Start date: {record.startDate || 'Not provided'}</span>
  </>;
}

export default function PlanMatchingResults({ result, onMatchCurrent }: { result: ReturnType<typeof matchLmsPlans>; onMatchCurrent?: (current: CurrentPlanRecord) => void }) {
  const { matched, unmatchedCurrent, unmatchedLms, review } = result;
  return <section aria-labelledby="plan-matching-heading" className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
    <div className="border-b border-gray-100 px-4 py-4">
      <h2 id="plan-matching-heading" className="text-sm font-extrabold text-kbc-navy">1. Match records</h2>
      <p className="mt-1 text-xs text-gray-500">Automatic matching uses module name and identical valid start dates within the same programme. Cohort and group labels distinguish repeated modules; missing labels or a different cohort name allow a confirmed one-to-one match. Explicit group conflicts prevent automatic matching. To compare a different pair, open Edit Module and save a manual match.</p>
      <p className="mt-2 text-xs font-semibold text-kbc-navy" role="status">{matched.length} confirmed matches · {unmatchedCurrent.length} current records unmatched · {unmatchedLms.length} LMS records unmatched · {review.length} current records need match review</p>
      <p className="mt-1 text-xs text-gray-500">Unmatched and uncertain records are excluded from comparison and difference counts.</p>
      {!matched.length && <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No confirmed matches yet. Review the reasons below or choose a manual pair in Edit Module. Automatic matches require identical start dates.</p>}
    </div>
    <details>
      <summary className={summaryClass}>Matched records ({matched.length})</summary>
      <div className="max-h-96 overflow-auto">
        <table className={tableClass} aria-label="Confirmed record matches">
          <thead className={headClass}><tr><th className={cellClass}>Current Training Plan record</th><th className={cellClass}>LMS record</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {matched.map(({ current, lms, method }) => <tr key={currentId(current)}>
              <td className={cellClass}><CurrentIdentity record={current} />{method === 'manual' && <span className="mt-2 inline-block rounded bg-teal-50 px-2 py-1 font-bold text-teal-800">Manual match</span>}</td>
              <td className={cellClass}><LmsIdentity record={lms} inferredGroup={current.block.groupName || 'Single cohort group'} /></td>
            </tr>)}
            {!matched.length && <tr><td colSpan={2} className={cellClass}>No confirmed matches yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </details>
    {(unmatchedCurrent.length > 0 || unmatchedLms.length > 0) && <details open={!matched.length} className="border-t border-gray-100">
      <summary className={summaryClass}>Unmatched records ({unmatchedCurrent.length + unmatchedLms.length}) — excluded from comparison</summary>
      <div className="max-h-96 overflow-auto">
        <table className={tableClass} aria-label="Unmatched records excluded from comparison">
          <thead className={headClass}><tr><th className={cellClass}>Source</th><th className={cellClass}>Record awaiting a match</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {unmatchedCurrent.map(current => <tr key={currentId(current)}><td className={cellClass}>Current Training Plan{onMatchCurrent && current.block.trainingPlanId && <button type="button" onClick={() => onMatchCurrent(current)} className="mt-2 block rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 font-bold text-teal-900">Match manually</button>}</td><td className={cellClass}><CurrentIdentity record={current} /><span className="mt-2 block text-amber-800">{current.reason}</span></td></tr>)}
            {unmatchedLms.map(lms => <tr key={`lms:${lms.sourceModuleId}`}><td className={cellClass}>LMS</td><td className={cellClass}><LmsIdentity record={lms} /></td></tr>)}
          </tbody>
        </table>
      </div>
    </details>}
    {review.length > 0 && <details className="border-t border-gray-100">
      <summary className={summaryClass}>Matches needing review ({review.length}) — excluded from comparison</summary>
      <div className="max-h-96 overflow-auto">
        <table className={tableClass} aria-label="Uncertain matches excluded from comparison">
          <thead className={headClass}><tr><th className={cellClass}>Current Training Plan record</th><th className={cellClass}>Possible LMS records</th><th className={cellClass}>Review reason</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {review.map(({ current, candidates, reason }) => <tr key={currentId(current)}>
              <td className={cellClass}><CurrentIdentity record={current} />{onMatchCurrent && current.block.trainingPlanId && <button type="button" onClick={() => onMatchCurrent(current)} className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 font-bold text-teal-900">Match manually</button>}</td>
              <td className={cellClass}>{candidates.map(record => <div key={record.sourceModuleId} className="mb-2"><LmsIdentity record={record} /></div>)}</td>
              <td className={cellClass}>{reason}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </details>}
  </section>;
}
