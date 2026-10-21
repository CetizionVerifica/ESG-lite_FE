import { describe, expect, it } from "vitest";
import { SLIDES, clampSlide, slidesFor } from "./slides";

describe("present slides (IN-8)", () => {
  it("follow 05-ux §8 order", () => {
    expect(SLIDES.map((s) => s.id)).toEqual(["summary", "decoupling", "ring", "pathway", "wall", "cards"]);
    expect(SLIDES[0].slots).toEqual(["stripes", "hero"]);
    expect(SLIDES[0].cover).toBe(true);
  });

  it("drop the ESG ring without KPI tracking", () => {
    expect(slidesFor(false).map((s) => s.id)).toEqual(["summary", "decoupling", "pathway", "wall", "cards"]);
    expect(slidesFor(true)).toHaveLength(6);
  });

  it("stop at the ends", () => {
    expect(clampSlide(-1, 6)).toBe(0);
    expect(clampSlide(9, 6)).toBe(5);
  });
});
