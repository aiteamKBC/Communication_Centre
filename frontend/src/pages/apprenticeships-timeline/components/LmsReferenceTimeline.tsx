import { useMemo, useState, type ReactNode } from 'react';
import type { PresentedLmsRow } from '../lmsComparison';
import { buildLmsTimelineLayout, lmsRecordGroup } from '../lmsTimelineLayout';
import LmsModuleRecords from './LmsModuleRecords';
import type { CustomModule, ProgrammeGroup, ZoomLevel } from '../types';
import GanttTimeline from './GanttTimeline';
import * as XLSX from 'xlsx';

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
  const exportReference = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows.map(row => ({
      Source: 'LMS', Programme: row.programme ?? '', Module: row.module ?? '',
      'Tutor Name': row.tutorName ?? '',
      Cohort: row.cohortName ?? '', 'Source Cohort ID': row.cohortId ?? '',
      Group: lmsRecordGroup(row, currentProgrammes, currentModules),
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

  return <div className="training-plan-gantt-shell bg-white rounded-xl overflow-visible border border-gray-200" role="region" aria-label="LMS reference timeline">
    <p className="border-b border-gray-100 px-4 py-3 text-xs text-gray-500">Groups follow matching Training Plan cohorts or group labels in LMS module names. Session schedules, holidays, coaches and KSB mappings are not included in the LMS capture.</p>
    {creationDateCount > 0 && <div className="space-y-1 border-b border-gray-100 px-4 py-3 text-xs text-gray-600">
      <p>{creationDateCount} LMS module{creationDateCount === 1 ? ' uses its' : 's use their'} creation date because start_date is missing. These dates are labelled <strong>From created_at</strong>.</p>
    </div>}
    {groups.length ? <GanttTimeline groups={groups} customModules={customModules} holidays={[]} zoom={comparisonZoom ?? zoom} onZoomChange={setZoom}
      beforeTimeline={<div data-lms-plan-overview>{renderOverview(groups, customModules)}</div>}
      onViewMonthlyBreakdown={(groupIndex, rowIndex, blockId) => onViewModule(groups[groupIndex], rowIndex, blockId, customModules)}
      showZoomControls={comparisonZoom === undefined}
      referenceSource="LMS" canManageCohorts={false}
      onExportExcel={exportReference}
      onAddRow={noEdit} onEditRow={noEdit} onDeleteRow={noEdit} />
      : <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6">
        <p role="status" className="text-sm text-gray-600">No LMS modules with a complete, valid date range are available for this timeline.</p>
        <button type="button" onClick={exportReference} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Export</button>
      </div>}
    <LmsModuleRecords rows={rows} currentProgrammes={currentProgrammes} currentModules={currentModules} />
  </div>;
}
