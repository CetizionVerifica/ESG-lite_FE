// DS-6 · what the sheets need besides the doc: resolved numbers (one
// POST /studio/resolve for every binding and data chip in the doc, layer
// rule 5), asset URLs (company assets and the brand logos) and the brand side
// of the theme. The FE formats nothing: the renderer prints `display`.
import { useMemo, useRef } from "react";
import type { Binding, DataToken, ReportDoc, TextDoc, TextNode } from "../../../lib/studio/contracts";
import { renderData, type RenderAssets, type RenderBinding, type RenderBrand, type RenderData, type RenderValue } from "../../../lib/studio/render";
import { BRAND_LOGO_ASSETS } from "../../../lib/studio/brandOps";
import { useResolve } from "../panels/data/api";
import { docFlows, flowExtras } from "../../../lib/studio/docData";
import { useBrandKit } from "../brand-kit/api";
import { useStudioAssets } from "./api";

const BOUND_TYPES = new Set(["kpi_tile", "chart", "big_number", "progress", "table"]);

function walkTokens(node: TextDoc | TextNode | DataToken, out: DataToken[]): void {
  if ((node as DataToken).type === "data") {
    out.push(node as DataToken);
    return;
  }
  for (const c of (node as TextNode).content ?? []) walkTokens(c, out);
}

/** Every binding and data chip on the doc's free-form pages and flow text, deduplicated, in page order. */
export function collectBindings(doc: ReportDoc): { bindings: Binding[]; tokens: DataToken[] } {
  const bindings: Binding[] = [];
  const tokens: DataToken[] = [];
  const seenB = new Set<string>();
  const seenT = new Set<string>();
  const addB = (b: Binding | undefined) => {
    if (!b) return;
    const k = JSON.stringify(b);
    if (!seenB.has(k)) {
      seenB.add(k);
      bindings.push(b);
    }
  };
  const addDoc = (d: TextDoc | undefined) => {
    if (!d) return;
    const found: DataToken[] = [];
    walkTokens(d, found);
    for (const t of found) {
      const k = JSON.stringify(t.attrs);
      if (!seenT.has(k)) {
        seenT.add(k);
        tokens.push(t);
      }
    }
  };
  for (const p of doc.pages) {
    if (p.kind === "flow") {
      addDoc(p.content);
      continue;
    }
    for (const e of p.elements) {
      if (BOUND_TYPES.has(e.type)) addB((e.props as { binding?: Binding }).binding);
      if (e.type === "text" || e.type === "callout") addDoc(e.props.doc);
    }
  }
  return { bindings, tokens };
}

/** The doc's scope for data calls. */
export const scopeOf = (doc: ReportDoc) => ({ kind: doc.kind, year: doc.meta.year, yearType: doc.meta.yearType, sites: doc.meta.sites });

/**
 * Where the figures are: "loading" until the first /resolve answer for the
 * doc's bindings (and while new bindings resolve), "error" when /resolve
 * failed, "ready" otherwise. While loading, bound values the sheet has no
 * figure for read "Loading…", never "Not reported" (Sheet.tsx).
 */
export type FiguresStatus = "loading" | "error" | "ready";

export interface RenderInputs {
  /** The figures: the latest /resolve answer, or the previous one while the doc re-resolves. */
  data: RenderData | null;
  assets: RenderAssets;
  brand: RenderBrand | null;
  /** The values in request order (link marks: approval dates). */
  resolved: { binding: Binding; value: RenderValue }[];
  /** /resolve has not answered for the current bindings yet. */
  loading: boolean;
  status: FiguresStatus;
  /** The doc has at least one binding or data chip. */
  hasFigures: boolean;
  /** Asks /resolve again (the error state's Try again). */
  retry: () => void;
}

const NO_RESOLVED: { binding: Binding; value: RenderValue }[] = [];

export function useRenderInputs(doc: ReportDoc, docId: number): RenderInputs {
  const { bindings, tokens } = useMemo(() => collectBindings(doc), [doc]);
  const flows = useMemo(() => docFlows(doc), [doc]);
  // Flow sections the server fills (factor table, Scope 3 categories) come back as `flow` / `scope3`.
  const body = useMemo(() => ({ ...scopeOf(doc), bindings, tokens, docId, ...(flows.length ? { flows } : {}) }), [doc, bindings, tokens, docId, flows]);
  const resolve = useResolve(body);
  const assets = useStudioAssets();
  const kit = useBrandKit();

  const fresh = useMemo(() => (resolve.data ? renderData(bindings as RenderBinding[], tokens as unknown as Parameters<typeof renderData>[1], resolve.data as unknown as Parameters<typeof renderData>[2], flowExtras(resolve.data)) : null), [resolve.data, bindings, tokens]);
  const freshResolved = useMemo(() => (resolve.data ? bindings.map((binding, i) => ({ binding, value: resolve.data.values[i] as unknown as RenderValue })).filter((r) => !!r.value) : null), [resolve.data, bindings]);
  // While the doc re-resolves (a binding added or changed), the sheets keep the
  // last answer: it is keyed by binding, so figures that didn't change stay put.
  const last = useRef<{ data: RenderData; resolved: { binding: Binding; value: RenderValue }[] } | null>(null);
  if (fresh && freshResolved && last.current?.data !== fresh) last.current = { data: fresh, resolved: freshResolved };
  const data = fresh ?? last.current?.data ?? null;
  const status: FiguresStatus = fresh ? "ready" : resolve.isError ? "error" : "loading";
  const urls = useMemo(() => {
    const u: Record<string, string> = {};
    for (const a of assets.data ?? []) u[a.id] = a.url;
    if (kit.data?.logos.primary) u[BRAND_LOGO_ASSETS.primary] = kit.data.logos.primary;
    if (kit.data?.logos.onDark) u[BRAND_LOGO_ASSETS.onDark] = kit.data.logos.onDark;
    return u;
  }, [assets.data, kit.data]);
  const brand = useMemo<RenderBrand | null>(
    () =>
      kit.data
        ? { primary: kit.data.colors.primary, accent: kit.data.colors.accent, look: kit.data.defaultLook, fontHeading: kit.data.fonts.heading, fontBody: kit.data.fonts.body, logoUrl: kit.data.logos.primary }
        : null,
    [kit.data],
  );
  const resolved = freshResolved ?? last.current?.resolved ?? NO_RESOLVED;
  const assetsOut = useMemo(() => ({ urls }), [urls]);
  const { refetch } = resolve;
  const retry = useMemo(() => () => void refetch(), [refetch]);
  const hasFigures = bindings.length + tokens.length > 0;
  return useMemo(() => ({ data, assets: assetsOut, brand, resolved, loading: status === "loading", status, hasFigures, retry }), [data, assetsOut, brand, resolved, status, hasFigures, retry]);
}

/** The binding of an element, if it has one. */
export const bindingOf = (el: { type: string; props: unknown }): Binding | undefined => (BOUND_TYPES.has(el.type) ? (el.props as { binding?: Binding }).binding : undefined);

/** "Linked to approved data · 12 Apr 2026" / "Typed data, not linked" (05-ux copy). */
export function linkMarkText(binding: Binding | undefined, value: RenderValue | undefined, status: FiguresStatus = "ready"): { linked: boolean; text: string } | null {
  if (!binding) return null;
  if (binding.source === "custom") return { linked: false, text: "Typed data, not linked" };
  if (binding.source === "input") return { linked: true, text: "Linked to report details" };
  if (!value && status === "loading") return { linked: true, text: "Linked · loading the figure…" };
  if (!value && status === "error") return { linked: true, text: "Linked · the figure couldn't load" };
  if (value?.unavailable) return { linked: true, text: `Linked · not reported (${value.unavailable.reason.replace(/_/g, " ").toLowerCase()})` };
  const at = value?.approvedAt ? new Date(value.approvedAt) : null;
  const day = at && !Number.isNaN(at.getTime()) ? at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
  return { linked: true, text: day ? `Linked to approved data · ${day}` : "Linked to approved data" };
}
