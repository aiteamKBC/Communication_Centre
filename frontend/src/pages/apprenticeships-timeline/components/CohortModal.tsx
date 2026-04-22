import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ProgrammeGroup, CohortRow, ModuleBlock, ModuleValue, WeekDayKey, Holiday, CustomModule } from '../types';
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

interface FormBlkGroup {
  id: string;
  tutor: string;
  color: string;
  days: WeekDayKey[];
  sessionStartTime: string;
  sessionEndTime: string;
  notes: string;
}

interface FormBlk {
  id: string;
  mod: ModuleValue;
  color: string;
  startDate: string;
  endDate: string;
  sessions: number;
  groups: FormBlkGroup[];
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
  blks: FormBlk[];
}

function contrastColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1F2937' : '#ffffff';
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

const inferWeekDayFromIsoDate = (isoDate: string): WeekDayKey => {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return 'monday';
  }
  return JS_DAY_TO_KEY[d.getDay()] || 'monday';
};

function isIsoDate(value: string): boolean {
  if (!value) {
    return false;
  }
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function overlapsRange(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && endA >= startB;
}

function addDaysToIsoDate(value: string, days: number): string {
  if (!isIsoDate(value)) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  result.setDate(result.getDate() + days);
  const resultYear = result.getFullYear();
  const resultMonth = `${result.getMonth() + 1}`.padStart(2, '0');
  const resultDay = `${result.getDate()}`.padStart(2, '0');
  return `${resultYear}-${resultMonth}-${resultDay}`;
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
  const resultYear = result.getFullYear();
  const resultMonth = `${result.getMonth() + 1}`.padStart(2, '0');
  const resultDay = `${result.getDate()}`.padStart(2, '0');
  return `${resultYear}-${resultMonth}-${resultDay}`;
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
    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}-01`;
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

const newBlkGroup = (): FormBlkGroup => ({
  id: `grp-${Date.now()}-${Math.random()}`,
  tutor: '',
  color: '',
  days: ['monday'],
  sessionStartTime: '09:00',
  sessionEndTime: '11:00',
  notes: '',
});

const newBlk = (): FormBlk => ({
  id: `blk-${Date.now()}-${Math.random()}`,
  mod: '',
  color: '',
  startDate: '',
  endDate: '',
  sessions: 1,
  groups: [newBlkGroup()],
});

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

  // Preserve in-progress spacing while typing. Only normalize to a known module
  // when the entered value itself is already an exact match.
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

const resolveBlockVisualMeta = (block: { mod: ModuleValue; color?: string }, customModules: CustomModule[]) => {
  const normalizedModuleValue = resolveModuleValue(getModuleInputValue(block.mod), customModules);
  const standardMeta = normalizedModuleValue in MS ? getModuleMeta(normalizedModuleValue) : null;
  const customMeta = customModules.find(c => c.id === normalizedModuleValue || c.name === normalizedModuleValue);
  const baseMeta = standardMeta ?? (customMeta ? { lbl: customMeta.name, bg: customMeta.bg, tx: customMeta.tx } : getModuleMeta(block.mod));
  const overrideColor = block.color?.trim();

  if (!overrideColor) {
    return baseMeta;
  }

  return {
    ...baseMeta,
    bg: overrideColor,
    tx: contrastColor(overrideColor),
  };
};

function groupBlocksForForm(blocks: ModuleBlock[]): { blks: FormBlk[]; expandedSourceBlockId: string | null } {
  const grouped = new Map<string, FormBlk>();
  const order: string[] = [];

  blocks.forEach(block => {
    const key = `${String(block.mod)}::${block.color || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: `blk-${Date.now()}-${Math.random()}`,
        mod: block.mod,
        color: block.color || '',
        startDate: block.startDate,
        endDate: block.endDate,
        sessions: block.sessions,
        groups: [],
      });
      order.push(key);
    }

    const target = grouped.get(key)!;
    if (!target.startDate || block.startDate < target.startDate) {
      target.startDate = block.startDate;
    }
    if (!target.endDate || block.endDate > target.endDate) {
      target.endDate = block.endDate;
    }
    if (!target.sessions || block.sessions > target.sessions) {
      target.sessions = block.sessions;
    }

    target.groups.push({
      id: block.id,
      tutor: block.tutor,
      color: block.color || '',
      days: block.days?.length ? block.days : [inferWeekDayFromIsoDate(block.startDate)],
      sessionStartTime: block.sessionStartTime || '09:00',
      sessionEndTime: block.sessionEndTime || '11:00',
      notes: block.notes || '',
    });
  });

  return {
    blks: order.map(key => grouped.get(key)!).filter(Boolean),
    expandedSourceBlockId: blocks[0]?.id || null,
  };
}

function getBlockRange(block: FormBlk): { start: string; end: string } | null {
  if (!isIsoDate(block.startDate) || !isIsoDate(block.endDate) || block.startDate > block.endDate) {
    return null;
  }
  return {
    start: block.startDate,
    end: block.endDate,
  };
}

function getBlockSessionCount(block: FormBlk): number {
  return block.sessions;
}

function getBlockMaxSessions(block: FormBlk): number {
  return block.sessions;
}

export default function CohortModal({ mode, groups, holidays, customModules = [], initialGroupIdx = 0, initialRow, initialExpandedBlockId, lockGroupSelection = false, onSave, onManageHolidays, onClose }: Props) {
  const initialGroupedBlocks = mode === 'edit' && initialRow ? groupBlocksForForm(initialRow.blks) : { blks: [] as FormBlk[], expandedSourceBlockId: null as string | null };
  const [data, setData] = useState<FormData>(() => {
    if (mode === 'edit' && initialRow) {
      return {
        groupIdx: initialGroupIdx,
        label:    initialRow.label,
        dateLbl:  normalizeDateLabel(initialRow.dateLbl),
        endDateLbl: normalizeDateLabel(initialRow.endDateLbl || ''),
        intake:   initialRow.intake,
        quarter:  initialRow.quarter,
        color: initialRow.color || groups[initialGroupIdx]?.color || '#1B2A4A',
        holidayIds: initialRow.holidayIds || [],
        blks: initialGroupedBlocks.blks,
      };
    }
    return {
      groupIdx: initialGroupIdx,
      label: '',
      dateLbl: '',
      endDateLbl: '',
      intake: 'Intake 1',
      quarter: 'Q1 2025',
      color: groups[initialGroupIdx]?.color || '#1B2A4A',
      holidayIds: [],
      blks: [],
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedBlk, setExpandedBlk] = useState<string | null>(() => {
    if (!initialExpandedBlockId) {
      return data.blks[0]?.id || null;
    }
    const matched = data.blks.find(block => block.groups.some(group => group.id === initialExpandedBlockId));
    return matched?.id || data.blks[0]?.id || null;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [moduleDraft, setModuleDraft] = useState<FormBlk | null>(null);
  const [groupDraft, setGroupDraft] = useState<{ blockId: string; group: FormBlkGroup } | null>(null);
  const selectedGroup = groups[data.groupIdx];
  const programmeDates = parseProgrammeDates(selectedGroup?.sub || '');

  const rangedBlocks = data.blks.filter(block => isIsoDate(block.startDate) && isIsoDate(block.endDate) && block.startDate <= block.endDate);
  const hasModuleDateRange = rangedBlocks.length > 0;
  const hasProgrammeDateRange = Boolean(programmeDates.startDate && programmeDates.endDate && programmeDates.startDate <= programmeDates.endDate);
  const hasDateRange = hasModuleDateRange || hasProgrammeDateRange;
  const rangeStart = hasModuleDateRange
    ? rangedBlocks.reduce((min, block) => (block.startDate < min ? block.startDate : min), rangedBlocks[0].startDate)
    : hasProgrammeDateRange ? programmeDates.startDate : '';
  const rangeEnd = hasModuleDateRange
    ? rangedBlocks.reduce((max, block) => (block.endDate > max ? block.endDate : max), rangedBlocks[0].endDate)
    : hasProgrammeDateRange ? programmeDates.endDate : '';

  const holidaysInRange = hasDateRange
    ? holidays.filter(h => isIsoDate(h.startDate) && isIsoDate(h.endDate) && overlapsRange(rangeStart, rangeEnd, h.startDate, h.endDate))
    : [];
  const holidaysInRangeIds = new Set(holidaysInRange.map(holiday => holiday.id));
  const selectedHolidays = useMemo(
    () => holidays.filter(holiday => data.holidayIds.includes(holiday.id)),
    [holidays, data.holidayIds],
  );
  useEffect(() => {
    const available = new Set(holidays.map(holiday => holiday.id));
    const filtered = data.holidayIds.filter(id => available.has(id));
    if (filtered.length !== data.holidayIds.length) {
      setData(prev => ({ ...prev, holidayIds: filtered }));
    }
  }, [holidays, data.holidayIds]);

  const setField = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setData(prev => ({ ...prev, [k]: v }));

  const setCohortStartDate = (value: string) =>
    setData(prev => ({
      ...prev,
      dateLbl: value,
      endDateLbl: value ? addYearsToIsoDate(value, 2) : '',
    }));

  const updateBlk = (id: string, k: 'mod' | 'color' | 'startDate' | 'endDate' | 'sessions', v: string | number) =>
    setData(prev => ({
      ...prev,
      blks: prev.blks.map(block => {
        if (block.id !== id) {
          return block;
        }
        const nextBlock = { ...block, [k]: v };
        if (k === 'startDate' || k === 'sessions') {
          nextBlock.endDate = calculateModuleEndDate(
            k === 'startDate' ? String(v) : nextBlock.startDate,
            k === 'sessions' ? Number(v) : getBlockMaxSessions(nextBlock),
            selectedHolidays,
          );
        }
        return nextBlock;
      }),
    }));

  const updateBlkGroup = (blockId: string, groupId: string, k: keyof FormBlkGroup, v: string | number) =>
    setData(prev => ({
      ...prev,
      blks: prev.blks.map(block => {
        if (block.id !== blockId) {
          return block;
        }

        return {
          ...block,
          groups: block.groups.map(group => {
            if (group.id !== groupId) {
              return group;
            }

            return { ...group, [k]: v };
          }),
        };
      }),
    }));

  useEffect(() => {
    setData(prev => {
      let hasChanges = false;
      const nextBlocks = prev.blks.map(block => {
        const nextEndDate = calculateModuleEndDate(block.startDate, getBlockMaxSessions(block), selectedHolidays);
        if (nextEndDate && nextEndDate !== block.endDate) {
          hasChanges = true;
          return { ...block, endDate: nextEndDate };
        }
        return block;
      });

      return hasChanges ? { ...prev, blks: nextBlocks } : prev;
    });
  }, [selectedHolidays]);

  const toggleBlkDay = (blockId: string, groupId: string, day: WeekDayKey) => {
    setData(prev => ({
      ...prev,
      blks: prev.blks.map(block => {
        if (block.id !== blockId) {
          return block;
        }

        return {
          ...block,
          groups: block.groups.map(group => {
            if (group.id !== groupId) {
              return group;
            }

            const exists = group.days.includes(day);
            if (exists) {
              if (group.days.length === 1) {
                return group;
              }
              return { ...group, days: group.days.filter(d => d !== day) };
            }
            return { ...group, days: [...group.days, day] };
          }),
        };
      }),
    }));
  };

  const addBlk = () => {
    setModuleDraft(newBlk());
  };

  const addBlkGroup = (blockId: string) => {
    setGroupDraft({ blockId, group: newBlkGroup() });
  };

  const updateModuleDraft = (k: 'mod' | 'color' | 'startDate' | 'endDate' | 'sessions', v: string | number) => {
    setModuleDraft(prev => {
      if (!prev) {
        return prev;
      }
      const next = { ...prev, [k]: v };
      if (k === 'startDate' || k === 'sessions') {
        next.endDate = calculateModuleEndDate(
          k === 'startDate' ? String(v) : next.startDate,
          k === 'sessions' ? Number(v) : next.sessions,
          selectedHolidays,
        );
      }
      return next;
    });
  };

  const updateModuleDraftGroup = (k: keyof FormBlkGroup, v: string | number) => {
    setModuleDraft(prev => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        groups: prev.groups.map((group, idx) => idx === 0 ? { ...group, [k]: v } : group),
      };
    });
  };

  const toggleModuleDraftDay = (day: WeekDayKey) => {
    setModuleDraft(prev => {
      if (!prev) {
        return prev;
      }
      const currentGroup = prev.groups[0];
      if (!currentGroup) {
        return prev;
      }
      const exists = currentGroup.days.includes(day);
      const nextDays = exists
        ? (currentGroup.days.length === 1 ? currentGroup.days : currentGroup.days.filter(item => item !== day))
        : [...currentGroup.days, day];
      return {
        ...prev,
        groups: [{ ...currentGroup, days: nextDays }],
      };
    });
  };

  const updateGroupDraft = (k: keyof FormBlkGroup, v: string | number) => {
    setGroupDraft(prev => prev ? { ...prev, group: { ...prev.group, [k]: v } } : prev);
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
      return {
        ...prev,
        group: { ...prev.group, days: nextDays },
      };
    });
  };

  const saveModuleDraft = () => {
    if (!moduleDraft) {
      return;
    }
    setData(prev => ({ ...prev, blks: [...prev.blks, moduleDraft] }));
    setExpandedBlk(moduleDraft.id);
    setModuleDraft(null);
  };

  const saveGroupDraft = () => {
    if (!groupDraft) {
      return;
    }
    setData(prev => ({
      ...prev,
      blks: prev.blks.map(block => block.id === groupDraft.blockId ? { ...block, groups: [...block.groups, groupDraft.group] } : block),
    }));
    setGroupDraft(null);
  };

  const toggleHoliday = (holidayId: string) => {
    setData(prev => {
      const exists = prev.holidayIds.includes(holidayId);
      return {
        ...prev,
        holidayIds: exists ? prev.holidayIds.filter(id => id !== holidayId) : [...prev.holidayIds, holidayId],
      };
    });
  };

  const removeBlk = (id: string) => {
    setData(prev => ({ ...prev, blks: prev.blks.filter(b => b.id !== id) }));
    if (expandedBlk === id) setExpandedBlk(null);
  };

  const removeBlkGroup = (blockId: string, groupId: string) => {
    setData(prev => ({
      ...prev,
      blks: prev.blks.map(block => {
        if (block.id !== blockId || block.groups.length === 1) {
          return block;
        }
        return { ...block, groups: block.groups.filter(group => group.id !== groupId) };
      }),
    }));
  };

  const confirmRemoveBlk = async (id: string) => {
    const block = data.blks.find(item => item.id === id);
    if (!block) {
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Delete Module?',
      html: `You are about to remove <strong>${getModuleInputValue(block.mod) || 'this module'}</strong> and its ${block.groups.length} group${block.groups.length === 1 ? '' : 's'}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Module',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (result.isConfirmed) {
      removeBlk(id);
    }
  };

  const confirmRemoveBlkGroup = async (blockId: string, groupId: string) => {
    const block = data.blks.find(item => item.id === blockId);
    const group = block?.groups.find(item => item.id === groupId);
    if (!block || !group || block.groups.length === 1) {
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Delete Group?',
      html: `You are about to remove <strong>${group.tutor || 'this group'}</strong> from <strong>${getModuleInputValue(block.mod) || 'this module'}</strong>.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete Group',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (result.isConfirmed) {
      removeBlkGroup(blockId, groupId);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!data.label.trim())   errs.label   = 'Cohort label is required';
    if (!data.dateLbl.trim()) errs.dateLbl = 'Start date label is required';
    if (!data.endDateLbl.trim()) errs.endDateLbl = 'End date is required';
    if (data.dateLbl && data.endDateLbl && data.endDateLbl < data.dateLbl) errs.endDateLbl = 'End date must be after start date';
    if (data.blks.length === 0) errs.blks  = 'Add at least one module block';
    data.blks.forEach((block, blockIdx) => {
      if (!block.startDate) errs[`blk_start_${blockIdx}`] = 'Start date required';
      if (!block.endDate) errs[`blk_end_${blockIdx}`] = 'End date required';
      if (block.startDate && block.endDate && block.endDate < block.startDate)
        errs[`blk_end_${blockIdx}`] = 'End must be after start';
      if (block.groups.length === 0) errs[`blk_groups_${blockIdx}`] = 'Add at least one group';
      block.groups.forEach((group, groupIdx) => {
        const key = `${blockIdx}_${groupIdx}`;
        if (!group.days.length) errs[`blk_days_${key}`] = 'Select at least one weekday';
        if (!group.sessionStartTime) errs[`blk_time_start_${key}`] = 'Start time required';
        if (!group.sessionEndTime) errs[`blk_time_end_${key}`] = 'End time required';
        if (group.sessionStartTime && group.sessionEndTime && group.sessionEndTime <= group.sessionStartTime)
          errs[`blk_time_end_${key}`] = 'End time must be after start time';
      });
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || isSaving) return;
    const row: CohortRow = {
      id: initialRow?.id || `row-${Date.now()}`,
      label:   data.label.trim(),
      dateLbl: data.dateLbl.trim(),
      endDateLbl: data.endDateLbl.trim(),
      intake:  data.intake,
      quarter: data.quarter,
      color: data.color,
      holidayIds: data.holidayIds,
      blks: data.blks.flatMap(block =>
        block.groups.map(group => ({
          id: group.id,
          mod: block.mod,
          color: group.color || block.color,
          tutor: group.tutor.trim(),
          startDate: block.startDate,
          endDate: block.endDate,
          sessions: block.sessions,
          days: group.days,
          sessionStartTime: group.sessionStartTime,
          sessionEndTime: group.sessionEndTime,
          notes: group.notes.trim() || undefined,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />
      <div className="relative bg-white rounded-xl w-full flex flex-col overflow-hidden shadow-2xl" style={{ maxWidth: 720, maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: '#1B2A4A' }}>
          <div>
            <h2 className="text-white font-extrabold text-base tracking-wide">
              {mode === 'add' ? 'Add New Cohort' : 'Edit Cohort'}
            </h2>
            <p className="text-white/60 text-xs mt-0.5">
              {mode === 'add' ? 'Define cohort details, tutor assignments, and module schedule' : 'Update cohort details, tutors, dates, and modules'}
            </p>
          </div>
          <button onClick={onClose} disabled={isSaving} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Programme Group */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Programme</label>
            {mode === 'edit' || lockGroupSelection ? (
              <div
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-bold whitespace-nowrap"
                style={{
                  borderColor: selectedGroup?.color || '#E5E7EB',
                  background: selectedGroup?.color ? `${selectedGroup.color}15` : 'white',
                  color: selectedGroup?.color || '#6B7280',
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selectedGroup?.color || '#6B7280' }} />
                {selectedGroup?.name.replace('\n', ' ')}
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {groups.map((g, gi) => (
                  <button key={gi} onClick={() => setData(prev => ({ ...prev, groupIdx: gi, color: mode === 'add' ? g.color : prev.color }))}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-bold cursor-pointer transition-all whitespace-nowrap"
                    style={{
                      borderColor: data.groupIdx === gi ? g.color : '#E5E7EB',
                      background:  data.groupIdx === gi ? `${g.color}15` : 'white',
                      color:       data.groupIdx === gi ? g.color : '#6B7280',
                    }}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                    {g.name.replace('\n', ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cohort info */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Cohort</label>
              <input type="text" placeholder="e.g. Cohort 3 - G1"
                value={data.label} onChange={e => setField('label', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ borderColor: errors.label ? '#EF4444' : '#D1D5DB' }} />
              {errors.label && <p className="text-red-500 text-xs mt-1">{errors.label}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Cohort Start Date</label>
              <DateField
                value={data.dateLbl}
                onChange={value => setCohortStartDate(value)}
                placeholder="Choose cohort start date"
                error={errors.dateLbl}
                accentColor={data.color || selectedGroup?.color || '#1B2A4A'}
              />
              {errors.dateLbl && <p className="text-red-500 text-xs mt-1">{errors.dateLbl}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Cohort End Date</label>
              <DateField
                value={data.endDateLbl}
                onChange={value => setField('endDateLbl', value)}
                placeholder="Choose cohort end date"
                error={errors.endDateLbl}
                accentColor={data.color || selectedGroup?.color || '#1B2A4A'}
              />
              {errors.endDateLbl && <p className="text-red-500 text-xs mt-1">{errors.endDateLbl}</p>}
            </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Cohort Colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={data.color}
                onChange={e => setField('color', e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
              />
              <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: data.color }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: contrastColor(data.color) }} />
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: contrastColor(data.color) }}>
                    Preview
                  </p>
                  <p className="text-xs font-bold truncate" style={{ color: contrastColor(data.color) }}>
                    {data.label.trim() || 'New Cohort'}
                  </p>
                </div>
                <span className="ml-auto text-[11px] font-semibold uppercase" style={{ color: contrastColor(data.color) }}>
                  {data.color}
                </span>
              </div>
            </div>
          </div>

          {/* Holiday selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Linked Holidays (optional)</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{data.holidayIds.length} selected</span>
                {onManageHolidays && (
                  <button
                    type="button"
                    onClick={onManageHolidays}
                    className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all"
                    style={{ borderColor: '#F7A800', background: '#FFF8E0', color: '#C49A00' }}
                  >
                    Manage Holidays
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-36 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
              {holidays.length === 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">No holidays saved yet</p>
                    <p className="text-xs text-gray-400 mt-1">Add a holiday first, then it will appear here immediately.</p>
                  </div>
                  {onManageHolidays && (
                    <button
                      type="button"
                      onClick={onManageHolidays}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer transition-all"
                      style={{ background: '#1B2A4A' }}
                    >
                      Add Holiday
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {hasDateRange ? (
                    <p className="text-xs text-gray-400">
                      {holidaysInRange.length} holiday{holidaysInRange.length === 1 ? '' : 's'} overlap the current date range
                      {hasModuleDateRange ? '.' : hasProgrammeDateRange ? ' using the programme dates until module dates are set.' : '.'}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">
                      Showing all saved holidays. You can link any of them even before setting programme or module dates.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {holidays.map(holiday => {
                      const selected = data.holidayIds.includes(holiday.id);
                      const inRange = holidaysInRangeIds.has(holiday.id);
                      return (
                        <button
                          key={holiday.id}
                          type="button"
                          onClick={() => toggleHoliday(holiday.id)}
                          className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all"
                          style={{
                            borderColor: selected ? '#1B2A4A' : '#D1D5DB',
                            background: selected ? '#E8EEF9' : inRange ? '#F8FAFF' : '#fff',
                            color: selected ? '#1B2A4A' : inRange ? '#3D5A99' : '#6B7280',
                          }}
                          title={`${holiday.label} (${formatDate(holiday.startDate)} - ${formatDate(holiday.endDate)})`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {holiday.label}
                            {hasDateRange && inRange && <span className="text-[10px] font-extrabold uppercase">In Range</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Module Blocks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Module Blocks
                </label>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {data.blks.length} modules
                </span>
              </div>
              <button onClick={addBlk}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                style={{ background: '#1B2A4A', color: '#fff' }}>
                <i className="ri-add-line" /> Add Module
              </button>
            </div>
            {errors.blks && <p className="text-red-500 text-xs mb-2">{errors.blks}</p>}

            <div className="space-y-2">
              {data.blks.map((blk, bi) => {
                const modInfo = resolveBlockVisualMeta(blk, customModules);
                const isExpanded = expandedBlk === blk.id;
                const blockRange = getBlockRange(blk);
                const totalSessions = getBlockSessionCount(blk);
                const firstTutor = blk.groups[0]?.tutor || '';
                const hasError = Object.keys(errors).some(key => key.includes(`${bi}_`) || key === `blk_groups_${bi}`);

                return (
                  <div key={blk.id} className="rounded-lg border overflow-hidden"
                    style={{ borderColor: hasError ? '#EF4444' : '#E5E7EB' }}>
                    {/* Block header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedBlk(isExpanded ? null : blk.id)}
                    >
                      <span className="shrink-0 w-3 h-6 rounded-sm" style={{ background: modInfo.bg }} />
                      <span className="font-bold text-sm text-gray-800 flex-1">{modInfo.lbl}</span>
                      <span className="text-xs text-gray-500 hidden md:block">
                        {blk.groups.length} group{blk.groups.length === 1 ? '' : 's'}
                      </span>
                      {firstTutor && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <i className="ri-user-line" />
                          {firstTutor}{blk.groups.length > 1 ? ' +' : ''}
                        </span>
                      )}
                      {blockRange && (
                        <span className="text-xs text-gray-400 hidden sm:block">
                          {formatDate(blockRange.start)} {'->'} {formatDate(blockRange.end)}
                        </span>
                      )}
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${modInfo.bg}18`, color: modInfo.bg }}>
                        {totalSessions} sessions
                      </span>
                      <button onClick={e => { e.stopPropagation(); void confirmRemoveBlk(blk.id); }}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-all">
                        <i className="ri-delete-bin-line text-xs" />
                      </button>
                      {isExpanded ? <i className="ri-arrow-up-s-line text-gray-400 text-sm" /> : <i className="ri-arrow-down-s-line text-gray-400 text-sm" />}
                    </div>

                    {/* Expanded fields */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50 space-y-3">
                        {/* Module name */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module</label>
                          <input
                            type="text"
                            placeholder="e.g. PMP"
                            value={getModuleInputValue(blk.mod)}
                            onChange={e => {
                              const nextValue = e.target.value;
                              const resolvedValue = resolveModuleValue(nextValue, customModules);
                              updateBlk(blk.id, 'mod', resolvedValue);
                              const cm = customModules.find(c => c.name.toLowerCase() === nextValue.trim().toLowerCase());
                              if (cm) {
                                updateBlk(blk.id, 'sessions', cm.defaultSessions);
                              }
                            }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module Colour</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={blk.color || modInfo.bg}
                              onChange={e => updateBlk(blk.id, 'color', e.target.value)}
                              className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                            />
                            <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: modInfo.bg }}>
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: modInfo.tx }} />
                              <div className="min-w-0">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: modInfo.tx }}>
                                  Preview
                                </p>
                                <p className="text-xs font-bold truncate" style={{ color: modInfo.tx }}>
                                  {modInfo.lbl}
                                </p>
                              </div>
                              {blk.color && (
                                <button
                                  type="button"
                                  onClick={() => updateBlk(blk.id, 'color', '')}
                                  className="ml-auto rounded-md px-2 py-1 text-[11px] font-bold cursor-pointer transition-all"
                                  style={{ background: `${modInfo.tx}22`, color: modInfo.tx }}
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module Start Date</label>
                            <DateField
                              value={blk.startDate}
                              onChange={value => updateBlk(blk.id, 'startDate', value)}
                              placeholder="Choose start date"
                              error={errors[`blk_start_${bi}`]}
                              accentColor={modInfo.bg}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module End Date</label>
                            <DateField
                              value={blk.endDate}
                              onChange={value => updateBlk(blk.id, 'endDate', value)}
                              placeholder="Choose end date"
                              error={errors[`blk_end_${bi}`]}
                              accentColor={modInfo.bg}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Number of Sessions</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={blk.sessions}
                              onChange={e => updateBlk(blk.id, 'sessions', Math.max(1, Number(e.target.value) || 1))}
                              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none"
                            />
                            <span className="text-xs text-gray-400">sessions total</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Groups</label>
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                                style={{ background: `${modInfo.bg}12`, color: modInfo.bg }}
                              >
                                {blk.groups.length} total
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Each group can have its own tutor, week days, session times, and notes.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addBlkGroup(blk.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer transition-all hover:opacity-90"
                            style={{ background: modInfo.bg }}
                          >
                            <i className="ri-add-line" />
                            Add Group
                          </button>
                        </div>
                        {errors[`blk_groups_${bi}`] && <p className="text-red-500 text-xs">{errors[`blk_groups_${bi}`]}</p>}

                        <div className="space-y-3">
                          {blk.groups.map((group, gi) => {
                            const errorKey = `${bi}_${gi}`;
                            const groupAccent = group.color || modInfo.bg;
                            return (
                              <div key={group.id} className="rounded-xl border bg-white p-4 space-y-3" style={{ borderColor: '#E5E7EB' }}>
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: groupAccent }}>Group {gi + 1}</p>
                                    <p className="text-xs text-gray-400 mt-1">{group.tutor || 'Tutor not set'}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => { void confirmRemoveBlkGroup(blk.id, group.id); }}
                                    disabled={blk.groups.length === 1}
                                    className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <i className="ri-delete-bin-line text-sm" />
                                  </button>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Group Colour</label>
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="color"
                                      value={group.color || groupAccent}
                                      onChange={e => updateBlkGroup(blk.id, group.id, 'color', e.target.value)}
                                      className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                                    />
                                    <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: `${groupAccent}18` }}>
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: groupAccent }} />
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: groupAccent }}>Preview</p>
                                        <p className="text-xs font-bold truncate" style={{ color: groupAccent }}>
                                          {group.tutor || `Group ${gi + 1}`}
                                        </p>
                                      </div>
                                      {group.color && (
                                        <button
                                          type="button"
                                          onClick={() => updateBlkGroup(blk.id, group.id, 'color', '')}
                                          className="ml-auto rounded-md px-2 py-1 text-[11px] font-bold cursor-pointer transition-all"
                                          style={{ background: '#fff', color: groupAccent }}
                                        >
                                          Reset
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tutor / Lecturer</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Dr. Andrew Marsh"
                                    value={group.tutor}
                                    onChange={e => updateBlkGroup(blk.id, group.id, 'tutor', e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Week Days</label>
                                  <div className="flex flex-wrap gap-2">
                                    {WEEK_DAYS.map(day => {
                                      const selected = group.days.includes(day.key);
                                      return (
                                        <button
                                          key={day.key}
                                          type="button"
                                          onClick={() => toggleBlkDay(blk.id, group.id, day.key)}
                                          className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all"
                                          style={{
                                            borderColor: selected ? groupAccent : '#D1D5DB',
                                            background: selected ? `${groupAccent}18` : '#fff',
                                            color: selected ? groupAccent : '#6B7280',
                                          }}
                                        >
                                          {day.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {errors[`blk_days_${errorKey}`] && <p className="text-red-500 text-xs mt-1">{errors[`blk_days_${errorKey}`]}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session Start Time</label>
                                    <ModernTimeField
                                      value={group.sessionStartTime}
                                      onChange={nextValue => updateBlkGroup(blk.id, group.id, 'sessionStartTime', nextValue)}
                                      error={errors[`blk_time_start_${errorKey}`]}
                                      accentColor={groupAccent}
                                    />
                                    {errors[`blk_time_start_${errorKey}`] && <p className="text-red-500 text-xs mt-1">{errors[`blk_time_start_${errorKey}`]}</p>}
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session End Time</label>
                                    <ModernTimeField
                                      value={group.sessionEndTime}
                                      onChange={nextValue => updateBlkGroup(blk.id, group.id, 'sessionEndTime', nextValue)}
                                      error={errors[`blk_time_end_${errorKey}`]}
                                      accentColor={groupAccent}
                                    />
                                    {errors[`blk_time_end_${errorKey}`] && <p className="text-red-500 text-xs mt-1">{errors[`blk_time_end_${errorKey}`]}</p>}
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes (optional)</label>
                                  <textarea
                                    value={group.notes}
                                    onChange={e => updateBlkGroup(blk.id, group.id, 'notes', e.target.value)}
                                    placeholder="Any additional notes..."
                                    rows={2}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {data.blks.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
                  No module blocks yet — click "Add Module" above
                </div>
              )}
            </div>
          </div>
        </div>

        {moduleDraft && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4">
            <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
                <div>
                  <h3 className="text-white font-extrabold text-sm tracking-wide">Add Module</h3>
                  <p className="text-white/60 text-xs mt-0.5">Create the module first, then save it into the cohort.</p>
                </div>
                <button onClick={() => setModuleDraft(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-gray-50">
                {(() => {
                  const draftModInfo = resolveBlockVisualMeta(moduleDraft, customModules);
                  const draftGroup = moduleDraft.groups[0];
                  const draftGroupAccent = draftGroup?.color || draftModInfo.bg;
                  return (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module</label>
                        <input
                          type="text"
                          placeholder="e.g. PMP"
                          value={getModuleInputValue(moduleDraft.mod)}
                          onChange={e => {
                            const nextValue = e.target.value;
                            const resolvedValue = resolveModuleValue(nextValue, customModules);
                            updateModuleDraft('mod', resolvedValue);
                            const cm = customModules.find(c => c.name.toLowerCase() === nextValue.trim().toLowerCase());
                            if (cm) {
                              updateModuleDraft('sessions', cm.defaultSessions);
                            }
                          }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module Colour</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={moduleDraft.color || draftModInfo.bg}
                            onChange={e => updateModuleDraft('color', e.target.value)}
                            className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                          />
                          <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: draftModInfo.bg }}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: draftModInfo.tx }} />
                            <div className="min-w-0">
                              <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: draftModInfo.tx }}>Preview</p>
                              <p className="text-xs font-bold truncate" style={{ color: draftModInfo.tx }}>{draftModInfo.lbl}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module Start Date</label>
                          <DateField
                            value={moduleDraft.startDate}
                            onChange={value => updateModuleDraft('startDate', value)}
                            placeholder="Choose start date"
                            accentColor={draftModInfo.bg}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module End Date</label>
                          <DateField
                            value={moduleDraft.endDate}
                            onChange={value => updateModuleDraft('endDate', value)}
                            placeholder="Choose end date"
                            accentColor={draftModInfo.bg}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Number of Sessions</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={moduleDraft.sessions}
                            onChange={e => updateModuleDraft('sessions', Math.max(1, Number(e.target.value) || 1))}
                            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none bg-white"
                          />
                          <span className="text-xs text-gray-400">sessions total</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: draftGroupAccent }}>First Group</p>
                          <p className="text-xs text-gray-400 mt-1">Set the first group details for this module.</p>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Group Colour</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={draftGroup?.color || draftGroupAccent}
                              onChange={e => updateModuleDraftGroup('color', e.target.value)}
                              className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                            />
                            <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: `${draftGroupAccent}18` }}>
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: draftGroupAccent }} />
                              <div className="min-w-0">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: draftGroupAccent }}>Preview</p>
                                <p className="text-xs font-bold truncate" style={{ color: draftGroupAccent }}>
                                  {draftGroup?.tutor || 'First Group'}
                                </p>
                              </div>
                              {draftGroup?.color && (
                                <button
                                  type="button"
                                  onClick={() => updateModuleDraftGroup('color', '')}
                                  className="ml-auto rounded-md px-2 py-1 text-[11px] font-bold cursor-pointer transition-all"
                                  style={{ background: '#fff', color: draftGroupAccent }}
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tutor / Lecturer</label>
                          <input
                            type="text"
                            placeholder="e.g. Dr. Andrew Marsh"
                            value={draftGroup?.tutor || ''}
                            onChange={e => updateModuleDraftGroup('tutor', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Week Days</label>
                          <div className="flex flex-wrap gap-2">
                            {WEEK_DAYS.map(day => {
                              const selected = draftGroup?.days.includes(day.key);
                              return (
                                <button
                                  key={day.key}
                                  type="button"
                                  onClick={() => toggleModuleDraftDay(day.key)}
                                  className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all"
                                  style={{
                                    borderColor: selected ? draftGroupAccent : '#D1D5DB',
                                    background: selected ? `${draftGroupAccent}18` : '#fff',
                                    color: selected ? draftGroupAccent : '#6B7280',
                                  }}
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session Start Time</label>
                            <ModernTimeField
                              value={draftGroup?.sessionStartTime || '09:00'}
                              onChange={nextValue => updateModuleDraftGroup('sessionStartTime', nextValue)}
                              accentColor={draftGroupAccent}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session End Time</label>
                            <ModernTimeField
                              value={draftGroup?.sessionEndTime || '11:00'}
                              onChange={nextValue => updateModuleDraftGroup('sessionEndTime', nextValue)}
                              accentColor={draftGroupAccent}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes (optional)</label>
                          <textarea
                            value={draftGroup?.notes || ''}
                            onChange={e => updateModuleDraftGroup('notes', e.target.value)}
                            placeholder="Any additional notes..."
                            rows={2}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                          />
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-white">
                <button onClick={() => setModuleDraft(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
                  Cancel
                </button>
                <button onClick={saveModuleDraft} className="px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all" style={{ background: '#1B2A4A' }}>
                  Save Module
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {groupDraft && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
                <div>
                  <h3 className="text-white font-extrabold text-sm tracking-wide">Add Group</h3>
                  <p className="text-white/60 text-xs mt-0.5">Create a new group for this module.</p>
                </div>
                <button onClick={() => setGroupDraft(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>
              <div className="px-5 py-5 space-y-4 bg-gray-50">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Group Colour</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={groupDraft.group.color || '#1B2A4A'}
                      onChange={e => updateGroupDraft('color', e.target.value)}
                      className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                    />
                    <div className="flex-1 rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: `${(groupDraft.group.color || '#1B2A4A')}18` }}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: groupDraft.group.color || '#1B2A4A' }} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: groupDraft.group.color || '#1B2A4A' }}>Preview</p>
                        <p className="text-xs font-bold truncate" style={{ color: groupDraft.group.color || '#1B2A4A' }}>
                          {groupDraft.group.tutor || 'New Group'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tutor / Lecturer</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Andrew Marsh"
                    value={groupDraft.group.tutor}
                    onChange={e => updateGroupDraft('tutor', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Week Days</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map(day => {
                      const selected = groupDraft.group.days.includes(day.key);
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => toggleGroupDraftDay(day.key)}
                          className="px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer transition-all"
                          style={{
                            borderColor: selected ? (groupDraft.group.color || '#1B2A4A') : '#D1D5DB',
                            background: selected ? `${(groupDraft.group.color || '#1B2A4A')}18` : '#fff',
                            color: selected ? (groupDraft.group.color || '#1B2A4A') : '#6B7280',
                          }}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session Start Time</label>
                    <ModernTimeField
                      value={groupDraft.group.sessionStartTime}
                      onChange={nextValue => updateGroupDraft('sessionStartTime', nextValue)}
                      accentColor={groupDraft.group.color || '#1B2A4A'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Session End Time</label>
                    <ModernTimeField
                      value={groupDraft.group.sessionEndTime}
                      onChange={nextValue => updateGroupDraft('sessionEndTime', nextValue)}
                      accentColor={groupDraft.group.color || '#1B2A4A'}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes (optional)</label>
                  <textarea
                    value={groupDraft.group.notes}
                    onChange={e => updateGroupDraft('notes', e.target.value)}
                    placeholder="Any additional notes..."
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none bg-white"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-white">
                <button onClick={() => setGroupDraft(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">
                  Cancel
                </button>
                <button onClick={saveGroupDraft} className="px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all" style={{ background: '#1B2A4A' }}>
                  Save Group
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            Cancel
          </button>
          <button onClick={() => void handleSave()}
            disabled={isSaving}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: data.color || selectedGroup?.color || '#1B2A4A' }}>
            {isSaving ? 'Saving...' : mode === 'add' ? 'Add Cohort' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
