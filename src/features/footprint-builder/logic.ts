// C02 footprint builder: pure helpers. The running total mirrors the E1 engine
// (ESG-lite src/pcf/engine/computePcf.ts) so it updates as the user types;
// Calculate on the server stays the figure of record.

export type InputStage = "A1" | "A2" | "A3_packaging" | "A3_waste";
export type ResultStage = InputStage | "A3_energy";
export const RESULT_STAGES: ResultStage[] = ["A1", "A2", "A3_energy", "A3_packaging", "A3_waste"];

export const STAGE_LABEL: Record<ResultStage, string> = {
  A1: "Materials (A1)",
  A2: "Transport (A2)",
  A3_energy: "Energy (A3)",
  A3_packaging: "Packaging (A3)",
  A3_waste: "Waste (A3)",
};

export type StudyStatus = "draft" | "in_review" | "approved" | "published" | "superseded";
export type YearType = "CY" | "FY";
export type AllocationKey = "mass" | "machine_hours" | "energy" | "economic" | "manual";

/** One input line as the server stores it (`inputJson`). */
export type InputRow = {
  pcf_input_id?: number;
  stage: InputStage;
  name: string;
  material_factor_id: number | null;
  recycled_material_factor_id: number | null;
  emission_factor_id: number | null;
  supplier_pcf_kgco2e: number | null;
  quantity: number | null;
  unit: string;
  recycled_share_pct: number;
  origin_country: string | null;
  supplier_name: string | null;
  transport_mode: string | null;
  distance_km: number | null;
  payload_t: number | null;
  data_type: "primary" | "secondary";
  dqr_technology: number;
  dqr_geography: number;
  dqr_time: number;
  ai_suggested: boolean;
  ai_confidence: number | null;
};

/** An input line in the editor; `key` stays stable while the user edits. */
export type Line = InputRow & { key: string };

export type Study = {
  pcf_study_id: number;
  company_id: number | null;
  product: { product_id: number; name: string; declared_unit: string | null; declared_unit_qty: number | null; mass_per_unit_kg: number | null } | null;
  site: { site_id: number; name: string } | null;
  reference_start: string;
  reference_end: string;
  year_type: YearType;
  boundary: "cradle_to_gate" | "cradle_to_grave";
  standard: string;
  pcr_tag: string | null;
  allocation_key: AllocationKey;
  cut_off_rule_pct: number | null;
  version: number;
  parent_version_id: number | null;
  status: StudyStatus;
  stale: boolean;
  notes: string | null;
  review_comment: string | null;
  inputs: InputRow[];
};

/** The study fields the Scope step edits (PATCH /pcf/studies/:id). */
export type ScopeFields = Pick<Study, "reference_start" | "reference_end" | "year_type" | "pcr_tag" | "notes">;

/** A factor as the running total sees it; `value` is null when licensed and hidden. */
export type PriceFactor = { unit: string; value: number | null };
export type FactorBook = { material: Map<number, PriceFactor>; transport: Map<number, PriceFactor> };

/** What /allocation-preview returns (the parts the builder uses). */
export type AllocationPreview = {
  allocation_key: AllocationKey;
  sources: { category_id: number | null; category_name: string; scope: number; period_total_tco2e: number; share_pct: number | null; allocated_kg_per_unit: number | null }[];
  share_pct: number | null;
  product_output_units: number | null;
  product_production_t: number | null;
  a3_energy_kg_per_unit: number | null;
  plant_s1_s2_tco2e: number;
  blockers: string[];
  warnings: string[];
};

// ------------------------------------------------------------ period ---

/** Twelve-month reference period of a CY or FY (Apr–Mar) starting in `year`. */
export function periodFor(yearType: YearType, year: number): { reference_start: string; reference_end: string } {
  return yearType === "CY"
    ? { reference_start: `${year}-01-01`, reference_end: `${year}-12-31` }
    : { reference_start: `${year}-04-01`, reference_end: `${year + 1}-03-31` };
}

export const periodYear = (s: Pick<Study, "reference_start">) => Number(s.reference_start.slice(0, 4));

export function periodText(yearType: YearType, year: number): string {
  return yearType === "CY" ? `Jan – Dec ${year}` : `Apr ${year} – Mar ${year + 1}`;
}

// ------------------------------------------------------- running total ---

const MASS_TO_KG: Record<string, number> = { g: 0.001, kg: 1, t: 1000, tonne: 1000, tonnes: 1000 };

function toFactorUnit(qty: number, from: string, to: string): number | null {
  const f = from.trim().toLowerCase();
  const t = to.trim().toLowerCase();
  if (f === t) return qty;
  if (f in MASS_TO_KG && t in MASS_TO_KG) return (qty * MASS_TO_KG[f]) / MASS_TO_KG[t];
  return null;
}

export const LICENSED = "Licensed value, shown after Calculate";

export type Priced = { kg: number } | { kg: null; reason: string };

/** kg CO₂e per declared unit for one line, or why it can't be priced yet. */
export function priceLine(line: InputRow, book: FactorBook): Priced {
  const miss = (reason: string): Priced => ({ kg: null, reason });
  if (line.stage === "A2") {
    if (line.payload_t == null || line.distance_km == null) return miss("Needs a mass and a distance");
    // Like the server: a site freight factor first, else a tonne.km factor from the material library.
    const f =
      line.emission_factor_id != null
        ? book.transport.get(line.emission_factor_id)
        : line.material_factor_id != null
          ? book.material.get(line.material_factor_id)
          : undefined;
    if (!f) return miss(line.emission_factor_id != null || line.material_factor_id != null ? "Priced on Calculate" : "Pick a transport factor");
    if (f.unit.trim().toLowerCase() !== "tonne.km") return miss("The transport factor must be per tonne.km");
    if (f.value === null) return miss(LICENSED);
    return { kg: line.payload_t * line.distance_km * f.value };
  }
  if (line.quantity == null) return miss("Enter a quantity");
  if (line.supplier_pcf_kgco2e != null) return { kg: line.quantity * line.supplier_pcf_kgco2e };
  const virgin = line.material_factor_id != null ? book.material.get(line.material_factor_id) : undefined;
  if (!virgin) return miss("Pick a factor");
  const r = (line.recycled_share_pct ?? 0) / 100;
  if (r < 0 || r > 1) return miss("Recycled share must be 0–100%");
  const qty = toFactorUnit(line.quantity, line.unit, virgin.unit);
  if (qty === null) return miss(`"${line.unit}" can't be converted to the factor's unit "${virgin.unit}"`);
  if (virgin.value === null) return miss(LICENSED);
  if (r === 0) return { kg: qty * virgin.value };
  const recycled = line.recycled_material_factor_id != null ? book.material.get(line.recycled_material_factor_id) : undefined;
  if (!recycled) return miss("A recycled share needs a recycled factor");
  const qtyR = toFactorUnit(line.quantity, line.unit, recycled.unit);
  if (qtyR === null) return miss(`"${line.unit}" can't be converted to the recycled factor's unit "${recycled.unit}"`);
  if (recycled.value === null) return miss(LICENSED);
  return { kg: (1 - r) * qty * virgin.value + r * qtyR * recycled.value };
}

/** kg figures: 3 decimals below 100, 1 above. */
export const fmtKg = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: v >= 100 ? 1 : 3 });

export type RunningTotal = {
  total: number;
  byStage: Record<ResultStage, number>;
  /** Lines the total leaves out, with the reason. */
  unpriced: { key: string; name: string; reason: string }[];
};

/** Client-side total: every priced line plus the allocated plant energy (null while unknown). */
export function runningTotal(lines: Line[], book: FactorBook, a3EnergyKg: number | null): RunningTotal {
  const byStage = Object.fromEntries(RESULT_STAGES.map((s) => [s, 0])) as Record<ResultStage, number>;
  const unpriced: RunningTotal["unpriced"] = [];
  for (const l of lines) {
    const p = priceLine(l, book);
    if (p.kg === null) unpriced.push({ key: l.key, name: l.name || "Unnamed line", reason: p.reason });
    else byStage[l.stage] += p.kg;
  }
  byStage.A3_energy = a3EnergyKg ?? 0;
  const total = RESULT_STAGES.reduce((s, k) => s + byStage[k], 0);
  return { total, byStage, unpriced };
}

/** Stage shares for the stacked bar, in the fixed stage order, zero parts dropped. */
export function stageParts(rt: Pick<RunningTotal, "total" | "byStage">): { stage: ResultStage; value: number; pct: number }[] {
  if (!(rt.total > 0)) return [];
  return RESULT_STAGES.filter((s) => rt.byStage[s] > 0).map((s) => ({ stage: s, value: rt.byStage[s], pct: (rt.byStage[s] / rt.total) * 100 }));
}

// ------------------------------------------------------------ saving ---

const AI_CONFIRM_BELOW = 0.6;

/** An AI-suggested line under 60% (or with no confidence) blocks Calculate until confirmed. */
export const needsConfirm = (l: InputRow) => l.ai_suggested && (l.ai_confidence == null || l.ai_confidence < AI_CONFIRM_BELOW);

/** Why the server would refuse this line on save, or null when it would accept it. */
export function lineProblem(l: InputRow): string | null {
  if (!l.name.trim()) return "Name the line";
  if (!l.unit.trim()) return "Pick a unit";
  if (l.stage === "A2") {
    if (l.payload_t == null || l.distance_km == null) return "Enter the mass and distance";
    if (l.emission_factor_id == null && l.material_factor_id == null) return "Pick a tonne.km factor";
    return null;
  }
  if (l.quantity == null) return "Enter a quantity";
  if (l.material_factor_id == null && l.supplier_pcf_kgco2e == null) return "Pick a factor or enter the supplier's footprint";
  if (l.recycled_share_pct > 0 && l.supplier_pcf_kgco2e == null && l.recycled_material_factor_id == null) return "Pick a recycled factor";
  return null;
}

// Editor keys, ids and the server's sort_order stay out of the PUT body (row order is the order).
const toRow = ({ key: _key, pcf_input_id: _id, sort_order: _order, ...row }: Line & { sort_order?: number }): InputRow => row;

/**
 * The PUT /inputs body. PUT replaces every line, so a line the user is
 * halfway through editing is sent as it was last finished (`lastFinished`,
 * by line key) rather than dropped; a new line nobody has finished stays in
 * the editor only. Returns the rows and the updated `lastFinished`.
 */
export function savableInputs(lines: Line[], lastFinished: ReadonlyMap<string, InputRow> = new Map()): { rows: InputRow[]; finished: Map<string, InputRow> } {
  const finished = new Map<string, InputRow>();
  const rows: InputRow[] = [];
  for (const l of lines) {
    const row = lineProblem(l) === null ? toRow(l) : lastFinished.get(l.key);
    if (!row) continue;
    finished.set(l.key, row);
    rows.push(row);
  }
  return { rows, finished };
}

let seq = 0;
export const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const toLines = (rows: InputRow[]): Line[] => rows.map((r) => ({ ...r, key: r.pcf_input_id ? `in-${r.pcf_input_id}` : newKey() }));

export function blankLine(stage: InputStage): Line {
  return {
    key: newKey(),
    stage,
    name: "",
    material_factor_id: null,
    recycled_material_factor_id: null,
    emission_factor_id: null,
    supplier_pcf_kgco2e: null,
    quantity: null,
    unit: stage === "A2" ? "tonne.km" : "kg",
    recycled_share_pct: 0,
    origin_country: null,
    supplier_name: null,
    transport_mode: stage === "A2" ? "road" : null,
    distance_km: null,
    payload_t: null,
    data_type: "secondary",
    dqr_technology: 3,
    dqr_geography: 3,
    dqr_time: 3,
    ai_suggested: false,
    ai_confidence: null,
  };
}

// --------------------------------------------------------- checklist ---

export type CheckItem = { id: string; label: string; done: boolean; blocking: boolean };

export function checklist(study: Pick<Study, "product">, lines: Line[], book: FactorBook, preview: AllocationPreview | null): CheckItem[] {
  const p = study.product;
  const a1 = lines.filter((l) => l.stage === "A1");
  const incomplete = lines.filter((l) => lineProblem(l) !== null).length;
  const unconfirmed = lines.filter(needsConfirm).length;
  const reasons = lines.filter((l) => lineProblem(l) === null).map((l) => priceLine(l, book)).flatMap((p) => (p.kg === null ? [p.reason] : []));
  const licensed = reasons.filter((r) => r === LICENSED).length;
  const unpriced = reasons.length;
  const unpricedLabel = !unpriced
    ? "Every line priced"
    : licensed === unpriced
      ? `${licensed} licensed line${licensed === 1 ? "" : "s"} priced on Calculate`
      : `${unpriced} line${unpriced === 1 ? "" : "s"} not in the running total yet`;
  return [
    { id: "unit", label: p?.declared_unit ? `Declared unit: ${p.declared_unit_qty ?? 1} ${p.declared_unit}` : "Set the product's declared unit", done: !!p?.declared_unit, blocking: true },
    { id: "materials", label: a1.length ? `${a1.length} material line${a1.length === 1 ? "" : "s"}` : "Add the materials", done: a1.length > 0, blocking: true },
    { id: "complete", label: incomplete ? `${incomplete} line${incomplete === 1 ? "" : "s"} not finished` : "Every line finished", done: incomplete === 0, blocking: true },
    { id: "ai", label: unconfirmed ? `Confirm ${unconfirmed} AI line${unconfirmed === 1 ? "" : "s"}` : "AI lines confirmed", done: unconfirmed === 0, blocking: true },
    {
      id: "plant",
      label: preview === null ? "Plant energy loading" : preview.blockers.length ? "Plant energy needs attention" : "Plant energy allocated",
      done: preview !== null && preview.blockers.length === 0,
      blocking: true,
    },
    { id: "priced", label: unpricedLabel, done: unpriced === 0, blocking: false },
  ];
}

export const canCalculate = (items: CheckItem[]) => items.every((i) => i.done || !i.blocking);

// ------------------------------------------------------------- lines ---

export const LINE_UNITS = ["kg", "t", "g", "unit", "m", "m2", "kWh", "L"];

/** Unit options for a line: the usual ones plus whatever it already uses. */
export const unitOptions = (current: string) => (LINE_UNITS.includes(current) || !current ? LINE_UNITS : [current, ...LINE_UNITS]).map((u) => ({ value: u, label: u }));

/** Tonnes for a mass quantity, or null when the unit isn't a mass. */
export function massInTonnes(qty: number | null, unit: string): number | null {
  const f = MASS_TO_KG[unit.trim().toLowerCase()];
  return qty == null || f === undefined ? null : (qty * f) / 1000;
}

/**
 * Legs whose mass follows a material line, with that mass in tonnes. A leg
 * follows a material only when exactly one material line and exactly one leg
 * share its name and the material's quantity is a mass; two suppliers of one
 * material, or a split shipment, keep their own typed masses.
 */
export function linkedPayloads(lines: Line[]): Map<string, number> {
  const count = (stage: InputStage) => {
    const m = new Map<string, Line[]>();
    for (const l of lines) {
      const k = l.name.trim().toLowerCase();
      if (l.stage === stage && k) m.set(k, [...(m.get(k) ?? []), l]);
    }
    return m;
  };
  const materials = count("A1");
  const out = new Map<string, number>();
  for (const [k, legs] of count("A2")) {
    const mats = materials.get(k);
    if (legs.length !== 1 || mats?.length !== 1) continue;
    const t = massInTonnes(mats[0].quantity, mats[0].unit);
    if (t !== null) out.set(legs[0].key, t);
  }
  return out;
}

/** Keeps each linked leg's payload equal to its material's mass, so editing a quantity moves the leg too. */
export function syncPayloads(lines: Line[]): Line[] {
  const linked = linkedPayloads(lines);
  let changed = false;
  const out = lines.map((l) => {
    const t = linked.get(l.key);
    if (t === undefined || t === l.payload_t) return l;
    changed = true;
    return { ...l, payload_t: t };
  });
  return changed ? out : lines;
}

/** Divides every material quantity by the process yield, so masses include losses. */
export function applyYield(lines: Line[], yieldPct: number): Line[] {
  if (!(yieldPct > 0 && yieldPct <= 100)) return lines;
  // Only masses scale: a count of units (a reel, a label) doesn't grow with process losses.
  return lines.map((l) => (l.stage === "A1" && l.quantity != null && massInTonnes(l.quantity, l.unit) !== null ? { ...l, quantity: Number((l.quantity / (yieldPct / 100)).toPrecision(12)) } : l));
}

export type PickerFactor = {
  id: number;
  name: string;
  geography: string | null;
  unit: string;
  value: number | null;
  source: string | null;
  year: number | null;
  recycled?: boolean;
};

/** Picker label: always the source and year; a hidden licensed value says so. */
export function factorLabel(f: PickerFactor): string {
  const origin = [f.source, f.year].filter((v) => v != null && v !== "").join(" ");
  const value = f.value === null ? "value hidden (licensed)" : `${fmtKg(f.value)} kg/${f.unit}`;
  return [f.name, f.geography, origin || "No source", value].filter(Boolean).join(" · ");
}
