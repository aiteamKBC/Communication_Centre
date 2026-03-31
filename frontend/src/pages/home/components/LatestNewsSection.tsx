import { Link } from 'react-router-dom';
import { newsItems } from '../../../mocks/news';

const priorityConfig = {
  critical: { badge: 'bg-kbc-red text-white', label: 'Critical' },
  important: { badge: 'bg-kbc-amber text-kbc-navy', label: 'Important' },
  general: { badge: 'bg-green-100 text-kbc-green', label: 'General' },
};

export default function LatestNewsSection() {
  const featured = newsItems.slice(0, 3);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-kbc-navy">Latest News</h2>
          <p className="text-gray-400 text-xs mt-0.5">Recent announcements and updates from across the organisation</p>
        </div>
        <Link
          to="/news"
          className="text-xs text-kbc-navy font-medium hover:underline cursor-pointer whitespace-nowrap"
        >
          All News &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {featured.map((item) => {
          const cfg = priorityConfig[item.priority];
          return (
            <article
              key={item.id}
              className="bg-white rounded-xl border border-gray-100 overflow-hidden group cursor-pointer hover:shadow-sm transition-shadow"
            >
              {/* Image */}
              {item.image && (
                <div className="w-full h-40 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}

              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{item.date}</span>
                </div>

                <h3 className="text-sm font-bold text-kbc-navy leading-snug mb-2 group-hover:text-kbc-navy-light line-clamp-2">
                  {item.title}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 mb-3">
                  {item.excerpt}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{item.department}</span>
                  <Link
                    to={`/news/${item.id}`}
                    className="flex items-center gap-1 text-xs font-semibold text-kbc-navy hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Read More
                    <i className="ri-arrow-right-s-line text-sm" />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
