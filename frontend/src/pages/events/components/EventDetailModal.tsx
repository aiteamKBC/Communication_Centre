import { useEffect, useState } from 'react';
import { CalendarEvent, EventMedia } from '../../../mocks/events';

const typeConfig: Record<CalendarEvent['type'], { label: string; icon: string; badge: string; headerBg: string; accent: string }> = {
  online: { label: 'Online', icon: 'ri-wifi-line', badge: 'bg-green-100 text-kbc-green', headerBg: 'bg-green-50', accent: '#107C10' },
  offline: { label: 'Offline', icon: 'ri-map-pin-line', badge: 'bg-kbc-navy/10 text-kbc-navy', headerBg: 'bg-kbc-navy/5', accent: '#1B2A4A' },
};

interface Props {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (id: string) => void;
  canManage?: boolean;
}

function getEventCover(event: CalendarEvent) {
  if (event.media?.length) {
    const flagged = event.media.find(m => m.isCover);
    if (flagged) return flagged;
    if (event.image) return event.media.find(m => m.url === event.image) ?? null;
  }
  return event.image
    ? { id: 'legacy-cover', kind: 'image' as const, url: event.image, name: event.title }
    : null;
}

function getGalleryMedia(event: CalendarEvent) {
  if (!event.media?.length) return [];
  return event.media.filter(m => !m.isCover);
}

export default function EventDetailModal({ event, onClose, onEdit, onDelete, canManage }: Props) {
  const [lightbox, setLightbox] = useState<{ items: EventMedia[]; index: number } | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);

  useEffect(() => {
    if (!event) return;
    setCarouselIdx(0);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [event]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(prev => prev && prev.index < prev.items.length - 1 ? { ...prev, index: prev.index + 1 } : prev);
      if (e.key === 'ArrowLeft')  setLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  if (!event) return null;

  const tcfg = typeConfig[event.type];
  const coverMedia = getEventCover(event);
  const galleryMedia = getGalleryMedia(event);

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" />

      <div
        className="relative bg-white rounded-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {coverMedia ? (
          <div className="relative w-full bg-black">
            {coverMedia.kind === 'video' ? (
              <video
                src={coverMedia.url}
                className="w-full max-h-[60vh] object-contain"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img src={coverMedia.url} alt={event.title} className="w-full max-h-[60vh] object-contain" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
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
              <p className="whitespace-pre-wrap text-sm text-gray-600 leading-relaxed">{event.description}</p>
            </div>
          )}

          {galleryMedia.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-kbc-navy uppercase tracking-wide mb-3">Event Media</h3>

              {/* Main carousel slide */}
              <div
                className="relative w-full rounded-xl overflow-hidden bg-black cursor-pointer group"
                onClick={() => setLightbox({ items: galleryMedia, index: carouselIdx })}
              >
                {galleryMedia[carouselIdx].kind === 'video' ? (
                  <video src={galleryMedia[carouselIdx].url} className="w-full max-h-[70vh] object-contain" playsInline />
                ) : (
                  <img src={galleryMedia[carouselIdx].url} alt={galleryMedia[carouselIdx].name} className="w-full max-h-[70vh] object-contain" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <i className="ri-zoom-in-line text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>

                {/* Prev button */}
                {carouselIdx > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setCarouselIdx(i => i - 1); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
                  >
                    <i className="ri-arrow-left-s-line text-lg" />
                  </button>
                )}

                {/* Next button */}
                {carouselIdx < galleryMedia.length - 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); setCarouselIdx(i => i + 1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
                  >
                    <i className="ri-arrow-right-s-line text-lg" />
                  </button>
                )}

                {/* Counter badge */}
                <div className="absolute bottom-2 right-3 bg-black/50 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  {carouselIdx + 1} / {galleryMedia.length}
                </div>
              </div>

              {/* Thumbnail strip */}
              {galleryMedia.length > 1 && (
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                  {galleryMedia.map((item, idx) => (
                    <button
                      key={item.id}
                      onClick={() => setCarouselIdx(idx)}
                      className={`relative shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${idx === carouselIdx ? 'border-kbc-navy' : 'border-transparent opacity-60 hover:opacity-90'}`}
                    >
                      {item.kind === 'video' ? (
                        <video src={item.url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.url} alt={item.name} className="w-full h-full object-cover object-top" />
                      )}
                    </button>
                  ))}
                </div>
              )}
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
            <div className="flex items-center gap-2">
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
              {canManage && onEdit && (
                <button
                  onClick={() => { onEdit(event); onClose(); }}
                  className="inline-flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-kbc-navy text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  <i className="ri-edit-line text-sm" />
                  Edit
                </button>
              )}
              {canManage && onDelete && (
                <button
                  onClick={() => { onDelete(event.id); onClose(); }}
                  className="inline-flex items-center gap-1.5 border border-red-100 bg-white hover:bg-red-50 text-red-500 text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  <i className="ri-delete-bin-line text-sm" />
                  Delete
                </button>
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

    {lightbox && <LightboxOverlay lightbox={lightbox} setLightbox={setLightbox} />}
    </>
  );
}

interface LightboxProps {
  lightbox: { items: EventMedia[]; index: number };
  setLightbox: React.Dispatch<React.SetStateAction<{ items: EventMedia[]; index: number } | null>>;
}

function LightboxOverlay({ lightbox, setLightbox }: LightboxProps) {
  const current = lightbox.items[lightbox.index];
  const hasPrev = lightbox.index > 0;
  const hasNext = lightbox.index < lightbox.items.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
      onClick={() => setLightbox(null)}
    >
      <button
        onClick={() => setLightbox(null)}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
      >
        <i className="ri-close-line text-xl" />
      </button>

      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index - 1 } : prev); }}
          className="absolute left-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <i className="ri-arrow-left-s-line text-xl" />
        </button>
      )}

      <div className="max-w-4xl max-h-[85vh] w-full px-16" onClick={e => e.stopPropagation()}>
        {current.kind === 'video' ? (
          <video src={current.url} className="w-full max-h-[85vh] object-contain rounded-xl" controls autoPlay playsInline />
        ) : (
          <img src={current.url} alt={current.name} className="w-full max-h-[85vh] object-contain rounded-xl" />
        )}
        {lightbox.items.length > 1 && (
          <p className="text-center text-white/50 text-xs mt-3">{lightbox.index + 1} / {lightbox.items.length}</p>
        )}
      </div>

      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); setLightbox(prev => prev ? { ...prev, index: prev.index + 1 } : prev); }}
          className="absolute right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <i className="ri-arrow-right-s-line text-xl" />
        </button>
      )}
    </div>
  );
}
