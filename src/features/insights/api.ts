// IN-0 · Insights data hooks: one TanStack Query hook per panel, keyed by the
// panel and the whole URL query (layer rule 5). `keepPreviousData` keeps the
// old chart (dimmed) while the next one loads.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EventCreate, InsightsQuery, PanelDataMap, PanelId, PanelResponse } from "../../lib/insights/contracts";
import { queryKeyPart } from "../../lib/insights/query";
import { useInsightsCompanyId } from "../../lib/insights/switch";
import {
  type EventsRange,
  createInsightsEvent,
  deleteInsightsEvent,
  getInsightsPanel,
  getInsightsSites,
  listInsightsEvents,
  updateInsightsEvent,
} from "../../services/insightsService";

export const keys = {
  all: ["insights"] as const,
  sites: (companyId: number | null) => ["insights", "sites", companyId] as const,
  panels: ["insights", "panel"] as const,
  eventsAll: ["insights", "events"] as const,
  events: (companyId: number | null, range: EventsRange) => ["insights", "events", companyId, range.from ?? "", range.to ?? ""] as const,
  panel: (panel: PanelId, companyId: number | null, q: InsightsQuery, extra: Record<string, string | number>) => ["insights", "panel", panel, companyId, ...queryKeyPart(q), extra] as const,
};

/** A 4xx (switch off, forbidden, bad query, foreign site) won't change on retry. */
const retry = (count: number, error: unknown) => {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return !(status && status >= 400 && status < 500) && count < 2;
};

/** One panel's envelope for the query. `enabled: false` keeps a lazy tab from loading until it's opened. */
export function usePanel<P extends PanelId>(panel: P, query: InsightsQuery, opts: { extra?: Record<string, string | number>; enabled?: boolean } = {}) {
  const companyId = useInsightsCompanyId();
  const extra = opts.extra ?? {};
  return useQuery<PanelResponse<PanelDataMap[P]>>({
    queryKey: keys.panel(panel, companyId, query, extra),
    queryFn: () => getInsightsPanel(panel, query, extra, companyId),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
    retry,
  });
}

/** The caller's sites for the header chips (GET /insights/sites). */
export function useInsightsSites() {
  const companyId = useInsightsCompanyId();
  return useQuery({ queryKey: keys.sites(companyId), queryFn: () => getInsightsSites(companyId), retry, staleTime: 5 * 60_000 });
}

// IN-4 · events. Other panels (Decoupling) read them with `useInsightsEvents`
// to draw marks; every write refetches the events and the panels (events
// change the server's data stamp, and the pathway carries them).

/** GET /insights/events?from=&to= */
export function useInsightsEvents(range: EventsRange = {}, opts: { enabled?: boolean } = {}) {
  const companyId = useInsightsCompanyId();
  return useQuery({ queryKey: keys.events(companyId, range), queryFn: () => listInsightsEvents(range, companyId), enabled: opts.enabled ?? true, retry });
}

function useEventsRefresh() {
  const client = useQueryClient();
  return () => Promise.all([client.invalidateQueries({ queryKey: keys.eventsAll }), client.invalidateQueries({ queryKey: keys.panels })]);
}

/** POST /insights/events */
export function useCreateInsightsEvent() {
  const companyId = useInsightsCompanyId();
  const refresh = useEventsRefresh();
  return useMutation({ mutationFn: (body: EventCreate) => createInsightsEvent(body, companyId), onSuccess: refresh });
}

/** PATCH /insights/events/:id */
export function useUpdateInsightsEvent() {
  const companyId = useInsightsCompanyId();
  const refresh = useEventsRefresh();
  return useMutation({ mutationFn: ({ id, patch }: { id: number; patch: Partial<EventCreate> }) => updateInsightsEvent(id, patch, companyId), onSuccess: refresh });
}

/** DELETE /insights/events/:id */
export function useDeleteInsightsEvent() {
  const companyId = useInsightsCompanyId();
  const refresh = useEventsRefresh();
  return useMutation({ mutationFn: (id: number) => deleteInsightsEvent(id, companyId), onSuccess: refresh });
}
