import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSharedEvents } from '../../../hooks/useSharedEvents';
import { parseCalendarEventDate, sortCalendarEvents } from '../../../mocks/events';
import FeedbackModal from '../../feedback/components/FeedbackModal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const typeBadge: Record<string, string> = {
  Online: 'bg-kbc-navy-soft/10 text-kbc-navy-soft',
  'In Person': 'bg-kbc-green/10 text-kbc-green',
};

function getFallbackMonth(today: Date) {
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

export default function EventsWidget() {
  const { events } = useSharedEvents();
  const sortedEvents = useMemo(() => sortCalendarEvents(events), [events]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const initialMonth = useMemo(() => {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const firstUpcomingEvent = sortedEvents.find(event => parseCalendarEventDate(event) >= todayStart);
    return firstUpcomingEvent
      ? new Date(parseCalendarEventDate(firstUpcomingEvent).getFullYear(), parseCalendarEventDate(firstUpcomingEvent).getMonth(), 1)
      : getFallbackMonth(today);
  }, [sortedEvents, today]);
  const [calMonth, setCalMonth] = useState(initialMonth.getMonth());
  const [calYear, setCalYear] = useState(initialMonth.getFullYear());

  useEffect(() => {
    setCalMonth(initialMonth.getMonth());
    setCalYear(initialMonth.getFullYear());
  }, [initialMonth]);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const displayEvents = useMemo(
    () =>
      sortedEvents.filter(event => {
        const date = parseCalendarEventDate(event);
        return date.getMonth() === calMonth && date.getFullYear() === calYear;
      }),
    [calMonth, calYear, sortedEvents],
  );
  const calEventDays = useMemo(
    () =>
      displayEvents.reduce<Record<number, 'online' | 'in-person'>>((acc, event) => {
        acc[parseInt(event.day, 10)] = event.type === 'online' ? 'online' : 'in-person';
        return acc;
      }, {}),
    [displayEvents],
  );

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(y => y - 1);
      return;
    }
    setCalMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(y => y + 1);
      return;
    }
    setCalMonth(m => m + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-kbc-navy">Upcoming Events</h3>
          <Link to="/events" className="text-xs text-kbc-navy hover:underline cursor-pointer whitespace-nowrap flex items-center gap-1">
            <i className="ri-calendar-event-line text-sm" />
          </Link>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer transition-colors">
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <span className="text-xs font-bold text-kbc-navy">
              {MONTHS[calMonth]} {calYear}
            </span>
            <button onClick={nextMonth} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer transition-colors">
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((dayLabel, index) => (
              <div key={index} className="text-center text-xs text-gray-400 font-medium py-0.5">
                {dayLabel}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              const eventType = day !== null ? calEventDays[day] : undefined;
              const isToday = calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();
              return (
                <div key={idx} className="flex flex-col items-center py-0.5">
                  {day !== null ? (
                    <div
                      className={`relative w-7 h-7 flex items-center justify-center rounded-full text-xs cursor-pointer transition-colors ${
                        isToday
                          ? 'bg-kbc-amber text-kbc-navy font-bold'
                          : eventType
                            ? 'bg-kbc-navy text-white font-semibold hover:bg-kbc-navy-light'
                            : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {day}
                      {eventType && (
                        <span
                          className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${
                            eventType === 'online' ? 'bg-kbc-navy-soft' : 'bg-kbc-green'
                          }`}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="w-7 h-7" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-kbc-navy-soft inline-block" />
              <span className="text-xs text-gray-500">Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-kbc-green inline-block" />
              <span className="text-xs text-gray-500">In Person</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-kbc-amber inline-block" />
              <span className="text-xs text-gray-500">Today</span>
            </div>
          </div>
        </div>

        {displayEvents.length > 0 ? (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {displayEvents.slice(0, 3).map(event => {
              const typeLabel = event.type === 'online' ? 'Online' : 'In Person';
              return (
                <div key={event.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer group">
                  <div className="w-9 h-9 bg-kbc-navy rounded-lg flex flex-col items-center justify-center shrink-0">
                    <span className="text-kbc-amber text-xs font-bold leading-none">{event.day}</span>
                    <span className="text-white/70 text-xs leading-none font-medium">{event.month}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-kbc-navy leading-snug group-hover:text-kbc-navy-light line-clamp-1">{event.title}</p>
                    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded mt-0.5 ${typeBadge[typeLabel] ?? 'bg-gray-100 text-gray-600'}`}>
                      {typeLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border-t border-gray-100 px-4 py-5 flex flex-col items-center justify-center text-center gap-1.5">
            <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full">
              <i className="ri-calendar-2-line text-gray-400 text-sm" />
            </div>
            <p className="text-xs text-gray-500 font-medium">No events in this month</p>
            <p className="text-xs text-gray-400">Add events from the calendar page to see them here</p>
          </div>
        )}

        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
          <Link
            to="/events"
            className="flex items-center justify-end gap-1 text-xs text-kbc-navy font-medium hover:underline cursor-pointer"
          >
            View Calendar &rsaquo;
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy/5 rounded-lg flex items-center justify-center shrink-0">
              <i className="ri-chat-smile-2-line text-kbc-navy text-base" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-kbc-navy leading-tight">Share Your Feedback</h3>
              <p className="text-xs text-gray-400 mt-0.5">Help us improve.</p>
            </div>
          </div>
          <button
            onClick={() => setFeedbackOpen(true)}
            className="flex items-center justify-between w-full bg-kbc-navy text-white text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
          >
            <span>Submit Feedback</span>
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-arrow-right-s-line text-sm" />
            </div>
          </button>
        </div>
      </div>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
