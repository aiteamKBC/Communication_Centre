import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';

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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function countNodes(node: DriveNode): { folders: number; files: number } {
  if (node.type === 'file') {
    return { folders: 0, files: 1 };
  }

  let folders = 1;
  let files = 0;
  node.children.forEach(child => {
    const counts = countNodes(child);
    folders += counts.folders;
    files += counts.files;
  });
  return { folders, files };
}

function filterTree(node: DriveNode, query: string): DriveNode | null {
  const q = query.trim().toLowerCase();
  if (!q) {
    return node;
  }

  const selfMatch = node.name.toLowerCase().includes(q);
  if (node.type === 'file') {
    return selfMatch ? node : null;
  }

  const filteredChildren = node.children
    .map(child => filterTree(child, q))
    .filter((child): child is DriveNode => Boolean(child));

  if (selfMatch || filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }

  return null;
}

function NodeRow({ node, depth }: { node: DriveNode; depth: number }) {
  const leftPad = 14 + depth * 18;

  if (node.type === 'file') {
    return (
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2" style={{ paddingLeft: leftPad }}>
        <div className="min-w-0 flex items-center gap-2">
          <i className="ri-file-line text-gray-400 text-sm" />
          <span className="text-sm text-gray-700 truncate">{node.name}</span>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{node.extension ? node.extension.toUpperCase() : 'FILE'}</span>
        <span className="text-xs text-gray-400 whitespace-nowrap">{formatBytes(node.size)}</span>
        {node.webUrl ? (
          <a href={node.webUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-kbc-navy hover:underline whitespace-nowrap">
            Open
          </a>
        ) : (
          <span className="text-xs text-gray-300 whitespace-nowrap">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-gray-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-3 py-2" style={{ paddingLeft: leftPad }}>
        <div className="min-w-0 flex items-center gap-2">
          <i className="ri-folder-2-line text-kbc-navy text-base" />
          <span className="text-sm font-semibold text-kbc-navy truncate">{node.name}</span>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{node.children.length} item{node.children.length === 1 ? '' : 's'}</span>
        {node.webUrl ? (
          <a href={node.webUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-kbc-navy hover:underline whitespace-nowrap">
            Open Folder
          </a>
        ) : (
          <span className="text-xs text-gray-300 whitespace-nowrap">—</span>
        )}
      </div>

      {node.children.length > 0 && (
        <div className="space-y-1.5">
          {node.children.map(child => (
            <NodeRow key={`${child.id}-${child.name}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  const [data, setData] = useState<DocumentsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadDocuments = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/documents-live/');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to load live documents from Microsoft Graph.');
      }
      setData(payload as DocumentsApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load live documents.';
      setError(message);
    } finally {
      if (showLoading) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDocuments(true);

    const timer = window.setInterval(() => {
      void loadDocuments(false);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [loadDocuments]);

  const root = data?.root || null;
  const filteredRoot = useMemo(() => {
    if (!root) {
      return null;
    }
    return filterTree(root, search);
  }, [root, search]);

  const counts = useMemo(() => {
    if (!root) {
      return { folders: 0, files: 0 };
    }
    const all = countNodes(root);
    return {
      folders: Math.max(0, all.folders - 1),
      files: all.files,
    };
  }, [root]);

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
              <p className="text-gray-400 text-xs mt-0.5">Live SharePoint folder view with files and subfolders synced from Microsoft Graph.</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto w-full flex-1 px-4 md:px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 min-w-[230px] flex-1">
            <i className="ri-search-line text-gray-400 text-sm" />
            <input
              type="text"
              placeholder="Search folder or file name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm text-gray-700 outline-none placeholder-gray-400 w-full"
            />
          </div>
          <div className="w-px h-5 bg-gray-200 hidden sm:block" />
          <span className="text-xs text-gray-500">{counts.folders} folders</span>
          <span className="text-xs text-gray-500">{counts.files} files</span>
          <span className="text-xs text-gray-400">Updated: {formatDateTime(data?.fetchedAt)}</span>
          <button
            type="button"
            onClick={() => void loadDocuments(false)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-kbc-navy hover:bg-gray-50"
          >
            <i className={`ri-refresh-line text-sm ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            <i className="ri-loader-4-line animate-spin mr-2" />
            Loading live folders from SharePoint...
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <p className="text-sm font-semibold text-red-700">Unable to load live documents</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        ) : !filteredRoot ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            <i className="ri-folder-open-line text-2xl mb-2 block" />
            No folders or files match your search.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-4 md:p-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-100">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-kbc-navy/10 text-kbc-navy px-2.5 py-1 text-xs font-semibold">
                <i className="ri-link-m text-sm" />
                {data?.source?.siteName || 'SharePoint'}
              </span>
              <span className="text-xs text-gray-400 break-all">{data?.source?.drivePath}</span>
              {data?.source?.folderWebUrl && (
                <a
                  href={data.source.folderWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs font-semibold text-kbc-navy hover:underline whitespace-nowrap"
                >
                  Open In SharePoint
                </a>
              )}
            </div>

            <NodeRow node={filteredRoot} depth={0} />
          </div>
        )}
      </main>

      <Footer compact />
    </div>
  );
}
