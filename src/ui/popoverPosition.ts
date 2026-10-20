/** Gap between trigger and panel, and the margin kept from the viewport edges (px). */
const GAP = 4;
const EDGE = 8;

/**
 * Where a layered panel goes: under the trigger, or above it when it fits there and not
 * below, kept on screen. A panel taller than the room on its side gets that room as its
 * max height (it scrolls inside), on the side with more room.
 */
export function layerPosition(
  anchor: DOMRect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end",
): { top: number; left: number; maxHeight: number } {
  let left = align === "end" ? anchor.right - panel.width : anchor.left;
  left = Math.max(EDGE, Math.min(left, viewport.width - panel.width - EDGE));
  const roomBelow = viewport.height - EDGE - (anchor.bottom + GAP);
  const roomAbove = anchor.top - GAP - EDGE;
  const below = panel.height <= roomBelow || (panel.height > roomAbove && roomBelow >= roomAbove);
  if (below) return { top: anchor.bottom + GAP, left, maxHeight: Math.max(0, roomBelow) };
  const height = Math.min(panel.height, roomAbove);
  return { top: Math.max(EDGE, anchor.top - GAP - height), left, maxHeight: Math.max(0, roomAbove) };
}
