// PE-2 · text effects and per-box fonts: the pure parts. Effects are slider
// units (contracts TextEffects); the shared renderer (render/textEffects.ts)
// turns them into CSS/SVG, so the editor, Page view and PDF match.
import { FONT_IDS, isCustomFontRef, type BrandFont, type Element, type FontId, type FontRef, type ReportDoc, type TextEffectKind, type TextEffects } from "../../../lib/studio/contracts";
import { FONT_NAMES } from "../../../lib/studio/brandKit";
import { buildTheme, contrastRatio, mix, type RenderBrand, type RenderCustomFont } from "../../../lib/studio/render";

type TextBox = Extract<Element, { type: "text" }>;

export const EFFECT_LABELS: Record<TextEffectKind, string> = { shadow: "Shadow", lift: "Lift", outline: "Outline", highlight: "Highlight", curve: "Curve" };

/** Report colours (doc data from the resolved theme, not app colours) an effect starts with. */
export interface EffectColours {
  ink: string;
  highlight: string;
}

/** The report's theme colours for effects: its ink, and a light brand accent for highlights (with its contrast). */
export function effectColours(doc: ReportDoc, brand: RenderBrand | null): EffectColours & { contrast: number; swatches: string[] } {
  const t = buildTheme(doc.design.theme as never, brand);
  const highlight = mix(t.colors.accent, t.colors.paper, 0.6).toLowerCase();
  const swatches = [...new Set([t.colors.primary, t.colors.accent, highlight, mix(t.colors.primary, t.colors.paper, 0.75), t.colors.ink, t.colors.muted, t.colors.paper].map((c) => c.toLowerCase()))];
  return { ink: t.colors.ink, highlight, contrast: contrastRatio(highlight, t.colors.ink), swatches };
}

/** The values an effect starts with when it is switched on (mockup: blur 16, offset 6). */
export function effectDefaults(kind: TextEffectKind, colours: EffectColours): NonNullable<TextEffects[TextEffectKind]> {
  switch (kind) {
    case "shadow":
      return { blur: 16, offsetX: 6, offsetY: 6, colour: colours.ink, opacity: 40 };
    case "lift":
      return { intensity: 50 };
    case "outline":
      return { width: 20, colour: colours.ink };
    case "highlight":
      return { colour: colours.highlight, radius: 30 };
    case "curve":
      return { radius: 50 };
  }
}

/** Effects with nothing left are removed (`undefined`), so a box renders exactly as before. */
const tidy = (e: TextEffects): TextEffects | undefined => {
  const out = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as TextEffects;
  return Object.keys(out).length ? out : undefined;
};

/**
 * Switches an effect on (with its defaults, or what it had) or off. Shadow and
 * lift exclude each other: turning one on turns the other off.
 */
export function toggleEffect(current: TextEffects | undefined, kind: TextEffectKind, on: boolean, colours: EffectColours): TextEffects | undefined {
  const next: TextEffects = { ...(current ?? {}) };
  if (!on) {
    delete next[kind];
    return tidy(next);
  }
  if (kind === "shadow") delete next.lift;
  if (kind === "lift") delete next.shadow;
  (next as Record<string, unknown>)[kind] = current?.[kind] ?? effectDefaults(kind, colours);
  return tidy(next);
}

/** Changes one value of an effect that is on (integers, clamped to the contract's range). */
export function setEffectValue<K extends TextEffectKind>(current: TextEffects | undefined, kind: K, patch: Partial<NonNullable<TextEffects[K]>>): TextEffects | undefined {
  const cur = current?.[kind];
  if (!cur) return current;
  const clamped = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === "number" ? clampValue(kind, k, v) : v]));
  return { ...current, [kind]: { ...cur, ...clamped } };
}

/** The contract's slider ranges. */
export function effectRange(kind: TextEffectKind, key: string): [number, number] {
  if (kind === "shadow" && (key === "offsetX" || key === "offsetY")) return [-100, 100];
  if (kind === "curve") return [-100, 100];
  return [0, 100];
}
const clampValue = (kind: TextEffectKind, key: string, v: number): number => {
  const [lo, hi] = effectRange(kind, key);
  return Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : 0)));
};

/** The effects that are on, in the contract's order. */
export const activeEffects = (e: TextEffects | undefined): TextEffectKind[] => (e ? (Object.keys(EFFECT_LABELS) as TextEffectKind[]).filter((k) => !!e[k]) : []);

function mapText(doc: ReportDoc, pageId: string, ids: string[], fn: (e: TextBox) => TextBox): ReportDoc {
  const want = new Set(ids);
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId || p.kind !== "freeform") return p;
    let pageChanged = false;
    const elements = p.elements.map((e) => {
      if (!want.has(e.id) || e.type !== "text" || e.locked || e.templateLocked) return e;
      const next = fn(e);
      if (next !== e) pageChanged = true;
      return next;
    });
    if (!pageChanged) return p;
    changed = true;
    return { ...p, elements };
  });
  return changed ? { ...doc, pages } : doc;
}

/** Sets (or, with undefined, removes) the effects of text boxes. Locked boxes are left alone. */
export function setTextEffects(doc: ReportDoc, pageId: string, ids: string[], effects: TextEffects | undefined): ReportDoc {
  return mapText(doc, pageId, ids, (e) => {
    if (JSON.stringify(e.props.effects) === JSON.stringify(effects)) return e;
    const props = { ...e.props, effects };
    if (!effects) delete props.effects;
    return { ...e, props };
  });
}

/** Sets (or, with undefined, removes) the per-box font of text boxes. */
export function setTextFont(doc: ReportDoc, pageId: string, ids: string[], font: FontRef | undefined): ReportDoc {
  return mapText(doc, pageId, ids, (e) => {
    if (e.props.font === font) return e;
    const props = { ...e.props, font };
    if (!font) delete props.font;
    return { ...e, props };
  });
}

export interface FontOption {
  value: string;
  label: string;
}

/**
 * The font picker's list: the style's own font, the bundled faces, then the
 * company's uploaded fonts ("Midal Sans (uploaded)"). A custom ref whose font
 * was deleted stays listed so the picker shows why it falls back.
 */
export function fontOptions(custom: BrandFont[], current: string | undefined): FontOption[] {
  const out: FontOption[] = [{ value: "", label: "Style font" }];
  for (const id of FONT_IDS) out.push({ value: id, label: FONT_NAMES[id] });
  for (const f of custom) out.push({ value: f.ref, label: `${f.family} (uploaded)` });
  if (current && isCustomFontRef(current) && !custom.some((f) => f.ref === current)) out.push({ value: current, label: "Removed font (uses the style font)" });
  return out;
}

/** A picker value as a FontRef (empty = the style's font). */
export function fontRefOf(value: string | null): FontRef | undefined {
  if (!value) return undefined;
  if ((FONT_IDS as readonly string[]).includes(value)) return value as FontId;
  return isCustomFontRef(value) ? value : undefined;
}

/** The brand fonts as the renderer's `customFonts` (file URLs are the API's; the editor loads them with the session's token). */
export const renderCustomFonts = (fonts: BrandFont[]): RenderCustomFont[] =>
  fonts.map((f) => ({ ref: f.ref, family: f.family, files: f.files.map((x) => ({ weight: x.weight, style: x.style, format: x.format, url: x.url })) }));
