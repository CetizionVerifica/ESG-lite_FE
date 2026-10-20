// DS-6 · the Position panel (05-ux), in the drawer area:
//   Arrange: forward / backward / to front / to back; align to the page (one
//            element, or "to page" ticked) or to the selection; Tidy up; X, Y,
//            W, H and rotation in mm.
//   Layers:  the page's elements, top layer first (= reading order, R17):
//            select (template-locked ones too), drag or move to reorder, eye, lock.
import { useState, type DragEvent } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  LayoutGrid,
  Lock,
  LockOpen,
} from "lucide-react";
import { alignElements, expandSelection, moveLayer, reorderZ, setHidden, setLocked, tidyElements, updateFrames, type ZMove } from "../../../lib/studio/docOps";
import { boundsOf, dominantAxis, round, type AlignEdge } from "../../../lib/studio/geometry";
import { Button, NumberField, Tabs, Toggle, cn, focusRing } from "../../../ui";
import { layerName } from "./actions";
import { useEditor } from "./EditorContext";

export function PositionPanel() {
  const ed = useEditor();
  const tab = ed.ui.position ?? "arrange";
  return (
    <div className="space-y-4" data-testid="position-panel">
      <Tabs
        label="Position"
        idBase="position"
        items={[
          { value: "arrange", label: "Arrange" },
          { value: "layers", label: "Layers" },
        ]}
        value={tab}
        onChange={(v) => ed.openPosition(v)}
      />
      {tab === "arrange" ? <Arrange /> : <Layers />}
    </div>
  );
}

const ALIGN: { edge: AlignEdge; label: string; icon: typeof AlignStartVertical }[] = [
  { edge: "left", label: "Left", icon: AlignStartVertical },
  { edge: "center", label: "Centre", icon: AlignCenterVertical },
  { edge: "right", label: "Right", icon: AlignEndVertical },
  { edge: "top", label: "Top", icon: AlignStartHorizontal },
  { edge: "middle", label: "Middle", icon: AlignCenterHorizontal },
  { edge: "bottom", label: "Bottom", icon: AlignEndHorizontal },
];

const ORDER: { move: ZMove; label: string; icon: typeof ArrowUp }[] = [
  { move: "forward", label: "Forward", icon: ArrowUp },
  { move: "backward", label: "Backward", icon: ArrowDown },
  { move: "front", label: "To front", icon: ArrowUpToLine },
  { move: "back", label: "To back", icon: ArrowDownToLine },
];

function Arrange() {
  const ed = useEditor();
  const { page, selected, readOnly } = ed;
  const [toPage, setToPage] = useState(false);
  if (!page) return <p className="text-sm text-muted">Pick a free-form page to arrange its elements.</p>;
  if (!selected.length) return <p className="text-sm text-muted">Select an element on the page to arrange it.</p>;
  const ids = selected.map((e) => e.id);
  const several = selected.length > 1;
  const to = several && !toPage ? "selection" : "page";
  const disabled = readOnly || selected.every((e) => e.locked || e.templateLocked);
  const single = selected.length === 1 ? selected[0] : null;
  const b = single ? single.frame : boundsOf(selected.map((e) => e.frame));
  const setField = (key: "x" | "y" | "w" | "h" | "rotation", v: number | null) => {
    if (v === null || !single) return;
    ed.commit(updateFrames(ed.doc, page.id, { [single.id]: { ...single.frame, [key]: v } }), "Position", { mergeKey: `pos:${single.id}:${key}` });
  };

  return (
    <div className="space-y-5">
      <section aria-labelledby="pos-order" className="space-y-2">
        <h3 id="pos-order" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Layer order
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {ORDER.map((o) => (
            <Button key={o.move} size="sm" variant="secondary" disabled={disabled} icon={<o.icon aria-hidden className="size-4" />} onClick={() => ed.commit(reorderZ(ed.doc, page.id, ids, o.move), o.label)}>
              {o.label}
            </Button>
          ))}
        </div>
      </section>
      <section aria-labelledby="pos-align" className="space-y-2">
        <h3 id="pos-align" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Align {to === "page" ? "to page" : "to selection"}
        </h3>
        {several && <Toggle label="Align to page" checked={toPage} onChange={setToPage} />}
        <div className="grid grid-cols-3 gap-2">
          {ALIGN.map((a) => (
            <Button key={a.edge} size="sm" variant="secondary" disabled={disabled} icon={<a.icon aria-hidden className="size-4" />} aria-label={`Align ${a.label.toLowerCase()} ${to === "page" ? "to page" : "to selection"}`} onClick={() => ed.commit(alignElements(ed.doc, page.id, ids, a.edge, to), `Align ${a.label.toLowerCase()}`)}>
              {a.label}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          disabled={disabled || selected.length < 2}
          icon={<LayoutGrid aria-hidden className="size-4" />}
          onClick={() => ed.commit(tidyElements(ed.doc, page.id, ids), "Tidy up")}
          title={selected.length < 2 ? "Select two or more elements to tidy them up." : `Equal spacing ${dominantAxis(selected.map((e) => e.frame)) === "x" ? "across" : "down"} the page`}
        >
          Tidy up
        </Button>
      </section>
      <section aria-labelledby="pos-size" className="space-y-2">
        <h3 id="pos-size" className="text-xs font-semibold uppercase tracking-wide text-muted">
          {single ? "Position and size (mm)" : "Selection (mm)"}
        </h3>
        {b && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={round(b.x)} unit="mm" onChange={(v) => setField("x", v)} disabled={!single || disabled} />
            <NumberField label="Y" value={round(b.y)} unit="mm" onChange={(v) => setField("y", v)} disabled={!single || disabled} />
            <NumberField label="W" value={round(b.w)} unit="mm" min={1} onChange={(v) => setField("w", v && v > 0 ? v : null)} disabled={!single || disabled} />
            <NumberField label="H" value={round(b.h)} unit="mm" min={1} onChange={(v) => setField("h", v && v > 0 ? v : null)} disabled={!single || disabled} />
            {single && <NumberField label="Rotation" value={round(single.frame.rotation)} unit="°" onChange={(v) => setField("rotation", v)} disabled={disabled} />}
          </div>
        )}
      </section>
    </div>
  );
}

function Layers() {
  const ed = useEditor();
  const { page, readOnly, ui } = ed;
  const [dragId, setDragId] = useState<string | null>(null);
  if (!page) return <p className="text-sm text-muted">Flow sections have no layers.</p>;
  const list = [...page.elements].sort((a, b) => b.z - a.z);
  if (!list.length) return <p className="text-sm text-muted">This page is empty. Add elements from the side panels.</p>;
  const move = (id: string, to: number) => ed.commit(moveLayer(ed.doc, page.id, id, to), "Reorder layers");
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragId) move(dragId, to);
    setDragId(null);
  };

  return (
    <ol className="space-y-1" aria-label="Layers, top first">
      {list.map((el, i) => {
        const on = ui.selection.includes(el.id);
        return (
          <li
            key={el.id}
            draggable={!readOnly}
            onDragStart={(e) => {
              setDragId(el.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", el.id);
            }}
            onDragOver={(e) => dragId && e.preventDefault()}
            onDrop={(e) => onDrop(e, i)}
            className={cn("flex items-center gap-1 rounded-control border px-2 py-1.5 text-sm", on ? "border-brand bg-brand-50" : "border-line bg-panel", el.hidden && "opacity-60")}
            data-testid={`layer-${el.id}`}
          >
            <button
              type="button"
              className={cn("min-w-0 flex-1 truncate text-left text-ink", focusRing)}
              aria-pressed={on}
              onClick={(e) => ed.select(e.shiftKey ? [...new Set([...ui.selection, el.id])] : expandSelection(page, [el.id], { fromLayers: true, enteredGroup: el.groupId ?? null }), page.id)}
            >
              {layerName(el)}
              {el.templateLocked && <span className="ml-1 text-xs text-muted">(template)</span>}
            </button>
            {!readOnly && (
              <>
                <IconButton label={`Move ${layerName(el)} up`} disabled={i === 0} onClick={() => move(el.id, i - 1)} icon={<ChevronUp aria-hidden className="size-4" />} />
                <IconButton label={`Move ${layerName(el)} down`} disabled={i === list.length - 1} onClick={() => move(el.id, i + 1)} icon={<ChevronDown aria-hidden className="size-4" />} />
                <IconButton
                  label={el.hidden ? `Show ${layerName(el)}` : `Hide ${layerName(el)}`}
                  pressed={!!el.hidden}
                  onClick={() => ed.commit(setHidden(ed.doc, page.id, [el.id], !el.hidden), el.hidden ? "Show" : "Hide")}
                  icon={el.hidden ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                />
                <IconButton
                  label={el.locked ? `Unlock ${layerName(el)}` : `Lock ${layerName(el)}`}
                  pressed={!!el.locked}
                  disabled={el.templateLocked}
                  onClick={() => ed.commit(setLocked(ed.doc, page.id, [el.id], !el.locked), el.locked ? "Unlock" : "Lock")}
                  icon={el.locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
                />
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function IconButton({ label, onClick, icon, disabled, pressed }: { label: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink disabled:opacity-40", focusRing)}>
      {icon}
    </button>
  );
}
