// P22 Emission factors: pure logic (list query, form draft, imports). No React here.
import { DEFAULT_GWP_SET, FACTOR_TYPES, GWP100, type FactorType, type GwpSet, isFactorType } from "../../lib/scope3/factor";

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
  // S3-2 metadata (decimals arrive as strings).
  factor_type?: string | null;
  gwp_set?: string | null;
  geography?: string | null;
  dataset?: string | null;
  dataset_version?: string | null;
  co2_kg?: string | number | null;
  ch4_kg?: string | number | null;
  n2o_kg?: string | number | null;
  other_kgco2e?: string | number | null;
  biogenic_co2_kg?: string | number | null;
  includes_wtt?: boolean | null;
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

/** `factorType` is a FactorType, or "none" for factors with no type yet. */
export type ListFilters = { clientId: number | null; siteId: number | null; categoryId: number | null; year: number | null; q: string; factorType?: string | null };

/** Query params for GET /admin/emission-factors. `page` is 0-based here, 1-based on the server. */
export type ListParams = {
  page: number;
  limit: number;
  site_id?: number;
  company_id?: number;
  category_id?: number;
  year?: number;
  search?: string;
  factor_type?: string;
};

export function listParams(f: ListFilters, page: number): ListParams {
  const out: ListParams = { page: page + 1, limit: PAGE_SIZE };
  if (f.siteId) out.site_id = f.siteId;
  // A site already pins the client; sending both would only add a join.
  else if (f.clientId) out.company_id = f.clientId;
  if (f.categoryId) out.category_id = f.categoryId;
  if (f.year) out.year = f.year;
  if (f.factorType && (f.factorType === "none" || isFactorType(f.factorType))) out.factor_type = f.factorType;
  const q = f.q.trim();
  if (q) out.search = q;
  return out;
}

/** Page size the export asks for (the server's cap). */
export const EXPORT_PAGE_SIZE = 200;

/**
 * Every factor matching the list filters, for the export: pages through the
 * server at its largest page size. `fetchPage` gets the same params as the
 * list, with only `page` and `limit` changed.
 */
export async function fetchAllFactors(p: ListParams, fetchPage: (p: ListParams) => Promise<FactorPage>): Promise<Factor[]> {
  const out: Factor[] = [];
  for (let page = 1; ; page++) {
    const res = await fetchPage({ ...p, page, limit: EXPORT_PAGE_SIZE });
    const data = res.data ?? [];
    out.push(...data);
    if (data.length === 0 || out.length >= res.total || page >= res.totalPages) return out;
  }
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

/** Up to 8 decimals (the column's scale since S3-2), trailing zeros dropped. */
export function formatFactor(v: string | number | null | undefined): string {
  const n = factorNumber(v);
  if (n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 8, useGrouping: false });
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

/** Gas parts in kg of gas per unit (Other in kgCO₂e); biogenic CO₂ is reported apart from the total. */
export type GasParts = { co2: number | null; ch4: number | null; n2o: number | null; other: number | null; biogenic: number | null };
export const GAS_KEYS: { key: keyof GasParts; field: "co2_kg" | "ch4_kg" | "n2o_kg" | "other_kgco2e" | "biogenic_co2_kg" }[] = [
  { key: "co2", field: "co2_kg" },
  { key: "ch4", field: "ch4_kg" },
  { key: "n2o", field: "n2o_kg" },
  { key: "other", field: "other_kgco2e" },
  { key: "biogenic", field: "biogenic_co2_kg" },
];
const NO_GASES: GasParts = { co2: null, ch4: null, n2o: null, other: null, biogenic: null };

export type FactorDraft = {
  siteId: number | null;
  categoryId: number | null;
  name: string;
  year: number | null;
  value: number | null;
  unit: string;
  source: string;
  factorType: FactorType | null;
  gwpSet: GwpSet | null;
  /** ISO-3166 alpha-2, GLO or a region code. */
  geography: string | null;
  dataset: string;
  datasetVersion: string;
  gases: GasParts;
};
export type DraftField = "siteId" | "categoryId" | "year" | "value" | "unit" | keyof GasParts;
export type DraftErrors = Partial<Record<DraftField, string>>;

export function emptyDraft(defaults: { siteId?: number | null; categoryId?: number | null; year?: number | null } = {}): FactorDraft {
  return {
    siteId: defaults.siteId ?? null,
    categoryId: defaults.categoryId ?? null,
    name: "",
    year: defaults.year ?? null,
    value: null,
    unit: "",
    source: "",
    factorType: null,
    // D7: new factors are AR6 unless the source says otherwise.
    gwpSet: DEFAULT_GWP_SET,
    geography: null,
    dataset: "",
    datasetVersion: "",
    gases: { ...NO_GASES },
  };
}

const asGwpSet = (v: string | null | undefined): GwpSet | null => (v === "AR4" || v === "AR5" || v === "AR6" ? v : null);

export function draftFrom(f: Factor): FactorDraft {
  return {
    siteId: f.site?.site_id ?? null,
    categoryId: f.category?.category_id ?? null,
    name: f.emission_category_name ?? "",
    year: f.year,
    value: factorNumber(f.factor_value),
    unit: f.denominator_unit ?? "",
    source: f.source ?? "",
    factorType: isFactorType(f.factor_type) ? f.factor_type : null,
    gwpSet: asGwpSet(f.gwp_set),
    geography: f.geography ?? null,
    dataset: f.dataset ?? "",
    datasetVersion: f.dataset_version ?? "",
    gases: {
      co2: factorNumber(f.co2_kg),
      ch4: factorNumber(f.ch4_kg),
      n2o: factorNumber(f.n2o_kg),
      other: factorNumber(f.other_kgco2e),
      biogenic: factorNumber(f.biogenic_co2_kg),
    },
  };
}

/** Decimal places a number is written with ("0.00012345" → 8). */
export function decimalsOf(n: number): number {
  const s = n.toString();
  const exp = /e-(\d+)$/.exec(s);
  if (exp) return Number(exp[1]) + (s.split("e")[0].split(".")[1]?.length ?? 0);
  return s.split(".")[1]?.length ?? 0;
}

/** numeric(18,8): up to 10 digits before the point and 8 after. */
const MAX_FACTOR = 10_000_000_000;

function amountError(v: number | null, what: string): string | undefined {
  if (v === null) return undefined;
  if (v < 0) return `${what} can't be negative.`;
  if (v >= MAX_FACTOR) return `Enter ${what.toLowerCase()} below 10,000,000,000.`;
  if (decimalsOf(v) > 8) return "Use at most 8 decimals.";
  return undefined;
}

export function validate(d: FactorDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.siteId) e.siteId = "Choose a site.";
  if (!d.categoryId) e.categoryId = "Choose a category.";
  if (!d.year) e.year = "Choose a year.";
  else if (d.year < 1990 || d.year > 2100) e.year = "Enter a year between 1990 and 2100.";
  if (d.value === null) e.value = "Enter the factor.";
  else {
    const err = amountError(d.value, "The factor");
    if (err) e.value = err;
  }
  // The server refuses a factor with no unit (UNIT_REQUIRED).
  if (!d.unit.trim()) e.unit = "Enter the unit, e.g. litre or kWh.";
  for (const { key } of GAS_KEYS) {
    const err = amountError(d.gases[key], "A gas part");
    if (err) e[key] = err;
  }
  return e;
}

/**
 * A hint (never a block) when the gas parts don't add up to the factor within
 * 1%: CO₂ + CH₄ × GWP + N₂O × GWP + other. Biogenic CO₂ sits outside the total.
 */
export function gasSumHint(d: FactorDraft): string | null {
  const { co2, ch4, n2o, other } = d.gases;
  if (d.value === null || [co2, ch4, n2o, other].every((v) => v === null)) return null;
  const gwp = GWP100[d.gwpSet ?? DEFAULT_GWP_SET];
  const sum = (co2 ?? 0) + (ch4 ?? 0) * gwp.CH4 + (n2o ?? 0) * gwp.N2O + (other ?? 0);
  const total = d.value;
  const off = total === 0 ? sum !== 0 : Math.abs(sum - total) / total > 0.01;
  if (!off) return null;
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return `The gas parts add up to ${fmt(sum)} kgCO₂e with ${d.gwpSet ?? DEFAULT_GWP_SET} GWPs, not the factor's ${fmt(total)}. Check them; you can still save.`;
}

/**
 * A hint (never a block) when a grid electricity factor looks 1,000× too small: grid power is about
 * 0.05–1.2 kgCO₂e per kWh (50–1,200 per MWh) almost everywhere, and the factor is in kg. A value
 * under 10 per MWh is usually a tonnes-per-MWh figure (CEA's 0.71 t/MWh is 710 kg/MWh) (F-04).
 * Renewable electricity can rightly be near zero, so it is left out.
 */
export function gridFactorHint(categoryName: string | null | undefined, value: number | null, unit: string): string | null {
  const name = (categoryName ?? "").toLowerCase();
  if (value === null || !(value > 0) || !name.includes("electric") || name.includes("renewable")) return null;
  const per = unit.trim().toLowerCase().replace(/\s+/g, "");
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  if (per === "mwh" && value < 10) {
    return `Grid electricity is usually 50–1,200 kgCO₂e per MWh. ${fmt(value)} looks like tonnes per MWh; in kg that is ${fmt(value * 1000)}. Check it; you can still save.`;
  }
  if (per === "kwh" && value < 0.01) {
    return `Grid electricity is usually 0.05–1.2 kgCO₂e per kWh. ${fmt(value)} looks 1,000 times too small; in kg per kWh that may be ${fmt(value * 1000)}. Check it; you can still save.`;
  }
  return null;
}

const sameValue = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string" ? a.trim() === b.trim() : typeof a === "object" && a && b ? JSON.stringify(a) === JSON.stringify(b) : a === b;

export function isDirty(d: FactorDraft, row: Factor | null): boolean {
  const base = row ? draftFrom(row) : emptyDraft();
  return (Object.keys(d) as (keyof FactorDraft)[]).some((k) => !sameValue(d[k], base[k]));
}

export type FactorMetaPayload = {
  factor_type?: FactorType | null;
  gwp_set?: GwpSet | null;
  geography?: string | null;
  dataset?: string | null;
  dataset_version?: string | null;
  co2_kg?: number | null;
  ch4_kg?: number | null;
  n2o_kg?: number | null;
  other_kgco2e?: number | null;
  biogenic_co2_kg?: number | null;
};

export type FactorPayload = {
  site_id: number;
  category_id: number;
  year: number;
  factor_value: number;
  denominator_unit?: string;
  source?: string;
  emission_category_name?: string;
} & FactorMetaPayload;

function metaPayload(d: FactorDraft): FactorMetaPayload {
  const out: FactorMetaPayload = {};
  if (d.factorType) out.factor_type = d.factorType;
  if (d.gwpSet) out.gwp_set = d.gwpSet;
  if (d.geography) out.geography = d.geography;
  if (d.dataset.trim()) out.dataset = d.dataset.trim();
  if (d.datasetVersion.trim()) out.dataset_version = d.datasetVersion.trim();
  for (const { key, field } of GAS_KEYS) if (d.gases[key] !== null) out[field] = d.gases[key];
  return out;
}

/** Body for POST. Blank text fields are left out (the server stores null). */
export function toPayload(d: FactorDraft): FactorPayload {
  const out: FactorPayload = { site_id: d.siteId!, category_id: d.categoryId!, year: d.year!, factor_value: d.value!, ...metaPayload(d) };
  if (d.unit.trim()) out.denominator_unit = d.unit.trim();
  if (d.source.trim()) out.source = d.source.trim();
  if (d.name.trim()) out.emission_category_name = d.name.trim();
  return out;
}

/**
 * Body for PUT: only the fields that changed, so an unchanged site/category/year/name doesn't trip the
 * server's duplicate check. A cleared text field is sent as "" (the server stores null), not left out.
 */
export function toUpdatePayload(d: FactorDraft, row: Factor): Partial<FactorPayload> {
  const base = draftFrom(row);
  const out: Partial<FactorPayload> = {};
  if (d.siteId !== base.siteId) out.site_id = d.siteId!;
  if (d.categoryId !== base.categoryId) out.category_id = d.categoryId!;
  if (d.year !== base.year) out.year = d.year!;
  if (d.value !== base.value) out.factor_value = d.value!;
  if (d.unit.trim() !== base.unit.trim()) out.denominator_unit = d.unit.trim();
  if (d.source.trim() !== base.source.trim()) out.source = d.source.trim();
  if (d.name.trim() !== base.name.trim()) out.emission_category_name = d.name.trim();
  // Metadata: a cleared field is sent as null so the server clears it.
  if (d.factorType !== base.factorType) out.factor_type = d.factorType;
  if (d.gwpSet !== base.gwpSet) out.gwp_set = d.gwpSet;
  if (d.geography !== base.geography) out.geography = d.geography;
  if (d.dataset.trim() !== base.dataset.trim()) out.dataset = d.dataset.trim() || null;
  if (d.datasetVersion.trim() !== base.datasetVersion.trim()) out.dataset_version = d.datasetVersion.trim() || null;
  for (const { key, field } of GAS_KEYS) if (d.gases[key] !== base.gases[key]) out[field] = d.gases[key];
  return out;
}

/** Type filter options: every factor type, plus "Not set" for factors saved before S3-2. */
export const TYPE_FILTER_VALUES: string[] = [...FACTOR_TYPES, "none"];

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

/**
 * Everything DELETE /batch/:id removes: one import can span several sites and categories (the list
 * shows one row per site and category), so the confirm adds them all up.
 */
export function batchScope(batchId: string, batches: Batch[] | undefined): { count: number; parts: string[] } {
  const rows = (batches ?? []).filter((b) => b.upload_batch_id === batchId);
  return { count: rows.reduce((n, b) => n + b.count, 0), parts: rows.map((b) => `${b.site_name} · ${b.category_name}`) };
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
  if (s === "completed_with_errors") return { label: "Saved with errors", tone: "warn" };
  if (s === "parsed") return { label: "Not saved", tone: "warn" };
  return { label: s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : "—", tone: "neutral" };
}

/** Uploads for the chosen client/site; a record with no site only shows unfiltered. */
export function filterUploads(uploads: UploadRecord[], siteIds: number[] | null): UploadRecord[] {
  if (!siteIds) return uploads;
  const set = new Set(siteIds);
  return uploads.filter((u) => u.site_id != null && set.has(u.site_id));
}
