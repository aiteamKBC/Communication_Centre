import type { EventMediaUploadItem } from './eventMediaUpload';

type Props = {
  items: EventMediaUploadItem[];
  emptyTitle: string;
  emptyHint: string;
  onPick: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  cover?: boolean;
};

function statusLabel(item: EventMediaUploadItem): string {
  if (item.status === 'queued') return 'Queued';
  if (item.status === 'uploading') return `Uploading ${item.progress}%`;
  if (item.status === 'uploaded') return 'Uploaded';
  if (item.status === 'failed') return 'Failed';
  return 'Rejected';
}

function statusClass(item: EventMediaUploadItem): string {
  if (item.status === 'uploaded') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (item.status === 'failed' || item.status === 'rejected') return 'bg-red-50 text-red-700 border-red-100';
  if (item.status === 'uploading') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
}

export default function EventMediaUploadPreview({
  items,
  emptyTitle,
  emptyHint,
  onPick,
  onRemove,
  onRetry,
  cover = false,
}: Props) {
  if (items.length === 0) {
    return (
      <button
        type="button"
        className={`w-full rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 hover:border-kbc-navy hover:bg-gray-50 transition-all ${cover ? 'h-28' : 'min-h-28 p-4'}`}
        onClick={onPick}
      >
        <div className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-full">
          <i className={cover ? 'ri-image-add-line text-gray-400 text-lg' : 'ri-gallery-upload-line text-gray-400 text-lg'} />
        </div>
        <span className="text-xs font-semibold text-gray-500">{emptyTitle}</span>
        <span className="text-xs text-gray-400">{emptyHint}</span>
      </button>
    );
  }

  return (
    <div
      className={cover ? 'space-y-2' : 'w-full min-h-28 rounded-xl border-2 border-dashed border-gray-200 p-4 flex flex-col gap-3 hover:border-kbc-navy hover:bg-gray-50 transition-all'}
      onClick={cover ? undefined : onPick}
    >
      {!cover && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-kbc-navy">{items.length} file{items.length === 1 ? '' : 's'}</p>
            <p className="text-xs text-gray-400">Click anywhere to add more.</p>
          </div>
          <button type="button" onClick={event => { event.stopPropagation(); onPick(); }} className="text-[11px] font-semibold text-kbc-navy bg-white border border-gray-200 px-2.5 py-1 rounded-full whitespace-nowrap">
            Add More
          </button>
        </div>
      )}

      <div className={cover ? 'grid gap-2' : 'grid grid-cols-2 sm:grid-cols-3 gap-3'}>
        {items.map(item => (
          <div
            key={item.id}
            className={`${cover ? 'h-40' : 'h-32'} relative rounded-xl overflow-hidden border border-gray-200 bg-white`}
            onClick={event => event.stopPropagation()}
          >
            {item.previewUrl ? (
              <img src={item.previewUrl} alt={`${item.name} preview`} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-red-50 text-red-400">
                <i className="ri-image-close-line text-2xl" />
              </div>
            )}

            {(item.status === 'uploading' || item.status === 'queued') && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/40">
                <div className="h-full bg-kbc-amber transition-all" style={{ width: `${item.status === 'queued' ? 8 : item.progress}%` }} />
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-x-2 bottom-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-white truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-kbc-navy transition-colors"
                  aria-label={`Remove ${item.name}`}
                >
                  <i className="ri-close-line text-xs" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(item)}`}>
                  {statusLabel(item)}
                </span>
                {item.status === 'failed' && item.file && (
                  <button
                    type="button"
                    onClick={() => onRetry(item.id)}
                    className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-kbc-navy hover:bg-white"
                  >
                    Retry
                  </button>
                )}
              </div>
              {(item.status === 'failed' || item.status === 'rejected') && item.error && (
                <p className="line-clamp-2 rounded bg-white/95 px-2 py-1 text-[10px] font-semibold text-red-700">
                  {item.error}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
