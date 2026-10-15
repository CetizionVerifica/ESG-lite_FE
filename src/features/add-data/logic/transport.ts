// S3-8 · Transport and distribution (Cat 4, 9): helper copy for the per-unit
// methods, the "Who paid?" hint, and the estimated-distance flag.
// The forms themselves come from the backend config (src/scope3/transport/configs.ts).
import { normalizeUnitKey } from "../hooks/emissionCalc";
import type { CalculationSpec, ModalRow } from "../types";

/** What each S3-8 unit key asks for (guidance formulas 4.1, 4.6, 4.8, 4.9). */
export const TRANSPORT_UNIT_HELP: Record<string, string> = {
  "tonne.km": "Weight × distance, one row per leg.",
  km: "Distance of the trip.",
  litre: "Litres your carrier used for your goods, × your share of the load (100 = only your goods).",
  kwh: "Energy of the warehouse × your share of its volume (100 = used only by you).",
  kg: "Refrigerant leaked from the refrigerated vehicle or warehouse, × your share.",
  "m3.day": "Volume stored × days stored.",
  "pallet.day": "Pallets stored × days stored.",
  "teu.day": "Containers (TEU) stored × days stored.",
};

/** A transport or warehousing form: a per-unit spec that keeps the tonne.km method. */
export const isTransportSpec = (spec: CalculationSpec | null | undefined): spec is CalculationSpec =>
  !!spec && spec.mode === "per_unit" && "tonne.km" in spec.methods;

/** Help under the Unit select for a transport form, or undefined. */
export function transportUnitHelp(spec: CalculationSpec | null | undefined, unit: unknown): string | undefined {
  if (!isTransportSpec(spec)) return undefined;
  const key = normalizeUnitKey(unit);
  return key in spec.methods ? TRANSPORT_UNIT_HELP[key] : undefined;
}

/** The extra field "Who paid for this transport?" (stored in extra_data.paid_by). */
export const PAID_BY_KEY = "paid_by";
export const PAID_BY_HELP = "If you paid for it, it belongs in Category 4. Category 9 is only transport after the sale that you didn't pay for.";

/**
 * The distance drawer marks the value it put in a field as estimated (rail,
 * or sea when the route service didn't answer). The row sends
 * `is_estimate: true` only while that field still holds that value: typing
 * over it makes the row a measured distance again.
 */
export type DistanceEstimate = { column: string; value: string };

export const markEstimate = (row: ModalRow, column: string, value: string, estimate: boolean): ModalRow => {
  if (estimate) return { ...row, _estimate: { column, value } satisfies DistanceEstimate };
  const next = { ...row };
  delete next._estimate;
  return next;
};

export const isEstimatedRow = (row: ModalRow): boolean => {
  const e = row._estimate as DistanceEstimate | undefined;
  return !!e && typeof e.column === "string" && String(row[e.column] ?? "") === e.value;
};
