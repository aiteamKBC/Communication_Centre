import { useEffect, useMemo, useRef, useState } from 'react';

interface ModernDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
}

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parseDateValue(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplay(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function ModernDatePicker({
  value,
  onChange,
  placeholder = 'mm/dd/yyyy',
  className = '',
  buttonClassName = '',
}: ModernDatePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseDateValue(value);
  const today = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => selectedDate ?? today);

  useEffect(() => {
    if (selectedDate) {
      setVisibleMonth(selectedDate);
    }
  }, [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const currentMonthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const gridStart = new Date(currentMonthStart);
  gridStart.setDate(1 - currentMonthStart.getDay());

  const dayCells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
          open
            ? 'border-kbc-navy/30 bg-white shadow-lg shadow-slate-200/70 ring-4 ring-kbc-navy/5'
            : 'border-slate-200 bg-white shadow-sm shadow-slate-200/50 hover:border-slate-300 hover:shadow-md'
        } ${buttonClassName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selectedDate ? 'text-slate-700' : 'text-slate-400'}`}>
          {selectedDate ? formatDisplay(selectedDate) : placeholder}
        </span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors ${open ? 'bg-kbc-navy/5 text-kbc-navy' : ''}`}>
          <i className="ri-calendar-line text-base" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-[19rem] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Pick a date</p>
              <p className="text-sm font-bold text-kbc-navy">
                {MONTH_NAMES[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-kbc-navy"
                aria-label="Previous month"
              >
                <i className="ri-arrow-left-s-line text-base" />
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-kbc-navy"
                aria-label="Next month"
              >
                <i className="ri-arrow-right-s-line text-base" />
              </button>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1">
            {WEEK_DAYS.map(day => (
              <span key={day} className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {dayCells.map(date => {
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
              const isToday = isSameDay(date, today);

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(formatValue(date));
                    setOpen(false);
                  }}
                  className={`flex h-9 items-center justify-center rounded-xl text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-kbc-navy text-white shadow-sm'
                      : isToday
                        ? 'bg-kbc-amber/15 text-kbc-navy'
                        : isCurrentMonth
                          ? 'text-slate-700 hover:bg-slate-100'
                          : 'text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-xs font-semibold text-slate-400 hover:text-kbc-navy"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(formatValue(today));
                setVisibleMonth(today);
                setOpen(false);
              }}
              className="text-xs font-semibold text-kbc-navy hover:text-kbc-navy-light"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
