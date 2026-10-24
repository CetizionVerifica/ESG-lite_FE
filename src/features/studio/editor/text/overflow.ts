// DS-7 · overflow measuring (render/measure.ts's TEXT_OVERFLOW rule) on a
// mounted sheet, and how many lines that is.
import type { PageFormat, TextStyleId } from "../../../../lib/studio/contracts";
import { FORMAT_TYPE_SCALE, TEXT_STYLES } from "../../../../lib/studio/render/textStyles";
import { mmToPx } from "../../../../lib/studio/geometry";
import { sheetRoot } from "../canvasUtil";

export interface Overflow {
  /** How much taller the text is than its frame (mm). */
  overflowMm: number;
  /** The first block that doesn't fit (Move rest), or null. */
  cutBlock: number | null;
}
type Measurer = (pageId: string) => Record<string, Overflow>;

const PT_MM = 25.4 / 72;

/** Text boxes on a mounted sheet that overflow their frame (render/measure.ts's rule, 0.3 mm slack). */
export function measureDom(pageId: string): Record<string, Overflow> {
  const root = sheetRoot(pageId);
  const out: Record<string, Overflow> = {};
  if (!root) return out;
  root.querySelectorAll<HTMLElement>('.ds-el[data-type="text"], .ds-el[data-type="callout"]').forEach((el) => {
    const inner = el.querySelector<HTMLElement>(".ds-text-in, .ds-callout-text");
    const box = inner?.closest<HTMLElement>(".ds-text, .ds-callout");
    if (!inner || !box) return;
    const over = (inner.scrollHeight - box.clientHeight) / mmToPx(1);
    if (!(over > 0.3)) return;
    const limit = box.offsetTop + box.clientHeight;
    const kids = Array.from(inner.children) as HTMLElement[];
    const cut = kids.findIndex((k) => k.offsetTop + k.offsetHeight > limit + 0.5);
    out[el.getAttribute("data-el-id") as string] = { overflowMm: Math.round(over * 10) / 10, cutBlock: cut > 0 ? cut : null };
  });
  return out;
}

let measurer: Measurer = measureDom;
/** The current measurer (the DOM one, or a test's). */
export const measureOverflow = (pageId: string): Record<string, Overflow> => measurer(pageId);
/** Test hook: jsdom has no layout, so component tests supply the measurements. */
export function setOverflowMeasurer(fn: Measurer | null): void {
  measurer = fn ?? measureDom;
}

/** Lines of the element's text style that don't fit (at least 1). */
export function linesOver(overflowMm: number, style: TextStyleId, format: PageFormat): number {
  const s = TEXT_STYLES[style] ?? TEXT_STYLES.body;
  const line = s.sizePt * (FORMAT_TYPE_SCALE[format] ?? 1) * s.leading * PT_MM;
  return Math.max(1, Math.ceil(overflowMm / line - 0.05));
}
