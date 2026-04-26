import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ModernSelect from '../../components/feature/ModernSelect';
import { kbcSuccessSwal, kbcSwal } from '../../components/feature/sweetAlert';
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

const DEPARTMENT_PLACEHOLDER = 'All Departments';

function NewsListSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="overflow-hidden rounded-xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)]"
        >
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-6 w-20 rounded-sm bg-slate-200" />
              <div className="h-6 w-40 rounded-sm bg-amber-100" />
            </div>
            <div className="h-5 w-52 rounded-full bg-slate-200" />
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full rounded-full bg-slate-200" />
              <div className="h-3 w-5/6 rounded-full bg-slate-200" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="h-6 w-16 rounded-full bg-slate-100" />
              <div className="h-6 w-12 rounded-full bg-slate-100" />
              <div className="ml-auto h-4 w-20 rounded-full bg-slate-100" />
              <div className="h-8 w-28 rounded-lg bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="overflow-hidden rounded-xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)]"
        >
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-5 w-20 rounded-sm bg-slate-200" />
              <div className="ml-auto h-4 w-16 rounded-full bg-slate-100" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full rounded-full bg-slate-200" />
              <div className="h-4 w-4/5 rounded-full bg-slate-200" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full rounded-full bg-slate-100" />
              <div className="h-3 w-5/6 rounded-full bg-slate-100" />
              <div className="h-3 w-2/3 rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="h-6 w-24 rounded-full bg-slate-100" />
              <div className="h-4 w-20 rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NewsPage() {
  const { items, loading, error, toggleAcknowledgement, addNews, updateNews, deleteNews } = useNewsAcknowledgements();
  const { canManageNews } = useAccessControl();
  const [priority, setPriority] = useState<string>('all');
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  const departmentOptions = useMemo(() => {
    const departments = Array.from(
      new Set(
        items
          .map(item => item.department?.trim())
          .filter((department): department is string => Boolean(department)),
      ),
    ).sort((left, right) => left.localeCompare(right));

    return [
      { value: '', label: DEPARTMENT_PLACEHOLDER },
      ...departments.map((department) => ({ value: department, label: department })),
    ];
  }, [items]);

  const newsDepartmentOptions = useMemo(() => {
    const selectableOptions = departmentOptions.filter(option => option.value);
    return selectableOptions.length > 0
      ? selectableOptions
      : [{ value: 'General', label: 'General' }];
  }, [departmentOptions]);

  useEffect(() => {
    if (dept && !departmentOptions.some(option => option.value === dept)) {
      setDept('');
    }
  }, [departmentOptions, dept]);

  const filtered = items.filter(item => {
    const matchPriority = priority === 'all' || item.priority === priority;
    const matchDept = !dept || item.department === dept;
    const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.excerpt.toLowerCase().includes(search.toLowerCase());
    return matchPriority && matchDept && matchSearch;
  });

  const closeAdminModal = () => {
    setAdminOpen(false);
    setEditingItem(null);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setAdminOpen(true);
  };

  const openEditModal = (item: NewsItem) => {
    setSelectedItem(null);
    setEditingItem(item);
    setAdminOpen(true);
  };

  const openNewsDetails = (item: NewsItem) => {
    setSelectedItem(item);
  };

  const handleDeleteNews = async (item: NewsItem) => {
    const result = await kbcSwal.fire({
      title: 'Delete News Article?',
      html: `The article <strong>${item.title}</strong> will be removed from the database.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) return;

    try {
      await deleteNews(item.id);
      setSelectedItem(current => (current?.id === item.id ? null : current));
      await kbcSuccessSwal.fire({
        title: 'Article Deleted',
        html: 'The news article was removed successfully.',
        icon: 'success',
        confirmButtonText: 'OK',
      });
    } catch {
      await kbcSwal.fire({
        title: 'Delete Failed',
        html: 'The news article could not be deleted. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK',
      });
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />

      {/* Add News Modal */}
      {canManageNews && adminOpen && (
        <AddNewsModal
          onClose={closeAdminModal}
          initialArticle={editingItem}
          departmentOptions={newsDepartmentOptions}
          onSubmitArticle={(payload) => (
            editingItem
              ? updateNews({ ...payload, id: editingItem.id })
              : addNews(payload)
          )}
        />
      )}
      {selectedItem && (
        <NewsDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onToggleAcknowledgement={toggleAcknowledgement}
          canManageNews={canManageNews}
          onEdit={openEditModal}
          onDelete={handleDeleteNews}
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
                onClick={openCreateModal}
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
              {(['all', 'critical', 'important', 'general'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize cursor-pointer whitespace-nowrap transition-all ${
                    priority === value ? 'bg-kbc-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {value === 'all' ? 'All Priority' : value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <div className="w-px h-5 bg-gray-200 hidden sm:block" />
            <ModernSelect
              value={dept}
              onChange={setDept}
              options={departmentOptions}
              placeholder={DEPARTMENT_PLACEHOLDER}
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
              {loading ? (
                <NewsListSkeleton />
              ) : filtered.map((item) => {
                const cfg = priorityConfig[item.priority];
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openNewsDetails(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openNewsDetails(item);
                      }
                    }}
                    className={`group relative overflow-hidden rounded-xl border border-gray-100 border-l-4 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] ${cfg.border} ${cfg.bg} cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 hover:shadow-[0_22px_45px_-28px_rgba(15,23,42,0.32)]`}
                  >
                    <div className="absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.78),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="relative p-4">
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
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap transition-colors duration-300 group-hover:bg-gray-200">{item.department}</span>
                          {canManageNews && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditModal(item);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-kbc-navy"
                              >
                                <i className="ri-edit-line text-xs" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteNews(item);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                              >
                                <i className="ri-delete-bin-line text-xs" />
                                Delete
                              </button>
                            </div>
                          )}
                          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{item.date}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openNewsDetails(item);
                            }}
                            className="text-xs font-semibold text-kbc-navy hover:underline cursor-pointer whitespace-nowrap flex items-center gap-1"
                          >
                            Read More <i className="ri-arrow-right-s-line text-sm" />
                          </button>
                          {item.requiresAcknowledgement && (
                            item.acknowledged ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleAcknowledgement(item.id);
                                }}
                                className="shrink-0 border border-amber-200 bg-amber-50 text-yellow-800 text-xs font-semibold px-3 py-1 rounded cursor-pointer hover:bg-amber-100 whitespace-nowrap"
                              >
                                Undo Acknowledge
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleAcknowledgement(item.id);
                                }}
                                className="shrink-0 bg-kbc-navy text-white text-xs font-semibold px-3 py-1 rounded cursor-pointer hover:bg-kbc-navy-light whitespace-nowrap"
                              >
                                Acknowledge
                              </button>
                            )
                          )}
                        </div>
                    </div>
                  </div>
                );
              })}
              {!loading && filtered.length === 0 && (
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
              {loading ? (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                  <NewsGridSkeleton />
                </div>
              ) : filtered.map((item) => {
                const cfg = priorityConfig[item.priority];
                return (
                  <article
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openNewsDetails(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openNewsDetails(item);
                      }
                    }}
                    className="group relative overflow-hidden rounded-xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 hover:shadow-[0_22px_45px_-28px_rgba(15,23,42,0.32)]"
                  >
                    <div className="absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.78),transparent_72%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
                        <div className="flex items-center gap-2">
                          {canManageNews && (
                            <>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditModal(item);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors hover:text-kbc-navy"
                              >
                                <i className="ri-edit-line text-sm" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteNews(item);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 transition-colors hover:text-red-700"
                              >
                                <i className="ri-delete-bin-line text-sm" />
                                Delete
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openNewsDetails(item);
                            }}
                            className="text-xs font-semibold text-kbc-navy hover:underline cursor-pointer whitespace-nowrap flex items-center gap-1"
                          >
                            Read More <i className="ri-arrow-right-s-line text-sm" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {!loading && filtered.length === 0 && (
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
