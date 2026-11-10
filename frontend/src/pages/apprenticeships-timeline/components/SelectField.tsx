import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { filterValueKey, matchesSelectFilters, type SelectFilterField, type SelectFilterMetadata } from './selectFilters';

interface SelectOption extends SelectFilterMetadata {
  value: string;
  label: string;
  description?: string;
  color?: string;
  disabled?: boolean;
  recommended?: boolean;
  status?: string;
  statusDescription?: string;
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
  disabled?: boolean;
  ariaLabel?: string;
  searchLabel?: string;
  searchByLabelOnly?: boolean;
  wrapLabels?: boolean;
  popoverZIndex?: number;
  filterFields?: SelectFilterField[];
  filterByDateRange?: boolean;
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
  disabled = false,
  ariaLabel,
  searchLabel,
  searchByLabelOnly = false,
  wrapLabels = false,
  popoverZIndex = 120,
  filterFields,
  filterByDateRange = false,
}: Props) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const hasFilters = Object.values(filterValues).some(Boolean) || Boolean(filterByDateRange && (from || to));
  const invalidRange = Boolean(filterByDateRange && from && to && from > to);
  const hasFilterControls = Boolean(filterFields?.length || filterByDateRange);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex(option => option.value === value)));
  const [popoverStyle, setPopoverStyle] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 320,
    maxHeight: 380,
  });
  const [positionReady, setPositionReady] = useState(false);

  useEffect(() => {
    if (open && positionReady && !disabled) searchRef.current?.focus({ preventScroll: true });
  }, [open, positionReady, disabled]);

  const selectedOption = useMemo(
    () => options.find(option => option.value === value) ?? null,
    [options, value],
  );
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return options.filter(option => (
      (!term || option.label.toLowerCase().includes(term) ||
      (!searchByLabelOnly && (option.value.toLowerCase().includes(term) ||
      (option.description || '').toLowerCase().includes(term))))
      && matchesSelectFilters(option, filterValues, filterByDateRange ? from : '', filterByDateRange ? to : '')
    ));
  }, [options, query, searchByLabelOnly, filterValues, filterByDateRange, from, to]);

  const closeAndFocus = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const choose = (option: SelectOption | undefined) => {
    if (!option || option.disabled || disabled) return;
    onChange(option.value);
    closeAndFocus();
  };

  const moveActive = (direction: number) => {
    setActiveIndex(current => {
      let next = current + direction;
      while (next >= 0 && next < filteredOptions.length) {
        if (!filteredOptions[next].disabled) return next;
        next += direction;
      }
      return current;
    });
  };

  const toggleOpen = () => {
    if (disabled) return;
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
    const nextIndex = filteredOptions.findIndex(option => option.value === value && !option.disabled);
    setActiveIndex(nextIndex >= 0 ? nextIndex : filteredOptions.findIndex(option => !option.disabled));
  }, [filteredOptions, value]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [query, filterValues, from, to]);

  useLayoutEffect(() => {
    if (!open || disabled) {
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
  }, [open, disabled]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 320), viewportWidth - 24);
      const popoverHeight = hasFilterControls ? 600 : 380;
      const left = Math.min(Math.max(12, rect.left), viewportWidth - width - 12);
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 20);
      const spaceAbove = Math.max(0, rect.top - 20);
      const shouldOpenUp = spaceBelow < popoverHeight + 12 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(popoverHeight, shouldOpenUp ? spaceAbove : spaceBelow);
      setPopoverStyle(shouldOpenUp
        ? { bottom: viewportHeight - rect.top + 8, left, width, maxHeight }
        : { top: rect.bottom + 8, left, width, maxHeight });
      setPositionReady(true);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, disabled, hasFilterControls]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const activeElement = listRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    if (activeElement && listRef.current) {
      const list = listRef.current;
      if (activeElement.offsetTop < list.scrollTop) list.scrollTop = activeElement.offsetTop;
      else if (activeElement.offsetTop + activeElement.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = activeElement.offsetTop + activeElement.offsetHeight - list.clientHeight;
      }
    }
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
      moveActive(1);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveActive(-1);
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const option = filteredOptions[activeIndex];
      choose(option);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative space-y-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <div
        className="group relative overflow-hidden rounded-xl border bg-white transition-all"
        style={{
          borderColor: error ? '#EF4444' : open ? `${accentColor}66` : '#D7DEEA',
          backgroundColor: selectedOption?.status ? '#ECFDF5' : undefined,
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
          aria-label={ariaLabel}
          aria-description={selectedOption?.statusDescription || selectedOption?.status}
          data-selected-status={selectedOption?.status}
          aria-expanded={open && !disabled}
          aria-controls={open && !disabled ? listId : undefined}
          disabled={disabled}
        >
          <div className="min-w-0 py-2">
            {selectedOption ? (
              <div className="flex flex-wrap items-center gap-2">
                {selectedOption.color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: selectedOption.color }}
                  />
                )}
                <span className="truncate text-sm font-semibold text-gray-800">{selectedOption.label}</span>
                {selectedOption.status && <span aria-hidden="true" className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">✓ {selectedOption.status}</span>}
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
          disabled={disabled}
          tabIndex={-1}
        >
          <i aria-hidden="true" className={`text-base ${open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`} />
        </button>
      </div>

      {open && !disabled && createPortal(
        <div
          ref={popoverRef}
          data-select-list-id={listId}
          className="fixed"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeAndFocus();
            }
            if (event.key === 'Tab') {
              const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)')]
                .filter(control => control.tabIndex >= 0);
              if ((event.shiftKey && document.activeElement === controls[0])
                  || (!event.shiftKey && document.activeElement === controls[controls.length - 1])) {
                event.preventDefault();
                closeAndFocus();
              }
            }
          }}
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)
                && !wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
          style={{
            top: popoverStyle.top,
            bottom: popoverStyle.bottom,
            left: popoverStyle.left,
            width: popoverStyle.width,
            visibility: positionReady ? 'visible' : 'hidden',
            zIndex: popoverZIndex,
          }}
        >
          <div style={{ maxHeight: popoverStyle.maxHeight }} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                {query.trim() || hasFilters ? `${filteredOptions.length}/${options.length}` : `${options.length} options`}
              </span>
            </div>

            <div className="shrink-0 border-b border-slate-100 bg-white p-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-slate-300 focus-within:bg-white">
                <i aria-hidden="true" className="ri-search-line text-sm text-slate-400" />
                <input
                  ref={searchRef}
                  type="search"
                  role="combobox"
                  aria-label={searchLabel || `Search ${label}`}
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      moveActive(event.key === 'ArrowDown' ? 1 : -1);
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const option = filteredOptions[activeIndex];
                      choose(option);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
                />
                {(query || hasFilters) && (
                  <button
                    type="button"
                    onClick={() => { searchRef.current?.focus({ preventScroll: true }); setFilterValues({}); setFrom(''); setTo(''); setQuery(''); }}
                    className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label={hasFilterControls ? 'Reset search and filters' : 'Clear search'}
                    title={hasFilterControls ? 'Reset search and filters' : 'Clear search'}
                  >
                    <i aria-hidden="true" className="ri-close-line text-sm" />
                  </button>
                )}
              </div>
            </div>

            {hasFilterControls && <div role="group" aria-label={`${label} filters`} className="max-h-[45vh] shrink-0 space-y-2 overflow-y-auto border-b border-slate-100 bg-slate-50 p-2">
              <div className="grid grid-cols-2 gap-2">
                {filterFields?.map(field => {
                  const descendants = filterFields.filter(candidate => candidate.dependsOn?.includes(field.key));
                  // Parents can always change. Sibling choices (group/tutor)
                  // narrow each other to combinations present in the data.
                  const scope = Object.fromEntries(Object.entries(filterValues)
                    .filter(([key]) => key !== field.key && !descendants.some(candidate => candidate.key === key)));
                  const missingParent = field.dependsOn?.find(key => !filterValues[key]);
                  const choices = new Map<string, string>();
                  for (const option of options) {
                    if (missingParent || !matchesSelectFilters(option, scope, '', '')) continue;
                    const value = option.filterValues?.[field.key];
                    choices.set(filterValueKey(value), value?.trim() || 'Not provided');
                  }
                  // Keep a selected value visible if refreshed data no longer contains it.
                  const active = filterValues[field.key];
                  if (active && !choices.has(active)) choices.set(active, JSON.parse(active) || 'Not provided');
                  return <label key={field.key} className="min-w-0 text-[11px] font-semibold text-slate-600">{field.label}
                    <select aria-label={`${label} ${field.label} filter`} value={active || ''}
                      disabled={Boolean(missingParent)}
                      onChange={event => setFilterValues(current => {
                        const next = { ...current, [field.key]: event.target.value };
                        for (const descendant of descendants) delete next[descendant.key];
                        return next;
                      })}
                      className="mt-1 h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-700 disabled:bg-slate-100 disabled:text-slate-400">
                      <option value="">{missingParent ? `Choose ${filterFields.find(parent => parent.key === missingParent)?.label || missingParent} first` : 'All'}</option>
                      {[...choices].sort(([, left], [, right]) => left.localeCompare(right, 'en-GB', { numeric: true }))
                        .map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                    </select>
                  </label>;
                })}
                {filterByDateRange && <>
                  <label className="min-w-0 text-[11px] font-semibold text-slate-600">From
                    <input type="date" aria-label={`${label} From`} value={from} max={to || undefined} aria-invalid={invalidRange}
                      onChange={event => setFrom(event.target.value)} className="mt-1 h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-700" />
                  </label>
                  <label className="min-w-0 text-[11px] font-semibold text-slate-600">To
                    <input type="date" aria-label={`${label} To`} value={to} min={from || undefined} aria-invalid={invalidRange}
                      onChange={event => setTo(event.target.value)} className="mt-1 h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-1 text-xs text-slate-700" />
                  </label>
                </>}
              </div>
              {invalidRange && <p role="alert" className="text-xs text-red-700">From must be on or before To.</p>}
            </div>}

            <div ref={listRef} id={listId} className="relative min-h-0 max-h-64 overflow-y-auto overscroll-contain p-2" role="listbox" aria-label={label}>
              {filteredOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={`${option.value}-${option.description || ''}-${index}`}
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-description={[option.statusDescription || option.status, option.recommended ? 'Recommended: shares a word with the current module' : ''].filter(Boolean).join('. ') || undefined}
                    disabled={option.disabled}
                    title={option.disabled ? 'Already matched to another module' : undefined}
                    tabIndex={-1}
                    data-option-index={index}
                    data-option-status={option.status}
                    onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all last:mb-0 disabled:cursor-not-allowed ${option.status ? 'disabled:opacity-80' : 'disabled:opacity-40'}`}
                    style={{
                      background: option.status ? (isSelected ? '#D1FAE5' : '#ECFDF5') : isSelected ? `${accentColor}12` : isActive ? '#F8FAFC' : 'transparent',
                      boxShadow: option.status ? `inset 0 0 0 ${isActive || isSelected ? 2 : 1}px #6EE7B7` : isSelected ? `inset 0 0 0 1px ${accentColor}33` : isActive ? 'inset 0 0 0 1px rgba(148,163,184,0.18)' : undefined,
                    }}
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: option.status ? '#059669' : option.color || accentColor }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold leading-5 text-slate-800 ${wrapLabels ? 'whitespace-normal break-words' : 'truncate'}`}>{option.label}</span>
                      {option.description && (
                        <span className="block text-xs text-slate-500">{option.description}</span>
                      )}
                      {option.status && <span aria-hidden="true" className="mt-1 inline-block rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">✓ {option.status}</span>}
                      {option.statusDescription && <span aria-hidden="true" className="mt-1 block text-xs text-emerald-800">{option.statusDescription}</span>}
                    </span>
                    {option.recommended && !option.status && <span aria-hidden="true" className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">Recommended</span>}
                    {isSelected && <i aria-hidden="true" className="ri-check-line mt-0.5 text-base" style={{ color: accentColor }} />}
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-600">{emptyTitle}</p>
                  <p className="mt-1 text-xs text-slate-400">{hasFilters ? 'Try another search or clear the filters.' : emptyText}</p>
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
