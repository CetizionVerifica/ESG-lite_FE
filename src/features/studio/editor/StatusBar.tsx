// DS-6 · the status bar (40 px): speaker notes, the page strip (drag to
// reorder), the page counter, zoom (10–400 %, Fit), grid view and full screen.
// In strip view (Alt+⌘+2) the strip grows into a row of page thumbnails.
import { useState, type DragEvent } from "react";
import { Expand, LayoutGrid, NotebookPen } from "lucide-react";
import { movePages, setNotes } from "../../../lib/studio/docOps";
import { formatSpec } from "../../../lib/studio/render";
import { Textarea, cn, focusRing } from "../../../ui";
import { scrollToPage } from "./canvasUtil";
import { useEditor } from "./EditorContext";
import { Sheet } from "./Sheet";
import { TbButton } from "./toolbars";
import { ZOOM_MAX, ZOOM_MIN } from "./state";

export function StatusBar() {
  const ed = useEditor();
  const { ui, shown: doc } = ed;
  const idx = Math.max(0, doc.pages.findIndex((p) => p.id === ui.pageId));
  const pct = Math.round(ui.zoom * 100);
  const page = doc.pages[idx];

  const fullScreen = () => {
    const el = document.querySelector<HTMLElement>("[data-testid=studio-editor]");
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el?.requestFullscreen?.();
  };

  return (
    <>
      {ui.notesOpen && page?.kind === "freeform" && (
        <div className="flex-none border-t border-line bg-panel px-3 py-2">
          <Textarea
            label={`Speaker notes for page ${idx + 1}`}
            value={page.notes ?? ""}
            rows={3}
            disabled={ed.readOnly}
            onChange={(v) => ed.commit(setNotes(ed.doc, page.id, v), "Speaker notes", { mergeKey: `notes:${page.id}` })}
          />
        </div>
      )}
      {ui.view === "strip" && <ThumbStrip />}
      <footer className="flex h-10 flex-none items-center gap-3 border-t border-line bg-panel px-3 text-xs text-muted" aria-label="Pages and zoom">
        <TbButton active={ui.notesOpen} onClick={() => ed.setNotesOpen(!ui.notesOpen)} disabled={page?.kind !== "freeform"} icon={<NotebookPen aria-hidden className="size-4" />}>
          Notes
        </TbButton>
        {ui.view !== "strip" && <MiniStrip />}
        <span className="font-num whitespace-nowrap" data-testid="page-counter">
          Page {idx + 1} / {doc.pages.length}
        </span>
        <div className="flex-1" />
        <label className="flex items-center gap-2">
          <span className="sr-only">Zoom</span>
          <input type="range" min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step={1} value={pct} onChange={(e) => ed.setZoom(Number(e.target.value) / 100)} aria-label="Zoom" aria-valuetext={`${pct}%`} className="w-32 accent-brand" />
          <span className="w-10 text-right font-num text-ink" data-testid="zoom-value">
            {pct}%
          </span>
        </label>
        <TbButton active={ui.fit} onClick={() => ed.setZoom(ui.zoom, true)}>
          Fit
        </TbButton>
        <TbButton active={ui.view === "grid"} onClick={() => ed.setView(ui.view === "grid" ? "scroll" : "grid")} icon={<LayoutGrid aria-hidden className="size-4" />}>
          Grid
        </TbButton>
        <TbButton aria-label="Full screen" title="Full screen" onClick={fullScreen} icon={<Expand aria-hidden className="size-4" />} />
      </footer>
    </>
  );
}

function useReorder() {
  const ed = useEditor();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return {
    drag,
    over,
    start: (id: string) => (e: DragEvent) => {
      setDrag(id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    },
    enter: (i: number) => (e: DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      setOver(i);
    },
    drop: (i: number) => (e: DragEvent) => {
      e.preventDefault();
      if (drag && !ed.readOnly) {
        const from = ed.doc.pages.findIndex((p) => p.id === drag);
        ed.commit(movePages(ed.doc, [drag], from < i ? i - 1 : i), "Move page");
      }
      setDrag(null);
      setOver(null);
    },
    end: () => {
      setDrag(null);
      setOver(null);
    },
  };
}

/** The small strip in the status bar (one tile per page). */
function MiniStrip() {
  const ed = useEditor();
  const { ui, shown: doc } = ed;
  const r = useReorder();
  const go = (id: string) => {
    ed.setPage(id);
    scrollToPage(id);
  };
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto py-1" role="list" aria-label="Page strip">
      {doc.pages.map((p, i) => (
        <button
          key={p.id}
          role="listitem"
          type="button"
          draggable={!ed.readOnly}
          onDragStart={r.start(p.id)}
          onDragOver={r.enter(i)}
          onDrop={r.drop(i)}
          onDragEnd={r.end}
          onClick={() => go(p.id)}
          aria-label={`Page ${i + 1}: ${p.name}${p.hidden ? " (hidden)" : ""}`}
          aria-current={ui.pageId === p.id ? "page" : undefined}
          className={cn("h-[25px] w-[18px] flex-none rounded-[2px] border", ui.pageId === p.id ? "border-2 border-brand" : "border-line", p.hidden && "opacity-50", r.over === i && "ml-2", focusRing)}
          // The tile shows the page's own colour: report data.
          style={{ background: p.kind === "freeform" ? (p.background.color ?? undefined) : undefined }}
        />
      ))}
    </div>
  );
}

/** Strip view: a row of rendered thumbnails above the status bar. */
function ThumbStrip() {
  const ed = useEditor();
  const { ui, shown: doc } = ed;
  const spec = formatSpec(doc.format);
  const r = useReorder();
  const zoom = 72 / (spec.wMm * (96 / 25.4));
  return (
    <div className="flex flex-none gap-3 overflow-x-auto border-t border-line bg-panel px-3 py-2" role="list" aria-label="Pages">
      {doc.pages.map((p, i) => (
        <button
          key={p.id}
          role="listitem"
          type="button"
          draggable={!ed.readOnly}
          onDragStart={r.start(p.id)}
          onDragOver={r.enter(i)}
          onDrop={r.drop(i)}
          onDragEnd={r.end}
          onClick={() => ed.setPage(p.id)}
          aria-label={`Page ${i + 1}: ${p.name}`}
          aria-current={ui.pageId === p.id ? "page" : undefined}
          className={cn("flex flex-none flex-col items-center gap-1 rounded-control p-1 text-[11px] text-muted", ui.pageId === p.id && "bg-brand-50 text-brand-text", focusRing)}
        >
          <span className={cn("block overflow-hidden rounded-[2px] border border-line shadow-sm", p.hidden && "opacity-50")}>
            <Sheet page={p} doc={doc} wMm={spec.wMm} hMm={spec.hMm} zoom={zoom} data={ed.render.data} figures={ed.render.status} assets={ed.render.assets} brand={ed.render.brand} thumbnail />
          </span>
          <span className="font-num">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
