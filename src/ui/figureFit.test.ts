import { describe, expect, it } from "vitest";
import { fitFigureSize } from "./figureFit";

/** The px a CSS clamp(min, Xcqi, max) gives in a tile `width` px wide (1rem = 16px). */
const px = (size: string, width: number) => {
  const [, min, cqi, max] = /^clamp\(([\d.]+)rem, ([\d.]+)cqi, ([\d.]+)rem\)$/.exec(size)!.map(Number);
  return Math.min(max * 16, Math.max(min * 16, (cqi / 100) * width));
};
const glyph = 0.6; // IBM Plex Mono advance width, em

describe("fitFigureSize (#209)", () => {
  it("steps the size down with the figure's length", () => {
    expect(fitFigureSize("1,234.567", "1.5rem")).toBe("clamp(0.75rem, 17.78cqi, 1.5rem)");
    expect(fitFigureSize("92%", "1.875rem")).toBe("clamp(0.75rem, 53.33cqi, 1.875rem)");
  });

  it("keeps the full size when the figure fits", () => {
    expect(px(fitFigureSize("1,234.567", "1.5rem"), 240)).toBe(24);
    expect(px(fitFigureSize("12", "1.875rem"), 72)).toBe(30);
  });

  it("fits 3-decimal figures in the narrow tiles of a six-tile strip and a phone's half-width tile", () => {
    // Tile content widths: six tiles at 1024 px and 768 px, a 2-column tile at 390 px.
    for (const [text, width] of [["1,234.567", 110.5], ["12.500", 71.7], ["1,234.567", 71.7], ["123,456.789", 146], ["123,456.789", 110.5]] as const) {
      const size = px(fitFigureSize(text, "1.5rem"), width);
      expect(text.length * glyph * size).toBeLessThanOrEqual(width);
      expect(size).toBeGreaterThanOrEqual(12);
    }
  });
});
