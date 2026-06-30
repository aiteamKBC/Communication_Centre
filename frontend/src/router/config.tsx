import type { RouteObject } from "react-router-dom";
import { lazy, Suspense, type ComponentType } from "react";

const NotFound = lazy(() => import("../pages/NotFound"));
const Home = lazy(() => import("../pages/home/page"));
const NewsPage = lazy(() => import("../pages/news/page"));
const DashboardPage = lazy(() => import("../pages/dashboard/page"));
const RiskRegisterPage = lazy(() => import("../pages/risk-register/page"));
const DocumentsPage = lazy(() => import("../pages/documents/page"));
const DepartmentsPage = lazy(() => import("../pages/departments/page"));
const DepartmentDetailPage = lazy(() => import("../pages/departments/detail"));
const EventsPage = lazy(() => import("../pages/events/page"));
const FeedbackPage = lazy(() => import("../pages/feedback/page"));
const ApprenticeshipTimeline = lazy(() => import("../pages/apprenticeships-timeline/page"));
const LoginPage = lazy(() => import("../pages/login/page"));
const MicrosoftPopupCallbackPage = lazy(() => import("../pages/login/microsoft-popup"));
const UrgentNoticePage = lazy(() => import("../pages/urgent-notice/page"));
const LeadershipMessagePage = lazy(() => import("../pages/leadership-message/page"));
const UserActivityPage = lazy(() => import("../pages/user-activity/page"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 font-sans text-kbc-navy">
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs font-bold shadow-sm">
        <i className="ri-loader-4-line animate-spin text-sm text-kbc-amber" />
        Loading...
      </div>
    </div>
  );
}

function routeElement(Page: ComponentType) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Page />
    </Suspense>
  );
}

const routes: RouteObject[] = [
  {
    path: "/",
    element: routeElement(Home),
  },
  {
    path: "/news",
    element: routeElement(NewsPage),
  },
  {
    path: "/dashboard",
    element: routeElement(DashboardPage),
  },
  {
    path: "/user-activity",
    element: routeElement(UserActivityPage),
  },
  {
    path: "/risk-register",
    element: routeElement(RiskRegisterPage),
  },
  {
    path: "/documents",
    element: routeElement(DocumentsPage),
  },
  {
    path: "/departments",
    element: routeElement(DepartmentsPage),
  },
  {
    path: "/departments/:dept",
    element: routeElement(DepartmentDetailPage),
  },
  {
    path: "/events",
    element: routeElement(EventsPage),
  },
  {
    path: "/feedback",
    element: routeElement(FeedbackPage),
  },
  {
    path: "/login",
    element: routeElement(LoginPage),
  },
  {
    path: "/login/microsoft-popup",
    element: routeElement(MicrosoftPopupCallbackPage),
  },
  {
    path: "/employer_dashboard/*",
    element: routeElement(NotFound),
  },
  {
    path: "/training-plan",
    element: routeElement(ApprenticeshipTimeline),
  },
  {
    path: "/urgent-notice/new",
    element: routeElement(UrgentNoticePage),
  },
  {
    path: "/leadership-message/new",
    element: routeElement(LeadershipMessagePage),
  },
  {
    path: "/apprenticeships-timeline",
    element: routeElement(ApprenticeshipTimeline),
  },
  {
    path: "*",
    element: routeElement(NotFound),
  },
];

export default routes;
