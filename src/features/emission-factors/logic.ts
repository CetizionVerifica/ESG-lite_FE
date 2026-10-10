// P22 Emission factors: pure logic (list query, form draft, imports). No React here.

export type Company = { company_id: number; name: string };
export type Category = { category_id: number; category_name: string; scope?: string | null };
export type Site = {
  site_id: number;
  name: string;
  company?: Company | null;
  categories?: Category[] | null;
};

/** One row of GET /admin/emission-factors (site and category joined). */
export type Factor = {
  emission_factor_id: number;
  year: number;
  /** Postgres decimal, so it arrives as a string. */
  factor_value: string | number;
  denominator_unit?: string | null;
  source?: string | null;
  emission_category_name?: string | null;
  upload_batch_id?: string | null;
  created_at?: string | null;
  site?: { site_id: number; name: string } | null;
  category?: { category_id: number; category_name: string; scope?: string | null } | null;
};

export type FactorPage = { data: Factor[]; total: number; page: number; limit: number; totalPages: number };

/** GET /admin/emission-factors/batches: factors grouped by the import that created them. */
export type Batch = {
  upload_batch_id: string;
  count: number;
  uploaded_at: string;
  site_id: number;
  site_name: string;
  category_id: number;
  category_name: string;
};

/** GET /v1/emission-factors/uploads (AI service): one uploaded sheet. */
export type UploadRecord = {
  id: number;
  file_name: string;
  cloudinary_url?: string | null;
  uploaded_by?: number | null;
  site_id?: number | null;
  layout_type?: string | null;
  total_records?: number | null;
  records_created?: number | null;
  records_skipped?: number | null;
  status?: string | null;
  created_at?: string | null;
};

export const PAGE_SIZE = 50;

export type ListFilters = { clientId: number | null; siteId: number | null; categoryId: number | null; year: number | null; q: string };

/** Query params for GET /admin/emission-factors. `page` is 0-based here, 1-based on the server. */
export type ListParams = {
  page: number;
  limit: number;
  site_id?: number;
  company_id?: number;
  category_id?: number;
  year?: number;
  search?: string;
};

export function listParams(f: ListFilters, page: number): ListParams {
  const out: ListParams = { page: page + 1, limit: PAGE_SIZE };
  if (f.siteId) out.site_id = f.siteId;
  // A site already pins the client; sending both would only add a join.
  else if (f.clientId) out.company_id = f.clientId;
  if (f.categoryId) out.category_id = f.categoryId;
  if (f.year) out.year = f.year;
  const q = f.q.trim();
  if (q) out.search = q;
  return out;
}

/** First positive integer in a filter value list, or null. */
export function firstId(values: string[] | undefined): number | null {
  for (const v of values ?? []) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/** Years offered by the Year filter and the form: next year back to 2015, newest first. */
export function yearOptions(now = new Date()): number[] {
  const last = now.getFullYear() + 1;
  return Array.from({ length: last - 2015 + 1 }, (_, i) => last - i);
}

export function sitesOfClient(sites: Site[], clientId: number | null): Site[] {
  return clientId ? sites.filter((s) => s.company?.company_id === clientId) : sites;
}

/**
 * Categories for the Category filter and the form: the chosen site's own
 * categories (the ones its forms use), or every category when no site is chosen.
 */
export function categoriesFor(siteId: number | null, sites: Site[], all: Category[]): Category[] {
  const site = siteId ? sites.find((s) => s.site_id === siteId) : undefined;
  const list = site ? (site.categories ?? []) : all;
  return [...list].sort((a, b) => a.category_name.localeCompare(b.category_name));
}

/** Factor as a number (the API sends decimals as strings). */
export function factorNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Up to 4 decimals (the column's scale), trailing zeros dropped. */
export function formatFactor(v: string | number | null | undefined): string {
  const n = factorNumber(v);
  if (n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4, useGrouping: false });
}

/** One-line description of a factor for confirm dialogs and toasts. */
export function factorSummary(r: Factor): string {
  const name = r.emission_category_name ? ` (${r.emission_category_name})` : "";
  const unit = r.denominator_unit ? ` per ${r.denominator_unit}` : "";
  return `${r.site?.name ?? "Site"} · ${r.category?.category_name ?? "Category"}${name} · ${r.year}: ${formatFactor(r.factor_value)}${unit}`;
}

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

export type FactorDraft = {
  siteId: number | null;
  categoryId: number | null;
  name: string;
  year: number | null;
  value: number | null;
  unit: string;
  source: string;
};
export type DraftField = "siteId" | "categoryId" | "year" | "value";
export type DraftErrors = Partial<Record<DraftField, string>>;

export function emptyDraft(defaults: { siteId?: number | null; categoryId?: number | null; year?: number | null } = {}): FactorDraft {
  return { siteId: defaults.siteId ?? null, categoryId: defaults.categoryId ?? null, name: "", year: defaults.year ?? null, value: null, unit: "", source: "" };
}

export function draftFrom(f: Factor): FactorDraft {
  return {
    siteId: f.site?.site_id ?? null,
    categoryId: f.category?.category_id ?? null,
    name: f.emission_category_name ?? "",
    year: f.year,
    value: factorNumber(f.factor_value),
    unit: f.denominator_unit ?? "",
    source: f.source ?? "",
  };
}

export function validate(d: FactorDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.siteId) e.siteId = "Choose a site.";
  if (!d.categoryId) e.categoryId = "Choose a category.";
  if (!d.year) e.year = "Choose a year.";
  else if (d.year < 1990 || d.year > 2100) e.year = "Enter a year between 1990 and 2100.";
  if (d.value === null) e.value = "Enter the factor.";
  else if (d.value < 0) e.value = "The factor can't be negative.";
  // decimal(10,4): at most 6 digits before the point.
  else if (Math.abs(d.value) >= 1_000_000) e.value = "Enter a factor below 1,000,000.";
  return e;
}

export function isDirty(d: FactorDraft, row: Factor | null): boolean {
  const base = row ? draftFrom(row) : emptyDraft();
  return (Object.keys(d) as (keyof FactorDraft)[]).some((k) => {
    const a = d[k];
    const b = base[k];
    return typeof a === "string" && typeof b === "string" ? a.trim() !== b.trim() : a !== b;
  });
}

export type FactorPayload = {
  site_id: number;
  category_id: number;
  year: number;
  factor_value: number;
  denominator_unit?: string;
  source?: string;
  emission_category_name?: string;
};

/** Body for POST/PUT. Blank text fields are left out (the server stores null). */
export function toPayload(d: FactorDraft): FactorPayload {
  const out: FactorPayload = { site_id: d.siteId!, category_id: d.categoryId!, year: d.year!, factor_value: d.value! };
  if (d.unit.trim()) out.denominator_unit = d.unit.trim();
  if (d.source.trim()) out.source = d.source.trim();
  if (d.name.trim()) out.emission_category_name = d.name.trim();
  return out;
}

/** Factors for one year are used by entries dated the year after (the P03 rule). */
export function yearHint(year: number | null): string {
  return year ? `Entries for ${year + 1} use ${year} factors.` : "Entries for a year use the previous year's factors.";
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

/** Short label for a factor's import batch: "Import · 3 Oct 2026", "Added by hand". */
export function batchLabel(batchId: string | null | undefined, batches: Batch[] | undefined): string {
  if (!batchId) return "Added by hand";
  const b = batches?.find((x) => x.upload_batch_id === batchId);
  return b ? `Import · ${formatDay(b.uploaded_at)}` : "Import";
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const LAYOUT_LABEL: Record<string, string> = {
  simple: "Simple",
  sub_columns: "Sub-columns",
  disposal_pivot: "Disposal pivot",
};

export function layoutLabel(layout: string | null | undefined): string {
  if (!layout) return "—";
  return LAYOUT_LABEL[layout] ?? layout.replace(/_/g, " ");
}

/** The AI service writes "parsed" on upload and "completed" once factors are saved. */
export function uploadStatus(u: UploadRecord): { label: string; tone: "good" | "warn" | "neutral" } {
  const s = (u.status ?? "").toLowerCase();
  if (s === "completed") return { label: "Saved", tone: "good" };
  if (s === "parsed") return { label: "Not saved", tone: "warn" };
  return { label: s ? s[0].toUpperCase() + s.slice(1) : "—", tone: "neutral" };
}

/** Uploads for the chosen client/site; a record with no site only shows unfiltered. */
export function filterUploads(uploads: UploadRecord[], siteIds: number[] | null): UploadRecord[] {
  if (!siteIds) return uploads;
  const set = new Set(siteIds);
  return uploads.filter((u) => u.site_id != null && set.has(u.site_id));
}
