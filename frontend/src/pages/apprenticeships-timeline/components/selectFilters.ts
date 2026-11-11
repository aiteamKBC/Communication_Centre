export interface DateRangeValue { from: string; to: string }
export type DateRangeMatch = 'overlap' | 'within';
export const emptyDateRange: DateRangeValue = { from: '', to: '' };

export interface SelectFilterField {
  key: string;
  label: string;
  dependsOn?: string[];
}

export interface SelectFilterMetadata {
  filterValues?: Record<string, string | null | undefined>;
  startDate?: string | null;
  endDate?: string | null;
}

export const filterValueKey = (value: string | null | undefined) => JSON.stringify(value?.trim().toLowerCase() || '');

const validDate = (value: string | null | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function matchesSelectFilters(option: SelectFilterMetadata, values: Record<string, string>, from: string, to: string, match: DateRangeMatch = 'overlap') {
  if (Object.entries(values).some(([key, value]) => value && filterValueKey(option.filterValues?.[key]) !== value)) return false;
  return matchesDateRange(option.startDate, option.endDate, from, to, match);
}

export function matchesDateRange(startDate: string | null | undefined, endDate: string | null | undefined, from: string, to: string, match: DateRangeMatch = 'overlap') {
  if (!from && !to) return true;
  if (from && to && from > to) return false;
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return false;
  if (match === 'within') return (!from || startDate >= from) && (!to || endDate <= to);
  return (!from || endDate >= from) && (!to || startDate <= to);
}
