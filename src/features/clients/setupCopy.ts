// Copy client setup: pure logic shared by the onboarding "Start from" step and
// the client page's "Copy setup here" drawer. No React here. Backend contract:
// ESG-lite docs/setup-copy.md.

/** A setup file as the backend writes it (only what the UI reads; the rest is passed through). */
export type SetupBundle = {
  version: number;
  source: { company_id: number | null; company_name: string; taken_at: string };
  sites: { key: string; name: string; country_name: string | null; factors: { year: number }[]; forms: unknown[] }[];
  mappings: unknown[];
  threshold: { threshold_percentage: number } | null;
  material_factors?: unknown[];
};

export type SetupSource = { kind: "client"; companyId: number; name: string } | { kind: "file"; bundle: SetupBundle; fileName: string };

/** Where a source site goes: a new site (or the target's site of the same name), the target's main site, a given site, or nowhere. */
export type SiteTarget = "create" | "main" | "skip" | number;

export type CopyInclude = { units: boolean; forms: boolean; factors: boolean; mappings: boolean; threshold: boolean; products: boolean; material_factors: boolean };

export type CopyDraft = {
  source: SetupSource | null;
  include: CopyInclude;
  /** null = every year the source has; set once the preview shows the years. */
  factorYears: number[] | null;
  formConflict: "skip" | "rename";
  /** Per source site key; missing = "create". */
  sites: Record<string, SiteTarget>;
};

/** Shyam, 2026-10-13: products on by default; the client's own material factors stay off. */
export const EMPTY_COPY: CopyDraft = {
  source: null,
  include: { units: true, forms: true, factors: true, mappings: true, threshold: true, products: true, material_factors: false },
  factorYears: null,
  formConflict: "skip",
  sites: {},
};

export const INCLUDE_ITEMS: { key: keyof CopyInclude; label: string; help: string }[] = [
  { key: "forms", label: "Data-entry forms", help: "Columns, choices and the factor each choice maps to." },
  { key: "units", label: "Units", help: "The units people can pick on those forms." },
  { key: "factors", label: "Emission factors", help: "Per site and year. Check grid factors when the country differs." },
  { key: "mappings", label: "Category mappings", help: "The client's own names for global categories." },
  { key: "threshold", label: "Threshold", help: "Kept when the client already has one." },
  { key: "products", label: "Products", help: "With their declared units for PCF." },
  { key: "material_factors", label: "Material factors (PCF)", help: "The source's own library rows. Licensed rows are never copied." },
];

export type Counts = { create: number; skip: number };
export type SiteReport = {
  key: string;
  name: string;
  target: { kind: "create" | "reuse" | "skip"; site_id: number | null; site_name: string | null };
  country_name: string | null;
  available_factor_years: number[];
  counts: { categories: Counts; units: Counts; forms: Counts; factors: Counts; products: Counts };
  skipped: { forms: string[]; units: string[]; products: string[] };
  warnings: string[];
};
export type CopyReport = {
  source: { company_id: number | null; company_name: string };
  target: { company_id: number | null; company_name: string | null };
  sites: SiteReport[];
  mappings: Counts;
  threshold: "create" | "keep" | "none" | "skip";
  material_factors: Counts & { licensed_excluded: number };
  columns_created: string[];
  errors: string[];
  warnings: string[];
  totals: Counts;
};

/** The request body for the preview and apply endpoints. */
export function toRequest(d: CopyDraft, mode: { onboarding: boolean }): Record<string, unknown> | null {
  if (!d.source) return null;
  const source = d.source.kind === "client" ? { company_id: d.source.companyId } : { bundle: d.source.bundle };
  // A new client has the one main site onboarding made: the first source site
  // fills it (backend `first_site`), the others are created.
  const sites = mode.onboarding ? [] : Object.entries(d.sites).map(([key, target]) => ({ key, target }));
  return {
    source,
    options: {
      ...(sites.length ? { sites } : {}),
      ...(mode.onboarding ? { first_site: "main" } : {}),
      include: d.include,
      factor_years: d.factorYears,
      form_conflict: d.formConflict,
    },
  };
}

/** Years the source has, newest first, across all its sites. */
export function availableYears(report: CopyReport | undefined): number[] {
  const years = new Set<number>();
  for (const s of report?.sites ?? []) for (const y of s.available_factor_years) years.add(y);
  return [...years].sort((a, b) => b - a);
}

/** Reads a downloaded setup file; the backend checks the full shape. */
export function parseBundleFile(text: string): { bundle: SetupBundle } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "This file isn't JSON. Download the setup file from a client's page and upload that." };
  }
  const b = parsed as Partial<SetupBundle> | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.sites) || !b.source || typeof b.source.company_name !== "string") {
    return { error: "This file isn't an ESGLite setup file." };
  }
  if (b.version !== 1) return { error: `This setup file is version ${String(b.version)}; this app reads version 1.` };
  return { bundle: b as SetupBundle };
}

export const sourceName = (s: SetupSource | null): string => (s ? (s.kind === "client" ? s.name : `${s.bundle.source.company_name} (file ${s.fileName})`) : "");

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 sites, 5 forms, 40 factors, 12 mappings, threshold" for a report's created items; "Nothing to copy" when empty. */
export function summarize(r: CopyReport): string {
  const sum = (pick: (s: SiteReport) => Counts) => r.sites.reduce((n, s) => n + pick(s).create, 0);
  const parts: string[] = [];
  const newSites = r.sites.filter((s) => s.target.kind === "create").length;
  if (newSites) parts.push(plural(newSites, "new site"));
  const forms = sum((s) => s.counts.forms);
  if (forms) parts.push(plural(forms, "form"));
  const units = sum((s) => s.counts.units);
  if (units) parts.push(plural(units, "unit"));
  const factors = sum((s) => s.counts.factors);
  if (factors) parts.push(plural(factors, "factor"));
  if (r.mappings.create) parts.push(plural(r.mappings.create, "mapping"));
  if (r.threshold === "create") parts.push("threshold");
  const products = sum((s) => s.counts.products);
  if (products) parts.push(plural(products, "product"));
  if (r.material_factors.create) parts.push(plural(r.material_factors.create, "material factor"));
  return parts.length ? parts.join(", ") : "Nothing to copy";
}

/** Items the copy leaves alone because the target already has them. */
export function skippedCount(r: CopyReport): number {
  return r.totals.skip;
}
