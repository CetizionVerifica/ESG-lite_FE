// IN-0 · Insights URL state ↔ panel query (docs/insights/01-contracts.md §9,
// 05-ux §5): `?year=&yearType=&sites=&pillar=&compare=&panel=`. Filters live
// in the URL so links are shareable; every panel's query key includes the
// whole query. `panel` is a scroll target, not a filter (it isn't sent).
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { COMPARES, PANEL_IDS, PILLARS, YEAR_TYPES, type Compare, type InsightsQuery, type PanelId, type Pillar, type SiteFilter, type YearType } from "./contracts";

export interface InsightsUrlState {
  query: InsightsQuery;
  /** `?panel=`: scroll to and pulse that panel. */
  panel: PanelId | null;
}

const pick = <T extends string>(list: readonly T[], v: string | null, fallback: T): T => ((list as readonly string[]).includes(v ?? "") ? (v as T) : fallback);

/** `sites`: "all" (or nothing) → "all"; "3,1" → [1, 3]; anything malformed reads as "all". */
export function parseSites(v: string | null): SiteFilter {
  if (!v || v === "all" || !/^\d+(,\d+)*$/.test(v)) return "all";
  const ids = [...new Set(v.split(",").map(Number))].filter((n) => n > 0).sort((a, b) => a - b);
  return ids.length ? ids : "all";
}

/** Pure: the URL's state with defaults (this calendar year, CY, all sites, no pillar, compare with last year). */
export function readInsightsQuery(params: URLSearchParams, now: Date = new Date()): InsightsUrlState {
  const thisYear = now.getFullYear();
  const y = Number(params.get("year"));
  const year = Number.isInteger(y) && y >= 1990 && y <= 2100 ? y : thisYear;
  const pillarRaw = params.get("pillar");
  const pillar: Pillar | null = (PILLARS as readonly string[]).includes(pillarRaw ?? "") ? (pillarRaw as Pillar) : null;
  const panelRaw = params.get("panel");
  return {
    query: {
      year,
      yearType: pick<YearType>(YEAR_TYPES, params.get("yearType"), "CY"),
      sites: parseSites(params.get("sites")),
      pillar,
      compare: pick<Compare>(COMPARES, params.get("compare"), "prior"),
    },
    panel: (PANEL_IDS as readonly string[]).includes(panelRaw ?? "") ? (panelRaw as PanelId) : null,
  };
}

export type InsightsPatch = Partial<InsightsQuery> & { panel?: PanelId | null };

/** Pure: `params` with `patch` applied; defaults are left out of the URL so it stays short. */
export function writeInsightsQuery(params: URLSearchParams, patch: InsightsPatch, now: Date = new Date()): URLSearchParams {
  const next = new URLSearchParams(params);
  const put = (key: string, value: string | null) => {
    if (value === null) next.delete(key); // data-loss-reviewed: URL param, not a record
    else next.set(key, value);
  };
  if ("year" in patch) put("year", patch.year === undefined || patch.year === now.getFullYear() ? null : String(patch.year));
  if ("yearType" in patch) put("yearType", !patch.yearType || patch.yearType === "CY" ? null : patch.yearType);
  if ("sites" in patch) put("sites", !patch.sites || patch.sites === "all" || patch.sites.length === 0 ? null : [...patch.sites].sort((a, b) => a - b).join(","));
  if ("pillar" in patch) put("pillar", patch.pillar ?? null);
  if ("compare" in patch) put("compare", !patch.compare || patch.compare === "prior" ? null : patch.compare);
  if ("panel" in patch) put("panel", patch.panel ?? null);
  return next;
}

/** A stable string of the query, for TanStack Query keys. */
export const queryKeyPart = (q: InsightsQuery) => [q.year, q.yearType, q.sites === "all" ? "all" : q.sites.join(","), q.pillar ?? "", q.compare] as const;

/** URL ↔ query for the Insights page. `set` replaces history (filters aren't navigation). */
export function useInsightsQuery(): InsightsUrlState & { set: (patch: InsightsPatch) => void } {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the params' identity
  const state = useMemo(() => readInsightsQuery(params), [key]);
  const set = useCallback((patch: InsightsPatch) => setParams((p) => writeInsightsQuery(p, patch), { replace: true }), [setParams]);
  return { ...state, set };
}
