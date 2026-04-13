import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type TrainingItem = {
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
    .map(s => s.trim().toLowerCase())
    .map(s => DAY_ALIASES[s] || s)
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

export default function TodaysSessions() {
  const [items, setItems] = useState<TrainingItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void fetch('/api/training-plan/')
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then((data: TrainingItem[]) => {
        if (!mounted) return;
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!mounted) return;
        setItems([]);
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const todayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  const todayKey = todayNames[new Date().getDay()];
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const ts = todayStart.getTime();

  const todays = (items || []).filter(it => {
    const days = parseDays(it.sessionWeekDay);
    if (!days.includes(todayKey)) return false;
    const start = it.startDate ? new Date(it.startDate).getTime() : NaN;
    const end = it.endDate ? new Date(it.endDate).getTime() : NaN;
    if (Number.isNaN(start) || Number.isNaN(end)) return true; // assume active if dates missing/malformed
    return ts >= start && ts <= end;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-kbc-navy">Today's Sessions</h3>
        <Link to="/training-plan" className="text-xs text-kbc-navy hover:underline">View training plan</Link>
      </div>

      <div className="mt-3">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : todays.length === 0 ? (
          <p className="text-xs text-gray-400">No sessions scheduled for today.</p>
        ) : (
          <ul className="space-y-2">
            {todays.map((t, i) => (
              <li key={`${t.cohortName}-${t.moduleName}-${i}`} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{t.moduleName}</p>
                  <p className="text-xs text-gray-500">{t.cohortName} · {t.program}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-gray-700">{formatTimeRange(t.sessionStartTime, t.sessionEndTime)}</p>
                  <p className="text-xs text-gray-400">{t.tutorName || 'TBD'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
