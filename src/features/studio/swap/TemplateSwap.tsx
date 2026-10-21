// AT-2 · "Try another template" in the AI drawer (mockup AiLayouts): restyles the whole
// design with another template of the same kind and format, keeping every text, chart
// and data chip. The server builds the proposal (POST /template-swap/preview, nothing
// saved); the compare dialog shows each page now and with the new template side by side;
// Apply saves it on the server (POST /template-swap/apply) and the editor takes the saved
// doc as one undo step. Changes not yet autosaved are saved first (the preview needs the
// server's rev); a final can't be changed.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Palette } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { FreeformPage, ReportTemplate, TemplateSwapPreview } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { Button, Modal, cn, focusRing } from "../../../ui";
import type { EditorApi } from "../editor/EditorContext";
import { getStudioDoc } from "../editor/api";
import { useTemplates } from "../panels/library/api";
import { STUDIO_REV_EVENT } from "../panels/data/api";
import { PagePreview } from "./PagePreview";
import { canon, swapKeepsContent, swapSummary, swapSummaryText } from "./logic";
import { templateSwapErrorMessage, useTemplateSwap } from "./api";

const MAX_CHOICES = 4;
const COMPARE_W = 236;

export function TemplateSwap({ editor }: { editor: EditorApi }) {
  const doc = editor.doc;
  const templates = useTemplates({ kind: doc.kind, format: doc.format });
  const { preview, apply } = useTemplateSwap(editor.docId);
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  const [chosen, setChosen] = useState<ReportTemplate | null>(null);
  const [result, setResult] = useState<TemplateSwapPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => (templates.data ?? []).filter((t) => ![t.slug, String(t.id)].includes(doc.design.templateId)).slice(0, MAX_CHOICES), [templates.data, doc.design.templateId]);

  const open = async (t: ReportTemplate) => {
    setError(null);
    setChosen(t);
    setResult(null);
    setBusy(true);
    try {
      // The preview is made from the saved design: wait for the autosave to catch up.
      let saved = await qc.fetchQuery({ queryKey: ["studio", "docs", editor.docId, "swap-base", companyId], queryFn: () => getStudioDoc(editor.docId, companyId), staleTime: 0 });
      if (canon(saved.doc) !== canon(editor.doc)) {
        await new Promise((r) => setTimeout(r, 1600));
        saved = await qc.fetchQuery({ queryKey: ["studio", "docs", editor.docId, "swap-base", companyId], queryFn: () => getStudioDoc(editor.docId, companyId), staleTime: 0 });
        if (canon(saved.doc) !== canon(editor.doc)) throw new Error("unsaved");
      }
      setResult(await preview.mutateAsync({ templateId: t.id, rev: saved.rev }));
    } catch (e) {
      setError((e as Error)?.message === "unsaved" ? "Your latest changes are still saving. Try again in a moment." : templateSwapErrorMessage(e, "The preview couldn't be made. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (apply.isPending) return;
    setChosen(null);
    setResult(null);
    setError(null);
  };

  const confirm = () => {
    if (!result || !chosen) return;
    if (!swapKeepsContent(editor.doc, result.doc)) {
      setError("The design changed since the preview. Preview again.");
      return;
    }
    apply.mutate(
      { templateId: result.templateId, rev: result.rev, previewHash: result.previewHash },
      {
        onSuccess: (saved) => {
          // The server saved the new rev: the editor's autosave follows it, then takes the doc as one step.
          window.dispatchEvent(new CustomEvent(STUDIO_REV_EVENT, { detail: { docId: editor.docId, from: result.rev, rev: saved.rev } }));
          editor.commit(saved.doc, `Template: ${chosen.name}`);
          close();
        },
        onError: (e) => setError(templateSwapErrorMessage(e)),
      },
    );
  };

  return (
    <section aria-label="Try another template" className="space-y-2 rounded-card border border-line p-3" data-testid="ai-template-swap">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Palette aria-hidden className="size-4 text-brand-text" /> Try another template
        </h3>
        <p className="text-xs text-muted">Keeps every text, chart and data chip. Shown side by side before anything changes.</p>
      </div>
      {templates.isLoading ? (
        <p className="text-xs text-muted">Loading templates…</p>
      ) : choices.length === 0 ? (
        <p className="text-xs text-muted">No other template fits this design's format.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={editor.readOnly || busy}
              onClick={() => void open(t)}
              className={cn("inline-flex h-7 items-center rounded-chip border border-line bg-tint px-2.5 text-xs font-medium text-brand-text hover:border-brand disabled:opacity-50", focusRing)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {!chosen && error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
      <SwapCompare editor={editor} template={chosen} result={result} loading={busy} error={error} applying={apply.isPending} onClose={close} onApply={confirm} />
    </section>
  );
}

function SwapCompare({ editor, template, result, loading, error, applying, onClose, onApply }: { editor: EditorApi; template: ReportTemplate | null; result: TemplateSwapPreview | null; loading: boolean; error: string | null; applying: boolean; onClose: () => void; onApply: () => void }) {
  const pages = useMemo(() => {
    if (!result) return [];
    const after = new Map(result.doc.pages.map((p) => [p.id, p]));
    return editor.doc.pages.filter((p): p is FreeformPage => p.kind === "freeform" && !p.hidden && after.get(p.id)?.kind === "freeform").map((p) => ({ before: p, after: after.get(p.id) as FreeformPage }));
  }, [result, editor.doc]);
  const start = Math.max(0, pages.findIndex((p) => p.before.id === editor.page?.id));
  const [i, setI] = useState<number | null>(null);
  const at = Math.min(i ?? start, Math.max(0, pages.length - 1));
  const pair = pages[at];
  const pageNo = pair ? editor.doc.pages.findIndex((p) => p.id === pair.before.id) + 1 : 0;
  return (
    <Modal
      open={!!template}
      onClose={onClose}
      size="md"
      title={template ? `Try ${template.name}` : "Try another template"}
      description="Nothing changes until you apply it. Every text, chart and data chip is kept."
      primaryAction={{ label: "Apply template", onClick: onApply, loading: applying, disabled: !result || loading }}
      error={template ? error : null}
    >
      {loading && !result ? (
        <p className="text-sm text-muted">Restyling your pages…</p>
      ) : result && pair ? (
        <div className="space-y-3" data-testid="swap-compare">
          <p className="text-xs text-muted">{swapSummaryText(swapSummary(result))}</p>
          <div className="grid grid-cols-2 gap-3">
            <figure className="space-y-1">
              <figcaption className="text-xs font-semibold text-muted">Now</figcaption>
              <PagePreview doc={editor.doc} page={pair.before} width={COMPARE_W} editor={editor} label={`Page ${pageNo} now`} />
            </figure>
            <figure className="space-y-1">
              <figcaption className="text-xs font-semibold text-brand-text">With {template?.name}</figcaption>
              <PagePreview doc={result.doc} page={pair.after} width={COMPARE_W} editor={editor} label={`Page ${pageNo} with ${template?.name}`} />
            </figure>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            <Button size="sm" variant="ghost" aria-label="Previous page" disabled={at === 0} onClick={() => setI(at - 1)} icon={<ChevronLeft aria-hidden className="size-4" />} />
            <span>
              Page {pageNo} · {at + 1} of {pages.length}
            </span>
            <Button size="sm" variant="ghost" aria-label="Next page" disabled={at >= pages.length - 1} onClick={() => setI(at + 1)} icon={<ChevronRight aria-hidden className="size-4" />} />
          </div>
        </div>
      ) : result ? (
        <p className="text-sm text-muted">{swapSummaryText(swapSummary(result))}</p>
      ) : null}
    </Modal>
  );
}
