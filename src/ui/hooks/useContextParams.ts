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

/**
 * Written for a cleared selector ("All sites", any category…). An explicit
 * value, so a page's defaults don't come back; it reads as an empty selection.
 */
export const ALL = "all";

/** True when the URL explicitly says "all" for this key. */
export function isAll(params: URLSearchParams, key: string): boolean {
  return params.get(key) === ALL;
}

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

/**
 * Returns new params with the patch applied; other query keys are kept.
 * A cleared value is written as `ALL` so it survives over page defaults.
 */
export function writeContext(params: URLSearchParams, patch: ContextPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) => next.set(key, value || ALL);
  if ("period" in patch) set(CONTEXT_KEYS.period, patch.period ? serializePeriod(patch.period) : null);
  if ("siteIds" in patch) set(CONTEXT_KEYS.site, patch.siteIds?.length ? [...patch.siteIds].sort((a, b) => a - b).join(",") : null);
  if ("categoryId" in patch) set(CONTEXT_KEYS.category, patch.categoryId ? String(patch.categoryId) : null);
  if ("scope" in patch) set(CONTEXT_KEYS.scope, patch.scope ? String(patch.scope) : null);
  return next;
}

/**
 * Page context (period, sites, category, scope) held in the URL so links are shareable.
 * `defaults` fill in values the URL doesn't carry (they are not written to the URL);
 * a key cleared to "all" stays cleared.
 */
export function useContextParams(defaults: ContextPatch = {}) {
  const [params, setParams] = useSearchParams();
  const fromUrl = useMemo(() => readContext(params), [params]);
  const { period: dPeriod, siteIds: dSites, categoryId: dCategory, scope: dScope } = defaults;
  const values: ContextValues = useMemo(() => {
    // "all" in the URL means the user cleared it: no fallback to the default.
    const all = (key: string) => isAll(params, key);
    return {
      period: fromUrl.period ?? (all(CONTEXT_KEYS.period) ? null : dPeriod ?? null),
      siteIds: fromUrl.siteIds.length || all(CONTEXT_KEYS.site) ? fromUrl.siteIds : dSites ?? [],
      categoryId: fromUrl.categoryId ?? (all(CONTEXT_KEYS.category) ? null : dCategory ?? null),
      scope: fromUrl.scope ?? (all(CONTEXT_KEYS.scope) ? null : dScope ?? null),
    };
  }, [params, fromUrl, dPeriod, dSites, dCategory, dScope]);
  const update = useCallback(
    (patch: ContextPatch) => setParams((p) => writeContext(p, patch), { replace: true }),
    [setParams],
  );
  return [values, update] as const;
}
