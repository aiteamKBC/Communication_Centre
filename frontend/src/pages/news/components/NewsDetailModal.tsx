import { useEffect } from 'react';
import type { NewsItem } from '../../../mocks/news';

interface NewsDetailModalProps {
  item: NewsItem;
  onClose: () => void;
  canManageNews?: boolean;
  onEdit?: (item: NewsItem) => void;
  onDelete?: (item: NewsItem) => void;
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

const URL_PATTERN = /https?:\/\/[^\s]+/i;

function trimUrl(value: string) {
  return value.replace(/[),.;]+$/, '');
}

function formatStatusLabel(status: string | undefined, isExpired: boolean) {
  const rawStatus = (status || '').trim();
  if (rawStatus) {
    return rawStatus
      .split('_')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  return isExpired ? 'Expired' : 'Active';
}

function parseArticleContent(item: NewsItem) {
  const rawContent = (item.content || item.excerpt || '').trim();
  const lines = rawContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  let sourceName = '';
  let sourceLink = '';

  lines.forEach((line) => {
    const lowered = line.toLowerCase();

    if (!sourceName && lowered.startsWith('source:')) {
      sourceName = line.replace(/^source\s*:\s*/i, '').trim();
      return;
    }

    if (!sourceLink && lowered.startsWith('source link:')) {
      const match = line.match(URL_PATTERN);
      if (match) {
        sourceLink = trimUrl(match[0]);
      }
      return;
    }

    paragraphs.push(line);
  });

  if (!sourceLink) {
    const fallbackMatch = rawContent.match(URL_PATTERN);
    if (fallbackMatch) {
      sourceLink = trimUrl(fallbackMatch[0]);
    }
  }

  return {
    paragraphs: paragraphs.length > 0 ? paragraphs : [item.excerpt],
    sourceName,
    sourceLink,
  };
}

export default function NewsDetailModal({
  item,
  onClose,
  canManageNews = false,
  onEdit,
  onDelete,
}: NewsDetailModalProps) {
  const priority = priorityStyles[item.priority];
  const { paragraphs, sourceName, sourceLink } = parseArticleContent(item);
  const statusLabel = formatStatusLabel(item.status, item.isExpired);

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
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Department</p>
              <p className="mt-1 text-sm font-semibold text-kbc-navy">{item.department}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Status</p>
              <p className="mt-1 text-sm font-semibold text-kbc-navy">{statusLabel}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-5 py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Full Update</p>
            <div className="mt-3 space-y-3">
              {paragraphs.map((paragraph, index) => (
                <p key={`${item.id}-paragraph-${index}`} className="text-sm leading-7 text-slate-600">
                  {paragraph}
                </p>
              ))}

              {(sourceName || sourceLink) && (
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Article Source</p>
                  {sourceName && (
                    <p className="mt-2 text-sm font-semibold text-kbc-navy">{sourceName}</p>
                  )}
                  {sourceLink && (
                    <a
                      href={sourceLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-kbc-navy underline decoration-slate-300 underline-offset-4 transition-colors hover:text-kbc-navy-light"
                    >
                      Open source article
                      <i className="ri-external-link-line text-base" />
                    </a>
                  )}
                </div>
              )}
            </div>
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

          <div className="flex items-center gap-2">
            {canManageNews && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-kbc-navy"
              >
                Edit
              </button>
            )}
            {canManageNews && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
