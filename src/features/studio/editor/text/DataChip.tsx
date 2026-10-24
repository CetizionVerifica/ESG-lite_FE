// DS-7 · the chip as it shows while text is edited: the server's value as a
// locked token (it can't be mistyped), a hover card (source, period, sites,
// approval date; GHG approved entries, KPI evidence) and, on click, a small
// popover to change what it shows (measure, number format) or remove it.
// The chip may sit inside the renderer's shadow root, so its own look is
// inline styles; the card and popover are app chrome in a portal.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Link2, Trash2 } from "lucide-react";
import { NUMBER_FORMATS, type Measure, type NumberFormat } from "../../../../lib/studio/contracts";
import { Button, cn, portalRoot, Select } from "../../../../ui";
import { MEASURE_LABELS, chipCard, chipText, useChipData, withMeasure } from "./chipData";
import { cleanChipAttrs } from "./convert";

/** Measures a chip offers per source (KPI targets and progress need a single KPI with a target). */
const MEASURES_FOR: Record<"ghg" | "kpi", Measure[]> = {
  ghg: ["value", "change_pct", "change_abs", "share"],
  kpi: ["value", "change_pct", "change_abs", "share", "progress", "target", "baseline"],
};
const FORMAT_LABELS: Record<NumberFormat, string> = { auto: "Automatic", int: "Whole number", "1dp": "1 decimal", "2dp": "2 decimals", pct0: "Percent", pct1: "Percent, 1 decimal", compact: "Compact (12.5k)", indian: "Indian grouping" };

function useAnchor(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), top: r.bottom + 6 });
  }, [open, ref]);
  return pos;
}

export function DataChipView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const data = useChipData();
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const attrs = cleanChipAttrs(node.attrs);
  const v = attrs && data ? data.value(attrs) : null;
  const card = attrs && data ? chipCard(attrs, v, data.scope, data.label(attrs)) : null;
  const pos = useAnchor((hover || open) && !!card, ref);
  const editable = editor.isEditable;
  const unavailable = !!v?.unavailable && v.unavailable.reason !== "EXCLUDED";

  return (
    <NodeViewWrapper
      as="span"
      ref={ref}
      className="ds-chip"
      data-ds-chip=""
      data-source={attrs?.binding.source}
      data-testid="data-chip"
      contentEditable={false}
      role="button"
      aria-label={card ? `${card.title}: ${card.value}` : "Data value"}
      tabIndex={-1}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e: React.MouseEvent) => {
        // Keep ProseMirror from moving the caret; the click opens the popover.
        e.preventDefault();
        if (editable) setOpen((o) => !o);
      }}
      style={{
        padding: "0 0.15em",
        borderRadius: "0.2em",
        boxShadow: selected ? "0 0 0 1.5px var(--primary, #2563eb)" : "inset 0 -0.12em 0 color-mix(in srgb, var(--primary, #2563eb) 55%, transparent)",
        background: "color-mix(in srgb, var(--primary, #2563eb) 9%, transparent)",
        cursor: editable ? "pointer" : "default",
        fontStyle: unavailable ? "italic" : undefined,
        color: unavailable ? "var(--muted, #64748b)" : undefined,
      }}
    >
      {chipText(v)}
      {pos &&
        card &&
        createPortal(
          <div
            role={open ? "dialog" : "tooltip"}
            aria-label={open ? `Data value: ${card.title}` : undefined}
            data-testid={open ? "chip-popover" : "chip-card"}
            className="fixed z-[80] w-72 rounded-control border border-line bg-panel p-3 text-left text-xs text-ink shadow-lg"
            style={{ left: pos.left, top: pos.top }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="font-semibold">{card.title}</p>
            <p className={cn("mt-0.5 text-base font-semibold tabular-nums", unavailable && "text-muted")}>{card.value}</p>
            <ul className="mt-2 space-y-0.5 text-muted">
              {card.lines.map((l) => (
                <li key={l} className="flex items-center gap-1">
                  {l.startsWith("Linked") && <Link2 aria-hidden className="size-3" />}
                  {l}
                </li>
              ))}
            </ul>
            {open && attrs && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <Select
                  label="Shows"
                  value={attrs.measure}
                  onChange={(m) => m && updateAttributes(withMeasure(attrs, m))}
                  options={MEASURES_FOR[attrs.binding.source].map((m) => ({ value: m, label: MEASURE_LABELS[m] }))}
                />
                <Select
                  label="Number format"
                  value={attrs.format ?? "auto"}
                  onChange={(f) => f && updateAttributes({ ...attrs, format: f === "auto" ? null : f })}
                  options={NUMBER_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
                />
                <div className="flex justify-between">
                  <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => deleteNode()}>
                    Remove
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>,
          portalRoot(),
        )}
    </NodeViewWrapper>
  );
}
