/** Pure helpers behind FilterBar and useFilterParams. */

/** Search text plus the selected option values of each filter, by filter key. */
export type FilterValues = { q: string; filters: Record<string, string[]> };

export type SavedView = { name: string; value: FilterValues };

export const EMPTY_FILTERS: FilterValues = { q: "", filters: {} };

/** Adds or removes one option. A single-choice filter keeps at most one value. */
export function toggleOption(value: FilterValues, key: string, option: string, multiple = true): FilterValues {
  const current = value.filters[key] ?? [];
  const next = current.includes(option)
    ? current.filter((v) => v !== option)
    : multiple
      ? [...current, option]
      : [option];
  return { ...value, filters: { ...value.filters, [key]: next } };
}

export function clearFilter(value: FilterValues, key: string): FilterValues {
  return { ...value, filters: { ...value.filters, [key]: [] } };
}

/** Number of filters with a selection, plus one for search text. */
export function activeCount(value: FilterValues): number {
  const filters = Object.values(value.filters).filter((v) => v.length > 0).length;
  return filters + (value.q.trim() ? 1 : 0);
}

export function sameFilters(a: FilterValues, b: FilterValues): boolean {
  if (a.q.trim() !== b.q.trim()) return false;
  const keys = new Set([...Object.keys(a.filters), ...Object.keys(b.filters)]);
  for (const k of keys) {
    const x = [...(a.filters[k] ?? [])].sort();
    const y = [...(b.filters[k] ?? [])].sort();
    if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
  }
  return true;
}

/** Reads `?q=` and one comma-separated param per filter key. */
export function readFilterParams(params: URLSearchParams, keys: string[]): FilterValues {
  const filters: Record<string, string[]> = {};
  for (const k of keys) {
    const raw = params.get(k);
    filters[k] = raw ? raw.split(",").filter(Boolean) : [];
  }
  return { q: params.get("q") ?? "", filters };
}

/** Writes the values back, dropping empty params. Other params are kept. */
export function writeFilterParams(params: URLSearchParams, value: FilterValues, keys: string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value.q.trim()) next.set("q", value.q);
  else next.delete("q");
  for (const k of keys) {
    const v = value.filters[k] ?? [];
    if (v.length) next.set(k, v.join(","));
    else next.delete(k);
  }
  return next;
}

const viewsKey = (storageKey: string) => `fb:${storageKey}`;

/** Saved views live in this browser only (spec: "saved views (local)"). */
export function loadViews(storageKey: string): SavedView[] {
  try {
    const raw = localStorage.getItem(viewsKey(storageKey));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        typeof v?.name === "string" && typeof v?.value?.q === "string" && typeof v?.value?.filters === "object",
    );
  } catch {
    return [];
  }
}

export function storeViews(storageKey: string, views: SavedView[]): void {
  try {
    localStorage.setItem(viewsKey(storageKey), JSON.stringify(views));
  } catch {
    // Storage full or blocked: saved views are a convenience, keep going.
  }
}

/** Saving under an existing name replaces that view. */
export function upsertView(views: SavedView[], view: SavedView): SavedView[] {
  const name = view.name.trim();
  return [...views.filter((v) => v.name !== name), { ...view, name }];
}
