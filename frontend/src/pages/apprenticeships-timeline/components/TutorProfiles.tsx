import { useMemo, useState } from 'react';
import type { CatalogModule, Holiday, ModuleBlock, ModuleValue, ProgrammeGroup, SessionCoverage, TutorProfile, WeekDayKey } from '../types';
import { MS, getModuleMeta } from '../data';
import { buildHolidayAdjustedSessionPlan } from '../utils';
import { buildTutorProfilesFromGroups, normalizeTutorName, resolveTutorProfile } from '../tutorProfiles';
import { kbcSwal } from '@/components/feature/sweetAlert';
import SelectField from './SelectField';

interface Props {
  groups: ProgrammeGroup[];
  tutorProfiles?: TutorProfile[];
  catalogModules?: CatalogModule[];
  holidays?: Holiday[];
  canEdit?: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
  onAddModuleForTutor?: (tutorProfileId: string, moduleValue: ModuleValue) => void;
  onCreateTutorProfile?: (profile: { name: string; email?: string; phone?: string; notes?: string; availabilityNotes?: string; isActive?: boolean; confirmCreateNew?: boolean }) => Promise<TutorProfile | { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number }>;
  onUpdateTutorProfile?: (id: string, profile: Partial<TutorProfile> & { confirmSave?: boolean }) => Promise<TutorProfile | { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number }>;
  onDeleteTutorProfile?: (id: string) => Promise<boolean>;
}

interface TutorSession {
  tutorProfileId: string;
  assignedTutorProfileId: string;
  coverageTutorProfileId: string;
  coverage?: SessionCoverage;
  coverageTutorName: string;
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

const AVAILABILITY_MODULES_PREFIX = '__available_modules:';

function parseAvailableModuleValues(value: string | undefined): string[] {
  const raw = String(value || '').trim();
  if (!raw.startsWith(AVAILABILITY_MODULES_PREFIX)) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw.slice(AVAILABILITY_MODULES_PREFIX.length));
    return Array.isArray(parsed)
      ? parsed.map(item => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function formatAvailableModuleValues(values: string[]): string {
  const unique = Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
  return `${AVAILABILITY_MODULES_PREFIX}${JSON.stringify(unique)}`;
}

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

function collectTutorSessions(groups: ProgrammeGroup[], catalogModules: CatalogModule[], holidays: Holiday[], now: Date, tutorProfiles: TutorProfile[]): TutorSession[] {
  return groups.flatMap((programme, groupIdx) =>
    programme.rows.flatMap((row, rowIdx) =>
      row.blks.flatMap(block => {
        const linkedProfile = resolveTutorProfile(block, tutorProfiles);
        const tutorEntries = linkedProfile
          ? [{ name: linkedProfile.name, profileId: linkedProfile.id }]
          : splitPeople(block.tutor || '').map(tutor => ({ name: tutor, profileId: `legacy:${normalizeTutorName(tutor)}` }));
        if (!tutorEntries.length) return [];

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

        return tutorEntries.flatMap(({ name: tutor, profileId }) =>
          dates.map((date, index): TutorSession => {
            const dateObj = parseLocalIsoDate(date);
            const sessionNumber = index + 1;
            const coverage = (block.sessionCoverage || []).find(item => item.sessionNumber === sessionNumber);
            const coverageTutor = coverage?.coverageTutorProfileId
              ? tutorProfiles.find(profile => profile.id === coverage.coverageTutorProfileId)
              : undefined;
            return {
              tutorProfileId: profileId,
              assignedTutorProfileId: profileId,
              coverageTutorProfileId: coverage?.coverageTutorProfileId || '',
              coverage,
              coverageTutorName: coverageTutor?.name || '',
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
  onAddModuleForTutor,
  activeTutorProfileId,
  moduleOptions,
  now,
}: {
  title: string;
  modules: TutorSession[];
  conflicts: TutorConflict[];
  emptyText: string;
  canEdit: boolean;
  onEditTrainingPlan?: (groupIdx: number, rowIdx: number, blockId: string) => void;
  onAddModuleForTutor?: (tutorProfileId: string, moduleValue: ModuleValue) => void;
  activeTutorProfileId: string;
  moduleOptions: Array<{ value: string; label: string; description?: string; color?: string }>;
  now: Date;
}) {
  const shouldScroll = modules.length > 4;
  return (
    <div className="self-start rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-extrabold text-kbc-navy">{title}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && onAddModuleForTutor && activeTutorProfileId && !activeTutorProfileId.startsWith('legacy:') && moduleOptions.length > 0 && (
            <div className="w-64 max-w-full">
              <SelectField
                value=""
                options={moduleOptions}
                placeholder="Add module"
                label="Modules"
                searchPlaceholder="Search modules..."
                accentColor="#1B2A4A"
                onChange={value => {
                  if (value) {
                    onAddModuleForTutor(activeTutorProfileId, value);
                  }
                }}
              />
            </div>
          )}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{modules.length}</span>
        </div>
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
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-4 text-center">
            <p className="text-sm text-gray-400">{emptyText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TutorProfiles({ groups, tutorProfiles = [], catalogModules = [], holidays = [], canEdit = false, onEditTrainingPlan, onAddModuleForTutor, onCreateTutorProfile, onUpdateTutorProfile, onDeleteTutorProfile }: Props) {
  const now = useMemo(() => new Date(), []);
  const profileList = useMemo(() => buildTutorProfilesFromGroups(groups, tutorProfiles), [groups, tutorProfiles]);
  const sessions = useMemo(() => collectTutorSessions(groups, catalogModules, holidays, now, profileList), [groups, catalogModules, holidays, now, profileList]);
  const [recentlyAddedTutorId, setRecentlyAddedTutorId] = useState('');
  const newestTutorProfileId = useMemo(() => profileList.reduce<{ id: string; time: number } | null>((latest, profile) => {
    if (profile.id.startsWith('legacy:') || !profile.createdAt) return latest;
    const time = new Date(profile.createdAt).getTime();
    if (Number.isNaN(time)) return latest;
    if (!latest || time > latest.time) return { id: profile.id, time };
    return latest;
  }, null)?.id || '', [profileList]);
  const tutorProfileIds = useMemo(() => profileList.map(profile => profile.id).sort((a, b) => {
    const pinnedTutorId = recentlyAddedTutorId || newestTutorProfileId;
    if (a === pinnedTutorId) return 1;
    if (b === pinnedTutorId) return -1;
    const left = profileList.find(profile => profile.id === a)?.name || a;
    const right = profileList.find(profile => profile.id === b)?.name || b;
    return left.localeCompare(right);
  }), [profileList, recentlyAddedTutorId, newestTutorProfileId]);
  const [selectedTutor, setSelectedTutor] = useState('');
  const [selectedCoach, setSelectedCoach] = useState('');
  const [selectedCoachPage, setSelectedCoachPage] = useState(1);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editProfileDraft, setEditProfileDraft] = useState<Partial<TutorProfile>>({});
  const [editProfileWarning, setEditProfileWarning] = useState<{ profile: TutorProfile; detail: string } | null>(null);
  const [editProfileError, setEditProfileError] = useState('');
  const [editProfileSaving, setEditProfileSaving] = useState(false);
  const [profileFormMode, setProfileFormMode] = useState<'add' | 'edit'>('edit');
  const [tutorSearch, setTutorSearch] = useState('');
  const [availabilityModuleSearch, setAvailabilityModuleSearch] = useState('');
  const [sessionBreakdownOpen, setSessionBreakdownOpen] = useState(false);
  const [sessionBreakdownPage, setSessionBreakdownPage] = useState(1);
  const filteredTutorProfileIds = useMemo(() => {
    const query = normalizeTutorName(tutorSearch);
    if (!query) return tutorProfileIds;
    return tutorProfileIds.filter(profileId => {
      const profile = profileList.find(item => item.id === profileId);
      const name = profile?.name || profileId.replace(/^legacy:/, '');
      const email = profile?.email || '';
      return normalizeTutorName(`${name} ${email}`).includes(query);
    });
  }, [profileList, tutorProfileIds, tutorSearch]);
  const activeTutorId = selectedTutor || tutorProfileIds[0] || '';
  const activeTutorProfile = profileList.find(profile => profile.id === activeTutorId);
  const activeTutor = activeTutorProfile?.name || '';
  const moduleOptions = useMemo(() => {
    const catalogOptions = catalogModules.map(module => ({
      value: module.name,
      label: module.name,
      description: `${module.sessions || 0} session${module.sessions === '1' ? '' : 's'}`,
      color: module.colour || '#4A6DB0',
    }));
    if (catalogOptions.length) return catalogOptions;
    return Object.entries(MS).map(([value, meta]) => ({
      value,
      label: meta.lbl,
      description: 'Standard module',
      color: meta.bg,
    }));
  }, [catalogModules]);
  const availabilityModuleOptions = useMemo(() => {
    const byValue = new Map<string, { value: string; label: string; color: string; count: number }>();
    groups.forEach(group => group.rows.forEach(row => row.blks.forEach(block => {
      const value = String(block.mod || '').trim();
      if (!value) return;
      const catalogModule = catalogModules.find(module => module.name === value);
      const meta = getModuleMeta(value);
      const existing = byValue.get(value);
      if (existing) {
        existing.count += 1;
        return;
      }
      byValue.set(value, {
        value,
        label: catalogModule?.name || meta.lbl || value,
        color: block.color || catalogModule?.colour || meta.bg || '#4A6DB0',
        count: 1,
      });
    })));
    return Array.from(byValue.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogModules, groups]);
  const selectedAvailabilityModules = useMemo(
    () => parseAvailableModuleValues(editProfileDraft.availabilityNotes),
    [editProfileDraft.availabilityNotes],
  );
  const filteredAvailabilityModuleOptions = useMemo(() => {
    const query = normalizeTutorName(availabilityModuleSearch);
    if (!query) return availabilityModuleOptions;
    return availabilityModuleOptions.filter(option =>
      normalizeTutorName(`${option.label} ${option.value}`).includes(query),
    );
  }, [availabilityModuleOptions, availabilityModuleSearch]);
  const toggleAvailabilityModule = (moduleValue: string) => {
    setEditProfileDraft(prev => {
      const selected = new Set(parseAvailableModuleValues(prev.availabilityNotes));
      if (selected.has(moduleValue)) {
        selected.delete(moduleValue);
      } else {
        selected.add(moduleValue);
      }
      return { ...prev, availabilityNotes: formatAvailableModuleValues(Array.from(selected)) };
    });
  };

  const openEditProfile = () => {
    if (!activeTutorProfile || activeTutorProfile.id.startsWith('legacy:')) return;
    setProfileFormMode('edit');
    setEditProfileDraft({ ...activeTutorProfile });
    setEditProfileWarning(null);
    setEditProfileError('');
    setAvailabilityModuleSearch('');
    setEditProfileOpen(true);
  };

  const openAddProfile = () => {
    setProfileFormMode('add');
    setEditProfileDraft({ name: '', email: '', phone: '', notes: '', availabilityNotes: '', isActive: true });
    setEditProfileWarning(null);
    setEditProfileError('');
    setAvailabilityModuleSearch('');
    setEditProfileOpen(true);
  };

  const saveEditProfile = async (confirmSave = false) => {
    if (!String(editProfileDraft.name || '').trim()) {
      setEditProfileError('Tutor name is required.');
      return;
    }
    if (profileFormMode === 'edit' && (!activeTutorProfile || !onUpdateTutorProfile || activeTutorProfile.id.startsWith('legacy:'))) return;
    if (profileFormMode === 'add' && !onCreateTutorProfile) return;
    setEditProfileSaving(true);
    setEditProfileError('');
    try {
      const result = profileFormMode === 'add'
        ? await onCreateTutorProfile!({ ...editProfileDraft, confirmCreateNew: confirmSave } as { name: string; email?: string; phone?: string; notes?: string; availabilityNotes?: string; isActive?: boolean; confirmCreateNew?: boolean })
        : await onUpdateTutorProfile!(activeTutorProfile!.id, { ...editProfileDraft, confirmSave });
      if ('id' in result) {
        setTutorSearch('');
        setSelectedTutor(result.id);
        if (profileFormMode === 'add') {
          setRecentlyAddedTutorId(result.id);
        }
        setEditProfileOpen(false);
        return;
      }
      const possible = result.possibleExistingProfile || result.existingProfile;
      if (possible) {
        setEditProfileWarning({ profile: possible, detail: result.detail || `Possible existing tutor found: ${possible.name}. Use existing profile instead?` });
        return;
      }
      setEditProfileError(result.detail || 'Tutor profile could not be updated.');
    } catch (error) {
      setEditProfileError(error instanceof Error ? error.message : 'Tutor profile could not be updated.');
    } finally {
      setEditProfileSaving(false);
    }
  };

  const deleteActiveProfile = async () => {
    if (!activeTutorProfile || activeTutorProfile.id.startsWith('legacy:') || !onDeleteTutorProfile) return;
    const result = await kbcSwal.fire({
      title: 'Delete Tutor Permanently?',
      html: `
        <div style="text-align:left;line-height:1.55">
          <p>You are about to permanently delete <strong>${activeTutorProfile.name}</strong>.</p>
          <p style="margin-top:8px;color:#64748b">Linked modules and sessions will stay in the Training Plan, but their tutor assignment/coverage reference to this profile will be cleared.</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Permanently',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#1B2A4A',
    });
    if (!result.isConfirmed) return;
    void kbcSwal.fire({
      title: 'Deleting tutor...',
      html: `Removing <strong>${activeTutorProfile.name}</strong> and updating linked Training Plan records.`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });
    const deleted = await onDeleteTutorProfile(activeTutorProfile.id);
    if (deleted) {
      setRecentlyAddedTutorId(currentId => currentId === activeTutorProfile.id ? '' : currentId);
      setSelectedTutor('');
    }
  };

  const tutorSessions = useMemo(
    () => sessions.filter(item => item.tutorProfileId === activeTutorId).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [sessions, activeTutorId],
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
    () => tutorSessions.filter(session => normalizeTutorName(session.coach || 'TBD') === normalizeTutorName(selectedCoach)).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [tutorSessions, selectedCoach],
  );
  const selectedCoachPageSize = 12;
  const selectedCoachTotalPages = Math.max(1, Math.ceil(selectedCoachSessions.length / selectedCoachPageSize));
  const safeSelectedCoachPage = Math.min(selectedCoachPage, selectedCoachTotalPages);
  const paginatedSelectedCoachSessions = selectedCoachSessions.slice(
    (safeSelectedCoachPage - 1) * selectedCoachPageSize,
    safeSelectedCoachPage * selectedCoachPageSize,
  );

  const inProgressModules = moduleBlocks.filter(item => getModuleStatus(item, now) === 'in-progress');
  const assignedModules = moduleBlocks.filter(item => getModuleStatus(item, now) === 'assigned');
  const allUpcomingSessions = tutorSessions
    .filter(item => parseLocalDateTime(item.date, item.endTime) > now)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const coverageRequiredSessions = allUpcomingSessions.filter(item => item.coverage?.tutorUnavailable);
  const sortedUpcomingSessions = [...allUpcomingSessions]
    .sort((a, b) => {
      const aNeedsCoverage = a.coverage?.tutorUnavailable ? 1 : 0;
      const bNeedsCoverage = b.coverage?.tutorUnavailable ? 1 : 0;
      return bNeedsCoverage - aNeedsCoverage || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
    });
  const sessionBreakdownPageSize = 12;
  const sessionBreakdownTotalPages = Math.max(1, Math.ceil(sortedUpcomingSessions.length / sessionBreakdownPageSize));
  const safeSessionBreakdownPage = Math.min(sessionBreakdownPage, sessionBreakdownTotalPages);
  const upcomingSessions = sortedUpcomingSessions.slice(
    (safeSessionBreakdownPage - 1) * sessionBreakdownPageSize,
    safeSessionBreakdownPage * sessionBreakdownPageSize,
  );
  const coveringSessions = sessions
    .filter(item => item.coverageTutorProfileId === activeTutorId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  if (!profileList.length) {
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
    <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tutors</p>
              <p className="mt-1 text-sm font-extrabold text-kbc-navy">{tutorProfileIds.length} profile{tutorProfileIds.length === 1 ? '' : 's'}</p>
            </div>
            {canEdit && onCreateTutorProfile && (
              <button type="button" onClick={openAddProfile} className="rounded-lg bg-kbc-navy px-2.5 py-1.5 text-xs font-extrabold text-white">
                Add
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-kbc-navy focus-within:ring-2 focus-within:ring-kbc-navy/10">
            <i className="ri-search-line text-sm text-gray-400" />
            <input
              type="search"
              value={tutorSearch}
              onChange={event => setTutorSearch(event.target.value)}
              placeholder="Search tutor..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-kbc-navy outline-none placeholder:text-gray-400"
            />
            {tutorSearch && (
              <button type="button" onClick={() => setTutorSearch('')} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-kbc-navy" aria-label="Clear tutor search">
                <i className="ri-close-line text-sm" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[42vh] overflow-y-auto p-2 xl:max-h-none xl:overflow-visible">
          {filteredTutorProfileIds.map(profileId => {
            const profile = profileList.find(item => item.id === profileId);
            const name = profile?.name || profileId.replace(/^legacy:/, '');
            const count = sessions.filter(item => item.tutorProfileId === profileId).length;
            const selected = profileId === activeTutorId;
            return (
              <button
                key={profileId}
                type="button"
                onClick={() => {
                  setSelectedTutor(profileId);
                  setSessionBreakdownPage(1);
                }}
                className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all"
                style={{ background: selected ? '#1B2A4A' : '#FFFFFF', color: selected ? '#FFFFFF' : '#1F2937' }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: selected ? 'rgba(255,255,255,0.16)' : '#EEF2FB' }}>
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{name}</span>
                  {profile?.email && <span className={`block truncate text-xs ${selected ? 'text-white/70' : 'text-gray-500'}`}>{profile.email}</span>}
                  <span className={`block text-xs ${selected ? 'text-white/60' : 'text-gray-400'}`}>{count} sessions</span>
                </span>
              </button>
            );
          })}
          {!filteredTutorProfileIds.length && (
            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center">
              <p className="text-sm font-bold text-kbc-navy">No tutors found</p>
              <p className="mt-1 text-xs text-gray-500">Try another name or email.</p>
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tutor Profile</p>
              <h2 className="mt-1 text-xl font-extrabold text-kbc-navy">{activeTutor}</h2>
              {activeTutorProfile?.email && <p className="mt-1 text-xs font-semibold text-gray-400">{activeTutorProfile.email}</p>}
              <p className="mt-1 text-sm text-gray-500">{tutorSessions.length} assigned sessions, {coverageRequiredSessions.length} coverage required, {coveringSessions.length} covering sessions</p>
            </div>
            {canEdit && activeTutorProfile && !activeTutorProfile.id.startsWith('legacy:') && (
              <div className="flex flex-wrap items-center gap-2">
                {onUpdateTutorProfile && (
                  <button type="button" onClick={openEditProfile} className="rounded-lg bg-kbc-navy px-3 py-2 text-xs font-extrabold text-white">
                    Edit Profile
                  </button>
                )}
                {onDeleteTutorProfile && (
                  <button type="button" onClick={() => void deleteActiveProfile()} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700">
                    Delete
                  </button>
                )}
              </div>
            )}
            {activeConflicts.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-amber-200">
                <i className="ri-alert-line" />
                {conflictGroups.length} active conflict group{conflictGroups.length === 1 ? '' : 's'} / {activeConflicts.length} sessions
              </span>
            )}
          </div>

          <div className="grid gap-3 px-4 py-4 sm:px-5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] sm:[grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">In Progress</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{inProgressModules.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Assigned</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{assignedModules.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Assigned Sessions</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{tutorSessions.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Programmes</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{new Set(tutorSessions.map(item => item.programme)).size}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Covering</p>
              <p className="mt-1 text-xl font-extrabold text-gray-800">{coveringSessions.length}</p>
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
            onAddModuleForTutor={onAddModuleForTutor}
            activeTutorProfileId={activeTutorId}
            moduleOptions={moduleOptions}
            now={now}
          />

          <ModuleList
            title="Assigned Modules"
            modules={assignedModules}
            conflicts={activeConflicts}
            emptyText="No future assigned modules for this tutor."
            canEdit={canEdit}
            onEditTrainingPlan={onEditTrainingPlan}
            onAddModuleForTutor={onAddModuleForTutor}
            activeTutorProfileId={activeTutorId}
            moduleOptions={moduleOptions}
            now={now}
          />

          <div className="self-start rounded-xl border border-amber-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-amber-100 px-4 py-3">
              <p className="text-sm font-extrabold text-amber-900">Coverage Required</p>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{coverageRequiredSessions.length}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {coverageRequiredSessions.map(session => (
                <div key={`required-${session.blockId}-${session.sessionNumber}`} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold text-blue-700">Primary Tutor</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-700">Unavailable</span>
                    {session.coverageTutorName ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">Covered By {session.coverageTutorName}</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">Coverage Required</span>
                    )}
                  </div>
                  <p className="mt-2 font-extrabold text-gray-800">{formatDate(session.date)} - #{session.sessionNumber} {session.sessionTitle}</p>
                  <p className="mt-1 text-xs text-gray-500">{session.module} - {session.programme} - {session.groupName}</p>
                  {session.coverage?.tutorUnavailableReason && <p className="mt-1 text-xs font-semibold text-amber-700">{session.coverage.tutorUnavailableReason}</p>}
                </div>
              ))}
              {coverageRequiredSessions.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">No sessions currently require coverage for this tutor.</p>}
            </div>
          </div>

          <div className="self-start rounded-xl border border-emerald-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-emerald-100 px-4 py-3">
              <p className="text-sm font-extrabold text-emerald-900">Sessions Covered By This Tutor</p>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{coveringSessions.length}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {coveringSessions.map(session => (
                <div key={`covering-${session.blockId}-${session.sessionNumber}`} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">Covering For {session.tutor}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold text-blue-700">Primary Tutor</span>
                  </div>
                  <p className="mt-2 font-extrabold text-gray-800">{formatDate(session.date)} - #{session.sessionNumber} {session.sessionTitle}</p>
                  <p className="mt-1 text-xs text-gray-500">{session.module} - {session.programme} - {session.groupName}</p>
                  {session.coverage?.coverageReason && <p className="mt-1 text-xs font-semibold text-emerald-700">{session.coverage.coverageReason}</p>}
                </div>
              ))}
              {coveringSessions.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">No coverage sessions assigned to this tutor.</p>}
            </div>
          </div>

          <div className="self-start rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-extrabold text-kbc-navy">Coaches Working With This Tutor</p>
            </div>
            <div className="divide-y divide-gray-100">
              {coachRows.map(row => (
                <button
                  key={row.coach}
                  type="button"
                  onClick={() => {
                    setSelectedCoach(row.coach);
                    setSelectedCoachPage(1);
                  }}
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
          <button
            type="button"
            onClick={() => setSessionBreakdownOpen(open => !open)}
            aria-expanded={sessionBreakdownOpen}
            className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
          >
            <span className="text-sm font-extrabold text-kbc-navy">Upcoming Session Breakdown</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Upcoming Sessions: {allUpcomingSessions.length}</span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Coverage Required: {coverageRequiredSessions.length}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <i className={sessionBreakdownOpen ? 'ri-arrow-up-s-line text-lg' : 'ri-arrow-down-s-line text-lg'} />
              </span>
            </span>
          </button>
          {sessionBreakdownOpen && (
            <div className="overflow-x-auto border-t border-gray-100">
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
                      <td className="px-4 py-3 text-gray-700">
                        <p>{session.module}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">Primary Tutor</span>
                          {session.coverage?.tutorUnavailable && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700">Unavailable</span>}
                          {session.coverage?.coverageStatus === 'required' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">Coverage Required</span>}
                          {session.coverageTutorName && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Covered By {session.coverageTutorName}</span>}
                        </div>
                      </td>
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
              {sortedUpcomingSessions.length > sessionBreakdownPageSize && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-400">
                    Showing {(safeSessionBreakdownPage - 1) * sessionBreakdownPageSize + 1}-{Math.min(safeSessionBreakdownPage * sessionBreakdownPageSize, sortedUpcomingSessions.length)} of {sortedUpcomingSessions.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSessionBreakdownPage(page => Math.max(1, page - 1))}
                      disabled={safeSessionBreakdownPage === 1}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600">
                      Page {safeSessionBreakdownPage} / {sessionBreakdownTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSessionBreakdownPage(page => Math.min(sessionBreakdownTotalPages, page + 1))}
                      disabled={safeSessionBreakdownPage === sessionBreakdownTotalPages}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {editProfileOpen && (profileFormMode === 'add' || activeTutorProfile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[4px]" onClick={() => { if (!editProfileSaving) setEditProfileOpen(false); }} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: '#1B2A4A' }}>
              <div>
                <p className="text-xs font-semibold text-white/60">Tutor Profile</p>
                <h3 className="mt-1 text-base font-extrabold text-white">{profileFormMode === 'add' ? 'Add Tutor' : 'Edit Profile'}</h3>
              </div>
              <button disabled={editProfileSaving} onClick={() => setEditProfileOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="relative space-y-4 bg-gray-50 p-5">
              {editProfileSaving && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center shadow-lg">
                    <i className="ri-loader-4-line inline-block animate-spin text-xl text-kbc-navy" />
                    <p className="mt-2 text-sm font-extrabold text-kbc-navy">
                      {profileFormMode === 'add' ? 'Adding tutor...' : 'Saving profile...'}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-gray-500">Please wait while the profile is saved.</p>
                  </div>
                </div>
              )}
              {[
                ['name', 'Full name'],
                ['email', 'Email'],
                ['phone', 'Phone'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">{label}</label>
                  <input
                    value={String(editProfileDraft[key as keyof TutorProfile] || '')}
                    onChange={event => {
                      setEditProfileDraft(prev => ({ ...prev, [key]: event.target.value }));
                      setEditProfileWarning(null);
                    }}
                    disabled={editProfileSaving}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none disabled:cursor-wait disabled:opacity-70"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Status</label>
                <select
                  value={editProfileDraft.isActive === false ? 'inactive' : 'active'}
                  onChange={event => setEditProfileDraft(prev => ({ ...prev, isActive: event.target.value === 'active' }))}
                  disabled={editProfileSaving}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none disabled:cursor-wait disabled:opacity-70"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">Modules This Tutor Can Deliver</label>
                  {availabilityModuleOptions.length > 0 && (
                    <button
                      type="button"
                      disabled={editProfileSaving}
                      onClick={() => {
                        const allSelected = selectedAvailabilityModules.length === availabilityModuleOptions.length;
                        setEditProfileDraft(prev => ({
                          ...prev,
                          availabilityNotes: allSelected
                            ? formatAvailableModuleValues([])
                            : formatAvailableModuleValues(availabilityModuleOptions.map(option => option.value)),
                        }));
                      }}
                      className="text-xs font-extrabold text-kbc-navy hover:underline disabled:cursor-wait disabled:opacity-60"
                    >
                      {selectedAvailabilityModules.length === availabilityModuleOptions.length ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </div>
                {availabilityModuleOptions.length > 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 focus-within:border-kbc-navy">
                      <i className="ri-search-line text-sm text-gray-400" />
                      <input
                        type="search"
                        value={availabilityModuleSearch}
                        onChange={event => setAvailabilityModuleSearch(event.target.value)}
                        disabled={editProfileSaving}
                        placeholder="Search modules..."
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-kbc-navy outline-none placeholder:text-gray-400 disabled:cursor-wait disabled:opacity-70"
                      />
                      {availabilityModuleSearch && (
                        <button
                          type="button"
                          onClick={() => setAvailabilityModuleSearch('')}
                          disabled={editProfileSaving}
                          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-kbc-navy disabled:cursor-wait disabled:opacity-60"
                          aria-label="Clear module search"
                        >
                          <i className="ri-close-line text-sm" />
                        </button>
                      )}
                    </div>
                    <div className="grid max-h-44 gap-2 overflow-y-auto p-2 sm:grid-cols-2">
                      {filteredAvailabilityModuleOptions.map(option => {
                        const checked = selectedAvailabilityModules.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${checked ? 'border-kbc-navy bg-kbc-navy/5' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                          >
                            <input
                              type="checkbox"
                              disabled={editProfileSaving}
                              checked={checked}
                              onChange={() => toggleAvailabilityModule(option.value)}
                              className="mt-0.5 h-4 w-4 accent-kbc-navy disabled:cursor-wait"
                            />
                            <span className="min-w-0">
                              <span className="flex items-center gap-2 font-bold text-gray-800">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: option.color }} />
                                <span className="truncate">{option.label}</span>
                              </span>
                              <span className="mt-0.5 block text-xs font-semibold text-gray-400">{option.count} Training Plan block{option.count === 1 ? '' : 's'}</span>
                            </span>
                          </label>
                        );
                      })}
                      {filteredAvailabilityModuleOptions.length === 0 && (
                        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm font-semibold text-gray-400 sm:col-span-2">
                          No modules match this search.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-sm font-semibold text-gray-400">
                    No modules found in the Training Plan yet.
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Notes</label>
                <textarea disabled={editProfileSaving} rows={3} value={editProfileDraft.notes || ''} onChange={event => setEditProfileDraft(prev => ({ ...prev, notes: event.target.value }))} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none disabled:cursor-wait disabled:opacity-70" />
              </div>
              {editProfileWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-extrabold">{editProfileWarning.detail}</p>
                  <p className="mt-1 text-xs font-semibold">{editProfileWarning.profile.name}</p>
                  <button type="button" disabled={editProfileSaving} onClick={() => void saveEditProfile(true)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-60">
                    {editProfileSaving && <i className="ri-loader-4-line animate-spin" />}
                    {editProfileSaving ? 'Saving...' : 'Confirm Save Anyway'}
                  </button>
                </div>
              )}
              {editProfileError && <p className="text-xs font-bold text-red-600">{editProfileError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button disabled={editProfileSaving} onClick={() => setEditProfileOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
              <button disabled={editProfileSaving} onClick={() => void saveEditProfile(false)} className="inline-flex items-center gap-2 rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-70">
                {editProfileSaving && <i className="ri-loader-4-line animate-spin" />}
                {editProfileSaving ? (profileFormMode === 'add' ? 'Adding tutor...' : 'Saving...') : profileFormMode === 'add' ? 'Add Tutor' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    {paginatedSelectedCoachSessions.map(session => {
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
                {selectedCoachSessions.length > selectedCoachPageSize && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-400">
                      Showing {(safeSelectedCoachPage - 1) * selectedCoachPageSize + 1}-{Math.min(safeSelectedCoachPage * selectedCoachPageSize, selectedCoachSessions.length)} of {selectedCoachSessions.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCoachPage(page => Math.max(1, page - 1))}
                        disabled={safeSelectedCoachPage === 1}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-600">
                        Page {safeSelectedCoachPage} / {selectedCoachTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedCoachPage(page => Math.min(selectedCoachTotalPages, page + 1))}
                        disabled={safeSelectedCoachPage === selectedCoachTotalPages}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
