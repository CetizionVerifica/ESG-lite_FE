// DS-4 · what library previews render with: the client's brand from the brand
// kit (DS-3) and a one-page doc around a layout or element.
import { useMemo } from "react";
import type { Element, ElementGroupPayload, FreeformPage, ReportDoc } from "../../../../lib/studio/contracts";
import { insertElement } from "../../../../lib/studio/libraryOps";
import type { RenderBrand } from "../../../../lib/studio/render";
import { useBrandKit } from "../../brand-kit/api";

/** The brand kit as the renderer's brand (null while it loads or fails: the look's colours). */
export function useRenderBrand(): RenderBrand | null {
  const kit = useBrandKit();
  return useMemo(
    () => (kit.data ? { primary: kit.data.colors.primary, accent: kit.data.colors.accent, fontHeading: kit.data.fonts.heading, fontBody: kit.data.fonts.body, logoUrl: kit.data.logos.primary } : null),
    [kit.data],
  );
}

/** A one-page doc in the current doc's format and theme. */
export const previewDoc = (doc: ReportDoc, page: FreeformPage): ReportDoc => ({ ...doc, pages: [page] });

const PREVIEW_PAGE = "preview";

/**
 * An element template placed on an empty page of the doc's format, with the
 * box to crop the thumbnail to (a little air around it). Bindings are fitted
 * to the doc, as on insert.
 */
export function elementPreview(doc: ReportDoc, payload: Element | ElementGroupPayload): { doc: ReportDoc; page: FreeformPage; crop: { x: number; y: number; w: number; h: number } } {
  const blank: FreeformPage = { id: PREVIEW_PAGE, kind: "freeform", name: "Preview", background: {}, elements: [] };
  let n = 0;
  const { doc: out } = insertElement(previewDoc(doc, blank), PREVIEW_PAGE, payload, { newId: (p) => `${p}-${++n}` });
  const page = out.pages[0] as FreeformPage;
  const els = page.elements;
  if (!els.length) return { doc: out, page, crop: { x: 0, y: 0, w: 10, h: 10 } };
  const minX = Math.min(...els.map((e) => e.frame.x));
  const minY = Math.min(...els.map((e) => e.frame.y));
  const maxX = Math.max(...els.map((e) => e.frame.x + e.frame.w));
  const maxY = Math.max(...els.map((e) => e.frame.y + e.frame.h));
  const pad = Math.max(2, (maxX - minX) * 0.08);
  return { doc: out, page, crop: { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad } };
}
