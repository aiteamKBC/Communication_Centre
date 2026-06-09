import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface SelectOption {
  value: string;
  label: string;
  description?: string;
  color?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  accentColor?: string;
  error?: string;
  label?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyText?: string;
  footer?: ReactNode;
}

export default function SelectField({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  accentColor = '#1B2A4A',
  error,
  label = 'Options',
  searchPlaceholder = 'Search...',
  emptyTitle = 'No matching options',
  emptyText = 'Try another search term.',
  footer,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex(option => option.value === value)));
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 320,
  });
  const [positionReady, setPositionReady] = useState(false);

  const selectedOption = useMemo(
    () => options.find(option => option.value === value) ?? null,
    [options, value],
  );
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(option => (
      option.label.toLowerCase().includes(term) ||
      option.value.toLowerCase().includes(term) ||
      (option.description || '').toLowerCase().includes(term)
    ));
  }, [options, query]);

  const toggleOpen = () => {
    setOpen(current => {
      const next = !current;
      if (next) {
        setQuery('');
        setPositionReady(false);
      }
      return next;
    });
  };

  useEffect(() => {
    const nextIndex = filteredOptions.findIndex(option => option.value === value);
    setActiveIndex(Math.max(0, nextIndex));
  }, [filteredOptions, value]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [query]);

  useLayoutEffect(() => {
    if (!open) {
      setPositionReady(false);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = wrapperRef.current?.contains(target);
      const clickedPopover = popoverRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopover) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = Math.max(rect.width, 320);
      const popoverHeight = 360;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const left = Math.min(Math.max(12, rect.left), viewportWidth - width - 12);
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < popoverHeight + 12 && spaceAbove > spaceBelow;
      const top = shouldOpenUp
        ? Math.max(12, rect.top - popoverHeight - 10)
        : Math.min(viewportHeight - popoverHeight - 12, rect.bottom + 8);

      setPopoverStyle({ top, left, width });
      setPositionReady(true);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const activeElement = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!filteredOptions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex(current => Math.min(filteredOptions.length - 1, current + 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex(current => Math.max(0, current - 1));
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = filteredOptions[activeIndex];
      if (option) {
        onChange(option.value);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <div
        className="group relative overflow-hidden rounded-xl border bg-white transition-all"
        style={{
          borderColor: error ? '#EF4444' : open ? `${accentColor}66` : '#D7DEEA',
          boxShadow: error ? '0 0 0 3px rgba(239, 68, 68, 0.08)' : open ? `0 14px 34px ${accentColor}18` : '0 10px 28px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1.5 rounded-l-xl opacity-90"
          style={{ background: error ? '#EF4444' : accentColor }}
        />
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleOpen}
          onKeyDown={handleKeyDown}
          className="flex min-h-10 w-full items-center justify-between gap-3 bg-transparent pl-4 pr-12 text-left outline-none"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <div className="min-w-0 py-2">
            {selectedOption ? (
              <div className="flex items-center gap-2">
                {selectedOption.color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: selectedOption.color }}
                  />
                )}
                <span className="truncate text-sm font-semibold text-gray-800">{selectedOption.label}</span>
              </div>
            ) : (
              <span className="text-sm font-medium text-gray-400">{placeholder}</span>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={toggleOpen}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-700"
          aria-label="Toggle options"
        >
          <i className={`text-base ${open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} />
        </button>
      </div>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[120]"
          style={{
            top: popoverStyle.top,
            left: popoverStyle.left,
            width: popoverStyle.width,
            visibility: positionReady ? 'visible' : 'hidden',
          }}
        >
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                {query.trim() ? `${filteredOptions.length}/${options.length}` : `${options.length} options`}
              </span>
            </div>

            <div className="border-b border-slate-100 bg-white p-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-slate-300 focus-within:bg-white">
                <i className="ri-search-line text-sm text-slate-400" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveIndex(current => {
                        if (!filteredOptions.length) return 0;
                        return event.key === 'ArrowDown'
                          ? Math.min(filteredOptions.length - 1, current + 1)
                          : Math.max(0, current - 1);
                      });
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const option = filteredOptions[activeIndex];
                      if (option) {
                        onChange(option.value);
                        setOpen(false);
                      }
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <i className="ri-close-line text-sm" />
                  </button>
                )}
              </div>
            </div>

            <div ref={listRef} className="max-h-64 overflow-y-auto p-2" role="listbox">
              {filteredOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={`${option.value}-${option.description || ''}-${index}`}
                    type="button"
                    data-option-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all last:mb-0"
                    style={{
                      background: isSelected ? `${accentColor}12` : isActive ? '#F8FAFC' : 'transparent',
                      boxShadow: isSelected ? `inset 0 0 0 1px ${accentColor}33` : isActive ? 'inset 0 0 0 1px rgba(148,163,184,0.18)' : undefined,
                    }}
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: option.color || accentColor }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{option.label}</span>
                      {option.description && (
                        <span className="block text-xs text-slate-500">{option.description}</span>
                      )}
                    </span>
                    {isSelected && <i className="ri-check-line mt-0.5 text-base" style={{ color: accentColor }} />}
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-600">{emptyTitle}</p>
                  <p className="mt-1 text-xs text-slate-400">{emptyText}</p>
                </div>
              )}
            </div>
            {footer && <div className="border-t border-slate-100 bg-slate-50 p-2">{footer}</div>}
          </div>
        </div>,
        document.body,
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
