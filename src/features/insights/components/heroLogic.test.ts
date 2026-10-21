import { describe, expect, it } from "vitest";
import { compareLabel, intensityDecimals, intensityUnit, pathwayHint, pendingSentence, readinessSentence } from "./heroLogic";

describe("hero words (IN-1)", () => {
  it("names what a change is compared with", () => {
    expect(compareLabel({ year: 2026, yearType: "CY", compare: "prior" })).toBe("2025");
    expect(compareLabel({ year: 2026, yearType: "FY", compare: "prior" })).toBe("FY 2025");
    expect(compareLabel({ year: 2026, yearType: "CY", compare: "base" })).toBe("the base year");
  });

  it("picks intensity decimals and unit for display only", () => {
    expect(intensityDecimals(0.612)).toBe(3);
    expect(intensityDecimals(4.2)).toBe(2);
    expect(intensityDecimals(42)).toBe(1);
    expect(intensityUnit("t")).toBe("tCO₂e per t");
  });

  it("says where emissions sit against the pathway", () => {
    expect(pathwayHint({ status: "at_risk", gap_pct: 3.4, target_year: 2030 })).toBe("3.4% above the 2030 pathway");
    expect(pathwayHint({ status: "on_track", gap_pct: -12, target_year: 2030 })).toBe("12% below the 2030 pathway");
    expect(pathwayHint({ status: "no_data", gap_pct: null, target_year: null })).toBeNull();
  });

  it("writes the pending banner sentence, singular and plural", () => {
    expect(pendingSentence({ emissions: 12, kpi_values: 3 })).toBe("12 entries and 3 KPI values waiting for approval aren't in these figures.");
    expect(pendingSentence({ emissions: 1, kpi_values: 0 })).toBe("1 entry waiting for approval isn't in these figures.");
    expect(pendingSentence({ emissions: 0, kpi_values: 0 })).toBeNull();
  });

  it("summarises readiness for screen readers", () => {
    expect(readinessSentence({ pct: 68.5, by_pillar: { environment: 81.2, social: 62, governance: 54.5 } })).toBe("69% of KPI values approved: Environment 81%, Social 62%, Governance 55%.");
  });
});
