import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import { CalendarEvent } from '../../mocks/events';
import EventDetailModal from './components/EventDetailModal';
import AddEventModal from './components/AddEventModal';
import CalendarView from './components/CalendarView';

// ... existing code ...

export default function EventsPage() {
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [calendarJump, setCalendarJump] = useState<Date | null>(null);

  const jumpToEventMonth = (event: CalendarEvent) => {
    const parts = event.date.split(' ');
    const MONTH_ABBR_MAP: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const month = MONTH_ABBR_MAP[parts[1]] ?? 0;
    const year = parseInt(parts[2], 10);
    setCalendarJump(new Date(year, month, 1));
  };

  const handleEventAdded = (event: CalendarEvent) => {
    setAllEvents(prev => {
      const exists = prev.some(item => item.id === event.id);
      return exists
        ? prev.map(item => item.id === event.id ? event : item)
        : [...prev, event];
    });
    setSelectedEvent(event);
    setEditingEvent(null);
    jumpToEventMonth(event);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(null);
    setEditingEvent(event);
    setAddEventOpen(true);
  };

  const handleDeleteEvent = (eventId: string) => {
    setAllEvents(prev => prev.filter(item => item.id !== eventId));
    setSelectedEvent(current => current?.id === eventId ? null : current);
    setEditingEvent(current => current?.id === eventId ? null : current);
  };

  const handleModalClose = () => {
    setAddEventOpen(false);
    setEditingEvent(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TopNav />

      {/* ── Page Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <Link to="/" className="hover:text-kbc-navy cursor-pointer">Home</Link>
            <span>/</span>
            <span className="text-kbc-navy font-medium">Events</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
              <i className="ri-calendar-event-line text-white text-base" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-kbc-navy">Events</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                Browse upcoming institutional events across the college.
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">

        {/* ── Section 1: Full Calendar ── */}
        <section className="mb-10">
          <CalendarView
            events={allEvents}
            onEventClick={setSelectedEvent}
            onAddEvent={() => setAddEventOpen(true)}
            jumpTo={calendarJump}
          />
        </section>

        {/* ── Section 2: All Events Cards ── */}
        <section>
          <div className="mb-5">
            <h2 className="text-base font-bold text-kbc-navy">All Events</h2>
            <p className="text-xs text-gray-400 mt-0.5">Browse and register for upcoming sessions and events</p>
          </div>

          {/* Event Cards Grid */}
          {allEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {allEvents.map(event => {
                const iconMap: Record<string, string> = {
                  online: 'ri-wifi-line',
                  offline: 'ri-building-4-line',
                };
                const colorMap: Record<string, string> = {
                  online: '#1B2A4A',
                  offline: '#107C10',
                };
                const badgeMap: Record<string, string> = {
                  online: 'bg-slate-100 text-slate-700',
                  offline: 'bg-green-100 text-green-700',
                };
                const icon = iconMap[event.type] ?? 'ri-calendar-line';
                const color = colorMap[event.type] ?? '#1B2A4A';
                const badge = badgeMap[event.type] ?? 'bg-gray-100 text-gray-700';
                const typeLabel = event.type.charAt(0).toUpperCase() + event.type.slice(1);
                const leadMedia = event.media?.[0];
                const leadImage = leadMedia?.kind === 'image' ? leadMedia.url : event.image;

                return (
                  <div
                    key={event.id}
                    className="bg-white rounded-xl border border-gray-100 overflow-hidden group cursor-pointer hover:shadow-sm transition-shadow"
                  >
                    {leadImage ? (
                      <div className="w-full h-44 overflow-hidden bg-kbc-navy/10">
                        <img src={leadImage} alt={event.title} className="w-full h-full object-cover object-top" />
                      </div>
                    ) : leadMedia?.kind === 'video' ? (
                      <div className="relative w-full h-44 overflow-hidden bg-kbc-navy/10">
                        <video src={leadMedia.url} className="w-full h-full object-cover object-top" muted playsInline />
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/15">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-kbc-navy shadow-sm">
                            <i className="ri-play-fill text-xl" />
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-44 bg-kbc-navy/10 flex items-center justify-center">
                        <i className={`${icon} text-4xl`} style={{ color }} />
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge}`}>
                          <i className={`${icon} text-xs`} />
                          {typeLabel}
                        </span>
                        <div className="flex flex-col items-center justify-center w-10 h-10 bg-kbc-navy rounded-lg shrink-0">
                          <span className="text-kbc-amber text-sm font-extrabold leading-none">{event.day}</span>
                          <span className="text-white/70 text-xs leading-none">{event.month}</span>
                        </div>
                      </div>

                      <h3 className="text-sm font-bold text-kbc-navy leading-snug mb-2">
                        {event.title}
                      </h3>

                      {event.description && (
                        <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-2">
                          {event.description}
                        </p>
                      )}

                      <div className="flex flex-col gap-1 mb-4">
                        {event.time && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <i className="ri-time-line text-xs text-gray-400 shrink-0" />
                            {event.time}
                          </div>
                        )}
                        {event.location && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <i className="ri-map-pin-line text-xs text-gray-400 shrink-0" />
                            {event.location}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                        <span className="text-xs text-gray-400 flex-1">{event.department}</span>
                        {event.registrationLink && (
                          <a
                            href={event.registrationLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(eventClick) => eventClick.stopPropagation()}
                            className="flex items-center gap-1.5 rounded-lg border border-kbc-amber/40 bg-kbc-amber/10 px-3 py-1.5 text-xs font-semibold text-kbc-navy hover:bg-kbc-amber/20 whitespace-nowrap"
                          >
                            <i className="ri-link text-xs" />
                            Register
                          </a>
                        )}
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="flex items-center gap-1.5 bg-kbc-navy text-white text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
                        >
                          <i className="ri-arrow-right-circle-line text-xs" />
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">
              <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
                <i className="ri-calendar-2-line text-2xl text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-500 mb-1">No events yet</p>
              <p className="text-xs text-gray-400">Click <strong>&quot;+ Add Event&quot;</strong> in the calendar above to create your first event</p>
            </div>
          )}
        </section>
      </main>

      <Footer />

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEdit={handleEditEvent}
        onDelete={handleDeleteEvent}
      />
      <AddEventModal
        open={addEventOpen}
        onClose={handleModalClose}
        onEventAdded={handleEventAdded}
        eventToEdit={editingEvent}
      />
    </div>
  );
}




