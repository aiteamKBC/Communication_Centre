import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ComingSoon from '../../components/feature/ComingSoon';

export default function RiskRegisterPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />
      <div className="flex-1">
        <ComingSoon
          title="Risk Register"
          icon="ri-error-warning-line"
          breadcrumb="Risk Register"
        />
      </div>
      <Footer />
    </div>
  );
}
