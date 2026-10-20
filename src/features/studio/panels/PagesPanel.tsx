// DS-6 · the Pages drawer (05-ux rail tab "Pages"): every page with its
// number, name and Flow badge; show/hide, duplicate, delete and move up/down;
// "Add page" (blank or from a layout); a link into grid view.
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, LayoutGrid, Trash2 } from "lucide-react";
import { deletePages, duplicatePage, movePages, setPagesHidden } from "../../../lib/studio/docOps";
import { Badge, Button, cn, focusRing } from "../../../ui";
import { AddPageButton } from "../editor/Canvas";
import { scrollToPage } from "../editor/canvasUtil";
import type { DrawerProps } from "../editor/registry";

export function PagesPanel({ editor: ed }: DrawerProps) {
  const doc = ed.doc;
  const n = doc.pages.length;
  const act = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button type="button" aria-label={label} title={label} disabled={disabled || ed.readOnly} onClick={onClick} className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink disabled:opacity-40", focusRing)}>
      {icon}
    </button>
  );
  return (
    <div className="space-y-3" data-testid="pages-panel">
      <Button size="sm" variant="secondary" className="w-full" icon={<LayoutGrid aria-hidden className="size-4" />} onClick={() => ed.setView("grid")}>
        Open grid view
      </Button>
      <ol className="space-y-1" aria-label="Pages">
        {doc.pages.map((p, i) => (
          <li key={p.id} className={cn("flex items-center gap-1 rounded-control border px-2 py-1.5 text-sm", ed.ui.pageId === p.id ? "border-brand bg-brand-50" : "border-line", p.hidden && "opacity-60")}>
            <button
              type="button"
              aria-current={ed.ui.pageId === p.id ? "page" : undefined}
              className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", focusRing)}
              onClick={() => {
                if (ed.ui.view === "grid") ed.setView("scroll");
                ed.setPage(p.id);
                window.setTimeout(() => scrollToPage(p.id), 0);
              }}
            >
              <span className="w-5 font-num text-xs text-muted">{i + 1}</span>
              <span className="truncate text-ink">{p.name}</span>
              {p.kind === "flow" && <Badge tone="info">Flow</Badge>}
            </button>
            {act(`Move ${p.name} up`, <ArrowUp aria-hidden className="size-4" />, () => ed.commit(movePages(doc, [p.id], i - 1), "Move page"), i === 0)}
            {act(`Move ${p.name} down`, <ArrowDown aria-hidden className="size-4" />, () => ed.commit(movePages(doc, [p.id], i + 1), "Move page"), i === n - 1)}
            {act(p.hidden ? `Show ${p.name}` : `Hide ${p.name}`, p.hidden ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />, () => ed.commit(setPagesHidden(doc, [p.id], !p.hidden), p.hidden ? "Show page" : "Hide page"))}
            {act(`Duplicate ${p.name}`, <Copy aria-hidden className="size-4" />, () => ed.commit(duplicatePage(doc, p.id, { newId: ed.newId }).doc, "Duplicate page"))}
            {act(`Delete ${p.name}`, <Trash2 aria-hidden className="size-4" />, () => ed.commit(deletePages(doc, [p.id]), "Delete page"), n <= 1)}
          </li>
        ))}
      </ol>
      {!ed.readOnly && <AddPageButton index={n} label="Add page" />}
      <p className="text-xs text-muted">Deleting a page can be undone with ⌘Z.</p>
    </div>
  );
}
