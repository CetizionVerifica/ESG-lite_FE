import { getCanonicalDistanceUnit } from "../utils/distanceUnits";

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJSON.LineString;
}

const OSRM_BASE =
  import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org";

export async function getRoute(
  start: [number, number], // [lat, lon]
  end: [number, number], // [lat, lon]
): Promise<RouteResult> {
  // OSRM expects coordinates as lon,lat
  const coords = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=simplified&geometries=geojson&steps=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Route calculation failed");

  const data = await res.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error("No route found between the selected locations");
  }

  const route = data.routes[0];
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry,
  };
}

const METERS_TO: Record<string, number> = {
  m: 1,
  km: 0.001,
  mile: 0.000621371,
};

export function convertDistanceFromMeters(
  meters: number,
  targetUnit: string,
): number {
  const canonical = getCanonicalDistanceUnit(targetUnit);
  if (!canonical) return meters;
  const factor = METERS_TO[canonical] ?? 1;
  return Math.round(meters * factor * 100) / 100;
}

/**
 * Haversine formula — instant straight-line distance between two coordinates.
 * No API call needed. Returns distance in meters.
 */
export function haversineDistanceMeters(
  start: [number, number], // [lat, lon]
  end: [number, number],
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(end[0] - start[0]);
  const dLon = toRad(end[1] - start[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(start[0])) *
      Math.cos(toRad(end[0])) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}
