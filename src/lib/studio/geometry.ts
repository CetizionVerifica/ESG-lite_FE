// DS-6 · editor geometry (pure). Frames are millimetres on the doc's format,
// origin top-left, rotation in degrees about the frame's centre (as the
// renderer draws them: `transform: rotate()` with the default origin).
//
//   mm ↔ px at a zoom (1 = 100 % = 96 dpi CSS px, the renderer's `mm` unit);
//   rotated bounding boxes, hit testing, unions;
//   align, distribute and tidy up;
//   resize from any of 8 handles in the element's own (rotated) axes, rotate
//   from a pointer angle, crop maths for frames and images.
import type { Crop, Frame } from "./contracts";

/** CSS px per mm at 96 dpi (the renderer's PX_PER_MM). */
export const PX_PER_MM = 96 / 25.4;

export const mmToPx = (mm: number, zoom = 1): number => mm * PX_PER_MM * zoom;
export const pxToMm = (px: number, zoom = 1): number => px / (PX_PER_MM * zoom);

/** Rounds to `dp` decimals (frames keep 0.1 mm). */
export const round = (n: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Rotation normalised to (-180, 180]. */
export function normaliseRotation(deg: number): number {
  let r = deg % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Object.is(r, -0) ? 0 : r;
}

export const centreOf = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

const rotateAbout = (p: Point, c: Point, deg: number): Point => {
  if (!deg) return p;
  const a = rad(deg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};

/** The four corners of a frame on the page (rotation applied), clockwise from top-left. */
export function frameCorners(f: Frame): Point[] {
  const c = centreOf(f);
  return [
    { x: f.x, y: f.y },
    { x: f.x + f.w, y: f.y },
    { x: f.x + f.w, y: f.y + f.h },
    { x: f.x, y: f.y + f.h },
  ].map((p) => rotateAbout(p, c, f.rotation));
}

/** Axis-aligned bounding box of a (possibly rotated) frame. */
export function rotatedBounds(f: Frame): Box {
  if (!f.rotation) return { x: f.x, y: f.y, w: f.w, h: f.h };
  const pts = frameCorners(f);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Union of boxes; null for none. */
export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const btm = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
}

/** Bounds of several frames (rotation included). */
export const boundsOf = (frames: Frame[]): Box | null => unionBox(frames.map(rotatedBounds));

/** True when the page point lies inside the frame (rotation included). */
export function hitTest(f: Frame, p: Point, slopMm = 0): boolean {
  const local = rotateAbout(p, centreOf(f), -f.rotation);
  return local.x >= f.x - slopMm && local.x <= f.x + f.w + slopMm && local.y >= f.y - slopMm && local.y <= f.y + f.h + slopMm;
}

/** True when two boxes overlap (marquee selection: any overlap selects). */
export const boxesIntersect = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A box from two corner points in any order. */
export const boxFromPoints = (a: Point, b: Point): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

export const moveFrame = (f: Frame, dx: number, dy: number): Frame => ({ ...f, x: round(f.x + dx, 2), y: round(f.y + dy, 2) });

// ---------------------------------------------------------------------------
// Align, distribute, tidy up
// ---------------------------------------------------------------------------

export const ALIGN_EDGES = ["left", "center", "right", "top", "middle", "bottom"] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];

/** Moves each frame so its visual (rotated) box lines up with `target` on `edge`. */
export function alignFrames(frames: Frame[], edge: AlignEdge, target: Box): Frame[] {
  return frames.map((f) => {
    const b = rotatedBounds(f);
    switch (edge) {
      case "left":
        return moveFrame(f, target.x - b.x, 0);
      case "center":
        return moveFrame(f, target.x + target.w / 2 - (b.x + b.w / 2), 0);
      case "right":
        return moveFrame(f, target.x + target.w - (b.x + b.w), 0);
      case "top":
        return moveFrame(f, 0, target.y - b.y);
      case "middle":
        return moveFrame(f, 0, target.y + target.h / 2 - (b.y + b.h / 2));
      case "bottom":
        return moveFrame(f, 0, target.y + target.h - (b.y + b.h));
    }
  });
}

export type Axis = "x" | "y";

/**
 * Equal gaps between the first and last frame on `axis` (they stay put).
 * Returns frames in the input order.
 */
export function distributeFrames(frames: Frame[], axis: Axis): Frame[] {
  if (frames.length < 3) return frames;
  const pos = (b: Box) => (axis === "x" ? b.x : b.y);
  const size = (b: Box) => (axis === "x" ? b.w : b.h);
  const order = frames.map((f, i) => ({ i, b: rotatedBounds(f) })).sort((a, b) => pos(a.b) - pos(b.b));
  const first = order[0].b;
  const last = order[order.length - 1].b;
  const span = pos(last) + size(last) - pos(first);
  const total = order.reduce((s, o) => s + size(o.b), 0);
  const gap = (span - total) / (order.length - 1);
  const out = [...frames];
  let cursor = pos(first);
  for (const o of order) {
    const d = cursor - pos(o.b);
    out[o.i] = axis === "x" ? moveFrame(frames[o.i], d, 0) : moveFrame(frames[o.i], 0, d);
    cursor += size(o.b) + gap;
  }
  return out;
}

/** The axis the frames spread along most (centres' range). */
export function dominantAxis(frames: Frame[]): Axis {
  const cs = frames.map((f) => centreOf(rotatedBounds(f)));
  const range = (v: number[]) => Math.max(...v) - Math.min(...v);
  return range(cs.map((c) => c.x)) >= range(cs.map((c) => c.y)) ? "x" : "y";
}

/** Gap used by Tidy up when the frames overlap on the dominant axis. */
export const TIDY_DEFAULT_GAP_MM = 5;

/**
 * Tidy up (05-ux Position panel): along the dominant axis, frames are laid
 * out in their current order with one equal gap (the mean of the current gaps,
 * or 5 mm when they overlap), starting where the first one is; on the other
 * axis they line up with the first one's start. Returns frames in input order.
 */
export function tidyUp(frames: Frame[]): Frame[] {
  if (frames.length < 2) return frames;
  const axis = dominantAxis(frames);
  const cross: Axis = axis === "x" ? "y" : "x";
  const pos = (b: Box, a: Axis) => (a === "x" ? b.x : b.y);
  const size = (b: Box, a: Axis) => (a === "x" ? b.w : b.h);
  const order = frames.map((f, i) => ({ i, b: rotatedBounds(f) })).sort((a, b) => pos(a.b, axis) - pos(b.b, axis) || a.i - b.i);
  const gaps = order.slice(1).map((o, k) => pos(o.b, axis) - (pos(order[k].b, axis) + size(order[k].b, axis)));
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const gap = round(mean > 0 ? mean : TIDY_DEFAULT_GAP_MM, 2);
  const crossStart = pos(order[0].b, cross);
  const out = [...frames];
  let cursor = pos(order[0].b, axis);
  for (const o of order) {
    const d = cursor - pos(o.b, axis);
    const dc = crossStart - pos(o.b, cross);
    out[o.i] = axis === "x" ? moveFrame(frames[o.i], d, dc) : moveFrame(frames[o.i], dc, d);
    cursor += size(o.b, axis) + gap;
  }
  return out;
}

/** The gaps between neighbours on the dominant axis (tests, the Position panel hint). */
export function gapsAlong(frames: Frame[], axis: Axis): number[] {
  const pos = (b: Box) => (axis === "x" ? b.x : b.y);
  const size = (b: Box) => (axis === "x" ? b.w : b.h);
  const bs = frames.map(rotatedBounds).sort((a, b) => pos(a) - pos(b));
  return bs.slice(1).map((b, k) => round(pos(b) - (pos(bs[k]) + size(bs[k])), 2));
}

// ---------------------------------------------------------------------------
// Resize and rotate
// ---------------------------------------------------------------------------

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type Handle = (typeof HANDLES)[number];

/** Smallest frame side the editor makes (mm). */
export const MIN_SIDE_MM = 2;

export interface ResizeOptions {
  /** Keep the aspect ratio (Shift, or a corner on images/frames). */
  keepRatio?: boolean;
  /** Grow from the centre (Alt). */
  fromCentre?: boolean;
  min?: number;
}

/**
 * Resizes `start` by a pointer delta (page mm) dragged on `handle`. The delta
 * is turned into the element's own axes, so a rotated element grows along its
 * sides; the opposite edge or corner stays fixed on the page.
 */
export function resizeFrame(start: Frame, handle: Handle, dxMm: number, dyMm: number, opts: ResizeOptions = {}): Frame {
  const min = opts.min ?? MIN_SIDE_MM;
  const a = rad(start.rotation);
  // Delta in local (unrotated) axes.
  const lx = dxMm * Math.cos(a) + dyMm * Math.sin(a);
  const ly = -dxMm * Math.sin(a) + dyMm * Math.cos(a);
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const k = opts.fromCentre ? 2 : 1;
  let w = start.w + sx * lx * k;
  let h = start.h + sy * ly * k;
  if (opts.keepRatio && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if (sx && sy) {
      // Corner: follow the larger relative change.
      if (Math.abs(w / start.w) >= Math.abs(h / start.h)) h = w / ratio;
      else w = h * ratio;
    } else if (sx) h = w / ratio;
    else w = h * ratio;
  }
  w = Math.max(min, w);
  h = Math.max(min, h);
  // Fixed anchor in local coords relative to the centre.
  const dw = w - start.w;
  const dh = h - start.h;
  let cdx = 0;
  let cdy = 0;
  if (!opts.fromCentre) {
    // The centre moves half the growth towards the dragged side; edge handles
    // with keepRatio grow the other axis symmetrically.
    cdx = sx ? (sx * dw) / 2 : 0;
    cdy = sy ? (sy * dh) / 2 : 0;
  }
  const c0 = centreOf(start);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = c0.x + cdx * cos - cdy * sin;
  const cy = c0.y + cdx * sin + cdy * cos;
  return { x: round(cx - w / 2, 2), y: round(cy - h / 2, 2), w: round(w, 2), h: round(h, 2), rotation: start.rotation };
}

/** Degrees snapped to when rotating with Shift. */
export const ROTATE_STEP = 15;
/** Free rotation sticks to 0/90/180/270 within this many degrees. */
export const ROTATE_STICK = 3;

/** The rotation for a pointer at `p` around `centre` (the handle sits above the frame). */
export function rotationFromPointer(centre: Point, p: Point, step = false): number {
  let deg = (Math.atan2(p.y - centre.y, p.x - centre.x) * 180) / Math.PI + 90;
  deg = normaliseRotation(deg);
  if (step) return normaliseRotation(Math.round(deg / ROTATE_STEP) * ROTATE_STEP);
  const nearest = Math.round(deg / 90) * 90;
  if (Math.abs(deg - nearest) <= ROTATE_STICK) return normaliseRotation(nearest);
  return round(deg, 1);
}

/** Keeps a frame's visual box on the page (used for drops and pastes). */
export function clampIntoPage(f: Frame, page: { wMm: number; hMm: number }): Frame {
  const b = rotatedBounds(f);
  let dx = 0;
  let dy = 0;
  if (b.x < 0) dx = -b.x;
  else if (b.x + b.w > page.wMm) dx = Math.max(-b.x, page.wMm - (b.x + b.w));
  if (b.y < 0) dy = -b.y;
  else if (b.y + b.h > page.hMm) dy = Math.max(-b.y, page.hMm - (b.y + b.h));
  return dx || dy ? moveFrame(f, dx, dy) : f;
}

/** A frame of size w×h centred on `at` (page centre by default). */
export const frameAt = (w: number, h: number, at: Point): Frame => ({ x: round(at.x - w / 2, 2), y: round(at.y - h / 2, 2), w, h, rotation: 0 });

// ---------------------------------------------------------------------------
// Crop (frames, images, grid cells): the image's box inside the frame, mm
// ---------------------------------------------------------------------------

/** The crop that covers a w×h frame with an image of natural size iw×ih, centred. */
export function coverCrop(w: number, h: number, iw: number, ih: number): Crop {
  if (!(iw > 0 && ih > 0)) return { x: 0, y: 0, w, h };
  const scale = Math.max(w / iw, h / ih);
  const cw = iw * scale;
  const ch = ih * scale;
  return { x: round((w - cw) / 2, 2), y: round((h - ch) / 2, 2), w: round(cw, 2), h: round(ch, 2) };
}

/** Keeps the image covering the frame: never smaller than it, never leaving a gap. */
export function clampCrop(c: Crop, w: number, h: number): Crop {
  let cw = c.w;
  let ch = c.h;
  if (cw < w || ch < h) {
    const s = Math.max(w / cw, h / ch);
    cw *= s;
    ch *= s;
  }
  const x = Math.min(0, Math.max(w - cw, c.x));
  const y = Math.min(0, Math.max(h - ch, c.y));
  return { x: round(x, 2), y: round(y, 2), w: round(cw, 2), h: round(ch, 2) };
}

/** Scales a crop about the frame centre by `factor` (crop zoom slider), then clamps. */
export function zoomCrop(c: Crop, factor: number, w: number, h: number): Crop {
  const cx = w / 2;
  const cy = h / 2;
  const nw = c.w * factor;
  const nh = c.h * factor;
  const nx = cx - (cx - c.x) * factor;
  const ny = cy - (cy - c.y) * factor;
  return clampCrop({ x: nx, y: ny, w: nw, h: nh }, w, h);
}

/** Cell boxes of a grid element, relative to its frame (as the renderer lays them out). */
export function gridCells(w: number, h: number, columns: number, gap: number, count: number): Box[] {
  const cols = Math.max(1, Math.min(6, Math.floor(columns)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const g = Math.max(0, gap);
  const cw = (w - g * (cols - 1)) / cols;
  const ch = (h - g * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({ x: (i % cols) * (cw + g), y: Math.floor(i / cols) * (ch + g), w: cw, h: ch }));
}

/** The point in an element's own (unrotated) coordinates, relative to its top-left. */
export function toLocal(f: Frame, p: Point): Point {
  const c = centreOf(f);
  const a = (-f.rotation * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a) + f.w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + f.h / 2 };
}
