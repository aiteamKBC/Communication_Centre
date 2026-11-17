import { useEffect, useState } from 'react';
import { readStoredAuthUser } from '../utils/authStorage';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

/** The administration link is shown only after the signed-in server session permits it. */
export default function useAdministrationAccess(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let pending: AbortController | undefined;

    const refresh = async (reset = false) => {
      const requestGeneration = ++generation;
      pending?.abort();
      if (reset) setAllowed(false);
      if (!readStoredAuthUser()) {
        setAllowed(false);
        return;
      }
      const controller = new AbortController();
      pending = controller;
      try {
        const response = await fetchWithTimeout('/api/administration/session/', {
          signal: controller.signal,
          cache: 'no-store',
          timeoutMs: 8000,
        });
        const payload = response.ok ? await response.json() : null;
        if (!disposed && requestGeneration === generation) {
          setAllowed(payload?.canManageAdministration === true);
        }
      } catch {
        if (!disposed && requestGeneration === generation) setAllowed(false);
      }
    };

    const onFocus = () => { void refresh(); };
    const onAuthChanged = () => { void refresh(true); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith('kbc-auth-')) onAuthChanged();
    };

    void refresh();
    const interval = window.setInterval(onFocus, 60000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('kbc-auth-changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      disposed = true;
      ++generation;
      pending?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('kbc-auth-changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return allowed;
}
