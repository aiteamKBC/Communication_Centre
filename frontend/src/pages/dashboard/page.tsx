import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ComingSoon from '../../components/feature/ComingSoon';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />
      <div className="flex-1">
        <ComingSoon
          title="Internal Dashboard"
          icon="ri-bar-chart-grouped-line"
          breadcrumb="Internal Dashboard"
        />
      </div>
      <Footer />
    </div>
  );
}
