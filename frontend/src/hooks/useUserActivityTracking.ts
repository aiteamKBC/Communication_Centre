import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const AUTH_STORAGE_KEY = 'kbc-auth-user';
const ACTIVITY_ENDPOINT = '/api/auth/activity/';
const HEARTBEAT_MS = 15000;

type StoredUser = {
  id?: number | string;
  email?: string;
  username?: string;
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

export function useUserActivityTracking() {
  const location = useLocation();
  const currentPathRef = useRef('');
  const enteredAtRef = useRef(Date.now());

  const flushCurrentPath = (action: 'heartbeat' | 'page_exit' | 'logout' = 'page_exit', useBeacon = false) => {
    const user = readStoredUser();
    if (!user?.trackingSessionId || !currentPathRef.current) return;

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
    const user = readStoredUser();
    if (!user?.trackingSessionId) return;

    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    if (currentPathRef.current && currentPathRef.current !== nextPath) {
      flushCurrentPath('page_exit');
    }

    currentPathRef.current = nextPath;
    enteredAtRef.current = Date.now();

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
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      flushCurrentPath('heartbeat');
    }, HEARTBEAT_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrentPath('page_exit', true);
      } else {
        enteredAtRef.current = Date.now();
      }
    };

    const handleBeforeUnload = () => {
      flushCurrentPath('page_exit', true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushCurrentPath('page_exit', true);
    };
  }, []);
}
