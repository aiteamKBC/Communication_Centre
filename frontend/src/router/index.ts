import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useRoutes } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import routes from "./config";
import { useUserActivityTracking } from "../hooks/useUserActivityTracking";
import { useRealtimeUpdates } from "../hooks/useRealtimeUpdates";
import { readStoredAuthUser } from "../utils/authStorage";

function hasAuthSession(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(readStoredAuthUser());
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
  const [authRevision, setAuthRevision] = useState(0);
  const isAuthenticated = hasAuthSession();
  const isLoginRoute = location.pathname.startsWith('/login');
  const realtimeEnabled = isAuthenticated && !isLoginRoute && import.meta.env.VITE_ENABLE_REALTIME !== 'false';
  const activityTrackingEnabled = isAuthenticated && !isLoginRoute && import.meta.env.VITE_ENABLE_ACTIVITY_TRACKING !== 'false';

  useRealtimeUpdates({ enabled: realtimeEnabled });
  useUserActivityTracking({ enabled: activityTrackingEnabled });

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
  }, [isAuthenticated, isLoginRoute, location, navigate, authRevision]);

  useEffect(() => {
    const handleAuthChanged = () => setAuthRevision(value => value + 1);
    window.addEventListener('kbc-auth-changed', handleAuthChanged);
    return () => window.removeEventListener('kbc-auth-changed', handleAuthChanged);
  }, []);

  if (!isAuthenticated && !isLoginRoute) {
    return null;
  }

  if (isAuthenticated && isLoginRoute) {
    return null;
  }

  return element;
}
