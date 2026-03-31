import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import AddNewsModal from './components/AddNewsModal';
import { useNewsAcknowledgements } from './useNewsAcknowledgements';

const priorityConfig = {
  critical: { label: 'Critical', border: 'border-l-kbc-red', bg: 'bg-red-50', badge: 'bg-kbc-red text-white', dot: 'bg-kbc-red' },
  important: { label: 'Important', border: 'border-l-kbc-amber', bg: '', badge: 'bg-kbc-amber text-kbc-navy', dot: 'bg-kbc-amber' },
  general: { label: 'General', border: 'border-l-kbc-green', bg: '', badge: 'bg-green-100 text-kbc-green', dot: 'bg-kbc-green' },
};

const audiences = ['All Staff', 'Leadership', 'Budget Holders', 'New Starters', 'Marketing'];
const deptsList = ['All Departments', 'Compliance', 'Leadership', 'IT Services', 'HR & Safeguarding', 'HR', 'Marketing', 'Finance', 'Estates', 'Quality & Standards'];

type FilterOption = {
  label: string;
  value: string;
};

type FilterDropdownProps = {
  icon: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
};

function FilterDropdown({ icon, value, options, onChange, className = '' }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectedOption = options.find(option => option.value === value) ?? options[0];

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className={`flex min-w-[150px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
          open
            ? 'border-kbc-navy/30 bg-white shadow-lg shadow-slate-200/70 ring-4 ring-kbc-navy/5'
            : 'border-slate-200 bg-white/90 shadow-sm shadow-slate-200/60 hover:border-slate-300 hover:shadow-md'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 shrink-0">
          <i className={`${icon} text-base`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Filter
          </span>
          <span className="block truncate text-sm font-semibold text-slate-700">
            {selectedOption.label}
          </span>
        </span>
        <i className={`ri-arrow-down-s-line text-lg text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-[220px] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="max-h-72 overflow-y-auto">
            {options.map(option => {
              const selected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'bg-kbc-navy text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  role="option"
                  aria-selected={selected}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                    selected
                      ? 'border-white/30 bg-white/15 text-white'
                      : 'border-slate-200 bg-white text-transparent'
                  }`}>
                    <i className="ri-check-line" />
                  </span>
                  <span className="truncate text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewsPage() {
  const { items, toggleAcknowledgement } = useNewsAcknowledgements();
  const [priority, setPriority] = useState<string>('all');
  const [audience, setAudience] = useState<string>('all');
  const [dept, setDept] = useState<string>('All Departments');
  const [search, setSearch] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const filtered = items.filter(item => {
    const matchPriority = priority === 'all' || item.priority === priority;
    const matchAudience = audience === 'all' || item.audience === audience;
    const matchDept = dept === 'All Departments' || item.department === dept;
    const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.excerpt.toLowerCase().includes(search.toLowerCase());
    return matchPriority && matchAudience && matchDept && matchSearch;
  });

  const criticalCount = items.filter(n => n.priority === 'critical').length;
  const pendingAck = items.filter(n => n.requiresAcknowledgement && !n.acknowledged).length;
  const audienceOptions: FilterOption[] = [
    { label: 'All Audiences', value: 'all' },
    ...audiences.map(item => ({ label: item, value: item })),
  ];
  const deptOptions: FilterOption[] = deptsList.map(item => ({ label: item, value: item }));


  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TopNav />

      {/* Add News Modal */}
      {adminOpen && <AddNewsModal onClose={() => setAdminOpen(false)} />}

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
            <button
              onClick={() => setAdminOpen(true)}
              className="flex items-center gap-2 bg-kbc-amber text-kbc-navy text-xs font-bold px-4 py-2.5 rounded-lg cursor-pointer hover:bg-yellow-400 transition-colors whitespace-nowrap"
            >
              <i className="ri-add-circle-line text-base" />
              Add News Article
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">

        {/* Alert Summary Strip */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-2">
            <i className="ri-error-warning-fill text-kbc-red text-sm" />
            <span className="text-kbc-navy text-xs font-semibold">{criticalCount} Critical Alerts Active</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <i className="ri-pen-nib-line text-kbc-amber text-sm" />
            <span className="text-kbc-navy text-xs font-semibold">{pendingAck} Your Pending Acknowledgements</span>
          </div>
        </div>

        {/* ── Section 2: News Display ── */}
        <div>
          {/* Filters + view toggle */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5 xl:flex-nowrap">
                <div className="flex items-center gap-3 rounded-2xl border border-kbc-navy/10 bg-slate-50 px-3 py-2 shadow-sm shadow-slate-200/60 shrink-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-kbc-navy shadow-sm">
                    <i className="ri-search-line text-base" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search news..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-32 bg-transparent text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400 xl:w-36"
                  />
                </div>
                <div className="hidden h-5 w-px bg-gray-200 sm:block" />
                <div className="flex items-center gap-1 flex-wrap xl:flex-nowrap">
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
                <div className="hidden h-5 w-px bg-gray-200 sm:block" />
                <FilterDropdown
                  icon="ri-group-line"
                  value={audience}
                  onChange={setAudience}
                  options={audienceOptions}
                />
                <FilterDropdown
                  icon="ri-building-line"
                  value={dept}
                  onChange={setDept}
                  options={deptOptions}
                />
              </div>

              <div className="flex items-center justify-end gap-3 xl:pl-3">
                <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} results</span>
                <div className="flex items-center gap-2 rounded-xl border border-kbc-navy/10 bg-gray-50 px-2 py-1 shadow-sm shrink-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">View</span>
                  <div className="flex items-center gap-1 rounded-lg bg-white p-1 border border-gray-200">
                    <div className="group relative">
                      <button
                        type="button"
                        title="List view"
                        aria-label="List view"
                        onClick={() => setViewMode('list')}
                        className={`flex h-8 w-8 items-center justify-center rounded-md cursor-pointer border transition-all ${
                          viewMode === 'list'
                            ? 'border-kbc-navy bg-kbc-navy text-white shadow-sm'
                            : 'border-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-50 hover:text-kbc-navy'
                        }`}
                      >
                        <i className="ri-list-unordered text-base" />
                      </button>
                      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-kbc-navy px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                        List view
                      </span>
                    </div>
                    <div className="group relative">
                      <button
                        type="button"
                        title="Grid view"
                        aria-label="Grid view"
                        onClick={() => setViewMode('grid')}
                        className={`flex h-8 w-8 items-center justify-center rounded-md cursor-pointer border transition-all ${
                          viewMode === 'grid'
                            ? 'border-kbc-navy bg-kbc-navy text-white shadow-sm'
                            : 'border-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-50 hover:text-kbc-navy'
                        }`}
                      >
                        <i className="ri-grid-line text-base" />
                      </button>
                      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-kbc-navy px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                        Grid view
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* List View */}
          {viewMode === 'list' && (
            <div className="flex flex-col gap-3">
              {filtered.map((item) => {
                const cfg = priorityConfig[item.priority];
                return (
                  <div key={item.id} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${cfg.border} ${cfg.bg} overflow-hidden cursor-pointer hover:shadow-sm transition-shadow`}>
                    <div className="flex items-start gap-0">
                      {item.image && (
                        <div className="w-28 sm:w-36 h-full min-h-[90px] overflow-hidden shrink-0">
                          <img src={item.image} alt={item.title} className="w-full h-full object-cover object-top" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 p-4">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                          {item.requiresAcknowledgement && !item.acknowledged && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-kbc-amber/20 text-yellow-800 border border-kbc-amber/40 flex items-center gap-1 whitespace-nowrap">
                              <i className="ri-pen-nib-line text-xs" />
                              Your acknowledgement required
                            </span>
                          )}
                          {item.requiresAcknowledgement && item.acknowledged && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-green-50 text-kbc-green border border-green-200 flex items-center gap-1 whitespace-nowrap">
                              <i className="ri-checkbox-circle-line text-xs" />
                              Acknowledged
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-kbc-navy leading-snug mb-1">{item.title}</h3>
                        <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{item.excerpt}</p>
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">{item.audience}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">{item.department}</span>
                          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{item.date}</span>
                          {item.requiresAcknowledgement && !item.acknowledged && (
                            <button
                              type="button"
                              onClick={() => toggleAcknowledgement(item.id)}
                              className="shrink-0 bg-kbc-navy text-white text-xs font-semibold px-3 py-1 rounded cursor-pointer hover:bg-kbc-navy-light whitespace-nowrap"
                            >
                              Acknowledge
                            </button>
                          )}
                          {item.requiresAcknowledgement && item.acknowledged && (
                            <button
                              type="button"
                              onClick={() => toggleAcknowledgement(item.id)}
                              className="shrink-0 inline-flex items-center gap-1.5 rounded bg-amber-50 px-3 py-1 text-xs font-semibold text-yellow-800 whitespace-nowrap border border-amber-200 hover:bg-amber-100"
                            >
                              <i className="ri-arrow-go-back-line text-sm" />
                              Undo Acknowledgement
                            </button>
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
              {filtered.map((item) => {
                const cfg = priorityConfig[item.priority];
                return (
                  <article key={item.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden group cursor-pointer hover:shadow-sm transition-shadow">
                    {item.image && (
                      <div className="w-full h-40 overflow-hidden">
                        <img src={item.image} alt={item.title} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{item.date}</span>
                      </div>
                      <h3 className="text-sm font-bold text-kbc-navy leading-snug mb-2 group-hover:text-kbc-navy-light line-clamp-2">{item.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 mb-3">{item.excerpt}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-50">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="max-w-full rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-400">
                            {item.department}
                          </span>
                          {item.requiresAcknowledgement && item.acknowledged && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-kbc-green">
                              <i className="ri-check-line text-xs" />
                              Acknowledged
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {item.requiresAcknowledgement && !item.acknowledged && (
                            <button
                              type="button"
                              onClick={() => toggleAcknowledgement(item.id)}
                              className="text-xs font-semibold text-kbc-green hover:underline cursor-pointer whitespace-nowrap"
                            >
                              Acknowledge
                            </button>
                          )}
                          {item.requiresAcknowledgement && item.acknowledged && (
                            <button
                              type="button"
                              onClick={() => toggleAcknowledgement(item.id)}
                              className="text-xs font-semibold text-yellow-800 hover:underline cursor-pointer whitespace-nowrap"
                            >
                              Undo Acknowledgement
                            </button>
                          )}
                          <Link
                            to={`/news/${item.id}`}
                            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-kbc-navy hover:underline cursor-pointer"
                          >
                            Read More <i className="ri-arrow-right-s-line text-sm" />
                          </Link>
                        </div>
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
