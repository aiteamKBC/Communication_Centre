import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import LmsModuleMatcher from './LmsModuleMatcher';
import type { CustomModule, Holiday, ProgrammeGroup, TutorProfile } from '../types';

export default function ModuleComparisonModal({ groups, customModules, holidays, tutorProfiles, onClose }: {
  groups: ProgrammeGroup[];
  customModules: CustomModule[];
  holidays: Holiday[];
  tutorProfiles: TutorProfile[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      // Select popovers are rendered in a portal. Their search and filters
      // manage Tab themselves and still belong to this dialog.
      const selectPopover = (event.target as HTMLElement)?.closest<HTMLElement>('[data-select-list-id]');
      if (selectPopover && [...(panelRef.current?.querySelectorAll('[aria-controls]') ?? [])]
        .some(control => control.getAttribute('aria-controls') === selectPopover.dataset.selectListId)) return;
      const elements = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? [])]
        .filter(element => element.offsetParent !== null && element.tabIndex >= 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!panelRef.current?.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, []);

  return createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-3 sm:p-6"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="module-comparison-title"
      className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 id="module-comparison-title" className="text-base font-extrabold text-slate-900">Compare modules</h2>
        <button type="button" aria-label="Close module comparison" onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto p-3 sm:p-6">
        <LmsModuleMatcher groups={groups} customModules={customModules} holidays={holidays} tutorProfiles={tutorProfiles} initialOpen comparisonOnly />
      </div>
    </div>
  </div>, document.body);
}
