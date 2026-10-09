import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parsePeriod, serializePeriod, type Period } from "../period";

export type Scope = 1 | 2 | 3;

export type ContextValues = {
  period: Period | null;
  /** Empty means all sites. */
  siteIds: number[];
  categoryId: number | null;
  scope: Scope | null;
};

export type ContextPatch = Partial<ContextValues>;

/** `?period=&site=&category=&scope=` keys. Pages read context only through this hook. */
export const CONTEXT_KEYS = { period: "period", site: "site", category: "category", scope: "scope" } as const;

export function readContext(params: URLSearchParams): ContextValues {
  const siteIds = (params.get(CONTEXT_KEYS.site) ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  const category = Number(params.get(CONTEXT_KEYS.category));
  const scope = Number(params.get(CONTEXT_KEYS.scope));
  return {
    period: parsePeriod(params.get(CONTEXT_KEYS.period)),
    siteIds: [...new Set(siteIds)],
    categoryId: Number.isInteger(category) && category > 0 ? category : null,
    scope: scope === 1 || scope === 2 || scope === 3 ? scope : null,
  };
}

/** Returns new params with the patch applied; other query keys are kept. */
export function writeContext(params: URLSearchParams, patch: ContextPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) =>
    // data-loss-reviewed: removes a query-string key from the URL; no record is deleted.
    value ? next.set(key, value) : next.delete(key);
  if ("period" in patch) set(CONTEXT_KEYS.period, patch.period ? serializePeriod(patch.period) : null);
  if ("siteIds" in patch) set(CONTEXT_KEYS.site, patch.siteIds?.length ? [...patch.siteIds].sort((a, b) => a - b).join(",") : null);
  if ("categoryId" in patch) set(CONTEXT_KEYS.category, patch.categoryId ? String(patch.categoryId) : null);
  if ("scope" in patch) set(CONTEXT_KEYS.scope, patch.scope ? String(patch.scope) : null);
  return next;
}

/**
 * Page context (period, sites, category, scope) held in the URL so links are shareable.
 * `defaults` fill in values the URL doesn't carry (they are not written to the URL).
 */
export function useContextParams(defaults: ContextPatch = {}) {
  const [params, setParams] = useSearchParams();
  const fromUrl = useMemo(() => readContext(params), [params]);
  const { period: dPeriod, siteIds: dSites, categoryId: dCategory, scope: dScope } = defaults;
  const values: ContextValues = useMemo(
    () => ({
      period: fromUrl.period ?? dPeriod ?? null,
      siteIds: fromUrl.siteIds.length ? fromUrl.siteIds : dSites ?? [],
      categoryId: fromUrl.categoryId ?? dCategory ?? null,
      scope: fromUrl.scope ?? dScope ?? null,
    }),
    [fromUrl, dPeriod, dSites, dCategory, dScope],
  );
  const update = useCallback(
    (patch: ContextPatch) => setParams((p) => writeContext(p, patch), { replace: true }),
    [setParams],
  );
  return [values, update] as const;
}
