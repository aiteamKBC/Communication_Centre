import { csrfToken } from '../../utils/apiSession';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import type { Holiday } from './types';

export async function requestLmsHolidays(): Promise<Holiday[]> {
  const response = await fetchWithTimeout('/api/training-plan/lms-reference/holidays/', {
    credentials: 'same-origin', cache: 'no-store', timeoutMs: 30000,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.holidays) || !payload.holidays.every((holiday: Holiday | null) =>
    holiday && typeof holiday.id === 'string' && typeof holiday.label === 'string'
    && typeof holiday.startDate === 'string' && typeof holiday.endDate === 'string'
    && typeof holiday.type === 'string' && typeof holiday.color === 'string')) {
    throw new Error('LMS holidays could not be loaded. Please retry.');
  }
  return payload.holidays;
}

export interface LmsReferenceRow {
  sourceModuleId: string;
  sourceProgrammeId: string | null;
  programme: string | null;
  module: string | null;
  tutorName?: string | null;
  cohortId?: string | null;
  cohortName?: string | null;
  groupName?: string | null;
  startDate: string | null;
  startDateSource?: 'created_at';
  endDate: string | null;
  sessionCount?: number | null;
}

export async function requestLmsSessionCounts(): Promise<Record<string, number | null>> {
  const response = await fetchWithTimeout('/api/training-plan/lms-reference/session-counts/', {
    credentials: 'same-origin', cache: 'no-store', timeoutMs: 15000,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.sessionCounts || typeof payload.sessionCounts !== 'object' || Array.isArray(payload.sessionCounts)) {
    throw new Error('LMS session counts could not be loaded. Please retry.');
  }
  return Object.fromEntries(Object.entries(payload.sessionCounts).filter((entry): entry is [string, number | null] =>
    entry[1] === null || (typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] >= 0)));
}

export interface LmsReference {
  id: number;
  createdAt: string;
  createdBy: { id: string; name: string };
  count: number;
  contentSha256: string;
  records: LmsReferenceRow[];
}

export class LmsReferenceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requestLmsReference(capture = false): Promise<LmsReference | null> {
  const response = await fetchWithTimeout('/api/training-plan/lms-reference/', {
    method: capture ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    timeoutMs: 30000,
    ...(capture ? {
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
      body: '{}',
    } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LmsReferenceError(payload?.detail || 'The LMS reference is unavailable. Please try again.', response.status);
  }
  if (!payload || !Object.hasOwn(payload, 'reference')) {
    throw new Error('The LMS reference response could not be read.');
  }
  return payload.reference;
}

export async function requestLmsTutorNames(): Promise<Record<string, string>> {
  const response = await fetchWithTimeout('/api/training-plan/lms-reference/tutors/', {
    credentials: 'same-origin', cache: 'no-store', timeoutMs: 15000,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.tutorNames || typeof payload.tutorNames !== 'object' || Array.isArray(payload.tutorNames)) {
    throw new Error('LMS tutor names could not be loaded. Please retry.');
  }
  return Object.fromEntries(Object.entries(payload.tutorNames).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export type LmsCohortLabels = Record<string, { cohortId: string | null; cohortName: string; groupName?: string }>;

export async function requestLmsCohorts(): Promise<LmsCohortLabels> {
  const response = await fetchWithTimeout('/api/training-plan/lms-reference/cohorts/', {
    credentials: 'same-origin', cache: 'no-store', timeoutMs: 15000,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.cohorts || typeof payload.cohorts !== 'object' || Array.isArray(payload.cohorts)) {
    throw new Error('LMS cohorts could not be loaded. Please retry.');
  }
  return Object.fromEntries(Object.entries(payload.cohorts).filter((entry): entry is [string, LmsCohortLabels[string]] => {
    const value = entry[1] as LmsCohortLabels[string] | null;
    return Boolean(value && typeof value.cohortName === 'string' && (value.cohortId === null || typeof value.cohortId === 'string')
      && (value.groupName === undefined || typeof value.groupName === 'string'));
  }));
}
