import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';

const dashboardLinks = [
  { title: 'Tutor Dashboard', url: 'https://tutordashboard.kentbusinesscollege.net/' },
  { title: 'MCR Dashboard', url: 'https://mcr.kentbusinesscollege.net/mcr/dashboard' },
  { title: 'Admin Dashboard', url: 'https://admin.kentbusinesscollege.net/' },
  { title: 'Employer Dashboard', url: 'https://employer.kentbusinesscollege.net/' },
  { title: 'Superadmin Dashboard', url: 'https://superadmin.kentbusinesscollege.net/' },
  { title: 'PR Dashboard', url: 'https://pr.kentbusinesscollege.net/' },
  { title: 'Performance Dashboard', url: 'https://performancedashboard.kentbusinesscollege.net/' },
];

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dashboardLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-kbc-amber font-semibold">External</p>
                    <h2 className="mt-2 text-lg font-bold text-kbc-navy">{link.title}</h2>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-kbc-navy text-white">
                    <i className="ri-external-link-line text-lg" />
                  </div>
                </div>
                <p className="text-sm text-gray-500">Open this dashboard in a new tab.</p>
              </a>
            ))}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
