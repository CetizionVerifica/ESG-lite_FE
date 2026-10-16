import { describe, expect, it } from "vitest";
import { leaseBoundary, leaseBoundaryNote } from "./assets";

describe("leaseBoundary (mirrors ESG-lite src/scope3/assets/boundary.ts)", () => {
  it("covers 2 roles × 2 lease types × 3 approaches", () => {
    const approaches = ["operational_control", "financial_control", "equity_share"] as const;
    const expected = {
      lessee: { finance: ["scope12", "scope12", "scope12"], operating: ["scope12", "cat8", "cat8"] },
      lessor: { finance: ["cat13", "cat13", "cat13"], operating: ["cat13", "scope12", "scope12"] },
    } as const;
    for (const role of ["lessee", "lessor"] as const)
      for (const type of ["finance", "operating"] as const)
        approaches.forEach((a, i) => expect(leaseBoundary(role, type, a)).toBe(expected[role][type][i]));
  });
  it("franchises, missing type and no role", () => {
    expect(leaseBoundary("franchisor", null, "equity_share")).toBe("cat14");
    expect(leaseBoundary("franchisee", null, "equity_share")).toBe("scope12");
    expect(leaseBoundary("lessee", null, "equity_share")).toBeNull();
    expect(leaseBoundary(null, "finance", "equity_share")).toBeNull();
  });
  it("writes the server's note", () => {
    expect(leaseBoundaryNote("lessee", "operating", "financial_control")).toBe(
      "With financial control, this site's energy belongs in Category 8 · Upstream leased assets.",
    );
    expect(leaseBoundaryNote("lessee", "finance", "financial_control")).toBe("With financial control, this site's energy belongs in your Scope 1 and 2.");
    expect(leaseBoundaryNote("lessor", null, null)).toMatch(/Choose the lease type/);
    expect(leaseBoundaryNote(null, null, null)).toBeNull();
  });
});
