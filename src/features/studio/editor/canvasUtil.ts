// DS-6 · canvas helpers shared by the shell's components (no components here).
import type { Element, FreeformPage, Frame } from "../../../lib/studio/contracts";
import { PX_PER_MM, hitTest, mmToPx, type Point } from "../../../lib/studio/geometry";

/** Space around pages in the canvas (px). */
const GUTTER = 48;

/** Scrolls the canvas to a page (page strip, Pages drawer, grid view). */
export function scrollToPage(pageId: string): void {
  const el = typeof document !== "undefined" ? document.querySelector<HTMLElement>(`[data-page-slot="${pageId}"]`) : null;
  el?.scrollIntoView?.({ block: "start", behavior: "smooth" });
}

/** Room above a page for its title row (px). */
const TITLE_ROW = 40;

/** Zoom that fits a whole page into the canvas (width and height), 10–200 %. */
export const fitZoom = (canvasW: number, canvasH: number, pageWmm: number, pageHmm: number): number => {
  const byW = (canvasW - GUTTER * 2) / mmToPx(pageWmm);
  const byH = canvasH > 0 ? (canvasH - GUTTER - TITLE_ROW) / mmToPx(pageHmm) : byW;
  return Math.max(0.1, Math.min(2, Math.floor(Math.min(byW, byH) * 100) / 100));
};


const roots = new Map<string, ShadowRoot>();

export const setSheetRoot = (pageId: string, root: ShadowRoot): void => {
  roots.set(pageId, root);
};
export const clearSheetRoot = (pageId: string, root: ShadowRoot): void => {
  // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
  if (roots.get(pageId) === root) roots.delete(pageId);
};

/** The shadow root of a mounted page (live drag preview, measuring). */
export const sheetRoot = (pageId: string): ShadowRoot | undefined => roots.get(pageId);

const n3 = (n: number) => Math.round(n * 1000) / 1000;

/** Moves a rendered element's box during a drag, without a re-render. */
export function liveFrame(pageId: string, elementId: string, f: Frame | null): void {
  const root = roots.get(pageId);
  const el = root?.querySelector<HTMLElement>(`[data-el-id="${elementId.replace(/["\\]/g, "\\$&")}"]`);
  if (!el || !f) return;
  el.style.left = `${n3(f.x)}mm`;
  el.style.top = `${n3(f.y)}mm`;
  el.style.width = `${n3(f.w)}mm`;
  el.style.height = `${n3(f.h)}mm`;
  el.style.transform = f.rotation ? `rotate(${n3(f.rotation)}deg)` : "";
}


/** px per mm at a zoom (overlay maths). */
export const scaleOf = (zoom: number) => PX_PER_MM * zoom;

/** Finds the page overlay under a client point and the point in its mm. */
export function pageAtPoint(clientX: number, clientY: number, zoom: number): { pageId: string; x: number; y: number } | null {
  const hit = typeof document !== "undefined" && document.elementFromPoint ? document.elementFromPoint(clientX, clientY) : null;
  const overlay = hit?.closest<HTMLElement>("[data-overlay-page]");
  if (!overlay) return null;
  const r = overlay.getBoundingClientRect();
  const k = scaleOf(zoom);
  return { pageId: overlay.dataset.overlayPage as string, x: (clientX - r.left) / k, y: (clientY - r.top) / k };
}


/** Elements under a page point, top first (hidden ones never; template-locked only from Layers). */
export function hitElements(page: FreeformPage, p: Point, slop: number): Element[] {
  return [...page.elements].filter((e) => !e.hidden && !e.templateLocked && hitTest(e.frame, p, slop)).sort((a, b) => b.z - a.z);
}

