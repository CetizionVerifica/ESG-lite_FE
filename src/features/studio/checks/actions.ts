// DS-12 · what a check's buttons do in the editor: Go to (page and element),
// and the one-click fixes. Doc fixes go through the editor's commit (one undo
// step each); links go to the app page that fixes the data; "Mark as
// excluded…" opens the exclusion dialog (ChecksPanel).
import { useNavigate } from "react-router-dom";
import type { Check } from "../../../lib/studio/contracts";
import { insertPage } from "../../../lib/studio/docOps";
import { formatSpec } from "../../../lib/studio/render/formats";
import { applyReplaceWithToken, checkLink, factorSection, factorSectionIndex, fixElement, moveInside, targetPage } from "../../../lib/studio/checks";
import { scrollToPage } from "../editor/canvasUtil";
import type { EditorApi } from "../editor/EditorContext";
import { markReviewed, shrinkText } from "../editor/text/ops";
import { refreshChecks } from "./store";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

export function goTo(ed: EditorApi, c: Check): void {
  if (!c.pageId) return;
  if (c.elementId) ed.select([c.elementId], c.pageId);
  else ed.setPage(c.pageId);
  scrollToPage(c.pageId);
}

/** Runs a check's fix (or one of its extra actions). `openExclusion` handles mark_excluded. */
export function useCheckActions(ed: EditorApi, opts: { openExclusion: (c: Check) => void }) {
  const navigate = useNavigate();
  const done = (message?: string): ActionResult => {
    refreshChecks(ed.docId);
    return { ok: true, ...(message ? { message } : {}) };
  };

  const fix = (c: Check): ActionResult => {
    if (ed.readOnly && c.fix && !["open_link", "open_pending", "open_values", "mark_excluded", "open_inputs"].includes(c.fix)) return { ok: false, message: "Editing needs a wider screen." };
    switch (c.fix) {
      case "replace_with_token": {
        const next = applyReplaceWithToken(ed.doc, c);
        if (!next) return { ok: false, message: "The text changed since the check ran. Run the checks again." };
        ed.commit(next, "Replace with linked value", c.pageId && c.elementId ? { select: [c.elementId], pageId: c.pageId } : {});
        return done("The typed number is now linked to approved data.");
      }
      case "shrink_text":
        if (!c.pageId || !c.elementId) return { ok: false, message: "Go to the text box to fix it." };
        ed.commit(shrinkText(ed.doc, c.pageId, c.elementId), "Shrink text to fit", { select: [c.elementId], pageId: c.pageId });
        return done();
      case "move_inside":
        if (!c.pageId || !c.elementId) return { ok: false, message: "Go to the element to move it." };
        ed.commit(moveInside(ed.doc, c.pageId, c.elementId, formatSpec(ed.doc.format).safeMm), "Move inside margin", { select: [c.elementId], pageId: c.pageId });
        return done();
      case "add_market_note":
      case "add_gas_chart":
      case "add_biogenic": {
        const metrics = c.fix === "add_market_note" ? ["scope2_location", "scope2_market"] : c.fix === "add_gas_chart" ? ["scope1", "total"] : ["biogenic_co2", "total"];
        const pageId = targetPage(ed.doc, c, metrics, ed.ui.pageId);
        if (!pageId) return { ok: false, message: "Add a page first." };
        const label = c.fix === "add_market_note" ? "Add market-based note" : c.fix === "add_gas_chart" ? "Add per-gas chart" : "Add biogenic CO₂";
        const id = ed.insertElement(fixElement(c.fix, ed.newId()), { pageId, label });
        if (!id) return { ok: false, message: "That page can't take it." };
        scrollToPage(pageId);
        return done();
      }
      case "add_factor_table": {
        const id = ed.newId("page");
        ed.commit(insertPage(ed.doc, factorSection(id), factorSectionIndex(ed.doc)), "Add emission factors", { pageId: id });
        scrollToPage(id);
        return done();
      }
      case "open_inputs":
        ed.openDrawer("data");
        return { ok: true, message: "Report details are in the Data drawer." };
      case "mark_excluded":
        opts.openExclusion(c);
        return { ok: true };
      case "open_pending":
      case "open_values":
      case "open_link": {
        const link = checkLink(c) ?? (c.fix === "open_pending" ? "/data/approvals" : c.fix === "open_values" ? "/data/approvals?view=kpi" : null);
        if (!link) return { ok: false, message: "There's nothing to open for this one." };
        navigate(link);
        return { ok: true };
      }
      default:
        return { ok: false, message: "This one is fixed on the page." };
    }
  };

  /** AI text: tick it as reviewed (the check's own action, besides Go to). */
  const markAiReviewed = (c: Check): ActionResult => {
    if (!c.pageId || !c.elementId) return { ok: false, message: "Go to the text to review it." };
    ed.commit(markReviewed(ed.doc, c.pageId, [c.elementId]), "Mark as reviewed", { select: [c.elementId], pageId: c.pageId });
    return done();
  };

  return { fix, markAiReviewed, goTo: (c: Check) => goTo(ed, c) };
}
