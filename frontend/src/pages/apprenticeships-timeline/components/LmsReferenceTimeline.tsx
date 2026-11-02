import { useMemo, useState } from 'react';
import type { LmsReferenceRow } from '../lmsReference';
import type { CustomModule, ProgrammeGroup, ZoomLevel } from '../types';
import GanttTimeline from './GanttTimeline';
import * as XLSX from 'xlsx';

// Only complete source date ranges can be drawn; never infer dates from the live plan.
function hasLmsDateRange(row: LmsReferenceRow): boolean {
  const valid = (value: string | null): value is string => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  return valid(row.startDate) && valid(row.endDate) && row.startDate <= row.endDate;
}

const colours = ['#0F766E', '#0E7490', '#0369A1', '#047857'];
const noEdit = () => {};

export default function LmsReferenceTimeline({ rows, comparisonZoom }: { rows: LmsReferenceRow[]; comparisonZoom?: ZoomLevel }) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const exportReference = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows.map(row => ({
      Source: 'LMS', Programme: row.programme ?? '', Module: row.module ?? '',
      'Start Date': row.startDate ?? '', 'End Date': row.endDate ?? '',
      'Source Module ID': row.sourceModuleId,
    })));
    XLSX.utils.book_append_sheet(workbook, sheet, 'LMS Training Plan');
    XLSX.writeFile(workbook, 'lms-training-plan-reference.xlsx');
  };
  const { groups, customModules } = useMemo(() => {
    const programmes = new Map<string, ProgrammeGroup>();
    const customModules: CustomModule[] = [];
    rows.filter(hasLmsDateRange).forEach(row => {
      // Source identifiers keep distinct programmes/modules separate even when names repeat.
      const key = JSON.stringify([row.sourceProgrammeId, row.programme]);
      let group = programmes.get(key);
      if (!group) {
        group = {
          id: `lms-programme:${key}`, name: row.programme?.trim() || 'Programme not provided',
          sub: 'LMS reference', color: '#115E59',
          rows: [{ id: `lms-modules:${key}`, label: 'LMS modules', dateLbl: '', intake: '', quarter: '', blks: [] }],
        };
        programmes.set(key, group);
      }
      let hash = 0;
      for (const character of row.sourceModuleId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
      const moduleId = `lms-module:${row.sourceModuleId}`;
      const moduleName = row.module?.trim() || 'Module not provided';
      const color = colours[hash % colours.length];
      customModules.push({ id: moduleId, name: moduleName, defaultSessions: 0, bg: color, tx: '#FFFFFF' });
      group.rows[0].blks.push({
        id: moduleId, source: 'LMS', moduleCatalogueId: row.sourceModuleId, mod: moduleId,
        groupName: `${moduleName} · #${row.sourceModuleId}`, color,
        startDate: row.startDate!, endDate: row.endDate!,
        // The capture contains no tutor, group, session or completion information.
        tutor: '', sessions: 0,
      });
    });
    return { groups: [...programmes.values()], customModules };
  }, [rows]);

  if (!groups.length) return <p role="status" className="px-4 py-6 text-sm text-gray-600">
    No LMS modules with a complete, valid date range are available for this timeline.
  </p>;

  return <div className="training-plan-gantt-shell bg-white rounded-xl overflow-visible border border-gray-200" role="region" aria-label="LMS reference timeline">
    <GanttTimeline groups={groups} customModules={customModules} holidays={[]} zoom={comparisonZoom ?? zoom} onZoomChange={setZoom}
      showZoomControls={comparisonZoom === undefined}
      referenceSource="LMS" canManageCohorts={false}
      onExportExcel={exportReference}
      onAddRow={noEdit} onEditRow={noEdit} onDeleteRow={noEdit} />
  </div>;
}
