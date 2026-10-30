import { describe, expect, it } from "vitest";
import type { DataGroup, ReportInputs } from "../../../../lib/studio/contracts";
import { approvalDay, dataNote, effectiveInput, filterGroups, inputsPatch, lastApproval, missingInputs } from "./logic";

const groups: DataGroup[] = [
  {
    id: "scopes",
    label: "Scopes",
    items: [
      { id: "scope1", label: "Scope 1", binding: { source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" }, resolved: { display: "12,480.000", value: 12480, unit: "tCO₂e", approvedAt: "2026-04-12T08:00:00.000Z" } },
      { id: "scope2_market", label: "Scope 2 (market-based)", binding: { source: "ghg", metric: "scope2_market", years: { last: 1 }, sites: "all" }, resolved: { display: "Not reported", value: null, unit: "tCO₂e", approvedAt: null, unavailable: { reason: "NOT_RECORDED" } } },
    ],
  },
  {
    id: "gases",
    label: "Gases",
    items: [{ id: "gas_ch4", label: "CH₄", binding: { source: "ghg", metric: "gas_ch4", years: { last: 1 }, sites: "all" }, resolved: { display: "3", value: 3, unit: "t CH₄", approvedAt: "2026-05-02T00:00:00.000Z" } }],
  },
];

describe("data drawer wording", () => {
  it("shows the approval day, or why a figure has no value", () => {
    expect(approvalDay("2026-04-12T23:30:00.000Z")).toBe("12 Apr 2026");
    expect(approvalDay(null)).toBeNull();
    expect(approvalDay("not a date")).toBeNull();
    expect(dataNote({ approvedAt: "2026-04-12T08:00:00.000Z" })).toBe("Approved 12 Apr 2026");
    expect(dataNote({ approvedAt: null })).toBe("No approved data yet");
    expect(dataNote({ unavailable: { reason: "NOT_RECORDED" } })).toBe("Not recorded in ESGLite");
    expect(dataNote({ unavailable: { reason: "EXCLUDED" } })).toBe("Excluded in report details");
  });
  it("filters by label and group, and finds the newest approval", () => {
    expect(filterGroups(groups, "").length).toBe(2);
    expect(filterGroups(groups, "market").map((g) => g.items.map((i) => i.id))).toEqual([["scope2_market"]]);
    expect(filterGroups(groups, "gases")[0].items[0].id).toBe("gas_ch4");
    expect(filterGroups(groups, "nothing")).toEqual([]);
    expect(lastApproval(groups)).toBe("2 May 2026");
    expect(lastApproval([])).toBeNull();
  });
});

describe("report details", () => {
  const stored: ReportInputs = { responsible_person: { value: "A. Shah", source: "typed", updatedBy: 2, updatedAt: "t" } };
  const prefill = { consolidation_approach: { value: "Operational control", source: "company" as const }, revenue: { value: 2300, source: "kpi" as const, note: "INR crore" } };

  it("a stored value wins over the prefill; the prefill fills the rest", () => {
    expect(effectiveInput("responsible_person", stored, prefill)).toEqual({ value: "A. Shah", source: "typed", stored: true });
    expect(effectiveInput("revenue", stored, prefill)).toEqual({ value: 2300, source: "kpi", stored: false, note: "INR crore" });
    expect(effectiveInput("uncertainty_statement", stored, prefill)).toEqual({ value: null, source: null, stored: false });
  });
  it("lists the kind's empty inputs for checks", () => {
    const missing = missingInputs("ghg", stored, prefill);
    expect(missing).toContain("uncertainty_statement");
    expect(missing).not.toContain("responsible_person");
    expect(missing).not.toContain("consolidation_approach");
    expect(missing).not.toContain("leadership_message");
    expect(missingInputs("sustainability", {}, {})).toEqual(["reporting_period", "verification", "leadership_message", "about_company"]);
  });
  it("patches only what changed, null for a removed key", () => {
    const after: ReportInputs = {
      responsible_person: { value: "A. Shah", source: "typed", updatedBy: 2, updatedAt: "later" },
      revenue: { value: 2400, source: "typed", updatedBy: null, updatedAt: "now" },
    };
    expect(inputsPatch(stored, after)).toEqual({ revenue: { value: 2400, source: "typed" } });
    expect(inputsPatch(after, {})).toEqual({ responsible_person: null, revenue: null });
  });
});
