// AT-1 · "Preview with my data": the suggested template's pages in the flow's
// period and sites, drawn by the shared renderer (layer rule 2) with values
// from POST /studio/resolve (rule 5) and the client's brand. Nothing is saved;
// "Use this" picks the template and continues the new-design flow.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FreeformPage, PageFormat, ReportDoc, TemplateSuggestion } from "../../../lib/studio/contracts";
import { docRenderData, resolveRequestFor } from "../../../lib/studio/docData";
import { formatPx, type RenderBrand, type RenderData } from "../../../lib/studio/render";
import { mountSheet } from "../../../lib/studio/renderHost";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { resolveStudioData } from "../../../services/studioService";
import { Button, Drawer, Skeleton, cn } from "../../../ui";
import { useBrandKit } from "../brand-kit/api";
import { docErrorMessage } from "../docs/api";
import { formatLine } from "../home/logic";
import { useTemplate } from "../panels/library/api";
import { useRenderBrand } from "../panels/library/preview";
import type { NewDesignState } from "./logic";
import { previewPages, previewTemplateDoc } from "./suggestLogic";

const SHEET_W = 640;

/** One page drawn at a fixed width with its resolved values. */
function DataSheet({ doc, page, data, brand }: { doc: ReportDoc; page: FreeformPage; data: RenderData | null; brand: RenderBrand | null }) {
  const host = useRef<HTMLDivElement>(null);
  const size = formatPx(doc.format as PageFormat);
  const scale = SHEET_W / size.w;
  useEffect(() => {
    if (!host.current) return;
    try {
      mountSheet(host.current, page, doc, data, { brand });
    } catch {
      // A page the renderer can't draw shows the empty frame.
    }
  }, [doc, page, data, brand]);
  return (
    <div role="img" aria-label={page.name} className="relative overflow-hidden rounded-chip border border-line bg-panel shadow-sm" style={{ width: Math.round(size.w * scale), height: Math.round(size.h * scale) }}>
      <div ref={host} aria-hidden style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />
    </div>
  );
}

export function SuggestPreview({ suggestion, state, onClose, onUse }: { suggestion: TemplateSuggestion | null; state: NewDesignState; onClose: () => void; onUse: (s: TemplateSuggestion) => void }) {
  const companyId = useStudioCompanyId();
  const detail = useTemplate(suggestion?.templateId ?? null);
  const kit = useBrandKit();
  const brand = useRenderBrand();
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [suggestion?.templateId]);

  const doc = useMemo(() => (detail.data ? previewTemplateDoc(detail.data.doc, state, kit.data?.name) : null), [detail.data, state, kit.data?.name]);
  const pages = useMemo(() => previewPages(doc), [doc]);
  const values = useQuery({
    queryKey: ["studio", "suggest", "preview", companyId, suggestion?.templateId, state.year, state.yearType, state.sites],
    queryFn: () => resolveStudioData(resolveRequestFor(doc as ReportDoc), companyId),
    enabled: !!doc,
    staleTime: 60_000,
  });
  const data = useMemo(() => (doc ? docRenderData(doc, values.data) : null), [doc, values.data]);
  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const error = detail.isError ? docErrorMessage(detail.error, "The template couldn't be loaded.") : values.isError ? docErrorMessage(values.error, "Your data couldn't be read for the preview.") : null;

  return (
    <Drawer
      open={!!suggestion}
      onClose={onClose}
      size="lg"
      title={suggestion ? `Preview: ${suggestion.template.name}` : "Preview"}
      subtitle={suggestion ? `${formatLine(suggestion.template.format, suggestion.template.pageCount)} · with your approved data` : undefined}
      error={error}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button aria-label="Previous page" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <span className="text-sm text-muted" aria-live="polite" data-testid="suggest-preview-page">
              {pages.length ? `Page ${Math.min(index, pages.length - 1) + 1} of ${pages.length}` : "No pages"}
            </span>
            <Button aria-label="Next page" disabled={index >= pages.length - 1} onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}>
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" disabled={!suggestion} onClick={() => suggestion && onUse(suggestion)} data-testid="suggest-preview-use">
              Use this
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3" data-testid="suggest-preview">
        <p className="text-sm text-muted">Figures come from your approved data. Contents and index pages are laid out when the design is built.</p>
        {!doc || !page || values.isPending ? (
          <Skeleton className="h-[480px] w-full" />
        ) : (
          <div className={cn("flex justify-center")}>
            <DataSheet doc={doc} page={page} data={data} brand={brand} />
          </div>
        )}
        {page && <p className="text-center text-sm font-medium text-ink">{page.name}</p>}
      </div>
    </Drawer>
  );
}
