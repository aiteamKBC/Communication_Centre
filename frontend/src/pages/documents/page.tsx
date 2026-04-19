import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ModernSelect from '../../components/feature/ModernSelect';

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

type FolderTheme = {
  accent: string;
  soft: string;
  text: string;
  border: string;
  dot: string;
  badge: string;
  selectButton: string;
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

const CATEGORIES: Array<DocCategory | 'All'> = ['All', 'Public', 'Internal', 'Confidential'];

const filterCardStyles: Record<DocCategory | 'All', { active: string; idle: string; dot: string }> = {
  All: {
    active: 'border-kbc-navy bg-kbc-navy text-white shadow-sm shadow-kbc-navy/20',
    idle: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100',
    dot: 'bg-kbc-navy',
  },
  Public: {
    active: 'border-emerald-300 bg-emerald-500 text-white shadow-sm shadow-emerald-500/20',
    idle: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    dot: 'bg-emerald-500',
  },
  Internal: {
    active: 'border-blue-300 bg-blue-500 text-white shadow-sm shadow-blue-500/20',
    idle: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
    dot: 'bg-blue-500',
  },
  Confidential: {
    active: 'border-red-300 bg-red-500 text-white shadow-sm shadow-red-500/20',
    idle: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    dot: 'bg-red-500',
  },
};

const folderThemePalette: FolderTheme[] = [
  {
    accent: 'bg-sky-500',
    soft: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
    badge: 'bg-sky-100 text-sky-700',
    selectButton: 'border-sky-200 bg-sky-50/70 text-sky-900',
  },
  {
    accent: 'bg-emerald-500',
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    selectButton: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
  },
  {
    accent: 'bg-amber-500',
    soft: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    selectButton: 'border-amber-200 bg-amber-50/70 text-amber-900',
  },
  {
    accent: 'bg-fuchsia-500',
    soft: 'bg-fuchsia-50',
    text: 'text-fuchsia-700',
    border: 'border-fuchsia-200',
    dot: 'bg-fuchsia-500',
    badge: 'bg-fuchsia-100 text-fuchsia-700',
    selectButton: 'border-fuchsia-200 bg-fuchsia-50/70 text-fuchsia-900',
  },
  {
    accent: 'bg-cyan-500',
    soft: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    dot: 'bg-cyan-500',
    badge: 'bg-cyan-100 text-cyan-700',
    selectButton: 'border-cyan-200 bg-cyan-50/70 text-cyan-900',
  },
  {
    accent: 'bg-rose-500',
    soft: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700',
    selectButton: 'border-rose-200 bg-rose-50/70 text-rose-900',
  },
];

const defaultFolderTheme: FolderTheme = {
  accent: 'bg-kbc-navy',
  soft: 'bg-slate-50',
  text: 'text-slate-700',
  border: 'border-slate-200',
  dot: 'bg-kbc-navy',
  badge: 'bg-slate-100 text-slate-700',
  selectButton: 'border-slate-200 bg-white text-slate-900',
};

// ─── Document Card ────────────────────────────────────────────────────────────

function PolicyCard({ doc, folderTheme }: { doc: PolicyDocument; folderTheme: FolderTheme }) {
  const cat = categoryConfig[doc.category];

  return (
    <a
      href={doc.webUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-xl border border-gray-200 bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden cursor-pointer"
    >
      {/* Colour accent strip */}
      <div className={`h-1 w-full ${folderTheme.accent}`} />

      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Folder type + Category row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-kbc-navy flex items-center justify-center shrink-0">
            <i className="ri-file-text-line text-white text-sm" />
          </div>
          <div className="flex flex-col">
            <span className={`inline-flex w-fit max-w-[150px] items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-tight ${folderTheme.soft} ${folderTheme.text}`}>
              <span className={`h-2 w-2 rounded-full ${folderTheme.dot}`} />
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
  const folderThemes = useMemo<Record<string, FolderTheme>>(
    () =>
      Object.fromEntries(
        tabs.map((tab, index) => [
          tab,
          tab === 'All' ? defaultFolderTheme : folderThemePalette[index % folderThemePalette.length],
        ]),
      ),
    [tabs],
  );
  const folderOptions = useMemo(
    () =>
      tabs.map(tab => {
        const isAll = tab === 'All';
        const count = folderCounts[tab];
        return {
          value: tab,
          label:
            count !== undefined && count > 0
              ? `${isAll ? 'All Documents' : tab} (${count})`
              : isAll
                ? 'All Documents'
                : tab,
        };
      }),
    [folderCounts, tabs],
  );
  const activeFolderTheme = folderThemes[activeFolder] ?? defaultFolderTheme;
  const categoryCounts = useMemo(
    () => ({
      All: allDocs.length,
      Public: allDocs.filter(doc => doc.category === 'Public').length,
      Internal: allDocs.filter(doc => doc.category === 'Internal').length,
      Confidential: allDocs.filter(doc => doc.category === 'Confidential').length,
    }),
    [allDocs],
  );

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
      <main className="max-w-7xl mx-auto w-full flex-1 px-4 md:px-6 py-6">
        {/* Filter Bar */}
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
          {loading && tabs.length === 1 ? (
            <div className="h-11 min-w-[260px] flex-1 rounded-xl bg-gray-100 animate-pulse md:max-w-sm" />
          ) : (
            <div className="flex min-w-[260px] flex-1 items-center md:max-w-sm">
              <ModernSelect
                value={activeFolder}
                options={folderOptions}
                onChange={setActiveFolder}
                className="min-w-[220px] flex-1"
                buttonClassName={`min-h-11 text-sm ${activeFolderTheme.selectButton}`}
                menuClassName="w-full"
                renderValue={option => {
                  const theme = folderThemes[option?.value ?? 'All'] ?? defaultFolderTheme;
                  return (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${theme.dot}`} />
                      <span className="truncate">{option?.label ?? 'All Documents'}</span>
                    </span>
                  );
                }}
                renderOption={(option, selected) => {
                  const theme = folderThemes[option.value] ?? defaultFolderTheme;
                  return (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${selected ? 'bg-white/90' : theme.dot}`} />
                      <span className="truncate">{option.label}</span>
                    </span>
                  );
                }}
              />
            </div>
          )}

          <div className="w-px h-5 bg-gray-200 hidden xl:block" />

          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 shadow-sm shadow-slate-200/40 transition-colors focus-within:border-kbc-navy/30 focus-within:bg-white">
            <i className="ri-search-line text-gray-400 text-sm shrink-0" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder-gray-400"
            />
          </div>

          <div className="w-px h-5 bg-gray-200 hidden sm:block" />

          <div className="flex flex-wrap items-center gap-2">
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat;
              const styles = filterCardStyles[cat];

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                    isActive ? styles.active : styles.idle
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-white/90' : styles.dot}`} />
                  <span>{cat}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                    isActive ? 'bg-white/15 text-white' : 'bg-white/80 text-current'
                  }`}>
                    {categoryCounts[cat]}
                  </span>
                </button>
              );
            })}
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
            {data?.source && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
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
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map(doc => (
                <PolicyCard
                  key={doc.id}
                  doc={doc}
                  folderTheme={folderThemes[doc.topFolder] ?? defaultFolderTheme}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <Footer compact />
    </div>
  );
}
