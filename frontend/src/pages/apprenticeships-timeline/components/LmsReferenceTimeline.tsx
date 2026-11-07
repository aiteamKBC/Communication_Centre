import { useMemo, useState, type ReactNode } from 'react';
import { lmsCohortDisplayName, type PresentedLmsRow } from '../lmsComparison';
import { buildLmsTimelineLayout, lmsRecordGroup } from '../lmsTimelineLayout';
import { adjustLmsTimelineForHolidays, buildLmsHolidayWeeks } from '../lmsHolidaySchedule';
import type { CustomModule, Holiday, ProgrammeGroup, ZoomLevel } from '../types';
import GanttTimeline from './GanttTimeline';

const noEdit = () => {};

export interface LmsReferenceTimelineProps {
  rows: PresentedLmsRow[];
  currentProgrammes: ProgrammeGroup[];
  currentModules: CustomModule[];
  holidays: Holiday[];
  comparisonZoom?: ZoomLevel;
  renderOverview: (groups: ProgrammeGroup[], modules: CustomModule[]) => ReactNode;
  onViewModule: (group: ProgrammeGroup, rowIndex: number, blockId: string, modules: CustomModule[]) => void;
}

export default function LmsReferenceTimeline({ rows, currentProgrammes, currentModules, holidays, comparisonZoom, renderOverview, onViewModule }: LmsReferenceTimelineProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const holidayWeeks = useMemo(() => buildLmsHolidayWeeks(holidays), [holidays]);
  const { groups, customModules } = useMemo(() => {
    const layout = buildLmsTimelineLayout(rows, currentProgrammes, currentModules);
    return { ...layout, groups: adjustLmsTimelineForHolidays(layout.groups, holidayWeeks) };
  }, [rows, currentProgrammes, currentModules, holidayWeeks]);
  const adjustedBlocks = new Map(groups.flatMap(group => group.rows.flatMap(row => row.blks))
    .map(block => [block.moduleCatalogueId, block]));
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
      'Start Date': adjustedBlocks.get(row.sourceModuleId)?.startDate ?? row.startDate ?? '',
      'End Date': adjustedBlocks.get(row.sourceModuleId)?.endDate ?? row.endDate ?? '',
      'Original LMS Start Date': row.startDate ?? '', 'Original LMS End Date': row.endDate ?? '',
      'Holiday Delay (Weeks)': adjustedBlocks.get(row.sourceModuleId)?.lmsHolidayDelayWeeks ?? 0,
      'Start Date Source': row.startDateSource || (row.startDate ? 'start_date' : ''),
      'Source Module ID': row.sourceModuleId,
    })));
    XLSX.utils.book_append_sheet(workbook, sheet, 'LMS Training Plan');
    XLSX.writeFile(workbook, 'lms-training-plan-reference.xlsx');
  };
  const creationDateCount = rows.filter(row => row.startDateSource === 'created_at').length;

  return <div className="space-y-4" role="region" aria-label="LMS reference timeline">
    <div className="training-plan-gantt-shell bg-white rounded-xl overflow-visible border border-gray-200">
    {groups.length ? <GanttTimeline groups={groups} customModules={customModules} holidays={holidayWeeks} zoom={comparisonZoom ?? zoom} onZoomChange={setZoom}
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
      <p>Light purple bands mark holiday weeks, Monday–Friday; darker lines mark the actual holiday dates. Hover over a band or select a holiday line to see the exact day and its week off. A weekday holiday pauses the whole week and shifts this group's following modules. Displayed and exported dates include these delays; original LMS dates are preserved.</p>
      {creationDateCount > 0 && <p className="mt-2">{creationDateCount} LMS module{creationDateCount === 1 ? ' uses its' : 's use their'} creation date because start_date is missing. These dates are labelled <strong>From created_at</strong>.</p>}
    </div>
    </div>
    {groups.length > 0 && <div data-lms-plan-overview>{renderOverview(groups, customModules)}</div>}
  </div>;
}
