import { describe, expect, it } from "vitest";
import type { BomLine, MatchedLine } from "../../services/pcfAiService";
import type { MaterialFactor } from "./api";
import { applyPicks, defaultPicks, lineFromBom, matchRequestFor, needsFactor, toAiConfidence } from "./ai";
import { blankLine, needsConfirm } from "./logic";

const bom = (values: Record<string, unknown>, confidence = 90): BomLine => ({ line: 2, values, confidence, reason: "Row 2", warnings: [], problems: [], by: "sheet" });

const factor = (id: number, name: string, extra: Partial<MaterialFactor> = {}): MaterialFactor => ({
  material_factor_id: id,
  name,
  material_group: "aluminium",
  geography: "GLO",
  unit: "kg",
  value_kgco2e: 8,
  value_hidden: false,
  source: "IAI",
  source_year: 2023,
  licence: "open",
  recycled_variant: false,
  ...extra,
});

describe("lineFromBom", () => {
  it("turns the reader's values into an AI-suggested editor line with its confidence as 0–1", () => {
    const l = lineFromBom(bom({ stage: "A1", name: "Aluminium ingot", quantity: "1010", unit: "kg", supplier_name: "Alba", origin_country: "BH", recycled_share_pct: 20, data_type: "secondary" }, 85));
    expect(l).toMatchObject({ stage: "A1", name: "Aluminium ingot", quantity: 1010, unit: "kg", supplier_name: "Alba", origin_country: "BH", recycled_share_pct: 20, ai_suggested: true, ai_confidence: 0.85, material_factor_id: null });
    expect(needsConfirm(l)).toBe(false);
  });

  it("keeps the reader's stage, defaults an unknown one to A1 and leaves a missing quantity empty", () => {
    expect(lineFromBom(bom({ stage: "A3_packaging", name: "Pallet", quantity: 1, unit: "unit" })).stage).toBe("A3_packaging");
    const l = lineFromBom(bom({ stage: "B7", name: "Mystery", quantity: null, unit: "" }, 40));
    expect(l.stage).toBe("A1");
    expect(l.quantity).toBeNull();
    expect(l.unit).toBe("kg");
    expect(needsConfirm(l)).toBe(true);
  });

  it("clamps confidence into 0–1", () => {
    expect(toAiConfidence(120)).toBe(1);
    expect(toAiConfidence(-5)).toBe(0);
  });
});

describe("matchRequestFor", () => {
  it("sends only the lines that need a factor and leaves recycled variants out of the candidates", () => {
    const todo = { ...blankLine("A1"), name: "Aluminium ingot", unit: "kg", origin_country: "BH" };
    const priced = { ...blankLine("A1"), name: "Copper", material_factor_id: 3 };
    const supplier = { ...blankLine("A1"), name: "Wire", supplier_pcf_kgco2e: 2 };
    const leg = { ...blankLine("A2"), name: "Truck" };
    const unnamed = blankLine("A1");
    expect([todo, priced, supplier, leg, unnamed].map(needsFactor)).toEqual([true, false, false, false, false]);
    const req = matchRequestFor([todo, priced, supplier, leg, unnamed], [factor(1, "Primary aluminium"), factor(2, "Recycled aluminium", { recycled_variant: true })], "Bahrain");
    expect(req).toEqual({
      lines: [{ id: todo.key, name: "Aluminium ingot", unit: "kg", stage: "A1", origin_country: "BH", supplier_name: null, recycled_share_pct: 0 }],
      factors: [{ material_factor_id: 1, name: "Primary aluminium", material_group: "aluminium", unit: "kg", geography: "GLO", source: "IAI", source_year: 2023, licence: "open", recycled_variant: false }],
      geography_hint: "Bahrain",
    });
  });

  it("is null when nothing needs a factor or the library is empty", () => {
    expect(matchRequestFor([{ ...blankLine("A1"), name: "Copper", material_factor_id: 3 }], [factor(1, "x")], null)).toBeNull();
    expect(matchRequestFor([{ ...blankLine("A1"), name: "Copper" }], [], null)).toBeNull();
  });
});

describe("picks", () => {
  const a = { ...blankLine("A1"), name: "Aluminium ingot" };
  const b = { ...blankLine("A1"), name: "Odd part" };
  const matched: MatchedLine[] = [
    { id: a.key, name: a.name, unmatched: false, suggestions: [{ material_factor_id: 1, name: "Primary aluminium", confidence: 82, reason: "same group", by: "rule" }, { material_factor_id: 4, name: "Other", confidence: 50, reason: "", by: "rule" }] },
    { id: b.key, name: b.name, unmatched: true, suggestions: [{ material_factor_id: 4, name: "Other", confidence: 31, reason: "weak", by: "rule" }] },
  ];

  it("defaults to the first suggestion of each matched line and skips unmatched ones", () => {
    expect(defaultPicks(matched)).toEqual([{ key: a.key, material_factor_id: 1, confidence: 82 }]);
  });

  it("applies a pick as an AI-suggested factor and leaves other lines alone", () => {
    const out = applyPicks([a, b], [{ key: a.key, material_factor_id: 1, confidence: 82 }, { key: b.key, material_factor_id: 4, confidence: 31 }]);
    expect(out[0]).toMatchObject({ material_factor_id: 1, ai_suggested: true, ai_confidence: 0.82 });
    expect(needsConfirm(out[0])).toBe(false);
    expect(out[1]).toMatchObject({ material_factor_id: 4, ai_confidence: 0.31 });
    expect(needsConfirm(out[1])).toBe(true);
    expect(applyPicks([a], [])[0]).toBe(a);
  });
});
