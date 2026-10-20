// DS-5 · what a design needs to be drawn with its numbers: the bindings and
// data chips in the order POST /studio/resolve answers them (the same walk as
// ESG-lite src/studio/sources/doc.ts `docBindings` / `collectTokens`), the
// RenderData built from the answer, and the brand side of the theme from the
// brand kit. Pure; the editor shell and thumbnails call it.
import type { BrandKit, Binding, DataToken, ReportDoc, ResolveRequest, ResolveResponse } from "./contracts";
import { renderData, type RenderBinding, type RenderBrand, type RenderData } from "./render";
import type { DataTokenNode } from "./render/types";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** Element bindings (charts, tables, big numbers, tiles, progress), in page order; flow sections have none. */
export function docBindings(doc: ReportDoc): Binding[] {
  const out: Binding[] = [];
  for (const page of doc.pages) {
    if (page.kind === "flow") continue;
    for (const e of page.elements) {
      const props = e.props as unknown as Json;
      if (isObj(props.binding)) out.push(props.binding as unknown as Binding);
    }
  }
  return out;
}

/** Every `data` chip in text elements and flow sections, in page order. */
export function docTokens(doc: ReportDoc): DataToken[] {
  const out: DataToken[] = [];
  const walk = (n: unknown) => {
    if (!isObj(n)) return;
    if (n.type === "data" && isObj(n.attrs) && isObj(n.attrs.binding)) out.push({ type: "data", attrs: n.attrs } as unknown as DataToken);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  for (const page of doc.pages) {
    if (page.kind === "flow") {
      walk(page.content);
      continue;
    }
    for (const e of page.elements) {
      const props = e.props as unknown as Json;
      if (isObj(props.doc)) walk(props.doc);
    }
  }
  return out;
}

/** The /resolve request for a whole design in its own scope. */
export function resolveRequestFor(doc: ReportDoc): ResolveRequest & { docId?: number } {
  return { kind: doc.kind, year: doc.meta.year, yearType: doc.meta.yearType, sites: doc.meta.sites, bindings: docBindings(doc), tokens: docTokens(doc) };
}

/** RenderData for the renderer from the request's bindings and tokens and the /resolve answer (index-aligned). */
export function docRenderData(doc: ReportDoc, res: ResolveResponse | null | undefined): RenderData | null {
  if (!res) return null;
  return renderData(docBindings(doc) as unknown as RenderBinding[], docTokens(doc) as unknown as DataTokenNode[], res as never);
}

/** The brand side of a theme: brand colours and logo, the kit's fonts, the default look. */
export function brandFromKit(kit: BrandKit | null | undefined): RenderBrand | null {
  if (!kit) return null;
  return {
    primary: kit.colors.primary,
    accent: kit.colors.accent,
    look: kit.defaultLook,
    fontHeading: kit.fonts.heading,
    fontBody: kit.fonts.body,
    logoUrl: kit.logos.primary,
  };
}

/** "FY 2025–26" for FY 2026; "2025" for a calendar year (as the backend's periodLabel). */
export function periodLabel(yearType: "CY" | "FY", year: number): string {
  return yearType === "CY" ? String(year) : `FY ${year - 1}–${String(year).slice(-2)}`;
}
