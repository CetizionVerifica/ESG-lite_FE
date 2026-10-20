// DS-13 · comment pins on the page (05-ux S9 "pins on elements"): one pin per
// open thread, at its spot (or the top-right of its element). A pin opens the
// review panel at its thread. Resolving a thread hides its pin.
import { MessageSquare } from "lucide-react";
import { cn, focusRing } from "../../../ui";
import { scaleOf } from "../editor/canvasUtil";
import { useEditor } from "../editor/EditorContext";
import type { PageOverlayProps } from "../editor/registry";
import { useComments } from "./api";
import { pinsFor } from "./logic";
import { openReview } from "./store";

export function CommentPins({ page, zoom }: PageOverlayProps) {
  const ed = useEditor();
  const comments = useComments(ed.docId);
  const pins = pinsFor(comments.data ?? [], page.id);
  if (!pins.length) return null;
  const k = scaleOf(zoom);
  const replies = (id: number) => (comments.data ?? []).filter((c) => c.parentId === id).length;
  return (
    <>
      {pins.map((c) => {
        const el = c.elementId ? page.elements.find((e) => e.id === c.elementId) : undefined;
        const x = c.x ?? (el ? el.frame.x + el.frame.w : null);
        const y = c.y ?? (el ? el.frame.y : null);
        if (x === null || y === null) return null;
        const n = replies(c.id);
        return (
          <button
            key={c.id}
            type="button"
            data-testid="comment-pin-saved"
            aria-label={`Comment by ${c.authorName}: ${c.body.slice(0, 80)}`}
            title={`${c.authorName}: ${c.body.slice(0, 120)}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              ed.openDrawer(null);
              openReview(ed.docId, { focus: c.id });
            }}
            className={cn("pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full rounded-bl-none border border-brand bg-panel px-1 py-0.5 text-[10px] font-semibold text-brand-text shadow", c.taskAssigneeId !== null && !c.taskDoneAt && "border-warn text-warn", focusRing)}
            style={{ left: x * k, top: y * k }}
          >
            <MessageSquare aria-hidden className="size-3.5" />
            {n > 0 && <span>{n + 1}</span>}
          </button>
        );
      })}
    </>
  );
}
