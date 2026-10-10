const GAP = 4;
const EDGE = 8;

/**
 * Where the panel goes, in viewport pixels: below the trigger, or above it when it doesn't fit below
 * and fits better above; aligned to the trigger's start or end edge and kept inside the viewport.
 */
export function menuPosition(
  trigger: Pick<DOMRect, "top" | "bottom" | "left" | "right">,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end",
): { top: number; left: number } {
  const below = viewport.height - trigger.bottom - GAP - EDGE;
  const above = trigger.top - GAP - EDGE;
  const up = panel.height > below && above > below;
  const top = up ? Math.max(EDGE, trigger.top - GAP - panel.height) : trigger.bottom + GAP;
  const wanted = align === "end" ? trigger.right - panel.width : trigger.left;
  const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, viewport.width - EDGE - panel.width));
  return { top, left };
}
