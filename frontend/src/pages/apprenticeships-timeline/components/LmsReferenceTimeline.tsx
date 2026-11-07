import { useMemo, useState, type ReactNode } from 'react';
import { lmsCohortDisplayName, type PresentedLmsRow } from '../lmsComparison';
import { buildLmsTimelineLayout, lmsRecordGroup } from '../lmsTimelineLayout';
import type { CustomModule, ProgrammeGroup, ZoomLevel } from '../types';
import GanttTimeline from './GanttTimeline';

const noEdit = () => {};

export interface LmsReferenceTimelineProps {
  rows: PresentedLmsRow[];
  currentProgrammes: ProgrammeGroup[];
  currentModules: CustomModule[];
  comparisonZoom?: ZoomLevel;
  renderOverview: (groups: ProgrammeGroup[], modules: CustomModule[]) => ReactNode;
  onViewModule: (group: ProgrammeGroup, rowIndex: number, blockId: string, modules: CustomModule[]) => void;
}

export default function LmsReferenceTimeline({ rows, currentProgrammes, currentModules, comparisonZoom, renderOverview, onViewModule }: LmsReferenceTimelineProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const exportReference = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows.map(row => ({
      Source: 'LMS', Programme: row.programme ?? '', Module: row.module ?? '',
      'Tutor Name': row.tutorName ?? '',
      Cohort: lmsCohortDisplayName(row), 'Source Cohort ID': row.cohortId ?? '',
      'Cohort Name Source': row.cohortName?.trim() ? 'LMS' : row.matchedPlanCohort ? 'Training Plan' : '',
      Group: lmsRecordGroup(row),
      'Group Name Source': row.groupName?.trim() ? 'LMS' : row.matchedPlanGroup ? 'Training Plan'
        : /\b(?:g|group)\s*[-:]?\s*\d+\b/i.test(row.module ?? '') ? 'LMS module title' : '',
      'Start Date': row.startDate ?? '', 'End Date': row.endDate ?? '',
      'Start Date Source': row.startDateSource || (row.startDate ? 'start_date' : ''),
      'Source Module ID': row.sourceModuleId,
    })));
    XLSX.utils.book_append_sheet(workbook, sheet, 'LMS Training Plan');
    XLSX.writeFile(workbook, 'lms-training-plan-reference.xlsx');
  };
  const { groups, customModules } = useMemo(
    () => buildLmsTimelineLayout(rows, currentProgrammes, currentModules), [rows, currentProgrammes, currentModules],
  );
  const creationDateCount = rows.filter(row => row.startDateSource === 'created_at').length;

  return <div className="space-y-4" role="region" aria-label="LMS reference timeline">
    <div className="training-plan-gantt-shell bg-white rounded-xl overflow-visible border border-gray-200">
    {groups.length ? <GanttTimeline groups={groups} customModules={customModules} holidays={[]} zoom={comparisonZoom ?? zoom} onZoomChange={setZoom}
      onViewMonthlyBreakdown={(groupIndex, rowIndex, blockId) => onViewModule(groups[groupIndex], rowIndex, blockId, customModules)}
      showZoomControls={comparisonZoom === undefined}
      referenceSource="LMS" canManageCohorts={false}
      onExportExcel={exportReference}
      onAddRow={noEdit} onEditRow={noEdit} onDeleteRow={noEdit} />
      : <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6">
        <p role="status" className="text-sm text-gray-600">No LMS modules with a complete, valid date range are available for this timeline.</p>
        <button type="button" onClick={exportReference} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Export</button>
      </div>}
    <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
      <p>Group names use LMS labels or confirmed Training Plan matches. Session schedules, holidays, coaches and KSB mappings are not included in the LMS capture.</p>
      {creationDateCount > 0 && <p className="mt-2">{creationDateCount} LMS module{creationDateCount === 1 ? ' uses its' : 's use their'} creation date because start_date is missing. These dates are labelled <strong>From created_at</strong>.</p>}
    </div>
    </div>
    {groups.length > 0 && <div data-lms-plan-overview>{renderOverview(groups, customModules)}</div>}
  </div>;
}
