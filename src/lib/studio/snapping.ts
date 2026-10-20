// DS-6 · snapping (pure). Targets are the page edges, the safe margin, the
// centre lines, the page's ruler guides, and the other elements' edges and
// centres. A moving box snaps its left/centre/right and top/middle/bottom to
// the nearest target within the threshold (1.5 mm at 100 %, scaled by zoom),
// and to equal spacing between its neighbours. The result says how far to
// shift and which guide lines to draw.
import type { FreeformPage } from "./contracts";
import { rotatedBounds, type Axis, type Box } from "./geometry";

export type SnapKind = "page" | "safe" | "centre" | "guide" | "element";

/** A line to snap to: `axis: "x"` is a vertical line at x = mm. */
export interface SnapTarget {
  axis: Axis;
  mm: number;
  kind: SnapKind;
  /** The extent of the target on the other axis (for drawing), if it has one. */
  span?: [number, number];
}

/** A guide line to draw while dragging. `spacing` guides mark equal gaps. */
export interface SnapGuide {
  axis: Axis;
  mm: number;
  from: number;
  to: number;
  kind: SnapKind | "spacing";
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** Snap distance at 100 % zoom (RS-6). */
export const SNAP_MM = 1.5;
export const thresholdFor = (zoom: number): number => SNAP_MM / Math.max(0.1, zoom);

export interface PageGeometry {
  wMm: number;
  hMm: number;
  safeMm: number;
}

/** Every target on a page, leaving out the elements being moved. Hidden elements don't snap. */
export function snapTargets(page: Pick<FreeformPage, "elements" | "guides">, size: PageGeometry, exclude: Iterable<string> = []): SnapTarget[] {
  const skip = new Set(exclude);
  const { wMm: w, hMm: h, safeMm: s } = size;
  const out: SnapTarget[] = [
    { axis: "x", mm: 0, kind: "page", span: [0, h] },
    { axis: "x", mm: w, kind: "page", span: [0, h] },
    { axis: "x", mm: w / 2, kind: "centre", span: [0, h] },
    { axis: "y", mm: 0, kind: "page", span: [0, w] },
    { axis: "y", mm: h, kind: "page", span: [0, w] },
    { axis: "y", mm: h / 2, kind: "centre", span: [0, w] },
  ];
  if (s > 0) {
    out.push({ axis: "x", mm: s, kind: "safe", span: [0, h] }, { axis: "x", mm: w - s, kind: "safe", span: [0, h] });
    out.push({ axis: "y", mm: s, kind: "safe", span: [0, w] }, { axis: "y", mm: h - s, kind: "safe", span: [0, w] });
  }
  for (const g of page.guides ?? []) out.push({ axis: g.axis, mm: g.mm, kind: "guide", span: g.axis === "x" ? [0, h] : [0, w] });
  for (const el of page.elements) {
    if (skip.has(el.id) || el.hidden) continue;
    const b = rotatedBounds(el.frame);
    for (const mm of [b.x, b.x + b.w / 2, b.x + b.w]) out.push({ axis: "x", mm, kind: "element", span: [b.y, b.y + b.h] });
    for (const mm of [b.y, b.y + b.h / 2, b.y + b.h]) out.push({ axis: "y", mm, kind: "element", span: [b.x, b.x + b.w] });
  }
  return out;
}

/** Other elements' boxes (equal spacing). */
export const neighbourBoxes = (page: Pick<FreeformPage, "elements">, exclude: Iterable<string> = []): Box[] => {
  const skip = new Set(exclude);
  return page.elements.filter((e) => !skip.has(e.id) && !e.hidden).map((e) => rotatedBounds(e.frame));
};

const lines = (b: Box, axis: Axis): number[] => (axis === "x" ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h]);

interface AxisSnap {
  delta: number;
  dist: number;
  hits: SnapTarget[];
}

function snapAxis(box: Box, axis: Axis, targets: SnapTarget[], threshold: number, only?: number[]): AxisSnap | null {
  const mine = lines(box, axis);
  const use = only ? only.map((i) => mine[i]) : mine;
  let best: AxisSnap | null = null;
  for (const t of targets) {
    if (t.axis !== axis) continue;
    for (const m of use) {
      const d = t.mm - m;
      const dist = Math.abs(d);
      if (dist > threshold) continue;
      if (!best || dist < best.dist - 1e-6) best = { delta: d, dist, hits: [t] };
      else if (Math.abs(dist - best.dist) <= 1e-6 && Math.abs(d - best.delta) <= 1e-6) best.hits.push(t);
    }
  }
  return best;
}

function guideFor(t: SnapTarget, moved: Box): SnapGuide {
  const self: [number, number] = t.axis === "x" ? [moved.y, moved.y + moved.h] : [moved.x, moved.x + moved.w];
  const span = t.kind === "element" && t.span ? t.span : t.span ?? self;
  const from = t.kind === "element" ? Math.min(span[0], self[0]) : span[0];
  const to = t.kind === "element" ? Math.max(span[1], self[1]) : span[1];
  return { axis: t.axis, mm: t.mm, from, to, kind: t.kind };
}

/**
 * Equal spacing on one axis: the box sits between two neighbours (that
 * overlap it on the other axis) with the same gap on both sides, or repeats
 * the gap its neighbour has to the next one.
 */
export function equalSpacing(box: Box, others: Box[], axis: Axis, threshold: number): { delta: number; guides: SnapGuide[] } | null {
  const pos = (b: Box) => (axis === "x" ? b.x : b.y);
  const size = (b: Box) => (axis === "x" ? b.w : b.h);
  const cpos = (b: Box) => (axis === "x" ? b.y : b.x);
  const csize = (b: Box) => (axis === "x" ? b.h : b.w);
  const overlaps = (b: Box) => cpos(b) < cpos(box) + csize(box) && cpos(box) < cpos(b) + csize(b);
  const row = others.filter(overlaps);
  const before = row.filter((b) => pos(b) + size(b) <= pos(box) + threshold).sort((a, b) => pos(b) + size(b) - (pos(a) + size(a)));
  const after = row.filter((b) => pos(b) >= pos(box) + size(box) - threshold).sort((a, b) => pos(a) - pos(b));
  const mid = csize(box) / 2 + cpos(box);
  const mark = (from: number, to: number): SnapGuide => ({ axis: axis === "x" ? "y" : "x", mm: mid, from, to, kind: "spacing" });
  const a = before[0];
  const b = after[0];
  if (a && b) {
    const want = (pos(a) + size(a) + pos(b) - size(box)) / 2;
    const d = want - pos(box);
    if (Math.abs(d) <= threshold && want >= pos(a) + size(a)) {
      const l = pos(a) + size(a);
      return { delta: d, guides: [mark(l, want), mark(want + size(box), pos(b))] };
    }
  }
  if (a && before[1]) {
    const g = pos(a) - (pos(before[1]) + size(before[1]));
    if (g > 0) {
      const want = pos(a) + size(a) + g;
      const d = want - pos(box);
      if (Math.abs(d) <= threshold) return { delta: d, guides: [mark(pos(before[1]) + size(before[1]), pos(a)), mark(pos(a) + size(a), want)] };
    }
  }
  if (b && after[1]) {
    const g = pos(after[1]) - (pos(b) + size(b));
    if (g > 0) {
      const want = pos(b) - g - size(box);
      const d = want - pos(box);
      if (Math.abs(d) <= threshold) return { delta: d, guides: [mark(want + size(box), pos(b)), mark(pos(b) + size(b), pos(after[1]))] };
    }
  }
  return null;
}

/**
 * Snaps a moving box. Lines (targets) win over equal spacing when both are in
 * range; the nearer one wins on each axis.
 */
export function snapMove(box: Box, targets: SnapTarget[], threshold: number, others: Box[] = []): SnapResult {
  const out: SnapResult = { dx: 0, dy: 0, guides: [] };
  for (const axis of ["x", "y"] as const) {
    const line = snapAxis(box, axis, targets, threshold);
    const spacing = others.length ? equalSpacing(box, others, axis, threshold) : null;
    const useSpacing = spacing && (!line || Math.abs(spacing.delta) < line.dist - 1e-6);
    const delta = useSpacing ? spacing.delta : line ? line.delta : 0;
    if (axis === "x") out.dx = delta;
    else out.dy = delta;
    const moved = { ...box, x: box.x + out.dx, y: box.y + out.dy };
    if (useSpacing) out.guides.push(...spacing.guides);
    else if (line) out.guides.push(...line.hits.map((t) => guideFor(t, moved)));
  }
  // Guides were computed per axis; re-anchor element guides on the final box.
  const moved = { ...box, x: box.x + out.dx, y: box.y + out.dy };
  out.guides = out.guides.map((g) => (g.kind === "spacing" ? g : { ...g, ...extend(g, moved) }));
  return out;
}

function extend(g: SnapGuide, moved: Box): Pick<SnapGuide, "from" | "to"> {
  if (g.kind !== "element") return { from: g.from, to: g.to };
  const self = g.axis === "x" ? [moved.y, moved.y + moved.h] : [moved.x, moved.x + moved.w];
  return { from: Math.min(g.from, self[0]), to: Math.max(g.to, self[1]) };
}

/**
 * Snaps the edges being dragged in a resize (no rotation): `edges` names
 * which sides move. Returns the corrected box and the guides.
 */
export function snapResize(box: Box, edges: { x?: "start" | "end"; y?: "start" | "end" }, targets: SnapTarget[], threshold: number): { box: Box; guides: SnapGuide[] } {
  const next = { ...box };
  const guides: SnapGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const edge = edges[axis];
    if (!edge) continue;
    const idx = edge === "start" ? 0 : 2;
    const s = snapAxis(next, axis, targets, threshold, [idx]);
    if (!s) continue;
    if (axis === "x") {
      if (edge === "start") {
        next.x += s.delta;
        next.w -= s.delta;
      } else next.w += s.delta;
    } else if (edge === "start") {
      next.y += s.delta;
      next.h -= s.delta;
    } else next.h += s.delta;
    guides.push(...s.hits.map((t) => guideFor(t, next)));
  }
  return { box: next, guides };
}

/** The nearest guide to a page point on `axis` within `threshold` (pick a guide to drag). */
export function guideAt(guides: { axis: Axis; mm: number }[], axis: Axis, mm: number, threshold: number): number {
  let best = -1;
  let dist = Infinity;
  guides.forEach((g, i) => {
    const d = Math.abs(g.mm - mm);
    if (g.axis === axis && d <= threshold && d < dist) {
      best = i;
      dist = d;
    }
  });
  return best;
}

/** Ruler ticks in mm for a length at a zoom: a labelled step that stays ≥ 40 px apart. */
export function rulerTicks(lengthMm: number, zoom: number, fromMm = 0): { mm: number; major: boolean }[] {
  const pxPerMm = (96 / 25.4) * zoom;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200];
  const major = steps.find((s) => s * pxPerMm >= 40) ?? 200;
  const minor = major / (major % 5 === 0 ? 5 : 2);
  const out: { mm: number; major: boolean }[] = [];
  const start = Math.ceil(fromMm / minor) * minor;
  for (let mm = start; mm <= fromMm + lengthMm + 1e-6; mm += minor) {
    const v = Math.round(mm * 1000) / 1000;
    out.push({ mm: v, major: Math.abs(v / major - Math.round(v / major)) < 1e-6 });
  }
  return out;
}
