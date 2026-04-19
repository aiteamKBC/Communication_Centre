import { useEffect, useMemo, useRef, useState } from 'react';
import ModalPortal from '@/components/feature/ModalPortal';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  accentColor?: string;
}

type Period = 'AM' | 'PM';

function parseTimeValue(value: string): { hour: string; minute: string; period: Period } {
  const fallback = { hour: '09', minute: '00', period: 'AM' as Period };
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return fallback;
  }

  const [rawHour, minute] = value.split(':');
  const hour24 = Number.parseInt(rawHour, 10);
  if (Number.isNaN(hour24)) {
    return fallback;
  }

  const period: Period = hour24 >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour24 % 12 || 12;
  return {
    hour: String(normalizedHour).padStart(2, '0'),
    minute,
    period,
  };
}

function formatTimeValue(hour: string, minute: string, period: Period): string {
  let hour24 = Number.parseInt(hour, 10) % 12;
  if (period === 'PM') {
    hour24 += 12;
  }
  return `${String(hour24).padStart(2, '0')}:${minute}`;
}

function formatDisplayValue(value: string): string {
  const { hour, minute, period } = parseTimeValue(value);
  return `${hour}:${minute} ${period}`;
}

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const PERIODS: Period[] = ['AM', 'PM'];

export default function ModernTimeField({
  value,
  onChange,
  placeholder = 'Choose time',
  error,
  accentColor = '#1B2A4A',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const { hour, minute, period } = useMemo(() => parseTimeValue(value), [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
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

  useEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }

    const updateMenuPosition = () => {
      if (!buttonRef.current) {
        return;
      }

      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const edgePadding = 12;
      const gap = 10;
      const preferredHeight = 360;
      const width = Math.min(Math.max(Math.round(rect.width), 320), viewportWidth - edgePadding * 2);
      const left = Math.min(
        Math.max(edgePadding, rect.left),
        Math.max(edgePadding, viewportWidth - width - edgePadding),
      );
      const spaceBelow = viewportHeight - rect.bottom - edgePadding;
      const spaceAbove = rect.top - edgePadding;
      const openUpward = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(220, Math.min(preferredHeight, (openUpward ? spaceAbove : spaceBelow) - gap));

      setMenuPosition(
        openUpward
          ? {
              bottom: Math.max(edgePadding, viewportHeight - rect.top + gap),
              left,
              width,
              maxHeight,
            }
          : {
              top: Math.min(viewportHeight - edgePadding, rect.bottom + gap),
              left,
              width,
              maxHeight,
            },
      );
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    document.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      document.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  const updateValue = (nextHour: string, nextMinute: string, nextPeriod: Period) => {
    onChange(formatTimeValue(nextHour, nextMinute, nextPeriod));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(current => !current)}
        className="group flex w-full items-center justify-between gap-3 rounded-2xl border bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md"
        style={{
          borderColor: error ? '#EF4444' : open ? `${accentColor}55` : '#D7DEEA',
          boxShadow: error
            ? '0 0 0 3px rgba(239, 68, 68, 0.08)'
            : open
              ? `0 16px 34px ${accentColor}18`
              : '0 10px 24px rgba(15, 23, 42, 0.05)',
        }}
      >
        <span
          className="pointer-events-none absolute inset-y-2 left-2 w-1 rounded-full opacity-90"
          style={{ background: accentColor }}
        />
        <div className="min-w-0 pl-3">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Time
          </span>
          <span className={`block truncate text-sm font-semibold ${value ? 'text-slate-800' : 'text-slate-400'}`}>
            {value ? formatDisplayValue(value) : placeholder}
          </span>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 transition-colors group-hover:bg-slate-100">
          <i className="ri-time-line text-lg" />
        </span>
      </button>

      {open && menuPosition && (
        <ModalPortal>
          <div
            ref={menuRef}
            className="fixed z-[140] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.45)]"
            style={{
              top: menuPosition.top,
              bottom: menuPosition.bottom,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
          >
          <div className="border-b border-slate-100 bg-[linear-gradient(180deg,#fbfdff_0%,#f8fafc_100%)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Session Time</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{formatDisplayValue(value || '09:00')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
              >
                Done
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3" style={{ maxHeight: menuPosition.maxHeight }}>
            <div className="rounded-2xl bg-slate-50 p-2 min-h-0">
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Hour</p>
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {HOURS.map(item => {
                  const selected = item === hour;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => updateValue(item, minute, period)}
                      className={`flex w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                        selected ? 'text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                      style={selected ? { background: accentColor } : undefined}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-2 min-h-0">
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Minute</p>
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {MINUTES.map(item => {
                  const selected = item === minute;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => updateValue(hour, item, period)}
                      className={`flex w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                        selected ? 'text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                      style={selected ? { background: accentColor } : undefined}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-2 min-h-0">
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Period</p>
              <div className="space-y-1">
                {PERIODS.map(item => {
                  const selected = item === period;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => updateValue(hour, minute, item)}
                      className={`flex w-full items-center justify-center rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                        selected ? 'text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                      style={selected ? { background: accentColor } : undefined}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
