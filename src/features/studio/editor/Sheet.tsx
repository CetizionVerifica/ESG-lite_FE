// DS-6 · one page drawn by the renderer (layer rule 2): a free-form sheet or
// a flow section in a shadow root, scaled to the zoom. The editor never
// restyles report content; while a drag runs, SelectionLayer moves the
// rendered element boxes directly (liveFrame) and the next render puts them
// back from the doc.
import { memo, useLayoutEffect, useRef } from "react";
import type { FlowSection, FreeformPage, ReportDoc } from "../../../lib/studio/contracts";
import { mountFlow, mountSheet } from "../../../lib/studio/renderHost";
import { mmToPx } from "../../../lib/studio/geometry";
import { clearSheetRoot, setSheetRoot } from "./canvasUtil";
import type { RenderAssets, RenderBrand, RenderData, RenderDoc, RenderFlowSection, RenderFreeformPage } from "../../../lib/studio/render";

export interface SheetProps {
  page: FreeformPage | FlowSection;
  doc: ReportDoc;
  /** Page sizes in mm. */
  wMm: number;
  hMm: number;
  zoom: number;
  data: RenderData | null;
  assets: RenderAssets;
  brand: RenderBrand | null;
  /** Thumbnails don't register their roots for live drags. */
  thumbnail?: boolean;
}

/** Stable deps: the parts of the doc a sheet render reads besides its page. */
const docKey = (doc: ReportDoc) => `${doc.kind}|${doc.format}|${JSON.stringify(doc.meta)}|${JSON.stringify(doc.design.theme)}|${doc.pages.map((p) => `${p.id}:${p.hidden ? 1 : 0}:${p.name}:${p.bookmark ?? ""}`).join(",")}|${doc.assets.length}`;

function SheetImpl({ page, doc, wMm, hMm, zoom, data, assets, brand, thumbnail }: SheetProps) {
  const host = useRef<HTMLDivElement>(null);
  const key = docKey(doc);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const rdoc = doc as unknown as RenderDoc;
    const root =
      page.kind === "freeform"
        ? mountSheet(el, page as unknown as RenderFreeformPage, rdoc, data, { assets, brand })
        : mountFlow(el, page as unknown as RenderFlowSection, rdoc, data, { assets, brand });
    if (!thumbnail) setSheetRoot(page.id, root);
    return () => {
      if (!thumbnail) clearSheetRoot(page.id, root);
    };
    // `key` stands for the doc parts the renderer reads (page numbers, theme, meta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, key, data, assets, brand, thumbnail]);

  // Flow sections paginate in print; the editor shows their first page's worth.
  return (
    <div className="relative overflow-hidden" style={{ width: mmToPx(wMm, zoom), height: mmToPx(hMm, zoom) }} aria-hidden>
      <div ref={host} data-sheet-host={page.id} style={{ width: `${wMm}mm`, transform: `scale(${zoom})`, transformOrigin: "0 0", pointerEvents: "none" }} />
    </div>
  );
}

export const Sheet = memo(SheetImpl);

