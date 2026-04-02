import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import { cohorts, sessions, programmeComponents } from '../../mocks/training';

const statusConfig = {
  active: { label: 'Active', badge: 'bg-kbc-green/10 text-kbc-green', dot: 'bg-kbc-green' },
  upcoming: { label: 'Upcoming', badge: 'bg-kbc-amber/15 text-kbc-navy', dot: 'bg-kbc-amber' },
  completed: { label: 'Completed', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
};

const sessionTypeConfig = {
  induction: { label: 'Induction', badge: 'bg-kbc-navy/10 text-kbc-navy', icon: 'ri-information-line' },
  'live-session': { label: 'Live Session', badge: 'bg-kbc-green/10 text-kbc-green', icon: 'ri-video-line' },
  workshop: { label: 'Workshop', badge: 'bg-kbc-amber/15 text-kbc-navy', icon: 'ri-tools-line' },
  assessment: { label: 'Assessment', badge: 'bg-kbc-red/10 text-kbc-red', icon: 'ri-award-line' },
  review: { label: 'Progress Review', badge: 'bg-kbc-amber/15 text-kbc-navy', icon: 'ri-user-star-line' },
};

const deliveryConfig = {
  online: { label: 'Online', icon: 'ri-wifi-line', color: 'text-kbc-green' },
  'in-person': { label: 'In-Person', icon: 'ri-building-line', color: 'text-kbc-navy' },
  hybrid: { label: 'Hybrid', icon: 'ri-computer-line', color: 'text-kbc-amber' },
};

const sessionStatusConfig = {
  scheduled: { label: 'Scheduled', badge: 'bg-kbc-navy/10 text-kbc-navy' },
  completed: { label: 'Completed', badge: 'bg-kbc-green/10 text-kbc-green' },
  cancelled: { label: 'Cancelled', badge: 'bg-kbc-red/10 text-kbc-red' },
};

const cohortSurfaceConfig = {
  active: { tint: 'from-white via-slate-50 to-emerald-50/60', ring: 'border-emerald-100', glow: 'bg-emerald-400/60' },
  upcoming: { tint: 'from-white via-amber-50/60 to-orange-50/80', ring: 'border-amber-100', glow: 'bg-kbc-amber/70' },
  completed: { tint: 'from-white via-slate-50 to-slate-100/90', ring: 'border-slate-200', glow: 'bg-slate-300' },
};

const sessionCardConfig = {
  scheduled: { border: 'border-l-kbc-navy', tint: 'from-white via-slate-50 to-indigo-50/60' },
  completed: { border: 'border-l-kbc-green', tint: 'from-white via-emerald-50/35 to-white' },
  cancelled: { border: 'border-l-kbc-red', tint: 'from-white via-red-50/40 to-white' },
};

export default function TrainingPlanPage() {
  const [activeCohort, setActiveCohort] = useState<string>(cohorts[0].id);
  const [sessionFilter, setSessionFilter] = useState<string>('all');

  const selectedCohort = cohorts.find(c => c.id === activeCohort) ?? cohorts[0];
  const cohortSessions = sessions.filter(s => s.cohortId === activeCohort);
  const filteredSessions = sessionFilter === 'all' ? cohortSessions : cohortSessions.filter(s => s.status === sessionFilter);

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TopNav />

      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <Link to="/" className="hover:text-kbc-navy cursor-pointer">Home</Link>
            <span>/</span>
            <span className="text-kbc-navy font-medium">Training Plan</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
              <i className="ri-calendar-todo-line text-white text-base" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-kbc-navy">Training Plan &amp; Cohort Schedules</h1>
              <p className="text-gray-400 text-xs mt-0.5">Cohort calendars, session schedules, and programme delivery components for all active apprenticeship and training programmes.</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">

        {/* Stats Strip */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <i className="ri-group-line text-kbc-amber text-sm" />
            <span className="text-kbc-navy text-xs font-semibold">{cohorts.filter(c => c.status === 'active').length} Active Cohorts</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <i className="ri-user-line text-kbc-amber text-sm" />
            <span className="text-kbc-navy text-xs font-semibold">{cohorts.filter(c => c.status === 'active').reduce((acc, c) => acc + c.learnerCount, 0)} Active Learners</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <i className="ri-calendar-line text-kbc-amber text-sm" />
            <span className="text-kbc-navy text-xs font-semibold">{sessions.filter(s => s.status === 'scheduled').length} Scheduled Sessions</span>
          </div>
        </div>

        {/* ── Section 1: Cohort Overview Cards ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-kbc-navy">Cohort Calendar</h2>
              <p className="text-xs text-gray-400 mt-0.5">Select a cohort to view its session schedule and progress</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {cohorts.map((cohort, index) => {
              const scfg = statusConfig[cohort.status];
              const isSelected = cohort.id === activeCohort;
              const surface = cohortSurfaceConfig[cohort.status];
              return (
                <button
                  key={cohort.id}
                  onClick={() => setActiveCohort(cohort.id)}
                  className={`animate-soft-card-rise group relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 text-left cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? 'border-kbc-navy shadow-[0_28px_60px_-38px_rgba(27,42,74,0.45)]'
                      : `${surface.ring} hover:-translate-y-1 hover:border-gray-200 hover:shadow-[0_26px_52px_-30px_rgba(15,23,42,0.36)]`
                  } ${surface.tint}`}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className={`absolute inset-x-0 top-0 h-1.5 ${surface.glow} ${isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'} transition-opacity`} />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),transparent_40%,rgba(255,255,255,0.22))] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="absolute inset-y-0 right-0 w-32 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.95),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/75 blur-2xl transition-transform duration-500 group-hover:scale-110" />
                  <div className="relative flex items-start justify-between mb-3 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-kbc-navy leading-snug transition-colors duration-300 group-hover:text-kbc-navy-light">{cohort.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate transition-colors duration-300 group-hover:text-gray-600">{cohort.programme}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${scfg.badge}`}>{scfg.label}</span>
                  </div>
                  <div className="relative grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                      <p className="text-gray-400">Start</p>
                      <p className="font-semibold text-kbc-navy">{cohort.startDate}</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                      <p className="text-gray-400">End</p>
                      <p className="font-semibold text-kbc-navy">{cohort.endDate}</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                      <p className="text-gray-400">Learners</p>
                      <p className="font-semibold text-kbc-navy">{cohort.learnerCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                      <p className="text-gray-400">Delivery</p>
                      <p className="font-semibold capitalize text-kbc-navy">{cohort.deliveryMode}</p>
                    </div>
                  </div>
                  {cohort.status !== 'upcoming' && (
                    <div className="relative rounded-2xl border border-white/70 bg-white/80 px-3 py-3 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Programme Progress</span>
                        <span className="text-xs font-bold text-kbc-navy">{cohort.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${cohort.progress}%`, backgroundColor: cohort.progress === 100 ? '#107C10' : cohort.progress > 50 ? '#F7A800' : '#1B2A4A' }}
                        />
                      </div>
                    </div>
                  )}
                  {isSelected && (
                    <div className="relative mt-3 pt-2 border-t border-kbc-navy/10 flex items-center gap-1 text-kbc-navy">
                      <i className="ri-arrow-down-s-line text-xs" />
                      <span className="text-xs font-semibold">Viewing sessions below</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Cohort Details + Sessions */}
          <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.32)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-sm font-bold text-kbc-navy">{selectedCohort.name} — Session Schedule</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selectedCohort.programme} &middot; {selectedCohort.deliveryMode} delivery</p>
              </div>
              <div className="flex items-center gap-1 px-1 py-1 bg-white border border-slate-200 rounded-full w-fit shadow-[0_10px_24px_-20px_rgba(15,23,42,0.3)]">
                {(['all', 'scheduled', 'completed', 'cancelled'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setSessionFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap transition-all capitalize ${sessionFilter === f ? 'bg-white text-kbc-navy shadow-sm' : 'text-gray-500 hover:text-kbc-navy'}`}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {filteredSessions.length > 0 ? (
              <div className="flex flex-col gap-3">
                {filteredSessions.map((session, index) => {
                  const stcfg = sessionTypeConfig[session.type];
                  const dcfg = deliveryConfig[session.deliveryMode];
                  const sscfg = sessionStatusConfig[session.status];
                  const cardCfg = sessionCardConfig[session.status];
                  return (
                    <div
                      key={session.id}
                      className={`animate-soft-card-rise group relative overflow-hidden rounded-xl border border-l-4 border-gray-100 bg-gradient-to-r p-4 transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 hover:shadow-[0_22px_45px_-28px_rgba(15,23,42,0.32)] ${cardCfg.border} ${cardCfg.tint}`}
                      style={{ animationDelay: `${index * 65}ms` }}
                    >
                      <div className="absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.78),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="relative flex flex-wrap items-center gap-2 mb-2">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${stcfg.badge} whitespace-nowrap`}>
                          <i className={`${stcfg.icon} text-xs`} />
                          {stcfg.label}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sscfg.badge} whitespace-nowrap`}>{sscfg.label}</span>
                      </div>
                      <div className="relative flex gap-4">
                        <div className="hidden sm:flex w-12 h-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/75 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.42)] transition-transform duration-500 group-hover:scale-105">
                          <i className={`${stcfg.icon} text-lg text-kbc-navy`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-kbc-navy mb-1 transition-colors duration-300 group-hover:text-kbc-navy-light">{session.title}</h4>
                          <p className="text-xs text-gray-500 mb-3 leading-relaxed transition-colors duration-300 group-hover:text-gray-600">{session.description}</p>
                          <div className="flex flex-wrap items-center gap-2.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.24)]"><i className="ri-calendar-line text-gray-400" />{session.date}</span>
                            <span className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.24)]"><i className="ri-time-line text-gray-400" />{session.time}</span>
                            <span className={`flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.24)] ${dcfg.color}`}><i className={dcfg.icon} />{dcfg.label}</span>
                            <span className="flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.24)]"><i className="ri-map-pin-line text-gray-400" />{session.location}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <i className="ri-calendar-2-line text-4xl mb-3 block" />
                <p className="text-sm">No sessions found for this filter</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 2: Programme Components ── */}
        <section>
          <div className="mb-5">
            <h2 className="text-base font-bold text-kbc-navy">Programme Components</h2>
            <p className="text-xs text-gray-400 mt-0.5">The building blocks that make up every KBC apprenticeship and training programme</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {programmeComponents.map((comp, index) => (
              <div
                key={comp.id}
                className="animate-soft-card-rise group rounded-xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 hover:shadow-[0_22px_45px_-28px_rgba(15,23,42,0.32)]"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.34)] transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundColor: `${comp.color}15` }}
                >
                  <i className={`${comp.icon} text-lg`} style={{ color: comp.color }} />
                </div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-xs font-bold text-kbc-navy leading-snug transition-colors duration-300 group-hover:text-kbc-navy-light">{comp.title}</h3>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mb-3 transition-colors duration-300 group-hover:text-gray-600">{comp.description}</p>
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-gray-400 bg-slate-100 px-2.5 py-1 rounded-full">{comp.type}</span>
                  <span className="text-gray-500 font-medium">{comp.duration}</span>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-kbc-navy mb-1.5">Key Activities</p>
                  <ul className="flex flex-col gap-1">
                    {comp.activities.map((act, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                        <span className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                        {act}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
