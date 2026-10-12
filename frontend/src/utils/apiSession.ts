import { clearAuthStorage, readStoredAuthUser } from './authStorage';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * The backend API runs on the signed-in Django session. For every same-origin /api/ request this sends the CSRF
 * token on changes, and a 401 (the session ended) clears the stored sign-in so the app returns to the login page.
 */
export function installApiSession() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const token = UNSAFE_METHODS.has(method) ? csrfToken() : '';
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (token && !headers.get('X-CSRFToken')) headers.set('X-CSRFToken', token);
    const response = await originalFetch(input, token ? { ...init, headers } : init);
    if (response.status === 401 && !url.pathname.startsWith('/api/auth/login') && readStoredAuthUser()) {
      clearAuthStorage();
    }
    return response;
  };
}
