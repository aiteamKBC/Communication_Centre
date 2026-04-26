import { useEffect, useState } from 'react';
import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import HeroSection, { type LeadershipMessageState, type UrgentNoticeState } from './components/HeroSection';
import QuickActions from './components/QuickActions';
import NewsFeed from './components/NewsFeed';
import TodaysSessions, { type TrainingItem } from './components/TodaysSessions';
import PrioritySnapshot from './components/PrioritySnapshot';
import RiskSummary from './components/RiskSummary';
import EventsWidget from './components/EventsWidget';
import { useSharedEvents } from '../../hooks/useSharedEvents';
import type { NewsItem } from '../../mocks/news';

type HomeBootstrapData = {
  urgentNotice: UrgentNoticeState | null;
  leadershipMessage: LeadershipMessageState | null;
  newsItems: NewsItem[];
  trainingItems: TrainingItem[];
};

function HomePageSkeleton() {
  return (
    <>
      <section className="w-full px-4 md:px-6 py-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="min-h-[200px] rounded-lg border border-slate-200 bg-white p-5 animate-pulse">
              <div className="h-7 w-36 rounded-full bg-slate-200" />
              <div className="mt-5 h-6 w-5/6 rounded-full bg-slate-200" />
              <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded-full bg-slate-100" />
                <div className="h-3 w-11/12 rounded-full bg-slate-100" />
                <div className="h-3 w-4/5 rounded-full bg-slate-100" />
              </div>
              <div className="mt-8 h-10 w-32 rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      </section>

      <section className="w-full px-4 md:px-6 pb-4">
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 animate-pulse">
          <div className="mb-3 h-5 w-24 rounded-full bg-slate-200" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-11 w-36 rounded-lg bg-slate-200" />
            ))}
          </div>
        </div>
      </section>

      <main className="px-4 md:px-6 pb-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-3">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white animate-pulse">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="h-5 w-24 rounded-full bg-slate-200" />
                <div className="flex gap-1">
                  <div className="h-6 w-6 rounded border border-slate-200 bg-slate-100" />
                  <div className="h-6 w-6 rounded border border-slate-200 bg-slate-100" />
                </div>
              </div>
              <div className="flex border-b border-gray-100">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-10 flex-1 bg-slate-50" />
                ))}
              </div>
              <div className="divide-y divide-gray-50">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 h-9 w-9 rounded-full bg-slate-200" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                      <div className="mt-3 flex items-center justify-between">
                        <div className="h-3 w-16 rounded-full bg-slate-100" />
                        <div className="h-3 w-20 rounded-full bg-slate-100" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">
                <div className="mx-auto h-4 w-24 rounded-full bg-slate-200" />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-5 w-32 rounded-full bg-slate-200" />
                <div className="h-4 w-24 rounded-full bg-slate-100" />
              </div>
              <div className="mt-3 space-y-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded bg-gray-50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-28 rounded-full bg-slate-200" />
                      <div className="mt-2 h-3 w-36 rounded-full bg-slate-100" />
                    </div>
                    <div className="ml-4">
                      <div className="h-4 w-16 rounded-full bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-6">
            {[0, 1].map((item) => (
              <div key={item} className="overflow-hidden rounded-lg border border-gray-200 bg-white animate-pulse">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div className="h-5 w-36 rounded-full bg-slate-200" />
                  <div className="h-4 w-20 rounded-full bg-slate-100" />
                </div>
                <div className="flex flex-col items-center justify-center gap-4 px-6 py-10">
                  <div className="h-12 w-12 rounded-full bg-slate-100" />
                  <div className="text-center">
                    <div className="mx-auto h-7 w-32 rounded-full bg-slate-100" />
                    <div className="mx-auto mt-3 h-4 w-24 rounded-full bg-slate-200" />
                    <div className="mx-auto mt-3 h-3 w-64 rounded-full bg-slate-100" />
                    <div className="mx-auto mt-2 h-3 w-52 rounded-full bg-slate-100" />
                  </div>
                  <div className="h-4 w-36 rounded-full bg-slate-200" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 lg:col-span-3">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white animate-pulse">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="h-5 w-28 rounded-full bg-slate-200" />
                <div className="h-4 w-4 rounded-full bg-slate-100" />
              </div>
              <div className="px-3 py-3">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="h-6 w-6 rounded-full bg-slate-100" />
                  <div className="h-4 w-28 rounded-full bg-slate-200" />
                  <div className="h-6 w-6 rounded-full bg-slate-100" />
                </div>
                <div className="mb-1 grid grid-cols-7 gap-2">
                  {Array.from({ length: 7 }, (_, item) => (
                    <div key={item} className="h-3 rounded-full bg-slate-100" />
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-x-2 gap-y-2">
                  {Array.from({ length: 35 }, (_, item) => (
                    <div key={item} className="flex justify-center">
                      <div className="h-7 w-7 rounded-full bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {[0, 1].map((item) => (
                  <div key={item} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="h-9 w-9 rounded-lg bg-slate-200" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-4/5 rounded-full bg-slate-200" />
                      <div className="mt-2 h-5 w-16 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">
                <div className="ml-auto h-4 w-24 rounded-full bg-slate-200" />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white animate-pulse">
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-100" />
                  <div>
                    <div className="h-4 w-32 rounded-full bg-slate-200" />
                    <div className="mt-2 h-3 w-20 rounded-full bg-slate-100" />
                  </div>
                </div>
                <div className="mt-4 h-10 w-full rounded-lg bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default function Home() {
  const { loading: eventsLoading } = useSharedEvents();
  const [homeData, setHomeData] = useState<HomeBootstrapData | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadHomeData() {
      const [urgentResult, leadershipResult, newsResult, trainingResult] = await Promise.allSettled([
        fetch('/api/urgent-notice/'),
        fetch('/api/leadership-message/'),
        fetch('/api/news/'),
        fetch('/api/training-plan/'),
      ]);

      const nextData: HomeBootstrapData = {
        urgentNotice: null,
        leadershipMessage: null,
        newsItems: [],
        trainingItems: [],
      };

      if (urgentResult.status === 'fulfilled' && urgentResult.value.ok) {
        const payload = await urgentResult.value.json() as Partial<UrgentNoticeState>;
        if (payload?.title && payload?.body) {
          nextData.urgentNotice = {
            id: payload.id,
            title: payload.title,
            body: payload.body,
            date: payload.date,
          };
        }
      }

      if (leadershipResult.status === 'fulfilled' && leadershipResult.value.ok) {
        const payload = await leadershipResult.value.json() as Partial<LeadershipMessageState>;
        if (payload?.cardTitle && payload?.body) {
          nextData.leadershipMessage = {
            id: payload.id,
            cardTitle: payload.cardTitle,
            authorName: payload.authorName || 'Prof. David Kingsley',
            authorRole: payload.authorRole || 'Principal & CEO, Kent Business College',
            body: payload.body,
            date: payload.date,
            coverImageUrl: payload.coverImageUrl || '',
            profileImageUrl: payload.profileImageUrl || '',
          };
        }
      }

      if (newsResult.status === 'fulfilled' && newsResult.value.ok) {
        const payload = await newsResult.value.json() as NewsItem[];
        nextData.newsItems = Array.isArray(payload) ? payload : [];
      }

      if (trainingResult.status === 'fulfilled' && trainingResult.value.ok) {
        const payload = await trainingResult.value.json() as TrainingItem[];
        nextData.trainingItems = Array.isArray(payload) ? payload : [];
      }

      if (mounted) {
        setHomeData(nextData);
      }
    }

    void loadHomeData();

    return () => {
      mounted = false;
    };
  }, []);

  const showHomeSkeleton = !homeData || eventsLoading;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TopNav />

      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
            <i className="ri-layout-grid-line text-white text-base" />
          </div>
          <h1 className="text-lg font-bold text-kbc-navy">Communication Centre</h1>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto">
        {showHomeSkeleton ? (
          <HomePageSkeleton />
        ) : (
          <>
            <HeroSection
              initialUrgentNotice={homeData.urgentNotice}
              initialLeadershipMessage={homeData.leadershipMessage}
            />
            <QuickActions />

            <main className="px-4 md:px-6 pb-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-3 flex flex-col gap-4">
                  <NewsFeed initialItems={homeData.newsItems} />
                  <TodaysSessions initialItems={homeData.trainingItems} />
                </div>

                <div className="lg:col-span-6 flex flex-col gap-4">
                  <PrioritySnapshot />
                  <RiskSummary />
                </div>

                <div className="lg:col-span-3">
                  <EventsWidget />
                </div>
              </div>
            </main>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
