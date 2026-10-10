/**
 * P24 Capture setup: pure helpers behind the forms list, the coverage matrix
 * and the columns library. A "form" is a ColumnConfig (one site × category);
 * a "column" is a field in the shared library.
 */

export type ColumnType = "text" | "number" | "date" | "boolean" | "select";

export const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / no" },
  { value: "select", label: "Select" },
];

export type ChoiceOption = { id: string | number; label: string };

export type LibraryColumn = {
  pk_id: number;
  column_name: string;
  column_type: string;
  dropdown_options?: ChoiceOption[] | null;
};

export type Company = { company_id: number; name: string };
export type Category = { category_id: number; category_name: string; scope?: string | null };
export type Site = { site_id: number; name: string; company?: Company | null; categories?: Category[] | null };

export type CalculationMode = "per_method" | "per_unit";

export type FormConfig = {
  pk_id: number;
  config_name: string;
  site?: { site_id: number; name: string } | null;
  category?: Category | null;
  columns?: LibraryColumn[] | null;
  emission_category_mapping?: Record<string, string> | null;
  extra_fields?: unknown[] | null;
  calculation?: { mode?: CalculationMode | string } | null;
};

/** The form builder for one form. */
export const formPath = (id: number) => `/capture/forms/${id}`;

export function typeLabel(type: string): string {
  return COLUMN_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function calculationLabel(calc: FormConfig["calculation"]): string {
  if (!calc?.mode) return "None";
  if (calc.mode === "per_method") return "Per method";
  if (calc.mode === "per_unit") return "Per unit";
  return calc.mode;
}

// ─── Forms list ──────────────────────────────────────────────────────────────

export type FormRow = {
  id: number;
  name: string;
  siteId: number | null;
  siteName: string;
  clientId: number | null;
  clientName: string;
  categoryId: number | null;
  categoryName: string;
  fields: number;
  calculation: string;
  mappings: number;
  extraFields: number;
};

/** One table row per form, with the client looked up from the site list. */
export function buildFormRows(configs: FormConfig[], sites: Site[]): FormRow[] {
  const siteById = new Map(sites.map((s) => [s.site_id, s]));
  return configs.map((c) => {
    const site = c.site ? siteById.get(c.site.site_id) : undefined;
    return {
      id: c.pk_id,
      name: c.config_name,
      siteId: c.site?.site_id ?? null,
      siteName: c.site?.name ?? site?.name ?? "—",
      clientId: site?.company?.company_id ?? null,
      clientName: site?.company?.name ?? "—",
      categoryId: c.category?.category_id ?? null,
      categoryName: c.category?.category_name ?? "—",
      fields: c.columns?.length ?? 0,
      calculation: calculationLabel(c.calculation),
      mappings: Object.keys(c.emission_category_mapping ?? {}).length,
      extraFields: c.extra_fields?.length ?? 0,
    };
  });
}

export type FormFilter = { q: string; clientIds: number[]; siteIds: number[] };

export function matchesForm(row: FormRow, f: FormFilter): boolean {
  if (f.clientIds.length && (row.clientId === null || !f.clientIds.includes(row.clientId))) return false;
  if (f.siteIds.length && (row.siteId === null || !f.siteIds.includes(row.siteId))) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.siteName, row.clientName, row.categoryName].some((v) => v.toLowerCase().includes(q));
}

/** Sites the filters leave in view (the matrix rows). */
export function sitesInView(sites: Site[], f: Pick<FormFilter, "clientIds" | "siteIds">): Site[] {
  return sites.filter(
    (s) =>
      (!f.clientIds.length || (s.company && f.clientIds.includes(s.company.company_id))) &&
      (!f.siteIds.length || f.siteIds.includes(s.site_id)),
  );
}

export function toIds(values: string[] | undefined): number[] {
  return (values ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

// ─── Coverage matrix ─────────────────────────────────────────────────────────

/** configured: at least one form · missing: the site reports the category but has no form · na: not reported there. */
export type CellState = "configured" | "missing" | "na";
export type CoverageCell = { state: CellState; formIds: number[] };
export type CoverageRow = { site: Site; cells: CoverageCell[] };
export type Coverage = { categories: Category[]; rows: CoverageRow[]; configured: number; missing: number };

const SCOPE_ORDER = (scope?: string | null) => {
  const n = Number(String(scope ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 9;
};

/**
 * Site rows × category columns. Columns are the categories any site in view
 * reports, plus any category a form exists for (so a form on a category the
 * site no longer reports still shows), ordered by scope then name.
 */
export function buildCoverage(sites: Site[], configs: FormConfig[]): Coverage {
  const siteIds = new Set(sites.map((s) => s.site_id));
  const inView = configs.filter((c) => c.site && siteIds.has(c.site.site_id));
  const cats = new Map<number, Category>();
  for (const s of sites) for (const c of s.categories ?? []) cats.set(c.category_id, c);
  for (const c of inView) if (c.category && !cats.has(c.category.category_id)) cats.set(c.category.category_id, c.category);
  const categories = [...cats.values()].sort(
    (a, b) => SCOPE_ORDER(a.scope) - SCOPE_ORDER(b.scope) || a.category_name.localeCompare(b.category_name),
  );

  let configured = 0;
  let missing = 0;
  const rows = sites.map((site) => {
    const reported = new Set((site.categories ?? []).map((c) => c.category_id));
    const cells = categories.map<CoverageCell>((cat) => {
      const formIds = inView.filter((c) => c.site?.site_id === site.site_id && c.category?.category_id === cat.category_id).map((c) => c.pk_id);
      if (formIds.length) {
        configured++;
        return { state: "configured", formIds };
      }
      if (reported.has(cat.category_id)) {
        missing++;
        return { state: "missing", formIds };
      }
      return { state: "na", formIds };
    });
    return { site, cells };
  });
  return { categories, rows, configured, missing };
}

/** The matrix is only readable for one client at a time. */
export function singleClient(sites: Site[]): Company | null {
  const ids = new Set(sites.map((s) => s.company?.company_id ?? null));
  if (ids.size !== 1) return null;
  return sites[0]?.company ?? null;
}

// ─── Columns library ─────────────────────────────────────────────────────────

export type ColumnUse = { id: number; name: string };

/** Column id → the forms that use it. */
export function columnUsage(configs: FormConfig[]): Map<number, ColumnUse[]> {
  const out = new Map<number, ColumnUse[]>();
  for (const c of configs) {
    for (const col of c.columns ?? []) {
      const list = out.get(col.pk_id) ?? [];
      list.push({ id: c.pk_id, name: c.config_name });
      out.set(col.pk_id, list);
    }
  }
  return out;
}

export type ColumnRow = LibraryColumn & { typeLabel: string; optionCount: number | null; usedBy: ColumnUse[] };

export function buildColumnRows(columns: LibraryColumn[], usage: Map<number, ColumnUse[]>): ColumnRow[] {
  return columns.map((c) => ({
    ...c,
    typeLabel: typeLabel(c.column_type),
    optionCount: c.column_type === "select" ? (c.dropdown_options?.length ?? 0) : null,
    usedBy: usage.get(c.pk_id) ?? [],
  }));
}

export function matchesColumn(row: ColumnRow, q: string, types: string[]): boolean {
  if (types.length && !types.includes(row.column_type)) return false;
  const s = q.trim().toLowerCase();
  return !s || row.column_name.toLowerCase().includes(s);
}

/** "Recycled paper" → "recycled_paper": the stored value of a new choice. */
export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A choice in the editor. `auto` keeps the value following the label until someone edits the value. */
export type ChoiceDraft = { key: string; label: string; value: string; auto: boolean };

export type ColumnDraft = { name: string; type: ColumnType | null; choices: ChoiceDraft[] };

let draftSeq = 0;
export const newChoice = (label = "", value?: string): ChoiceDraft => ({
  key: `c${++draftSeq}`,
  label,
  value: value ?? slugify(label),
  auto: value === undefined || value === slugify(label),
});

export function draftFrom(col: LibraryColumn | null): ColumnDraft {
  if (!col) return { name: "", type: null, choices: [] };
  const type = (COLUMN_TYPES.some((t) => t.value === col.column_type) ? col.column_type : "text") as ColumnType;
  return { name: col.column_name, type, choices: (col.dropdown_options ?? []).map((o) => newChoice(o.label, String(o.id))) };
}

export type DraftErrors = { name?: string; type?: string; choices?: string; rows: Record<string, string> };

export function validateDraft(d: ColumnDraft, others: LibraryColumn[]): DraftErrors {
  const errors: DraftErrors = { rows: {} };
  const name = d.name.trim();
  if (!name) errors.name = "Enter a column name.";
  else if (others.some((c) => c.column_name.trim().toLowerCase() === name.toLowerCase())) errors.name = "A column with this name already exists.";
  if (!d.type) errors.type = "Choose a type.";
  if (d.type === "select") {
    const seen = new Map<string, string>();
    for (const c of d.choices) {
      if (!c.label.trim()) errors.rows[c.key] = "Enter a label or remove this choice.";
      else if (!c.value.trim()) errors.rows[c.key] = "Enter a stored value.";
      else if (seen.has(c.value.trim())) errors.rows[c.key] = `Same stored value as "${seen.get(c.value.trim())}".`;
      else seen.set(c.value.trim(), c.label.trim());
    }
  }
  return errors;
}

export const hasErrors = (e: DraftErrors) => !!(e.name || e.type || e.choices || Object.keys(e.rows).length);

export function toPayload(d: ColumnDraft): { column_name: string; column_type: string; dropdown_options: ChoiceOption[] | null } {
  return {
    column_name: d.name.trim(),
    column_type: d.type ?? "text",
    dropdown_options: d.type === "select" ? d.choices.map((c) => ({ id: c.value.trim(), label: c.label.trim() })) : null,
  };
}

/** Saving a Select column as another type wipes its choices: worth a warning first. */
export function wipesChoices(original: LibraryColumn | null, d: ColumnDraft): number {
  if (!original || original.column_type !== "select" || d.type === "select") return 0;
  return original.dropdown_options?.length ?? 0;
}

// ─── New form ────────────────────────────────────────────────────────────────

export type NewFormDraft = { name: string; siteId: number | null; categoryId: number | null };

/** "Hidd · Purchased goods" as a starting name. */
export function suggestedFormName(site: Site | undefined, category: Category | undefined): string {
  return site && category ? `${site.name} · ${category.category_name}` : "";
}

export function validateNewForm(d: NewFormDraft, configs: FormConfig[]): Partial<Record<keyof NewFormDraft, string>> {
  const e: Partial<Record<keyof NewFormDraft, string>> = {};
  if (!d.siteId) e.siteId = "Choose a site.";
  if (!d.categoryId) e.categoryId = "Choose a category.";
  const name = d.name.trim();
  if (!name) e.name = "Enter a form name.";
  else if (
    configs.some(
      (c) => c.site?.site_id === d.siteId && c.category?.category_id === d.categoryId && c.config_name.trim().toLowerCase() === name.toLowerCase(),
    )
  )
    e.name = "This site and category already have a form with this name.";
  return e;
}

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** Forms named by the server when it refuses to delete a column still in use. */
export function blockingForms(e: unknown): ColumnUse[] {
  const list = (e as { response?: { data?: { associatedConfigs?: { pk_id: number; config_name: string }[] } } })?.response?.data?.associatedConfigs;
  return Array.isArray(list) ? list.map((c) => ({ id: c.pk_id, name: c.config_name })) : [];
}
