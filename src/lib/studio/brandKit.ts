// DS-3 · brand kit helpers (pure): font names and CSS stacks for the R12 OFL
// set, palette editing rules (the same limits the backend checks), the
// contrast summary per palette, and the brand-controls hook (DS-13): with
// `company.brand_controls` on, pickers offer brand palettes and the brand
// font pair only.
import { contrast, isHex, normalizeHex } from "../../theme/color";
import {
  AA_TEXT_RATIO,
  AA_UI_RATIO,
  BRAND_VOICE_MAX,
  FONT_IDS,
  PALETTE_MAX_COLORS,
  PALETTE_NAME_MAX,
  PALETTES_MAX,
  type BrandKit,
  type BrandKitUpdate,
  type FontId,
  type PaletteContrast,
} from "./contracts";

export const FONT_NAMES: Record<FontId, string> = {
  "source-serif-4": "Source Serif 4",
  "source-sans-3": "Source Sans 3",
  "dm-serif-display": "DM Serif Display",
  "ibm-plex-sans": "IBM Plex Sans",
  "ibm-plex-serif": "IBM Plex Serif",
  archivo: "Archivo",
  fraunces: "Fraunces",
  "noto-sans": "Noto Sans",
};
const SERIF = new Set<FontId>(["source-serif-4", "dm-serif-display", "ibm-plex-serif", "fraunces"]);

/** The template default when the brand names no fonts (ESG-lite brandkit/fonts.ts DEFAULT_PAIR). */
export const DEFAULT_FONTS: { heading: FontId; body: FontId } = { heading: "source-serif-4", body: "source-sans-3" };

/** A CSS font-family for a sample of `font` (the face itself is served by the studio renderer). */
export const fontStack = (font: FontId): string => `"${FONT_NAMES[font]}", ${SERIF.has(font) ? "Georgia, serif" : "system-ui, sans-serif"}`;

/** Editable palette in the brand kit form (`key` is local; `id` is the stored one). */
export interface PaletteDraft {
  key: string;
  id?: number;
  name: string;
  colors: string[];
}

export interface BrandKitDraft {
  heading: FontId | null;
  body: FontId | null;
  voice: string;
  palettes: PaletteDraft[];
}

export const draftFromKit = (kit: BrandKit): BrandKitDraft => ({
  heading: kit.fonts.heading,
  body: kit.fonts.body,
  voice: kit.voice,
  palettes: kit.palettes.map((p) => ({ key: `p${p.id}`, id: p.id, name: p.name, colors: [...p.colors] })),
});

/** The PUT body for a draft: everything, palettes in order with colours normalised. */
export const updateFromDraft = (d: BrandKitDraft): BrandKitUpdate => ({
  fonts: { heading: d.heading, body: d.body },
  voice: d.voice,
  palettes: d.palettes.map((p) => ({ ...(p.id !== undefined ? { id: p.id } : {}), name: p.name.trim(), colors: p.colors.map(normalizeHex) })),
});

export const draftsEqual = (a: BrandKitDraft, b: BrandKitDraft): boolean => JSON.stringify(updateFromDraft(a)) === JSON.stringify(updateFromDraft(b));

/** Problems that block Save, keyed for the form ("voice", "palettes.0.name", …), with the backend's limits. */
export function draftErrors(d: BrandKitDraft): Record<string, string> {
  const out: Record<string, string> = {};
  if (d.voice.length > BRAND_VOICE_MAX) out.voice = `Keep the brand voice to ${BRAND_VOICE_MAX.toLocaleString("en")} characters.`;
  if (d.palettes.length > PALETTES_MAX) out.palettes = `A brand kit holds up to ${PALETTES_MAX} palettes.`;
  d.palettes.forEach((p, i) => {
    if (!p.name.trim()) out[`palettes.${i}.name`] = "Name the palette.";
    else if (p.name.trim().length > PALETTE_NAME_MAX) out[`palettes.${i}.name`] = `Use up to ${PALETTE_NAME_MAX} characters.`;
    if (p.colors.length === 0) out[`palettes.${i}.colors`] = "Add at least one colour.";
    else if (p.colors.length > PALETTE_MAX_COLORS) out[`palettes.${i}.colors`] = `A palette holds up to ${PALETTE_MAX_COLORS} colours.`;
    else if (p.colors.some((c) => !isHex(c))) out[`palettes.${i}.colors`] = "Use hex colours like #1A2B3C.";
  });
  return out;
}

/** Every pair of a palette's colours (as the backend's report), for unsaved drafts. */
export function paletteContrast(colors: string[]): PaletteContrast[] {
  const cs = colors.filter((c) => isHex(c)).map(normalizeHex);
  const out: PaletteContrast[] = [];
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      const ratio = Math.round(contrast(cs[i], cs[j]) * 100) / 100;
      out.push({ a: cs[i], b: cs[j], ratio, text: ratio >= AA_TEXT_RATIO, graphic: ratio >= AA_UI_RATIO });
    }
  return out;
}

/** "3 text pairs · 1 graphics only · 2 low" for a palette's badge. */
export function contrastSummary(pairs: PaletteContrast[]): { text: number; graphic: number; low: number } {
  return {
    text: pairs.filter((p) => p.text).length,
    graphic: pairs.filter((p) => p.graphic && !p.text).length,
    low: pairs.filter((p) => !p.graphic).length,
  };
}

/** Moves item `from` to `to` (reorder palettes). */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** The colours a picker may offer: the brand palettes only when brand controls are on, else `free` (null = any colour). */
export function allowedColours(kit: Pick<BrandKit, "brandControls" | "palettes" | "colors">): string[] | null {
  if (!kit.brandControls) return null;
  const all = [kit.colors.primary, kit.colors.accent, ...kit.palettes.flatMap((p) => p.colors)].map((c) => c.toLowerCase());
  return [...new Set(all)];
}

/** The fonts a picker may offer: the brand pair only when brand controls are on. */
export function allowedFonts(kit: Pick<BrandKit, "brandControls" | "fonts">): FontId[] {
  if (!kit.brandControls) return [...FONT_IDS];
  const pair = [kit.fonts.heading ?? DEFAULT_FONTS.heading, kit.fonts.body ?? DEFAULT_FONTS.body];
  return [...new Set(pair)];
}
