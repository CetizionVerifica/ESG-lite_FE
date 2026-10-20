// DS-10 · Resize and convert (05-ux S6, mockup "Resize"): pick the copies to
// make (board deck, one-page summary, social cards, A5 booklet), the chapters
// to include and whether AI summarises text; the right side previews the first
// three pages of the selected copy with the same engine the server runs and the
// design's own numbers. **Create copies** makes one linked design per target.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Link2, X } from "lucide-react";
import { Button, Callout, SegmentedControl, Toggle, cn, focusRing } from "../../../ui";
import { useFocusTrap } from "../../../ui/hooks/useFocusTrap";
import { useLockBodyScroll } from "../../../ui/hooks/useLockBodyScroll";
import type { FreeformPage, PageFormat, ReportDoc } from "../../../lib/studio/contracts";
import { formatPx, type RenderAssets, type RenderBrand, type RenderData, type RenderDoc, type RenderFreeformPage } from "../../../lib/studio/render";
import { mountSheet } from "../../../lib/studio/renderHost";
import { resizeError, useResize } from "./api";
import { TARGET_NAMES, chaptersOf, copyTitle, countText, defaultChapterIds, pageIdsFor, planTargets, previewNote, type TargetId, type TargetPlan } from "./logic";

const FORMAT_WORDS: Record<PageFormat, string> = {
  a4: "A4",
  a4_landscape: "A4 landscape",
  letter: "Letter",
  a5: "A5",
  slide_16_9: "16:9",
  square: "1:1",
  social_191: "1.91:1",
};

const ERROR_TEXT: Record<string, string> = {
  DS_RESIZE_UNSUPPORTED: "This design can't be made in that shape.",
  DS_FORMAT_INVALID: "That size isn't available for this kind of copy.",
  DS_ROLE: "Your role can't make copies.",
  DS_VERSION_CONFLICT: "The design is still being built. Try again in a moment.",
};

/** One page of a copy, drawn by the renderer with the design's numbers. */
function PreviewSheet({ doc, page, width, data, brand, assets }: { doc: ReportDoc; page: FreeformPage; width: number; data: RenderData | null; brand: RenderBrand | null; assets?: RenderAssets }) {
  const host = useRef<HTMLDivElement>(null);
  const size = formatPx(doc.format);
  const scale = width / size.w;
  useEffect(() => {
    if (!host.current) return;
    try {
      mountSheet(host.current, page as unknown as RenderFreeformPage, doc as unknown as RenderDoc, data, { brand, assets });
    } catch {
      // A page the renderer can't draw shows its empty frame.
    }
  }, [doc, page, data, brand, assets]);
  return (
    <div role="img" aria-label={page.name} className="overflow-hidden rounded-sm bg-panel shadow-md ring-1 ring-line" style={{ width: Math.round(size.w * scale), height: Math.round(size.h * scale) }}>
      <div ref={host} aria-hidden style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />
    </div>
  );
}

/** The outline of a format, to scale, for the target list. */
function FormatShape({ format }: { format: PageFormat }) {
  const px = formatPx(format);
  const k = 22 / Math.max(px.w, px.h);
  return <span aria-hidden className="block flex-none rounded-[2px] border-[1.5px] border-muted" style={{ width: Math.max(8, px.w * k), height: Math.max(8, px.h * k) }} />;
}

export interface ResizeDialogProps {
  open: boolean;
  onClose: () => void;
  docId: number;
  doc: ReportDoc;
  data: RenderData | null;
  brand: RenderBrand | null;
  assets?: RenderAssets;
  /** AI writing is available: "Summarise text with AI" starts on. */
  aiOn?: boolean;
}

interface Made {
  target: TargetId;
  id: number;
  title: string;
}

export function ResizeDialog({ open, onClose, docId, doc, data, brand, assets, aiOn = false }: ResizeDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const navigate = useNavigate();
  const resize = useResize(docId);
  const chapters = useMemo(() => chaptersOf(doc), [doc]);
  const [targets, setTargets] = useState<Set<TargetId>>(() => new Set(["deck"]));
  const [chapterOn, setChapterOn] = useState<Set<string>>(() => defaultChapterIds(chapters));
  const [summarise, setSummarise] = useState(aiOn);
  const [tab, setTab] = useState<TargetId>("deck");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made[]>([]);

  // A fresh dialog each time it opens.
  useEffect(() => {
    if (!open) return;
    setTargets(new Set(["deck"]));
    setChapterOn(defaultChapterIds(chapters));
    setSummarise(aiOn);
    setTab("deck");
    setError(null);
    setMade([]);
  }, [open, chapters, aiOn]);

  const pageIds = useMemo(() => pageIdsFor(chapters, chapterOn), [chapters, chapterOn]);
  const plans = useMemo(() => (open ? planTargets(doc, pageIds) : []), [open, doc, pageIds]);
  const planOf = (id: TargetId): TargetPlan | undefined => plans.find((p) => p.target.id === id);
  const chosen = plans.filter((p) => targets.has(p.target.id) && p.ok);
  const shown = planOf(tab) ?? chosen[0];
  const previewPages = (shown?.doc?.pages ?? []).filter((p): p is FreeformPage => p.kind === "freeform").slice(0, 3);

  const close = () => {
    if (!busy) onClose();
  };
  const trap = useFocusTrap(ref, open, close);
  useLockBodyScroll(open);
  if (!open) return null;

  const toggleTarget = (id: TargetId) => {
    const next = new Set(targets);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      setTab(id);
    }
    setTargets(next);
    if (!next.has(tab) && next.size) setTab([...next][0]);
  };
  const toggleChapter = (id: string) => {
    const next = new Set(chapterOn);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChapterOn(next);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const out: Made[] = [];
    try {
      for (const p of chosen) {
        const title = copyTitle(doc.meta.title, p.target.id);
        const r = await resize.mutateAsync({ format: p.target.format, purpose: p.target.purpose, title, ...(pageIds ? { pageIds } : {}), ai: summarise });
        out.push({ target: p.target.id, id: r.id, title: r.title });
      }
    } catch (err) {
      const e = resizeError(err);
      setError((e.code && ERROR_TEXT[e.code]) ?? e.message ?? "The copy couldn't be made. Try again.");
    } finally {
      setBusy(false);
    }
    if (out.length === 1 && out.length === chosen.length) {
      onClose();
      navigate(`/studio/${out[0].id}`);
      return;
    }
    setMade(out);
  };

  const noChapters = chapters.length > 0 && chapterOn.size === 0;
  const createLabel = busy ? "Making copies…" : chosen.length === 1 ? "Create copy" : `Create ${chosen.length} copies`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/40" onClick={close} data-testid="modal-backdrop" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
        data-testid="resize-dialog"
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col rounded-card border border-line bg-panel text-ink shadow-xl focus:outline-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold">
              Resize and convert
            </h2>
            <p className="mt-1 text-sm text-muted">
              From {doc.meta.title} · {FORMAT_WORDS[doc.format]} · {doc.pages.length} page{doc.pages.length === 1 ? "" : "s"}. Copies keep your brand and stay linked to the same data.
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={close} disabled={busy} className={cn("rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}>
            <X aria-hidden className="size-4" />
          </button>
        </header>

        {made.length ? (
          <div className="flex flex-col gap-3 px-5 py-5" data-testid="resize-made">
            <Callout tone={made.length === chosen.length ? "brand" : "warn"} title={`${made.length} cop${made.length === 1 ? "y" : "ies"} made`}>
              Each one is a new design linked to {doc.meta.title}. Its numbers update from the same approved data.
            </Callout>
            <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
              {made.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <FormatShape format={planOf(m.target)?.target.format ?? "a4"} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
                  <Link to={`/studio/${m.id}`} onClick={onClose} className={cn("inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline", focusRing)}>
                    Open <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
            {error && (
              <div role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[300px_1fr]">
            <div className="flex flex-col gap-5 border-line px-5 py-4 md:border-r">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Make copies as</legend>
                {plans.map((p) => {
                  const on = targets.has(p.target.id);
                  return (
                    <label
                      key={p.target.id}
                      title={p.reason ?? undefined}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-sm",
                        on && p.ok ? "border-brand bg-brand-50" : "border-line",
                        !p.ok && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input type="checkbox" className="size-4 accent-accent" checked={on && p.ok} disabled={!p.ok || busy} onChange={() => toggleTarget(p.target.id)} data-testid={`resize-target-${p.target.id}`} />
                      <FormatShape format={p.target.format} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{p.target.label}</span>
                        <span className="block text-xs text-muted">{p.ok ? countText(p.target, p.pageCount) : p.reason}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {chapters.length > 0 && (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pages to include</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {chapters.map((c) => {
                      const on = chapterOn.has(c.id);
                      return (
                        <label key={c.id} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm", on ? "border-brand bg-brand-50 text-ink" : "border-line text-muted")}>
                          <input type="checkbox" className="size-3.5 accent-accent" checked={on} disabled={busy} onChange={() => toggleChapter(c.id)} data-testid={`resize-chapter-${c.id}`} />
                          {c.label}
                        </label>
                      );
                    })}
                  </div>
                  {noChapters && <p className="text-xs text-bad">Pick at least one chapter.</p>}
                </fieldset>
              )}

              <Toggle
                label="Summarise text with AI"
                help="Shorter text for slides and cards, marked for your review. Numbers stay linked. Off: text is shortened to fit."
                checked={summarise}
                onChange={setSummarise}
                disabled={busy}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3 bg-page px-5 py-4" data-testid="resize-preview">
              {chosen.length > 1 && (
                <SegmentedControl<TargetId> label="Preview" size="sm" value={shown?.target.id ?? "deck"} onChange={setTab} options={chosen.map((p) => ({ value: p.target.id, label: TARGET_NAMES[p.target.id] }))} />
              )}
              {shown && shown.ok ? (
                <>
                  <div className="flex flex-wrap items-start gap-3">
                    {previewPages.map((page, i) => (
                      <figure key={page.id} className="flex flex-col gap-1">
                        <PreviewSheet doc={shown.doc as ReportDoc} page={page} width={shown.target.profile === "deck" || shown.target.format === "social_191" ? 260 : 180} data={data} brand={brand} assets={assets} />
                        <figcaption className="text-xs text-muted">
                          {shown.target.profile === "deck" ? "Slide" : "Page"} {i + 1} · {page.name}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <p className="text-xs text-muted" data-testid="resize-note">
                    {previewNote(shown, previewPages.length)}
                  </p>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-muted">Pick a copy to see it here.</p>
              )}
            </div>
          </div>
        )}

        {error && !made.length && (
          <div role="alert" className="mx-5 mt-3 rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </div>
        )}
        <footer className="flex flex-col gap-3 border-t border-line px-5 py-3 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-center gap-1.5 text-xs text-muted">
            <Link2 aria-hidden className="size-3.5" /> Each copy opens as a new design marked “Made from {doc.meta.title}”.
          </p>
          {made.length ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void create()} loading={busy} disabled={!chosen.length || noChapters} data-testid="resize-create">
                {createLabel}
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
