// DS-3 · Brand drawer edits (pure, like styleOps): insert a brand logo as an
// image element, colour the selection with a palette swatch, and set the
// doc's fonts to the brand pair. DS-6 runs them through history (one undo
// step each). The input doc is never mutated.
//
// Logos are referenced as doc assets with the reserved ids `brand:logo` and
// `brand:logo-on-dark` (kind `logo`); the renderer (DS-1) and assets (DS-4)
// resolve them to the brand's current logo URLs.
import { PAGE_FORMAT_SIZES, type AssetRef, type Element, type FontId, type FreeformPage, type ReportDoc } from "./contracts";

export const BRAND_LOGO_ASSETS = { primary: "brand:logo", onDark: "brand:logo-on-dark" } as const;
export type LogoVariant = keyof typeof BRAND_LOGO_ASSETS;

/** A logo 30 % of the page width, 2:1 unless the natural size is known, centred. */
export function insertLogo(doc: ReportDoc, pageId: string, variant: LogoVariant, opts: { id: string; alt: string; ratio?: number }): ReportDoc {
  const size = PAGE_FORMAT_SIZES[doc.format];
  const w = Math.round(size.wMm * 0.3 * 10) / 10;
  const h = Math.round((w / (opts.ratio && opts.ratio > 0 ? opts.ratio : 2)) * 10) / 10;
  const assetId = BRAND_LOGO_ASSETS[variant];
  const assets: AssetRef[] = doc.assets.some((a) => a.id === assetId) ? doc.assets : [...doc.assets, { id: assetId, kind: "logo", w: 600, h: Math.round(600 / (opts.ratio || 2)), alt: opts.alt }];
  let found = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId || p.kind !== "freeform") return p;
    found = true;
    const z = p.elements.reduce((m, e) => Math.max(m, e.z), -1) + 1;
    const el: Element = { id: opts.id, type: "image", frame: { x: (size.wMm - w) / 2, y: (size.hMm - h) / 2, w, h, rotation: 0 }, z, source: "user", props: { assetId, fit: "contain", alt: opts.alt } };
    return { ...p, elements: [...p.elements, el] } satisfies FreeformPage;
  });
  return found ? { ...doc, assets, pages } : doc;
}

/** Which prop a swatch colours, per element type (shapes: the fill). */
const SWATCH_PROP: Partial<Record<Element["type"], string>> = {
  text: "color",
  shape: "fill",
  icon: "color",
  divider: "color",
  page_number: "color",
  line: "stroke",
  progress: "color",
  callout: "color",
  qr: "color",
};

/** True when a swatch can colour this element. */
export const canColour = (el: Element): boolean => !!SWATCH_PROP[el.type] && !el.locked;

/** Colours the selected elements on `pageId`; with nothing selected that can take colour, the page background. */
export function colourSelection(doc: ReportDoc, pageId: string, ids: string[], hex: string): ReportDoc {
  const colour = hex.toLowerCase();
  return {
    ...doc,
    pages: doc.pages.map((p) => {
      if (p.id !== pageId || p.kind !== "freeform") return p;
      const targets = p.elements.filter((e) => ids.includes(e.id) && canColour(e));
      if (!targets.length) return { ...p, background: { ...p.background, color: colour } };
      const hit = new Set(targets.map((t) => t.id));
      return {
        ...p,
        elements: p.elements.map((e) => (hit.has(e.id) ? ({ ...e, props: { ...e.props, [SWATCH_PROP[e.type] as string]: colour } } as Element) : e)),
      };
    }),
  };
}

/** Sets the doc's heading and body fonts (theme overrides). */
export function applyFonts(doc: ReportDoc, fonts: { heading: FontId; body: FontId }): ReportDoc {
  const theme = doc.design.theme;
  return { ...doc, design: { ...doc.design, theme: { ...theme, fonts: { heading: fonts.heading, body: fonts.body } } } };
}
