import { describe, expect, it } from "vitest";
import { GHG_CATEGORIES, METHOD_KEYS } from "./contracts";
import { categoryLabel, dqLabel, methodLabel } from "./labels";

describe("Scope 3 contracts (mirror of ESG-lite src/scope3/contracts)", () => {
  it("has the 15 categories in order, 1–8 upstream and 9–15 downstream, with unique keys", () => {
    expect(GHG_CATEGORIES.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(new Set(GHG_CATEGORIES.map((c) => c.key)).size).toBe(15);
    for (const c of GHG_CATEGORIES) expect(c.direction).toBe(c.n <= 8 ? "upstream" : "downstream");
  });

  it("offers every category at least one method, each once, all known", () => {
    for (const c of GHG_CATEGORIES) {
      const keys = c.methods.map((o) => o.key);
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(METHOD_KEYS).toContain(k);
    }
  });
});

describe("Scope 3 labels", () => {
  it("names a category by number then its exact GHG Protocol name", () => {
    expect(categoryLabel(1)).toBe("Category 1 · Purchased goods and services");
    expect(categoryLabel(15)).toBe("Category 15 · Investments");
    expect(categoryLabel(99)).toBe("Category 99");
  });

  it("uses a category's own method wording where it has one", () => {
    expect(methodLabel("spend_based")).toBe("From the amount spent");
    expect(methodLabel("average_data", 1)).toBe("Average for the material");
    expect(methodLabel("average_data", 7)).toBe("Headcount × national average");
    expect(methodLabel("distance_based", 4)).toBe("Weight × distance");
    expect(methodLabel("site_specific", 9)).toBe("Warehouse energy");
    expect(methodLabel("average_data", 8)).toBe("Average data");
    expect(methodLabel("lessor_specific")).toBe("Lessor-specific");
    expect(methodLabel("average_data", null)).toBe("Average data");
    expect(methodLabel("tonne.km")).toBe("tonne.km");
  });

  it("says data quality in words", () => {
    expect([dqLabel(1), dqLabel(2), dqLabel(3), dqLabel(null)]).toEqual(["Good", "Fair", "Poor", "Not scored"]);
  });
});
