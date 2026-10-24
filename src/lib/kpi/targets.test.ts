import { describe, expect, it } from "vitest";
import { suggestDirection, targetText } from "./targets";

describe("targetText", () => {
  const t = { baseline_year: 2024, target_year: 2030 };
  it("reads a reduction, an increase and a level", () => {
    expect(targetText({ ...t, baseline_value: 48000, target_value: 38400, direction: "reduce" })).toBe("−20 % by 2030 from 2024");
    expect(targetText({ ...t, baseline_value: 20, target_value: 23, direction: "increase" })).toBe("+15 % by 2030 from 2024");
    expect(targetText({ ...t, baseline_value: 5, target_value: 5, direction: "maintain" })).toBe("Keep level to 2030 from 2024");
  });
  it("words a target from a zero baseline without a percent", () => {
    expect(targetText({ ...t, baseline_value: 0, target_value: 40, direction: "increase" })).toBe("Up to 40 by 2030 from 2024");
  });
});

describe("suggestDirection", () => {
  it("follows the sign", () => {
    expect(suggestDirection(10, 8)).toBe("reduce");
    expect(suggestDirection(10, 12)).toBe("increase");
    expect(suggestDirection(10, 10)).toBe("maintain");
    expect(suggestDirection(null, 10)).toBeNull();
  });
});
