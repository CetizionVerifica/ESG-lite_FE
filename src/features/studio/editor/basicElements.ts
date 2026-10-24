// DS-6 · element templates the shell can always add (our own drawings), and
// the big number a Data drawer row becomes.
import type { Element, GhgBinding, KpiBinding } from "../../../lib/studio/contracts";

const base = { z: 0, source: "user" as const };
/** Elements the editor can always add (our own drawings; no licence needed). */
export const BASIC_ELEMENTS: { name: string; group: string; payload: Element }[] = [
  { name: "Rectangle", group: "Shapes", payload: { ...base, id: "basic-rect", type: "shape", frame: { x: 0, y: 0, w: 50, h: 35, rotation: 0 }, props: { shape: "rect" } } },
  { name: "Circle", group: "Shapes", payload: { ...base, id: "basic-ellipse", type: "shape", frame: { x: 0, y: 0, w: 40, h: 40, rotation: 0 }, props: { shape: "ellipse" } } },
  { name: "Line", group: "Lines and arrows", payload: { ...base, id: "basic-line", type: "line", frame: { x: 0, y: 0, w: 60, h: 2, rotation: 0 }, props: { x1: 0, y1: 1, x2: 60, y2: 1, strokeWidth: 0.5, dash: "solid" } } },
  { name: "Arrow", group: "Lines and arrows", payload: { ...base, id: "basic-arrow", type: "line", frame: { x: 0, y: 0, w: 60, h: 4, rotation: 0 }, props: { x1: 0, y1: 2, x2: 60, y2: 2, strokeWidth: 0.6, dash: "solid", endArrow: true } } },
  { name: "Square frame", group: "Frames", payload: { ...base, id: "basic-frame-rect", type: "frame", frame: { x: 0, y: 0, w: 60, h: 45, rotation: 0 }, props: { mask: "rect", fit: "cover", alt: "" } } },
  { name: "Circle frame", group: "Frames", payload: { ...base, id: "basic-frame-circle", type: "frame", frame: { x: 0, y: 0, w: 45, h: 45, rotation: 0 }, props: { mask: "circle", fit: "cover", alt: "" } } },
  { name: "Arch frame", group: "Frames", payload: { ...base, id: "basic-frame-arch", type: "frame", frame: { x: 0, y: 0, w: 40, h: 55, rotation: 0 }, props: { mask: "arch", fit: "cover", alt: "" } } },
  {
    name: "Photo grid 2 × 2",
    group: "Grids",
    payload: { ...base, id: "basic-grid", type: "grid", frame: { x: 0, y: 0, w: 90, h: 70, rotation: 0 }, props: { columns: 2, gap: 3, cells: [{ alt: "" }, { alt: "" }, { alt: "" }, { alt: "" }] } },
  },
];


/** The big number a Data drawer row becomes when clicked (DS-8 adds "tile or chart?"). */
export const bigNumberFor = (binding: GhgBinding | KpiBinding, label: string): Element => ({
  id: "data",
  type: "big_number",
  frame: { x: 0, y: 0, w: 70, h: 28, rotation: 0 },
  z: 0,
  source: "user",
  props: { binding, label, showDelta: true },
});

