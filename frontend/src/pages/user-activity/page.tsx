import { useEffect, useMemo, useRef, useState } from 'react';
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

type AuditLog = {
  id: number;
  action: string;
  entity: string;
  objectId: string;
  objectLabel: string;
  username: string;
  email: string;
  displayName: string;
  path: string;
  method: string;
  ipAddress: string;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
};

type AuditPayload = {
  summary: {
    totalLogs: number;
    returnedLogs: number;
  };
  logs: AuditLog[];
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

const emptyAuditPayload: AuditPayload = {
  summary: {
    totalLogs: 0,
    returnedLogs: 0,
  },
  logs: [],
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

function formatTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userLabel(session: ActivitySession): string {
  return session.displayName || session.username || session.email || 'Unknown user';
}

type SessionFilter = 'all' | 'active' | 'completed';
type DateSortOrder = 'newest' | 'oldest';

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateDisplayValue(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function calendarDays(monthDate: Date): Date[] {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function sessionLastSeenMs(session: ActivitySession): number {
  const value = session.lastSeenAt || session.logoutAt || session.loginAt;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function auditCreatedMs(log: AuditLog): number {
  const timestamp = new Date(log.createdAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

type DayGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

function dateKeyFromMs(timestamp: number): string {
  if (!timestamp) return 'unknown';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dateGroupLabel(timestamp: number): string {
  if (!timestamp) return 'Unknown date';

  const date = new Date(timestamp);
  const todayStart = startOfLocalDay(new Date());
  const dateStart = startOfLocalDay(date);
  const dayDiff = Math.round((todayStart - dateStart) / 86400000);
  const formatted = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  if (dayDiff === 0) return `Today - ${formatted}`;
  if (dayDiff === 1) return `Yesterday - ${formatted}`;
  return formatted;
}

function groupByDay<T>(items: T[], getTimestamp: (item: T) => number): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];

  items.forEach(item => {
    const timestamp = getTimestamp(item);
    const key = dateKeyFromMs(timestamp);
    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.key === key) {
      lastGroup.items.push(item);
      return;
    }

    groups.push({
      key,
      label: dateGroupLabel(timestamp),
      items: [item],
    });
  });

  return groups;
}

function sessionDurationLabel(session: ActivitySession): string {
  if (session.isActive && session.totalSeconds === 0) return 'Just started';
  return formatDuration(session.totalSeconds);
}

function pageCountLabel(session: ActivitySession): string {
  if (session.pageCount === 0) return 'No pages yet';
  return String(session.pageCount);
}

function sessionUserKey(session: ActivitySession): string {
  return (session.email || session.username || session.displayName || String(session.id)).toLowerCase();
}

function sessionGroupStats(sessions: ActivitySession[]) {
  return {
    sessions: sessions.length,
    users: new Set(sessions.map(sessionUserKey)).size,
    returned: sessions.length,
    totalSeconds: sessions.reduce((sum, session) => sum + session.totalSeconds, 0),
  };
}

function DaySessionStats({ sessions }: { sessions: ActivitySession[] }) {
  const stats = sessionGroupStats(sessions);
  const items = [
    ['Sessions', stats.sessions],
    ['Users', stats.users],
    ['Returned', stats.returned],
    ['Total time', formatDuration(stats.totalSeconds)],
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map(([label, value]) => (
        <span key={label} className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold normal-case tracking-normal text-slate-600 shadow-sm ring-1 ring-slate-200">
          <span className="text-slate-400">{label}: </span>{value}
        </span>
      ))}
    </div>
  );
}

function DatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;
  const pickerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate || new Date());
  const todayValue = dateInputValue(new Date());
  const days = calendarDays(visibleMonth);

  useEffect(() => {
    if (selectedDate) setVisibleMonth(selectedDate);
  }, [value]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className={`flex h-10 w-[170px] items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm font-bold transition-colors ${
          open || value ? 'border-kbc-navy bg-white text-kbc-navy shadow-sm' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
        }`}
        aria-expanded={open}
      >
        <span className="min-w-0">
          {value ? (
            <>
              <span className="block text-[10px] font-extrabold uppercase tracking-wide text-gray-400">{label}</span>
              <span className="block truncate leading-4">{dateDisplayValue(value)}</span>
            </>
          ) : (
            <span className="block truncate font-extrabold leading-4">{label}</span>
          )}
        </span>
        <i className="ri-calendar-line text-base text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-2 w-[280px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
            <button
              type="button"
              onClick={() => setVisibleMonth(current => addMonths(current, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-kbc-navy"
              aria-label="Previous month"
            >
              <i className="ri-arrow-left-s-line text-xl" />
            </button>
            <p className="text-sm font-extrabold text-kbc-navy">{monthLabel(visibleMonth)}</p>
            <button
              type="button"
              onClick={() => setVisibleMonth(current => addMonths(current, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-kbc-navy"
              aria-label="Next month"
            >
              <i className="ri-arrow-right-s-line text-xl" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 px-3 pt-3 text-center text-[11px] font-extrabold uppercase text-gray-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 p-3">
            {days.map(day => {
              const dayValue = dateInputValue(day);
              const isSelected = dayValue === value;
              const isToday = dayValue === todayValue;
              const isOutsideMonth = day.getMonth() !== visibleMonth.getMonth();

              return (
                <button
                  key={dayValue}
                  type="button"
                  onClick={() => {
                    onChange(dayValue);
                    setOpen(false);
                  }}
                  className={`flex h-8 items-center justify-center rounded-md text-xs font-extrabold transition-colors ${
                    isSelected
                      ? 'bg-kbc-navy text-white shadow-sm'
                      : isToday
                        ? 'bg-amber-50 text-kbc-navy ring-1 ring-amber-200 hover:bg-amber-100'
                        : isOutsideMonth
                          ? 'text-gray-300 hover:bg-gray-50'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-kbc-navy'
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-3">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs font-extrabold text-gray-500 hover:bg-gray-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                onChange(dateInputValue(today));
                setVisibleMonth(today);
                setOpen(false);
              }}
              className="rounded-md bg-kbc-navy px-3 py-1.5 text-xs font-extrabold text-white hover:bg-kbc-navy/90"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown>[] : [];
}

function textValue(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return value === undefined || value === null ? '' : String(value);
}

function countValue(item: Record<string, unknown>, key: string): number | null {
  const value = Number(item[key]);
  return Number.isFinite(value) ? value : null;
}

function isPresentValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    title: 'Title',
    excerpt: 'Summary',
    summary: 'Summary',
    details: 'Details',
    content: 'Content',
    audience: 'Audience',
    department: 'Department',
    category: 'Category',
    priority: 'Priority',
    status: 'Status',
    publicationDate: 'Publication date',
    date: 'Date',
    author: 'Author',
    imageUrl: 'Image',
    image: 'Image',
    eventTitle: 'Event title',
    eventDescription: 'Description',
    eventDate: 'Event date',
    cardTitle: 'Card title',
    authorName: 'Author',
    authorRole: 'Role',
    body: 'Body',
    isActive: 'Active',
    moduleName: 'Module',
    fullName: 'Name',
    email: 'Email',
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '';
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    create: 'Created',
    update: 'Updated',
    delete: 'Deleted',
    upload: 'Uploaded',
    replace: 'Changed',
  };
  return labels[action] || action;
}

function auditSummary(log: AuditLog): string {
  const before = asRecord(log.before);
  const after = asRecord(log.after);
  const metadata = asRecord(log.metadata);
  const beforeCount = countValue(before, 'count');
  const afterCount = countValue(after, 'count');
  const addedCount = countValue(metadata, 'addedCount') ?? asRecordArray(after.added).length;
  const removedCount = countValue(metadata, 'removedCount') ?? asRecordArray(before.removed).length;

  if (log.entity === 'TrainingPlan' && log.action === 'replace') {
    const parts = [];
    if (addedCount > 0) parts.push(`${addedCount} added`);
    if (removedCount > 0) parts.push(`${removedCount} removed`);
    if (parts.length > 0) return `Training Plan changed: ${parts.join(', ')}`;
    if (beforeCount !== null && afterCount !== null) return `Training Plan changed from ${beforeCount} to ${afterCount} records`;
    return 'Training Plan was changed';
  }

  return `${actionLabel(log.action)} ${log.objectLabel || log.entity}`;
}

function changeSummary(log: AuditLog): string {
  return log.objectLabel || log.entity;
}

function GenericAuditDetails({ log }: { log: AuditLog }) {
  const source = log.action === 'delete' ? asRecord(log.before) : asRecord(log.after);
  const before = asRecord(log.before);
  const after = asRecord(log.after);
  const hiddenFields = new Set(['id', 'author', 'image', 'imageUrl', 'coverImageUrl', 'profileImageUrl', 'isExpired']);

  const changedFields = log.action === 'update'
    ? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
      .filter(key => !hiddenFields.has(key))
      .filter(key => displayValue(before[key]) !== displayValue(after[key]))
      .filter(key => isPresentValue(before[key]) || isPresentValue(after[key]))
    : Object.keys(source)
      .filter(key => !hiddenFields.has(key))
      .filter(key => isPresentValue(source[key]));

  if (changedFields.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
        No extra field details were stored for this log.
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {changedFields.slice(0, 12).map(key => (
        <div key={key} className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-400">{fieldLabel(key)}</p>
          {log.action === 'update' ? (
            <div className="mt-1 space-y-1 text-xs font-semibold text-gray-700">
              <p><span className="text-gray-400">Before:</span> {displayValue(before[key]) || 'Empty'}</p>
              <p><span className="text-gray-400">After:</span> {displayValue(after[key]) || 'Empty'}</p>
            </div>
          ) : (
            <p className="mt-1 line-clamp-3 text-xs font-semibold text-gray-700">{displayValue(source[key])}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function TrainingPlanAuditCard({ item, tone }: { item: Record<string, unknown>; tone: 'added' | 'removed' }) {
  const moduleName = textValue(item, 'moduleName') || 'Unnamed module';
  const groupName = textValue(item, 'groupName') || 'Not set';
  const tutorName = textValue(item, 'tutorName') || 'Not set';
  const coachName = textValue(item, 'coachName') || 'Not set';
  const startDate = textValue(item, 'startDate');
  const endDate = textValue(item, 'endDate');
  const programme = textValue(item, 'program');
  const sessions = textValue(item, 'sessionsNumber');
  const day = textValue(item, 'sessionWeekDay');
  const startTime = textValue(item, 'sessionStartTime');
  const endTime = textValue(item, 'sessionEndTime');
  const dates = [startDate, endDate].filter(Boolean).join(' - ') || 'Not set';
  const time = [day, [startTime, endTime].filter(Boolean).join(' - ')].filter(Boolean).join(' | ') || 'Not set';
  const toneClass = tone === 'added'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : 'border-red-200 bg-red-50 text-red-950';

  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold">{moduleName}</p>
          {programme && <p className="mt-0.5 text-xs font-semibold opacity-75">{programme}</p>}
        </div>
        {sessions && (
          <span className="rounded bg-white/70 px-2 py-1 text-[11px] font-extrabold">
            {sessions} sessions
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-extrabold uppercase opacity-60">Group</p>
          <p className="mt-0.5 font-semibold">{groupName}</p>
        </div>
        <div>
          <p className="font-extrabold uppercase opacity-60">Tutor</p>
          <p className="mt-0.5 font-semibold">{tutorName}</p>
        </div>
        <div>
          <p className="font-extrabold uppercase opacity-60">Coach</p>
          <p className="mt-0.5 font-semibold">{coachName}</p>
        </div>
        <div>
          <p className="font-extrabold uppercase opacity-60">Dates</p>
          <p className="mt-0.5 font-semibold">{dates}</p>
        </div>
      </div>
      <div className="mt-2 text-xs font-semibold opacity-80">
        Time: {time}
      </div>
    </div>
  );
}

export default function UserActivityPage() {
  const access = useAccessControl();
  const canView = access.adminAccess || access.itAccess;
  const [payload, setPayload] = useState<ActivityPayload>(emptyPayload);
  const [auditPayload, setAuditPayload] = useState<AuditPayload>(emptyAuditPayload);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<number | null>(null);
  const [openSessionDays, setOpenSessionDays] = useState<Record<string, boolean>>({});
  const [openAuditDays, setOpenAuditDays] = useState<Record<string, boolean>>({});
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all');
  const [dateSortOrder, setDateSortOrder] = useState<DateSortOrder>('newest');

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (search.trim()) params.set('search', search.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  }, [from, search, to]);

  const activeSessions = useMemo(() => payload.sessions.filter(session => session.isActive).length, [payload.sessions]);
  const completedSessions = useMemo(() => payload.sessions.filter(session => !session.isActive).length, [payload.sessions]);
  const visibleSessions = useMemo(() => {
    return payload.sessions
      .filter(session => {
        if (sessionFilter === 'active') return session.isActive;
        if (sessionFilter === 'completed') return !session.isActive;
        return true;
      })
      .sort((a, b) => (
        dateSortOrder === 'newest'
          ? sessionLastSeenMs(b) - sessionLastSeenMs(a)
          : sessionLastSeenMs(a) - sessionLastSeenMs(b)
      ));
  }, [dateSortOrder, payload.sessions, sessionFilter]);
  const visibleAuditLogs = useMemo(() => {
    return [...auditPayload.logs].sort((a, b) => (
      dateSortOrder === 'newest'
        ? auditCreatedMs(b) - auditCreatedMs(a)
        : auditCreatedMs(a) - auditCreatedMs(b)
    ));
  }, [auditPayload.logs, dateSortOrder]);
  const sessionGroups = useMemo(() => groupByDay(visibleSessions, sessionLastSeenMs), [visibleSessions]);
  const auditLogGroups = useMemo(() => groupByDay(visibleAuditLogs, auditCreatedMs), [visibleAuditLogs]);
  const toggleSessionDay = (key: string) => {
    setOpenSessionDays(current => ({ ...current, [key]: !current[key] }));
  };
  const toggleAuditDay = (key: string) => {
    setOpenAuditDays(current => ({ ...current, [key]: !current[key] }));
  };

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

  useEffect(() => {
    if (!canView) {
      setAuditLoading(false);
      return;
    }

    const controller = new AbortController();
    setAuditLoading(true);
    setAuditError('');

    fetch(`/api/audit-logs/?${query}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load audit logs.');
        return response.json() as Promise<AuditPayload>;
      })
      .then(data => setAuditPayload(data))
      .catch(err => {
        if (err.name !== 'AbortError') setAuditError('Unable to load audit logs right now.');
      })
      .finally(() => setAuditLoading(false));

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
                  setDateSortOrder('newest');
                  setSessionFilter('all');
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
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: 'Sessions', value: payload.summary.totalSessions, icon: 'ri-login-circle-line', tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
              { label: 'Users', value: payload.summary.uniqueUsers, icon: 'ri-user-line', tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
              { label: 'Returned', value: payload.summary.returnedSessions, icon: 'ri-loop-left-line', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
              { label: 'Total Time', value: formatDuration(payload.summary.totalSeconds), icon: 'ri-time-line', tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
            ].map(card => (
              <div key={card.label} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{card.label}</p>
                  <p className="mt-1 text-2xl font-extrabold text-kbc-navy">{card.value}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${card.tone}`}>
                  <i className={`${card.icon} text-lg`} />
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="relative min-w-[280px] flex-1">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-base text-gray-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search user, email, or page"
                className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm font-semibold outline-none transition-colors placeholder:font-medium placeholder:text-gray-400 focus:border-kbc-navy"
              />
            </label>
            <DatePicker label="From" value={from} onChange={setFrom} />
            <DatePicker label="To" value={to} onChange={setTo} />
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {[
                ['newest', 'Newest first'],
                ['oldest', 'Oldest first'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDateSortOrder(value as DateSortOrder)}
                  className={`h-8 rounded-md px-3 text-xs font-extrabold transition-colors ${
                    dateSortOrder === value ? 'bg-kbc-navy text-white shadow-sm' : 'text-gray-500 hover:bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {[
                ['all', `All (${payload.sessions.length})`],
                ['active', `Active (${activeSessions})`],
                ['completed', `Completed (${completedSessions})`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSessionFilter(value as SessionFilter)}
                  className={`h-8 rounded-md px-3 text-xs font-extrabold transition-colors ${
                    sessionFilter === value ? 'bg-kbc-navy text-white shadow-sm' : 'text-gray-500 hover:bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-white to-slate-50 px-4 py-4">
              <div>
                <p className="text-sm font-extrabold text-kbc-navy">Sessions</p>
                <p className="mt-0.5 text-xs font-semibold text-gray-400">
                  {dateSortOrder === 'newest' ? 'Latest activity appears first' : 'Oldest activity appears first'}
                </p>
              </div>
              <p className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-gray-500 ring-1 ring-gray-200">
                {sessionFilter === 'all' ? 'All sessions' : sessionFilter === 'active' ? 'Active sessions' : 'Completed sessions'}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(280px,1.6fr)_100px_minmax(240px,1.1fr)_110px_88px_44px] border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
              <span>User</span>
              <span>Login</span>
              <span>Status / Last Seen</span>
              <span>Time</span>
              <span>Pages</span>
              <span />
            </div>

            {loading ? (
              <div className="px-4 py-10 text-center text-sm font-semibold text-gray-400">Loading activity...</div>
            ) : visibleSessions.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm font-semibold text-gray-400">No sessions match this view.</div>
            ) : (
              sessionGroups.map(group => (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => toggleSessionDay(group.key)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-slate-100 px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-700 hover:bg-slate-200"
                  >
                    <span>{group.label}</span>
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <DaySessionStats sessions={group.items} />
                      <i className={openSessionDays[group.key] ? 'ri-arrow-up-s-line text-base text-slate-500' : 'ri-arrow-down-s-line text-base text-slate-500'} />
                    </span>
                  </button>
                  {openSessionDays[group.key] && group.items.map(session => (
                    <div key={session.id} className={`border-b border-gray-100 last:border-b-0 ${session.isActive ? 'bg-emerald-50/40' : 'bg-white'}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                        className="grid w-full grid-cols-[minmax(280px,1.6fr)_100px_minmax(240px,1.1fr)_110px_88px_44px] items-center px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold text-kbc-navy">{userLabel(session)}</span>
                          <span className="block truncate text-xs text-gray-400">{session.email || session.username}</span>
                        </span>
                        <span className="text-xs font-extrabold text-gray-700">{formatTime(session.loginAt)}</span>
                        <span className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                            session.isActive ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
                          }`}>
                            {session.isActive ? 'Active' : 'Ended'}
                          </span>
                          <span className="font-extrabold text-gray-700">{formatTime(session.isActive ? session.lastSeenAt : session.logoutAt)}</span>
                        </span>
                        <span className="text-xs font-extrabold text-gray-700">{sessionDurationLabel(session)}</span>
                        <span className="text-xs font-semibold text-gray-600">{pageCountLabel(session)}</span>
                        <span className="flex justify-end text-gray-400">
                          <i className={expandedId === session.id ? 'ri-arrow-up-s-line text-xl' : 'ri-arrow-down-s-line text-xl'} />
                        </span>
                      </button>

                      {expandedId === session.id && (
                        <div className="bg-slate-50 px-4 pb-4">
                          <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-500">
                            <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">Signed in with {session.authProvider || 'password'}</span>
                            <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">{session.isActive ? 'Still active' : 'Logged out'}</span>
                          </div>
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                            <div className="grid grid-cols-[1fr_110px_90px_120px] bg-gray-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">
                              <span>Page</span>
                              <span>Time</span>
                              <span>Views</span>
                              <span>Last Seen</span>
                            </div>
                            {session.pageVisits.length === 0 ? (
                              <div className="px-3 py-4 text-xs font-semibold text-gray-400">No page visits recorded.</div>
                            ) : (
                              session.pageVisits.map(visit => (
                                <div key={visit.id} className="grid grid-cols-[1fr_110px_90px_120px] border-t border-gray-100 px-3 py-2 text-xs hover:bg-slate-50">
                                  <span className="truncate font-semibold text-gray-700">{visit.path}</span>
                                  <span className="font-bold text-gray-700">{formatDuration(visit.durationSeconds)}</span>
                                  <span className="text-gray-500">{visit.viewCount}</span>
                                  <span className="text-gray-500">{formatTime(visit.lastSeenAt)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-kbc-navy">Audit Logs</h2>
                <p className="mt-0.5 text-sm text-gray-500">Clear change history: who changed what, when, and what was added or removed.</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-500">
                {auditPayload.summary.returnedLogs} of {auditPayload.summary.totalLogs} logs
              </div>
            </div>

            {auditError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{auditError}</div>}

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="grid grid-cols-[120px_170px_1.5fr_1fr_180px_44px] border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
                <span>Action</span>
                <span>Entity</span>
                <span>Change</span>
                <span>User</span>
                <span>Time</span>
                <span />
              </div>

              {auditLoading ? (
                <div className="px-4 py-10 text-center text-sm font-semibold text-gray-400">Loading audit logs...</div>
              ) : visibleAuditLogs.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm font-semibold text-gray-400">No audit logs found.</div>
              ) : (
                auditLogGroups.map(group => (
                  <div key={group.key}>
                    <button
                      type="button"
                      onClick={() => toggleAuditDay(group.key)}
                      className="flex w-full items-center justify-between border-b border-gray-200 bg-slate-100 px-4 py-2 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-200"
                    >
                      <span>{group.label}</span>
                      <span className="inline-flex items-center gap-2 text-[11px] normal-case tracking-normal text-slate-500">
                        {group.items.length} log{group.items.length === 1 ? '' : 's'}
                        <i className={openAuditDays[group.key] ? 'ri-arrow-up-s-line text-base' : 'ri-arrow-down-s-line text-base'} />
                      </span>
                    </button>
                    {openAuditDays[group.key] && group.items.map(log => (
                      <div key={log.id} className="border-b border-gray-100 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}
                          className="grid w-full grid-cols-[120px_170px_1.5fr_1fr_180px_44px] items-center px-4 py-3 text-left hover:bg-gray-50"
                        >
                          <span className="inline-flex w-fit rounded bg-kbc-navy/10 px-2 py-1 text-[11px] font-extrabold uppercase text-kbc-navy">{actionLabel(log.action)}</span>
                          <span className="truncate text-xs font-bold text-gray-600">{log.entity}</span>
                          <span className="truncate text-xs font-semibold text-gray-700">{auditSummary(log)}</span>
                          <span className="truncate text-xs font-semibold text-gray-600">{log.displayName || log.username || log.email || 'Unknown'}</span>
                          <span className="text-xs font-semibold text-gray-500">{formatDateTime(log.createdAt)}</span>
                          <span className="flex justify-end text-gray-400">
                            <i className={expandedAuditId === log.id ? 'ri-arrow-up-s-line text-xl' : 'ri-arrow-down-s-line text-xl'} />
                          </span>
                        </button>

                        {expandedAuditId === log.id && (
                          <div className="bg-slate-50 px-4 pb-4">
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <p className="text-xs font-extrabold text-kbc-navy">{auditSummary(log)}</p>
                              {changeSummary(log) !== auditSummary(log) && (
                                <p className="mt-1 text-xs font-semibold text-gray-500">{changeSummary(log)}</p>
                              )}

                              {asRecordArray(asRecord(log.after).added).length > 0 && (
                                <div className="mt-3">
                                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">Added</p>
                                  <div className="mt-2 space-y-2">
                                    {asRecordArray(asRecord(log.after).added).map((item, index) => (
                                      log.entity === 'TrainingPlan' ? (
                                        <TrainingPlanAuditCard key={`added-${index}`} item={item} tone="added" />
                                      ) : (
                                        <div key={`added-${index}`} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                                          {JSON.stringify(item)}
                                        </div>
                                      )
                                    ))}
                                  </div>
                                </div>
                              )}

                              {asRecordArray(asRecord(log.before).removed).length > 0 && (
                                <div className="mt-3">
                                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-red-700">Removed</p>
                                  <div className="mt-2 space-y-2">
                                    {asRecordArray(asRecord(log.before).removed).map((item, index) => (
                                      log.entity === 'TrainingPlan' ? (
                                        <TrainingPlanAuditCard key={`removed-${index}`} item={item} tone="removed" />
                                      ) : (
                                        <div key={`removed-${index}`} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
                                          {JSON.stringify(item)}
                                        </div>
                                      )
                                    ))}
                                  </div>
                                </div>
                              )}

                              {asRecordArray(asRecord(log.after).added).length === 0 && asRecordArray(asRecord(log.before).removed).length === 0 && log.entity === 'TrainingPlan' && (
                                <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                  This older log only stored record counts. New Training Plan logs will show the exact modules added or removed.
                                </p>
                              )}

                              {asRecordArray(asRecord(log.after).added).length === 0 && asRecordArray(asRecord(log.before).removed).length === 0 && log.entity !== 'TrainingPlan' && (
                                <GenericAuditDetails log={log} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
