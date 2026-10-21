// PE-1 · photo edits as pure doc ops on image and frame elements. Edits are
// non-destructive props (adjust, filter, duotone) the renderer draws
// (render/imageFx.ts); a background removal swaps `assetId` for a derived
// asset and keeps the source in `originalAssetId` so "Restore original"
// moves it back. Every op returns the doc unchanged (same object) when there
// is nothing to change, so history doesn't record empty steps.
import { IMAGE_ADJUST_KEYS, IMAGE_ADJUST_RANGE, type Duotone, type Element, type ImageAdjust, type ImageAdjustKey, type ImageEditProps, type ImageFilter, type ReportDoc } from "./contracts";
import { updateProps } from "./docOps";

export type PhotoElement = Extract<Element, { type: "image" | "frame" }>;

export const isPhotoElement = (el: Element | undefined | null): el is PhotoElement => !!el && (el.type === "image" || el.type === "frame");

/** A slider value clamped to its range and rounded (contracts IMAGE_ADJUST_RANGE). */
export function clampAdjust(key: ImageAdjustKey, v: number): number {
  const [lo, hi] = IMAGE_ADJUST_RANGE[key];
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0;
}

/** The sliders with absent values as 0. */
export const adjustOf = (p: ImageEditProps): Record<ImageAdjustKey, number> => Object.fromEntries(IMAGE_ADJUST_KEYS.map((k) => [k, clampAdjust(k, p.adjust?.[k] ?? 0)])) as Record<ImageAdjustKey, number>;

/** True when the element shows any photo edit (sliders, preset or duotone). */
export function hasPhotoEdits(p: ImageEditProps): boolean {
  const a = adjustOf(p);
  return IMAGE_ADJUST_KEYS.some((k) => a[k] !== 0) || (!!p.filter && p.filter !== "none") || !!p.duotone;
}

function patchPhoto(doc: ReportDoc, pageId: string, el: PhotoElement, patch: Partial<ImageEditProps> & { assetId?: string }): ReportDoc {
  return el.type === "image" ? updateProps(doc, pageId, [el.id], "image", patch as never) : updateProps(doc, pageId, [el.id], "frame", patch as never);
}

/** Sets one slider; 0 removes the key, an all-zero adjust is removed. */
export function setImageAdjust(doc: ReportDoc, pageId: string, el: PhotoElement, key: ImageAdjustKey, value: number): ReportDoc {
  const v = clampAdjust(key, value);
  const cur = el.props.adjust ?? {};
  if ((cur[key] ?? 0) === v) return doc;
  const next: ImageAdjust = { ...cur };
  if (v) next[key] = v;
  else delete next[key];
  return patchPhoto(doc, pageId, el, { adjust: Object.keys(next).length ? next : undefined });
}

/** Sets the filter preset ("none" removes it). */
export function setImageFilter(doc: ReportDoc, pageId: string, el: PhotoElement, filter: ImageFilter): ReportDoc {
  if ((el.props.filter ?? "none") === filter) return doc;
  return patchPhoto(doc, pageId, el, { filter: filter === "none" ? undefined : filter });
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Sets the duotone (null turns it off); colours must be #rrggbb. */
export function setDuotone(doc: ReportDoc, pageId: string, el: PhotoElement, duotone: Duotone | null): ReportDoc {
  if (duotone && (!HEX.test(duotone.dark) || !HEX.test(duotone.light))) return doc;
  const next = duotone ? { dark: duotone.dark.toLowerCase(), light: duotone.light.toLowerCase() } : null;
  const cur = el.props.duotone ?? null;
  if ((!cur && !next) || (cur && next && cur.dark.toLowerCase() === next.dark && cur.light.toLowerCase() === next.light)) return doc;
  return patchPhoto(doc, pageId, el, { duotone: next ?? undefined });
}

/** "Reset all": sliders, preset and duotone off. The picture (and a removed background) stays. */
export function resetPhotoEdits(doc: ReportDoc, pageId: string, el: PhotoElement): ReportDoc {
  if (!hasPhotoEdits(el.props) && el.props.adjust === undefined && el.props.filter === undefined && el.props.duotone === undefined) return doc;
  return patchPhoto(doc, pageId, el, { adjust: undefined, filter: undefined, duotone: undefined });
}

/** After a background removal: show the derived asset, remember the first source. */
export function applyBackgroundRemoved(doc: ReportDoc, pageId: string, el: PhotoElement, resultAssetId: string): ReportDoc {
  if (el.props.assetId === resultAssetId) return doc;
  return patchPhoto(doc, pageId, el, { assetId: resultAssetId, originalAssetId: el.props.originalAssetId ?? el.props.assetId });
}

/** "Restore original": the source asset back, the derived one forgotten (it stays in Uploads). */
export function restoreOriginal(doc: ReportDoc, pageId: string, el: PhotoElement): ReportDoc {
  if (!el.props.originalAssetId) return doc;
  return patchPhoto(doc, pageId, el, { assetId: el.props.originalAssetId, originalAssetId: undefined });
}

/** The element as it was before any photo edit (for the before/after view). */
export function beforeElement<T extends PhotoElement>(el: T): T {
  const props = { ...el.props } as ImageEditProps & { assetId?: string };
  delete props.adjust;
  delete props.filter;
  delete props.duotone;
  if (props.originalAssetId) props.assetId = props.originalAssetId;
  delete props.originalAssetId;
  return { ...el, props } as T;
}

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** Mixes a report colour towards white (t 0..1). Report data, not an app colour. */
export function tint(hex: string, t: number): string {
  return toHex(channels(hex).map((v) => v + (255 - v) * t));
}
/** Mixes a report colour towards black (t 0..1). */
export function shade(hex: string, t: number): string {
  return toHex(channels(hex).map((v) => v * (1 - t)));
}

export interface DuotonePreset {
  name: string;
  dark: string;
  light: string;
}

/**
 * Duotone pairs in the brand's colours: each brand colour as the dark tone
 * with a light tint of itself, then the cover gradient pair. Duplicates and
 * invalid colours are dropped; at most six.
 */
export function brandDuotones(colors: { primary?: string; accent?: string; coverFrom?: string; coverTo?: string } | null | undefined, extra: string[] = []): DuotonePreset[] {
  const out: DuotonePreset[] = [];
  const seen = new Set<string>();
  const add = (name: string, dark: string | undefined, light: string | undefined) => {
    if (!dark || !light || !HEX.test(dark) || !HEX.test(light)) return;
    const p = { name, dark: dark.toLowerCase(), light: light.toLowerCase() };
    const key = `${p.dark}/${p.light}`;
    if (seen.has(key) || p.dark === p.light) return;
    seen.add(key);
    out.push(p);
  };
  const c = colors ?? {};
  if (c.primary) add("Primary", shade(c.primary, 0.35), tint(c.primary, 0.85));
  if (c.accent) add("Accent", shade(c.accent, 0.35), tint(c.accent, 0.85));
  if (c.coverFrom && c.coverTo) add("Cover", c.coverFrom, tint(c.coverTo, 0.6));
  if (c.primary && c.accent) add("Primary and accent", shade(c.primary, 0.2), tint(c.accent, 0.7));
  for (const x of extra) if (HEX.test(x)) add("Report colour", shade(x, 0.35), tint(x, 0.85));
  return out.slice(0, 6);
}

export const FILTER_LABELS: Record<ImageFilter, string> = { none: "None", vivid: "Vivid", mono: "Mono", warm: "Warm", cool: "Cool", fade: "Fade" };
export const ADJUST_LABELS: Record<ImageAdjustKey, string> = { brightness: "Brightness", contrast: "Contrast", saturation: "Saturation", warmth: "Warmth", blur: "Blur" };

/** "+12", "−5", "0" as the mockup shows slider values. */
export const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");
