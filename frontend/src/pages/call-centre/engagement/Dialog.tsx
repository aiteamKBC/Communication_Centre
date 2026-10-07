import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** The Engagement Centre's native modal dialog, closed by Escape, the backdrop or the Close button. */
export default function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={event => {
        if (event.target !== ref.current) return;
        const box = ref.current.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) onClose();
      }}
    >
      {open && children}
      <div className="ec-buttons" style={{ marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </dialog>
  );
}
