import { useEffect, useRef, useState } from 'react';

export type ModernSelectOption = {
  label: string;
  value: string;
};

interface ModernSelectProps {
  value: string;
  options: ModernSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
}

export default function ModernSelect({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  className = '',
  buttonClassName = '',
  menuClassName = '',
}: ModernSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const selectedOption = options.find(option => option.value === value);

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
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selectedOption ? 'text-slate-700' : 'text-slate-400'}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-transform ${open ? 'rotate-180 bg-kbc-navy/5 text-kbc-navy' : ''}`}>
          <i className="ri-arrow-down-s-line text-lg" />
        </span>
      </button>

      {open && (
        <div className={`absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.45)] backdrop-blur ${menuClassName}`}>
          <div className="max-h-72 overflow-y-auto">
            {options.map(option => {
              const selected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'bg-kbc-navy text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  role="option"
                  aria-selected={selected}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                    selected
                      ? 'border-white/30 bg-white/15 text-white'
                      : 'border-slate-200 bg-white text-transparent'
                  }`}>
                    <i className="ri-check-line" />
                  </span>
                  <span className="truncate text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
