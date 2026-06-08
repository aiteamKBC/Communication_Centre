import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type PolicyCategory = {
  name: string;
  count: number;
};

type DocumentsSummaryResponse = {
  total?: number;
  categories?: PolicyCategory[];
};

const POLICIES_SUMMARY_CACHE_KEY = 'kbc-policies-summary-v3';

const categoryDots = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-fuchsia-500',
  'bg-cyan-500',
  'bg-rose-500',
  'bg-indigo-500',
];

export default function PrioritySnapshot() {
  const [categories, setCategories] = useState<PolicyCategory[]>(() => {
    try {
      const cached = sessionStorage.getItem(POLICIES_SUMMARY_CACHE_KEY);
      if (!cached) return [];
      const parsed = JSON.parse(cached) as DocumentsSummaryResponse;
      return Array.isArray(parsed.categories) ? parsed.categories : [];
    } catch {
      return [];
    }
  });
  const [summaryTotal, setSummaryTotal] = useState<number | null>(() => {
    try {
      const cached = sessionStorage.getItem(POLICIES_SUMMARY_CACHE_KEY);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as DocumentsSummaryResponse;
      return typeof parsed.total === 'number' ? parsed.total : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadPolicies() {
      try {
        const response = await fetch('/api/documents-summary/');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error('Unable to load policies.');
        const summary = payload as DocumentsSummaryResponse;
        if (Array.isArray(summary.categories)) {
          sessionStorage.setItem(POLICIES_SUMMARY_CACHE_KEY, JSON.stringify(summary));
          if (mounted) setCategories(summary.categories);
        }
        if (typeof summary.total === 'number' && mounted) {
          setSummaryTotal(summary.total);
        }
      } catch {
        if (mounted) setCategories(previous => previous);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadPolicies();

    return () => {
      mounted = false;
    };
  }, []);

  const totalPolicies = useMemo(() => (
    summaryTotal ?? categories.reduce((total, category) => total + category.count, 0)
  ), [categories, summaryTotal]);
  const hasCachedCategories = categories.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-kbc-navy">Policies</h3>
        <Link to="/documents" className="text-xs text-kbc-navy hover:underline cursor-pointer whitespace-nowrap">
          Full view &rsaquo;
        </Link>
      </div>

      <div className="px-4 py-4">
        <Link to="/documents" className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 transition-colors hover:bg-slate-100">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-kbc-navy text-white">
              <i className="ri-file-list-3-line text-sm" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-kbc-navy">All Documents</p>
              <p className="text-xs text-gray-400">
                {loading && !hasCachedCategories ? 'Loading policies...' : `${totalPolicies} documents`}
              </p>
            </div>
          </div>
          <span className="ml-3 shrink-0 rounded-full bg-white px-2 py-1 text-xs font-bold text-kbc-navy ring-1 ring-slate-200">
            {loading && !hasCachedCategories ? '...' : totalPolicies}
          </span>
        </Link>

        {loading && !hasCachedCategories ? (
          <div className="space-y-2">
            {[0, 1, 2].map(item => (
              <div key={item} className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-3 flex-1 rounded-full bg-slate-200 animate-pulse" />
                <span className="h-3 w-8 rounded-full bg-slate-200 animate-pulse" />
              </div>
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categories.map((category, index) => (
              <Link
                key={category.name}
                to={`/documents?folder=${encodeURIComponent(category.name)}`}
                className="flex min-h-9 items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${categoryDots[index % categoryDots.length]}`} />
                  <span className="truncate text-[11px] font-semibold text-gray-700">{category.name}</span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-50 px-1.5 py-0.5 text-[11px] font-extrabold text-kbc-navy">
                  {category.count}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center">
            <i className="ri-file-search-line text-2xl text-gray-300" />
            <p className="mt-2 text-xs font-semibold text-gray-400">No policy categories found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
