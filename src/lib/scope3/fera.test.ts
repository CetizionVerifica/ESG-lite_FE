import { describe, expect, it } from "vitest";
import { cat3PreviewText, feraSubLabel, feraSubShort, isScope2, sortTwins, splitFeraFactors, twinsTotal, upstreamSubFor } from "./fera";

describe("Category 3 sub-activities", () => {
  it("labels each twin by its sub-activity", () => {
    expect(feraSubLabel("3a_upstream_fuels")).toBe("Category 3 · Upstream of fuels");
    expect(feraSubLabel("3b_upstream_electricity")).toBe("Category 3 · Upstream of electricity");
    expect(feraSubLabel("3c_td_losses")).toBe("Category 3 · T&D losses");
    expect(feraSubLabel(null)).toBe("Category 3 · Fuel- and energy-related activities");
  });

  it("picks upstream of electricity for Scope 2 parents, upstream of fuels otherwise", () => {
    for (const s of ["Scope 2", "scope2", "S2", " scope-2 "]) expect(isScope2(s)).toBe(true);
    expect(upstreamSubFor("Scope 2")).toBe("3b_upstream_electricity");
    expect(upstreamSubFor("Scope 1")).toBe("3a_upstream_fuels");
    expect(upstreamSubFor(null)).toBe("3a_upstream_fuels");
  });

  it("splits FERA factors as the backend does", () => {
    const f = [{ id: 1, factor_type: "wtt" }, { id: 2, factor_type: "td_loss" }, { id: 3, factor_type: null }, { id: 4 }];
    const { upstream, tdLoss } = splitFeraFactors(f);
    expect(upstream.map((x) => x.id)).toEqual([1, 3, 4]);
    expect(tdLoss.map((x) => x.id)).toEqual([2]);
  });

  it("keeps only the target year's FERA factors, as the backend twin lookup does", () => {
    const f = [{ id: 1, factor_type: "wtt", year: 2024 }, { id: 2, factor_type: "td_loss", year: 2023 }, { id: 3, factor_type: "td_loss", year: 2024 }];
    const { upstream, tdLoss } = splitFeraFactors(f, 2024);
    expect(upstream.map((x) => x.id)).toEqual([1]);
    expect(tdLoss.map((x) => x.id)).toEqual([3]);
    expect(splitFeraFactors(f, 2022).tdLoss).toEqual([]);
    expect(splitFeraFactors(f).tdLoss.map((x) => x.id)).toEqual([2, 3]);
  });

  it("gives the short sub-activity name", () => {
    expect(feraSubShort("3c_td_losses")).toBe("T&D losses");
    expect(feraSubShort(null)).toBe("Fuel- and energy-related activities");
  });

  it("orders and sums a parent's twins", () => {
    const twins = [{ scope3_sub: "3c_td_losses", total_emission: "40.00" }, { scope3_sub: "3b_upstream_electricity", total_emission: 60 }];
    expect(sortTwins(twins).map((t) => t.scope3_sub)).toEqual(["3b_upstream_electricity", "3c_td_losses"]);
    expect(twinsTotal(twins)).toBe(100);
  });

  it("writes the Add data preview line", () => {
    const fmt = (n: number) => n.toFixed(2);
    expect(cat3PreviewText([{ sub: "3b_upstream_electricity", value: 60 }, { sub: "3c_td_losses", value: 40 }], fmt)).toBe(
      "+ Cat 3 60.00 tCO₂e (upstream of electricity) + 40.00 tCO₂e (T&D losses), added on save",
    );
    expect(cat3PreviewText([{ sub: "3a_upstream_fuels", value: 0.61 }, { sub: "3c_td_losses", value: null }], fmt)).toBe("+ Cat 3 0.61 tCO₂e (upstream of fuels), added on save");
    expect(cat3PreviewText([{ sub: "3a_upstream_fuels", value: null }], fmt)).toBeNull();
  });
});
