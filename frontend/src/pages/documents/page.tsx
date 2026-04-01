import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import { documents } from '../../mocks/documents';

const typeConfig = {
  policy: { label: 'Policy', icon: 'ri-file-text-line', color: '#1B2A4A', bg: 'bg-kbc-navy/10' },
  sop: { label: 'SOP', icon: 'ri-file-list-3-line', color: '#107C10', bg: 'bg-green-50' },
  template: { label: 'Template', icon: 'ri-file-copy-2-line', color: '#F7A800', bg: 'bg-amber-50' },
  form: { label: 'Form', icon: 'ri-file-edit-line', color: '#D13438', bg: 'bg-red-50' },
};

const sensitivityConfig = {
  public: { label: 'Public', badge: 'bg-gray-100 text-gray-600' },
  internal: { label: 'Internal', badge: 'bg-kbc-navy/10 text-kbc-navy' },
  confidential: { label: 'Confidential', badge: 'bg-red-100 text-kbc-red' },
};

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'policy' | 'sop' | 'template' | 'form'>('all');
  const [sensitivity, setSensitivity] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = documents.filter(doc => {
    const matchTab = activeTab === 'all' || doc.type === activeTab;
    const matchSens = sensitivity === 'all' || doc.sensitivity === sensitivity;
    const matchSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase()) || doc.department.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSens && matchSearch;
  });

  const counts = {
    all: documents.length,
    policy: documents.filter(d => d.type === 'policy').length,
    sop: documents.filter(d => d.type === 'sop').length,
    template: documents.filter(d => d.type === 'template').length,
    form: documents.filter(d => d.type === 'form').length,
  };

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
              <p className="text-gray-400 text-xs mt-0.5">Centralised repository for all institutional policies, procedures, templates, and forms.</p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto w-full flex-1 px-4 md:px-6 py-8">
        {/* Type Tabs */}
        <div className="flex items-center gap-1 mb-5 flex-wrap">
          {(['all', 'policy', 'sop', 'template', 'form'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-kbc-navy text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab !== 'all' && <i className={`${typeConfig[tab].icon} text-sm`} />}
              {tab === 'all' ? 'All Documents' : typeConfig[tab].label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/20' : 'bg-gray-100'}`}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Sensitivity Filters */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <i className="ri-search-line text-gray-400 text-sm" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm text-gray-700 outline-none placeholder-gray-400 w-40"
            />
          </div>
          <div className="w-px h-5 bg-gray-200 hidden sm:block" />
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'public', 'internal', 'confidential'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSensitivity(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize cursor-pointer whitespace-nowrap transition-all ${sensitivity === s ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {s === 'all' ? 'All Labels' : sensitivityConfig[s].label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} documents</span>
        </div>

        {/* Documents Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => {
            const tcfg = typeConfig[doc.type];
            const scfg = sensitivityConfig[doc.sensitivity];
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-100 p-5 cursor-pointer hover:shadow-sm transition-shadow group">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${tcfg.bg} flex items-center justify-center shrink-0`}>
                    <i className={`${tcfg.icon} text-lg`} style={{ color: tcfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tcfg.color }}>{tcfg.label}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-sm ${scfg.badge} whitespace-nowrap`}>{scfg.label}</span>
                    </div>
                    <h3 className="text-sm font-bold text-kbc-navy leading-snug group-hover:text-kbc-navy-light">{doc.title}</h3>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Version</p>
                    <p className="text-xs font-semibold text-kbc-navy">{doc.version}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Department</p>
                    <p className="text-xs font-semibold text-kbc-navy truncate">{doc.department}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Review Date</p>
                    <p className="text-xs font-semibold text-kbc-navy">{doc.reviewDate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Updated</p>
                    <p className="text-xs font-semibold text-kbc-navy">{doc.updatedDate}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">{doc.fileSize}</span>
                  <a
                    href={`https://kbccollege.sharepoint.com/sites/policies/documents/${doc.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-kbc-navy font-semibold hover:underline cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-external-link-line text-sm" />
                    Open
                  </a>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <i className="ri-folder-open-line text-4xl mb-3 block" />
              <p className="text-sm font-medium">No documents found</p>
            </div>
          )}
        </div>
      </main>

      <Footer compact />
    </div>
  );
}
