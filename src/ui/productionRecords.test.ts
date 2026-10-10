import { describe, expect, it } from "vitest";
import { overlapsFor, productionPeriodText, rangesOverlap } from "./productionRecords";

const rec = (id: number, start: string, end: string, status: "pending" | "approved" | "rejected" = "pending", productId = 7, siteId = 1) => ({
  production_id: id,
  status,
  start_date: start,
  end_date: end,
  product: { product_id: productId },
  site: { site_id: siteId },
});

describe("productionRecords", () => {
  it("compares inclusive day ranges", () => {
    expect(rangesOverlap("2025-09-01", "2025-09-30", "2025-09-30", "2025-10-31")).toBe(true);
    expect(rangesOverlap("2025-09-01", "2025-09-30", "2025-10-01", "2025-10-31")).toBe(false);
    expect(productionPeriodText("2025-01-01", "2025-01-31")).toBe("Jan 1 – Jan 31, 2025");
  });
  it("finds the live records a draft would overlap, never itself", () => {
    const rows = [rec(1, "2025-09-01", "2025-09-30"), rec(2, "2025-09-10", "2025-09-20", "rejected"), rec(3, "2025-09-01", "2025-09-30", "approved", 8), rec(4, "2025-09-01", "2025-09-30", "approved", 7, 2)];
    const draft = { siteId: 1, productId: 7, start: "2025-09-15", end: "2025-10-15" };
    expect(overlapsFor(rows, draft).map((r) => r.production_id)).toEqual([1]);
    expect(overlapsFor(rows, { ...draft, exceptId: 1 })).toEqual([]);
    expect(overlapsFor(rows, { ...draft, end: "2025-09-01" })).toEqual([]);
  });
});
