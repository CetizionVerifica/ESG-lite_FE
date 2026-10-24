// DS-9 · the AI drawer (05-ux S4, mockup "AI"): "Ask AI" with the budget
// meter; "About: <selection>" and the brand voice note; the chat thread with
// suggestion cards inline; quick chips; the ask box. Every reply is text plus
// cards: the page changes only when a card is accepted (one undo step, the
// text marked as AI-written and not reviewed).
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Lightbulb, Sparkles } from "lucide-react";
import type { AiRequest, AiTarget, ChatTurn, DataToken, Suggestion } from "../../../lib/studio/contracts";
import { CHAT_ROUTER_TURNS } from "../../../lib/studio/contracts";
import { tokenKey } from "../../../lib/studio/render";
import { Button, cn, focusRing, inputBase } from "../../../ui";
import type { DrawerProps } from "../editor/registry";
import { useAiCalls, useAiUsage, errorCode } from "./api";
import { BriefDialog } from "./BriefDialog";
import { BudgetMeter } from "./BudgetMeter";
import { ACTION_TITLES, aboutLabel, aiErrorText, applySuggestion, quickChips, selectionKindOf, textOf } from "./logic";
import { addTurn, setGhost, takeQueue, uid, updateCard, updateTurn, useAiThread, type Card, type PendingRequest } from "./store";
import { SuggestionCard } from "./SuggestionCard";
import { LayoutIdeas } from "../swap/LayoutIdeas"; // AT-2
import { TemplateSwap } from "../swap/TemplateSwap"; // AT-2

const toCards = (suggestions: Suggestion[], target: AiTarget | null): Card[] => suggestions.map((s) => ({ id: uid("card"), suggestion: s, target, status: "open" }));

export function AiPanel({ docId, editor }: DrawerProps) {
  const thread = useAiThread(docId);
  const usage = useAiUsage(docId);
  const { action, chat } = useAiCalls(docId);
  const [text, setText] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = thread.turns.some((t) => t.pending);

  const selected = editor.selected[0] ?? null;
  const sel = selectionKindOf(selected);
  const chipText = (a: DataToken["attrs"]) => editor.render.data?.tokens[tokenKey(a as never)]?.display ?? "…";
  const about = aboutLabel(editor.doc, editor.page, selected, chipText);
  const pageNo = editor.page ? editor.doc.pages.findIndex((p) => p.id === editor.page!.id) + 1 : 0;
  const target: AiTarget | null = editor.page ? { pageId: editor.page.id, ...(selected ? { elementId: selected.id } : {}) } : null;
  const chips = useMemo(() => quickChips(editor.doc.kind, sel), [editor.doc.kind, sel]);

  useEffect(() => {
    const el = listRef.current;
    if (el && typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight });
  }, [thread.turns.length]);

  /** A free-text ask (or a quick chip): the chat endpoint routes it. */
  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    const history: ChatTurn[] = [...thread.turns.filter((t) => !t.pending && !t.error).map((t) => ({ role: t.role, text: t.text })), { role: "user" as const, text: q }].slice(-CHAT_ROUTER_TURNS);
    addTurn(docId, { id: uid("turn"), role: "user", text: q, cards: [] });
    const replyId = uid("turn");
    addTurn(docId, { id: replyId, role: "assistant", text: "", cards: [], pending: true });
    setText("");
    const t = target;
    chat.mutate(
      { messages: history, ...(t ? { selection: { pageId: t.pageId, elementIds: t.elementId ? [t.elementId] : [] } } : {}) },
      {
        onSuccess: (r) => updateTurn(docId, replyId, { pending: false, text: r.reply, cards: toCards(r.suggestions, t) }),
        onError: (err) => updateTurn(docId, replyId, { pending: false, error: aiErrorText(errorCode(err)) }),
      },
    );
  };

  /** A direct action (toolbar menus): no routing, one card. */
  const run = (req: PendingRequest) => {
    addTurn(docId, { id: uid("turn"), role: "user", text: req.prompt, cards: [] });
    const replyId = uid("turn");
    addTurn(docId, { id: replyId, role: "assistant", text: "", cards: [], pending: true });
    const t = req.request.target ?? null;
    action.mutate(req.request, {
      onSuccess: (s) => updateTurn(docId, replyId, { pending: false, text: `Here's a suggestion: ${ACTION_TITLES[s.action].toLowerCase()}.`, cards: toCards([s], t) }),
      onError: (err) => updateTurn(docId, replyId, { pending: false, error: aiErrorText(errorCode(err)) }),
    });
  };

  // Asks queued by the toolbar ("AI ▾", "Suggest a title") run when the panel is open.
  useEffect(() => {
    for (const r of takeQueue(docId)) run(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.queue.length, docId]);

  const accept = (card: Card) => {
    const applied = applySuggestion(editor.doc, card.suggestion, card.target, editor.page?.id ?? null);
    if (!applied) {
      updateCard(docId, card.id, { error: "This suggestion no longer fits the page. Try again." });
      return;
    }
    editor.preview(null);
    setGhost(null);
    editor.commit(applied.doc, `AI: ${ACTION_TITLES[card.suggestion.action]}`, { select: applied.ids, pageId: applied.pageId });
    updateCard(docId, card.id, { status: "accepted", error: undefined });
  };

  const discard = (card: Card) => updateCard(docId, card.id, { status: "discarded" });

  const tryAgain = (card: Card) => {
    const s = card.suggestion;
    const prior = s.kind === "text" ? textOf(s.payload.text, () => "") : JSON.stringify(s.payload.elements?.[0]?.props ?? s.payload.findings ?? "");
    const category = s.action === "scope3_category_text" && s.sources[0]?.source === "ghg" ? s.sources[0].scope3Category : undefined;
    const req: AiRequest = { action: s.action, ...(card.target ? { target: card.target } : {}), params: { differentFrom: prior.slice(0, 3000), ...(category ? { category } : {}) } };
    updateCard(docId, card.id, { retrying: true, error: undefined });
    action.mutate(req, {
      onSuccess: (next) => updateCard(docId, card.id, { suggestion: next, retrying: false, status: "open" }),
      onError: (err) => updateCard(docId, card.id, { retrying: false, error: aiErrorText(errorCode(err)) }),
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(text);
  };

  return (
    <section aria-label="AI" className="flex h-full min-h-0 flex-col" data-testid="ai-panel">
      <header className="space-y-1.5 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-4 text-brand-text" />
          <h2 className="flex-1 text-base font-semibold text-ink">Ask AI</h2>
          <BudgetMeter usage={usage.data} />
        </div>
        <p className="text-xs text-muted" data-testid="ai-about">
          About: <b className="font-medium text-ink">{about ?? (pageNo ? `the whole report (page ${pageNo} in view)` : "the whole report")}</b> · Writing in your brand voice ·{" "}
          <Link to="/studio/brand-kit" className={cn("text-brand-text underline", focusRing)}>
            Edit
          </Link>
        </p>
      </header>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-3" aria-live="polite" data-testid="ai-thread">
        {/* AT-2 · Layouts for the page in view and Try another template */}
        <LayoutIdeas editor={editor} />
        <TemplateSwap editor={editor} />
        {thread.turns.length === 0 && <p className="text-sm text-muted">Ask about this report or describe a change. Suggestions never change the page until you accept them.</p>}
        {thread.turns.map((t) =>
          t.role === "user" ? (
            <p key={t.id} className="max-w-[85%] self-end rounded-card rounded-br-sm bg-tint px-3 py-2 text-[13px] text-ink">
              {t.text}
            </p>
          ) : (
            <div key={t.id} className="space-y-2">
              {t.pending ? (
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <Sparkles aria-hidden className="size-3.5 animate-pulse text-brand-text" /> Thinking…
                </p>
              ) : t.error ? (
                <p role="alert" className="text-[13px] text-bad">
                  {t.error}
                </p>
              ) : (
                t.text && <p className="text-[13px] text-ink">{t.text}</p>
              )}
              {t.cards.map((c) => (
                <SuggestionCard key={c.id} card={c} editor={editor} onAccept={accept} onDiscard={discard} onTryAgain={tryAgain} />
              ))}
            </div>
          ),
        )}
        <div className="space-y-2">
          <p className="text-xs text-muted">Try asking</p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c} type="button" disabled={busy} onClick={() => ask(c)} className={cn("inline-flex h-7 items-center rounded-chip border border-line bg-tint px-2.5 text-xs font-medium text-brand-text hover:border-brand disabled:opacity-50", focusRing)}>
                {c}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" icon={<Lightbulb aria-hidden className="size-4" />} onClick={() => setBriefOpen(true)}>
            Design ideas from a brief
          </Button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line pt-3">
        <label htmlFor="ai-ask" className="sr-only">
          Ask about this report
        </label>
        <input
          id="ai-ask"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about this report or describe a change"
          maxLength={2000}
          className={cn(inputBase, "h-9 flex-1")}
          autoComplete="off"
        />
        <Button type="submit" variant="primary" aria-label="Send" disabled={!text.trim() || busy} icon={<ArrowUp aria-hidden className="size-4" />} />
      </form>
      <BriefDialog open={briefOpen} onClose={() => setBriefOpen(false)} defaultKind={editor.doc.kind} />
    </section>
  );
}
