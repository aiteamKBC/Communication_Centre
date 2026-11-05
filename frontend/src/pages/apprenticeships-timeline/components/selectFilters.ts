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

export function matchesSelectFilters(option: SelectFilterMetadata, values: Record<string, string>, from: string, to: string) {
  if (Object.entries(values).some(([key, value]) => value && filterValueKey(option.filterValues?.[key]) !== value)) return false;
  if (!from && !to) return true;
  if (from && to && from > to) return false;
  if (!validDate(option.startDate) || !validDate(option.endDate) || option.startDate > option.endDate) return false;
  return (!from || option.endDate >= from) && (!to || option.startDate <= to);
}
