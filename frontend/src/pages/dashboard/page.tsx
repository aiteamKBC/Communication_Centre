import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import useAccessControl from '../../hooks/useAccessControl';
import { readStoredAuthUser } from '../../utils/authStorage';

type DashboardLink = {
  id?: number;
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
  accentStart?: string;
  accentEnd?: string;
  softColor?: string;
  textColor?: string;
  status?: 'available' | 'unavailable' | 'maintenance' | 'hidden';
  sortOrder?: number;
};

type DashboardDraft = Omit<DashboardLink, 'id' | 'accent' | 'soft' | 'text'> & {
  id?: number;
  accentStart: string;
  accentEnd: string;
  softColor: string;
  textColor: string;
  status: NonNullable<DashboardLink['status']>;
  sortOrder: number;
  destination: string;
};

type CardStatusFilter = 'all' | 'available' | 'unavailable' | 'maintenance';

const iconOptions: { value: string; label: string }[] = [
  { value: 'ri-dashboard-line', label: 'Dashboard' },
  { value: 'ri-customer-service-2-line', label: 'Support' },
  { value: 'ri-graduation-cap-line', label: 'Teaching' },
  { value: 'ri-heart-pulse-line', label: 'Wellbeing' },
  { value: 'ri-user-heart-line', label: 'Inclusion' },
  { value: 'ri-discuss-line', label: 'Coaching' },
  { value: 'ri-calendar-check-line', label: 'Attendance' },
  { value: 'ri-team-line', label: 'Team' },
  { value: 'ri-line-chart-line', label: 'Performance' },
  { value: 'ri-award-line', label: 'Quality' },
  { value: 'ri-book-open-line', label: 'Library' },
  { value: 'ri-file-shield-line', label: 'Compliance' },
  { value: 'ri-briefcase-4-line', label: 'Employers' },
  { value: 'ri-presentation-line', label: 'Lectures' },
  { value: 'ri-survey-line', label: 'Assessment' },
  { value: 'ri-settings-3-line', label: 'Settings' },
];

// Mirrors the backend rules so admins get the message before a round trip.
function validateDestination(destination: string): string {
  if (!destination) return 'Add a destination: an https:// link or an internal path starting with /.';
  if (destination.startsWith('/')) {
    return destination.startsWith('//') || destination.includes('\\') ? 'Internal paths must start with a single / (for example /dashboard/call-centre).' : '';
  }
  try {
    const parsed = new URL(destination);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? '' : 'External links must start with https://.';
  } catch {
    return 'External links must be a full address starting with https:// (for example https://library.kentbusinesscollege.net/).';
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const user = readStoredAuthUser();
  const headers: Record<string, string> = { ...extra };
  if (user?.id !== undefined) headers['X-KBC-User-Id'] = String(user.id);
  if (user?.email) headers['X-KBC-User-Email'] = String(user.email);
  if (user?.username) headers['X-KBC-Username'] = String(user.username);
  return headers;
}

// Mirrors the grid breakpoints below (1 col, sm:2, xl:3) so up/down arrows move a card one row.
function readGridColumns() {
  if (typeof window === 'undefined') return 3;
  if (window.matchMedia('(min-width: 1280px)').matches) return 3;
  if (window.matchMedia('(min-width: 640px)').matches) return 2;
  return 1;
}

function useGridColumns() {
  const [columns, setColumns] = useState(readGridColumns);
  useEffect(() => {
    const onResize = () => setColumns(readGridColumns());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return columns;
}

const statusStyles: Record<NonNullable<DashboardLink['status']>, { pill: string; dot: string; icon: string }> = {
  available: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', icon: '' },
  maintenance: { pill: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500', icon: 'ri-tools-line' },
  unavailable: { pill: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', icon: 'ri-close-circle-line' },
  hidden: { pill: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400', icon: 'ri-eye-off-line' },
};

const statusHint: Record<NonNullable<DashboardLink['status']>, string> = {
  available: '',
  maintenance: 'Temporarily down for maintenance. Please check back later.',
  unavailable: 'This dashboard is currently unavailable.',
  hidden: 'Hidden from users. Only admins can see this card.',
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

const dashboardColourDefaults: Record<string, [string, string, string, string]> = {
  'Engagement Centre': ['#1B2A4A', '#2E4482', '#eef2ff', '#2E4482'],
  'Tutor Dashboard': ['#7c4dff', '#4f2fb8', '#f1eaff', '#6b3fd1'],
  'Safeguarding & Wellbeing Dashboard': ['#39206d', '#160f3f', '#efe8ff', '#39206d'],
  'Inclusion Dashboard': ['#84cc16', '#15803d', '#f0fdf4', '#15803d'],
  'Coaching sessions': ['#0ea5e9', '#2563eb', '#eff6ff', '#2563eb'],
  'Bulk Attendance': ['#059669', '#047857', '#ecfdf5', '#047857'],
  'Engagement Dashboard': ['#7e22ce', '#581c87', '#efe3ff', '#5b1a8e'],
  'Technical support portal': ['#6366f1', '#4338ca', '#f1eaff', '#6b3fd1'],
  'Performance Dashboard': ['#8b5cf6', '#a855f7', '#f1eaff', '#6d36b3'],
  'Quality Management System': ['#d4a546', '#8b5e18', '#fff6e3', '#9a6a1d'],
  Library: ['#f43f5e', '#be123c', '#fff1f7', '#be185d'],
  'HR Compliance System': ['#db2777', '#9d174d', '#fff1f7', '#be185d'],
  'Employer Dashboard': ['#14b8a6', '#0f766e', '#e9fbf7', '#138f82'],
};

function withVisualDefaults(link: DashboardLink): DashboardLink {
  const defaults = dashboardColourDefaults[link.title] || ['#1B2A4A', '#2E4482', '#eef2ff', '#2E4482'];
  return {
    ...link,
    accentStart: link.accentStart || defaults[0],
    accentEnd: link.accentEnd || defaults[1],
    softColor: link.softColor || defaults[2],
    textColor: link.textColor || defaults[3],
  };
}

function serverCardToLink(card: Record<string, unknown>): DashboardLink {
  return withVisualDefaults({
    id: Number(card.id),
    title: String(card.title || ''),
    description: String(card.description || ''),
    label: String(card.label || ''),
    url: String(card.url || ''),
    internalPath: String(card.internalPath || ''),
    icon: String(card.icon || 'ri-dashboard-line'),
    accent: '',
    soft: '',
    text: '',
    accentStart: String(card.accentStart || ''),
    accentEnd: String(card.accentEnd || ''),
    softColor: String(card.softColor || ''),
    textColor: String(card.textColor || ''),
    status: (String(card.status || 'available') as DashboardLink['status']),
    adminOnly: Boolean(card.isAdminOnly),
    sortOrder: Number(card.sortOrder || 0),
  });
}

function draftFromCard(card?: DashboardLink): DashboardDraft {
  return {
    id: card?.id,
    title: card?.title || '',
    description: card?.description || '',
    label: card?.label || '',
    url: card?.url || '',
    internalPath: card?.internalPath || '',
    icon: card?.icon || 'ri-dashboard-line',
    accentStart: card?.accentStart || '#1B2A4A',
    accentEnd: card?.accentEnd || '#2E4482',
    softColor: card?.softColor || '#eef2ff',
    textColor: card?.textColor || '#2E4482',
    status: card?.status || 'available',
    adminOnly: Boolean(card?.adminOnly),
    sortOrder: card?.sortOrder || 0,
    destination: card?.internalPath || card?.url || '',
  };
}

const statusLabel: Record<NonNullable<DashboardLink['status']>, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  maintenance: 'Under maintenance',
  hidden: 'Hidden',
};

export default function DashboardPage() {
  const { adminAccess } = useAccessControl();
  const [cards, setCards] = useState<DashboardLink[]>(() => dashboardLinks.map(withVisualDefaults));
  const [editingCard, setEditingCard] = useState<DashboardDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dashboardTab, setDashboardTab] = useState<'active' | 'hidden'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CardStatusFilter>('all');
  const [arranging, setArranging] = useState(false);
  // False while showing the built-in fallback list (API down): those cards have no ids, so saving would create duplicates.
  const [cardsFromServer, setCardsFromServer] = useState(false);
  const [orderState, setOrderState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [orderError, setOrderError] = useState('');
  const gridColumns = useGridColumns();
  const [lastMovedId, setLastMovedId] = useState<number | null>(null);
  const focusMovedCard = useRef(false);

  // After a move: briefly highlight the card, keep it on screen, and keep keyboard focus on it.
  useEffect(() => {
    if (lastMovedId === null) return;
    const element = document.querySelector<HTMLElement>(`[data-card-id="${lastMovedId}"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (focusMovedCard.current) { element?.focus({ preventScroll: true }); focusMovedCard.current = false; }
    const timer = window.setTimeout(() => setLastMovedId(null), 1400);
    return () => window.clearTimeout(timer);
  }, [lastMovedId, cards]);

  const loadCards = async () => {
    try {
      const response = await fetch('/api/dashboard-cards/', { credentials: 'include', cache: 'no-store', headers: authHeaders() });
      if (!response.ok) return;
      const payload = await response.json();
      if (Array.isArray(payload)) { setCards(payload.map(serverCardToLink)); setCardsFromServer(true); }
    } catch {
      // The seeded fallback keeps the dashboard usable while the API is unavailable.
    }
  };

  useEffect(() => { void loadCards(); }, []);

  const saveCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCard) return;
    setSaving(true);
    setError('');
    const { id } = editingCard;
    const currentCard = id ? cards.find(card => card.id === id) : undefined;
    if (editingCard.status === 'hidden' && currentCard?.status !== 'hidden' && !window.confirm('Hide this dashboard card? It will move to the Hidden cards tab.')) {
      setSaving(false);
      return;
    }
    const destination = editingCard.destination.trim();
    const destinationError = validateDestination(destination);
    if (destinationError) {
      setError(destinationError);
      setSaving(false);
      return;
    }
    const body = {
      icon: editingCard.icon,
      isAdminOnly: Boolean(editingCard.adminOnly),
      title: editingCard.title,
      description: editingCard.description,
      status: editingCard.status,
      accentStart: editingCard.accentStart,
      accentEnd: editingCard.accentEnd,
      url: destination.startsWith('/') ? '' : destination,
      internalPath: destination.startsWith('/') ? destination : '',
    };
    try {
      const response = await fetch(id ? `/api/dashboard-cards/${id}/` : '/api/dashboard-cards/', {
        method: id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload.detail || 'Unable to save this dashboard card.'));
      }
      setEditingCard(null);
      await loadCards();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this dashboard card.');
    } finally {
      setSaving(false);
    }
  };

  const bySortOrder = (left: DashboardLink, right: DashboardLink) => (left.sortOrder || 0) - (right.sortOrder || 0) || (left.id || 0) - (right.id || 0);
  const activeDashboardLinks = cards.filter(link => link.status !== 'hidden' && (adminAccess || !link.adminOnly)).sort(bySortOrder);
  const hiddenDashboardLinks = adminAccess ? cards.filter(link => link.status === 'hidden').sort(bySortOrder) : [];
  const tabLinks = dashboardTab === 'hidden' ? hiddenDashboardLinks : activeDashboardLinks;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  // The status filter only applies to the Active tab; every card in the Hidden tab has the hidden status.
  const effectiveStatusFilter = dashboardTab === 'active' ? statusFilter : 'all';
  const filtersActive = Boolean(normalizedSearch) || effectiveStatusFilter !== 'all';
  // Arranging always works on the full, unfiltered list of active cards so positions match what users see.
  const visibleDashboardLinks = arranging ? activeDashboardLinks : tabLinks.filter(link => {
    const matchesSearch = !normalizedSearch || [link.title, link.description, link.label].some(value => value.toLowerCase().includes(normalizedSearch));
    const matchesStatus = effectiveStatusFilter === 'all' || link.status === effectiveStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const canArrange = adminAccess && cardsFromServer && activeDashboardLinks.length > 1;

  const startArranging = () => {
    setDashboardTab('active');
    setOrderError('');
    setOrderState('idle');
    setArranging(true);
  };

  const moveCard = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= activeDashboardLinks.length) return;
    const ordered = [...activeDashboardLinks];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const ids = ordered.map(link => Number(link.id));
    const positions = new Map(ids.map((id, position) => [id, position]));
    const previousCards = cards;
    setLastMovedId(Number(ordered[target].id));
    // Optimistic update so the card moves immediately; the server response is the source of truth.
    setCards(current => current.map(card => (card.id && positions.has(card.id) ? { ...card, sortOrder: positions.get(card.id) } : card)));
    setOrderState('saving');
    setOrderError('');
    try {
      const response = await fetch('/api/dashboard-cards/reorder/', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload.detail || 'Unable to save the new order.'));
      }
      const payload = await response.json();
      if (Array.isArray(payload)) setCards(payload.map(serverCardToLink));
      setOrderState('saved');
    } catch (moveError) {
      setCards(previousCards);
      setOrderState('error');
      setOrderError(moveError instanceof Error ? moveError.message : 'Unable to save the new order.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />
      <div className="flex-1">
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2"><a href="/" className="hover:text-kbc-navy cursor-pointer">Home</a><span>/</span><span className="text-kbc-navy font-medium">Internal Dashboard</span></div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3"><div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0"><i className="ri-dashboard-line text-white text-base" /></div><div><h1 className="text-lg font-bold text-kbc-navy">Internal Dashboard</h1><p className="text-gray-500 text-sm mt-0.5">Quick access to your internal service dashboards for tutors, operations, employers, and admin teams.</p></div></div>
              {adminAccess && <div className="flex shrink-0 items-center gap-2">
                {arranging
                  ? <button type="button" onClick={() => setArranging(false)} className="rounded-xl bg-[#39206d] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#24164f]"><i className="ri-check-line mr-1" /> Done arranging</button>
                  : <button type="button" onClick={startArranging} disabled={!canArrange} title={canArrange ? 'Change the order cards appear in for everyone' : 'Cards can be arranged once they are loaded from the server'} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-[#39206d] shadow-sm hover:border-[#39206d]/40 hover:bg-[#f7f4ff] disabled:cursor-not-allowed disabled:opacity-50"><i className="ri-drag-move-2-line mr-1" /> Arrange</button>}
                {!arranging && <button type="button" disabled={!cardsFromServer} title={cardsFromServer ? undefined : 'Cards can be added once they are loaded from the server'} onClick={() => { setError(''); setEditingCard(draftFromCard()); }} className="disabled:cursor-not-allowed disabled:opacity-50 rounded-xl bg-[#39206d] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#24164f]"><i className="ri-add-line mr-1" /> Add card</button>}
              </div>}
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="mb-6 rounded-[2rem] border border-[#e2daf7] bg-[radial-gradient(circle_at_top_left,_rgba(109,71,255,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(23,162,198,0.1),_transparent_28%),linear-gradient(180deg,#ffffff_0%,#f8f7ff_100%)] p-6 shadow-sm"><div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-2 rounded-full bg-[#39206d] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white"><i className="ri-dashboard-horizontal-line" /> Workspace Access</span><p className="text-sm text-slate-600">Each workspace below is tuned for a different operational role. Open the one that matches the task you need to complete.</p></div></div>

          {arranging && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9cff5] bg-[#f7f4ff] px-4 py-3 text-sm text-[#39206d]">
            <span className="flex items-center gap-2 font-semibold"><i className="ri-drag-move-2-line text-base" />Use a card's arrows (or focus a card and press the arrow keys) to move it. Each move is saved for everyone straight away.</span>
            <span className={`text-xs font-bold ${orderState === 'error' ? 'text-rose-600' : 'text-slate-500'}`} aria-live="polite">
              {orderState === 'saving' && <><i className="ri-loader-4-line mr-1 inline-block animate-spin" />Saving…</>}
              {orderState === 'saved' && <><i className="ri-check-line mr-1 text-emerald-600" />Order saved</>}
              {orderState === 'error' && <><i className="ri-error-warning-line mr-1" />{orderError}</>}
            </span>
          </div>}

          {adminAccess && !arranging && <div className="mb-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Dashboard card views">
            <button type="button" role="tab" aria-selected={dashboardTab === 'active'} onClick={() => setDashboardTab('active')} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${dashboardTab === 'active' ? 'bg-[#39206d] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-[#39206d]/30'}`}><i className="ri-dashboard-line mr-1" />Active dashboards ({activeDashboardLinks.length})</button>
            <button type="button" role="tab" aria-selected={dashboardTab === 'hidden'} onClick={() => setDashboardTab('hidden')} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${dashboardTab === 'hidden' ? 'bg-[#39206d] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-[#39206d]/30'}`}><i className="ri-eye-off-line mr-1" />Hidden cards ({hiddenDashboardLinks.length})</button>
          </div>}

          {!arranging && <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search dashboard cards</span>
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search dashboards..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#39206d] focus:ring-2 focus:ring-[#39206d]/10" />
            </label>
            {dashboardTab === 'active' && <label className="sm:w-44">
              <span className="sr-only">Filter by status</span>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as CardStatusFilter)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-[#39206d]">
                <option value="all">All statuses</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="maintenance">Maintenance</option>
              </select>
            </label>}
            {filtersActive && <button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-[#39206d] hover:bg-[#f4f0ff]">Clear filters</button>}
          </div>}

          {visibleDashboardLinks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">{dashboardTab === 'hidden' ? 'There are no hidden dashboard cards.' : filtersActive ? 'No dashboards match the selected filters.' : 'No dashboard cards are available.'}</div>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDashboardLinks.map((link, index) => {
              const status = link.status || 'available';
              const disabled = status !== 'available' || Boolean(link.comingSoon);
              const tone = statusStyles[status];
              const gradientStyle = link.accentStart ? { background: `linear-gradient(135deg, ${link.accentStart}, ${link.accentEnd || link.accentStart})` } : undefined;
              const destinationType = link.internalPath ? 'Internal' : 'External';
              const interactive = !disabled && !arranging;
              const cardClassName = `group relative flex flex-col overflow-hidden rounded-2xl border bg-white px-5 pb-4 pt-6 shadow-sm transition duration-300 ${arranging ? 'border-[#d9cff5]' : 'border-slate-200'} ${interactive ? 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg' : 'cursor-default'}`;
              const editButton = adminAccess && cardsFromServer && Boolean(link.id) && !arranging && <button type="button" title={`Edit ${link.title} (${destinationType})`} aria-label={`Edit ${link.title}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setError(''); setEditingCard(draftFromCard(link)); }} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f4f0ff] px-3 text-xs font-bold text-[#39206d] ring-1 ring-[#39206d]/20 transition hover:bg-[#39206d] hover:text-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><i className="ri-edit-2-line text-sm" />Edit</button>;
              const statusPill = <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${tone.pill}`}>{tone.icon ? <i className={`${tone.icon} text-sm`} /> : <span className={`h-2 w-2 rounded-full ${tone.dot}`} />}{statusLabel[status]}</span>;
              const arrowButton = (label: string, icon: string, delta: number, enabled: boolean) => <button type="button" aria-label={`Move ${link.title} ${label}`} title={`Move ${label}`} disabled={!enabled || orderState === 'saving'} onClick={() => void moveCard(index, delta)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#d9cff5] bg-white text-[#39206d] transition hover:border-[#39206d] hover:bg-[#39206d] hover:text-white disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"><i className={`${icon} text-sm`} /></button>;
              const canUp = index - gridColumns >= 0;
              const canDown = index + gridColumns < visibleDashboardLinks.length;
              const canLeft = index > 0;
              const canRight = index < visibleDashboardLinks.length - 1;
              const onArrangeKey = (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.target !== event.currentTarget || orderState === 'saving') return;
                const moves: Record<string, [number, boolean]> = { ArrowUp: [-gridColumns, canUp], ArrowDown: [gridColumns, canDown], ArrowLeft: [-1, canLeft], ArrowRight: [1, canRight] };
                const move = moves[event.key];
                if (!move) return;
                event.preventDefault();
                if (!move[1]) return;
                focusMovedCard.current = true;
                void moveCard(index, move[0]);
              };
              const arrangeBar = <div className="mt-4 flex items-center justify-between gap-3 border-t border-dashed border-[#d9cff5] pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#39206d]"><i className="ri-draggable text-base text-[#b7a6e8]" /><span className="rounded-md bg-[#f4f0ff] px-2 py-0.5">#{index + 1}</span><span className="font-semibold text-slate-400">of {visibleDashboardLinks.length}</span></span>
                <div className="flex items-center gap-1">
                  {arrowButton('left', 'ri-arrow-left-line', -1, canLeft)}
                  {arrowButton('up', 'ri-arrow-up-line', -gridColumns, canUp)}
                  {arrowButton('down', 'ri-arrow-down-line', gridColumns, canDown)}
                  {arrowButton('right', 'ri-arrow-right-line', 1, canRight)}
                </div>
              </div>;
              const content = <>
                <div className="absolute inset-x-0 top-0 h-1" style={gradientStyle} />
                <div className="flex flex-1 items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-bold leading-snug text-kbc-navy">{link.title}</h2>
                    {link.description && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-500">{link.description}</p>}
                    {statusHint[status] && <p className={`mt-2 text-xs font-semibold ${status === 'maintenance' ? 'text-amber-700' : status === 'unavailable' ? 'text-rose-600' : 'text-slate-500'}`}>{statusHint[status]}</p>}
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${disabled ? 'grayscale-[60%]' : ''}`} style={gradientStyle}><i className={`${link.icon} text-lg`} /></div>
                </div>
                {arranging ? arrangeBar : <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  {statusPill}
                  <div className="flex items-center gap-2">
                    {editButton}
                    <div title={disabled ? statusLabel[status] : link.internalPath ? 'Open' : 'Opens in a new tab'} className={`flex h-9 w-9 items-center justify-center rounded-xl text-white transition ${disabled ? 'bg-slate-300' : 'bg-[#24164f] group-hover:bg-[#39206d]'}`}><i className={`${disabled ? 'ri-lock-line' : link.internalPath ? 'ri-arrow-right-line' : 'ri-external-link-line'} text-base`} /></div>
                  </div>
                </div>}
              </>;
              const key = link.id || link.internalPath || link.url || link.title;
              if (arranging) {
                const justMoved = lastMovedId !== null && link.id === lastMovedId;
                return <div key={key} data-card-id={link.id} tabIndex={0} role="group" aria-label={`${link.title}, position ${index + 1} of ${visibleDashboardLinks.length}. Use arrow keys to move.`} onKeyDown={onArrangeKey} className={`relative flex flex-col overflow-hidden rounded-2xl border border-dashed bg-white px-5 pb-4 pt-6 outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#39206d]/40 ${justMoved ? 'border-[#39206d] shadow-lg ring-2 ring-[#39206d]/25' : 'border-[#c9bdf0] shadow-sm hover:border-[#39206d]/50'}`}>{content}</div>;
              }
              if (!interactive) return <div key={key} className={cardClassName}>{content}</div>;
              if (link.internalPath) return <Link key={key} to={link.internalPath} className={cardClassName}>{content}</Link>;
              return <a key={key} href={link.url} target="_blank" rel="noopener noreferrer" className={cardClassName}>{content}</a>;
            })}
          </div>
        </main>
      </div>
      <Footer />
      {editingCard && <DashboardCardModal draft={editingCard} saving={saving} error={error} onChange={setEditingCard} onClose={() => setEditingCard(null)} onSubmit={saveCard} />}
    </div>
  );
}

function DashboardCardModal({ draft, saving, error, onChange, onClose, onSubmit }: { draft: DashboardDraft; saving: boolean; error: string; onChange: (draft: DashboardDraft) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const update = (field: keyof DashboardDraft, value: string | boolean) => onChange({ ...draft, [field]: value });
  const knownIcon = iconOptions.some(option => option.value === draft.icon);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
      <form onSubmit={onSubmit} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-kbc-navy">{draft.id ? 'Edit dashboard card' : 'Add dashboard card'}</h2>
            <p className="mt-1 text-sm text-slate-500">Set only the details users need to see.</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700" aria-label="Close">×</button>
        </div>
        {error && <div className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Name<input required maxLength={255} value={draft.title} onChange={event => update('title', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-[#39206d]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Short description<textarea value={draft.description} onChange={event => update('description', event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal outline-none focus:border-[#39206d]" /></label>
          <label className="block text-sm font-semibold text-slate-700">Destination <span className="font-normal text-slate-400">(URL or internal path)</span><input required maxLength={255} value={draft.destination} onChange={event => update('destination', event.target.value)} placeholder="https://... or /dashboard/..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" /><span className="mt-1 block text-xs font-normal text-slate-400">Full links (https://…) open in a new tab. Paths starting with / open inside the Communication Centre.</span></label>
          <div className="block text-sm font-semibold text-slate-700">Icon
            <div className="mt-1 grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Card icon">
              {iconOptions.map(option => <button key={option.value} type="button" role="radio" aria-checked={draft.icon === option.value} title={option.label} aria-label={option.label} onClick={() => update('icon', option.value)} className={`flex h-9 items-center justify-center rounded-lg border text-base transition ${draft.icon === option.value ? 'border-[#39206d] bg-[#39206d] text-white' : 'border-slate-200 text-slate-500 hover:border-[#39206d]/40 hover:text-[#39206d]'}`}><i className={option.value} /></button>)}
            </div>
            {!knownIcon && <span className="mt-1 block text-xs font-normal text-slate-400">Current icon: <i className={draft.icon} /> (custom)</span>}
          </div>
          <label className="block text-sm font-semibold text-slate-700">Status<select value={draft.status} onChange={event => update('status', event.target.value as DashboardDraft['status'])} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-normal"><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="maintenance">Under maintenance</option><option value="hidden">Hidden</option></select></label>
          <div className="grid gap-4 sm:grid-cols-2"><ColorInput label="Main colour" value={draft.accentStart} onChange={value => update('accentStart', value)} /><ColorInput label="Second colour" value={draft.accentEnd} onChange={value => update('accentEnd', value)} /></div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={Boolean(draft.adminOnly)} onChange={event => update('adminOnly', event.target.checked)} className="h-4 w-4 accent-[#39206d]" />Admins only <span className="font-normal text-slate-400">(hide this card from non-admin users)</span></label>
        </div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-[#39206d] px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save card'}</button></div>
      </form>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<div className="mt-1 flex items-center gap-2"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1B2A4A'} onChange={event => onChange(event.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 p-1" /><input value={value} onChange={event => onChange(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 font-normal" /></div></label>;
}
