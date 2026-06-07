import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type RiskSummaryCounts = {
  tickets: number | null;
  risks: number | null;
};

export default function RiskSummary() {
  const [counts, setCounts] = useState<RiskSummaryCounts>({ tickets: null, risks: null });

  useEffect(() => {
    let mounted = true;

    async function loadCounts() {
      const [ticketsResult, risksResult] = await Promise.allSettled([
        fetch('/api/support-tickets/').then(response => response.ok ? response.json() : Promise.reject()),
        fetch('/api/risk-register/').then(response => response.ok ? response.json() : Promise.reject()),
      ]);

      if (!mounted) return;

      setCounts({
        tickets: ticketsResult.status === 'fulfilled' && Array.isArray(ticketsResult.value) ? ticketsResult.value.length : null,
        risks: risksResult.status === 'fulfilled' && Array.isArray(risksResult.value) ? risksResult.value.length : null,
      });
    }

    void loadCounts();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-kbc-navy">Risk &amp; Issues Overview</h3>
        <Link to="/risk-register" className="text-xs text-kbc-navy hover:underline cursor-pointer whitespace-nowrap">
          Register &rsaquo;
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
        <Link
          to="/risk-register#student-support"
          className="group flex min-h-28 flex-col justify-between rounded-lg border border-red-100 bg-red-50/60 px-4 py-3 text-left transition-all hover:border-red-200 hover:bg-red-50 hover:shadow-sm"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <i className="ri-shield-cross-line text-base" />
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-extrabold text-red-600 ring-1 ring-red-100">
              {counts.tickets ?? 'View'}
            </span>
          </span>
          <span>
            <span className="block text-sm font-extrabold text-kbc-navy">Student Support Tickets</span>
            <span className="mt-1 block text-xs leading-5 text-gray-500">View all safeguarding and wellbeing support tickets.</span>
          </span>
          <span className="mt-2 text-xs font-bold text-red-600 group-hover:underline">View support &rsaquo;</span>
        </Link>

        <Link
          to="/risk-register#ofsted-risk-register"
          className="group flex min-h-28 flex-col justify-between rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <i className="ri-list-check-3 text-base" />
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-extrabold text-blue-600 ring-1 ring-blue-100">
              {counts.risks === null ? 'View' : `${counts.risks} items`}
            </span>
          </span>
          <span>
            <span className="block text-sm font-extrabold text-kbc-navy">Ofsted Risk Register</span>
            <span className="mt-1 block text-xs leading-5 text-gray-500">Review Ofsted risk items, RAG status, and owners.</span>
          </span>
          <span className="mt-2 text-xs font-bold text-blue-600 group-hover:underline">View register &rsaquo;</span>
        </Link>
      </div>
    </div>
  );
}
