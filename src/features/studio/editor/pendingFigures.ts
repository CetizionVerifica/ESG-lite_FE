// DS fix · the editor's stand-in for "Not reported" while the figures load.
// The renderer prints "Not reported" (data-reason NOT_RESOLVED) for a binding
// the data has no value for. Before /studio/resolve answers, that only means
// "not here yet", so Sheet.tsx relabels just those marks after each paint.
import { NOT_REPORTED } from "../../../lib/studio/render";
import type { FiguresStatus } from "./renderInputs";

export const FIGURE_LOADING_TEXT = "Loading…";
export const FIGURE_ERROR_TEXT = "Couldn't load";

/** Relabels the NOT_RESOLVED marks of a freshly painted root while the figures aren't there yet. */
export function markPendingFigures(root: ShadowRoot | HTMLElement, status: FiguresStatus): number {
  if (status === "ready") return 0;
  const label = status === "loading" ? FIGURE_LOADING_TEXT : FIGURE_ERROR_TEXT;
  const marks = root.querySelectorAll<HTMLElement | SVGElement>('[data-reason="NOT_RESOLVED"]');
  let n = 0;
  marks.forEach((m) => {
    const walker = (m.ownerDocument ?? document).createTreeWalker(m, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t.nodeValue?.trim() === NOT_REPORTED) t.nodeValue = t.nodeValue.replace(NOT_REPORTED, label);
    }
    m.setAttribute("data-reason", status === "loading" ? "LOADING" : "LOAD_FAILED");
    m.setAttribute("data-figure-state", status);
    n++;
  });
  if (n && root instanceof ShadowRoot) {
    const style = document.createElement("style");
    style.textContent = '[data-figure-state="loading"]{animation:ds-figure-pulse 1.4s ease-in-out infinite;}@keyframes ds-figure-pulse{50%{opacity:.45;}}';
    root.appendChild(style);
  }
  return n;
}
