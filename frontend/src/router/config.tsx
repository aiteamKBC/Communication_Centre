import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import NewsPage from "../pages/news/page";
import DashboardPage from "../pages/dashboard/page";
import RiskRegisterPage from "../pages/risk-register/page";
import DocumentsPage from "../pages/documents/page";
import DepartmentsPage from "../pages/departments/page";
import DepartmentDetailPage from "../pages/departments/detail";
import EventsPage from "../pages/events/page";
import FeedbackPage from "../pages/feedback/page";
import ApprenticeshipTimeline from "../pages/apprenticeships-timeline/page";
import LoginPage from "../pages/login/page";
import MicrosoftPopupCallbackPage from "../pages/login/microsoft-popup";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/news",
    element: <NewsPage />,
  },
  {
    path: "/dashboard",
    element: <DashboardPage />,
  },
  {
    path: "/risk-register",
    element: <RiskRegisterPage />,
  },
  {
    path: "/documents",
    element: <DocumentsPage />,
  },
  {
    path: "/departments",
    element: <DepartmentsPage />,
  },
  {
    path: "/departments/:dept",
    element: <DepartmentDetailPage />,
  },
  {
    path: "/events",
    element: <EventsPage />,
  },
  {
    path: "/feedback",
    element: <FeedbackPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/login/microsoft-popup",
    element: <MicrosoftPopupCallbackPage />,
  },
  {
    path: "/employer_dashboard/*",
    element: <NotFound />,
  },
  {
    path: "/training-plan",
    element: <ApprenticeshipTimeline />,
  },
  {
    path: "/apprenticeships-timeline",
    element: <ApprenticeshipTimeline />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
