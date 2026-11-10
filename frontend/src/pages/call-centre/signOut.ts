import type { useNavigate } from 'react-router-dom';
import { clearAuthStorage, readStoredAuthUser } from '../../utils/authStorage';

/** Ends the session on the server, clears the stored account and goes to the sign-in page. */
export function signOut(navigate: ReturnType<typeof useNavigate>) {
  const user = readStoredAuthUser();
  const body = JSON.stringify({
    trackingSessionId: String(user?.trackingSessionId || ''), userId: String(user?.id || ''),
    email: String(user?.email || ''), username: String(user?.username || ''), reason: 'logout_button',
  });
  void fetch('/api/auth/logout/', { method: 'POST', keepalive: true, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body }).catch(() => undefined);
  clearAuthStorage();
  navigate('/login', { replace: true });
}
