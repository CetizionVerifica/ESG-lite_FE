import { describe, expect, it } from "vitest";
import {
  PX_PER_MM,
  alignFrames,
  boundsOf,
  clampCrop,
  clampIntoPage,
  coverCrop,
  distributeFrames,
  dominantAxis,
  frameCorners,
  gapsAlong,
  hitTest,
  mmToPx,
  normaliseRotation,
  pxToMm,
  resizeFrame,
  rotatedBounds,
  rotationFromPointer,
  tidyUp,
  zoomCrop,
  TIDY_DEFAULT_GAP_MM,
} from "./geometry";
import type { Frame } from "./contracts";

const f = (x: number, y: number, w: number, h: number, rotation = 0): Frame => ({ x, y, w, h, rotation });
const close = (a: number, b: number, eps = 0.02) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

describe("geometry", () => {
  it("mm ↔ px at zoom round-trips (96 dpi)", () => {
    expect(mmToPx(25.4)).toBeCloseTo(96);
    expect(mmToPx(10, 2)).toBeCloseTo(10 * PX_PER_MM * 2);
    expect(pxToMm(mmToPx(123.4, 0.78), 0.78)).toBeCloseTo(123.4);
  });

  it("rotated bounding boxes", () => {
    expect(rotatedBounds(f(10, 10, 40, 20))).toEqual({ x: 10, y: 10, w: 40, h: 20 });
    const b = rotatedBounds(f(10, 10, 40, 20, 90));
    close(b.x, 20);
    close(b.y, 0);
    close(b.w, 20);
    close(b.h, 40);
    const d = rotatedBounds(f(0, 0, 10, 10, 45));
    close(d.w, Math.SQRT2 * 10);
    expect(normaliseRotation(270)).toBe(-90);
    expect(normaliseRotation(-180)).toBe(180);
    expect(frameCorners(f(0, 0, 10, 10))[2]).toEqual({ x: 10, y: 10 });
  });

  it("hit testing respects rotation", () => {
    const r = f(0, 0, 40, 4, 90); // a tall thin bar centred at (20, 2)
    expect(hitTest(r, { x: 20, y: 15 })).toBe(true);
    expect(hitTest(r, { x: 35, y: 2 })).toBe(false);
    expect(hitTest(f(0, 0, 10, 10), { x: 10.5, y: 5 }, 1)).toBe(true);
  });

  it("align to a target box (left, centre, bottom)", () => {
    const page = { x: 0, y: 0, w: 210, h: 297 };
    const [a] = alignFrames([f(30, 40, 50, 20)], "center", page);
    expect(a.x).toBe(80);
    const [b] = alignFrames([f(30, 40, 50, 20)], "bottom", page);
    expect(b.y).toBe(277);
    const [c] = alignFrames([f(30, 40, 50, 20, 90)], "left", page);
    close(c.x, -15); // the rotated box (20 wide, centred) has its left edge on 0
  });

  it("distributes equal gaps between the outer frames", () => {
    const out = distributeFrames([f(0, 0, 10, 10), f(50, 0, 10, 10), f(14, 0, 10, 10)], "x");
    expect(gapsAlong(out, "x")).toEqual([15, 15]);
    expect(out[0].x).toBe(0);
    expect(out[1].x).toBe(50);
  });

  it("tidy up spaces three tiles equally on the dominant axis and lines them up", () => {
    const tiles = [f(20, 100, 40, 30), f(70, 104, 40, 30), f(130, 98, 40, 30)];
    expect(dominantAxis(tiles)).toBe("x");
    const out = tidyUp(tiles);
    const gaps = gapsAlong(out, "x");
    expect(gaps[0]).toBe(gaps[1]);
    expect(gaps[0]).toBe(15); // mean of 10 and 20
    expect(out.map((t) => t.y)).toEqual([100, 100, 100]);
    expect(out[0].x).toBe(20);
    // Overlapping tiles get the default gap.
    const stacked = tidyUp([f(10, 10, 20, 20), f(10, 20, 20, 20), f(10, 30, 20, 20)]);
    expect(gapsAlong(stacked, "y")).toEqual([TIDY_DEFAULT_GAP_MM, TIDY_DEFAULT_GAP_MM]);
  });

  it("resizes from handles; the opposite side stays", () => {
    expect(resizeFrame(f(10, 10, 40, 20), "se", 10, 5)).toEqual(f(10, 10, 50, 25));
    expect(resizeFrame(f(10, 10, 40, 20), "nw", 10, 5)).toEqual(f(20, 15, 30, 15));
    expect(resizeFrame(f(10, 10, 40, 20), "e", 10, 99)).toEqual(f(10, 10, 50, 20));
    // Shift keeps the ratio.
    const r = resizeFrame(f(0, 0, 40, 20), "se", 40, 0, { keepRatio: true });
    expect(r).toEqual(f(0, 0, 80, 40));
    // From the centre.
    expect(resizeFrame(f(10, 10, 40, 20), "e", 5, 0, { fromCentre: true })).toEqual(f(5, 10, 50, 20));
    // Never below the minimum.
    expect(resizeFrame(f(10, 10, 40, 20), "e", -100, 0).w).toBe(2);
  });

  it("resizes a rotated frame along its own sides", () => {
    const start = f(0, 0, 40, 20, 90);
    // At 90°, the element's local +x points down the page.
    const r = resizeFrame(start, "e", 0, 10);
    expect(r.w).toBe(50);
    expect(r.h).toBe(20);
    // The west edge (now at the top of the page) stays where it was.
    const before = rotatedBounds(start);
    const after = rotatedBounds(r);
    close(after.y, before.y);
  });

  it("rotation from the pointer, with Shift steps and sticky right angles", () => {
    const c = { x: 50, y: 50 };
    expect(rotationFromPointer(c, { x: 50, y: 0 })).toBe(0);
    expect(rotationFromPointer(c, { x: 100, y: 50 })).toBe(90);
    expect(rotationFromPointer(c, { x: 100, y: 52 })).toBe(90); // within 3°
    expect(rotationFromPointer(c, { x: 100, y: 20 }, true)).toBe(60);
  });

  it("keeps drops inside the page", () => {
    expect(clampIntoPage(f(-5, 290, 20, 20), { wMm: 210, hMm: 297 })).toEqual(f(0, 277, 20, 20));
  });

  it("crop: cover, clamp and zoom", () => {
    expect(coverCrop(40, 40, 2400, 1600)).toEqual({ x: -10, y: 0, w: 60, h: 40 });
    expect(clampCrop({ x: 5, y: -50, w: 60, h: 40 }, 40, 40)).toEqual({ x: 0, y: 0, w: 60, h: 40 });
    expect(clampCrop({ x: 0, y: 0, w: 20, h: 20 }, 40, 40)).toEqual({ x: 0, y: 0, w: 40, h: 40 });
    const z = zoomCrop({ x: -10, y: 0, w: 60, h: 40 }, 2, 40, 40);
    expect(z.w).toBe(120);
    expect(z.h).toBe(80);
    expect(z.x).toBeLessThanOrEqual(0);
  });

  it("bounds of several frames", () => {
    expect(boundsOf([f(0, 0, 10, 10), f(20, 30, 10, 10)])).toEqual({ x: 0, y: 0, w: 30, h: 40 });
    expect(boundsOf([])).toBeNull();
  });
});
