// DS-11 · Page view → editor: `/studio/:id?page=&el=` (a click in Page view)
// selects that element on that page once the editor is open, then clears the
// query so a reload doesn't select it again.
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useEditor } from "../editor/EditorContext";

export function SelectFromLink() {
  const ed = useEditor();
  const [params, setParams] = useSearchParams();
  const pageId = params.get("page");
  const elId = params.get("el");
  useEffect(() => {
    if (!pageId && !elId) return;
    const page = ed.doc.pages.find((p) => p.id === pageId);
    if (page) {
      ed.setPage(page.id);
      if (elId && page.kind === "freeform" && page.elements.some((e) => e.id === elId)) ed.select([elId], page.id);
    }
    const next = new URLSearchParams(params);
    // data-loss-reviewed: removes a URL query parameter, no record is deleted.
    next.delete("page");
    // data-loss-reviewed: removes a URL query parameter, no record is deleted.
    next.delete("el");
    setParams(next, { replace: true });
    // Once per link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, elId]);
  return null;
}
