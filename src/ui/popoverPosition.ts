/** Gap between trigger and panel, and the margin kept from the viewport edges (px). */
const GAP = 4;
const EDGE = 8;

/** Where a layered panel goes: under the trigger (above when there's no room), kept on screen. */
export function layerPosition(
  anchor: DOMRect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end",
): { top: number; left: number } {
  let left = align === "end" ? anchor.right - panel.width : anchor.left;
  left = Math.max(EDGE, Math.min(left, viewport.width - panel.width - EDGE));
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - panel.height;
  const top = below + panel.height <= viewport.height - EDGE || above < EDGE ? below : above;
  return { top: Math.max(EDGE, top), left };
}
