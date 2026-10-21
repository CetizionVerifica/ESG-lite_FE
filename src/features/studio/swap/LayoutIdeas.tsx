// AT-2 · "Layouts for page N" in the AI drawer (mockup AiLayouts): three options for the
// page in view, built by the server from library layouts and the page's own elements
// (DS-9 action `suggest_layouts`). Picking one previews it on the canvas (the editor's
// preview doc plus GhostPreview's dashed outlines); nothing changes until Apply, which
// replaces the page as one undo step. The card's actions are the AI card's: Accept, Try again
// (layouts not shown yet) and Discard (layer rule 6).
import { useEffect, useMemo, useState } from "react";
import { Check, LayoutTemplate, RefreshCw, Sparkles, X } from "lucide-react";
import type { FreeformPage, Suggestion } from "../../../lib/studio/contracts";
import { Badge, Button, cn, focusRing } from "../../../ui";
import type { EditorApi } from "../editor/EditorContext";
import { errorCode, useAiCalls } from "../ai/api";
import { aiErrorText } from "../ai/logic";
import { ghostNow, setGhost } from "../ai/store";
import { PagePreview } from "./PagePreview";
import { applyLayoutOption, changedIds, keptInPlace, pageSummary } from "./logic";

const GHOST = "at-2-layout";
const THUMB_W = 92;

interface Ideas {
  pageId: string;
  suggestion: Suggestion;
}

export function LayoutIdeas({ editor }: { editor: EditorApi }) {
  const { action } = useAiCalls(editor.docId);
  const page = editor.page;
  const pageNo = page ? editor.doc.pages.findIndex((p) => p.id === page.id) + 1 : 0;
  const [ideas, setIdeas] = useState<Ideas | null>(null);
  const [picked, setPicked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const current = ideas && page && ideas.pageId === page.id ? ideas : null;
  const options = useMemo(() => current?.suggestion.payload.pages ?? [], [current]);
  const metas = current?.suggestion.payload.layoutOptions ?? [];
  const option: FreeformPage | undefined = options[picked];
  const meta = metas[picked];

  const stopPreview = () => {
    if (ghostNow()?.cardId.startsWith(GHOST)) {
      editor.preview(null);
      setGhost(null);
    }
  };
  // The page in view changed, or the drawer closed: stop previewing.
  useEffect(() => stopPreview, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // An edit while previewing drops the preview (the edit clears it); picking an option again re-checks it.
  useEffect(() => {
    if (editor.shown === editor.doc) stopPreview();
  }, [editor.doc]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = (i: number, s: Suggestion | null = current?.suggestion ?? null) => {
    const opt = s?.payload.pages?.[i];
    if (!opt || !page) return;
    const next = applyLayoutOption(editor.doc, opt);
    if (!next) return;
    setPicked(i);
    editor.preview(next);
    setGhost({ docId: editor.docId, cardId: `${GHOST}-${i}`, pageId: page.id, ids: changedIds(page, opt) });
  };

  const ask = (more: boolean) => {
    if (!page) return;
    setError(null);
    const avoid = more ? [...new Set([...shown, ...metas.map((m) => m.layoutSlug)])] : [];
    action.mutate(
      { action: "suggest_layouts", target: { pageId: page.id }, ...(avoid.length ? { params: { differentFrom: avoid.join(",").slice(0, 8000) } } : {}) },
      {
        onSuccess: (s) => {
          setIdeas({ pageId: page.id, suggestion: s });
          setShown(avoid);
          preview(0, s);
        },
        onError: (err) => setError(aiErrorText(errorCode(err))),
      },
    );
  };

  const apply = () => {
    if (!option || !meta || !page) return;
    const next = applyLayoutOption(editor.doc, option);
    if (!next) {
      setError("The page changed since these ideas were made. Ask for new ones.");
      return;
    }
    stopPreview();
    editor.commit(next, `AI: layout ${meta.id} (${meta.name})`, { pageId: page.id });
    setIdeas(null);
  };

  const discard = () => {
    stopPreview();
    setIdeas(null);
    setError(null);
  };

  if (!page) {
    return (
      <section aria-label="Layouts" className="space-y-1 rounded-card border border-line p-3">
        <h3 className="text-sm font-semibold text-ink">Layouts</h3>
        <p className="text-xs text-muted">Go to a free-form page to see layout ideas for it.</p>
      </section>
    );
  }
  const kept = option ? keptInPlace(page, option) : 0;
  const busy = action.isPending;
  return (
    <section aria-label={`Layouts for page ${pageNo}`} className="space-y-2.5 rounded-card border border-line p-3" data-testid="ai-layouts">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <LayoutTemplate aria-hidden className="size-4 text-brand-text" /> Layouts for page {pageNo}
        </h3>
        <p className="text-xs text-muted">
          {page.name || `Page ${pageNo}`} · {pageSummary(page)}.
        </p>
      </div>
      {!current ? (
        <Button size="sm" variant="secondary" icon={<Sparkles aria-hidden className="size-4" />} loading={busy} disabled={editor.readOnly} onClick={() => ask(false)}>
          Suggest layouts
        </Button>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2" aria-label="Layout options">
            {options.map((p, i) => {
              const m = metas[i];
              const on = i === picked;
              return (
                <li key={m?.id ?? i}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => preview(i)}
                    className={cn("flex w-full flex-col gap-1 rounded-card border p-1 text-left", on ? "border-brand bg-tint" : "border-line hover:border-brand", focusRing)}
                    data-testid={`layout-option-${m?.id ?? i}`}
                  >
                    <PagePreview doc={editor.doc} page={p} width={THUMB_W} editor={editor} label={`Layout ${m?.id}: ${m?.name}`} />
                    <span className="text-[11px] font-medium leading-tight text-ink">
                      {m?.id} · {m?.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {meta?.reason && (
            <p className="text-xs text-ink" data-testid="layout-reason">
              <b className="font-semibold">Why {meta.id}:</b> {meta.reason}
            </p>
          )}
          {kept > 0 && (
            <p className="text-xs text-muted">
              <Badge tone="neutral">{kept}</Badge> {kept === 1 ? "item has no place in this layout and stays where it was." : "items have no place in this layout and stay where they were."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" icon={<X aria-hidden className="size-4" />} disabled={busy} onClick={discard}>
              Discard
            </Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw aria-hidden className="size-4" />} loading={busy} onClick={() => ask(true)}>
              Try again
            </Button>
            <span className="flex-1" />
            <Button size="sm" variant="primary" icon={<Check aria-hidden className="size-4" />} disabled={!option || editor.readOnly || busy} onClick={apply} data-testid="layout-accept">
              Accept {meta?.id ?? ""}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
