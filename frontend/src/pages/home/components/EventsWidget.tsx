import { useState } from 'react';
import { Link } from 'react-router-dom';
import { events } from '../../../mocks/events';
import FeedbackModal from '../../feedback/components/FeedbackModal';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function parseEventDate(date: string) {
  const [dayText, monthText, yearText] = date.split(' ');
  const day = parseInt(dayText, 10);
  const month = MONTH_ABBR[monthText] ?? 0;
  const year = parseInt(yearText, 10);
  return new Date(year, month, day);
}

const dotColors: Record<string, string> = {
  online: 'bg-kbc-navy',
  offline: 'bg-kbc-green',
};

const legendItems = [
  { label: 'Online', dot: 'bg-kbc-navy' },
  { label: 'Offline', dot: 'bg-kbc-green' },
];

export default function EventsWidget() {
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const upcoming = events.slice(0, 4);
  const eventDays = events.reduce<Record<number, string>>((accumulator, event) => {
    const date = parseEventDate(event.date);
    if (date.getFullYear() === calYear && date.getMonth() === calMonth) {
      accumulator[date.getDate()] = event.type;
    }
    return accumulator;
  }, {});

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const isToday = (day: number) =>
    calYear === now.getFullYear() &&
    calMonth === now.getMonth() &&
    day === now.getDate();

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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-kbc-navy">Upcoming Events</h3>
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-calendar-2-line text-kbc-navy text-sm" />
            </div>
            <Link to="/events" className="text-xs text-kbc-navy hover:underline cursor-pointer whitespace-nowrap">
              <i className="ri-calendar-event-line text-sm" />
            </Link>
          </div>
        </div>

        {/* Mini Calendar */}
        <div className="px-3 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer">
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <span className="text-xs font-bold text-kbc-navy">
              {MONTHS[calMonth]} {calYear}
            </span>
            <button onClick={nextMonth} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer">
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs text-gray-400 font-medium py-0.5">{d}</div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => (
              <div key={idx} className="flex flex-col items-center py-0.5">
                {day !== null ? (
                  <div className={`relative w-7 h-7 flex items-center justify-center rounded-full text-xs cursor-pointer transition-colors ${
                    isToday(day)
                      ? 'bg-kbc-navy text-white font-semibold ring-2 ring-kbc-amber/60 ring-offset-1'
                      : eventDays[day]
                        ? 'bg-kbc-navy text-white font-semibold hover:bg-kbc-navy-light'
                        : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                    {day}
                    {eventDays[day] && (
                      <span className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColors[eventDays[day]]}`} />
                    )}
                  </div>
                ) : <div className="w-7 h-7" />}
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="text-[11px] font-medium text-gray-400 mb-2">Dot color shows the event type</p>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              {legendItems.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-gray-500 whitespace-nowrap">
                  <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming events list */}
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {upcoming.slice(0, 2).map((event) => (
            <div key={event.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer group">
              <div className="w-8 h-8 bg-kbc-navy rounded-lg flex flex-col items-center justify-center shrink-0">
                <span className="text-kbc-amber text-xs font-bold leading-none">{event.day}</span>
                <span className="text-white/70 text-xs leading-none font-medium">{event.month}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-kbc-navy leading-snug group-hover:text-kbc-navy-light line-clamp-1">{event.title}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100">
          <Link
            to="/events"
            className="flex items-center justify-end gap-1 text-xs text-kbc-navy font-medium hover:underline cursor-pointer"
          >
            View Calendar &rsaquo;
          </Link>
        </div>
      </div>

      {/* Feedback Button Card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy/5 rounded-lg flex items-center justify-center shrink-0">
              <i className="ri-chat-smile-2-line text-kbc-navy text-base" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-kbc-navy leading-tight">Share Your Feedback</h3>
              <p className="text-xs text-gray-400 mt-0.5">Help us improve the platform</p>
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

