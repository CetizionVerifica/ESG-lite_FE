// S3-6: the Supplier field on Category 1 and 2 rows, "Supplier's own figure"
// and "Supplier's energy and materials". The figures come from /suppliers; the
// preview mirrors the engine (src/lib/emissions/emissionCalc.ts) and is never
// sent: the server calculates every total.
import {
  type EmissionCalcInput,
  type EmissionCalculator,
  type HybridLineInput,
  type HybridLineKind,
  ROW_METHOD_COLUMN,
  hybridEmission,
  pickFacility,
  pickSupplierFigure,
  supplierEmission,
} from "../../../lib/emissions/emissionCalc";
import type { SupplierDetail, SupplierFigure } from "../../../services/scope3SuppliersService";
import type { ModalRow } from "../types";

/** The two methods that read a supplier's own figures. */
export const SUPPLIER_METHODS = ["supplier_specific", "hybrid"] as const;
export type SupplierMethod = (typeof SUPPLIER_METHODS)[number];

/** Private row state (never in activity_data): which supplier, which figure, the hybrid lines and what was paid. */
export const SUPPLIER_ROW_KEYS = ["_supplier_id", "_supplier_factor_id", "_inputs", "_purchased_value"] as const;

/** Categories 1 and 2 (purchased goods, capital goods) get the Supplier field. */
export const hasSupplierField = (ghg: number | null | undefined) => ghg === 1 || ghg === 2;

export const supplierMethodOf = (row: ModalRow): SupplierMethod | null => {
  const m = row[ROW_METHOD_COLUMN];
  return m === "supplier_specific" || m === "hybrid" ? m : null;
};

export const supplierIdOf = (row: ModalRow): number | null => {
  const n = Number(row._supplier_id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const figureIdOf = (row: ModalRow): number | null => {
  const n = Number(row._supplier_factor_id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const HYBRID_LINE_KINDS: readonly HybridLineKind[] = ["energy", "material", "transport", "waste"];
export const LINE_KIND_LABEL: Record<HybridLineKind, string> = { energy: "Supplier's energy", material: "Material", transport: "Transport", waste: "Waste" };

export type DraftLine = { kind: HybridLineKind; name: string; quantity: string; unit: string };

export const linesOf = (row: ModalRow): DraftLine[] => (Array.isArray(row._inputs) ? (row._inputs as DraftLine[]) : []);

/** Complete lines as the engine takes them; incomplete ones are left out of the preview and refused on save. */
export const engineLines = (lines: DraftLine[]): HybridLineInput[] =>
  lines.map((l) => ({ kind: l.kind, name: l.name.trim(), quantity: Number(l.quantity), unit: l.unit.trim() }));

export const lineProblem = (lines: DraftLine[]): string | null => {
  const i = lines.findIndex((l) => !l.name.trim() || !(Number(l.quantity) > 0) || !l.unit.trim());
  return i === -1 ? null : `Complete line ${i + 1}: factor, quantity and unit`;
};

export const NO_FIGURE_HINT = "No figure from this supplier yet. Request one or use an average.";

const PICK_MESSAGE: Record<"none_for_year" | "not_found" | "ambiguous" | "future_year", string> = {
  not_found: NO_FIGURE_HINT,
  none_for_year: "This supplier has no figure from this year or earlier. Request one or use an average.",
  ambiguous: "Choose which of the supplier's figures this is",
  future_year: "That figure is from after this period",
};

/** The figure a row would use, or why there is none. */
export function figureFor(row: ModalRow, detail: SupplierDetail | undefined, reportingYear: number): { figure: SupplierFigure | null; message: string | null } {
  if (!detail) return { figure: null, message: null };
  const pick = pickSupplierFigure(detail.factors, reportingYear, row.emission_category, figureIdOf(row));
  return pick.ok ? { figure: pick.figure, message: null } : { figure: null, message: PICK_MESSAGE[pick.reason] };
}

/**
 * The page's calculator, with supplier-specific and hybrid rows worked out
 * from the supplier's figures. Every other row goes to `calc` unchanged.
 */
export function withSuppliers(calc: EmissionCalculator, input: EmissionCalcInput, details: Map<number, SupplierDetail>, reportingYear: number): EmissionCalculator {
  const calculateEmission = (row: ModalRow) => {
    const method = supplierMethodOf(row);
    if (!method) return calc.calculateEmission(row);
    if (!row.emission_category) return { value: null, status: "Select emission category" };
    const id = supplierIdOf(row);
    if (!id) return { value: null, status: "Choose the supplier" };
    const detail = details.get(id);
    if (!detail) return { value: null, status: "Loading the supplier's figures" };
    const activity = calc.findActivityValue(row);
    if (method === "supplier_specific") {
      const { figure, message } = figureFor(row, detail, reportingYear);
      if (!figure) return { value: null, status: message ?? NO_FIGURE_HINT };
      const r = supplierEmission(activity, row.activity_data_unit, figure);
      return { value: r.value, status: r.status };
    }
    const lines = linesOf(row);
    const problem = lineProblem(lines);
    if (problem) return { value: null, status: problem };
    const paid = row._purchased_value === undefined || row._purchased_value === "" ? null : Number(row._purchased_value);
    const r = hybridEmission(input, { activityValue: activity, unit: row.activity_data_unit, facility: pickFacility(detail.facility_data, reportingYear), lines: engineLines(lines), purchasedValue: paid });
    return { value: r.value, status: r.status };
  };
  return { ...calc, calculateEmission };
}

/** What a row adds to the createEmission body: the supplier, the figure, the method, and hybrid inputs in extra_data. */
export function supplierPayload(row: ModalRow): { supplier_id?: number; supplier_factor_id?: number; method?: SupplierMethod; extra?: Record<string, unknown> } {
  const supplier_id = supplierIdOf(row) ?? undefined;
  const method = supplierMethodOf(row) ?? undefined;
  const out: ReturnType<typeof supplierPayload> = {};
  if (supplier_id) out.supplier_id = supplier_id;
  if (method) out.method = method;
  if (method === "supplier_specific" && figureIdOf(row)) out.supplier_factor_id = figureIdOf(row) as number;
  if (method === "hybrid") {
    const paid = row._purchased_value === undefined || row._purchased_value === "" ? null : Number(row._purchased_value);
    out.extra = { inputs: engineLines(linesOf(row)), ...(paid !== null && paid > 0 ? { purchased_value: paid } : {}) };
  }
  return out;
}
