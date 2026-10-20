// DS-7 · overflow is always visible (RS-7 §4). After every render of a sheet
// the text boxes are measured the way render/measure.ts measures them for the
// TEXT_OVERFLOW check (text taller than its frame); an overflowing box gets a
// red corner with "+N lines" and three one-click fixes:
//   Shrink text to fit   one text style down, to the design minimum (caption);
//   Grow box             the frame grows to fit, up to the safe area;
//   Move rest to a new text box   the blocks that don't fit go to a box below.
// Free-form frames never flow into each other on their own.
import { useEffect, useState } from "react";
import { ChevronsDown, Minimize2, SplitSquareVertical } from "lucide-react";
import type { Element, FreeformPage, PageFormat, TextStyleId } from "../../../../lib/studio/contracts";
import { linesOver, measureOverflow, type Overflow } from "./overflow";
import { Menu, cn, focusRing } from "../../../../ui";
import { useEditor as useStudioEditor } from "../EditorContext";
import { sheetRoot, scaleOf } from "../canvasUtil";
import type { PageOverlayProps } from "../registry";
import { useEditingTarget } from "./editing";
import { growBox, isTextElement, shrinkText, smallerStyle, splitText } from "./ops";

const styleOf = (el: Element): TextStyleId => (el.type === "text" ? el.props.style : "body");

/** The page overlay: measures after each render and tags overflowing boxes. */
export function OverflowLayer({ page, zoom, hMm, safeMm }: PageOverlayProps) {
  const ed = useStudioEditor();
  const editing = useEditingTarget();
  const [over, setOver] = useState<Record<string, Overflow>>({});

  useEffect(() => {
    let frame: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      clearTimeout(frame);
      // After the browser has laid the sheet out (a re-render paints synchronously).
      frame = setTimeout(() => setOver((prev) => {
        const next = measureOverflow(page.id);
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      }), 16);
    };
    run();
    const root = sheetRoot(page.id);
    const mo = root && typeof MutationObserver !== "undefined" ? new MutationObserver(run) : null;
    if (root) mo?.observe(root, { childList: true });
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", run);
    return () => {
      clearTimeout(frame);
      mo?.disconnect();
      fonts?.removeEventListener?.("loadingdone", run);
    };
  }, [page, ed.render.data]);

  return (
    <>
      {page.elements.map((el) => {
        const o = over[el.id];
        if (!o || el.hidden || !isTextElement(el) || (editing && editing.elementId === el.id)) return null;
        return <OverflowTag key={el.id} el={el} overflowMm={o.overflowMm} cutBlock={o.cutBlock} zoom={zoom} format={ed.doc.format} page={page} limitMm={hMm - safeMm} safeMm={safeMm} pageHmm={hMm} />;
      })}
    </>
  );
}

export interface OverflowTagProps {
  el: Element;
  overflowMm: number;
  zoom: number;
  format: PageFormat;
  /** While typing: the tag only, no fixes (they apply after the edit). */
  live?: boolean;
  cutBlock?: number | null;
  page?: FreeformPage;
  limitMm?: number;
  safeMm?: number;
  pageHmm?: number;
}

export function OverflowTag({ el, overflowMm, zoom, format, live, cutBlock, page, limitMm = 0, safeMm = 0, pageHmm = 0 }: OverflowTagProps) {
  const ed = useStudioEditor();
  const k = scaleOf(zoom);
  const n = linesOver(overflowMm, styleOf(el), format);
  const label = `+${n} line${n === 1 ? "" : "s"}`;
  const style = { left: (el.frame.x + el.frame.w) * k, top: (el.frame.y + el.frame.h) * k };
  const corner = <span aria-hidden className="absolute -left-3 -top-3 size-0 border-b-[12px] border-l-[12px] border-b-bad border-l-transparent" />;
  if (live || !page) {
    return (
      <span className="pointer-events-none absolute -translate-x-full" style={style} data-testid={`overflow-${el.id}`}>
        {corner}
        <span className="absolute left-0 top-1 whitespace-nowrap rounded-chip bg-bad px-1.5 py-0.5 text-[10px] font-semibold text-on-brand">{label}</span>
      </span>
    );
  }
  const locked = !!el.locked || !!el.templateLocked || ed.readOnly;
  const smaller = el.type === "text" ? smallerStyle(el.props.style) : null;
  const canGrow = el.frame.y + el.frame.h + 0.5 < limitMm;
  return (
    <span className="absolute -translate-x-full" style={style} data-testid={`overflow-${el.id}`}>
      {corner}
      <Menu
        label={`Text doesn't fit: ${label}`}
        align="start"
        trigger={(t) => (
          <button {...t} type="button" onPointerDown={(e) => e.stopPropagation()} className={cn("absolute left-0 top-1 whitespace-nowrap rounded-chip bg-bad px-1.5 py-0.5 text-[10px] font-semibold text-on-brand", focusRing)} aria-label={`Text doesn't fit: ${label}`}>
            {label}
          </button>
        )}
        items={[
          { kind: "heading", content: <span className="text-xs text-muted">This text is taller than its box.</span> },
          { label: "Shrink text to fit", icon: <Minimize2 aria-hidden className="size-4" />, disabled: locked || !smaller, onSelect: () => ed.commit(shrinkText(ed.doc, page.id, el.id), "Shrink text to fit", { select: [el.id], pageId: page.id }) },
          { label: "Grow box", icon: <ChevronsDown aria-hidden className="size-4" />, disabled: locked || !canGrow, onSelect: () => ed.commit(growBox(ed.doc, page.id, el.id, overflowMm + 0.5, limitMm), "Grow box", { select: [el.id], pageId: page.id }) },
          {
            label: "Move rest to a new text box",
            icon: <SplitSquareVertical aria-hidden className="size-4" />,
            disabled: locked || el.type !== "text" || !cutBlock,
            onSelect: () => {
              const r = splitText(ed.doc, page.id, el.id, cutBlock ?? 0, ed.newId("el"), { hMm: pageHmm, safeMm });
              if (r.id) ed.commit(r.doc, "Move rest to a new text box", { select: [r.id], pageId: page.id });
            },
          },
        ]}
      />
    </span>
  );
}
