import { describe, expect, it } from "vitest";
import { readContext, writeContext } from "./useContextParams";

describe("context URL params", () => {
  it("reads period, sites, category and scope", () => {
    const ctx = readContext(new URLSearchParams("period=2025-Q3&site=3,1,1,x&category=12&scope=2"));
    expect(ctx).toEqual({ period: { kind: "quarter", year: 2025, quarter: 3 }, siteIds: [3, 1], categoryId: 12, scope: 2 });
  });

  it("ignores bad values", () => {
    expect(readContext(new URLSearchParams("period=soon&site=-1&category=abc&scope=4"))).toEqual({
      period: null,
      siteIds: [],
      categoryId: null,
      scope: null,
    });
  });

  it("writes a patch, keeps unrelated keys and clears empty values", () => {
    const next = writeContext(new URLSearchParams("tab=history&site=4&scope=1"), {
      period: { kind: "fy", startYear: 2025 },
      siteIds: [5, 2],
      scope: null,
    });
    expect(next.toString()).toBe("tab=history&site=2%2C5&period=FY2025");
  });
});
