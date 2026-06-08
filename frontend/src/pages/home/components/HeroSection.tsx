import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { heroNotice } from '../../../mocks/home';
import SafeImage from '../../../components/feature/SafeImage';
import { useSharedEvents } from '../../../hooks/useSharedEvents';
import { parseCalendarEventDate, CalendarEvent } from '../../../mocks/events';

export type UrgentNoticeState = {
  id?: string;
  title: string;
  body: string;
  date?: string;
};

export type LeadershipMessageState = {
  id?: string;
  cardTitle: string;
  authorName: string;
  authorRole: string;
  body: string;
  date?: string;
  coverImageUrl?: string;
  profileImageUrl?: string;
};

function formatNoticeDate(value?: string) {
  if (!value) {
    return '';
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function HeroSection({
  initialUrgentNotice,
  initialLeadershipMessage,
}: {
  initialUrgentNotice?: UrgentNoticeState | null;
  initialLeadershipMessage?: LeadershipMessageState | null;
}) {
  const [leadershipOpen, setLeadershipOpen] = useState(false);
  const [urgentNotice, setUrgentNotice] = useState<UrgentNoticeState | null>(initialUrgentNotice ?? null);
  const [leadershipMessage, setLeadershipMessage] = useState<LeadershipMessageState | null>(initialLeadershipMessage ?? null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { events } = useSharedEvents();
  const today = useMemo(() => new Date(), []);
  const upcomingEvents = useMemo(() => {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return events
      .filter(e => parseCalendarEventDate(e) >= todayStart)
      .slice(0, 3);
  }, [events, today]);

  useEffect(() => {
    if (initialUrgentNotice !== undefined) {
      setUrgentNotice(initialUrgentNotice);
      return;
    }

    void (async () => {
      try {
        const response = await fetch('/api/urgent-notice/');
        if (!response.ok) {
          return;
        }

        const payload = await response.json() as Partial<UrgentNoticeState>;
        if (!payload?.title || !payload?.body) {
          return;
        }

        setUrgentNotice({
          id: payload.id,
          title: payload.title,
          body: payload.body,
          date: payload.date,
        });
      } catch {
      }
    })();
  }, [initialUrgentNotice]);

  useEffect(() => {
    if (initialLeadershipMessage !== undefined) {
      setLeadershipMessage(initialLeadershipMessage);
      return;
    }

    void (async () => {
      try {
        const response = await fetch('/api/leadership-message/');
        if (!response.ok) {
          return;
        }

        const payload = await response.json() as Partial<LeadershipMessageState>;
        if (!payload?.cardTitle || !payload?.body) {
          return;
        }

        setLeadershipMessage({
          id: payload.id,
          cardTitle: payload.cardTitle,
          authorName: payload.authorName || 'Prof. David Kingsley',
          authorRole: payload.authorRole || 'Principal & CEO, Kent Business College',
          body: payload.body,
          date: payload.date,
          coverImageUrl: payload.coverImageUrl || '',
          profileImageUrl: payload.profileImageUrl || '',
        });
      } catch {
      }
    })();
  }, [initialLeadershipMessage]);

  // Flat list of all cards — 3 fixed + upcoming events
  const allCards = useMemo(() => {
    const eventCards = upcomingEvents.map((event: CalendarEvent) => ({ kind: 'event' as const, event }));
    return [
      { kind: 'urgent' as const },
      { kind: 'leadership' as const },
      { kind: 'campaign' as const },
      ...eventCards,
    ];
  }, [upcomingEvents]);

  const total = allCards.length;

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || total <= 3) return;
    initializedRef.current = true;
    setSlideIdx(total);
  }, [total]);

  useEffect(() => {
    if (total <= 0) return;
    setSlideIdx(current => {
      if (total <= 3) {
        return Math.min(current, Math.max(0, total - 1));
      }
      const normalized = ((current % total) + total) % total;
      const next = total + normalized;
      return current === next ? current : next;
    });
  }, [total]);

  const activeIndex = total > 0 ? ((slideIdx % total) + total) % total : 0;
  const trackRef = useRef<HTMLDivElement>(null);
  const containerDivRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  const isTransitioning = useRef(false);
  const [noTransition, setNoTransition] = useState(false);

  const normalizeTrackPosition = useCallback((current: number) => {
    if (total <= 3) {
      return Math.min(current, Math.max(0, total - 1));
    }

    const normalized = ((current % total) + total) % total;
    return total + normalized;
  }, [total]);

  useEffect(() => {
    const el = containerDivRef.current;
    if (!el) return;
    setContainerW(el.offsetWidth);
    const ro = new ResizeObserver(() => setContainerW(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (paused || total <= 3) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    autoPlayRef.current = setInterval(() => {
      setSlideIdx(prev => prev + 1);
    }, 4000);
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current); };
  }, [paused, total]);

  useEffect(() => {
    if (total <= 3) return;
    const track = trackRef.current;
    if (!track) return;

    const settleTrackPosition = () => {
      isTransitioning.current = false;
      setSlideIdx(prev => {
        const next = normalizeTrackPosition(prev);
        if (next === prev) return prev;
        setNoTransition(true);
        return next;
      });
    };

    const onEnd = () => {
      window.clearTimeout(fallbackTimer);
      settleTrackPosition();
    };

    const fallbackTimer = window.setTimeout(settleTrackPosition, 700);
    track.addEventListener('transitionend', onEnd, { once: true });
    return () => {
      window.clearTimeout(fallbackTimer);
      track.removeEventListener('transitionend', onEnd);
    };
  }, [slideIdx, total, normalizeTrackPosition]);

  useEffect(() => {
    if (total <= 3) return;

    const recoverHeroTrack = () => {
      if (document.visibilityState === 'hidden') {
        if (autoPlayRef.current) {
          clearInterval(autoPlayRef.current);
          autoPlayRef.current = null;
        }
        return;
      }

      isTransitioning.current = false;
      const el = containerDivRef.current;
      if (el) {
        setContainerW(el.offsetWidth);
      }
      setNoTransition(true);
      setSlideIdx(prev => normalizeTrackPosition(prev));
    };

    document.addEventListener('visibilitychange', recoverHeroTrack);
    window.addEventListener('focus', recoverHeroTrack);
    return () => {
      document.removeEventListener('visibilitychange', recoverHeroTrack);
      window.removeEventListener('focus', recoverHeroTrack);
    };
  }, [total, normalizeTrackPosition]);

  useEffect(() => {
    if (!noTransition) return;
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setNoTransition(false));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [noTransition]);

  const goTo = (delta: number) => {
    if (delta === 0) return;
    if (isTransitioning.current) return;
    isTransitioning.current = true;
    setSlideIdx(prev => prev + delta);
    setPaused(true);
    setTimeout(() => setPaused(false), 8000);
  };

  const leadershipParagraphs = useMemo(
    () => leadershipMessage?.body
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean) ?? [],
    [leadershipMessage],
  );

  return (
    <>
      <section
        className="w-full px-4 md:px-6 py-4"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative">
          {/* Left arrow */}
          {total > 3 && (
            <button
              onClick={() => goTo(-1)}
              className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50 shadow-sm rounded-full text-kbc-navy transition-colors"
            >
              <i className="ri-arrow-left-s-line text-base" />
            </button>
          )}

          {/* Right arrow */}
          {total > 3 && (
            <button
              onClick={() => goTo(1)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50 shadow-sm rounded-full text-kbc-navy transition-colors"
            >
              <i className="ri-arrow-right-s-line text-base" />
            </button>
          )}

          <div
            ref={(el) => {
              containerDivRef.current = el;
              if (el) setContainerW(el.offsetWidth);
            }}
            className="overflow-hidden"
          >
            <div
              ref={trackRef}
              className="flex gap-3"
              style={{
                transform: `translateX(calc(${slideIdx} * ${-(containerW / 3 + 4)}px))`,
                transition: noTransition ? 'none' : 'transform 500ms ease-in-out',
              }}
            >
              {[0, 1, 2].flatMap(copy => allCards.map((card) => {
                const key = `${copy}-${card.kind === 'event' ? card.event.id : card.kind}`;
                const cardW = containerW ? Math.floor((containerW - 24) / 3) : 0;
                const cardClass = `flex-none min-h-[200px]`;
                const cardStyle = { width: cardW || undefined };

                if (card.kind === 'urgent') return (
                  <div key={key} style={cardStyle} className={`${cardClass} bg-kbc-red rounded-lg p-5 flex flex-col justify-between`}>
                    <div>
                      <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-widest mb-3">
                        <i className="ri-alarm-warning-line text-xs" />{heroNotice.badge}
                      </span>
                      {urgentNotice ? (
                        <>
                          <p className="text-white font-bold text-sm leading-snug mb-2">{urgentNotice.title}</p>
                          {urgentNotice.date && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{formatNoticeDate(urgentNotice.date)}</p>}
                          <p className="text-white/80 text-xs leading-relaxed">{urgentNotice.body}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-white font-bold text-sm leading-snug mb-2">No urgent notices published</p>
                          <p className="text-white/80 text-xs leading-relaxed">Add a manual urgent notice to show important deadlines, alerts, or time-sensitive instructions on the home page.</p>
                        </>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {urgentNotice ? (
                        <Link to={urgentNotice.id ? `/urgent-notice/new?edit=${urgentNotice.id}` : '/urgent-notice/new'} className="inline-flex items-center gap-1.5 border border-white/30 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors">
                          Edit <i className="ri-edit-line text-sm" />
                        </Link>
                      ) : (
                        <Link to="/urgent-notice/new" className="inline-flex items-center gap-1.5 border border-white/30 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors">
                          Add Urgent Notice <i className="ri-add-line text-sm" />
                        </Link>
                      )}
                    </div>
                  </div>
                );

                if (card.kind === 'leadership') return (
                  <div
                    key={key}
                    style={cardStyle}
                    className={`${cardClass} relative rounded-lg overflow-hidden group ${leadershipMessage ? 'cursor-pointer' : ''}`}
                    onClick={() => leadershipMessage && setLeadershipOpen(true)}
                  >
                    <SafeImage
                      src={leadershipMessage?.coverImageUrl}
                      alt="Message from Principal"
                      className="absolute inset-0 w-full h-full object-contain bg-slate-100 group-hover:scale-105 transition-transform duration-500"
                      fallback={<div className="absolute inset-0 bg-[linear-gradient(135deg,#1e3a8a_0%,#0f172a_55%,#1e293b_100%)]" aria-hidden="true" />}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-kbc-navy/90 via-kbc-navy/40 to-black/20" />
                    <div className="relative z-10 p-5 h-full flex flex-col justify-end min-h-[200px]">
                      <p className="text-white/80 text-xs font-medium mb-1 uppercase tracking-wide">Message from the Principal</p>
                      {leadershipMessage ? (
                        <>
                          <h3 className="text-white font-bold text-base leading-snug">{leadershipMessage.cardTitle}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{leadershipMessage.authorName}</span>
                            {leadershipMessage.date && <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">{formatNoticeDate(leadershipMessage.date)}</span>}
                          </div>
                          <p className="text-white/70 text-xs mt-2">Click to read the full message</p>
                          <div className="mt-4 flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                            <button type="button" onClick={() => setLeadershipOpen(true)} className="inline-flex items-center gap-1.5 border border-white/50 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors">
                              Read Message <i className="ri-arrow-right-s-line text-sm" />
                            </button>
                            <Link to={leadershipMessage.id ? `/leadership-message/new?edit=${leadershipMessage.id}` : '/leadership-message/new'} className="inline-flex items-center gap-1.5 border border-white/25 bg-white/5 hover:bg-white/15 text-white text-xs font-semibold px-4 py-2 rounded transition-colors">
                              Edit <i className="ri-edit-line text-sm" />
                            </Link>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-white font-bold text-base leading-snug">No CEO message published</h3>
                          <p className="text-white/70 text-xs mt-1">Add a manual leadership message to activate this panel.</p>
                          <div className="mt-4" onClick={e => e.stopPropagation()}>
                            <Link to="/leadership-message/new" className="inline-flex items-center gap-1.5 border border-white/40 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors">
                              Add CEO Message <i className="ri-add-line text-sm" />
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );

                if (card.kind === 'campaign') return (
                  <div key={key} style={cardStyle} className={`${cardClass} relative rounded-lg overflow-hidden`}>
                    <SafeImage
                      src="https://readdy.ai/api/search-image?query=spring%20learning%20campaign%20education%20college%20background%2C%20light%20blue%20and%20white%20tones%2C%20graduation%20mortarboard%20cap%20and%20flowers%20on%20clean%20minimal%20desk%2C%20academic%20achievement%20symbols%2C%20fresh%20bright%20professional%20educational%20setting&width=600&height=340&seq=hero-campaign-panel&orientation=landscape"
                      alt="Spring Learning Campaign"
                      className="absolute inset-0 w-full h-full object-cover object-top"
                      fallback={<div className="absolute inset-0 bg-[linear-gradient(135deg,#e0f2fe_0%,#ffffff_45%,#dbeafe_100%)]" aria-hidden="true" />}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-kbc-navy/80 via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-kbc-navy/25" />
                    <div className="relative z-10 p-5 h-full flex flex-col justify-between min-h-[200px]">
                      <div>
                        <span className="inline-flex items-center gap-1.5 bg-kbc-amber/90 text-kbc-navy text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-widest mb-3">
                          <i className="ri-seedling-line text-xs" /> Spring Campaign
                        </span>
                        <h3 className="text-white font-bold text-base leading-snug drop-shadow-sm">Spring Learning Campaign</h3>
                        <p className="text-white/80 text-xs mt-1">New Workshops &amp; Courses</p>
                      </div>
                      <Link to="/training-plan" className="inline-flex items-center gap-1.5 border border-white/60 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors w-fit">
                        Learn More <i className="ri-arrow-right-s-line text-sm" />
                      </Link>
                    </div>
                  </div>
                );

                if (card.kind === 'event') {
                  const ev = card.event;
                  const coverUrl = ev.media?.find(m => m.isCover)?.url ?? ev.image;
                  const iconMap: Record<string, string> = { online: 'ri-wifi-line', offline: 'ri-map-pin-line' };
                  return (
                    <div key={key} style={cardStyle} className={`${cardClass} relative rounded-lg overflow-hidden`}>
                      {coverUrl
                        ? (
                          <SafeImage
                            src={coverUrl}
                            alt={ev.title}
                            className="absolute inset-0 w-full h-full object-cover object-top"
                            fallback={<div className="absolute inset-0 bg-gradient-to-br from-kbc-navy to-kbc-navy/80" aria-hidden="true" />}
                          />
                        )
                        : <div className="absolute inset-0 bg-gradient-to-br from-kbc-navy to-kbc-navy/80" />
                      }
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      <div className="relative z-10 p-5 h-full flex flex-col justify-end min-h-[200px]">
                        <span className="inline-flex items-center gap-1.5 bg-kbc-amber/90 text-kbc-navy text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-widest mb-2 w-fit">
                          <i className="ri-calendar-event-line text-xs" /> Upcoming Event
                        </span>
                        <h3 className="text-white font-bold text-sm leading-snug mb-1 line-clamp-2">{ev.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="flex items-center gap-1 text-white/70 text-xs"><i className="ri-calendar-line text-xs" /> {ev.date}</span>
                          {ev.time && <span className="flex items-center gap-1 text-white/70 text-xs"><i className="ri-time-line text-xs" /> {ev.time}</span>}
                          <span className="flex items-center gap-1 text-white/70 text-xs">
                            <i className={`${iconMap[ev.type] ?? 'ri-map-pin-line'} text-xs`} />{ev.type === 'online' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <Link to="/events" className="inline-flex items-center gap-1.5 border border-white/50 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors w-fit">
                          View Event <i className="ri-arrow-right-s-line text-sm" />
                        </Link>
                      </div>
                    </div>
                  );
                }

                return null;
              }))}
            </div>
          </div>

          {/* Dot indicators - show position within the real card set */}
          {total > 3 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {allCards.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { const delta = i - activeIndex; goTo(delta === 0 ? 0 : delta); }}
                  className={`rounded-full transition-all ${i === activeIndex ? 'w-5 h-2 bg-kbc-navy' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {leadershipOpen && leadershipMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="modal-backdrop" />
          <div
            className="relative bg-white rounded-xl max-w-lg w-full p-7 shadow-2xl"
            style={{ animation: 'fadeScaleIn 150ms ease' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-5">
              <SafeImage
                src={leadershipMessage.profileImageUrl}
                alt="Principal"
                className="w-16 h-16 rounded-full object-cover object-top border-2 border-kbc-navy shrink-0"
                fallback={(
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-kbc-navy bg-slate-100 text-kbc-navy" aria-hidden="true">
                    <i className="ri-user-3-line text-2xl" />
                  </div>
                )}
              />
              <div className="flex-1">
                <h3 className="font-bold text-kbc-navy text-base">{leadershipMessage.authorName}</h3>
                <p className="text-gray-500 text-xs">{leadershipMessage.authorRole}</p>
                <p className="text-gray-400 text-xs mt-0.5">{formatNoticeDate(leadershipMessage.date)}</p>
              </div>
              <button
                onClick={() => setLeadershipOpen(false)}
                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-kbc-navy hover:bg-gray-100 rounded cursor-pointer transition-colors"
              >
                <i className="ri-close-line text-base" />
              </button>
            </div>
            {leadershipParagraphs.map((paragraph, index) => (
              <p
                key={`${leadershipMessage.id || 'leadership'}-${index}`}
                className={`text-gray-700 text-sm leading-relaxed ${index === leadershipParagraphs.length - 1 ? 'mb-5' : 'mb-3'}`}
              >
                {paragraph}
              </p>
            ))}
            <button
              onClick={() => setLeadershipOpen(false)}
              className="w-full bg-kbc-navy text-white font-semibold text-sm py-2.5 rounded cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
