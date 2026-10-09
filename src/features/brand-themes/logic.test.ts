import { describe, expect, it } from "vitest";
import { PLANETPULSE, STATUS, STORED_BRANDS } from "../../theme";
import {
  LOOKS,
  contrastGate,
  draftFromBrand,
  dominantColours,
  isDirty,
  lookTokens,
  previewPack,
  reportYears,
  resetToDefaults,
  toUpdate,
  validate,
  type SavedBrand,
} from "./logic";

const midal: SavedBrand = {
  companyId: 1,
  name: "Midal Cables",
  primary: "#0B2E5C",
  accent: "#2f6fb0",
  coverFrom: "#061933",
  coverTo: "#0b2e5c",
  logoUrl: "https://r2.example/1/logo.png",
  logoOnDarkUrl: null,
  defaultLook: "classic",
  scope3Colour: null,
  updatedAt: "2026-10-01T10:00:00.000Z",
};

describe("draft", () => {
  it("starts from the saved brand, normalising colours", () => {
    const d = draftFromBrand(midal);
    expect(d).toMatchObject({ name: "Midal Cables", primary: "#0b2e5c", defaultLook: "classic", scope3Colour: null, logoFile: null });
  });

  it("falls back to backend defaults for bad or missing fields", () => {
    const d = draftFromBrand({ ...midal, primary: "nope", defaultLook: undefined });
    expect(d.primary).toBe("#1f2a44");
    expect(d.defaultLook).toBe("classic");
  });

  it("is dirty on any field change or staged logo, not otherwise", () => {
    const saved = draftFromBrand(midal);
    expect(isDirty({ ...saved }, saved)).toBe(false);
    expect(isDirty({ ...saved, accent: "#123456" }, saved)).toBe(true);
    expect(isDirty({ ...saved, logoFile: new File(["x"], "l.png") }, saved)).toBe(true);
    expect(isDirty({ ...saved, removeDarkLogo: true }, saved)).toBe(true);
  });

  it("reset keeps the name and logos but takes PlanetPulse colours", () => {
    const file = new File(["x"], "l.png");
    const r = resetToDefaults({ ...draftFromBrand(midal), logoFile: file });
    expect(r).toMatchObject({ name: "Midal Cables", primary: PLANETPULSE.primary, accent: PLANETPULSE.accent, defaultLook: "light", scope3Colour: null, logoFile: file });
  });
});

describe("toUpdate", () => {
  it("sends every editable field, lower-cased", () => {
    const body = toUpdate({ ...draftFromBrand(midal), name: "  Midal  ", accent: "#ABCDEF", scope3Colour: "#F39A2B" });
    expect(body).toEqual({
      name: "Midal",
      primary: "#0b2e5c",
      accent: "#abcdef",
      coverFrom: "#061933",
      coverTo: "#0b2e5c",
      defaultLook: "classic",
      scope3Colour: "#f39a2b",
    });
  });

  it("clears the dark logo only when removed and nothing new is staged", () => {
    const d = { ...draftFromBrand(midal), removeDarkLogo: true };
    expect(toUpdate(d).logoOnDarkUrl).toBeNull();
    expect("logoOnDarkUrl" in toUpdate({ ...d, darkLogoFile: new File(["x"], "w.png") })).toBe(false);
  });
});

describe("validate", () => {
  it("needs a name and 6-digit hex colours", () => {
    const errors = validate({ ...draftFromBrand(midal), name: " ", coverTo: "#12", scope3Colour: "red" });
    expect(Object.keys(errors).sort()).toEqual(["coverTo", "name", "scope3Colour"]);
    expect(validate(draftFromBrand(midal))).toEqual({});
  });
});

describe("contrast gate", () => {
  it.each(Object.entries(STORED_BRANDS))("stored client %s passes in every look", (_, pack) => {
    for (const look of LOOKS) expect(contrastGate(pack, look).failing).toEqual([]);
  });

  it("PlanetPulse passes too", () => {
    expect(contrastGate(PLANETPULSE, "light").failing).toEqual([]);
  });

  it("reports what the engine adjusted: a light primary is darkened for button text", () => {
    const pack = previewPack(9, { ...draftFromBrand(midal), primary: "#7fd3ff" }, { logoUrl: null, logoOnDarkUrl: null });
    const gate = contrastGate(pack, "light");
    expect(gate.failing).toEqual([]);
    expect(gate.adjustments.some((a) => a.look === "light" && a.text.startsWith("Primary"))).toBe(true);
  });

  it("flags Chieron's amber accent as fill only", () => {
    expect(contrastGate(STORED_BRANDS[6], "light").fillOnlyAccent).toBe(true);
  });

  it("never changes status colours, whatever the brand", () => {
    const greenish = previewPack(9, { ...draftFromBrand(midal), primary: "#16794c", accent: "#b4321f" }, { logoUrl: null, logoOnDarkUrl: null });
    for (const pack of [PLANETPULSE, ...Object.values(STORED_BRANDS), greenish]) {
      for (const look of LOOKS) {
        const t = lookTokens(pack, look);
        const s = STATUS[look === "night" ? "dark" : "light"];
        expect([t.good, t.warn, t.bad, t.info]).toEqual([s.good, s.warn, s.bad, s.info]);
      }
    }
  });
});

describe("dominantColours", () => {
  const px = (r: number, g: number, b: number, a = 255, n = 1) => Array.from({ length: n }, () => [r, g, b, a]).flat();

  it("returns the most common distinct colours, skipping white, grey and transparent pixels", () => {
    const data = [
      ...px(255, 255, 255, 255, 50), // white background
      ...px(0, 0, 0, 0, 50), // transparent
      ...px(128, 128, 128, 255, 30), // grey
      ...px(11, 46, 92, 255, 20), // navy
      ...px(12, 47, 93, 255, 5), // same navy bucket
      ...px(242, 160, 30, 255, 10), // amber
    ];
    const colours = dominantColours(data);
    expect(colours).toHaveLength(2);
    expect(colours[1]).toBe("#f2a01e");
    expect(colours[0]).toMatch(/^#0b2e5c|#0b2e5c$/);
  });

  it("is empty for a blank image", () => {
    expect(dominantColours(px(255, 255, 255, 255, 10))).toEqual([]);
  });
});

it("offers the last five years, newest first", () => {
  expect(reportYears(new Date(2026, 9, 9))).toEqual([2026, 2025, 2024, 2023, 2022]);
});
