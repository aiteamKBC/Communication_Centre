import { useEffect } from 'react';
import { CalendarEvent } from '../../../mocks/events';

const typeConfig: Record<CalendarEvent['type'], { label: string; icon: string; badge: string; headerBg: string; accent: string }> = {
  online: { label: 'Online', icon: 'ri-wifi-line', badge: 'bg-green-100 text-kbc-green', headerBg: 'bg-green-50', accent: '#107C10' },
  offline: { label: 'Offline', icon: 'ri-map-pin-line', badge: 'bg-kbc-navy/10 text-kbc-navy', headerBg: 'bg-kbc-navy/5', accent: '#1B2A4A' },
};

interface Props {
  event: CalendarEvent | null;
  onClose: () => void;
}

function getEventMedia(event: CalendarEvent) {
  if (event.media?.length) return event.media;
  return event.image
    ? [{ id: 'legacy-image', kind: 'image' as const, url: event.image, name: event.title }]
    : [];
}

export default function EventDetailModal({ event, onClose }: Props) {
  useEffect(() => {
    if (!event) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [event]);

  if (!event) return null;

  const tcfg = typeConfig[event.type];
  const media = getEventMedia(event);
  const coverMedia = media[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />

      <div
        className="relative bg-white rounded-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {coverMedia ? (
          <div className="relative w-full h-52">
            {coverMedia.kind === 'video' ? (
              <video
                src={coverMedia.url}
                className="w-full h-full object-cover object-top"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img src={coverMedia.url} alt={event.title} className="w-full h-full object-cover object-top" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-white/90 rounded-full cursor-pointer hover:bg-white transition-colors"
            >
              <i className="ri-close-line text-kbc-navy text-base" />
            </button>
            <div className="absolute bottom-4 left-4 flex flex-col items-center justify-center w-14 h-14 bg-kbc-navy rounded-xl">
              <span className="text-kbc-amber text-xl font-extrabold leading-none">{event.day}</span>
              <span className="text-white/70 text-xs leading-none mt-0.5">{event.month}</span>
            </div>
            <div className="absolute bottom-5 left-24">
              <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-white/90 text-kbc-navy whitespace-nowrap">
                <i className={`${tcfg.icon} text-xs`} />
                {tcfg.label}
              </span>
            </div>
          </div>
        ) : (
          <div className={`relative w-full h-28 ${tcfg.headerBg} flex items-center justify-center`}>
            <i className={`${tcfg.icon} text-5xl opacity-20`} style={{ color: tcfg.accent }} />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-white rounded-full cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <i className="ri-close-line text-kbc-navy text-base" />
            </button>
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-lg font-bold text-kbc-navy leading-snug flex-1">{event.title}</h2>
            {!coverMedia && (
              <div className="flex flex-col items-center justify-center w-12 h-12 bg-kbc-navy rounded-xl shrink-0">
                <span className="text-kbc-amber text-base font-extrabold leading-none">{event.day}</span>
                <span className="text-white/70 text-xs leading-none">{event.month}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-5">
            <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${tcfg.badge} whitespace-nowrap`}>
              <i className={`${tcfg.icon} text-xs`} />
              {tcfg.label}
            </span>
          </div>

          {event.description && (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-kbc-navy uppercase tracking-wide mb-2">About This Event</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{event.description}</p>
            </div>
          )}

          {media.length > 1 && (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-kbc-navy uppercase tracking-wide mb-2">Event Media</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {media.slice(1).map(item => (
                  <div key={item.id} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 h-28">
                    {item.kind === 'video' ? (
                      <video src={item.url} className="w-full h-full object-cover" controls playsInline />
                    ) : (
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover object-top" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shrink-0">
                <i className="ri-calendar-line text-kbc-navy text-sm" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Date</p>
                <p className="text-sm font-semibold text-kbc-navy">{event.date}</p>
              </div>
            </div>

            {event.time && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shrink-0">
                  <i className="ri-time-line text-kbc-navy text-sm" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Time</p>
                  <p className="text-sm font-semibold text-kbc-navy">{event.time}</p>
                </div>
              </div>
            )}

            {event.location && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shrink-0">
                  <i className="ri-map-pin-line text-kbc-navy text-sm" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">{event.type === 'online' ? 'Platform / Meeting Link' : 'Location'}</p>
                  <p className="text-sm font-semibold text-kbc-navy">{event.location}</p>
                </div>
              </div>
            )}

          </div>

          <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-gray-100">
            <div>
              {event.registrationLink && (
                <a
                  href={event.registrationLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 bg-kbc-navy text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
                >
                  <i className="ri-external-link-line text-sm" />
                  Register Now
                </a>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="text-xs font-semibold text-gray-500 hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
