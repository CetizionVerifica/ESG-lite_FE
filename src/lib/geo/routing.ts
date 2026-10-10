// Distance helpers shared by the legacy page (via services/routingService) and
// Add data's distance drawer. Moved unchanged from services/routingService.ts.
import { getCanonicalDistanceUnit } from "./distanceUnits";

const METERS_TO: Record<string, number> = {
  m: 1,
  km: 0.001,
  mile: 0.000621371,
};

export function convertDistanceFromMeters(meters: number, targetUnit: string): number | null {
  const canonical = getCanonicalDistanceUnit(targetUnit);
  if (!canonical || !(canonical in METERS_TO)) return null;
  const factor = METERS_TO[canonical];
  return Math.round(meters * factor * 100) / 100;
}

/** Haversine formula: straight-line distance between two [lat, lon] points, in meters. */
export function haversineDistanceMeters(start: [number, number], end: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(end[0] - start[0]);
  const dLon = toRad(end[1] - start[1]);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(start[0])) * Math.cos(toRad(end[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
