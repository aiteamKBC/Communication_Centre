import { useState } from 'react';
import { Link } from 'react-router-dom';
import SafeImage from '../../components/feature/SafeImage';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ModernSelect from '../../components/feature/ModernSelect';
import AddNewsModal from './components/AddNewsModal';
import NewsDetailModal from './components/NewsDetailModal';
import { useNewsAcknowledgements } from './useNewsAcknowledgements';
import type { NewsItem } from '../../mocks/news';
import useAccessControl from '../../hooks/useAccessControl';

const priorityConfig = {
  critical: { label: 'Critical', border: 'border-l-kbc-red', bg: 'bg-red-50', badge: 'bg-kbc-red text-white', dot: 'bg-kbc-red' },
  important: { label: 'Important', border: 'border-l-kbc-amber', bg: '', badge: 'bg-kbc-amber text-kbc-navy', dot: 'bg-kbc-amber' },
  general: { label: 'General', border: 'border-l-kbc-green', bg: '', badge: 'bg-kbc-green/10 text-kbc-green', dot: 'bg-kbc-green' },
};

const audiences = ['All Staff', 'Leadership', 'Budget Holders', 'New Starters', 'Marketing'];
const deptsList = ['All Departments', 'Compliance', 'Leadership', 'IT Services', 'HR & Safeguarding', 'HR', 'Marketing', 'Finance', 'Estates', 'Quality & Standards'];
const audienceOptions = [
  { value: 'all', label: 'All Audiences' },
  ...audiences.map((item) => ({ value: item, label: item })),
];
const departmentOptions = deptsList.map((item) => ({ value: item, label: item }));

export default function NewsPage() {
  const { items, loading, error, toggleAcknowledgement, addNews } = useNewsAcknowledgements();
  const { canManageNews } = useAccessControl();
  const [priority, setPriority] = useState<string>('all');
  const [audience, setAudience] = useState<string>('all');
  const [dept, setDept] = useState<string>('All Departments');
  const [search, setSearch] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  const filtered = items.filter(item => {
    const matchPriority = priority === 'all' || item.priority === priority;
    const matchAudience = audience === 'all' || item.audience === audience;
    const matchDept = dept === 'All Departments' || item.department === dept;
    const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.excerpt.toLowerCase().includes(search.toLowerCase());
    return matchPriority && matchAudience && matchDept && matchSearch;
  });

  const criticalCount = items.filter(n => n.priority === 'critical').length;
  const pendingAck = items.filter(n => n.requiresAcknowledgement && !n.acknowledged).length;


  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />

      {/* Add News Modal */}
      {canManageNews && adminOpen && <AddNewsModal onClose={() => setAdminOpen(false)} onArticleAdded={addNews} />}
      {selectedItem && (
        <NewsDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onToggleAcknowledgement={toggleAcknowledgement}
        />
      )}

      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <Link to="/" className="hover:text-kbc-navy cursor-pointer">Home</Link>
            <span>/</span>
            <span className="text-kbc-navy font-medium">News &amp; Announcements</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
                <i className="ri-newspaper-line text-white text-base" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-kbc-navy">News &amp; Announcements</h1>
                <p className="text-gray-400 text-xs mt-0.5">All institutional communications, alerts, and updates for KBC staff.</p>
              </div>
            </div>
            {canManageNews && (
              <button
                onClick={() => setAdminOpen(true)}
                className="flex items-center gap-2 bg-kbc-amber text-kbc-navy text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer hover:bg-yellow-400 transition-colors whitespace-nowrap"
              >
                <i className="ri-add-circle-line text-base" />
                Add News Article
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 flex-1 w-full">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Alert Summary Strip */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-2">
            <i className="ri-error-warning-fill text-kbc-red text-sm" />
            <span className="text-kbc-navy text-xs font-semibold">{criticalCount} Critical Alerts Active</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-kbc-amber/30 rounded-lg px-3 py-2">
            <i className="ri-pen-nib-line text-kbc-amber text-sm" />
            <span className="text-kbc-navy text-xs font-semibold">{pendingAck} Pending Acknowledgements</span>
          </div>
        </div>

        {/* ── Section 2: News Display ── */}
        <div>
          {/* Filters + view toggle */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-[230px] rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-3.5 py-2.5 shadow-[0_10px_24px_-18px_rgba(27,42,74,0.35)] transition-all duration-300 hover:border-slate-300 hover:shadow-[0_16px_28px_-20px_rgba(27,42,74,0.45)]">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <i className="ri-search-line text-sm" />
              </span>
              <input
                type="text"
                placeholder="Search news..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="w-px h-5 bg-gray-200 hidden sm:block" />
            <div className="flex items-center gap-1 flex-wrap">
              {(['all', 'critical', 'important', 'general'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize cursor-pointer whitespace-nowrap transition-all ${priority === p ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {p === 'all' ? 'All Priority' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <div className="w-px h-5 bg-gray-200 hidden sm:block" />
            <ModernSelect
              value={audience}
              onChange={setAudience}
              options={audienceOptions}
              className="min-w-[190px]"
              buttonClassName="min-h-[46px] rounded-2xl border-gray-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.4)]"
              menuMinWidth={220}
            />
            <ModernSelect
              value={dept}
              onChange={setDept}
              options={departmentOptions}
              className="min-w-[190px]"
              buttonClassName="min-h-[46px] rounded-2xl border-gray-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] px-4 py-2.5 text-sm shadow-[0_12px_26px_-18px_rgba(27,42,74,0.4)]"
              menuMinWidth={230}
            />
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} results</span>
            {/* View toggle */}
            <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${viewMode === 'list' ? 'bg-kbc-navy text-white' : 'text-gray-400 hover:text-kbc-navy'}`}
              >
                <i className="ri-list-unordered text-sm" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${viewMode === 'grid' ? 'bg-kbc-navy text-white' : 'text-gray-400 hover:text-kbc-navy'}`}
              >
                <i className="ri-grid-line text-sm" />
              </button>
            </div>
          </div>

          {/* List View */}
          {viewMode === 'list' && (
            <div className="flex flex-col gap-3">
              {loading && (
                <div className="rounded-xl border border-gray-100 bg-white px-4 py-8 text-center text-sm text-gray-500">
                  Loading news from the database...
                </div>
              )}
              {filtered.map((item) => {
                const cfg = priorityConfig[item.priority];
                return (
                  <div
                    key={item.id}
                    className={`group relative overflow-hidden rounded-xl border border-gray-100 border-l-4 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] ${cfg.border} ${cfg.bg} cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 hover:shadow-[0_22px_45px_-28px_rgba(15,23,42,0.32)]`}
                  >
                    <div className="absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.78),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="flex items-start gap-0">
                      {item.image && (
                        <div className="w-28 sm:w-36 h-full min-h-[90px] overflow-hidden shrink-0 bg-slate-100">
                          <SafeImage
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                            fallback={<div className="h-full w-full bg-[linear-gradient(135deg,#eef2ff_0%,#f8fafc_100%)]" aria-hidden="true" />}
                          />
                        </div>
                      )}
                      <div className="relative flex-1 min-w-0 p-4">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                          {item.requiresAcknowledgement && (
                            item.acknowledged ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-green-100 text-kbc-green border border-green-200 flex items-center gap-1 whitespace-nowrap">
                                <i className="ri-checkbox-circle-line text-xs" />
                                Confirmed
                              </span>
                            ) : (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-kbc-amber/20 text-yellow-800 border border-kbc-amber/40 flex items-center gap-1 whitespace-nowrap">
                                <i className="ri-pen-nib-line text-xs" />
                                Acknowledgement Required
                              </span>
                            )
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-kbc-navy leading-snug mb-1 transition-colors duration-300 group-hover:text-kbc-navy-light">
                          {item.title}
                        </h3>
                        <p className="text-gray-500 text-xs leading-relaxed line-clamp-2 transition-colors duration-300 group-hover:text-gray-600">
                          {item.excerpt}
                        </p>
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap transition-colors duration-300 group-hover:bg-gray-200">{item.audience}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap transition-colors duration-300 group-hover:bg-gray-200">{item.department}</span>
                          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{item.date}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className="text-xs font-semibold text-kbc-navy hover:underline cursor-pointer whitespace-nowrap flex items-center gap-1"
                          >
                            Read More <i className="ri-arrow-right-s-line text-sm" />
                          </button>
                          {item.requiresAcknowledgement && (
                            item.acknowledged ? (
                              <button
                                type="button"
                                onClick={() => toggleAcknowledgement(item.id)}
                                className="shrink-0 border border-amber-200 bg-amber-50 text-yellow-800 text-xs font-semibold px-3 py-1 rounded cursor-pointer hover:bg-amber-100 whitespace-nowrap"
                              >
                                Undo Acknowledge
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleAcknowledgement(item.id)}
                                className="shrink-0 bg-kbc-navy text-white text-xs font-semibold px-3 py-1 rounded cursor-pointer hover:bg-kbc-navy-light whitespace-nowrap"
                              >
                                Acknowledge
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <i className="ri-newspaper-line text-4xl mb-3 block" />
                  <p className="text-sm font-medium">No announcements match your filters</p>
                </div>
              )}
            </div>
          )}

          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading && (
                <div className="col-span-3 rounded-xl border border-gray-100 bg-white px-4 py-8 text-center text-sm text-gray-500">
                  Loading news from the database...
                </div>
              )}
              {filtered.map((item) => {
                const cfg = priorityConfig[item.priority];
                return (
                  <article key={item.id} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 hover:shadow-[0_22px_45px_-28px_rgba(15,23,42,0.32)]">
                    <div className="absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.78),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    {item.image && (
                      <div className="w-full h-40 overflow-hidden bg-slate-100">
                        <SafeImage
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                          fallback={<div className="h-full w-full bg-[linear-gradient(135deg,#eef2ff_0%,#f8fafc_100%)]" aria-hidden="true" />}
                        />
                      </div>
                    )}
                    <div className="relative p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{item.date}</span>
                      </div>
                      <h3 className="text-sm font-bold text-kbc-navy leading-snug mb-2 transition-colors duration-300 group-hover:text-kbc-navy-light line-clamp-2">{item.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 mb-3 transition-colors duration-300 group-hover:text-gray-600">{item.excerpt}</p>
                      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{item.department}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="text-xs font-semibold text-kbc-navy hover:underline cursor-pointer whitespace-nowrap flex items-center gap-1"
                        >
                          Read More <i className="ri-arrow-right-s-line text-sm" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-3 text-center py-16 text-gray-400">
                  <i className="ri-newspaper-line text-4xl mb-3 block" />
                  <p className="text-sm font-medium">No announcements match your filters</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
