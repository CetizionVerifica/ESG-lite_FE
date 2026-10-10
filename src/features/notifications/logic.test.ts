import { describe, expect, it } from "vitest";
import { notificationKind } from "../../ui";
import { dateGroup, groupByDate, matchesTab, notificationDetails, parsePage, parseTab, reviewerLabel, tabQuery } from "./logic";

describe("notificationKind", () => {
  it.each([
    ["APPROVED", "approved"],
    ["BULK_PRODUCTION_APPROVED", "approved"],
    ["BULK_REJECTED", "rejected"],
    ["DEADLINE_REMINDER", "reminder"],
    ["DEADLINE_ESCALATION", "escalation"],
    ["SYSTEM", "other"],
  ])("%s → %s", (type, kind) => expect(notificationKind(type)).toBe(kind));
});

describe("tabs", () => {
  it("parses unknown values to the defaults", () => {
    expect(parseTab("rejections")).toBe("rejections");
    expect(parseTab("bogus")).toBe("all");
    expect(parseTab(null)).toBe("all");
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("x")).toBe(1);
  });

  it("maps each tab to the server query", () => {
    expect(tabQuery("all")).toEqual({ unreadOnly: false, type: null });
    expect(tabQuery("unread")).toEqual({ unreadOnly: true, type: null });
    expect(tabQuery("reminders")).toEqual({ unreadOnly: false, type: "reminders" });
  });

  it("reminders cover REMINDER, DEADLINE and ESCALATION alike", () => {
    const n = (type: string) => ({ type, read: true });
    expect(matchesTab(n("DEADLINE_REMINDER"), "reminders")).toBe(true);
    expect(matchesTab(n("DEADLINE_ESCALATION"), "reminders")).toBe(true);
    expect(matchesTab(n("REMINDER"), "reminders")).toBe(true);
    expect(matchesTab(n("APPROVED"), "reminders")).toBe(false);
    expect(matchesTab(n("BULK_APPROVED"), "approvals")).toBe(true);
    expect(matchesTab(n("PRODUCTION_REJECTED"), "rejections")).toBe(true);
    expect(matchesTab({ type: "APPROVED", read: false }, "unread")).toBe(true);
    expect(matchesTab({ type: "APPROVED", read: true }, "unread")).toBe(false);
  });
});

describe("date groups", () => {
  const now = new Date(2026, 9, 9, 10, 0); // Fri 9 Oct 2026, 10:00 local
  it("buckets by calendar day", () => {
    expect(dateGroup(new Date(2026, 9, 9, 0, 5).toISOString(), now)).toBe("Today");
    expect(dateGroup(new Date(2026, 9, 8, 23, 59).toISOString(), now)).toBe("Yesterday");
    expect(dateGroup(new Date(2026, 9, 3, 12).toISOString(), now)).toBe("This week");
    expect(dateGroup(new Date(2026, 9, 2, 12).toISOString(), now)).toBe("Earlier");
  });

  it("keeps order inside groups and groups in display order", () => {
    const items = [
      { id: 1, created_at: new Date(2026, 9, 9, 9).toISOString() },
      { id: 2, created_at: new Date(2026, 9, 9, 8).toISOString() },
      { id: 3, created_at: new Date(2026, 9, 7).toISOString() },
      { id: 4, created_at: new Date(2026, 8, 1).toISOString() },
    ];
    expect(groupByDate(items, now).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Today", [1, 2]],
      ["This week", [3]],
      ["Earlier", [4]],
    ]);
  });
});

describe("notificationDetails", () => {
  it("prefers structured meta", () => {
    const d = notificationDetails({
      message: "Your Diesel emission for Plant A was rejected by Mia Manager. Reason: Wrong unit",
      meta: { reviewer: "Mia Manager", reason: "Wrong unit, should be litres" },
    });
    expect(d).toEqual({
      summary: "Your Diesel emission for Plant A was rejected by Mia Manager",
      reviewer: "Mia Manager",
      reason: "Wrong unit, should be litres",
    });
  });

  it("falls back to the message on rows without meta", () => {
    expect(notificationDetails({ message: "3 emission(s) rejected by Mia Manager. Reason: Duplicate. Again", meta: null })).toEqual({
      summary: "3 emission(s) rejected by Mia Manager",
      reviewer: "Mia Manager",
      reason: "Duplicate. Again",
    });
    expect(notificationDetails({ message: "Your Rod production data was approved by Ali Khan" })).toEqual({
      summary: "Your Rod production data was approved by Ali Khan",
      reviewer: "Ali Khan",
      reason: null,
    });
  });

  it("finds no reviewer in reminders that merely contain 'by'", () => {
    const d = notificationDetails({ message: "Submit electricity by Friday (Plant A)", meta: null });
    expect(d.reviewer).toBeNull();
    expect(d.reason).toBeNull();
  });

  it("labels the reviewer by type", () => {
    expect(reviewerLabel("BULK_APPROVED")).toBe("Approved by");
    expect(reviewerLabel("REJECTED")).toBe("Rejected by");
    expect(reviewerLabel("SYSTEM")).toBe("By");
  });
});
