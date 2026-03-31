import TopNav from '../../components/feature/TopNav';
import Footer from '../../components/feature/Footer';
import ComingSoon from '../../components/feature/ComingSoon';

export default function DepartmentsPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <TopNav />
      <div className="flex-1">
        <ComingSoon
          title="Departments"
          icon="ri-building-4-line"
          breadcrumb="Departments"
        />
      </div>
      <Footer />
    </div>
  );
}
