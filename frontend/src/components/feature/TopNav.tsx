import { useEffect, useState } from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';



const AUTH_STORAGE_KEY = 'kbc-auth-user';



function hasAuthSession(): boolean {

  if (typeof window === 'undefined') {

    return false;

  }



  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!raw) {

    return false;

  }



  try {

    const parsed = JSON.parse(raw);

    return !!parsed && typeof parsed === 'object';

  } catch {

    return true;

  }

}



const navLinks = [

  { label: 'Home', path: '/' },

  { label: 'News & Announcements', path: '/news' },

  { label: 'Internal Dashboard', path: '/dashboard' },

  { label: 'Risk Register', path: '/risk-register' },

  { label: 'Departments', path: '/departments' },

  { label: 'Policies', path: '/documents' },


  { label: 'Events', path: '/events' },

  { label: 'Cohort Timeline', path: '/apprenticeships-timeline' },

];



export default function TopNav() {

  const location = useLocation();

  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);

  const [scrolled, setScrolled] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);



  useEffect(() => {

    setMobileOpen(false);

  }, [location.pathname]);



  useEffect(() => {

    setIsAuthenticated(hasAuthSession());

  }, [location.pathname]);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      setUserName(null);
      setUserPhoto(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setUserName(parsed?.displayName || parsed?.name || parsed?.username || null);
      setUserPhoto(parsed?.photo || parsed?.avatar || parsed?.profileImage || null);
    } catch {
      setUserName(null);
      setUserPhoto(null);
    }
  }, [location.pathname]);

  function getInitials(name?: string | null) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
  }

  useEffect(() => {

    function handleStorage(event: StorageEvent) {

      if (event.key === AUTH_STORAGE_KEY) {

        setIsAuthenticated(hasAuthSession());

      }

    }



    window.addEventListener('storage', handleStorage);

    return () => window.removeEventListener('storage', handleStorage);

  }, []);



  useEffect(() => {

    function handleScroll() {

      setScrolled(window.scrollY > 18);

    }



    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);

  }, []);



  const isActive = (path: string) =>

    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);



  const handleLogout = async () => {

    try {

      await fetch('/api/auth/logout/', {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

      });

    } catch {


    }



    if (typeof window !== 'undefined') {

      window.localStorage.removeItem(AUTH_STORAGE_KEY);

    }

    setIsAuthenticated(false);

    setMobileOpen(false);

    navigate('/login', { replace: true });

  };



  return (

    <>

      <nav

        className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-500 ${scrolled

            ? 'border-slate-200/80 bg-white/88 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl'

            : 'border-gray-200 bg-white/96 backdrop-blur-md'

          }`}

        style={{ height: '56px' }}

      >

        <div className="relative flex items-center justify-between h-full px-4 md:px-6">

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-kbc-amber/50 to-transparent opacity-70" />

          {/* Logo */}

          <Link

            to="/"

            data-nav-reveal

            className="group flex items-center gap-2.5 shrink-0 cursor-default rounded-2xl px-2 py-1.5 transition-transform duration-300 hover:-translate-y-0.5"

          >

            <div className="w-10 h-10 flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:rotate-3 group-hover:scale-105">

              <img

                src="https://public.readdy.ai/ai/img_res/01e44241-379a-48b6-aa59-f959ef3e728e.png"

                alt="KBC Crest"

                className="w-10 h-10 object-contain object-center"

              />

            </div>

            <div className="hidden sm:block">

              <p className="text-kbc-navy font-bold text-sm leading-tight whitespace-nowrap transition-colors duration-300 group-hover:text-kbc-navy-light">

                Kent Business College

              </p>

              <p className="text-gray-400 text-xs leading-tight whitespace-nowrap">

                Communication Centre

              </p>

            </div>

          </Link>



          {/* Desktop Nav Links */}

          <div className="hidden lg:flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-2 py-1 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] flex-1 justify-center max-w-max mx-auto">

            {navLinks.map((link) => (

              <Link

                key={link.path}

                to={link.path}

                data-nav-reveal

                className={`relative overflow-hidden rounded-full px-4 py-2 text-xs font-medium tracking-wide transition-all duration-300 cursor-pointer whitespace-nowrap ${isActive(link.path)

                    ? 'text-kbc-navy font-semibold'

                    : 'text-gray-500 hover:text-kbc-navy hover:-translate-y-0.5'

                  }`}

              >

                {isActive(link.path) && (

                  <span className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,rgba(15,56,110,0.08),rgba(255,193,7,0.16))] ring-1 ring-kbc-navy/10" />

                )}

                <span className="relative z-10">{link.label}</span>

              </Link>

            ))}

          </div>



          {/* Right Actions */}

          <div className="flex items-center gap-1 shrink-0">
            {isAuthenticated ? (
              <>
                <div data-nav-reveal className="hidden md:flex items-center gap-3 mr-2">
                  <div className="text-sm font-semibold text-kbc-navy truncate max-w-[200px]">{userName || 'Account'}</div>
                </div>

                <button
                  type="button"
                  data-nav-reveal
                  onClick={handleLogout}
                  className="hidden md:inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-600 hover:text-white"
                >
                  <i className="ri-logout-box-r-line text-sm" />
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                data-nav-reveal
                className="hidden md:inline-flex items-center gap-1 rounded-full border border-kbc-navy/15 bg-white/90 px-3 py-1.5 text-xs font-semibold text-kbc-navy shadow-sm hover:-translate-y-0.5 hover:border-kbc-navy/35 hover:bg-kbc-navy hover:text-white"
              >
                <i className="ri-login-circle-line text-sm" />
                Login
              </Link>
            )}
            {/* Mobile Hamburger */}

            <button
              data-nav-reveal
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-white/90 text-gray-600 shadow-sm cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:text-kbc-navy"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <i className={`text-lg ${mobileOpen ? 'ri-close-line' : 'ri-menu-line'}`} />
            </button>
          </div>

        </div>

      </nav>



      {/* Mobile Menu */}

      {mobileOpen && (

        <div className="fixed inset-0 z-40 bg-slate-950/10 pt-14 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)}>

          <div

            className="nav-sheet bg-white/95 border-b border-gray-200 py-2 shadow-2xl backdrop-blur-xl"

            onClick={(e) => e.stopPropagation()}

          >

            {navLinks.map((link) => (

              <Link

                key={link.path}

                to={link.path}

                className={`block px-5 py-3 text-sm font-medium cursor-pointer border-l-4 transition-all duration-300 ${isActive(link.path)

                    ? 'text-kbc-navy border-kbc-navy bg-[linear-gradient(90deg,rgba(15,56,110,0.06),rgba(15,56,110,0))] font-semibold'

                    : 'text-gray-600 border-transparent hover:text-kbc-navy hover:bg-gray-50'

                  }`}

              >

                {link.label}

              </Link>

            ))}

            <div className="border-t border-gray-100 mt-2 pt-2 px-5 py-3">

              {isAuthenticated ? (

                <button

                  type="button"

                  onClick={handleLogout}

                  className="mb-2 block w-full text-center border border-red-200 bg-red-50 text-red-700 font-semibold text-sm py-2.5 rounded-xl cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-red-600 hover:text-white"

                >

                  Logout

                </button>

              ) : (

                <Link

                  to="/login"

                  className="mb-2 block w-full text-center border border-kbc-navy/20 bg-white text-kbc-navy font-semibold text-sm py-2.5 rounded-xl cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-kbc-navy hover:text-white"

                >

                  Login

                </Link>

              )}

              <Link

                to="/feedback"

                className="block w-full text-center bg-kbc-navy text-white font-semibold text-sm py-2.5 rounded-xl cursor-pointer whitespace-nowrap transition-all duration-300 hover:-translate-y-0.5 hover:bg-kbc-navy-light"

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
