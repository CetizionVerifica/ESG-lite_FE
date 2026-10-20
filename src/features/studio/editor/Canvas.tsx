// DS-6 · the work area: scroll view (every page, one under the other) or the
// strip view (the page in view only). Each page has its title above it
// (editable, with page actions), the sheet and its overlay, and a "+" below
// that adds a page from a layout. Only pages in view ±2 render as live
// sheets (layer rule 7); the rest are sized placeholders.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EyeOff, MoreHorizontal, Plus } from "lucide-react";
import type { FreeformPage, Page } from "../../../lib/studio/contracts";
import { blankPage, deletePages, duplicatePage, insertPage, pageFromLayout, renamePage, setPagesHidden } from "../../../lib/studio/docOps";
import { formatSpec } from "../../../lib/studio/render";
import { mmToPx } from "../../../lib/studio/geometry";
import { fitZoom, scrollToPage } from "./canvasUtil";
import { Badge, Button, Menu, Popover, cn, focusRing } from "../../../ui";
import { useStudioLayouts } from "./api";
import { useEditor } from "./EditorContext";
import { Rulers } from "./Rulers";
import { SelectionLayer } from "./SelectionLayer";
import { Sheet } from "./Sheet";

export function Canvas() {
  const ed = useEditor();
  const { ui, shown: doc } = ed;
  const spec = formatSpec(doc.format);
  const scroller = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<string> | null>(null);

  // Fit: zoom follows the canvas width.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !ui.fit) return;
    const apply = () => {
      if (el.clientWidth > 0) ed.setZoom(fitZoom(el.clientWidth, el.clientHeight, spec.wMm, spec.hMm), true);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
    // ed.setZoom is stable through dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.fit, spec.wMm, spec.hMm]);

  // Which pages are on screen (live sheets for those ±2; the page counter follows when nothing is selected).
  const selectionEmpty = ui.selection.length === 0;
  const setPage = ed.setPage;
  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) ratios.set((en.target as HTMLElement).dataset.pageSlot as string, en.isIntersecting ? en.intersectionRatio : 0);
        const on = new Set([...ratios].filter(([, r]) => r > 0).map(([id]) => id));
        setVisible(on);
        if (selectionEmpty) {
          const best = [...ratios].sort((a, b) => b[1] - a[1])[0];
          if (best && best[1] > 0.5) setPage(best[0]);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll("[data-page-slot]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [doc.pages.length, ui.view, selectionEmpty, setPage]);

  const pages = ui.view === "strip" ? doc.pages.filter((p) => p.id === ui.pageId) : doc.pages;
  const ids = doc.pages.map((p) => p.id);
  const live = useCallback(
    (id: string) => {
      if (!visible) return true;
      const i = ids.indexOf(id);
      return [...visible].some((v) => Math.abs(ids.indexOf(v) - i) <= 2);
    },
    [visible, ids],
  );

  return (
    <div className="relative min-h-0 flex-1 bg-tint" data-testid="canvas">
      {ui.show.rulers && <Rulers scroller={scroller} />}
      <div ref={scroller} className={cn("absolute inset-0 overflow-auto", ui.show.rulers && "left-5 top-5")} data-testid="canvas-scroll">
        <div className="flex min-w-fit flex-col items-center gap-2 px-12 py-8">
          {pages.map((p) => (
            <PageSlot key={p.id} page={p} index={doc.pages.indexOf(p)} live={live(p.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PageSlot({ page, index, live }: { page: Page; index: number; live: boolean }) {
  const ed = useEditor();
  const { ui, shown: doc, readOnly } = ed;
  const spec = formatSpec(doc.format);
  const zoom = ui.zoom;
  const active = ui.pageId === page.id;
  const [name, setName] = useState(page.name);
  useEffect(() => setName(page.name), [page.name]);
  const total = doc.pages.length;

  const commitName = () => {
    if (name.trim() && name.trim() !== page.name) ed.commit(renamePage(ed.doc, page.id, name), "Rename page");
    else setName(page.name);
  };

  return (
    <section data-page-slot={page.id} aria-label={`Page ${index + 1}: ${page.name}`} className="flex flex-col gap-1.5" style={{ width: mmToPx(spec.wMm, zoom) }}>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-num">Page {index + 1}</span>
        <span aria-hidden>·</span>
        <input
          aria-label={`Page ${index + 1} title`}
          value={name}
          readOnly={readOnly}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => ed.setPage(page.id)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(page.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn("min-w-0 flex-1 rounded-chip bg-transparent px-1 py-0.5 text-xs text-ink hover:bg-panel", focusRing)}
        />
        {page.kind === "flow" && <Badge tone="info">Flow</Badge>}
        {page.hidden && (
          <span className="inline-flex items-center gap-1">
            <EyeOff aria-hidden className="size-3.5" /> Hidden
          </span>
        )}
        {!readOnly && (
          <Menu
            label={`Page ${index + 1} actions`}
            trigger={(t) => (
              <button {...t} type="button" aria-label={`Page ${index + 1} actions`} className={cn("rounded-chip p-1 hover:bg-panel", focusRing)}>
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            )}
            items={[
              { label: "Duplicate page", onSelect: () => ed.commit(duplicatePage(ed.doc, page.id, { newId: ed.newId }).doc, "Duplicate page") },
              { label: page.hidden ? "Show page" : "Hide page", onSelect: () => ed.commit(setPagesHidden(ed.doc, [page.id], !page.hidden), page.hidden ? "Show page" : "Hide page") },
              { label: "Delete page", danger: true, disabled: total <= 1, onSelect: () => ed.commit(deletePages(ed.doc, [page.id]), "Delete page") },
            ]}
          />
        )}
      </div>
      <div
        className={cn("relative bg-panel shadow-md", active && "ring-2 ring-brand/40", page.hidden && "opacity-60")}
        style={{ width: mmToPx(spec.wMm, zoom), height: mmToPx(spec.hMm, zoom) }}
        onPointerDownCapture={() => {
          if (page.kind !== "flow") return;
          if (!active) ed.setPage(page.id);
          // DS-7: a flow section's settings and text are in the Text drawer.
          if (ed.ui.drawer !== "text" && !readOnly) ed.openDrawer("text");
        }}
      >
        {live ? (
          <Sheet page={page} doc={doc} wMm={spec.wMm} hMm={spec.hMm} zoom={zoom} data={ed.render.data} figures={ed.render.status} assets={ed.render.assets} brand={ed.render.brand} />
        ) : (
          <div aria-hidden className="size-full" style={{ background: page.kind === "freeform" ? (page as FreeformPage).background.color : undefined }} />
        )}
        {page.kind === "freeform" && live && <SelectionLayer page={page} wMm={spec.wMm} hMm={spec.hMm} safeMm={spec.safeMm} bleedMm={spec.bleedMm} zoom={zoom} />}
        {page.kind === "flow" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-panel/90 p-2 text-center text-xs text-muted">This section flows over as many pages as it needs when printed.</div>
        )}
      </div>
      {!readOnly && <AddPageButton index={index + 1} />}
    </section>
  );
}

/** The "+" under a page: a blank page, or a page from a layout of this doc's kind and format. */
export function AddPageButton({ index, label = "Add page" }: { index: number; label?: string }) {
  const ed = useEditor();
  const layouts = useStudioLayouts(ed.doc.kind, ed.doc.format);
  const add = (page: FreeformPage, what: string) => {
    ed.commit(insertPage(ed.doc, page, index), what, { pageId: page.id, select: [] });
    window.setTimeout(() => scrollToPage(page.id), 0);
  };
  return (
    <div className="flex justify-center py-1">
      <Popover
        label={label}
        align="start"
        trigger={(t) => (
          <Button {...t} size="sm" variant="ghost" icon={<Plus aria-hidden className="size-4" />} aria-label={`${label} after page ${index}`}>
            {label}
          </Button>
        )}
      >
        {(close) => (
          <div className="w-64 space-y-2 p-1">
            <button
              type="button"
              className={cn("w-full rounded-control border border-line px-3 py-2 text-left text-sm hover:bg-tint", focusRing)}
              onClick={() => {
                const id = ed.newId("pg");
                add(blankPage(id), "Add page");
                close();
              }}
            >
              Blank page
            </button>
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Layouts</p>
            {layouts.isPending && <p className="px-1 text-xs text-muted">Loading layouts…</p>}
            {layouts.isError && <p className="px-1 text-xs text-bad">Layouts couldn't be loaded.</p>}
            {layouts.data && !layouts.data.length && <p className="px-1 text-xs text-muted">No layouts for this format yet.</p>}
            <ul className="max-h-64 space-y-1 overflow-auto">
              {layouts.data?.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className={cn("w-full rounded-control px-3 py-1.5 text-left text-sm hover:bg-tint", focusRing)}
                    onClick={() => {
                      const id = ed.newId("pg");
                      add(pageFromLayout(l.page, id, String(l.id), l.name), "Add page from layout");
                      close();
                    }}
                  >
                    {l.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Popover>
    </div>
  );
}
