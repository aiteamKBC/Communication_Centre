import { Link } from 'react-router-dom';

const footerLinks = [
  {
    heading: 'Platform',
    links: [
      { label: 'Home', path: '/' },
      { label: 'News & Announcements', path: '/news' },
      { label: 'Internal Dashboard', path: '/dashboard' },
      { label: 'Risk Register', path: '/risk-register' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documents Library', path: '/documents' },
      { label: 'Departments', path: '/departments' },
      { label: 'Events', path: '/events' },
      { label: 'Feedback', path: '/feedback' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'IT Helpdesk', path: '/departments/it' },
      { label: 'HR Queries', path: '/departments/hr' },
      { label: 'Report a Risk', path: '/risk-register' },
      { label: 'Compliance', path: '/departments/compliance' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="site-footer relative overflow-hidden bg-kbc-navy text-white mt-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,193,7,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_22%)]" />
      <div className="pointer-events-none absolute -right-24 top-10 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-44 w-44 rounded-full bg-kbc-amber/10 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-1 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_24px_50px_-34px_rgba(255,255,255,0.28)] backdrop-blur-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 flex items-center justify-center shrink-0 transition-transform duration-500 hover:rotate-3 hover:scale-105">
                <img
                  src="https://public.readdy.ai/ai/img_res/01e44241-379a-48b6-aa59-f959ef3e728e.png"
                  alt="KBC Crest"
                  className="w-10 h-10 object-contain object-center"
                />
              </div>
              <span className="font-semibold text-sm leading-tight">
                Communication<br />Centre
              </span>
            </div>
            <p className="text-white/60 text-xs leading-relaxed mb-4">
              Kent Business College's central internal communication platform. Replacing email dependency with clarity, compliance, and collaboration.
            </p>
            <div className="flex items-center gap-3">
              <div className="group relative w-8 h-8 flex items-center justify-center bg-white/10 rounded-full cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:bg-white/20 hover:shadow-lg">
                <i className="ri-microsoft-line text-sm" />
                <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-kbc-navy opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                  Microsoft Teams
                </span>
              </div>
              <div className="group relative w-8 h-8 flex items-center justify-center bg-white/10 rounded-full cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:bg-white/20 hover:shadow-lg">
                <i className="ri-mail-line text-sm" />
                <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-kbc-navy opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                  Email Support
                </span>
              </div>
              <div className="group relative w-8 h-8 flex items-center justify-center bg-white/10 rounded-full cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:bg-white/20 hover:shadow-lg">
                <i className="ri-phone-line text-sm" />
                <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-kbc-navy opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                  Contact Line
                </span>
              </div>
            </div>
          </div>

          {/* Link Columns */}
          {footerLinks.map((col) => (
            <div
              key={col.heading}
              className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm"
            >
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
                {col.heading}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.path}>
                    <Link
                      to={link.path}
                      className="inline-flex text-white/70 text-xs transition-all duration-300 cursor-pointer hover:translate-x-1 hover:text-kbc-amber"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/40 text-xs">
            &copy; 2026 Kent Business College. Internal use only. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-white/40 text-xs cursor-pointer transition-colors duration-300 hover:text-white/70">Privacy Notice</span>
            <span className="text-white/40 text-xs cursor-pointer transition-colors duration-300 hover:text-white/70">Accessibility</span>
            <span className="text-white/40 text-xs cursor-pointer transition-colors duration-300 hover:text-white/70">Cookie Policy</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

