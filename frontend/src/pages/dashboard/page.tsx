import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';

type DashboardLink = {
  title: string;
  url?: string;
  description: string;
  label: string;
  icon: string;
  accent: string;
  soft: string;
  text: string;
  comingSoon?: boolean;
};

const dashboardLinks = [
  {
    title: 'Tutor Dashboard',
    url: 'https://tutordashboard.kentbusinesscollege.net/',
    description: 'Teaching delivery, attendance follow-up, and learner-facing academic actions.',
    label: 'Academic Delivery',
    icon: 'ri-user-star-line',
    accent: 'from-[#7c4dff] to-[#5b2dbf]',
    soft: 'bg-[#f1eaff]',
    text: 'text-[#6b3fd1]',
  },
  {
    title: 'MCR Dashboard',
    url: 'https://mcr.kentbusinesscollege.net/mcr/dashboard',
    description: 'Module completion, reporting checkpoints, and curriculum review operations.',
    label: 'Curriculum Review',
    icon: 'ri-file-chart-line',
    accent: 'from-[#8b5cf6] to-[#6d47ff]',
    soft: 'bg-[#f3efff]',
    text: 'text-[#6d47ff]',
  },
  {
    title: 'Coaches Dashboard',
    url: 'https://admin.kentbusinesscollege.net/',
    description: 'Operational controls, system-wide administration, and service coordination.',
    label: 'Operations Control',
    icon: 'ri-settings-3-line',
    accent: 'from-[#39206d] to-[#24164f]',
    soft: 'bg-[#efe8ff]',
    text: 'text-[#39206d]',
  },
  {
    title: 'Employer Dashboard',
    url: 'https://employer.kentbusinesscollege.net/',
    description: 'Employer partnerships, placement visibility, and apprenticeship engagement.',
    label: 'Partnerships',
    icon: 'ri-briefcase-4-line',
    accent: 'from-[#10b981] to-[#22c1c3]',
    soft: 'bg-[#e9fbf7]',
    text: 'text-[#138f82]',
  },
  {
    title: 'Engagement Dashboard',
    url: 'https://superadmin.kentbusinesscollege.net/',
    description: 'Platform governance, permissions, cross-system access, and elevated controls.',
    label: 'Platform Governance',
    icon: 'ri-shield-keyhole-line',
    accent: 'from-[#5b1a8e] to-[#3b0b63]',
    soft: 'bg-[#efe3ff]',
    text: 'text-[#5b1a8e]',
  },
  {
    title: 'Progress Review Dashboard',
    url: 'https://pr.kentbusinesscollege.net/',
    description: 'Communications planning, public relations activity, and campaign coordination.',
    label: 'Communications',
    icon: 'ri-megaphone-line',
    accent: 'from-[#17a2c6] to-[#0f7ea8]',
    soft: 'bg-[#ecfbff]',
    text: 'text-[#178aac]',
  },
  {
    title: 'Performance Dashboard',
    url: 'https://performancedashboard.kentbusinesscollege.net/',
    description: 'KPI monitoring, institutional progress tracking, and performance oversight.',
    label: 'Performance Insight',
    icon: 'ri-line-chart-line',
    accent: 'from-[#6d36b3] to-[#8e5ed8]',
    soft: 'bg-[#f1eaff]',
    text: 'text-[#6d36b3]',
  },
  {
    title: 'Ofsted Command Centre',
    url: '',
    description: 'Inspection readiness, evidence tracking, quality themes, and strategic oversight.',
    label: 'Inspection Readiness',
    icon: 'ri-shield-star-line',
    accent: 'from-[#d4a546] to-[#8b5e18]',
    soft: 'bg-[#fff6e3]',
    text: 'text-[#9a6a1d]',
    comingSoon: true,
  },
  {
    title: 'HR Compliance System',
    url: '',
    description: 'Policy compliance, HR governance checkpoints, audit readiness, and people-process oversight.',
    label: 'HR Compliance',
    icon: 'ri-file-shield-line',
    accent: 'from-[#ec4899] to-[#be185d]',
    soft: 'bg-[#fff1f7]',
    text: 'text-[#be185d]',
    comingSoon: true,
  },
] satisfies DashboardLink[];

export default function DashboardPage() {
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
            {dashboardLinks.map(link => {
              const isComingSoon = Boolean(link.comingSoon);
              const cardClassName = `group relative block overflow-hidden rounded-[2rem] border border-[#e6e0f5] bg-[linear-gradient(180deg,#ffffff_0%,#fcfbff_100%)] p-6 shadow-sm transition duration-300 ${
                isComingSoon ? 'cursor-default opacity-95' : 'hover:-translate-y-1 hover:shadow-xl'
              }`;

              const content = (
                <>
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${link.accent}`} />

                <div className={`absolute right-[-38px] top-[-38px] h-28 w-28 rounded-full bg-gradient-to-br ${link.accent} opacity-[0.08] blur-sm transition-transform duration-300 ${isComingSoon ? '' : 'group-hover:scale-110'}`} />

                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-kbc-navy">{link.title}</h2>
                  </div>
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${link.accent} text-white shadow-lg shadow-[#cfc3f5]/50`}>
                    <i className={`${link.icon} text-xl`} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[#efeaf8] pt-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <span className={`inline-flex h-2 w-2 rounded-full ${isComingSoon ? 'bg-[#d4a546]' : 'bg-[#6d47ff]'}`} />
                    {isComingSoon ? 'Coming soon' : 'Ready in new tab'}
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isComingSoon ? 'bg-[#8b5e18]/10 text-[#8b5e18]' : 'bg-[#24164f] text-white transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3'}`}>
                    <i className={`${isComingSoon ? 'ri-time-line' : 'ri-external-link-line'} text-lg`} />
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
