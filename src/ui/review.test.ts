import { describe, expect, it } from "vitest";
import { rejectReasonError, stepIndex } from "./review";

describe("review helpers", () => {
  it("validates reject reasons", () => {
    expect(rejectReasonError("dup")).toMatch(/at least 5/);
    expect(rejectReasonError("  Wrong unit ")).toBeNull();
  });

  it("steps through rows and clamps", () => {
    expect(stepIndex(-1, 1, 3)).toBe(0);
    expect(stepIndex(-1, -1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(-1);
  });
});
