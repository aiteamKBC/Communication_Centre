import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { heroNotice } from '../../../mocks/home';

type UrgentNoticeState = {
  id?: string;
  title: string;
  body: string;
  date?: string;
};

type LeadershipMessageState = {
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

export default function HeroSection() {
  const [leadershipOpen, setLeadershipOpen] = useState(false);
  const [urgentNotice, setUrgentNotice] = useState<UrgentNoticeState | null>(null);
  const [leadershipMessage, setLeadershipMessage] = useState<LeadershipMessageState | null>(null);

  useEffect(() => {
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
        // Leave urgent notice empty if database read fails.
      }
    })();
  }, []);

  useEffect(() => {
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
        // Leave leadership message empty if database read fails.
      }
    })();
  }, []);

  const leadershipParagraphs = useMemo(
    () => leadershipMessage?.body
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean) ?? [],
    [leadershipMessage],
  );

  return (
    <>
      <section className="w-full px-4 md:px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
          <div className="bg-kbc-red rounded-lg p-5 flex flex-col justify-between min-h-[200px]">
            <div>
              <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-widest mb-3">
                <i className="ri-alarm-warning-line text-xs" />
                {heroNotice.badge}
              </span>
              {urgentNotice ? (
                <>
                  <p className="text-white font-bold text-sm leading-snug mb-2">
                    {urgentNotice.title}
                  </p>
                  {urgentNotice.date ? (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                      {formatNoticeDate(urgentNotice.date)}
                    </p>
                  ) : null}
                  <p className="text-white/80 text-xs leading-relaxed">
                    {urgentNotice.body}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white font-bold text-sm leading-snug mb-2">
                    No urgent notices published
                  </p>
                  <p className="text-white/80 text-xs leading-relaxed">
                    Add a manual urgent notice to show important deadlines, alerts, or time-sensitive instructions on the home page.
                  </p>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {urgentNotice ? (
                <Link
                  to={urgentNotice.id ? `/urgent-notice/new?edit=${urgentNotice.id}` : '/urgent-notice/new'}
                  className="inline-flex items-center gap-1.5 border border-white/30 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  Edit
                  <i className="ri-edit-line text-sm" />
                </Link>
              ) : (
                <Link
                  to="/urgent-notice/new"
                  className="inline-flex items-center gap-1.5 border border-white/30 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  Add Urgent Notice
                  <i className="ri-add-line text-sm" />
                </Link>
              )}
            </div>
          </div>

          <div
            className={`relative rounded-lg overflow-hidden min-h-[200px] group ${leadershipMessage ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (leadershipMessage) {
                setLeadershipOpen(true);
              }
            }}
          >
            {leadershipMessage?.coverImageUrl ? (
              <img
                src={leadershipMessage.coverImageUrl}
                alt="Message from Principal"
                className="absolute inset-0 w-full h-full object-contain bg-slate-100 group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#1e3a8a_0%,#0f172a_55%,#1e293b_100%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-kbc-navy/90 via-kbc-navy/40 to-black/20" />
            <div className="relative z-10 p-5 h-full flex flex-col justify-end min-h-[200px]">
              <p className="text-white/80 text-xs font-medium mb-1 uppercase tracking-wide">Message from the Principal</p>
              {leadershipMessage ? (
                <>
                  <h3 className="text-white font-bold text-base leading-snug">
                    {leadershipMessage.cardTitle}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
                      {leadershipMessage.authorName}
                    </span>
                    {leadershipMessage.date ? (
                      <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                        {formatNoticeDate(leadershipMessage.date)}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-white/70 text-xs mt-2">Click to read the full message</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2" onClick={event => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setLeadershipOpen(true)}
                      className="inline-flex items-center gap-1.5 border border-white/50 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors"
                    >
                      Read Message
                      <i className="ri-arrow-right-s-line text-sm" />
                    </button>
                    <Link
                      to={leadershipMessage.id ? `/leadership-message/new?edit=${leadershipMessage.id}` : '/leadership-message/new'}
                      className="inline-flex items-center gap-1.5 border border-white/25 bg-white/5 hover:bg-white/15 text-white text-xs font-semibold px-4 py-2 rounded transition-colors"
                    >
                      Edit
                      <i className="ri-edit-line text-sm" />
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-white font-bold text-base leading-snug">
                    No CEO message published
                  </h3>
                  <p className="text-white/70 text-xs mt-1">Add a manual leadership message to activate this panel.</p>
                  <div className="mt-4" onClick={event => event.stopPropagation()}>
                    <Link
                      to="/leadership-message/new"
                      className="inline-flex items-center gap-1.5 border border-white/40 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors"
                    >
                      Add CEO Message
                      <i className="ri-add-line text-sm" />
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative rounded-lg overflow-hidden min-h-[200px]">
            <img
              src="https://readdy.ai/api/search-image?query=spring%20learning%20campaign%20education%20college%20background%2C%20light%20blue%20and%20white%20tones%2C%20graduation%20mortarboard%20cap%20and%20flowers%20on%20clean%20minimal%20desk%2C%20academic%20achievement%20symbols%2C%20fresh%20bright%20professional%20educational%20setting&width=600&height=340&seq=hero-campaign-panel&orientation=landscape"
              alt="Spring Learning Campaign"
              className="absolute inset-0 w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-kbc-navy/80 via-transparent to-transparent" />
            <div className="absolute top-0 right-0 bottom-0 left-0 bg-kbc-navy/25" />
            <div className="relative z-10 p-5 h-full flex flex-col justify-between min-h-[200px]">
              <div>
                <span className="inline-flex items-center gap-1.5 bg-kbc-amber/90 text-kbc-navy text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-widest mb-3">
                  <i className="ri-seedling-line text-xs" />
                  Spring Campaign
                </span>
                <h3 className="text-white font-bold text-base leading-snug drop-shadow-sm">
                  Spring Learning Campaign
                </h3>
                <p className="text-white/80 text-xs mt-1">New Workshops &amp; Courses</p>
              </div>
              <div>
                <Link
                  to="/training-plan"
                  className="inline-flex items-center gap-1.5 border border-white/60 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  Learn More
                  <i className="ri-arrow-right-s-line text-sm" />
                </Link>
              </div>
            </div>
          </div>
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
              {leadershipMessage.profileImageUrl ? (
                <img
                  src={leadershipMessage.profileImageUrl}
                  alt="Principal"
                  className="w-16 h-16 rounded-full object-cover object-top border-2 border-kbc-navy shrink-0"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-kbc-navy bg-slate-100 text-kbc-navy">
                  <i className="ri-user-3-line text-2xl" />
                </div>
              )}
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
