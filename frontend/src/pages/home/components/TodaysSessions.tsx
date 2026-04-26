import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export type TrainingItem = {
  id?: number;
  cohortName?: string;
  program?: string;
  startingDateLabel?: string;
  moduleName?: string;
  tutorName?: string;
  startDate?: string;
  endDate?: string;
  sessionWeekDay?: string;
  sessionStartTime?: string;
  sessionEndTime?: string;
};

const DAY_ALIASES: Record<string, string> = {
  saturday: 'saturday',
  sat: 'saturday',
  sunday: 'sunday',
  sun: 'sunday',
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tues: 'tuesday',
  tue: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
};

function parseDays(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[|,;/]+/)
    .map((segment) => segment.trim().toLowerCase())
    .map((segment) => DAY_ALIASES[segment] || segment)
    .filter(Boolean);
}

function formatMeridiemTime(time24?: string): string {
  if (!time24) return '';
  const parts = time24.split(':');
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatTimeRange(start?: string, end?: string) {
  if (!start && !end) return '';
  if (!end) return formatMeridiemTime(start);
  return `${formatMeridiemTime(start)} - ${formatMeridiemTime(end)}`;
}

export default function TodaysSessions({ initialItems }: { initialItems?: TrainingItem[] }) {
  const [items, setItems] = useState<TrainingItem[] | null>(initialItems ?? null);

  useEffect(() => {
    if (initialItems !== undefined) {
      setItems(initialItems);
      return;
    }

    let mounted = true;
    void fetch('/api/training-plan/')
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: TrainingItem[]) => {
        if (!mounted) return;
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!mounted) return;
        setItems([]);
      });

    return () => {
      mounted = false;
    };
  }, [initialItems]);

  const todayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const todayKey = todayNames[new Date().getDay()];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const ts = todayStart.getTime();

  const todays = (items || []).filter((item) => {
    const days = parseDays(item.sessionWeekDay);
    if (!days.includes(todayKey)) return false;
    const start = item.startDate ? new Date(item.startDate).getTime() : NaN;
    const end = item.endDate ? new Date(item.endDate).getTime() : NaN;
    if (Number.isNaN(start) || Number.isNaN(end)) return true;
    return ts >= start && ts <= end;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-kbc-navy">Today's Sessions</h3>
        <Link to="/training-plan" className="text-xs text-kbc-navy hover:underline">
          View training plan
        </Link>
      </div>

      <div className="mt-3">
        {todays.length === 0 ? (
          <p className="text-xs text-gray-400">No sessions scheduled for today.</p>
        ) : (
          <ul className="space-y-2">
            {todays.map((item, index) => (
              <li
                key={`${item.cohortName}-${item.moduleName}-${index}`}
                className="flex items-center justify-between rounded bg-gray-50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">{item.moduleName}</p>
                  <p className="text-xs text-gray-500">{item.cohortName} - {item.program}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-700">
                    {formatTimeRange(item.sessionStartTime, item.sessionEndTime)}
                  </p>
                  <p className="text-xs text-gray-400">{item.tutorName || 'TBD'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
