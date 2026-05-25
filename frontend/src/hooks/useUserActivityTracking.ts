import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const AUTH_STORAGE_KEY = 'kbc-auth-user';
const ACTIVITY_ENDPOINT = '/api/auth/activity/';
const HEARTBEAT_MS = 10000;

type StoredUser = {
  id?: number | string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  authProvider?: string;
  activitySessionId?: number | string;
  trackingSessionId?: string;
};

function readStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: StoredUser) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

function postActivity(payload: Record<string, unknown>, useBeacon = false) {
  const body = JSON.stringify(payload);

  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(ACTIVITY_ENDPOINT, blob);
    return;
  }

  void fetch(ACTIVITY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: useBeacon,
  }).catch(() => {
    // Tracking should never interrupt normal navigation.
  });
}

function userDisplayName(user: StoredUser): string {
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || user.email || '';
}

function applyAuditHeaders(headers: Headers, user: StoredUser | null) {
  if (!user) return;
  if (user.id !== undefined && user.id !== null) headers.set('X-KBC-User-Id', String(user.id));
  if (user.email) headers.set('X-KBC-User-Email', String(user.email));
  if (user.username) headers.set('X-KBC-Username', String(user.username));
  const displayName = userDisplayName(user);
  if (displayName) headers.set('X-KBC-Display-Name', displayName);
  if (user.trackingSessionId) headers.set('X-KBC-Tracking-Session-Id', user.trackingSessionId);
}

export function useUserActivityTracking() {
  const location = useLocation();
  const currentPathRef = useRef('');
  const enteredAtRef = useRef(Date.now());
  const activeRef = useRef(typeof document === 'undefined' ? true : document.visibilityState === 'visible' && document.hasFocus());
  const startInFlightRef = useRef(false);

  const ensureTrackingSession = async (): Promise<StoredUser | null> => {
    const user = readStoredUser();
    if (!user) return null;
    if (user.trackingSessionId) return user;
    if (startInFlightRef.current) return null;

    startInFlightRef.current = true;
    try {
      const response = await fetch('/api/auth/activity/start/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          username: user.username,
          authProvider: user.authProvider || 'existing_session',
        }),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { trackingSessionId?: string; activitySessionId?: number | string };
      if (!payload.trackingSessionId) return null;
      const nextUser = {
        ...user,
        trackingSessionId: payload.trackingSessionId,
        activitySessionId: payload.activitySessionId,
      };
      writeStoredUser(nextUser);
      return nextUser;
    } catch {
      return null;
    } finally {
      startInFlightRef.current = false;
    }
  };

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/api/')) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      applyAuditHeaders(headers, readStoredUser());
      return originalFetch(input, { ...init, headers });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const flushCurrentPath = (action: 'heartbeat' | 'page_exit' | 'logout' = 'page_exit', useBeacon = false, force = false) => {
    const user = readStoredUser();
    if (!user?.trackingSessionId || !currentPathRef.current) return;
    if (!force && action !== 'logout' && !activeRef.current) return;

    const now = Date.now();
    const durationSeconds = Math.max(0, Math.round((now - enteredAtRef.current) / 1000));
    if (durationSeconds === 0 && action !== 'logout') return;

    postActivity(
      {
        action,
        trackingSessionId: user.trackingSessionId,
        userId: user.id,
        email: user.email,
        username: user.username,
        path: currentPathRef.current,
        title: document.title,
        durationSeconds,
      },
      useBeacon,
    );

    enteredAtRef.current = now;
  };

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    void ensureTrackingSession().then(user => {
      if (!user?.trackingSessionId) return;

      if (currentPathRef.current && currentPathRef.current !== nextPath) {
        flushCurrentPath('page_exit');
      }

      currentPathRef.current = nextPath;
      enteredAtRef.current = Date.now();
      activeRef.current = document.visibilityState === 'visible' && document.hasFocus();

      postActivity({
        action: 'page_view',
        trackingSessionId: user.trackingSessionId,
        userId: user.id,
        email: user.email,
        username: user.username,
        path: nextPath,
        title: document.title,
        durationSeconds: 0,
      });
    });
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!activeRef.current || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      flushCurrentPath('heartbeat');
    }, HEARTBEAT_MS);

    const pauseTracking = () => {
      if (!activeRef.current) return;
      flushCurrentPath('page_exit', true, true);
      activeRef.current = false;
    };

    const resumeTracking = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      activeRef.current = true;
      enteredAtRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pauseTracking();
      else resumeTracking();
    };

    const handleBeforeUnload = () => {
      flushCurrentPath('page_exit', true, true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', pauseTracking);
    window.addEventListener('focus', resumeTracking);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', pauseTracking);
      window.removeEventListener('focus', resumeTracking);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushCurrentPath('page_exit', true, true);
    };
  }, []);
}
