import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

export type AdministrationSession = {
  canManageAdministration: boolean;
  canManagePrivilegedAccounts: boolean;
  currentUserId: number;
  djangoAdminUrl: string | null;
};

export type AdministrationRole = {
  id: string;
  groupId: number | null;
  name: string;
  description: string;
  section: 'communication' | 'engagement' | 'custom';
  groupName: string;
  assignedCount: number;
  permissions: string[];
  isSystem: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAssign?: boolean;
  revision: string;
  unmanagedPermissions: { id: string; name: string }[];
};

export type PermissionSection = {
  id: string;
  name: string;
  description: string;
  permissions: { id: string; name: string; action: string; baseline?: boolean }[];
};

export type RolesResponse = { roles: AdministrationRole[]; permissionSections: PermissionSection[] };
export type RoleMutationResponse = { role: AdministrationRole; warnings?: string[] };

export type AdministrationUser = {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  isActive: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  roles: string[];
  otherGroups: string[];
  lastLogin: string | null;
  dateJoined: string | null;
  revision: string;
  canEdit: boolean;
  canDelete: boolean;
};

export type UsersResponse = { users: AdministrationUser[]; total: number; page: number; pageSize: number };
export type ChangeEntry = { id: number; createdAt: string; actor: string; action: string; objectLabel: string; summary: string };
export type HistoryResponse = { entries: ChangeEntry[]; total: number; page: number; pageSize: number };
export type UserMutationResponse = { user: AdministrationUser; warnings?: string[] };

export class AdministrationError extends Error {
  status: number;
  errors: Record<string, string[]>;

  constructor(message: string, status: number, errors?: Record<string, string[] | string>) {
    super(message);
    this.name = 'AdministrationError';
    this.status = status;
    this.errors = Object.fromEntries(Object.entries(errors || {}).map(([key, value]) => [key, Array.isArray(value) ? value : [String(value)]]));
  }
}

export async function adminRequest<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`/api/administration/${path}`, {
      method: options.method || 'GET',
      signal: options.signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      timeoutMs: 15000,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new AdministrationError('The server could not be reached. Check your connection and try again.', 0);
  }
  if (response.status === 204) return {} as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdministrationError(payload?.detail || (response.status === 403 ? 'You do not have permission to perform this action.' : 'The request could not be completed. Please try again.'), response.status, payload?.errors);
  }
  if (!payload) throw new AdministrationError('The server returned an unexpected response. Please try again.', response.status);
  return payload as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function displayDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
