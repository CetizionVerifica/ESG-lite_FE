import { type ReactNode, lazy } from "react";
import { PlaceholderPage, QueryTabSwitch } from "../features/shell/pages";
import { type ShellRouteId, getShellRoute } from "../features/shell/routeMap";

/**
 * What each shell route shows until its redesigned page lands: today's page
 * inside the new shell, or a placeholder. A module's own
 * src/features/<module>/routes.tsx overrides its entries here, so page PRs
 * don't need to edit this file; stale entries are cleaned up in one sweep.
 */

// Today's pages, loaded on demand so they stay out of the shell's bundle.
const Legacy = {
  UserDataEntry: lazy(() => import("../pages/UserDataEntryPage")),
  ProductionData: lazy(() => import("../pages/ProductionDataPage")),
  Sbti: lazy(() => import("../pages/sbti/SbtiMain")),
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

const placeholder = (id: ShellRouteId) => <PlaceholderPage route={getShellRoute(id)} />;

export const legacyPages: Record<ShellRouteId, ReactNode> = {
  "my-month": placeholder("my-month"),
  "add-data": placeholder("add-data"),
  "add-data-classic": <Legacy.UserDataEntry />,
  "my-entries": placeholder("my-entries"),
  production: <Legacy.ProductionData />,
  overview: placeholder("overview"),
  approvals: placeholder("approvals"),
  ledger: placeholder("ledger"),
  "production-review": placeholder("production-review"),
  team: placeholder("team"),
  "ghg-report": placeholder("ghg-report"),
  "ede-report": placeholder("ede-report"),
  targets: <Legacy.Sbti />,
  pcf: placeholder("pcf"),
  notifications: placeholder("notifications"),
  settings: placeholder("settings"),
  "company-users": placeholder("company-users"),
  console: <Legacy.SuperAdmin />,
  clients: <Legacy.Companies />,
  "client-new": <Legacy.CompanyOnboarding />,
  "client-detail": placeholder("client-detail"),
  "brand-themes": placeholder("brand-themes"),
  "brand-view": placeholder("brand-view"),
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
