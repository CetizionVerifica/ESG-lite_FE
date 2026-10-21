// PE-2 · find and replace across the report (⌘⇧F; mockup TextEffects). A
// floating panel over the canvas: Find, Replace with, Match case, Whole words,
// the whole report or this page, Previous / Next (selects the box and shows its
// page), Replace and Replace all (each one undo step). The doc op is
// lib/studio/findReplace.ts: data chips, locked and template-locked text and
// hidden pages are never changed, and no number can be typed or replaced.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { FindQuery } from "../../../lib/studio/contracts";
import { applyFindReplace, findInDoc, pagesWithMatches, replaceBlocked } from "../../../lib/studio/findReplace";
import { Button, Callout, SegmentedControl, TextField, cn, focusRing } from "../../../ui";
import { useEditor } from "../editor/EditorContext";
import { commandFor, isTypingTarget } from "../editor/shortcuts";
import { closeFindReplace, openFindReplace, useFindReplaceOpen } from "./store";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The panel while it's open (⌘⇧F, the toolbar's "Find and replace"). */
export function FindReplaceHost() {
  const open = useFindReplaceOpen();
  // The editor's shortcuts skip fields and text being edited; ⌘⇧F works there too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isTypingTarget(e.target)) return;
      if (commandFor(e)?.id !== "find") return;
      e.preventDefault();
      openFindReplace();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      closeFindReplace();
    };
  }, []);
  if (!open) return null;
  return <FindReplacePanel focusKey={open} />;
}

export function FindReplacePanel({ focusKey }: { focusKey: number }) {
  const ed = useEditor();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWords, setWholeWords] = useState(false);
  const [scope, setScope] = useState<FindQuery["scope"]>("doc");
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const findRef = useRef<HTMLDivElement>(null);
  const pageId = ed.ui.pageId ?? undefined;
  const query = useMemo<FindQuery>(() => ({ find, matchCase, wholeWords, scope, ...(scope === "page" && pageId ? { pageId } : {}) }), [find, matchCase, wholeWords, scope, pageId]);
  const result = useMemo(() => findInDoc(ed.doc, query), [ed.doc, query]);
  const count = result.matches.length;
  const at = count ? Math.min(index, count - 1) : 0;
  const current = count ? result.matches[at] : null;
  const blocked = find ? replaceBlocked(find, replace) : null;

  useEffect(() => {
    findRef.current?.querySelector("input")?.focus();
  }, [focusKey]);
  useEffect(() => setIndex(0), [find, matchCase, wholeWords, scope]);
  useEffect(() => setDone(null), [find, replace, matchCase, wholeWords, scope]);

  const show = (i: number) => {
    const m = result.matches[i];
    if (!m) return;
    setIndex(i);
    if (m.elementId) ed.select([m.elementId], m.pageId);
    else ed.setPage(m.pageId);
    const host = [...document.querySelectorAll("[data-sheet-host]")].find((h) => h.getAttribute("data-sheet-host") === m.pageId);
    host?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };
  const step = (d: 1 | -1) => count && show((at + d + count) % count);

  const replaceOne = () => {
    if (!current || blocked || ed.readOnly) return;
    const r = applyFindReplace(ed.doc, { type: "find_replace", query, replace, matchIds: [current.id] });
    if (!r.replaced) return;
    ed.commit(r.doc, "Replace");
    setDone("Replaced 1.");
  };
  const replaceAll = () => {
    if (!count || blocked || ed.readOnly) return;
    const r = applyFindReplace(ed.doc, { type: "find_replace", query, replace });
    if (!r.replaced) return;
    ed.commit(r.doc, `Replace all: ${r.replaced}`);
    setDone(`Replaced ${r.replaced}. Undo puts them all back.`);
  };

  const summary = !find
    ? "Data chips and locked text are never changed."
    : count
      ? `${plural(count, "match", "matches")} on ${plural(pagesWithMatches(result), "page")} · data chips and locked text are never changed`
      : "No matches.";

  return (
    <div
      role="dialog"
      aria-label="Find and replace"
      data-testid="find-replace"
      className="absolute right-3 top-3 z-30 w-[360px] max-w-[calc(100%-1.5rem)] space-y-3 rounded-card border border-line bg-panel p-3 text-ink shadow-lg"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeFindReplace();
        } else if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type === "text") {
          e.preventDefault();
          step(e.shiftKey ? -1 : 1);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Find and replace</p>
        <button type="button" aria-label="Close find and replace" onClick={closeFindReplace} className={cn("rounded-control p-1 text-muted hover:bg-tint", focusRing)}>
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div ref={findRef}>
        <TextField label="Find" value={find} onChange={setFind} autoComplete="off" />
      </div>
      <TextField label="Replace with" value={replace} onChange={setReplace} autoComplete="off" disabled={ed.readOnly} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-accent" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
          Match case
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-accent" checked={wholeWords} onChange={(e) => setWholeWords(e.target.checked)} />
          Whole words
        </label>
        <SegmentedControl
          label="Search in"
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: "doc", label: "Whole report" },
            { value: "page", label: "This page" },
          ]}
        />
      </div>
      <p className="text-xs text-muted" aria-live="polite" data-testid="find-summary">
        {summary}
        {result.skipped > 0 && ` · ${plural(result.skipped, "match", "matches")} in locked text or hidden pages left as they are`}
      </p>
      {current && (
        <p className="truncate rounded-control bg-tint px-2 py-1 text-xs" data-testid="find-current">
          <span className="font-num text-muted">
            {at + 1} of {count}
          </span>{" "}
          {current.excerpt}
        </p>
      )}
      {blocked && (
        <Callout tone="warn" className="text-xs">
          {blocked}
        </Callout>
      )}
      {done && (
        <p role="status" className="text-xs text-good">
          {done}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous match" disabled={!count} onClick={() => step(-1)}>
            <ChevronUp aria-hidden className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Next match" disabled={!count} onClick={() => step(1)}>
            <ChevronDown aria-hidden className="size-4" /> Next
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!current || !!blocked || ed.readOnly} onClick={replaceOne}>
            Replace
          </Button>
          <Button size="sm" variant="primary" disabled={!count || !!blocked || ed.readOnly} onClick={replaceAll}>
            Replace all
          </Button>
        </div>
      </div>
    </div>
  );
}
