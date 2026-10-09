import { describe, expect, it } from "vitest";
import {
  type ProductionRow,
  editErrors,
  editPayload,
  effectiveStatus,
  emptyTitle,
  intensityImpact,
  matchesSearch,
  monthsText,
  overlapsById,
  periodText,
  shortRange,
  unitChoices,
} from "./logic";

function row(over: Partial<ProductionRow> = {}): ProductionRow {
  return {
    production_id: 1,
    quantity: 4200,
    unit: "t",
    start_date: "2025-09-01",
    end_date: "2025-09-30",
    status: "pending",
    product: { product_id: 7, name: "Wire rod", unit: "t" },
    site: { site_id: 1, name: "Hidd" },
    created_by: { user_id: 3, name: "Omar" },
    created_at: "2025-10-02T08:00:00Z",
    updated_at: "2025-10-02T08:00:00Z",
    ...over,
  };
}

describe("dates", () => {
  it("writes periods as in the spec", () => {
    expect(periodText("2025-01-01", "2025-01-31")).toBe("Jan 1 – Jan 31, 2025");
    expect(periodText("2024-12-15T00:00:00.000Z", "2025-01-14T00:00:00.000Z")).toBe("Dec 15, 2024 – Jan 14, 2025");
    expect(shortRange("2025-02-01", "2025-02-15")).toBe("Feb 1–15");
    expect(shortRange("2025-01-20", "2025-02-05")).toBe("Jan 20 – Feb 5");
    expect(monthsText("2025-09-01", "2025-09-30")).toBe("Sep 2025");
    expect(monthsText("2025-01-01", "2025-03-31")).toBe("Jan – Mar 2025");
  });
});

describe("overlapsById", () => {
  it("flags the same product on the same site with overlapping dates", () => {
    const a = row({ production_id: 1, start_date: "2025-02-01", end_date: "2025-02-28" });
    const b = row({ production_id: 2, start_date: "2025-02-01", end_date: "2025-02-15" });
    const otherSite = row({ production_id: 3, site: { site_id: 2, name: "Sitra" } });
    const otherProduct = row({ production_id: 4, product: { product_id: 8, name: "Cable", unit: "t" }, start_date: "2025-02-10", end_date: "2025-02-12" });
    const rejected = row({ production_id: 5, status: "rejected", start_date: "2025-02-10", end_date: "2025-02-12" });
    const touching = row({ production_id: 6, start_date: "2025-03-01", end_date: "2025-03-31" });
    const o = overlapsById([a, b, otherSite, otherProduct, rejected, touching]);
    expect(o.get(1)).toEqual(["Feb 1–15"]);
    expect(o.get(2)).toEqual(["Feb 1–28"]);
    expect(o.has(3)).toBe(false);
    expect(o.has(4)).toBe(false);
    expect(o.has(5)).toBe(false);
    expect(o.has(6)).toBe(false);
  });
});

describe("intensityImpact", () => {
  const base = { quantity: 4200, unit: "t", start: "2025-09-01", end: "2025-09-30" };

  it("shows before → after for a pending record", () => {
    const i = intensityImpact({ ...base, status: "pending", emissions: 92400, production: 42000 });
    expect(i.before).toBeCloseTo(2.2);
    expect(i.after).toBeCloseTo(2.0);
    expect(i.text).toBe("Approving adds 4,200 t to Sep 2025; intensity 2.20 → 2.00 tCO₂e/t.");
  });

  it("shows the figure without it for an approved record", () => {
    const i = intensityImpact({ ...base, status: "approved", emissions: 92400, production: 46200 });
    expect(i.after).toBeCloseTo(2.0);
    expect(i.before).toBeCloseTo(2.2);
  });

  it("has no figure when nothing else is approved", () => {
    expect(intensityImpact({ ...base, status: "pending", emissions: 100, production: 0 }).before).toBeNull();
    expect(intensityImpact({ ...base, status: "approved", emissions: 100, production: 4200 }).before).toBeNull();
    expect(intensityImpact({ ...base, status: "pending", emissions: 0, production: 0 }).text).toMatch(/no approved emissions in Sep 2025/);
    expect(intensityImpact({ ...base, status: "rejected", emissions: 1, production: 1 }).text).toMatch(/isn't counted/);
  });
});

describe("edit", () => {
  const ok = { quantity: 10, unit: "t", start: "2025-09-01", end: "2025-09-30", notes: " n ", reason: "Typo in invoice" };

  it("requires a positive quantity, ordered dates and a reason", () => {
    expect(editErrors(ok)).toEqual({});
    const e = editErrors({ ...ok, quantity: 0, end: "2025-08-31", reason: "x" });
    expect(Object.keys(e).sort()).toEqual(["end", "quantity", "reason"]);
    expect(editErrors({ ...ok, quantity: null }).quantity).toBeDefined();
  });

  it("sends the reason and trimmed notes", () => {
    expect(editPayload(ok)).toEqual({ quantity: 10, unit: "t", start_date: "2025-09-01", end_date: "2025-09-30", notes: "n", reason: "Typo in invoice" });
  });

  it("offers the product unit, plus an old free-text unit", () => {
    expect(unitChoices(row())).toEqual(["t"]);
    expect(unitChoices(row({ unit: "tonnes" }))).toEqual(["t", "tonnes"]);
  });
});

describe("small helpers", () => {
  it("searches product, site, submitter and notes", () => {
    expect(matchesSearch(row({ notes: "Line 2 shutdown" }), "shutdown")).toBe(true);
    expect(matchesSearch(row(), "hidd")).toBe(true);
    expect(matchesSearch(row(), "sitra")).toBe(false);
    expect(matchesSearch(row(), "  ")).toBe(true);
  });

  it("prefers the optimistic status", () => {
    expect(effectiveStatus(row(), new Map([[1, "approved"]]))).toBe("approved");
    expect(effectiveStatus(row(), new Map())).toBe("pending");
  });

  it("names the filters in the empty state", () => {
    expect(emptyTitle(["Hidd", null, "Pending", "Sep 2025"])).toBe("No production data for Hidd, Pending, Sep 2025");
    expect(emptyTitle([])).toBe("No production data yet");
  });
});
