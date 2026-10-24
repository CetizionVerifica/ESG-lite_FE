// Insights API (IN-0): `/insights/*` on ESG-lite (docs/insights/01-contracts.md §4).
// IN-0 adds the status and sites calls and one panel getter; panel hooks live in
// src/features/insights/api.ts (TanStack Query).
import api from "../api/axios";
import { PANEL_PATHS, type EventCreate, type EventRef, type InsightsQuery, type InsightsSites, type InsightsStatus, type MaterialityScoresBody, type MaterialityScoresResponse, type PanelDataMap, type PanelId, type PanelResponse } from "../lib/insights/contracts";

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

// IN-4 · events (01-contracts §4): list, add, edit, delete. Manager+; the
// server checks site scope and who may edit (creator, Admin, Superadmin).

/** `?from=&to=` (ISO dates, both optional). */
export interface EventsRange {
  from?: string;
  to?: string;
}

/** GET /insights/events: the events in the range. */
export async function listInsightsEvents(range: EventsRange = {}, companyId?: number | null): Promise<EventRef[]> {
  const params = { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}), ...companyParams(companyId) };
  const { data } = await api.get("/insights/events", { params });
  return ((data as { events?: EventRef[] } | null)?.events ?? []) as EventRef[];
}

/** POST /insights/events: `{date, label (≤ 60), kind, site_id?}`. */
export async function createInsightsEvent(body: EventCreate, companyId?: number | null): Promise<EventRef> {
  const { data } = await api.post("/insights/events", body, { params: companyParams(companyId) });
  return data as EventRef;
}

/** PATCH /insights/events/:id: any of the create fields. */
export async function updateInsightsEvent(id: number, patch: Partial<EventCreate>, companyId?: number | null): Promise<EventRef> {
  const { data } = await api.patch(`/insights/events/${id}`, patch, { params: companyParams(companyId) });
  return data as EventRef;
}

/** DELETE /insights/events/:id. */
export async function deleteInsightsEvent(id: number, companyId?: number | null): Promise<void> {
  // data-loss-reviewed: deletes one Insights event marker (label, date, kind) and nothing else; EventsDrawer asks "Delete “label”? It comes off every chart." inline first, and the server checks role and site. Not undoable.
  await api.delete(`/insights/events/${id}`, { params: companyParams(companyId) });
}

/** GET /insights/snapshot.pdf (IN-8): the one-page PDF of the page for the query. */
export async function getInsightsSnapshot(q: InsightsQuery, companyId?: number | null): Promise<Blob> {
  const { data } = await api.get("/insights/snapshot.pdf", { params: panelParams(q, {}, companyId), responseType: "blob", timeout: 70_000 });
  return data as Blob;
}

// IN-7 · materiality scores in KPI setup (behind KPI tracking, not Design Studio): GET any role, PUT Admin and Superadmin.
export async function getMaterialityScores(companyId?: number | null): Promise<MaterialityScoresResponse> {
  const { data } = await api.get("/kpi/setup/materiality-scores", { params: companyParams(companyId) });
  return data as MaterialityScoresResponse;
}
export async function putMaterialityScores(topics: MaterialityScoresBody["topics"], companyId?: number | null): Promise<MaterialityScoresResponse> {
  const { data } = await api.put("/kpi/setup/materiality-scores", { topics, ...(companyId ? { company_id: companyId } : {}) }, { params: companyParams(companyId) });
  return data as MaterialityScoresResponse;
}
