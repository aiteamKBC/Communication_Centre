import { useMemo, useState } from 'react';
import type { CatalogModule, Holiday, ModuleBlock, ProgrammeGroup, WeekDayKey } from '../types';
import { getModuleMeta } from '../data';
import { buildHolidayAdjustedSessionPlan } from '../utils';

interface Props {
  groups: ProgrammeGroup[];
  catalogModules?: CatalogModule[];
  holidays?: Holiday[];
  canEdit?: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
}

interface TutorSession {
  tutor: string;
  rawTutor: string;
  blockId: string;
  groupIdx: number;
  rowIdx: number;
  programme: string;
  programmeColor: string;
  cohort: string;
  cohortColor: string;
  groupName: string;
  module: string;
  moduleColor: string;
  coach: string;
  startDate: string;
  endDate: string;
  sessions: number;
  date: string;
  day: WeekDayKey;
  startTime: string;
  endTime: string;
  time: string;
  sessionNumber: number;
  sessionTitle: string;
  completedSessions: number;
  isFinished: boolean;
}

interface TutorConflict {
  date: string;
  time: string;
  session: TutorSession;
  conflictWith: TutorSession;
}

interface TutorConflictGroup {
  key: string;
  firstDate: string;
  lastDate: string;
  time: string;
  count: number;
  session: TutorSession;
  conflictWith: TutorSession;
}

const JS_DAY_TO_KEY: Record<number, WeekDayKey> = {
  0: 'monday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function parseLocalIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function formatDate(isoDate: string): string {
  const d = parseLocalIsoDate(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMeridiemTime(time24: string): string {
  const [hRaw, mRaw] = time24.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function formatTimeRange(start: string, end: string): string {
  return `${formatMeridiemTime(start)} - ${formatMeridiemTime(end)}`;
}

function timeToMinutes(time24: string): number | null {
  const [hRaw, mRaw] = time24.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && ae > bs;
}

function parseLocalDateTime(isoDate: string, time24: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hourRaw = '0', minuteRaw = '0'] = time24.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return new Date(year || 1970, (month || 1) - 1, day || 1, Number.isNaN(hour) ? 0 : hour, Number.isNaN(minute) ? 0 : minute, 0, 0);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function splitPeople(value: string): string[] {
  return value
    .split(/\s*(?:\+|&|,|;)\s*/g)
    .map(item => item.trim())
    .filter(Boolean);
}

function programmeLabelFromGroupName(groupName: string): string {
  const levelMatch = groupName.match(/L\d+/);
  const codeMatch = groupName.match(/\(([^)]+)\)/);
  const level = levelMatch?.[0] || '';
  const code = codeMatch?.[1] || groupName.split('\n')[0];
  return `${code} ${level}`.trim();
}

function resolveCatalogModule(moduleName: string, moduleValue: unknown, catalogModules: CatalogModule[]): CatalogModule | undefined {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizedName = normalize(moduleName);
  const normalizedValue = normalize(String(moduleValue || ''));
  return catalogModules.find(module => {
    const catalogName = normalize(module.name);
    return catalogName === normalizedName || catalogName === normalizedValue || String(module.id) === String(moduleValue || '').trim();
  });
}

function collectTutorSessions(groups: ProgrammeGroup[], catalogModules: CatalogModule[], holidays: Holiday[], now: Date): TutorSession[] {
  return groups.flatMap((programme, groupIdx) =>
    programme.rows.flatMap((row, rowIdx) =>
      row.blks.flatMap(block => {
        const tutorNames = splitPeople(block.tutor || '');
        if (!tutorNames.length) return [];

        const moduleMeta = getModuleMeta(block.mod);
        const module = moduleMeta.lbl;
        const catalogModule = resolveCatalogModule(module, block.mod, catalogModules);
        const selectedHolidayIds = new Set(row.holidayIds || []);
        const activeHolidays = selectedHolidayIds.size ? holidays.filter(holiday => selectedHolidayIds.has(holiday.id)) : [];
        const sessionPlan = buildHolidayAdjustedSessionPlan(block, activeHolidays);
        const dates = sessionPlan.sessions.map(session => session.date);
        const startTime = block.sessionStartTime || '09:00';
        const endTime = block.sessionEndTime || '11:00';
        const time = formatTimeRange(startTime, endTime);
        const coach = block.coachName?.trim() || 'TBD';
        const groupName = (block.groupName || row.label || '').trim();
        const programmeLabel = programmeLabelFromGroupName(programme.name);
        const totalSessions = Math.max(1, Number(block.sessions) || dates.length || 1);
        const completedSessions = Math.min(
          totalSessions,
          dates.filter(date => parseLocalDateTime(date, endTime) <= now).length,
        );
        const isFinished = completedSessions >= totalSessions;

        return tutorNames.flatMap(tutor =>
          dates.map((date, index): TutorSession => {
            const dateObj = parseLocalIsoDate(date);
            const sessionNumber = index + 1;
            return {
              tutor,
              rawTutor: block.tutor || tutor,
              blockId: block.id,
              groupIdx,
              rowIdx,
              programme: programmeLabel,
              programmeColor: programme.color,
              cohort: row.label,
              cohortColor: row.color || programme.color,
              groupName,
              module,
              moduleColor: block.color || moduleMeta.bg,
              coach,
              startDate: block.startDate,
              endDate: block.endDate,
              sessions: block.sessions,
              date,
              day: JS_DAY_TO_KEY[dateObj.getDay()] || 'monday',
              startTime,
              endTime,
              time,
              sessionNumber,
              sessionTitle: catalogModule?.sessionNames?.[index]?.trim() || `Session ${sessionNumber}`,
              completedSessions,
              isFinished,
            };
          }),
        );
      }),
    ),
  );
}

function findTutorConflicts(sessions: TutorSession[]): TutorConflict[] {
  const conflicts: TutorConflict[] = [];
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.blockId === b.blockId) continue;
      if (a.isFinished || b.isFinished) continue;
      if (a.date !== b.date) continue;
      if (!timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
      conflicts.push({ date: a.date, time: a.time, session: a, conflictWith: b });
    }
  }
  return conflicts.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function groupTutorConflicts(conflicts: TutorConflict[]): TutorConflictGroup[] {
  const map = new Map<string, TutorConflictGroup>();
  conflicts.forEach(conflict => {
    const ids = [conflict.session.blockId, conflict.conflictWith.blockId].sort();
    const key = `${ids[0]}::${ids[1]}::${conflict.time}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (conflict.date < existing.firstDate) existing.firstDate = conflict.date;
      if (conflict.date > existing.lastDate) existing.lastDate = conflict.date;
      return;
    }

    map.set(key, {
      key,
      firstDate: conflict.date,
      lastDate: conflict.date,
      time: conflict.time,
      count: 1,
      session: conflict.session,
      conflictWith: conflict.conflictWith,
    });
  });
  return Array.from(map.values()).sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.time.localeCompare(b.time));
}

function getModuleStatus(module: TutorSession, now: Date): 'in-progress' | 'assigned' | 'completed' {
  if (module.isFinished) {
    return 'completed';
  }
  const start = parseLocalDateTime(module.startDate, module.startTime);
  const end = parseLocalDateTime(module.endDate, module.endTime);
  if (start <= now && end > now) {
    return 'in-progress';
  }
  if (start > now) {
    return 'assigned';
  }
  return 'completed';
}

function ModuleList({
  title,
  modules,
  conflicts,
  emptyText,
  canEdit,
  onEditTrainingPlan,
  now,
}: {
  title: string;
  modules: TutorSession[];
  conflicts: TutorConflict[];
  emptyText: string;
  canEdit: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
  now: Date;
}) {
  const shouldScroll = modules.length > 4;
  return (
    <div className="self-start rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-extrabold text-kbc-navy">{title}</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{modules.length}</span>
      </div>
      <div className={`${shouldScroll ? 'max-h-[52vh] overflow-y-auto' : ''} p-3 ${modules.length ? 'grid gap-2 md:grid-cols-2' : ''}`}>
        {modules.map(module => {
          const moduleConflicts = conflicts.filter(item => item.session.blockId === module.blockId || item.conflictWith.blockId === module.blockId);
          const status = getModuleStatus(module, now);
          const statusStyle =
            status === 'in-progress'
              ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
              : status === 'assigned'
                ? 'bg-blue-100 text-blue-700 ring-blue-200'
                : 'bg-gray-100 text-gray-500 ring-gray-200';
          const statusLabel = status === 'in-progress' ? 'In Progress' : status === 'assigned' ? 'Assigned' : 'Completed';
          return (
            <div key={module.blockId} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: module.moduleColor }} />
                    <p className="truncate text-sm font-extrabold text-gray-800">{module.module}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ${statusStyle}`}>{statusLabel}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{module.programme} - {module.cohort} - {module.groupName}</p>
                  <p className="mt-1 text-xs text-gray-400">{formatDate(module.startDate)} - {formatDate(module.endDate)} - {module.sessions} sessions</p>
                  <p className="mt-1 text-xs text-gray-500">Coach: <strong>{module.coach}</strong> - Schedule: <strong className="capitalize">{module.day}</strong> {module.time}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {moduleConflicts.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">{moduleConflicts.length} warnings</span>
                  )}
                  {canEdit && onEditTrainingPlan && (
                    <button
                      type="button"
                      onClick={() => onEditTrainingPlan(module.groupIdx, module.rowIdx, module.blockId)}
                      className="rounded-md bg-kbc-navy px-2.5 py-1 text-xs font-bold text-white"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {modules.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-4 text-center text-sm text-gray-400">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TutorProfiles({ groups, catalogModules = [], holidays = [], canEdit = false, onEditTrainingPlan }: Props) {
  const now = useMemo(() => new Date(), []);
  const sessions = useMemo(() => collectTutorSessions(groups, catalogModules, holidays, now), [groups, catalogModules, holidays, now]);
  const tutorNames = useMemo(() => Array.from(new Set(sessions.map(item => item.tutor))).sort((a, b) => a.localeCompare(b)), [sessions]);
  const [selectedTutor, setSelectedTutor] = useState('');
  const [selectedCoach, setSelectedCoach] = useState('');
  const activeTutor = selectedTutor || tutorNames[0] || '';

  const tutorSessions = useMemo(
    () => sessions.filter(item => normalizeName(item.tutor) === normalizeName(activeTutor)).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [sessions, activeTutor],
  );
  const conflicts = useMemo(() => findTutorConflicts(tutorSessions), [tutorSessions]);
  const activeConflicts = useMemo(
    () => conflicts.filter(conflict => parseLocalDateTime(conflict.date, conflict.session.endTime) > now),
    [conflicts, now],
  );
  const conflictGroups = useMemo(() => groupTutorConflicts(activeConflicts), [activeConflicts]);
  const hiddenCompletedConflictCount = conflicts.length - activeConflicts.length;
  const moduleBlocks = useMemo(() => {
    const map = new Map<string, TutorSession>();
    tutorSessions.forEach(session => {
      if (!map.has(session.blockId)) {
        map.set(session.blockId, session);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [tutorSessions]);
  const coachRows = useMemo(() => {
    const map = new Map<string, { coach: string; modules: Set<string>; programmes: Set<string>; sessions: number }>();
    tutorSessions.forEach(session => {
      const key = session.coach || 'TBD';
      const existing = map.get(key) || { coach: key, modules: new Set<string>(), programmes: new Set<string>(), sessions: 0 };
      existing.modules.add(session.module);
      existing.programmes.add(session.programme);
      existing.sessions += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.coach.localeCompare(b.coach));
  }, [tutorSessions]);
  const selectedCoachSessions = useMemo(
    () => tutorSessions.filter(session => normalizeName(session.coach || 'TBD') === normalizeName(selectedCoach)).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [tutorSessions, selectedCoach],
  );

  const inProgressModules = moduleBlocks.filter(item => getModuleStatus(item, now) === 'in-progress');
  const assignedModules = moduleBlocks.filter(item => getModuleStatus(item, now) === 'assigned');
  const completedModules = moduleBlocks.filter(item => getModuleStatus(item, now) === 'completed');
  const upcomingSessions = tutorSessions.filter(item => parseLocalDateTime(item.date, item.endTime) > now).slice(0, 12);

  if (!sessions.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-kbc-navy/5 text-kbc-navy">
          <i className="ri-user-search-line text-xl" />
        </div>
        <h2 className="mt-4 text-base font-bold text-kbc-navy">No tutor data yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">Add tutors to module blocks to build tutor profiles automatically.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tutors</p>
          <p className="mt-1 text-sm font-extrabold text-kbc-navy">{tutorNames.length} profile{tutorNames.length === 1 ? '' : 's'}</p>
        </div>
        <div className="p-2">
          {tutorNames.map(name => {
            const count = sessions.filter(item => normalizeName(item.tutor) === normalizeName(name)).length;
            const selected = normalizeName(name) === normalizeName(activeTutor);
            return (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedTutor(name)}
                className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all"
                style={{ background: selected ? '#1B2A4A' : '#FFFFFF', color: selected ? '#FFFFFF' : '#1F2937' }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: selected ? 'rgba(255,255,255,0.16)' : '#EEF2FB' }}>
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{name}</span>
                  <span className={`block text-xs ${selected ? 'text-white/60' : 'text-gray-400'}`}>{count} sessions</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tutor Profile</p>
              <h2 className="mt-1 text-xl font-extrabold text-kbc-navy">{activeTutor}</h2>
              <p className="mt-1 text-sm text-gray-500">{inProgressModules.length} in progress, {assignedModules.length} assigned, {completedModules.length} completed</p>
            </div>
            {activeConflicts.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-200">
                <i className="ri-alert-line" />
                {conflictGroups.length} active conflict group{conflictGroups.length === 1 ? '' : 's'} / {activeConflicts.length} sessions
              </span>
            )}
          </div>

          <div className="grid gap-3 px-5 py-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">In Progress</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{inProgressModules.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Assigned</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{assignedModules.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Sessions</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{tutorSessions.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Programmes</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{new Set(tutorSessions.map(item => item.programme)).size}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Coaches</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{coachRows.length}</p>
            </div>
          </div>
        </div>

        {activeConflicts.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50">
            <div className="border-b border-amber-100 px-4 py-3">
              <p className="text-sm font-extrabold text-amber-900">Time Conflict Summary</p>
              <p className="mt-0.5 text-xs font-semibold text-amber-700">Active/upcoming clashes only. Completed conflicts are ignored because they no longer need action.</p>
            </div>
            <div className="divide-y divide-amber-100">
              {conflictGroups.slice(0, 12).map(conflict => (
                <div key={conflict.key} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <p className="font-extrabold text-amber-900">
                      {conflict.count} session{conflict.count === 1 ? '' : 's'}
                    </p>
                    <p className="text-xs font-semibold text-amber-800">
                      {formatDate(conflict.firstDate)}{conflict.firstDate !== conflict.lastDate ? ` - ${formatDate(conflict.lastDate)}` : ''}
                    </p>
                    <p className="text-xs font-semibold text-amber-700">{conflict.time}</p>
                  </div>
                  <p className="text-gray-700"><strong>{conflict.session.module}</strong> in {conflict.session.programme} - {conflict.session.groupName}</p>
                  <p className="text-gray-700"><strong>{conflict.conflictWith.module}</strong> in {conflict.conflictWith.programme} - {conflict.conflictWith.groupName}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeConflicts.length === 0 && hiddenCompletedConflictCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-sky-100">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <i className="ri-information-line text-base" />
            </span>
            <div>
              <p className="font-extrabold text-sky-900">Historical conflicts hidden</p>
              <p className="mt-0.5 text-sky-700">
                {hiddenCompletedConflictCount} completed conflict session{hiddenCompletedConflictCount === 1 ? '' : 's'} found, but they are not shown as warnings because they no longer need action.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <ModuleList
            title="In Progress Modules"
            modules={inProgressModules}
            conflicts={activeConflicts}
            emptyText="No modules currently in progress for this tutor."
            canEdit={canEdit}
            onEditTrainingPlan={onEditTrainingPlan}
            now={now}
          />

          <ModuleList
            title="Assigned Modules"
            modules={assignedModules}
            conflicts={activeConflicts}
            emptyText="No future assigned modules for this tutor."
            canEdit={canEdit}
            onEditTrainingPlan={onEditTrainingPlan}
            now={now}
          />

          <ModuleList
            title="Completed Modules"
            modules={completedModules}
            conflicts={[]}
            emptyText="No completed modules for this tutor."
            canEdit={canEdit}
            onEditTrainingPlan={onEditTrainingPlan}
            now={now}
          />

          <div className="self-start rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-extrabold text-kbc-navy">Coaches Working With This Tutor</p>
            </div>
            <div className="divide-y divide-gray-100">
              {coachRows.map(row => (
                <button
                  key={row.coach}
                  type="button"
                  onClick={() => setSelectedCoach(row.coach)}
                  className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-gray-800">{row.coach}</span>
                    <span className="mt-1 block text-xs text-gray-500">{row.sessions} sessions - {Array.from(row.programmes).join(', ')}</span>
                    <span className="mt-1 block text-xs text-gray-400">{Array.from(row.modules).join(', ')}</span>
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-kbc-navy group-hover:text-white">
                    <i className="ri-arrow-right-s-line" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-extrabold text-kbc-navy">Upcoming Session Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Programme</th>
                  <th className="px-4 py-3">Coach</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcomingSessions.map(session => (
                  <tr key={`${session.blockId}-${session.date}-${session.sessionNumber}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-800">{formatDate(session.date)}</td>
                    <td className="px-4 py-3 text-gray-600">{session.time}</td>
                    <td className="px-4 py-3 text-gray-700">#{session.sessionNumber} {session.sessionTitle}</td>
                    <td className="px-4 py-3 text-gray-700">{session.module}</td>
                    <td className="px-4 py-3 text-gray-500">{session.programme} - {session.groupName}</td>
                    <td className="px-4 py-3 text-gray-500">{session.coach}</td>
                  </tr>
                ))}
                {upcomingSessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No upcoming sessions for this tutor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[4px]" onClick={() => setSelectedCoach('')} />
          <div className="relative flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/60">{activeTutor} - coach details</p>
                <h3 className="mt-1 text-base font-extrabold text-white">{selectedCoach}</h3>
                <p className="mt-1 text-xs text-white/70">{selectedCoachSessions.length} sessions contributing to this coach total</p>
              </div>
              <button onClick={() => setSelectedCoach('')} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                <i className="ri-close-line text-lg" />
              </button>
            </div>

            <div className="overflow-y-auto bg-gray-50 p-4">
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Session</th>
                      <th className="px-4 py-3">Module</th>
                      <th className="px-4 py-3">Programme / Cohort / Group</th>
                      <th className="px-4 py-3">Module Dates</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedCoachSessions.map(session => {
                      const status = getModuleStatus(session, now);
                      const statusLabel = status === 'in-progress' ? 'In Progress' : status === 'assigned' ? 'Assigned' : 'Completed';
                      return (
                        <tr key={`${session.blockId}-${session.date}-${session.sessionNumber}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-gray-800">{formatDate(session.date)}</td>
                          <td className="px-4 py-3 text-gray-600">{session.time}</td>
                          <td className="px-4 py-3 text-gray-700">#{session.sessionNumber} {session.sessionTitle}</td>
                          <td className="px-4 py-3 text-gray-700">{session.module}</td>
                          <td className="px-4 py-3 text-gray-500">{session.programme} - {session.cohort} - {session.groupName}</td>
                          <td className="px-4 py-3 text-gray-500">{formatDate(session.startDate)} - {formatDate(session.endDate)}</td>
                          <td className="px-4 py-3 text-gray-500">{statusLabel}</td>
                          <td className="px-4 py-3 text-right">
                            {canEdit && onEditTrainingPlan && (
                              <button
                                type="button"
                                onClick={() => onEditTrainingPlan(session.groupIdx, session.rowIdx, session.blockId)}
                                className="rounded-md bg-kbc-navy px-2.5 py-1 text-xs font-bold text-white"
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
