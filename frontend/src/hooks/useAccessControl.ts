import { useEffect, useState } from 'react';
import { AUTH_STORAGE_KEY, clearAuthStorage, readStoredAuthUser, type StoredAuthUser } from '../utils/authStorage';

export interface AccessControl {
  adminAccess: boolean;
  eventManagerAccess: boolean;
  operationsAccess: boolean;
  itAccess: boolean;
  marketingAccess: boolean;
  canManageEvents: boolean;
  canManageCohorts: boolean;
  canManageNews: boolean;
  sessionInvalid: boolean;
}

const EMPTY_ACCESS: AccessControl = {
  adminAccess: false,
  eventManagerAccess: false,
  operationsAccess: false,
  itAccess: false,
  marketingAccess: false,
  canManageEvents: false,
  canManageCohorts: false,
  canManageNews: false,
  sessionInvalid: false,
};

const ACCESS_REFRESH_TTL_MS = 60000;
let sharedAccessKey = '';
let sharedAccessFetchedAt = 0;
let sharedAccessValue: AccessControl | null = null;
let sharedAccessPromise: Promise<AccessControl | null> | null = null;

function invalidSessionAccess(): AccessControl {
  return { ...EMPTY_ACCESS, sessionInvalid: true };
}

function deriveAccessFromUser(user: StoredAuthUser | null | undefined): AccessControl {
  if (!user) {
    return EMPTY_ACCESS;
  }

  const access = user?.access || {};
  const groups = new Set((Array.isArray(user?.groups) ? user.groups : []).map(item => String(item).trim()));
  const hasGroupData = groups.size > 0;

  const adminAccess = hasGroupData
    ? groups.has('Admin Access')
    : Boolean(access.adminAccess);

  const eventManagerAccess = hasGroupData
    ? (adminAccess || groups.has('Event Manager Access'))
    : (adminAccess || Boolean(access.eventManagerAccess) || Boolean(access.canManageEvents));

  const operationsAccess = hasGroupData
    ? (adminAccess || groups.has('Operations Access'))
    : (adminAccess || Boolean(access.operationsAccess) || Boolean(access.canManageCohorts));

  const itAccess = hasGroupData
    ? (adminAccess || groups.has('IT Access'))
    : (adminAccess || Boolean(access.itAccess));

  const marketingAccess = hasGroupData
    ? (adminAccess || groups.has('Marketing Access'))
    : (adminAccess || Boolean(access.marketingAccess));

  return {
    adminAccess,
    eventManagerAccess,
    operationsAccess,
    itAccess,
    marketingAccess,
    canManageEvents: eventManagerAccess,
    canManageCohorts: operationsAccess,
    canManageNews: adminAccess || itAccess || marketingAccess,
    sessionInvalid: false,
  };
}

function parseAccessFromStorage(): AccessControl {
  // Access in localStorage is cache only for temporary UI continuity. The
  // backend/database response below is the source of truth.
  return deriveAccessFromUser(readStoredAuthUser());
}

function resetSharedAccessCache() {
  sharedAccessKey = '';
  sharedAccessFetchedAt = 0;
  sharedAccessValue = null;
  sharedAccessPromise = null;
}

export default function useAccessControl(): AccessControl {
  const [access, setAccess] = useState<AccessControl>(() => parseAccessFromStorage());

  useEffect(() => {
    const syncFromStorage = () => setAccess(parseAccessFromStorage());

    const syncFromServer = async () => {
      const user = readStoredAuthUser();
      if (!user) {
        setAccess(EMPTY_ACCESS);
        return;
      }

      const searchParams = new URLSearchParams();
      if (user.id !== undefined && user.id !== null && String(user.id).trim()) {
        searchParams.set('userId', String(user.id));
      } else if (user.email && String(user.email).trim()) {
        searchParams.set('email', String(user.email));
      } else if (user.username && String(user.username).trim()) {
        searchParams.set('username', String(user.username));
      } else {
        return;
      }

      const accessKey = searchParams.toString();
      const now = Date.now();

      if (sharedAccessKey === accessKey && now - sharedAccessFetchedAt < ACCESS_REFRESH_TTL_MS) {
        if (sharedAccessValue) {
          setAccess(sharedAccessValue);
        }
        return;
      }

      if (sharedAccessKey === accessKey && sharedAccessPromise) {
        const nextAccess = await sharedAccessPromise;
        if (nextAccess) {
          setAccess(nextAccess);
        }
        return;
      }

      sharedAccessKey = accessKey;
      sharedAccessPromise = (async () => {
        const response = await fetch(`/api/auth/access/?${searchParams.toString()}`);
        sharedAccessFetchedAt = Date.now();
        if (!response.ok) {
          if (response.status === 404) {
            // A 404 from access means the cached auth user is stale or invalid
            // (for example a deleted login_db user id). Clear it immediately so
            // the app stops sending invalid ids and asks for a fresh login.
            clearAuthStorage();
            sharedAccessValue = invalidSessionAccess();
            return sharedAccessValue;
          }
          sharedAccessValue = null;
          return null;
        }

        const payload = (await response.json()) as StoredAuthUser;
        const merged: StoredAuthUser = {
          ...user,
          ...payload,
          access: payload.access || user.access,
          groups: Array.isArray(payload.groups) ? payload.groups : user.groups,
        };

        // Keep localStorage as a cache of the latest database-backed access.
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(merged));
        sharedAccessValue = deriveAccessFromUser(merged);
        return sharedAccessValue;
      })();

      try {
        const nextAccess = await sharedAccessPromise;
        if (nextAccess) {
          setAccess(nextAccess);
        }
      } catch {
        // Keep local access when refresh fails.
      } finally {
        sharedAccessPromise = null;
      }
    };

    const handleFocus = () => {
      syncFromStorage();
      void syncFromServer();
    };

    const handleAuthChanged = () => {
      resetSharedAccessCache();
      syncFromStorage();
      void syncFromServer();
    };

    syncFromStorage();
    void syncFromServer();

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('kbc-auth-changed', handleAuthChanged);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('kbc-auth-changed', handleAuthChanged);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return access;
}
