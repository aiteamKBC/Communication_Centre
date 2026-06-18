import { Fragment, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { ChangeEvent } from 'react';
import type { KsbProfile, KsbProfileItem } from '../types';
import { kbcSuccessSwal, kbcSwal } from '@/components/feature/sweetAlert';
import SelectField from './SelectField';

interface Props {
  profiles: KsbProfile[];
  programmeOptions?: string[];
  onCreate: (profile: Omit<KsbProfile, 'id'>) => Promise<KsbProfile | null>;
  onUpdate: (id: string, profile: Omit<KsbProfile, 'id'>) => Promise<KsbProfile | null>;
  onDelete: (id: string) => Promise<boolean>;
  onClose: () => void;
}

const emptyProfile = (): Omit<KsbProfile, 'id'> => ({
  name: '',
  programmeName: '',
  description: '',
  ksbItems: [],
  knowledgeCodes: [],
  skillCodes: [],
  behaviourCodes: [],
  isActive: true,
});

const emptyKsbItem = (): KsbProfileItem => ({ type: 'K', number: '', code: '', description: '' });
const KSB_NUMBER_PATTERN = /^\d+(?:\.\d+)*$/;
const KSB_SECTION_LABELS: Record<'K' | 'S' | 'B', string> = { K: 'Knowledge', S: 'Skills', B: 'Behaviours' };

function normalizeKsbNumber(value: unknown): string {
  const raw = String(value || '').replace(/[^\d.]+/g, '').replace(/\.+/g, '.');
  if (!KSB_NUMBER_PATTERN.test(raw)) return '';
  return raw.split('.').map(part => String(parseInt(part, 10))).join('.');
}

function codeFromParts(type: 'K' | 'S' | 'B', number: string): string {
  return number ? `${type}${number}` : '';
}

function stepKsbNumber(value: unknown, direction: 1 | -1): string {
  const text = String(value || '').replace(/[^\d.]+/g, '').replace(/\.+/g, '.');
  if (!text) return direction > 0 ? '1' : '';
  if (/^\d+\.$/.test(text)) return direction > 0 ? `${parseInt(text, 10)}.1` : String(Math.max(1, parseInt(text, 10)));
  const normalized = normalizeKsbNumber(text);
  if (!normalized) return text;
  const parts = normalized.split('.').map(part => parseInt(part, 10));
  if (parts.length === 1) {
    return direction > 0 ? `${parts[0]}.1` : String(Math.max(1, parts[0] - 1));
  }
  const lastIndex = parts.length - 1;
  if (direction < 0 && parts[lastIndex] <= 1) {
    return parts.slice(0, lastIndex).join('.');
  }
  parts[lastIndex] = Math.max(1, parts[lastIndex] + direction);
  return parts.join('.');
}

function compareKsbNumbers(a: string, b: string): number {
  const aParts = a.split('.').map(part => parseInt(part, 10));
  const bParts = b.split('.').map(part => parseInt(part, 10));
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    if (aParts[index] === undefined) return -1;
    if (bParts[index] === undefined) return 1;
    if (aParts[index] !== bParts[index]) return aParts[index] - bParts[index];
  }
  return 0;
}

function itemsFromProfile(profile: Pick<KsbProfile, 'ksbItems' | 'knowledgeCodes' | 'skillCodes' | 'behaviourCodes'>): KsbProfileItem[] {
  if (Array.isArray(profile.ksbItems)) {
    return profile.ksbItems.map(item => {
      const type = item.type === 'S' || item.type === 'B' ? item.type : 'K';
      const number = normalizeKsbNumber(item.number || item.code?.replace(/^[KSB]/i, ''));
      return {
        type,
        number,
        code: codeFromParts(type, number),
        description: String(item.description || ''),
      };
    });
  }
  return [
    ...(profile.knowledgeCodes || []).map(code => ({ type: 'K' as const, number: code.replace(/^K/i, ''), code: code.toUpperCase(), description: '' })),
    ...(profile.skillCodes || []).map(code => ({ type: 'S' as const, number: code.replace(/^S/i, ''), code: code.toUpperCase(), description: '' })),
    ...(profile.behaviourCodes || []).map(code => ({ type: 'B' as const, number: code.replace(/^B/i, ''), code: code.toUpperCase(), description: '' })),
  ];
}

function sortKsbItems(items: KsbProfileItem[]): KsbProfileItem[] {
  const typeOrder = { K: 0, S: 1, B: 2 };
  return [...items].sort((a, b) => {
    const aReady = Boolean(a.code && KSB_NUMBER_PATTERN.test(a.number));
    const bReady = Boolean(b.code && KSB_NUMBER_PATTERN.test(b.number));
    if (aReady !== bReady) return aReady ? -1 : 1;
    if (aReady && bReady) {
      const typeCompare = typeOrder[a.type] - typeOrder[b.type];
      if (typeCompare !== 0) return typeCompare;
      return compareKsbNumbers(a.number, b.number);
    }
    return 0;
  });
}

function orderedItemsFromProfile(profile: Pick<KsbProfile, 'ksbItems' | 'knowledgeCodes' | 'skillCodes' | 'behaviourCodes'>): KsbProfileItem[] {
  return sortKsbItems(itemsFromProfile(profile));
}

function normalizeItems(value: unknown): KsbProfileItem[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return sortKsbItems(raw.reduce<KsbProfileItem[]>((items, item) => {
    const record = item && typeof item === 'object' ? item as Partial<KsbProfileItem> : {};
    const type = String(record.type || '').toUpperCase();
    if (type !== 'K' && type !== 'S' && type !== 'B') return items;
    const number = normalizeKsbNumber(record.number || record.code?.replace(/^[KSB]/i, ''));
    if (!number) return items;
    const code = codeFromParts(type, number);
    if (seen.has(code)) return items;
    seen.add(code);
    items.push({ type, number, code, description: String(record.description || '').trim() });
    return items;
  }, []));
}

function codesFromItems(items: KsbProfileItem[], type: 'K' | 'S' | 'B'): string[] {
  return normalizeItems(items).filter(item => item.type === type).map(item => item.code);
}

function cellText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value: unknown): string {
  return cellText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function itemFromTemplateRow(row: unknown[], headerIndexes: Record<string, number>): KsbProfileItem | null {
  const codeText = cellText(row[headerIndexes.code]);
  const typeText = cellText(row[headerIndexes.type]).toUpperCase();
  const numberText = cellText(row[headerIndexes.number]);
  const description = cellText(row[headerIndexes.description]);
  const codeMatch = codeText.toUpperCase().match(/^([KSB])\s*(\d+(?:\.\d+)*)$/);
  const type = codeMatch?.[1] || (typeText === 'S' || typeText === 'B' ? typeText : typeText === 'K' ? 'K' : '');
  const number = normalizeKsbNumber(codeMatch?.[2] || numberText);
  if (type !== 'K' && type !== 'S' && type !== 'B') return null;
  if (!number) return null;
  return { type, number, code: codeFromParts(type, number), description };
}

function parseKsbTemplateRows(rows: unknown[][]): KsbProfileItem[] {
  const usefulRows = rows.filter(row => row.some(cell => cellText(cell)));
  const headerRowIndex = usefulRows.findIndex(row => {
    const headers = row.map(normalizeHeader);
    return headers.some(header => ['code', 'ksbcode', 'ksb'].includes(header)) ||
      (headers.some(header => ['type', 'category'].includes(header)) && headers.some(header => ['number', 'no', 'num'].includes(header)));
  });
  const headers = headerRowIndex >= 0 ? usefulRows[headerRowIndex].map(normalizeHeader) : [];
  const headerIndexes = {
    code: headers.findIndex(header => ['code', 'ksbcode', 'ksb'].includes(header)),
    type: headers.findIndex(header => ['type', 'category'].includes(header)),
    number: headers.findIndex(header => ['number', 'no', 'num'].includes(header)),
    description: headers.findIndex(header => ['description', 'desc', 'detail', 'details'].includes(header)),
  };
  const dataRows = headerRowIndex >= 0 ? usefulRows.slice(headerRowIndex + 1) : usefulRows;
  const indexes = headerRowIndex >= 0
    ? headerIndexes
    : { code: 0, type: 0, number: 1, description: 2 };
  return normalizeItems(dataRows.map(row => itemFromTemplateRow(row, indexes)).filter(Boolean));
}

function safeFileName(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export default function KsbProfilesManager({ profiles, programmeOptions = [], onCreate, onUpdate, onDelete, onClose }: Props) {
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(profiles[0]?.id || null);
  const [draft, setDraft] = useState<Omit<KsbProfile, 'id'>>(profiles[0] ? { ...profiles[0], ksbItems: orderedItemsFromProfile(profiles[0]) } : emptyProfile());
  const [draftSnapshot, setDraftSnapshot] = useState(() => JSON.stringify(profiles[0] ? { ...profiles[0], ksbItems: orderedItemsFromProfile(profiles[0]) } : emptyProfile()));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<KsbProfileItem>(() => emptyKsbItem());
  const [addMode, setAddMode] = useState<'header' | 'point'>('header');
  const [addParentCode, setAddParentCode] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<'K' | 'S' | 'B', boolean>>({ K: false, S: false, B: false });
  const [collapsedHeaders, setCollapsedHeaders] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(profile => (
      profile.name.toLowerCase().includes(q) ||
      profile.programmeName.toLowerCase().includes(q) ||
      [...profile.knowledgeCodes, ...profile.skillCodes, ...profile.behaviourCodes].some(code => code.toLowerCase().includes(q)) ||
      orderedItemsFromProfile(profile).some(item => item.description.toLowerCase().includes(q))
    ));
  }, [profiles, query]);

  const programmeStandardOptions = useMemo(() => {
    const values = new Set<string>();
    programmeOptions.forEach(item => {
      const value = item.replace(/\s+/g, ' ').trim();
      if (value) values.add(value);
    });
    profiles.forEach(profile => {
      const value = profile.programmeName.replace(/\s+/g, ' ').trim();
      if (value) values.add(value);
    });
    const currentValue = draft.programmeName.replace(/\s+/g, ' ').trim();
    if (currentValue) values.add(currentValue);
    return Array.from(values)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map(value => ({
        value,
        label: value,
        description: profiles.some(profile => profile.programmeName.replace(/\s+/g, ' ').trim() === value) ? 'Used by KSB profile' : 'Programme standard',
        color: '#1B2A4A',
      }));
  }, [draft.programmeName, profiles, programmeOptions]);

  const profileReady = Boolean(draft.name.trim() && draft.programmeName.trim());
  const draftDirty = JSON.stringify(draft) !== draftSnapshot;

  const confirmDiscardDraft = async () => {
    if (!draftDirty) return true;
    const result = await kbcSwal.fire({
      title: 'Discard unsaved profile changes?',
      html: 'You have unsaved KSB Profile changes. Save them first, or discard them to continue.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Discard',
      cancelButtonText: 'Keep editing',
      reverseButtons: true,
    });
    return result.isConfirmed;
  };

  const selectProfile = async (profile: KsbProfile) => {
    if (!(await confirmDiscardDraft())) return;
    const next = { ...profile, ksbItems: orderedItemsFromProfile(profile) };
    setSelectedId(profile.id);
    setDraft(next);
    setDraftSnapshot(JSON.stringify(next));
  };

  const startNew = async () => {
    if (!(await confirmDiscardDraft())) return;
    const next = emptyProfile();
    setSelectedId(null);
    setDraft(next);
    setDraftSnapshot(JSON.stringify(next));
  };

  const updateDraft = <K extends keyof Omit<KsbProfile, 'id'>>(key: K, value: Omit<KsbProfile, 'id'>[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const updateItem = (index: number, patch: Partial<KsbProfileItem>) => {
    setDraft(prev => {
      const items = [...orderedItemsFromProfile(prev)];
      const current = items[index] || emptyKsbItem();
      const next = { ...current, ...patch };
      const type = next.type === 'S' || next.type === 'B' ? next.type : 'K';
      const numberInput = String(next.number || '').replace(/[^\d.]+/g, '').replace(/\.+/g, '.');
      const number = normalizeKsbNumber(numberInput);
      items[index] = { type, number: number || numberInput, code: codeFromParts(type, number), description: next.description || '' };
      return { ...prev, ksbItems: sortKsbItems(items) };
    });
  };

  const addItem = () => {
    if (!profileReady) {
      void kbcSwal.fire({ title: 'Complete profile details first', html: 'Please enter the Profile name and Programme / standard before adding KSB definitions.', icon: 'info', confirmButtonText: 'OK' });
      return;
    }
    setAddDraft(emptyKsbItem());
    setAddMode('header');
    setAddParentCode('');
    setAddDialogOpen(true);
  };

  const nextChildNumberFor = (parent: KsbProfileItem): string => {
    const childPattern = new RegExp(`^${parent.number.replace(/\./g, '\\.')}\\.(\\d+)$`);
    const nextIndex = profileItems.reduce((max, item) => {
      if (item.type !== parent.type) return max;
      const match = item.number.match(childPattern);
      if (!match) return max;
      return Math.max(max, parseInt(match[1], 10));
    }, 0) + 1;
    return `${parent.number}.${nextIndex}`;
  };

  const addChildItem = (parent: KsbProfileItem) => {
    const type = parent.type === 'S' || parent.type === 'B' ? parent.type : 'K';
    const number = nextChildNumberFor(parent);
    setAddDraft({ type, number, code: codeFromParts(type, number), description: '' });
    setAddMode('point');
    setAddParentCode(parent.code);
    setAddDialogOpen(true);
  };

  const updateAddDraft = (patch: Partial<KsbProfileItem>) => {
    setAddDraft(prev => {
      const next = { ...prev, ...patch };
      const type = next.type === 'S' || next.type === 'B' ? next.type : 'K';
      const numberInput = String(next.number || '').replace(/[^\d.]+/g, '').replace(/\.+/g, '.');
      const number = normalizeKsbNumber(numberInput);
      return { type, number: number || numberInput, code: codeFromParts(type, number), description: next.description || '' };
    });
  };

  const confirmAddItem = () => {
    const item = normalizeItems([addDraft])[0];
    if (!item) {
      void kbcSwal.fire({ title: 'Complete KSB number', html: 'Please enter a full number such as 1 for a header, or 1.1 for a point under it.', icon: 'info', confirmButtonText: 'OK' });
      return;
    }
    const existing = normalizeItems(draft.ksbItems).some(current => current.code === item.code);
    if (existing) {
      void kbcSwal.fire({ title: 'KSB already exists', html: `${item.code} is already in this profile.`, icon: 'info', confirmButtonText: 'OK' });
      return;
    }
    setDraft(prev => ({ ...prev, ksbItems: sortKsbItems([...orderedItemsFromProfile(prev), item]) }));
    if (addMode === 'point' && addParentCode) {
      setCollapsedHeaders(prev => ({ ...prev, [addParentCode]: false }));
    }
    setAddDialogOpen(false);
    setAddDraft(emptyKsbItem());
    setAddMode('header');
    setAddParentCode('');
  };

  const openTemplateUpload = () => {
    if (!profileReady) {
      void kbcSwal.fire({ title: 'Complete profile details first', html: 'Please enter the Profile name and Programme / standard before uploading KSB definitions.', icon: 'info', confirmButtonText: 'OK' });
      return;
    }
    templateInputRef.current?.click();
  };

  const downloadTemplate = () => {
    const rows = [
      ['Type', 'Number', 'Code', 'Description'],
      ['K', '1', 'K1', 'Knowledge header example'],
      ['K', '1.1', 'K1.1', 'Knowledge point example'],
      ['S', '1', 'S1', 'Skill header example'],
      ['S', '1.1', 'S1.1', 'Skill point example'],
      ['B', '1', 'B1', 'Behaviour header example'],
      ['B', '1.1', 'B1.1', 'Behaviour point example'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 52 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'KSB Definitions');
    const namePart = safeFileName(draft.name || draft.programmeName, 'ksb-profile');
    XLSX.writeFile(workbook, `${namePart}-ksb-template.xlsx`);
  };

  const importTemplate = async (file: File) => {
    setImportingTemplate(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!worksheet) {
        await kbcSwal.fire({ title: 'Empty template', html: 'The selected file does not contain a readable sheet.', icon: 'warning', confirmButtonText: 'OK' });
        return;
      }
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
      const importedItems = parseKsbTemplateRows(rows);
      if (!importedItems.length) {
        await kbcSwal.fire({ title: 'No KSBs found', html: 'Use columns like Code and Description, or Type, Number, and Description.', icon: 'info', confirmButtonText: 'OK' });
        return;
      }
      const nextItems = [...orderedItemsFromProfile(draft)];
      const indexByCode = new Map(nextItems.map((item, index) => [item.code, index]));
      let added = 0;
      let updated = 0;
      let unchanged = 0;
      importedItems.forEach(item => {
        const existingIndex = indexByCode.get(item.code);
        if (existingIndex !== undefined) {
          const existing = nextItems[existingIndex];
          if (existing.type === item.type && existing.number === item.number && existing.description === item.description) {
            unchanged += 1;
            return;
          }
          nextItems[existingIndex] = item;
          updated += 1;
          return;
        }
        indexByCode.set(item.code, nextItems.length);
        nextItems.push(item);
        added += 1;
      });
      setDraft(prev => ({ ...prev, ksbItems: sortKsbItems(nextItems) }));
      await kbcSwal.fire({
        title: added || updated ? 'Template uploaded' : 'No KSB changes found',
        html: `${added} KSB code${added === 1 ? '' : 's'} added.${updated ? ` ${updated} updated.` : ''}${unchanged ? ` ${unchanged} unchanged.` : ''}`,
        icon: added || updated ? 'success' : 'info',
        confirmButtonText: 'OK',
      });
    } catch {
      await kbcSwal.fire({ title: 'Could not read template', html: 'Please upload a valid Excel or CSV file.', icon: 'error', confirmButtonText: 'OK' });
    } finally {
      setImportingTemplate(false);
    }
  };

  const handleTemplateFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importTemplate(file);
  };

  const removeItem = async (index: number) => {
    const item = profileItems[index];
    const result = await kbcSwal.fire({
      title: 'Delete KSB?',
      html: item?.code ? `This will remove <strong>${item.code}</strong> from this profile.` : 'This KSB definition will be removed from this profile.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });
    if (!result.isConfirmed) return;
    setDraft(prev => ({ ...prev, ksbItems: orderedItemsFromProfile(prev).filter((_, itemIndex) => itemIndex !== index) }));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      await kbcSwal.fire({ title: 'Profile Name Required', icon: 'warning', confirmButtonText: 'OK' });
      return;
    }
    if (!draft.programmeName.trim()) {
      await kbcSwal.fire({ title: 'Programme Required', html: 'Please enter the Programme / standard before saving this KSB Profile.', icon: 'warning', confirmButtonText: 'OK' });
      return;
    }
    setSaving(true);
    let shouldClose = false;
    try {
      const ksbItems = normalizeItems(draft.ksbItems);
      const payload = {
        ...draft,
        name: draft.name.trim(),
        programmeName: draft.programmeName.trim(),
        description: draft.description.trim(),
        ksbItems,
        knowledgeCodes: codesFromItems(ksbItems, 'K'),
        skillCodes: codesFromItems(ksbItems, 'S'),
        behaviourCodes: codesFromItems(ksbItems, 'B'),
      };
      const saved = selectedId ? await onUpdate(selectedId, payload) : await onCreate(payload);
      if (saved) {
        const next = { ...saved, ksbItems: orderedItemsFromProfile(saved) };
        setSelectedId(saved.id);
        setDraft(next);
        setDraftSnapshot(JSON.stringify(next));
        shouldClose = true;
      }
    } finally {
      setSaving(false);
    }
    if (shouldClose) {
      await kbcSuccessSwal.fire({
        icon: 'success',
        title: 'KSB Profile Saved',
        html: 'The KSB profile was saved successfully.',
        confirmButtonText: 'OK',
      });
      onClose();
    }
  };

  const deleteSelected = async () => {
    if (!selectedId) return;
    await deleteProfile(selectedId);
  };

  const deleteProfile = async (profileId: string) => {
    const profileName = profiles.find(profile => profile.id === profileId)?.name || draft.name || 'this KSB Profile';
    const result = await kbcSwal.fire({
      title: 'Delete KSB Profile?',
      html: `Are you sure you want to delete <strong>${profileName}</strong>? Profiles already used by cohorts will be deactivated instead.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });
    if (!result.isConfirmed) return;
    setDeleting(true);
    void kbcSwal.fire({
      title: 'Deleting profile...',
      html: 'Please wait while the KSB profile is being removed.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        kbcSwal.showLoading();
      },
    });
    try {
      const ok = await onDelete(profileId);
      if (ok && selectedId === profileId) {
        const next = emptyProfile();
        setSelectedId(null);
        setDraft(next);
        setDraftSnapshot(JSON.stringify(next));
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = async () => {
    if (!(await confirmDiscardDraft())) return;
    onClose();
  };

  const profileItems = orderedItemsFromProfile(draft);
  const toggleSection = (type: 'K' | 'S' | 'B') => {
    setCollapsedSections(prev => ({ ...prev, [type]: !prev[type] }));
  };
  const toggleHeader = (code: string) => {
    setCollapsedHeaders(prev => ({ ...prev, [code]: !prev[code] }));
  };
  const counts = normalizeItems(profileItems).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-2 backdrop-blur-[3px] sm:p-4">
      <button type="button" aria-label="Close KSB profiles" className="absolute inset-0 cursor-default" onClick={() => { if (!deleting) void handleClose(); }} />
      <div className="relative flex min-h-0 max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl md:max-h-[calc(100vh-2rem)] md:flex-row">
        <div className="max-h-[38vh] w-full shrink-0 border-b border-gray-200 bg-gray-50 md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <div className="border-b border-gray-200 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-kbc-navy">KSB Profiles</h2>
                <p className="mt-0.5 text-xs font-medium text-gray-400">{profiles.length} profile{profiles.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={() => void startNew()} disabled={deleting} className="flex h-8 w-8 items-center justify-center rounded-lg bg-kbc-navy text-white disabled:opacity-50">
                <i className="ri-add-line" />
              </button>
            </div>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search profiles" className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
          </div>
          <div className="max-h-[calc(38vh-5.5rem)] overflow-auto overscroll-contain p-2 md:max-h-[calc(100vh-10rem)]">
            {filtered.map(profile => (
              <div key={profile.id} className="mb-1 rounded-lg border px-3 py-2 transition-all" style={{ borderColor: selectedId === profile.id ? '#1B2A4A' : '#E5E7EB', background: selectedId === profile.id ? '#F8FAFC' : '#fff' }}>
                <button type="button" onClick={() => void selectProfile(profile)} disabled={deleting} className="w-full text-left disabled:cursor-not-allowed">
                  <span className="block truncate text-xs font-extrabold text-gray-800">{profile.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-gray-400">{profile.programmeName || 'No programme linked'}</span>
                </button>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void selectProfile(profile)}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-extrabold text-kbc-navy hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-pencil-line text-xs" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteProfile(profile.id)}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-delete-bin-line text-xs" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!filtered.length && <p className="p-4 text-center text-xs font-semibold text-gray-400">No profiles found.</p>}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-kbc-navy px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white/60">{selectedId ? 'Edit profile' : 'New profile'}</p>
              <h3 className="truncate text-base font-extrabold text-white">{draft.name || 'KSB Profile'}</h3>
            </div>
            <button type="button" onClick={() => void handleClose()} disabled={deleting} className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-50">
              <i className="ri-close-line text-lg" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto overscroll-contain bg-gray-50 p-3 sm:p-5">
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kbc-navy text-xs font-extrabold text-white">1</span>
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-700">Profile details</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-gray-400">Complete these fields before adding KSB definitions.</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Profile name <span className="text-red-500">*</span></label>
                    <input value={draft.name} onChange={event => updateDraft('name', event.target.value)} placeholder="Marketing Executive Level 4 KSB" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Programme / standard <span className="text-red-500">*</span></label>
                    <SelectField
                      value={draft.programmeName}
                      options={programmeStandardOptions}
                      onChange={value => updateDraft('programmeName', value)}
                      placeholder="Select programme / standard"
                      accentColor="#1B2A4A"
                      label="Programmes"
                      searchPlaceholder="Search programmes..."
                      emptyTitle="No matching programmes"
                      emptyText="Choose one of the Training Plan programmes."
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Notes</label>
                  <textarea value={draft.description} onChange={event => updateDraft('description', event.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
            </div>
            <div className={`rounded-xl border bg-white ${profileReady ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-75'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${profileReady ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-400'}`}>2</span>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-700">KSB definitions</h4>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={templateInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleTemplateFileChange} />
                  <button type="button" onClick={downloadTemplate} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-extrabold text-kbc-navy shadow-sm hover:border-kbc-navy/20 hover:bg-gray-50">
                    <i className="ri-download-2-line" />
                    Download Template
                  </button>
                  <button type="button" onClick={openTemplateUpload} disabled={!profileReady || importingTemplate} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-extrabold text-kbc-navy shadow-sm hover:border-kbc-navy/20 hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300 disabled:shadow-none">
                    <i className="ri-upload-2-line" />
                    {importingTemplate ? 'Uploading...' : 'Upload Template'}
                  </button>
                  <button type="button" onClick={addItem} disabled={!profileReady} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-kbc-navy px-4 text-xs font-extrabold text-white shadow-sm hover:bg-kbc-navy/90 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none">
                    <i className="ri-add-line" />
                    Add KSB
                  </button>
                </div>
              </div>
              <div className="space-y-2 p-4">
                {profileItems.map((item, index) => {
                  const type = item.type === 'S' || item.type === 'B' ? item.type : 'K';
                  const previousType = index > 0 ? profileItems[index - 1]?.type : '';
                  const showSectionHeader = previousType !== type;
                  const sectionCollapsed = collapsedSections[type];
                  const numberParts = item.number.split('.').filter(Boolean);
                  const depth = Math.max(0, numberParts.length - 1);
                  const isChild = depth > 0;
                  const parentNumber = isChild ? numberParts.slice(0, -1).join('.') : '';
                  const parentCode = parentNumber ? codeFromParts(type, parentNumber) : '';
                  const parentCollapsed = Boolean(parentCode && collapsedHeaders[parentCode]);
                  const hasChildren = profileItems.some(candidate => candidate.type === type && candidate.number.startsWith(`${item.number}.`));
                  const headerCollapsed = Boolean(item.code && collapsedHeaders[item.code]);
                  const tone = type === 'K'
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : type === 'S'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800';
                  const rowTone = hasChildren
                    ? 'border-kbc-navy/15 bg-white'
                    : isChild
                      ? 'border-gray-100 bg-white'
                      : 'border-gray-100 bg-gray-50';
                  return (
                    <Fragment key={`${item.code || 'new'}-${index}`}>
                    {showSectionHeader && (
                      <button
                        type="button"
                        onClick={() => toggleSection(type)}
                        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:bg-white"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-extrabold ${tone}`}>{type}</span>
                          <span className="min-w-0">
                            <span className="block text-xs font-extrabold text-gray-800">{KSB_SECTION_LABELS[type]}</span>
                          </span>
                        </span>
                        <i className={`ri-arrow-down-s-line text-lg text-gray-400 transition-transform ${sectionCollapsed ? '-rotate-90' : ''}`} />
                      </button>
                    )}
                    {!sectionCollapsed && !parentCollapsed && (
                    <>
                    <div className={`relative grid gap-2 rounded-lg border p-2 ${rowTone} sm:grid-cols-[76px_minmax(110px,0.65fr)_minmax(0,1fr)_auto_auto] md:grid-cols-[92px_110px_minmax(0,1fr)_104px_32px_34px]`} style={{ marginLeft: isChild ? `${Math.min(depth, 3) * 12}px` : 0 }}>
                      {isChild && (
                        <span className="absolute -left-4 top-1/2 h-px w-3 bg-gray-300" aria-hidden="true" />
                      )}
                      <select
                        value={type}
                        onChange={event => updateItem(index, { type: event.target.value as 'K' | 'S' | 'B' })}
                        className="h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm font-extrabold focus:outline-none"
                      >
                        <option value="K">K</option>
                        <option value="S">S</option>
                        <option value="B">B</option>
                      </select>
                      <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-white px-2">
                        <span className={`mr-2 rounded-md border px-1.5 py-1 text-[10px] font-extrabold ${tone}`}>{type}</span>
                        {isChild && <span className="mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" aria-hidden="true" />}
                        <input
                          value={item.number}
                          onChange={event => updateItem(index, { number: event.target.value })}
                          placeholder={isChild ? '1.1' : '1'}
                          inputMode="decimal"
                          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-800 focus:outline-none"
                        />
                        <div className="ml-1 flex flex-col overflow-hidden rounded-md border border-gray-100">
                          <button type="button" aria-label={`Increase ${item.code || 'KSB number'}`} onClick={() => updateItem(index, { number: stepKsbNumber(item.number, 1) })} className="flex h-4 w-5 items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-kbc-navy">
                            <i className="ri-arrow-up-s-line text-sm leading-none" />
                          </button>
                          <button type="button" aria-label={`Decrease ${item.code || 'KSB number'}`} onClick={() => updateItem(index, { number: stepKsbNumber(item.number, -1) })} className="flex h-4 w-5 items-center justify-center border-t border-gray-100 text-gray-400 hover:bg-gray-50 hover:text-kbc-navy">
                            <i className="ri-arrow-down-s-line text-sm leading-none" />
                          </button>
                        </div>
                      </div>
                      <input
                        value={item.description}
                        onChange={event => updateItem(index, { description: event.target.value })}
                        placeholder={`${item.code || `${type} number`} description`}
                        className={`h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none ${hasChildren ? 'font-bold text-gray-900' : ''}`}
                      />
                      {!isChild && item.code ? (
                        <button type="button" onClick={() => addChildItem(item)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-kbc-navy px-3 text-xs font-bold text-white hover:bg-kbc-navy/90">
                          <i className="ri-add-line" />
                          Add point
                        </button>
                      ) : (
                        <span className="hidden md:block" />
                      )}
                      <button type="button" onClick={() => void removeItem(index)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 md:w-8">
                        <i className="ri-delete-bin-line" />
                      </button>
                      {hasChildren ? (
                        <button
                          type="button"
                          aria-label={`${headerCollapsed ? 'Expand' : 'Collapse'} ${item.code}`}
                          title={`${headerCollapsed ? 'Expand' : 'Collapse'} ${item.code}`}
                          onClick={() => toggleHeader(item.code)}
                          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-kbc-navy hover:border-kbc-navy/25 hover:bg-gray-50 md:w-8"
                        >
                          <i className={`ri-arrow-down-s-line text-lg transition-transform ${headerCollapsed ? '-rotate-90' : ''}`} />
                        </button>
                      ) : (
                        <span className="hidden md:block" />
                      )}
                    </div>
                    </>
                    )}
                    </Fragment>
                  );
                })}
                {!profileItems.length && (
                  <button type="button" onClick={addItem} disabled={!profileReady} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm font-bold text-gray-400 hover:border-kbc-navy hover:text-kbc-navy disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-gray-400">
                    <i className="ri-add-line" />
                    {profileReady ? 'Add the first KSB definition' : 'Complete profile details first'}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3 sm:px-5">
            <span className="text-xs font-bold text-gray-400">{counts} required KSB code{counts === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              {selectedId && <button type="button" onClick={deleteSelected} disabled={deleting} className="rounded-lg px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">Delete</button>}
              <button type="button" onClick={save} disabled={saving || deleting || !profileReady} className="rounded-lg bg-kbc-navy px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {addDialogOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 p-4">
          <button type="button" aria-label="Close add KSB dialog" className="absolute inset-0 cursor-default" onClick={() => { setAddDialogOpen(false); setAddMode('header'); setAddParentCode(''); }} />
          <form
            onSubmit={event => {
              event.preventDefault();
              confirmAddItem();
            }}
            className="relative w-full max-w-md rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-extrabold text-kbc-navy">Add KSB</h3>
                <p className="mt-0.5 text-xs font-medium text-gray-400">
                  {addMode === 'point' ? 'Add a decimal child point under the selected header.' : 'Add a whole-number header first.'}
                </p>
              </div>
              <button type="button" onClick={() => { setAddDialogOpen(false); setAddMode('header'); setAddParentCode(''); }} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
                <div>
                  <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Type</label>
                  <select
                    value={addDraft.type}
                    onChange={event => updateAddDraft({ type: event.target.value as 'K' | 'S' | 'B' })}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-extrabold focus:outline-none"
                  >
                    <option value="K">K</option>
                    <option value="S">S</option>
                    <option value="B">B</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Number</label>
                  <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-white px-3">
                    <input
                      value={addDraft.number}
                      onChange={event => updateAddDraft({ number: event.target.value })}
                      placeholder={addMode === 'point' ? '1.1' : '1'}
                      inputMode="decimal"
                      className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-800 focus:outline-none"
                    />
                    <div className="ml-2 flex flex-col overflow-hidden rounded-md border border-gray-100">
                      <button type="button" aria-label="Increase KSB number" onClick={() => updateAddDraft({ number: stepKsbNumber(addDraft.number, 1) })} className="flex h-4 w-5 items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-kbc-navy">
                        <i className="ri-arrow-up-s-line text-sm leading-none" />
                      </button>
                      <button type="button" aria-label="Decrease KSB number" onClick={() => updateAddDraft({ number: stepKsbNumber(addDraft.number, -1) })} className="flex h-4 w-5 items-center justify-center border-t border-gray-100 text-gray-400 hover:bg-gray-50 hover:text-kbc-navy">
                        <i className="ri-arrow-down-s-line text-sm leading-none" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-gray-400">
                    {addMode === 'point' ? `Example: ${addDraft.type}1.1 is a point under ${addDraft.type}1.` : `Example: ${addDraft.type}1 is a header.`}
                  </p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wider text-gray-500">Description</label>
                <textarea
                  value={addDraft.description}
                  onChange={event => updateAddDraft({ description: event.target.value })}
                  rows={3}
                  placeholder={`${addDraft.code || `${addDraft.type} number`} description`}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button type="button" onClick={() => { setAddDialogOpen(false); setAddMode('header'); setAddParentCode(''); }} className="rounded-lg px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancel</button>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-kbc-navy px-4 py-2 text-sm font-bold text-white">
                <i className="ri-add-line" />
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
