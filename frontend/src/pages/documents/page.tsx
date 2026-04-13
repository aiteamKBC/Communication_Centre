import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';

// ─── Types ────────────────────────────────────────────────────────────────────

type DriveNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  webUrl: string;
  lastModifiedDateTime: string;
  size: number;
  extension: string;
  mimeType: string;
  children: DriveNode[];
};

type DocumentsApiResponse = {
  fetchedAt: string;
  source: {
    host: string;
    sitePath: string;
    drivePath: string;
    siteName: string;
    siteWebUrl: string;
    folderWebUrl: string;
  };
  root: DriveNode;
};

type DocCategory = 'Public' | 'Internal' | 'Confidential';

type PolicyDocument = {
  id: string;
  title: string;
  rawName: string;
  /** Name of the top-level SharePoint folder this file lives under */
  topFolder: string;
  category: DocCategory;
  /** Immediate sub-folder under topFolder, used as department label */
  department: string;
  version: string;
  issueDate: string;
  reviewDate: string;
  size: number;
  extension: string;
  webUrl: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatShortDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function detectCategory(ancestorFolders: string[], filename: string): DocCategory {
  const combined = [...ancestorFolders, filename].join(' ').toLowerCase();
  if (/confidential/i.test(combined)) return 'Confidential';
  if (/\bpublic\b/i.test(combined)) return 'Public';
  return 'Internal';
}

function extractVersion(filename: string): string {
  const m =
    filename.match(/(?:^|[\s(_-])v(\d+(?:\.\d+)*)(?:[\s)_-]|$)/i) ??
    filename.match(/version\s*(\d+(?:\.\d+)*)/i);
  return m ? `v${m[1]}` : 'v1.0';
}

function estimateReviewDate(issueDateStr: string): string {
  if (!issueDateStr || issueDateStr === '—') return '—';
  const d = new Date(issueDateStr);
  if (Number.isNaN(d.getTime())) return '—';
  d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Flatten the SharePoint drive tree into a flat list of PolicyDocuments.
 *
 * ancestorFolders = folder names from the root's direct child down to the
 * current node's parent (root itself is excluded so the first element is
 * always the "top-level" folder that becomes a tab).
 */
function flattenTree(node: DriveNode, ancestorFolders: string[] = []): PolicyDocument[] {
  if (node.type === 'file') {
    const title = node.name.replace(/\.[^/.]+$/, '');
    const issueDate = formatShortDate(node.lastModifiedDateTime);
    // department = sub-folder directly under topFolder (if any)
    const department = ancestorFolders.length > 1
      ? ancestorFolders[ancestorFolders.length - 1]
      : '';
    return [{
      id: node.id,
      title,
      rawName: node.name,
      topFolder: ancestorFolders[0] ?? '—',
      category: detectCategory(ancestorFolders, node.name),
      department,
      version: extractVersion(node.name),
      issueDate,
      reviewDate: estimateReviewDate(node.lastModifiedDateTime),
      size: node.size,
      extension: node.extension,
      webUrl: node.webUrl,
    }];
  }

  const isRoot = ancestorFolders.length === 0;

  return node.children.flatMap(child => {
    if (isRoot) {
      // Root's direct folder children → each starts its own path segment
      const childAncestors = child.type === 'folder' ? [child.name] : [];
      return flattenTree(child, childAncestors);
    }
    // Deeper levels → append current folder to ancestor list before recursing
    const childAncestors =
      child.type === 'folder'
        ? [...ancestorFolders, child.name]
        : ancestorFolders;
    return flattenTree(child, childAncestors);
  });
}

// ─── UI config ────────────────────────────────────────────────────────────────

const categoryConfig: Record<DocCategory, { dot: string; badge: string }> = {
  Public:       { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  Internal:     { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border border-blue-200' },
  Confidential: { dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border border-red-200' },
};

const accentByCategory: Record<DocCategory, string> = {
  Public:       'bg-emerald-400',
  Internal:     'bg-blue-400',
  Confidential: 'bg-red-400',
};

const CATEGORIES: Array<DocCategory | 'All'> = ['All', 'Public', 'Internal', 'Confidential'];

// ─── Document Card ────────────────────────────────────────────────────────────

function PolicyCard({ doc }: { doc: PolicyDocument }) {
  const cat = categoryConfig[doc.category];

  return (
    <a
      href={doc.webUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl border border-gray-200 bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden cursor-pointer"
    >
      {/* Colour accent strip */}
      <div className={`h-1 w-full ${accentByCategory[doc.category]}`} />

      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Folder type + Category row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-kbc-navy flex items-center justify-center shrink-0">
            <i className="ri-file-text-line text-white text-sm" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase leading-tight truncate max-w-[110px]">
              {doc.topFolder}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit mt-0.5 ${cat.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
              {doc.category}
            </span>
          </div>
          {/* Department chip */}
          {doc.department && (
            <span className="ml-auto text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap max-w-[120px] truncate">
              {doc.department}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-kbc-navy leading-snug line-clamp-2 min-h-[2.5rem]">
          {doc.title}
        </h3>

        {/* Version */}
        <span className="text-xs font-semibold text-gray-500">{doc.version}</span>

        {/* Dates */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Issue Date</span>
            <span className="text-[11px] font-medium text-gray-600">{doc.issueDate}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Review Date</span>
            <span className="text-[11px] font-medium text-gray-600">{doc.reviewDate}</span>
          </div>
        </div>

        {/* File size */}
        <span className="text-[11px] text-gray-400">{formatBytes(doc.size)}</span>
      </div>

      {/* Card footer */}
      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between bg-gray-50/60">
        <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">
          {doc.extension ? doc.extension.toUpperCase() : 'FILE'}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-kbc-navy">
          <i className="ri-external-link-line text-sm" />
          Open
        </span>
      </div>
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [data, setData] = useState<DocumentsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'All'>('All');

  const loadDocuments = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const response = await fetch('/api/documents-live/');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.detail || 'Failed to load live documents from Microsoft Graph.');
      setData(payload as DocumentsApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load live documents.');
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments(true);
    const timer = window.setInterval(() => void loadDocuments(false), 30000);
    return () => window.clearInterval(timer);
  }, [loadDocuments]);

  // Top-level folder names from SharePoint (in SharePoint order)
  const topFolders = useMemo<string[]>(() => {
    if (!data?.root?.children) return [];
    return data.root.children
      .filter(n => n.type === 'folder')
      .map(n => n.name);
  }, [data]);

  // All flattened documents
  const allDocs = useMemo<PolicyDocument[]>(() => {
    if (!data?.root) return [];
    return flattenTree(data.root);
  }, [data]);

  // Per-folder counts
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allDocs.length };
    for (const doc of allDocs) {
      counts[doc.topFolder] = (counts[doc.topFolder] ?? 0) + 1;
    }
    return counts;
  }, [allDocs]);

  // Reset activeFolder if it no longer exists after a refresh
  useEffect(() => {
    if (activeFolder !== 'All' && topFolders.length > 0 && !topFolders.includes(activeFolder)) {
      setActiveFolder('All');
    }
  }, [topFolders, activeFolder]);

  // Filtered docs
  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allDocs.filter(doc => {
      if (activeFolder !== 'All' && doc.topFolder !== activeFolder) return false;
      if (activeCategory !== 'All' && doc.category !== activeCategory) return false;
      if (q && !doc.title.toLowerCase().includes(q) && !doc.department.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allDocs, activeFolder, activeCategory, search]);

  const tabs: string[] = ['All', ...topFolders];

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />

      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <Link to="/" className="hover:text-kbc-navy cursor-pointer">Home</Link>
            <span>/</span>
            <span className="text-kbc-navy font-medium">Policies</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
              <i className="ri-file-list-3-line text-white text-base" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-kbc-navy">Policies</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                Centralised repository for all institutional policies, procedures, templates, and forms.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar — dynamic from SharePoint top-level folders */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
          {loading && tabs.length === 1 ? (
            /* Skeleton tabs while first load */
            <div className="flex items-center gap-3 py-3 px-1">
              {[120, 90, 80, 100, 75].map(w => (
                <div key={w} className="h-4 rounded bg-gray-100 animate-pulse" style={{ width: w }} />
              ))}
            </div>
          ) : (
            tabs.map(tab => {
              const isAll = tab === 'All';
              const isActive = activeFolder === tab;
              const count = folderCounts[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveFolder(tab)}
                  className={`inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-kbc-navy text-kbc-navy'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <i className={`${isAll ? 'ri-file-list-3-line' : 'ri-folder-2-line'} text-base`} />
                  {isAll ? 'All Documents' : tab}
                  {count !== undefined && count > 0 && (
                    <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold min-w-[18px] ${
                      isActive ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto w-full flex-1 px-4 md:px-6 py-6">
        {/* Filter Bar */}
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 min-w-[220px] flex-1">
            <i className="ri-search-line text-gray-400 text-sm shrink-0" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-sm text-gray-700 outline-none placeholder-gray-400 w-full"
            />
          </div>

          <div className="w-px h-5 bg-gray-200 hidden sm:block" />

          <div className="flex items-center gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === cat
                    ? 'bg-kbc-navy text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-200 hidden sm:block" />

          <div className="flex items-center gap-3 ml-auto">
            {!loading && (
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadDocuments(false)}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-kbc-navy hover:bg-gray-50"
            >
              <i className={`ri-refresh-line text-sm ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
            <i className="ri-loader-4-line animate-spin text-2xl mb-3 block text-kbc-navy" />
            Loading documents from SharePoint...
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <div className="flex items-start gap-3">
              <i className="ri-error-warning-line text-red-500 text-xl mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Unable to load documents</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            </div>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
            <i className="ri-file-search-line text-3xl mb-3 block text-gray-300" />
            No documents match your current filters.
          </div>
        ) : (
          <>
            {data?.source?.siteName && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-kbc-navy/10 text-kbc-navy px-2.5 py-1 text-xs font-semibold">
                  <i className="ri-link-m text-sm" />
                  {data.source.siteName}
                </span>
                {data.source.folderWebUrl && (
                  <a
                    href={data.source.folderWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-kbc-navy hover:underline"
                  >
                    Open in SharePoint →
                  </a>
                )}
                <span className="ml-auto text-xs text-gray-400">
                  Updated {formatShortDate(data.fetchedAt)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map(doc => (
                <PolicyCard key={doc.id} doc={doc} />
              ))}
            </div>
          </>
        )}
      </main>

      <Footer compact />
    </div>
  );
}
