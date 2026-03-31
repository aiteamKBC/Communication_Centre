import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import { cohorts, sessions, programmeComponents } from '../../mocks/training';

const statusConfig = {
  active: { label: 'Active', badge: 'bg-green-100 text-kbc-green', dot: 'bg-kbc-green' },
  upcoming: { label: 'Upcoming', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-kbc-amber' },
  completed: { label: 'Completed', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
};

const sessionTypeConfig = {
  induction: { label: 'Induction', badge: 'bg-kbc-navy/10 text-kbc-navy', icon: 'ri-information-line' },
  'live-session': { label: 'Live Session', badge: 'bg-green-100 text-kbc-green', icon: 'ri-video-line' },
  workshop: { label: 'Workshop', badge: 'bg-kbc-amber/20 text-yellow-800', icon: 'ri-tools-line' },
  assessment: { label: 'Assessment', badge: 'bg-red-100 text-kbc-red', icon: 'ri-award-line' },
  review: { label: 'Progress Review', badge: 'bg-kbc-amber/20 text-yellow-800', icon: 'ri-user-star-line' },
};

const deliveryConfig = {
  online: { label: 'Online', icon: 'ri-wifi-line', color: 'text-kbc-green' },
  'in-person': { label: 'In-Person', icon: 'ri-building-line', color: 'text-kbc-navy' },
  hybrid: { label: 'Hybrid', icon: 'ri-computer-line', color: 'text-kbc-amber' },
};

const sessionStatusConfig = {
  scheduled: { label: 'Scheduled', badge: 'bg-kbc-navy/10 text-kbc-navy' },
  completed: { label: 'Completed', badge: 'bg-green-50 text-kbc-green' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-50 text-kbc-red' },
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

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">

        {/* Stats Strip */}
        <div className="mb-5 flex flex-wrap gap-3">
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
        <section className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-kbc-navy">Cohort Calendar</h2>
              <p className="text-xs text-gray-400 mt-0.5">Select a cohort to view its session schedule and progress</p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cohorts.map(cohort => {
              const scfg = statusConfig[cohort.status];
              const isSelected = cohort.id === activeCohort;
              return (
                <button
                  key={cohort.id}
                  onClick={() => setActiveCohort(cohort.id)}
                  className={`cursor-pointer rounded-xl border-2 bg-white p-3.5 text-left transition-all ${isSelected ? 'border-kbc-navy' : 'border-gray-100 hover:border-gray-300'}`}
                >
                  <div className="mb-2.5 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-kbc-navy leading-snug">{cohort.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{cohort.programme}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${scfg.badge}`}>{scfg.label}</span>
                  </div>
                  <div className="mb-2.5 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400">Start</p>
                      <p className="font-semibold text-kbc-navy">{cohort.startDate}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">End</p>
                      <p className="font-semibold text-kbc-navy">{cohort.endDate}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Learners</p>
                      <p className="font-semibold text-kbc-navy">{cohort.learnerCount}</p>
                    </div>
                  </div>
                  {cohort.status !== 'upcoming' && (
                    <div>
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
                    <div className="mt-2.5 flex items-center gap-1 border-t border-kbc-navy/10 pt-2 text-kbc-navy">
                      <i className="ri-arrow-down-s-line text-xs" />
                      <span className="text-xs font-semibold">Viewing sessions below</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Cohort Details + Sessions */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-bold text-kbc-navy">{selectedCohort.name} — Session Schedule</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selectedCohort.programme} &middot; {selectedCohort.deliveryMode} delivery</p>
              </div>
              <div className="flex w-fit items-center gap-1 rounded-full bg-gray-100 px-1 py-1">
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
              <div className="flex flex-col gap-2.5">
                {filteredSessions.map(session => {
                  const stcfg = sessionTypeConfig[session.type];
                  const dcfg = deliveryConfig[session.deliveryMode];
                  const sscfg = sessionStatusConfig[session.status];
                  return (
                    <div key={session.id} className="rounded-xl border border-gray-100 p-3.5">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${stcfg.badge} whitespace-nowrap`}>
                          <i className={`${stcfg.icon} text-xs`} />
                          {stcfg.label}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sscfg.badge} whitespace-nowrap`}>{sscfg.label}</span>
                      </div>
                      <h4 className="mb-1 text-sm font-bold text-kbc-navy">{session.title}</h4>
                      <p className="mb-2 text-xs text-gray-500">{session.description}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><i className="ri-calendar-line text-gray-400" />{session.date}</span>
                        <span className="flex items-center gap-1"><i className="ri-time-line text-gray-400" />{session.time}</span>
                        <span className={`flex items-center gap-1 ${dcfg.color}`}><i className={dcfg.icon} />{dcfg.label}</span>
                        <span className="flex items-center gap-1"><i className="ri-map-pin-line text-gray-400" />{session.location}</span>
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
          <div className="mb-4">
            <h2 className="text-base font-bold text-kbc-navy">Programme Components</h2>
            <p className="text-xs text-gray-400 mt-0.5">The building blocks that make up every KBC apprenticeship and training programme</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {programmeComponents.map(comp => (
              <div key={comp.id} className="rounded-xl border border-gray-100 bg-white p-3.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${comp.color}15` }}
                >
                  <i className={`${comp.icon} text-lg`} style={{ color: comp.color }} />
                </div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-xs font-bold text-kbc-navy leading-snug">{comp.title}</h3>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mb-3">{comp.description}</p>
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{comp.type}</span>
                  <span className="text-gray-500 font-medium">{comp.duration}</span>
                </div>
                <div className="pt-3 border-t border-gray-50">
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
