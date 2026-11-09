import { useMemo, useState } from 'react';
import { AlertCircle, CheckCheck, GitMerge, LockKeyhole, Plus } from 'lucide-react';
import ModernSelect from '../../../components/feature/ModernSelect';
import type { PresentedLmsRow } from '../lmsComparison';
import { buildMergedTimelineLayout } from '../lmsTimelineLayout';
import type { CatalogModule, CustomModule, Holiday, ProgrammeGroup, TutorProfile, ZoomLevel } from '../types';
import GanttTimeline from './GanttTimeline';
import type { LmsReferenceTimelineProps } from './LmsReferenceTimeline';
import type { SaveLmsModuleMatch } from './LmsModuleMatcher';
import ManualMergeList from './ManualMergeList';

const noEdit = () => {};

export default function MergedPlanTimeline({ records, currentProgrammes, customModules, holidays, catalogModules, tutorProfiles, onManualMerge, onViewModule, onSaveManualMerge }: {
  records: PresentedLmsRow[];
  currentProgrammes: ProgrammeGroup[];
  customModules: CustomModule[];
  holidays: Holiday[];
  catalogModules: CatalogModule[];
  tutorProfiles: TutorProfile[];
  onManualMerge: () => void;
  onViewModule: LmsReferenceTimelineProps['onViewModule'];
  onSaveManualMerge?: SaveLmsModuleMatch;
}) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [filter, setFilter] = useState<'all' | 'manual' | 'automatic'>('all');
  const layout = useMemo(() => buildMergedTimelineLayout(records, currentProgrammes, customModules, 'automatic'),
    [records, currentProgrammes, customModules]);
  const visibleGroups = useMemo(() => filter === 'all' ? layout.groups : layout.groups
    .map(group => ({ ...group, rows: group.rows.filter(row => row.mergeMatch?.method === filter) }))
    .filter(group => group.rows.length), [layout.groups, filter]);

  return <div className="tp-merged-plan training-plan-gantt-shell overflow-visible rounded-xl border border-gray-200 bg-white">
    <div className="tp-merged-overview">
      <div className="tp-merged-heading">
        <span className="tp-merged-icon"><GitMerge size={22} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2>Merged Training Plans</h2>
          <p>Current and LMS schedules, together. Select either half of a matched card to view its details and dates.</p>
        </div>
        <button type="button" onClick={() => { setFilter('manual'); onManualMerge(); }} className="tp-merged-add">
          <Plus size={16} aria-hidden="true" />Add manual match
        </button>
      </div>
      <div className="tp-merged-summary" aria-live="polite">
        <dl className="tp-merged-stats">
          <div><dt><GitMerge size={14} aria-hidden="true" />Manual pairs</dt><dd>{layout.manualPairCount}</dd></div>
          <div><dt><CheckCheck size={15} aria-hidden="true" />Automatic pairs</dt><dd>{layout.automaticPairCount}</dd></div>
          <div className={layout.reviewCount > 0 ? 'tp-merged-review' : ''}><dt><AlertCircle size={14} aria-hidden="true" />Need manual review</dt><dd>{layout.reviewCount}</dd></div>
        </dl>
        <div className="tp-merged-sources" aria-label="Plan sources">
          <span><i className="tp-source-dot" />Current Training Plan</span>
          <span><i className="tp-source-dot tp-source-dot-lms" />LMS Training Plan</span>
          <span className="tp-merged-readonly"><LockKeyhole size={11} aria-hidden="true" />Read only</span>
        </div>
      </div>
    </div>
    <GanttTimeline groups={visibleGroups} customModules={layout.customModules} holidays={holidays}
      onViewMonthlyBreakdown={(groupIndex, rowIndex, blockId) => onViewModule(visibleGroups[groupIndex], rowIndex, blockId, layout.customModules)}
      catalogModules={catalogModules} tutorProfiles={tutorProfiles} zoom={zoom} onZoomChange={setZoom}
      toolbarControls={<div className="ml-2 flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-semibold text-kbc-navy">
        <span>Show merges</span>
        <ModernSelect value={filter} onChange={value => setFilter(value as typeof filter)}
          ariaLabel="Show merges"
          options={[
            { value: 'all', label: 'All merges' },
            { value: 'manual', label: 'Manual only' },
            { value: 'automatic', label: 'Automatic only' },
          ]}
          className="w-[152px]"
          buttonClassName="h-8 !gap-2 !rounded-lg !px-2.5 !py-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 [&>span:first-child]:text-xs [&>span:first-child]:font-semibold [&>span:first-child]:text-kbc-navy [&>span:last-child]:h-5 [&>span:last-child]:w-5 [&>span:last-child]:rounded-md"
          menuMinWidth={180}
          menuClassName="!rounded-xl !bg-white !p-1.5 [&_[role=option]]:gap-2 [&_[role=option]]:rounded-lg [&_[role=option]]:px-2.5 [&_[role=option]]:py-2 [&_[role=option]>span:last-child]:text-xs [&_[role=option]>span:last-child]:font-semibold" />
      </div>}
      beforeTimeline={!visibleGroups.length && <p role="status" className="px-4 py-8 text-center text-sm text-gray-500">{filter === 'all'
        ? 'No programmes are available for the merged timeline.'
        : `No ${filter} matches to display.${filter === 'manual' ? ' Use Add manual match to choose a pair.' : ''}`}</p>}
      mergedSources canManageCohorts={false} onAddRow={noEdit} onEditRow={noEdit} onDeleteRow={noEdit} />
    <ManualMergeList groups={currentProgrammes} records={records} customModules={customModules} onSave={onSaveManualMerge} />
  </div>;
}
