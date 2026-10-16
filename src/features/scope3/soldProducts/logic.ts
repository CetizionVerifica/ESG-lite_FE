// S3-10 sold products: reading the sales sheet, the end-of-life mix and use
// profile drafts. The server builds the plans and the engine calculates every
// row; nothing here makes a total.
import type { EolShare, EolTreatment, SaleInput, SoldProduct, UseProfile, UseProfileBody, UseType } from "../../../services/scope3SoldProductsService";

/** Template columns, in order. */
export const SALES_HEADERS = ["Product", "Month", "Quantity", "Unit", "Region"] as const;

export const TEMPLATE_ROWS: Array<Array<string | number>> = [
  ["Cable drum 4 core", "2026-01", 1200, "drum", "India"],
  ["Cable drum 4 core", "2026-02", 950, "drum", "India"],
  ["Copper rod", "2026-01", 18, "t", "Germany"],
];

/** The server's limit per upload (PRODUCT_SALES_MAX_ROWS). */
export const MAX_SALES = 5000;

type Key = "product" | "month" | "quantity" | "unit" | "region";
const norm = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const ALIASES: Record<Key, string[]> = {
  product: ["product", "product_name", "item", "name"],
  month: ["month", "period", "date", "sale_month"],
  quantity: ["quantity", "qty", "quantity_sold", "units_sold", "sold"],
  unit: ["unit", "uom", "units"],
  region: ["region", "country", "market"],
};
const REQUIRED: Key[] = ["product", "month", "quantity", "unit"];

const toNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const text = String(v ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/** "2026-03", "2026-03-17" or an Excel date number → "2026-03"; null when it isn't a month. */
export function monthText(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date (days since 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 7);
  }
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}

export interface ParsedSales {
  sales: SaleInput[];
  /** Template columns the sheet lacks. */
  missing: string[];
  /** Row-level problems ("Row 4: Quantity must be more than 0."). */
  errors: string[];
}

/**
 * The sheet's first row is the header (any order, the template's names or
 * close variants); blank rows are skipped. Products are matched by name to the
 * products of the chosen site first, then any of the caller's sites.
 */
export function parseSales(table: unknown[][], products: SoldProduct[], siteId: number | null): ParsedSales {
  const [header = [], ...body] = table;
  const index: Partial<Record<Key, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [key, names] of Object.entries(ALIASES) as Array<[Key, string[]]>) if (index[key] === undefined && names.includes(n)) index[key] = i;
  });
  const keys = Object.keys(ALIASES) as Key[];
  const missing = REQUIRED.filter((k) => index[k] === undefined).map((k) => SALES_HEADERS[keys.indexOf(k)]);
  if (missing.length) return { sales: [], missing, errors: [] };

  const byName = new Map<string, SoldProduct>();
  // The chosen site's product wins when two sites use the same name.
  for (const p of [...products].sort((a, b) => Number(a.site_id === siteId) - Number(b.site_id === siteId))) byName.set(p.name.trim().toLowerCase(), p);

  const sales: SaleInput[] = [];
  const errors: string[] = [];
  const cell = (row: unknown[], key: Key) => (index[key] === undefined ? undefined : row[index[key] as number]);
  body.forEach((row, i) => {
    if (!row || row.every((c) => String(c ?? "").trim() === "")) return;
    const line = i + 2;
    const name = String(cell(row, "product") ?? "").trim();
    const product = byName.get(name.toLowerCase());
    const month = monthText(cell(row, "month"));
    const quantity = toNumber(cell(row, "quantity"));
    const unit = String(cell(row, "unit") ?? "").trim();
    const region = String(cell(row, "region") ?? "").trim();
    if (!name) errors.push(`Row ${line}: enter a product.`);
    else if (!product) errors.push(`Row ${line}: "${name}" isn't one of the products on your sites.`);
    else if (!month) errors.push(`Row ${line}: Month must look like 2026-03.`);
    else if (quantity === null || quantity <= 0) errors.push(`Row ${line}: Quantity must be more than 0.`);
    else if (!unit) errors.push(`Row ${line}: enter a unit.`);
    else sales.push({ product_id: product.product_id, period: month, quantity, unit, region: region || null });
  });
  if (sales.length > MAX_SALES) errors.push(`The sheet has ${sales.length.toLocaleString("en")} sales; the limit is ${MAX_SALES.toLocaleString("en")}.`);
  return { sales, missing, errors };
}

// ── End-of-life mix ─────────────────────────────────────────────────────────

export const TREATMENTS: EolTreatment[] = ["landfill", "incineration", "recycling", "composting"];
export const TREATMENT_LABEL: Record<EolTreatment, string> = { landfill: "Landfill", incineration: "Incineration", recycling: "Recycling", composting: "Composting" };

/** Percent per treatment as typed (null = blank). */
export type EolDraft = Record<EolTreatment, number | null>;

export const eolDraft = (mix: EolShare[] | null): EolDraft => {
  const d: EolDraft = { landfill: null, incineration: null, recycling: null, composting: null };
  for (const x of mix ?? []) if (x.treatment in d) d[x.treatment] = Number((x.share * 100).toFixed(4));
  return d;
};

/** Sum of the typed shares (%). */
export const eolTotal = (d: EolDraft) => Number(TREATMENTS.reduce((s, t) => s + (d[t] ?? 0), 0).toFixed(4));
/** Blank everywhere: no mix (the plan uses the average disposal factor). */
export const eolEmpty = (d: EolDraft) => TREATMENTS.every((t) => d[t] === null || d[t] === 0);
export const eolValid = (d: EolDraft) => eolEmpty(d) || Math.abs(eolTotal(d) - 100) < 1e-6;

/** The mix the server stores: shares as fractions; null when blank. */
export function eolBody(d: EolDraft): EolShare[] | null {
  if (eolEmpty(d)) return null;
  return TREATMENTS.filter((t) => (d[t] ?? 0) > 0).map((t) => ({ treatment: t, share: Number(((d[t] ?? 0) / 100).toFixed(6)) }));
}

// ── Use profile (Category 11) ───────────────────────────────────────────────

export const USE_TYPE_LABEL: Record<UseType, string> = {
  energy: "Uses energy",
  fuel: "Is a fuel",
  gas: "Contains a gas",
  intermediate: "Part of a customer's product",
};

/** Options the standard Category 11 form offers (ESG-lite soldProducts/configs.ts USE_OPTIONS). Keep in step. */
export const USE_OPTIONS: Record<Exclude<UseType, "intermediate">, string[]> = {
  energy: ["Germany", "Denmark", "Netherlands", "India"],
  fuel: ["Petrol", "Diesel"],
  gas: ["R134a", "R410A"],
};
export const USE_OPTION_LABEL: Record<Exclude<UseType, "intermediate">, string> = { energy: "Grid", fuel: "Fuel", gas: "Gas" };

export interface ProductDraft {
  lifetime_uses: number | null;
  eol: EolDraft;
  packaging_kg_per_unit: number | null;
  use_type: UseType | null;
  use_option: string | null;
  energy_per_use_kwh: number | null;
  gas_per_product_kg: number | null;
  gas_released_pct: number | null;
  final_product_share_pct: number | null;
}

export const productDraft = (p: SoldProduct): ProductDraft => ({
  lifetime_uses: p.lifetime_uses,
  eol: eolDraft(p.eol_mix),
  packaging_kg_per_unit: p.use_profile?.packaging_kg_per_unit ?? null,
  use_type: p.use_profile?.use_type ?? null,
  use_option: p.use_profile?.use_option ?? null,
  energy_per_use_kwh: p.use_profile?.energy_per_use_kwh ?? null,
  gas_per_product_kg: p.use_profile?.gas_per_product_kg ?? null,
  gas_released_pct: p.use_profile?.gas_released_pct ?? null,
  final_product_share_pct: p.use_profile?.final_product_share_pct ?? null,
});

export function draftErrors(d: ProductDraft): Partial<Record<"eol" | "use_option", string>> {
  const e: Partial<Record<"eol" | "use_option", string>> = {};
  if (!eolValid(d.eol)) e.eol = `Shares must add up to 100 % (now ${eolTotal(d.eol)} %).`;
  if (d.use_type && d.use_type !== "intermediate" && d.use_option && !USE_OPTIONS[d.use_type].includes(d.use_option)) e.use_option = "Pick one of the listed options.";
  return e;
}

/** The PUT body: only the fields the chosen use type needs are kept. */
export function toBody(d: ProductDraft): UseProfileBody {
  const t = d.use_type;
  const profile: UseProfile = {
    packaging_kg_per_unit: d.packaging_kg_per_unit,
    use_type: t,
    use_option: t && t !== "intermediate" ? d.use_option : null,
    energy_per_use_kwh: t === "energy" ? d.energy_per_use_kwh : null,
    gas_per_product_kg: t === "gas" ? d.gas_per_product_kg : null,
    gas_released_pct: t === "gas" ? d.gas_released_pct : null,
    final_product_share_pct: t === "intermediate" ? d.final_product_share_pct : null,
  };
  const empty = Object.values(profile).every((v) => v === null || v === undefined);
  return { lifetime_uses: d.lifetime_uses, eol_mix: eolBody(d.eol), use_profile: empty ? null : profile };
}

/** "2026-03-01" → "Mar 2026". */
export const monthLabel = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" });
};

/** Idempotency key for committing one plan version. */
export const commitKey = (planId: string, version: number) => `sold-products-${planId}-v${version}`;
