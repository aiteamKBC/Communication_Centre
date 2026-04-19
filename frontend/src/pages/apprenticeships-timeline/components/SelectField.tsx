import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
}

export default function SelectField({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  accentColor = '#1B2A4A',
  error,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex(option => option.value === value)));
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 320,
  });

  const selectedOption = useMemo(
    () => options.find(option => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
  }, [options, value]);

  useEffect(() => {
    if (!open) {
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
      const popoverHeight = 320;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const left = Math.min(Math.max(12, rect.left), viewportWidth - width - 12);
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < popoverHeight + 12 && spaceAbove > spaceBelow;
      const top = shouldOpenUp
        ? Math.max(12, rect.top - popoverHeight - 10)
        : Math.min(viewportHeight - popoverHeight - 12, rect.bottom + 10);

      setPopoverStyle({ top, left, width });
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
    if (!options.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex(current => Math.min(options.length - 1, current + 1));
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
      const option = options[activeIndex];
      if (option) {
        onChange(option.value);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <div
        className="group relative overflow-hidden rounded-2xl border bg-white transition-all focus-within:-translate-y-px"
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
          onClick={() => setOpen(current => !current)}
          onKeyDown={handleKeyDown}
          className="flex min-h-12 w-full items-center justify-between gap-3 bg-transparent pl-4 pr-14 text-left outline-none"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <div className="min-w-0 py-3">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Module
            </span>
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
          onClick={() => setOpen(current => !current)}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-700"
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
          }}
        >
          <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5">
            <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#f8fbff_0%,#f8fafc_100%)] px-4 py-3">
              <div className="flex items-center justify-end">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  {options.length} options
                </span>
              </div>
            </div>

            <div ref={listRef} className="max-h-64 overflow-y-auto p-2" role="listbox">
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-option-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="mb-1 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-all last:mb-0"
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
                        <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
                      )}
                    </span>
                    {isSelected && <i className="ri-check-line mt-0.5 text-base" style={{ color: accentColor }} />}
                  </button>
                );
              })}
              {options.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-600">No modules available</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
