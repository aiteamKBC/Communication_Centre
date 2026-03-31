import { useState } from 'react';
import { Link } from 'react-router-dom';
import { newsItems } from '../../../mocks/news';

const tabs = [
  { key: 'all', label: 'All Staff' },
  { key: 'departments', label: 'Departments' },
  { key: 'leadership', label: 'Leadership' },
];

const priorityConfig = {
  critical: { badge: 'bg-kbc-red text-white', label: 'High Priority' },
  important: { badge: 'bg-kbc-amber text-kbc-navy', label: 'Important' },
  general: { badge: '', label: '' },
};

const avatarColors = [
  'bg-kbc-navy', 'bg-kbc-navy-mid', 'bg-kbc-navy-light', 'bg-gray-500', 'bg-kbc-navy-soft'
];

function timeAgo(dateStr: string): string {
  const daysAgo = Math.floor(Math.random() * 10) + 1;
  return `${daysAgo}-days ago`;
}

export default function NewsFeed() {
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(0);

  const filtered = newsItems.filter((item) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'leadership') return item.department === 'Leadership';
    if (activeTab === 'departments') return item.audience !== 'All Staff';
    return true;
  });

  const pageSize = 4;
  const displayed = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-kbc-navy">Latest News</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed rounded border border-gray-200 hover:border-kbc-navy transition-colors"
          >
            <i className="ri-arrow-left-s-line text-sm" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed rounded border border-gray-200 hover:border-kbc-navy transition-colors"
          >
            <i className="ri-arrow-right-s-line text-sm" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(0); }}
            className={`flex-1 py-2.5 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap border-b-2 ${
              activeTab === tab.key
                ? 'text-kbc-navy border-kbc-navy font-semibold'
                : 'text-gray-500 border-transparent hover:text-kbc-navy'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* News Items */}
      <div className="divide-y divide-gray-50">
        {displayed.map((item, idx) => {
          const cfg = priorityConfig[item.priority];
          const avatarBg = avatarColors[idx % avatarColors.length];
          const initials = (item.author || item.department)
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          return (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer group">
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center shrink-0 mt-0.5`}>
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-kbc-navy leading-snug group-hover:text-kbc-navy-light line-clamp-2 flex-1">
                    {item.title}
                  </p>
                  {cfg.badge && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 whitespace-nowrap ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-gray-400">{timeAgo(item.date)}</span>
                  {item.priority !== 'critical' && (
                    <Link
                      to={`/news/${item.id}`}
                      className="text-xs text-kbc-navy font-medium hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Read More &rsaquo;
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
        <Link
          to="/news"
          className="flex items-center justify-center gap-1 text-xs text-kbc-navy font-medium hover:underline cursor-pointer"
        >
          View All News &rsaquo;
        </Link>
      </div>
    </div>
  );
}
