import { useMemo, useState } from 'react';
import { GitMerge } from 'lucide-react';
import type { PresentedLmsRow } from '../lmsComparison';
import { buildMergedTimelineLayout } from '../lmsTimelineLayout';
import type { CatalogModule, CustomModule, Holiday, ProgrammeGroup, TutorProfile, ZoomLevel } from '../types';
import GanttTimeline from './GanttTimeline';
import LmsModuleRecords from './LmsModuleRecords';

const noEdit = () => {};

export default function MergedPlanTimeline({ records, currentProgrammes, customModules, holidays, catalogModules, tutorProfiles }: {
  records: PresentedLmsRow[];
  currentProgrammes: ProgrammeGroup[];
  customModules: CustomModule[];
  holidays: Holiday[];
  catalogModules: CatalogModule[];
  tutorProfiles: TutorProfile[];
}) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const layout = useMemo(() => buildMergedTimelineLayout(records, currentProgrammes, customModules),
    [records, currentProgrammes, customModules]);

  return <div className="training-plan-gantt-shell overflow-visible rounded-xl border border-gray-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-kbc-navy"><GitMerge size={18} aria-hidden="true" />Merged Training Plans</h2>
        <p className="mt-1 text-xs text-gray-500">Both plans in each programme, ordered by first module date (newest first).</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-bold" aria-label="Plan sources">
        <span className="rounded-full bg-kbc-navy px-3 py-1 text-white">Current Training Plan</span>
        <span className="rounded-full bg-teal-800 px-3 py-1 text-white">LMS Training Plan</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Read only</span>
      </div>
    </div>
    {layout.undrawableCount > 0 && <p role="status" className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-900">
      {layout.undrawableCount} LMS module{layout.undrawableCount === 1 ? ' has' : 's have'} missing or invalid dates. View them in the LMS modules list below.
    </p>}
    {layout.groups.length ? <GanttTimeline groups={layout.groups} customModules={layout.customModules} holidays={holidays}
      catalogModules={catalogModules} tutorProfiles={tutorProfiles} zoom={zoom} onZoomChange={setZoom}
      mergedSources canManageCohorts={false} onAddRow={noEdit} onEditRow={noEdit} onDeleteRow={noEdit} />
      : <p role="status" className="px-4 py-8 text-center text-sm text-gray-500">No programmes are available for the merged timeline.</p>}
    <LmsModuleRecords rows={records} />
  </div>;
}
