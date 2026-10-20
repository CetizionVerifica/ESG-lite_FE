import { useEffect, useRef, useState } from "react";
import type { Page, ReportDoc } from "../../../lib/studio/contracts";
import { formatPx, type RenderBrand, type RenderData, type RenderDoc, type RenderFlowSection, type RenderFreeformPage } from "../../../lib/studio/render";
import { mountFlow, mountSheet } from "../../../lib/studio/renderHost";
import { cn } from "../../../ui";

/** Pages this far (in viewport heights) outside the scroll area still render live (layer rule 7: visible ±2). */
const ROOT_MARGIN = "200% 0px";

/** Whether `el` is near the viewport; true where IntersectionObserver is missing (tests, old browsers). */
function useNearViewport(el: HTMLElement | null): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setNear(true)), { rootMargin: ROOT_MARGIN });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return near;
}

interface SheetProps {
  page: Page;
  doc: ReportDoc;
  data: RenderData | null;
  brand: RenderBrand | null;
  assets: Record<string, string>;
  zoom: number;
}

/** One page drawn by the renderer mirror in a shadow root, scaled to the zoom. Never restyled by app CSS. */
function Sheet({ page, doc, data, brand, assets, zoom }: SheetProps) {
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const near = useNearViewport(wrap);
  const { w, h } = formatPx(doc.format);
  useEffect(() => {
    if (!near || !host.current) return;
    const opts = { assets: { urls: assets }, brand };
    if (page.kind === "freeform") mountSheet(host.current, page as unknown as RenderFreeformPage, doc as unknown as RenderDoc, data, opts);
    else mountFlow(host.current, page as unknown as RenderFlowSection, doc as unknown as RenderDoc, data, opts);
  }, [near, page, doc, data, brand, assets]);
  const flow = page.kind === "flow";
  return (
    <div ref={setWrap} className="relative shrink-0 overflow-hidden bg-panel shadow-md" style={{ width: Math.round(w * zoom), height: flow ? undefined : Math.round(h * zoom), minHeight: flow ? Math.round(h * zoom * 0.5) : undefined }} data-testid={`sheet-${page.id}`}>
      <div ref={host} style={{ width: w, transform: `scale(${zoom})`, transformOrigin: "top left" }} aria-hidden={!near} />
    </div>
  );
}

export interface ReadOnlyCanvasProps {
  doc: ReportDoc;
  data: RenderData | null;
  brand: RenderBrand | null;
  assets: Record<string, string>;
  zoom: number;
  onPageInView?: (index: number) => void;
}

/**
 * DS-5 · the scroll view of a design (05-ux S3 canvas, read-only): every page
 * in print order with its title above it, drawn by the renderer mirror.
 * Hidden pages show greyed. DS-6 replaces this with the editable canvas.
 */
export function ReadOnlyCanvas({ doc, data, brand, assets, zoom, onPageInView }: ReadOnlyCanvasProps) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (!onPageInView || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) onPageInView(Number((top.target as HTMLElement).dataset.index));
      },
      { threshold: 0.5 },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [doc.pages.length, onPageInView]);
  return (
    <div className="flex flex-col items-center gap-8 px-6 py-8" data-testid="studio-canvas">
      {doc.pages.map((page, i) => (
        <section
          key={page.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          data-index={i}
          aria-label={`Page ${i + 1}: ${page.name}`}
          className={cn("flex flex-col gap-2", page.hidden && "opacity-50")}
          data-testid="studio-page"
        >
          <p className="text-xs text-muted">
            <span className="font-medium text-ink">Page {i + 1}</span> · {page.name}
            {page.kind === "flow" ? " · Flow" : ""}
            {page.hidden ? " · Hidden" : ""}
          </p>
          <Sheet page={page} doc={doc} data={data} brand={brand} assets={assets} zoom={zoom} />
        </section>
      ))}
    </div>
  );
}
