import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';

interface SupportTicket {
  id: number;
  ticketType: string;
  fullName: string;
  email: string;
  subject: string;
  details: string;
  urgency: string;
  preferredContact: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  submittedBy: string;
  createdBy: string;
  assignedOwner?: string;
  isArchived?: boolean;
  notes?: SupportTicketNote[] | string | null;
  notesCount?: number;
  evidence?: unknown[];
  daysToClose?: number | null;
}

interface SupportTicketNote {
  id?: string;
  note?: string;
  type?: string;
  created_at?: string;
  created_by?: string;
}

interface RiskItem {
  id: number;
  risk: string;
  category: string;
  severity: string;
  rag: string;
  ofstedArea: string;
  owner: string;
  status: string;
}

type Tone = { bg: string; color: string; border: string; icon?: string };

function normalize(value: string): string {
  return (value || '').trim().toLowerCase();
}

function ragKey(rag: string): 'R' | 'A' | 'G' | '?' {
  const value = normalize(rag);
  if (value === 'r' || value === 'red') return 'R';
  if (value === 'a' || value === 'amber') return 'A';
  if (value === 'g' || value === 'green') return 'G';
  return '?';
}

function titleCase(value: string): string {
  const clean = (value || '').trim();
  if (!clean) return '-';
  return clean.replace(/\b\w/g, char => char.toUpperCase());
}

function isSupportTicketClosed(status: string): boolean {
  const lower = normalize(status);
  return lower === 'closed' || lower === 'outcome recorded';
}

function formatDate(iso: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function extractTicketFacts(details: string): { label: string; value: string }[] {
  const source = details || '';
  const pick = (pattern: RegExp) => source.match(pattern)?.[1]?.trim().replace(/\s+/g, ' ') || '';
  const facts = [
    ['Programme', pick(/Programme:\s*(.*?)(?=\s+Coach:|\s+Triggered Questions:|$)/i)],
    ['Coach', pick(/Coach:\s*(.*?)(?=\s+Triggered Questions:|$)/i)],
    ['Risk level', pick(/Risk Level:\s*(.*?)(?=\s+Total Score:|\s+Trigger Count:|\s+Programme:|$)/i)],
    ['Total score', pick(/Total Score:\s*([0-9.]+)/i)],
    ['Trigger count', pick(/Trigger Count:\s*(\d+)/i)],
  ];
  return facts.filter(([, value]) => Boolean(value)).map(([label, value]) => ({ label, value }));
}

function normalizeTicketNotes(rawNotes: SupportTicket['notes']): SupportTicketNote[] {
  if (Array.isArray(rawNotes)) {
    return rawNotes.filter(note => note?.note);
  }
  if (typeof rawNotes === 'string') {
    try {
      const parsed = JSON.parse(rawNotes);
      return Array.isArray(parsed) ? parsed.filter(note => note?.note) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function urgencyTone(urgency: string): Tone {
  switch (normalize(urgency)) {
    case 'urgent': return { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA', icon: 'ri-alarm-warning-line' };
    case 'high': return { bg: '#FFEDD5', color: '#EA580C', border: '#FED7AA', icon: 'ri-arrow-up-circle-line' };
    case 'medium': return { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A', icon: 'ri-subtract-line' };
    case 'low': return { bg: '#D1FAE5', color: '#059669', border: '#A7F3D0', icon: 'ri-arrow-down-circle-line' };
    default: return { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0', icon: 'ri-circle-line' };
  }
}

function statusTone(status: string): Tone {
  const lower = normalize(status);
  if (isSupportTicketClosed(status)) return { bg: '#E2E8F0', color: '#475569', border: '#CBD5E1' };
  if (lower.includes('assigned')) return { bg: '#DBEAFE', color: '#2563EB', border: '#BFDBFE' };
  if (lower.includes('review')) return { bg: '#EDE9FE', color: '#7C3AED', border: '#DDD6FE' };
  if (lower.includes('follow')) return { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' };
  return { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
}

function typeTone(type: string): Tone {
  switch (normalize(type)) {
    case 'safeguarding': return { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA', icon: 'ri-shield-cross-line' };
    case 'wellbeing': return { bg: '#EDE9FE', color: '#7C3AED', border: '#DDD6FE', icon: 'ri-heart-pulse-line' };
    default: return { bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0', icon: 'ri-file-warning-line' };
  }
}

function ragStyle(rag: string): { bg: string; color: string; label: string } {
  switch (ragKey(rag)) {
    case 'R': return { bg: '#FEE2E2', color: '#DC2626', label: 'Red' };
    case 'A': return { bg: '#FEF3C7', color: '#D97706', label: 'Amber' };
    case 'G': return { bg: '#D1FAE5', color: '#059669', label: 'Green' };
    default: return { bg: '#F1F5F9', color: '#64748B', label: rag || '-' };
  }
}

function severityStyle(severity: string): { bg: string; color: string } {
  switch (normalize(severity)) {
    case 'high': return { bg: '#FEE2E2', color: '#DC2626' };
    case 'medium': return { bg: '#FEF3C7', color: '#D97706' };
    case 'low': return { bg: '#D1FAE5', color: '#059669' };
    default: return { bg: '#F1F5F9', color: '#64748B' };
  }
}

function uniqueValues(items: SupportTicket[], key: keyof SupportTicket): string[] {
  return Array.from(new Set(items.map(item => String(item[key] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-24 rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="h-4 w-48 rounded-full bg-slate-100 animate-pulse" />
          <div className="mt-3 h-3 w-3/4 rounded-full bg-slate-100 animate-pulse" />
          <div className="mt-5 flex gap-2">
            <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-6 w-24 rounded-full bg-slate-100 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: Tone }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3 shadow-sm" style={{ borderColor: tone.border }}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: tone.bg, color: tone.color }}>
          <i className={icon} />
        </span>
        <span className="text-xl font-extrabold" style={{ color: tone.color }}>{value}</span>
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function SupportTicketCard({ ticket }: { ticket: SupportTicket }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const urgency = urgencyTone(ticket.urgency);
  const status = statusTone(ticket.status);
  const type = typeTone(ticket.ticketType);
  const isClosed = isSupportTicketClosed(ticket.status);
  const facts = extractTicketFacts(ticket.details);
  const notes = normalizeTicketNotes(ticket.notes);
  const notesCount = typeof ticket.notesCount === 'number' ? ticket.notesCount : notes.length;
  const latestNote = notes[notes.length - 1];
  const detailItems = [
    { label: 'Learner', value: ticket.fullName, icon: 'ri-user-line' },
    { label: 'Email', value: ticket.email, icon: 'ri-mail-line' },
    { label: 'Preferred contact', value: ticket.preferredContact, icon: 'ri-phone-line' },
    { label: 'Owner', value: ticket.assignedOwner, icon: 'ri-user-star-line' },
    { label: 'Submitted by', value: ticket.submittedBy || ticket.createdBy, icon: 'ri-send-plane-line' },
    { label: 'Updated', value: formatDateTime(ticket.updatedAt), icon: 'ri-refresh-line' },
  ].filter(item => item.value && item.value !== '-');

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ background: urgency.color }} />
        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold" style={{ background: type.bg, color: type.color }}>
                  <i className={`${type.icon} text-[10px]`} />
                  {titleCase(ticket.ticketType)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold" style={{ background: urgency.bg, color: urgency.color }}>
                  <i className={`${urgency.icon} text-[10px]`} />
                  {titleCase(ticket.urgency)}
                </span>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: status.bg, color: status.color }}>
                  {titleCase(ticket.status)}
                </span>
                {ticket.isArchived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">Archived</span>}
              </div>
              <h3 className="mt-2 truncate text-sm font-extrabold text-kbc-navy">{ticket.subject || 'Untitled support ticket'}</h3>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-slate-500">{formatDate(ticket.createdAt)}</p>
              <p className={`mt-1 text-[11px] font-bold ${isClosed ? 'text-slate-400' : 'text-emerald-600'}`}>
                {isClosed ? 'Closed' : 'Open'}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {detailItems.map(item => (
              <div key={item.label} className="rounded-md bg-slate-50 px-2.5 py-2 text-xs">
                <p className="flex items-center gap-1 font-bold text-slate-400"><i className={`${item.icon} text-slate-300`} />{item.label}</p>
                <p className="mt-0.5 break-words font-semibold text-slate-700">{item.value}</p>
              </div>
            ))}
          </div>

          {facts.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {facts.map(fact => (
                <div key={fact.label} className="rounded-md border border-gray-100 bg-white px-2.5 py-2 text-xs">
                  <p className="font-bold text-slate-400">{fact.label}</p>
                  <p className="mt-0.5 break-words font-extrabold text-kbc-navy">{fact.value}</p>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="mt-3 block w-full rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-blue-800">Notes</p>
              <span className="rounded-full bg-white/75 px-2 py-0.5 text-[11px] font-bold text-blue-700">{notesCount}</span>
            </div>
            {notes.length > 0 ? (
              <div className="mt-2 rounded-md bg-white px-2.5 py-2 text-xs shadow-sm">
                <p className="line-clamp-2 leading-5 text-slate-700">{latestNote?.note}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  Latest note. Click to view all notes.
                </p>
              </div>
            ) : (
              <p className="mt-2 rounded-md bg-white/70 px-2.5 py-2 text-xs font-semibold text-slate-400">
                No notes recorded yet.
              </p>
            )}
          </button>

          {(ticket.submittedBy || ticket.createdBy) && (
            <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-slate-400">
              Submitted by <span className="font-bold text-slate-600">{ticket.submittedBy || ticket.createdBy}</span>
            </p>
          )}
        </div>
      </div>

      {notesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[3px]" onClick={() => setNotesOpen(false)} />
          <div className="relative flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Notes</p>
                <h3 className="mt-1 truncate text-base font-extrabold text-kbc-navy">{ticket.subject || 'Support ticket'}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400">{ticket.fullName || 'Unknown learner'} - {notesCount} note{notesCount === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={() => setNotesOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <i className="ri-close-line text-lg" />
              </button>
            </div>
            <div className="overflow-y-auto bg-slate-50 p-4">
              {notes.length > 0 ? (
                <div className="space-y-3">
                  {notes.map((note, index) => (
                    <div key={note.id || `${ticket.id}-modal-note-${index}`} className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm shadow-sm">
                      <p className="leading-6 text-slate-700">{note.note}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-400">
                        {note.created_by || 'Unknown'}{note.created_at ? ` - ${formatDateTime(note.created_at)}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-400">
                  No notes recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function RiskRow({ item }: { item: RiskItem }) {
  const rag = ragStyle(item.rag);
  const sev = severityStyle(item.severity);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold" style={{ background: rag.bg, color: rag.color }}>
        {item.rag?.toUpperCase() || '?'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-gray-900">{item.risk || '-'}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {item.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{item.category}</span>}
          {item.severity && <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: sev.bg, color: sev.color }}>{item.severity}</span>}
          {item.ofstedArea && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600"><i className="ri-eye-line mr-0.5 text-[10px]" />{item.ofstedArea}</span>}
          {item.status && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-600">{item.status}</span>}
        </div>
        {item.owner && <p className="mt-1 text-xs text-gray-400"><i className="ri-user-line mr-0.5" />Owner: <span className="font-semibold text-gray-600">{item.owner}</span></p>}
      </div>
    </div>
  );
}

export default function RiskRegisterPage() {
  const location = useLocation();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [risksLoading, setRisksLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [risksError, setRisksError] = useState<string | null>(null);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketUrgency, setTicketUrgency] = useState('');
  const [ticketType, setTicketType] = useState('');
  const [ticketState, setTicketState] = useState<'all' | 'open' | 'closed'>('all');
  const [riskSearch, setRiskSearch] = useState('');
  const [riskCategoryFilter, setRiskCategoryFilter] = useState('');

  useEffect(() => {
    fetch('/api/risk-register/')
      .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
      .then((data: RiskItem[]) => setRisks(Array.isArray(data) ? data : []))
      .catch(error => setRisksError(String(error)))
      .finally(() => setRisksLoading(false));
  }, []);

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [location.hash, ticketsLoading, risksLoading]);

  const ticketUrgencies = useMemo(() => uniqueValues(tickets, 'urgency'), [tickets]);
  const ticketTypes = useMemo(() => uniqueValues(tickets, 'ticketType'), [tickets]);

  const ticketStats = useMemo(() => {
    const open = tickets.filter(ticket => !isSupportTicketClosed(ticket.status)).length;
    const closed = tickets.filter(ticket => isSupportTicketClosed(ticket.status)).length;
    const urgentHighOpen = tickets.filter(ticket => ['urgent', 'high'].includes(normalize(ticket.urgency)) && !isSupportTicketClosed(ticket.status)).length;
    const safeguarding = tickets.filter(ticket => normalize(ticket.ticketType) === 'safeguarding').length;
    return { total: tickets.length, open, closed, urgentHighOpen, safeguarding };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const query = normalize(ticketSearch);
    return tickets.filter(ticket => {
      const haystack = [
        ticket.subject,
        ticket.details,
        ticket.fullName,
        ticket.email,
        ticket.assignedOwner || '',
        ticket.submittedBy,
      ].join(' ').toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (ticketUrgency && normalize(ticket.urgency) !== normalize(ticketUrgency)) return false;
      if (ticketType && normalize(ticket.ticketType) !== normalize(ticketType)) return false;
      if (ticketState === 'open' && isSupportTicketClosed(ticket.status)) return false;
      if (ticketState === 'closed' && !isSupportTicketClosed(ticket.status)) return false;
      return true;
    });
  }, [tickets, ticketSearch, ticketUrgency, ticketType, ticketState]);

  const riskCategories = useMemo(() => Array.from(new Set(risks.map(risk => risk.category).filter(Boolean))).sort(), [risks]);
  const filteredRisks = useMemo(() => {
    const query = normalize(riskSearch);
    return risks.filter(risk => {
      const matchSearch = !query || [risk.risk, risk.category, risk.ofstedArea, risk.owner].join(' ').toLowerCase().includes(query);
      const matchCategory = !riskCategoryFilter || risk.category === riskCategoryFilter;
      return matchSearch && matchCategory;
    });
  }, [risks, riskSearch, riskCategoryFilter]);

  const ragCounts = useMemo(() => {
    const counts = { R: 0, A: 0, G: 0, '?': 0 };
    risks.forEach(risk => {
      const key = ragKey(risk.rag);
      if (key === 'R' || key === 'A' || key === 'G') counts[key]++;
      else counts['?']++;
    });
    return counts;
  }, [risks]);

  const clearTicketFilters = () => {
    setTicketSearch('');
    setTicketUrgency('');
    setTicketType('');
    setTicketState('all');
  };
  const hasTicketFilters = Boolean(ticketSearch || ticketUrgency || ticketType || ticketState !== 'all');

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans">
      <TopNav />

      <main className="mx-auto w-full max-w-screen-2xl flex-1 space-y-6 px-4 py-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kbc-navy text-white">
              <i className="ri-error-warning-line text-base" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-none text-gray-950">Ofsted Risk Register</h1>
              <p className="mt-1 text-xs text-gray-400">Risk items, RAG status, and owners</p>
            </div>
          </div>
        </div>

        <section id="ofsted-risk-register" className="scroll-mt-24 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <i className="ri-list-check-3" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-kbc-navy">Ofsted Risk Register</h2>
                  <p className="text-xs text-gray-400">Risk items, RAG status, and owners</p>
                </div>
              </div>
              {!risksLoading && !risksError && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-600">{risks.length} items</span>}
            </div>
          </div>

          <div className="space-y-4 p-4">
            {!risksLoading && !risksError && risks.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {([['R', 'Red', '#DC2626', '#FEE2E2'], ['A', 'Amber', '#D97706', '#FEF3C7'], ['G', 'Green', '#059669', '#D1FAE5']] as const).map(([key, label, color, bg]) => (
                    <div key={key} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ background: bg, borderColor: `${color}30` }}>
                      <span className="text-lg font-extrabold leading-none" style={{ color }}>{ragCounts[key]}</span>
                      <span className="text-xs font-bold" style={{ color }}>{label}</span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 rounded-lg border border-gray-100 bg-slate-50/70 p-3">
                  <div className="relative">
                    <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-300" />
                    <input value={riskSearch} onChange={event => setRiskSearch(event.target.value)} placeholder="Search risks..." className="h-10 w-64 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-300" />
                  </div>
                  {riskCategories.length > 0 && (
                    <select value={riskCategoryFilter} onChange={event => setRiskCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-300">
                      <option value="">All Categories</option>
                      {riskCategories.map(category => <option key={category} value={category}>{category}</option>)}
                    </select>
                  )}
                  {(riskSearch || riskCategoryFilter) && (
                    <button type="button" onClick={() => { setRiskSearch(''); setRiskCategoryFilter(''); }} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-extrabold text-slate-500 hover:bg-gray-50">
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}

            {risksLoading ? (
              <Skeleton rows={5} />
            ) : risksError ? (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                <i className="ri-error-warning-line mr-1" /> {risksError}
              </div>
            ) : risks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
                <i className="ri-list-check-3 mb-2 text-3xl text-gray-300" />
                <p className="text-sm font-bold text-gray-500">No risks recorded yet</p>
              </div>
            ) : filteredRisks.length === 0 ? (
              <div className="py-8 text-center text-sm font-semibold text-gray-400">No risks match your filters.</div>
            ) : (
              <div className="space-y-2">
                {filteredRisks.map(risk => <RiskRow key={risk.id} item={risk} />)}
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
