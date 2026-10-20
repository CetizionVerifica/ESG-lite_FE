// DS-13 · deep links from notifications and emails:
//   /studio/:id?page=&el=&comment=<id>   opens the review panel at that thread (DS-11's
//                                         SelectFromLink selects the page and element)
//   /studio/:id?approval=<id>            the approval bar shows it; the query is cleared
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useEditor } from "../editor/EditorContext";
import { openReview } from "./store";

export function ReviewLinks() {
  const ed = useEditor();
  const [params, setParams] = useSearchParams();
  const comment = params.get("comment");
  const approval = params.get("approval");
  useEffect(() => {
    if (!comment && !approval) return;
    const id = Number(comment);
    if (comment && Number.isInteger(id) && id > 0) openReview(ed.docId, { focus: id });
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("comment");
        next.delete("approval");
        return next;
      },
      { replace: true },
    );
    // Once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment, approval]);
  return null;
}
