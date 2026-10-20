// DS-6 · rulers in mm along the top and left of the canvas, measured from the
// page in view. Drag from a ruler onto a page to add a ruler guide (stored in
// page.guides, never printed): from the top ruler a horizontal guide, from
// the left ruler a vertical one.
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { addGuide } from "../../../lib/studio/docOps";
import { formatSpec } from "../../../lib/studio/render";
import { rulerTicks } from "../../../lib/studio/snapping";
import { pageAtPoint, scaleOf } from "./canvasUtil";
import { useEditor } from "./EditorContext";

const SIZE = 20;

interface Origin {
  x: number;
  y: number;
}

export function Rulers({ scroller }: { scroller: RefObject<HTMLDivElement | null> }) {
  const ed = useEditor();
  const { ui } = ed;
  const spec = formatSpec(ed.doc.format);
  const k = scaleOf(ui.zoom);
  const [origin, setOrigin] = useState<Origin>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ axis: "x" | "y"; client: number } | null>(null);

  // Keep the 0 mark on the page in view's top-left corner.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const page = el.querySelector<HTMLElement>(`[data-overlay-page="${ui.pageId}"]`) ?? el.querySelector<HTMLElement>("[data-overlay-page]");
        if (!page) return;
        const a = page.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        setOrigin({ x: a.left - b.left, y: a.top - b.top });
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [scroller, ui.pageId, ui.zoom, ui.view, ed.doc.pages.length]);

  const start = (axis: "x" | "y") => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (ed.readOnly || e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging({ axis, client: axis === "y" ? e.clientY : e.clientX });
  };
  const move = (e: ReactPointerEvent) => dragging && setDragging({ ...dragging, client: dragging.axis === "y" ? e.clientY : e.clientX });
  const end = (e: ReactPointerEvent) => {
    if (!dragging) return;
    setDragging(null);
    const at = pageAtPoint(e.clientX, e.clientY, ui.zoom);
    if (!at) return;
    const mm = dragging.axis === "x" ? at.x : at.y;
    ed.commit(addGuide(ed.doc, at.pageId, dragging.axis, mm), "Add guide", { pageId: at.pageId });
  };

  // From the top ruler you pull a horizontal guide (axis y); from the left one a vertical guide (axis x).
  const top = rulerTicks(Math.max(spec.wMm, 1) + 40, ui.zoom, -20);
  const left = rulerTicks(Math.max(spec.hMm, 1) + 40, ui.zoom, -20);
  const tick = "pointer-events-none absolute bg-muted/60";
  return (
    <>
      <div aria-hidden className="absolute left-0 top-0 z-10 size-5 border-b border-r border-line bg-panel" />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Top ruler (mm). Drag down onto a page to add a horizontal guide."
        data-testid="ruler-top"
        className="absolute left-5 right-0 top-0 z-10 cursor-ns-resize overflow-hidden border-b border-line bg-panel font-num text-[9px] text-muted"
        style={{ height: SIZE }}
        onPointerDown={start("y")}
        onPointerMove={move}
        onPointerUp={end}
      >
        {top.map((t) => (
          <span key={t.mm} className={tick} style={{ left: origin.x + t.mm * k, bottom: 0, width: 1, height: t.major ? 8 : 4 }}>
            {t.major && <span className="absolute left-0.5 top-[-10px] whitespace-nowrap bg-transparent text-muted">{t.mm}</span>}
          </span>
        ))}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Left ruler (mm). Drag right onto a page to add a vertical guide."
        data-testid="ruler-left"
        className="absolute bottom-0 left-0 top-5 z-10 cursor-ew-resize overflow-hidden border-r border-line bg-panel font-num text-[9px] text-muted"
        style={{ width: SIZE }}
        onPointerDown={start("x")}
        onPointerMove={move}
        onPointerUp={end}
      >
        {left.map((t) => (
          <span key={t.mm} className={tick} style={{ top: origin.y + t.mm * k, right: 0, height: 1, width: t.major ? 8 : 4 }}>
            {t.major && <span className="absolute left-[-14px] top-0.5 text-muted">{t.mm}</span>}
          </span>
        ))}
      </div>
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 bg-accent"
          style={dragging.axis === "y" ? { left: 0, right: 0, top: dragging.client, height: 1 } : { top: 0, bottom: 0, left: dragging.client, width: 1 }}
        />
      )}
    </>
  );
}
