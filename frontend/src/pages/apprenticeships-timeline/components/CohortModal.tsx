import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogModule, CohortRow, CustomModule, Holiday, KsbProfile, ModuleBlock, ModuleValue, ProgrammeGroup, SessionCoverage, SessionKsbMapping, TutorProfile, WeekDayKey } from '../types';
import { MS, getModuleMeta } from '../data';
import { formatDate } from '../utils';
import DateField from './DateField';
import ModernTimeField from './ModernTimeField';
import SelectField from './SelectField';
import { kbcSwal } from '@/components/feature/sweetAlert';
import { normalizeTutorName, profileIdForTutorName } from '../tutorProfiles';

interface Props {
  mode: 'add' | 'edit';
  groups: ProgrammeGroup[];
  holidays: Holiday[];
  customModules?: CustomModule[];
  catalogModules?: CatalogModule[];
  ksbProfiles?: KsbProfile[];
  tutorProfiles?: TutorProfile[];
  initialGroupIdx?: number;
  initialRow?: CohortRow;
  initialExpandedBlockId?: string;
  prefillTutorProfileId?: string;
  prefillModule?: ModuleValue;
  lockGroupSelection?: boolean;
  onSave: (groupIdx: number, row: CohortRow, prevGroupIdx?: number) => boolean | Promise<boolean>;
  onManageHolidays?: () => void;
  onCreateTutorProfile?: (payload: { name: string; email?: string; notes?: string; confirmCreateNew?: boolean }) => Promise<TutorProfile | { existingProfile?: TutorProfile; possibleExistingProfile?: TutorProfile; detail?: string; score?: number }>;
  onBackToPreviousStep?: () => void;
  onClose: () => void;
}

interface FormModule {
  id: string;
  mod: ModuleValue;
  color: string;
  startDate: string;
  endDate: string;
  sessions: number;
  sessionKsbMappings: SessionKsbMapping[];
  sessionCoverage: SessionCoverage[];
  notes: string;
  tutor: string;
  tutorProfileId: string;
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
  durationMonths: number;
  intake: string;
  quarter: string;
  color: string;
  holidayIds: string[];
  ksbProfileId: string;
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

const WEEKDAY_KEY_TO_JS: Record<WeekDayKey, number> = {
  monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function serializeDraftState(data: FormData, groupDraft: GroupDraftState | null, moduleDraft: ModuleDraftState | null): string {
  return JSON.stringify({ data, groupDraft, moduleDraft });
}

function emptySessionKsbMapping(): SessionKsbMapping {
  return { knowledgeCodes: [], skillCodes: [], behaviourCodes: [] };
}

function normalizeKsbCodes(value: unknown, prefix: 'K' | 'S' | 'B'): string[] {
  if (!Array.isArray(value)) return [];
  const pattern = new RegExp(`^${prefix}\\d+$`, 'i');
  const seen = new Set<string>();
  return value.reduce<string[]>((codes, item) => {
    const code = String(item || '').trim().toUpperCase();
    if (!code || seen.has(code) || !pattern.test(code)) return codes;
    seen.add(code);
    codes.push(code);
    return codes;
  }, []);
}

function normalizeSessionKsbMappings(value: unknown, count = 0): SessionKsbMapping[] {
  const raw = Array.isArray(value) ? value : [];
  const length = Math.max(count, raw.length);
  return Array.from({ length }, (_, index) => {
    const item = raw[index];
    const record = item && typeof item === 'object' ? item as Partial<SessionKsbMapping> : {};
    return {
      knowledgeCodes: normalizeKsbCodes(record.knowledgeCodes, 'K'),
      skillCodes: normalizeKsbCodes(record.skillCodes, 'S'),
      behaviourCodes: normalizeKsbCodes(record.behaviourCodes, 'B'),
    };
  });
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

function addMonthsToIsoDate(value: string, months: number): string {
  if (!isIsoDate(value)) {
    return '';
  }
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1 + months, day);
  if (result.getMonth() !== (month - 1 + months) % 12) {
    result.setDate(0);
  }
  return `${result.getFullYear()}-${`${result.getMonth() + 1}`.padStart(2, '0')}-${`${result.getDate()}`.padStart(2, '0')}`;
}

function latestModuleEndDate(groups: FormGroup[]): string {
  let latest = '';
  groups.forEach(g => g.modules.forEach(m => {
    if (m.endDate && m.endDate > latest) latest = m.endDate;
  }));
  return latest;
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

// Snap a date backward to the nearest occurrence of any of the given weekdays.
function snapToWeekday(isoDate: string, days: WeekDayKey[]): string {
  if (!days.length) return isoDate;
  const targetDays = new Set(days.map(d => WEEKDAY_KEY_TO_JS[d]));
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  // Walk back up to 6 days to find the nearest matching weekday
  for (let offset = 0; offset <= 6; offset++) {
    if (targetDays.has(d.getDay())) {
      return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    }
    d.setDate(d.getDate() - 1);
  }
  return isoDate;
}

function calculateModuleEndDate(startDate: string, sessions: number, holidays: Holiday[] = [], days: WeekDayKey[] = []): string {
  if (!isIsoDate(startDate)) {
    return '';
  }

  const safeSessions = Math.max(1, Number(sessions) || 1);

  // Build a set of holiday dates for O(1) lookup
  const holidaySet = new Set<string>();
  holidays.forEach(h => {
    if (isIsoDate(h.startDate) && isIsoDate(h.endDate) && h.endDate >= h.startDate) {
      enumerateIsoDates(h.startDate, h.endDate).forEach(d => holidaySet.add(d));
    }
  });

  // If session weekdays are specified, walk forward counting only those days
  // (skipping holidays). Otherwise fall back to weekly intervals.
  if (days.length > 0) {
    const sessionDayNums = new Set(days.map(d => WEEKDAY_KEY_TO_JS[d]));
    let count = 0;
    let cursor = startDate;
    let lastSessionDate = startDate;

    // Safety cap: never iterate more than 5 years of days
    const limit = safeSessions * 7 * 3 + 365;
    for (let i = 0; i < limit; i++) {
      const [y, m, day] = cursor.split('-').map(Number);
      const jsDay = new Date(y, m - 1, day).getDay();
      if (sessionDayNums.has(jsDay) && !holidaySet.has(cursor)) {
        count++;
        lastSessionDate = cursor;
        if (count >= safeSessions) {
          return lastSessionDate;
        }
      }
      cursor = addDaysToIsoDate(cursor, 1);
    }
    return lastSessionDate;
  }

  // No specific weekdays — keep the original weekly-interval approach but
  // only skip holidays that fall on the implied session day (same weekday as startDate).
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const sessionWeekday = new Date(sy, sm - 1, sd).getDay();
  let count = 0;
  let cursor = startDate;
  const limit = safeSessions * 7 * 3 + 365;
  for (let i = 0; i < limit; i += 7) {
    if (!holidaySet.has(cursor)) {
      count++;
      if (count >= safeSessions) return cursor;
    }
    cursor = addDaysToIsoDate(startDate, (i + 7));
    // Keep cursor on the correct weekday (addDaysToIsoDate is exact multiples of 7 so it stays)
    void sessionWeekday;
  }
  return addDaysToIsoDate(startDate, safeSessions * 7);
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
    sessionKsbMappings: [emptySessionKsbMapping()],
    sessionCoverage: [],
    notes: '',
    tutor: '',
    tutorProfileId: '',
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

const resolveModuleMeta = (moduleValue: ModuleValue, customModules: CustomModule[], catalogModules: CatalogModule[] = []) => {
  const normalizedModuleValue = resolveModuleValue(getModuleInputValue(moduleValue), customModules);
  const standardMeta = normalizedModuleValue in MS ? getModuleMeta(normalizedModuleValue) : null;
  const customMeta = customModules.find(c => c.id === normalizedModuleValue || c.name === normalizedModuleValue);
  const catalogMeta = catalogModules.find(c => c.name === normalizedModuleValue || c.name === moduleValue);
  if (standardMeta) return standardMeta;
  if (customMeta) return { lbl: customMeta.name, bg: customMeta.bg, tx: customMeta.tx };
  if (catalogMeta) return { lbl: catalogMeta.name, bg: catalogMeta.colour || '#4A6DB0', tx: contrastColor(catalogMeta.colour || '#4A6DB0') };
  return getModuleMeta(moduleValue);
};

const normalizeModuleLookup = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const resolveCatalogModuleForValue = (moduleValue: ModuleValue, catalogModules: CatalogModule[] = []) => {
  const rawValue = typeof moduleValue === 'string' ? moduleValue : '';
  const displayValue = getModuleInputValue(moduleValue);
  const normalizedRaw = normalizeModuleLookup(rawValue);
  const normalizedDisplay = normalizeModuleLookup(displayValue);

  return catalogModules.find(module => {
    const normalizedName = normalizeModuleLookup(module.name);
    return (
      String(module.id) === rawValue ||
      normalizedName === normalizedRaw ||
      normalizedName === normalizedDisplay
    );
  });
};

const resolveModuleVisualMeta = (moduleItem: FormModule, customModules: CustomModule[], catalogModules: CatalogModule[] = []) => {
  const baseMeta = resolveModuleMeta(moduleItem.mod, customModules, catalogModules);
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

function KsbSummaryBadges({ mappings }: { mappings: SessionKsbMapping[] }) {
  const codes = Array.from(new Set(mappings.flatMap(mapping => [
    ...mapping.knowledgeCodes,
    ...mapping.skillCodes,
    ...mapping.behaviourCodes,
  ])));
  if (!codes.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" title="Planned KSB mapping for this module. This does not mean the KSBs have been achieved yet.">
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
        Planned KSBs
      </span>
      {codes.slice(0, 8).map((code, index) => (
        <span key={`${code}-${index}`} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-slate-600">
          {code}
        </span>
      ))}
      {codes.length > 8 && <span className="text-[10px] font-bold text-gray-400">+{codes.length - 8}</span>}
    </div>
  );
}

function KsbCodeInput({
  label,
  placeholder,
  prefix,
  value,
  codeDescriptions = {},
  onChange,
}: {
  label: string;
  placeholder: string;
  prefix: 'K' | 'S' | 'B';
  value: string[];
  codeDescriptions?: Record<string, string>;
  onChange: (codes: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const tone = prefix === 'K'
    ? {
        label: 'bg-sky-600 text-white',
        border: 'border-sky-200 focus-within:border-sky-400',
        chip: 'border-sky-200 bg-sky-50 text-sky-800',
      }
    : prefix === 'S'
      ? {
          label: 'bg-emerald-600 text-white',
          border: 'border-emerald-200 focus-within:border-emerald-400',
          chip: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        }
      : {
          label: 'bg-amber-500 text-white',
          border: 'border-amber-200 focus-within:border-amber-400',
          chip: 'border-amber-200 bg-amber-50 text-amber-800',
        };
  const addDraftCodes = () => {
    const parts = draft.split(/[,\s]+/).map(item => item.trim()).filter(Boolean);
    if (!parts.length) {
      setDraft('');
      setError('');
      return;
    }
    const valid = normalizeKsbCodes(parts, prefix);
    const invalid = parts.some(part => !new RegExp(`^${prefix}\\d+$`, 'i').test(part));
    onChange(normalizeKsbCodes([...value, ...valid], prefix));
    setDraft('');
    setError(invalid ? `${prefix} codes need ${prefix} followed by a number.` : '');
  };

  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        <span className={`flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-extrabold leading-none ${tone.label}`}>
          {prefix}
        </span>
        <span>{label}</span>
      </label>
      <div className={`min-h-10 rounded-lg border bg-white px-2 py-1.5 transition-colors ${tone.border}`}>
        <div className="flex flex-wrap items-center gap-1">
          {value.map(code => (
            <span key={code} title={codeDescriptions[code] || code} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-extrabold leading-none ${tone.chip}`}>
              {code}
              <button type="button" aria-label={`Remove ${code}`} onClick={() => onChange(value.filter(item => item !== code))} className="text-current opacity-45 hover:opacity-100">
                <i className="ri-close-line text-[10px]" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={draft}
            onChange={e => {
              setDraft(e.target.value.toUpperCase());
              if (error) setError('');
            }}
            onBlur={addDraftCodes}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addDraftCodes();
              }
            }}
            placeholder={value.length ? `Add ${prefix}...` : placeholder}
            className="min-w-20 flex-1 bg-transparent px-1 py-0.5 text-xs font-semibold text-gray-700 placeholder:text-gray-300 focus:outline-none"
          />
        </div>
      </div>
      {value.some(code => codeDescriptions[code]) && (
        <div className="mt-1 space-y-0.5">
          {value.filter(code => codeDescriptions[code]).map(code => (
            <p key={code} className="line-clamp-2 text-[10px] font-medium text-gray-400">
              <span className="font-extrabold text-gray-500">{code}</span> {codeDescriptions[code]}
            </p>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-[10px] font-semibold text-red-500">{error}</p>}
    </div>
  );
}

function KsbProfilePicker({
  mapping,
  codeDescriptions = {},
  profileCodes,
  onAddCode,
}: {
  mapping: SessionKsbMapping;
  codeDescriptions?: Record<string, string>;
  profileCodes?: Record<'K' | 'S' | 'B', KsbProfileCodeOption[]>;
  onAddCode: (field: KsbCodeField, code: string) => void;
}) {
  const sections = [
    { title: 'Knowledge', prefix: 'K' as const, field: 'knowledgeCodes' as const, selected: mapping.knowledgeCodes, codes: profileCodes?.K || [], tone: 'border-sky-200 bg-sky-50 text-sky-800' },
    { title: 'Skills', prefix: 'S' as const, field: 'skillCodes' as const, selected: mapping.skillCodes, codes: profileCodes?.S || [], tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    { title: 'Behaviours', prefix: 'B' as const, field: 'behaviourCodes' as const, selected: mapping.behaviourCodes, codes: profileCodes?.B || [], tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  ];

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 md:grid-cols-3">
        {sections.map(section => {
          const available = section.codes.filter(option => !section.selected.includes(option.code));
          return (
            <div key={section.prefix} className="rounded-lg bg-white p-2">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{section.title}</p>
              {available.length ? (
                <div className="flex flex-wrap gap-1">
                  {available.map(option => (
                    <button
                      key={`${option.profileName}-${option.code}`}
                      type="button"
                      title={`${option.profileName}${codeDescriptions[option.code] ? ` - ${codeDescriptions[option.code]}` : ''}`}
                      onClick={() => onAddCode(section.field, option.code)}
                      className={`flex max-w-full flex-col items-start rounded-md border px-2 py-1 text-left transition-all hover:shadow-sm ${section.tone}`}
                    >
                      <span className="text-[10px] font-extrabold leading-none">+ {option.code}</span>
                      <span className="mt-0.5 max-w-[8rem] truncate text-[9px] font-bold opacity-65">{option.profileName}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] font-semibold text-gray-300">
                  {section.codes.length ? 'All profile codes added' : 'No profile codes'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type KsbCodeField = 'knowledgeCodes' | 'skillCodes' | 'behaviourCodes';
type KsbProfileCodeOption = { code: string; profileName: string };

function KsbSessionMappingRows({
  sessionCount,
  mappings,
  sessionNames,
  accentColor,
  codeDescriptions,
  profileCodes,
  onChange,
}: {
  sessionCount: number;
  mappings: SessionKsbMapping[];
  sessionNames?: string[];
  accentColor: string;
  codeDescriptions?: Record<string, string>;
  profileCodes?: Record<'K' | 'S' | 'B', KsbProfileCodeOption[]>;
  onChange: (sessionIndex: number, field: KsbCodeField, codes: string[]) => void;
}) {
  const normalizedMappings = normalizeSessionKsbMappings(mappings, sessionCount);
  const [openPickerIndex, setOpenPickerIndex] = useState<number | null>(null);
  const sourceProfileNames = Array.from(new Set(
    (['K', 'S', 'B'] as const).flatMap(prefix => (profileCodes?.[prefix] || []).map(option => option.profileName)),
  ));
  const sourceLabel = sourceProfileNames.length === 1
    ? sourceProfileNames[0]
    : sourceProfileNames.length > 1
      ? `${sourceProfileNames.length} profiles`
      : '';

  return (
    <div className="space-y-2">
      {Array.from({ length: sessionCount }, (_, i) => {
        const mapping = normalizedMappings[i] || emptySessionKsbMapping();
        const sessionLabel = sessionNames?.[i]?.trim() || `Session ${i + 1}`;
        const availableProfileCodeCount = (['K', 'S', 'B'] as const).reduce((total, prefix) => {
          const field = prefix === 'K' ? 'knowledgeCodes' : prefix === 'S' ? 'skillCodes' : 'behaviourCodes';
          return total + (profileCodes?.[prefix] || []).filter(option => !mapping[field].includes(option.code)).length;
        }, 0);
        const hasProfileCodes = (['K', 'S', 'B'] as const).some(prefix => (profileCodes?.[prefix] || []).length > 0);

        return (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: `${accentColor}16`, color: accentColor }}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-gray-800">{sessionLabel}</span>
              <span className="hidden text-[10px] font-bold uppercase tracking-wider text-gray-300 sm:inline">KSB codes</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {sourceLabel && (
                  <span className="max-w-40 truncate rounded-full bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-500">
                    Source: {sourceLabel}
                  </span>
                )}
                {availableProfileCodeCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setOpenPickerIndex(openPickerIndex === i ? null : i)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-gray-500 transition-all hover:border-gray-300 hover:bg-gray-50"
                  >
                    <i className="ri-add-circle-line" />
                    Add from profile
                  </button>
                ) : (
                  <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-extrabold text-gray-300">
                    {hasProfileCodes ? 'Profile codes already added' : 'No profile codes'}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <KsbCodeInput
                label="Knowledge"
                placeholder="K1, K3"
                prefix="K"
                value={mapping.knowledgeCodes}
                codeDescriptions={codeDescriptions}
                onChange={codes => onChange(i, 'knowledgeCodes', codes)}
              />
              <KsbCodeInput
                label="Skills"
                placeholder="S2, S5"
                prefix="S"
                value={mapping.skillCodes}
                codeDescriptions={codeDescriptions}
                onChange={codes => onChange(i, 'skillCodes', codes)}
              />
              <KsbCodeInput
                label="Behaviours"
                placeholder="B1, B4"
                prefix="B"
                value={mapping.behaviourCodes}
                codeDescriptions={codeDescriptions}
                onChange={codes => onChange(i, 'behaviourCodes', codes)}
              />
            </div>
            {openPickerIndex === i && availableProfileCodeCount > 0 && (
              <KsbProfilePicker
                mapping={mapping}
                codeDescriptions={codeDescriptions}
                profileCodes={profileCodes}
                onAddCode={(field, code) => onChange(i, field, normalizeKsbCodes([...(mapping[field] || []), code], field === 'knowledgeCodes' ? 'K' : field === 'skillCodes' ? 'S' : 'B'))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function hasKsbCodes(mappings: SessionKsbMapping[] | undefined): boolean {
  return Boolean(mappings?.some(mapping =>
    mapping.knowledgeCodes.length > 0 ||
    mapping.skillCodes.length > 0 ||
    mapping.behaviourCodes.length > 0,
  ));
}

function asKsbProfileList(profileOrProfiles: KsbProfile | KsbProfile[] | undefined): KsbProfile[] {
  if (!profileOrProfiles) return [];
  return Array.isArray(profileOrProfiles) ? profileOrProfiles : [profileOrProfiles];
}

function buildKsbDescriptionLookup(profileOrProfiles: KsbProfile | KsbProfile[] | undefined): Record<string, string> {
  const lookup: Record<string, string> = {};
  asKsbProfileList(profileOrProfiles).forEach(profile => {
    (profile.ksbItems || []).forEach(item => {
      const code = item.code || `${item.type}${item.number}`;
      if (code && item.description && !lookup[code.toUpperCase()]) {
        lookup[code.toUpperCase()] = item.description;
      }
    });
  });
  return lookup;
}

function buildKsbProfileCodeOptions(profileOrProfiles: KsbProfile | KsbProfile[] | undefined): Record<'K' | 'S' | 'B', KsbProfileCodeOption[]> {
  const profiles = asKsbProfileList(profileOrProfiles);
  const buckets: Record<'K' | 'S' | 'B', KsbProfileCodeOption[]> = { K: [], S: [], B: [] };
  const seen: Record<'K' | 'S' | 'B', Set<string>> = { K: new Set(), S: new Set(), B: new Set() };

  profiles.forEach(profile => {
    (['K', 'S', 'B'] as const).forEach(prefix => {
      const codes = prefix === 'K' ? profile.knowledgeCodes : prefix === 'S' ? profile.skillCodes : profile.behaviourCodes;
      (codes || []).forEach(rawCode => {
        const code = String(rawCode || '').trim().toUpperCase();
        const key = `${code}|${profile.name}`;
        if (!code || seen[prefix].has(key)) return;
        seen[prefix].add(key);
        buckets[prefix].push({ code, profileName: profile.name || 'KSB Profile' });
      });
    });
  });

  return buckets;
}

function buildCoverage(profile: KsbProfile | undefined, groups: FormGroup[]) {
  const counts = new Map<string, number>();
  const occurrences = new Map<string, { moduleName: string; groupName: string; sessionNumber: number }[]>();
  groups.forEach(group => group.modules.forEach(moduleItem => {
    normalizeSessionKsbMappings(moduleItem.sessionKsbMappings, moduleItem.sessions).forEach((mapping, sessionIndex) => {
      [...mapping.knowledgeCodes, ...mapping.skillCodes, ...mapping.behaviourCodes].forEach(code => {
        counts.set(code, (counts.get(code) || 0) + 1);
        occurrences.set(code, [
          ...(occurrences.get(code) || []),
          {
            moduleName: getModuleInputValue(moduleItem.mod) || 'Untitled module',
            groupName: group.groupName || 'Unnamed group',
            sessionNumber: sessionIndex + 1,
          },
        ]);
      });
    });
  }));
  const descriptions = buildKsbDescriptionLookup(profile);
  const section = (codes: string[]) => codes.map(code => ({
    code,
    count: counts.get(code) || 0,
    description: descriptions[code] || '',
    occurrences: occurrences.get(code) || [],
  }));
  const knowledge = section(profile?.knowledgeCodes || []);
  const skills = section(profile?.skillCodes || []);
  const behaviours = section(profile?.behaviourCodes || []);
  const covered = [...knowledge, ...skills, ...behaviours].filter(item => item.count > 0).length;
  const total = knowledge.length + skills.length + behaviours.length;
  return { knowledge, skills, behaviours, covered, total, missing: [...knowledge, ...skills, ...behaviours].filter(item => item.count === 0).map(item => item.code) };
}

function KsbCoverageSummaryModal({ profile, groups, onClose }: { profile: KsbProfile; groups: FormGroup[]; onClose: () => void }) {
  const coverage = buildCoverage(profile, groups);
  const renderSection = (title: string, items: { code: string; count: number; description?: string; occurrences: { moduleName: string; groupName: string; sessionNumber: number }[] }[], tone: string) => (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">{title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">
          {items.filter(item => item.count > 0).length}/{items.length} covered
        </span>
      </div>
      {items.length ? (
        <div className="space-y-2 p-3">
          {items.map(item => (
            <div key={item.code} className={`rounded-lg border p-3 ${item.count ? 'border-emerald-100 bg-emerald-50/45' : 'border-red-100 bg-red-50/55'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-extrabold ${tone}`}>{item.code}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${item.count ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      <i className={item.count ? 'ri-check-line' : 'ri-close-line'} />
                      {item.count ? 'Covered' : 'Missing'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium leading-5 text-gray-500">
                    {item.description || 'No description added for this point.'}
                  </p>
                  {item.occurrences.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Achieved in</p>
                      {item.occurrences.map((occurrence, index) => (
                        <div key={`${item.code}-${occurrence.moduleName}-${occurrence.sessionNumber}-${index}`} className="rounded-md border border-gray-100 bg-white px-2 py-1.5">
                          <p className="truncate text-[11px] font-extrabold text-gray-700">{occurrence.moduleName}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-gray-400">
                            {occurrence.groupName} - Session {occurrence.sessionNumber}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 rounded-lg bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Times</p>
                  <p className="text-sm font-extrabold text-kbc-navy">{item.count}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="px-4 py-6 text-center text-xs font-semibold text-gray-300">No codes required.</p>}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]">
      <button type="button" aria-label="Close KSB coverage summary" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex h-[min(88vh,860px)] w-[min(1060px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4" style={{ background: '#1B2A4A' }}>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white/60">KSB Coverage Summary</p>
            <h3 className="mt-1 truncate text-lg font-extrabold text-white">{profile.name}</h3>
            <p className="mt-1 text-xs font-semibold text-white/60">{profile.programmeName || 'No programme linked'}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-5">
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Profile notes</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">{profile.description || 'No notes added.'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Overall</p>
              <p className="mt-2 text-2xl font-extrabold text-kbc-navy">{coverage.covered}/{coverage.total}</p>
              <p className="text-xs font-semibold text-gray-400">points covered</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Missing</p>
              <p className={`mt-2 text-2xl font-extrabold ${coverage.missing.length ? 'text-red-600' : 'text-emerald-600'}`}>{coverage.missing.length}</p>
              <p className="text-xs font-semibold text-gray-400">points still missing</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {renderSection('Knowledge points', coverage.knowledge, 'bg-sky-50 text-sky-800 border border-sky-200')}
            {renderSection('Skill points', coverage.skills, 'bg-emerald-50 text-emerald-800 border border-emerald-200')}
            {renderSection('Behaviour points', coverage.behaviours, 'bg-amber-50 text-amber-800 border border-amber-200')}
          </div>

          <div className={`mt-4 rounded-xl border p-4 ${coverage.missing.length ? 'border-red-100 bg-white' : 'border-emerald-100 bg-emerald-50'}`}>
            <p className={`text-[11px] font-extrabold uppercase tracking-wider ${coverage.missing.length ? 'text-red-600' : 'text-emerald-700'}`}>
              Missing KSBs
            </p>
            {coverage.missing.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coverage.missing.map(code => <span key={code} className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-700">{code}</span>)}
              </div>
            ) : <p className="mt-1 text-xs font-semibold text-emerald-700">All required KSBs are covered at least once.</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function buildGroupSignature(block: ModuleBlock): string {
  if (block.groupId) {
    return block.groupId;
  }
  const days = (block.days?.length ? block.days : [inferWeekDayFromIsoDate(block.startDate)]).join('|');
  return [
    block.groupName || '',
    block.coachName || '',
    days,
    block.sessionStartTime || '09:00',
    block.sessionEndTime || '11:00',
  ].join('::');
}

function groupBlocksForForm(blocks: ModuleBlock[], catalogModules: CatalogModule[] = [], tutorProfiles: TutorProfile[] = []) {
  const grouped = new Map<string, FormGroup>();
  const order: string[] = [];

  blocks.forEach(block => {
    const key = buildGroupSignature(block);
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: block.groupId || `grp-${Date.now()}-${Math.random()}`,
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

    const blockMappings = normalizeSessionKsbMappings(block.sessionKsbMappings, block.sessions);

    grouped.get(key)!.modules.push({
      id: block.id,
      mod: block.mod,
      color: block.color || '',
      startDate: block.startDate,
      endDate: block.endDate,
      sessions: block.sessions,
      sessionKsbMappings: hasKsbCodes(blockMappings) ? blockMappings : normalizeSessionKsbMappings([], block.sessions),
      sessionCoverage: block.sessionCoverage || [],
      notes: block.notes || '',
      tutor: block.tutor || '',
      tutorProfileId: block.tutorProfileId || profileIdForTutorName(block.tutor || '', tutorProfiles),
    });
  });

  return order.map(key => grouped.get(key)!).filter(Boolean);
}

export default function CohortModal({
  mode,
  groups,
  holidays,
  customModules = [],
  catalogModules = [],
  ksbProfiles = [],
  tutorProfiles = [],
  initialGroupIdx = 0,
  initialRow,
  initialExpandedBlockId,
  prefillTutorProfileId,
  prefillModule,
  lockGroupSelection = false,
  onSave,
  onManageHolidays,
  onCreateTutorProfile,
  onBackToPreviousStep,
  onClose,
}: Props) {
  const prefillTutorProfile = prefillTutorProfileId ? tutorProfiles.find(profile => profile.id === prefillTutorProfileId) : undefined;
  const prefillCatalogModule = prefillModule ? resolveCatalogModuleForValue(prefillModule, catalogModules) : undefined;
  const prefillModuleMeta = prefillModule ? resolveModuleMeta(prefillModule, customModules, catalogModules) : undefined;
  const createPrefilledModule = (): FormModule => {
    const sessionCount = Math.max(1, parseInt(prefillCatalogModule?.sessions || '1', 10) || 1);
    return {
      ...newFormModule(),
      mod: prefillModule || '',
      color: prefillCatalogModule?.colour || prefillModuleMeta?.bg || '',
      sessions: sessionCount,
      sessionKsbMappings: normalizeSessionKsbMappings([], sessionCount),
      tutor: prefillTutorProfile?.name || '',
      tutorProfileId: prefillTutorProfile?.id || '',
    };
  };
  const addPrefilledModuleToGroups = (sourceGroups: FormGroup[]): FormGroup[] => {
    if (!prefillTutorProfile && !prefillModule) return sourceGroups;
    const moduleItem = createPrefilledModule();
    if (!sourceGroups.length) {
      const group = newFormGroup();
      return [{
        ...group,
        color: prefillModuleMeta?.bg || group.color,
        tutor: prefillTutorProfile?.name || '',
        modules: [moduleItem],
      }];
    }
    return sourceGroups.map((group, index) => index === 0 ? {
      ...group,
      tutor: group.tutor || prefillTutorProfile?.name || '',
      modules: [...group.modules, moduleItem],
    } : group);
  };
  const prefilledAddGroups: FormGroup[] = mode === 'add'
    ? addPrefilledModuleToGroups([])
    : [];

  const initialFormData: FormData = mode === 'edit' && initialRow ? {
    groupIdx: initialGroupIdx,
    label: initialRow.label,
    dateLbl: normalizeDateLabel(initialRow.dateLbl),
    endDateLbl: normalizeDateLabel(initialRow.endDateLbl || ''),
    durationMonths: 24,
    intake: initialRow.intake,
    quarter: initialRow.quarter,
    color: initialRow.color || groups[initialGroupIdx]?.color || '#1B2A4A',
    holidayIds: initialRow.holidayIds || [],
    ksbProfileId: initialRow.ksbProfileId || '',
    groups: addPrefilledModuleToGroups(groupBlocksForForm(initialRow.blks, catalogModules, tutorProfiles)),
  } : {
    groupIdx: initialGroupIdx,
    label: '',
    dateLbl: '',
    endDateLbl: '',
    durationMonths: 24,
    intake: 'Intake 1',
    quarter: 'Q1 2025',
    color: groups[initialGroupIdx]?.color || '#1B2A4A',
    holidayIds: [],
    ksbProfileId: '',
    groups: prefilledAddGroups,
  };

  const [data, setData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(initialFormData.groups[0]?.id || null);
  const [groupDraft, setGroupDraft] = useState<GroupDraftState | null>(null);
  const [moduleDraft, setModuleDraft] = useState<ModuleDraftState | null>(null);
  const [ksbEditorOpen, setKsbEditorOpen] = useState(false);
  const [ksbSummaryOpen, setKsbSummaryOpen] = useState(false);
  const [groupDraftDirty, setGroupDraftDirty] = useState(false);
  const [moduleDraftDirty, setModuleDraftDirty] = useState(false);
  const [tutorCreateOpen, setTutorCreateOpen] = useState(false);
  const [tutorCreateDraft, setTutorCreateDraft] = useState({ name: '', email: '', notes: '' });
  const [tutorCreateError, setTutorCreateError] = useState('');
  const [tutorCreateWarning, setTutorCreateWarning] = useState<{ profile: TutorProfile; detail: string; score?: number } | null>(null);
  const [tutorCreateSaving, setTutorCreateSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userHasEdited, setUserHasEdited] = useState(false);
  const initialSnapshotRef = useRef(serializeDraftState(initialFormData, null, null));
  const markUserEdited = () => setUserHasEdited(true);
  const hasUnsavedChanges = useMemo(
    () => userHasEdited && serializeDraftState(data, groupDraft, moduleDraft) !== initialSnapshotRef.current,
    [data, groupDraft, moduleDraft, userHasEdited],
  );
  const selectedProgramme = groups[data.groupIdx];
  const programmeDates = parseProgrammeDates(selectedProgramme?.sub || '');
  const activeKsbProfiles = useMemo(() => ksbProfiles.filter(profile => profile.isActive || profile.id === data.ksbProfileId), [data.ksbProfileId, ksbProfiles]);
  const selectedKsbProfile = useMemo(() => ksbProfiles.find(profile => profile.id === data.ksbProfileId), [data.ksbProfileId, ksbProfiles]);
  const activeTutorProfiles = useMemo(() => tutorProfiles.filter(profile => profile.isActive), [tutorProfiles]);
  const coachOptions = useMemo(() => {
    const counts = new Map<string, number>();
    groups.forEach(programme => programme.rows.forEach(row => row.blks.forEach(block => {
      const name = String(block.coachName || '').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    })));
    data.groups.forEach(group => {
      const name = group.coachName.trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, count]) => ({
        value: name,
        label: name,
        description: `${count} Training Plan block${count === 1 ? '' : 's'}`,
        color: '#1B2A4A',
      }));
  }, [data.groups, groups]);

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

  const holidaysInRange = useMemo(
    () => {
      if (!hasDateRange) {
        return [];
      }

      const ranges = hasModuleDateRange
        ? rangedModules.map(moduleItem => ({ startDate: moduleItem.startDate, endDate: moduleItem.endDate }))
        : [{ startDate: rangeStart, endDate: rangeEnd }];

      return holidays.filter(item => (
        isIsoDate(item.startDate) &&
        isIsoDate(item.endDate) &&
        ranges.some(range => range.startDate <= item.endDate && range.endDate >= item.startDate)
      ));
    },
    [hasDateRange, hasModuleDateRange, holidays, rangeEnd, rangeStart, rangedModules],
  );
  const holidaysInRangeIds = useMemo(() => new Set(holidaysInRange.map(item => item.id)), [holidaysInRange]);
  const selectedHolidaysInRangeCount = data.holidayIds.filter(id => holidaysInRangeIds.has(id)).length;
  const selectedHolidaysOutsideRangeCount = hasDateRange ? data.holidayIds.filter(id => !holidaysInRangeIds.has(id)).length : 0;
  const selectedHolidays = useMemo(
    () => holidays.filter(item => data.holidayIds.includes(item.id)),
    [holidays, data.holidayIds],
  );
  const selectableHolidayIds = useMemo(
    () => (hasDateRange ? holidaysInRange.map(item => item.id) : holidays.map(item => item.id)),
    [hasDateRange, holidays, holidaysInRange],
  );
  const allHolidaysSelected = selectableHolidayIds.length > 0 && selectableHolidayIds.every(id => data.holidayIds.includes(id));
  const allSystemHolidayIds = useMemo(() => holidays.map(item => item.id), [holidays]);
  const allSystemHolidaysSelected = allSystemHolidayIds.length > 0 && allSystemHolidayIds.every(id => data.holidayIds.includes(id));
  const displayHolidays = useMemo(() => {
    const selectedIds = new Set(data.holidayIds);
    const getPriority = (holiday: Holiday) => {
      const selected = selectedIds.has(holiday.id);
      const inRange = holidaysInRangeIds.has(holiday.id);
      if (selected && inRange) return 0;
      if (selected) return 1;
      if (inRange) return 2;
      return 3;
    };

    return [...holidays].sort((a, b) => {
      const priorityDiff = getPriority(a) - getPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return a.startDate.localeCompare(b.startDate) || a.label.localeCompare(b.label);
    });
  }, [data.holidayIds, holidays, holidaysInRangeIds]);

  // Auto-update cohort end date to the latest module end date whenever modules change.
  // Only updates when the derived date differs from what is stored, preventing loops.
  useEffect(() => {
    const latest = latestModuleEndDate(data.groups);
    if (latest && latest !== data.endDateLbl) {
      setData(prev => ({ ...prev, endDateLbl: latest }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.groups]);

  useEffect(() => {
    const available = new Set(holidays.map(item => item.id));
    const filtered = data.holidayIds.filter(id => available.has(id));
    if (filtered.length !== data.holidayIds.length) {
      const filteredHolidays = holidays.filter(item => filtered.includes(item.id));
      setData(prev => ({
        ...prev,
        holidayIds: filtered,
        groups: recalculateModuleEndDates(prev.groups, filteredHolidays),
      }));
    }
  }, [holidays, data.holidayIds]);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    markUserEdited();
    setData(prev => ({ ...prev, [key]: value }));
  };

  const setCohortStartDate = (value: string) => {
    markUserEdited();
    setData(prev => ({
      ...prev,
      dateLbl: value,
      endDateLbl: value ? addMonthsToIsoDate(value, prev.durationMonths) : '',
    }));
  };

  const setDurationMonths = (months: number) => {
    markUserEdited();
    setData(prev => ({
      ...prev,
      durationMonths: months,
      endDateLbl: prev.dateLbl ? addMonthsToIsoDate(prev.dateLbl, months) : prev.endDateLbl,
    }));
  };

  const recalculateModuleEndDates = (groupsToUpdate: FormGroup[], activeHolidays: Holiday[]) =>
    groupsToUpdate.map(group => ({
      ...group,
      modules: group.modules.map(moduleItem => ({
        ...moduleItem,
        endDate: calculateModuleEndDate(moduleItem.startDate, moduleItem.sessions, activeHolidays, group.days) || moduleItem.endDate,
      })),
    }));

  const toggleHoliday = (holidayId: string) => {
    markUserEdited();
    setData(prev => {
      const exists = prev.holidayIds.includes(holidayId);
      const nextHolidayIds = exists ? prev.holidayIds.filter(id => id !== holidayId) : [...prev.holidayIds, holidayId];
      const nextSelectedHolidays = holidays.filter(item => nextHolidayIds.includes(item.id));
      return {
        ...prev,
        holidayIds: nextHolidayIds,
        groups: recalculateModuleEndDates(prev.groups, nextSelectedHolidays),
      };
    });
  };

  const toggleAllHolidays = () => {
    if (!selectableHolidayIds.length) return;
    markUserEdited();
    setData(prev => {
      const selected = new Set(prev.holidayIds);
      const allSelectableSelected = selectableHolidayIds.every(id => selected.has(id));
      const nextHolidayIds = allSelectableSelected
        ? prev.holidayIds.filter(id => !selectableHolidayIds.includes(id))
        : Array.from(new Set([...prev.holidayIds, ...selectableHolidayIds]));
      const nextSelectedHolidays = holidays.filter(item => nextHolidayIds.includes(item.id));
      return {
        ...prev,
        holidayIds: nextHolidayIds,
        groups: recalculateModuleEndDates(prev.groups, nextSelectedHolidays),
      };
    });
  };

  const toggleEveryHoliday = () => {
    if (!allSystemHolidayIds.length) return;
    markUserEdited();
    setData(prev => {
      const nextHolidayIds = allSystemHolidayIds.every(id => prev.holidayIds.includes(id)) ? [] : allSystemHolidayIds;
      const nextSelectedHolidays = holidays.filter(item => nextHolidayIds.includes(item.id));
      return {
        ...prev,
        holidayIds: nextHolidayIds,
        groups: recalculateModuleEndDates(prev.groups, nextSelectedHolidays),
      };
    });
  };

  const openAddGroup = () => {
    setGroupDraftDirty(false);
    setGroupDraft({ group: newFormGroup() });
  };

  const openEditGroup = (groupId: string) => {
    const target = data.groups.find(group => group.id === groupId);
    if (!target) {
      return;
    }
    setGroupDraftDirty(false);
    setGroupDraft({ group: { ...target, modules: [...target.modules] }, replaceId: groupId });
  };

  const openAddModule = (parentGroupId: string) => {
    setKsbEditorOpen(false);
    setModuleDraftDirty(false);
    setModuleDraft({ parentGroupId, module: newFormModule() });
  };

  const openEditModule = (parentGroupId: string, moduleId: string) => {
    const parentGroup = data.groups.find(group => group.id === parentGroupId);
    const target = parentGroup?.modules.find(item => item.id === moduleId);
    if (!parentGroup || !target) {
      return;
    }
    const recalculatedEndDate = calculateModuleEndDate(target.startDate, target.sessions, selectedHolidays, parentGroup.days);
    setKsbEditorOpen(false);
    setModuleDraftDirty(false);
    setModuleDraft({ parentGroupId, module: { ...target, endDate: recalculatedEndDate || target.endDate }, replaceId: moduleId });
  };

  useEffect(() => {
    if (!initialExpandedBlockId || mode !== 'edit') {
      return;
    }

    const parentGroup = data.groups.find(group =>
      group.modules.some(moduleItem => moduleItem.id === initialExpandedBlockId),
    );
    if (!parentGroup) {
      return;
    }

    setExpandedGroupId(parentGroup.id);
    openEditModule(parentGroup.id, initialExpandedBlockId);
  // Run once on mount so deep-link editing opens the target block.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateGroupDraft = (key: keyof Omit<FormGroup, 'id' | 'modules'>, value: string | WeekDayKey[]) => {
    markUserEdited();
    setGroupDraftDirty(true);
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
    markUserEdited();
    setGroupDraftDirty(true);
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
    markUserEdited();

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
    setGroupDraftDirty(false);
  };

  const updateModuleDraft = (key: keyof Omit<FormModule, 'id' | 'sessionKsbMappings'>, value: string | number) => {
    markUserEdited();
    setModuleDraftDirty(true);
    setModuleDraft(prev => {
      if (!prev) {
        return prev;
      }
      const nextModule = { ...prev.module, [key]: value };
      if (key === 'startDate' || key === 'sessions') {
        const parentGroup = data.groups.find(group => group.id === prev.parentGroupId);
        nextModule.endDate = calculateModuleEndDate(
          key === 'startDate' ? String(value) : nextModule.startDate,
          key === 'sessions' ? Number(value) : nextModule.sessions,
          selectedHolidays,
          parentGroup?.days || [],
        );
      }
      if (key === 'sessions') {
        nextModule.sessionKsbMappings = normalizeSessionKsbMappings(nextModule.sessionKsbMappings, Math.max(1, Number(value) || 1));
      }
      return { ...prev, module: nextModule };
    });
  };

  const selectTutorProfileForModule = (profileId: string, createdProfile?: TutorProfile) => {
    const profile = createdProfile || activeTutorProfiles.find(item => item.id === profileId);
    markUserEdited();
    setModuleDraftDirty(true);
    setModuleDraft(prev => prev ? {
      ...prev,
      module: {
        ...prev.module,
        tutorProfileId: profile?.id || '',
        tutor: profile?.name || '',
      },
    } : prev);
  };

  const openTutorCreateModal = () => {
    const currentTutor = moduleDraft?.module.tutor || '';
    setTutorCreateDraft({ name: currentTutor, email: '', notes: '' });
    setTutorCreateError('');
    setTutorCreateWarning(null);
    setTutorCreateOpen(true);
  };

  const saveTutorProfileDraft = async (confirmCreateNew = false) => {
    if (!onCreateTutorProfile) {
      setTutorCreateError('Tutor profile creation is not available right now.');
      return;
    }
    const name = tutorCreateDraft.name.trim();
    if (!name) {
      setTutorCreateError('Tutor name is required.');
      return;
    }
    setTutorCreateSaving(true);
    setTutorCreateError('');
    try {
      const result = await onCreateTutorProfile({
        name,
        email: tutorCreateDraft.email.trim(),
        notes: tutorCreateDraft.notes.trim(),
        confirmCreateNew,
      });
      if ('id' in result) {
        selectTutorProfileForModule(result.id, result);
        setTutorCreateOpen(false);
        setTutorCreateWarning(null);
        return;
      }
      const possible = result.possibleExistingProfile || result.existingProfile;
      if (possible) {
        setTutorCreateWarning({
          profile: possible,
          detail: result.detail || `Possible existing tutor found: ${possible.name}. Use existing profile instead?`,
          score: result.score,
        });
        return;
      }
      setTutorCreateError(result.detail || 'Tutor profile could not be created.');
    } catch (error) {
      setTutorCreateError(error instanceof Error ? error.message : 'Tutor profile could not be created.');
    } finally {
      setTutorCreateSaving(false);
    }
  };

  const updateModuleDraftKsb = (sessionIndex: number, field: keyof SessionKsbMapping, value: string[]) => {
    markUserEdited();
    setModuleDraftDirty(true);
    setModuleDraft(prev => {
      if (!prev) {
        return prev;
      }
      const prefix = field === 'knowledgeCodes' ? 'K' : field === 'skillCodes' ? 'S' : 'B';
      const sessionCount = Math.max(1, Number(prev.module.sessions) || 1);
      const nextMappings = normalizeSessionKsbMappings(prev.module.sessionKsbMappings, sessionCount);
      nextMappings[sessionIndex] = {
        ...(nextMappings[sessionIndex] || emptySessionKsbMapping()),
        [field]: normalizeKsbCodes(value, prefix),
      };
      return { ...prev, module: { ...prev.module, sessionKsbMappings: nextMappings } };
    });
  };

  const saveModuleDraft = () => {
    if (!moduleDraft) {
      return;
    }
    if (!moduleDraft.module.tutorProfileId) {
      void kbcSwal.fire({
        title: 'Select a Tutor Profile',
        html: 'Choose an existing Tutor Profile or create a new one before saving this module.',
        icon: 'warning',
        confirmButtonText: 'OK',
      });
      return;
    }
    markUserEdited();

    setData(prev => ({
      ...prev,
      groups: prev.groups.map(group => {
        if (group.id !== moduleDraft.parentGroupId) {
          return group;
        }
        const normalizedModule = {
          ...moduleDraft.module,
          tutor: activeTutorProfiles.find(profile => profile.id === moduleDraft.module.tutorProfileId)?.name || moduleDraft.module.tutor,
          sessionKsbMappings: normalizeSessionKsbMappings(moduleDraft.module.sessionKsbMappings, moduleDraft.module.sessions),
          endDate: calculateModuleEndDate(moduleDraft.module.startDate, moduleDraft.module.sessions, selectedHolidays, group.days) || moduleDraft.module.endDate,
        };
        if (moduleDraft.replaceId) {
          return {
            ...group,
            modules: group.modules.map(item => item.id === moduleDraft.replaceId ? normalizedModule : item),
          };
        }
        return {
          ...group,
          modules: [...group.modules, normalizedModule],
        };
      }),
    }));

    setExpandedGroupId(moduleDraft.parentGroupId);
    setKsbEditorOpen(false);
    setModuleDraft(null);
    setModuleDraftDirty(false);
  };

  const closeGroupDraft = async () => {
    if (!groupDraftDirty) {
      setGroupDraft(null);
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Discard Group Changes?',
      html: 'If you close now, the group changes you entered will be lost.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Discard Changes',
      cancelButtonText: 'Keep Editing',
      reverseButtons: true,
      focusCancel: true,
    });

    if (result.isConfirmed) {
      setGroupDraft(null);
      setGroupDraftDirty(false);
    }
  };

  const closeModuleDraft = async () => {
    if (!moduleDraftDirty) {
      setKsbEditorOpen(false);
      setModuleDraft(null);
      return;
    }

    const result = await kbcSwal.fire({
      title: 'Discard Module Changes?',
      html: 'If you close now, the module changes you entered will be lost.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Discard Changes',
      cancelButtonText: 'Keep Editing',
      reverseButtons: true,
      focusCancel: true,
    });

    if (result.isConfirmed) {
      setKsbEditorOpen(false);
      setModuleDraft(null);
      setModuleDraftDirty(false);
    }
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

    void kbcSwal.fire({
      title: 'Deleting group...',
      html: `Removing <strong>${target.groupName || target.tutor || 'this group'}</strong> from this cohort.`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });
    markUserEdited();
    setData(prev => ({ ...prev, groups: prev.groups.filter(group => group.id !== groupId) }));
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
    }
    await kbcSwal.fire({
      title: 'Group Removed',
      html: 'The group was removed from this cohort. Click <strong>Save Changes</strong> to update the Training Plan.',
      icon: 'success',
      showConfirmButton: false,
      timer: 1400,
      timerProgressBar: true,
    });
  };

  const duplicateGroup = (groupId: string) => {
    const source = data.groups.find(group => group.id === groupId);
    if (!source) return;
    markUserEdited();

    const newId = `grp-${Date.now()}-${Math.random()}`;
    const duplicate: FormGroup = {
      ...source,
      id: newId,
      groupName: source.groupName ? `${source.groupName} (copy)` : '',
      modules: source.modules.map(m => ({
        ...m,
        id: `mod-${Date.now()}-${Math.random()}`,
      })),
    };

    setData(prev => {
      const idx = prev.groups.findIndex(g => g.id === groupId);
      const next = [...prev.groups];
      next.splice(idx + 1, 0, duplicate);
      return { ...prev, groups: next };
    });
    setExpandedGroupId(newId);
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

    void kbcSwal.fire({
      title: 'Deleting module...',
      html: `Removing <strong>${getModuleInputValue(target.mod) || 'this module'}</strong> from this group.`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });
    markUserEdited();
    setData(prev => ({
      ...prev,
      groups: prev.groups.map(group => (
        group.id !== groupId
          ? group
          : { ...group, modules: group.modules.filter(item => item.id !== moduleId) }
      )),
    }));
    await kbcSwal.fire({
      title: 'Module Removed',
      html: 'The module was removed from this group. Click <strong>Save Changes</strong> to update the Training Plan.',
      icon: 'success',
      showConfirmButton: false,
      timer: 1400,
      timerProgressBar: true,
    });
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!data.label.trim()) nextErrors.label = 'Cohort label is required';
    if (!data.dateLbl.trim()) nextErrors.dateLbl = 'Start date is required';
    if (data.dateLbl && data.endDateLbl && data.endDateLbl < data.dateLbl) nextErrors.endDateLbl = 'End date must be after start date';
    if (data.groups.length === 0) nextErrors.groups = 'Add at least one group';

    data.groups.forEach((group, groupIdx) => {
      if (group.modules.length === 0) {
        nextErrors[`group_modules_${groupIdx}`] = 'Add at least one module';
      }

      group.modules.forEach((moduleItem, moduleIdx) => {
        if (!moduleItem.mod) nextErrors[`module_mod_${groupIdx}_${moduleIdx}`] = 'Select a module';
        if (!moduleItem.startDate) nextErrors[`module_start_${groupIdx}_${moduleIdx}`] = 'Start date required';
      });
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || isSaving) {
      return;
    }

    const selectedHolidayIds = new Set(data.holidayIds);
    const activeHolidays = holidays.filter(holiday => selectedHolidayIds.has(holiday.id));
    const normalizedGroups = recalculateModuleEndDates(data.groups, activeHolidays);
    const normalizedCohortEndDate = latestModuleEndDate(normalizedGroups) || data.endDateLbl.trim();

    const row: CohortRow = {
      id: initialRow?.id || `row-${Date.now()}`,
      label: data.label.trim(),
      dateLbl: data.dateLbl.trim(),
      endDateLbl: normalizedCohortEndDate,
      intake: data.intake,
      quarter: data.quarter,
      color: data.color,
      holidayIds: data.holidayIds,
      ksbProfileId: data.ksbProfileId || undefined,
      blks: normalizedGroups.flatMap(group =>
        group.modules.map(moduleItem => ({
          id: moduleItem.id,
          groupId: group.id,
          mod: moduleItem.mod,
          groupName: group.groupName.trim() || undefined,
          coachName: group.coachName.trim() || undefined,
          color: moduleItem.color || group.color,
          tutor: moduleItem.tutor.trim(),
          tutorProfileId: moduleItem.tutorProfileId || undefined,
          startDate: moduleItem.startDate,
          endDate: moduleItem.endDate,
          sessions: moduleItem.sessions,
          sessionKsbMappings: normalizeSessionKsbMappings(moduleItem.sessionKsbMappings, moduleItem.sessions),
          sessionCoverage: moduleItem.sessionCoverage || [],
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
      onBackToPreviousStep?.();
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
      onBackToPreviousStep?.();
      onClose();
    }
  };

  const groupSummary = data.groups
    .map(group => group.groupName.trim() || group.tutor.trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />
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

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
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
                    onClick={() => {
                      markUserEdited();
                      setData(prev => ({ ...prev, groupIdx: idx, color: mode === 'add' ? item.color : prev.color }));
                    }}
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
                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em] mb-1.5">Duration (months)</label>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={data.durationMonths}
                    onChange={e => setDurationMonths(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">months</span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em]">Cohort End Date</label>
                <span className="text-[10px] text-gray-400">
                  {latestModuleEndDate(data.groups) ? 'auto — set to last module end date' : 'set by duration months above'}
                </span>
              </div>
              <DateField value={data.endDateLbl} onChange={value => setField('endDateLbl', value)} placeholder="Choose cohort end date" error={errors.endDateLbl} accentColor={data.color || selectedProgramme?.color || '#1B2A4A'} />
              {errors.endDateLbl && <p className="text-red-500 text-xs mt-1">{errors.endDateLbl}</p>}
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

          <div className="order-2 rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="border-b border-gray-100 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em]">Linked Holidays (optional)</label>
                  <p className="mt-1 text-xs font-semibold text-gray-400">
                    Only in-range holidays affect module end dates and timeline clashes.
                  </p>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-extrabold"
                  style={{
                    background: allSystemHolidaysSelected ? '#DCFCE7' : allHolidaysSelected ? '#E8EEF9' : '#F1F5F9',
                    color: allSystemHolidaysSelected ? '#166534' : allHolidaysSelected ? '#1B2A4A' : '#64748B',
                  }}
                >
                  {allSystemHolidaysSelected ? 'All holidays selected' : allHolidaysSelected ? 'All in-range selected' : 'Partial selection'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Will show</p>
                  <p className="mt-0.5 text-sm font-extrabold text-emerald-900">{selectedHolidaysInRangeCount}/{holidaysInRange.length} in range</p>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">Selected outside</p>
                  <p className="mt-0.5 text-sm font-extrabold text-amber-900">{selectedHolidaysOutsideRangeCount}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Total selected</p>
                  <p className="mt-0.5 text-sm font-extrabold text-slate-800">{data.holidayIds.length}/{holidays.length}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selectableHolidayIds.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllHolidays}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-all hover:shadow-sm"
                    style={{
                      borderColor: allHolidaysSelected ? '#CBD5E1' : '#1B2A4A',
                      background: allHolidaysSelected ? '#F8FAFC' : '#E8EEF9',
                      color: allHolidaysSelected ? '#64748B' : '#1B2A4A',
                    }}
                  >
                    <i className={allHolidaysSelected ? 'ri-close-circle-line' : 'ri-check-double-line'} />
                    {allHolidaysSelected ? (hasDateRange ? 'Clear in range' : 'Clear all') : (hasDateRange ? 'Select in range' : 'Select all')}
                  </button>
                )}
                {allSystemHolidayIds.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleEveryHoliday}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-all hover:shadow-sm"
                    style={{
                      borderColor: allSystemHolidaysSelected ? '#86EFAC' : '#CBD5E1',
                      background: allSystemHolidaysSelected ? '#DCFCE7' : '#FFFFFF',
                      color: allSystemHolidaysSelected ? '#166534' : '#334155',
                    }}
                  >
                    <i className={allSystemHolidaysSelected ? 'ri-checkbox-circle-line' : 'ri-list-check-3'} />
                    {allSystemHolidaysSelected ? 'Clear all holidays' : 'Select all holidays'}
                  </button>
                )}
                {onManageHolidays && (
                  <button
                    type="button"
                    onClick={onManageHolidays}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-all hover:shadow-sm"
                    style={{ borderColor: '#F7A800', background: '#FFF8E0', color: '#C49A00' }}
                  >
                    <i className="ri-settings-3-line" />
                    Manage Holidays
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto bg-gray-50 p-3">
              {holidays.length === 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-700">No holidays saved yet</p>
                    <p className="text-sm text-gray-400 mt-1">Add a holiday first, then it will appear here immediately.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {!hasDateRange && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      Set module dates first to know which selected holidays will appear on the timeline.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {displayHolidays.map(holiday => {
                      const selected = data.holidayIds.includes(holiday.id);
                      const inRange = holidaysInRangeIds.has(holiday.id);
                      return (
                        <button
                          key={holiday.id}
                          type="button"
                          onClick={() => toggleHoliday(holiday.id)}
                          className="rounded-lg border px-3 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:shadow-sm"
                          style={{
                            borderColor: selected && inRange ? '#86EFAC' : selected ? '#FCD34D' : inRange ? '#CBD5E1' : '#E5E7EB',
                            background: selected && inRange ? '#DCFCE7' : selected ? '#FEF3C7' : '#FFFFFF',
                            color: selected && inRange ? '#166534' : selected ? '#92400E' : '#475569',
                          }}
                          title={`${holiday.label} (${formatDate(holiday.startDate)} - ${formatDate(holiday.endDate)})`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <i className={`${selected ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'} text-xs`} />
                            <span>{holiday.label}</span>
                            {selected && inRange && (
                              <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700">Will show</span>
                            )}
                            {selected && !inRange && hasDateRange && (
                              <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-700">Outside</span>
                            )}
                            {!selected && inRange && (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-500">In range</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="order-3 space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-[0.14em] mb-1.5">KSB Profile</label>
              <select
                value={data.ksbProfileId}
                onChange={event => {
                  const value = event.target.value;
                  setField('ksbProfileId', value);
                  setKsbSummaryOpen(Boolean(value));
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none"
              >
                <option value="">No KSB profile selected</option>
                {activeKsbProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
              {selectedKsbProfile ? (
                <button
                  type="button"
                  onClick={() => setKsbSummaryOpen(true)}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700 transition-all hover:border-emerald-200 hover:bg-emerald-100"
                >
                  <i className="ri-check-line" />
                  KSB Profile selected: {selectedKsbProfile.name}
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-emerald-700">View details</span>
                </button>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-400">
                  Select a KSB profile to view coverage details.
                </div>
              )}
            </div>
          </div>

          <div className="order-1">
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
                const datedModules = group.modules.filter(moduleItem => isIsoDate(moduleItem.startDate) && isIsoDate(moduleItem.endDate));
                const groupStartDate = datedModules.length
                  ? datedModules.reduce((min, moduleItem) => (moduleItem.startDate < min ? moduleItem.startDate : min), datedModules[0].startDate)
                  : '';
                const groupEndDate = datedModules.length
                  ? datedModules.reduce((max, moduleItem) => (moduleItem.endDate > max ? moduleItem.endDate : max), datedModules[0].endDate)
                  : '';
                const moduleTutorNames = Array.from(new Set(group.modules.map(moduleItem => moduleItem.tutor.trim()).filter(Boolean)));
                const tutorDisplay = group.tutor.trim() || moduleTutorNames.join(', ');

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
                      {groupStartDate && groupEndDate && <span className="text-sm text-gray-400 hidden lg:block">{formatDate(groupStartDate)} {'->'} {formatDate(groupEndDate)}</span>}
                      <button onClick={e => { e.stopPropagation(); duplicateGroup(group.id); }} title="Duplicate group" className="w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-blue-500 hover:bg-blue-50 cursor-pointer transition-all">
                        <i className="ri-file-copy-line text-xs" />
                      </button>
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
                              <p className="text-sm text-gray-400 mt-1">{tutorDisplay || 'Tutor not set'}</p>
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
                              <p className="text-gray-700 mt-1">{tutorDisplay || '—'}</p>
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
                            const moduleMeta = resolveModuleVisualMeta(moduleItem, customModules, catalogModules);
                            return (
                              <div key={moduleItem.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
                                <span className="w-3 h-10 rounded-sm shrink-0" style={{ background: moduleMeta.bg }} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-gray-800 truncate">{moduleMeta.lbl}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: `${moduleMeta.bg}18`, color: moduleMeta.bg }}>
                                      <i className="ri-calendar-line text-[10px]" />
                                      {moduleItem.startDate ? formatDate(moduleItem.startDate) : 'No start'}
                                    </span>
                                    <i className="ri-arrow-right-line text-gray-300 text-xs" />
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: `${moduleMeta.bg}18`, color: moduleMeta.bg }}>
                                      <i className="ri-calendar-check-line text-[10px]" />
                                      {moduleItem.endDate ? formatDate(moduleItem.endDate) : '—'}
                                    </span>
                                    <span className="text-xs text-gray-400">· {moduleItem.sessions} sessions</span>
                                    {moduleItem.tutor && <span className="text-xs text-gray-400">· {moduleItem.tutor}</span>}
                                  </div>
                                  <KsbSummaryBadges mappings={moduleItem.sessionKsbMappings || []} />
                                  {(errors[`module_mod_${groupIdx}_${moduleIdx}`] || errors[`module_start_${groupIdx}_${moduleIdx}`]) && <p className="text-red-500 text-xs mt-1">{errors[`module_mod_${groupIdx}_${moduleIdx}`] || errors[`module_start_${groupIdx}_${moduleIdx}`]}</p>}
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
            <button type="button" aria-label="Close group editor" className="absolute inset-0 cursor-default" onClick={() => { void closeGroupDraft(); }} />
            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#1B2A4A' }}>
                <div>
                  <h3 className="text-white font-extrabold text-sm tracking-wide">{groupDraft.replaceId ? 'Edit Group' : 'Add Group'}</h3>
                  <p className="text-white/60 text-xs mt-0.5">Create the parent group first, then add modules inside it.</p>
                </div>
                <button onClick={() => void closeGroupDraft()} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
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
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Coach Name</label>
                  <SelectField
                    value={groupDraft.group.coachName}
                    options={[
                      ...(groupDraft.group.coachName.trim() && !coachOptions.some(option => option.value === groupDraft.group.coachName.trim())
                        ? [{
                            value: groupDraft.group.coachName.trim(),
                            label: groupDraft.group.coachName.trim(),
                            description: 'New coach name',
                            color: groupDraft.group.color || '#1B2A4A',
                          }]
                        : []),
                      ...coachOptions,
                    ]}
                    placeholder={coachOptions.length ? 'Select a coach' : 'Type the first coach name'}
                    accentColor={groupDraft.group.color || '#1B2A4A'}
                    label="Coaches"
                    searchPlaceholder="Search coaches..."
                    emptyTitle="No matching coaches"
                    emptyText="Type a new coach name below."
                    onChange={value => updateGroupDraft('coachName', value)}
                    footer={(
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={groupDraft.group.coachName}
                          onChange={event => updateGroupDraft('coachName', event.target.value)}
                          placeholder="Type new coach name"
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-kbc-navy"
                        />
                      </div>
                    )}
                  />
                </div>

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
                <button onClick={() => void closeGroupDraft()} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">Cancel</button>
                <button onClick={saveGroupDraft} className="px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all" style={{ background: '#1B2A4A' }}>Save Group</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {moduleDraft && createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-3 sm:p-4">
            <button type="button" aria-label="Close module editor" className="absolute inset-0 cursor-default" onClick={() => { void closeModuleDraft(); }} />
            <div className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)]">
              <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b" style={{ background: '#1B2A4A' }}>
                <div>
                  <h3 className="text-white font-extrabold text-sm tracking-wide">{moduleDraft.replaceId ? 'Edit Module' : 'Add Module'}</h3>
                  <p className="text-white/60 text-xs mt-0.5">This module will be added inside the selected group.</p>
                </div>
                <button onClick={() => void closeModuleDraft()} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50">
                {(() => {
                  const selectedCatalogModule = resolveCatalogModuleForValue(moduleDraft.module.mod, catalogModules);
                  const currentModuleLabel = selectedCatalogModule?.name || getModuleInputValue(moduleDraft.module.mod);
                  const parentGroup = data.groups.find(group => group.id === moduleDraft.parentGroupId);
                  const accentColor = selectedCatalogModule?.colour || moduleDraft.module.color || parentGroup?.color || '#1B2A4A';
                  const moduleOptions = [
                    ...(!selectedCatalogModule && currentModuleLabel
                      ? [{
                          value: currentModuleLabel,
                          label: currentModuleLabel,
                          description: 'Current saved value',
                          color: accentColor,
                        }]
                      : []),
                    ...catalogModules.map(m => ({
                      value: m.name,
                      label: m.name,
                      description: `${m.sessions || 0} session${m.sessions === '1' ? '' : 's'}`,
                      color: m.colour || '#4A6DB0',
                    })),
                  ];
                  const sessionCount = Math.max(1, Number(moduleDraft.module.sessions) || 1);
                  const ksbMappings = normalizeSessionKsbMappings(moduleDraft.module.sessionKsbMappings, sessionCount);
                  const selectedTutorProfile = activeTutorProfiles.find(profile => profile.id === moduleDraft.module.tutorProfileId);
                  const legacyTutorName = moduleDraft.module.tutor.trim();
                  const legacyTutorId = legacyTutorName ? profileIdForTutorName(legacyTutorName, activeTutorProfiles) : '';
                  const tutorSelectValue = selectedTutorProfile?.id || legacyTutorId || '';
                  const tutorOptions = [
                    ...(!tutorSelectValue && legacyTutorName
                      ? [{
                          value: `legacy:${normalizeTutorName(legacyTutorName)}`,
                          label: legacyTutorName,
                          description: 'Legacy tutor name - create or select a profile',
                          color: '#F59E0B',
                        }]
                      : []),
                    ...activeTutorProfiles.map(profile => ({
                      value: profile.id,
                      label: profile.name,
                      description: [
                        profile.email,
                        `${profile.sessionCount || 0} session${profile.sessionCount === 1 ? '' : 's'}`,
                      ].filter(Boolean).join(' - '),
                      color: '#1B2A4A',
                    })),
                  ];
                  const mappedKsbCount = ksbMappings.reduce(
                    (total, mapping) => total + mapping.knowledgeCodes.length + mapping.skillCodes.length + mapping.behaviourCodes.length,
                    0,
                  );
                  return (
                    <>
                      {parentGroup && (
                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-4">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Group</p>
                            <p className="mt-1 text-sm font-extrabold text-gray-800">{parentGroup.groupName || 'No group name'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Coach</p>
                            <p className="mt-1 text-sm font-extrabold text-gray-800">{parentGroup.coachName || 'TBD'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Days</p>
                            <p className="mt-1 text-sm font-extrabold text-gray-800">{parentGroup.days.join(', ') || 'No days'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Time</p>
                            <p className="mt-1 text-sm font-extrabold text-gray-800">{parentGroup.sessionStartTime} - {parentGroup.sessionEndTime}</p>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module</label>
                        {catalogModules.length > 0 ? (
                          <SelectField
                            value={selectedCatalogModule ? selectedCatalogModule.name : currentModuleLabel}
                            options={moduleOptions}
                            placeholder="Select a module"
                            accentColor={accentColor}
                            onChange={value => {
                              const selected = catalogModules.find(m => m.name === value);
                              if (selected) {
                                updateModuleDraft('mod', selected.name);
                                const sessions = Math.max(1, parseInt(selected.sessions || '1', 10) || 1);
                                updateModuleDraft('sessions', sessions);
                                updateModuleDraft('color', selected.colour || '');
                                setModuleDraft(prev => prev ? {
                                  ...prev,
                                  module: {
                                    ...prev.module,
                                    sessionKsbMappings: normalizeSessionKsbMappings([], sessions),
                                  },
                                } : prev);
                              } else {
                                updateModuleDraft('mod', value || '');
                              }
                            }}
                          />
                        ) : (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                            No modules in the catalogue yet. Use the <strong>Add Module</strong> button in the toolbar first.
                          </div>
                        )}
                        {(selectedCatalogModule || currentModuleLabel) && (
                          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${accentColor}12` }}>
                            <span className="w-3 h-5 rounded-sm shrink-0" style={{ background: accentColor }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold truncate" style={{ color: accentColor }}>{selectedCatalogModule?.name || currentModuleLabel}</p>
                              <p className="text-xs text-gray-400">{selectedCatalogModule?.sessions || moduleDraft.module.sessions} sessions</p>
                            </div>
                          </div>
                        )}
                        {!selectedCatalogModule && currentModuleLabel && (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            <p className="font-bold">This module is not in the catalogue.</p>
                            <p className="mt-0.5">
                              The saved value is <strong>{currentModuleLabel}</strong>, so existing data is shown, but catalogue details like saved session names may not match until you add or select a matching module.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module Start Date</label>
                          <DateField value={moduleDraft.module.startDate} onChange={value => updateModuleDraft('startDate', value)} placeholder="Choose start date" accentColor={accentColor} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Module End Date</label>
                          <div
                            className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm"
                            style={{ borderColor: accentColor ? `${accentColor}40` : '#D1D5DB', background: accentColor ? `${accentColor}08` : '#F9FAFB' }}
                          >
                            <i className="ri-calendar-check-line text-sm shrink-0" style={{ color: accentColor || '#6B7280' }} />
                            <span className="font-semibold" style={{ color: accentColor || '#374151' }}>
                              {moduleDraft.module.endDate ? formatDate(moduleDraft.module.endDate) : '—'}
                            </span>
                            <span className="ml-auto text-xs text-gray-400">auto</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tutor / Lecturer</label>
                        <SelectField
                          value={tutorSelectValue}
                          options={tutorOptions}
                          placeholder={activeTutorProfiles.length ? 'Select a Tutor Profile' : 'Create the first Tutor Profile'}
                          accentColor="#1B2A4A"
                          label="Tutor Profiles"
                          searchPlaceholder="Search tutors..."
                          emptyTitle="No matching tutors"
                          emptyText="Create a Tutor Profile to use this tutor."
                          error={!moduleDraft.module.tutorProfileId && moduleDraftDirty ? 'Select a valid Tutor Profile.' : undefined}
                          onChange={value => {
                            if (value.startsWith('legacy:')) return;
                            selectTutorProfileForModule(value);
                          }}
                          footer={(
                            <button
                              type="button"
                              onClick={openTutorCreateModal}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-kbc-navy transition-colors hover:bg-white"
                            >
                              <i className="ri-user-add-line" />
                              Create New Tutor Profile
                            </button>
                          )}
                        />
                        {legacyTutorName && !tutorSelectValue && (
                          <p className="mt-2 text-xs font-semibold text-amber-700">
                            Legacy tutor name found: {legacyTutorName}. Select or create a Tutor Profile before saving.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes (optional)</label>
                        <textarea value={moduleDraft.module.notes} onChange={e => updateModuleDraft('notes', e.target.value)} placeholder="Any additional notes..." rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none bg-white" />
                      </div>

                      <button
                        type="button"
                        onClick={() => setKsbEditorOpen(true)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${accentColor}14`, color: accentColor }}>
                          <i className="ri-links-line text-base" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-gray-800">Session KSB Mapping</span>
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: `${accentColor}12`, color: accentColor }}>
                              Optional
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-[11px] font-medium text-gray-400">
                            {mappedKsbCount > 0 ? `${mappedKsbCount} KSB code${mappedKsbCount === 1 ? '' : 's'} mapped` : 'Map the KSBs covered by each session.'}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold transition-colors group-hover:bg-gray-50" style={{ color: accentColor }}>
                          Open
                          <i className="ri-arrow-right-s-line text-base" />
                        </span>
                      </button>
                    </>
                  );
                })()}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 bg-white">
                <button onClick={() => void closeModuleDraft()} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors">Cancel</button>
                <button onClick={saveModuleDraft} className="px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all" style={{ background: '#1B2A4A' }}>Save Module</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {tutorCreateOpen && createPortal(
          <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]">
            <button type="button" aria-label="Close tutor profile form" className="absolute inset-0 cursor-default" onClick={() => setTutorCreateOpen(false)} />
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ background: '#1B2A4A' }}>
                <div>
                  <h3 className="text-sm font-extrabold tracking-wide text-white">Create Tutor Profile</h3>
                  <p className="mt-1 text-xs text-white/65">Profiles are reused by modules and tutor reporting.</p>
                </div>
                <button type="button" onClick={() => setTutorCreateOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                  <i className="ri-close-line text-lg" />
                </button>
              </div>
              <div className="space-y-4 bg-gray-50 p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Tutor Name</label>
                  <input
                    value={tutorCreateDraft.name}
                    onChange={event => {
                      setTutorCreateDraft(prev => ({ ...prev, name: event.target.value }));
                      setTutorCreateWarning(null);
                      setTutorCreateError('');
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveTutorProfileDraft(false);
                      }
                    }}
                    placeholder="e.g. Steven Gener"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Email (optional)</label>
                  <input
                    type="email"
                    value={tutorCreateDraft.email}
                    onChange={event => setTutorCreateDraft(prev => ({ ...prev, email: event.target.value }))}
                    placeholder="name@example.com"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Notes (optional)</label>
                  <textarea
                    value={tutorCreateDraft.notes}
                    onChange={event => setTutorCreateDraft(prev => ({ ...prev, notes: event.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none"
                  />
                </div>
                {tutorCreateWarning && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-extrabold">{tutorCreateWarning.detail}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      {tutorCreateWarning.profile.name}{tutorCreateWarning.profile.email ? ` - ${tutorCreateWarning.profile.email}` : ''}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          selectTutorProfileForModule(tutorCreateWarning.profile.id, tutorCreateWarning.profile);
                          setTutorCreateOpen(false);
                        }}
                        className="rounded-lg bg-kbc-navy px-3 py-2 text-xs font-bold text-white"
                      >
                        Use Existing Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveTutorProfileDraft(true)}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800"
                      >
                        Confirm Create New
                      </button>
                    </div>
                  </div>
                )}
                {tutorCreateError && <p className="text-xs font-semibold text-red-600">{tutorCreateError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-5 py-4">
                <button type="button" onClick={() => setTutorCreateOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={tutorCreateSaving}
                  onClick={() => void saveTutorProfileDraft(false)}
                  className="inline-flex items-center gap-2 rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {tutorCreateSaving && <i className="ri-loader-4-line animate-spin" />}
                  Create Profile
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {moduleDraft && ksbEditorOpen && createPortal(
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-4">
            <button type="button" aria-label="Close KSB editor" className="absolute inset-0 cursor-default" onClick={() => setKsbEditorOpen(false)} />
            <div className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)]">
              {(() => {
                const selectedCatalogModule = resolveCatalogModuleForValue(moduleDraft.module.mod, catalogModules);
                const currentModuleLabel = selectedCatalogModule?.name || getModuleInputValue(moduleDraft.module.mod) || 'Selected module';
                const parentGroup = data.groups.find(group => group.id === moduleDraft.parentGroupId);
                const accentColor = selectedCatalogModule?.colour || moduleDraft.module.color || parentGroup?.color || '#1B2A4A';
                const sessionCount = Math.max(1, Number(moduleDraft.module.sessions) || 1);
                const ksbMappings = normalizeSessionKsbMappings(moduleDraft.module.sessionKsbMappings, sessionCount);
                const suggestionProfiles = selectedKsbProfile ? [selectedKsbProfile] : activeKsbProfiles;
                const codeDescriptions = buildKsbDescriptionLookup(suggestionProfiles);
                const profileCodes = buildKsbProfileCodeOptions(suggestionProfiles);
                const mappedKsbCount = ksbMappings.reduce(
                  (total, mapping) => total + mapping.knowledgeCodes.length + mapping.skillCodes.length + mapping.behaviourCodes.length,
                  0,
                );

                return (
                  <>
                    <div className="flex shrink-0 items-center justify-between border-b px-5 py-3" style={{ background: '#1B2A4A' }}>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white/60">{currentModuleLabel}</p>
                        <h3 className="text-sm font-extrabold tracking-wide text-white">Session KSB Mapping</h3>
                      </div>
                      <button onClick={() => setKsbEditorOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                        <i className="ri-close-line text-lg" />
                      </button>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 bg-white px-5 py-3">
                      <span className="rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ background: `${accentColor}12`, color: accentColor }}>
                        {sessionCount} session{sessionCount === 1 ? '' : 's'}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                        {mappedKsbCount > 0 ? `${mappedKsbCount} code${mappedKsbCount === 1 ? '' : 's'} mapped` : 'No KSBs mapped yet'}
                      </span>
                      <p className="w-full text-[11px] font-medium text-gray-400 sm:w-auto">
                        Map the KSBs covered by each session, for example K1, K3, S2, B1.
                      </p>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4">
                      <KsbSessionMappingRows
                        sessionCount={sessionCount}
                        mappings={ksbMappings}
                        sessionNames={selectedCatalogModule?.sessionNames}
                        accentColor={accentColor}
                        codeDescriptions={codeDescriptions}
                        profileCodes={profileCodes}
                        onChange={updateModuleDraftKsb}
                      />
                    </div>

                    <div className="flex shrink-0 items-center justify-end border-t border-gray-200 bg-white px-5 py-3">
                      <button type="button" onClick={() => setKsbEditorOpen(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-white transition-all hover:opacity-90" style={{ background: '#1B2A4A' }}>
                        Done
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>,
          document.body,
        )}

        {selectedKsbProfile && ksbSummaryOpen && (
          <KsbCoverageSummaryModal
            profile={selectedKsbProfile}
            groups={data.groups}
            onClose={() => setKsbSummaryOpen(false)}
          />
        )}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={() => void handleRequestClose()} disabled={isSaving} className="px-5 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-200 cursor-pointer transition-all disabled:opacity-50">Cancel</button>
          <button onClick={() => void handleSave()} disabled={isSaving} className="inline-flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold text-white cursor-pointer transition-all disabled:opacity-60" style={{ background: data.color || selectedProgramme?.color || '#1B2A4A' }}>
            {isSaving && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />}
            {isSaving ? 'Saving changes...' : mode === 'add' ? 'Add Cohort' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
