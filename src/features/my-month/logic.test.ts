import { describe, expect, it } from "vitest";
import type { MyMonthCategory, MyMonthResponse } from "../../services/myMonthService";
import {
  addDataLink,
  dueState,
  entriesLink,
  entriesSummary,
  glance,
  groupByScope,
  hasNoAssignments,
  monthTitle,
  progress,
  rowMark,
  scopeNumber,
  sentBack,
  shiftMonth,
  visibleCategories,
  yearlyLabel,
} from "./logic";

const cat = (over: Partial<MyMonthCategory> = {}): MyMonthCategory => ({
  category_id: 1,
  category_name: "Diesel",
  scope: "Scope 1",
  status: "todo",
  filing: null,
  year_type: null,
  period: null,
  entries: { total: 0, pending: 0, approved: 0, rejected: 0 },
  total_emission: 0,
  last_entry_at: null,
  rejections: [],
  ...over,
});

const month = (categories: MyMonthCategory[], over: Partial<MyMonthResponse> = {}): MyMonthResponse => ({
  month: "2025-09",
  due_date: "2025-10-10",
  escalation_date: "2025-10-15",
  summary: { total: 0, due: 0, done: 0, pending: 0, rejected: 0 },
  sites: [{ site_id: 7, name: "Hidd plant", categories }],
  ...over,
});

describe("scope groups", () => {
  it("reads free-text scopes", () => {
    expect(scopeNumber("Scope 2")).toBe(2);
    expect(scopeNumber("3")).toBe(3);
    expect(scopeNumber(null)).toBeNull();
    expect(scopeNumber("Other")).toBeNull();
  });

  it("orders scopes 1-3 then Other, rejected first inside a group", () => {
    const groups = groupByScope([
      cat({ category_id: 1, category_name: "LPG", scope: "Scope 1", status: "approved" }),
      cat({ category_id: 2, category_name: "Water", scope: null }),
      cat({ category_id: 3, category_name: "Grid electricity", scope: "Scope 2", status: "pending" }),
      cat({ category_id: 4, category_name: "Diesel", scope: "Scope 1", status: "rejected" }),
      cat({ category_id: 5, category_name: "Petrol", scope: "Scope 1", status: "todo" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Scope 1", "Scope 2", "Other"]);
    expect(groups[0].categories.map((c) => c.category_name)).toEqual(["Diesel", "Petrol", "LPG"]);
  });
});

describe("links", () => {
  it("deep-links a monthly row to Add data with site, category and month", () => {
    expect(addDataLink(7, cat({ category_id: 12 }), "2025-09")).toBe("/data/new?site=7&category=12&period=2025-09");
    expect(entriesLink(7, cat({ category_id: 12 }), "2025-09")).toBe("/data/mine?site=7&category=12&period=2025-09");
  });

  it("uses the yearly period for a yearly filing", () => {
    const fy = cat({ filing: "yearly", year_type: "FY", period: { start: "2025-04-01", end: "2026-03-31" } });
    expect(addDataLink(7, fy, "2026-03")).toBe("/data/new?site=7&category=1&period=FY2025");
    expect(yearlyLabel(fy)).toBe("Yearly · FY 2025-26");
    const cy = cat({ filing: "yearly", year_type: "CY", period: { start: "2025-01-01", end: "2025-12-31" } });
    expect(addDataLink(7, cy, "2025-12")).toContain("period=CY2025");
    expect(yearlyLabel(cy)).toBe("Yearly · CY 2025");
    expect(yearlyLabel(cat())).toBeNull();
  });
});

describe("rows", () => {
  it("hides months covered by a yearly batch", () => {
    const site = month([cat({ status: "covered" }), cat({ category_id: 2 })]).sites[0];
    expect(visibleCategories(site).map((c) => c.category_id)).toEqual([2]);
  });

  it("summarises mixed entries only", () => {
    expect(entriesSummary(cat({ entries: { total: 1, pending: 1, approved: 0, rejected: 0 } }))).toBeNull();
    expect(entriesSummary(cat({ entries: { total: 2, pending: 1, approved: 1, rejected: 0 } }))).toBe("2 entries, 1 pending, 1 approved");
    expect(entriesSummary(cat({ entries: { total: 3, pending: 0, approved: 3, rejected: 0 } }))).toBe("3 entries");
  });

  it("marks rows full, half or empty", () => {
    expect(rowMark(cat({ status: "approved" }))).toBe("full");
    expect(rowMark(cat({ status: "pending" }))).toBe("half");
    expect(rowMark(cat({ status: "rejected" }))).toBe("half");
    expect(rowMark(cat())).toBe("empty");
  });

  it("collects rejected rows across sites", () => {
    const data = month([cat({ status: "rejected" })]);
    data.sites.push({ site_id: 8, name: "Sitra", categories: [cat({ category_id: 3, status: "rejected" }), cat({ category_id: 4 })] });
    expect(sentBack(data).map((s) => [s.siteId, s.category.category_id])).toEqual([
      [7, 1],
      [8, 3],
    ]);
  });
});

describe("due banner", () => {
  const data = month([
    cat({ status: "approved" }),
    cat({ category_id: 2, status: "pending" }),
    cat({ category_id: 3, status: "covered" }),
    cat({ category_id: 4 }),
    cat({ category_id: 5, status: "rejected" }),
  ]);

  it("counts filed categories (pending, approved, covered)", () => {
    expect(progress(data)).toEqual({ filed: 3, total: 5, allIn: false });
    expect(progress(month([cat({ status: "approved" })])).allIn).toBe(true);
    expect(progress(month([])).allIn).toBe(false);
  });

  it("counts down to the 10th", () => {
    expect(dueState(data, "2025-10-06")).toEqual({ phase: "open", message: "Due in 4 days (10 Oct). 3 of 5 categories filed." });
    expect(dueState(data, "2025-10-09").message).toMatch(/^Due tomorrow \(10 Oct\)/);
    expect(dueState(data, "2025-10-10").message).toMatch(/^Due today/);
    expect(dueState(data, "2025-09-20").message).toMatch(/^Due in 20 days/);
  });

  it("turns warn after the 10th and says escalated from the 15th", () => {
    expect(dueState(data, "2025-10-11")).toMatchObject({ phase: "late", message: expect.stringMatching(/^Overdue since 10 Oct\. Escalates to your manager on 15 Oct/) });
    expect(dueState(data, "2025-10-15")).toMatchObject({ phase: "escalated", message: expect.stringMatching(/Escalated to your manager/) });
  });
});

describe("page helpers", () => {
  it("formats and steps months", () => {
    expect(monthTitle("2025-09")).toBe("September 2025");
    expect(shiftMonth("2025-01", -1)).toBe("2024-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("sums the month at a glance without covered rows", () => {
    const data = month([
      cat({ status: "approved", total_emission: 4.29, entries: { total: 1, pending: 0, approved: 1, rejected: 0 } }),
      cat({ category_id: 2, status: "pending", total_emission: 312.4, entries: { total: 2, pending: 2, approved: 0, rejected: 0 } }),
      cat({ category_id: 3, status: "covered", total_emission: 99, entries: { total: 1, pending: 0, approved: 1, rejected: 0 } }),
    ]);
    expect(glance(data)).toEqual({ tonnes: 316.69, pendingEntries: 2, approvedEntries: 1 });
  });

  it("detects a contributor with nothing assigned", () => {
    expect(hasNoAssignments(month([]))).toBe(true);
    expect(hasNoAssignments(month([cat()]))).toBe(false);
  });
});
