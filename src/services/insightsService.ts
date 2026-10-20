// Insights API (IN-0): `/insights/*` on ESG-lite (docs/insights/01-contracts.md §4).
// IN-0 adds the status and sites calls and one panel getter; panel hooks live in
// src/features/insights/api.ts (TanStack Query).
import api from "../api/axios";
import { PANEL_PATHS, type InsightsQuery, type InsightsSites, type InsightsStatus, type PanelDataMap, type PanelId, type PanelResponse } from "../lib/insights/contracts";

const companyParams = (companyId: number | null | undefined) => (companyId ? { company_id: companyId } : undefined);

/** GET /insights/status: answers while the switch is off. A body that isn't an object reads as `{}`. */
export async function getInsightsStatus(companyId?: number | null): Promise<Partial<InsightsStatus>> {
  const { data } = await api.get("/insights/status", { params: companyParams(companyId) });
  return data && typeof data === "object" ? (data as Partial<InsightsStatus>) : {};
}

/** GET /insights/sites: the caller's sites for the header chips. */
export async function getInsightsSites(companyId?: number | null): Promise<InsightsSites> {
  const { data } = await api.get("/insights/sites", { params: companyParams(companyId) });
  return data as InsightsSites;
}

/** The query string every panel takes (`sites` as "all" or "1,2"; no `pillar` when none is chosen). */
export function panelParams(q: InsightsQuery, extra: Record<string, string | number> = {}, companyId?: number | null): Record<string, string | number> {
  return {
    year: q.year,
    yearType: q.yearType,
    sites: q.sites === "all" ? "all" : q.sites.join(","),
    ...(q.pillar ? { pillar: q.pillar } : {}),
    compare: q.compare,
    ...extra,
    ...(companyId ? { company_id: companyId } : {}),
  };
}

/** GET /insights/<panel>: one panel's envelope. */
export async function getInsightsPanel<P extends PanelId>(panel: P, q: InsightsQuery, extra: Record<string, string | number> = {}, companyId?: number | null): Promise<PanelResponse<PanelDataMap[P]>> {
  const { data } = await api.get(`/insights${PANEL_PATHS[panel]}`, { params: panelParams(q, extra, companyId) });
  return data as PanelResponse<PanelDataMap[P]>;
}
