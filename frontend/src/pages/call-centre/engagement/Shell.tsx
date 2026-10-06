import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const paths: Record<string, string> = {
  panel: 'M9 3v18M3 3h18v18H3z', back: 'm12 5-7 7 7 7M5 12h14', close: 'm6 6 12 12M6 18 18 6', logout: 'M9 4H4v16h5M14 8l4 4-4 4M8 12h10',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', file: 'M14 2H5v20h14V7zM14 2v6h5M8 13h8M8 17h6',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M15 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6', book: 'M12 5v16M12 5C8 3 5 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-3-1-6-1-10 1',
  check: 'M9 11l3 3 8-8M20 12v8H4V4h10', calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 11h18', chart: 'M4 4v16h16M8 16v-4M12 16V8M16 16V5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  settings: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z', message: 'M21 4H3v14h5l4 4v-4h9zM7 8h10M7 12h6',
};

export const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name] || paths.file} />
  </svg>
);

export type NavItem = { key: string; label: string; icon: string };
export type NavGroup = { title: string; items: NavItem[] };

const SIDEBAR_KEY = 'kbc.portal.sidebar.expanded';
const readCollapsed = () => {
  try { return window.localStorage.getItem(SIDEBAR_KEY) === 'false'; } catch { return false; }
};

type Props = {
  title: string; email: string; groups: NavGroup[]; active: string; notice?: ReactNode;
  onNavigate: (key: string) => void; onSignOut: () => void; children: ReactNode;
};

/** The staff-portal workspace shell: purple sidebar, top bar and content column. */
export default function Shell({ title, email, groups, active, notice, onNavigate, onSignOut, children }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setMobile(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('workspace-lock-scroll', mobile && open);
    return () => document.body.classList.remove('workspace-lock-scroll');
  }, [mobile, open]);

  const toggle = useCallback(() => {
    if (mobile) {
      setOpen(value => !value);
      return;
    }
    setCollapsed(value => {
      try { window.localStorage.setItem(SIDEBAR_KEY, String(value)); } catch { /* preference only */ }
      return !value;
    });
  }, [mobile]);

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mobile && open) closeRef.current?.focus();
  }, [mobile, open]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')) {
        event.preventDefault();
        toggle();
        return;
      }
      if (mobile && open && event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [mobile, open, toggle, close]);

  const appClass = ['workspace-app', collapsed && !mobile ? 'workspace-collapsed' : '', open && mobile ? 'workspace-mobile-open' : ''].filter(Boolean).join(' ');

  return (
    <div className={appClass}>
      <div className="workspace-layout">
        <button className="workspace-overlay" type="button" aria-label="Close navigation" tabIndex={-1} hidden={!mobile || !open} onClick={close} />
        <aside className="workspace-sidebar" id="workspace-sidebar" aria-label={`${title} navigation`} inert={mobile && !open ? true : undefined}>
          <div className="workspace-brand">
            <span className="workspace-monogram">KBC</span>
            <div className="workspace-brand-text"><strong>{title}</strong><span>Kent Business College</span></div>
            <button ref={closeRef} type="button" className="workspace-close workspace-icon-button" aria-label="Close navigation" onClick={close}><Icon name="close" /></button>
          </div>
          <nav className="workspace-nav">
            {groups.map(group => (
              <div className="workspace-nav-group" key={group.title}>
                <p className="workspace-nav-heading">{group.title}</p>
                {group.items.map(item => (
                  <button
                    type="button"
                    key={item.key}
                    className="workspace-nav-item"
                    aria-label={item.label}
                    title={item.label}
                    aria-current={item.key === active ? 'page' : undefined}
                    onClick={() => {
                      if (mobile) close();
                      onNavigate(item.key);
                    }}
                  >
                    <Icon name={item.icon} /><span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="workspace-account" hidden={!email}><span>Signed in as</span><strong>{email}</strong></div>
        </aside>
        <div className="workspace-body" inert={mobile && open ? true : undefined}>
          <header className="workspace-topbar">
            <button ref={toggleRef} type="button" className="workspace-icon-button workspace-toggle" aria-controls="workspace-sidebar" aria-label="Toggle navigation" aria-expanded={mobile ? open : !collapsed} onClick={toggle}>
              <Icon name="panel" />
            </button>
            <Link className="workspace-back" to="/dashboard"><Icon name="back" /><span>Back to dashboard</span></Link>
            <div className="workspace-topbar-account">
              <span>{email}</span>
              <button type="button" className="workspace-signout" aria-label="Sign out" onClick={onSignOut}><Icon name="logout" /><span>Sign out</span></button>
            </div>
          </header>
          <main className="workspace-main">
            <div className="workspace-content">
              {notice}
              <div className="staff-shell staff-main">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
