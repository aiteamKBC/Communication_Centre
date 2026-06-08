import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type SupportTicketRiskItem = {
  id: number;
  ticketType?: string;
  fullName?: string;
  subject?: string;
  details?: string;
  urgency?: string;
  status?: string;
  createdAt?: string;
  assignedOwner?: string;
  submittedBy?: string;
};

function normalize(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function isOpenTicket(item: SupportTicketRiskItem): boolean {
  const status = normalize(item.status);
  return status !== 'closed' && status !== 'outcome recorded';
}

function riskPriority(item: SupportTicketRiskItem): number {
  const urgency = normalize(item.urgency);
  if (urgency === 'urgent') return 0;
  if (urgency === 'high') return 1;
  return 2;
}

function sortRiskTickets(a: SupportTicketRiskItem, b: SupportTicketRiskItem): number {
  const priorityDiff = riskPriority(a) - riskPriority(b);
  if (priorityDiff !== 0) return priorityDiff;
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function extractRiskLevel(details?: string): string {
  const match = (details || '').match(/Risk Level:\s*(.*?)(?=\s+Total Score:|\s+Trigger Count:|\s+Programme:|$)/i);
  return match?.[1]?.trim() || '';
}

export default function RiskSummary() {
  const [tickets, setTickets] = useState<SupportTicketRiskItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    fetch('/api/urgent-tickets/')
      .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
      .then((data: SupportTicketRiskItem[]) => {
        if (!mounted) return;
        setTickets(Array.isArray(data) ? data.filter(isOpenTicket).sort(sortRiskTickets) : []);
      })
      .catch(reason => {
        if (!mounted) return;
        setError(String(reason));
        setTickets([]);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setActiveIndex(current => {
      if (tickets.length === 0) return 0;
      return Math.min(current, tickets.length - 1);
    });
  }, [tickets.length]);

  const hasMultipleSlides = tickets.length > 1;
  const currentTicket = tickets[activeIndex];

  const goToPreviousSlide = () => {
    if (!hasMultipleSlides) return;
    setActiveIndex(current => (current - 1 + tickets.length) % tickets.length);
  };

  const goToNextSlide = () => {
    if (!hasMultipleSlides) return;
    setActiveIndex(current => (current + 1) % tickets.length);
  };

  useEffect(() => {
    if (!hasMultipleSlides || isPaused) return;

    const interval = window.setInterval(() => {
      setActiveIndex(current => (current + 1) % tickets.length);
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, [hasMultipleSlides, isPaused, tickets.length]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-gray-200 bg-white"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-bold text-kbc-navy">Open Risk Register</h3>
        <div className="flex items-center gap-2">
          <Link to="/risk-register#student-support" className="text-xs text-kbc-navy hover:underline cursor-pointer whitespace-nowrap">
            Register &rsaquo;
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToPreviousSlide}
              disabled={!hasMultipleSlides}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-gray-200 text-gray-400 transition-colors hover:border-kbc-navy hover:text-kbc-navy disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous urgent risk"
            >
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <button
              type="button"
              onClick={goToNextSlide}
              disabled={!hasMultipleSlides}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-gray-200 text-gray-400 transition-colors hover:border-kbc-navy hover:text-kbc-navy disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next urgent risk"
            >
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="px-4 py-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.22)]">
            <div className="mb-3 flex items-start gap-3">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-slate-100" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="h-4 w-3/5 animate-pulse rounded-full bg-slate-100" />
                  <div className="h-5 w-14 animate-pulse rounded-md bg-slate-100" />
                </div>
                <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex gap-2">
                <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
                <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
              </div>
              <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        </div>
      ) : currentTicket ? (
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {tickets.map(ticket => {
              const riskLevel = extractRiskLevel(ticket.details);
              const urgency = ticket.urgency?.trim() || 'Open';
              const urgencyTone = normalize(urgency);

              return (
                <div key={ticket.id} className="min-w-full px-4 py-4">
                  <Link
                    to="/risk-register#student-support"
                    className="group block rounded-2xl border border-red-100 bg-[linear-gradient(180deg,#fff7f7_0%,#ffffff_100%)] p-4 shadow-[0_16px_34px_-26px_rgba(220,38,38,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-[0_20px_40px_-24px_rgba(220,38,38,0.42)]"
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-inner">
                        <i className="ri-alarm-warning-line text-base" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="line-clamp-2 flex-1 text-sm font-bold leading-snug text-kbc-navy transition-colors duration-300 group-hover:text-kbc-navy-light">
                            {ticket.subject || 'Untitled urgent risk'}
                          </p>
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${urgencyTone === 'urgent' ? 'bg-kbc-red text-white' : urgencyTone === 'high' ? 'bg-kbc-amber text-kbc-navy' : 'bg-slate-100 text-slate-600'}`}>
                            {urgency}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs leading-6 text-slate-500">
                          {ticket.fullName ? `${ticket.fullName}${ticket.details ? ' - ' : ''}` : ''}{ticket.details || 'No details recorded.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-100/70 pt-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {ticket.ticketType && (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                            {ticket.ticketType}
                          </span>
                        )}
                        {riskLevel && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                            Risk: {riskLevel}
                          </span>
                        )}
                        {ticket.status && (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
                            {ticket.status}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-slate-400">
                        {formatDate(ticket.createdAt)}
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-gray-400">
          <i className="ri-shield-check-line mb-2 block text-3xl text-green-400" />
          <p className="text-xs font-semibold">No open risks in the register</p>
        </div>
      )}

      {hasMultipleSlides && (
        <div className="flex items-center justify-center gap-1.5 px-4 pb-3">
          {tickets.map((ticket, index) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-kbc-navy' : 'w-2.5 bg-slate-200 hover:bg-slate-300'}`}
              aria-label={`Go to urgent risk slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">
        <Link
          to="/risk-register#student-support"
          className="flex cursor-pointer items-center justify-center gap-1 text-xs font-medium text-kbc-navy hover:underline"
        >
          View Risk Register &rsaquo;
        </Link>
      </div>
    </div>
  );
}
