// DS-13 · the drift banner (RS-10 §5): approved data changed after some texts
// were written. Charts, tiles and chips already show the new figures; the
// banner opens the review panel's Data changes. Hidden once dismissed for the
// session or when nothing is left to check.
import { useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Button, cn, focusRing } from "../../../ui";
import { useEditor } from "../editor/EditorContext";
import { useDrift } from "./api";
import { openDrift } from "./logic";
import { openReview } from "./store";

const KEY = (docId: number) => `studio:drift-dismissed:${docId}`;

export function DriftBanner() {
  const ed = useEditor();
  const drift = useDrift(ed.docId);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(KEY(ed.docId)) === drift.data?.dataHash && !!drift.data;
    } catch {
      return false;
    }
  });
  const items = openDrift(ed.doc, drift.data);
  if (!items.length || dismissed) return null;
  const n = items.length;
  return (
    <div role="status" data-testid="drift-banner" className="flex flex-none items-center gap-2 border-b border-warn/30 bg-warn-soft px-3 py-1.5 text-[13px] text-warn">
      <TriangleAlert aria-hidden className="size-4 flex-none" />
      <span className="min-w-0 flex-1 truncate">
        The approved data changed after {n === 1 ? "one text was" : `${n} texts were`} written. Figures are updated; check the wording.
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          ed.openDrawer(null);
          openReview(ed.docId, { tab: "changes" });
        }}
      >
        Review changes
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            if (drift.data) sessionStorage.setItem(KEY(ed.docId), drift.data.dataHash);
          } catch {
            // Session storage may be off; the banner just comes back next time.
          }
        }}
        className={cn("rounded-chip p-1 hover:bg-tint", focusRing)}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
