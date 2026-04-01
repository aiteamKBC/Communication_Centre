import { useState } from 'react';
import { Link } from 'react-router-dom';
import { events } from '../../../mocks/events';
import FeedbackModal from '../../feedback/components/FeedbackModal';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['S','M','T','W','T','F','S'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// Simulated events by day (April 2026 demo) — type: 'online' | 'in-person'
const eventDays: Record<number, 'online' | 'in-person'> = {
  7: 'online',
  15: 'in-person',
  22: 'online',
  28: 'in-person',
  30: 'in-person',
};

// Demo event list for April
const demoEvents = [
  { day: '07', month: 'Apr', title: 'GDPR Awareness Webinar', type: 'Online' },
  { day: '15', month: 'Apr', title: 'Ofsted Readiness Briefing', type: 'In Person' },
  { day: '22', month: 'Apr', title: 'Digital Literacy Workshop', type: 'Online' },
  { day: '28', month: 'Apr', title: 'All-Staff Training Day', type: 'In Person' },
];

const typeBadge: Record<string, string> = {
  'Online': 'bg-kbc-navy-soft/10 text-kbc-navy-soft',
  'In Person': 'bg-kbc-green/10 text-kbc-green',
};

export default function EventsWidget() {
  const now = new Date(2026, 3, 1); // April 2026 demo
  const today = 1; // 1st April for demo
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);

  // Use mock events array if populated, otherwise use demo events for April
  const isApril2026 = calMonth === 3 && calYear === 2026;
  const displayEvents = events.length > 0 ? events.slice(0, 4) : (isApril2026 ? demoEvents : []);
  const calEventDays = events.length > 0 ? {} : (isApril2026 ? eventDays : {});

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Calendar Widget */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-kbc-navy">Upcoming Events</h3>
          <Link to="/events" className="text-xs text-kbc-navy hover:underline cursor-pointer whitespace-nowrap flex items-center gap-1">
            <i className="ri-calendar-event-line text-sm" />
          </Link>
        </div>

        {/* Mini Calendar */}
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

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d, i) => (
              <div key={i} className="text-center text-xs text-gray-400 font-medium py-0.5">{d}</div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              const eventType = day !== null ? (calEventDays as Record<number, 'online' | 'in-person'>)[day] : undefined;
              const isToday = isApril2026 && day === today;
              return (
                <div key={idx} className="flex flex-col items-center py-0.5">
                  {day !== null ? (
                    <div className={`relative w-7 h-7 flex items-center justify-center rounded-full text-xs cursor-pointer transition-colors ${
                      isToday
                        ? 'bg-kbc-amber text-kbc-navy font-bold'
                        : eventType
                          ? 'bg-kbc-navy text-white font-semibold hover:bg-kbc-navy-light'
                          : 'text-gray-600 hover:bg-gray-100'
                    }`}>
                      {day}
                      {eventType && (
                        <span className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${
                          eventType === 'online' ? 'bg-kbc-navy-soft' : 'bg-kbc-green'
                        }`} />
                      )}
                    </div>
                  ) : <div className="w-7 h-7" />}
                </div>
              );
            })}
          </div>

          {/* Legend */}
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

        {/* Event list */}
        {displayEvents.length > 0 ? (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {displayEvents.slice(0, 3).map((event, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer group">
                <div className="w-9 h-9 bg-kbc-navy rounded-lg flex flex-col items-center justify-center shrink-0">
                  <span className="text-kbc-amber text-xs font-bold leading-none">{event.day}</span>
                  <span className="text-white/70 text-xs leading-none font-medium">{event.month}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-kbc-navy leading-snug group-hover:text-kbc-navy-light line-clamp-1">{event.title}</p>
                  {'type' in event && (
                    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded mt-0.5 ${typeBadge[event.type as string] ?? 'bg-gray-100 text-gray-600'}`}>
                      {event.type as string}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t border-gray-100 px-4 py-5 flex flex-col items-center justify-center text-center gap-1.5">
            <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full">
              <i className="ri-calendar-2-line text-gray-400 text-sm" />
            </div>
            <p className="text-xs text-gray-500 font-medium">No events this month</p>
            <p className="text-xs text-gray-400">Events will appear here once added</p>
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

      {/* Feedback Card */}
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
