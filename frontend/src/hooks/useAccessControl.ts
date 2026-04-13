import { useEffect, useState } from 'react';

const AUTH_STORAGE_KEY = 'kbc-auth-user';

export interface AccessControl {
  adminAccess: boolean;
  eventManagerAccess: boolean;
  operationsAccess: boolean;
  itAccess: boolean;
  marketingAccess: boolean;
  canManageEvents: boolean;
  canManageCohorts: boolean;
  canManageNews: boolean;
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
};

type StoredUser = {
  id?: number | string;
  username?: string;
  email?: string;
  access?: Partial<AccessControl>;
  groups?: string[];
  [key: string]: unknown;
};

function deriveAccessFromUser(user: StoredUser | null | undefined): AccessControl {
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
  };
}

function parseStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function parseAccessFromStorage(): AccessControl {
  return deriveAccessFromUser(parseStoredUser());
}

export default function useAccessControl(): AccessControl {
  const [access, setAccess] = useState<AccessControl>(() => parseAccessFromStorage());

  useEffect(() => {
    const syncFromStorage = () => setAccess(parseAccessFromStorage());

    const syncFromServer = async () => {
      const user = parseStoredUser();
      if (!user) {
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

      try {
        const response = await fetch(`/api/auth/access/?${searchParams.toString()}`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as StoredUser;
        const merged: StoredUser = {
          ...user,
          ...payload,
          access: payload.access || user.access,
          groups: Array.isArray(payload.groups) ? payload.groups : user.groups,
        };

        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(merged));
        setAccess(deriveAccessFromUser(merged));
      } catch {
        // Keep local access when refresh fails.
      }
    };

    const handleFocus = () => {
      syncFromStorage();
      void syncFromServer();
    };

    syncFromStorage();
    void syncFromServer();

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return access;
}
