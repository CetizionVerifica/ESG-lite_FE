import { useEffect, useRef } from "react";
import type { FreeformPage, PageFormat, ReportDoc } from "../../../../lib/studio/contracts";
import { PX_PER_MM, formatPx, type RenderBrand } from "../../../../lib/studio/render";
import { mountSheet } from "../../../../lib/studio/renderHost";
import { cn } from "../../../../ui";

export interface SheetThumbProps {
  /** The doc the page belongs to (format, theme, meta for page numbers). */
  doc: ReportDoc;
  page: FreeformPage;
  /** Width of the thumbnail in CSS px; the height follows the format (or the crop). */
  width: number;
  brand?: RenderBrand | null;
  /** Show only this part of the page (mm), e.g. one element. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Cap the height (px); a taller crop is scaled to fit. */
  maxHeight?: number;
  className?: string;
  label?: string;
}

/**
 * DS-4 · a page drawn by the renderer (layer rule 2) into a shadow root and
 * scaled down: template, layout and element previews show exactly what the
 * page will look like, in the doc's look and the client's brand. No data:
 * bound values show "Not reported", as before a doc is built.
 */
export function SheetThumb({ doc, page, width, brand, crop, maxHeight, className, label }: SheetThumbProps) {
  const host = useRef<HTMLDivElement>(null);
  const size = formatPx(doc.format as PageFormat);
  const view = crop ? { x: crop.x * PX_PER_MM, y: crop.y * PX_PER_MM, w: Math.max(1, crop.w * PX_PER_MM), h: Math.max(1, crop.h * PX_PER_MM) } : { x: 0, y: 0, w: size.w, h: size.h };
  let scale = width / view.w;
  if (maxHeight && view.h * scale > maxHeight) scale = maxHeight / view.h;
  useEffect(() => {
    if (!host.current) return;
    try {
      mountSheet(host.current, page, doc, null, { brand: brand ?? null });
    } catch {
      // A page the renderer can't draw shows the empty frame; the card still works.
    }
  }, [doc, page, brand]);
  return (
    <div role="img" aria-label={label ?? page.name} className={cn("relative overflow-hidden", className)} style={{ width: Math.round(view.w * scale), height: Math.round(view.h * scale) }}>
      <div
        ref={host}
        aria-hidden
        style={{ width: size.w, height: size.h, transform: `scale(${scale}) translate(${-view.x}px, ${-view.y}px)`, transformOrigin: "top left", pointerEvents: "none" }}
      />
    </div>
  );
}
