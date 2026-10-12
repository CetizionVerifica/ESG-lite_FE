import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parsePeriod, serializePeriod, type Period } from "../period";

export type Scope = 1 | 2 | 3;

export type ContextValues = {
  period: Period | null;
  /** Empty means all sites. */
  siteIds: number[];
  /** Empty means all categories. `?category=1,2` when the chip allows several. */
  categoryIds: number[];
  /** The one chosen category, or null for none or several (single-category pages). */
  categoryId: number | null;
  scope: Scope | null;
};

export type ContextPatch = Partial<ContextValues>;

const idList = (raw: string | null) => [
  ...new Set(
    (raw ?? "")
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0),
  ),
];

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
  const categoryIds = idList(params.get(CONTEXT_KEYS.category));
  const scope = Number(params.get(CONTEXT_KEYS.scope));
  return {
    period: parsePeriod(params.get(CONTEXT_KEYS.period)),
    siteIds: idList(params.get(CONTEXT_KEYS.site)),
    categoryIds,
    categoryId: categoryIds.length === 1 ? categoryIds[0] : null,
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
  if ("categoryIds" in patch) set(CONTEXT_KEYS.category, patch.categoryIds?.length ? [...patch.categoryIds].sort((a, b) => a - b).join(",") : null);
  else if ("categoryId" in patch) set(CONTEXT_KEYS.category, patch.categoryId ? String(patch.categoryId) : null);
  if ("scope" in patch) set(CONTEXT_KEYS.scope, patch.scope ? String(patch.scope) : null);
  return next;
}

const categoryValues = (categoryIds: number[]) => ({ categoryIds, categoryId: categoryIds.length === 1 ? categoryIds[0] : null });

/**
 * Page context (period, sites, category, scope) held in the URL so links are shareable.
 * `defaults` fill in values the URL doesn't carry (they are not written to the URL);
 * a key cleared to "all" stays cleared.
 */
export function useContextParams(defaults: ContextPatch = {}) {
  const [params, setParams] = useSearchParams();
  const fromUrl = useMemo(() => readContext(params), [params]);
  const { period: dPeriod, siteIds: dSites, categoryId: dCategory, scope: dScope } = defaults;
  const dCategoryKey = (defaults.categoryIds ?? (dCategory ? [dCategory] : [])).join(",");
  // Keyed on the joined ids so a fresh defaults array each render doesn't rebuild the values.
  const dCategories = useMemo(() => idList(dCategoryKey), [dCategoryKey]);
  const values: ContextValues = useMemo(() => {
    // "all" in the URL means the user cleared it: no fallback to the default.
    const all = (key: string) => isAll(params, key);
    return {
      period: fromUrl.period ?? (all(CONTEXT_KEYS.period) ? null : dPeriod ?? null),
      siteIds: fromUrl.siteIds.length || all(CONTEXT_KEYS.site) ? fromUrl.siteIds : dSites ?? [],
      ...categoryValues(fromUrl.categoryIds.length || all(CONTEXT_KEYS.category) ? fromUrl.categoryIds : dCategories),
      scope: fromUrl.scope ?? (all(CONTEXT_KEYS.scope) ? null : dScope ?? null),
    };
  }, [params, fromUrl, dPeriod, dSites, dCategories, dScope]);
  const update = useCallback(
    (patch: ContextPatch) => setParams((p) => writeContext(p, patch), { replace: true }),
    [setParams],
  );
  return [values, update] as const;
}
