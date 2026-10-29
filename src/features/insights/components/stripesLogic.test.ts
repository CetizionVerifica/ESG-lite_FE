import { describe, expect, it } from "vitest";
import { stripesData } from "../../../test/msw/insightsData";
import { heatStep, showStripes, stripeCells, stripesSentence } from "./stripesLogic";

describe("stripes (IN-8)", () => {
  it("puts each month on a heat step between min and max; blanks stay blank", () => {
    expect(heatStep(0, 0, 100)).toBe(0);
    expect(heatStep(100, 0, 100)).toBe(4);
    expect(heatStep(50, 0, 100)).toBe(2);
    expect(heatStep(null, 0, 100)).toBeNull();
    expect(heatStep(5, 5, 5)).toBe(2);
  });

  it("hides with fewer than 12 months", () => {
    expect(showStripes(stripesData)).toBe(true);
    expect(showStripes({ ...stripesData, months: stripesData.months.slice(0, 11), values: stripesData.values.slice(0, 11) })).toBe(false);
  });

  it("labels months and says the ends in words from server values only", () => {
    const cells = stripeCells(stripesData);
    expect(cells).toHaveLength(69);
    expect(cells[0].text).toBe("Jan 2021: 4,300.000 tCO₂e");
    expect(stripesSentence(stripesData)).toBe("Monthly emissions from Jan 2021 to Sep 2026: 4,300.000 tCO₂e in the first month and 3,280.000 tCO₂e in the last; darker is higher.");
  });
});
