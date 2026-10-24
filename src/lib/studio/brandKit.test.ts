import { describe, expect, it } from "vitest";
import type { BrandKit } from "./contracts";
import { allowedColours, allowedFonts, contrastSummary, draftErrors, draftFromKit, draftsEqual, fontStack, move, paletteContrast, updateFromDraft } from "./brandKit";

const KIT: BrandKit = {
  name: "ACME",
  logos: { primary: "/l.svg", onDark: null },
  colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" },
  defaultLook: "classic",
  fonts: { heading: "fraunces", body: null },
  voice: "Plain.",
  palettes: [{ id: 4, name: "Primary", colors: ["#0f5132", "#ffffff"], sort: 0, contrast: [] }],
  canEdit: true,
  brandControls: false,
  updatedAt: null,
};

describe("brand kit draft", () => {
  it("round-trips a kit into the PUT body, keeping ids and normalising colours", () => {
    const d = draftFromKit(KIT);
    d.palettes.push({ key: "n1", name: "  Charts ", colors: ["#ABC", "#2563EB"] });
    expect(updateFromDraft(d)).toEqual({
      fonts: { heading: "fraunces", body: null },
      voice: "Plain.",
      palettes: [
        { id: 4, name: "Primary", colors: ["#0f5132", "#ffffff"] },
        { name: "Charts", colors: ["#aabbcc", "#2563eb"] },
      ],
    });
    expect(draftsEqual(draftFromKit(KIT), draftFromKit(KIT))).toBe(true);
    expect(draftsEqual(draftFromKit(KIT), d)).toBe(false);
  });

  it("flags what the backend would reject", () => {
    const d = draftFromKit(KIT);
    expect(draftErrors(d)).toEqual({});
    d.voice = "x".repeat(3001);
    d.palettes = [
      { key: "a", name: " ", colors: ["#000000"] },
      { key: "b", name: "B", colors: [] },
      { key: "c", name: "C", colors: Array(11).fill("#000000") },
      { key: "d", name: "D", colors: ["teal"] },
    ];
    expect(Object.keys(draftErrors(d)).sort()).toEqual(["palettes.0.name", "palettes.1.colors", "palettes.2.colors", "palettes.3.colors", "voice"]);
  });

  it("reorders palettes", () => {
    expect(move([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});

describe("contrast", () => {
  it("reports every pair like the backend, with text / graphic verdicts", () => {
    const pairs = paletteContrast(["#0F5132", "#F59E0B", "#FFFFFF"]);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([["#0f5132", "#f59e0b"], ["#0f5132", "#ffffff"], ["#f59e0b", "#ffffff"]]);
    expect(pairs[1]).toMatchObject({ text: true, graphic: true });
    expect(pairs[2]).toMatchObject({ ratio: 2.15, text: false, graphic: false });
    expect(contrastSummary(pairs)).toEqual({ text: 1, graphic: 1, low: 1 });
  });
});

describe("brand controls (DS-13 hook)", () => {
  it("off: any colour and every font", () => {
    expect(allowedColours(KIT)).toBeNull();
    expect(allowedFonts(KIT)).toHaveLength(8);
  });
  it("on: brand colours and the brand pair only", () => {
    const on = { ...KIT, brandControls: true };
    expect(allowedColours(on)).toEqual(["#0f5132", "#f59e0b", "#ffffff"]);
    expect(allowedFonts(on)).toEqual(["fraunces", "source-sans-3"]);
  });
  it("font stacks fall back by family", () => {
    expect(fontStack("fraunces")).toContain("serif");
    expect(fontStack("archivo")).toContain("sans-serif");
  });
});
