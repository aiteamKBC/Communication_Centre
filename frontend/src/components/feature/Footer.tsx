import { Link } from 'react-router-dom';

const footerLinks = [
  {
    heading: 'Platform',
    links: [
      { label: 'Home', path: '/' },
      { label: 'News & Announcements', path: '/news' },
      { label: 'Internal Dashboard', path: '/dashboard' },
      { label: 'Risk Register', path: '/risk-register' },
      { label: 'Departments', path: '/departments' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Policies & Guides', path: '/documents' },
      { label: 'Training Plan', path: '/training-plan' },
      { label: 'Events', path: '/events' },
      { label: 'Project Hub', path: '/dashboard' },
      { label: 'IT Help', path: '/departments/it' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'Feedback', path: '/feedback' },
      { label: 'Accessibility', path: '/' },
      { label: 'Privacy Notice', path: '/' },
      { label: 'Contact IT', path: '/departments/it' },
      { label: 'Help Centre', path: '/' },
    ],
  },
];

const contactIcons = [
  {
    icon: 'ri-mail-line',
    label: 'Email Us',
    wrapperClassName: 'hover:border-kbc-amber/45 hover:bg-kbc-amber/12 hover:shadow-[0_14px_28px_-16px_rgba(247,168,0,0.6)]',
    iconClassName: 'group-hover:text-kbc-amber group-hover:scale-110',
  },
  {
    icon: 'ri-phone-line',
    label: 'Call Support',
    wrapperClassName: 'hover:border-white/30 hover:bg-white/16 hover:shadow-[0_14px_28px_-16px_rgba(255,255,255,0.45)]',
    iconClassName: 'group-hover:text-white group-hover:scale-110',
  },
  {
    icon: 'ri-microsoft-line',
    label: 'Open Teams',
    wrapperClassName: 'hover:border-sky-300/40 hover:bg-sky-300/10 hover:shadow-[0_14px_28px_-16px_rgba(125,211,252,0.55)]',
    iconClassName: 'group-hover:text-sky-200 group-hover:scale-110 group-hover:rotate-3',
  },
];

interface FooterProps {
  compact?: boolean;
}

export default function Footer({ compact = false }: FooterProps) {
  return (
    <footer
      className={`relative overflow-hidden text-white animate-footer-fade-up ${compact ? 'mt-10' : 'mt-16'}`}
      style={{ background: 'linear-gradient(180deg, #213155 0%, #1B2A4A 45%, #121a2e 100%)' }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="pointer-events-none absolute left-0 top-0 h-56 w-56 rounded-full bg-kbc-amber/10 blur-3xl animate-footer-glow" />
      <div className="pointer-events-none absolute right-0 top-10 h-64 w-64 rounded-full bg-white/5 blur-3xl animate-footer-float" />

      <div className={`relative max-w-7xl mx-auto px-6 ${compact ? 'py-9' : 'py-12'}`}>
        <div className={`grid grid-cols-1 md:grid-cols-[1.2fr_.8fr_.8fr_.8fr] ${compact ? 'gap-6' : 'gap-8'}`}>
          {/* Brand Column */}
          <div className="md:col-span-1">
            <div className={`rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 hover:bg-white/[0.055] ${compact ? 'p-5' : 'p-6'}`}>
              <div className={`flex items-center gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10 shrink-0 transition-transform duration-300 hover:scale-105">
                  <img
                    src="https://public.readdy.ai/ai/img_res/01e44241-379a-48b6-aa59-f959ef3e728e.png"
                    alt="KBC Crest"
                    className="w-10 h-10 object-contain object-center"
                  />
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight text-white">Kent Business College</p>
                  <p className="text-white/55 text-xs leading-tight">Communication Centre</p>
                </div>
              </div>
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-kbc-amber/30 bg-kbc-amber/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-kbc-amber">
                  Internal Hub
                </span>
              </div>
              <p className={`text-white/68 text-sm leading-7 ${compact ? 'mb-4' : 'mb-5'}`}>
                Kent Business College internal communication hub. Replacing email dependency with clarity, compliance and collaboration.
              </p>
              <div className="flex items-center gap-2.5">
                {contactIcons.map((item) => (
                  <div key={item.label} className="group relative">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/8 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:scale-105 ${item.wrapperClassName}`}>
                      <i className={`${item.icon} text-sm text-white/82 transition-all duration-300 ${item.iconClassName}`} />
                    </div>
                    <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#10192d]/92 px-2.5 py-1 text-[11px] font-medium text-white/82 opacity-0 shadow-lg shadow-black/20 transition-all duration-200 group-hover:translate-y-1 group-hover:opacity-100">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Link Columns */}
          {footerLinks.map((col) => (
            <div key={col.heading}>
              <h4 className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38 ${compact ? 'mb-3' : 'mb-4'}`}>
                {col.heading}
              </h4>
              <ul className={compact ? 'space-y-2' : 'space-y-2.5'}>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.path}
                      className="group inline-flex items-center gap-2 text-white/72 text-sm hover:text-white transition-all duration-300 cursor-pointer hover:translate-x-1"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-white/20 transition-all duration-300 group-hover:bg-kbc-amber group-hover:scale-125" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className={`mt-8 rounded-[24px] border border-white/10 bg-white/[0.035] px-5 ${compact ? 'py-3' : 'py-4'} flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors duration-300 hover:bg-white/[0.05]`}>
          <p className="text-white/45 text-xs">
            &copy; 2026 Kent Business College. Internal use only. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-white/45 text-xs cursor-pointer hover:text-white/75 transition-colors">Privacy Notice</span>
            <span className="text-white/45 text-xs cursor-pointer hover:text-white/75 transition-colors">Accessibility</span>
            <span className="text-white/45 text-xs cursor-pointer hover:text-white/75 transition-colors">Cookie Policy</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
