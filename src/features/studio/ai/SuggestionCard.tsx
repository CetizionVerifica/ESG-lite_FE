// DS-9 · one AI suggestion (RS-8 card, 05-ux S4): title, "Suggested by AI",
// the change (a word diff for text, old → new for a title or alt text, a list
// for findings), "Based on" sources, and Accept / Try again / Discard.
// "Preview on page" shows the change on the sheet without applying it (the
// editor's preview doc, plus a dashed outline from GhostPreview). Figures are
// the server's: chips in the new text are resolved by /studio/resolve.
import { useEffect, useMemo } from "react";
import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import type { DataToken, Element, Suggestion } from "../../../lib/studio/contracts";
import { tokenKey } from "../../../lib/studio/render";
import { Badge, Button, cn } from "../../../ui";
import type { EditorApi } from "../editor/EditorContext";
import { scopeOf } from "../editor/renderInputs";
import { useResolve } from "../panels/data/api";
import { DiffView } from "./DiffView";
import { ACTION_TITLES, applySuggestion, currentOf, sourcesLine, textOf, tokensOf } from "./logic";
import { ghostNow, setGhost, useGhost, type Card } from "./store";

export interface SuggestionCardProps {
  card: Card;
  editor: EditorApi;
  onAccept: (card: Card) => void;
  onTryAgain: (card: Card) => void;
  onDiscard: (card: Card) => void;
}

/** Chip text for the new suggestion: one resolve call for its chips. */
function useSuggestionChips(editor: EditorApi, s: Suggestion): (a: DataToken["attrs"]) => string {
  const tokens = useMemo(() => tokensOf(s.payload.text), [s.payload.text]);
  const body = useMemo(() => (tokens.length ? { ...scopeOf(editor.doc), bindings: [], tokens, docId: editor.docId } : null), [tokens, editor.doc, editor.docId]);
  const resolve = useResolve(body);
  return useMemo(() => {
    const map = new Map<string, string>();
    tokens.forEach((t, i) => {
      const v = resolve.data?.tokens[i];
      if (v) map.set(tokenKey(t.attrs as never), v.unavailable && v.unavailable.reason !== "EXCLUDED" ? "Not reported" : v.display);
    });
    return (a) => `⟦${map.get(tokenKey(a as never)) ?? "…"}⟧`;
  }, [tokens, resolve.data]);
}

const elementText = (el: Element | null): string => {
  if (!el) return "";
  if (el.type === "chart") return [el.props.title, el.props.subtitle].filter(Boolean).join(" · ");
  if (el.type === "image" || el.type === "frame") return el.props.alt ?? "";
  return "";
};

export function SuggestionCard({ card, editor, onAccept, onTryAgain, onDiscard }: SuggestionCardProps) {
  const s = card.suggestion;
  const ghost = useGhost();
  const previewing = ghost?.cardId === card.id;
  const open = card.status === "open";
  const current = useMemo(() => currentOf(editor.doc, s, card.target), [editor.doc, s, card.target]);
  const docChip = (a: DataToken["attrs"]) => `⟦${editor.render.data?.tokens[tokenKey(a as never)]?.display ?? "…"}⟧`;
  const newChip = useSuggestionChips(editor, s);
  const applied = useMemo(() => (open ? applySuggestion(editor.doc, s, card.target, editor.page?.id ?? null) : null), [open, editor.doc, s, card.target, editor.page?.id]);

  // Stop previewing when the card closes or goes away.
  useEffect(() => {
    if (!open && previewing) {
      editor.preview(null);
      setGhost(null);
    }
  }, [open, previewing, editor]);
  useEffect(
    () => () => {
      if (ghostNow()?.cardId === card.id) {
        editor.preview(null);
        setGhost(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.id],
  );

  const togglePreview = () => {
    if (previewing || !applied) {
      editor.preview(null);
      setGhost(null);
      return;
    }
    editor.preview(applied.doc);
    if (editor.page?.id !== applied.pageId) editor.setPage(applied.pageId);
    setGhost({ docId: editor.docId, cardId: card.id, pageId: applied.pageId, ids: applied.ids });
  };

  const before = s.kind === "text" ? textOf(current && (current.type === "text" || current.type === "callout") ? current.props.doc : undefined, docChip) : elementText(current);
  const after = s.kind === "text" ? textOf(s.payload.text, newChip) : elementText(s.payload.elements?.[0] ?? null);
  const based = sourcesLine(s.sources);
  const title = `${ACTION_TITLES[s.action]}${s.action === "scope3_category_text" && s.sources[0]?.source === "ghg" && s.sources[0].scope3Category ? ` ${s.sources[0].scope3Category}` : ""}`;

  return (
    <article
      className={cn("overflow-hidden rounded-card border border-brand/30 bg-panel", !open && "opacity-70")}
      aria-label={`Suggestion: ${title}`}
      data-testid="ai-suggestion"
      data-status={card.status}
      data-action={s.action}
    >
      <header className="flex items-center gap-2 bg-tint px-3 py-2 text-xs">
        <Sparkles aria-hidden className="size-3.5 text-brand-text" />
        <b className="flex-1 text-ink">{title}</b>
        <span className="text-muted">Suggested by AI</span>
      </header>
      <div className="space-y-2 px-3 py-2.5">
        {s.kind === "findings" ? (
          s.payload.findings?.length ? (
            <ul className="space-y-1.5" data-testid="ai-findings">
              {s.payload.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-ink">
                  <Badge tone={f.severity === "info" ? "info" : f.severity === "error" ? "bad" : "warn"}>{f.severity === "info" ? "Info" : "Review"}</Badge>
                  <span className="flex-1">{f.message}</span>
                  {f.pageId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        editor.setPage(f.pageId!);
                        if (f.elementId) editor.select([f.elementId], f.pageId);
                      }}
                    >
                      Go to page
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Nothing to fix here.</p>
          )
        ) : s.kind === "text" ? (
          <DiffView before={before} after={after} />
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink" data-testid="ai-element-change">
            {before && (
              <>
                <del className="rounded-sm bg-bad-soft text-bad">{before}</del>
                <ArrowRight aria-label="becomes" className="size-3.5 text-muted" />
              </>
            )}
            <ins className="rounded-sm bg-good-soft no-underline">{after}</ins>
          </p>
        )}
        {based && <p className="text-[11px] text-muted">{based}</p>}
        {card.error && (
          <p role="alert" className="text-xs text-bad">
            {card.error}
          </p>
        )}
      </div>
      {open ? (
        <footer className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
          {s.kind !== "findings" && (
            <Button size="sm" variant="primary" disabled={editor.readOnly || !applied} onClick={() => onAccept(card)} title={editor.readOnly ? "This design is view-only here" : undefined}>
              Accept
            </Button>
          )}
          <Button size="sm" loading={card.retrying} onClick={() => onTryAgain(card)}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDiscard(card)}>
            {s.kind === "findings" ? "Dismiss" : "Discard"}
          </Button>
          {s.kind !== "findings" && applied && (
            <Button size="sm" variant="ghost" className="ml-auto" aria-pressed={previewing} icon={previewing ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />} onClick={togglePreview}>
              {previewing ? "Hide preview" : "Preview on page"}
            </Button>
          )}
        </footer>
      ) : (
        <footer className="border-t border-line px-3 py-1.5 text-xs text-muted">{card.status === "accepted" ? "Accepted. Undo puts the old version back." : "Discarded. The page is unchanged."}</footer>
      )}
    </article>
  );
}
