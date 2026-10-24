import { describe, expect, it } from "vitest";
import { groupUses } from "./badges";

describe("groupUses", () => {
  it("gives one badge per framework in GRI, BRSR, ESRS order", () => {
    const b = groupUses([
      { framework: "ESRS", code: "E3-4" },
      { framework: "GRI", code: "303-3" },
      { framework: "BRSR", code: "P6-E3", core: true },
    ]);
    expect(b.map((x) => x.text)).toEqual(["GRI 303-3", "BRSR P6-E3 · Core", "ESRS E3-4"]);
  });

  it("shows the first code and a count when a KPI answers several disclosures of one framework", () => {
    const b = groupUses([
      { framework: "GRI", code: "305-1" },
      { framework: "GRI", code: "305-4" },
      { framework: "GRI", code: "305-1" },
    ]);
    expect(b).toEqual([{ framework: "GRI", codes: ["305-1", "305-4"], core: false, text: "GRI 305-1 +1" }]);
  });

  it("is empty for an unmapped KPI", () => expect(groupUses([])).toEqual([]));
});
