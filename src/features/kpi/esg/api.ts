import { useQuery } from "@tanstack/react-query";
import type { KpiPillar, KpiTopic, YearType } from "../../../lib/kpi/contracts";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { getKpiDashboard, getKpiEsg, getKpiValues } from "../../../services/kpiService";

export { kpiErrorMessage } from "../../../services/kpiService";

export const esgKeys = {
  one: (companyId: number | null, year: number, site: number | null, pillar: KpiPillar | null) => ["kpi", "esg", companyId, year, site, pillar] as const,
};

/** `GET /kpi/esg?year=&site=&pillar=`: pillars, topics, headline trends, sites and movers (approved values only). */
export function useEsg(year: number, site: number | null, pillar: KpiPillar | null) {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: esgKeys.one(companyId, year, site, pillar), queryFn: () => getKpiEsg({ year, site, pillar }, companyId), placeholderData: (prev) => prev, staleTime: 30_000 });
}

/**
 * The topic drawer's KPIs: the KPI dashboard's answer for the topic (cards
 * with value, change and series, and the gaps) and the year's pending values.
 * Same query key as the KPI dashboard, so the two share the cache.
 */
export function useTopicDetail(year: number, site: number | null, topic: KpiTopic | null, yearType: YearType = "CY") {
  const companyId = useKpiCompanyId();
  const dashboard = useQuery({
    queryKey: ["kpi", "dashboard", companyId, year, site, topic] as const,
    queryFn: () => getKpiDashboard({ year, site, topic }, companyId),
    enabled: !!topic,
    staleTime: 30_000,
  });
  const pending = useQuery({
    queryKey: ["kpi", "esg", "pending", companyId, year, site, yearType] as const,
    // A financial year runs April to March (FY 2026 = Apr 2026 – Mar 2027).
    queryFn: () =>
      getKpiValues({ status: "pending", from: yearType === "FY" ? `${year}-04-01` : `${year}-01-01`, to: yearType === "FY" ? `${year + 1}-03-31` : `${year}-12-31`, ...(site ? { site } : {}) }, companyId),
    enabled: !!topic,
    staleTime: 30_000,
    retry: false,
  });
  return { dashboard, pending };
}
