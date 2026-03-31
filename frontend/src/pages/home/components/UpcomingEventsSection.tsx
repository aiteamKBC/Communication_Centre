import { Link } from 'react-router-dom';
import { events } from '../../../mocks/events';

const typeColors: Record<string, string> = {
  online: 'bg-kbc-navy/10 text-kbc-navy',
  offline: 'bg-green-50 text-kbc-green',
};

const typeIcons: Record<string, string> = {
  online: 'ri-wifi-line',
  offline: 'ri-building-4-line',
};

export default function UpcomingEventsSection() {
  const upcoming = events.slice(0, 3);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-kbc-navy">Upcoming Events</h2>
          <p className="text-gray-400 text-xs mt-0.5">Key dates, training sessions, and deadlines coming up soon</p>
        </div>
        <Link
          to="/events"
          className="text-xs text-kbc-navy font-medium hover:underline cursor-pointer whitespace-nowrap"
        >
          Full Calendar &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {upcoming.map((event) => (
          <div
            key={event.id}
            className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-4 cursor-pointer hover:shadow-sm transition-shadow group"
          >
            {/* Date block */}
            <div className="flex flex-col items-center justify-center w-14 h-14 bg-kbc-navy rounded-xl shrink-0">
              <span className="text-kbc-amber text-lg font-extrabold leading-none">{event.day}</span>
              <span className="text-white/70 text-xs font-semibold">{event.month}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${typeColors[event.type]} whitespace-nowrap`}>
                  <i className={`${typeIcons[event.type]} text-xs`} />
                  {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                </span>
              </div>
              <h3 className="text-xs font-bold text-kbc-navy leading-snug mb-1 group-hover:text-kbc-navy-light">
                {event.title}
              </h3>
              {event.time && (
                <p className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                  <i className="ri-time-line text-xs" />
                  {event.time}
                </p>
              )}
              {event.location && (
                <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5 truncate">
                  <i className="ri-map-pin-line text-xs shrink-0" />
                  {event.location}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-center">
        <Link
          to="/events"
          className="inline-flex items-center gap-2 border border-kbc-navy text-kbc-navy text-xs font-semibold px-5 py-2.5 rounded-lg hover:bg-kbc-navy hover:text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-calendar-2-line text-sm" />
          View Full Events Calendar
        </Link>
      </div>
    </section>
  );
}
