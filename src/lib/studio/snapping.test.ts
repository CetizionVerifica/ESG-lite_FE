import { describe, expect, it } from "vitest";
import type { Element, FreeformPage } from "./contracts";
import { equalSpacing, guideAt, rulerTicks, snapMove, snapResize, snapTargets, thresholdFor } from "./snapping";

const el = (id: string, x: number, y: number, w: number, h: number): Element => ({ id, type: "shape", frame: { x, y, w, h, rotation: 0 }, z: 0, source: "user", props: { shape: "rect" } });
const page = (elements: Element[], guides: FreeformPage["guides"] = []): FreeformPage => ({ id: "p", kind: "freeform", name: "P", background: {}, elements, guides });
const A4 = { wMm: 210, hMm: 297, safeMm: 10 };

describe("snapping", () => {
  it("threshold is 1.5 mm at 100 % and scales with zoom", () => {
    expect(thresholdFor(1)).toBe(1.5);
    expect(thresholdFor(2)).toBe(0.75);
  });

  it("snaps to the page centre and draws its guide", () => {
    const t = snapTargets(page([]), A4);
    const r = snapMove({ x: 79.2, y: 50, w: 50, h: 20 }, t, 1.5);
    expect(r.dx).toBeCloseTo(0.8); // centre 104.2 → 105
    expect(r.guides.some((g) => g.axis === "x" && g.mm === 105 && g.kind === "centre")).toBe(true);
  });

  it("snaps to the safe margin and to another element's edge", () => {
    const p = page([el("a", 40, 100, 30, 30)]);
    const t = snapTargets(p, A4, ["moving"]);
    expect(snapMove({ x: 11, y: 200, w: 10, h: 10 }, t, 1.5).dx).toBe(-1);
    const r = snapMove({ x: 71, y: 140, w: 10, h: 10 }, t, 1.5);
    expect(r.dx).toBe(-1); // left edge to a's right edge (70)
    expect(r.guides.find((g) => g.kind === "element")?.mm).toBe(70);
  });

  it("guides take part in snapping", () => {
    const t = snapTargets(page([], [{ axis: "y", mm: 120 }]), A4);
    const r = snapMove({ x: 50, y: 119, w: 20, h: 10 }, t, 1.5);
    expect(r.dy).toBe(1);
    expect(r.guides.some((g) => g.kind === "guide" && g.axis === "y" && g.mm === 120)).toBe(true);
  });

  it("hidden and excluded elements don't snap", () => {
    const hidden = { ...el("h", 40, 40, 30, 30), hidden: true };
    const t = snapTargets(page([hidden, el("me", 40, 40, 30, 30)]), A4, ["me"]);
    expect(t.filter((x) => x.kind === "element")).toHaveLength(0);
  });

  it("equal spacing between two neighbours", () => {
    const others = [
      { x: 20, y: 100, w: 30, h: 30 },
      { x: 120, y: 100, w: 30, h: 30 },
    ];
    // Midway is x = 70 for a 30-wide box (gaps 20 / 20).
    const r = equalSpacing({ x: 71, y: 100, w: 30, h: 30 }, others, "x", 1.5);
    expect(r?.delta).toBe(-1);
    expect(r?.guides).toHaveLength(2);
    expect(snapMove({ x: 71, y: 100, w: 30, h: 30 }, [], 1.5, others).dx).toBe(-1);
  });

  it("equal spacing repeats a neighbour's gap", () => {
    const others = [
      { x: 10, y: 0, w: 20, h: 20 },
      { x: 40, y: 0, w: 20, h: 20 },
    ];
    expect(equalSpacing({ x: 71, y: 0, w: 20, h: 20 }, others, "x", 1.5)?.delta).toBe(-1); // gap 10 again → 70
  });

  it("resize snaps only the dragged edge", () => {
    const t = snapTargets(page([]), A4);
    const { box } = snapResize({ x: 20, y: 20, w: 179, h: 50 }, { x: "end" }, t, 1.5);
    expect(box.x).toBe(20);
    expect(box.w).toBe(180); // right edge to the safe margin at 200
  });

  it("finds a guide near a point, and ruler ticks", () => {
    expect(guideAt([{ axis: "x", mm: 50 }, { axis: "y", mm: 50 }], "y", 50.6, 1)).toBe(1);
    expect(guideAt([{ axis: "x", mm: 50 }], "x", 60, 1)).toBe(-1);
    const ticks = rulerTicks(210, 1);
    expect(ticks[0]).toEqual({ mm: 0, major: true });
    expect(ticks.filter((t) => t.major).map((t) => t.mm)).toContain(200);
  });
});
