import { useMemo, useState, type ReactNode } from 'react';
import { LmsReferenceError, requestLmsReference, type LmsReference as Reference } from '../lmsReference';
import LmsReferenceTimeline from './LmsReferenceTimeline';
import TimelineZoomControls from './TimelineZoomControls';
import PlanDifferences from './PlanDifferences';
import { presentLmsRows } from '../lmsComparison';
import type { CustomModule, Holiday, ProgrammeGroup, ZoomLevel } from '../types';

export default function LmsReference({ canCapture, currentProgrammes, customModules, holidays, currentLoading, zoom, onZoomChange, children }: {
  canCapture: boolean;
  currentProgrammes: ProgrammeGroup[];
  customModules: CustomModule[];
  holidays: Holiday[];
  currentLoading: boolean;
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  children: (comparing: boolean) => ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reference, setReference] = useState<Reference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const records = useMemo(() => presentLmsRows(reference?.records ?? [], currentProgrammes), [reference, currentProgrammes]);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setReference(await requestLmsReference());
      setLoaded(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The LMS reference could not be loaded.');
    } finally { setBusy(false); }
  };
  const capture = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const captured = await requestLmsReference(true);
      if (!captured) throw new Error('The capture response was incomplete. Reload the reference to check its status.');
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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-1">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Training Plan data source">
        <button id="current-training-plan-tab" type="button" role="tab" aria-selected={!visible} aria-controls="current-training-plan-panel"
          onClick={() => { setComparing(false); setVisible(false); }}
          className={`rounded-lg px-4 py-2 text-xs font-bold ${!comparing && !visible ? 'bg-kbc-navy text-white' : 'text-gray-600 hover:bg-slate-50'}`}>Current Training Plan</button>
        <button id="lms-training-plan-tab" type="button" role="tab" aria-selected={visible} aria-controls="training-plan-lms-reference"
          onClick={() => { if (!loaded && !busy) void load(); setComparing(false); setVisible(true); }}
          className={`rounded-lg px-4 py-2 text-xs font-bold ${!comparing && visible ? 'bg-teal-800 text-white' : 'text-teal-900 hover:bg-teal-50'}`}>LMS Training Plan</button>
      </div>
      <button type="button" aria-pressed={comparing} aria-controls="training-plan-comparison training-plan-differences"
        onClick={() => { if (!comparing && !loaded && !busy) void load(); setComparing(value => !value); }}
        className={`ml-auto inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-bold ${comparing ? 'border-kbc-navy bg-kbc-navy text-white' : 'border-slate-200 text-kbc-navy hover:bg-slate-50'}`}>
        <i className="ri-layout-column-line" aria-hidden="true" />{comparing ? 'Exit comparison' : 'Compare plans'}
      </button>
      </div>
      {comparing && <>
        <p className="text-xs text-gray-600" role="status">Compare the current plan with the LMS capture. The zoom filter below applies to both timelines.</p>
        <div className="flex min-h-[52px] items-center gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white px-4 py-2" role="region" aria-label="Comparison zoom filter">
          <TimelineZoomControls zoom={zoom} onZoomChange={onZoomChange} />
        </div>
      </>}
      <div id="training-plan-comparison" className={comparing ? 'training-plan-comparison grid grid-cols-1 items-start gap-4 lg:grid-cols-2' : 'contents'}>
      <div id="current-training-plan-panel" role="tabpanel" aria-labelledby="current-training-plan-tab" hidden={visible && !comparing} className="training-plan-comparison-pane min-w-0 space-y-4">
        {comparing && <div className="training-plan-comparison-heading flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-kbc-navy">Current Training Plan</h2>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-kbc-navy">Data source: Current plan</span>
        </div>}
        <div className="space-y-4">{children(comparing)}</div>
      </div>
      <section id="training-plan-lms-reference" role="tabpanel" aria-labelledby="lms-training-plan-tab" hidden={!visible && !comparing} className="training-plan-comparison-pane min-w-0 space-y-4">
        <div className="training-plan-comparison-heading flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-kbc-navy">LMS Training Plan</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-white px-3 py-1 text-xs font-bold text-teal-900">Data source: LMS</span>
          </div>
          {reference && <p className="text-xs text-gray-500">Captured {new Date(reference.createdAt).toLocaleString()} · Read only</p>}
        </div>
        {reference && <LmsReferenceTimeline rows={records} comparisonZoom={comparing ? zoom : undefined} />}
      </section>
      </div>
      <div id="training-plan-differences" hidden={!comparing} className="min-w-0 space-y-4">
        {comparing && !busy && !currentLoading && reference && <PlanDifferences currentProgrammes={currentProgrammes} records={records} customModules={customModules} holidays={holidays} />}
        {comparing && currentLoading && <p role="status" className="px-4 py-6 text-sm text-gray-500">Loading current plan…</p>}
      </div>
      {(visible || comparing) && <>
        {notice && <p role="status" className="m-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">{notice}</p>}
        {error && <div role="alert" className="m-4 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <p>{error}</p><button type="button" disabled={busy} onClick={() => void load()} className="mt-2 font-bold underline">Retry loading reference</button>
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
