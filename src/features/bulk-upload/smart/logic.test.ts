import { describe, expect, it } from "vitest";
import { FINGERPRINT_POWER, MOCK_PROFILE, MOCK_PROPOSAL } from "./fixtures";
import {
  activityChip,
  applyProfile,
  forgetErrorMessage,
  profileDiffers,
  profileFor,
  profileSummary,
  profileWhenText,
  confirmCategory,
  setCategoryValue,
  canContinue,
  categoryChip,
  confirmActivity,
  confirmField,
  errorRowsRemain,
  fieldChip,
  issueOptions,
  otherSiteLines,
  periodText,
  reviewRowsLink,
  rowSeverity,
  setActivityFactor,
  setFieldColumn,
  setSheetExcluded,
  sheetBlockers,
  smartErrorMessage,
  smartImportEnabled,
  smartUnavailable,
  toggleFieldSkip,
  toggleSaveMapping,
} from "./logic";
import type { PlanSummary } from "../../../services/excelService";

const fuel = MOCK_PROPOSAL.sheets[0];
const power = MOCK_PROPOSAL.sheets[1];

describe("chips", () => {
  it("names the field's source, and Check below 0.8 or when a required field is empty", () => {
    expect(fieldChip(fuel.fields[0])).toBe("suggested");
    expect(fieldChip(fuel.fields[1])).toBe("check");
    expect(fieldChip(fuel.fields[2])).toBe("check");
    expect(fieldChip(power.fields[0])).toBe("remembered");
    expect(fieldChip({ ...fuel.fields[2], column: null })).toBeNull();
    expect(fieldChip({ ...fuel.fields[2], skipped: true })).toBe("skipped");
  });

  it("marks activities and categories the same way", () => {
    expect(activityChip(fuel.activities[0])).toBe("matched");
    expect(activityChip(fuel.activities[1])).toBe("check");
    expect(activityChip({ ...fuel.activities[1], factor_name: null, confidence: 1 })).toBe("skipped");
    expect(categoryChip(fuel.category)).toBe("matched");
    expect(categoryChip(power.category)).toBe("remembered");
    expect(categoryChip({ kind: "column", column: "Cat", values: [{ text: "Fuel", id: 1, confidence: 0.9, source: "llm" }, { text: "??", id: null, confidence: 0.2, source: "llm" }] })).toBe("check");
  });

  it("clears Check once a column value is left out on purpose, but not when every value is", () => {
    const col = (values: { text: string; id: number | null; confidence: number }[]) => ({
      ...MOCK_PROPOSAL,
      sheets: [{ ...MOCK_PROPOSAL.sheets[0], category: { kind: "column" as const, column: "Cat", values: values.map((v) => ({ ...v, source: "rules" as const })) } }],
    });
    const unsure = col([{ text: "Fuel", id: 1, confidence: 0.95 }, { text: "Misc", id: null, confidence: 0 }]);
    expect(categoryChip(unsure.sheets[0].category)).toBe("check");
    // "Not imported" picked for Misc.
    expect(categoryChip(setCategoryValue(unsure, 0, "Misc", null).sheets[0].category)).toBe("matched");
    // Or Confirm these.
    expect(categoryChip(confirmCategory(unsure, 0).sheets[0].category)).toBe("matched");
    // Nothing left to import from the column.
    const none = setCategoryValue(confirmCategory(unsure, 0), 0, "Fuel", null);
    expect(categoryChip(none.sheets[0].category)).toBe("check");
  });
});

describe("continue gating", () => {
  it("lists what blocks each sheet and clears when every part is confirmed", () => {
    expect(sheetBlockers(fuel)).toEqual(["Unit", '"Gasoline 95"']);
    expect(sheetBlockers(power)).toEqual([]);
    expect(canContinue(MOCK_PROPOSAL)).toBe(false);

    let p = setFieldColumn(MOCK_PROPOSAL, 0, "activity_unit", "UoM");
    p = confirmActivity(p, 0, "Gasoline 95");
    expect(sheetBlockers(p.sheets[0])).toEqual([]);
    expect(canContinue(p)).toBe(true);
    expect(p.sheets[0].fields[1]).toMatchObject({ column: "UoM", confidence: 1 });
    expect(p.sheets[0].activities[1]).toMatchObject({ factor_name: "Petrol", confidence: 1 });
  });

  it("an excluded sheet blocks nothing, and all sheets excluded blocks Continue", () => {
    const p = setSheetExcluded(MOCK_PROPOSAL, 0, true);
    expect(canContinue(p)).toBe(true);
    expect(canContinue(setSheetExcluded(p, 1, true))).toBe(false);
  });

  it("confirming keeps the proposed column; an optional field can be skipped, a required one not", () => {
    const p = confirmField(MOCK_PROPOSAL, 0, "extra_invoice");
    expect(p.sheets[0].fields[2]).toMatchObject({ column: "Inv #", confidence: 1 });
    const skipped = toggleFieldSkip(MOCK_PROPOSAL, 0, "extra_invoice");
    expect(skipped.sheets[0].fields[2]).toMatchObject({ skipped: true, column: null });
    expect(toggleFieldSkip(skipped, 0, "extra_invoice").sheets[0].fields[2].skipped).toBe(false);
    expect(toggleFieldSkip(MOCK_PROPOSAL, 0, "activity_value").sheets[0].fields[0].skipped).toBe(false);
  });

  it("a changed factor is confirmed; clearing it drops the save tick", () => {
    const saved = toggleSaveMapping(MOCK_PROPOSAL, 0, "Gasoline 95");
    expect(saved.sheets[0].activities[1].save_mapping).toBe(true);
    const changed = setActivityFactor(saved, 0, "Gasoline 95", "Diesel");
    expect(changed.sheets[0].activities[1]).toMatchObject({ factor_name: "Diesel", confidence: 1, save_mapping: true });
    expect(setActivityFactor(saved, 0, "Gasoline 95", null).sheets[0].activities[1]).toMatchObject({ factor_name: null, save_mapping: false });
  });
});

describe("copy", () => {
  it("describes periods and other sites", () => {
    expect(periodText(fuel.period)).toBe('Each row\'s date from column "Month"');
    expect(periodText(power.period)).toBe("Months as columns: Jan 2026 to Mar 2026 (3 columns)");
    expect(periodText({ kind: "yearly", year_type: "FY", year: 2025 })).toBe("Financial year 2025–26 (April to March)");
    expect(periodText({ kind: "monthly_fixed", date: "2026-08-31" })).toBe("Every row filed in Aug 2026");
    expect(otherSiteLines(fuel, "Hidd")).toEqual(["Askar: its rows will be skipped (this upload is for Hidd)"]);
    expect(otherSiteLines(power, "Hidd")).toEqual([]);
  });
});

describe("review rows", () => {
  const plan: PlanSummary = {
    plan_id: "p1",
    version: 3,
    status: "draft",
    counts: { rows: 10, ready: 7, issue: 2, skipped: 1, warnings: 1 },
    totals: { tco2e: 1, by_category: [], by_month: [] },
    issues_summary: [
      { code: "PIVOT_EMPTY_CELL", count: 1, example_row_refs: [] },
      { code: "SITE_NOT_ALLOWED", count: 4, example_row_refs: ["Fuel 2026!A5"] },
    ],
  };

  it("offers the plan's issue codes most frequent first, with the info severity", () => {
    expect(issueOptions(plan)).toEqual([
      { value: "SITE_NOT_ALLOWED", label: "Other site (4)" },
      { value: "PIVOT_EMPTY_CELL", label: "Empty month cell (1)" },
    ]);
    expect(rowSeverity({ state: "ready", issues: [{ code: "PIVOT_EMPTY_CELL", severity: "info", message: "" }] })).toBe("info");
    expect(rowSeverity({ state: "ready", issues: [{ code: "LOW_CONFIDENCE_MATCH", severity: "warning", message: "" }] })).toBe("warning");
    expect(rowSeverity({ state: "issue", issues: [] })).toBe("error");
    expect(rowSeverity({ state: "ready", issues: [] })).toBeNull();
  });

  it("blocks the commit while rows in state issue remain", () => {
    expect(errorRowsRemain(plan)).toBe(true);
    expect(errorRowsRemain({ ...plan, counts: { ...plan.counts, issue: 0 } })).toBe(false);
    expect(errorRowsRemain(null)).toBe(false);
  });

  it("links Review rows to the batch over any period at the upload's site", () => {
    expect(reviewRowsLink(1, "b-1")).toBe("/data/approvals?period=all&site=1&category=all&batch=b-1");
  });
});

describe("switch and errors", () => {
  it("reads the client switch off the sites", () => {
    expect(smartImportEnabled([{ company: { ai_import_enabled: true } }])).toBe(true);
    expect(smartImportEnabled([{ company: { ai_import_enabled: false } }, { company: null }])).toBe(false);
    expect(smartImportEnabled([])).toBe(false);
  });

  it("tells a missing mapper from a refusal", () => {
    expect(smartUnavailable({ status: 404 })).toBe(true);
    expect(smartUnavailable({ status: 403 })).toBe(false);
    expect(smartErrorMessage({ status: 403, code: "AI_IMPORT_DISABLED_FOR_CLIENT", message: "x" }, "f")).toBe("Smart import is switched off for this client.");
    expect(smartErrorMessage({ status: 429 }, "f")).toMatch(/Too many/);
    expect(smartErrorMessage({ status: 503 }, "f")).toMatch(/map the columns yourself/);
    expect(smartErrorMessage(new Error("boom"), "f")).toBe("boom");
    expect(smartErrorMessage({}, "f")).toBe("f");
  });
});

describe("mapping memory (XI4 2/2)", () => {
  const fuel = MOCK_PROPOSAL.sheets[0];

  it("picks the profile of the sheet's fingerprint, site and category, newest first otherwise", () => {
    expect(profileFor(fuel, undefined)).toBeNull();
    expect(profileFor(fuel, [])).toBeNull();
    const other = { ...MOCK_PROFILE, id: "x", category_id: 3 };
    expect(profileFor(fuel, [other, MOCK_PROFILE])?.id).toBe(MOCK_PROFILE.id);
    expect(profileFor(fuel, [other])?.id).toBe("x");
    expect(profileFor(fuel, [{ ...MOCK_PROFILE, fingerprint: FINGERPRINT_POWER }])).toBeNull();
    expect(profileFor(fuel, [{ ...MOCK_PROFILE, site_id: 2 }])).toBeNull();
  });

  it("knows when the card differs from the profile and puts the profile back", () => {
    expect(profileDiffers(fuel, MOCK_PROFILE)).toBe(true);
    const applied = applyProfile(MOCK_PROPOSAL, 0, MOCK_PROFILE).sheets[0];
    expect(profileDiffers(applied, MOCK_PROFILE)).toBe(false);
    expect(applied.fields.find((f) => f.key === "activity_unit")).toMatchObject({ column: "UoM", confidence: 1, source: "profile" });
    expect(applied.activities[1]).toMatchObject({ factor_name: "Petrol", confidence: 1, source: "profile", save_mapping: false });
    expect(applied.source).toBe("profile");
    // What the reader found stays.
    expect(applied.site_column).toEqual(fuel.site_column);
    expect(applied.not_in_context).toEqual(["Plant 9"]);
    expect(applied.data_rows).toBe(48);
    expect(sheetBlockers(applied)).toEqual([]);
    // A user's own change differs again.
    expect(profileDiffers(setFieldColumn(applyProfile(MOCK_PROPOSAL, 0, MOCK_PROFILE), 0, "activity_unit", "Unit").sheets[0], MOCK_PROFILE)).toBe(true);
  });

  it("says what the profile remembers and when", () => {
    expect(profileSummary(MOCK_PROFILE)).toBe(
      'Fuel, each row\'s date from column "Month"; Quantity from "Litres used", Unit from "UoM", Invoice number from "Inv #"; "Diesel (gen-set)" as Diesel, "Gasoline 95" as Petrol',
    );
    expect(profileWhenText(MOCK_PROFILE)).toBe("on 12 Sep 2026, used 3 times");
    expect(profileWhenText({ ...MOCK_PROFILE, uses: 1, confirmed_at: null, updated_at: "not a date" })).toBe("used once");
  });

  it("explains a refused forget", () => {
    expect(forgetErrorMessage({ status: 403, code: "IMPORT_FORBIDDEN", message: "Forbidden" })).toBe("Only the person who confirmed this mapping, or an admin, can forget it.");
    expect(forgetErrorMessage({ status: 404 })).toBe("This mapping was already forgotten.");
    expect(forgetErrorMessage({ status: 500, message: "boom" })).toBe("boom");
  });
});
