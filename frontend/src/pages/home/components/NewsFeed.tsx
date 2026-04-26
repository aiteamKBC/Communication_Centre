import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NewsItem } from '../../../mocks/news';
import { useNewsAcknowledgements } from '../../news/useNewsAcknowledgements';
import NewsDetailModal from '../../news/components/NewsDetailModal';

const priorityConfig = {
  critical: { badge: 'bg-kbc-red text-white', label: 'High Priority' },
  important: { badge: 'bg-kbc-amber text-kbc-navy', label: 'Important' },
  general: { badge: '', label: '' },
};

const avatarColors = [
  'bg-kbc-navy', 'bg-kbc-navy-mid', 'bg-kbc-navy-light', 'bg-gray-500', 'bg-kbc-navy-soft'
];

const DRAG_CLICK_TOLERANCE = 12;
const DRAG_SWIPE_THRESHOLD = 50;

function timeAgo(dateStr: string): string {
  const parts = dateStr.trim().split(' ');
  if (parts.length < 3) return dateStr;
  const day = parseInt(parts[0], 10);
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const month = months[parts[1]];
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || month === undefined || isNaN(year)) return dateStr;
  const then = new Date(year, month, day);
  const now = new Date(2026, 3, 1);
  const diffDays = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

export default function NewsFeed({ initialItems }: { initialItems?: NewsItem[] }) {
  const { items: newsItems, error, toggleAcknowledgement } = useNewsAcknowledgements(initialItems);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);
  const dragStartXRef = useRef<number | null>(null);
  const dragDeltaXRef = useRef(0);
  const suppressClickRef = useRef(false);

  const filtered = newsItems;

  useEffect(() => {
    setActiveIndex((current) => {
      if (filtered.length === 0) return 0;
      return Math.min(current, filtered.length - 1);
    });
  }, [filtered.length]);

  const currentItem = filtered[activeIndex];
  const hasMultipleSlides = filtered.length > 1;

  const goToPreviousSlide = () => {
    if (!hasMultipleSlides) return;
    setActiveIndex((current) => (current - 1 + filtered.length) % filtered.length);
  };

  const goToNextSlide = () => {
    if (!hasMultipleSlides) return;
    setActiveIndex((current) => (current + 1) % filtered.length);
  };

  const openNewsDetails = (item: NewsItem) => {
    setSelectedItem(item);
  };

  const shouldOpenFromPointer = () => (
    dragStartXRef.current !== null &&
    Math.abs(dragDeltaXRef.current) <= DRAG_CLICK_TOLERANCE &&
    !suppressClickRef.current
  );

  const finishDrag = (keepPaused = false) => {
    if (dragStartXRef.current === null) {
      if (!keepPaused) {
        setIsPaused(false);
      }
      return;
    }

    const delta = dragDeltaXRef.current;
    const wasDragging = Math.abs(delta) > DRAG_CLICK_TOLERANCE;

    if (delta <= -DRAG_SWIPE_THRESHOLD) {
      goToNextSlide();
    } else if (delta >= DRAG_SWIPE_THRESHOLD) {
      goToPreviousSlide();
    }

    dragStartXRef.current = null;
    dragDeltaXRef.current = 0;
    setDragOffset(0);
    setIsDragging(false);

    if (wasDragging) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    } else {
      suppressClickRef.current = false;
    }

    if (!keepPaused) {
      setIsPaused(false);
    }
  };

  useEffect(() => {
    if (!hasMultipleSlides || isPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % filtered.length);
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, [filtered.length, hasMultipleSlides, isPaused]);

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {selectedItem && (
        <NewsDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onToggleAcknowledgement={toggleAcknowledgement}
        />
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-kbc-navy">Latest News</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPreviousSlide}
            disabled={!hasMultipleSlides}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed rounded border border-gray-200 hover:border-kbc-navy transition-colors"
          >
            <i className="ri-arrow-left-s-line text-sm" />
          </button>
          <button
            onClick={goToNextSlide}
            disabled={!hasMultipleSlides}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed rounded border border-gray-200 hover:border-kbc-navy transition-colors"
          >
            <i className="ri-arrow-right-s-line text-sm" />
          </button>
        </div>
      </div>

      <div>
        {error && (
          <div className="px-4 py-3 text-xs text-red-700 bg-red-50 border-b border-red-100">
            {error}
          </div>
        )}
        {currentItem && (
          <div
            className="overflow-hidden touch-pan-y cursor-grab active:cursor-grabbing select-none"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
            onPointerDown={(event) => {
              if (!hasMultipleSlides) return;
              (event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId);
              dragStartXRef.current = event.clientX;
              dragDeltaXRef.current = 0;
              suppressClickRef.current = false;
              setDragOffset(0);
              setIsDragging(false);
              setIsPaused(true);
            }}
            onPointerMove={(event) => {
              if (dragStartXRef.current === null) return;
              dragDeltaXRef.current = event.clientX - dragStartXRef.current;
              setDragOffset(dragDeltaXRef.current);
              if (Math.abs(dragDeltaXRef.current) > DRAG_CLICK_TOLERANCE) {
                suppressClickRef.current = true;
                setIsDragging(true);
              }
            }}
            onPointerUp={() => {
              finishDrag();
            }}
            onPointerCancel={() => {
              dragStartXRef.current = null;
              dragDeltaXRef.current = 0;
              suppressClickRef.current = false;
              setDragOffset(0);
              setIsDragging(false);
              setIsPaused(false);
            }}
            onPointerLeave={() => {
              if (dragStartXRef.current === null) {
                setIsPaused(false);
                return;
              }
              finishDrag();
            }}
            onClickCapture={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            <div
              className={`flex ${isDragging ? '' : 'transition-transform duration-700 ease-in-out'}`}
              style={{ transform: `translateX(calc(-${activeIndex * 100}% + ${dragOffset}px))` }}
            >
              {filtered.map((item, idx) => {
                const cfg = priorityConfig[item.priority];
                const avatarBg = avatarColors[idx % avatarColors.length];
                const initials = (item.author || item.department)
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div key={item.id} className="min-w-full px-4 py-4">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openNewsDetails(item)}
                      onPointerUp={(event) => {
                        if (event.button !== 0) return;
                        if (shouldOpenFromPointer()) {
                          openNewsDetails(item);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openNewsDetails(item);
                        }
                      }}
                      className="group rounded-2xl border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.42)]"
                    >
                      <div className="mb-3 flex items-start gap-3">
                        <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${avatarBg} shadow-inner`}>
                          <span className="text-xs font-bold text-white">{initials}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <p className="line-clamp-2 flex-1 text-sm font-bold leading-snug text-kbc-navy transition-colors duration-300 group-hover:text-kbc-navy-light">
                              {item.title}
                            </p>
                            {cfg.badge && (
                              <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ${cfg.badge}`}>
                                {cfg.label}
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-3 text-xs leading-6 text-slate-500">
                            {item.excerpt}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                            {item.department}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{timeAgo(item.date)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!error && filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400">
            <i className="ri-newspaper-line mb-2 block text-3xl" />
            <p className="text-xs font-medium">No news available in this view</p>
          </div>
        )}
        {hasMultipleSlides && (
          <div className="flex items-center justify-center gap-1.5 px-4 pb-3">
            {filtered.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-2.5 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-kbc-navy' : 'w-2.5 bg-slate-200 hover:bg-slate-300'}`}
                aria-label={`Go to news slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
        <Link
          to="/news"
          className="flex items-center justify-center gap-1 text-xs text-kbc-navy font-medium hover:underline cursor-pointer"
        >
          View All News &rsaquo;
        </Link>
      </div>
    </div>
  );
}
