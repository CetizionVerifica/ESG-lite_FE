import { lazy } from "react";
import type { ModulePages, ModuleSlots } from "../../routes/pageRegistry";

// KPI tracking pages (KPI-0 owns this file; each module adds its own line, `// KPI-n`).
// Every page sits behind the switch (KPI-1, RoleGuard → KpiGate).
const LibraryPage = lazy(() => import("./library/Page")); // KPI-2
const SetupPage = lazy(() => import("./setup/Page")); // KPI-3
const MyKpisPage = lazy(() => import("./my-kpis/Page")); // KPI-7
const ReviewView = lazy(() => import("./review/View")); // KPI-8
const TargetsPage = lazy(() => import("./targets/Page")); // KPI-9
const DashboardPage = lazy(() => import("./dashboard/Page")); // KPI-10
const ReportsPage = lazy(() => import("./reports/Page")); // KPI-11

export const pages: ModulePages = {
  "kpi-my": <MyKpisPage />, // KPI-7
  "kpi-setup": <SetupPage />, // KPI-3
  "kpi-targets": <TargetsPage />, // KPI-9
  "kpi-dashboard": <DashboardPage />, // KPI-10
  "kpi-reports": <ReportsPage />, // KPI-11
  "kpi-library": <LibraryPage />, // KPI-2
};

// Content KPI modules put inside other modules' pages (src/routes/moduleSlots.ts).
export const slots: ModuleSlots = {
  "approvals-kpi": ReviewView, // KPI-8: Approvals → KPIs tab
};
