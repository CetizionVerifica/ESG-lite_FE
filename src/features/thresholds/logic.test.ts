import { describe, expect, it } from "vitest";
import { buildRows, effectiveValue, matchesFilters, snapPct, toKind, validateThreshold } from "./logic";

const companies = [
  { company_id: 2, name: "Gulf Foods" },
  { company_id: 1, name: "Midal Cables", status: false },
];

describe("buildRows", () => {
  it("gives every client a row, sorted, with decimals parsed from strings", () => {
    const rows = buildRows(companies, [
      { threshold_id: 9, threshold_percentage: "3.50", updated_at: "2026-10-01T00:00:00Z", company: { company_id: 2, name: "Gulf Foods" } },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Gulf Foods", "Midal Cables"]);
    expect(rows[0].threshold).toEqual({ id: 9, value: 3.5, updated_at: "2026-10-01T00:00:00Z" });
    expect(rows[1]).toMatchObject({ active: false, threshold: null });
    expect(effectiveValue(rows[1])).toBe(5);
  });

  it("keeps a threshold whose client is missing from the list, and the newest of duplicates", () => {
    const rows = buildRows(companies, [
      { threshold_id: 1, threshold_percentage: 2, updated_at: "2026-01-01", company: { company_id: 2, name: "Gulf Foods" } },
      { threshold_id: 2, threshold_percentage: 4, updated_at: "2026-05-01", company: { company_id: 2, name: "Gulf Foods" } },
      { threshold_id: 3, threshold_percentage: 3, company: { company_id: 7, name: "Acme" } },
      { threshold_id: 4, threshold_percentage: 3, company: null },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Acme", "Gulf Foods", "Midal Cables"]);
    expect(rows[1].threshold?.id).toBe(2);
  });
});

describe("validateThreshold", () => {
  it("accepts 2.00–5.00 with two decimals", () => {
    expect(validateThreshold(2)).toBeUndefined();
    expect(validateThreshold(5)).toBeUndefined();
    expect(validateThreshold(3.27)).toBeUndefined();
  });
  it("rejects empty, out-of-range and over-precise values", () => {
    expect(validateThreshold(null)).toMatch(/between 2% and 5%/);
    expect(validateThreshold(1.99)).toMatch(/between/);
    expect(validateThreshold(5.01)).toMatch(/between/);
    expect(validateThreshold(3.125)).toBe("Use at most two decimals.");
  });
  it("snaps float noise from arrow steps but keeps real extra decimals", () => {
    expect(snapPct(2.0300000000000002)).toBe(2.03);
    expect(snapPct(3.125)).toBe(3.125);
    expect(snapPct(null)).toBeNull();
  });
});

describe("filters", () => {
  const [gulf, midal] = buildRows(companies, [{ threshold_id: 1, threshold_percentage: 3, company: { company_id: 2, name: "Gulf Foods" } }]);
  it("filters by custom/default and search", () => {
    expect(matchesFilters(gulf, { q: "", kind: "custom" })).toBe(true);
    expect(matchesFilters(midal, { q: "", kind: "custom" })).toBe(false);
    expect(matchesFilters(midal, { q: "", kind: "default" })).toBe(true);
    expect(matchesFilters(midal, { q: "mid", kind: null })).toBe(true);
    expect(matchesFilters(gulf, { q: "mid", kind: null })).toBe(false);
  });
  it("reads only known kinds from the URL", () => {
    expect(toKind(["custom"])).toBe("custom");
    expect(toKind(["x"])).toBeNull();
    expect(toKind(undefined)).toBeNull();
  });
});
