import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import ModalPortal from './ModalPortal';

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
  inlineMenu?: boolean;
  menuMinWidth?: number;
  boundaryRef?: RefObject<HTMLElement | null>;
  renderValue?: (option: ModernSelectOption | undefined) => ReactNode;
  renderOption?: (option: ModernSelectOption, selected: boolean) => ReactNode;
}

export default function ModernSelect({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  inlineMenu = false,
  menuMinWidth = 0,
  boundaryRef,
  renderValue,
  renderOption,
}: ModernSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectId = useId();
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

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

    function handleSelectOpen(event: Event) {
      const customEvent = event as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== selectId) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('modern-select-open', handleSelectOpen as EventListener);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('modern-select-open', handleSelectOpen as EventListener);
    };
  }, [selectId]);

  useEffect(() => {
    if (!open || inlineMenu || !buttonRef.current) {
      return;
    }

    const updateMenuPosition = () => {
      if (!buttonRef.current) {
        return;
      }

      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const boundaryRect = boundaryRef?.current?.getBoundingClientRect();
      const gap = 10;
      const edgePadding = 12;
      const horizontalStart = boundaryRect ? boundaryRect.left + edgePadding : edgePadding;
      const horizontalEnd = boundaryRect ? boundaryRect.right - edgePadding : viewportWidth - edgePadding;
      const maxAllowedWidth = Math.max(180, horizontalEnd - horizontalStart);
      const width = Math.min(Math.max(Math.round(rect.width), menuMinWidth), maxAllowedWidth);
      const spaceBelow = viewportHeight - rect.bottom - edgePadding;
      const spaceAbove = rect.top - edgePadding;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const left = Math.min(
        Math.max(horizontalStart, rect.left),
        Math.max(horizontalStart, horizontalEnd - width),
      );
      const maxHeight = Math.max(140, Math.min(288, (openUpward ? spaceAbove : spaceBelow) - gap));

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
  }, [boundaryRef, inlineMenu, menuMinWidth, open]);

  const selectedOption = options.find(option => option.value === value);
  const selectedValueContent = renderValue?.(selectedOption) ?? selectedOption?.label ?? placeholder;
  const toggleOpen = () => {
    setOpen(current => {
      const next = !current;
      if (next) {
        window.dispatchEvent(new CustomEvent('modern-select-open', { detail: { id: selectId } }));
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
          open
            ? 'border-kbc-navy/30 bg-white shadow-lg shadow-slate-200/70 ring-4 ring-kbc-navy/5'
            : 'border-slate-200 bg-white shadow-sm shadow-slate-200/50 hover:border-slate-300 hover:shadow-md'
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selectedOption ? 'text-slate-700' : 'text-slate-400'}`}>
          {selectedValueContent}
        </span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-transform ${open ? 'rotate-180 bg-kbc-navy/5 text-kbc-navy' : ''}`}>
          <i className="ri-arrow-down-s-line text-lg" />
        </span>
      </button>

      {open && inlineMenu && (
        <div ref={menuRef} className={`relative z-10 mt-2 w-max min-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.45)] backdrop-blur ${menuClassName}`}>
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
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {renderOption ? renderOption(option, selected) : option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {open && !inlineMenu && menuPosition && (
        <ModalPortal>
          <div
            ref={menuRef}
            className={`fixed z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.45)] backdrop-blur ${menuClassName}`}
            style={{
              top: menuPosition.top,
              bottom: menuPosition.bottom,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
          >
            <div style={{ maxHeight: menuPosition.maxHeight }} className="overflow-y-auto">
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
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {renderOption ? renderOption(option, selected) : option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
