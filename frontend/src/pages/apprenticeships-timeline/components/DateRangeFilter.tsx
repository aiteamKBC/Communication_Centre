import { emptyDateRange, type DateRangeValue } from './selectFilters';

export default function DateRangeFilter({ label, value, onChange, className = '', showClear = true }: {
  label: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
  showClear?: boolean;
}) {
  const invalid = Boolean(value.from && value.to && value.from > value.to);
  return <div role="group" aria-label={`${label} date range`} className={`min-w-0 ${className}`}>
    <div className="flex flex-wrap items-end gap-2">
      {(['from', 'to'] as const).map(key => <label key={key} className="min-w-0 flex-1 text-[11px] font-semibold text-slate-600">
        {key === 'from' ? 'From' : 'To'}
        <input type="date" aria-label={`${label} ${key === 'from' ? 'From' : 'To'}`} value={value[key]} aria-invalid={invalid}
          max={key === 'from' ? value.to || undefined : undefined} min={key === 'to' ? value.from || undefined : undefined}
          onChange={event => onChange({ ...value, [key]: event.target.value })}
          className="mt-1 block h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700" />
      </label>)}
      {showClear && (value.from || value.to) && <button type="button" aria-label={`Clear ${label} dates`}
        onClick={() => onChange(emptyDateRange)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Clear dates</button>}
    </div>
    {invalid && <p role="alert" className="mt-1 text-xs text-red-700">From must be on or before To.</p>}
  </div>;
}
