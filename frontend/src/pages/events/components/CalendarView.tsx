import { useEffect, useRef, useState } from 'react';
import { CalendarEvent } from '../../../mocks/events';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const typeStyle: Record<string, { pill: string; dot: string; label: string }> = {
  online: { pill: 'bg-slate-100 text-slate-700 hover:bg-slate-200', dot: 'bg-slate-500', label: 'Online' },
  offline: { pill: 'bg-green-100 text-green-700 hover:bg-green-200', dot: 'bg-green-500', label: 'Offline' },
};

interface Props {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onAddEvent: () => void;
  jumpTo?: Date | null;
}

function parseEventDate(event: CalendarEvent): Date {
  const parts = event.date.split(' ');
  const day = parseInt(parts[0], 10);
  const month = MONTH_ABBR[parts[1]] ?? 0;
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

export default function CalendarView({ events, onEventClick, onAddEvent, jumpTo }: Props) {
  const [today, setToday] = useState(() => new Date());
  const [current, setCurrent] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [dayPopup, setDayPopup] = useState<{ day: number; events: CalendarEvent[] } | null>(null);
  const previousTodayRef = useRef(today);

  useEffect(() => {
    const syncToday = () => {
      setToday(new Date());
    };

    syncToday();
    const intervalId = window.setInterval(syncToday, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const previousToday = previousTodayRef.current;
    const monthChanged =
      previousToday.getFullYear() !== today.getFullYear() ||
      previousToday.getMonth() !== today.getMonth();
    const viewingPreviousTodayMonth =
      current.getFullYear() === previousToday.getFullYear() &&
      current.getMonth() === previousToday.getMonth();

    if (monthChanged && viewingPreviousTodayMonth) {
      setCurrent(new Date(today.getFullYear(), today.getMonth(), 1));
    }

    previousTodayRef.current = today;
  }, [today, current]);

  useEffect(() => {
    if (jumpTo) {
      setCurrent(new Date(jumpTo.getFullYear(), jumpTo.getMonth(), 1));
    }
  }, [jumpTo]);

  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map events to days in current displayed month
  const eventsByDay: Record<number, CalendarEvent[]> = {};
  events.forEach(event => {
    const d = parseEventDate(event);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!eventsByDay[day]) eventsByDay[day] = [];
      eventsByDay[day].push(event);
    }
  });

  // Build calendar grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day;

  const prevMonth = () => setCurrent(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrent(new Date(year, month + 1, 1));
  const goToday = () => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1));

  const MAX_VISIBLE = 3;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* ── Calendar Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="text-xs font-semibold text-gray-600 hover:text-kbc-navy border border-gray-200 hover:border-kbc-navy px-3 py-1.5 rounded-lg cursor-pointer transition-all whitespace-nowrap"
          >
            Today
          </button>
          <div className="flex items-center">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
            >
              <i className="ri-arrow-left-s-line text-gray-600 text-lg" />
            </button>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
            >
              <i className="ri-arrow-right-s-line text-gray-600 text-lg" />
            </button>
          </div>
          <h3 className="text-base font-bold text-kbc-navy">
            {MONTH_NAMES[month]} {year}
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onAddEvent}
            className="flex items-center gap-1.5 bg-kbc-amber text-kbc-navy text-xs font-bold px-3.5 py-2 rounded-lg cursor-pointer hover:bg-yellow-400 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line text-sm" />
            Add Event
          </button>
        </div>
      </div>

      {/* ── Day Names Row ── */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2 border-r border-gray-100 last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar Grid ── */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const dayEvents = day ? (eventsByDay[day] ?? []) : [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - MAX_VISIBLE;

          return (
            <div
              key={idx}
              className={`group min-h-[110px] border-r border-b border-gray-100 last:border-r-0 p-1.5 transition-colors ${
                day
                  ? 'bg-white hover:bg-kbc-amber/15'
                  : 'bg-gray-50/40'
              } ${
                day && dayEvents.length > 0
                  ? 'hover:shadow-[inset_0_0_0_1px_rgba(247,168,0,0.32)]'
                  : ''
              }`}
            >
              {day !== null && (
                <>
                  {/* Day number */}
                  <div
                    className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold mb-1 select-none ${
                      isToday(day)
                        ? 'bg-kbc-navy text-white'
                        : 'text-gray-600 group-hover:bg-white group-hover:text-kbc-navy group-hover:shadow-sm'
                    }`}
                  >
                    {day}
                  </div>

                  {/* Event pills */}
                  <div className="flex flex-col gap-0.5">
                    {visible.map(event => {
                      const cfg = typeStyle[event.type];
                      const startTime = event.time
                        ? event.time.split('–')[0].split('-')[0].trim()
                        : '';
                      return (
                        <button
                          key={event.id}
                          onClick={() => onEventClick(event)}
                          className={`w-full text-left text-xs px-1.5 py-0.5 rounded font-medium truncate cursor-pointer transition-colors ${cfg.pill}`}
                          title={event.title}
                        >
                          {startTime && (
                            <span className="opacity-60 mr-1 text-xs">{startTime}</span>
                          )}
                          {event.title}
                        </button>
                      );
                    })}

                    {overflow > 0 && (
                      <button
                        onClick={() => setDayPopup({ day, events: dayEvents })}
                        className="text-xs text-kbc-navy font-semibold px-1.5 py-0.5 hover:bg-gray-100 rounded cursor-pointer text-left transition-colors"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state when no events exist at all */}
      {events.length === 0 && (
        <div className="py-8 text-center border-t border-gray-100">
          <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
            <i className="ri-calendar-2-line text-xl text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-gray-500">No events yet</p>
          <p className="text-xs text-gray-400 mt-1">Click <strong>&quot;+ Add Event&quot;</strong> to schedule your first event</p>
        </div>
      )}

      {/* ── Day Events Popup (when clicking "+N more") ── */}
      {dayPopup && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          onClick={() => setDayPopup(null)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-xl border border-gray-200 w-full max-w-sm p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-kbc-navy">
                {MONTH_NAMES[month]} {dayPopup.day}
              </h4>
              <button
                onClick={() => setDayPopup(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <i className="ri-close-line text-gray-500 text-sm" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {dayPopup.events.map(event => {
                const cfg = typeStyle[event.type];
                return (
                  <button
                    key={event.id}
                    onClick={() => { setDayPopup(null); onEventClick(event); }}
                    className={`w-full text-left px-3 py-2 rounded-lg cursor-pointer transition-colors ${cfg.pill}`}
                  >
                    <p className="text-xs font-bold">{event.title}</p>
                    {event.time && <p className="text-xs opacity-70 mt-0.5">{event.time}</p>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
