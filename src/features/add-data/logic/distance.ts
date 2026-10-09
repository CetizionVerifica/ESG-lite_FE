// Distance fields and the distance drawer's numbers, moved from the legacy
// page (composite "passenger × km" fields, the Map button) and its
// DistanceCalculatorModal (road, rail estimate, air, sea with fallback).
import { isDistanceUnit, parseCompositeUnit } from "../../../lib/geo/distanceUnits";
import { convertDistanceFromMeters } from "../../../lib/geo/routing";
import { formColumns, isSelectColumn, type FormModel } from "../../../lib/emissions/form";
import type { ColumnEntity, ModalRow } from "../../../lib/emissions/types";

export type TravelMode = "road" | "rail" | "air" | "sea";

/** Rail has no routing service: road corridor, else straight line × this circuity factor. */
export const RAIL_STRAIGHT_LINE_FACTOR = 1.2;
const METERS_PER_NAUTICAL_MILE = 1852;

export type DistanceField =
  /** "passenger.km": two inputs (count × distance) whose product is the column value. */
  | { kind: "composite"; multiplier: string; distance: string }
  /** A plain distance column: the drawer's result goes straight into it. */
  | { kind: "plain" };

/**
 * Whether a column takes a distance, and how. Same rule as the legacy page:
 * spec categories (transport) put it on a column named like "distance" when
 * the unit is a distance; other categories on the first plain number column,
 * split into count × distance for composite units.
 */
export function distanceFieldFor(model: FormModel, row: ModalRow, col: ColumnEntity): DistanceField | null {
  const unit = row.activity_data_unit as string | undefined;
  if (!isDistanceUnit(unit)) return null;
  if (model.spec) return /distance/i.test(col.column_name) ? { kind: "plain" } : null;
  const first = formColumns(model).find((c) => c.column_type === "number" && !isSelectColumn(model, c));
  if (first?.pk_id !== col.pk_id) return null;
  const composite = parseCompositeUnit(unit);
  return composite ? { kind: "composite", ...composite } : { kind: "plain" };
}

export const multiplierKey = (column: string) => `${column}__multiplier`;
export const distanceKey = (column: string) => `${column}__distance`;

/** After a count or distance edit, the column holds their product (2 decimals), or "" until both are > 0. */
export function withCompositeProduct(row: ModalRow, changed: string): ModalRow {
  const base = /^(.*)__(?:multiplier|distance)$/.exec(changed)?.[1];
  if (!base) return row;
  const m = parseFloat(String(row[multiplierKey(base)] ?? ""));
  const d = parseFloat(String(row[distanceKey(base)] ?? ""));
  return { ...row, [base]: m > 0 && d > 0 ? String(Math.round(m * d * 100) / 100) : "" };
}

/** The key the drawer's distance is written to. */
export const distanceTarget = (field: DistanceField, column: string) => (field.kind === "composite" ? distanceKey(column) : column);

export interface DistanceInputs {
  /** Straight line between the two points, meters. */
  straightMeters: number | null;
  /** Road route, meters, when the routing service answered. */
  roadMeters: number | null;
  /** Sea route, meters, when the sea-route service answered. */
  seaMeters: number | null;
  /** The routing call for this mode failed. */
  failed: boolean;
}

export interface DistanceResult {
  value: number;
  /** Shown as "estimate" (rail always; sea when the route service failed). */
  estimate: boolean;
  note: string;
  nauticalMiles?: number;
}

/** The distance in the row's unit for a mode, or null while it can't be known yet. */
export function modeDistance(mode: TravelMode, inputs: DistanceInputs, unit: string): DistanceResult | null {
  const from = (meters: number | null) => (meters === null ? null : convertDistanceFromMeters(meters, unit));
  const air = from(inputs.straightMeters);
  const road = from(inputs.roadMeters);
  if (mode === "air") return air === null ? null : { value: air, estimate: false, note: "Straight line (great circle)" };
  if (mode === "road") return road === null ? null : { value: road, estimate: false, note: "Road route" };
  if (mode === "rail") {
    if (road !== null) return { value: road, estimate: true, note: "Rail estimate from the road corridor (usually within 10–15% of track distance)" };
    if (inputs.failed && air !== null) {
      return { value: Math.round(air * RAIL_STRAIGHT_LINE_FACTOR * 100) / 100, estimate: true, note: `Rail estimate: straight line × ${RAIL_STRAIGHT_LINE_FACTOR}, no road route found` };
    }
    return null;
  }
  // Sea: the route service, else straight line in nautical miles when it failed.
  const seaMeters =
    inputs.seaMeters ??
    (inputs.failed && inputs.straightMeters !== null
      ? (Math.round((inputs.straightMeters / METERS_PER_NAUTICAL_MILE) * 100) / 100) * METERS_PER_NAUTICAL_MILE
      : null);
  const sea = from(seaMeters);
  if (sea === null || seaMeters === null) return null;
  return {
    value: sea,
    estimate: inputs.seaMeters === null,
    note: inputs.seaMeters === null ? "Sea estimate: straight line, the sea-route service didn't answer" : "Sea route",
    nauticalMiles: Math.round((seaMeters / METERS_PER_NAUTICAL_MILE) * 100) / 100,
  };
}
