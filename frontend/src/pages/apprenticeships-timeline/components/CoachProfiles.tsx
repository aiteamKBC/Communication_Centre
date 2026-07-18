import { useMemo, useState } from 'react';
import type { CoachProfile, Holiday, ModuleBlock, ProgrammeGroup, SessionCoverage } from '../types';
import { getModuleMeta } from '../data';
import { buildCoachProfilesFromGroups } from '../coachProfiles';
import { normalizeTutorName } from '../tutorProfiles';
import { buildHolidayAdjustedSessionPlan } from '../utils';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface Props {
  groups: ProgrammeGroup[];
  coachProfiles?: CoachProfile[];
  holidays?: Holiday[];
  canEdit?: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
  onCreateCoachProfile?: (profile: { name: string; email?: string; phone?: string; notes?: string; availabilityNotes?: string; isActive?: boolean; confirmCreateNew?: boolean }) => Promise<CoachProfile | { existingProfile?: CoachProfile; possibleExistingProfile?: CoachProfile; detail?: string; score?: number }>;
  onUpdateCoachProfile?: (id: string, profile: Partial<CoachProfile> & { confirmSave?: boolean }) => Promise<CoachProfile | { existingProfile?: CoachProfile; possibleExistingProfile?: CoachProfile; detail?: string; score?: number }>;
  onDeleteCoachProfile?: (id: string) => Promise<boolean>;
}

interface CoachModule {
  block: ModuleBlock;
  groupIdx: number;
  rowIdx: number;
  programme: string;
  programmeColor: string;
  cohort: string;
  groupName: string;
  moduleName: string;
  moduleColor: string;
  tutor: string;
  sessions: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  dayLabel: string;
  completedSessions: number;
  status: 'in-progress' | 'assigned' | 'completed';
  sessionDates: Array<{ date: string; originalNumber: number }>;
}

interface CoachSession {
  key: string;
  block: ModuleBlock;
  groupIdx: number;
  rowIdx: number;
  programme: string;
  cohort: string;
  groupName: string;
  moduleName: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionNumber: number;
  coverage?: SessionCoverage;
}

interface TutorSummary {
  tutor: string;
  sessions: number;
  programmes: string[];
  modules: string[];
}

function parseLocalDateTime(isoDate: string, time24: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hourRaw = '0', minuteRaw = '0'] = time24.split(':');
  return new Date(year || 1970, (month || 1) - 1, day || 1, Number(hourRaw) || 0, Number(minuteRaw) || 0, 0, 0);
}

function formatDate(isoDate: string): string {
  const date = parseLocalDateTime(isoDate, '00:00');
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeRange(start: string, end: string): string {
  return `${start || '09:00'} - ${end || '11:00'}`;
}

function programmeLabel(value: string): string {
  return value.replace('\n', ' - ');
}

function moduleStatus(module: CoachModule): 'in-progress' | 'assigned' | 'completed' {
  return module.status;
}

function collectCoachModules(groups: ProgrammeGroup[], holidays: Holiday[], coachName: string, now: Date): CoachModule[] {
  const normalized = normalizeTutorName(coachName);
  return groups.flatMap((programme, groupIdx) => programme.rows.flatMap((row, rowIdx) => {
    const selectedHolidayIds = new Set(row.holidayIds || []);
    const activeHolidays = holidays.filter(holiday => selectedHolidayIds.has(holiday.id));
    return row.blks
      .filter(block => normalizeTutorName(block.coachName || '') === normalized)
      .map(block => {
        const plan = buildHolidayAdjustedSessionPlan(block, activeHolidays);
        const sessions = plan.sessions.length ? plan.sessions : [{ date: block.startDate, originalNumber: 1 }];
        const startTime = block.sessionStartTime || '09:00';
        const endTime = block.sessionEndTime || '11:00';
        const totalSessions = Math.max(1, Number(block.sessions) || sessions.length || 1);
        const completedSessions = Math.min(totalSessions, sessions.filter(session => parseLocalDateTime(session.date, endTime) <= now).length);
        const status = completedSessions >= totalSessions
          ? 'completed'
          : parseLocalDateTime(block.startDate, startTime) <= now
            ? 'in-progress'
            : 'assigned';
        const meta = getModuleMeta(block.mod);
        return {
          block,
          groupIdx,
          rowIdx,
          programme: programmeLabel(programme.name),
          programmeColor: programme.color,
          cohort: row.label,
          groupName: block.groupName || row.label,
          moduleName: meta.lbl,
          moduleColor: block.color || meta.bg,
          tutor: block.tutor || 'TBD',
          sessions: totalSessions,
          startDate: block.startDate,
          endDate: plan.effectiveEndDate || block.endDate,
          startTime,
          endTime,
          dayLabel: block.days?.length ? block.days.join(', ') : 'scheduled',
          completedSessions,
          status,
          sessionDates: sessions.map((session, index) => ({
            date: session.date,
            originalNumber: Number(session.originalNumber) || index + 1,
          })),
        } satisfies CoachModule;
      });
  })).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function collectCoachCoverageSessions(groups: ProgrammeGroup[], holidays: Holiday[], coachProfileId: string): CoachSession[] {
  if (!coachProfileId || coachProfileId.startsWith('legacy:')) return [];
  return groups.flatMap((programme, groupIdx) => programme.rows.flatMap((row, rowIdx) => {
    const selectedHolidayIds = new Set(row.holidayIds || []);
    const activeHolidays = holidays.filter(holiday => selectedHolidayIds.has(holiday.id));
    return row.blks.flatMap(block => {
      const plan = buildHolidayAdjustedSessionPlan(block, activeHolidays);
      const sessions = plan.sessions.length ? plan.sessions : [{ date: block.startDate, originalNumber: 1 }];
      return (block.sessionCoverage || [])
        .filter(item => item.coverageCoachProfileId === coachProfileId)
        .map(item => {
          const planned = sessions[item.sessionNumber - 1] || sessions[0];
          return {
            key: `${block.id}-${item.sessionNumber}`,
            block,
            groupIdx,
            rowIdx,
            programme: programmeLabel(programme.name),
            cohort: row.label,
            groupName: block.groupName || row.label,
            moduleName: getModuleMeta(block.mod).lbl,
            date: planned?.date || block.startDate,
            startTime: block.sessionStartTime || '09:00',
            endTime: block.sessionEndTime || '11:00',
            sessionNumber: item.sessionNumber,
            coverage: item,
          } satisfies CoachSession;
        });
    });
  })).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

function collectCoverageRequiredSessions(modules: CoachModule[]): CoachSession[] {
  return modules.flatMap(module =>
    (module.block.sessionCoverage || [])
      .filter(item => item.tutorUnavailable && !item.coverageTutorProfileId && !item.coverageCoachProfileId)
      .map(item => {
        const planned = module.sessionDates[item.sessionNumber - 1] || module.sessionDates[0];
        return {
          key: `${module.block.id}-required-${item.sessionNumber}`,
          block: module.block,
          groupIdx: module.groupIdx,
          rowIdx: module.rowIdx,
          programme: module.programme,
          cohort: module.cohort,
          groupName: module.groupName,
          moduleName: module.moduleName,
          date: planned?.date || module.startDate,
          startTime: module.startTime,
          endTime: module.endTime,
          sessionNumber: item.sessionNumber,
          coverage: item,
        } satisfies CoachSession;
      }),
  ).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

function buildTutorSummaries(modules: CoachModule[]): TutorSummary[] {
  const map = new Map<string, TutorSummary>();
  modules.forEach(module => {
    const tutor = module.tutor.trim() || 'TBD';
    const existing = map.get(tutor) || { tutor, sessions: 0, programmes: [], modules: [] };
    existing.sessions += module.sessions;
    if (!existing.programmes.includes(module.programme)) existing.programmes.push(module.programme);
    if (!existing.modules.includes(module.moduleName)) existing.modules.push(module.moduleName);
    map.set(tutor, existing);
  });
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || a.tutor.localeCompare(b.tutor));
}

function ModuleList({
  title,
  modules,
  emptyText,
  canEdit,
  onEditTrainingPlan,
}: {
  title: string;
  modules: CoachModule[];
  emptyText: string;
  canEdit: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
}) {
  return (
    <div className="self-start rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-extrabold text-kbc-navy">{title}</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{modules.length}</span>
      </div>
      <div className={`${modules.length ? 'grid gap-2 p-3 md:grid-cols-2' : 'p-3'}`}>
        {modules.map(module => {
          const status = moduleStatus(module);
          const statusStyle = status === 'in-progress'
            ? 'bg-emerald-100 text-emerald-700'
            : status === 'assigned'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600';
          const statusLabel = status === 'in-progress' ? 'In Progress' : status === 'assigned' ? 'Assigned' : 'Completed';
          return (
            <div key={module.block.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: module.moduleColor }} />
                    <p className="truncate text-sm font-extrabold text-gray-800">{module.moduleName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${statusStyle}`}>{statusLabel}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{module.programme} - {module.cohort} - {module.groupName}</p>
                  <p className="mt-1 text-xs text-gray-400">{formatDate(module.startDate)} - {formatDate(module.endDate)} - {module.completedSessions}/{module.sessions} sessions</p>
                  <p className="mt-1 text-xs text-gray-500">Tutor: <strong>{module.tutor}</strong> - Schedule: <strong className="capitalize">{module.dayLabel}</strong> {formatTimeRange(module.startTime, module.endTime)}</p>
                </div>
                {canEdit && onEditTrainingPlan && (
                  <button type="button" onClick={() => onEditTrainingPlan(module.groupIdx, module.rowIdx, module.block.id)} className="rounded-md bg-kbc-navy px-2.5 py-1 text-xs font-bold text-white">
                    Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!modules.length && (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-4 text-center">
            <p className="text-sm text-gray-400">{emptyText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoachProfiles({ groups, coachProfiles = [], holidays = [], canEdit = false, onEditTrainingPlan, onCreateCoachProfile, onUpdateCoachProfile, onDeleteCoachProfile }: Props) {
  const now = useMemo(() => new Date(), []);
  const profiles = useMemo(() => buildCoachProfilesFromGroups(groups, coachProfiles), [coachProfiles, groups]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Partial<CoachProfile>>({});
  const [editing, setEditing] = useState(false);
  const [sessionBreakdownOpen, setSessionBreakdownOpen] = useState(false);
  const activeProfile = profiles.find(profile => profile.id === selectedId) || profiles[0];
  const activeModules = useMemo(() => activeProfile ? collectCoachModules(groups, holidays, activeProfile.name, now) : [], [activeProfile, groups, holidays, now]);
  const coverageSessions = useMemo(() => activeProfile ? collectCoachCoverageSessions(groups, holidays, activeProfile.id) : [], [activeProfile, groups, holidays]);
  const coverageRequiredSessions = useMemo(() => collectCoverageRequiredSessions(activeModules), [activeModules]);
  const tutorSummaries = useMemo(() => buildTutorSummaries(activeModules), [activeModules]);
  const inProgressModules = activeModules.filter(item => item.status === 'in-progress');
  const assignedModules = activeModules.filter(item => item.status === 'assigned');
  const completedModules = activeModules.filter(item => item.status === 'completed');
  const upcomingSessions = activeModules
    .flatMap(module => module.sessionDates.map(session => ({
      module,
      date: session.date,
      number: session.originalNumber,
    })))
    .filter(item => parseLocalDateTime(item.date, item.module.endTime) > now)
    .sort((a, b) => a.date.localeCompare(b.date));
  const filteredProfiles = profiles.filter(profile => normalizeTutorName(`${profile.name} ${profile.email || ''}`).includes(normalizeTutorName(query)));
  const activeCount = profiles.filter(profile => profile.isActive).length;
  const inactiveCount = profiles.length - activeCount;

  const startCreate = () => {
    setSelectedId('');
    setDraft({ name: '', email: '', phone: '', notes: '', availabilityNotes: '', isActive: true });
    setEditing(true);
  };

  const startEdit = (profile: CoachProfile) => {
    setSelectedId(profile.id);
    setDraft(profile);
    setEditing(true);
  };

  const saveDraft = async () => {
    const name = String(draft.name || '').trim();
    if (!name) return;
    const payload = {
      name,
      email: String(draft.email || '').trim(),
      phone: String(draft.phone || '').trim(),
      notes: String(draft.notes || '').trim(),
      availabilityNotes: String(draft.availabilityNotes || '').trim(),
      isActive: draft.isActive !== false,
    };
    const result = draft.id && onUpdateCoachProfile
      ? await onUpdateCoachProfile(draft.id, payload)
      : onCreateCoachProfile
        ? await onCreateCoachProfile(payload)
        : null;
    const saved = result && 'id' in result
      ? result
      : result && !('id' in result)
        ? result.existingProfile || result.possibleExistingProfile
        : undefined;
    if (saved) {
      setSelectedId(saved.id);
      setEditing(false);
    }
  };

  const deleteActiveProfile = async () => {
    if (!activeProfile || activeProfile.id.startsWith('legacy:') || !onDeleteCoachProfile) return;
    const result = await kbcSwal.fire({
      title: 'Deactivate Coach Profile?',
      html: `
        <div style="text-align:left;line-height:1.55">
          <p>This will deactivate <strong>${activeProfile.name}</strong> and hide the profile from normal selection.</p>
          <p style="margin-top:8px;color:#64748b">Existing Training Plan and coverage references will remain unchanged.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Deactivate Profile',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#1B2A4A',
    });
    if (!result.isConfirmed) return;
    void kbcSwal.fire({
      title: 'Deactivating coach...',
      html: `Deactivating <strong>${activeProfile.name}</strong>. Existing Training Plan and coverage references will remain unchanged.`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });
    const deleted = await onDeleteCoachProfile(activeProfile.id);
    if (!deleted) return;
    setSelectedId(activeProfile.id);
  };

  const activateActiveProfile = async () => {
    if (!activeProfile || activeProfile.id.startsWith('legacy:') || !onUpdateCoachProfile) return;
    const result = await onUpdateCoachProfile(activeProfile.id, { ...activeProfile, isActive: true, confirmSave: true });
    if (result && 'id' in result) {
      setSelectedId(result.id);
    }
  };

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Coaches</p>
              <p className="mt-1 text-sm font-extrabold text-kbc-navy">{profiles.length} profile{profiles.length === 1 ? '' : 's'}</p>
              {inactiveCount > 0 && <p className="mt-0.5 text-xs font-semibold text-gray-400">{activeCount} active, {inactiveCount} inactive</p>}
            </div>
            {canEdit && (
              <button type="button" onClick={startCreate} className="rounded-lg bg-kbc-navy px-2.5 py-1.5 text-xs font-extrabold text-white">
                Add
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-kbc-navy focus-within:ring-2 focus-within:ring-kbc-navy/10">
            <i className="ri-search-line text-sm text-gray-400" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search coach..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-kbc-navy outline-none placeholder:text-gray-400" />
          </div>
        </div>
        <div className="max-h-[42vh] overflow-y-auto p-2 xl:max-h-none xl:overflow-visible">
          {filteredProfiles.map(profile => {
            const count = collectCoachModules(groups, holidays, profile.name, now).reduce((sum, item) => sum + item.sessions, 0);
            const selected = profile.id === activeProfile?.id;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setSelectedId(profile.id);
                  setEditing(false);
                }}
                className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all"
                style={{ background: selected ? '#1B2A4A' : '#FFFFFF', color: selected ? '#FFFFFF' : '#1F2937' }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: selected ? 'rgba(255,255,255,0.16)' : '#EEF2FB' }}>
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{profile.name}</span>
                  {profile.email && <span className={`block truncate text-xs ${selected ? 'text-white/70' : 'text-gray-500'}`}>{profile.email}</span>}
                  <span className={`block text-xs ${selected ? 'text-white/60' : 'text-gray-400'}`}>{count} sessions{profile.isActive ? '' : ' - inactive'}</span>
                </span>
                {!profile.isActive && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    Inactive
                  </span>
                )}
              </button>
            );
          })}
          {!filteredProfiles.length && <p className="px-3 py-8 text-center text-sm font-semibold text-gray-400">No coach profiles found.</p>}
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {editing ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-extrabold text-kbc-navy">{draft.id ? 'Edit Coach Profile' : 'Add Coach Profile'}</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input value={draft.name || ''} onChange={event => setDraft(prev => ({ ...prev, name: event.target.value }))} placeholder="Coach name" className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none" />
              <input value={draft.email || ''} onChange={event => setDraft(prev => ({ ...prev, email: event.target.value }))} placeholder="Email" className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none" />
              <input value={draft.phone || ''} onChange={event => setDraft(prev => ({ ...prev, phone: event.target.value }))} placeholder="Phone" className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none" />
              <input value={draft.availabilityNotes || ''} onChange={event => setDraft(prev => ({ ...prev, availabilityNotes: event.target.value }))} placeholder="Availability notes" className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none" />
              <textarea value={draft.notes || ''} onChange={event => setDraft(prev => ({ ...prev, notes: event.target.value }))} placeholder="Notes" rows={3} className="resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none md:col-span-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-gray-500">Cancel</button>
              <button type="button" onClick={() => void saveDraft()} className="rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white">Save Coach</button>
            </div>
          </div>
        ) : activeProfile ? (
          <>
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Coach Profile</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-extrabold text-kbc-navy">{activeProfile.name}</h2>
                    {!activeProfile.isActive && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600">Inactive</span>}
                  </div>
                  {activeProfile.email && <p className="mt-1 text-xs font-semibold text-gray-400">{activeProfile.email}</p>}
                  <p className="mt-1 text-sm text-gray-500">{activeModules.reduce((sum, item) => sum + item.sessions, 0)} assigned sessions, {coverageRequiredSessions.length} coverage required, {coverageSessions.length} covering sessions</p>
                </div>
                {canEdit && !activeProfile.id.startsWith('legacy:') && (
                  <div className="flex gap-2">
                    {onUpdateCoachProfile && !activeProfile.isActive && <button type="button" onClick={() => void activateActiveProfile()} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700">Activate</button>}
                    {onUpdateCoachProfile && <button type="button" onClick={() => startEdit(activeProfile)} className="rounded-lg bg-kbc-navy px-3 py-2 text-xs font-extrabold text-white">Edit Profile</button>}
                    {onDeleteCoachProfile && activeProfile.isActive && <button type="button" onClick={() => void deleteActiveProfile()} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700">Deactivate</button>}
                  </div>
                )}
              </div>
              <div className="grid gap-3 px-4 py-4 sm:px-5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">In Progress</p><p className="mt-1 text-xl font-extrabold text-gray-800">{inProgressModules.length}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Assigned</p><p className="mt-1 text-xl font-extrabold text-gray-800">{assignedModules.length}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Completed</p><p className="mt-1 text-xl font-extrabold text-gray-800">{completedModules.length}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Assigned Sessions</p><p className="mt-1 text-xl font-extrabold text-gray-800">{activeModules.reduce((sum, item) => sum + item.sessions, 0)}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Programmes</p><p className="mt-1 text-xl font-extrabold text-gray-800">{new Set(activeModules.map(item => item.programme)).size}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Coverage Required</p><p className="mt-1 text-xl font-extrabold text-gray-800">{coverageRequiredSessions.length}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Covering</p><p className="mt-1 text-xl font-extrabold text-gray-800">{coverageSessions.length}</p></div>
              </div>
            </div>

            <ModuleList title="In Progress Modules" modules={inProgressModules} emptyText="No modules currently in progress for this coach." canEdit={canEdit} onEditTrainingPlan={onEditTrainingPlan} />
            <ModuleList title="Assigned Modules" modules={assignedModules} emptyText="No future assigned modules for this coach." canEdit={canEdit} onEditTrainingPlan={onEditTrainingPlan} />
            <ModuleList title="Completed Modules" modules={completedModules} emptyText="No completed modules for this coach yet." canEdit={canEdit} onEditTrainingPlan={onEditTrainingPlan} />

            <div className="self-start rounded-xl border border-amber-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-amber-100 px-4 py-3">
                <p className="text-sm font-extrabold text-amber-900">Coverage Required</p>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{coverageRequiredSessions.length}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {coverageRequiredSessions.map(session => (
                  <div key={session.key} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold text-blue-700">Assigned Coach</span>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-700">Tutor Unavailable</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">Needs Coverage</span>
                    </div>
                    <p className="mt-2 font-extrabold text-gray-800">{formatDate(session.date)} - #{session.sessionNumber}</p>
                    <p className="mt-1 text-xs text-gray-500">{session.moduleName} - {session.programme} - {session.groupName}</p>
                    {session.coverage?.tutorUnavailableReason && <p className="mt-1 text-xs font-semibold text-amber-700">{session.coverage.tutorUnavailableReason}</p>}
                  </div>
                ))}
                {!coverageRequiredSessions.length && <p className="px-4 py-6 text-center text-sm text-gray-400">No sessions currently require coverage for this coach.</p>}
              </div>
            </div>

            <div className="self-start rounded-xl border border-emerald-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-emerald-100 px-4 py-3">
                <p className="text-sm font-extrabold text-emerald-900">Sessions Covered By This Coach</p>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{coverageSessions.length}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {coverageSessions.map(session => (
                  <div key={session.key} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-extrabold text-cyan-700">Coverage Coach</span>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-700">Tutor Unavailable</span>
                    </div>
                    <p className="mt-2 font-extrabold text-gray-800">{formatDate(session.date)} - #{session.sessionNumber}</p>
                    <p className="mt-1 text-xs text-gray-500">{session.moduleName} - {session.programme} - {session.groupName}</p>
                    {session.coverage?.coverageReason && <p className="mt-1 text-xs font-semibold text-emerald-700">{session.coverage.coverageReason}</p>}
                  </div>
                ))}
                {!coverageSessions.length && <p className="px-4 py-6 text-center text-sm text-gray-400">No coverage sessions assigned to this coach.</p>}
              </div>
            </div>

            <div className="self-start rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-extrabold text-kbc-navy">Tutors Working With This Coach</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{tutorSummaries.length}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {tutorSummaries.map(summary => (
                  <div key={summary.tutor} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-extrabold text-gray-800">{summary.tutor}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-600">{summary.sessions} sessions</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{summary.programmes.slice(0, 4).join(', ') || 'No programmes'}</p>
                    <p className="mt-1 text-xs text-gray-400">{summary.modules.slice(0, 5).join(', ') || 'No modules'}</p>
                  </div>
                ))}
                {!tutorSummaries.length && <p className="px-4 py-6 text-center text-sm text-gray-400">No tutors are currently working with this coach.</p>}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white">
              <button type="button" onClick={() => setSessionBreakdownOpen(open => !open)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50">
                <span className="text-sm font-extrabold text-kbc-navy">Upcoming Session Breakdown</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Upcoming Sessions: {upcomingSessions.length}</span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Coverage Required: {coverageRequiredSessions.length}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500"><i className={sessionBreakdownOpen ? 'ri-arrow-up-s-line text-lg' : 'ri-arrow-down-s-line text-lg'} /></span>
                </span>
              </button>
              {sessionBreakdownOpen && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full min-w-[860px] border-collapse text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-400">
                      <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Session</th><th className="px-4 py-3">Module</th><th className="px-4 py-3">Programme</th><th className="px-4 py-3">Tutor</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {upcomingSessions.slice(0, 80).map(item => (
                        <tr key={`${item.module.block.id}-${item.date}-${item.number}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-gray-800">{formatDate(item.date)}</td>
                          <td className="px-4 py-3 text-gray-600">{formatTimeRange(item.module.startTime, item.module.endTime)}</td>
                          <td className="px-4 py-3 text-gray-700">#{item.number}</td>
                          <td className="px-4 py-3 text-gray-700">{item.module.moduleName}</td>
                          <td className="px-4 py-3 text-gray-500">{item.module.programme} - {item.module.groupName}</td>
                          <td className="px-4 py-3 text-gray-500">{item.module.tutor}</td>
                        </tr>
                      ))}
                      {!upcomingSessions.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No upcoming sessions for this coach.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">No coach profiles yet.</div>
        )}
      </div>
    </section>
  );
}
