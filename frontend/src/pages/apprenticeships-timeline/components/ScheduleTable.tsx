import { Fragment } from 'react';
import type { ProgrammeGroup, WeekDayKey } from '../types';
import { getModuleMeta } from '../data';

interface SessionCell {
  trainer: string;
  time: string;
}

interface DerivedScheduleRow {
  cohort: string;
  programme: string;
  programmeColor: string;
  module: string;
  saturday?: SessionCell;
  monday?: SessionCell;
  tuesday?: SessionCell;
  wednesday?: SessionCell;
  thursday?: SessionCell;
  friday?: SessionCell;
  nextModule: string;
  rowHighlight?: string;
  startDate: string;
  endDate: string;
}

interface ProgrammeSection {
  programme: string;
  programmeColor: string;
  rows: DerivedScheduleRow[];
}

interface Props {
  groups: ProgrammeGroup[];
}

type DayKey = WeekDayKey;

const JS_DAY_TO_KEY: Record<number, DayKey> = {
  0: 'monday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const DAY_COLS: { key: DayKey; label: string; cellBg: string; headerBg: string; headerTx: string }[] = [
  { key: 'saturday', label: 'SATURDAY', cellBg: '#EEF2FB', headerBg: '#1B2A4A', headerTx: '#fff' },
  { key: 'monday', label: 'MONDAY', cellBg: '#EDF1FA', headerBg: '#243560', headerTx: '#fff' },
  { key: 'tuesday', label: 'TUESDAY', cellBg: '#EBF0F8', headerBg: '#2E4482', headerTx: '#fff' },
  { key: 'wednesday', label: 'WEDNESDAY', cellBg: '#E9EFF7', headerBg: '#3D5A99', headerTx: '#fff' },
  { key: 'thursday', label: 'THURSDAY', cellBg: '#FFF8E0', headerBg: '#F7A800', headerTx: '#1B2A4A' },
  { key: 'friday', label: 'FRIDAY', cellBg: '#FFF3CC', headerBg: '#C49A00', headerTx: '#fff' },
];

function inferDayFromIsoDate(isoDate: string): DayKey {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return 'monday';
  }
  return JS_DAY_TO_KEY[d.getDay()] || 'monday';
}

function programmeLabelFromGroupName(groupName: string): string {
  const levelMatch = groupName.match(/L\d+/);
  const codeMatch = groupName.match(/\(([^)]+)\)/);

  const level = levelMatch?.[0] || '';
  const code = codeMatch?.[1] || groupName.split('\n')[0];

  return `${code} ${level}`.trim();
}

function formatMeridiemTime(time24: string): string {
  const [hRaw, mRaw] = time24.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return time24;
  }

  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minute = m.toString().padStart(2, '0');
  return `${hour12}:${minute} ${suffix}`;
}

function formatTimeRange(start: string, end: string): string {
  return `${formatMeridiemTime(start)} - ${formatMeridiemTime(end)}`;
}

function toDerivedRows(groups: ProgrammeGroup[]): DerivedScheduleRow[] {
  return groups
    .flatMap(group =>
      group.rows.flatMap(row =>
        row.blks.map((blk, idx) => {
          const moduleName = getModuleMeta(blk.mod).lbl;
          const nextModule = row.blks[idx + 1] ? getModuleMeta(row.blks[idx + 1].mod).lbl : 'EPA';
          const weekdays = blk.days?.length ? blk.days : [inferDayFromIsoDate(blk.startDate)];
          const trainer = blk.tutor?.trim() || 'TBD';
          const startTime = blk.sessionStartTime || '09:00';
          const endTime = blk.sessionEndTime || '11:00';
          const cell: SessionCell = { trainer, time: formatTimeRange(startTime, endTime) };

          const base: DerivedScheduleRow = {
            cohort: row.dateLbl || row.label,
            programme: programmeLabelFromGroupName(group.name),
            programmeColor: group.color,
            module: moduleName,
            nextModule,
            startDate: blk.startDate,
            endDate: blk.endDate,
          };

          weekdays.forEach(day => {
            base[day] = cell;
          });

          return base;
        }),
      ),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function toProgrammeSections(rows: DerivedScheduleRow[]): ProgrammeSection[] {
  const sectionsMap = new Map<string, ProgrammeSection>();

  rows.forEach(row => {
    const existing = sectionsMap.get(row.programme);
    if (existing) {
      existing.rows.push(row);
      return;
    }

    sectionsMap.set(row.programme, {
      programme: row.programme,
      programmeColor: row.programmeColor,
      rows: [row],
    });
  });

  const sections = Array.from(sectionsMap.values());
  sections.forEach(section => {
    section.rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
  });

  return sections.sort((a, b) => a.programme.localeCompare(b.programme));
}

export default function ScheduleTable({ groups }: Props) {
  const rows = toDerivedRows(groups);
  const sections = toProgrammeSections(rows);

  // Today's sessions
  const todayIndex = new Date().getDay();
  const todayKey: DayKey = JS_DAY_TO_KEY[todayIndex];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const todays = rows.filter(r => {
    const cell = r[todayKey];
    if (!cell) return false;
    const start = new Date(r.startDate).getTime();
    const end = new Date(r.endDate).getTime();
    return !Number.isNaN(start) && !Number.isNaN(end) && todayTs >= start && todayTs <= end;
  });

  const renderCell = (cell: SessionCell | undefined, bg: string) => {
    if (!cell) return <td className="border border-gray-200 px-2 py-1.5" style={{ minWidth: 140 }} />;
    return (
      <td className="border border-gray-200 px-2 py-1.5 text-center" style={{ background: bg, minWidth: 140 }}>
        <p className="font-semibold leading-tight" style={{ fontSize: '11px', color: '#1F2937' }}>{cell.trainer}</p>
        <p style={{ fontSize: '10px', color: '#6B7280' }}>({cell.time})</p>
      </td>
    );
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-300">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200" style={{ background: '#F9FAFB' }}>
        <div>
          <h3 className="font-extrabold text-kbc-navy text-sm tracking-wide">Session Schedule Table</h3>
          <p className="text-xs text-gray-400 mt-0.5">{rows.length} active sessions across all programmes</p>
        </div>
      </div>

      {/* Today's sessions container */}
      <div className="px-5 py-4 border-b bg-white">
        <h4 className="text-sm font-bold text-kbc-navy">Today's Sessions</h4>
        {todays.length === 0 ? (
          <p className="text-xs text-gray-400 mt-2">No sessions scheduled for today.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {todays.map((s, i) => (
              <li key={`${s.cohort}-${s.module}-${i}`} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{s.module}</p>
                  <p className="text-xs text-gray-500">{s.cohort} · {s.programme}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-700">{(s as any)[todayKey]?.time}</p>
                  <p className="text-xs text-gray-400">{(s as any)[todayKey]?.trainer}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              <th colSpan={3} className="border border-gray-300 text-center py-2.5 font-extrabold tracking-wide text-white text-sm" style={{ background: '#1B2A4A' }}>
                Apprenticeship
              </th>
              <th colSpan={6} className="border border-gray-300 text-center py-2.5 font-extrabold tracking-widest text-sm" style={{ background: '#F7A800', color: '#1B2A4A' }}>
                2026
              </th>
              <th className="border border-gray-300 text-center py-2.5 font-extrabold text-white text-xs" style={{ background: '#1B2A4A' }}>
                Next Module
              </th>
            </tr>
            <tr style={{ background: '#F1F5F9' }}>
              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide" style={{ minWidth: 80 }}>Cohort</th>
              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide" style={{ minWidth: 80 }}>Programme</th>
              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide" style={{ minWidth: 130 }}>Module</th>
              {DAY_COLS.map(d => (
                <th key={d.key} className="border border-gray-200 px-2 py-2 text-center text-xs font-extrabold uppercase tracking-wide" style={{ background: d.headerBg, color: d.headerTx, minWidth: 140 }}>
                  {d.label}
                </th>
              ))}
              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-extrabold text-gray-600 uppercase tracking-wide" style={{ minWidth: 90 }}>Next Module</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <Fragment key={`section-${section.programme}`}>
                <tr>
                  <td colSpan={10} className="border border-gray-200 px-3 py-2" style={{ background: '#F8FAFF' }}>
                    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold" style={{ color: section.programmeColor, background: `${section.programmeColor}14` }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: section.programmeColor }} />
                      {section.programme}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">{section.rows.length} module session{section.rows.length === 1 ? '' : 's'}</span>
                  </td>
                </tr>
                {section.rows.map((row, idx) => (
                  <tr key={`${section.programme}-${row.cohort}-${row.module}-${idx}`} className="group/srow hover:brightness-95 transition-all" style={{ background: row.rowHighlight || (idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB') }}>
                    <td className="border border-gray-200 px-3 py-1.5">
                      <span className="font-extrabold text-xs text-gray-700 whitespace-nowrap">{row.cohort}</span>
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5">
                      <span className="font-bold text-xs whitespace-nowrap" style={{ color: row.programmeColor }}>{row.programme}</span>
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5">
                      <span className="text-xs text-gray-700 font-semibold">{row.module}</span>
                    </td>
                    {DAY_COLS.map(d => renderCell(row[d.key] as SessionCell | undefined, d.cellBg))}
                    <td className="border border-gray-200 px-3 py-1.5">
                      <span className="text-xs font-bold text-gray-600 whitespace-nowrap">{row.nextModule}</span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-sm text-gray-400 italic border border-gray-200">
                  No sessions yet. Add cohorts and module blocks to populate this schedule.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
