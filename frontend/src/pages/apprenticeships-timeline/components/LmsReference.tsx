import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Database, GitMerge, Hand, Layers3, LockKeyhole, RefreshCw, TriangleAlert } from 'lucide-react';
import { LmsReferenceError, requestLmsReference, requestLmsTutorNames, requestLmsCohorts, requestLmsSessionCounts, requestLmsHolidays, type LmsCohortLabels, type LmsReference as Reference } from '../lmsReference';
import type { LmsReferenceTimelineProps } from './LmsReferenceTimeline';
import { presentLmsRows } from '../lmsComparison';
import type { CatalogModule, CustomModule, Holiday, ProgrammeGroup, TutorProfile } from '../types';
import type { SaveLmsModuleMatch } from './LmsModuleMatcher';

const LmsReferenceTimeline = lazy(() => import('./LmsReferenceTimeline'));
const MergedPlanTimeline = lazy(() => import('./MergedPlanTimeline'));

export type TrainingPlanSource = 'current' | 'lms' | 'merged';

export default function LmsReference({ canCapture, currentProgrammes, customModules, holidays, catalogModules, tutorProfiles, renderLmsOverview, onViewLmsModule, onViewMergedModule, onSaveManualMerge, children, view, onViewChange: setView, onManualMerge, manualMergeDisabled = false }: {
  canCapture: boolean;
  currentProgrammes: ProgrammeGroup[];
  customModules: CustomModule[];
  holidays: Holiday[];
  catalogModules: CatalogModule[];
  tutorProfiles: TutorProfile[];
  renderLmsOverview: LmsReferenceTimelineProps['renderOverview'];
  onViewLmsModule: LmsReferenceTimelineProps['onViewModule'];
  onViewMergedModule: LmsReferenceTimelineProps['onViewModule'];
  onSaveManualMerge?: SaveLmsModuleMatch;
  children: ReactNode;
  view: TrainingPlanSource;
  onViewChange: (view: TrainingPlanSource) => void;
  onManualMerge: () => void;
  manualMergeDisabled?: boolean;
}) {
  const visible = view !== 'current';
  const [loaded, setLoaded] = useState(false);
  const [reference, setReference] = useState<Reference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tutorNames, setTutorNames] = useState<Record<string, string>>({});
  const [cohorts, setCohorts] = useState<LmsCohortLabels>({});
  const [sessionCounts, setSessionCounts] = useState<Record<string, number | null>>({});
  const [lmsHolidays, setLmsHolidays] = useState<Holiday[]>([]);
  const [holidaysLoaded, setHolidaysLoaded] = useState(false);
  const [holidaysBusy, setHolidaysBusy] = useState(false);
  const [holidaysError, setHolidaysError] = useState('');
  const records = useMemo(() => presentLmsRows((reference?.records ?? []).map(row => ({
    ...row, ...cohorts[row.sourceModuleId], tutorName: tutorNames[row.sourceModuleId] ?? row.tutorName,
    sessionCount: sessionCounts[row.sourceModuleId],
  })), currentProgrammes, customModules), [reference, currentProgrammes, customModules, tutorNames, cohorts, sessionCounts]);

  const loadLmsLabels = useCallback(async () => {
    const results = await Promise.allSettled([requestLmsTutorNames(), requestLmsCohorts(), requestLmsSessionCounts()]);
    if (results[0].status === 'fulfilled') setTutorNames(results[0].value);
    if (results[1].status === 'fulfilled') setCohorts(results[1].value);
    if (results[2].status === 'fulfilled') setSessionCounts(results[2].value);
    else setSessionCounts({});
    const errors = results.flatMap(result => result.status === 'rejected'
      ? [result.reason instanceof Error ? result.reason.message : 'LMS labels could not be loaded.'] : []);
    if (errors.length) setError(errors.join(' '));
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const loadedReference = await requestLmsReference();
      if (loadedReference) await loadLmsLabels();
      setReference(loadedReference);
      setLoaded(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The LMS reference could not be loaded.');
    } finally { setBusy(false); }
  }, [loadLmsLabels]);
  useEffect(() => {
    if (view !== 'current' && !loaded && !busy && !error) void load();
  }, [view, loaded, busy, error, load]);
  const loadHolidays = useCallback(async () => {
    setHolidaysBusy(true);
    setHolidaysError('');
    try {
      setLmsHolidays(await requestLmsHolidays());
      setHolidaysLoaded(true);
    } catch (failure) {
      setHolidaysError(failure instanceof Error ? failure.message : 'LMS holidays could not be loaded. Please retry.');
    } finally { setHolidaysBusy(false); }
  }, []);
  useEffect(() => {
    if (view === 'lms' && reference && !holidaysLoaded && !holidaysBusy && !holidaysError) void loadHolidays();
  }, [view, reference, holidaysLoaded, holidaysBusy, holidaysError, loadHolidays]);
  const capture = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const captured = await requestLmsReference(true);
      if (!captured) throw new Error('The capture response was incomplete. Reload the reference to check its status.');
      await loadLmsLabels();
      setReference(captured);
      setLoaded(true);
    } catch (failure) {
      if (failure instanceof LmsReferenceError && failure.status === 409) {
        await load();
        setNotice(failure.message);
      } else {
        setError(failure instanceof Error ? failure.message : 'No LMS reference was captured. Please try again.');
      }
    } finally { setBusy(false); }
  };
  return (
    <>
      <div className="tp-source-switcher flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-1">
      <div className="tp-source-label"><span className="tp-eyebrow">Timeline workspace</span><span>Choose your plan source</span></div>
      <div className="tp-source-tabs flex flex-wrap gap-1" role="tablist" aria-label="Training Plan data source">
        <button id="current-training-plan-tab" type="button" role="tab" aria-selected={!visible} aria-controls="current-training-plan-panel"
          onClick={() => setView('current')}
          className={`rounded-lg px-4 py-2 text-xs font-bold ${!visible ? 'bg-kbc-navy text-white' : 'text-gray-600 hover:bg-slate-50'}`}><Layers3 size={16} aria-hidden="true" />Current Training Plan</button>
        <button id="lms-training-plan-tab" type="button" role="tab" aria-selected={view === 'lms'} aria-controls="training-plan-lms-reference"
          onClick={() => setView('lms')}
          className={`rounded-lg px-4 py-2 text-xs font-bold ${view === 'lms' ? 'bg-teal-800 text-white' : 'text-teal-900 hover:bg-teal-50'}`}><Database size={16} aria-hidden="true" />LMS Training Plan</button>
        <button id="merged-training-plan-tab" type="button" role="tab" aria-selected={view === 'merged'} aria-controls="merged-training-plan-panel"
          onClick={() => setView('merged')}
          className={`rounded-lg px-4 py-2 text-xs font-bold ${view === 'merged' ? 'bg-kbc-navy text-white' : 'text-kbc-navy hover:bg-slate-50'}`}><GitMerge size={16} aria-hidden="true" />Merge</button>
      </div>
      {view !== 'merged' && <button type="button" onClick={onManualMerge} disabled={manualMergeDisabled}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-900 disabled:opacity-40">
        <Hand size={16} aria-hidden="true" />Manual Merge
      </button>}
      </div>
      <div id="current-training-plan-panel" role="tabpanel" aria-labelledby="current-training-plan-tab" hidden={visible} className="min-w-0 space-y-4">
        {!visible && <div className="space-y-4">{children}</div>}
      </div>
      <section id="merged-training-plan-panel" role="tabpanel" aria-labelledby="merged-training-plan-tab" hidden={view !== 'merged'} className="min-w-0 space-y-4">
        <Suspense fallback={<p role="status" className="px-4 py-6 text-sm text-gray-500">Loading timeline…</p>}>
        {view === 'merged' && reference && <MergedPlanTimeline records={records} currentProgrammes={currentProgrammes}
          onViewModule={onViewMergedModule}
          onSaveManualMerge={onSaveManualMerge}
          customModules={customModules} holidays={holidays} catalogModules={catalogModules} tutorProfiles={tutorProfiles} onManualMerge={onManualMerge} />}
        </Suspense>
      </section>
      <section id="training-plan-lms-reference" role="tabpanel" aria-labelledby="lms-training-plan-tab" hidden={view !== 'lms'} className="min-w-0 space-y-4">
        <div className="tp-lms-heading training-plan-comparison-heading flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="tp-lms-heading-icon"><Database size={20} aria-hidden="true" /></span>
            <h2 className="text-sm font-extrabold text-kbc-navy">LMS Training Plan</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-white px-3 py-1 text-xs font-bold text-teal-900">Data source: LMS</span>
          </div>
          {reference && <p className="tp-capture-meta text-xs text-gray-500"><LockKeyhole size={13} aria-hidden="true" />Captured {new Date(reference.createdAt).toLocaleString()} · Read only</p>}
        </div>
        <Suspense fallback={<p role="status" className="px-4 py-6 text-sm text-gray-500">Loading timeline…</p>}>
        {view === 'lms' && reference && <LmsReferenceTimeline rows={records} currentProgrammes={currentProgrammes} currentModules={customModules} holidays={lmsHolidays} renderOverview={renderLmsOverview} onViewModule={onViewLmsModule} />}
        </Suspense>
        {holidaysBusy && <p role="status" className="px-4 py-2 text-xs text-gray-500">Loading LMS holidays…</p>}
        {holidaysError && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p>{holidaysError}</p>
          <button type="button" disabled={holidaysBusy} onClick={() => void loadHolidays()} className="mt-2 font-bold underline">Retry loading holidays</button>
        </div>}
      </section>
      {visible && <>
        {notice && <p role="status" className="m-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">{notice}</p>}
        {error && <div role="alert" className="tp-reference-error m-4 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <TriangleAlert size={20} aria-hidden="true" /><div><p>{error}</p><button type="button" disabled={busy} onClick={() => void load()} className="mt-2 font-bold underline"><RefreshCw size={13} aria-hidden="true" />Retry loading reference</button></div>
        </div>}
        {busy && <p role="status" className="px-4 py-6 text-sm text-gray-500">{reference ? 'Loading reference…' : 'Please wait…'}</p>}
        {!busy && loaded && !reference && !error && <div className="px-4 py-8 text-center">
          <p className="text-sm font-semibold text-kbc-navy">No LMS reference has been captured yet.</p>
          <p className="mx-auto mt-2 max-w-xl text-xs text-gray-500">The initial capture saves all authorised LMS modules and their source dates. It cannot be replaced or edited and is a comparison aid, not a full Training Plan backup.</p>
          {canCapture ? <button type="button" onClick={() => void capture()} className="mt-4 rounded-lg bg-kbc-navy px-4 py-2 text-xs font-bold text-white hover:opacity-90">Capture LMS Reference</button>
            : <p className="mt-3 text-xs text-gray-500">A Training Plan manager can create the initial capture.</p>}
        </div>}
      </>}
    </>
  );
}
