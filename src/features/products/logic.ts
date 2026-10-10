// P25 Products: pure logic (rows, filters, form draft, site moves, delete cascades). No React here.

export type Company = { company_id: number; name: string };
export type SiteRef = { site_id: number; name: string; company?: Company | null };
export type Product = {
  product_id: number;
  name: string;
  description?: string | null;
  unit: string;
  site?: SiteRef | null;
  /** From ESG-lite #76; missing on an older backend. */
  production_count?: number | null;
  /** Latest production period end, YYYY-MM-DD. */
  last_period_end?: string | null;
};
export type AdminUnit = { unit_id: number; unit_name: string; site?: { site_id: number } | null };
export type ProductionRecord = {
  production_id: number;
  quantity: number | string;
  unit: string;
  start_date: string;
  end_date: string;
  status: string;
  site?: { site_id: number; name: string } | null;
};
export type ProductionPage = { total: number; records: ProductionRecord[] };

export type ProductFilters = { q: string; clientIds: number[]; siteIds: number[] };

export function matchesFilters(p: Product, f: ProductFilters): boolean {
  if (f.clientIds.length && !f.clientIds.includes(p.site?.company?.company_id ?? -1)) return false;
  if (f.siteIds.length && !f.siteIds.includes(p.site?.site_id ?? -1)) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.description, p.unit, p.site?.name, p.site?.company?.name].some((v) => v?.toLowerCase().includes(q));
}

export const toIds = (values: string[] | undefined): number[] => (values ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);

/** Sites offered by the Site filter: those of the chosen client, or all. Sorted by name. */
export function siteOptions(sites: SiteRef[], clientIds: number[]): { value: string; label: string }[] {
  return sites
    .filter((s) => !clientIds.length || clientIds.includes(s.company?.company_id ?? -1))
    .map((s) => ({ value: String(s.site_id), label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Sites the drawer's picker offers: every site for a new product; for an
 * existing one only its own client's sites, since the backend refuses a move
 * to another client. A product whose client isn't known keeps every site.
 */
export function pickableSites(sites: SiteRef[], product: Product | null): SiteRef[] {
  const client = product?.site?.company?.company_id;
  if (!product || !client) return sites;
  return sites.filter((s) => s.company?.company_id === client || s.site_id === product.site?.site_id);
}

/** "Hidd · Midal Cables" so same-named sites of two clients can be told apart. */
export function siteLabel(s: SiteRef): string {
  return s.company?.name ? `${s.name} · ${s.company.name}` : s.name;
}

/** Unit suggestions: the chosen site's units and every unit products already use, deduplicated case-insensitively. */
export function unitSuggestions(products: Product[], units: AdminUnit[], siteId: number | null): string[] {
  const seen = new Map<string, string>();
  const add = (u: string | null | undefined) => {
    const t = u?.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  };
  for (const u of units) if (siteId && u.site?.site_id === siteId) add(u.unit_name);
  for (const p of products) add(p.unit);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// ── Form ────────────────────────────────────────────────────────────────────

export type ProductDraft = { name: string; site_id: number | null; unit: string; description: string };
export type DraftField = "name" | "site_id" | "unit";

export function emptyDraft(siteId: number | null = null): ProductDraft {
  return { name: "", site_id: siteId, unit: "", description: "" };
}

export function draftFrom(p: Product): ProductDraft {
  return { name: p.name ?? "", site_id: p.site?.site_id ?? null, unit: p.unit ?? "", description: p.description ?? "" };
}

/** Field errors; empty when the draft can be saved. */
export function validate(d: ProductDraft): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (!d.name.trim()) e.name = "Enter a product name.";
  if (!d.site_id) e.site_id = "Choose the site that makes this product.";
  if (!d.unit.trim()) e.unit = "Enter the unit production is recorded in, for example tonnes.";
  return e;
}

const norm = (d: ProductDraft) => ({ name: d.name.trim(), site_id: d.site_id, unit: d.unit.trim(), description: d.description.trim() });

export function isDirty(d: ProductDraft, p: Product | null): boolean {
  return JSON.stringify(norm(d)) !== JSON.stringify(norm(p ? draftFrom(p) : emptyDraft(d.site_id)));
}

/** The full payload for a new product; only the changed fields for an edit. */
export function toPayload(d: ProductDraft, p: Product | null): Partial<{ name: string; site_id: number; unit: string; description: string }> {
  const next = norm(d);
  if (!p) return { name: next.name, site_id: next.site_id as number, unit: next.unit, description: next.description };
  const prev = norm(draftFrom(p));
  const out: Partial<{ name: string; site_id: number; unit: string; description: string }> = {};
  if (next.name !== prev.name) out.name = next.name;
  if (next.site_id !== prev.site_id) out.site_id = next.site_id as number;
  if (next.unit !== prev.unit) out.unit = next.unit;
  if (next.description !== prev.description) out.description = next.description;
  return out;
}

/** True when saving would move an existing product to another site. */
export function movesSite(d: ProductDraft, p: Product | null): boolean {
  return !!p && !!d.site_id && d.site_id !== (p.site?.site_id ?? null);
}

/** True when the default unit changes on a product that already has records (they keep their own units). */
export function changesUnitWithRecords(d: ProductDraft, p: Product | null): boolean {
  // An unknown count (backend without the counts) may hide records, so it counts as some.
  return !!p && (p.production_count == null || p.production_count > 0) && d.unit.trim().toLowerCase() !== (p.unit ?? "").trim().toLowerCase();
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function recordCount(n: number): string {
  return plural(n, "production record", "production records");
}

/** What deleting the product takes with it (production_data and pcf_study cascade). */
export function cascadeItems(p: Product, lastPeriod: string | null): string[] {
  const n = p.production_count;
  const site = p.site?.name ?? "its site";
  return [
    n == null
      ? "All of its production records"
      : n === 0
        ? "No production records (none recorded yet)"
        : `${recordCount(n)}${lastPeriod ? `, the latest for ${lastPeriod}` : ""}`,
    "Its product footprints (PCF studies) and their versions",
    ...(n ? [`Emission intensity for ${site} is recalculated without this product's output`] : []),
  ];
}

/** Production record quantity as a number (decimals arrive as strings). */
export function quantity(r: ProductionRecord): number | null {
  const v = typeof r.quantity === "string" ? Number(r.quantity) : r.quantity;
  return Number.isFinite(v) ? v : null;
}

/** A record's status word, or null when it isn't one we know. */
export function recordStatus(s: string): "pending" | "approved" | "rejected" | null {
  const t = s?.toLowerCase();
  return t === "pending" || t === "approved" || t === "rejected" ? t : null;
}

/** "YYYY-MM-DD" from a date column, whether it arrives bare or as an ISO timestamp. */
export const day = (v: string | null | undefined): string => (v ?? "").slice(0, 10);

/** The month ("2026-02") when a record covers exactly one calendar month, else null. */
export function wholeMonth(start: string, end: string): string | null {
  const s = day(start);
  const e = day(end);
  const m = /^(\d{4})-(\d{2})-01$/.exec(s);
  if (!m || e.slice(0, 7) !== s.slice(0, 7)) return null;
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return Number(e.slice(8, 10)) === last ? s.slice(0, 7) : null;
}
