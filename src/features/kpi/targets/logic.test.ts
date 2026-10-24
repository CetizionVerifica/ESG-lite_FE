import { describe, expect, it } from "vitest";
import { barWidth, baselineYears, checkForm, emptyForm, formOf, progressText, statusOf, targetYears, toBody } from "./logic";

const filled = { ...emptyForm(2026), kpiId: 13, baselineYear: 2024, baselineValue: 48000, targetYear: 2030, targetValue: 38000 };

describe("the target form", () => {
  it("starts from last year towards 2030", () => {
    expect(emptyForm(2026)).toMatchObject({ baselineYear: 2025, targetYear: 2030, direction: "reduce", kpiId: null });
    expect(emptyForm(2031).targetYear).toBe(2036);
  });

  it("checks what the server checks", () => {
    expect(checkForm(emptyForm(2026))).toMatchObject({ kpi: "Pick a KPI.", baselineValue: "Add the baseline value.", targetValue: "Add the target value." });
    expect(checkForm({ ...filled, targetYear: 2024 }).targetYear).toBe("The target year comes after the baseline year.");
    expect(checkForm({ ...filled, targetValue: 50000 }).direction).toBe("To reduce, the target must be lower than the baseline.");
    expect(checkForm({ ...filled, direction: "increase" }).direction).toBe("To increase, the target must be higher than the baseline.");
    expect(checkForm(filled)).toEqual({});
  });

  it("needs a note for a typed baseline", () => {
    expect(checkForm(filled, { typedBaseline: true }).note).toMatch(/where the baseline came from/);
    expect(checkForm({ ...filled, note: "From the 2024 sustainability report" }, { typedBaseline: true })).toEqual({});
  });

  it("round-trips a saved target", () => {
    const saved = { id: 2, company_id: 1, created_by: 13, kpi_definition_id: 13, site_id: null, baseline_year: 2024, baseline_value: 48000, target_year: 2030, target_value: 38000, direction: "reduce" as const, note: null, current_value: 41600, current_year: 2025, progress_pct: 64 };
    expect(toBody(formOf(saved))).toEqual({ id: 2, kpi_definition_id: 13, site_id: null, baseline_year: 2024, baseline_value: 48000, target_year: 2030, target_value: 38000, direction: "reduce", note: null });
  });
});

describe("progress display", () => {
  it("shows the server's percent inside the bar", () => {
    expect(barWidth(64)).toBe(64);
    expect(barWidth(130)).toBe(100);
    expect(barWidth(-5)).toBe(0);
    expect(barWidth(null)).toBe(0);
    expect(progressText(28.1)).toBe("28.1 % of the way");
    expect(progressText(null)).toBe("No approved value yet");
  });

  it("reads no data without a current value", () => {
    expect(statusOf({ status: "behind", progress_pct: 10 })).toBe("behind");
    expect(statusOf({ status: null, progress_pct: null })).toBe("no_data");
  });

  it("offers baseline and target years", () => {
    expect(baselineYears(2026, 2026)).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
    expect(targetYears(2024).slice(0, 2)).toEqual([2025, 2026]);
  });
});
