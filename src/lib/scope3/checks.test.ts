import { describe, expect, it } from "vitest";
import { CHECK_COPY, CHECK_IDS, USER_CHECK_IDS, checkLines, factorYearFor, groupRows, heldChip, isReady, parseGroup, readChecks, visibleCheckLines } from "./checks";

describe("review checks (S3-15)", () => {
  it("has fixed copy and an icon for every check id", () => {
    for (const id of CHECK_IDS) {
      const copy = CHECK_COPY[id];
      expect(copy.pass({}).length).toBeGreaterThan(0);
      expect(copy.held({}).length).toBeGreaterThan(0);
      expect(copy.hint({})).toMatch(/\.$/);
      expect(copy.icon).toBeTruthy();
    }
  });

  it("names the year and the change limit", () => {
    expect(heldChip("FACTOR_FOUND", { year: 2026 }).label).toBe("No factor for 2026");
    expect(heldChip("WITHIN_THRESHOLD", { pct: 8 }).label).toBe("Over your 8 % change limit");
    // Without the company's limit, the backend default.
    expect(heldChip("WITHIN_THRESHOLD").label).toBe("Over your 5 % change limit");
    expect(heldChip("FACTOR_FOUND").label).toBe("No factor for this year");
  });

  it("uses sentence case and no colour words", () => {
    for (const id of CHECK_IDS) {
      for (const text of [CHECK_COPY[id].pass({}), CHECK_COPY[id].held({})]) {
        expect(text.charAt(0)).toBe(text.charAt(0).toUpperCase());
        expect(text).not.toMatch(/\b(red|green|amber)\b/i);
      }
    }
  });

  it("reads the API's checks, dropping unknown ids and keeping contract order", () => {
    expect(readChecks(undefined)).toBeUndefined();
    expect(readChecks(null)).toBeNull();
    expect(readChecks({ ready: true, held: [] })).toEqual({ ready: true, held: [] });
    expect(readChecks({ ready: false, held: ["NO_DUPLICATE", "BOGUS", "FACTOR_FOUND", "NO_DUPLICATE"] })).toEqual({
      ready: false,
      held: ["FACTOR_FOUND", "NO_DUPLICATE"],
    });
    // Ready with something held is not ready.
    expect(readChecks({ ready: true, held: ["UNIT_OK"] })).toEqual({ ready: false, held: ["UNIT_OK"] });
  });

  it("counts a pending row without checks as needing attention", () => {
    expect(isReady(null)).toBe(false);
    expect(isReady(undefined)).toBe(false);
    expect(isReady({ ready: true, held: [] })).toBe(true);
    const rows = [
      { id: 1, status: "pending", checks: { ready: true, held: [] } },
      { id: 2, status: "pending", checks: { ready: false, held: ["EVIDENCE_ATTACHED"] } },
      { id: 3, status: "pending", checks: null },
      { id: 4, status: "approved", checks: { ready: true, held: [] } },
    ];
    const g = groupRows(rows);
    expect(g.ready.map((r) => r.id)).toEqual([1]);
    expect(g.attention.map((r) => r.id)).toEqual([2, 3]);
  });

  it("lists every check with pass or fail, as the server held them", () => {
    const lines = checkLines({ ready: false, held: ["WITHIN_THRESHOLD", "METHOD_GIVEN"] }, { pct: 5, year: 2025 });
    expect(lines.map((l) => l.id)).toEqual([...CHECK_IDS]);
    expect(lines.filter((l) => !l.passed).map((l) => l.label)).toEqual(["Over your 5 % change limit", "No method chosen"]);
    expect(lines.find((l) => l.id === "FACTOR_FOUND")?.label).toBe("Factor found for 2025");
  });

  it("names the factor year FACTOR_FOUND looks for: the entry's year − 1", () => {
    expect(factorYearFor("2026-03-15")).toBe(2025);
    expect(factorYearFor("2026-03-15T00:00:00.000Z")).toBe(2025);
    expect(factorYearFor("")).toBeNull();
    expect(factorYearFor(undefined)).toBeNull();
    expect(heldChip("FACTOR_FOUND", { year: factorYearFor("2026-01-31") }).label).toBe("No factor for 2025");
  });

  it("parses ?group=", () => {
    expect(parseGroup("ready")).toBe("ready");
    expect(parseGroup("attention")).toBe("attention");
    expect(parseGroup("all")).toBeNull();
    expect(parseGroup(null)).toBeNull();
  });
});

describe("visibleCheckLines (Fix and resubmit)", () => {
  it("shows a User only the checks they can act on; reviewers see all eight", () => {
    const checks = { ready: false, held: ["FACTOR_FOUND", "EVIDENCE_ATTACHED"] as ("FACTOR_FOUND" | "EVIDENCE_ATTACHED")[] };
    const user = visibleCheckLines(checks, {}, false);
    expect(user.map((l) => l.id)).toEqual([...USER_CHECK_IDS]);
    expect(user.find((l) => l.id === "EVIDENCE_ATTACHED")?.passed).toBe(false);
    expect(user.some((l) => /factor/i.test(l.label))).toBe(false);
    expect(visibleCheckLines(checks, {}, true)).toHaveLength(8);
  });
});
