import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

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

function ragTone(rag: string): { bg: string; text: string; label: string } {
  switch (ragKey(rag)) {
    case 'R':
      return { bg: 'bg-red-50', text: 'text-red-600', label: 'RED' };
    case 'A':
      return { bg: 'bg-amber-50', text: 'text-amber-600', label: 'AMBER' };
    case 'G':
      return { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'GREEN' };
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-500', label: rag || '?' };
  }
}

export default function RiskSummary() {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch('/api/risk-register/', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(`HTTP ${response.status}`))
      .then((data: RiskItem[]) => {
        if (mounted) setRisks(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (mounted) setRisks([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const visibleRisks = useMemo(() => {
    const openRisks = risks.filter(risk => normalize(risk.status) !== 'closed');
    return (openRisks.length > 0 ? openRisks : risks).slice(0, 3);
  }, [risks]);

  const ragCounts = useMemo(() => {
    return risks.reduce(
      (counts, risk) => {
        const key = ragKey(risk.rag);
        if (key === 'R') counts.red += 1;
        if (key === 'A') counts.amber += 1;
        if (key === 'G') counts.green += 1;
        return counts;
      },
      { red: 0, amber: 0, green: 0 },
    );
  }, [risks]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-bold text-kbc-navy">Ofsted Risk Register</h3>
        <div className="flex items-center gap-2">
          {!loading && risks.length > 0 && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-blue-600">
              {risks.length} items
            </span>
          )}
          <Link to="/risk-register#ofsted-risk-register" className="text-xs text-kbc-navy hover:underline">
            Register &rsaquo;
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 px-4 py-5">
          {[0, 1, 2].map(item => (
            <div key={item} className="animate-pulse rounded-lg border border-gray-100 bg-white px-3 py-3">
              <div className="h-4 w-3/4 rounded-full bg-slate-100" />
              <div className="mt-3 flex gap-2">
                <div className="h-5 w-14 rounded-full bg-slate-100" />
                <div className="h-5 w-20 rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : risks.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            <div className="rounded-md bg-red-50 px-2 py-2 text-center">
              <p className="text-base font-extrabold text-red-600">{ragCounts.red}</p>
              <p className="text-[11px] font-bold text-red-500">Red</p>
            </div>
            <div className="rounded-md bg-amber-50 px-2 py-2 text-center">
              <p className="text-base font-extrabold text-amber-600">{ragCounts.amber}</p>
              <p className="text-[11px] font-bold text-amber-600">Amber</p>
            </div>
            <div className="rounded-md bg-emerald-50 px-2 py-2 text-center">
              <p className="text-base font-extrabold text-emerald-600">{ragCounts.green}</p>
              <p className="text-[11px] font-bold text-emerald-600">Green</p>
            </div>
          </div>

          <div className="divide-y divide-gray-50 border-t border-gray-100">
            {visibleRisks.map(risk => {
              const tone = ragTone(risk.rag);
              return (
                <Link
                  key={risk.id}
                  to="/risk-register#ofsted-risk-register"
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${tone.bg} ${tone.text}`}>
                    {tone.label}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-xs font-extrabold leading-5 text-kbc-navy">{risk.risk || 'Untitled risk'}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {risk.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{risk.category}</span>}
                      {risk.severity && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-500">{risk.severity}</span>}
                      {risk.status && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-600">{risk.status}</span>}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <div className="px-4 py-8 text-center text-gray-400">
          <i className="ri-list-check-3 mb-2 block text-3xl text-gray-300" />
          <p className="text-xs font-semibold">No Ofsted Risk Register yet</p>
        </div>
      )}

      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">
        <Link
          to="/risk-register#ofsted-risk-register"
          className="flex items-center justify-center gap-1 text-xs font-medium text-kbc-navy hover:underline"
        >
          View Ofsted Risk Register &rsaquo;
        </Link>
      </div>
    </div>
  );
}
