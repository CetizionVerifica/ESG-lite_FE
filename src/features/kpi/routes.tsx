import { lazy } from "react";
import type { ModulePages, ModuleSlots } from "../../routes/pageRegistry";
import { ComingSoon } from "./components/ComingSoon";

// KPI tracking pages (KPI-0 owns this file; each module adds its own line, `// KPI-n`).
// Until a module lands, its route shows a placeholder behind the switch (KPI-1).
const LibraryPage = lazy(() => import("./library/Page")); // KPI-2
const SetupPage = lazy(() => import("./setup/Page")); // KPI-3
const MyKpisPage = lazy(() => import("./my-kpis/Page")); // KPI-7
const ReviewView = lazy(() => import("./review/View")); // KPI-8
const TargetsPage = lazy(() => import("./targets/Page")); // KPI-9
const DashboardPage = lazy(() => import("./dashboard/Page")); // KPI-10

export const pages: ModulePages = {
  "kpi-my": <MyKpisPage />, // KPI-7
  "kpi-setup": <SetupPage />, // KPI-3
  "kpi-targets": <TargetsPage />, // KPI-9
  "kpi-dashboard": <DashboardPage />, // KPI-10
  "kpi-reports": <ComingSoon title="Framework reports" description="GRI, BRSR and ESRS reports from approved values." what="Framework reports" />, // KPI-11
  "kpi-library": <LibraryPage />, // KPI-2
};

// Content KPI modules put inside other modules' pages (src/routes/moduleSlots.tsx).
export const slots: ModuleSlots = {
  "approvals-kpi": ReviewView, // KPI-8: Approvals → KPIs tab
};
