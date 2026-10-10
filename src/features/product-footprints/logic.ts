/**
 * C01 Product footprints: pure logic behind the portfolio table and KPIs.
 * Data: E1 `GET /pcf/studies`, `GET /pcf/reconciliation`, the manager's
 * products per site and their approved production for the year.
 */

export const STAGES = ["A1", "A2", "A3_energy", "A3_packaging", "A3_waste"] as const;
export type Stage = (typeof STAGES)[number];

/** Fixed order, one series token each (docs/pcf: A1 materials … A3 waste). */
export const STAGE_LABEL: Record<Stage, string> = {
  A1: "Materials (A1)",
  A2: "Transport (A2)",
  A3_energy: "Energy (A3)",
  A3_packaging: "Packaging (A3)",
  A3_waste: "Waste (A3)",
};

export type StudyStatus = "draft" | "in_review" | "approved" | "published" | "superseded";

export type StudyResult = {
  total_kg_per_unit: number;
  /** A stage is null when it holds a licensed line the viewer can't see. */
  by_stage: Partial<Record<Stage, number | null>>;
  hidden_stages?: string[];
  primary_data_share_pct: number | null;
  dqr_overall: number | null;
  warnings: string[];
  is_draft: boolean;
  calculated_at: string;
};

export type Study = {
  pcf_study_id: number;
  product: { product_id: number; name: string; declared_unit: string | null; declared_unit_qty: number | null } | null;
  site: { site_id: number; name: string } | null;
  reference_start: string;
  reference_end: string;
  year_type: "CY" | "FY";
  pcr_tag: string | null;
  version: number;
  status: StudyStatus;
  stale: boolean;
  updated_at: string;
  result: StudyResult | null | undefined;
};

export type Reconciliation = {
  site_id: number;
  plant_s1_s2_tco2e: number;
  covered_tco2e: number;
  coverage_pct: number | null;
  products: { product_id: number; pcf_study_id: number }[];
};

export type SiteProduct = { product_id: number; name: string; unit: string; site: { site_id: number; name: string } };
export type ApprovedProduction = { quantity: number | string; unit: string; product: { product_id: number } };

/** Status shown in the table. "stale" reads "Out of date"; "none" means no footprint yet. */
export type RowStatus = "draft" | "in_review" | "approved" | "published" | "stale" | "none";

export const ROW_STATUSES: RowStatus[] = ["none", "draft", "in_review", "approved", "published", "stale"];

export const STATUS_LABEL: Record<RowStatus, string> = {
  none: "No footprint",
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  stale: "Out of date",
};

export type FootprintRow = {
  product_id: number;
  product_name: string;
  site_id: number;
  site_name: string;
  study: Study | null;
  status: RowStatus;
  /** Approved or published (out of date included): a footprint a customer can be given. */
  usable: boolean;
  declared_unit: string | null;
  total: number | null;
  previous: number | null;
  stages: Partial<Record<Stage, number | null>> | null;
  hidden_stages: string[];
  primary: number | null;
  pcr_tag: string | null;
  updated: string | null;
  /** A newer draft or in-review version, e.g. "v3 in review". */
  in_progress: string | null;
  /** Approved production in the year, in the product's unit; null when there is none. */
  approved_qty: number | null;
  /** The unit approved production was reported in; null when units are mixed. */
  approved_unit: string | null;
};

const USABLE: StudyStatus[] = ["approved", "published"];
const WAS_APPROVED: StudyStatus[] = ["approved", "published", "superseded"];

/** True when the study's reference period overlaps [from, to] (ISO dates). */
export function overlaps(s: Pick<Study, "reference_start" | "reference_end">, from: string, to: string): boolean {
  return s.reference_start <= to && s.reference_end >= from;
}

const newer = (a: Study, b: Study) => a.version - b.version || a.updated_at.localeCompare(b.updated_at);

function latest(studies: Study[], keep: (s: Study) => boolean): Study | null {
  let best: Study | null = null;
  for (const s of studies) if (keep(s) && (!best || newer(s, best) > 0)) best = s;
  return best;
}

/**
 * The study a product's row shows for the year, among versions whose reference
 * period overlaps the year: the latest approved or published one, else the
 * latest draft or in-review one. Superseded versions never show.
 */
export function currentStudy(studies: Study[], from: string, to: string): Study | null {
  const inYear = studies.filter((s) => s.status !== "superseded" && overlaps(s, from, to));
  return latest(inYear, (s) => USABLE.includes(s.status)) ?? latest(inYear, () => true);
}

/** A newer draft or in-review version behind the shown footprint ("v3 in review"). */
export function newerVersion(studies: Study[], current: Study, from: string, to: string): Study | null {
  return latest(studies, (s) => s.status !== "superseded" && s.version > current.version && overlaps(s, from, to));
}

/** "v3 draft", "v3 in review". */
export function inProgressLabel(s: Study | null): string | null {
  if (!s) return null;
  return `v${s.version} ${s.status === "in_review" ? "in review" : "draft"}`;
}

/** Total of the latest earlier version that was approved or published, for "vs previous". */
export function previousTotal(studies: Study[], current: Study): number | null {
  let best: Study | null = null;
  for (const s of studies) {
    if (s.pcf_study_id === current.pcf_study_id || s.version >= current.version) continue;
    if (!WAS_APPROVED.includes(s.status) || !s.result) continue;
    if (!best || newer(s, best) > 0) best = s;
  }
  return best?.result?.total_kg_per_unit ?? null;
}

export function rowStatus(s: Study | null): RowStatus {
  if (!s) return "none";
  if (s.stale && s.status !== "draft") return "stale";
  return s.status === "superseded" ? "approved" : s.status;
}

/** "1 kg", "1,000 m": the unit the footprint is declared per. Null until a study sets it. */
export function declaredUnitLabel(study: Study | null): string | null {
  const unit = study?.product?.declared_unit ?? null;
  if (!unit) return null;
  const qty = study?.product?.declared_unit_qty ?? 1;
  return `${qty.toLocaleString("en-GB", { maximumFractionDigits: 3 })} ${unit}`;
}

/** Approved quantity per product; a product reported in more than one unit gets unit null. */
export function productionByProduct(records: ApprovedProduction[]): Map<number, { qty: number; unit: string | null }> {
  const out = new Map<number, { qty: number; unit: string | null }>();
  for (const r of records) {
    const qty = Number(r.quantity);
    if (!Number.isFinite(qty)) continue;
    const id = r.product.product_id;
    const cur = out.get(id);
    if (!cur) out.set(id, { qty, unit: r.unit });
    else out.set(id, { qty: cur.qty + qty, unit: cur.unit === r.unit ? cur.unit : null });
  }
  return out;
}

/**
 * One row per product on the chosen sites. Only studies made for the
 * product's own site count (a product belongs to one site).
 */
export function buildRows(input: {
  products: SiteProduct[];
  studies: Study[];
  production: ApprovedProduction[];
  from: string;
  to: string;
}): FootprintRow[] {
  const key = (productId: number, siteId: number) => `${productId}:${siteId}`;
  const byProduct = new Map<string, Study[]>();
  for (const s of input.studies) {
    if (!s.product || !s.site) continue;
    const k = key(s.product.product_id, s.site.site_id);
    byProduct.set(k, [...(byProduct.get(k) ?? []), s]);
  }
  const produced = productionByProduct(input.production);
  return input.products.map((p) => {
    const all = byProduct.get(key(p.product_id, p.site.site_id)) ?? [];
    const study = currentStudy(all, input.from, input.to);
    const status = rowStatus(study);
    const result = study?.result ?? null;
    const made = produced.get(p.product_id);
    return {
      product_id: p.product_id,
      product_name: p.name,
      site_id: p.site.site_id,
      site_name: p.site.name,
      study,
      status,
      usable: !!study && USABLE.includes(study.status),
      declared_unit: declaredUnitLabel(study),
      total: result?.total_kg_per_unit ?? null,
      previous: study ? previousTotal(all, study) : null,
      stages: result?.by_stage ?? null,
      hidden_stages: result?.hidden_stages ?? [],
      primary: result?.primary_data_share_pct ?? null,
      pcr_tag: study?.pcr_tag ?? null,
      in_progress: study && study.status !== "draft" && study.status !== "in_review" ? inProgressLabel(newerVersion(all, study, input.from, input.to)) : null,
      updated: study?.updated_at ?? null,
      approved_qty: made && made.qty > 0 ? made.qty : null,
      approved_unit: made && made.qty > 0 ? made.unit : null,
    };
  });
}

/** KPI focus: each KPI filters the table to the rows that produced it. */
export type Focus = "footprinted" | "covered" | "allocated" | "primary";
export const FOCUSES: Focus[] = ["footprinted", "covered", "allocated", "primary"];

export function asFocus(v: string | null): Focus | null {
  return (FOCUSES as string[]).includes(v ?? "") ? (v as Focus) : null;
}

const weightable = (r: FootprintRow) => r.usable && r.primary !== null && r.total !== null && r.approved_qty !== null;

/** Rows behind each KPI. */
export function inFocus(r: FootprintRow, focus: Focus, allocated: Set<number>): boolean {
  switch (focus) {
    case "footprinted":
      return r.approved_qty !== null;
    case "covered":
      return r.approved_qty !== null && r.usable;
    case "allocated":
      return allocated.has(r.product_id);
    case "primary":
      return weightable(r);
  }
}

export type Kpis = {
  footprinted: number;
  withProduction: number;
  outOfDate: number;
  /** Share of approved production volume that has a usable footprint; null when units differ or nothing was produced. */
  coveredPct: number | null;
  mixedUnits: boolean;
  /** Plant Scope 1+2 allocated to products by approved/published footprints, all chosen sites. */
  allocatedPct: number | null;
  /** Emission-weighted (kgCO₂e per unit × approved quantity) primary data share. */
  primaryPct: number | null;
  /** Usable footprints left out of the primary share because licensed lines hide it. */
  primaryHidden: number;
};

export function computeKpis(rows: FootprintRow[], recon: Reconciliation[] | null): Kpis {
  const made = rows.filter((r) => r.approved_qty !== null);
  const units = new Set(made.map((r) => r.approved_unit));
  const mixedUnits = units.size > 1 || units.has(null);
  const volume = made.reduce((s, r) => s + (r.approved_qty ?? 0), 0);
  const covered = made.filter((r) => r.usable).reduce((s, r) => s + (r.approved_qty ?? 0), 0);

  const plant = recon?.reduce((s, r) => s + (Number(r.plant_s1_s2_tco2e) || 0), 0) ?? 0;
  const allocated = recon?.reduce((s, r) => s + (Number(r.covered_tco2e) || 0), 0) ?? 0;

  let weight = 0;
  let weighted = 0;
  for (const r of rows.filter(weightable)) {
    const w = (r.total as number) * (r.approved_qty as number);
    weight += w;
    weighted += w * (r.primary as number);
  }

  return {
    footprinted: made.filter((r) => r.usable).length,
    withProduction: made.length,
    outOfDate: rows.filter((r) => r.status === "stale").length,
    coveredPct: !mixedUnits && volume > 0 ? (covered / volume) * 100 : null,
    mixedUnits,
    allocatedPct: recon && plant > 0 ? (allocated / plant) * 100 : null,
    primaryPct: weight > 0 ? weighted / weight : null,
    primaryHidden: rows.filter((r) => r.usable && r.total !== null && r.primary === null && r.approved_qty !== null).length,
  };
}

export type StageSegment = { stage: Stage | "hidden"; value: number; pct: number };

/** Segments for the 60px stage bar; licensed stages the viewer can't see become one "hidden" segment. */
export function stageSegments(total: number | null, stages: FootprintRow["stages"]): StageSegment[] {
  if (total === null || !stages || total <= 0) return [];
  const known = STAGES.map((stage) => ({ stage, value: Math.max(0, Number(stages[stage] ?? 0)) })).filter((s) => s.value > 0);
  const sum = known.reduce((s, k) => s + k.value, 0);
  const hidden = STAGES.some((s) => stages[s] === null) ? Math.max(0, total - sum) : 0;
  const parts: { stage: Stage | "hidden"; value: number }[] = hidden > 0 ? [...known, { stage: "hidden", value: hidden }] : known;
  const base = parts.reduce((s, k) => s + k.value, 0);
  return base > 0 ? parts.map((p) => ({ ...p, pct: (p.value / base) * 100 })) : [];
}

/** Rows matching the status chips, PCR tags and search. */
export function matchesFilters(r: FootprintRow, f: { q: string; statuses: string[]; pcr: string[] }): boolean {
  if (f.statuses.length && !f.statuses.includes(r.status)) return false;
  if (f.pcr.length && !f.pcr.includes(r.pcr_tag ?? "—")) return false;
  const q = f.q.trim().toLowerCase();
  return !q || r.product_name.toLowerCase().includes(q);
}

/** "AAAC conductor", "AAAC conductor and Cu rod", "A, B and 3 more". */
export function nameList(names: string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** Insight callout lines: allocation per site, then products with no footprint. */
export function insightLines(rows: FootprintRow[], recon: Reconciliation[] | null, siteName: (id: number) => string | undefined): string[] {
  const lines: string[] = [];
  for (const r of recon ?? []) {
    if (r.coverage_pct === null || r.coverage_pct === undefined) continue;
    const name = siteName(r.site_id);
    if (name) lines.push(`${name} plant energy is ${Math.round(r.coverage_pct)}% allocated.`);
  }
  const missing = rows.filter((r) => r.status === "none").map((r) => r.product_name);
  if (missing.length) lines.push(`${nameList(missing)} ${missing.length === 1 ? "has" : "have"} no footprint yet.`);
  return lines;
}
