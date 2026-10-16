import { describe, expect, it } from "vitest";
import { distanceFieldOf, tripDistance } from "./travel";

describe("trip calculator (S3-9)", () => {
  it("doubles the one-way distance and multiplies by days and people", () => {
    // Golden 7.1, employee A: 10 km × 2 × (5 days × 48 weeks) × 1 = 4,800 km
    expect(tripDistance(10, 240, 1)).toBe(4800);
    expect(tripDistance(12.5, 220, 3)).toBe(16500);
  });
  it("waits for every input", () => {
    expect(tripDistance(null, 240, 1)).toBeNull();
    expect(tripDistance(10, 0, 1)).toBeNull();
    expect(tripDistance(10, 240, null)).toBeNull();
  });
  it("finds the distance field of a method", () => {
    expect(distanceFieldOf({ multiply: ["Total distance (km)", "Total employees"], divide: ["Employees surveyed"] })).toBe("Total distance (km)");
    expect(distanceFieldOf({ multiply: ["Fuel used (litres)"] })).toBeNull();
    expect(distanceFieldOf(undefined)).toBeNull();
  });
});
