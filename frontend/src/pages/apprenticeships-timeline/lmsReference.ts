import { csrfToken } from '../../utils/apiSession';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

export interface LmsReferenceRow {
  sourceModuleId: string;
  sourceProgrammeId: string | null;
  programme: string | null;
  module: string | null;
  startDate: string | null;
  endDate: string | null;
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
