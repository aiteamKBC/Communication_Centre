import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'News & Announcements', path: '/news' },
  { label: 'Internal Dashboard', path: '/dashboard' },
  { label: 'Risk Register', path: '/risk-register' },
  { label: 'Departments', path: '/departments' },
  { label: 'Policies', path: '/documents' },
  { label: 'Training Plan', path: '/training-plan' },
  { label: 'Events', path: '/events' },
  { label: 'Cohort Timeline', path: '/apprenticeships-timeline' },
];

export default function TopNav() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200" style={{ height: '56px' }}>
        <div className="flex items-center justify-between h-full px-4 md:px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 cursor-pointer">
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <img
                src="https://public.readdy.ai/ai/img_res/01e44241-379a-48b6-aa59-f959ef3e728e.png"
                alt="KBC Crest"
                className="w-10 h-10 object-contain object-center"
              />
            </div>
            <div className="hidden sm:block">
              <p className="text-kbc-navy font-bold text-sm leading-tight whitespace-nowrap">Kent Business College</p>
              <p className="text-gray-400 text-xs leading-tight whitespace-nowrap">Communication Centre</p>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden lg:flex flex-1 justify-center px-4">
            <div
              className="flex items-center gap-1 rounded-full border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] px-2 py-1 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.32)]"
              style={{ boxShadow: '0 16px 34px -24px rgba(15,23,42,0.32), inset 0 1px 0 rgba(255,255,255,0.85)' }}
            >
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`relative px-3 py-1.5 text-xs tracking-wide transition-all cursor-pointer whitespace-nowrap rounded-full ${
                    isActive(link.path)
                      ? 'font-semibold text-kbc-navy'
                      : 'font-medium text-gray-500 hover:text-kbc-navy hover:bg-slate-100/85'
                  }`}
                  style={isActive(link.path) ? {
                    background: 'rgba(247,168,0,0.12)',
                    border: '1px solid rgba(247,168,0,0.55)',
                    color: '#1B2A4A',
                    boxShadow: '0 10px 20px -16px rgba(247,168,0,0.95)',
                  } : {}}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Mobile Hamburger */}
          <div className="flex items-center shrink-0">
            <button
              className="lg:hidden w-8 h-8 flex items-center justify-center text-gray-600 cursor-pointer ml-1"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <i className={`text-lg ${mobileOpen ? 'ri-close-line' : 'ri-menu-line'}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu — slide-in sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 pt-14" onClick={() => setMobileOpen(false)}>
          <div
            className="bg-white border-b border-gray-200 py-2 shadow-xl"
            style={{ animation: 'slideDown 200ms ease' }}
            onClick={(e) => e.stopPropagation()}
          >
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block px-5 py-3 text-sm font-medium cursor-pointer border-l-4 ${
                  isActive(link.path)
                    ? 'text-kbc-navy border-kbc-amber font-semibold'
                    : 'text-gray-600 border-transparent hover:text-kbc-navy hover:bg-gray-50'
                }`}
                style={isActive(link.path) ? { background: 'rgba(247,168,0,0.08)' } : {}}
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-gray-100 mt-2 pt-2 px-5 pb-3">
              <Link
                to="/feedback"
                className="block w-full text-center bg-kbc-navy text-white font-semibold text-sm py-2.5 rounded cursor-pointer whitespace-nowrap"
              >
                Submit Feedback
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="h-14" />
    </>
  );
}
