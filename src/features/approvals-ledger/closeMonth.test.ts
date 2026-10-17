import { describe, expect, it } from "vitest";
import type { LockLeftItem, PeriodLockStatus } from "../../lib/scope3/contracts";
import { closeMonth, leftItemName, leftLink, lockBodies, sitesInView, unlockTarget } from "./closeMonth";

const lock = (site_id: number | null) => ({ company_id: 1, site_id, year: 2026, month: 9, locked_by: 4, locked_at: "2026-10-11T00:00:00Z" });
const status: PeriodLockStatus = {
  year: 2026,
  month: 9,
  sites: [
    { site_id: 1, name: "Hidd", locked: false, lock: null, categories: [] },
    { site_id: 2, name: "Sitra", locked: true, lock: lock(2), categories: [] },
    { site_id: 3, name: "Askar", locked: false, lock: null, categories: [] },
  ],
  scope3: [],
  left: [],
};

describe("Close month (S3-15)", () => {
  it("closes the ?period= month, else the month just due", () => {
    expect(closeMonth({ kind: "month", year: 2026, month: 9 }, new Date(2026, 9, 16))).toEqual({ year: 2026, month: 9, key: "2026-09" });
    expect(closeMonth(null, new Date(2026, 0, 5))).toEqual({ year: 2025, month: 12, key: "2025-12" });
    expect(closeMonth({ kind: "cy", year: 2026 }, new Date(2026, 9, 16)).key).toBe("2026-09");
  });

  it("locks the whole company in one call for an Admin with no site chip, else each open site", () => {
    expect(lockBodies("Admin", status, [])).toEqual([{ site_id: null, year: 2026, month: 9 }]);
    expect(lockBodies("Superadmin", status, [1])).toEqual([{ site_id: 1, year: 2026, month: 9 }]);
    expect(lockBodies("Manager", status, [])).toEqual([
      { site_id: 1, year: 2026, month: 9 },
      { site_id: 3, year: 2026, month: 9 },
    ]);
    expect(lockBodies("Manager", status, [2])).toEqual([]);
    expect(sitesInView(status, [1, 3]).map((s) => s.name)).toEqual(["Hidd", "Askar"]);
  });

  it("reopens through the lock that holds the site (its own or the company's)", () => {
    expect(unlockTarget(status.sites[1], status)).toEqual({ site_id: 2, year: 2026, month: 9 });
    expect(unlockTarget({ ...status.sites[0], locked: true, lock: lock(null) }, status)).toEqual({ site_id: null, year: 2026, month: 9 });
  });

  it("links each left item to where it's fixed", () => {
    const item = (reason: string, over: Partial<LockLeftItem> = {}): LockLeftItem => ({ site_id: 1, site_name: "Hidd", category_id: 4, category_name: "Petrol", reason, ...over });
    expect(leftLink(item("pending"), "2026-09")).toEqual({ to: "/data/approvals?site=1&category=4&period=2026-09", label: "Review" });
    expect(leftLink(item("rejected"), "2026-09")?.to).toBe("/data/ledger?site=1&category=4&period=2026-09&status=rejected");
    expect(leftLink(item("missing"), "2026-09")?.to).toBe("/data/new?site=1&category=4&period=2026-09");
    expect(leftLink(item("draft"), "2026-09")).toBeNull();
    expect(leftLink(item("scope3_no_data", { category_id: null, category_name: null, ghg_category: 4 }), "2026-09")).toEqual({ to: "/settings/scope3", label: "Scope 3 boundary" });
    expect(leftItemName(item("scope3_no_data", { category_id: null, category_name: null, ghg_category: 4 }), (n) => `Category ${n}`)).toBe("Category 4");
    expect(leftItemName(item("missing"), (n) => `Category ${n}`)).toBe("Petrol");
  });
});
