import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import useAccessControl from '../../hooks/useAccessControl';

type DashboardLink = {
  title: string;
  url?: string;
  // In-app route; opened in the same tab instead of an external URL.
  internalPath?: string;
  description: string;
  label: string;
  icon: string;
  accent: string;
  soft: string;
  text: string;
  comingSoon?: boolean;
  expireSoon?: boolean;
  expireMessage?: string;
  adminOnly?: boolean;
  /** Open to call-centre agents; an agent without admin rights sees only these. */
  callCentre?: boolean;
  /** The Engagement Centre itself: only call-centre agents and super admins can use it. */
  engagementCentre?: boolean;
};

const dashboardLinks: DashboardLink[] = [
  {
    title: 'Engagement Centre',
    internalPath: '/dashboard/call-centre',
    description: 'Learner calling desk, Zoom Phone calls and engagement KPIs.',
    label: 'Engagement Centre',
    icon: 'ri-customer-service-2-line',
    accent: 'from-[#1B2A4A] to-[#2E4482]',
    soft: 'bg-[#eef2ff]',
    text: 'text-[#2E4482]',
    callCentre: true,
    engagementCentre: true,
  },
  {
    title: 'Tutor Dashboard',
    url: 'https://tutordashboard.kentbusinesscollege.net/',
    description: 'Teaching delivery, attendance follow-up, and learner-facing academic actions.',
    label: 'Academic Delivery',
    icon: 'ri-graduation-cap-line',
    accent: 'from-[#7c4dff] to-[#4f2fb8]',
    soft: 'bg-[#f1eaff]',
    text: 'text-[#6b3fd1]',
  },
  {
    title: 'Safeguarding & Wellbeing Dashboard',
    url: 'https://admin.kentbusinesscollege.net/',
    description: 'Operational controls, system-wide administration, and service coordination.',
    label: 'Operations Control',
    icon: 'ri-heart-pulse-line',
    accent: 'from-[#39206d] to-[#160f3f]',
    soft: 'bg-[#efe8ff]',
    text: 'text-[#39206d]',
  },
  {
    title: 'Inclusion Dashboard',
    url: 'https://admin.kentbusinesscollege.net/coach-wellbeing?view=inclusion-dashboard',
    description: 'Inclusion monitoring, learner support visibility, and wellbeing coordination.',
    label: 'Inclusion Support',
    icon: 'ri-user-heart-line',
    accent: 'from-[#84cc16] to-[#15803d]',
    soft: 'bg-[#f0fdf4]',
    text: 'text-[#15803d]',
  },
  {
    title: 'Coaching sessions',
    url: 'https://coachingsessions.kentbusinesscollege.net/',
    description: 'New coaching workflow replacing MCR and Progress Review activity.',
    label: 'Coaching Workflow',
    icon: 'ri-discuss-line',
    accent: 'from-[#0ea5e9] to-[#2563eb]',
    soft: 'bg-[#eff6ff]',
    text: 'text-[#2563eb]',
    callCentre: true,
  },
  {
    title: 'Bulk Attendance',
    url: 'https://studentportal.kentbusinesscollege.net/',
    description: 'Bulk learner attendance entry, updates, and attendance workflow access.',
    label: 'Attendance',
    icon: 'ri-calendar-check-line',
    accent: 'from-[#059669] to-[#047857]',
    soft: 'bg-[#ecfdf5]',
    text: 'text-[#047857]',
    adminOnly: true,
    callCentre: true,
  },
  {
    title: 'Engagement Dashboard',
    url: 'https://superadmin.kentbusinesscollege.net/',
    description: 'Platform governance, permissions, cross-system access, and elevated controls.',
    label: 'Platform Governance',
    icon: 'ri-team-line',
    accent: 'from-[#7e22ce] to-[#581c87]',
    soft: 'bg-[#efe3ff]',
    text: 'text-[#5b1a8e]',
  },
  {
    title: 'Technical support portal',
    url: 'https://technicalsupport.kentbusinesscollege.net/',
    description: 'IT support requests, technical issue reporting, and service desk follow-up.',
    label: 'Technical Support',
    icon: 'ri-customer-service-2-line',
    accent: 'from-[#6366f1] to-[#4338ca]',
    soft: 'bg-[#f1eaff]',
    text: 'text-[#6b3fd1]',
  },
  {
    title: 'Performance Dashboard',
    url: 'https://performancedashboard.kentbusinesscollege.net/',
    description: 'KPI monitoring, institutional progress tracking, and performance oversight.',
    label: 'Performance Insight',
    icon: 'ri-line-chart-line',
    accent: 'from-[#8b5cf6] to-[#a855f7]',
    soft: 'bg-[#f1eaff]',
    text: 'text-[#6d36b3]',
    callCentre: true,
  },
  {
    title: 'Quality Management System',
    url: 'https://commandcentre.kentbusinesscollege.net/',
    description: 'Inspection readiness, evidence tracking, quality themes, and strategic oversight.',
    label: 'Inspection Readiness',
    icon: 'ri-award-line',
    accent: 'from-[#d4a546] to-[#8b5e18]',
    soft: 'bg-[#fff6e3]',
    text: 'text-[#9a6a1d]',
  },
  {
    title: 'Library',
    url: 'https://library.kentbusinesscollege.net/',
    description: 'Central learning resources, reference material, and operational document access.',
    label: 'Resource Library',
    icon: 'ri-book-open-line',
    accent: 'from-[#f43f5e] to-[#be123c]',
    soft: 'bg-[#fff1f7]',
    text: 'text-[#be185d]',
  },
  {
    title: 'HR Compliance System',
    url: 'https://hrcompliance.kentbusinesscollege.net/',
    description: 'Policy compliance, HR governance checkpoints, audit readiness, and people-process oversight.',
    label: 'HR Compliance',
    icon: 'ri-file-shield-line',
    accent: 'from-[#db2777] to-[#9d174d]',
    soft: 'bg-[#fff1f7]',
    text: 'text-[#be185d]',
  },
  {
    title: 'Employer Dashboard',
    url: 'https://employer.kentbusinesscollege.net/',
    description: 'Employer partnerships, placement visibility, and apprenticeship engagement.',
    label: 'Partnerships',
    icon: 'ri-briefcase-4-line',
    accent: 'from-[#14b8a6] to-[#0f766e]',
    soft: 'bg-[#e9fbf7]',
    text: 'text-[#138f82]',
  },
];

export default function DashboardPage() {
  const { adminAccess, callCentreAccess, callCentreOnly, superuser } = useAccessControl();
  const visibleDashboardLinks = dashboardLinks.filter(link => {
    if (link.engagementCentre && !callCentreAccess && !superuser) return false;
    if (callCentreOnly) return !!link.callCentre;
    return !link.adminOnly || adminAccess || (!!link.callCentre && callCentreAccess);
  });

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />
      <div className="flex-1">
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
              <a href="/" className="hover:text-kbc-navy cursor-pointer">Home</a>
              <span>/</span>
              <span className="text-kbc-navy font-medium">Internal Dashboard</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
                <i className="ri-dashboard-line text-white text-base" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-kbc-navy">Internal Dashboard</h1>
                <p className="text-gray-500 text-sm mt-0.5">Quick access to your internal service dashboards for tutors, operations, employers, and admin teams.</p>
              </div>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="mb-6 rounded-[2rem] border border-[#e2daf7] bg-[radial-gradient(circle_at_top_left,_rgba(109,71,255,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(23,162,198,0.1),_transparent_28%),linear-gradient(180deg,#ffffff_0%,#f8f7ff_100%)] p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#39206d] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white">
                <i className="ri-dashboard-horizontal-line" />
                Workspace Access
              </span>
              <p className="text-sm text-slate-600">
                Each workspace below is tuned for a different operational role. Open the one that matches the task you need to complete.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDashboardLinks.map(link => {
              const isComingSoon = Boolean(link.comingSoon);
              const isExpiringSoon = Boolean(link.expireSoon);
              const cardClassName = `group relative block overflow-hidden rounded-[1.5rem] border border-[#e6e0f5] bg-[linear-gradient(180deg,#ffffff_0%,#fcfbff_100%)] p-5 shadow-sm transition duration-300 ${
                isComingSoon ? 'cursor-default opacity-95' : 'hover:-translate-y-1 hover:shadow-xl'
              }`;

              const content = (
                <>
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${link.accent}`} />

                <div className={`absolute right-[-34px] top-[-34px] h-24 w-24 rounded-full bg-gradient-to-br ${link.accent} opacity-[0.08] blur-sm transition-transform duration-300 ${isComingSoon ? '' : 'group-hover:scale-110'}`} />

                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-snug text-kbc-navy">{link.title}</h2>
                    {isExpiringSoon && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                          <i className="ri-time-line" />
                          Expire soon
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {link.expireMessage}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${link.accent} text-white shadow-lg shadow-[#cfc3f5]/50`}>
                    <i className={`${link.icon} text-lg`} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[#efeaf8] pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <span className={`inline-flex h-2 w-2 rounded-full ${isComingSoon || isExpiringSoon ? 'bg-[#d4a546]' : 'bg-[#6d47ff]'}`} />
                    {isComingSoon ? 'Coming soon' : isExpiringSoon ? 'Expire soon' : link.internalPath ? 'Open' : 'Ready in new tab'}
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isComingSoon ? 'bg-[#8b5e18]/10 text-[#8b5e18]' : 'bg-[#24164f] text-white transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3'}`}>
                    <i className={`${isComingSoon ? 'ri-time-line' : link.internalPath ? 'ri-arrow-right-line' : 'ri-external-link-line'} text-base`} />
                  </div>
                </div>
                </>
              );

              if (isComingSoon) {
                return (
                  <div key={link.title} className={cardClassName}>
                    {content}
                  </div>
                );
              }

              if (link.internalPath) {
                return (
                  <Link key={link.internalPath} to={link.internalPath} className={cardClassName}>
                    {content}
                  </Link>
                );
              }

              return (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cardClassName}
                >
                  {content}
                </a>
              );
            })}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
