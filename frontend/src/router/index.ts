import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useRoutes } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import routes from "./config";

const AUTH_STORAGE_KEY = 'kbc-auth-user';

function hasAuthSession(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    return !!parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

let navigateResolver: (navigate: ReturnType<typeof useNavigate>) => void;

declare global {
  interface Window {
    REACT_APP_NAVIGATE: ReturnType<typeof useNavigate>;
  }
}

export const navigatePromise = new Promise<NavigateFunction>((resolve) => {
  navigateResolver = resolve;
});

export function AppRoutes() {
  const element = useRoutes(routes);
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = hasAuthSession();
  const isLoginRoute = location.pathname.startsWith('/login');

  useEffect(() => {
    if (!isAuthenticated && !isLoginRoute) {
      navigate('/login', { replace: true, state: { from: location } });
      return;
    }

    if (isAuthenticated && isLoginRoute) {
      navigate('/', { replace: true });
      return;
    }

    window.REACT_APP_NAVIGATE = navigate;
    navigateResolver(window.REACT_APP_NAVIGATE);
  }, [isAuthenticated, isLoginRoute, location, navigate]);

  if (!isAuthenticated && !isLoginRoute) {
    return null;
  }

  if (isAuthenticated && isLoginRoute) {
    return null;
  }

  return element;
}
