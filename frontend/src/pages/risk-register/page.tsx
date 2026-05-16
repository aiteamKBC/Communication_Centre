import { useEffect, useState } from 'react';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UrgentTicket {
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
  submittedBy: string;
  createdBy: string;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function ragStyle(rag: string): { bg: string; color: string; label: string } {
  switch (rag?.toUpperCase()) {
    case 'R': return { bg: '#FEE2E2', color: '#DC2626', label: 'Red' };
    case 'A': return { bg: '#FEF3C7', color: '#D97706', label: 'Amber' };
    case 'G': return { bg: '#D1FAE5', color: '#059669', label: 'Green' };
    default:  return { bg: '#F1F5F9', color: '#64748B', label: rag || '—' };
  }
}

function severityStyle(s: string): { bg: string; color: string } {
  switch (s?.toLowerCase()) {
    case 'high':     return { bg: '#FEE2E2', color: '#DC2626' };
    case 'medium':   return { bg: '#FEF3C7', color: '#D97706' };
    case 'low':      return { bg: '#D1FAE5', color: '#059669' };
    default:         return { bg: '#F1F5F9', color: '#64748B' };
  }
}

function ticketTypeStyle(t: string): { bg: string; color: string; icon: string } {
  switch (t?.toLowerCase()) {
    case 'safeguarding': return { bg: '#FEE2E2', color: '#DC2626', icon: 'ri-shield-cross-line' };
    case 'wellbeing':    return { bg: '#EDE9FE', color: '#7C3AED', icon: 'ri-heart-pulse-line' };
    default:             return { bg: '#F1F5F9', color: '#64748B', icon: 'ri-file-warning-line' };
  }
}

function statusStyle(s: string): { bg: string; color: string } {
  const lower = s?.toLowerCase() || '';
  if (lower.includes('closed'))   return { bg: '#D1FAE5', color: '#059669' };
  if (lower.includes('open'))     return { bg: '#DBEAFE', color: '#2563EB' };
  if (lower.includes('referral')) return { bg: '#FEF3C7', color: '#D97706' };
  return { bg: '#F1F5F9', color: '#64748B' };
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  );
}

// ── Ticket card ───────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: UrgentTicket }) {
  const [expanded, setExpanded] = useState(false);
  const tt = ticketTypeStyle(ticket.ticketType);
  const ss = statusStyle(ticket.status);

  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        {/* left accent */}
        <div className="w-1 self-stretch rounded-full bg-red-400 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: tt.bg, color: tt.color }}>
                <i className={`${tt.icon} text-[10px]`} />
                {ticket.ticketType || 'Unknown'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: ss.bg, color: ss.color }}>
                {ticket.status || '—'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                <i className="ri-alarm-warning-line text-[10px]" /> Urgent
              </span>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{formatDate(ticket.createdAt)}</span>
          </div>

          <p className="font-bold text-gray-900 text-sm mt-1.5 leading-snug">{ticket.subject || '—'}</p>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <i className="ri-user-line text-gray-300" />{ticket.fullName || '—'}
            </span>
            {ticket.email && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <i className="ri-mail-line text-gray-300" />{ticket.email}
              </span>
            )}
            {ticket.preferredContact && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <i className="ri-phone-line text-gray-300" />{ticket.preferredContact}
              </span>
            )}
          </div>

          {ticket.details && (
            <div className="mt-2">
              <p className={`text-xs text-gray-500 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                {ticket.details}
              </p>
              {ticket.details.length > 120 && (
                <button onClick={() => setExpanded(e => !e)}
                  className="text-xs text-blue-500 font-semibold mt-0.5 hover:underline">
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {(ticket.submittedBy || ticket.createdBy) && (
            <p className="text-xs text-gray-400 mt-2">
              Submitted by: <span className="font-semibold text-gray-600">{ticket.submittedBy || ticket.createdBy}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Risk row ──────────────────────────────────────────────────────────────────

function RiskRow({ item }: { item: RiskItem }) {
  const rag = ragStyle(item.rag);
  const sev = severityStyle(item.severity);

  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* RAG pill */}
      <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-sm"
        style={{ background: rag.bg, color: rag.color }}>
        {item.rag?.toUpperCase() || '?'}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 leading-snug">{item.risk || '—'}</p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {item.category && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              {item.category}
            </span>
          )}
          {item.severity && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: sev.bg, color: sev.color }}>
              {item.severity}
            </span>
          )}
          {item.ofstedArea && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
              <i className="ri-eye-line mr-0.5 text-[10px]" />{item.ofstedArea}
            </span>
          )}
          {item.status && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-600">
              {item.status}
            </span>
          )}
        </div>
        {item.owner && (
          <p className="text-xs text-gray-400 mt-1">
            <i className="ri-user-line mr-0.5" />Owner: <span className="font-semibold text-gray-600">{item.owner}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RiskRegisterPage() {
  const [tickets, setTickets] = useState<UrgentTicket[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [risksLoading, setRisksLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [risksError, setRisksError] = useState<string | null>(null);
  const [riskSearch, setRiskSearch] = useState('');
  const [riskCategoryFilter, setRiskCategoryFilter] = useState('');

  useEffect(() => {
    fetch('/api/urgent-tickets/')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((data: UrgentTicket[]) => setTickets(data))
      .catch(e => setTicketsError(String(e)))
      .finally(() => setTicketsLoading(false));

    fetch('/api/risk-register/')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((data: RiskItem[]) => setRisks(data))
      .catch(e => setRisksError(String(e)))
      .finally(() => setRisksLoading(false));
  }, []);

  const riskCategories = [...new Set(risks.map(r => r.category).filter(Boolean))].sort();

  const filteredRisks = risks.filter(r => {
    const q = riskSearch.toLowerCase();
    const matchSearch = !q || r.risk.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.ofstedArea.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q);
    const matchCat = !riskCategoryFilter || r.category === riskCategoryFilter;
    return matchSearch && matchCat;
  });

  const ragCounts = { R: 0, A: 0, G: 0, '?': 0 };
  risks.forEach(r => {
    const key = r.rag?.toUpperCase();
    if (key === 'R' || key === 'A' || key === 'G') ragCounts[key]++;
    else ragCounts['?']++;
  });

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />

      <div className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-6 space-y-8">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#1B2A4A' }}>
            <i className="ri-error-warning-line text-white" style={{ fontSize: '16px' }} />
          </div>
          <div>
            <h1 className="font-extrabold text-gray-900 text-lg leading-none">Risk Register</h1>
            <p className="text-gray-400 text-xs mt-0.5">Live risk data and urgent safeguarding alerts</p>
          </div>
        </div>

        {/* ── Section 1: Urgent safeguarding tickets ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-red-100">
              <i className="ri-shield-cross-line text-red-600" style={{ fontSize: '12px' }} />
            </div>
            <h2 className="font-extrabold text-gray-800 text-sm">Urgent Safeguarding Tickets</h2>
            {!ticketsLoading && !ticketsError && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                {tickets.length}
              </span>
            )}
          </div>

          {ticketsLoading ? (
            <Skeleton rows={2} />
          ) : ticketsError ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
              <i className="ri-error-warning-line" /> {ticketsError}
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
              <i className="ri-shield-check-line text-3xl mb-2 text-green-400" />
              <p className="text-sm font-semibold text-gray-500">No urgent tickets</p>
              <p className="text-xs mt-1">All safeguarding tickets are at normal urgency</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {tickets.map(t => <TicketCard key={t.id} ticket={t} />)}
            </div>
          )}
        </section>

        {/* ── Section 2: Risk register ── */}
        <section>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-blue-100">
              <i className="ri-list-check-3 text-blue-600" style={{ fontSize: '12px' }} />
            </div>
            <h2 className="font-extrabold text-gray-800 text-sm">Ofsted Risk Register</h2>
            {!risksLoading && !risksError && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-600">
                {risks.length} items
              </span>
            )}
          </div>

          {/* RAG summary */}
          {!risksLoading && !risksError && risks.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {([['R', 'Red', '#DC2626', '#FEE2E2'], ['A', 'Amber', '#D97706', '#FEF3C7'], ['G', 'Green', '#059669', '#D1FAE5']] as const).map(([k, label, color, bg]) => (
                <div key={k} className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                  style={{ background: bg, borderColor: `${color}30` }}>
                  <span className="font-extrabold text-lg leading-none" style={{ color }}>{ragCounts[k]}</span>
                  <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          {!risksLoading && !risksError && risks.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              <div className="relative">
                <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-xs" />
                <input
                  value={riskSearch}
                  onChange={e => setRiskSearch(e.target.value)}
                  placeholder="Search risks…"
                  className="border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-xs outline-none focus:border-blue-300 bg-white"
                  style={{ width: 200 }}
                />
              </div>
              {riskCategories.length > 0 && (
                <select
                  value={riskCategoryFilter}
                  onChange={e => setRiskCategoryFilter(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white outline-none focus:border-blue-300 text-gray-600"
                >
                  <option value="">All Categories</option>
                  {riskCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {(riskSearch || riskCategoryFilter) && (
                <button
                  onClick={() => { setRiskSearch(''); setRiskCategoryFilter(''); }}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-gray-600 border border-gray-200 bg-white"
                >
                  <i className="ri-close-line" /> Clear
                </button>
              )}
            </div>
          )}

          {risksLoading ? (
            <Skeleton rows={5} />
          ) : risksError ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
              <i className="ri-error-warning-line" /> {risksError}
            </div>
          ) : risks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
              <i className="ri-list-check-3 text-3xl mb-2" />
              <p className="text-sm font-semibold text-gray-500">No risks recorded yet</p>
            </div>
          ) : filteredRisks.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No risks match your filters</div>
          ) : (
            <div className="space-y-2">
              {filteredRisks.map(r => <RiskRow key={r.id} item={r} />)}
            </div>
          )}
        </section>
      </div>

      <Footer />
    </div>
  );
}
