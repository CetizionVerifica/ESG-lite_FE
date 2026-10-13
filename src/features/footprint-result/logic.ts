/**
 * C03 Footprint result: pure logic behind the result page.
 * Data: E1 `GET /pcf/studies/:id`, `GET /pcf/studies?productId=` (versions),
 * C03 `GET /pcf/studies/:id/result` and `/audit`.
 */
import { serializePeriod } from "../../ui";

export const STAGES = ["A1", "A2", "A3_energy", "A3_packaging", "A3_waste"] as const;
export type Stage = (typeof STAGES)[number];

/** Fixed order, one series token each (docs/pcf): A1 materials … A3 waste. */
export const STAGE_LABEL: Record<Stage, string> = {
  A1: "Materials (A1)",
  A2: "Transport (A2)",
  A3_energy: "Energy (A3)",
  A3_packaging: "Packaging (A3)",
  A3_waste: "Waste (A3)",
};

export type StudyStatus = "draft" | "in_review" | "approved" | "published" | "superseded";

export const STATUS_LABEL: Record<StudyStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  superseded: "Superseded",
};

export type ResultSummary = {
  total_kg_per_unit: number;
  by_stage: Partial<Record<Stage, number | null>>;
  hidden_stages: string[];
  primary_data_share_pct: number | null;
  dqr_overall: number | null;
  warnings: string[];
  is_draft: boolean;
  calculated_at: string;
};

export type Study = {
  pcf_study_id: number;
  product: { product_id: number; name: string; declared_unit: string | null; declared_unit_qty: number | null; mass_per_unit_kg: number | null } | null;
  site: { site_id: number; name: string } | null;
  reference_start: string;
  reference_end: string;
  year_type: "CY" | "FY";
  boundary: string;
  standard: string;
  pcr_tag: string | null;
  allocation_key: string;
  version: number;
  parent_version_id: number | null;
  status: StudyStatus;
  stale: boolean;
  created_by: { user_id: number; name: string } | null;
  reviewed_by: { user_id: number; name: string } | null;
  reviewed_at: string | null;
  review_comment: string | null;
  updated_at: string;
  result?: ResultSummary | null;
};

export type Dqr = { technology: number; geography: number; time: number };

export type ResultFactor = { name: string; unit: string; source: string | null; licence: string | null; value_kgco2e: number | null };

export type ResultLine = {
  id: string;
  pcf_input_id: number | null;
  stage: Stage;
  name: string;
  /** Null when the line uses a licensed factor the viewer can't see. */
  kgco2e_per_unit: number | null;
  share_pct: number | null;
  value_hidden: boolean;
  data_type: "primary" | "secondary";
  dqr: Dqr;
  cut_off_candidate: boolean | null;
  quantity: number | null;
  unit: string | null;
  recycled_share_pct: number | null;
  supplier_specific: boolean;
  factor: ResultFactor | null;
  recycled_factor: ResultFactor | null;
  /** Change in the product total for +10 points of recycled input; negative lowers it. */
  lever_kg_per_10pts: number | null;
};

export type AllocationRow = {
  pcf_allocation_id: number;
  category_id: number | null;
  category_name: string;
  scope: number;
  period_total_tco2e: number;
  share_pct: number;
  allocated_kg_per_unit: number;
};

export type ResultDetail = {
  pcf_study_id: number;
  total_kg_per_unit: number;
  by_stage: Partial<Record<Stage, number | null>>;
  hidden_stages: string[];
  primary_data_share_pct: number | null;
  dqr: (Dqr & { overall: number }) | null;
  recycled_input_pct: number | null;
  lines: ResultLine[];
  cut_off: { below_threshold_ids: string[] | null; below_threshold_total_pct: number | null; within_limit: boolean | null };
  allocation: { share_pct: number; product_output_units: number; key: string; key_value_product: number | null; key_value_site_total: number | null } | null;
  allocations: AllocationRow[];
  emission_ids_used: number[];
  production_ids_used: number[];
  warnings: string[];
  is_draft: boolean;
  calculated_at: string;
  calculated_by: { user_id: number; name: string } | null;
};

const fmtNum = (v: number, digits = 3) => v.toLocaleString("en-GB", { maximumFractionDigits: digits });

/** Unit text exactly as declared: "kgCO₂e / kg", "kgCO₂e / 1000 m". */
export function perUnitText(product: Study["product"]): string {
  const unit = product?.declared_unit;
  if (!unit) return "kgCO₂e per declared unit";
  const qty = product?.declared_unit_qty ?? 1;
  return `kgCO₂e / ${qty === 1 ? unit : `${fmtNum(qty)} ${unit}`}`;
}

/** "CY 2025" or "FY 2025–26". */
export function periodLabel(s: Pick<Study, "reference_start" | "reference_end" | "year_type">): string {
  const start = Number(s.reference_start.slice(0, 4));
  const end = Number(s.reference_end.slice(0, 4));
  return s.year_type === "CY" || start === end ? `CY ${start}` : `FY ${start}–${String(end).slice(2)}`;
}

/** URL `period=` value for the study's reference period. */
export function periodParam(s: Pick<Study, "reference_start" | "year_type">): string {
  const year = Number(s.reference_start.slice(0, 4));
  return serializePeriod(s.year_type === "CY" ? { kind: "cy", year } : { kind: "fy", startYear: year });
}

const SHOWN_FIRST: StudyStatus[] = ["published", "approved"];

/**
 * The version `/products/:productId` shows: the latest published or approved
 * one, else the latest version still in progress. Superseded versions only
 * show when nothing else exists.
 */
export function latestVersion(versions: Study[]): Study | null {
  const byVersion = [...versions].sort((a, b) => b.version - a.version);
  return (
    byVersion.find((s) => SHOWN_FIRST.includes(s.status)) ??
    byVersion.find((s) => s.status !== "superseded") ??
    byVersion[0] ??
    null
  );
}

/** The newest earlier version with a result, to compare against. */
export function previousVersion(versions: Study[], study: Pick<Study, "pcf_study_id" | "version">): Study | null {
  return (
    [...versions]
      .filter((s) => s.version < study.version && s.result)
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** DQR is 1 (best) to 3 (worst). */
export function dqrWord(v: number): string {
  return v < 2 ? "good" : v < 2.5 ? "fair" : "poor";
}

export type Hotspot = { line: ResultLine; text: string };

/**
 * Top inputs by share of the total, each with a one-line lever written by rule
 * (never AI): the recycled-input lever comes from the server re-running the
 * engine with that line's recycled share 10 points higher.
 */
export function hotspots(lines: ResultLine[], unitText: string, limit = 8): Hotspot[] {
  return lines
    .filter((l) => l.kgco2e_per_unit != null && l.share_pct != null && l.kgco2e_per_unit > 0)
    .sort((a, b) => (b.kgco2e_per_unit ?? 0) - (a.kgco2e_per_unit ?? 0))
    .slice(0, limit)
    .map((line) => ({ line, text: leverText(line, unitText) }));
}

export function leverText(l: ResultLine, unitText: string): string {
  const head = `${l.name} is ${fmtNum(l.share_pct ?? 0, l.share_pct != null && l.share_pct < 1 ? 1 : 0)}%.`;
  const lever = l.lever_kg_per_10pts;
  const unit = unitText.replace(/^kgCO₂e \/ /, "per ");
  if (lever != null && Math.abs(lever) > 1e-9) {
    const verb = lever < 0 ? "lowers" : "raises";
    return `${head} Each +10 pts of recycled input ${verb} the footprint by about ${fmtNum(Math.abs(lever), 2)} kgCO₂e ${unit}.`;
  }
  if (l.stage === "A3_energy") return `${head} It comes from the site's approved Scope 1 and 2 data; cleaner energy at the site lowers it.`;
  if (l.data_type === "secondary" && !l.supplier_specific && (l.share_pct ?? 0) >= 10) {
    return `${head} It uses a secondary factor; a supplier-specific figure would make it more accurate.`;
  }
  return head;
}

export type WaterfallStep = { key: Stage | "hidden" | "total"; label: string; base: number; value: number };

/**
 * Stage waterfall from A1 to the total. Stages holding a licensed line the
 * viewer can't see are shown together as one "Licensed stages" step.
 */
export function waterfall(total: number, byStage: Partial<Record<Stage, number | null>>, hiddenStages: string[]): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let run = 0;
  let visible = 0;
  for (const s of STAGES) {
    const v = byStage[s];
    if (v == null || hiddenStages.includes(s)) continue;
    if (v === 0) continue;
    steps.push({ key: s, label: STAGE_LABEL[s], base: run, value: v });
    run += v;
    visible += v;
  }
  if (hiddenStages.length) {
    const rest = total - visible;
    if (Math.abs(rest) > 1e-9) steps.push({ key: "hidden", label: "Licensed stages", base: run, value: rest });
  }
  steps.push({ key: "total", label: "Total", base: 0, value: total });
  return steps;
}

export type ActionId = "edit" | "approve" | "reject" | "publish" | "new-version" | "export";

/** What the header offers for a status; the server still checks who may approve. */
export function actionsFor(study: Pick<Study, "status" | "stale" | "result">): { primary: ActionId; secondary: ActionId[] } {
  switch (study.status) {
    case "draft":
      return { primary: "edit", secondary: study.result ? ["export"] : [] };
    case "in_review":
      return { primary: "approve", secondary: ["reject", "export"] };
    case "approved":
      return { primary: "export", secondary: study.stale ? ["new-version"] : ["publish", "new-version"] };
    case "published":
      return { primary: "export", secondary: ["new-version"] };
    default:
      return { primary: "export", secondary: [] };
  }
}

export const ACTION_LABEL: Record<ActionId, string> = {
  edit: "Continue editing",
  approve: "Approve",
  reject: "Send back",
  publish: "Publish",
  "new-version": "New version",
  export: "Export declaration",
};

/** Average of a line's three DQR scores. */
export const dqrAverage = (d: Dqr) => (d.technology + d.geography + d.time) / 3;

export type DqrRow = { stage: Stage | "all"; label: string; lines: number; technology: number | null; geography: number | null; time: number | null; overall: number | null };

/**
 * DQR matrix: the mean technology, geography and time score per stage,
 * weighted by each line's contribution when it is visible (licensed lines
 * count equally), plus an "All stages" row. Stages without lines are left out.
 */
export function dqrMatrix(lines: ResultLine[]): DqrRow[] {
  const row = (stage: DqrRow["stage"], label: string, group: ResultLine[]): DqrRow | null => {
    if (group.length === 0) return null;
    const visible = group.every((l) => l.kgco2e_per_unit != null) && group.some((l) => (l.kgco2e_per_unit ?? 0) > 0);
    const weight = (l: ResultLine) => (visible ? l.kgco2e_per_unit ?? 0 : 1);
    const total = group.reduce((s, l) => s + weight(l), 0);
    const mean = (pick: (d: Dqr) => number) => (total > 0 ? group.reduce((s, l) => s + pick(l.dqr) * weight(l), 0) / total : null);
    const technology = mean((d) => d.technology);
    const geography = mean((d) => d.geography);
    const time = mean((d) => d.time);
    const overall = technology == null || geography == null || time == null ? null : (technology + geography + time) / 3;
    return { stage, label, lines: group.length, technology, geography, time, overall };
  };
  const rows = STAGES.map((s) => row(s, STAGE_LABEL[s], lines.filter((l) => l.stage === s))).filter((r): r is DqrRow => r != null);
  const all = row("all", "All stages", lines);
  return all ? [...rows, all] : rows;
}

export type CompareRow = { key: Stage | "total"; label: string; a: number | null; b: number | null; delta: number | null; delta_pct: number | null };

/**
 * Side-by-side stage figures for two versions, from their stored summaries
 * (`study.result.by_stage`). `b` is the version compared against; the delta is
 * a − b, so a negative number means `a` is lower.
 */
export function compareVersions(a: Pick<Study, "result">, b: Pick<Study, "result">): CompareRow[] {
  const ra = a.result;
  const rb = b.result;
  const rows: CompareRow[] = STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], a: ra?.by_stage[s] ?? null, b: rb?.by_stage[s] ?? null, delta: null, delta_pct: null }));
  rows.push({ key: "total", label: "Total", a: ra?.total_kg_per_unit ?? null, b: rb?.total_kg_per_unit ?? null, delta: null, delta_pct: null });
  return rows
    .filter((r) => r.key === "total" || r.a != null || r.b != null)
    .map((r) => {
      if (r.a == null || r.b == null) return r;
      const delta = r.a - r.b;
      return { ...r, delta, delta_pct: r.b === 0 ? null : (delta / r.b) * 100 };
    });
}

/** Audit actions the backend writes for a study, as past-tense labels. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  calculate: "Calculated",
  submit: "Sent for review",
  approve: "Approved",
  reject: "Sent back",
  publish: "Published",
  published: "Published",
  superseded: "Superseded",
};

/** C06: a secondary line without a supplier figure can be asked for one. */
export const askSupplierLink = (studyId: number, inputId: number) => `/products/suppliers?new=1&study=${studyId}&input=${inputId}`;
