// DS-3 · Styles on a whole report (pure; `docOps.applyStyle` in the layer
// spec). DS-6's docOps.ts re-exports these and runs them through history, so
// Apply and Shuffle are one undo step each.
//
//   applyStyle(doc, preset)       writes design.styleId + theme colours and fonts, and clears
//                                 per-element colours (and page backgrounds) that equal one of
//                                 the old palette roles, so they follow the new theme. Colours
//                                 the user picked outside the palette stay.
//   shuffleVariant(preset, seed)  rotates role assignments within the preset, deterministic per
//                                 seed: primary ↔ accent and light ↔ dark openers.
//   shuffleStyle(doc, preset, seed)  applyStyle with that variant; dark openers get the primary
//                                 as background and the surface colour as text.
//
// The input doc is never mutated; untouched pages and elements keep their identity.
import { contrast } from "../../theme/color";
import { AA_TEXT_RATIO, AA_UI_RATIO, type Element, type FreeformPage, type Page, type ReportDoc, type StylePreset } from "./contracts";

export const PALETTE_ROLES = ["primary", "accent", "ink", "surface", "muted"] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

type Colors = NonNullable<ReportDoc["design"]["theme"]["colors"]>;

/** The preset palette as named roles. */
export const roleColors = (preset: StylePreset): Record<PaletteRole, string> => {
  const [primary, accent, ink, surface, muted] = preset.palette;
  return { primary, accent, ink, surface, muted };
};

const lower = (c: string | undefined) => (c ? c.toLowerCase() : c);

/** Colour props per element type that a style may clear. */
const COLOUR_PROPS: Partial<Record<Element["type"], string[]>> = {
  text: ["color"],
  shape: ["fill", "stroke"],
  icon: ["color"],
  divider: ["color"],
  page_number: ["color"],
  line: ["stroke"],
  progress: ["color"],
  callout: ["color"],
  qr: ["color"],
};

function clearElement(el: Element, old: Set<string>): Element {
  const keys = COLOUR_PROPS[el.type];
  if (!keys) return el;
  const props = el.props as unknown as Record<string, unknown>;
  const hit = keys.filter((k) => typeof props[k] === "string" && old.has((props[k] as string).toLowerCase()));
  if (!hit.length) return el;
  const next = { ...props };
  for (const k of hit) delete next[k];
  return { ...el, props: next } as unknown as Element;
}

function clearPage(page: Page, old: Set<string>): Page {
  if (page.kind !== "freeform") return page;
  let changed = false;
  const elements = page.elements.map((el) => {
    const n = clearElement(el, old);
    if (n !== el) changed = true;
    return n;
  });
  let background = page.background;
  if (background.color && old.has(background.color.toLowerCase())) {
    background = { ...background };
    delete background.color;
    changed = true;
  }
  return changed ? { ...page, elements, background } : page;
}

/** The old palette role colours of a doc (what applyStyle clears). */
export function oldRoleColours(doc: ReportDoc): Set<string> {
  const colors: Colors = doc.design.theme.colors ?? {};
  return new Set(PALETTE_ROLES.map((r) => lower(colors[r])).filter((c): c is string => !!c));
}

export function applyStyle(doc: ReportDoc, preset: StylePreset): ReportDoc {
  const old = oldRoleColours(doc);
  const roles = roleColors(preset);
  const theme = doc.design.theme;
  return {
    ...doc,
    design: {
      ...doc.design,
      styleId: preset.id,
      theme: { ...theme, colors: { ...theme.colors, ...roles }, fonts: { heading: preset.fonts.heading, body: preset.fonts.body } },
    },
    pages: old.size ? doc.pages.map((p) => clearPage(p, old)) : doc.pages,
  };
}

export interface ShuffleVariant {
  swapPrimaryAccent: boolean;
  darkOpeners: boolean;
}

const VARIANTS: ShuffleVariant[] = [
  { swapPrimaryAccent: true, darkOpeners: false },
  { swapPrimaryAccent: false, darkOpeners: true },
  { swapPrimaryAccent: true, darkOpeners: true },
  { swapPrimaryAccent: false, darkOpeners: false },
];

/** The variant for `seed` (0, 1, 2 …): never the plain preset first, the same seed always the same. */
export const variantFor = (seed: number): ShuffleVariant => VARIANTS[((Math.trunc(seed) % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];

/**
 * The preset with roles rotated for `seed`. A swap that would make headings
 * unreadable (accent under 3:1 on the surface) is skipped; so are dark openers
 * when the surface colour isn't readable on the primary (4.5:1).
 */
export function shuffleVariant(preset: StylePreset, seed: number): { preset: StylePreset; variant: ShuffleVariant } {
  const want = variantFor(seed);
  const [primary, accent, ink, surface, muted] = preset.palette;
  const swap = want.swapPrimaryAccent && contrast(accent, surface) >= AA_UI_RATIO;
  const p = swap ? accent : primary;
  const darkOpeners = want.darkOpeners && contrast(surface, p) >= AA_TEXT_RATIO;
  const palette: StylePreset["palette"] = swap ? [accent, primary, ink, surface, muted] : [primary, accent, ink, surface, muted];
  return { preset: { ...preset, palette }, variant: { swapPrimaryAccent: swap, darkOpeners } };
}

/** Cover, chapter opener and back cover pages (by layout id or name). */
export const isOpener = (page: Page): page is FreeformPage => page.kind === "freeform" && /cover|opener|chapter/i.test(`${page.layoutId ?? ""} ${page.name}`);

function darkenOpener(page: FreeformPage, roles: Record<PaletteRole, string>): FreeformPage {
  const elements = page.elements.map((el) => (el.type === "text" && !el.props.color ? ({ ...el, props: { ...el.props, color: roles.surface } } as Element) : el));
  return { ...page, background: { ...page.background, color: roles.primary }, elements };
}

export function shuffleStyle(doc: ReportDoc, preset: StylePreset, seed: number): ReportDoc {
  const { preset: shuffled, variant } = shuffleVariant(preset, seed);
  const styled = applyStyle(doc, shuffled);
  if (!variant.darkOpeners) return styled;
  const roles = roleColors(shuffled);
  return { ...styled, pages: styled.pages.map((p) => (isOpener(p) ? darkenOpener(p, roles) : p)) };
}

/** The colour role a hex plays in the doc's theme, if any (swatch tooltips). */
export function roleOf(doc: ReportDoc, hex: string): PaletteRole | null {
  const colors: Colors = doc.design.theme.colors ?? {};
  return PALETTE_ROLES.find((r) => lower(colors[r]) === hex.toLowerCase()) ?? null;
}
