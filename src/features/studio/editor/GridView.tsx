// DS-6 · grid view (mockup "Grid view"): every page as a thumbnail, grouped by
// chapter (a page with a bookmark opens one), with its number and name, a
// Flow badge, hidden pages greyed. Click selects (Shift: a range, ⌘/Ctrl:
// add or remove), double-click opens the page; drag to reorder, or Alt+←/→
// on the selection. With pages picked: Duplicate, Hide/Show, Move to
// chapter ▾, Delete (confirmed).
import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { chaptersOf, deletePages, duplicatePages, movePages, movePagesToChapter, setPagesHidden } from "../../../lib/studio/docOps";
import { formatSpec } from "../../../lib/studio/render";
import { Badge, Button, Menu, Modal, cn, focusRing } from "../../../ui";
import { scrollToPage } from "./canvasUtil";
import { useEditor } from "./EditorContext";
import { Sheet } from "./Sheet";

const THUMB_W = 112;

export function GridView() {
  const ed = useEditor();
  const { shown: doc, ui, readOnly } = ed;
  const spec = formatSpec(doc.format);
  const zoom = THUMB_W / (spec.wMm * (96 / 25.4));
  const chapters = useMemo(() => chaptersOf(doc), [doc]);
  const sel = ui.gridSelection;
  const anchor = useRef<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const order = doc.pages.map((p) => p.id);

  const pick = (id: string, e: MouseEvent | KeyboardEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = order.indexOf(anchor.current);
      const b = order.indexOf(id);
      ed.setGridSelection(order.slice(Math.min(a, b), Math.max(a, b) + 1));
      return;
    }
    anchor.current = id;
    if (e.metaKey || e.ctrlKey) ed.setGridSelection(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
    else ed.setGridSelection(sel.length === 1 && sel[0] === id ? [] : [id]);
  };
  const open = (id: string) => {
    ed.setView("scroll");
    ed.setPage(id);
    window.setTimeout(() => scrollToPage(id), 0);
  };
  const moving = (id: string) => (sel.includes(id) ? sel : [id]);
  const onDrop = (to: number) => (e: DragEvent) => {
    e.preventDefault();
    if (drag && !readOnly) {
      const ids = moving(drag);
      const before = order.slice(0, to).filter((x) => !ids.includes(x)).length;
      ed.commit(movePages(ed.doc, ids, before), ids.length > 1 ? "Move pages" : "Move page");
    }
    setDrag(null);
    setOver(null);
  };
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter") open(id);
    else if (e.key === " ") {
      e.preventDefault();
      pick(id, e);
    } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !readOnly) {
      e.preventDefault();
      const ids = moving(id);
      const first = order.indexOf(ids[0]);
      const rest = order.filter((x) => !ids.includes(x));
      const at = Math.max(0, Math.min(rest.length, first + (e.key === "ArrowLeft" ? -1 : 1)));
      ed.commit(movePages(ed.doc, ids, at), "Move page");
    }
  };
  const allHidden = sel.length > 0 && sel.every((id) => doc.pages.find((p) => p.id === id)?.hidden);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-tint" data-testid="grid-view">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line bg-panel px-3 text-sm">
        <span className="font-semibold text-ink">Grid view · {doc.pages.length} pages</span>
        {sel.length > 0 && (
          <>
            <span className="text-muted" aria-live="polite">
              {sel.length} {sel.length === 1 ? "page" : "pages"} selected
            </span>
            {!readOnly && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy aria-hidden className="size-4" />}
                  onClick={() => {
                    const r = duplicatePages(ed.doc, sel, { newId: ed.newId });
                    ed.commit(r.doc, sel.length > 1 ? "Duplicate pages" : "Duplicate page");
                    ed.setGridSelection(r.ids);
                  }}
                >
                  Duplicate
                </Button>
                <Button size="sm" variant="secondary" icon={allHidden ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />} onClick={() => ed.commit(setPagesHidden(ed.doc, sel, !allHidden), allHidden ? "Show pages" : "Hide pages")}>
                  {allHidden ? "Show" : "Hide"}
                </Button>
                <Menu
                  label="Move to chapter"
                  align="start"
                  trigger={(t) => (
                    <Button {...t} size="sm" variant="secondary">
                      Move to chapter ▾
                    </Button>
                  )}
                  items={chapters.map((c) => ({ label: c.name, onSelect: () => ed.commit(movePagesToChapter(ed.doc, sel, c), `Move to ${c.name}`) }))}
                />
                <Button size="sm" variant="danger" icon={<Trash2 aria-hidden className="size-4" />} disabled={sel.length >= doc.pages.length} onClick={() => setConfirm(true)}>
                  Delete
                </Button>
              </>
            )}
          </>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => ed.setView("scroll")}>
          Back to editing
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {chapters.map((c) => (
          <section key={c.id ?? "opening"} aria-label={c.name} className="mb-6">
            <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-ink">
              {c.name}
              <span className="text-xs font-normal text-muted">
                {c.pageIds.length} {c.pageIds.length === 1 ? "page" : "pages"}
              </span>
            </h3>
            <ul className="flex flex-wrap gap-4" aria-label={`${c.name} pages`}>
              {c.pageIds.map((id) => {
                const p = doc.pages.find((x) => x.id === id);
                if (!p) return null;
                const i = order.indexOf(id);
                const on = sel.includes(id);
                return (
                  <li key={id} onDragOver={(e) => drag && (e.preventDefault(), setOver(i))} onDrop={onDrop(i)} className={cn("flex flex-col gap-1.5", over === i && drag && "border-l-2 border-brand pl-1")}>
                    <button
                      type="button"
                      draggable={!readOnly}
                      onDragStart={(e) => {
                        setDrag(id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", id);
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      onClick={(e) => pick(id, e)}
                      onDoubleClick={() => open(id)}
                      onKeyDown={onKey(id)}
                      aria-pressed={on}
                      aria-label={`Page ${i + 1}: ${p.name}${p.hidden ? ", hidden" : ""}`}
                      data-testid={`grid-page-${id}`}
                      className={cn("relative overflow-hidden rounded-[2px] bg-panel shadow", on && "outline outline-[3px] outline-offset-2 outline-brand", p.hidden && "opacity-50", focusRing)}
                    >
                      <Sheet page={p} doc={doc} wMm={spec.wMm} hMm={spec.hMm} zoom={zoom} data={ed.render.data} assets={ed.render.assets} brand={ed.render.brand} thumbnail />
                      {p.kind === "flow" && (
                        <span className="absolute left-1 top-1">
                          <Badge tone="info">Flow</Badge>
                        </span>
                      )}
                      {p.hidden && (
                        <span className="absolute right-1 top-1">
                          <Badge tone="neutral">Hidden</Badge>
                        </span>
                      )}
                    </button>
                    <span className="flex max-w-[112px] gap-1 text-xs text-muted">
                      <span className="font-num">{i + 1}</span>
                      <span className="truncate text-ink">{p.name}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${sel.length} ${sel.length === 1 ? "page" : "pages"}?`}
        description="You can undo this right after."
        tone="destructive"
        primaryAction={{
          label: "Delete",
          onClick: () => {
            ed.commit(deletePages(ed.doc, sel), sel.length > 1 ? "Delete pages" : "Delete page");
            ed.setGridSelection([]);
            setConfirm(false);
          },
        }}
      />
    </div>
  );
}
