// AT-2 · a page drawn by the shared renderer at thumbnail size, with the editor's figures
// (layouts and template swaps keep every binding, so the resolved values still apply).
import type { FreeformPage, ReportDoc } from "../../../lib/studio/contracts";
import { PAGE_FORMAT_SIZES } from "../../../lib/studio/contracts";
import { PX_PER_MM } from "../../../lib/studio/geometry";
import { cn } from "../../../ui";
import type { EditorApi } from "../editor/EditorContext";
import { Sheet } from "../editor/Sheet";

export function PagePreview({ doc, page, width, editor, className, label }: { doc: ReportDoc; page: FreeformPage; width: number; editor: EditorApi; className?: string; label: string }) {
  const { wMm, hMm } = PAGE_FORMAT_SIZES[doc.format];
  const zoom = width / (wMm * PX_PER_MM);
  return (
    <div role="img" aria-label={label} className={cn("overflow-hidden rounded-chip border border-line bg-panel", className)}>
      <Sheet page={page} doc={doc} wMm={wMm} hMm={hMm} zoom={zoom} data={editor.render.data} assets={editor.render.assets} brand={editor.render.brand} thumbnail />
    </div>
  );
}
