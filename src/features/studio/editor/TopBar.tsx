// DS-6 · the editor top bar (48 px, 05-ux): ← Designs, File ▾ (view toggles,
// shortcuts), Resize, undo/redo, the title and save state, comments, Present,
// Share ▾ and Download ▾ (DS-11). Resize (DS-10), checks (DS-12) and version
// history (DS-13) plug in here when they land; until then they say so.
import { Link } from "react-router-dom";
import { ChevronLeft, MessageSquare, Play, Redo2, Undo2 } from "lucide-react";
import { Menu, Tooltip, cn, focusRing } from "../../../ui";
import { useEditor } from "./EditorContext";
import { TbButton } from "./toolbars";
import { DownloadMenu } from "../share/DownloadMenu"; // DS-11
import { ShareMenu } from "../share/ShareMenu"; // DS-11
import { SelectFromLink } from "../share/SelectFromLink"; // DS-11
import { useCanManage } from "../share/useCanManage"; // DS-11

export type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

const SAVE_TEXT: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save · retrying",
  conflict: "Changed elsewhere",
};

export function TopBar({ save, status, onHelp }: { save: SaveState; status: string; onHelp: () => void }) {
  const ed = useEditor();
  const { ui, readOnly } = ed;
  const show = ui.show;
  const canManage = useCanManage(); // DS-11
  const statusWord = status === "final" ? "Final" : status === "in_review" ? "In review" : status === "approved" ? "Approved" : "Draft";
  return (
    <header className="flex h-12 flex-none items-center gap-1.5 border-b border-line bg-panel px-3" aria-label="Design">
      <Link to="/studio" className={cn("inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-[13px] font-medium text-ink hover:bg-tint", focusRing)}>
        <ChevronLeft aria-hidden className="size-4" /> Designs
      </Link>
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <Menu
        label="File"
        align="start"
        trigger={(t) => <TbButton {...t}>File ▾</TbButton>}
        items={[
          { kind: "heading", content: <span className="text-xs font-semibold uppercase tracking-wide text-muted">View</span> },
          { label: "Show rulers", checked: show.rulers, onSelect: () => ed.toggleShow("rulers") },
          { label: "Show margins", checked: show.margins, onSelect: () => ed.toggleShow("margins") },
          { label: "Show bleed", checked: show.bleed, onSelect: () => ed.toggleShow("bleed") },
          { label: "Show guides", checked: show.guides, onSelect: () => ed.toggleShow("guides") },
          { kind: "separator" },
          { label: "Scroll view  ⌥⌘1", checked: ui.view === "scroll", onSelect: () => ed.setView("scroll") },
          { label: "Page strip  ⌥⌘2", checked: ui.view === "strip", onSelect: () => ed.setView("strip") },
          { label: "Grid view  ⌥⌘3", checked: ui.view === "grid", onSelect: () => ed.setView("grid") },
          { kind: "separator" },
          { label: "Version history (coming with review)", disabled: true, onSelect: () => undefined },
          { label: "Keyboard shortcuts  ⌘/", onSelect: onHelp },
        ]}
      />
      <Tooltip content="Resize arrives with the resize module">
        <TbButton aria-disabled disabled>
          Resize
        </TbButton>
      </Tooltip>
      <TbButton aria-label={ed.undoLabel ? `Undo ${ed.undoLabel}` : "Undo"} title={ed.undoLabel ? `Undo ${ed.undoLabel} (⌘Z)` : "Undo (⌘Z)"} disabled={!ed.canUndo} onClick={ed.undo} icon={<Undo2 aria-hidden className="size-4" />} />
      <TbButton aria-label={ed.redoLabel ? `Redo ${ed.redoLabel}` : "Redo"} title={ed.redoLabel ? `Redo ${ed.redoLabel} (⇧⌘Z)` : "Redo (⇧⌘Z)"} disabled={!ed.canRedo} onClick={ed.redo} icon={<Redo2 aria-hidden className="size-4" />} />
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <h1 className="min-w-0 truncate px-1.5 text-sm font-semibold text-ink">{ed.doc.meta.title}</h1>
      <span className={cn("whitespace-nowrap text-xs", save === "error" || save === "conflict" ? "text-bad" : "text-muted")} role="status" aria-live="polite" data-testid="save-state">
        {statusWord} · {readOnly ? "View only" : SAVE_TEXT[save]}
      </span>
      <div className="flex-1" />
      <TbButton active={ui.commentMode} onClick={() => ed.setCommentMode(!ui.commentMode)} icon={<MessageSquare aria-hidden className="size-4" />} title="Comment (C)">
        Comment
      </TbButton>
      <Link to={`/studio/${ed.docId}/present`} className={cn("inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-2.5 text-[13px] font-medium text-ink hover:bg-tint", focusRing)}>
        <Play aria-hidden className="size-4" /> Present
      </Link>
      <ShareMenu docId={ed.docId} canShare={canManage} /> {/* DS-11 */}
      <DownloadMenu docId={ed.docId} canFinal={canManage} pageCount={ed.doc.pages.length} pageViewHref={`/studio/${ed.docId}/preview`} /> {/* DS-11 */}
      <SelectFromLink /> {/* DS-11: Page view → editor selection */}
    </header>
  );
}
