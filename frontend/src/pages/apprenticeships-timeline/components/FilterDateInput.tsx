import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

function displayDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : value;
}

function parseDate(value: string) {
  const text = value.trim();
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
    || /^(\d{2})(\d{2})(\d{4})$/.exec(text);
  const iso = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export default function FilterDateInput({ label, value, onChange, invalid }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState(() => displayDate(value));
  const [blurred, setBlurred] = useState(false);
  const calendarRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const invalidDraft = blurred && Boolean(draft && !parseDate(draft));

  useEffect(() => {
    setDraft(displayDate(value));
    setBlurred(false);
  }, [value]);

  return <span className="mt-1 block min-w-0">
    <span className="relative block" dir="ltr">
      <input type="text" aria-label={label} dir="ltr" lang="en-GB" inputMode="numeric"
        placeholder="DD/MM/YYYY" maxLength={10} value={draft} autoComplete="off"
        aria-invalid={invalid || invalidDraft} aria-describedby={invalidDraft ? errorId : undefined}
        onChange={event => {
          const next = event.target.value;
          const iso = parseDate(next);
          setDraft(iso ? displayDate(iso) : next);
          setBlurred(false);
          if (!next.trim() || iso) onChange(iso || '');
        }}
        onBlur={() => setBlurred(true)}
        className="block h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white pl-2 pr-9 text-left text-xs tabular-nums text-slate-700" />
      <input ref={calendarRef} type="date" value={value} tabIndex={-1} aria-hidden="true"
        onChange={event => {
          setDraft(displayDate(event.target.value));
          setBlurred(false);
          onChange(event.target.value);
        }}
        className="pointer-events-none absolute right-0 top-0 h-8 w-8 opacity-0" />
      <button type="button" aria-label={`Open ${label} calendar`}
        onClick={event => {
          event.preventDefault();
          const input = calendarRef.current;
          if (input?.showPicker) input.showPicker();
          else input?.click();
        }}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-slate-500 hover:bg-slate-100">
        <CalendarDays size={14} aria-hidden="true" />
      </button>
    </span>
    {invalidDraft && <span id={errorId} role="alert" className="mt-1 block text-xs text-red-700">Enter a valid date as DD/MM/YYYY.</span>}
  </span>;
}
