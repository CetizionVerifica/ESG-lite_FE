import { type ReactNode, lazy } from "react";
import { Navigate, Outlet, type RouteObject } from "react-router-dom";
import ClientContextProvider from "../lib/ClientContextProvider";
import AppShell, { type ShellHandle } from "../features/shell/AppShell";
import {
  LegacyRedirectRoute,
  NotFoundPage,
  PageErrorPage,
  PlaceholderPage,
  QueryTabSwitch,
  RoleGuard,
  RootRedirect,
} from "../features/shell/pages";
import { LEGACY_REDIRECTS, SHELL_ROUTES, type ShellRouteId, getShellRoute } from "../features/shell/routeMap";
import { ResetPasswordPage, SignInPage, StaffSignInPage } from "../features/sign-in/Page";
import ProtectedRoute from "./ProtectedRoute";

/**
 * Routes for the redesigned app. Mounted in front of the legacy routes only
 * when VITE_NEW_UI is on (see withNewUiRoutes in src/lib/featureFlags.ts).
 *
 * Until a page's redesign lands, its new path shows today's page inside the
 * new shell, so the flagged app stays usable. A page PR swaps its entry in
 * `pages` below for its src/features/<module>/Page.tsx.
 */

// Today's pages, loaded on demand so they stay out of the shell's bundle.
const Legacy = {
  UserDataEntry: lazy(() => import("../pages/UserDataEntryPage")),
  UserEmissions: lazy(() => import("../pages/UserEmissionsPage")),
  ProductionData: lazy(() => import("../pages/ProductionDataPage")),
  Sbti: lazy(() => import("../pages/sbti/SbtiMain")),
  CompanyAdminUsers: lazy(() => import("../pages/CompanyAdmin/CompanyAdminUsersPage")),
  SuperAdmin: lazy(() => import("../pages/SuperAdminPage")),
  Companies: lazy(() => import("../pages/CompanyPage")),
  CompanyOnboarding: lazy(() => import("../pages/CompanyOnboardingPage")),
  Sites: lazy(() => import("../pages/SitePage")),
  Users: lazy(() => import("../pages/UserPage")),
  Countries: lazy(() => import("../pages/CountryPage")),
  Categories: lazy(() => import("../pages/CategoryPage")),
  Units: lazy(() => import("../pages/UnitsPage")),
  Products: lazy(() => import("../pages/ProductPage")),
  EmissionFactors: lazy(() => import("../pages/EmissionFactorPage")),
  CategoryMappings: lazy(() => import("../pages/CategoryMappingPage")),
  Thresholds: lazy(() => import("../pages/ThresholdValuePage")),
  Columns: lazy(() => import("../pages/ColumnPage")),
  ColumnConfig: lazy(() => import("../pages/ColumnConfig")),
  Upload: lazy(() => import("../pages/UploadPage")),
};

// Redesigned pages, loaded on demand.
const BrandThemesPage = lazy(() => import("../features/brand-themes/Page"));
const AddDataPage = lazy(() => import("../features/add-data/Page"));
const MyMonthPage = lazy(() => import("../features/my-month/Page"));
const MyEntriesPage = lazy(() => import("../features/my-entries/Page"));
const BrandViewPage = lazy(() => import("../features/brand-themes/Page").then((m) => ({ default: m.BrandViewPage })));
const EmissionsPage = lazy(() => import("../features/approvals-ledger/Page"));
const OverviewPage = lazy(() => import("../features/overview/Page"));
const ProductionReviewPage = lazy(() => import("../features/production-review/Page"));
const TeamAccessPage = lazy(() => import("../features/team-access/Page"));
const SettingsPage = lazy(() => import("../features/settings/Page"));
const NotificationsPage = lazy(() => import("../features/notifications/Page"));
const GhgReportPage = lazy(() => import("../features/ghg-report/Page"));
const EdeReportPage = lazy(() => import("../features/ede-report/Page"));

const placeholder = (id: ShellRouteId) => <PlaceholderPage route={getShellRoute(id)} />;

const pages: Record<ShellRouteId, ReactNode> = {
  "my-month": <MyMonthPage />,
  "add-data": <AddDataPage />,
  "add-data-classic": <Legacy.UserDataEntry />,
  "my-entries": <MyEntriesPage />,
  production: <Legacy.ProductionData />,
  overview: <OverviewPage />,
  // Keyed so switching tabs remounts: each tab starts from its own defaults.
  approvals: <EmissionsPage key="approvals" tab="approvals" />,
  ledger: <EmissionsPage key="ledger" tab="ledger" />,
  "production-review": <ProductionReviewPage />,
  team: <TeamAccessPage />,
  "ghg-report": <GhgReportPage />,
  "ede-report": <EdeReportPage />,
  targets: <Legacy.Sbti />,
  pcf: placeholder("pcf"),
  notifications: <NotificationsPage />,
  settings: <SettingsPage />,
  "company-users": <Legacy.CompanyAdminUsers />,
  console: <Legacy.SuperAdmin />,
  clients: <Legacy.Companies />,
  "client-new": <Legacy.CompanyOnboarding />,
  "client-detail": placeholder("client-detail"),
  "brand-themes": <BrandThemesPage />,
  "brand-view": <BrandViewPage />,
  sites: <Legacy.Sites />,
  "users-global": <Legacy.Users />,
  "reference-data": (
    <QueryTabSwitch
      param="tab"
      fallback="countries"
      views={{ countries: <Legacy.Countries />, categories: <Legacy.Categories />, units: <Legacy.Units /> }}
    />
  ),
  products: <Legacy.Products />,
  "emission-factors": <Legacy.EmissionFactors />,
  "category-mappings": <Legacy.CategoryMappings />,
  thresholds: <Legacy.Thresholds />,
  "capture-columns": <Legacy.Columns />,
  "capture-forms": <Legacy.ColumnConfig />,
  "capture-form": placeholder("capture-form"),
  "bulk-upload": <Legacy.Upload />,
};

const shellRoutes: RouteObject[] = SHELL_ROUTES.flatMap((route) => {
  const element = <RoleGuard route={route}>{pages[route.id]}</RoleGuard>;
  const handle: ShellHandle = { shellRoute: route };
  // "/products/*" must also claim "/products" itself: an exact legacy path
  // outranks a splat in React Router.
  const paths = route.path.endsWith("/*") ? [route.path.slice(0, -2), route.path] : [route.path];
  return paths.map((path) => ({ path, element, handle, errorElement: <PageErrorPage /> }));
});

const newUiRoutes: RouteObject[] = [
  { path: "/", element: <RootRedirect /> },
  // P01: signed-out screens, outside the shell.
  { path: "/login", element: <SignInPage /> },
  { path: "/:clientSlug/login", element: <SignInPage /> },
  { path: "/superadmin/login", element: <StaffSignInPage /> },
  { path: "/admin/login", element: <Navigate to="/superadmin/login" replace /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: (
      <ClientContextProvider>
        <Outlet />
      </ClientContextProvider>
    ),
    children: [
      ...LEGACY_REDIRECTS.map((redirect) => ({ path: redirect.from, element: <LegacyRedirectRoute redirect={redirect} /> })),
      {
        element: <ProtectedRoute />,
        children: [{ element: <AppShell />, children: [...shellRoutes, { path: "*", element: <NotFoundPage /> }] }],
      },
    ],
  },
];

export default newUiRoutes;
