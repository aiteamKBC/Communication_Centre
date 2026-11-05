import { useEffect, useMemo, useState } from 'react';
import SelectField from './SelectField';
import { compareLmsModule, comparisonModuleName, differenceLabels, lmsCohortDisplayName, matchLmsPlans, presentLmsRows, type CurrentPlanRecord } from '../lmsComparison';
import { lmsRecordGroup } from '../lmsTimelineLayout';
import { requestLmsCohorts, requestLmsReference, requestLmsTutorNames, type LmsReferenceRow } from '../lmsReference';
import { tutorDisplayName } from '../tutorProfiles';
import type { CustomModule, Holiday, ProgrammeGroup, TutorProfile } from '../types';

export const currentMatchKey = (record: CurrentPlanRecord) => JSON.stringify([record.programme.id, record.cohort.id, record.block.id]);
export type SaveLmsModuleMatch = (current: CurrentPlanRecord, sourceModuleId: string) => Promise<boolean>;
const moduleWords = (name: string | null | undefined) => new Set(name?.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
const MODULE_FILTER_FIELDS = [
  { key: 'programme', label: 'Programme' },
  { key: 'cohort', label: 'Cohort', dependsOn: ['programme'] },
  { key: 'group', label: 'Group', dependsOn: ['programme', 'cohort'] },
  { key: 'tutor', label: 'Tutor', dependsOn: ['programme', 'cohort'] },
];

export default function LmsModuleMatcher({ groups, customModules = [], holidays = [], tutorProfiles = [], currentKey, catalogueModule, initialOpen = false, comparisonOnly = false, onSave }: {
  groups: ProgrammeGroup[];
  customModules?: CustomModule[];
  holidays?: Holiday[];
  tutorProfiles?: TutorProfile[];
  currentKey?: string;
  catalogueModule?: { id: number; name: string };
  initialOpen?: boolean;
  comparisonOnly?: boolean;
  onSave?: SaveLmsModuleMatch;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sourceRows, setSourceRows] = useState<LmsReferenceRow[]>([]);
  const [selectedCurrent, setSelectedCurrent] = useState(currentKey || '');
  const [selectedLms, setSelectedLms] = useState('');
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const currentRecords = useMemo(() => groups.flatMap(programme => programme.rows.flatMap(cohort => cohort.blks.map(block => ({
    programme, cohort, block, module: comparisonModuleName(block, customModules),
  })))), [groups, customModules]);
  const options = currentRecords.filter(record => currentKey ? currentMatchKey(record) === currentKey
    : !catalogueModule || (record.block.moduleCatalogueId
      ? record.block.moduleCatalogueId === String(catalogueModule.id)
      : record.module.trim().toLowerCase() === catalogueModule.name.trim().toLowerCase()));
  const activeKey = currentKey || selectedCurrent || (options.length === 1 ? currentMatchKey(options[0]) : '');
  const current = options.find(record => currentMatchKey(record) === activeKey);
  const records = useMemo(() => presentLmsRows(sourceRows, groups, customModules), [sourceRows, groups, customModules]);
  const automatic = useMemo(() => matchLmsPlans(groups, records, customModules).matched
    .find(pair => pair.method === 'automatic' && currentMatchKey(pair.current) === activeKey), [groups, records, customModules, activeKey]);

  useEffect(() => {
    setSelectedLms(current?.block.lmsSourceModuleId || automatic?.lms.sourceModuleId || '');
  }, [activeKey, current?.block.lmsSourceModuleId, automatic?.lms.sourceModuleId]);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setLoadFailed(false);
    void (async () => {
      try {
        const reference = await requestLmsReference();
        if (!reference) throw new Error('Capture an LMS reference before matching modules.');
        const labels = await Promise.allSettled([requestLmsCohorts(), requestLmsTutorNames()]);
        if (cancelled) return;
        const cohorts = labels[0].status === 'fulfilled' ? labels[0].value : {};
        const tutors = labels[1].status === 'fulfilled' ? labels[1].value : {};
        setSourceRows(reference.records.map(row => ({ ...row, ...cohorts[row.sourceModuleId], tutorName: tutors[row.sourceModuleId] ?? row.tutorName })));
        setLoaded(true);
        if (labels.some(result => result.status === 'rejected')) {
          setError('Some LMS labels could not be loaded. Module IDs and captured dates are available; retry to load all labels.');
          setLoadFailed(true);
        }
      } catch (failure) {
        if (!cancelled) { setError(failure instanceof Error ? failure.message : 'Could not load LMS modules.'); setLoadFailed(true); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, loaded, retry]);

  const selected = records.find(record => record.sourceModuleId === selectedLms);
  const reserved = new Set(currentRecords.filter(record => currentMatchKey(record) !== activeKey)
    .map(record => record.block.lmsSourceModuleId).filter(Boolean));
  const programmeModules = comparisonOnly ? records : records.filter(record => record.planProgrammeId === current?.programme.id);
  const currentWords = moduleWords(current?.module);
  const available = programmeModules
    .map(record => ({ ...record, sharedWords: [...moduleWords(record.module)].filter(word => currentWords.has(word)).length }))
    .sort((left, right) => right.sharedWords - left.sharedWords
      || (left.module || 'Untitled module').localeCompare(right.module || 'Untitled module'));
  const preview = current && selected ? compareLmsModule(current, selected, holidays, tutorProfiles) : undefined;
  const save = async (sourceId: string) => {
    if (!current || saving || !onSave || comparisonOnly) return;
    if (sourceId && (!selected || selected.planProgrammeId !== current.programme.id || reserved.has(sourceId))) {
      setError('Choose an available LMS module from the same programme.');
      return;
    }
    setSaving(true); setError(''); setLoadFailed(false); setNotice('');
    try {
      if (await onSave(current, sourceId)) {
        setSelectedLms(sourceId);
        setNotice(sourceId ? 'Manual match saved.' : 'Manual match removed. Automatic matching applies again.');
      } else setError('The match was not saved. Check the save message and retry.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The match was not saved.'); }
    finally { setSaving(false); }
  };
  const rows = current && selected ? [
    ['Programme', current.programme.name, selected.programme],
    ['Cohort', current.cohort.label, selected.cohortName || 'Not provided'],
    ['Group', current.block.groupName || 'Not provided', selected.groupName || 'Not provided'],
    ['Module', current.module, selected.module || 'Not provided'],
    ['Start date', current.block.startDate, selected.startDate || 'Not provided'],
    ['End date', preview?.current.endDate || current.block.endDate, selected.endDate || 'Not provided'],
    ['Tutor', preview?.current.tutorName || tutorDisplayName(current.block, tutorProfiles) || 'Not provided', selected.tutorName || 'Not provided'],
  ] : [];

  return <details open={open} className="rounded-xl border border-teal-200 bg-white" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer p-4 text-sm font-bold text-teal-900">Compare with LMS modules</summary>
    {open && <div className="space-y-3 border-t border-teal-100 p-4">
      <p className="text-xs text-gray-500">{comparisonOnly
        ? 'Choose any Current Training Plan module and any LMS module to compare their details, including modules from different programmes.'
        : 'Compare this saved Training Plan assignment with an LMS module. A unique match with the same name and start date is selected automatically. Choose a different LMS module to compare or save a manual match.'}</p>
      <div className="grid grid-cols-2 items-start gap-3" aria-label="Modules to compare">
      <div className="min-w-0 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-gray-700"><span className="block min-h-12 sm:min-h-4">Current Training Plan module</span>
        {comparisonOnly ? <SelectField ariaLabel="Current module to compare" label="Current modules" searchLabel="Search current comparison modules"
          value={activeKey} onChange={value => { setSelectedCurrent(value); setError(''); setNotice(''); }}
          options={options.map(record => ({ value: currentMatchKey(record), label: record.module,
            startDate: record.block.startDate, endDate: record.block.endDate,
            filterValues: { programme: record.programme.name, cohort: record.cohort.label, group: record.block.groupName, tutor: tutorDisplayName(record.block, tutorProfiles) },
            description: [record.programme.name, record.cohort.label, record.block.groupName, record.block.startDate].filter(Boolean).join(' · ') }))}
          filterFields={MODULE_FILTER_FIELDS} filterByDateRange
          placeholder="Choose a scheduled module" wrapLabels popoverZIndex={200} />
        : <select aria-label="Current module to match" value={activeKey} disabled={saving || Boolean(currentKey)}
          onChange={event => { setSelectedCurrent(event.target.value); setError(''); setNotice(''); }} className="mt-2 w-full min-w-0 rounded-lg border border-gray-200 p-2 text-xs">
          <option value="">Choose a scheduled module</option>
          {options.map(record => <option key={currentMatchKey(record)} value={currentMatchKey(record)}>
            {record.module}
          </option>)}
        </select>}
      </div>
      <div className="min-w-0 space-y-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
      <span className="block min-h-12 text-xs font-semibold text-teal-900 sm:min-h-4">LMS module</span>
      <SelectField key={activeKey} ariaLabel="LMS module to match" label="LMS modules" searchLabel="Search LMS match modules"
        disabled={!current || saving || !loaded || loading} value={selectedLms}
        onChange={value => { setSelectedLms(value); setNotice(''); }}
        options={available.map(record => ({ value: record.sourceModuleId, label: record.module || 'Untitled module', recommended: record.sharedWords > 0,
          startDate: record.startDate, endDate: record.endDate,
          filterValues: { programme: record.programme, cohort: lmsCohortDisplayName(record), group: lmsRecordGroup(record), tutor: record.tutorName },
          description: comparisonOnly ? [record.programme, record.cohortName, record.groupName, record.startDate, record.sourceModuleId].filter(Boolean).join(' · ') : undefined,
          disabled: !comparisonOnly && reserved.has(record.sourceModuleId) }))}
        filterFields={MODULE_FILTER_FIELDS} filterByDateRange
        placeholder={loading ? 'Loading LMS modules…' : selectedLms && !selected ? 'Unavailable saved LMS module' : 'Choose an LMS module'}
        searchPlaceholder="Search by module name…" searchByLabelOnly wrapLabels accentColor="#0F766E" popoverZIndex={200}
        emptyTitle="No matching modules" emptyText="Try another module name." />
      </div>
      </div>
      {!options.length && <p className="text-xs text-amber-800">No saved Training Plan assignments are available for this module.</p>}
      {loading && <p role="status" className="text-xs text-gray-500">Loading LMS modules…</p>}
      {!comparisonOnly && selected && current && <p role="status" className="text-xs font-semibold text-teal-900">{current.block.lmsSourceModuleId === selectedLms ? 'Saved manual match'
        : automatic?.lms.sourceModuleId === selectedLms ? 'Automatic match: same module name and start date.' : 'Selected for comparison; save to keep this manual match.'}</p>}
      {!!rows.length && <div className="overflow-x-auto" role="region" aria-label="Module comparison details" tabIndex={0}><table aria-label="Selected module comparison" className="w-full min-w-[520px] table-fixed text-left text-xs">
        <thead><tr><th className="p-2">Field</th><th className="p-2">Current Training Plan</th><th className="p-2">LMS</th></tr></thead>
        <tbody>{rows.map(([field, left, right]) => <tr key={field} className={left !== right ? 'bg-amber-50' : ''}><th className="p-2">{field}</th><td className="p-2">{left}</td><td className="p-2">{right}</td></tr>)}</tbody>
      </table></div>}
      {preview && <p className="text-xs font-semibold text-gray-700">{preview.kind === 'same' ? 'Dates and tutor match.' : differenceLabels[preview.kind]}</p>}
      {error && <div role="alert" className="text-xs text-red-700"><p>{error}</p>{loadFailed && <button type="button" disabled={loading} onClick={() => { setLoaded(false); setRetry(value => value + 1); }} className="underline">Retry loading LMS modules</button>}</div>}
      {notice && <p role="status" className="text-xs text-teal-800">{notice}</p>}
      {!comparisonOnly && onSave && <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!current?.block.trainingPlanId || !selectedLms || !selected || reserved.has(selectedLms) || saving || loading} onClick={() => void save(selectedLms)} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? 'Saving match…' : 'Save manual match'}</button>
        {current?.block.lmsSourceModuleId && <button type="button" disabled={saving} onClick={() => void save('')} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold">Remove manual match</button>}
      </div>}
    </div>}
  </details>;
}
