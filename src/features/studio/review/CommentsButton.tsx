// DS-13 · the top bar's "Comments n" (mockup "Checks, download and share"):
// open threads on the design; opens and closes the review panel. "C" still
// drops a pin (the shell's comment mode).
import { MessageSquare } from "lucide-react";
import { cn, focusRing } from "../../../ui";
import { useEditor } from "../editor/EditorContext";
import { useComments, useDrift } from "./api";
import { openDrift, openThreadCount } from "./logic";
import { closeReview, openReview, useReviewState } from "./store";

export function CommentsButton() {
  const ed = useEditor();
  const { open } = useReviewState(ed.docId);
  const comments = useComments(ed.docId);
  const drift = useDrift(ed.docId);
  const n = openThreadCount(comments.data ?? []);
  const changes = openDrift(ed.doc, drift.data).length;
  return (
    <button
      type="button"
      aria-pressed={open}
      data-testid="comments-button"
      onClick={() => {
        if (open) closeReview(ed.docId);
        else {
          ed.openDrawer(null);
          openReview(ed.docId);
        }
      }}
      title={changes ? `${changes} texts to check against changed data` : "Comments, tasks and data changes"}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-[13px] font-medium", open ? "border-brand bg-brand-50 text-brand-text" : "border-line text-ink hover:bg-tint", focusRing)}
    >
      <MessageSquare aria-hidden className="size-4" />
      Comments{n ? ` ${n}` : ""}
      {changes > 0 && <span aria-label={`${changes} data changes`} className="ml-0.5 inline-block size-2 rounded-full bg-warn" />}
    </button>
  );
}
