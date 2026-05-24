import { useEffect, useMemo, useState } from 'react';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import useAccessControl from '../../hooks/useAccessControl';

type PageVisit = {
  id: number;
  path: string;
  title: string;
  firstSeenAt: string;
  lastSeenAt: string;
  durationSeconds: number;
  viewCount: number;
};

type ActivitySession = {
  id: number;
  trackingSessionId: string;
  username: string;
  email: string;
  displayName: string;
  authProvider: string;
  loginAt: string;
  logoutAt: string;
  lastSeenAt: string;
  totalSeconds: number;
  pageCount: number;
  ipAddress: string;
  logoutReason: string;
  isActive: boolean;
  pageVisits: PageVisit[];
};

type ActivityPayload = {
  summary: {
    totalSessions: number;
    returnedSessions: number;
    uniqueUsers: number;
    totalSeconds: number;
    totalPageViews: number;
  };
  sessions: ActivitySession[];
};

const emptyPayload: ActivityPayload = {
  summary: {
    totalSessions: 0,
    returnedSessions: 0,
    uniqueUsers: 0,
    totalSeconds: 0,
    totalPageViews: 0,
  },
  sessions: [],
};

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatDateTime(value: string): string {
  if (!value) return 'Still active';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userLabel(session: ActivitySession): string {
  return session.displayName || session.username || session.email || 'Unknown user';
}

export default function UserActivityPage() {
  const access = useAccessControl();
  const canView = access.adminAccess || access.itAccess;
  const [payload, setPayload] = useState<ActivityPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (search.trim()) params.set('search', search.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  }, [from, search, to]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetch(`/api/user-activity/?${query}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load user activity.');
        return response.json() as Promise<ActivityPayload>;
      })
      .then(data => setPayload(data))
      .catch(err => {
        if (err.name !== 'AbortError') setError('Unable to load user activity right now.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [canView, query]);

  if (!canView) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50 font-sans">
        <TopNav />
        <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-24">
          <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
            You do not have permission to view user activity.
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans">
      <TopNav />
      <div className="flex-1">
        <div className="border-b border-gray-200 bg-white px-4 py-4 md:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
              <a href="/" className="hover:text-kbc-navy">Home</a>
              <span>/</span>
              <span className="font-medium text-kbc-navy">User Activity</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-kbc-navy">
                  <i className="ri-pulse-line text-base text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-kbc-navy">User Activity</h1>
                  <p className="mt-0.5 text-sm text-gray-500">Login sessions, logout state, visited pages, and time spent per page.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFrom('');
                  setTo('');
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
              >
                <i className="ri-refresh-line" />
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ['Sessions', payload.summary.totalSessions],
              ['Users', payload.summary.uniqueUsers],
              ['Page Views', payload.summary.totalPageViews],
              ['Returned', payload.summary.returnedSessions],
              ['Total Time', formatDuration(payload.summary.totalSeconds)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-1 text-xl font-extrabold text-kbc-navy">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[1fr_160px_160px]">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search user, email, or page"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-kbc-navy"
            />
            <input
              type="date"
              value={from}
              onChange={event => setFrom(event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-kbc-navy"
            />
            <input
              type="date"
              value={to}
              onChange={event => setTo(event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-kbc-navy"
            />
          </div>

          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_120px_110px_44px] border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
              <span>User</span>
              <span>Login</span>
              <span>Logout / Last Seen</span>
              <span>Time</span>
              <span>Pages</span>
              <span />
            </div>

            {loading ? (
              <div className="px-4 py-10 text-center text-sm font-semibold text-gray-400">Loading activity...</div>
            ) : payload.sessions.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm font-semibold text-gray-400">No activity found.</div>
            ) : (
              payload.sessions.map(session => (
                <div key={session.id} className="border-b border-gray-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                    className="grid w-full grid-cols-[1.4fr_1fr_1fr_120px_110px_44px] items-center px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-kbc-navy">{userLabel(session)}</span>
                      <span className="block truncate text-xs text-gray-400">{session.email || session.username}</span>
                    </span>
                    <span className="text-xs font-semibold text-gray-600">{formatDateTime(session.loginAt)}</span>
                    <span className="text-xs font-semibold text-gray-600">
                      {session.isActive ? `Active - ${formatDateTime(session.lastSeenAt)}` : formatDateTime(session.logoutAt)}
                    </span>
                    <span className="text-xs font-extrabold text-gray-700">{formatDuration(session.totalSeconds)}</span>
                    <span className="text-xs font-semibold text-gray-600">{session.pageCount}</span>
                    <span className="flex justify-end text-gray-400">
                      <i className={expandedId === session.id ? 'ri-arrow-up-s-line text-xl' : 'ri-arrow-down-s-line text-xl'} />
                    </span>
                  </button>

                  {expandedId === session.id && (
                    <div className="bg-slate-50 px-4 pb-4">
                      <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-500">
                        <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">Provider: {session.authProvider || 'password'}</span>
                        <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">IP: {session.ipAddress || 'Unknown'}</span>
                        <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">Reason: {session.logoutReason || (session.isActive ? 'active' : 'unknown')}</span>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <div className="grid grid-cols-[1fr_120px_100px_1fr] bg-gray-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">
                          <span>Page</span>
                          <span>Time</span>
                          <span>Views</span>
                          <span>Last Seen</span>
                        </div>
                        {session.pageVisits.length === 0 ? (
                          <div className="px-3 py-4 text-xs font-semibold text-gray-400">No page visits recorded.</div>
                        ) : (
                          session.pageVisits.map(visit => (
                            <div key={visit.id} className="grid grid-cols-[1fr_120px_100px_1fr] border-t border-gray-100 px-3 py-2 text-xs">
                              <span className="truncate font-semibold text-gray-700">{visit.path}</span>
                              <span className="font-bold text-gray-700">{formatDuration(visit.durationSeconds)}</span>
                              <span className="text-gray-500">{visit.viewCount}</span>
                              <span className="text-gray-500">{formatDateTime(visit.lastSeenAt)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
