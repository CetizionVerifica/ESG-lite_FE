// S3-9 business travel (Category 6) and employee commuting (Category 7):
// copy and the add-data trip calculator. Activity prep only: the engine
// (ESG-lite emissionWrite) calculates every total.
import type { MethodCalculation } from "../emissions/types";

/** Shown under a Category 6 row's first select (the trip mode). */
export const TRAVEL_MODE_NOTE = "Company-owned cars go in Scope 1 (fuel); leased cars in Category 8.";

/** One-way km × 2 (there and back) × days × people, or null until all three are above 0. */
export function tripDistance(oneWayKm: number | null, days: number | null, people: number | null): number | null {
  if (!oneWayKm || !days || !people || oneWayKm < 0 || days < 0 || people < 0) return null;
  return Number((oneWayKm * 2 * days * people).toFixed(6));
}

/** The distance field a method multiplies (Total distance (km) on the standard commuting form). */
export const distanceFieldOf = (method: MethodCalculation | undefined): string | null =>
  method?.multiply.find((f) => /distance/i.test(f)) ?? null;
