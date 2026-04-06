import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AUTH_STORAGE_KEY = 'kbc-auth-user';
const MS_AUTH_RESULT_KEY = 'kbc-ms-auth-result';

function isAllowedMsMessageOrigin(origin: string): boolean {
  if (origin === window.location.origin) {
    return true;
  }

  // Accept localhost/127.0.0.1 as equivalent for local development.
  const swapped = window.location.origin.includes('localhost')
    ? window.location.origin.replace('localhost', '127.0.0.1')
    : window.location.origin.replace('127.0.0.1', 'localhost');

  return origin === swapped;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyMicrosoftAuthResult = (data: { ms_auth?: string | null; ms_user?: string | null; ms_error?: string | null }) => {
    if (data.ms_auth === 'error') {
      setError(data.ms_error || 'Microsoft sign-in failed.');
      return;
    }

    if (data.ms_auth === 'success' && data.ms_user) {
      try {
        const padded = data.ms_user + '='.repeat((4 - (data.ms_user.length % 4)) % 4);
        const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
        const user = JSON.parse(decoded);
        window.localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({
            ...user,
            loggedInAt: new Date().toISOString(),
          }),
        );
        navigate('/', { replace: true });
      } catch {
        setError('Microsoft sign-in response could not be processed.');
      }
    }
  };

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6;
  }, [email, password]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msAuth = params.get('ms_auth');
    const msUser = params.get('ms_user');
    const msError = params.get('ms_error');

    if (!msAuth) {
      return;
    }

    if (msAuth === 'error') {
      setError(msError || 'Microsoft sign-in failed.');
      navigate('/login', { replace: true });
      return;
    }

    if (msAuth === 'success' && msUser) {
      try {
        const padded = msUser + '='.repeat((4 - (msUser.length % 4)) % 4);
        const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
        const user = JSON.parse(decoded);

        window.localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({
            ...user,
            loggedInAt: new Date().toISOString(),
          }),
        );
        navigate('/', { replace: true });
        return;
      } catch {
        setError('Microsoft sign-in response could not be processed.');
      }
    }

    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isAllowedMsMessageOrigin(event.origin)) {
        return;
      }

      const data = event.data as { source?: string; ms_auth?: string | null; ms_user?: string | null; ms_error?: string | null };
      if (!data || data.source !== 'kbc-ms-auth') {
        return;
      }

      applyMicrosoftAuthResult(data);
    }

    function consumeStoredResult() {
      const raw = window.localStorage.getItem(MS_AUTH_RESULT_KEY);
      if (!raw) {
        return;
      }

      try {
        const data = JSON.parse(raw) as { ms_auth?: string | null; ms_user?: string | null; ms_error?: string | null };
        window.localStorage.removeItem(MS_AUTH_RESULT_KEY);
        applyMicrosoftAuthResult(data);
      } catch {
        window.localStorage.removeItem(MS_AUTH_RESULT_KEY);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== MS_AUTH_RESULT_KEY || !event.newValue) {
        return;
      }
      consumeStoredResult();
    }

    consumeStoredResult();
    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', consumeStoredResult);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', consumeStoredResult);
    };
  }, [navigate]);

  const handleMicrosoftPopup = () => {
    const width = 560;
    const height = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const features = `popup=yes,width=${width},height=${height},left=${Math.floor(left)},top=${Math.floor(top)}`;

    const popup = window.open('/api/auth/microsoft/start/?popup=1', 'kbc-ms-login', features);
    if (!popup) {
      setError('Popup blocked by browser. Please allow popups for this site and try again.');
      return;
    }
    popup.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      setError('Please enter a valid email and password.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const message = response.status === 401
          ? 'Invalid email/username or password.'
          : 'Unable to sign in right now. Please try again.';
        setError(message);
        setSubmitting(false);
        return;
      }

      const user = await response.json();
      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          ...user,
          loggedInAt: new Date().toISOString(),
        }),
      );

      navigate('/', { replace: true });
    } catch {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(145deg,#eef3fb_0%,#f7f9fc_45%,#fff9ec_100%)] px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_60px_-38px_rgba(15,23,42,0.45)] lg:grid-cols-2">
          <div className="relative hidden p-10 lg:block bg-[radial-gradient(circle_at_20%_20%,rgba(255,193,7,0.28),transparent_48%),linear-gradient(160deg,#0f386e_0%,#1b2a4a_70%)] text-white">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide">
              <i className="ri-shield-check-line" />
              Staff Portal Access
            </p>
            <h1 className="mt-6 text-3xl font-extrabold leading-tight">
              Welcome back to the Communication Centre
            </h1>
            <p className="mt-4 text-sm text-white/80 leading-relaxed">
              Sign in to publish announcements, manage event updates, and access internal dashboards.
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-kbc-navy">Login</h2>
              <p className="mt-1 text-sm text-slate-500">Use your staff credentials to continue.</p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-kbc-navy">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@kbc.ac.uk"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-kbc-navy"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-kbc-navy">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-kbc-navy"
                />
              </div>

              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kbc-navy px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-kbc-navy-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <i className="ri-login-circle-line" />
                    Sign In
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleMicrosoftPopup}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <img
                  src="https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/Teams-Icon-FY26?resMode=sharp2&op_usm=1.5,0.65,15,0&qlt=100"
                  alt="Microsoft Teams"
                  className="w-5 h-5 object-contain"
                />
                Continue with Microsoft Teams
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
