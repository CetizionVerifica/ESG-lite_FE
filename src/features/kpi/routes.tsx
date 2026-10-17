import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";
import { ComingSoon } from "./components/ComingSoon";

// KPI tracking pages (KPI-0 owns this file; each module adds its own line, `// KPI-n`).
// Until a module lands, its route shows a placeholder behind the switch (KPI-1).
const LibraryPage = lazy(() => import("./library/Page")); // KPI-2
const SetupPage = lazy(() => import("./setup/Page")); // KPI-3
const MyKpisPage = lazy(() => import("./my-kpis/Page")); // KPI-7

export const pages: ModulePages = {
  "kpi-my": <MyKpisPage />, // KPI-7
  "kpi-setup": <SetupPage />, // KPI-3
  "kpi-targets": <ComingSoon title="KPI targets" description="Targets per KPI and progress against a baseline." what="KPI targets" />, // KPI-9
  "kpi-dashboard": <ComingSoon title="KPIs" description="How complete the year is per framework, and what's missing." what="The KPI dashboard" />, // KPI-10
  "kpi-reports": <ComingSoon title="Framework reports" description="GRI, BRSR and ESRS reports from approved values." what="Framework reports" />, // KPI-11
  "kpi-library": <LibraryPage />, // KPI-2
};
