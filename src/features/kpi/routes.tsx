import type { ModulePages } from "../../routes/pageRegistry";
import { ComingSoon } from "./components/ComingSoon";

// KPI tracking pages (KPI-0 owns this file; each module adds its own line, `// KPI-n`).
// Until a module lands, its route shows a placeholder behind the switch (KPI-1).

export const pages: ModulePages = {
  "kpi-my": <ComingSoon title="My KPIs" description="The KPIs you enter for your sites, by due date." what="Your KPI list" />, // KPI-7
  "kpi-setup": <ComingSoon title="KPI setup" description="Choose frameworks, what matters to you, the KPIs and who enters them." what="KPI setup" />, // KPI-3
  "kpi-targets": <ComingSoon title="KPI targets" description="Targets per KPI and progress against a baseline." what="KPI targets" />, // KPI-9
  "kpi-dashboard": <ComingSoon title="KPIs" description="How complete the year is per framework, and what's missing." what="The KPI dashboard" />, // KPI-10
  "kpi-reports": <ComingSoon title="Framework reports" description="GRI, BRSR and ESRS reports from approved values." what="Framework reports" />, // KPI-11
  "kpi-library": <ComingSoon title="KPI library" description="Every KPI, once, mapped to GRI, BRSR and ESRS disclosures." what="The KPI library" />, // KPI-2
};
