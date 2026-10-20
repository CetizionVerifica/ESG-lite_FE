// DS-6 · drag-and-drop payloads onto a page. Drawers set one of these on
// `dataTransfer` when an item is dragged; the page overlay reads it on drop:
//   DND_ELEMENT  an Element template (JSON): added at the drop point;
//   DND_ASSET    an asset {id, w, h, alt} (JSON): fills the frame, image or
//                grid cell under the pointer, else becomes an image there.
import type { Element } from "../../../lib/studio/contracts";

export const DND_ELEMENT = "application/x-studio-element";
export const DND_ASSET = "application/x-studio-asset";

export interface DroppedAsset {
  id: string;
  w?: number;
  h?: number;
  alt?: string;
}

const parse = <T,>(raw: string | undefined | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const readElement = (dt: Pick<DataTransfer, "getData">): Element | null => {
  const el = parse<Element>(dt.getData(DND_ELEMENT));
  return el && typeof el === "object" && el.type && el.frame ? el : null;
};

export const readAsset = (dt: Pick<DataTransfer, "getData">): DroppedAsset | null => {
  const a = parse<DroppedAsset>(dt.getData(DND_ASSET));
  return a && typeof a.id === "string" ? a : null;
};

export const hasStudioPayload = (dt: Pick<DataTransfer, "types">): boolean => Array.from(dt.types ?? []).some((t) => t === DND_ELEMENT || t === DND_ASSET);

/** The image element an asset becomes when dropped on empty page: 60 mm wide at its ratio. */
export function imageFromAsset(a: DroppedAsset): Element {
  const w = 60;
  const h = a.w && a.h ? Math.round((w * a.h) / a.w * 10) / 10 : 40;
  return { id: "drop", type: "image", frame: { x: 0, y: 0, w, h, rotation: 0 }, z: 0, source: "user", props: { assetId: a.id, fit: "cover", alt: a.alt ?? "" } };
}
