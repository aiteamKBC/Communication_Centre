import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** The Engagement Centre's native modal dialog, closed by Escape, the backdrop or the Close button. */
export default function Dialog({ open, onClose, children, title, className, preservePosition = false }: {
  open: boolean; onClose: () => void; children: ReactNode; title?: string; className?: string; preservePosition?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { scrollX, scrollY } = window;
    const overflow = document.body.style.overflow;
    if (preservePosition) document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (preservePosition) {
        document.body.style.overflow = overflow;
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        window.scrollTo(scrollX, scrollY);
      }
    };
  }, [open, preservePosition]);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      onClose={event => {
        // Closing a nested booking/email dialog must not close its full-case parent.
        // Ignore a queued close event if Strict Mode has already reopened this dialog.
        if (event.target === event.currentTarget && !event.currentTarget.open) onClose();
      }}
      onClick={event => {
        if (event.target !== ref.current) return;
        const box = ref.current.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) onClose();
      }}
    >
      {open && title && <header className="ed-dialog-header">
        <h2>{title}</h2>
        <button type="button" className="ed-dialog-close" aria-label={`Close ${title.toLowerCase()}`}
          title={`Close ${title.toLowerCase()}`} onClick={onClose} autoFocus><span aria-hidden="true">×</span></button>
      </header>}
      {open && (title ? <div className="ed-dialog-content">{children}</div> : children)}
      {!title && <div className="ec-buttons" style={{ marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>}
    </dialog>
  );
}
