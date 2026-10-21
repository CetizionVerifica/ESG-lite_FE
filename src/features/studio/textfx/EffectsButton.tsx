// PE-2 · "Effects" on the text toolbar (mockup TextEffects): None, Shadow,
// Lift, Outline, Highlight, Curve as tiles, then the sliders of the effects
// that are on. Shadow and lift exclude each other. Each slider drag is one
// undo step (history merges the drag); the renderer draws the effect.
import { Wand2 } from "lucide-react";
import { TEXT_EFFECTS, type TextEffectKind, type TextEffects } from "../../../lib/studio/contracts";
import { contrastRatio } from "../../../lib/studio/render";
import { ColourField, Popover, cn, focusRing } from "../../../ui";
import { themeSwatches } from "../editor/actions";
import { TbButton, TbLabel } from "../editor/toolbars";
import type { TextToolbarSlotProps } from "../editor/text/toolbarSlots";
import { EFFECT_LABELS, activeEffects, effectColours, effectRange, setEffectValue, setTextEffects, toggleEffect } from "./logic";

/** A labelled range input with its value. */
function Slider({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm text-ink">
      <span className="w-24 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={1} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-brand" />
      <span className="w-9 text-right font-num text-xs">{value}</span>
    </label>
  );
}

/** Report colours (doc data) as swatches, plus a hex field. */
function Swatches({ label, value, swatches, disabled, onChange }: { label: string; value: string; swatches: string[]; disabled?: boolean; onChange: (hex: string) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
        {swatches.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-label={`${label}: ${s}`}
            aria-pressed={value.toLowerCase() === s}
            onClick={() => onChange(s)}
            className={cn("size-6 rounded-control border border-line", value.toLowerCase() === s && "ring-2 ring-brand", focusRing)}
            style={{ background: s }}
          />
        ))}
      </div>
      <ColourField label={label} hideLabel value={value} disabled={disabled} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && onChange(v.toLowerCase())} />
    </div>
  );
}

export function EffectsButton({ pageId, elements, editor: ed }: TextToolbarSlotProps) {
  const el = elements[0];
  if (!el || el.type !== "text") return null;
  const ids = elements.filter((e) => e.type === "text").map((e) => e.id);
  const disabled = ed.readOnly || !!el.locked || !!el.templateLocked;
  const fx = el.props.effects;
  const on = activeEffects(fx);
  const colours = effectColours(ed.doc, ed.render.brand);
  const swatches = [...new Set([...colours.swatches, ...themeSwatches(ed.doc)])];
  const hlContrast = fx?.highlight ? contrastRatio(fx.highlight.colour, colours.ink) : colours.contrast;
  const commit = (next: TextEffects | undefined, label: string, mergeKey?: string) => ed.commit(setTextEffects(ed.doc, pageId, ids, next), label, mergeKey ? { mergeKey: `fx:${ids.join(",")}:${mergeKey}` } : undefined);
  const value = <K extends TextEffectKind>(kind: K, key: keyof NonNullable<TextEffects[K]>) => Number((fx?.[kind] as Record<string, unknown> | undefined)?.[key as string] ?? 0);
  const slide = <K extends TextEffectKind>(kind: K, key: keyof NonNullable<TextEffects[K]> & string, label: string) => {
    const [min, max] = effectRange(kind, key);
    return <Slider key={`${kind}.${key}`} label={label} value={value(kind, key)} min={min} max={max} disabled={disabled} onChange={(v) => commit(setEffectValue(fx, kind, { [key]: v } as never), `${EFFECT_LABELS[kind]}: ${label.toLowerCase()}`, `${kind}.${key}`)} />;
  };
  const colour = (kind: "shadow" | "outline" | "highlight", label: string) => (
    <Swatches key={`${kind}.colour`} label={label} value={String(fx?.[kind]?.colour ?? "")} swatches={swatches} disabled={disabled} onChange={(c) => commit(setEffectValue(fx, kind, { colour: c }), `${EFFECT_LABELS[kind]} colour`)} />
  );

  return (
    <Popover
      label="Text effects"
      className="w-80"
      trigger={(t) => (
        <TbButton {...t} active={on.length > 0} disabled={ed.readOnly} title="Text effects" icon={<Wand2 aria-hidden className="size-4" />} data-testid="text-effects">
          <TbLabel>Effects</TbLabel>
        </TbButton>
      )}
    >
      {() => (
        <div className="space-y-3" data-ds-text-keep="">
          {disabled && !ed.readOnly && <p className="text-xs text-muted">This text is locked. Unlock it to change its effects.</p>}
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Effects">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={on.length === 0}
              onClick={() => commit(undefined, "Remove effects")}
              className={cn("flex flex-col items-center gap-1 rounded-control border px-2 py-2 text-xs text-ink hover:bg-tint disabled:opacity-50", on.length === 0 ? "border-brand bg-brand-50" : "border-line", focusRing)}
            >
              <span aria-hidden className="text-lg font-semibold">
                Ag
              </span>
              None
            </button>
            {TEXT_EFFECTS.map((k) => {
              const active = on.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  data-effect={k}
                  onClick={() => commit(toggleEffect(fx, k, !active, colours), active ? `Remove ${EFFECT_LABELS[k].toLowerCase()}` : EFFECT_LABELS[k])}
                  className={cn("flex flex-col items-center gap-1 rounded-control border px-2 py-2 text-xs text-ink hover:bg-tint disabled:opacity-50", active ? "border-brand bg-brand-50" : "border-line", focusRing)}
                >
                  <span aria-hidden className={cn("text-lg font-semibold", k === "outline" && "text-muted", k === "highlight" && "rounded-chip bg-tint px-1", k === "lift" && "shadow-sm", k === "shadow" && "drop-shadow")}>
                    {k === "curve" ? "⌒" : "Ag"}
                  </span>
                  {EFFECT_LABELS[k]}
                </button>
              );
            })}
          </div>
          {on.includes("shadow") && (
            <fieldset className="space-y-2 border-t border-line pt-3">
              <legend className="sr-only">Shadow</legend>
              {slide("shadow", "blur", "Shadow blur")}
              {slide("shadow", "offsetX", "Offset across")}
              {slide("shadow", "offsetY", "Offset down")}
              {slide("shadow", "opacity", "Shadow strength")}
              {colour("shadow", "Shadow colour")}
            </fieldset>
          )}
          {on.includes("lift") && <div className="border-t border-line pt-3">{slide("lift", "intensity", "Lift")}</div>}
          {on.includes("outline") && (
            <fieldset className="space-y-2 border-t border-line pt-3">
              <legend className="sr-only">Outline</legend>
              {slide("outline", "width", "Outline width")}
              {colour("outline", "Outline colour")}
            </fieldset>
          )}
          {on.includes("highlight") && (
            <fieldset className="space-y-2 border-t border-line pt-3">
              <legend className="sr-only">Highlight</legend>
              {slide("highlight", "radius", "Roundness")}
              {colour("highlight", "Highlight colour")}
              <p className="text-xs text-muted" data-testid="highlight-contrast">
                {hlContrast >= 4.5 ? `${hlContrast.toFixed(1)}:1 with the text colour.` : `Only ${hlContrast.toFixed(1)}:1 with the text colour: pick a lighter brand colour.`}
              </p>
            </fieldset>
          )}
          {on.includes("curve") && (
            <div className="space-y-1 border-t border-line pt-3">
              {slide("curve", "radius", "Curve")}
              <p className="text-xs text-muted">Curved text sits on one line. Below 0 curves down. Highlight isn't drawn on a curve.</p>
            </div>
          )}
          <p className="text-xs text-muted">Effects print in the PDF exactly as shown here.</p>
        </div>
      )}
    </Popover>
  );
}
