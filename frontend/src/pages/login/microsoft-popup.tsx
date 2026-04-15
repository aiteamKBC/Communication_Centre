import { useEffect } from 'react';

const MS_AUTH_RESULT_KEY = 'kbc-ms-auth-result';

export default function MicrosoftPopupCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = {
      source: 'kbc-ms-auth',
      ms_auth: params.get('ms_auth'),
      ms_user: params.get('ms_user'),
      ms_error: params.get('ms_error'),
    };

    try {
      window.localStorage.setItem(MS_AUTH_RESULT_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }

    try {
      window.opener?.postMessage(payload, window.location.origin);
      const swapped = window.location.origin.includes('localhost')
        ? window.location.origin.replace('localhost', '127.0.0.1')
        : window.location.origin.replace('127.0.0.1', 'localhost');
      window.opener?.postMessage(payload, swapped);
    } catch {
      // ignore postMessage failures
    }

    window.close();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
        Completing Microsoft sign-in...
      </div>
    </div>
  );
}
