// PE-1 · photo tools on the image and frame toolbar (mockup PhotoEdit):
// Remove background (server job; the original is kept and "Restore original"
// brings it back), Adjust (five sliders), Filters (presets), Duotone in brand
// colours and Before/after. Transparency is the toolbar's common tail
// (element opacity). Every panel is a Popover, which the editor's PopoverLayer
// draws in a body portal, so nothing is clipped by the toolbar row. Each
// change is one docOps commit; a slider drag merges into one undo step.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Contrast, Eraser, Palette, SlidersHorizontal, SplitSquareHorizontal, Undo2, Wand2 } from "lucide-react";
import { IMAGE_ADJUST_KEYS, IMAGE_ADJUST_RANGE, IMAGE_FILTERS, type FreeformPage, type ImageFilter, type PageFormat } from "../../../lib/studio/contracts";
import { formatPx, PX_PER_MM, type RenderFreeformPage, type RenderDoc } from "../../../lib/studio/render";
import { mountSheet } from "../../../lib/studio/renderHost";
import { ADJUST_LABELS, FILTER_LABELS, adjustOf, applyBackgroundRemoved, beforeElement, brandDuotones, hasPhotoEdits, isPhotoElement, resetPhotoEdits, restoreOriginal, setDuotone, setImageAdjust, setImageFilter, signed, type PhotoElement } from "../../../lib/studio/photoOps";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { Button, Callout, ColourField, Popover, cn, focusRing } from "../../../ui";
import { useBrandKit } from "../brand-kit/api";
import { themeSwatches } from "../editor/actions";
import { editorKeys } from "../editor/api";
import type { EditorApi } from "../editor/EditorContext";
import type { ToolbarProps } from "../editor/registry";
import { MediaToolbar, Sep, TbButton, TbLabel } from "../editor/toolbars";
import { photoErrorMessage, useImageJob, useRemoveBackground } from "./api";

/** One element drawn by the shared renderer at a fixed width (never re-created in React: layer rule 2). */
export function ElementPreview({ editor, page, el, width, label }: { editor: EditorApi; page: FreeformPage; el: PhotoElement; width: number; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const size = formatPx(editor.doc.format as PageFormat);
  const f = el.frame;
  const view = { x: f.x * PX_PER_MM, y: f.y * PX_PER_MM, w: Math.max(1, f.w * PX_PER_MM), h: Math.max(1, f.h * PX_PER_MM) };
  const scale = width / view.w;
  const one = useMemo(() => ({ ...page, elements: [{ ...el, frame: { ...el.frame, rotation: 0 } }] }) as unknown as RenderFreeformPage, [page, el]);
  const { assets, brand } = editor.render;
  useEffect(() => {
    if (!host.current) return;
    try {
      mountSheet(host.current, one, editor.doc as unknown as RenderDoc, null, { assets, brand });
    } catch {
      // A picture the renderer can't draw leaves the frame empty.
    }
  }, [one, editor.doc, assets, brand]);
  return (
    <div role="img" aria-label={label} className="relative overflow-hidden" style={{ width: Math.round(view.w * scale), height: Math.round(view.h * scale) }}>
      <div ref={host} aria-hidden style={{ width: size.w, height: size.h, transform: `scale(${scale}) translate(${-view.x}px, ${-view.y}px)`, transformOrigin: "top left", pointerEvents: "none" }} />
    </div>
  );
}

/**
 * The Remove background panel. Its buttons come and go with the job (the run
 * button is disabled while it runs and gone when done), so when focus is left
 * on nothing it moves to the panel: Esc still closes the popover instead of
 * reaching the editor (which would clear the selection).
 */
function RemoveBackgroundPanel({ status, children }: { status: Job["status"]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [status]);
  return (
    <div ref={ref} tabIndex={-1} className="w-72 space-y-3 p-1 text-sm focus:outline-none" data-testid="photo-remove-bg-panel">
      {children}
    </div>
  );
}

type Job = { status: "idle" } | { status: "running"; jobId: number | null } | { status: "done" } | { status: "error"; message: string };

function RemoveBackground({ editor, pageId, el, disabled }: { editor: EditorApi; pageId: string; el: PhotoElement; disabled: boolean }) {
  const [job, setJob] = useState<Job>({ status: "idle" });
  const start = useRemoveBackground();
  const poll = useImageJob(job.status === "running" ? job.jobId : null);
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  const latest = useRef(editor);
  latest.current = editor;
  const applied = useRef<number | null>(null);
  const derived = !!el.props.originalAssetId;

  useEffect(() => {
    const j = poll.data;
    if (job.status !== "running" || !j || j.id !== job.jobId || applied.current === j.id) return;
    if (j.status === "failed") {
      applied.current = j.id;
      setJob({ status: "error", message: photoErrorMessage({ response: { data: { code: j.errorCode ?? "DS_JOB_FAILED" } } }) });
    } else if (j.status === "done" && j.resultAssetId) {
      applied.current = j.id;
      const result = j.resultAssetId;
      // The new asset's URL must be in the render inputs before the element points at it.
      void qc.refetchQueries({ queryKey: editorKeys.assets(companyId) }).finally(() => {
        const ed = latest.current;
        const now = (ed.doc.pages.find((p) => p.id === pageId) as FreeformPage | undefined)?.elements.find((e) => e.id === el.id);
        if (now && (now.type === "image" || now.type === "frame")) ed.commit(applyBackgroundRemoved(ed.doc, pageId, now, result), "Remove background");
        setJob({ status: "done" });
      });
    }
  }, [poll.data, job, qc, companyId, pageId, el.id]);

  useEffect(() => {
    if (job.status === "running" && poll.isError) setJob({ status: "error", message: photoErrorMessage(poll.error) });
  }, [poll.isError, poll.error, job.status]);

  const run = async () => {
    if (!el.props.assetId) return;
    setJob({ status: "running", jobId: null });
    try {
      const j = await start.mutateAsync(el.props.assetId);
      setJob({ status: "running", jobId: j.id });
    } catch (e) {
      setJob({ status: "error", message: photoErrorMessage(e) });
    }
  };
  const running = job.status === "running";

  return (
    <Popover
      label="Remove background"
      trigger={(t) => (
        <TbButton {...t} disabled={disabled} icon={<Eraser aria-hidden className={cn("size-4", running && "animate-pulse")} />} data-testid="photo-remove-bg">
          <TbLabel>{running ? "Removing…" : "Remove background"}</TbLabel>
        </TbButton>
      )}
    >
      {() => (
        <RemoveBackgroundPanel status={job.status}>
          {job.status === "error" ? (
            <Callout tone="warn" title={job.message}>
              {job.message.startsWith("Background remover isn't set up") ? "Ask your administrator to switch it on. Your picture is unchanged." : "Your picture is unchanged."}
            </Callout>
          ) : job.status === "done" ? (
            <Callout tone="brand" title="Background removed">
              Saved as a new image; the original stays in Uploads.
            </Callout>
          ) : (
            <p className="text-muted">Runs on our server and saves the result as a new image. The original stays in Uploads, so you can restore it.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {job.status !== "done" && (
              <Button variant="primary" size="sm" loading={running} disabled={!el.props.assetId} onClick={() => void run()} data-testid="photo-remove-bg-run">
                {running ? "Removing background…" : job.status === "error" ? "Try again" : "Remove background"}
              </Button>
            )}
            {derived && (
              <Button size="sm" icon={<Undo2 aria-hidden className="size-4" />} disabled={running} onClick={() => (editor.commit(restoreOriginal(editor.doc, pageId, el), "Restore original"), setJob({ status: "idle" }))} data-testid="photo-restore">
                Restore original
              </Button>
            )}
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {running ? "Removing the background" : job.status === "done" ? "Background removed" : ""}
          </p>
        </RemoveBackgroundPanel>
      )}
    </Popover>
  );
}

function AdjustPanel({ editor, pageId, el }: { editor: EditorApi; pageId: string; el: PhotoElement }) {
  const a = adjustOf(el.props);
  return (
    <div className="w-72 space-y-3 p-1" data-testid="photo-adjust-panel">
      {IMAGE_ADJUST_KEYS.map((k) => {
        const [min, max] = IMAGE_ADJUST_RANGE[k];
        return (
          <label key={k} className="block text-sm text-ink">
            <span className="flex items-center justify-between">
              <span>{ADJUST_LABELS[k]}</span>
              <span className="font-num text-xs text-muted">{signed(a[k])}</span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={a[k]}
              aria-label={ADJUST_LABELS[k]}
              onChange={(e) => editor.commit(setImageAdjust(editor.doc, pageId, el, k, Number(e.target.value)), ADJUST_LABELS[k], { mergeKey: `adjust:${k}:${el.id}` })}
              className="mt-1 w-full accent-brand"
            />
          </label>
        );
      })}
      <div className="flex items-center justify-between border-t border-line pt-2">
        <p className="text-xs text-muted">The PDF uses the same filters as the editor.</p>
        <Button size="sm" variant="ghost" disabled={!hasPhotoEdits(el.props)} onClick={() => editor.commit(resetPhotoEdits(editor.doc, pageId, el), "Reset photo edits")} data-testid="photo-reset">
          Reset all
        </Button>
      </div>
    </div>
  );
}

function FilterPanel({ editor, pageId, page, el, close }: { editor: EditorApi; pageId: string; page: FreeformPage; el: PhotoElement; close: () => void }) {
  const current = el.props.filter ?? "none";
  return (
    <ul className="grid w-80 grid-cols-3 gap-2 p-1" aria-label="Filters" data-testid="photo-filter-panel">
      {IMAGE_FILTERS.map((f: ImageFilter) => (
        <li key={f}>
          <button
            type="button"
            aria-pressed={current === f}
            onClick={() => {
              editor.commit(setImageFilter(editor.doc, pageId, el, f), `Filter: ${FILTER_LABELS[f]}`);
              close();
            }}
            className={cn("flex w-full flex-col items-center gap-1 rounded-control border p-1 text-xs text-ink hover:bg-tint", current === f ? "border-brand bg-brand-50" : "border-line", focusRing)}
          >
            <ElementPreview editor={editor} page={page} el={{ ...el, props: { ...el.props, filter: f } } as PhotoElement} width={80} label="" />
            {FILTER_LABELS[f]}
          </button>
        </li>
      ))}
    </ul>
  );
}

function DuotonePanel({ editor, pageId, el }: { editor: EditorApi; pageId: string; el: PhotoElement }) {
  const kit = useBrandKit();
  const presets = useMemo(() => brandDuotones(kit.data?.colors, themeSwatches(editor.doc)), [kit.data?.colors, editor.doc]);
  const cur = el.props.duotone ?? null;
  const set = (d: { dark: string; light: string } | null, label = "Duotone") => editor.commit(setDuotone(editor.doc, pageId, el, d), label);
  return (
    <div className="w-72 space-y-3 p-1" data-testid="photo-duotone-panel">
      <p className="text-sm font-medium text-ink">Duotone in brand colours</p>
      {presets.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Brand duotones">
          {presets.map((p) => {
            const on = !!cur && cur.dark.toLowerCase() === p.dark && cur.light.toLowerCase() === p.light;
            return (
              <button
                key={`${p.dark}${p.light}`}
                type="button"
                aria-pressed={on}
                aria-label={`${p.name} duotone`}
                title={p.name}
                onClick={() => set(p)}
                className={cn("h-8 w-12 rounded-control border border-line", on && "ring-2 ring-brand", focusRing)}
                style={{ background: `linear-gradient(90deg, ${p.dark} 0 50%, ${p.light} 50% 100%)` }}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted">{kit.isPending ? "Loading brand colours…" : "Add brand colours in the brand kit to get duotones."}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <ColourField label="Dark" value={cur?.dark ?? ""} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && set({ dark: v, light: cur?.light ?? presets[0]?.light ?? v })} />
        <ColourField label="Light" value={cur?.light ?? ""} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && set({ dark: cur?.dark ?? presets[0]?.dark ?? v, light: v })} />
      </div>
      <Button size="sm" variant="ghost" disabled={!cur} onClick={() => set(null, "Duotone off")} data-testid="photo-duotone-off">
        Turn off duotone
      </Button>
    </div>
  );
}

function BeforeAfter({ editor, page, el }: { editor: EditorApi; page: FreeformPage; el: PhotoElement }) {
  const [split, setSplit] = useState(50);
  const before = useMemo(() => beforeElement(el), [el]);
  const width = 300;
  return (
    <div className="w-[316px] space-y-2 p-1" data-testid="photo-compare-panel">
      <div className="relative overflow-hidden rounded-control border border-line">
        <ElementPreview editor={editor} page={page} el={el} width={width} label="After" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} data-testid="photo-compare-before">
          <ElementPreview editor={editor} page={page} el={before} width={width} label="Before" />
        </div>
        <div aria-hidden className="absolute inset-y-0 w-0.5 bg-panel shadow" style={{ left: `${split}%` }} />
        <span className="absolute top-1.5 left-1.5 rounded-chip bg-panel px-1.5 text-xs text-ink">Before</span>
        <span className="absolute top-1.5 right-1.5 rounded-chip bg-panel px-1.5 text-xs text-ink">After</span>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <span>Before</span>
        <input type="range" min={0} max={100} value={split} aria-label="Before and after split" onChange={(e) => setSplit(Number(e.target.value))} className="flex-1 accent-brand" />
        <span>After</span>
      </label>
    </div>
  );
}

/** The PE-1 buttons after the media toolbar's own (image and frame with a picture). */
export function PhotoTools({ editor, pageId, el }: { editor: EditorApi; pageId: string; el: PhotoElement }) {
  const page = editor.doc.pages.find((p): p is FreeformPage => p.id === pageId && p.kind === "freeform");
  const locked = !!el.locked || !!el.templateLocked || editor.readOnly;
  const hasPicture = !!el.props.assetId;
  if (!page) return null;
  const off = locked || !hasPicture;
  const edited = hasPhotoEdits(el.props);
  return (
    <>
      <Sep />
      <RemoveBackground editor={editor} pageId={pageId} el={el} disabled={off} />
      <Popover
        label="Adjust"
        trigger={(t) => (
          <TbButton {...t} disabled={off} active={IMAGE_ADJUST_KEYS.some((k) => adjustOf(el.props)[k] !== 0)} icon={<SlidersHorizontal aria-hidden className="size-4" />} data-testid="photo-adjust">
            <TbLabel>Adjust</TbLabel>
          </TbButton>
        )}
      >
        {() => <AdjustPanel editor={editor} pageId={pageId} el={el} />}
      </Popover>
      <Popover
        label="Filters"
        trigger={(t) => (
          <TbButton {...t} disabled={off} active={!!el.props.filter && el.props.filter !== "none"} icon={<Wand2 aria-hidden className="size-4" />} data-testid="photo-filters">
            <TbLabel>Filters</TbLabel>
          </TbButton>
        )}
      >
        {(close) => <FilterPanel editor={editor} pageId={pageId} page={page} el={el} close={close} />}
      </Popover>
      <Popover
        label="Duotone"
        trigger={(t) => (
          <TbButton {...t} disabled={off} active={!!el.props.duotone} icon={<Palette aria-hidden className="size-4" />} data-testid="photo-duotone">
            <TbLabel>Duotone</TbLabel>
          </TbButton>
        )}
      >
        {() => <DuotonePanel editor={editor} pageId={pageId} el={el} />}
      </Popover>
      <Popover
        label="Before and after"
        trigger={(t) => (
          <TbButton {...t} disabled={!hasPicture || (!edited && !el.props.originalAssetId)} title="Compare with the original" icon={<SplitSquareHorizontal aria-hidden className="size-4" />} data-testid="photo-compare">
            <TbLabel>Before/after</TbLabel>
          </TbButton>
        )}
      >
        {() => <BeforeAfter editor={editor} page={page} el={el} />}
      </Popover>
      {(edited || el.props.originalAssetId) && (
        <span className="flex flex-none items-center gap-1 px-1 text-xs text-muted in-data-[tb-compact=true]:sr-only" data-testid="photo-original-kept">
          <Contrast aria-hidden className="size-3.5" />
          Original kept
        </span>
      )}
    </>
  );
}

/** The image and frame toolbar (photo/register.ts): Replace, Crop, radius or mask, Alt text, then the photo tools. */
export function PhotoToolbar(props: ToolbarProps) {
  const el = props.elements[0];
  return (
    <>
      <MediaToolbar {...props} />
      {isPhotoElement(el) && props.elements.length === 1 && <PhotoTools editor={props.editor} pageId={props.pageId} el={el} />}
    </>
  );
}
