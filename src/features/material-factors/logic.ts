import type { MaterialFactorBody } from "../../services/materialFactorService";
import { formatNumber } from "../../ui";

export type Licence = "open" | "ecoinvent" | "supplier";
export type GwpSet = "AR6" | "AR5";
export type Role = "Manager" | "Superadmin";

export type MaterialFactor = {
  material_factor_id: number;
  company_id: number | null;
  name: string;
  material_group: string;
  geography: string | null;
  unit: string;
  /** null when the value is licensed and hidden from this viewer. */
  value_kgco2e: number | null;
  value_hidden: boolean;
  gwp_set: GwpSet;
  source: string | null;
  source_year: number | null;
  dataset_ref: string | null;
  licence: Licence;
  recycled_variant: boolean;
  valid_from: string | null;
  valid_to: string | null;
  /** Footprints using it (C04 backend); missing on an older backend. */
  used_by?: number;
  used_by_approved?: number;
};

export type FactorUse = {
  pcf_study_id: number;
  product: { product_id: number; name: string };
  version: number;
  status: "draft" | "in_review" | "approved" | "published" | "superseded";
  site_id: number;
};

export type FactorDetail = MaterialFactor & { used_in?: FactorUse[] };
export type Company = { company_id: number; name: string };

export const GROUPS = ["aluminium", "copper", "polymer", "steel", "packaging", "chemical", "energy", "transport", "waste"] as const;
export const UNITS = ["kg", "t", "m2", "kWh", "tonne.km", "unit"] as const;
export const LICENCES: Licence[] = ["open", "supplier", "ecoinvent"];
export const LICENCE_LABEL: Record<Licence, string> = { open: "Open", supplier: "Supplier", ecoinvent: "ecoinvent (licensed)" };
export const STATUS_LABEL: Record<FactorUse["status"], string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  superseded: "Superseded",
};

/** Up to 6 decimals without trailing zeros: 8.6, 0.2408, 0.002408. */
export function formatFactor(v: number | null): string {
  if (v === null) return "—";
  return formatNumber(v, 6).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export const groupLabel = (g: string) => (g ? g.charAt(0).toUpperCase() + g.slice(1) : g);

/** "BH" or "Global" when no geography is set. */
export const geographyLabel = (g: string | null) => (g && g.trim() ? g.trim() : "Global");

export const sourceLabel = (f: Pick<MaterialFactor, "source" | "source_year">) =>
  [f.source?.trim(), f.source_year ?? null].filter((v) => v !== null && v !== undefined && v !== "").join(" ");

export const ownerLabel = (f: Pick<MaterialFactor, "company_id">, companies: Company[]) =>
  f.company_id === null ? "Global library" : (companies.find((c) => c.company_id === f.company_id)?.name ?? `Company ${f.company_id}`);

/** Superadmins change any row; managers only their company's rows that aren't licensed. */
export function canEdit(f: Pick<MaterialFactor, "company_id" | "licence">, role: Role): boolean {
  if (role === "Superadmin") return true;
  return f.company_id !== null && f.licence !== "ecoinvent";
}

// ------------------------------------------------------------- filtering ---

export type FilterInput = { q: string; groups: string[]; geographies: string[]; sources: string[]; licences: string[]; years: string[]; owners: string[] };

export const ownerKey = (f: Pick<MaterialFactor, "company_id">) => (f.company_id === null ? "global" : String(f.company_id));

export function matchesFilters(f: MaterialFactor, x: FilterInput): boolean {
  const q = x.q.trim().toLowerCase();
  if (q && ![f.name, f.material_group, f.geography, f.source, f.dataset_ref].some((v) => v?.toLowerCase().includes(q))) return false;
  if (x.groups.length && !x.groups.includes(f.material_group)) return false;
  if (x.geographies.length && !x.geographies.includes(geographyLabel(f.geography))) return false;
  if (x.sources.length && !x.sources.includes(f.source?.trim() || "—")) return false;
  if (x.licences.length && !x.licences.includes(f.licence)) return false;
  if (x.years.length && !x.years.includes(f.source_year === null ? "—" : String(f.source_year))) return false;
  if (x.owners.length && !x.owners.includes(ownerKey(f))) return false;
  return true;
}

/** Distinct values of one field, sorted, for a filter's options. */
export function distinct(rows: MaterialFactor[], pick: (f: MaterialFactor) => string): string[] {
  return Array.from(new Set(rows.map(pick))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// ------------------------------------------------------------------ form ---

export type Draft = {
  company_id: number | null;
  name: string;
  material_group: string;
  geography: string;
  unit: string;
  value: number | null;
  gwp_set: GwpSet;
  source: string;
  source_year: number | null;
  dataset_ref: string;
  licence: Licence;
  recycled_variant: boolean;
  valid_from: string;
  valid_to: string;
};
export type DraftField = keyof Draft;

export function emptyDraft(companyId: number | null): Draft {
  return {
    company_id: companyId,
    name: "",
    material_group: "",
    geography: "",
    unit: "kg",
    value: null,
    gwp_set: "AR6",
    source: "",
    source_year: null,
    dataset_ref: "",
    licence: "open",
    recycled_variant: false,
    valid_from: "",
    valid_to: "",
  };
}

export function draftFrom(f: MaterialFactor): Draft {
  return {
    company_id: f.company_id,
    name: f.name,
    material_group: f.material_group,
    geography: f.geography ?? "",
    unit: f.unit,
    value: f.value_kgco2e,
    gwp_set: f.gwp_set,
    source: f.source ?? "",
    source_year: f.source_year,
    dataset_ref: f.dataset_ref ?? "",
    licence: f.licence,
    recycled_variant: f.recycled_variant,
    valid_from: f.valid_from ?? "",
    valid_to: f.valid_to ?? "",
  };
}

export function validate(d: Draft, opts: { valueHidden?: boolean } = {}): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (!d.name.trim()) e.name = "Enter a name.";
  if (!d.material_group.trim()) e.material_group = "Pick a group.";
  if (!d.unit.trim()) e.unit = "Pick a unit.";
  if (!opts.valueHidden && (d.value === null || !Number.isFinite(d.value) || d.value < 0)) e.value = "Enter a value of 0 or more.";
  if (d.source_year !== null && (!Number.isInteger(d.source_year) || d.source_year < 1900 || d.source_year > 2100)) e.source_year = "Enter a year.";
  if (d.valid_from && d.valid_to && d.valid_to < d.valid_from) e.valid_to = "Ends before it starts.";
  return e;
}

const text = (v: string) => (v.trim() ? v.trim() : null);

/** Request body for a new factor. */
export function createPayload(d: Draft, role: Role): MaterialFactorBody {
  return {
    ...(role === "Superadmin" ? { company_id: d.company_id } : {}),
    name: d.name.trim(),
    material_group: d.material_group.trim(),
    geography: text(d.geography),
    unit: d.unit.trim(),
    value_kgco2e: d.value ?? 0,
    gwp_set: d.gwp_set,
    source: text(d.source),
    source_year: d.source_year,
    dataset_ref: text(d.dataset_ref),
    licence: d.licence,
    recycled_variant: d.recycled_variant,
    valid_from: text(d.valid_from),
    valid_to: text(d.valid_to),
  };
}

/** Only the fields that changed, so a hidden licensed value is never sent back. */
export function updatePayload(d: Draft, f: MaterialFactor): MaterialFactorBody {
  const next = createPayload(d, "Manager");
  const before = createPayload(draftFrom(f), "Manager");
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(next) as (keyof MaterialFactorBody)[]) {
    if (k === "value_kgco2e" && f.value_hidden && d.value === null) continue;
    if (next[k] !== before[k]) out[k] = next[k];
  }
  return out as MaterialFactorBody;
}

export const isDirty = (d: Draft, f: MaterialFactor | null) => (f ? Object.keys(updatePayload(d, f)).length > 0 : true);

// ----------------------------------------------------------------- import ---

export type SheetField = Exclude<keyof MaterialFactorBody, "company_id">;
export const SHEET_FIELDS: { field: SheetField; label: string; required?: boolean }[] = [
  { field: "name", label: "Name", required: true },
  { field: "material_group", label: "Group", required: true },
  { field: "unit", label: "Unit", required: true },
  { field: "value_kgco2e", label: "Value (kgCO₂e per unit)", required: true },
  { field: "geography", label: "Geography" },
  { field: "gwp_set", label: "GWP set" },
  { field: "source", label: "Source" },
  { field: "source_year", label: "Source year" },
  { field: "dataset_ref", label: "Dataset ref" },
  { field: "licence", label: "Licence" },
  { field: "recycled_variant", label: "Recycled variant" },
  { field: "valid_from", label: "Valid from" },
  { field: "valid_to", label: "Valid to" },
];

const SYNONYMS: Record<SheetField, string[]> = {
  name: ["name", "material", "materialname", "factorname", "description"],
  material_group: ["materialgroup", "group", "category", "materialcategory"],
  unit: ["unit", "units", "declaredunit", "perunit"],
  value_kgco2e: ["valuekgco2e", "value", "kgco2e", "factor", "factorvalue", "kgco2eperunit", "gwp", "emissionfactor"],
  geography: ["geography", "region", "country", "location", "geo"],
  gwp_set: ["gwpset", "ar", "gwpversion"],
  source: ["source", "publisher", "database"],
  source_year: ["sourceyear", "year", "referenceyear"],
  dataset_ref: ["datasetref", "dataset", "reference", "ref", "uuid"],
  licence: ["licence", "license"],
  recycled_variant: ["recycledvariant", "recycled"],
  valid_from: ["validfrom", "from", "startdate"],
  valid_to: ["validto", "to", "enddate"],
};

const norm = (h: string) => h.toLowerCase().replace(/co₂/g, "co2").replace(/[^a-z0-9]/g, "");

export type Mapping = Partial<Record<SheetField, string>>;

/** Sheet header → field, by exact name or a known synonym; each header used once. */
export function detectMapping(headers: string[]): Mapping {
  const out: Mapping = {};
  const used = new Set<string>();
  for (const { field } of SHEET_FIELDS) {
    const hit = headers.find((h) => !used.has(h) && SYNONYMS[field].includes(norm(h)));
    if (hit) {
      out[field] = hit;
      used.add(hit);
    }
  }
  return out;
}

export const missingRequired = (m: Mapping) => SHEET_FIELDS.filter((f) => f.required && !m[f.field]).map((f) => f.label);

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** "1/1/2024", a Date or an Excel serial → YYYY-MM-DD; unknown text is passed on for the server to reject. */
function cellDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const t = cellText(v);
  return t || null;
}

function cellBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return ["yes", "y", "true", "1", "recycled"].includes(cellText(v).toLowerCase());
}

const LICENCE_ALIASES: Record<string, Licence> = { open: "open", supplier: "supplier", ecoinvent: "ecoinvent", licensed: "ecoinvent" };

/** One sheet row → request row, plus problems the server would refuse anyway. */
export function toRow(raw: Record<string, unknown>, m: Mapping): { row: MaterialFactorBody; problems: string[] } {
  const get = (f: SheetField) => (m[f] ? raw[m[f]!] : undefined);
  const problems: string[] = [];
  const row: MaterialFactorBody = {};
  for (const f of ["name", "material_group", "unit"] as const) {
    const t = cellText(get(f));
    if (!t) problems.push(`${SHEET_FIELDS.find((s) => s.field === f)!.label} is empty`);
    row[f] = f === "material_group" ? t.toLowerCase() : t;
  }
  const rawValue = get("value_kgco2e");
  const value = typeof rawValue === "number" ? rawValue : Number(cellText(rawValue).replace(/,/g, ""));
  if (cellText(rawValue) === "" || !Number.isFinite(value) || value < 0) problems.push("Value must be a number of 0 or more");
  row.value_kgco2e = value;
  for (const f of ["geography", "source", "dataset_ref"] as const) {
    const t = cellText(get(f));
    if (m[f]) row[f] = t || null;
  }
  if (m.source_year) {
    const t = cellText(get("source_year"));
    const y = Number(t);
    if (t && !Number.isInteger(y)) problems.push("Source year must be a year");
    row.source_year = t ? y : null;
  }
  if (m.gwp_set) {
    const t = cellText(get("gwp_set")).toUpperCase();
    if (t && t !== "AR6" && t !== "AR5") problems.push("GWP set must be AR6 or AR5");
    if (t) row.gwp_set = t as GwpSet;
  }
  if (m.licence) {
    const t = cellText(get("licence")).toLowerCase();
    const l = LICENCE_ALIASES[t];
    if (t && !l) problems.push("Licence must be open, supplier or ecoinvent");
    if (l) row.licence = l;
  }
  if (m.recycled_variant) row.recycled_variant = cellBool(get("recycled_variant"));
  if (m.valid_from) row.valid_from = cellDate(get("valid_from"));
  if (m.valid_to) row.valid_to = cellDate(get("valid_to"));
  return { row, problems };
}

/** Rows that are entirely blank (trailing lines in a sheet) are dropped. */
export const isBlankRow = (raw: Record<string, unknown>) => Object.values(raw).every((v) => cellText(v) === "");

export const TEMPLATE_HEADERS = SHEET_FIELDS.map((f) => f.field);
