import { describe, expect, it } from "vitest";
import { SURVEY_HEADERS, TEMPLATE_ROWS, parseSurvey, previewSurvey, scaleText } from "./logic";

const sheet = (rows: unknown[][]) => parseSurvey([[...SURVEY_HEADERS], ...rows]);

describe("commuting survey sheet (S3-9)", () => {
  it("reads the template and previews golden 7.1: rail 8,640 km, car 11,040 km", () => {
    const parsed = sheet(TEMPLATE_ROWS);
    expect(parsed.errors).toEqual([]);
    expect(parsed.responses).toHaveLength(4);
    const preview = previewSurvey(parsed.responses);
    expect(preview.respondents).toBe(3);
    expect(preview.modes).toEqual([
      { key: "Rail [passenger.km]", mode: "Rail", matched: true, respondents: 2, total_km: 8640 },
      { key: "Car, unknown fuel [vehicle.km]", mode: "Car, unknown fuel", matched: true, respondents: 2, total_km: 11040 },
    ]);
    expect(preview.skipped).toEqual([]);
  });

  it("accepts close header names in any order and skips blank rows", () => {
    const parsed = parseSurvey([
      ["mode", "one way distance (km)", "REF", "weeks", "days"],
      ["Bus", "1,200", "Z", 46, 2],
      ["", "", "", "", ""],
    ]);
    expect(parsed.missing).toEqual([]);
    expect(parsed.responses).toEqual([{ ref: "Z", mode: "Bus", one_way_km: 1200, days_per_week: 2, weeks_per_year: 46 }]);
  });

  it("names missing columns and bad rows without echoing refs", () => {
    expect(parseSurvey([["Ref", "Mode"]]).missing).toEqual(["One-way km", "Days per week", "Weeks per year"]);
    const parsed = sheet([
      ["Priya", "Rail", "ten", 5, 48],
      ["P2", "Rail", 10, 9, 48],
      ["P3", "", 10, 5, 48],
      ["P4", "Car", 10, 5, 60],
    ]);
    expect(parsed.errors).toEqual([
      "Row 2: One-way km must be a number of 0 or more.",
      "Row 3: Days per week must be 0 to 7.",
      "Row 4: enter a mode.",
      "Row 5: Weeks per year must be 0 to 53.",
    ]);
    expect(parsed.errors.join(" ")).not.toMatch(/Priya/);
  });

  it("counts a person once across modes, and a blank ref as its own person", () => {
    const p = previewSurvey([
      { ref: "A", mode: "rail", one_way_km: 1, days_per_week: 1, weeks_per_year: 1 },
      { ref: "A", mode: "Rail ", one_way_km: 1, days_per_week: 1, weeks_per_year: 1 },
      { ref: "", mode: "Walk", one_way_km: 0, days_per_week: 5, weeks_per_year: 48 },
    ]);
    expect(p.respondents).toBe(2);
    expect(p.modes).toEqual([{ key: "Rail [passenger.km]", mode: "Rail", matched: true, respondents: 1, total_km: 4 }]);
    expect(p.skipped).toEqual([{ mode: "Walk", reason: "zero_emission", respondents: 1 }]);
  });

  it("groups modes the way the server does: aliases merge, unknown modes stay as written", () => {
    const row = (mode: string, km = 1) => ({ ref: mode, mode, one_way_km: km, days_per_week: 1, weeks_per_year: 1 });
    const p = previewSurvey([row("Train"), row("Rail"), row("Tube"), row("Cycling"), row("Hovercraft"), row("Bus", 0)]);
    expect(p.modes.map((m) => [m.mode, m.matched, m.respondents])).toEqual([
      ["Rail", true, 2],
      ["Underground or metro", true, 1],
      ["Hovercraft", false, 1],
    ]);
    expect(p.skipped).toEqual([
      { mode: "Cycling", reason: "zero_emission", respondents: 1 },
      { mode: "Bus", reason: "no_distance", respondents: 1 },
    ]);
  });

  it("writes the scaling line", () => {
    expect(scaleText(1000, 4000)).toBe("scaled × 4.0 to 4,000 employees");
    expect(scaleText(3, null)).toBeNull();
  });
});
