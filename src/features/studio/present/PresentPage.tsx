// DS-11 · `/studio/:id/present` (05-ux S7): the design full screen from
// preview.html?mode=present in a sandboxed frame. Arrow keys, Space and Page
// Up/Down move between pages (inside the frame and from here), N opens the
// speaker notes in a second window (a side panel when pop-ups are blocked),
// Esc leaves. The slide counter and buttons sit in a bar that fades in on
// pointer movement.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Maximize, NotebookText, X } from "lucide-react";
import { Button, EmptyState, Loading, cn } from "../../../ui";
import { notesFor, slideForKey, type BridgeMessage } from "../../../lib/studio/outputs";
import { useDoc } from "../docs/api";
import { dsError, usePreviewHtml } from "../share/api";
import { PreviewFrame, type PreviewFrameHandle } from "../preview/PreviewFrame";

const NOTES_WINDOW = "ds-present-notes";

/** Writes the notes view into the second window (same-origin about:blank; text only). */
function writeNotes(w: Window, title: string, page: { name: string; notes: string } | null, index: number, count: number) {
  const d = w.document;
  d.title = `Notes · ${title}`;
  d.body.style.cssText = "margin:0;padding:24px;font:16px/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText";
  d.body.replaceChildren();
  const head = d.createElement("p");
  head.style.cssText = "margin:0 0 4px;font-size:13px;opacity:.7";
  head.textContent = `Page ${index + 1} of ${count}`;
  const h = d.createElement("h1");
  h.style.cssText = "margin:0 0 16px;font-size:20px";
  h.textContent = page?.name ?? "";
  const body = d.createElement("div");
  body.style.whiteSpace = "pre-wrap";
  body.textContent = page?.notes?.trim() ? page.notes : "No speaker notes for this page.";
  d.body.append(head, h, body);
}

export function PresentPage() {
  const { id } = useParams();
  const docId = Number(id);
  const valid = Number.isInteger(docId) && docId > 0;
  const navigate = useNavigate();
  const doc = useDoc(valid ? docId : null);
  const preview = usePreviewHtml(valid ? docId : 0, "present");
  const frame = useRef<PreviewFrameHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState({ index: 0, count: 0, pageId: null as string | null });
  const [notesOpen, setNotesOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  const notesWin = useRef<Window | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    notesWin.current?.close();
    navigate(`/studio/${docId}`);
  }, [docId, navigate]);

  const go = useCallback(
    (index: number) => {
      frame.current?.go(index);
    },
    [],
  );

  const page = notesFor(doc.data?.doc, slide.pageId);
  const title = doc.data?.title ?? "Design";

  const openNotes = useCallback(() => {
    const w = window.open("", NOTES_WINDOW, "popup,width=520,height=640");
    if (w && !w.closed) {
      notesWin.current = w;
      setNotesOpen(true);
      setPanel(false);
    } else {
      setPanel(true);
    }
  }, []);

  // Keep the notes window on the current page.
  useEffect(() => {
    const w = notesWin.current;
    if (!notesOpen || !w || w.closed) return;
    try {
      writeNotes(w, title, page, slide.index, slide.count);
    } catch {
      setPanel(true);
      setNotesOpen(false);
    }
  }, [notesOpen, page, slide.index, slide.count, title]);

  useEffect(() => () => notesWin.current?.close(), []);

  const onKey = useCallback(
    (key: string) => {
      if (key === "Escape") return exit();
      if (key === "n" || key === "N") return panel || notesOpen ? (setPanel(false), notesWin.current?.close(), setNotesOpen(false)) : openNotes();
      const next = slideForKey(key, slide.index, slide.count);
      if (next !== null && next !== slide.index) go(next);
    },
    [exit, go, notesOpen, openNotes, panel, slide.count, slide.index],
  );

  // Keys pressed while the app (not the frame) has focus.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select")) return;
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "PageUp", "PageDown", " ", "Home", "End", "Escape", "n", "N"].includes(e.key)) {
        e.preventDefault();
        onKey(e.key);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onKey]);

  const onMessage = (m: BridgeMessage) => {
    if (m.type === "ready") {
      setError(m.error);
      frame.current?.focus();
    } else if (m.type === "slide") setSlide({ index: m.index, count: m.count, pageId: m.pageId });
    else if (m.type === "key") onKey(m.key);
  };

  if (!valid) return <EmptyState title="This design doesn't exist." description="Open a design from Design Studio." />;
  if (preview.isError || doc.isError) {
    const e = dsError(preview.error ?? doc.error);
    return <EmptyState variant="error" title="This design can't be presented." description={e.code === "DS_DOC_NOT_FOUND" ? "It was deleted, or it belongs to sites you can't see." : (e.message ?? "Try again.")} />;
  }

  return (
    <div ref={root} className="fixed inset-0 z-[60] flex bg-black text-white" role="dialog" aria-modal="true" aria-label={`Presenting ${title}`} data-testid="studio-present">
      <div className="group relative min-w-0 flex-1">
        {!preview.data ? <Loading label="Preparing the pages">{null}</Loading> : <PreviewFrame ref={frame} html={preview.data.html} title={`Presenting ${title}`} onMessage={onMessage} />}
        {error && (
          <p role="alert" className="absolute left-4 top-4 rounded-control bg-panel px-3 py-1.5 text-xs text-bad">
            Some pages couldn't be laid out: {error}
          </p>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button size="sm" variant="secondary" aria-label="Previous page" icon={<ChevronLeft aria-hidden className="size-4" />} disabled={slide.index <= 0} onClick={() => go(slide.index - 1)} />
          <span className="min-w-20 text-center text-sm tabular-nums" role="status" aria-live="polite" data-testid="present-counter">
            {slide.count ? `${slide.index + 1} / ${slide.count}` : ""}
          </span>
          <Button size="sm" variant="secondary" aria-label="Next page" icon={<ChevronRight aria-hidden className="size-4" />} disabled={slide.count === 0 || slide.index >= slide.count - 1} onClick={() => go(slide.index + 1)} />
          <span aria-hidden className="mx-1 h-5 w-px bg-white/30" />
          <Button size="sm" variant="secondary" icon={<NotebookText aria-hidden className="size-4" />} onClick={() => (panel ? setPanel(false) : openNotes())} aria-pressed={panel || notesOpen}>
            Notes
          </Button>
          <Button size="sm" variant="secondary" icon={<Maximize aria-hidden className="size-4" />} onClick={() => void root.current?.requestFullscreen?.().catch(() => undefined)}>
            Full screen
          </Button>
          <Button size="sm" variant="secondary" icon={<X aria-hidden className="size-4" />} onClick={exit}>
            Exit
          </Button>
        </div>
      </div>
      {panel && (
        <aside className={cn("flex w-80 flex-none flex-col gap-2 overflow-auto border-l border-line bg-panel p-4 text-ink")} aria-label="Speaker notes" data-testid="present-notes">
          <p className="text-xs text-muted">{slide.count ? `Page ${slide.index + 1} of ${slide.count}` : ""}</p>
          <h2 className="text-base font-semibold">{page?.name ?? ""}</h2>
          <p className="whitespace-pre-wrap text-sm">{page?.notes?.trim() ? page.notes : "No speaker notes for this page."}</p>
        </aside>
      )}
    </div>
  );
}
