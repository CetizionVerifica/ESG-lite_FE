import { describe, expect, it } from "vitest";
import type { MyMonthCategory, MyMonthResponse } from "../../services/myMonthService";
import type { EmissionData } from "../../services/emissionService";
import { readMyMonth } from "../../services/myMonthService";
import {
  addDataLink,
  allLocked,
  canMarkNothing,
  draftRows,
  firstDay,
  fixLink,
  keepSelected,
  lockedSiteIds,
  rowWord,
  selectableIds,
  selectionState,
  submitMessage,
  submitSelection,
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

  it("names the year when the due date is in another year", () => {
    expect(dueState(data, "2026-10-10").message).toMatch(/^Overdue since 10 Oct 2025\. Escalated to your manager/);
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

describe("S3-15 part 2: status words with the review workflow", () => {
  const on = { workflow: true, today: "2025-10-05", dueDate: "2025-10-10" };
  const off = { workflow: false, today: "2025-10-20", dueDate: "2025-10-10" };

  it("keeps today's words with the switch off", () => {
    expect(rowWord(cat(), off)).toBe("todo");
    expect(rowWord(cat({ status: "draft" }), off)).toBe("todo");
    expect(rowWord(cat({ status: "pending" }), off)).toBe("pending");
    expect(rowWord(cat({ nothing_this_month: true }), off)).toBe("todo");
  });

  it("reads Draft for a category with only drafts, Missing for a to-do past the due date", () => {
    expect(rowWord(cat({ entries: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 2 } }), on)).toBe("draft");
    expect(rowWord(cat({ status: "draft" }), on)).toBe("draft");
    expect(rowWord(cat(), on)).toBe("todo");
    expect(rowWord(cat(), { ...on, today: "2025-10-11" })).toBe("missing");
    expect(rowWord(cat({ nothing_this_month: true }), on)).toBe("nothing");
    // Rejected always wins: it needs action.
    expect(rowWord(cat({ status: "rejected", entries: { total: 1, pending: 0, approved: 0, rejected: 1, draft: 1 } }), on)).toBe("rejected");
  });

  it("counts Nothing this month as filed and drafts as not filed", () => {
    const p = progress(month([cat({ nothing_this_month: true }), cat({ status: "draft" }), cat({ status: "pending" })]));
    expect(p).toEqual({ filed: 2, total: 3, allIn: false });
    expect(rowMark(cat({ nothing_this_month: true }))).toBe("full");
    expect(rowMark(cat({ entries: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 1 } }))).toBe("half");
  });

  it("offers Nothing this month only on an empty monthly to-do in an open month", () => {
    expect(canMarkNothing(cat(), false)).toBe(true);
    expect(canMarkNothing(cat(), true)).toBe(false);
    expect(canMarkNothing(cat({ entries: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 1 } }), false)).toBe(false);
    expect(canMarkNothing(cat({ status: "pending", entries: { total: 1, pending: 1, approved: 0, rejected: 0 } }), false)).toBe(false);
    expect(canMarkNothing(cat({ filing: "yearly" }), false)).toBe(false);
    expect(canMarkNothing(cat({ nothing_this_month: true }), false)).toBe(false);
    expect(firstDay("2025-09")).toBe("2025-09-01");
  });

  it("finds locked sites", () => {
    const data = month([cat()], { sites: [{ site_id: 1, name: "A", categories: [], locked: true }, { site_id: 2, name: "B", categories: [] }] });
    expect(lockedSiteIds(data)).toEqual([1]);
    expect(allLocked(data)).toBe(false);
    expect(allLocked({ ...data, sites: [data.sites[0]] })).toBe(true);
  });

  it("links Fix to the saved row in Add data", () => {
    expect(fixLink(7, 4, "2025-09", 91)).toBe("/data/new?site=7&category=4&period=2025-09&fix=91");
  });
});

describe("S3-15 part 2: drafts and submit selection", () => {
  const emission = (pk_id: number, status: string, siteId = 1, name = "Diesel"): EmissionData =>
    ({
      pk_id,
      status,
      total_emission: 1.5,
      activity_data: { emission_category: name },
      site: { site_id: siteId, name: siteId === 1 ? "Hidd" : "Sitra" },
      category: { category_id: 1, category_name: "Diesel" },
    }) as unknown as EmissionData;

  const drafts = draftRows([emission(3, "draft"), emission(1, "draft"), emission(2, "pending"), emission(4, "draft", 2)], [2]);

  it("keeps only drafts, in a stable order, and marks those in a locked month", () => {
    expect(drafts.map((d) => [d.pk_id, d.locked])).toEqual([
      [1, false],
      [3, false],
      [4, true],
    ]);
    expect(drafts[0]).toMatchObject({ siteName: "Hidd", categoryName: "Diesel", label: "Diesel", tco2e: 1.5 });
  });

  it("submits only selected drafts outside locked months", () => {
    expect(submitSelection(new Set([1, 3, 4, 99]), drafts)).toEqual([1, 3]);
    expect(selectableIds(drafts)).toEqual([1, 3]);
  });

  it("tracks the select-all state over the drafts that can be picked", () => {
    expect(selectionState(new Set(), drafts)).toBe("none");
    expect(selectionState(new Set([1]), drafts)).toBe("some");
    expect(selectionState(new Set([1, 3, 4]), drafts)).toBe("all");
    expect([...keepSelected(new Set([1, 99, 4]), drafts)]).toEqual([1]);
  });

  it("says how many went and why any didn't", () => {
    expect(submitMessage({ submitted: [1, 2, 3], refused: [] })).toEqual({ title: "3 rows sent for approval", tone: "good" });
    expect(submitMessage({ submitted: [1], refused: [{ id: 2, code: "PERIOD_LOCKED" }] })).toEqual({
      title: "1 row sent for approval",
      description: "1 row not sent: the month is locked.",
      tone: "neutral",
    });
    expect(submitMessage({ submitted: [], refused: [{ id: 2, code: "NOT_DRAFT" }, { id: 3, code: "NOT_DRAFT" }] })).toMatchObject({ title: "2 rows not sent", tone: "bad" });
  });
});

describe("readMyMonth (ESG-lite's S3-15 fields)", () => {
  it("turns `nothing` / status nothing into a marked to-do, and leaves today's answer alone", () => {
    const raw = month([cat({ category_id: 1, status: "nothing" as MyMonthCategory["status"] }), cat({ category_id: 2, ...({ nothing: true } as object) }), cat({ category_id: 3, status: "pending" })]);
    const read = readMyMonth(raw).sites[0].categories;
    expect(read.map((c) => [c.status, c.nothing_this_month ?? false])).toEqual([
      ["todo", true],
      ["todo", true],
      ["pending", false],
    ]);
    const plain = month([cat()]);
    expect(readMyMonth(plain).sites[0].categories[0]).toBe(plain.sites[0].categories[0]);
  });
});
