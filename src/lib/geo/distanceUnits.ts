const DISTANCE_UNITS = new Set([
  "m",
  "km",
  "mi",
  "mile",
  "miles",
  "meter",
  "meters",
  "metre",
  "metres",
  "kilometer",
  "kilometers",
  "kilometre",
  "kilometres",
]);

export function isDistanceUnit(unitName: string | undefined): boolean {
  if (!unitName) return false;
  const lower = unitName.toLowerCase().trim();
  if (DISTANCE_UNITS.has(lower)) return true;
  // Composite units like "passenger.km", "tonne.km" — check if any part is a distance unit
  if (lower.includes(".")) {
    return lower.split(".").some((part) => DISTANCE_UNITS.has(part.trim()));
  }
  return false;
}

const CANONICAL_MAP: Record<string, string> = {
  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  km: "km",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",
  mi: "mile",
  mile: "mile",
  miles: "mile",
};

/**
 * Parses composite units like "passenger.km" or "tonne.km".
 * Returns { multiplier, distance } or null for plain units.
 */
export function parseCompositeUnit(
  unitName: string | undefined,
): { multiplier: string; distance: string } | null {
  if (!unitName) return null;
  const lower = unitName.toLowerCase().trim();
  if (!lower.includes(".")) return null;

  const parts = lower.split(".");
  if (parts.length !== 2) return null;

  const [a, b] = parts.map((p) => p.trim());

  // figure out which part is the distance component
  if (DISTANCE_UNITS.has(b)) return { multiplier: a, distance: b };
  if (DISTANCE_UNITS.has(a)) return { multiplier: b, distance: a };
  return null;
}

export function getCanonicalDistanceUnit(unitName: string): string | null {
  const lower = unitName.toLowerCase().trim();
  if (CANONICAL_MAP[lower]) return CANONICAL_MAP[lower];
  // Composite units — find the distance part
  if (lower.includes(".")) {
    for (const part of lower.split(".")) {
      const canonical = CANONICAL_MAP[part.trim()];
      if (canonical) return canonical;
    }
  }
  return null;
}
