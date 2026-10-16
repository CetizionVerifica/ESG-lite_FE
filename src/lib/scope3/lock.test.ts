import { describe, expect, it } from "vitest";
import type { PeriodLockCategory, PeriodLockStatus } from "./contracts";
import { categoryDone, categoryMissing, gridCellOpen, gridCellText, leftReasonLabel, lockGate, readPeriodLockStatus, siteCompleteness, unlockReasonError } from "./lock";

const cat = (over: Partial<Omit<PeriodLockCategory, "counts">> & { counts?: Partial<PeriodLockCategory["counts"]> } = {}): PeriodLockCategory => ({
  category_id: 1,
  category_name: "Diesel",
  scope: "Scope 1",
  nothing_this_month: false,
  ...over,
  counts: { draft: 0, pending: 0, approved: 0, rejected: 0, ...over.counts },
});

const status = (over: Partial<PeriodLockStatus> = {}): PeriodLockStatus => ({
  year: 2026,
  month: 9,
  sites: [
    { site_id: 1, name: "Hidd plant", locked: false, lock: null, categories: [] },
    { site_id: 2, name: "Sitra yard", locked: false, lock: null, categories: [] },
  ],
  scope3: [],
  left: [],
  ...over,
});

describe("lock completeness (S3-15)", () => {
  it("counts a category done when every row is approved, or it's marked nothing this month", () => {
    expect(categoryDone(cat({ counts: { approved: 2 } }))).toBe(true);
    expect(categoryDone(cat({ counts: { approved: 2, pending: 1 } }))).toBe(false);
    expect(categoryDone(cat({ counts: { draft: 1 } }))).toBe(false);
    expect(categoryDone(cat())).toBe(false);
    expect(categoryDone(cat({ nothing_this_month: true }))).toBe(true);
    expect(categoryMissing(cat())).toBe(true);
    expect(categoryMissing(cat({ nothing_this_month: true }))).toBe(false);
    expect(categoryMissing(cat({ counts: { draft: 1 } }))).toBe(false);
  });

  it("sums a site's rows by status", () => {
    const site = { site_id: 1, name: "Hidd", locked: false, lock: null, categories: [cat({ counts: { approved: 1 } }), cat({ counts: { draft: 2, pending: 1 } }), cat(), cat({ nothing_this_month: true })] };
    expect(siteCompleteness(site)).toEqual({ done: 2, owed: 4, draft: 2, pending: 1, rejected: 0, missing: 1, nothing: 1 });
  });

  it("disables Lock while the server lists items left, with the count as the reason", () => {
    const left = [
      { site_id: 1, site_name: "Hidd plant", category_id: 2, category_name: "LPG", reason: "missing" },
      { site_id: 1, site_name: "Hidd plant", category_id: 3, category_name: "Grid", reason: "pending" },
    ];
    expect(lockGate(status({ left }), [1, 2])).toEqual({ canLock: false, reason: "2 items are left before you can lock." });
    expect(lockGate(status({ left: left.slice(0, 1) }), [1])).toEqual({ canLock: false, reason: "1 item is left before you can lock." });
    // Items on another site don't hold this one back.
    expect(lockGate(status({ left }), [2])).toEqual({ canLock: true, reason: null });
    expect(lockGate(status(), [1, 2])).toEqual({ canLock: true, reason: null });
  });

  it("says when there is nothing to lock", () => {
    const locked = status({ sites: [{ site_id: 1, name: "Hidd plant", locked: true, lock: null, categories: [] }] });
    expect(lockGate(locked, [1])).toEqual({ canLock: false, reason: "This month is locked." });
    expect(lockGate(status(), [])).toEqual({ canLock: false, reason: "No sites to lock." });
  });

  it("words each left reason and keeps an unknown one readable", () => {
    expect(leftReasonLabel("draft")).toBe("Drafts not submitted");
    expect(leftReasonLabel("scope3_no_data")).toMatch(/no data this month/);
    expect(leftReasonLabel("factor_missing")).toBe("factor missing");
  });

  it("reads the Scope 3 grid cell: boundary status and data, open only when included without data", () => {
    expect(gridCellText({ n: 1, status: "included", has_data: false })).toEqual({ status: "Included", data: "No data" });
    expect(gridCellText({ n: 4, status: "excluded", has_data: false }).data).toBe("Not needed");
    expect(gridCellText({ n: 9, status: null, has_data: false }).status).toBe("Not set");
    expect(gridCellOpen({ n: 1, status: "included", has_data: false })).toBe(true);
    expect(gridCellOpen({ n: 1, status: "included", has_data: true })).toBe(false);
    expect(gridCellOpen({ n: 6, status: "screening", has_data: false })).toBe(false);
  });

  it("needs a reopen reason of at least 5 characters", () => {
    expect(unlockReasonError("   late ")).toMatch(/at least 5/);
    expect(unlockReasonError("Late invoice")).toBeNull();
  });
});

describe("readPeriodLockStatus", () => {
  it("cleans the API answer: 15 grid cells, ids or objects for site and category, reopened locks dropped", () => {
    const s = readPeriodLockStatus(
      {
        year: 2026,
        month: 9,
        sites: [
          { site_id: 1, name: "Hidd", lock: { company_id: 1, site_id: 1, year: 2026, month: 9, locked_by: 4, locked_at: "2026-10-11T00:00:00Z" }, categories: [{ category_id: 1, category_name: "Diesel", counts: { approved: "2" } }] },
          { site_id: 2, name: "Sitra", locked: false, lock: { year: 2026, month: 9, locked_at: "x", reopened_at: "y" } },
        ],
        scope3: [{ n: 1, status: "included", has_data: true }, { n: 99, status: "included" }],
        left: [{ site: { site_id: 2, name: "Sitra" }, category: { category_id: 5, name: "Waste" }, reason: "missing" }],
      },
      { year: 2026, month: 9 },
    );
    expect(s.sites[0]).toMatchObject({ locked: true, categories: [{ counts: { draft: 0, pending: 0, approved: 2, rejected: 0 } }] });
    expect(s.sites[1]).toMatchObject({ locked: false, lock: null, categories: [] });
    expect(s.scope3).toHaveLength(15);
    expect(s.scope3[0]).toEqual({ n: 1, status: "included", has_data: true });
    expect(s.scope3[1]).toEqual({ n: 2, status: null, has_data: false });
    expect(s.left).toEqual([{ site_id: 2, site_name: "Sitra", category_id: 5, category_name: "Waste", ghg_category: null, reason: "missing" }]);
  });

  it("falls back to the asked month and empty lists on an empty answer", () => {
    expect(readPeriodLockStatus(null, { year: 2026, month: 8 })).toMatchObject({ year: 2026, month: 8, sites: [], left: [] });
  });
});
