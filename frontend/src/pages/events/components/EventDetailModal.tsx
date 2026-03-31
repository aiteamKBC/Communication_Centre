import { useEffect } from 'react';
import { CalendarEvent } from '../../../mocks/events';
import ModalPortal from '../../../components/feature/ModalPortal';
import { confirmDeleteEvent } from '../../../components/feature/sweetAlert';

const typeConfig = {
  online: { label: 'Online', icon: 'ri-wifi-line', badge: 'bg-kbc-navy/10 text-kbc-navy', headerBg: 'bg-kbc-navy/5', accent: '#1B2A4A' },
  offline: { label: 'Offline', icon: 'ri-building-4-line', badge: 'bg-green-100 text-kbc-green', headerBg: 'bg-green-50', accent: '#107C10' },
};

interface Props {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

export default function EventDetailModal({ event, onClose, onEdit, onDelete }: Props) {
  useEffect(() => {
    if (!event) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [event, onClose]);

  if (!event) return null;

  const handleDelete = async () => {
    const confirmed = await confirmDeleteEvent(event.title);
    if (!confirmed) return;
    onDelete(event.id);
    onClose();
  };

  const tcfg = typeConfig[event.type];
  const leadMedia = event.media?.[0];
  const leadImage = leadMedia?.kind === 'image' ? leadMedia.url : event.image;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="modal-backdrop absolute inset-0 bg-black/55" />

        <div
          data-modal-surface
          className="modal-surface relative bg-white rounded-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {leadImage ? (
            <div className="relative w-full h-52">
              <img src={leadImage} alt={event.title} className="w-full h-full object-cover object-top" />
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
          ) : leadMedia?.kind === 'video' ? (
            <div className="relative w-full h-52 bg-slate-950">
              <video
                src={leadMedia.url}
                className="w-full h-full object-cover object-top"
                controls
                playsInline
              />
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-white/90 rounded-full cursor-pointer hover:bg-white transition-colors"
              >
                <i className="ri-close-line text-kbc-navy text-base" />
              </button>
              <div className="absolute bottom-5 left-4">
                <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-kbc-navy whitespace-nowrap">
                  <i className="ri-video-line text-xs" />
                  Event video
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
              {!leadMedia && !event.image && (
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
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{event.department}</span>
            </div>

            {event.description && (
              <div className="mb-5">
                <h3 className="text-xs font-bold text-kbc-navy uppercase tracking-wide mb-2">About This Event</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{event.description}</p>
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
                    <p className="text-xs text-gray-400 font-medium">Location</p>
                    <p className="text-sm font-semibold text-kbc-navy">{event.location}</p>
                  </div>
                </div>
              )}

              {event.registrationLink && (
                <div className="flex items-start gap-3 sm:col-span-2">
                  <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shrink-0">
                    <i className="ri-link text-kbc-navy text-sm" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-medium">Registration Link</p>
                    <a
                      href={event.registrationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-kbc-navy hover:text-kbc-navy-light hover:underline break-all"
                    >
                      {event.registrationLink}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-gray-100">
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2.5 text-xs font-bold text-kbc-red hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                <i className="ri-delete-bin-line text-sm" />
                Delete Event
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="text-xs font-semibold text-gray-500 hover:text-kbc-navy cursor-pointer whitespace-nowrap transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => onEdit(event)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-xs font-bold text-kbc-navy hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <i className="ri-pencil-line text-sm" />
                  Edit Event
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
