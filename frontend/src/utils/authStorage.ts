export const AUTH_STORAGE_KEY = 'kbc-auth-user';
export const MS_AUTH_RESULT_KEY = 'kbc-ms-auth-result';

export type StoredAuthUser = {
  id?: number | string;
  username?: string;
  email?: string;
  access?: Record<string, unknown>;
  groups?: string[];
  [key: string]: unknown;
};

const AUTH_PREFIXES = ['kbc-auth-', 'kbc-ms-auth-'];

function dispatchAuthChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('kbc-auth-changed'));
}

export function clearAuthStorage() {
  if (typeof window === 'undefined') return;

  Object.keys(window.localStorage)
    .filter(key => AUTH_PREFIXES.some(prefix => key.startsWith(prefix)))
    .forEach(key => window.localStorage.removeItem(key));

  Object.keys(window.sessionStorage)
    .filter(key => AUTH_PREFIXES.some(prefix => key.startsWith(prefix)))
    .forEach(key => window.sessionStorage.removeItem(key));

  dispatchAuthChanged();
}

export function readStoredAuthUser(): StoredAuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as StoredAuthUser : null;
  } catch {
    clearAuthStorage();
    return null;
  }
}

export function replaceStoredAuthUser(user: StoredAuthUser) {
  if (typeof window === 'undefined') return;

  // Auth data in localStorage is only a client cache. Login replaces it fully so
  // old ids, access flags, groups, and tracking session ids cannot survive.
  clearAuthStorage();
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  dispatchAuthChanged();
}
