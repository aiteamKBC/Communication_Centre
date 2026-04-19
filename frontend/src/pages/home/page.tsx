import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import HeroSection from './components/HeroSection';
import QuickActions from './components/QuickActions';
import NewsFeed from './components/NewsFeed';
import TodaysSessions from './components/TodaysSessions';
import PrioritySnapshot from './components/PrioritySnapshot';
import RiskSummary from './components/RiskSummary';
import EventsWidget from './components/EventsWidget';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TopNav />

      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
            <i className="ri-layout-grid-line text-white text-base" />
          </div>
          <h1 className="text-lg font-bold text-kbc-navy">Communication Centre</h1>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto">
        <HeroSection />
        <QuickActions />

        {/* Main 3-column grid */}
        <main className="px-4 md:px-6 pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* Left column — Latest News (3/12) */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <NewsFeed />
              <TodaysSessions />
            </div>

            {/* Middle column — Priority + Risk (6/12) */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              <PrioritySnapshot />
              <RiskSummary />
            </div>

            {/* Right column — Calendar + Feedback (3/12) */}
            <div className="lg:col-span-3">
              <EventsWidget />
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
