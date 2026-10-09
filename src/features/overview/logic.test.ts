import { describe, expect, it } from "vitest";
import type { OverviewCategory, OverviewSite, SubmissionUser } from "../../services/overviewService";
import {
  attentionItems,
  categoryBars,
  combineIntensity,
  defaultPeriod,
  headerText,
  insightText,
  lastYearCaption,
  listLink,
  missingBySite,
  siteStatus,
  submissionMonths,
  supportedPeriod,
  thresholdAlerts,
  toOverviewPeriod,
  trendTable,
  usersOnSites,
} from "./logic";

const cat = (id: number, total: number, name = `Cat ${id}`): OverviewCategory => ({ category_id: id, category_name: name, scope: "Scope 1", total });
const site = (over: Partial<OverviewSite> = {}): OverviewSite => ({
  site_id: 1,
  name: "Hidd",
  total: 10,
  gross: 10,
  saved: 0,
  net: 10,
  entries: 4,
  approved: 4,
  pending: 0,
  rejected: 0,
  net_vs_last_year_pct: null,
  ...over,
});
const user = (name: string, site_name: string, status: SubmissionUser["status"]): SubmissionUser => ({
  user_id: name.length,
  name,
  email: `${name}@x.com`,
  site_name,
  submission_count: status === "submitted" ? 2 : 0,
  status,
});

describe("periods", () => {
  it("maps FE periods to B4's period param", () => {
    expect(toOverviewPeriod({ kind: "month", year: 2025, month: 9 })).toBe("2025-09");
    expect(toOverviewPeriod({ kind: "quarter", year: 2025, quarter: 3 })).toBe("2025-Q3");
    expect(toOverviewPeriod({ kind: "cy", year: 2025 })).toBe("2025");
    expect(toOverviewPeriod({ kind: "fy", startYear: 2025 })).toBe("FY2025-26");
    expect(toOverviewPeriod({ kind: "fy", startYear: 2099 })).toBe("FY2099-00");
  });

  it("opens on the calendar year of the last month that was due", () => {
    expect(defaultPeriod(new Date(2026, 0, 15))).toEqual({ kind: "cy", year: 2025 });
    expect(defaultPeriod(new Date(2026, 9, 9))).toEqual({ kind: "cy", year: 2026 });
  });

  it("falls back to the default for custom ranges B4 can't serve", () => {
    const now = new Date(2026, 9, 9);
    expect(supportedPeriod({ kind: "custom", from: "2025-01-01", to: "2025-02-01" }, now)).toEqual({ kind: "cy", year: 2026 });
    expect(supportedPeriod({ kind: "month", year: 2025, month: 3 }, now)).toEqual({ kind: "month", year: 2025, month: 3 });
    expect(supportedPeriod(null, now)).toEqual({ kind: "cy", year: 2026 });
  });

  it("lists the six months before the current one", () => {
    expect(submissionMonths(new Date(2026, 1, 3))).toEqual(["2026-01", "2025-12", "2025-11", "2025-10", "2025-09", "2025-08"]);
  });
});

describe("last year", () => {
  it("captions the comparison only when last year is due", () => {
    const kpis = { gross: 1, net: 1, saved: 0, scope_1: 1, scope_2: 0, scope_3: 0 };
    expect(lastYearCaption(null)).toBeNull();
    expect(lastYearCaption({ period: null, status: "not_due", kpis, by_site: [] })).toBeNull();
    expect(lastYearCaption({ period: null, status: "year_to_date", kpis, by_site: [] })).toBe("vs same months last year");
    expect(lastYearCaption({ period: null, status: "complete", kpis, by_site: [] })).toBe("vs last year");
  });
});

describe("categories", () => {
  it("keeps the top 8 and sums the rest as Other", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => cat(i, i));
    const bars = categoryBars(rows);
    expect(bars).toHaveLength(9);
    expect(bars[0]).toEqual({ id: 10, name: "Cat 10", total: 10 });
    expect(bars[8]).toEqual({ id: "other", name: "Other (2)", total: 3 });
  });

  it("drops zero rows and needs no Other for short lists", () => {
    expect(categoryBars([cat(1, 0), cat(2, 5)])).toEqual([{ id: 2, name: "Cat 2", total: 5 }]);
  });

  it("names the largest source and its share of gross", () => {
    expect(insightText([cat(1, 87, "Purchased aluminium"), cat(2, 13)], 100)).toBe("Purchased aluminium is 87% of the gross footprint.");
    expect(insightText([cat(1, 5, "Diesel")], 5)).toBe("Diesel is all of the gross footprint.");
    expect(insightText([cat(1, 0.001, "Tiny"), cat(2, 0.0001)], 1000)).toBe("Tiny is under 1% of the gross footprint.");
    expect(insightText([], 10)).toBeNull();
    expect(insightText([cat(1, 5)], 0)).toBeNull();
  });

  it("flags categories that rose more than the threshold", () => {
    const now = [cat(1, 106, "Diesel"), cat(2, 104), cat(3, 50), cat(4, 200)];
    const before = [cat(1, 100), cat(2, 100), cat(3, 100), cat(4, 0)];
    expect(thresholdAlerts(now, before, 5)).toEqual([{ category_id: 1, category_name: "Diesel", pct: 6 }]);
  });
});

describe("sites", () => {
  it("shows pending first, then missing people, then no entries", () => {
    expect(siteStatus(site({ pending: 3 }), 2)).toEqual({ status: "pending", label: "3 pending" });
    expect(siteStatus(site(), 2)).toEqual({ status: "missing", label: "2 missing" });
    expect(siteStatus(site({ entries: 0, approved: 0 }), 0)).toEqual({ status: "missing", label: "No entries" });
    expect(siteStatus(site({ approved: 0, rejected: 2, entries: 2 }), 0)).toEqual({ status: "rejected", label: "2 rejected" });
    expect(siteStatus(site(), 0)).toEqual({ status: "approved", label: "Approved" });
  });

  it("counts missing people per site and narrows to chosen sites", () => {
    const users = [user("a", "Hidd", "missing"), user("bb", "Hidd", "missing"), user("ccc", "Sitra", "submitted")];
    expect([...missingBySite(users)]).toEqual([["Hidd", 2]]);
    expect(usersOnSites(users, ["Sitra"]).map((u) => u.name)).toEqual(["ccc"]);
    expect(usersOnSites(users, null)).toHaveLength(3);
  });
});

describe("intensity", () => {
  it("divides emissions by production, combining several units", () => {
    expect(combineIntensity(10, [{ production: 5, unit: "t" }])).toEqual({ value: 2, unit: "t", combined: false });
    expect(combineIntensity(10, [{ production: 4, unit: "t" }, { production: 1, unit: "m" }])).toEqual({ value: 2, unit: "Combined", combined: true });
    expect(combineIntensity(10, [{ production: 0, unit: "t" }])).toBeNull();
    expect(combineIntensity(10, [])).toBeNull();
  });
});

describe("links and text", () => {
  it("builds P07 links with the context", () => {
    expect(listLink("/data/ledger", { siteIds: [3, 1], categoryId: 10, period: { kind: "fy", startYear: 2025 }, status: "approved" })).toBe(
      "/data/ledger?site=1%2C3&category=10&period=FY2025&status=approved",
    );
    expect(listLink("/data/approvals", {})).toBe("/data/approvals?period=all");
  });

  it("lists attention items with counts, skipping zeros", () => {
    const links = { approvals: "/a", production: "/p", team: "#t", category: (id: number) => `/c/${id}` };
    const items = attentionItems({
      pendingEntries: 12,
      pendingProduction: 0,
      missingPeople: 1,
      missingMonth: "2025-09",
      overThreshold: [{ category_id: 4, category_name: "Diesel", pct: 6.2 }],
      threshold: 5,
      previousLabel: "Aug 2025",
      links,
    });
    expect(items.map((i) => [i.text, i.to])).toEqual([
      ["12 entries waiting for approval", "/a"],
      ["1 person missing Sep 2025", "#t"],
      ["Diesel up 6.2% vs Aug 2025, threshold 5%", "/c/4"],
    ]);
    expect(attentionItems({ pendingEntries: 0, pendingProduction: null, missingPeople: 0, missingMonth: null, overThreshold: [], threshold: null, previousLabel: null, links })).toEqual([]);
  });

  it("adds the yearly filing as its own table row", () => {
    expect(trendTable([{ month: "2025-09", gross: 2, saved: 1, net: 1 }], 5)).toEqual([
      { month: "Sep 2025", gross: 2, saved: 1, net: 1 },
      { month: "Yearly filing", gross: 5, saved: null, net: 5 },
    ]);
    expect(trendTable([], 0)).toEqual([]);
  });

  it("titles the page with the period and names the sites in the crumb", () => {
    expect(headerText("Midal", 0, 3, { kind: "cy", year: 2025 })).toEqual({ title: "CY 2025", crumb: "Midal · All sites" });
    expect(headerText(null, 1, 3, { kind: "month", year: 2025, month: 9 })).toEqual({ title: "Sep 2025", crumb: "1 site" });
    expect(headerText("Midal", 2, 3, { kind: "fy", startYear: 2025 }).crumb).toBe("Midal · 2 sites");
  });
});
