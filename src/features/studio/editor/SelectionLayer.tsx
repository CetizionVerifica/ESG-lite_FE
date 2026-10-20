// DS-6 · the overlay above one sheet (layer rule 2): hover outline, selection
// boxes, 8 resize handles and the rotate handle, marquee, snap guides, the
// safe margin, bleed and ruler guides, the crop box, comment pins and drops.
// Transforms preview on the overlay and on the rendered boxes (liveFrame) and
// commit one doc change on pointer-up (RS-6).
import { useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Lock, MessageSquare } from "lucide-react";
import type { Crop, Element, FreeformPage, Frame } from "../../../lib/studio/contracts";
import { expandSelection, fillFrame, moveGuide, removeGuide, setCrop, takesImage, updateFrames } from "../../../lib/studio/docOps";
import {
  boundsOf,
  boxFromPoints,
  boxesIntersect,
  centreOf,
  clampCrop,
  coverCrop,
  gridCells,
  moveFrame,
  resizeFrame,
  rotatedBounds,
  rotationFromPointer,
  toLocal,
  zoomCrop,
  type Box,
  type Handle,
  type Point,
} from "../../../lib/studio/geometry";
import { guideAt, neighbourBoxes, snapMove, snapResize, snapTargets, thresholdFor, type SnapGuide } from "../../../lib/studio/snapping";
import { cn } from "../../../ui";
import { useEditor } from "./EditorContext";
import { DND_ASSET, DND_DATA, getFigureDrop, hasStudioPayload, imageFromAsset, readAsset, readElement, readFigure } from "./dnd";
import { getCommentHandler, getElementEditor, getPageOverlays } from "./registry";
import { bindingOf, linkMarkText } from "./renderInputs";
import { hitElements, liveFrame, scaleOf } from "./canvasUtil";

const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
};
const HANDLE_LABEL: Record<Handle, string> = { nw: "top left", n: "top", ne: "top right", e: "right", se: "bottom right", s: "bottom", sw: "bottom left", w: "left" };
const HANDLES = Object.keys(HANDLE_POS) as Handle[];
/** Pointer travel (px) before a press becomes a drag. */
const DRAG_PX = 3;

type Drag =
  | { kind: "move"; start: Point; ids: string[]; frames: Record<string, Frame>; moved: boolean; clickId: string | null; additive: boolean }
  | { kind: "resize"; start: Point; id: string; frame: Frame; handle: Handle; moved: boolean }
  | { kind: "rotate"; id: string; frame: Frame; moved: boolean }
  | { kind: "marquee"; start: Point; base: string[]; moved: boolean }
  | { kind: "guide"; index: number; axis: "x" | "y"; moved: boolean }
  | { kind: "crop"; start: Point; crop: Crop; box: Box; scale: boolean; moved: boolean };

export interface SelectionLayerProps {
  page: FreeformPage;
  wMm: number;
  hMm: number;
  safeMm: number;
  bleedMm: number;
  zoom: number;
}

/** The crop box being edited: the picture's box inside the frame or grid cell (mm, frame-relative), and the box it fills. */
function cropState(el: Element, cell: number | undefined, assetSize: (id: string | undefined) => { w: number; h: number } | null): { crop: Crop; box: Box } | null {
  if (el.type === "frame" || el.type === "image") {
    if (!el.props.assetId) return null;
    const box = { x: 0, y: 0, w: el.frame.w, h: el.frame.h };
    const size = assetSize(el.props.assetId);
    return { crop: el.props.crop ?? coverCrop(box.w, box.h, size?.w ?? box.w, size?.h ?? box.h), box };
  }
  if (el.type === "grid" && cell !== undefined) {
    const c = el.props.cells[cell];
    if (!c?.assetId) return null;
    const box = gridCells(el.frame.w, el.frame.h, el.props.columns, el.props.gap, el.props.cells.length)[cell];
    const size = assetSize(c.assetId);
    return { crop: c.crop ?? coverCrop(box.w, box.h, size?.w ?? box.w, size?.h ?? box.h), box };
  }
  return null;
}

export function SelectionLayer({ page, wMm, hMm, safeMm, bleedMm, zoom }: SelectionLayerProps) {
  const ed = useEditor();
  const { ui, readOnly } = ed;
  const k = scaleOf(zoom);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [frames, setFrames] = useState<Record<string, Frame> | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guideMm, setGuideMm] = useState<{ index: number; mm: number } | null>(null);
  const [liveCrop, setLiveCrop] = useState<Crop | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pins, setPins] = useState<Point[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const active = ui.pageId === page.id;
  const selection = active ? ui.selection : [];
  const selected = page.elements.filter((e) => selection.includes(e.id));
  const crop = ui.crop && ui.crop.pageId === page.id ? ui.crop : null;
  const cropEl = crop ? page.elements.find((e) => e.id === crop.elementId) : undefined;
  const assetSize = (id: string | undefined) => {
    const a = id ? ed.doc.assets.find((x) => x.id === id) : undefined;
    return a && a.w && a.h ? { w: a.w, h: a.h } : null;
  };
  const cropInfo = cropEl ? cropState(cropEl, crop?.cell, assetSize) : null;

  const toMm = (e: { clientX: number; clientY: number }): Point => {
    const r = ref.current?.getBoundingClientRect();
    return r ? { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k } : { x: 0, y: 0 };
  };
  const frameOf = (el: Element) => frames?.[el.id] ?? el.frame;
  const size = { wMm, hMm, safeMm };
  const threshold = thresholdFor(zoom);
  const pageGuides = page.guides ?? [];

  const capture = (e: ReactPointerEvent) => {
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests have no active pointer.
    }
  };

  const finish = () => {
    drag.current = null;
    setFrames(null);
    setGuides([]);
    setMarquee(null);
    setGuideMm(null);
    setLiveCrop(null);
  };

  // ---------------------------------------------------------------- press
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = toMm(e);
    if (ui.commentMode) {
      const hit = hitElements(page, p, 0)[0];
      const pin = { docId: ed.docId, pageId: page.id, x: p.x, y: p.y, elementId: hit?.id ?? null };
      const handler = getCommentHandler();
      if (handler) handler(pin, ed);
      // DS-13 draws saved pins itself; the shell's own marker stays for the stub only.
      if (!handler || (handler as { fallback?: boolean }).fallback) setPins((x) => [...x, p]);
      ed.setCommentMode(false);
      return;
    }
    if (!active) ed.setPage(page.id);
    // Crop: drag inside the picture box moves it; elsewhere ends the crop.
    if (cropEl && cropInfo) {
      const local = toLocal(cropEl.frame, p);
      const c = cropInfo.crop;
      const bx = cropInfo.box.x;
      const by = cropInfo.box.y;
      if (local.x >= bx + c.x && local.x <= bx + c.x + c.w && local.y >= by + c.y && local.y <= by + c.y + c.h) {
        drag.current = { kind: "crop", start: p, crop: c, box: cropInfo.box, scale: false, moved: false };
        capture(e);
        return;
      }
      ed.startCrop(null);
    }
    // A ruler guide under the pointer?
    if (!readOnly && ui.show.guides) {
      const tol = 4 / k;
      const gx = guideAt(pageGuides, "x", p.x, tol);
      const gy = gx < 0 ? guideAt(pageGuides, "y", p.y, tol) : -1;
      const gi = gx >= 0 ? gx : gy;
      if (gi >= 0 && !hitElements(page, p, 0).some((el) => selection.includes(el.id))) {
        drag.current = { kind: "guide", index: gi, axis: pageGuides[gi].axis, moved: false };
        capture(e);
        return;
      }
    }
    const hit = hitElements(page, p, 0.5 / zoom)[0];
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (hit) {
      const group = expandSelection(page, [hit.id], { enteredGroup: ui.enteredGroup });
      let next: string[];
      if (additive) next = group.every((id) => selection.includes(id)) ? selection.filter((id) => !group.includes(id)) : [...new Set([...selection, ...group])];
      else next = group.every((id) => selection.includes(id)) ? selection : group;
      if (hit.groupId && hit.groupId !== ui.enteredGroup && ui.enteredGroup) ed.enterGroup(null);
      ed.select(next, page.id);
      const movable = page.elements.filter((x) => next.includes(x.id) && !x.locked && !x.templateLocked);
      if (!readOnly && movable.length && !additive) {
        drag.current = { kind: "move", start: p, ids: movable.map((x) => x.id), frames: Object.fromEntries(movable.map((x) => [x.id, x.frame])), moved: false, clickId: hit.id, additive };
        capture(e);
      }
      return;
    }
    if (!additive) ed.select([], page.id);
    drag.current = { kind: "marquee", start: p, base: additive ? selection : [], moved: false };
    capture(e);
  };

  const onHandleDown = (e: ReactPointerEvent, el: Element, handle: Handle | "rotate") => {
    e.stopPropagation();
    if (e.button !== 0 || readOnly || el.locked) return;
    drag.current = handle === "rotate" ? { kind: "rotate", id: el.id, frame: el.frame, moved: false } : { kind: "resize", start: toMm(e), id: el.id, frame: el.frame, handle, moved: false };
    capture(e);
  };

  const onCropHandleDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    if (!cropInfo) return;
    drag.current = { kind: "crop", start: toMm(e), crop: cropInfo.crop, box: cropInfo.box, scale: true, moved: false };
    capture(e);
  };

  // ---------------------------------------------------------------- move
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const p = toMm(e);
    if (!d) {
      const h = hitElements(page, p, 0.5 / zoom)[0];
      setHover(h?.id ?? null);
      return;
    }
    if (!d.moved) {
      const from = "start" in d ? d.start : null;
      if (from && Math.hypot(p.x - from.x, p.y - from.y) * k < DRAG_PX) return;
      d.moved = true;
    }
    const snapOn = !e.altKey || d.kind !== "move";
    switch (d.kind) {
      case "move": {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const startBox = boundsOf(Object.values(d.frames)) as Box;
        let g: SnapGuide[] = [];
        if (snapOn && !e.metaKey && !e.ctrlKey) {
          const moved = { ...startBox, x: startBox.x + dx, y: startBox.y + dy };
          const s = snapMove(moved, snapTargets(ui.show.guides ? page : { ...page, guides: [] }, size, d.ids), threshold, neighbourBoxes(page, d.ids));
          dx += s.dx;
          dy += s.dy;
          g = s.guides;
        }
        const next = Object.fromEntries(Object.entries(d.frames).map(([id, f]) => [id, moveFrame(f, dx, dy)]));
        for (const [id, f] of Object.entries(next)) liveFrame(page.id, id, f);
        setFrames(next);
        setGuides(g);
        return;
      }
      case "resize": {
        const el = page.elements.find((x) => x.id === d.id);
        const media = el && (el.type === "image" || el.type === "frame" || el.type === "grid" || el.type === "sdg" || el.type === "icon" || el.type === "qr");
        const corner = d.handle.length === 2;
        let f = resizeFrame(d.frame, d.handle, p.x - d.start.x, p.y - d.start.y, { keepRatio: e.shiftKey || (!!media && corner), fromCentre: e.altKey });
        let g: SnapGuide[] = [];
        if (!f.rotation && !e.shiftKey && !e.altKey) {
          const edges = { x: d.handle.includes("w") ? "start" : d.handle.includes("e") ? "end" : undefined, y: d.handle.includes("n") ? "start" : d.handle.includes("s") ? "end" : undefined } as const;
          const s = snapResize(f, edges, snapTargets(ui.show.guides ? page : { ...page, guides: [] }, size, [d.id]), threshold);
          f = { ...f, ...s.box };
          g = s.guides;
        }
        liveFrame(page.id, d.id, f);
        setFrames({ [d.id]: f });
        setGuides(g);
        return;
      }
      case "rotate": {
        const rotation = rotationFromPointer(centreOf(d.frame), p, e.shiftKey);
        const f = { ...d.frame, rotation };
        liveFrame(page.id, d.id, f);
        setFrames({ [d.id]: f });
        return;
      }
      case "marquee": {
        const box = boxFromPoints(d.start, p);
        setMarquee(box);
        const inside = page.elements.filter((x) => !x.hidden && !x.templateLocked && boxesIntersect(box, rotatedBounds(x.frame))).map((x) => x.id);
        ed.select(expandSelection(page, [...d.base, ...inside], { enteredGroup: ui.enteredGroup }), page.id);
        return;
      }
      case "guide": {
        setGuideMm({ index: d.index, mm: d.axis === "x" ? p.x : p.y });
        return;
      }
      case "crop": {
        const el = cropEl;
        if (!el) return;
        const a = toLocal(el.frame, p);
        const b = toLocal(el.frame, d.start);
        const next = d.scale ? zoomCrop(d.crop, Math.max(0.2, (d.crop.w + (a.x - b.x)) / d.crop.w), d.box.w, d.box.h) : clampCrop({ ...d.crop, x: d.crop.x + (a.x - b.x), y: d.crop.y + (a.y - b.y) }, d.box.w, d.box.h);
        setLiveCrop(next);
        return;
      }
    }
  };

  // ---------------------------------------------------------------- release
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      // not captured
    }
    if (!d.moved) {
      // A click on an element of a multi-selection selects just its group.
      if (d.kind === "move" && d.clickId && !d.additive && selection.length > 1) ed.select(expandSelection(page, [d.clickId], { enteredGroup: ui.enteredGroup }), page.id);
      finish();
      return;
    }
    if (d.kind === "move" || d.kind === "resize" || d.kind === "rotate") {
      if (frames) ed.commit(updateFrames(ed.doc, page.id, frames), d.kind === "move" ? "Move" : d.kind === "resize" ? "Resize" : "Rotate");
    } else if (d.kind === "guide" && guideMm) {
      const limit = d.axis === "x" ? wMm : hMm;
      ed.commit(guideMm.mm < 0 || guideMm.mm > limit ? removeGuide(ed.doc, page.id, d.index) : moveGuide(ed.doc, page.id, d.index, guideMm.mm), "Move guide");
    } else if (d.kind === "crop" && liveCrop && crop) {
      ed.commit(setCrop(ed.doc, page.id, crop.elementId, liveCrop, crop.cell), "Crop", { mergeKey: `crop:${crop.elementId}` });
    }
    finish();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toMm(e);
    const hit = hitElements(page, p, 0.5 / zoom)[0];
    if (!hit) return;
    if (hit.groupId && hit.groupId !== ui.enteredGroup) {
      ed.enterGroup(hit.groupId);
      ed.select([hit.id], page.id);
      return;
    }
    if (readOnly || hit.locked) return;
    // DS-7: text and callouts open their in-place editor.
    const edit = getElementEditor(hit.type);
    if (edit) {
      ed.select([hit.id], page.id);
      edit({ pageId: page.id, elementId: hit.id }, ed);
      return;
    }
    if (hit.type === "frame" || hit.type === "image") {
      if (hit.props.assetId) ed.startCrop({ pageId: page.id, elementId: hit.id });
      return;
    }
    if (hit.type === "grid") {
      const local = toLocal(hit.frame, p);
      const cells = gridCells(hit.frame.w, hit.frame.h, hit.props.columns, hit.props.gap, hit.props.cells.length);
      const cell = cells.findIndex((c) => local.x >= c.x && local.x <= c.x + c.w && local.y >= c.y && local.y <= c.y + c.h);
      if (cell >= 0 && hit.props.cells[cell]?.assetId) ed.startCrop({ pageId: page.id, elementId: hit.id, cell });
    }
  };

  // ---------------------------------------------------------------- drops
  const imageTarget = (p: Point) => hitElements(page, p, 0).find(takesImage);
  // DS-8: the data element a dropped figure lands on.
  const figureTarget = (p: Point) => hitElements(page, p, 0).find((x) => !x.locked && !x.templateLocked && ["chart", "table", "big_number", "kpi_tile", "progress"].includes(x.type));
  const onDragOver = (e: DragEvent) => {
    if (readOnly || !hasStudioPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const isAsset = Array.from(e.dataTransfer.types).includes(DND_ASSET);
    // DS-8: a figure over a data element highlights it (the drop replaces its binding).
    const isFigure = Array.from(e.dataTransfer.types).includes(DND_DATA);
    setDropTarget(isAsset ? (imageTarget(toMm(e))?.id ?? null) : isFigure ? (figureTarget(toMm(e))?.id ?? null) : null);
  };
  const onDrop = (e: DragEvent) => {
    if (readOnly) return;
    const p = toMm(e);
    setDropTarget(null);
    // DS-8: a figure from the Data drawer.
    const figure = readFigure(e.dataTransfer);
    if (figure) {
      e.preventDefault();
      getFigureDrop()?.({ editor: ed, pageId: page.id, at: p, client: { x: e.clientX, y: e.clientY }, target: figureTarget(p), figure });
      return;
    }
    const asset = readAsset(e.dataTransfer);
    const el = asset ? null : readElement(e.dataTransfer);
    if (!asset && !el) return;
    e.preventDefault();
    if (asset) {
      const target = imageTarget(p);
      if (target) {
        let cell: number | undefined;
        if (target.type === "grid") {
          const local = toLocal(target.frame, p);
          cell = gridCells(target.frame.w, target.frame.h, target.props.columns, target.props.gap, target.props.cells.length).findIndex((c) => local.x >= c.x && local.x <= c.x + c.w && local.y >= c.y && local.y <= c.y + c.h);
          if (cell < 0) cell = undefined;
        }
        const known = ed.doc.assets.find((a) => a.id === asset.id);
        ed.commit(fillFrame(ed.doc, page.id, target.id, { id: asset.id, w: asset.w ?? known?.w, h: asset.h ?? known?.h, alt: asset.alt ?? known?.alt }, cell), "Add image to frame", { select: [target.id], pageId: page.id });
        return;
      }
      ed.insertElement(imageFromAsset(asset), { pageId: page.id, at: p, label: "Add image" });
      return;
    }
    if (el) ed.insertElement(el, { pageId: page.id, at: p, label: "Add element" });
  };

  // ---------------------------------------------------------------- draw
  const box = (f: Frame | Box, extra?: CSSProperties): CSSProperties => ({
    position: "absolute",
    left: f.x * k,
    top: f.y * k,
    width: f.w * k,
    height: f.h * k,
    transform: "rotation" in f && f.rotation ? `rotate(${f.rotation}deg)` : undefined,
    ...extra,
  });
  const single = selected.length === 1 ? selected[0] : null;
  const multiBox = selected.length > 1 ? boundsOf(selected.map(frameOf)) : null;
  const hoverEl = hover && !selection.includes(hover) ? page.elements.find((x) => x.id === hover) : undefined;
  const link = single && !frames ? linkMarkText(bindingOf(single), ed.render.resolved.find((r) => JSON.stringify(r.binding) === JSON.stringify(bindingOf(single)))?.value) : null;
  const shownCrop = liveCrop ?? cropInfo?.crop ?? null;

  return (
    <div
      ref={ref}
      data-overlay-page={page.id}
      data-testid={`overlay-${page.id}`}
      className={cn("absolute inset-0 touch-none select-none", ui.commentMode ? "cursor-crosshair" : "cursor-default")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={finish}
      onPointerLeave={() => !drag.current && setHover(null)}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDragLeave={() => setDropTarget(null)}
      onDrop={onDrop}
      onContextMenu={(e) => {
        const hit = hitElements(page, toMm(e), 0.5 / zoom)[0];
        if (hit && !selection.includes(hit.id)) ed.select(expandSelection(page, [hit.id], { enteredGroup: ui.enteredGroup }), page.id);
        else if (!hit) ed.select([], page.id);
      }}
    >
      {ui.show.margins && safeMm > 0 && <div aria-hidden className="pointer-events-none absolute border border-dashed border-info/50" style={{ inset: safeMm * k }} data-testid="margins" />}
      {ui.show.bleed && bleedMm > 0 && <div aria-hidden className="pointer-events-none absolute border border-dashed border-bad/60" style={{ inset: -bleedMm * k }} data-testid="bleed" />}
      {ui.show.guides &&
        pageGuides.map((g, i) => {
          const mm = guideMm?.index === i ? guideMm.mm : g.mm;
          return (
            <div
              key={`${g.axis}-${i}`}
              aria-hidden
              data-testid={`guide-${g.axis}-${i}`}
              className={cn("absolute bg-accent", g.axis === "x" ? "top-0 bottom-0 w-px cursor-ew-resize" : "left-0 right-0 h-px cursor-ns-resize")}
              style={g.axis === "x" ? { left: mm * k } : { top: mm * k }}
            />
          );
        })}

      {hoverEl && <div aria-hidden className="pointer-events-none border border-brand/60" style={box(hoverEl.frame)} />}
      {dropTarget && (() => {
        const t = page.elements.find((x) => x.id === dropTarget);
        return t ? <div aria-hidden className="pointer-events-none border-2 border-brand bg-brand/10" style={box(t.frame)} data-testid="drop-target" /> : null;
      })()}

      {selected.map((el) => {
        const f = frameOf(el);
        return (
          <div key={el.id} data-testid={`sel-${el.id}`} className={cn("pointer-events-none border-2", el.locked ? "border-muted" : "border-brand")} style={box(f, { outlineOffset: 2 })}>
            {single === el && !el.locked && !readOnly && !crop && (
              <>
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    role="presentation"
                    aria-label={`Resize from ${HANDLE_LABEL[h]}`}
                    data-handle={h}
                    onPointerDown={(e) => onHandleDown(e, el, h)}
                    className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border-[1.5px] border-brand bg-panel"
                    style={{ left: HANDLE_POS[h].left, top: HANDLE_POS[h].top, cursor: HANDLE_POS[h].cursor }}
                  />
                ))}
                <span
                  role="presentation"
                  aria-label="Rotate"
                  data-handle="rotate"
                  onPointerDown={(e) => onHandleDown(e, el, "rotate")}
                  className="pointer-events-auto absolute left-1/2 size-3.5 -translate-x-1/2 cursor-grab rounded-full border-[1.5px] border-brand bg-panel"
                  style={{ top: -28 }}
                />
              </>
            )}
            {single === el && el.locked && (
              <span className="absolute -top-6 right-0 inline-flex items-center gap-1 rounded-chip bg-tint px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                <Lock aria-hidden className="size-3" /> Locked
              </span>
            )}
          </div>
        );
      })}
      {multiBox && <div aria-hidden data-testid="multi-box" className="pointer-events-none border border-dashed border-brand" style={box(multiBox)} />}
      {link && single && (
        <span
          className={cn("pointer-events-none absolute whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[10px] font-semibold", link.linked ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}
          style={{ left: (single.frame.x + single.frame.w) * k, top: single.frame.y * k - 34, transform: "translateX(-100%)" }}
          data-testid="link-mark"
        >
          {link.text}
        </span>
      )}

      {cropEl && cropInfo && shownCrop && (
        <div aria-label="Crop" className="absolute" style={box(cropEl.frame)} data-testid="crop-box">
          <div className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/10" style={{ left: (cropInfo.box.x + shownCrop.x) * k, top: (cropInfo.box.y + shownCrop.y) * k, width: shownCrop.w * k, height: shownCrop.h * k }} />
          <div className="pointer-events-none absolute border-2 border-brand" style={{ left: cropInfo.box.x * k, top: cropInfo.box.y * k, width: cropInfo.box.w * k, height: cropInfo.box.h * k }} />
          <span
            role="presentation"
            aria-label="Scale the picture"
            onPointerDown={onCropHandleDown}
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-[2px] border-[1.5px] border-accent bg-panel"
            style={{ left: (cropInfo.box.x + shownCrop.x + shownCrop.w) * k, top: (cropInfo.box.y + shownCrop.y + shownCrop.h) * k }}
          />
        </div>
      )}

      {guides.map((g, i) => (
        <div
          key={i}
          aria-hidden
          data-testid="snap-guide"
          className={cn("pointer-events-none absolute", g.kind === "spacing" ? "bg-accent" : "bg-bad")}
          style={g.axis === "x" ? { left: g.mm * k, top: g.from * k, height: Math.max(1, (g.to - g.from) * k), width: 1 } : { top: g.mm * k, left: g.from * k, width: Math.max(1, (g.to - g.from) * k), height: 1 }}
        />
      ))}
      {marquee && <div aria-hidden className="pointer-events-none border border-brand bg-brand/10" style={box(marquee)} />}
      {/* DS-7: registered page overlays (in-place text editor, overflow tags). */}
      {getPageOverlays().map(([id, Overlay]) => (
        <Overlay key={id} page={page} zoom={zoom} wMm={wMm} hMm={hMm} safeMm={safeMm} />
      ))}
      {pins.map((p, i) => (
        <span key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-brand" style={{ left: p.x * k, top: p.y * k }} data-testid="comment-pin">
          <MessageSquare aria-hidden className="size-5 fill-panel" />
        </span>
      ))}
    </div>
  );
}
