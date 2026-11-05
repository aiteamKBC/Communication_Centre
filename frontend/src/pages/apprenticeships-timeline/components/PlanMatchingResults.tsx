import type { CurrentPlanRecord, matchLmsPlans, PresentedLmsRow } from '../lmsComparison';

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
  const group = record.groupName || (titleGroup ? `Group ${titleGroup}` : inferredGroup ? `${inferredGroup} (single group inferred)` : 'Group not provided');
  return <>
    <strong>{record.programme} / {record.cohortName || 'Cohort not provided'} / {group} / {record.module || 'Module not provided'}</strong>
    <span className="mt-1 block text-gray-500">LMS record: {record.sourceModuleId}</span>
    <span className="mt-1 block text-gray-500">Start date: {record.startDate || 'Not provided'}</span>
  </>;
}

export default function PlanMatchingResults({ result }: { result: ReturnType<typeof matchLmsPlans> }) {
  const { matched, unmatchedCurrent, unmatchedLms, review } = result;
  return <section aria-labelledby="plan-matching-heading" className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
    <div className="border-b border-gray-100 px-4 py-4">
      <h2 id="plan-matching-heading" className="text-sm font-extrabold text-kbc-navy">1. Match records</h2>
      <p className="mt-1 text-xs text-gray-500">Link the same programme, cohort, module, group and start date before comparing end dates or tutors. Start dates must be valid and identical. A missing LMS group is inferred only when the cohort has one group.</p>
      <p className="mt-2 text-xs font-semibold text-kbc-navy" role="status">{matched.length} confirmed matches · {unmatchedCurrent.length} current records unmatched · {unmatchedLms.length} LMS records unmatched · {review.length} current records need match review</p>
      <p className="mt-1 text-xs text-gray-500">Unmatched and uncertain records are excluded from comparison and difference counts.</p>
      {!matched.length && <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No records meet all matching conditions yet. Review the reasons below. Different start dates stay unmatched, even when the programme, cohort, module and group agree.</p>}
    </div>
    <details>
      <summary className={summaryClass}>Matched records ({matched.length})</summary>
      <div className="max-h-96 overflow-auto">
        <table className={tableClass} aria-label="Confirmed record matches">
          <thead className={headClass}><tr><th className={cellClass}>Current Training Plan record</th><th className={cellClass}>LMS record</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {matched.map(({ current, lms }) => <tr key={currentId(current)}>
              <td className={cellClass}><CurrentIdentity record={current} /></td>
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
            {unmatchedCurrent.map(current => <tr key={currentId(current)}><td className={cellClass}>Current Training Plan</td><td className={cellClass}><CurrentIdentity record={current} /><span className="mt-2 block text-amber-800">{current.reason}</span></td></tr>)}
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
              <td className={cellClass}><CurrentIdentity record={current} /></td>
              <td className={cellClass}>{candidates.map(record => <div key={record.sourceModuleId} className="mb-2"><LmsIdentity record={record} /></div>)}</td>
              <td className={cellClass}>{reason}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </details>}
  </section>;
}
