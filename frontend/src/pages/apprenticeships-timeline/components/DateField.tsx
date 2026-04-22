import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate } from '../utils';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  accentColor?: string;
}

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIsoDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function monthName(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long' });
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) {
    return false;
  }

  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

export default function DateField({
  value,
  onChange,
  placeholder = 'Select a date',
  error,
  accentColor = '#1B2A4A',
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hasValue = Boolean(value);
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate || today);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 272,
  });

  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!open) {
      setYearPickerOpen(false);
    }
  }, [open]);

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

      const width = Math.max(rect.width, 272);
      const popoverHeight = 332;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const left = Math.min(
        Math.max(12, rect.left),
        viewportWidth - width - 12,
      );
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenUp = spaceBelow < popoverHeight + 12 && spaceAbove > spaceBelow;
      const top = shouldOpenUp
        ? Math.max(12, rect.top - popoverHeight - 10)
        : Math.min(viewportHeight - popoverHeight - 12, rect.bottom + 10);

      setPopoverStyle({
        top,
        left,
        width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const calendarDays = useMemo(() => {
    const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const startOffset = start.getDay();
    const totalDays = end.getDate();
    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    for (let i = startOffset; i > 0; i -= 1) {
      cells.push({
        date: new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - i),
        inMonth: false,
      });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({
        date: new Date(viewDate.getFullYear(), viewDate.getMonth(), day),
        inMonth: true,
      });
    }

    const remainder = cells.length % 7;
    const trailing = remainder === 0 ? 0 : 7 - remainder;
    for (let i = 1; i <= trailing; i += 1) {
      cells.push({
        date: new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, i),
        inMonth: false,
      });
    }

    return cells;
  }, [viewDate]);

  const yearOptions = useMemo(() => {
    const centerYear = viewDate.getFullYear();
    return Array.from({ length: 25 }, (_, index) => centerYear - 12 + index);
  }, [viewDate]);

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <div
        className="group relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all focus-within:-translate-y-px focus-within:shadow-md"
        style={{
          borderColor: error ? '#EF4444' : '#D7DEEA',
          boxShadow: error ? '0 0 0 3px rgba(239, 68, 68, 0.08)' : undefined,
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
          className="flex h-11 w-full items-center justify-between bg-transparent pl-4 pr-12 text-left outline-none"
          aria-label="Open date picker"
          aria-expanded={open}
        >
          <span className={`text-sm ${hasValue ? 'font-semibold text-gray-800' : 'font-medium text-gray-400'}`}>
            {hasValue ? formatDate(value) : placeholder}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-700"
          aria-label="Open date picker"
        >
          <i className={`text-base ${open ? 'ri-close-line' : 'ri-calendar-line'}`} />
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                  aria-label="Previous month"
                >
                  <i className="ri-arrow-left-s-line text-lg" />
                </button>
                <div className="relative text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Calendar</p>
                  <button
                    type="button"
                    onClick={() => setYearPickerOpen(current => !current)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-slate-800 transition-colors hover:bg-white"
                    aria-label="Choose year"
                    aria-expanded={yearPickerOpen}
                  >
                    <span>{monthName(viewDate)}</span>
                    <span>{viewDate.getFullYear()}</span>
                    <i className={`text-base text-slate-400 transition-transform ${yearPickerOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} />
                  </button>
                  {yearPickerOpen && (
                    <div className="absolute left-1/2 top-full z-10 mt-2 max-h-52 w-40 -translate-x-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                      {yearOptions.map(year => (
                        <button
                          key={year}
                          type="button"
                          onClick={() => {
                            setViewDate(prev => new Date(year, prev.getMonth(), 1));
                            setYearPickerOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-slate-50"
                          style={{
                            background: year === viewDate.getFullYear() ? `${accentColor}12` : 'transparent',
                            color: year === viewDate.getFullYear() ? accentColor : '#1e293b',
                          }}
                        >
                          <span>{year}</span>
                          {year === viewDate.getFullYear() && <i className="ri-check-line text-base" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                  aria-label="Next month"
                >
                  <i className="ri-arrow-right-s-line text-lg" />
                </button>
              </div>
            </div>

            <div className="p-3">
              <div className="mb-2 grid grid-cols-7 gap-1">
                {WEEK_DAYS.map(day => (
                  <span key={day} className="flex h-8 items-center justify-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {day}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map(({ date, inMonth }) => {
                  const selected = isSameDay(date, selectedDate);
                  const isToday = isSameDay(date, today);
                  return (
                    <button
                      key={toIsoDate(date)}
                      type="button"
                      onClick={() => {
                        onChange(toIsoDate(date));
                        setOpen(false);
                      }}
                      className="relative flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: selected ? accentColor : isToday ? `${accentColor}12` : 'transparent',
                        color: selected ? '#ffffff' : inMonth ? '#1f2937' : '#94a3b8',
                        boxShadow: selected ? `0 10px 24px ${accentColor}33` : undefined,
                      }}
                    >
                      {!selected && isToday && (
                        <span
                          className="absolute inset-x-2 bottom-1 h-0.5 rounded-full"
                          style={{ background: accentColor }}
                        />
                      )}
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-xs font-semibold text-slate-400 transition-colors hover:text-slate-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  setViewDate(nextDate);
                  onChange(toIsoDate(nextDate));
                  setOpen(false);
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: accentColor }}
              >
                Today
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div className="flex items-center justify-between px-1">
        <span className={`text-xs ${hasValue ? 'font-medium text-slate-600' : 'text-slate-400'}`}>
          {hasValue ? formatDate(value) : 'No date selected'}
        </span>
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
