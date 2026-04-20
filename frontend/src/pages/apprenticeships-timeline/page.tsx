import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '@/components/feature/TopNav';
import Footer from '@/components/feature/Footer';
import type { ProgrammeGroup, CohortRow, Holiday, ZoomLevel, MKey, WeekDayKey } from './types';
import { INITIAL_GROUPS, MS, getModuleMeta } from './data';
import GanttTimeline from './components/GanttTimeline';
import CohortModal from './components/CohortModal';
import HolidayManager from './components/HolidayManager';
import ScheduleTable from '@/pages/apprenticeships-timeline/components/ScheduleTable';
import useAccessControl from '@/hooks/useAccessControl';
import { kbcSuccessSwal, kbcSwal } from '@/components/feature/sweetAlert';

type ModalState =
  | { open: false }
  | { open: true; mode: 'add'; defaultGroupIdx: number }
  | { open: true; mode: 'edit'; groupIdx: number; rowIdx: number; row: CohortRow };

interface TrainingPlanItem {
  cohortName: string;
  program: string;
  startingDateLabel: string;
  moduleName: string;
  tutorName: string;
  startDate: string;
  endDate: string;
  sessionsNumber: string;
  sessionWeekDay: string;
  sessionStartTime: string;
  sessionEndTime: string;
  notes: string;
}

const HOLIDAY_MARKER_PREFIX = '__holiday_ids:';

function splitPersistedNotes(raw: string): { holidayIds: string[]; notes: string } {
  const value = (raw || '').trim();
  if (!value.startsWith(HOLIDAY_MARKER_PREFIX)) {
    return { holidayIds: [], notes: raw || '' };
  }

  const firstLineBreak = value.indexOf('\n');
  const markerLine = firstLineBreak >= 0 ? value.slice(0, firstLineBreak) : value;
  const noteBody = firstLineBreak >= 0 ? value.slice(firstLineBreak + 1) : '';
  const encoded = markerLine.slice(HOLIDAY_MARKER_PREFIX.length);
  const holidayIds = encoded
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);

  return { holidayIds, notes: noteBody };
}

function joinPersistedNotes(notes: string, holidayIds: string[]): string {
  if (!holidayIds.length) {
    return notes;
  }
  const marker = `${HOLIDAY_MARKER_PREFIX}${holidayIds.join('|')}`;
  return notes ? `${marker}\n${notes}` : marker;
}

const DAY_ALIASES: Record<string, WeekDayKey> = {
  saturday: 'saturday',
  sat: 'saturday',
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
};

const moduleKeyByLabel: Record<string, MKey> = Object.entries(MS).reduce((acc, [key, value]) => {
  acc[value.lbl.toLowerCase()] = key as MKey;
  return acc;
}, {} as Record<string, MKey>);

function inferGroupId(program: string): string {
  const p = program.toLowerCase();
  if (p.includes('pcp') || p.includes('project control')) return 'pcp';
  if (p.includes('mm') || p.includes('marketing manager')) return 'mm';
  if (p.includes('me') || p.includes('marketing executive')) return 'me';
  return 'pcp';
}

function parseDays(value: string): WeekDayKey[] {
  const tokens = value
    .split(/[|,;/]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const mapped = tokens
    .map(token => DAY_ALIASES[token])
    .filter((item): item is WeekDayKey => Boolean(item));
  return Array.from(new Set(mapped));
}

function toProgrammeLabel(group: ProgrammeGroup): string {
  const first = group.name.split('\n')[0].trim();
  const code = group.name.match(/\(([^)]+)\)/)?.[1] || first;
  const level = group.name.match(/L\d+/)?.[0] || '';
  return `${code} ${level}`.trim();
}

function emptyGroupsTemplate(): ProgrammeGroup[] {
  return INITIAL_GROUPS.map(group => ({ ...group, rows: [] }));
}

function buildGroupsFromTrainingRows(items: TrainingPlanItem[]): ProgrammeGroup[] {
  const templatesById = new Map(INITIAL_GROUPS.map(group => [group.id, { ...group, rows: [] as CohortRow[] }]));
  const cohortIndex = new Map<string, CohortRow>();

  items.forEach((item, index) => {
    const groupId = inferGroupId(item.program || '');
    const group = templatesById.get(groupId);
    if (!group) {
      return;
    }

    const cohortKey = `${groupId}::${item.cohortName}::${item.startingDateLabel}`;
    let cohort = cohortIndex.get(cohortKey);
    if (!cohort) {
      cohort = {
        id: `db-row-${groupId}-${cohortIndex.size + 1}`,
        label: item.cohortName || 'Cohort',
        dateLbl: item.startingDateLabel || '',
        intake: 'Intake 1',
        quarter: 'Q1 2026',
        blks: [],
      };
      cohortIndex.set(cohortKey, cohort);
      group.rows.push(cohort);
    }

    const modKey = moduleKeyByLabel[(item.moduleName || '').toLowerCase()] || item.moduleName || 'Untitled Module';
    const sessions = Math.max(1, Number.parseInt(item.sessionsNumber || '1', 10) || 1);
    const parsedNotes = splitPersistedNotes(item.notes || '');
    if (parsedNotes.holidayIds.length && (!cohort.holidayIds || cohort.holidayIds.length === 0)) {
      cohort.holidayIds = parsedNotes.holidayIds;
    }
    cohort.blks.push({
      id: `db-blk-${index + 1}`,
      mod: modKey,
      tutor: item.tutorName || '',
      startDate: item.startDate || '2026-01-01',
      endDate: item.endDate || item.startDate || '2026-01-01',
      sessions,
      days: parseDays(item.sessionWeekDay || ''),
      sessionStartTime: item.sessionStartTime || '09:00',
      sessionEndTime: item.sessionEndTime || '11:00',
      notes: parsedNotes.notes || '',
    });
  });

  return INITIAL_GROUPS.map(group => templatesById.get(group.id) || { ...group, rows: [] });
}

function flattenGroupsForApi(groups: ProgrammeGroup[]): TrainingPlanItem[] {
  return groups.flatMap(group =>
    group.rows.flatMap(row =>
      row.blks.map(block => ({
        cohortName: row.label,
        program: toProgrammeLabel(group),
        startingDateLabel: row.dateLbl,
        moduleName: getModuleMeta(block.mod).lbl,
        tutorName: block.tutor,
        startDate: block.startDate,
        endDate: block.endDate,
        sessionsNumber: String(block.sessions),
        sessionWeekDay: (block.days || []).join(', '),
        sessionStartTime: block.sessionStartTime || '09:00',
        sessionEndTime: block.sessionEndTime || '11:00',
        notes: joinPersistedNotes(block.notes || '', row.holidayIds || []),
      })),
    ),
  );
}

export default function ApprenticeshipTimeline() {
  const { canManageCohorts } = useAccessControl();
  const [groups,   setGroups]   = useState<ProgrammeGroup[]>(emptyGroupsTemplate());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [modal,    setModal]    = useState<ModalState>({ open: false });
  const [showHolidayMgr, setShowHolidayMgr] = useState(false);
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [activeTab, setActiveTab] = useState<'gantt' | 'schedule'>('gantt');
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);
  const [trainingPlanSaveState, setTrainingPlanSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [trainingPlanSaveMessage, setTrainingPlanSaveMessage] = useState('Waiting for changes');
  const skipPersistRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingPlan() {
      try {
        const response = await fetch('/api/training-plan/');
        if (!response.ok) {
          return;
        }

        const items = (await response.json()) as TrainingPlanItem[];
        if (!Array.isArray(items) || cancelled) {
          return;
        }

        setGroups(buildGroupsFromTrainingRows(items));
      } catch {
        // Keep initial in-memory data if loading fails.
      }
    }

    void loadTrainingPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingPlanHolidays() {
      try {
        const response = await fetch('/api/training-plan-holidays/');
        if (!response.ok) {
          return;
        }

        const items = (await response.json()) as Holiday[];
        if (!Array.isArray(items) || cancelled) {
          return;
        }

        setHolidays(items);
      } catch {
        // Keep the current in-memory holidays if loading fails.
      }
    }

    void loadTrainingPlanHolidays();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return;

    const controller = new AbortController();
    const payload = { items: flattenGroupsForApi(groups) };

    // Do not POST an empty items array — that would wipe the database on the server.
    if (!Array.isArray(payload.items)) {
      return () => controller.abort();
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving cohorts...');

    void (async () => {
      try {
        const response = await fetch('/api/training-plan/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = (await response.text()).trim();
          throw new Error(errorText || `Request failed with status ${response.status}`);
        }

        setTrainingPlanSaveState('saved');
        setTrainingPlanSaveMessage(`Saved to database at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unknown save error';
        setTrainingPlanSaveState('error');
        setTrainingPlanSaveMessage('Save failed. Refresh would lose the latest cohort changes.');

        void kbcSwal.fire({
          title: 'Cohort Not Saved',
          html: `The latest cohort change is visible on screen, but it did not reach the database.<br /><br /><strong>Details:</strong> ${message}`,
          icon: 'error',
          confirmButtonText: 'OK',
        });
      }
    })();

    return () => controller.abort();
  }, [groups]);

  const persistTrainingPlan = async (nextGroups: ProgrammeGroup[]) => {
    const payload = { items: flattenGroupsForApi(nextGroups) };

    if (!Array.isArray(payload.items)) {
      return false;
    }

    setTrainingPlanSaveState('saving');
    setTrainingPlanSaveMessage('Saving cohorts...');

    try {
      const response = await fetch('/api/training-plan/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      setTrainingPlanSaveState('saved');
      setTrainingPlanSaveMessage(`Saved to database at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      await kbcSwal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Cohort saved successfully',
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      setTrainingPlanSaveState('error');
      setTrainingPlanSaveMessage('Save failed. Refresh would lose the latest cohort changes.');

      await kbcSwal.fire({
        title: 'Cohort Not Saved',
        html: `The latest cohort change was not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });

      return false;
    }
  };

  const persistHolidays = async (nextHolidays: Holiday[]) => {
    const payload = { items: nextHolidays };

    try {
      const response = await fetch('/api/training-plan-holidays/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = (await response.text()).trim();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      setHolidays(nextHolidays);
      await kbcSuccessSwal.fire({
        icon: 'success',
        title: 'Holiday periods saved successfully',
        confirmButtonText: 'OK',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error';
      await kbcSwal.fire({
        title: 'Holiday Periods Not Saved',
        html: `The latest holiday changes were not saved to the database.<br /><br /><strong>Details:</strong> ${message}`,
        icon: 'error',
        confirmButtonText: 'OK',
      });
      return false;
    }
  };

  const handleSave = async (groupIdx: number, row: CohortRow, prevGroupIdx?: number) => {
    if (!canManageCohorts) {
      return false;
    }

    // Build next state synchronously so we can persist immediately and ensure UI updates.
    const next = groups.map(g => ({ ...g, rows: [...g.rows] }));
    if (modal.open && modal.mode === 'edit') {
      const pgi = prevGroupIdx ?? groupIdx;
      next[pgi].rows.splice(modal.rowIdx, 1);
      const insertAt = groupIdx === pgi ? modal.rowIdx : next[groupIdx].rows.length;
      next[groupIdx].rows.splice(insertAt, 0, row);
    } else {
      next[groupIdx].rows.push(row);
    }

    const saved = await persistTrainingPlan(next);
    if (!saved) {
      return false;
    }

    setGroups(next);
    setModal({ open: false });

    return true;
  };

  const handleDeleteRow = async (groupIdx: number, rowIdx: number) => {
    if (!canManageCohorts) {
      return;
    }

    const next = groups.map((g, gi) =>
      gi === groupIdx ? { ...g, rows: g.rows.filter((_, ri) => ri !== rowIdx) } : { ...g, rows: [...g.rows] }
    );

    const saved = await persistTrainingPlan(next);
    if (!saved) {
      return;
    }

    setGroups(next);
  };

  const handleEditRow = (groupIdx: number, rowIdx: number) => {
    if (!canManageCohorts) {
      return;
    }

    const row = groups[groupIdx].rows[rowIdx];
    setModal({ open: true, mode: 'edit', groupIdx, rowIdx, row });
  };

  const totalCohorts  = groups.reduce((s, g) => s + g.rows.length, 0);
  const totalSessions = groups.reduce((s, g) =>
    s + g.rows.reduce((rs, r) => rs + r.blks.reduce((bs, b) => bs + b.sessions, 0), 0), 0);
  const holidayCount  = holidays.length;

  const todaySessions = useMemo(() => {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
    const today = new Date();
    const todayKey = dayNames[today.getDay()];
    const tStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const sessions: Array<{ cohortName: string; program: string; moduleName: string; tutor: string; startTime?: string; endTime?: string }> = [];

    groups.forEach(g => {
      g.rows.forEach(r => {
        r.blks.forEach(b => {
          if (!b.days || !b.days.length) return;
          if (!b.days.includes(todayKey as any)) return;
          const start = new Date(b.startDate + 'T00:00:00').getTime();
          const end = new Date(b.endDate + 'T23:59:59').getTime();
          if (tStart < start || tStart > end) return;
          sessions.push({
            cohortName: r.label,
            program: toProgrammeLabel(g),
            moduleName: getModuleMeta(b.mod).lbl,
            tutor: b.tutor || '',
            startTime: b.sessionStartTime,
            endTime: b.sessionEndTime,
          });
        });
      });
    });

    return sessions;
  }, [groups]);

  return (
    <div className="min-h-screen bg-kbc-bg font-sans">
      <TopNav />

      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-400">
            <Link to="/" className="hover:text-kbc-navy transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line" />
            <Link to="/events" className="hover:text-kbc-navy transition-colors cursor-pointer">Events</Link>
            <i className="ri-arrow-right-s-line" />
            <span className="text-kbc-navy font-semibold">Training Plan</span>
          </div>

          <div className="flex items-start justify-between gap-4 flex-wrap xl:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1B2A4A' }}>
                <i className="ri-time-line text-white text-base" />
              </div>
              <div>
                <h1 className="text-base font-extrabold text-kbc-navy leading-tight">
                  Apprenticeships Training Plan
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">Programme Structure 2024 – 2027</p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 ml-3 flex-wrap">
              {[
                { icon: 'ri-book-open-line',  label: `${groups.length} Programmes` },
                { icon: 'ri-group-line',       label: `${totalCohorts} Cohorts` },
                { icon: 'ri-stack-line',       label: `${totalSessions} Sessions` },
                { icon: 'ri-calendar-event-line', label: `${holidayCount} Holidays` },
                { icon: 'ri-live-line',        label: 'Apr 2026 Live' },
              ].map((s, i) => (
                <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
                  style={{ background: '#F0F4FF', color: '#2E4482', borderColor: '#D5DFF7' }}>
                  <i className={`${s.icon} text-xs`} />
                  {s.label}
                </span>
              ))}
            </div>

            <div className="hidden xl:flex items-center gap-2 ml-auto">
              {false && canManageCohorts && (
                <button
                  onClick={() => setShowHolidayMgr(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-85 border"
                  style={{ background: '#FFF8E0', color: '#C49A00', borderColor: '#F7A800' }}>
                  <i className="ri-calendar-event-line" />
                  Holidays
                </button>
              )}

              {false && canManageCohorts && (
                <div className="relative" ref={addDropdownRef}>
                  <button
                    onClick={() => setAddDropdownOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-all hover:opacity-85"
                    style={{ background: '#1B2A4A' }}>
                    <i className="ri-add-line" />
                    Add Cohort
                    {addDropdownOpen ? (
                      <i className="ri-arrow-up-s-line ml-0.5" />
                    ) : (
                      <i className="ri-arrow-down-s-line ml-0.5" />
                    )}
                  </button>
                  {addDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 overflow-hidden z-50 min-w-[200px]">
                      <p className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        Select Programme
                      </p>
                      {groups.map((g, gi) => (
                        <button
                          key={gi}
                          onClick={() => {
                            setModal({ open: true, mode: 'add', defaultGroupIdx: gi });
                            setAddDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors text-left">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                          <div>
                            <p className="text-xs font-bold text-gray-800 leading-tight">
                              {g.name.split('\n')[0]}
                            </p>
                            <p className="text-xs text-gray-400 leading-tight">
                              {g.name.split('\n')[1] || ''} Â· {g.rows.length} cohort{g.rows.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 items-center xl:hidden">
            {canManageCohorts && (
              <button
                onClick={() => setShowHolidayMgr(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-all hover:opacity-85 border"
                style={{ background: '#FFF8E0', color: '#C49A00', borderColor: '#F7A800' }}>
                <i className="ri-calendar-event-line" />
                Holidays
              </button>
            )}

            {false && canManageCohorts && (
              <div className="relative" ref={addDropdownRef}>
                <button
                  onClick={() => setAddDropdownOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer whitespace-nowrap transition-all hover:opacity-85"
                  style={{ background: '#1B2A4A' }}>
                  <i className="ri-add-line" />
                  Add Cohort
                  {addDropdownOpen ? (
                    <i className="ri-arrow-up-s-line ml-0.5" />
                  ) : (
                    <i className="ri-arrow-down-s-line ml-0.5" />
                  )}
                </button>
                {addDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 overflow-hidden z-50 min-w-[200px]">
                    <p className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                      Select Programme
                    </p>
                    {groups.map((g, gi) => (
                      <button
                        key={gi}
                        onClick={() => {
                          setModal({ open: true, mode: 'add', defaultGroupIdx: gi });
                          setAddDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors text-left">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                        <div>
                          <p className="text-xs font-bold text-gray-800 leading-tight">
                            {g.name.split('\n')[0]}
                          </p>
                          <p className="text-xs text-gray-400 leading-tight">
                            {g.name.split('\n')[1] || ''} · {g.rows.length} cohort{g.rows.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-4 md:px-6 py-5 space-y-4">
        {/* Today's Sessions */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold text-kbc-navy">Today's Sessions</h2>
          {todaySessions.length === 0 ? (
            <p className="text-xs text-gray-400 mt-2">No sessions yet. Add cohorts and module blocks to populate this schedule.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {todaySessions.map((s, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-semibold">{s.moduleName}</p>
                    <p className="text-xs text-gray-500">{s.cohortName} · {s.program}</p>
                    {s.tutor && <p className="text-xs text-gray-400">{s.tutor}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{s.startTime}{s.endTime ? ` - ${s.endTime}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {([
            { key: 'gantt',    label: 'Training Plan', icon: 'ri-bar-chart-horizontal-line' },
            { key: 'schedule', label: 'Session Schedule', icon: 'ri-table-line' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all whitespace-nowrap"
              style={{
                background: activeTab === tab.key ? '#1B2A4A' : 'transparent',
                color:      activeTab === tab.key ? '#fff'    : '#6B7280',
              }}>
              <i className={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* GANTT CARD */}
        {activeTab === 'gantt' && (
          <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
            <GanttTimeline
              groups={groups}
              holidays={holidays}
              zoom={zoom}
              onZoomChange={setZoom}
              onManageHolidays={() => setShowHolidayMgr(true)}
              onAddRow={(gi) => {
                if (!canManageCohorts) {
                  return;
                }
                setModal({ open: true, mode: 'add', defaultGroupIdx: gi });
              }}
              onEditRow={handleEditRow}
              onDeleteRow={handleDeleteRow}
              canManageCohorts={canManageCohorts}
            />
          </div>
        )}

        {/* SESSION SCHEDULE */}
        {activeTab === 'schedule' && (
          <ScheduleTable groups={groups} />
        )}

      </main>
      <Footer />

      {/* Modals */}
      {canManageCohorts && modal.open && (
        <CohortModal
          mode={modal.mode}
          groups={groups}
          holidays={holidays}
          initialGroupIdx={modal.mode === 'add' ? modal.defaultGroupIdx : modal.groupIdx}
          initialRow={modal.mode === 'edit' ? modal.row : undefined}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}

      {canManageCohorts && showHolidayMgr && (
        <HolidayManager
          holidays={holidays}
          onSave={persistHolidays}
          onClose={() => setShowHolidayMgr(false)}
        />
      )}
    </div>
  );
}
