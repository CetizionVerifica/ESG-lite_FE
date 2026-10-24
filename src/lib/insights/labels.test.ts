import { describe, expect, it } from "vitest";
import { TARGET_STATUSES } from "./contracts";
import { STATUS_TONE, STATUS_WORD, changeText, goodFor, monthLabel, pctNumber, unitText } from "./labels";

describe("insights labels", () => {
  it("has a word and a tone for every status", () => {
    for (const s of TARGET_STATUSES) {
      expect(STATUS_WORD[s]).toBeTruthy();
      expect(STATUS_TONE[s]).toBeTruthy();
    }
  });

  it("puts a server change into words, with the server's good/bad", () => {
    expect(changeText(-19.1, true, "2025")).toEqual({ arrow: "down", short: "−19%", words: "down 19% on 2025", tone: "good" });
    expect(changeText(42, false)).toEqual({ arrow: "up", short: "+42%", words: "up 42%", tone: "bad" });
    expect(changeText(8.08, null, "2025")?.words).toBe("up 8.1% on 2025");
    expect(changeText(0.01, true)?.tone).toBe("neutral");
    expect(changeText(null, true)).toBeNull();
  });

  it("rounds percentages for display: one decimal under 10", () => {
    expect(pctNumber(3.44)).toBe("3.4");
    expect(pctNumber(3)).toBe("3");
    expect(pctNumber(42.4)).toBe("42");
  });

  it("knows which direction is good", () => {
    expect(goodFor(-5, "down")).toBe(true);
    expect(goodFor(5, "down")).toBe(false);
    expect(goodFor(5, "up")).toBe(true);
    expect(goodFor(0, "up")).toBeNull();
  });

  it("formats months and units", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(unitText("tCO2e/t")).toBe("tCO₂e/t");
  });
});
