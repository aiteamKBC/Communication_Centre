import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import { useSharedEvents } from '../../hooks/useSharedEvents';
import { CalendarEvent, parseCalendarEventDate } from '../../mocks/events';
import EventDetailModal from './components/EventDetailModal';
import AddEventModal from './components/AddEventModal';
import EditEventModal from './components/EditEventModal';
import CalendarView from './components/CalendarView';
import useAccessControl from '../../hooks/useAccessControl';
import { confirmDeleteEvent, kbcSuccessSwal, kbcSwal } from '../../components/feature/sweetAlert';

function getCoverMedia(event: CalendarEvent) {
  if (event.media?.length) {
    const flagged = event.media.find(m => m.isCover);
    if (flagged) return flagged;
  }
  return event.image
    ? { id: 'legacy-image', kind: 'image' as const, url: event.image, name: event.title }
    : null;
}

function isFinishedEvent(event: CalendarEvent): boolean {
  const eventDate = parseCalendarEventDate(event);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return eventDate.getTime() < todayStart.getTime();
}

export default function EventsPage() {
  const { events: allEvents, loading, error, addEvent, updateEvent, deleteEvent } = useSharedEvents();
  const { canManageEvents } = useAccessControl();
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent]   = useState<CalendarEvent | null>(null);
  const [calendarJump, setCalendarJump]   = useState<Date | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  const monthAbbrMap: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const handleEventAdded = async (event: CalendarEvent) => {
    if (!canManageEvents) return;
    await addEvent(event);
    const parts = event.date.split(' ');
    const month = monthAbbrMap[parts[1]] ?? 0;
    const year  = parseInt(parts[2], 10);
    setCalendarJump(new Date(year, month, 1));
  };

  const handleEventUpdated = async (event: CalendarEvent) => {
    if (!canManageEvents) return;
    await updateEvent(event);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!canManageEvents) return;
    const event = allEvents.find(item => item.id === id);
    const confirmed = await confirmDeleteEvent(event?.title ?? 'this event');
    if (!confirmed) return;

    setDeletingId(id);
    try {
      await deleteEvent(id);
      if (selectedEvent?.id === id) setSelectedEvent(null);
      await kbcSuccessSwal.fire({
        title: 'Event Deleted',
        html: 'The event has been removed from the calendar and event cards.',
        icon: 'success',
        confirmButtonText: 'OK',
      });
    } catch (error) {
      await kbcSwal.fire({
        title: 'Event Not Deleted',
        html: error instanceof Error ? error.message : 'Something went wrong while deleting this event.',
        icon: 'error',
        confirmButtonText: 'OK',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TopNav />

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
                All upcoming institutional events, training sessions, and meetings.
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <section className="mb-10">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <CalendarView
            events={allEvents}
            onEventClick={setSelectedEvent}
            onAddEvent={() => {
              if (!canManageEvents) {
                return;
              }
              setAddEventOpen(true);
            }}
            canManageEvents={canManageEvents}
            jumpTo={calendarJump}
          />
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-kbc-navy">All Events</h2>
              <p className="text-xs text-gray-400 mt-0.5">Browse and register for upcoming sessions and events</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">
              <p className="text-sm font-semibold text-gray-500 mb-1">Loading events...</p>
              <p className="text-xs text-gray-400">Fetching events from the database.</p>
            </div>
          ) : allEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
              {allEvents.map(event => {
                const iconMap: Record<CalendarEvent['type'], string> = {
                  online: 'ri-wifi-line',
                  offline: 'ri-map-pin-line',
                };
                const colorMap: Record<CalendarEvent['type'], string> = {
                  online: '#107C10',
                  offline: '#1B2A4A',
                };
                const badgeMap: Record<CalendarEvent['type'], string> = {
                  online: 'bg-green-100 text-green-700',
                  offline: 'bg-slate-100 text-slate-700',
                };
                const icon = iconMap[event.type];
                const color = colorMap[event.type];
                const badge = badgeMap[event.type];
                const typeLabel = event.type.charAt(0).toUpperCase() + event.type.slice(1);
                const coverMedia = getCoverMedia(event);
                const finished = isFinishedEvent(event);
                const statusBadge = finished
                  ? 'border-slate-200 bg-slate-100 text-slate-600'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700';

                return (
                  <div
                    key={event.id}
                    className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-[0_10px_30px_rgba(27,42,74,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-kbc-amber/40 hover:shadow-[0_18px_42px_rgba(27,42,74,0.12)]"
                  >
                    <div className="relative flex h-72 w-full items-center justify-center overflow-hidden bg-kbc-navy xl:h-80">
                      {coverMedia ? (
                        coverMedia.kind === 'video' ? (
                          <video
                            src={coverMedia.url}
                            className="h-full w-full object-cover brightness-105 saturate-125 transition-transform duration-500 group-hover:scale-105"
                            muted
                            loop
                            autoPlay
                            playsInline
                          />
                        ) : (
                          <img src={coverMedia.url} alt={event.title} className="h-full w-full object-cover brightness-105 saturate-125 transition-transform duration-500 group-hover:scale-105" />
                        )
                      ) : (
                        <i className={`${icon} text-4xl`} style={{ color }} />
                      )}
                      <div className="absolute right-3 top-3 flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-kbc-navy shadow-[0_8px_18px_rgba(0,0,0,0.22)] ring-1 ring-white/20">
                        <span className="text-sm font-extrabold leading-none text-kbc-amber">{event.day}</span>
                        <span className="mt-0.5 text-[10px] font-bold leading-none text-white/75">{event.month}</span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-1.5">
                          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${badge} ${event.type === 'online' ? 'ring-green-200' : 'ring-slate-200'}`}>
                            <i className={`${icon} text-xs`} />
                            {typeLabel}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${statusBadge}`}>
                            <i className={finished ? 'ri-checkbox-circle-line text-xs' : 'ri-calendar-schedule-line text-xs'} />
                            {finished ? 'Finished' : 'Upcoming'}
                          </span>
                      </div>

                      <h3 className="mb-2 text-[15px] font-extrabold leading-snug text-kbc-navy transition-colors group-hover:text-kbc-navy-light">{event.title}</h3>

                      {event.description && (
                        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-500">
                          {event.description}
                        </p>
                      )}

                      <div className="mb-4 flex flex-col gap-1.5">
                        {event.time && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <i className="ri-time-line text-xs text-kbc-amber shrink-0" />
                            {event.time}
                          </div>
                        )}
                        {event.location && (
                          <div className="flex items-start gap-1.5 text-xs leading-snug text-slate-600">
                            <i className="ri-map-pin-line mt-0.5 text-xs text-kbc-amber shrink-0" />
                            {event.location}
                          </div>
                        )}
                        {event.registrationLink && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <i className="ri-links-line text-xs text-kbc-amber shrink-0" />
                            Registration available
                          </div>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                        {canManageEvents && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); setEditingEvent(event); }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-kbc-navy/20 hover:bg-slate-50 hover:text-kbc-navy"
                              title="Edit event"
                            >
                              <i className="ri-edit-line text-xs" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); void handleDeleteEvent(event.id); }}
                              disabled={deletingId === event.id}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 bg-white text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Delete event"
                            >
                              <i className="ri-delete-bin-line text-xs" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-kbc-navy px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_16px_rgba(27,42,74,0.16)] transition-colors hover:bg-kbc-navy-light"
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
        canManage={canManageEvents}
        onEdit={event => { setSelectedEvent(null); setEditingEvent(event); }}
        onDelete={id => void handleDeleteEvent(id)}
      />
      <AddEventModal
        open={canManageEvents && addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onEventAdded={handleEventAdded}
      />
      <EditEventModal
        event={canManageEvents ? editingEvent : null}
        onClose={() => setEditingEvent(null)}
        onEventUpdated={handleEventUpdated}
      />
    </div>
  );
}
