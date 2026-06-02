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
  currentPage?: {
    path: string;
    title: string;
    lastSeenAt: string;
  } | null;
  pageVisits: PageVisit[];
};

type Pagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  returnedItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

type ActivityPayload = {
  summary: {
    totalSessions: number;
    returnedSessions: number;
    matchingSessions?: number;
    activeSessions?: number;
    completedSessions?: number;
    uniqueUsers: number;
    totalSeconds: number;
    totalPageViews: number;
  };
  pagination: Pagination;
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
  pagination: Pagination;
  logs: AuditLog[];
};

const ACTIVITY_REFRESH_MS = 2000;

const emptyPayload: ActivityPayload = {
  summary: {
    totalSessions: 0,
    returnedSessions: 0,
    uniqueUsers: 0,
    totalSeconds: 0,
    totalPageViews: 0,
  },
  pagination: {
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
    returnedItems: 0,
    hasNext: false,
    hasPrevious: false,
  },
  sessions: [],
};

const emptyAuditPayload: AuditPayload = {
  summary: {
    totalLogs: 0,
    returnedLogs: 0,
  },
  pagination: {
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
    returnedItems: 0,
    hasNext: false,
    hasPrevious: false,
  },
  logs: [],
};

function formatDuration(totalSeconds: number, showSeconds = false): string {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));

  if (showSeconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${remainingSeconds}s`;
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (seconds > 0 && totalMinutes === 0) return '<1m';
  return `${totalMinutes}m`;
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

const pageLabels = [
  { path: '/login/microsoft-popup', label: 'Microsoft Sign-in' },
  { path: '/urgent-notice/new', label: 'Urgent Notice' },
  { path: '/leadership-message/new', label: 'Leadership Message' },
  { path: '/apprenticeships-timeline', label: 'Training Plan' },
  { path: '/training-plan', label: 'Training Plan' },
  { path: '/user-activity', label: 'User Activity' },
  { path: '/risk-register', label: 'Risk Register' },
  { path: '/departments', label: 'Departments' },
  { path: '/documents', label: 'Policies' },
  { path: '/dashboard', label: 'Internal Dashboards' },
  { path: '/feedback', label: 'Submit Feedback' },
  { path: '/events', label: 'Events' },
  { path: '/news', label: 'News & Announcements' },
  { path: '/login', label: 'Login' },
  { path: '/', label: 'Home' },
];

function pageVisitLabel(path: string): string {
  const cleanPath = (path || '/').split(/[?#]/)[0] || '/';
  const match = pageLabels.find(item => (
    item.path === '/' ? cleanPath === '/' : cleanPath === item.path || cleanPath.startsWith(`${item.path}/`)
  ));

  if (match) return match.label;

  return cleanPath
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(part => part.replace(/[-_]+/g, ' '))
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ') || 'Home';
}

function userLabel(session: ActivitySession): string {
  return session.displayName || session.username || session.email || 'Unknown user';
}

function currentPageVisit(session: ActivitySession): PageVisit | null {
  if (!session.pageVisits.length) return null;
  return [...session.pageVisits].sort((a, b) => {
    const lastSeenDiff = new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    return lastSeenDiff || b.id - a.id;
  })[0] || null;
}

function currentPageLabel(session: ActivitySession): string {
  if (!session.isActive) return 'Not active';
  const path = session.currentPage?.path || currentPageVisit(session)?.path || '';
  if (!path) return 'No page yet';
  return pageVisitLabel(path);
}

type SessionFilter = 'all' | 'active' | 'completed';
type DateSortOrder = 'newest' | 'oldest';
type SummaryModalType = 'sessions' | 'users' | 'returned' | 'time' | null;
type SessionSortKey = 'user' | 'login' | 'status' | 'time' | 'pages';
type PageVisitSortKey = 'page' | 'time' | 'views' | 'lastSeen';
type AuditLogSortKey = 'action' | 'entity' | 'change' | 'user' | 'time';
type SortDirection = 'asc' | 'desc';

type SessionSort = {
  key: SessionSortKey;
  direction: SortDirection;
};

type PageVisitSort = {
  key: PageVisitSortKey;
  direction: SortDirection;
};

type AuditLogSort = {
  key: AuditLogSortKey;
  direction: SortDirection;
};

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function msUntilNextLocalDay(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1000, tomorrow.getTime() - now.getTime() + 1000);
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

function sessionLoginMs(session: ActivitySession): number {
  const timestamp = new Date(session.loginAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function sessionLoginDateLabel(session: ActivitySession): string {
  const loginTimestamp = sessionLoginMs(session);
  if (!loginTimestamp) return '';

  const activityTimestamp = sessionLastSeenMs(session);
  if (!activityTimestamp) return '';

  const loginDate = new Date(loginTimestamp);
  const activityDate = new Date(activityTimestamp);
  if (isSameLocalDate(loginDate, activityDate)) return '';

  return loginDate.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  });
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

function sessionStatusLabel(session: ActivitySession): string {
  if (session.isActive) return 'Active';
  return session.logoutAt ? 'Ended' : 'Inactive';
}

function sessionStatusDetail(session: ActivitySession): string {
  if (session.isActive) return 'Currently open';
  return session.logoutAt ? 'Logged out' : 'Not currently open';
}

function sessionStatusText(session: ActivitySession): string {
  if (session.isActive) return `Open now - seen ${formatTime(session.lastSeenAt)}`;
  if (session.logoutAt) return `Logged out ${formatTime(session.logoutAt)}`;
  return `Last seen ${formatTime(session.lastSeenAt)}`;
}

function sessionStatusRank(session: ActivitySession): number {
  if (session.isActive) return 0;
  if (!session.logoutAt) return 1;
  return 2;
}

function sortedSessions(sessions: ActivitySession[], sort: SessionSort): ActivitySession[] {
  const direction = sort.direction === 'asc' ? 1 : -1;

  return [...sessions].sort((a, b) => {
    let comparison = 0;

    if (sort.key === 'user') {
      comparison = userLabel(a).localeCompare(userLabel(b));
    } else if (sort.key === 'login') {
      comparison = sessionLoginMs(a) - sessionLoginMs(b);
    } else if (sort.key === 'status') {
      comparison = sessionStatusRank(a) - sessionStatusRank(b);
    } else if (sort.key === 'time') {
      comparison = a.totalSeconds - b.totalSeconds;
    } else {
      comparison = a.pageCount - b.pageCount;
    }

    if (comparison !== 0) return comparison * direction;
    return sessionLastSeenMs(b) - sessionLastSeenMs(a) || b.id - a.id;
  });
}

function groupedSortedSessions(sessions: ActivitySession[], sort: SessionSort, dateOrder: DateSortOrder): DayGroup<ActivitySession>[] {
  const groups = new Map<string, { label: string; timestamp: number; items: ActivitySession[] }>();

  sessions.forEach(session => {
    const timestamp = sessionLastSeenMs(session);
    const key = dateKeyFromMs(timestamp);
    const existing = groups.get(key);

    if (existing) {
      existing.timestamp = dateOrder === 'oldest' ? Math.min(existing.timestamp, timestamp) : Math.max(existing.timestamp, timestamp);
      existing.items.push(session);
      return;
    }

    groups.set(key, {
      label: dateGroupLabel(timestamp),
      timestamp,
      items: [session],
    });
  });

  const groupDirection = dateOrder === 'oldest' ? 1 : -1;

  return Array.from(groups.entries())
    .sort(([, a], [, b]) => (a.timestamp - b.timestamp) * groupDirection)
    .map(([key, group]) => ({
      key,
      label: group.label,
      items: sortedSessions(group.items, sort),
    }));
}

function pageVisitLastSeenMs(visit: PageVisit): number {
  const timestamp = new Date(visit.lastSeenAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortedPageVisits(visits: PageVisit[], sort: PageVisitSort): PageVisit[] {
  const direction = sort.direction === 'asc' ? 1 : -1;

  return [...visits].sort((a, b) => {
    let comparison = 0;

    if (sort.key === 'page') {
      comparison = pageVisitLabel(a.path).localeCompare(pageVisitLabel(b.path));
    } else if (sort.key === 'time') {
      comparison = a.durationSeconds - b.durationSeconds;
    } else if (sort.key === 'views') {
      comparison = a.viewCount - b.viewCount;
    } else {
      comparison = pageVisitLastSeenMs(a) - pageVisitLastSeenMs(b);
    }

    if (comparison !== 0) return comparison * direction;
    return pageVisitLabel(a.path).localeCompare(pageVisitLabel(b.path)) || a.id - b.id;
  });
}

function SortHeader<TSortKey extends string>({
  label,
  sortKey,
  currentSort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: TSortKey;
  currentSort: { key: TSortKey; direction: SortDirection };
  onSort: (key: TSortKey) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const active = currentSort.key === sortKey;
  const icon = !active
    ? 'ri-arrow-up-down-line'
    : currentSort.direction === 'asc'
      ? 'ri-arrow-up-line'
      : 'ri-arrow-down-line';
  const alignment = align === 'right' ? 'justify-self-end text-right' : align === 'center' ? 'justify-self-center text-center' : 'justify-self-start text-left';

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 font-extrabold uppercase tracking-wide transition-colors ${alignment} ${
        active ? 'text-kbc-navy' : 'text-gray-400 hover:text-kbc-navy'
      }`}
    >
      <span>{label}</span>
      <i className={`${icon} text-xs`} />
    </button>
  );
}

function PaginationControls({
  pagination,
  onPageChange,
  label,
}: {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  label: string;
}) {
  const start = pagination.totalItems === 0 ? 0 : ((pagination.page - 1) * pagination.pageSize) + 1;
  const end = pagination.totalItems === 0 ? 0 : Math.min(pagination.totalItems, start + pagination.returnedItems - 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold text-gray-500">
        Showing {start}-{end} of {pagination.totalItems} {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-gray-500 ring-1 ring-gray-200">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
          disabled={!pagination.hasPrevious}
          className="flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-extrabold text-gray-600 transition-colors hover:border-kbc-navy hover:text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
        >
          <i className="ri-arrow-left-s-line text-base" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
          disabled={!pagination.hasNext}
          className="flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-extrabold text-gray-600 transition-colors hover:border-kbc-navy hover:text-kbc-navy disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <i className="ri-arrow-right-s-line text-base" />
        </button>
      </div>
    </div>
  );
}

function auditUserLabel(log: AuditLog): string {
  return log.displayName || log.username || log.email || 'Unknown';
}

function sortedAuditLogs(logs: AuditLog[], sort: AuditLogSort): AuditLog[] {
  const direction = sort.direction === 'asc' ? 1 : -1;

  return [...logs].sort((a, b) => {
    let comparison = 0;

    if (sort.key === 'action') {
      comparison = actionLabel(a.action).localeCompare(actionLabel(b.action));
    } else if (sort.key === 'entity') {
      comparison = a.entity.localeCompare(b.entity);
    } else if (sort.key === 'change') {
      comparison = auditSummary(a).localeCompare(auditSummary(b));
    } else if (sort.key === 'user') {
      comparison = auditUserLabel(a).localeCompare(auditUserLabel(b));
    } else {
      comparison = auditCreatedMs(a) - auditCreatedMs(b);
    }

    if (comparison !== 0) return comparison * direction;
    return auditCreatedMs(b) - auditCreatedMs(a) || b.id - a.id;
  });
}

function groupedSortedAuditLogs(logs: AuditLog[], sort: AuditLogSort): DayGroup<AuditLog>[] {
  const groups = new Map<string, { label: string; timestamp: number; items: AuditLog[] }>();

  logs.forEach(log => {
    const timestamp = auditCreatedMs(log);
    const key = dateKeyFromMs(timestamp);
    const existing = groups.get(key);

    if (existing) {
      existing.timestamp = sort.direction === 'asc' ? Math.min(existing.timestamp, timestamp) : Math.max(existing.timestamp, timestamp);
      existing.items.push(log);
      return;
    }

    groups.set(key, {
      label: dateGroupLabel(timestamp),
      timestamp,
      items: [log],
    });
  });

  const groupDirection = sort.key === 'time' && sort.direction === 'asc' ? 1 : -1;

  return Array.from(groups.entries())
    .sort(([, a], [, b]) => (a.timestamp - b.timestamp) * groupDirection)
    .map(([key, group]) => ({
      key,
      label: group.label,
      items: sortedAuditLogs(group.items, sort),
    }));
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
    ['Total period', formatDuration(stats.totalSeconds)],
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
        Period: {time}
      </div>
    </div>
  );
}

export default function UserActivityPage() {
  const access = useAccessControl();
  const canView = access.adminAccess || access.itAccess;
  const [currentDateValue, setCurrentDateValue] = useState(() => dateInputValue(new Date()));
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
  const [sessionSort, setSessionSort] = useState<SessionSort>({ key: 'login', direction: 'desc' });
  const [pageVisitSort, setPageVisitSort] = useState<PageVisitSort>({ key: 'time', direction: 'desc' });
  const [auditLogSort, setAuditLogSort] = useState<AuditLogSort>({ key: 'time', direction: 'desc' });
  const [summaryModal, setSummaryModal] = useState<SummaryModalType>(null);
  const [sessionPage, setSessionPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    let timeoutId: number | null = null;

    const scheduleNextDayRefresh = () => {
      timeoutId = window.setTimeout(() => {
        const nextDateValue = dateInputValue(new Date());
        setCurrentDateValue(previousDateValue => {
          return nextDateValue;
        });
        scheduleNextDayRefresh();
      }, msUntilNextLocalDay());
    };

    scheduleNextDayRefresh();

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  const baseQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params.toString();
  }, [from, search, to]);

  const sessionQuery = useMemo(() => {
    const params = new URLSearchParams(baseQuery);
    params.set('page', String(sessionPage));
    params.set('pageSize', String(pageSize));
    params.set('status', sessionFilter);
    return params.toString();
  }, [baseQuery, sessionFilter, sessionPage]);

  const auditQuery = useMemo(() => {
    const params = new URLSearchParams(baseQuery);
    params.set('page', String(auditPage));
    params.set('pageSize', String(pageSize));
    return params.toString();
  }, [auditPage, baseQuery]);

  useEffect(() => {
    setSessionPage(1);
    setAuditPage(1);
  }, [baseQuery]);

  useEffect(() => {
    setSessionPage(1);
  }, [sessionFilter]);

  const activeSessions = payload.summary.activeSessions ?? payload.sessions.filter(session => session.isActive).length;
  const completedSessions = payload.summary.completedSessions ?? payload.sessions.filter(session => !session.isActive).length;
  const visibleSessions = useMemo(() => {
    return payload.sessions
      .sort((a, b) => (
        dateSortOrder === 'newest'
          ? sessionLastSeenMs(b) - sessionLastSeenMs(a)
          : sessionLastSeenMs(a) - sessionLastSeenMs(b)
      ));
  }, [dateSortOrder, payload.sessions]);
  const visibleAuditLogs = useMemo(() => {
    return sortedAuditLogs(auditPayload.logs, auditLogSort);
  }, [auditLogSort, auditPayload.logs]);
  const sessionGroups = useMemo(() => groupedSortedSessions(visibleSessions, sessionSort, dateSortOrder), [currentDateValue, dateSortOrder, sessionSort, visibleSessions]);
  const auditLogGroups = useMemo(() => groupedSortedAuditLogs(auditPayload.logs, auditLogSort), [auditLogSort, auditPayload.logs, currentDateValue]);
  const visibleTotalSeconds = useMemo(() => (
    visibleSessions.reduce((sum, session) => sum + session.totalSeconds, 0)
  ), [visibleSessions]);
  const userTimeTotals = useMemo(() => {
    const totals = new Map<string, { label: string; email: string; totalSeconds: number }>();

    visibleSessions.forEach(session => {
      const key = sessionUserKey(session);
      const existing = totals.get(key);
      if (existing) {
        existing.totalSeconds += session.totalSeconds;
        return;
      }
      totals.set(key, {
        label: userLabel(session),
        email: session.email || session.username,
        totalSeconds: session.totalSeconds,
      });
    });

    return Array.from(totals.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [visibleSessions]);
  const userSessionTotals = useMemo(() => {
    const totals = new Map<string, { label: string; email: string; sessions: number; active: number; completed: number }>();

    visibleSessions.forEach(session => {
      const key = sessionUserKey(session);
      const existing = totals.get(key) || {
        label: userLabel(session),
        email: session.email || session.username,
        sessions: 0,
        active: 0,
        completed: 0,
      };
      existing.sessions += 1;
      if (session.isActive) existing.active += 1;
      else existing.completed += 1;
      totals.set(key, existing);
    });

    return Array.from(totals.values()).sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label));
  }, [visibleSessions]);
  const summaryModalTitle = summaryModal === 'sessions'
    ? 'Sessions breakdown'
    : summaryModal === 'users'
      ? 'Users breakdown'
      : summaryModal === 'returned'
          ? 'Returned sessions'
          : summaryModal === 'time'
          ? 'Total period by user'
          : '';
  const toggleSessionDay = (key: string) => {
    setOpenSessionDays(current => ({ ...current, [key]: !current[key] }));
  };
  const toggleAuditDay = (key: string) => {
    setOpenAuditDays(current => ({ ...current, [key]: !current[key] }));
  };
  const toggleSessionSort = (key: SessionSortKey) => {
    setSessionSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };
  const togglePageVisitSort = (key: PageVisitSortKey) => {
    setPageVisitSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };
  const toggleAuditLogSort = (key: AuditLogSortKey) => {
    setAuditLogSort(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;

    const loadActivity = (showSpinner = false) => {
      controller?.abort();
      controller = new AbortController();
      if (showSpinner) setLoading(true);
      setError('');

      fetch(`/api/user-activity/?${sessionQuery}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Unable to load user activity.');
          return response.json() as Promise<ActivityPayload>;
        })
        .then(data => {
          if (!cancelled) setPayload(data);
        })
        .catch(err => {
          if (!cancelled && err.name !== 'AbortError') setError('Unable to load user activity right now.');
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false);
        });
    };

    loadActivity(true);
    const intervalId = window.setInterval(() => loadActivity(), ACTIVITY_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      controller?.abort();
    };
  }, [canView, sessionQuery]);

  useEffect(() => {
    if (!canView) {
      setAuditLoading(false);
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;

    const loadAuditLogs = (showSpinner = false) => {
      controller?.abort();
      controller = new AbortController();
      if (showSpinner) setAuditLoading(true);
      setAuditError('');

      fetch(`/api/audit-logs/?${auditQuery}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Unable to load audit logs.');
          return response.json() as Promise<AuditPayload>;
        })
        .then(data => {
          if (!cancelled) setAuditPayload(data);
        })
        .catch(err => {
          if (!cancelled && err.name !== 'AbortError') setAuditError('Unable to load audit logs right now.');
        })
        .finally(() => {
          if (!cancelled && showSpinner) setAuditLoading(false);
        });
    };

    loadAuditLogs(true);
    const intervalId = window.setInterval(() => loadAuditLogs(), 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      controller?.abort();
    };
  }, [auditQuery, canView]);

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
                  const todayValue = dateInputValue(new Date());
                  setCurrentDateValue(todayValue);
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
              { label: 'Sessions', value: payload.summary.totalSessions, hint: 'View active and not active', icon: 'ri-login-circle-line', tone: 'bg-blue-50 text-blue-700 ring-blue-100', modal: 'sessions' },
              { label: 'Users', value: payload.summary.uniqueUsers, hint: 'View user session counts', icon: 'ri-user-line', tone: 'bg-violet-50 text-violet-700 ring-violet-100', modal: 'users' },
              { label: 'Returned', value: payload.summary.returnedSessions, hint: 'View returned session list', icon: 'ri-loop-left-line', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100', modal: 'returned' },
            ].map(card => (
              <button
                key={card.label}
                type="button"
                onClick={() => setSummaryModal(card.modal as SummaryModalType)}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-kbc-navy/20"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{card.label}</p>
                  <p className="mt-1 text-2xl font-extrabold text-kbc-navy">{card.value}</p>
                  <p className="mt-1 text-xs font-bold text-gray-400">{card.hint}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${card.tone}`}>
                  <i className={`${card.icon} text-lg`} />
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSummaryModal('time')}
              className="rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-kbc-navy/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Total Period</p>
                  <p className="mt-1 text-2xl font-extrabold text-kbc-navy">{formatDuration(visibleTotalSeconds)}</p>
                  <p className="mt-1 text-xs font-bold text-gray-400">Click to view by user</p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                  <i className="ri-time-line text-lg" />
                </span>
              </div>
            </button>
          </div>

          {summaryModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="summary-modal-title"
              onClick={() => setSummaryModal(null)}
            >
              <div
                className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
                onClick={event => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
                  <div>
                    <p id="summary-modal-title" className="text-base font-extrabold text-kbc-navy">{summaryModalTitle}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-500">
                      Showing the current filtered results.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSummaryModal(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-kbc-navy"
                    aria-label="Close summary details"
                  >
                    <i className="ri-close-line text-xl" />
                  </button>
                </div>
                <div className="max-h-[420px] overflow-y-auto p-4">
                  {summaryModal === 'sessions' && (
                    <div className="space-y-2">
                      {[
                        { label: 'Active sessions', value: activeSessions, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
                        { label: 'Not active sessions', value: completedSessions, tone: 'bg-gray-50 text-gray-700 ring-gray-200' },
                        { label: 'Visible sessions', value: visibleSessions.length, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between rounded-lg border border-gray-200 bg-slate-50 px-4 py-3">
                          <span className="text-sm font-extrabold text-kbc-navy">{item.label}</span>
                          <span className={`rounded-full px-3 py-1 text-sm font-extrabold ring-1 ${item.tone}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {summaryModal === 'users' && (
                    userSessionTotals.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-semibold text-gray-400">
                        No users in this view.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {userSessionTotals.map(user => (
                          <div key={user.email || user.label} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-slate-50 px-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-kbc-navy">{user.label}</p>
                              {user.email && <p className="truncate text-xs font-semibold text-gray-400">{user.email}</p>}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-extrabold text-kbc-navy">{user.sessions} sessions</p>
                              <p className="text-[11px] font-bold text-gray-400">{user.active} active / {user.completed} not active</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {summaryModal === 'returned' && (
                    visibleSessions.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-semibold text-gray-400">
                        No returned sessions in this view.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {visibleSessions.map(session => (
                          <div key={session.id} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-slate-50 px-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-kbc-navy">{userLabel(session)}</p>
                              <p className="truncate text-xs font-semibold text-gray-400">{session.email || session.username}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-extrabold text-kbc-navy">{sessionDurationLabel(session)}</p>
                              <p className="text-[11px] font-bold text-gray-400">{session.pageCount} pages</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {summaryModal === 'time' && (
                    userTimeTotals.length === 0 ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-semibold text-gray-400">
                        No user time yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-800">
                          Total visible period: {formatDuration(visibleTotalSeconds)}
                        </div>
                        {userTimeTotals.map(user => (
                          <div key={user.email || user.label} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-slate-50 px-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-kbc-navy">{user.label}</p>
                              {user.email && <p className="truncate text-xs font-semibold text-gray-400">{user.email}</p>}
                            </div>
                            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-extrabold text-kbc-navy ring-1 ring-gray-200">
                              {formatDuration(user.totalSeconds)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

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
                ['all', `All (${payload.summary.matchingSessions ?? payload.pagination.totalItems})`],
                ['active', `Active (${activeSessions})`],
                ['completed', `Not active (${completedSessions})`],
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
                {sessionFilter === 'all' ? 'All sessions' : sessionFilter === 'active' ? 'Active sessions' : 'Not active sessions'}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(260px,1.45fr)_90px_minmax(220px,1fr)_minmax(170px,0.9fr)_95px_76px_36px] border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-gray-500">
              <SortHeader label="User" sortKey="user" currentSort={sessionSort} onSort={toggleSessionSort} />
              <SortHeader label="Login" sortKey="login" currentSort={sessionSort} onSort={toggleSessionSort} />
              <SortHeader label="Status" sortKey="status" currentSort={sessionSort} onSort={toggleSessionSort} />
              <span>Now</span>
              <SortHeader label="Period" sortKey="time" currentSort={sessionSort} onSort={toggleSessionSort} align="right" />
              <SortHeader label="Pages" sortKey="pages" currentSort={sessionSort} onSort={toggleSessionSort} align="center" />
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
                        className="grid w-full grid-cols-[minmax(260px,1.45fr)_90px_minmax(220px,1fr)_minmax(170px,0.9fr)_95px_76px_36px] items-center px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold text-kbc-navy">{userLabel(session)}</span>
                          <span className="block truncate text-xs text-gray-400">{session.email || session.username}</span>
                        </span>
                        <span className="text-xs font-extrabold text-gray-700">
                          {sessionLoginDateLabel(session) && (
                            <span className="block text-[10px] font-bold uppercase text-gray-400">{sessionLoginDateLabel(session)}</span>
                          )}
                          <span>{formatTime(session.loginAt)}</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                            session.isActive ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
                          }`}>
                            {sessionStatusLabel(session)}
                          </span>
                          <span className="truncate font-extrabold text-gray-700">{sessionStatusText(session)}</span>
                        </span>
                        <span
                          className={`truncate text-xs font-extrabold ${session.isActive ? 'text-emerald-800' : 'text-gray-400'}`}
                          title={session.currentPage?.path || currentPageVisit(session)?.path || ''}
                        >
                          {currentPageLabel(session)}
                        </span>
                        <span className="text-right text-xs font-extrabold text-gray-700">{sessionDurationLabel(session)}</span>
                        <span className="text-center text-xs font-semibold text-gray-600">{pageCountLabel(session)}</span>
                        <span className="flex justify-end text-gray-400">
                          <i className={expandedId === session.id ? 'ri-arrow-up-s-line text-xl' : 'ri-arrow-down-s-line text-xl'} />
                        </span>
                      </button>

                      {expandedId === session.id && (
                        <div className="bg-slate-50 px-4 pb-4">
                          <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-500">
                            <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">Signed in with {session.authProvider || 'password'}</span>
                            <span className="rounded bg-white px-2 py-1 ring-1 ring-gray-200">{sessionStatusDetail(session)}</span>
                          </div>
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                            <div className="grid grid-cols-[1fr_110px_90px_120px] bg-gray-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">
                              <SortHeader label="Page" sortKey="page" currentSort={pageVisitSort} onSort={togglePageVisitSort} />
                              <SortHeader label="Period" sortKey="time" currentSort={pageVisitSort} onSort={togglePageVisitSort} align="right" />
                              <SortHeader label="Views" sortKey="views" currentSort={pageVisitSort} onSort={togglePageVisitSort} align="center" />
                              <SortHeader label="Last Seen" sortKey="lastSeen" currentSort={pageVisitSort} onSort={togglePageVisitSort} align="right" />
                            </div>
                            {session.pageVisits.length === 0 ? (
                              <div className="px-3 py-4 text-xs font-semibold text-gray-400">No page visits recorded.</div>
                            ) : (
                              sortedPageVisits(session.pageVisits, pageVisitSort).map(visit => (
                                <div key={visit.id} className="grid grid-cols-[1fr_110px_90px_120px] border-t border-gray-100 px-3 py-2 text-xs hover:bg-slate-50">
                                  <span className="truncate font-semibold text-gray-700" title={visit.path}>{pageVisitLabel(visit.path)}</span>
                                  <span className="text-right font-bold text-gray-700">{formatDuration(visit.durationSeconds, true)}</span>
                                  <span className="text-center text-gray-500">{visit.viewCount}</span>
                                  <span className="text-right text-gray-500">{formatTime(visit.lastSeenAt)}</span>
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
            {!loading && (
              <PaginationControls
                pagination={payload.pagination}
                onPageChange={setSessionPage}
                label="sessions"
              />
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
                <SortHeader label="Action" sortKey="action" currentSort={auditLogSort} onSort={toggleAuditLogSort} />
                <SortHeader label="Entity" sortKey="entity" currentSort={auditLogSort} onSort={toggleAuditLogSort} />
                <SortHeader label="Change" sortKey="change" currentSort={auditLogSort} onSort={toggleAuditLogSort} />
                <SortHeader label="User" sortKey="user" currentSort={auditLogSort} onSort={toggleAuditLogSort} />
                <SortHeader label="Time" sortKey="time" currentSort={auditLogSort} onSort={toggleAuditLogSort} />
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
                          <span className="truncate text-xs font-semibold text-gray-600">{auditUserLabel(log)}</span>
                          <span className="text-xs font-semibold text-gray-500">{formatTime(log.createdAt)}</span>
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
              {!auditLoading && (
                <PaginationControls
                  pagination={auditPayload.pagination}
                  onPageChange={setAuditPage}
                  label="logs"
                />
              )}
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
}
