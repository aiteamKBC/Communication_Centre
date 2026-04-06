import { useEffect } from 'react';

const MS_AUTH_RESULT_KEY = 'kbc-ms-auth-result';

export default function MicrosoftPopupCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = {
      ms_auth: params.get('ms_auth'),
      ms_user: params.get('ms_user'),
      ms_error: params.get('ms_error'),
    };

    // Keep a durable result channel in case postMessage is dropped.
    window.localStorage.setItem(MS_AUTH_RESULT_KEY, JSON.stringify(payload));

    if (window.opener && !window.opener.closed) {
      // Use wildcard target in dev because opener might be on localhost while popup is on 127.0.0.1 (or vice versa).
      window.opener.postMessage({ source: 'kbc-ms-auth', ...payload }, '*');
    }

    window.setTimeout(() => {
      window.close();
    }, 150);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
        Completing Microsoft sign-in...
      </div>
    </div>
  );
}
