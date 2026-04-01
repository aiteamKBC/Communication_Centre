import { useEffect } from 'react';
import type { NewsItem } from '../../../mocks/news';

interface NewsDetailModalProps {
  item: NewsItem;
  onClose: () => void;
  onToggleAcknowledgement: (id: string) => void;
}

const priorityStyles = {
  critical: {
    label: 'Critical',
    badge: 'bg-kbc-red text-white',
    surface: 'bg-red-50 border-red-100',
  },
  important: {
    label: 'Important',
    badge: 'bg-kbc-amber text-kbc-navy',
    surface: 'bg-amber-50 border-amber-100',
  },
  general: {
    label: 'General',
    badge: 'bg-kbc-green/10 text-kbc-green',
    surface: 'bg-emerald-50 border-emerald-100',
  },
};

export default function NewsDetailModal({ item, onClose, onToggleAcknowledgement }: NewsDetailModalProps) {
  const priority = priorityStyles[item.priority];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_36px_90px_-36px_rgba(15,23,42,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${priority.badge}`}>
                {priority.label}
              </span>
              {item.category && (
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${priority.surface}`}>
                  {item.category}
                </span>
              )}
              {item.requiresAcknowledgement && (
                item.acknowledged ? (
                  <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[11px] font-semibold text-kbc-green">
                    Confirmed
                  </span>
                ) : (
                  <span className="rounded-full border border-kbc-amber/40 bg-kbc-amber/15 px-3 py-1 text-[11px] font-semibold text-yellow-800">
                    Acknowledgement Required
                  </span>
                )
              )}
            </div>
            <h2 className="text-xl font-bold leading-tight text-kbc-navy">{item.title}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {item.date}
              {item.author ? `  ·  ${item.author}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-kbc-navy"
            aria-label="Close news details"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          {item.image && (
            <div className="mb-6 overflow-hidden rounded-[24px] border border-slate-100 bg-slate-50">
              <img src={item.image} alt={item.title} className="h-72 w-full object-cover object-center" />
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Audience</p>
              <p className="mt-1 text-sm font-semibold text-kbc-navy">{item.audience}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Department</p>
              <p className="mt-1 text-sm font-semibold text-kbc-navy">{item.department}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
              <p className="mt-1 text-sm font-semibold text-kbc-navy">{item.isExpired ? 'Expired' : 'Active'}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-5 py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Full Update</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.excerpt}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-200 hover:text-kbc-navy"
          >
            Close
          </button>

          {item.requiresAcknowledgement && (
            item.acknowledged ? (
              <button
                type="button"
                onClick={() => onToggleAcknowledgement(item.id)}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-yellow-800 transition-colors hover:bg-amber-100"
              >
                Undo Acknowledge
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleAcknowledgement(item.id)}
                className="rounded-xl bg-kbc-navy px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kbc-navy-light"
              >
                Acknowledge
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
