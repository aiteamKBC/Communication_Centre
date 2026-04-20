import { Link, useParams } from 'react-router-dom';
import SafeImage from '../../components/feature/SafeImage';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import { useNewsAcknowledgements } from './useNewsAcknowledgements';

const priorityConfig = {
  critical: { label: 'Critical', badge: 'bg-kbc-red text-white', panel: 'border-red-200 bg-red-50 text-kbc-red' },
  important: { label: 'Important', badge: 'bg-kbc-amber text-kbc-navy', panel: 'border-amber-200 bg-amber-50 text-yellow-800' },
  general: { label: 'General', badge: 'bg-green-100 text-kbc-green', panel: 'border-green-200 bg-green-50 text-kbc-green' },
};

function buildArticleParagraphs(title: string, excerpt: string, department: string, audience: string) {
  return [
    excerpt,
    `This update has been issued by ${department} for ${audience}. Staff should review the information carefully and follow any actions, deadlines, or local guidance referenced in the announcement.`,
    `If you need clarification on "${title}", contact the ${department} team or your line manager for the next steps and any supporting documentation.`,
  ];
}

export default function NewsDetailPage() {
  const { id } = useParams();
  const { items, toggleAcknowledgement } = useNewsAcknowledgements();
  const article = items.find((item) => item.id === id);

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
        <TopNav />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 md:px-6 py-12">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
            <i className="ri-newspaper-line text-4xl text-gray-300 mb-4 block" />
            <h1 className="text-xl font-bold text-kbc-navy mb-2">Article not found</h1>
            <p className="text-sm text-gray-500 mb-6">The news article you requested is unavailable.</p>
            <Link
              to="/news"
              className="inline-flex items-center gap-2 rounded-lg bg-kbc-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-kbc-navy-light"
            >
              <i className="ri-arrow-left-line text-base" />
              Back to News
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const cfg = priorityConfig[article.priority];
  const paragraphs = buildArticleParagraphs(article.title, article.excerpt, article.department, article.audience);

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />

      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <Link to="/" className="hover:text-kbc-navy cursor-pointer">Home</Link>
            <span>/</span>
            <Link to="/news" className="hover:text-kbc-navy cursor-pointer">News &amp; Announcements</Link>
            <span>/</span>
            <span className="text-kbc-navy font-medium truncate">{article.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
              <i className="ri-article-line text-white text-base" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-kbc-navy">News Article</h1>
              <p className="text-gray-400 text-xs mt-0.5">Full details and follow-up information for this announcement.</p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-6 py-8">
        <article className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {article.image && (
            <div className="w-full h-64 sm:h-80 overflow-hidden bg-slate-100">
              <SafeImage
                src={article.image}
                alt={article.title}
                className="w-full h-full object-cover object-top"
                fallback={<div className="h-full w-full bg-[linear-gradient(135deg,#eef2ff_0%,#f8fafc_100%)]" aria-hidden="true" />}
              />
            </div>
          )}

          <div className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide ${cfg.badge}`}>
                {cfg.label}
              </span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{article.department}</span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{article.audience}</span>
              <span className="text-xs text-gray-400 ml-auto">{article.date}</span>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold text-kbc-navy leading-tight mb-4">{article.title}</h2>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6">
              <div>
                <p className="text-base text-gray-600 leading-8 mb-6">{article.excerpt}</p>

                <div className="space-y-4 text-sm text-gray-600 leading-7">
                  {paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <aside className="space-y-4">
                <div className={`rounded-2xl border px-4 py-4 ${cfg.panel}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-information-line text-base" />
                    <p className="text-sm font-semibold">Article status</p>
                  </div>
                  <p className="text-sm leading-6">
                    {article.requiresAcknowledgement && article.acknowledged
                      ? 'You have already acknowledged this announcement.'
                      : article.requiresAcknowledgement
                      ? 'This announcement requires your acknowledgement and follow-up.'
                      : 'This announcement is for information and awareness.'}
                  </p>
                </div>

                {article.requiresAcknowledgement && (
                  article.acknowledged ? (
                    <button
                      type="button"
                      onClick={() => toggleAcknowledgement(article.id)}
                      className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-left text-yellow-800 hover:bg-amber-100"
                    >
                      <div className="flex items-center gap-2">
                        <i className="ri-arrow-go-back-line text-base" />
                        <p className="text-sm font-semibold">Undo Acknowledgement</p>
                      </div>
                      <p className="mt-2 text-sm leading-6">
                        This will return the notice to pending acknowledgement.
                      </p>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleAcknowledgement(article.id)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kbc-navy px-4 py-3 text-sm font-semibold text-white hover:bg-kbc-navy-light"
                    >
                      <i className="ri-check-line text-base" />
                      Acknowledge This Notice
                    </button>
                  )
                )}

                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                  <p className="text-sm font-semibold text-kbc-navy mb-3">Details</p>
                  <div className="space-y-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <i className="ri-user-line text-gray-400" />
                      <span>{article.author ?? 'KBC Communications Team'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-price-tag-3-line text-gray-400" />
                      <span>{article.category ?? 'General'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-calendar-line text-gray-400" />
                      <span>{article.date}</span>
                    </div>
                  </div>
                </div>

                <Link
                  to="/news"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kbc-navy px-4 py-3 text-sm font-semibold text-white hover:bg-kbc-navy-light"
                >
                  <i className="ri-arrow-left-line text-base" />
                  Back to News
                </Link>
              </aside>
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
