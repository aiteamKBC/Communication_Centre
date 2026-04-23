import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CohortRow, CustomModule, Holiday, ModuleBlock, ModuleValue, ProgrammeGroup, WeekDayKey } from '../types';
import { MS, getModuleMeta } from '../data';
import { formatDate } from '../utils';
import DateField from './DateField';
import ModernTimeField from './ModernTimeField';
import { kbcSwal } from '@/components/feature/sweetAlert';

interface Props {
  mode: 'add' | 'edit';
  groups: ProgrammeGroup[];
  holidays: Holiday[];
  customModules?: CustomModule[];
  initialGroupIdx?: number;
  initialRow?: CohortRow;
  initialExpandedBlockId?: string;
  lockGroupSelection?: boolean;
  onSave: (groupIdx: number, row: CohortRow, prevGroupIdx?: number) => boolean | Promise<boolean>;
  onManageHolidays?: () => void;
  onClose: () => void;
}

interface FormModule {
  id: string;
  mod: ModuleValue;
  color: string;
  startDate: string;
  endDate: string;
  sessions: number;
  notes: string;
}

interface FormGroup {
  id: string;
  groupName: string;
  coachName: string;
  tutor: string;
  color: string;
  days: WeekDayKey[];
  sessionStartTime: string;
  sessionEndTime: string;
  modules: FormModule[];
}

interface FormData {
  groupIdx: number;
  label: string;
  dateLbl: string;
  endDateLbl: string;
  intake: string;
  quarter: string;
  color: string;
  holidayIds: string[];
  groups: FormGroup[];
}

interface GroupDraftState {
  group: FormGroup;
  replaceId?: string;
}

interface ModuleDraftState {
  parentGroupId: string;
  module: FormModule;
  replaceId?: string;
}

const WEEK_DAYS: { key: WeekDayKey; label: string }[] = [
  { key: 'saturday', label: 'Saturday' },
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
];

const STANDARD_MODULE_KEY_BY_LABEL: Record<string, ModuleValue> = Object.entries(MS).reduce((acc, [key, meta]) => {
  acc[meta.lbl.toLowerCase()] = key as ModuleValue;
  return acc;
}, {} as Record<string, ModuleValue>);

const JS_DAY_TO_KEY: Record<number, WeekDayKey> = {
  0: 'monday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function serializeDraftState(data: FormData, groupDraft: GroupDraftState | null, moduleDraft: ModuleDraftState | null): string {
  return JSON.stringify({ data, groupDraft, moduleDraft });
}

function contrastColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1F2937' : '#ffffff';
}

function addHoursToTime(value: string, hoursToAdd: number): string {
  const [hoursRaw = '0', minutesRaw = '0'] = String(value || '').split(':');
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return '11:00';
  }

  const totalMinutes = ((hours * 60) + minutes + (hoursToAdd * 60)) % (24 * 60);
  const nextHours = `${Math.floor(totalMinutes / 60)}`.padStart(2, '0');
  const nextMinutes = `${totalMinutes % 60}`.padStart(2, '0');
  return `${nextHours}:${nextMinutes}`;
}

function isIsoDate(value: string): boolean {
  if (!value) {
    return false;
  }
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function addDaysToIsoDate(value: string, days: number): string {
  if (!isIsoDate(value)) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  result.setDate(result.getDate() + days);
  return `${result.getFullYear()}-${`${result.getMonth() + 1}`.padStart(2, '0')}-${`${result.getDate()}`.padStart(2, '0')}`;
}

function addYearsToIsoDate(value: string, years: number): string {
  if (!isIsoDate(value)) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year + years, month - 1, day);
  if (result.getMonth() !== month - 1) {
    result.setDate(0);
  }
  return `${result.getFullYear()}-${`${result.getMonth() + 1}`.padStart(2, '0')}-${`${result.getDate()}`.padStart(2, '0')}`;
}

function enumerateIsoDates(startDate: string, endDate: string): string[] {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) {
    return [];
  }

  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDaysToIsoDate(cursor, 1);
  }
  return dates;
}

function countHolidayDaysInRange(startDate: string, endDate: string, holidays: Holiday[]): number {
  const holidayDays = new Set<string>();

  holidays.forEach(holiday => {
    if (!isIsoDate(holiday.startDate) || !isIsoDate(holiday.endDate) || holiday.endDate < holiday.startDate) {
      return;
    }

    const overlapStart = holiday.startDate > startDate ? holiday.startDate : startDate;
    const overlapEnd = holiday.endDate < endDate ? holiday.endDate : endDate;
    if (overlapStart > overlapEnd) {
      return;
    }

    enumerateIsoDates(overlapStart, overlapEnd).forEach(day => holidayDays.add(day));
  });

  return holidayDays.size;
}

function calculateModuleEndDate(startDate: string, sessions: number, holidays: Holiday[] = []): string {
  if (!isIsoDate(startDate)) {
    return '';
  }

  const safeSessions = Math.max(1, Number(sessions) || 1);
  let endDate = addDaysToIsoDate(startDate, safeSessions * 7);

  while (true) {
    const holidayDays = countHolidayDaysInRange(startDate, endDate, holidays);
    const shiftedEndDate = addDaysToIsoDate(startDate, safeSessions * 7 + holidayDays);
    if (shiftedEndDate === endDate) {
      return endDate;
    }
    endDate = shiftedEndDate;
  }
}

function normalizeDateLabel(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  if (isIsoDate(trimmedValue)) {
    return trimmedValue;
  }

  const parsed = new Date(`${trimmedValue} 1`);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, '0')}-01`;
  }

  return '';
}

function parseProgrammeDates(sub: string): { startDate: string; endDate: string } {
  const [startDate = '', endDate = ''] = (sub || '').split('|');
  return {
    startDate: isIsoDate(startDate) ? startDate : '',
    endDate: isIsoDate(endDate) ? endDate : '',
  };
}

function inferWeekDayFromIsoDate(isoDate: string): WeekDayKey {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return 'monday';
  }
  return JS_DAY_TO_KEY[d.getDay()] || 'monday';
}

function newFormModule(): FormModule {
  return {
    id: `mod-${Date.now()}-${Math.random()}`,
    mod: '',
    color: '',
    startDate: '',
    endDate: '',
    sessions: 1,
    notes: '',
  };
}

function newFormGroup(): FormGroup {
  return {
    id: `grp-${Date.now()}-${Math.random()}`,
    groupName: '',
    coachName: '',
    tutor: '',
    color: '',
    days: ['monday'],
    sessionStartTime: '09:00',
    sessionEndTime: '11:00',
    modules: [],
  };
}

const getModuleInputValue = (moduleValue: ModuleValue): string => {
  if (moduleValue in MS) {
    return getModuleMeta(moduleValue).lbl;
  }
  return typeof moduleValue === 'string' ? moduleValue : '';
};

const resolveModuleValue = (value: string, customModules: CustomModule[]): ModuleValue => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  if (value !== trimmedValue) {
    return value;
  }

  const standardKey = STANDARD_MODULE_KEY_BY_LABEL[trimmedValue.toLowerCase()];
  if (standardKey) {
    return standardKey;
  }

  const customModule = customModules.find(c => c.name.toLowerCase() === trimmedValue.toLowerCase());
  return customModule ? customModule.name : trimmedValue;
};

const resolveModuleMeta = (moduleValue: ModuleValue, customModules: CustomModule[]) => {
  const normalizedModuleValue = resolveModuleValue(getModuleInputValue(moduleValue), customModules);
  const standardMeta = normalizedModuleValue in MS ? getModuleMeta(normalizedModuleValue) : null;
  const customMeta = customModules.find(c => c.id === normalizedModuleValue || c.name === normalizedModuleValue);
  return standardMeta ?? (customMeta ? { lbl: customMeta.name, bg: customMeta.bg, tx: customMeta.tx } : getModuleMeta(moduleValue));
};

const resolveModuleVisualMeta = (moduleItem: FormModule, customModules: CustomModule[]) => {
  const baseMeta = resolveModuleMeta(moduleItem.mod, customModules);
  const overrideColor = moduleItem.color?.trim();
  if (!overrideColor) {
    return baseMeta;
  }

  return {
    ...baseMeta,
    bg: overrideColor,
    tx: contrastColor(overrideColor),
  };
};

function buildGroupSignature(block: ModuleBlock): string {
  const days = (block.days?.length ? block.days : [inferWeekDayFromIsoDate(block.startDate)]).join('|');
  return [
    block.groupName || '',
    block.coachName || '',
    block.tutor || '',
    days,
    block.sessionStartTime || '09:00',
    block.sessionEndTime || '11:00',
  ].join('::');
}

function groupBlocksForForm(blocks: ModuleBlock[]) {
  const grouped = new Map<string, FormGroup>();
  const order: string[] = [];

  blocks.forEach(block => {
    const key = buildGroupSignature(block);
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: `grp-${Date.now()}-${Math.random()}`,
        groupName: block.groupName || '',
        coachName: block.coachName || '',
        tutor: block.tutor || '',
        color: block.color || '',
        days: block.days?.length ? block.days : [inferWeekDayFromIsoDate(block.startDate)],
        sessionStartTime: block.sessionStartTime || '09:00',
        sessionEndTime: block.sessionEndTime || '11:00',
        modules: [],
      });
      order.push(key);
    }

    grouped.get(key)!.modules.push({
      id: block.id,
      mod: block.mod,
      color: block.color || '',
      startDate: block.startDate,
      endDate: block.endDate,
      sessions: block.sessions,
      notes: block.notes || '',
    });
  });

  return order.map(key => grouped.get(key)!).filter(Boolean);
}

export default function CohortModal({
  mode,
  groups,
  holidays,
  customModules = [],
  initialGroupIdx = 0,
  initialRow,
  lockGroupSelection = false,
  onSave,
  onManageHolidays,
  onClose,
}: Props) {
  const initialFormData: FormData = mode === 'edit' && initialRow ? {
    groupIdx: initialGroupIdx,
    label: initialRow.label,
    dateLbl: normalizeDateLabel(initialRow.dateLbl),
    endDateLbl: normalizeDateLabel(initialRow.endDateLbl || ''),
    intake: initialRow.intake,
    quarter: initialRow.quarter,
    color: initialRow.color || groups[initialGroupIdx]?.color || '#1B2A4A',
    holidayIds: initialRow.holidayIds || [],
    groups: groupBlocksForForm(initialRow.blks),
  } : {
    groupIdx: initialGroupIdx,
    label: '',
    dateLbl: '',
    endDateLbl: '',
    intake: 'Intake 1',
    quarter: 'Q1 2025',
    color: groups[initialGroupIdx]?.color || '#1B2A4A',
    holidayIds: [],
    groups: [],
  };

  const [data, setData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(initialFormData.groups[0]?.id || null);
  const [groupDraft, setGroupDraft] = useState<GroupDraftState | null>(null);
  const [moduleDraft, setModuleDraft] = useState<ModuleDraftState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const initialSnapshot = useMemo(() => serializeDraftState(initialFormData, groupDraft, moduleDraft), [initialFormData, groupDraft, moduleDraft]);
  const hasUnsavedChanges = useMemo(
    () => serializeDraftState(data, groupDraft, moduleDraft) !== serializeDraftState(initialFormData, null, null),
    [data, groupDraft, moduleDraft, initialFormData],
  );
  const selectedProgramme = groups[data.groupIdx];
  const programmeDates = parseProgrammeDates(selectedProgramme?.sub || '');

  const allModules = useMemo(() => data.groups.flatMap(group => group.modules), [data.groups]);
  const rangedModules = allModules.filter(item => isIsoDate(item.startDate) && isIsoDate(item.endDate) && item.startDate <= item.endDate);
  const hasModuleDateRange = rangedModules.length > 0;
  const hasProgrammeDateRange = Boolean(programmeDates.startDate && programmeDates.endDate && programmeDates.startDate <= programmeDates.endDate);
  const hasDateRange = hasModuleDateRange || hasProgrammeDateRange;
  const rangeStart = hasModuleDateRange
    ? rangedModules.reduce((min, item) => (item.startDate < min ? item.startDate : min), rangedModules[0].startDate)
    : hasProgrammeDateRange ? programmeDates.startDate : '';
  const rangeEnd = hasModuleDateRange
    ? rangedModules.reduce((max, item) => (item.endDate > max ? item.endDate : max), rangedModules[0].endDate)
    : hasProgrammeDateRange ? programmeDates.endDate : '';

  const holidaysInRange = hasDateRange
    ? holidays.filter(item => isIsoDate(item.startDate) && isIsoDate(item.endDate) && rangeStart <= item.endDate && rangeEnd >= item.startDate)
    : [];
  const holidaysInRangeIds = new Set(holidaysInRange.map(item => item.id));
  const selectedHolidays = useMemo(
    () => holidays.filter(item => data.holidayIds.includes(item.id)),
    [holidays, data.holidayIds],
  );

  useEffect(() => {
    const available = new Set(holidays.map(item => item.id));
    const filtered = data.holidayIds.filter(id => available.has(id));
    if (filtered.length !== data.holidayIds.length) {
      setData(prev => ({ ...prev, holidayIds: filtered }));
    }
  }, [holidays, data.holidayIds]);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setData(prev => ({ ...prev, [key]: value }));

  const setCohortStartDate = (value: string) =>
    setData(prev => ({
      ...prev,
      dateLbl: value,
      endDateLbl: value ? addYearsToIsoDate(value, 2) : '',
    }));

  const toggleHoliday = (holidayId: string) => {
    setData(prev => {
      const exists = prev.holidayIds.includes(holidayId);
      return {
        ...prev,
        holidayIds: exists ? prev.holidayIds.filter(id => id !== holidayId) : [...prev.holidayIds, holidayId],
      };
    });
  };

  const openAddGroup = () => {
    setGroupDraft({ group: newFormGroup() });
  };

  const openEditGroup = (groupId: string) => {
    const target = data.groups.find(group => group.id === groupId);
    if (!target) {
      return;
    }
    setGroupDraft({ group: { ...target, modules: [...target.modules] }, replaceId: groupId });
  };

  const openAddModule = (parentGroupId: string) => {
    setModuleDraft({ parentGroupId, module: newFormModule() });
  };

  const openEditModule = (parentGroupId: string, moduleId: string) => {
    const parentGroup = data.groups.find(group => group.id === parentGroupId);
    const target = parentGroup?.modules.find(item => item.id === moduleId);
    if (!parentGroup || !target) {
      return;
    }
    setModuleDraft({ parentGroupId, module: { ...target }, replaceId: moduleId });
  };

  const updateGroupDraft = (key: keyof Omit<FormGroup, 'id' | 'modules'>, value: string | WeekDayKey[]) => {
    setGroupDraft(prev => {
      if (!prev) {
        return prev;
      }
      const nextGroup = { ...prev.group, [key]: value };
      if (key === 'sessionStartTime') {
        nextGroup.sessionEndTime = addHoursToTime(String(value), 2);
      }
      return { ...prev, group: nextGroup };
    });
  };

  const toggleGroupDraftDay = (day: WeekDayKey) => {
    setGroupDraft(prev => {
      if (!prev) {
        return prev;
      }
      const exists = prev.group.days.includes(day);
      const nextDays = exists
        ? (prev.group.days.length === 1 ? prev.group.days : prev.group.days.filter(item => item !== day))
        : [...prev.group.days, day];
      return { ...prev, group: { ...prev.group, days: nextDays } };
    });
  };

  const saveGroupDraft = () => {
    if (!groupDraft) {
      return;
    }

    setData(prev => {
      if (groupDraft.replaceId) {
        return {
          ...prev,
          groups: prev.groups.map(group => (
            group.id !== groupDraft.replaceId
              ? group
              : {
                  ...group,
                  groupName: groupDraft.group.groupName,
                  coachName: groupDraft.group.coachName,
                  tutor: groupDraft.group.tutor,
                  color: groupDraft.group.color,
                  days: groupDraft.group.days,
                  sessionStartTime: groupDraft.group.sessionStartTime,
                  sessionEndTime: groupDraft.group.sessionEndTime,
                }
          )),
        };
      }

      return { ...prev, groups: [...prev.groups, groupDraft.group] };
    });

    setExpandedGroupId(groupDraft.replaceId || groupDraft.group.id);
    setGroupDraft(null);
  };

  const updateModuleDraft = (key: keyof Omit<FormModule, 'id'>, value: string | number) => {
    setModuleDraft(prev => {
      if (!prev) {
        return prev;
      }
      const nextModule = { ...prev.module, [key]: value };
      if (key === 'startDate' || key === 'sessions') {
        nextModule.endDate = calculateModuleEndDate(
          key === 'startDate' ? String(value) : nextModule.startDate,
          key === 'sessions' ? Number(value) : nextModule.sessions,
          selectedHolidays,
        );
      }
      return { ...prev, module: nextModule };
    });
  };

  const saveModuleDraft = () => {
    if (!moduleDraft) {
      return;
    }

    setData(prev => ({
      ...prev,
      groups: prev.groups.map(group => {
        if (group.id !== moduleDraft.parentGroupId) {
          return group;
        }
        if (moduleDraft.replaceId) {
          return {
            ...group,
            modules: group.modules.map(item => item.id === moduleDraft.replaceId ? moduleDraft.module : item),
          };
        }
        return {
          ...group,
          modules: [...group.modules, moduleDraft.module],
        };
      }),
    }));

    setExpandedGroupId(moduleDraft.parentGroupId);
    setModuleDraft(null);
  };

  const removeGroup = async (groupId: string) => {
    const target = data.groups.find(group => group.id === groupId);
    if (!target) {
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Delete Group?',
      html: `You are about to remove <strong>${target.groupName || target.tutor || 'this group'}</strong> and its ${target.modules.length} module${target.modules.length === 1 ? '' : 's'}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Group',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    setData(prev => ({ ...prev, groups: prev.groups.filter(group => group.id !== groupId) }));
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
    }
  };

  const removeModule = async (groupId: string, moduleId: string) => {
    const parentGroup = data.groups.find(group => group.id === groupId);
    const target = parentGroup?.modules.find(item => item.id === moduleId);
    if (!parentGroup || !target) {
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Delete Module?',
      html: `You are about to remove <strong>${getModuleInputValue(target.mod) || 'this module'}</strong> from <strong>${parentGroup.groupName || parentGroup.tutor || 'this group'}</strong>.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Module',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    setData(prev => ({
      ...prev,
      groups: prev.groups.map(group => (
        group.id !== groupId
          ? group
          : { ...group, modules: group.modules.filter(item => item.id !== moduleId) }
      )),
    }));
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!data.label.trim()) nextErrors.label = 'Cohort label is required';
    if (!data.dateLbl.trim()) nextErrors.dateLbl = 'Start date is required';
    if (!data.endDateLbl.trim()) nextErrors.endDateLbl = 'End date is required';
    if (data.dateLbl && data.endDateLbl && data.endDateLbl < data.dateLbl) nextErrors.endDateLbl = 'End date must be after start date';
    if (data.groups.length === 0) nextErrors.groups = 'Add at least one group';

    data.groups.forEach((group, groupIdx) => {
      if (group.modules.length === 0) {
        nextErrors[`group_modules_${groupIdx}`] = 'Add at least one module';
      }

      group.modules.forEach((moduleItem, moduleIdx) => {
        if (!moduleItem.startDate) nextErrors[`module_start_${groupIdx}_${moduleIdx}`] = 'Start date required';
        if (!moduleItem.endDate) nextErrors[`module_end_${groupIdx}_${moduleIdx}`] = 'End date required';
        if (moduleItem.startDate && moduleItem.endDate && moduleItem.endDate < moduleItem.startDate) {
          nextErrors[`module_end_${groupIdx}_${moduleIdx}`] = 'End date must be after start date';
        }
      });
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || isSaving) {
      return;
    }

    const row: CohortRow = {
      id: initialRow?.id || `row-${Date.now()}`,
      label: data.label.trim(),
      dateLbl: data.dateLbl.trim(),
      endDateLbl: data.endDateLbl.trim(),
      intake: data.intake,
      quarter: data.quarter,
      color: data.color,
      holidayIds: data.holidayIds,
      blks: data.groups.flatMap(group =>
        group.modules.map(moduleItem => ({
          id: moduleItem.id,
          mod: moduleItem.mod,
          groupName: group.groupName.trim() || undefined,
          coachName: group.coachName.trim() || undefined,
          color: moduleItem.color || group.color,
          tutor: group.tutor.trim(),
          startDate: moduleItem.startDate,
          endDate: moduleItem.endDate,
          sessions: moduleItem.sessions,
          days: group.days,
          sessionStartTime: group.sessionStartTime,
          sessionEndTime: group.sessionEndTime,
          notes: moduleItem.notes.trim() || undefined,
        } as ModuleBlock)),
      ),
    };

    setIsSaving(true);
    try {
      await onSave(data.groupIdx, row, mode === 'edit' ? initialGroupIdx : undefined);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestClose = async () => {
    if (isSaving) {
      return;
    }

    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Discard Changes?',
      html: 'If you close now, the cohort changes you entered will be lost.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Discard Changes',
      cancelButtonText: 'Keep Editing',
      reverseButtons: true,
      focusCancel: true,
    });

    if (result.isConfirmed) {
      onClose();
    }
  };

  const groupSummary = data.groups
    .map(group => group.groupName.trim() || group.tutor.trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={() => void handleRequestClose()} />
      <div className="relative bg-white rounded-xl w-full flex flex-col overflow-hidden shadow-2xl" style={{ maxWidth: 760, maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-base tracking-wide">{mode === 'add' ? 'Add New Cohort' : 'Edit Cohort'}</h2>
            <p className="text-white/60 text-xs mt-0.5">Program to cohort to group to module.</p>
          </div>
          <button onClick={() => void handleRequestClose()} disabled={isSaving} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors disabled:opacity-50">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em] mb-1.5">Programme</label>
            {mode === 'edit' || lockGroupSelection ? (
              <div
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-semibold whitespace-nowrap"
                style={{
                  borderColor: selectedProgramme?.color || '#E5E7EB',
                  background: selectedProgramme?.color ? `${selectedProgramme.color}15` : 'white',
                  color: selectedProgramme?.color || '#6B7280',
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedProgramme?.color || '#6B7280' }} />
                {selectedProgramme?.name.replace('\n', ' ')}
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {groups.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setData(prev => ({ ...prev, groupIdx: idx, color: mode === 'add' ? item.color : prev.color }))}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-semibold cursor-pointer transition-all whitespace-nowrap"
                    style={{
                      borderColor: data.groupIdx === idx ? item.color : '#E5E7EB',
                      background: data.groupIdx === idx ? `${item.color}15` : 'white',
                      color: data.groupIdx === idx ? item.color : '#6B7280',
                    }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                    {item.name.replace('\n', ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em] mb-1.5">Cohort</label>
              <input
                type="text"
                placeholder="e.g. Cohort Apr"
                value={data.label}
                onChange={e => setField('label', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: errors.label ? '#EF4444' : '#D1D5DB' }}
              />
              {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
              {groupSummary && <p className="text-sm text-gray-500 mt-2">Groups: {groupSummary}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em] mb-1.5">Cohort Start Date</label>
                <DateField value={data.dateLbl} onChange={value => setCohortStartDate(value)} placeholder="Choose cohort start date" error={errors.dateLbl} accentColor={data.color || selectedProgramme?.color || '#1B2A4A'} />
                {errors.dateLbl && <p className="text-red-500 text-xs mt-1">{errors.dateLbl}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em] mb-1.5">Cohort End Date</label>
                <DateField value={data.endDateLbl} onChange={value => setField('endDateLbl', value)} placeholder="Choose cohort end date" error={errors.endDateLbl} accentColor={data.color || selectedProgramme?.color || '#1B2A4A'} />
                {errors.endDateLbl && <p className="text-red-500 text-xs mt-1">{errors.endDateLbl}</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em] mb-1.5">Cohort Colour</label>
            <div className="flex items-center gap-3">
              <input type="color" value={data.color} onChange={e => setField('color', e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" />
              <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: data.color }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: contrastColor(data.color) }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: contrastColor(data.color) }}>Preview</p>
                  <p className="text-sm font-semibold truncate" style={{ color: contrastColor(data.color) }}>{data.label.trim() || 'New Cohort'}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em]">Linked Holidays (optional)</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{data.holidayIds.length} selected</span>
                {onManageHolidays && <button type="button" onClick={onManageHolidays} className="px-3 py-1.5 rounded-md text-sm font-semibold border cursor-pointer transition-all" style={{ borderColor: '#F7A800', background: '#FFF8E0', color: '#C49A00' }}>Manage Holidays</button>}
              </div>
            </div>

            <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
              {holidays.length === 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-700">No holidays saved yet</p>
                    <p className="text-sm text-gray-400 mt-1">Add a holiday first, then it will appear here immediately.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">{hasDateRange ? `${holidaysInRange.length} holidays overlap the current date range.` : 'Showing all saved holidays. You can link any of them before setting module dates.'}</p>
                  <div className="flex flex-wrap gap-2">
                    {holidays.map(holiday => {
                      const selected = data.holidayIds.includes(holiday.id);
                      const inRange = holidaysInRangeIds.has(holiday.id);
                      return (
                        <button
                          key={holiday.id}
                          type="button"
                          onClick={() => toggleHoliday(holiday.id)}
                          className="px-3 py-1.5 rounded-md text-sm font-semibold border cursor-pointer transition-all"
                          style={{
                            borderColor: selected ? '#1B2A4A' : '#D1D5DB',
                            background: selected ? '#E8EEF9' : inRange ? '#F8FAFF' : '#fff',
                            color: selected ? '#1B2A4A' : inRange ? '#3D5A99' : '#6B7280',
                          }}
                          title={`${holiday.label} (${formatDate(holiday.startDate)} - ${formatDate(holiday.endDate)})`}
                        >
                          {holiday.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em]">Groups</label>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{data.groups.length} groups</span>
              </div>
              <button onClick={openAddGroup} className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all" style={{ background: '#1B2A4A', color: '#fff' }}>
                <i className="ri-add-line" /> Add Group
              </button>
            </div>
            {errors.groups && <p className="text-red-500 text-xs mb-2">{errors.groups}</p>}

            <div className="space-y-4">
              {data.groups.map((group, groupIdx) => {
                const groupAccent = group.color || selectedProgramme?.color || '#1B2A4A';
                const isExpanded = expandedGroupId === group.id;
                const firstModule = group.modules[0];
                const lastModule = group.modules[group.modules.length - 1];

                return (
                  <div key={group.id} className="rounded-xl border overflow-hidden border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}>
                      <span className="shrink-0 w-3 h-6 rounded-sm" style={{ background: groupAccent }} />
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ background: `${groupAccent}14`, color: groupAccent }}>
                        Group {groupIdx + 1}
                      </span>
                      <span className="font-semibold text-base text-gray-800 flex-1">{group.groupName || group.tutor || `Group ${groupIdx + 1}`}</span>
                      <span className="text-sm text-gray-500 hidden md:block">{group.modules.length} module{group.modules.length === 1 ? '' : 's'}</span>
                      {group.coachName && <span className="text-sm text-gray-400 hidden sm:block">{group.coachName}</span>}
                      {firstModule && lastModule && <span className="text-sm text-gray-400 hidden lg:block">{formatDate(firstModule.startDate)} {'->'} {formatDate(lastModule.endDate)}</span>}
                      <button onClick={e => { e.stopPropagation(); void removeGroup(group.id); }} className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-all">
                        <i className="ri-delete-bin-line text-xs" />
                      </button>
                      {isExpanded ? <i className="ri-arrow-up-s-line text-gray-400 text-sm" /> : <i className="ri-arrow-down-s-line text-gray-400 text-sm" />}
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50 space-y-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: groupAccent }}>Group Details</p>
                              <p className="text-sm text-gray-400 mt-1">{group.tutor || 'Tutor not set'}</p>
                            </div>
                            <button type="button" onClick={() => openEditGroup(group.id)} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: groupAccent }}>
                              <i className="ri-edit-line" />
                              Edit Group
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="font-bold text-gray-500 uppercase tracking-[0.14em] text-[11px]">Coach</p>
                              <p className="text-gray-700 mt-1">{group.coachName || '—'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-gray-500 uppercase tracking-[0.14em] text-[11px]">Tutor / Lecturer</p>
                              <p className="text-gray-700 mt-1">{group.tutor || '—'}</p>
                            </div>
                            <div>
                              <p className="font-bold text-gray-500 uppercase tracking-[0.14em] text-[11px]">Session Time</p>
                              <p className="text-gray-700 mt-1">{group.sessionStartTime} - {group.sessionEndTime}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-[0.14em]">Modules</label>
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${groupAccent}12`, color: groupAccent }}>{group.modules.length} total</span>
                            </div>
                            <p className="text-sm text-gray-400 mt-1">Add modules inside this group.</p>
                          </div>
                          <button type="button" onClick={() => openAddModule(group.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: groupAccent }}>
                            <i className="ri-add-line" />
                            Add Module
                          </button>
                        </div>

                        {errors[`group_modules_${groupIdx}`] && <p className="text-red-500 text-xs">{errors[`group_modules_${groupIdx}`]}</p>}

                        <div className="space-y-2">
                          {group.modules.map((moduleItem, moduleIdx) => {
                            const moduleMeta = resolveModuleVisualMeta(moduleItem, customModules);
                            return (
                              <div key={moduleItem.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
                                <span className="w-3 h-8 rounded-sm shrink-0" style={{ background: moduleMeta.bg }} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-semibold text-gray-800 truncate">{moduleMeta.lbl}</p>
                                  <p className="text-sm text-gray-400 truncate">{moduleItem.startDate ? formatDate(moduleItem.startDate) : 'No start date'}{moduleItem.endDate ? ` -> ${formatDate(moduleItem.endDate)}` : ''} {' · '} {moduleItem.sessions} sessions</p>
                                  {(errors[`module_start_${groupIdx}_${moduleIdx}`] || errors[`module_end_${groupIdx}_${moduleIdx}`]) && <p className="text-red-500 text-xs mt-1">{errors[`module_start_${groupIdx}_${moduleIdx}`] || errors[`module_end_${groupIdx}_${moduleIdx}`]}</p>}
                                </div>
                                <button type="button" onClick={() => openEditModule(group.id, moduleItem.id)} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90" style={{ background: '#1B2A4A' }}>
                                  <i className="ri-edit-line" />
                                  Edit
                                </button>
                                <button type="button" onClick={() => void removeModule(group.id, moduleItem.id)} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-all">
                                  <i className="ri-delete-bin-line" />
                                </button>
                              </div>
                            );
                          })}

                          {group.modules.length === 0 && <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-400">No modules added yet.</div>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {data.groups.length === 0 && <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">No groups yet — click "Add Group" above</div>}
            </div>
          </div>
        </div>

        {groupDraft && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
                <div>
                  <h3 className="text-white font-extrabold text-sm tracking-wide">{groupDraft.replaceId ? 'Edit Group' : 'Add Group'}</h3>
                  <p className="text-white/60 text-xs mt-0.5">Create the parent group first, then add modules inside it.</p>
                </div>
                <button onClick={() => setGroupDraft(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4 bg-gray-50">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Group Colour</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={groupDraft.group.color || '#1B2A4A'} onChange={e => updateGroupDraft('color', e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" />
                    <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: `${(groupDraft.group.color || '#1B2A4A')}18` }}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: groupDraft.group.color || '#1B2A4A' }} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: groupDraft.group.color || '#1B2A4A' }}>Preview</p>
                        <p className="text-xs font-bold truncate" style={{ color: groupDraft.group.color || '#1B2A4A' }}>{groupDraft.group.groupName || groupDraft.group.tutor || 'New Group'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Group Name</label><input type="text" placeholder="e.g. G1" value={groupDraft.group.groupName} onChange={e => updateGroupDraft('groupName', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Coach Name</label><input type="text" placeholder="e.g. Coach Ahmed" value={groupDraft.group.coachName} onChange={e => updateGroupDraft('coachName', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tutor / Lecturer</label><input type="text" placeholder="e.g. Dr. Andrew Marsh" value={groupDraft.group.tutor} onChange={e => updateGroupDraft('tutor', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white" /></div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Week Days</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map(day => {
                      const selected = groupDraft.group.days.includes(day.key);
                      return (
                        <button key={day.key} type="button" onClick={() => toggleGroupDraftDay(day.key)} className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all" style={{ borderColor: selected ? (groupDraft.group.color || '#1B2A4A') : '#D1D5DB', background: selected ? `${(groupDraft.group.color || '#1B2A4A')}18` : '#fff', color: selected ? (groupDraft.group.color || '#1B2A4A') : '#6B7280' }}>
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session Start Time</label><ModernTimeField value={groupDraft.group.sessionStartTime} onChange={value => updateGroupDraft('sessionStartTime', value)} accentColor={groupDraft.group.color || '#1B2A4A'} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session End Time</label><ModernTimeField value={groupDraft.group.sessionEndTime} onChange={value => updateGroupDraft('sessionEndTime', value)} accentColor={groupDraft.group.color || '#1B2A4A'} /></div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-white">
                <button onClick={() => setGroupDraft(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">Cancel</button>
                <button onClick={saveGroupDraft} className="px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all" style={{ background: '#1B2A4A' }}>Save Group</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {moduleDraft && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
                <div>
                  <h3 className="text-white font-extrabold text-sm tracking-wide">{moduleDraft.replaceId ? 'Edit Module' : 'Add Module'}</h3>
                  <p className="text-white/60 text-xs mt-0.5">This module will be added inside the selected group.</p>
                </div>
                <button onClick={() => setModuleDraft(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4 bg-gray-50">
                {(() => {
                  const moduleMeta = resolveModuleVisualMeta(moduleDraft.module, customModules);
                  return (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module</label>
                        <input
                          type="text"
                          placeholder="e.g. PMP"
                          value={getModuleInputValue(moduleDraft.module.mod)}
                          onChange={e => {
                            const nextValue = e.target.value;
                            const resolvedValue = resolveModuleValue(nextValue, customModules);
                            updateModuleDraft('mod', resolvedValue);
                            const customModule = customModules.find(c => c.name.toLowerCase() === nextValue.trim().toLowerCase());
                            if (customModule) {
                              updateModuleDraft('sessions', customModule.defaultSessions);
                            }
                          }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module Colour</label>
                        <div className="flex items-center gap-3">
                          <input type="color" value={moduleDraft.module.color || moduleMeta.bg} onChange={e => updateModuleDraft('color', e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" />
                          <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: moduleMeta.bg }}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: moduleMeta.tx }} />
                            <div className="min-w-0">
                              <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: moduleMeta.tx }}>Preview</p>
                              <p className="text-xs font-bold truncate" style={{ color: moduleMeta.tx }}>{moduleMeta.lbl}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module Start Date</label><DateField value={moduleDraft.module.startDate} onChange={value => updateModuleDraft('startDate', value)} placeholder="Choose start date" accentColor={moduleMeta.bg} /></div>
                        <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module End Date</label><DateField value={moduleDraft.module.endDate} onChange={value => updateModuleDraft('endDate', value)} placeholder="Choose end date" accentColor={moduleMeta.bg} /></div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Number of Sessions</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} max={100} value={moduleDraft.module.sessions} onChange={e => updateModuleDraft('sessions', Math.max(1, Number(e.target.value) || 1))} className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none bg-white" />
                          <span className="text-xs text-gray-400">sessions total</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes (optional)</label>
                        <textarea value={moduleDraft.module.notes} onChange={e => updateModuleDraft('notes', e.target.value)} placeholder="Any additional notes..." rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none bg-white" />
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-white">
                <button onClick={() => setModuleDraft(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">Cancel</button>
                <button onClick={saveModuleDraft} className="px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all" style={{ background: '#1B2A4A' }}>Save Module</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={() => void handleRequestClose()} disabled={isSaving} className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer transition-all disabled:opacity-50">Cancel</button>
          <button onClick={() => void handleSave()} disabled={isSaving} className="px-6 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all disabled:opacity-60" style={{ background: data.color || selectedProgramme?.color || '#1B2A4A' }}>
            {isSaving ? 'Saving...' : mode === 'add' ? 'Add Cohort' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
